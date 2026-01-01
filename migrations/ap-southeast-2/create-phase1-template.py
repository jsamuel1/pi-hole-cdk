#!/usr/bin/env python3
import json

# Resources to remove (will be re-imported with new logical IDs)
RESOURCES_TO_REMOVE = [
    "rfc1918prefix",
    "allowdnshttp207E8443",
    "allowdnshttpfromIndirectPeer22FDED347F",
    "allowdnshttpfromIndirectPeer280F12452E4",
    "allowdnshttpfromIndirectPeer353D7731FAA",
    "allowdnshttpfromIndirectPeer4UDP5353D41634",
    "allowdnshttpfromIndirectPeer5ICMPType8C3163C3D",
    "piholepwd34137309",
    "piholefs1C36A016",
    "piholefsEfsSecurityGroup4C4BA10A",
    "piholefsEfsSecurityGroupfromPiHoleCdkStackallowdnshttp93FF3AA5204967329FD2",
    "piholefsEfsMountTarget12A295CA7",
    "piholefsEfsMountTarget264414D77",
    "piholefsEfsMountTarget327AA9833",
    "nlbC39469D4",
    "nlbNLBDNSBD4A1316",
    "nlbNLBDNSpiholesTargetsGroup9190EAB9",
    "GetEndpointIps4AECBE9C",
    "GetEndpointIpsCustomResourcePolicy50BCB4EC",
]

with open("current-template.json", "r") as f:
    template = json.load(f)

# Set DeletionPolicy: Retain for resources we're removing
for resource_id in RESOURCES_TO_REMOVE:
    if resource_id in template["Resources"]:
        template["Resources"][resource_id]["DeletionPolicy"] = "Retain"

with open("phase1-retain-template.json", "w") as f:
    json.dump(template, f, indent=2)

print(f"Phase 1 template created with Retain policy on {len(RESOURCES_TO_REMOVE)} resources")
