# Pi-hole CDK Multi-Region Deployment Guide

This guide provides detailed instructions for deploying Pi-hole infrastructure across multiple AWS regions including Frankfurt (eu-central-1), Sydney (ap-southeast-2), and Melbourne (ap-southeast-4).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Deployment Scenarios](#deployment-scenarios)
5. [Configuration Reference](#configuration-reference)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance and Updates](#maintenance-and-updates)

## Overview

This CDK application supports deploying Pi-hole DNS infrastructure in multiple AWS regions simultaneously. Each regional deployment includes:

- Pi-hole DNS server running on EC2 in an Auto Scaling Group
- AWS Secrets Manager for Pi-hole admin password
- Amazon EFS for persistent Pi-hole configuration
- Network Load Balancer for DNS traffic distribution
- Optional Site-to-Site VPN for secure access from on-premises
- Optional Transit Gateway for advanced networking scenarios

### Region Support

| Region | Code | Instance Type | Architecture | Notes |
|--------|------|---------------|--------------|-------|
| Sydney | ap-southeast-2 | t4g.small | ARM64 (Graviton) | Default, cost-optimized |
| Melbourne | ap-southeast-4 | t3.small | x86 (Intel) | Graviton not available |
| Frankfurt | eu-central-1 | t4g.small | ARM64 (Graviton) | Default, cost-optimized |

## Prerequisites

### AWS Account Setup

1. **VPC Configuration**: Ensure you have a VPC in each target region with:
   - At least 2 availability zones
   - Private subnets with internet access (NAT Gateway or similar)
   - Public subnets if using Site-to-Site VPN

2. **SSH Key Pairs**: Create EC2 key pairs in each target region
   ```bash
   # Example: Create key pair in Frankfurt
   aws ec2 create-key-pair \
     --key-name frankfurt-pihole \
     --region eu-central-1 \
     --query 'KeyMaterial' \
     --output text > ~/.ssh/frankfurt-pihole.pem
   chmod 400 ~/.ssh/frankfurt-pihole.pem
   ```

3. **AWS CLI Configuration**: Ensure AWS CLI is configured with appropriate credentials
   ```bash
   aws configure
   # Or use environment variables:
   export AWS_PROFILE=your-profile-name
   ```

4. **CDK Bootstrap**: Bootstrap CDK in each target region
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/ap-southeast-2
   cdk bootstrap aws://ACCOUNT-ID/ap-southeast-4
   cdk bootstrap aws://ACCOUNT-ID/eu-central-1
   ```

### Local Development Setup

1. **Install Node.js**: Version 14.x or later
   ```bash
   node --version  # Should be v14 or higher
   ```

2. **Install AWS CDK**:
   ```bash
   npm install -g aws-cdk
   cdk --version
   ```

3. **Install Project Dependencies**:
   ```bash
   cd pi-hole-cdk
   npm install
   ```

## Architecture

### Single Region Architecture

```
┌─────────────────────────────────────────────┐
│              AWS Region                      │
│  ┌────────────────────────────────────────┐ │
│  │ VPC                                     │ │
│  │  ┌──────────────────────────────────┐ │ │
│  │  │ Private Subnets (Multi-AZ)       │ │ │
│  │  │  ┌────────────────────────────┐ │ │ │
│  │  │  │ Auto Scaling Group          │ │ │ │
│  │  │  │  ┌──────────┐  ┌──────────┐│ │ │ │
│  │  │  │  │ Pi-hole  │  │ Pi-hole  ││ │ │ │
│  │  │  │  │ EC2 (AZ1)│  │ EC2 (AZ2)││ │ │ │
│  │  │  │  └────┬─────┘  └────┬─────┘│ │ │ │
│  │  │  └───────┼─────────────┼──────┘ │ │ │
│  │  │          │             │        │ │ │
│  │  │    ┌─────┴─────────────┴─────┐ │ │ │
│  │  │    │  Network Load Balancer  │ │ │ │
│  │  │    │      (DNS Port 53)       │ │ │ │
│  │  │    └──────────┬───────────────┘ │ │ │
│  │  └───────────────┼─────────────────┘ │ │
│  │                  │                    │ │
│  │            ┌─────┴──────┐            │ │
│  │            │ EFS Volume │            │ │
│  │            └────────────┘            │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────┐                     │
│  │ Secrets Manager    │                     │
│  │ (Admin Password)   │                     │
│  └────────────────────┘                     │
└──────────────────────────────────────────────┘
```

### Multi-Region Architecture

Each region operates independently with the same architecture. There is no cross-region replication or dependency.

## Deployment Scenarios

### Scenario 1: Deploy Frankfurt Only

**Use Case**: Adding Frankfurt region to existing Sydney/Melbourne deployments

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-pihole \
  --all
```

Or using the deployment script:
```bash
./deploy-multi-region.sh \
  --local-ip 203.123.45.67 \
  --regions eu-central-1 \
  --frankfurt-vpc frankfurt-vpc \
  --frankfurt-keypair frankfurt-pihole
```

### Scenario 2: Deploy All Three Regions

**Use Case**: Fresh deployment across all supported regions

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c region_configs='{
    "ap-southeast-2": {"vpc_name": "sydney-vpc", "keypair": "sydney-key"},
    "ap-southeast-4": {"vpc_name": "melbourne-vpc", "keypair": "melbourne-key"},
    "eu-central-1": {"vpc_name": "frankfurt-vpc", "keypair": "frankfurt-key"}
  }' \
  --all
```

Or using the deployment script:
```bash
./deploy-multi-region.sh \
  --local-ip 203.123.45.67 \
  --sydney-vpc sydney-vpc \
  --sydney-keypair sydney-key \
  --melbourne-vpc melbourne-vpc \
  --melbourne-keypair melbourne-key \
  --frankfurt-vpc frankfurt-vpc \
  --frankfurt-keypair frankfurt-key
```

### Scenario 3: Deploy with Public HTTP Access

**Use Case**: Need temporary access to Pi-hole admin UI before VPN is configured

```bash
./deploy-multi-region.sh \
  --local-ip 203.123.45.67 \
  --regions eu-central-1 \
  --frankfurt-vpc frankfurt-vpc \
  --frankfurt-keypair frankfurt-key \
  --public-http
```

**Security Note**: Public HTTP access creates an internet-facing ALB restricted to your local IP. Disable this after VPN setup.

### Scenario 4: Deploy Specific Stacks

**Use Case**: Only deploy the main Pi-hole stack without VPN or Transit Gateway

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-pihole \
  PiHoleCdkStack-Frankfurt
```

## Configuration Reference

### Context Parameters

#### Required Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `local_ip` | String | Your external IP address | `203.123.45.67` |
| `local_internal_cidr` | String | Your internal network CIDR | `192.168.0.0/16` |

#### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `deployment_regions` | JSON Array | Current region | List of regions to deploy to |
| `vpc_name` | String | - | Default VPC name for all regions |
| `keypair` | String | `pihole` | Default SSH keypair name |
| `public_http` | Boolean | `false` | Enable public ALB for admin UI |
| `usePrefixLists` | Boolean | `true` | Use prefix lists in security groups |
| `region_configs` | JSON Object | - | Region-specific overrides |

#### Region Config Structure

```json
{
  "region-code": {
    "vpc_name": "vpc-name-in-region",
    "keypair": "keypair-name-in-region",
    "use_intel": true  // Force Intel architecture (auto-detected for Melbourne)
  }
}
```

### Stack Naming Convention

Stacks are named with region suffixes for clarity:

| Stack Type | Naming Pattern | Example |
|------------|----------------|---------|
| Main Stack | `PiHoleCdkStack-{Region}` | `PiHoleCdkStack-Frankfurt` |
| VPN Stack | `SiteToSiteVpnStack-{Region}` | `SiteToSiteVpnStack-Frankfurt` |
| TGW Stack | `TgwWithSiteToSiteVpnStack-{Region}` | `TgwWithSiteToSiteVpnStack-Frankfurt` |

### Resource Naming

Resources are named with region codes to avoid conflicts:

| Resource | Naming Pattern | Example (Frankfurt) |
|----------|----------------|---------------------|
| Secret | `pihole-pwd-{region}` | `pihole-pwd-eu-central-1` |
| EFS | `pihole-fs-{region}` | `pihole-fs-eu-central-1` |
| NLB | `pihole-{region}` | `pihole-eu-central-1` |
| Prefix List | `RFC1918-{region}` | `RFC1918-eu-central-1` |
| TGW | `pihole-tgw-{region}` | `pihole-tgw-eu-central-1` |
| VPN | `pihole-vpn-{region}` | `pihole-vpn-eu-central-1` |

## Post-Deployment Configuration

### 1. Retrieve Pi-hole Admin Password

```bash
# Frankfurt example
aws secretsmanager get-secret-value \
  --secret-id pihole-pwd-eu-central-1 \
  --region eu-central-1 \
  --query SecretString \
  --output text
```

### 2. Configure Site-to-Site VPN

After deployment, retrieve VPN configuration from AWS Console:
1. Navigate to VPC → Site-to-Site VPN Connections
2. Select the VPN connection for your region
3. Download the configuration for your router/firewall
4. Configure your on-premises device using the downloaded config

### 3. Access Pi-hole Admin Interface

**Via VPN**:
```
http://pi.hole/admin
```

**Via Public ALB** (if enabled):
The URL is provided in the CDK output as `admin-public-url`

### 4. Configure DNS Endpoints

The private IP addresses of the DNS endpoints are provided in the CDK outputs:
- `dns1`: First DNS endpoint IP
- `dns2`: Second DNS endpoint IP

Configure your router or DHCP server to use these IPs.

## Troubleshooting

### Issue: VPC Lookup Fails

**Error**: `Cannot find VPC with name 'vpc-name'`

**Solution**:
1. Verify VPC exists in the target region:
   ```bash
   aws ec2 describe-vpcs \
     --region eu-central-1 \
     --filters "Name=tag:Name,Values=frankfurt-vpc"
   ```
2. Ensure VPC has a Name tag
3. Check CDK context cache: `cdk context --clear`

### Issue: Stack Already Exists

**Error**: `Stack PiHoleCdkStack-Frankfurt already exists`

**Solution**:
- Update existing stack: `cdk deploy PiHoleCdkStack-Frankfurt`
- Delete and recreate: `cdk destroy PiHoleCdkStack-Frankfurt` then deploy again

### Issue: Insufficient Capacity

**Error**: `We currently do not have sufficient t4g.small capacity`

**Solution**:
1. Try different availability zones by modifying VPC subnet selection
2. Fallback to Intel instances by adding to region config:
   ```json
   "eu-central-1": {
     "use_intel": true
   }
   ```

### Issue: Secret Name Conflict

**Error**: `Secret pihole-pwd-eu-central-1 already exists`

**Solution**:
The secret exists from a previous deployment. Either:
1. Delete the old secret: 
   ```bash
   aws secretsmanager delete-secret \
     --secret-id pihole-pwd-eu-central-1 \
     --region eu-central-1 \
     --force-delete-without-recovery
   ```
2. Or import existing secret into the new stack

## Maintenance and Updates

### Updating the Stack

To update an existing deployment:

```bash
# Update Frankfurt stack
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-pihole \
  PiHoleCdkStack-Frankfurt
```

### Instance Refresh

Instances are automatically replaced every 7 days due to `maxInstanceLifetime` setting. This ensures:
- Pi-hole software stays updated
- Operating system patches are applied
- Configuration changes are propagated

### Monitoring

Monitor your Pi-hole deployment using:

1. **CloudWatch Metrics**: 
   - EC2 instance health
   - NLB health checks
   - EFS performance

2. **Pi-hole Dashboard**:
   - Query statistics
   - Blocked domains
   - Top clients

3. **VPN Connection Status**:
   - Tunnel status in VPC console
   - CloudWatch metrics for VPN

### Backup and Recovery

**EFS Backups**: Configure AWS Backup for the EFS file systems:

```bash
# Example: Create backup plan for Frankfurt
aws backup create-backup-plan \
  --region eu-central-1 \
  --backup-plan file://backup-plan.json
```

**Configuration Export**: Regularly export Pi-hole configuration:
1. Access Pi-hole admin UI
2. Settings → Teleporter
3. Export settings

### Destroying Resources

To remove all resources from a region:

```bash
# Destroy Frankfurt deployment
cdk destroy \
  -c deployment_regions='["eu-central-1"]' \
  --all
```

**Warning**: This will delete all data including EFS volumes and secrets. Export configuration before destroying.

## Cost Optimization

### Estimated Monthly Costs (per region)

| Service | Resource | Est. Monthly Cost (USD) |
|---------|----------|------------------------|
| EC2 | 1x t4g.small (Graviton) | ~$15 |
| EC2 | 1x t3.small (Intel) | ~$18 |
| EFS | 1GB storage | ~$0.30 |
| NLB | Per hour + data | ~$20 |
| Secrets Manager | 1 secret | ~$0.40 |
| VPN | Site-to-Site connection | ~$36 |
| Data Transfer | Variable | Variable |

**Total estimated monthly cost per region**: ~$70-75 USD

### Cost Reduction Tips

1. Use Graviton instances where available (Sydney, Frankfurt)
2. Disable public HTTP ALB after initial setup
3. Use VPN instead of public internet access
4. Review CloudWatch logs retention settings
5. Use EFS Infrequent Access storage class for older data

## Security Considerations

1. **Secrets Management**: Admin passwords stored in AWS Secrets Manager
2. **Network Isolation**: Pi-hole instances in private subnets only
3. **Access Control**: VPN-only access recommended
4. **Public HTTP**: Locked to your IP, disable after setup
5. **Instance Security**: SSM Session Manager enabled for secure access
6. **Updates**: Automatic instance rotation every 7 days
7. **Encryption**: EFS volumes encrypted at rest

## Support and Resources

- **AWS CDK Documentation**: https://docs.aws.amazon.com/cdk/
- **Pi-hole Documentation**: https://docs.pi-hole.net/
- **Frankfurt-Specific Guide**: See [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)
- **Configuration Reference**: See [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)
- **Troubleshooting Guide**: See [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
- **Issue Tracker**: File issues in your repository
- **AWS Support**: Contact AWS Support for infrastructure issues

## Appendix

### Example: Complete Multi-Region Deployment

```bash
#!/bin/bash
# Complete deployment script example

# Set variables
export LOCAL_IP="203.123.45.67"
export LOCAL_CIDR="192.168.0.0/16"

# Deploy to all regions with region-specific settings
./deploy-multi-region.sh \
  --local-ip ${LOCAL_IP} \
  --local-cidr ${LOCAL_CIDR} \
  --regions ap-southeast-2,ap-southeast-4,eu-central-1 \
  --sydney-vpc sydney-prod-vpc \
  --sydney-keypair sydney-ops-key \
  --melbourne-vpc melbourne-prod-vpc \
  --melbourne-keypair melbourne-ops-key \
  --frankfurt-vpc frankfurt-prod-vpc \
  --frankfurt-keypair frankfurt-ops-key

# Wait for deployment to complete
echo "Deployment initiated. Monitor progress in AWS Console or CDK output."

# Retrieve admin passwords
echo "Retrieving admin passwords..."
aws secretsmanager get-secret-value \
  --secret-id pihole-pwd-ap-southeast-2 \
  --region ap-southeast-2 \
  --query SecretString --output text > sydney-password.txt

aws secretsmanager get-secret-value \
  --secret-id pihole-pwd-ap-southeast-4 \
  --region ap-southeast-4 \
  --query SecretString --output text > melbourne-password.txt

aws secretsmanager get-secret-value \
  --secret-id pihole-pwd-eu-central-1 \
  --region eu-central-1 \
  --query SecretString --output text > frankfurt-password.txt

echo "Passwords saved to *-password.txt files"
echo "IMPORTANT: Store these securely and delete the files after recording"
```

### Example: CDK Context File

Create `cdk.context.json` for persistent configuration:

```json
{
  "local_ip": "203.123.45.67",
  "local_internal_cidr": "192.168.0.0/16",
  "deployment_regions": [
    "ap-southeast-2",
    "ap-southeast-4",
    "eu-central-1"
  ],
  "region_configs": {
    "ap-southeast-2": {
      "vpc_name": "sydney-prod-vpc",
      "keypair": "sydney-ops-key"
    },
    "ap-southeast-4": {
      "vpc_name": "melbourne-prod-vpc",
      "keypair": "melbourne-ops-key",
      "use_intel": true
    },
    "eu-central-1": {
      "vpc_name": "frankfurt-prod-vpc",
      "keypair": "frankfurt-ops-key"
    }
  },
  "public_http": false,
  "usePrefixLists": true
}
```

Then deploy simply with:
```bash
cdk deploy --all
```
