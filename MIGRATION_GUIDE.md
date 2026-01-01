# Pi-hole CDK Stack Migration Guide

## Overview
This guide documents the migration process for updating CloudFormation logical IDs after refactoring CDK constructs. The migration is required because CloudFormation treats logical ID changes as resource replacements.

## Prerequisites
- AWS CLI configured with appropriate profile
- CDK project built (`npm run build`)
- Access to the target AWS account

## Migration Steps

### Phase 1: Remove Cross-Stack Export Dependency

The `PiHoleCdkStack` exports `RFC1918PrefixListId` which is imported by `TgwWithSiteToSiteVpnStack`. We must remove this dependency first.

#### Step 1.1: Update TGW Stack to Use Hardcoded Prefix List ID

```bash
# Get current TGW template
aws cloudformation get-template \
  --stack-name TgwWithSiteToSiteVpnStack \
  --region <REGION> \
  --profile <PROFILE> \
  --query TemplateBody > tgw-current-template.json

# Replace ImportValue with hardcoded prefix list ID
python3 << 'EOF'
import json

with open("tgw-current-template.json", "r") as f:
    template = json.load(f)

template_str = json.dumps(template)
# Replace with actual prefix list ID from the region
template_str = template_str.replace('{"Fn::ImportValue": "RFC1918PrefixListId"}', '"<PREFIX_LIST_ID>"')
template = json.loads(template_str)

with open("tgw-updated-template.json", "w") as f:
    json.dump(template, f, indent=2)
EOF

# Update TGW stack
aws cloudformation update-stack \
  --stack-name TgwWithSiteToSiteVpnStack \
  --template-body file://tgw-updated-template.json \
  --capabilities CAPABILITY_IAM \
  --region <REGION> \
  --profile <PROFILE>

# Wait for completion
aws cloudformation wait stack-update-complete \
  --stack-name TgwWithSiteToSiteVpnStack \
  --region <REGION> \
  --profile <PROFILE>
```

#### Step 1.2: Verify Export is No Longer Used

```bash
aws cloudformation list-imports \
  --export-name RFC1918PrefixListId \
  --region <REGION> \
  --profile <PROFILE>
# Should return empty Imports list
```

### Phase 2: Set Retain Policy on All PiHole Resources

#### Step 2.1: Get Current Template and Add Retain Policies

```bash
# Get current template
aws cloudformation get-template \
  --stack-name PiHoleCdkStack \
  --region <REGION> \
  --profile <PROFILE> \
  --query TemplateBody > pihole-current-template.json

# Add DeletionPolicy: Retain to all resources
python3 << 'EOF'
import json

with open("pihole-current-template.json", "r") as f:
    template = json.load(f)

for resource_id in template["Resources"]:
    template["Resources"][resource_id]["DeletionPolicy"] = "Retain"

with open("pihole-retain-template.json", "w") as f:
    json.dump(template, f, indent=2)
EOF

# Update stack with Retain policies
aws cloudformation update-stack \
  --stack-name PiHoleCdkStack \
  --template-body file://pihole-retain-template.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --region <REGION> \
  --profile <PROFILE>

# Wait for completion
aws cloudformation wait stack-update-complete \
  --stack-name PiHoleCdkStack \
  --region <REGION> \
  --profile <PROFILE>
```

### Phase 3: Delete Stack (Resources Retained)

```bash
aws cloudformation delete-stack \
  --stack-name PiHoleCdkStack \
  --region <REGION> \
  --profile <PROFILE>

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name PiHoleCdkStack \
  --region <REGION> \
  --profile <PROFILE>
```

### Phase 4: Import Resources with New Logical IDs

#### Step 4.1: Create resources-to-import.json

Create a JSON file mapping new logical IDs to physical resource identifiers. Example structure:

```json
[
  {
    "ResourceType": "AWS::EC2::PrefixList",
    "LogicalResourceId": "networkingrfc1918prefixB68305A2",
    "ResourceIdentifier": { "PrefixListId": "<PREFIX_LIST_ID>" }
  },
  {
    "ResourceType": "AWS::EC2::SecurityGroup",
    "LogicalResourceId": "networkingallowdnshttp984E9584",
    "ResourceIdentifier": { "GroupId": "<SECURITY_GROUP_ID>" }
  }
  // ... more resources
]
```

#### Step 4.2: Synthesize New CDK Template

```bash
CDK_DEFAULT_REGION=<REGION> cdk synth PiHoleCdkStack \
  -c vpc_name=<VPC_NAME> \
  --profile <PROFILE> \
  -o cdk.out.migration
```

#### Step 4.3: Create Import Change Set

```bash
aws cloudformation create-change-set \
  --stack-name PiHoleCdkStack \
  --change-set-name ImportResources \
  --change-set-type IMPORT \
  --resources-to-import file://resources-to-import.json \
  --template-body file://cdk.out.migration/PiHoleCdkStack.template.json \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --region <REGION> \
  --profile <PROFILE>

# Wait for change set creation
aws cloudformation wait change-set-create-complete \
  --stack-name PiHoleCdkStack \
  --change-set-name ImportResources \
  --region <REGION> \
  --profile <PROFILE>

# Execute change set
aws cloudformation execute-change-set \
  --stack-name PiHoleCdkStack \
  --change-set-name ImportResources \
  --region <REGION> \
  --profile <PROFILE>
```

### Phase 5: Update TGW Stack via CDK

After PiHoleCdkStack is migrated, update TgwWithSiteToSiteVpnStack via CDK to use the new parameter-based approach:

```bash
CDK_DEFAULT_REGION=<REGION> cdk deploy TgwWithSiteToSiteVpnStack \
  -c vpc_name=<VPC_NAME> \
  -c rfc1918PrefixListId=<PREFIX_LIST_ID> \
  --profile <PROFILE> \
  --require-approval never
```

## Region-Specific Values

### ap-southeast-2
- **Profile**: `sauhsoj+ct+pihole-Admin`
- **VPC Name**: `aws-controltower-VPC`
- **Prefix List ID**: `pl-0c883cfc9fd86d087`
- **Security Group (allow_dns_http)**: `sg-02ab0401266f0f3b0`
- **EFS Security Group**: `sg-08f48e5eca75263eb`
- **EFS File System**: `fs-06d79a94d5822cc9f`
- **NLB ARN**: `arn:aws:elasticloadbalancing:ap-southeast-2:717494614307:loadbalancer/net/pihole/9a6e7a2d39e235f6`

## Current Progress (ap-southeast-2)

### Completed
- [x] Phase 1.1: Updated TGW stack template to replace ImportValue with hardcoded prefix list ID
- [x] Phase 2.1: Set DeletionPolicy: Retain on all PiHoleCdkStack resources

### In Progress
- [ ] Phase 1.2: Verify TGW stack update completed and export is no longer used

### Remaining
- [ ] Phase 3: Delete PiHoleCdkStack (resources retained)
- [ ] Phase 4: Import resources with new logical IDs
- [ ] Phase 5: Update TGW stack via CDK

## CDK Code Changes Made

1. **lib/tgw-with-sitetositevpn-stack.ts**: Changed from `Fn.importValue('RFC1918PrefixListId')` to use context parameter `rfc1918PrefixListId`

2. **bin/pi-hole-cdk.ts**: Added `rfc1918PrefixListId` property to `AppConfig` class

## Rollback Plan

If migration fails:
1. Resources are retained with `DeletionPolicy: Retain`
2. Can recreate stack with original logical IDs by deploying old CDK code
3. Physical resources (NLB IPs, EFS data, secrets) are preserved
