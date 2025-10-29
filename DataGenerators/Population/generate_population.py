"""
generate_population.py
-----------------------
Generate a synthetic population (Sex, Age, State, LifestyleFactors, Height, Weight) 
based on ABS data.

Requirements:
    pip install pandas numpy openpyxl
"""

import pandas as pd
import numpy as np
import re


# === CONFIGURATION ===
INPUT_FILE = "32350DS0001_2024.xlsx"
OUTPUT_FILE = "synthetic_population.csv"
POPULATION_SIZE = 200  # number of synthetic individuals to generate

# Non-binary distribution by age group
NB_RATES = {
    "16_24": 0.025,   # 2.5% for ages 15–19, 20–24
    "25_74": 0.015,   # 1.5% for ages 25–74
    "75_plus": 0.005  # 0.5% for ages 75+
}


def load_abs_table(file_path, sheet_name):
    """Reads an ABS table and returns a cleaned dataframe."""
    # Read only columns A-B (for identification) and K-AB (for age group data)
    # Skip the first 6 header rows to remove the unwanted extra header (K7:AC7)
    df = pd.read_excel(file_path, sheet_name=sheet_name, skiprows=6, usecols="A:B,K:AB")
    df = df.rename(columns={df.columns[1]: "S/T name"})
    df = df.dropna(subset=["S/T name"])
    # Remove totals and summary rows if present
    df = df[~df["S/T name"].str.contains("Total", case=False, na=False)]
    return df


def reshape_and_aggregate(df, sex):
    """Reshape ABS data to long form and aggregate by S/T name + Age group."""
    id_vars = ["S/T name"]
    value_vars = [col for col in df.columns if "Unnamed" not in col and col not in id_vars]

    melted = df.melt(id_vars=id_vars, value_vars=value_vars,
                     var_name="AgeGroup", value_name="Population")
    melted["Sex"] = sex

    # Ensure Population is numeric before summing
    melted["Population"] = pd.to_numeric(melted["Population"], errors="coerce").fillna(0)

    grouped = melted.groupby(["S/T name", "AgeGroup", "Sex"], as_index=False)["Population"].sum()
    return grouped


def combine_and_add_nonbinary(male_df, female_df):
    """Combine M/F and add non-binary group with proportional rates."""
    combined = pd.concat([male_df, female_df], ignore_index=True)
    # Aggregate total population by State + Age group
    totals = combined.groupby(["S/T name", "AgeGroup"], as_index=False)["Population"].sum()

    def get_nb_rate(age_group):
        """Return non-binary rate by age group string."""
        age_group = str(age_group)
        if any(k in age_group for k in ["15–19", "20–24"]):
            return NB_RATES["16_24"]
        elif any(k in age_group for k in [
            "25–29", "30–34", "35–39", "40–44", "45–49",
            "50–54", "55–59", "60–64", "65–69", "70–74"
        ]):
            return NB_RATES["25_74"]
        elif any(k in age_group for k in ["75–79", "80–84", "85"]):
            return NB_RATES["75_plus"]
        else:
            return 0

    # Ensure numeric
    totals["Population"] = pd.to_numeric(totals["Population"], errors="coerce").fillna(0)
    totals["NB_rate"] = totals["AgeGroup"].apply(get_nb_rate)

    # Calculate non-binary population for each age/state group
    totals["NB_pop"] = (totals["Population"] * totals["NB_rate"]).round()
    totals["Sex"] = "Non-binary"

    # Only keep non-zero NB groups
    nb_df = totals.loc[totals["NB_pop"] > 0, ["S/T name", "AgeGroup", "Sex", "NB_pop"]]
    nb_df = nb_df.rename(columns={"NB_pop": "Population"})

    # Combine all three sexes
    combined_all = pd.concat([combined, nb_df], ignore_index=True)
    return combined_all



def parse_age_range(age_group):
    """Parse age group string and return (min_age, max_age)."""
    age_group = str(age_group).strip()
    
    # Handle "85 and over" or similar
    if "85" in age_group and ("over" in age_group.lower() or "+" in age_group):
        return (85, 100)  # Cap at 100 for practical purposes
    
    # Extract numbers from formats like "15–19", "15-19", "20—24"
    numbers = re.findall(r'\d+', age_group)
    
    if len(numbers) >= 2:
        return (int(numbers[0]), int(numbers[1]))
    elif len(numbers) == 1:
        # Single age
        age = int(numbers[0])
        return (age, age)
    else:
        # Fallback if parsing fails
        return (None, None)


