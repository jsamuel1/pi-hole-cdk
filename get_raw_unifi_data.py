#!/usr/bin/env python3
import requests
import json
import urllib3
import os
import sys

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def get_unifi_session():
    """Try to establish a session with UniFi controller"""
    # Common UniFi controller endpoints
    base_urls = [
        'https://localhost:8443',
        'https://unifi:8443',
        'https://127.0.0.1:8443',
        'http://localhost:8080',
        'https://unifi.local:8443'
    ]
    
    session = requests.Session()
    session.verify = False
    
    for base_url in base_urls:
        try:
            # Try to access the API directly (some setups allow this)
            response = session.get(f"{base_url}/proxy/network/api/s/default/rest/networkconf", timeout=5)
            if response.status_code == 200:
                return session, base_url
            
            # Try login if direct access fails
            login_data = {
                'username': os.getenv('UNIFI_USERNAME', 'admin'),
                'password': os.getenv('UNIFI_PASSWORD', ''),
                'remember': False
            }
            
            login_response = session.post(f"{base_url}/api/login", json=login_data, timeout=5)
            if login_response.status_code == 200:
                # Test API access after login
                test_response = session.get(f"{base_url}/proxy/network/api/s/default/rest/networkconf", timeout=5)
                if test_response.status_code == 200:
                    return session, base_url
                    
        except Exception as e:
            continue
    
    return None, None

def get_raw_network_config(target_id):
    """Get raw network configuration from UniFi controller"""
    session, base_url = get_unifi_session()
    
    if not session:
        print("ERROR: Could not establish connection to UniFi controller")
        print("Try setting UNIFI_USERNAME and UNIFI_PASSWORD environment variables")
        return None
    
    try:
        # Get network configurations
        response = session.get(f"{base_url}/proxy/network/api/s/default/rest/networkconf")
        
        if response.status_code != 200:
            print(f"ERROR: API request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return None
        
        data = response.json()
        
        # Find the specific entry
        for item in data.get('data', []):
            if item.get('_id') == target_id:
                return item
        
        print(f"ERROR: No entry found with _id='{target_id}'")
        print(f"Available IDs: {[item.get('_id') for item in data.get('data', [])]}")
        return None
        
    except Exception as e:
        print(f"ERROR: {e}")
        return None

if __name__ == "__main__":
    target_id = "63bb88c0b85794082413c2b9"
    
    print(f"Fetching raw network configuration for ID: {target_id}")
    print("=" * 60)
    
    raw_config = get_raw_network_config(target_id)
    
    if raw_config:
        print(json.dumps(raw_config, indent=2, sort_keys=True))
    else:
        print("Failed to retrieve configuration")
        sys.exit(1)