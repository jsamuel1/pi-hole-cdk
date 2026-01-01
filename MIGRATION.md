# Pi-hole CDK Stack Migration Guide

## Overview
After refactoring to use shared constructs, the CloudFormation logical IDs have changed.
To migrate existing deployments without replacing resources, use CloudFormation resource import.

## Migration Steps for ap-southeast-2

### Step 1: Export current stack resources
The deployed stack has these resources that need migration:

### Step 2: Create import template
Run the migration using a two-phase approach:

**Phase 1: Remove old resources from stack (retain)**
```bash
# First, update the stack to remove resources with DeletionPolicy: Retain
aws cloudformation update-stack \
  --stack-name PiHoleCdkStack \
  --template-body file://migration-phase1.yaml \
  --profile "sauhsoj+ct+pihole-Admin" \
  --region ap-southeast-2
```

**Phase 2: Import resources with new logical IDs**
```bash
aws cloudformation create-change-set \
  --stack-name PiHoleCdkStack \
  --change-set-name ImportResources \
  --change-set-type IMPORT \
  --resources-to-import file://resources-to-import.json \
  --template-body file://cdk.out/PiHoleCdkStack.template.json \
  --profile "sauhsoj+ct+pihole-Admin" \
  --region ap-southeast-2
```

## Resource Mapping (Old → New Logical ID)

| Old Logical ID | New Logical ID | Physical ID | Type |
|---|---|---|---|
| rfc1918prefix | networkingrfc1918prefixB68305A2 | pl-0c883cfc9fd86d087 | AWS::EC2::PrefixList |
| allowdnshttp207E8443 | networkingallowdnshttp984E9584 | sg-02ab0401266f0f3b0 | AWS::EC2::SecurityGroup |
| piholepwd34137309 | storagepiholepwd56AA2350 | pihole-pwd | AWS::SecretsManager::Secret |
| piholefs1C36A016 | storagepiholefs1643C501 | fs-06d79a94d5822cc9f | AWS::EFS::FileSystem |
| piholefsEfsSecurityGroup4C4BA10A | storagepiholefsEfsSecurityGroupACBC1060 | sg-08f48e5eca75263eb | AWS::EC2::SecurityGroup |
| nlbC39469D4 | loadbalancernlbCB05B3A6 | net/pihole/9a6e7a2d39e235f6 | AWS::ElasticLoadBalancingV2::LoadBalancer |
| nlbNLBDNSpiholesTargetsGroup9190EAB9 | loadbalancernlbNLBDNSpiholesTargetsGroupBADD8C1A | PiHole-nlbNL-DITF7F7H6944/88db297e9fd76fd8 | AWS::ElasticLoadBalancingV2::TargetGroup |

## Resources that stay the same (no migration needed)
- piholerole45D2AA68
- piholeasglaunchtemplateProfile79BDF81F  
- piholeasglaunchtemplate35F914B9
- piholeasgASG8930D123
- AWS679f53fac002430cb0da5b7982bd2287ServiceRoleC1EA0FF2
- AWS679f53fac002430cb0da5b7982bd22872D164C4C

## Alternative: Fresh deployment
If migration is too complex, consider:
1. Deploy new stack with different name
2. Update DNS/clients to point to new NLB
3. Delete old stack
