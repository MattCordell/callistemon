"""
lab_generator.py

Usage:
    from lab_generator import generate_lab_results, generate_cohort, load_profiles
    profiles = load_profiles("disease_profiles.json")
    df = generate_lab_results(condition="Alcoholic Liver Disease", sex="non-binary", age=54, lifestyle=["heavy_drinker","smoker"], profiles=profiles)
    cohort = generate_cohort(100, profiles=profiles)
"""

import json
import random
from typing import Optional, Union, Dict, Any, List
import numpy as np
import pandas as pd

# -----------------------------
# Load / helper
# -----------------------------
def load_profiles(path: str = "disease_profiles.json") -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)

def _sample_normal(mean: float, sd: float) -> float:
    return float(np.random.normal(mean, sd))

def _sample_lognormal(mean: float, sd: float) -> float:
    # convert mean/sd (linear) -> mu,sigma (log space)
    m = max(mean, 1e-9)
    s = max(sd, 1e-9)
    mu = np.log(m**2 / np.sqrt(s**2 + m**2))
    sigma = np.sqrt(np.log(1 + (s**2 / m**2)))
    return float(np.random.lognormal(mu, sigma))

def _sample_uniform(min_v: float, max_v: float) -> float:
    return float(np.random.uniform(min_v, max_v))

def _sample_gamma(mean: float, sd: float) -> float:
    m = max(mean, 1e-9)
    s = max(sd, 1e-9)
    k = (m**2) / (s**2)
    theta = (s**2) / m
    return float(np.random.gamma(shape=k, scale=theta))

def sample_value(params: Dict[str, Any]) -> float:
    dist = params.get("distribution", "normal").lower()
    mean = float(params["mean"])
    sd = float(params["sd"])
    min_v = params.get("min", params.get("min_val", None))
    max_v = params.get("max", params.get("max_val", None))

    if dist == "normal":
        val = _sample_normal(mean, sd)
    elif dist == "lognormal":
        val = _sample_lognormal(mean, sd)
    elif dist == "uniform":
        if min_v is None or max_v is None:
            raise ValueError("uniform distribution requires min and max")
        val = _sample_uniform(min_v, max_v)
    elif dist == "gamma":
        val = _sample_gamma(mean, sd)
    else:
        raise ValueError(f"Unsupported distribution '{dist}'")

    if (min_v is not None) and (max_v is not None):
        val = float(np.clip(val, min_v, max_v))
    return round(val, 2)

# -----------------------------
# Adjustment application
# -----------------------------
def apply_sex_age_lifestyle(mean: float, sd: float,
                            test_info: Dict[str, Any],
                            sex: str, age: int,
                            lifestyle: Optional[List[str]]) -> (float, float):
    """
    Apply adjustments to mean and sd using keys in test_info:
      - "sex_adjustment": { "male": multiplier, "female": multiplier, "other": multiplier }
      - "age_adjustment": either { "slope": x, "ref_age": y } or "age_bands": [ {min_age,max_age,mean_multiplier,sd_multiplier}, ... ]
      - "lifestyle": { factor: { "mean_multiplier": x, "sd_multiplier": y }, ... }
    """
    adjusted_mean = mean
    adjusted_sd = sd
    sex_key = (sex or "other").lower()

    # sex_adjustment multiplier
    if "sex_adjustment" in test_info:
        mults = test_info["sex_adjustment"]
        adjusted_mean *= float(mults.get(sex_key, mults.get("other", 1.0)))
        # optional sd multiplier
        if isinstance(mults.get(sex_key, None), dict):
            adjusted_sd *= float(mults[sex_key].get("sd_multiplier", 1.0))

    # age_adjustment: slope-based
    if "age_adjustment" in test_info:
        age_adj = test_info["age_adjustment"]
        if isinstance(age_adj, dict) and "slope" in age_adj:
            slope = float(age_adj.get("slope", 0.0))
            ref = float(age_adj.get("ref_age", 40))
            factor = 1.0 + slope * max(0, age - ref)
            adjusted_mean *= factor
            adjusted_sd *= factor
        # optional age bands
        elif isinstance(age_adj, list):
            for band in age_adj:
                if band["min_age"] <= age <= band["max_age"]:
                    adjusted_mean *= float(band.get("mean_multiplier", 1.0))
                    adjusted_sd *= float(band.get("sd_multiplier", 1.0))
                    break

    # lifestyle (list of strings)
    if lifestyle and "lifestyle" in test_info:
        for fac in lifestyle:
            if fac in test_info["lifestyle"]:
                fac_info = test_info["lifestyle"][fac]
                adjusted_mean *= float(fac_info.get("mean_multiplier", 1.0))
                adjusted_sd *= float(fac_info.get("sd_multiplier", 1.0))

                # support exceptions map inside lifestyle factor (per-test overrides)
                if "exceptions" in fac_info and isinstance(fac_info["exceptions"], dict):
                    # exceptions are handled at the panel-sampling stage (they override per-test)
                    pass

    return adjusted_mean, adjusted_sd

