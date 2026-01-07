import json
import os
import requests
import boto3
from typing import Dict, List


def lambda_handler(event, context):
    # Get UniFi credentials from Secrets Manager
    secrets_client = boto3.client('secretsmanager')
    secret = json.loads(secrets_client.get_secret_value(SecretId=os.environ['UNIFI_SECRET_NAME'])['SecretString'])
    
    # UniFi API session
    session = requests.Session()
    session.verify = False  # UniFi uses self-signed certs
    
    # Login to UniFi
    base_url = os.environ['UNIFI_BASE_URL']
    site_id = os.environ.get('UNIFI_SITE_ID', 'default')
    
    login_response = session.post(
        f"{base_url}/api/auth/login",
        json={"username": secret['username'], "password": secret['password']}
    )
    login_response.raise_for_status()
    
    # Get active clients
    clients_response = session.get(f"{base_url}/proxy/network/api/s/{site_id}/stat/sta")
    clients_response.raise_for_status()
    clients = clients_response.json()['data']
    
    # Generate custom.list entries
    dns_suffix = os.environ['LOCAL_DNS_SUFFIX']
    entries = []
    for client in clients:
        if client.get('hostname') and client.get('ip'):
            hostname = client['hostname']
            ip = client['ip']
            entries.append(f"{ip} {hostname}.{dns_suffix}")
    
    # Write to EFS
    with open('/mnt/efs/custom.list', 'w') as f:
        f.write('\n'.join(entries) + '\n')
    
    # Reload Pi-hole DNS via v6 API
    pihole_api_url = os.environ['PIHOLE_API_URL']
    pihole_password = secrets_client.get_secret_value(SecretId=os.environ['PIHOLE_SECRET_NAME'])['SecretString']
    
    # Authenticate to get session ID
    auth_response = requests.post(
        f"{pihole_api_url}/api/auth",
        json={"password": pihole_password},
        verify=False
    )
    auth_response.raise_for_status()
    sid = auth_response.json()['session']['sid']
    
    # Restart DNS with session ID
    requests.post(
        f"{pihole_api_url}/api/action/restartdns",
        headers={"X-FTL-SID": sid},
        verify=False
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps(f'Updated {len(entries)} DNS entries')
    }