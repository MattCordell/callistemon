#get a list of concept from ontoserver based on an ecl expression
import requests
import json
from fhir.resources.R4B.humanname import HumanName
from fhir.resources.R4B.address import Address
from fhir.resources.R4B.patient import Patient
from fhir.resources.R4B.practitioner import Practitioner
from fhir.resources.R4B.servicerequest import ServiceRequest
from fhir.resources.R4B.practitioner import Practitioner
from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding

import uuid
from datetime import date
import random
import time
import numpy as np
from datetime import datetime
from dateutil.relativedelta import relativedelta

from RandomThumbnail import make_thumbnail_attachment


##################################################
# Create a valueSet object based on an ECL query #
# Randomly pull members from the valueSet        #
##################################################
class ECLValueSet:
    def __init__(self, ecl):
        self.ecl = ecl
        self.expansion = self.__getECLValueSetExpansion(ecl)

    def __getECLValueSetExpansion(self,ecl):
        url = 'https://r4.ontoserver.csiro.au/fhir/ValueSet/$expand'
        params = {'url': 'http://snomed.info/sct?fhir_vs=ecl/'+ecl}
        response = requests.get(url, params=params)
        expansion = json.loads(response.text)['expansion']['contains']
        print("ValueSet Expansion: " + str(len(expansion)) + " members")
        return expansion
    
    def getRandomMember(self):       
        return random.choice(self.expansion)


#########################################################
# Class for generating random FHIR Australian Addresses #
# Update the private lists to customise the addresses   #
#########################################################
class Random_FHIR_Address:
    def __init__(self):
        self.__street_names = ['Eucalyptus', 'Acacia', 'Banksia', 'Callistemon', 'Melaleuca', 'Corymbia', 'Leptospermum', 'Grevillea', 'Xanthorrhoea', 'Acmena', 'Cycad', 'Brachychiton', 'Allocasuarina', 'Hakea', 'Boronia', 'Correa', 'Waratah', 'Wattle', 'Quandong']
        self.__city_names = ['Springfield', 'Victoria', 'Richmond', 'Kensington', 'Newcastle', 'Mount Pleasant', 'Windsor', 'Fairfield', 'Franklin', 'Devonport', 'Preston', 'Glenelg', 'Brighton', 'Hawthorn', 'Brunswick', 'Geelong', 'Richmond', 'Kensington', 'Newcastle', 'Windsor', 'Fairfield']
        self.__states = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'ACT', 'NT']
        self.__street_suffix = ['St', 'Ave', 'Rd', 'Ln', 'Blvd', 'Cres', 'Ct', 'Cl', 'Pl', 'Dr', 'Way', 'Sq', 'Tce', 'Pde', 'Hwy', 'Esp', 'Cove', 'Rise']
        #Address().__fields__["use"].field_info.extra["enum_values"]

    def NewAddress(self):
        street_number = random.randint(1, 400)
        street_name = random.choice(self.__street_names)
        street_suffix = random.choice(self.__street_suffix)

        address = Address()
        address.line = [f"{street_number} {street_name} {street_suffix}"]
        address.city = random.choice(self.__city_names)
        address.state = random.choice(self.__states)
        address.postalCode = random.randint(1000, 8999)
        address.country = "Australia"
        address.text = f"{street_number} {street_name} {street_suffix}, {address.city}, {address.state} {address.postalCode}"

        return address


