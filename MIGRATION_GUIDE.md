# Pi-hole CDK Stack Migration Guide

## Overview
This guide documents the migration process for updating CloudFormation logical IDs after refactoring CDK constructs.

## Migration Approach

Due to the complexity of CloudFormation resource imports with CDK-generated templates, the recommended approach is:

1. **Fresh deployment** - Delete the old stack (with retained resources) and deploy fresh with new CDK code
2. **Manual cleanup** - Delete orphaned resources from the old deployment

## Completed Migration (ap-southeast-2)

### Status: ✅ COMPLETE

The PiHoleCdkStack has been successfully deployed with the new refactored constructs.

**New Resource IDs:**
- Prefix List: `pl-053a0b8e47f5931e0`
- Secret ARN: `arn:aws:secretsmanager:ap-southeast-2:717494614307:secret:pihole-pwd-xt7aQK`
- DNS IPs: `172.31.34.219`, `172.31.90.86`

### Steps Performed

1. ✅ Updated TGW stack to remove `Fn::ImportValue` dependency on `RFC1918PrefixListId`
2. ✅ Set `DeletionPolicy: Retain` on all PiHoleCdkStack resources
3. ✅ Deleted PiHoleCdkStack (resources retained)
4. ✅ Attempted CloudFormation IMPORT - failed due to template property mismatches
5. ✅ Deleted orphaned resources (NLB, EFS, secrets, security groups, prefix list, EC2 instance)
6. ✅ Deployed fresh PiHoleCdkStack with new CDK code

### Orphaned Resources Cleaned Up

- NLB: `arn:aws:elasticloadbalancing:ap-southeast-2:717494614307:loadbalancer/net/pihole/9a6e7a2d39e235f6`
- Target Group: `arn:aws:elasticloadbalancing:ap-southeast-2:717494614307:targetgroup/PiHole-nlbNL-DITF7F7H6944/88db297e9fd76fd8`
- Secret: `pihole-pwd`
- EFS: `fs-06d79a94d5822cc9f` (with mount targets)
- Security Groups: `sg-02ab0401266f0f3b0`, `sg-08f48e5eca75263eb`
- Prefix List: `pl-0c883cfc9fd86d087`
- EC2 Instance: `i-05ec7fdf103f3f887`

## Migration for Other Regions

For other regions with existing deployments, follow these steps:

### Step 1: Update TGW Stack (if applicable)

If you have a TgwWithSiteToSiteVpnStack that imports `RFC1918PrefixListId`:

```bash
# Get current prefix list ID
aws ec2 describe-managed-prefix-lists \
  --filters "Name=prefix-list-name,Values=RFC1918" \
  --query "PrefixLists[0].PrefixListId" \
  --region <REGION> --profile <PROFILE>

# Update cdk.json or pass via context
# Then deploy TGW stack with hardcoded prefix list ID
```

### Step 2: Delete Old Stack with Retained Resources

```bash
# Get current template
aws cloudformation get-template \
  --stack-name PiHoleCdkStack \
  --region <REGION> --profile <PROFILE> \
  --query TemplateBody > current-template.json

# Add DeletionPolicy: Retain to all resources
python3 << 'EOF'
import json
with open("current-template.json", "r") as f:
    template = json.load(f)
for res in template["Resources"]:
    template["Resources"][res]["DeletionPolicy"] = "Retain"
with open("retain-template.json", "w") as f:
    json.dump(template, f, indent=2)
EOF

# Update stack with retain policies
aws cloudformation update-stack \
  --stack-name PiHoleCdkStack \
  --template-body file://retain-template.json \
  --capabilities CAPABILITY_IAM \
  --region <REGION> --profile <PROFILE>

# Wait then delete
aws cloudformation delete-stack \
  --stack-name PiHoleCdkStack \
  --region <REGION> --profile <PROFILE>
```

### Step 3: Clean Up Orphaned Resources

```bash
# Delete NLB
aws elbv2 delete-load-balancer --load-balancer-arn <NLB_ARN> --region <REGION> --profile <PROFILE>

# Delete target groups
aws elbv2 delete-target-group --target-group-arn <TG_ARN> --region <REGION> --profile <PROFILE>

# Delete secret
aws secretsmanager delete-secret --secret-id pihole-pwd --force-delete-without-recovery --region <REGION> --profile <PROFILE>

# Delete EFS mount targets first
aws efs delete-mount-target --mount-target-id <MT_ID> --region <REGION> --profile <PROFILE>
# Wait ~60 seconds

# Delete EFS
aws efs delete-file-system --file-system-id <FS_ID> --region <REGION> --profile <PROFILE>

# Terminate any running instances using the security group
aws ec2 terminate-instances --instance-ids <INSTANCE_ID> --region <REGION> --profile <PROFILE>
# Wait for termination

# Delete security groups
aws ec2 delete-security-group --group-id <SG_ID> --region <REGION> --profile <PROFILE>

# Delete prefix list
aws ec2 delete-managed-prefix-list --prefix-list-id <PL_ID> --region <REGION> --profile <PROFILE>
```

### Step 4: Deploy Fresh Stack

```bash
cd /path/to/pi-hole-cdk
npm run build
AWS_REGION=<REGION> npx cdk deploy PiHoleCdkStack --profile <PROFILE> --require-approval never
```

## CDK Code Changes

The following changes were made to support the migration:

1. **lib/tgw-with-sitetositevpn-stack.ts**: Uses `rfc1918PrefixListId` from props/context instead of `Fn.importValue`
2. **bin/pi-hole-cdk.ts**: Added `rfc1918PrefixListId` to `AppConfig`

## Why CloudFormation IMPORT Failed

CloudFormation IMPORT requires:
1. ALL resources in the template must be in the import list
2. Imported resources must have `DeletionPolicy: Retain`
3. Resource properties must match the actual resource configuration

The CDK-generated template creates new security groups with different IDs than the imported resources reference, causing property mismatches that CloudFormation cannot reconcile.

## Lessons Learned

1. CloudFormation does NOT support in-place logical ID renames
2. CDK construct refactoring that changes logical IDs requires careful migration planning
3. Cross-stack exports create tight coupling that complicates migrations
4. Fresh deployment is often simpler than complex import operations
