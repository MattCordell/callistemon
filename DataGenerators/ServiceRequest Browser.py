from flask import Flask, render_template_string
import requests
from requests.auth import HTTPBasicAuth
from datetime import datetime, timedelta

app = Flask(__name__)

# FHIR server URL
fhir_server_url = "https://pyroserver.azurewebsites.net/pyro"

# Credentials
username = "placer"
password = "ps8qs7kLVbjS5Gr"

# HTML template for the webpage
html_template = """
<!DOCTYPE html>
<html>
<head>
    <title>Service Requests - "https://pyroserver.azurewebsites.net/pyro"</title>
    <meta http-equiv="refresh" content="1">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
        }
        h1 {
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border: 1px solid #ddd;
        }
        th {
            background-color: #f4f4f4;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
    </style>
</head>
<body>
    <h1>Service Requests</h1>
    <table>
        <tr>
            <th>Requisition Value</th>
            <th>Status</th>
            <th>Patient Name</th>
            <th>Code Display</th>
            <th>Category Display</th>
        </tr>
        {% for service_request in service_requests %}
        <tr>
            <td>{{ service_request.requisition.value if service_request.requisition else 'N/A' }}</td>
            <td>{{ service_request.status }}</td>
            <td>{{ service_request.subject_name }}</td>
            <td>{{ service_request.code.coding[0].display if service_request.code and service_request.code.coding else 'N/A' }}</td>
            <td>{{ service_request.category[0].coding[0].display if service_request.category and service_request.category[0].coding else 'N/A' }}</td>
        </tr>
        {% endfor %}
    </table>
</body>
</html>
"""

@app.route('/')
def index():
    # Calculate the time 6 hours ago
    six_hours_ago = datetime.utcnow() - timedelta(hours=6)
    six_hours_ago_str = six_hours_ago.strftime('%Y-%m-%dT%H:%M:%SZ')

    # Endpoint to retrieve all ServiceRequest resources created in the last 6 hours, sorted by most recent
    service_request_endpoint = f"{fhir_server_url}/ServiceRequest?_lastUpdated=gt{six_hours_ago_str}&_sort=-_lastUpdated&_count=15"

    # Make the GET request with basic authentication
    response = requests.get(service_request_endpoint, auth=HTTPBasicAuth(username, password))

    # Check if the request was successful
    if response.status_code == 200:
        service_requests = response.json().get('entry', [])
        service_requests = [entry['resource'] for entry in service_requests]

        # Resolve subject references to get patient names
        for service_request in service_requests:
            subject_reference = service_request.get('subject', {}).get('reference')
            if subject_reference:
                patient_response = requests.get(f"{subject_reference}", auth=HTTPBasicAuth(username, password))
                if patient_response.status_code == 200:
                    patient = patient_response.json()
                    service_request['subject_name'] = patient.get('name', [{}])[0].get('text', 'N/A')
                else:
                    service_request['subject_name'] = 'N/A'
            else:
                service_request['subject_name'] = 'N/A'
    else:
        service_requests = []

    return render_template_string(html_template, service_requests=service_requests)

if __name__ == '__main__':
    app.run(debug=True)