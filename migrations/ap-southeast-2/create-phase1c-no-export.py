#!/usr/bin/env python3
import json

with open("phase1b-all-retain-template.json", "r") as f:
    template = json.load(f)

# Remove the export from RFC1918PrefixListId output
if "RFC1918PrefixListId" in template.get("Outputs", {}):
    if "Export" in template["Outputs"]["RFC1918PrefixListId"]:
        del template["Outputs"]["RFC1918PrefixListId"]["Export"]

with open("phase1c-no-export-template.json", "w") as f:
    json.dump(template, f, indent=2)

print("Phase 1c template created - removed export")
