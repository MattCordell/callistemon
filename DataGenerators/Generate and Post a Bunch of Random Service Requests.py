import requests
import uuid
import time
from fhir.resources.R4B.bundle import Bundle
from RandomFunctions import Random_FHIR_Person
from RandomFunctions import Random_FHIR_ServiceRequest

#fhir_server_url = 'https://spark.incendi.no/fhir'
fhir_server_url = 'https://server.fire.ly'
#fhir_server_url = 'http://fhir.oridashi.com.au'
#fhir_server_url = 'https://demo.kodjin.com/fhir'
#fhir_server_url = 'https://demo.pathling.app/fhir'
#Works R5#
#fhir_server_url = 'http://fhir.training.hl7.org.au/fhir'


headers = {'Content-Type': 'application/fhir+json'}

# Create a patient
PersonGenerator = Random_FHIR_Person()
ServiceGenerator = Random_FHIR_ServiceRequest()

#loop through as many times as you want to generate and post randomised data
for _ in range(3):
    #generate some randomised data
    patient = PersonGenerator.NewPatient()
    #practioner = PersonGenerator.NewPractitioner()
    #referral = ServiceGenerator.NewRandomRequest(patient=patient, requester=practioner)
    
    #wait 2 seconds to avoid overwhelming the server
    time.sleep(1)

    #Post a bundle with ServiceRequest and referenced patient+requester
    bundle = Bundle(type='transaction', 
                id=str(uuid.uuid4()),
                entry=[{'resource': patient, 'request': {'method': 'PUT', 'url': 'Patient/'+patient.id}}
                       #{'resource': practioner, 'request': {'method': 'PUT', 'url': 'Practitioner/'+practioner.id}},
                       #{'resource': referral, 'request': {'method': 'PUT', 'url': 'ServiceRequest/'+referral.id}}
                       ])        
    print(patient.name[0].text)
    
    payload = bundle.json()
    #print(payload)


    response = requests.post(fhir_server_url, data=payload, headers=headers)
    #print(response.text)

print('Done')