# -----------------------------
# Main generator
# -----------------------------
def generate_lab_results(condition: str,
                         sex: str = "other",
                         age: int = 50,
                         lifestyle: Optional[List[str]] = None,
                         profiles: Optional[Union[str, Dict[str, Any]]] = None,
                         as_dataframe: bool = True,
                         missing_panel_prob: float = 0.14,
                         rng_seed: Optional[int] = None) -> pd.DataFrame:
    """
    Generate a single patient's lab row for `condition`.
    - `profiles` can be a dict (already loaded) or filepath to JSON.
    - `lifestyle` is a list like ['smoker', 'heavy_drinker'].
    """
    if rng_seed is not None:
        np.random.seed(rng_seed)
        random.seed(rng_seed)

    if lifestyle is None:
        lifestyle = []

    # load profiles if needed
    if isinstance(profiles, str) or profiles is None:
        profiles_dict = load_profiles(profiles or "disease_profiles.json")
    else:
        profiles_dict = profiles

    if condition not in profiles_dict:
        raise ValueError(f"Condition '{condition}' not found in profiles")

    profile = profiles_dict[condition]["panels"]
    panel_names = list(profile.keys())

    # decide panels to skip (explicit None) -- 14% chance of skipping 1 or 2 panels
    panels_to_skip = []
    if random.random() < missing_panel_prob:
        num_missing = random.choice([1, 2])
        panels_to_skip = random.sample(panel_names, k=num_missing)

    # shared values dict: same test name reused across panels
    shared_values: Dict[str, float] = {}

    # results dict per panel or None when skipped
    results: Dict[str, Optional[Dict[str, Optional[float]]]] = {}

    # First pass: sample per-panel tests (but keep differential metadata)
    for panel in panel_names:
        if panel in panels_to_skip:
            results[panel] = None
            continue

        panel_tests = profile[panel]
        panel_out: Dict[str, Optional[float]] = {}

        for test_name, test_info in panel_tests.items():
            # differential_props or metadata keys: just copy
            if test_name == "differential_props":
                panel_out[test_name] = test_info
                continue

            # exceptions: if lifestyle exception mapping present for this test, that will be handled by adjusting mean
            # apply sex/age/lifestyle to base mean/sd
            base_mean = test_info.get("mean")
            base_sd = test_info.get("sd", max(0.01, 0.1 * float(base_mean)))  # fallback sd if not provided

            # apply per-test override if lifestyle exception exists for this particular factor
            # but we apply these via apply_sex_age_lifestyle which checks lifestyle entries
            adj_mean, adj_sd = apply_sex_age_lifestyle(base_mean, base_sd, test_info, sex, age, lifestyle)

            # If test already sampled elsewhere, reuse
            if test_name in shared_values:
                val = shared_values[test_name]
            else:
                # sample using distribution (but respect exceptions in lifestyle that may override mean)
                # sample_value expects params-like dict; create a temporary one
                tmp_params = {
                    "distribution": test_info.get("distribution", "normal"),
                    "mean": adj_mean,
                    "sd": adj_sd,
                    "min": test_info.get("min", test_info.get("min_val", None)),
                    "max": test_info.get("max", test_info.get("max_val", None))
                }
                val = sample_value(tmp_params)
                shared_values[test_name] = val

            panel_out[test_name] = val

        results[panel] = panel_out

    # Now add FBC differential so absolute counts sum to WBC if FBC present
    # Detect FBC-like panel name
    fbc_panel = None
    for pn in panel_names:
        low = pn.lower()
        if "fbc" in low or ("full" in low and "blood" in low) or ("fullblood" in low):
            fbc_panel = pn
            break

    if fbc_panel and (results.get(fbc_panel) is not None):
        fbc_vals = results[fbc_panel]
        # find WBC key (flexible)
        wbc_key = None
        for cand in ["WBC (×10^9/L)", "WBC (10^9/L)", "WBC", "WBC (×10^9/L)", "WBC (x10^9/L)"]:
            if cand in fbc_vals:
                wbc_key = cand
                break
        if wbc_key is None:
            # heuristic: any key containing 'wbc'
            for k in fbc_vals.keys():
                if "wbc" in k.lower():
                    wbc_key = k
                    break

        # produce differential if WBC available
        diff_names = ["Neutrophils", "Lymphocytes", "Monocytes", "Eosinophils", "Basophils"]
        if wbc_key is None or fbc_vals.get(wbc_key) is None:
            for n in diff_names:
                fbc_vals[f"{n} (%)"] = None
                fbc_vals[f"{n} (×10^9/L)"] = None
        else:
            total_wbc = float(fbc_vals[wbc_key])
            # base proportions from metadata if provided
            base_props = None
            if "differential_props" in fbc_vals and isinstance(fbc_vals["differential_props"], dict):
                md = fbc_vals["differential_props"]
                try:
                    base_props = np.array([
                        float(md.get("neutrophils", 0.55)),
                        float(md.get("lymphocytes", 0.30)),
                        float(md.get("monocytes", 0.06)),
                        float(md.get("eosinophils", 0.07)),
                        float(md.get("basophils", 0.02))
                    ])
                    if base_props.sum() <= 0:
                        base_props = None
                except Exception:
                    base_props = None
            if base_props is None:
                base_props = np.array([0.55, 0.30, 0.06, 0.07, 0.02])

            # Dirichlet sampling around base_props
            concentration = 50.0
            alpha = base_props * concentration
            sampled_props = np.random.dirichlet(alpha)
            abs_counts = np.round(sampled_props * total_wbc, 2)
            sum_abs = abs_counts.sum()
            diff = round(total_wbc - sum_abs, 2)
            if abs(diff) >= 0.01:
                idx = int(np.argmax(abs_counts))
                abs_counts[idx] = round(abs_counts[idx] + diff, 2)

            for name, prop, abs_val in zip(diff_names, sampled_props, abs_counts):
                fbc_vals[f"{name} (%)"] = round(float(prop * 100.0), 2)
                fbc_vals[f"{name} (×10^9/L)"] = float(abs_val)

            # remove metadata key before final output
            if "differential_props" in fbc_vals:
                del fbc_vals["differential_props"]

            results[fbc_panel] = fbc_vals

    # Build the flattened consistent column list
    # Use profile (not results) to list all tests so skipped panels still produce columns
    all_cols = ["Sex", "Age", "Condition"]
    for panel in panel_names:
        # read test keys from profile to ensure columns exist even if panel skipped
        for test_name in profile[panel].keys():
            if test_name == "differential_props":
                # add the differential columns explicitly if panel is FBC-like
                if panel == fbc_panel:
                    for n in ["Neutrophils", "Lymphocytes", "Monocytes", "Eosinophils", "Basophils"]:
                        all_cols.append(f"{panel} - {n} (%)")
                        all_cols.append(f"{panel} - {n} (×10^9/L)")
                continue
            all_cols.append(f"{panel} - {test_name}")

    # dedupe while preserving order
    seen = set()
    cols = []
    for c in all_cols:
        if c not in seen:
            seen.add(c)
            cols.append(c)

    # fill row with None defaults
    row: Dict[str, Optional[float]] = {c: None for c in cols}
    row["Sex"] = sex
    row["Age"] = age
    row["Condition"] = condition

    # populate values from results
    for panel, vals in results.items():
        if vals is None:
            # leave all panel columns None
            continue
        for tname, v in vals.items():
            if tname == "differential_props":
                continue
            col = f"{panel} - {tname}"
            row[col] = v

    df = pd.DataFrame([row])
    return df if as_dataframe else row

