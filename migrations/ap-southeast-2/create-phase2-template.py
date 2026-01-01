#!/usr/bin/env python3
import json

# Resources to remove from template (they'll be imported later)
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

with open("phase1-retain-template.json", "r") as f:
    template = json.load(f)

# Remove the resources
for resource_id in RESOURCES_TO_REMOVE:
    if resource_id in template["Resources"]:
        del template["Resources"][resource_id]

# Update references - ASG target group reference needs updating
# The ASG references nlbNLBDNSpiholesTargetsGroup9190EAB9 which we're removing
# We need to remove that reference temporarily
if "piholeasgASG8930D123" in template["Resources"]:
    asg = template["Resources"]["piholeasgASG8930D123"]
    if "Properties" in asg and "TargetGroupARNs" in asg["Properties"]:
        del asg["Properties"]["TargetGroupARNs"]

# Remove outputs that reference removed resources
outputs_to_remove = ["dns1", "dns2", "SecretArn", "RFC1918PrefixListId"]
for output_id in outputs_to_remove:
    if output_id in template.get("Outputs", {}):
        del template["Outputs"][output_id]

with open("phase2-removed-template.json", "w") as f:
    json.dump(template, f, indent=2)

print(f"Phase 2 template created - removed {len(RESOURCES_TO_REMOVE)} resources")
