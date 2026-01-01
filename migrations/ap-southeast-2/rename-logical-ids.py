#!/usr/bin/env python3
import json
import re
import sys

# Mapping of old logical IDs to new logical IDs
RENAMES = {
    # Networking
    "rfc1918prefix": "networkingrfc1918prefixB68305A2",
    "allowdnshttp207E8443": "networkingallowdnshttp984E9584",
    "allowdnshttpfromIndirectPeer22FDED347F": "networkingallowdnshttpfromIndirectPeer22118EB7AE",
    "allowdnshttpfromIndirectPeer280F12452E4": "networkingallowdnshttpfromIndirectPeer2804C4460C0",
    "allowdnshttpfromIndirectPeer353D7731FAA": "networkingallowdnshttpfromIndirectPeer3539A00D0FB",
    "allowdnshttpfromIndirectPeer4UDP5353D41634": "networkingallowdnshttpfromIndirectPeer4UDP53F0C05619",
    "allowdnshttpfromIndirectPeer5ICMPType8C3163C3D": "networkingallowdnshttpfromIndirectPeer5ICMPType81897A3BC",
    
    # Storage
    "piholepwd34137309": "storagepiholepwd56AA2350",
    "piholefs1C36A016": "storagepiholefs1643C501",
    "piholefsEfsSecurityGroup4C4BA10A": "storagepiholefsEfsSecurityGroupACBC1060",
    "piholefsEfsSecurityGroupfromPiHoleCdkStackallowdnshttp93FF3AA5204967329FD2": "storagepiholefsEfsSecurityGroupfromPiHoleCdkStacknetworkingallowdnshttp15F47C1220495231691F",
    "piholefsEfsMountTarget12A295CA7": "storagepiholefsEfsMountTargetPrivateSubnet13D991399",
    "piholefsEfsMountTarget264414D77": "storagepiholefsEfsMountTargetPrivateSubnet252655C50",
    "piholefsEfsMountTarget327AA9833": "storagepiholefsEfsMountTargetPrivateSubnet31E5741F8",
    
    # Load balancer
    "nlbC39469D4": "loadbalancernlbCB05B3A6",
    "nlbNLBDNSBD4A1316": "loadbalancernlbNLBDNSA035D5D5",
    "nlbNLBDNSpiholesTargetsGroup9190EAB9": "loadbalancernlbNLBDNSpiholesTargetsGroupBADD8C1A",
    "GetEndpointIps4AECBE9C": "loadbalancerGetEndpointIpsC39C9DEF",
    "GetEndpointIpsCustomResourcePolicy50BCB4EC": "loadbalancerGetEndpointIpsCustomResourcePolicy4ECFB2FD",
}

def rename_in_template(template):
    """Rename logical IDs in the template."""
    template_str = json.dumps(template)
    
    # Replace all occurrences of old IDs with new IDs
    for old_id, new_id in RENAMES.items():
        template_str = template_str.replace(f'"{old_id}"', f'"{new_id}"')
        template_str = template_str.replace(f'["{old_id}"', f'["{new_id}"')
        template_str = template_str.replace(f'"{old_id}]', f'"{new_id}]')
    
    return json.loads(template_str)

if __name__ == "__main__":
    with open("current-template.json", "r") as f:
        template = json.load(f)
    
    new_template = rename_in_template(template)
    
    with open("migrated-template.json", "w") as f:
        json.dump(new_template, f, indent=2)
    
    print(f"Renamed {len(RENAMES)} logical IDs")
    print("Output written to migrated-template.json")
