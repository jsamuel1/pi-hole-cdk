#!/usr/bin/env python3
import json

# Resources to remove (will be imported with new IDs)
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

# Also need to remove resources that depend on the removed ones
DEPENDENT_RESOURCES = [
    "piholerole45D2AA68",  # References piholepwd34137309
    "piholeasglaunchtemplate35F914B9",  # References allowdnshttp207E8443, piholepwd34137309, piholefs1C36A016
    "piholeasglaunchtemplateProfile79BDF81F",  # References piholerole45D2AA68
    "piholeasgASG8930D123",  # References piholeasglaunchtemplate35F914B9, nlbNLBDNSpiholesTargetsGroup9190EAB9
]

with open("phase1-retain-template.json", "r") as f:
    template = json.load(f)

# Set Retain on dependent resources too
for resource_id in DEPENDENT_RESOURCES:
    if resource_id in template["Resources"]:
        template["Resources"][resource_id]["DeletionPolicy"] = "Retain"

# Remove all resources
all_to_remove = RESOURCES_TO_REMOVE + DEPENDENT_RESOURCES
for resource_id in all_to_remove:
    if resource_id in template["Resources"]:
        del template["Resources"][resource_id]

# Remove outputs that reference removed resources
outputs_to_remove = ["dns1", "dns2", "SecretArn", "RFC1918PrefixListId"]
for output_id in outputs_to_remove:
    if output_id in template.get("Outputs", {}):
        del template["Outputs"][output_id]

with open("phase2-removed-template.json", "w") as f:
    json.dump(template, f, indent=2)

print(f"Phase 2 template created - removed {len(all_to_remove)} resources")
print("Remaining resources:", list(template["Resources"].keys()))