def assign_lifestyle_factors(age, sex):
    """
    Assign lifestyle factors based on age and sex with realistic probability distributions.
    
    Args:
        age: int, age of the individual
        sex: str, one of "Male", "Female", "Non-binary"
    
    Returns:
        list of lifestyle factors (can be empty or contain multiple factors)
    """
    factors = []
    
    # Normalize sex for non-binary (use average of male/female rates)
    is_male = sex == "Male"
    is_female = sex == "Female"
    is_nb = sex == "Non-binary"
    
    # === SMOKER ===
    if age >= 16:
        if age < 25:
            smoker_rate = 0.08  # Lower for young adults
        elif age < 35:
            smoker_rate = 0.10
        elif age < 45:
            smoker_rate = 0.11
        elif age < 55:
            smoker_rate = 0.12
        elif age < 65:
            smoker_rate = 0.149  # Peak
        elif age < 75:
            smoker_rate = 0.11
        else:
            smoker_rate = 0.07  # Lower for elderly
        
        # Adjust by sex
        if is_male:
            smoker_rate *= 1.19  # 12.6% vs 10.6% baseline
        elif is_female:
            smoker_rate *= 0.82  # 8.7% vs 10.6% baseline
        
        if np.random.random() < smoker_rate:
            factors.append("smoker")
    
    # === HEAVY DRINKER ===
    if age >= 14:
        if age < 18:
            drinker_rate = 0.15  # Lower for minors
        elif age < 25:
            drinker_rate = 0.361  # Peak for young adults
        elif age < 30:
            drinker_rate = 0.30
        elif age < 40:
            drinker_rate = 0.28
        elif age < 50:
            drinker_rate = 0.29
        elif age < 60:
            drinker_rate = 0.323  # 50s peak
        elif age < 70:
            drinker_rate = 0.332  # 60s peak
        else:
            drinker_rate = 0.25  # Lower for elderly
        
        # Adjust by sex
        if is_male:
            drinker_rate *= 1.15  # 35.8% vs 31% baseline
        elif is_female:
            drinker_rate *= 0.58  # 18.1% vs 31% baseline
        
        if np.random.random() < drinker_rate:
            factors.append("heavy_drinker")
    
    # === SEDENTARY vs ATHLETE (mutually exclusive) ===
    # Calculate both rates first
    if age < 15:
        sedentary_rate = 0.70  # High for children/adolescents
        athlete_rate = 0.36  # Children
    elif age < 18:
        sedentary_rate = 0.83  # Very high for adolescents
        athlete_rate = 0.42  # Youth
    elif age < 25:
        sedentary_rate = 0.34
        athlete_rate = 0.42  # Youth
    elif age < 35:
        sedentary_rate = 0.36
        athlete_rate = 0.66  # Adult peak
    elif age < 45:
        sedentary_rate = 0.38
        athlete_rate = 0.60
    elif age < 55:
        sedentary_rate = 0.40
        athlete_rate = 0.55
    elif age < 65:
        sedentary_rate = 0.42
        athlete_rate = 0.50
    else:
        sedentary_rate = 0.57  # High for elderly
        athlete_rate = 0.40  # Decreases with age
    
    # Adjust sedentary by sex (for adults)
    if age >= 18 and age < 65:
        if is_male:
            sedentary_rate *= 0.92  # 34% vs 37% baseline
        elif is_female:
            sedentary_rate *= 1.11  # 41% vs 37% baseline
    
    # Decide between sedentary and athlete (mutually exclusive)
    activity_roll = np.random.random()
    if activity_roll < athlete_rate:
        factors.append("athlete")
    elif activity_roll < athlete_rate + sedentary_rate:
        factors.append("sedentary")
    # else: neither (normal activity level)
    
    # === HIGH BMI ===
    if age < 2:
        high_bmi_rate = 0.10  # Low for infants
    elif age < 5:
        high_bmi_rate = 0.196  # 2-4 year olds
    elif age < 15:
        high_bmi_rate = 0.26  # Children average
    elif age < 18:
        high_bmi_rate = 0.294  # 16-17 year olds
    elif age < 25:
        high_bmi_rate = 0.50  # Young adults
    elif age < 35:
        high_bmi_rate = 0.60
    elif age < 45:
        high_bmi_rate = 0.65
    elif age < 55:
        high_bmi_rate = 0.68
    elif age < 65:
        high_bmi_rate = 0.70  # Peak
    elif age < 75:
        high_bmi_rate = 0.68  # 65-74 peak
    else:
        high_bmi_rate = 0.60  # Slightly lower for very elderly
    
    # Adjust by sex (for adults)
    if age >= 18:
        if is_male:
            high_bmi_rate *= 1.08  # 71% vs 65.7% baseline
        elif is_female:
            high_bmi_rate *= 0.93  # 61% vs 65.7% baseline
    
    if np.random.random() < high_bmi_rate:
        factors.append("high_bmi")
    
    return factors


