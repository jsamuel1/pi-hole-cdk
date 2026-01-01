#!/usr/bin/env python3
import json

with open("current-template.json", "r") as f:
    template = json.load(f)

# Set DeletionPolicy: Retain for ALL resources
for resource_id in template["Resources"]:
    template["Resources"][resource_id]["DeletionPolicy"] = "Retain"

with open("phase1b-all-retain-template.json", "w") as f:
    json.dump(template, f, indent=2)

print(f"Phase 1b template created with Retain policy on ALL {len(template['Resources'])} resources")
