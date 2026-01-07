import json
import os
import ssl
import urllib.request
import boto3


def lambda_handler(event, context):
    secrets_client = boto3.client('secretsmanager')
    
    # Get UniFi API key
    unifi_secret = json.loads(secrets_client.get_secret_value(SecretId=os.environ['UNIFI_SECRET_NAME'])['SecretString'])
    api_key = unifi_secret['api_key']
    
    # SSL context that doesn't verify (UniFi uses self-signed certs)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    base_url = os.environ['UNIFI_BASE_URL']
    site_id = os.environ.get('UNIFI_SITE_ID', 'default')
    dns_suffix = os.environ['LOCAL_DNS_SUFFIX']
    
    # Get active clients
    clients_req = urllib.request.Request(
        f"{base_url}/proxy/network/api/s/{site_id}/stat/sta",
        headers={'X-API-KEY': api_key}
    )
    clients_resp = urllib.request.urlopen(clients_req, context=ctx)
    clients = json.loads(clients_resp.read())['data']
    
    # Build hostname->IP map from active clients
    hostname_map = {}
    for client in clients:
        if client.get('hostname') and client.get('ip'):
            hostname_map[client['mac']] = {
                'hostname': client['hostname'],
                'ip': client['ip']
            }
    
    # Generate Pi-hole hosts
    hosts = [f"{v['ip']} {v['hostname']}.{dns_suffix}" for v in hostname_map.values()]
    
    # Update Pi-hole via v6 API
    pihole_api_url = os.environ['PIHOLE_API_URL']
    pihole_password = secrets_client.get_secret_value(SecretId=os.environ['PIHOLE_SECRET_NAME'])['SecretString']
    
    auth_data = json.dumps({"password": pihole_password}).encode()
    auth_req = urllib.request.Request(f"{pihole_api_url}/api/auth", data=auth_data, headers={'Content-Type': 'application/json'})
    auth_resp = urllib.request.urlopen(auth_req, context=ctx)
    sid = json.loads(auth_resp.read())['session']['sid']
    
    config_data = json.dumps({"config": {"dns": {"hosts": hosts}}}).encode()
    config_req = urllib.request.Request(
        f"{pihole_api_url}/api/config",
        data=config_data,
        method='PATCH',
        headers={'Content-Type': 'application/json', 'X-FTL-SID': sid}
    )
    urllib.request.urlopen(config_req, context=ctx)
    
    # Update UniFi local DNS records
    # Get all known clients (includes offline)
    users_req = urllib.request.Request(
        f"{base_url}/proxy/network/api/s/{site_id}/rest/user",
        headers={'X-API-KEY': api_key}
    )
    users_resp = urllib.request.urlopen(users_req, context=ctx)
    users = json.loads(users_resp.read())['data']
    
    unifi_updated = 0
    for user in users:
        mac = user.get('mac')
        user_id = user.get('_id')
        if not mac or not user_id:
            continue
        
        # Check if this client has a hostname from active clients
        client_info = hostname_map.get(mac)
        if not client_info:
            continue
        
        expected_dns = f"{client_info['hostname']}.{dns_suffix}"
        current_dns = user.get('local_dns_record', '')
        current_enabled = user.get('local_dns_record_enabled', False)
        
        # Update if different
        if current_dns != expected_dns or not current_enabled:
            update_data = json.dumps({
                'local_dns_record': expected_dns,
                'local_dns_record_enabled': True
            }).encode()
            update_req = urllib.request.Request(
                f"{base_url}/proxy/network/api/s/{site_id}/rest/user/{user_id}",
                data=update_data,
                method='PUT',
                headers={'X-API-KEY': api_key, 'Content-Type': 'application/json'}
            )
            urllib.request.urlopen(update_req, context=ctx)
            unifi_updated += 1
    
    return {
        'statusCode': 200,
        'body': json.dumps(f'Pi-hole: {len(hosts)} entries, UniFi: {unifi_updated} updated')
    }