def generate_height_weight(age, sex, has_high_bmi=False):
    """
    Generate realistic height (cm) and weight (kg) based on Australian population statistics.
    
    Based on Australian data:
    - Adult males: avg height 175.6cm (SD ~7cm), avg weight 85.9kg (SD ~15kg)
    - Adult females: avg height 161.8cm (SD ~6.5cm), avg weight 71.1kg (SD ~14kg)
    - Children: growth curves approximated
    
    Args:
        age: int, age of the individual
        sex: str, one of "Male", "Female", "Non-binary"
        has_high_bmi: bool, whether to adjust weight to ensure BMI > 30
    
    Returns:
        tuple: (height_cm, weight_kg) as integers
    """
    is_male = sex == "Male"
    is_female = sex == "Female"
    is_nb = sex == "Non-binary"
    
    # Infants and toddlers (0-2 years)
    if age < 1:
        height = np.random.normal(75, 5)  # ~75cm at 1 year
        weight = np.random.normal(9, 1.5)  # ~9kg at 1 year
    elif age < 3:
        height = np.random.normal(90, 5)
        weight = np.random.normal(13, 2)
    # Children (3-12 years) - approximate growth
    elif age < 13:
        if is_male or is_nb:
            height = 90 + (age - 3) * 6 + np.random.normal(0, 4)
            weight = 13 + (age - 3) * 3 + np.random.normal(0, 3)
        else:  # Female
            height = 90 + (age - 3) * 6 + np.random.normal(0, 4)
            weight = 13 + (age - 3) * 2.8 + np.random.normal(0, 3)
    # Adolescents (13-17 years) - growth spurt
    elif age < 18:
        if is_male or is_nb:
            height = 150 + (age - 13) * 5 + np.random.normal(0, 6)
            weight = 45 + (age - 13) * 7 + np.random.normal(0, 8)
        else:  # Female
            height = 145 + (age - 13) * 3.5 + np.random.normal(0, 5)
            weight = 45 + (age - 13) * 5 + np.random.normal(0, 7)
    # Adults (18+ years)
    else:
        if is_male:
            height = np.random.normal(175.6, 7)
            weight = np.random.normal(85.9, 15)
        elif is_female:
            height = np.random.normal(161.8, 6.5)
            weight = np.random.normal(71.1, 14)
        else:  # Non-binary - use average
            height = np.random.normal(168.7, 9)
            weight = np.random.normal(78.5, 15)
        
        # Adjust for age in older adults (slight decrease in height, variable weight)
        if age >= 65:
            height -= np.random.uniform(0, 3)  # Height loss with age
        if age >= 75:
            height -= np.random.uniform(0, 2)
            weight -= np.random.uniform(0, 5)  # Possible weight loss in elderly
    
    # Ensure reasonable bounds
    height = max(45, min(220, height))  # Between 45cm and 220cm
    weight = max(2, min(250, weight))   # Between 2kg and 250kg
    
    # Round to integers
    height = round(height)
    weight = round(weight)
    
    # Adjust weight if high_bmi flag is set
    if has_high_bmi:
        height_m = height / 100  # Convert to meters
        bmi = weight / (height_m ** 2)
        
        # Keep adding random weight until BMI > 30
        while bmi <= 30:
            weight += np.random.randint(1, 7)  # Add 1-6 kg
            bmi = weight / (height_m ** 2)
    
    return height, weight


def generate_population(df, n=POPULATION_SIZE):
    """Generate synthetic individuals weighted by population proportions."""
    df = df.copy()
    df = df.rename(columns={"S/T name": "State"})
    df["Weight"] = df["Population"] / df["Population"].sum()

    # Draw random samples based on population weights
    sampled = df.sample(n=n, weights="Weight", replace=True)
    synthetic = sampled[["Sex", "AgeGroup", "State"]].reset_index(drop=True)
    
    # Add specific age column
    synthetic["Age"] = synthetic["AgeGroup"].apply(
        lambda ag: np.random.randint(parse_age_range(ag)[0], parse_age_range(ag)[1] + 1)
        if parse_age_range(ag)[0] is not None else None
    )
    
    # Remove AgeGroup column
    synthetic = synthetic[["Sex", "Age", "State"]]
    
    # Add lifestyle factors
    synthetic["LifestyleFactors"] = synthetic.apply(
        lambda row: assign_lifestyle_factors(row["Age"], row["Sex"]), axis=1
    )
    
    # Add height and weight (needs to check for high_bmi in lifestyle factors)
    def get_height_weight(row):
        has_high_bmi = "high_bmi" in row["LifestyleFactors"]
        return generate_height_weight(row["Age"], row["Sex"], has_high_bmi)
    
    synthetic[["Height_cm", "Weight_kg"]] = synthetic.apply(
        get_height_weight, 
        axis=1, 
        result_type='expand'
    )
    
    return synthetic


def main():
    print("Loading ABS data...")
    male_df = load_abs_table(INPUT_FILE, "Table 1")
    female_df = load_abs_table(INPUT_FILE, "Table 2")

    print("Reshaping and aggregating...")
    male_grouped = reshape_and_aggregate(male_df, "Male")
    female_grouped = reshape_and_aggregate(female_df, "Female")

    print("Combining and adding non-binary population...")
    combined = combine_and_add_nonbinary(male_grouped, female_grouped)

    print("Generating synthetic population...")
    synthetic = generate_population(combined, POPULATION_SIZE)

    synthetic.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSynthetic population saved to {OUTPUT_FILE}")
    print(synthetic.head(20))


if __name__ == "__main__":
    main()