######################################################
# Class for generating random FHIR Person resources  #
# NewPatient()                                       #
# NewPractitioner()                                  #
######################################################
class Random_FHIR_Person:
    def __init__(self):
        #adjectives used as "given names"
        self.__adjectives = ['Ambitious', 'Outgoing', 'Compassionate', 'Independent', 'Adventurous', 'Humble', 'Charismatic', 'Loyal', 'Curious', 'Analytical', 'Assertive', 'Sociable', 'Patient', 'Creative',
                           'Happy', 'Sad', 'Angry', 'Excited', 'Calm', 'Anxious', 'Confident', 'Insecure', 'Empathetic', 'Sympathetic', 'Enthusiastic', 'Nervous', 'Content', 'Frustrated',
                           'Energetic', 'Vibrant', 'Healthy', 'Fit', 'Robust', 'Resilient', 'Nourished', 'Well-balanced', 'Rested', 'Hydrated', 'Strong', 'Agile', 'Vital', 'Thriving'
                           ]

        #animals used as "family names"
        self.__animals = ['Kangaroo', 'Koala', 'Platypus', 'Wombat', 'Wallaby', 'Tasmanian Devil', 'Echidna', 'Possum', 'Quokka', 'Sugar Glider', 'Kookaburra', 'Emu', 'Cassowary', 'Cockatoo',
                        'Dingo', 'Frilled-Neck Lizard', 'Tasmanian Tiger', 'Numbat', 'Bilby', 'Quoll', 'Bandicoot', 'Pademelon', 'Redback Spider', 'Blue-ringed Octopus', 'Funnel-Web',
                        'Box Jellyfish', 'Cane Toad', 'Green Tree Frog', 'Crocodile', 'Galah', 'Blue-tongued Lizard', 'Goanna', 'Lorikeet', 'Magpie', 'Brushtail Possum','Potoroo', 'Brush Turkey',
                        'Flying Fox', 'Gouldian Finch', 'Taipan', 'Bettong','Humpback Whale'
                        ]
        
        self.__genders = Patient().__fields__["gender"].field_info.extra["enum_values"]

        self.__AddressGenerator = Random_FHIR_Address()


    def __getRandomName(self):
        FirstName = random.choice(self.__adjectives)
        LastName = random.choice(self.__animals)
        return FirstName, LastName

    def __getRandomGender(self):
        #tweek the distribution as desired ['male', 'female', 'other', 'unknown']
        return np.random.choice(self.__genders, p=[0.47, 0.49,0.03,0.01])


    def __getRandomAge(self):
        #Proportional Age Ranges derived from https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/mar-2023#data-downloads-data-cubes
        AgeStatistics = {
            "Age Range": ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85-104"],
            "Proportion": [0.058, 0.062, 0.063, 0.059, 0.063, 0.07, 0.074, 0.073, 0.066, 0.062, 0.064, 0.059, 0.057, 0.05, 0.044, 0.034, 0.022, 0.02]
        }

        # Generate a random age based on the distribution
        random_age_range = np.random.choice(AgeStatistics["Age Range"], p=AgeStatistics["Proportion"])
        lower_bound, upper_bound = map(int, random_age_range.split('-'))
        random_age = np.random.randint(lower_bound, upper_bound + 1)
        return random_age


    def __getRandomBirthDate(self):
        #determine birthdate based on random age
        age = self.__getRandomAge()
        now = datetime.now()
        preciseAge = age+(random.random()-0.5)
        birthdate = now - relativedelta(days=preciseAge*365.25)
        return birthdate.strftime("%Y-%m-%d")


    def __getRandomID(self):
        return chr(random.randint(ord('A'), ord('Z')))+str(int(time.time()*1000000)-900062000000000)


    def NewPatient(self):
        p = Patient()
        p.id = self.__getRandomID()

        p.gender = self.__getRandomGender()

        #Random Name
        p.name = [HumanName()]
        first,last = self.__getRandomName()
        p.name[0].given = [first]
        p.name[0].family = last
        p.name[0].text = first + ' ' + last

        #Random Birthdate
        p.birthDate = self.__getRandomBirthDate()

        p.address = [self.__AddressGenerator.NewAddress()]
        
        #Generate a random thumbnail attachment based on the characters name
        image_prompt = f"16 bit pixel art - {p.name[0].text} face"       
        att = make_thumbnail_attachment(image_prompt, size=128)
        p.photo = [att]
        
        return p



    def NewPractitioner(self):
        p = Practitioner()
        p.id = self.__getRandomID()

        #Random Name
        p.name = [HumanName()]
        first,last = self.__getRandomName()
        
        p.name[0].given = [first]
        p.name[0].family = last
        p.name[0].prefix = ["Dr"]
        p.name[0].text = p.name[0].prefix[0] + ' ' + first + ' ' + last

        p.address = [self.__AddressGenerator.NewAddress()]
        
        return p
    
def generate_random_date(start_date, end_date):
    # Define a date range (e.g., from January 1, 2022, to December 31, 2022)
    start_date = start_date
    end_date = end_date
    time_delta = end_date - start_date
    random_days = random.randint(0, time_delta.days)
    random_date = start_date + datetime.timedelta(days=random_days)
    return random_date



##########################################################
# Random FHIR ServiceRequest                             #
# Instance initialises by preloading valueSet expansions #
# NewServiceRequest()                                    #
##########################################################
class Random_FHIR_ServiceRequest:
    def __init__(self):
        self.__categories ={
                            "Laboratory" : [{'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/service-category', 'code': '108252007', 'display': 'Laboratory procedure'}]}],
                            "Imaging" : [{'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/service-category', 'code': '363679005', 'display': 'Imaging procedure'}]}]
                            }
        
        self.__ImagingECL= " ((<168537006 OR <113091000 OR <16310003 OR <418285008 OR <44491008 OR <77477000 OR <71651007 OR <241686001 ) MINUS (<<71388002:*=^723264001))"
        self.__ImagingSubset = ECLValueSet(self.__ImagingECL)

        self.__PathologyECL= "(^1072351000168102)"
        self.__PathologySubset = ECLValueSet(self.__PathologyECL)


    def NewImagingRequest(self,patient,requester):
        __referral = ServiceRequest(status='active', intent='order',subject={'reference': 'Patient/'+patient.id})
        __referral.requester = {'reference': 'Practitioner/'+requester.id}
        __referral.priority = 'routine'
        __referral.category = self.__categories["Imaging"]

        __referral.code = {'coding': [self.__ImagingSubset.getRandomMember()]}

        __referral.id = str(uuid.uuid4())
        
        return __referral

    def NewPathologyRequest(self,patient,requester):
        __referral = ServiceRequest(status='active', intent='order',subject={'reference': 'Patient/'+patient.id})
        __referral.requester = {'reference': 'Practitioner/'+requester.id}
        __referral.priority = 'routine'
        __referral.category = self.__categories["Laboratory"]             

        __referral.code = {'coding': [self.__PathologySubset.getRandomMember()]}
        
        __referral.id = str(uuid.uuid4())
        
        return __referral
    
    #Randomly Generate one of the above request types.
    def NewRandomRequest(self,patient,requester):
        functions = [self.NewPathologyRequest, self.NewImagingRequest]
        return random.choice(functions)(patient,requester)
    