# -----------------------------
# Cohort helper
# -----------------------------
def generate_cohort(n: int,
                    profiles: Optional[Union[str, Dict[str, Any]]] = None,
                    condition_sampler: Optional[List[str]] = None,
                    sex_choices: Optional[List[str]] = None,
                    age_range: Optional[List[int]] = None,
                    lifestyle_choices: Optional[List[str]] = None,
                    missing_panel_prob: float = 0.14,
                    rng_seed: Optional[int] = None) -> pd.DataFrame:
    """
    Generate n patients. Returns a DataFrame concatenating rows.
    Options allow custom sampling lists.
    """
    profiles_dict = load_profiles(profiles) if isinstance(profiles, str) or profiles is None else profiles
    conditions = condition_sampler if condition_sampler else list(profiles_dict.keys())
    sex_choices = sex_choices if sex_choices else ["male", "female", "non-binary"]
    age_range = age_range if age_range else [20, 85]
    lifestyle_choices = lifestyle_choices if lifestyle_choices else [None, [], ["smoker"], ["heavy_drinker"], ["smoker","heavy_drinker"], ["athlete"], ["high_bmi"]]

    rows = []
    for i in range(n):
        cond = random.choice(conditions)
        sex = random.choice(sex_choices)
        age = random.randint(age_range[0], age_range[1])
        lifestyle = random.choice(lifestyle_choices)
        row = generate_lab_results(condition=cond, sex=sex, age=age, lifestyle=lifestyle, profiles=profiles_dict,
                                   as_dataframe=True, missing_panel_prob=missing_panel_prob,
                                   rng_seed=(None if rng_seed is None else rng_seed + i))
        rows.append(row)
    cohort = pd.concat(rows, ignore_index=True)
    return cohort

def get_random_condition(disease_profile_path="disease_profiles.json"):
    """
    Returns the name of a randomly selected condition
    from the disease profile JSON file.
    """
    with open(disease_profile_path, "r") as f:
        disease_profiles = json.load(f)

    return random.choice(list(disease_profiles.keys()))

# -----------------------------
# Example usage
# -----------------------------
if __name__ == "__main__":
    profiles = load_profiles("disease_profiles.json")
    # single patient
    df = generate_lab_results(condition="Hypothyroidism", sex="non-binary", age=54, lifestyle=["heavy_drinker","smoker"], profiles=profiles)
    print("Single patient (transposed):\n", df.T.head(80))
    # cohort of 10
    coh = generate_cohort(10, profiles=profiles)
    print("\nCohort head:\n", coh.head())
