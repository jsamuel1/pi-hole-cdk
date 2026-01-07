import json
import os
import ssl
import urllib.request
import boto3


def lambda_handler(event, context):
    secrets_client = boto3.client('secretsmanager')
    
    # Get UniFi credentials
    unifi_secret = json.loads(secrets_client.get_secret_value(SecretId=os.environ['UNIFI_SECRET_NAME'])['SecretString'])
    
    # SSL context that doesn't verify (UniFi uses self-signed certs)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    base_url = os.environ['UNIFI_BASE_URL']
    site_id = os.environ.get('UNIFI_SITE_ID', 'default')
    
    # Login to UniFi
    login_data = json.dumps({"username": unifi_secret['username'], "password": unifi_secret['password']}).encode()
    login_req = urllib.request.Request(f"{base_url}/api/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
    login_resp = urllib.request.urlopen(login_req, context=ctx)
    cookies = login_resp.headers.get('Set-Cookie', '')
    
    # Get active clients
    clients_req = urllib.request.Request(f"{base_url}/proxy/network/api/s/{site_id}/stat/sta", headers={'Cookie': cookies})
    clients_resp = urllib.request.urlopen(clients_req, context=ctx)
    clients = json.loads(clients_resp.read())['data']
    
    # Generate custom.list entries
    dns_suffix = os.environ['LOCAL_DNS_SUFFIX']
    entries = []
    for client in clients:
        if client.get('hostname') and client.get('ip'):
            entries.append(f"{client['ip']} {client['hostname']}.{dns_suffix}")
    
    # Write to EFS
    with open('/mnt/efs/custom.list', 'w') as f:
        f.write('\n'.join(entries) + '\n')
    
    # Reload Pi-hole DNS via v6 API
    pihole_api_url = os.environ['PIHOLE_API_URL']
    pihole_password = secrets_client.get_secret_value(SecretId=os.environ['PIHOLE_SECRET_NAME'])['SecretString']
    
    # Authenticate
    auth_data = json.dumps({"password": pihole_password}).encode()
    auth_req = urllib.request.Request(f"{pihole_api_url}/api/auth", data=auth_data, headers={'Content-Type': 'application/json'})
    auth_resp = urllib.request.urlopen(auth_req, context=ctx)
    sid = json.loads(auth_resp.read())['session']['sid']
    
    # Restart DNS
    restart_req = urllib.request.Request(f"{pihole_api_url}/api/action/restartdns", method='POST', headers={'X-FTL-SID': sid})
    urllib.request.urlopen(restart_req, context=ctx)
    
    return {'statusCode': 200, 'body': json.dumps(f'Updated {len(entries)} DNS entries')}
