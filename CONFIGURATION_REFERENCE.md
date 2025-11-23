# Pi-hole CDK Configuration Reference

Complete reference guide for all configuration options available in the Pi-hole CDK multi-region deployment, with specific focus on Frankfurt region configuration.

## 📋 Table of Contents

1. [Configuration Methods](#configuration-methods)
2. [Context Parameters](#context-parameters)
3. [Region Configuration](#region-configuration)
4. [Deployment Scenarios](#deployment-scenarios)
5. [Resource Configuration](#resource-configuration)
6. [Environment Variables](#environment-variables)
7. [Configuration Examples](#configuration-examples)

## Configuration Methods

### Method 1: Command-Line Context Parameters

Pass configuration using `-c` flag:

```bash
cdk deploy -c parameter=value -c another_parameter=value --all
```

**Pros**: Quick, good for testing, no file management
**Cons**: Long commands, not version-controlled, error-prone

### Method 2: Context File (cdk.context.json)

Create `cdk.context.json` in project root:

```json
{
  "local_ip": "203.123.45.67",
  "deployment_regions": ["eu-central-1"]
}
```

Then deploy: `cdk deploy --all`

**Pros**: Clean, version-controlled, repeatable
**Cons**: Sensitive data might be committed to git

### Method 3: Deployment Script

Use the provided `deploy-multi-region.sh`:

```bash
./deploy-multi-region.sh --local-ip 203.123.45.67 --regions eu-central-1
```

**Pros**: User-friendly, validated inputs, safe defaults
**Cons**: Less flexible than direct CDK commands

### Method 4: Environment Variables + Context

Combine environment variables with context:

```bash
export MY_IP=$(curl -s ifconfig.me)
cdk deploy -c local_ip=$MY_IP --all
```

**Pros**: Dynamic values, secure credential handling
**Cons**: Requires shell scripting knowledge

## Context Parameters

### Required Parameters

#### `local_ip`

**Type**: String (IPv4 address)  
**Description**: Your external/public IP address for VPN and access control  
**Example**: `203.123.45.67`

```bash
# Get automatically
-c local_ip=$(curl -s ifconfig.me)

# Set manually
-c local_ip=203.123.45.67
```

**Validation**: Must be a valid IPv4 address
**Security Note**: This IP is used to restrict access to public resources

#### `local_internal_cidr`

**Type**: String (CIDR notation)  
**Description**: Your internal network CIDR range for VPN routing  
**Example**: `192.168.0.0/16` or `10.0.0.0/8`

```bash
-c local_internal_cidr=192.168.0.0/16
```

**Common Values**:
- `192.168.0.0/16` - Standard home network range
- `10.0.0.0/8` - Large enterprise networks
- `172.16.0.0/12` - Alternative private range

### Optional Parameters

#### `deployment_regions`

**Type**: JSON Array of strings  
**Description**: List of AWS regions to deploy to  
**Default**: Current AWS region from environment

```bash
# Single region
-c deployment_regions='["eu-central-1"]'

# Multiple regions
-c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]'
```

**Supported Regions**:
- `ap-southeast-2` - Sydney, Australia
- `ap-southeast-4` - Melbourne, Australia
- `eu-central-1` - Frankfurt, Germany

#### `vpc_name`

**Type**: String  
**Description**: Default VPC name for all regions (can be overridden)  
**Default**: None (must provide either this or region-specific VPC names)

```bash
-c vpc_name=my-vpc-name
```

**Note**: VPC must exist in target region and have a Name tag matching this value

#### `keypair`

**Type**: String  
**Description**: Default SSH key pair name  
**Default**: `pihole`

```bash
-c keypair=my-keypair-name
```

**Note**: Key pair must exist in each target region

#### `public_http`

**Type**: Boolean (true/false or "True"/"False")  
**Description**: Enable public-facing Application Load Balancer for web interface  
**Default**: `false`

```bash
# Enable public access
-c public_http=true

# Disable (recommended for production)
-c public_http=false
```

**Security Warning**: When enabled, creates internet-facing ALB restricted to your `local_ip`

#### `usePrefixLists`

**Type**: Boolean (true/false)  
**Description**: Use AWS managed prefix lists in security groups  
**Default**: `true`

```bash
-c usePrefixLists=true
```

**When to disable**: If you encounter prefix list quota issues or prefer explicit CIDR rules

#### `region_configs`

**Type**: JSON Object  
**Description**: Region-specific configuration overrides  
**Default**: None

```bash
-c region_configs='{
  "eu-central-1": {
    "vpc_name": "frankfurt-vpc",
    "keypair": "frankfurt-key",
    "use_intel": false
  }
}'
```

**Structure**:
```json
{
  "region-code": {
    "vpc_name": "string",      // Override VPC name for this region
    "keypair": "string",        // Override key pair for this region
    "use_intel": boolean        // Force Intel/x86 architecture
  }
}
```

## Region Configuration

### Frankfurt (eu-central-1) Specific

**Default Configuration**:
- Instance Type: `t4g.small` (ARM64/Graviton2)
- Architecture: ARM64
- Availability Zones: eu-central-1a, eu-central-1b, eu-central-1c

**Example Configuration**:
```json
{
  "eu-central-1": {
    "vpc_name": "frankfurt-production-vpc",
    "keypair": "frankfurt-ops-key",
    "use_intel": false
  }
}
```

**Force Intel Architecture** (if Graviton unavailable):
```json
{
  "eu-central-1": {
    "use_intel": true
  }
}
```

### Sydney (ap-southeast-2) Specific

**Default Configuration**:
- Instance Type: `t4g.small` (ARM64/Graviton2)
- Architecture: ARM64
- Availability Zones: ap-southeast-2a, ap-southeast-2b, ap-southeast-2c

### Melbourne (ap-southeast-4) Specific

**Default Configuration**:
- Instance Type: `t3.small` (x86/Intel) - **Automatically set**
- Architecture: x86 (Graviton not available in this region)
- Availability Zones: ap-southeast-4a, ap-southeast-4b, ap-southeast-4c

**Note**: Melbourne always uses Intel instances automatically

## Deployment Scenarios

### Scenario 1: Frankfurt Only - Minimal Configuration

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=default-vpc \
  -c keypair=default-key \
  --all
```

### Scenario 2: Frankfurt Only - Custom Configuration

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c region_configs='{
    "eu-central-1": {
      "vpc_name": "frankfurt-prod-vpc",
      "keypair": "frankfurt-prod-key"
    }
  }' \
  --all
```

### Scenario 3: Multi-Region with Different Configs

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c region_configs='{
    "ap-southeast-2": {
      "vpc_name": "sydney-vpc",
      "keypair": "sydney-key"
    },
    "ap-southeast-4": {
      "vpc_name": "melbourne-vpc",
      "keypair": "melbourne-key"
    },
    "eu-central-1": {
      "vpc_name": "frankfurt-vpc",
      "keypair": "frankfurt-key"
    }
  }' \
  --all
```

### Scenario 4: Frankfurt with Public HTTP Access

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-key \
  -c public_http=true \
  --all
```

### Scenario 5: Frankfurt with Intel Architecture

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c region_configs='{"eu-central-1": {"use_intel": true}}' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-key \
  --all
```

## Resource Configuration

### Stack Names

Stacks are created with region-specific suffixes:

| Region | Main Stack | VPN Stack | TGW Stack |
|--------|------------|-----------|-----------|
| Frankfurt | PiHoleCdkStack-Frankfurt | SiteToSiteVpnStack-Frankfurt | TgwWithSiteToSiteVpnStack-Frankfurt |
| Sydney | PiHoleCdkStack-Sydney | SiteToSiteVpnStack-Sydney | TgwWithSiteToSiteVpnStack-Sydney |
| Melbourne | PiHoleCdkStack-Melbourne | SiteToSiteVpnStack-Melbourne | TgwWithSiteToSiteVpnStack-Melbourne |

### Resource Names

All resources include region identifiers:

| Resource Type | Naming Pattern | Frankfurt Example |
|---------------|----------------|-------------------|
| Secret | pihole-pwd-{region} | pihole-pwd-eu-central-1 |
| EFS | pihole-fs-{region} | pihole-fs-eu-central-1 |
| NLB | pihole-{region} | pihole-eu-central-1 |
| Prefix List | RFC1918-{region} | RFC1918-eu-central-1 |
| Transit Gateway | pihole-tgw-{region} | pihole-tgw-eu-central-1 |
| VPN Connection | pihole-vpn-{region} | pihole-vpn-eu-central-1 |

### Instance Configuration

#### ARM64 (Graviton) Instances

**Regions**: Frankfurt, Sydney  
**Instance Type**: `t4g.small`  
**AMI**: Ubuntu 22.04 LTS ARM64 (via SSM parameter)  
**Cost**: ~€13-15/month

**Characteristics**:
- Better price/performance ratio
- Lower power consumption
- Modern architecture
- Recommended for production

#### x86 (Intel) Instances

**Regions**: Melbourne (automatic), or any region with `use_intel: true`  
**Instance Type**: `t3.small`  
**AMI**: Ubuntu 22.04 LTS x86_64 (via SSM parameter)  
**Cost**: ~€16-18/month

**Characteristics**:
- Broader software compatibility
- Traditional architecture
- Slightly higher cost
- Used when Graviton unavailable

### Network Load Balancer Configuration

**Type**: Internal Network Load Balancer  
**Protocol**: TCP and UDP  
**Ports**: 53 (DNS)  
**Health Check**: TCP on port 53  
**Cross-Zone Load Balancing**: Enabled

### EFS Configuration

**Performance Mode**: General Purpose  
**Throughput Mode**: Bursting  
**Encryption**: Enabled (AWS managed key)  
**Lifecycle Policy**: None (configurable)  
**Backup**: Recommended via AWS Backup

### Security Group Configuration

**Inbound Rules** (automatically configured):
- DNS (UDP/53) from RFC1918 ranges
- DNS (TCP/53) from RFC1918 ranges
- HTTP (TCP/80) from your local IP (if VPN or public_http enabled)
- SSH (TCP/22) from VPC (via SSM Session Manager)

**Outbound Rules**:
- All traffic to 0.0.0.0/0 (for updates and DNS queries)

## Environment Variables

### AWS Configuration

```bash
# AWS Region
export AWS_DEFAULT_REGION=eu-central-1

# AWS Profile (if using named profiles)
export AWS_PROFILE=my-profile

# AWS Account ID (optional, auto-detected)
export CDK_DEFAULT_ACCOUNT=123456789012

# AWS Region for CDK (optional)
export CDK_DEFAULT_REGION=eu-central-1
```

### Deployment Variables

```bash
# Your external IP
export MY_EXTERNAL_IP=$(curl -s ifconfig.me)

# Your internal CIDR
export MY_INTERNAL_CIDR="192.168.0.0/16"

# VPC name
export VPC_NAME="frankfurt-vpc"

# Key pair name
export KEY_PAIR="frankfurt-key"
```

### Using Environment Variables in Deployment

```bash
# Load environment variables
source deployment.env

# Deploy using variables
cdk deploy \
  -c local_ip=$MY_EXTERNAL_IP \
  -c local_internal_cidr=$MY_INTERNAL_CIDR \
  -c vpc_name=$VPC_NAME \
  -c keypair=$KEY_PAIR \
  -c deployment_regions='["eu-central-1"]' \
  --all
```

## Configuration Examples

### Example 1: Complete cdk.context.json for Frankfurt

```json
{
  "local_ip": "203.123.45.67",
  "local_internal_cidr": "192.168.0.0/16",
  "deployment_regions": ["eu-central-1"],
  "region_configs": {
    "eu-central-1": {
      "vpc_name": "frankfurt-production-vpc",
      "keypair": "frankfurt-production-key"
    }
  },
  "public_http": false,
  "usePrefixLists": true
}
```

### Example 2: Multi-Region cdk.context.json

```json
{
  "local_ip": "203.123.45.67",
  "local_internal_cidr": "10.0.0.0/8",
  "deployment_regions": [
    "ap-southeast-2",
    "ap-southeast-4",
    "eu-central-1"
  ],
  "region_configs": {
    "ap-southeast-2": {
      "vpc_name": "sydney-prod-vpc",
      "keypair": "sydney-prod-key"
    },
    "ap-southeast-4": {
      "vpc_name": "melbourne-prod-vpc",
      "keypair": "melbourne-prod-key"
    },
    "eu-central-1": {
      "vpc_name": "frankfurt-prod-vpc",
      "keypair": "frankfurt-prod-key"
    }
  },
  "public_http": false,
  "usePrefixLists": true
}
```

### Example 3: Development Configuration

```json
{
  "local_ip": "203.123.45.67",
  "local_internal_cidr": "192.168.0.0/16",
  "deployment_regions": ["eu-central-1"],
  "vpc_name": "frankfurt-dev-vpc",
  "keypair": "frankfurt-dev-key",
  "public_http": true,
  "usePrefixLists": true
}
```

### Example 4: Bash Script with Configuration

```bash
#!/bin/bash
# deploy-frankfurt.sh

set -e

# Configuration
LOCAL_IP=$(curl -s ifconfig.me)
LOCAL_CIDR="192.168.0.0/16"
REGION="eu-central-1"
VPC_NAME="frankfurt-vpc"
KEY_PAIR="frankfurt-key"

# Validation
if [[ -z "$LOCAL_IP" ]]; then
    echo "Error: Could not determine external IP"
    exit 1
fi

# Deploy
echo "Deploying Pi-hole to Frankfurt..."
echo "External IP: $LOCAL_IP"
echo "Internal CIDR: $LOCAL_CIDR"
echo "VPC: $VPC_NAME"
echo "Key Pair: $KEY_PAIR"

cdk deploy \
  -c local_ip=$LOCAL_IP \
  -c local_internal_cidr=$LOCAL_CIDR \
  -c deployment_regions="[\"$REGION\"]" \
  -c vpc_name=$VPC_NAME \
  -c keypair=$KEY_PAIR \
  --all

echo "Deployment complete!"
echo ""
echo "Retrieve admin password with:"
echo "aws secretsmanager get-secret-value \\"
echo "  --secret-id pihole-pwd-$REGION \\"
echo "  --region $REGION \\"
echo "  --query SecretString --output text"
```

### Example 5: Environment File (.env)

Create a `.env` file (add to .gitignore!):

```bash
# .env - Frankfurt Deployment Configuration
MY_IP=203.123.45.67
MY_CIDR=192.168.0.0/16
DEPLOYMENT_REGIONS=["eu-central-1"]
VPC_NAME=frankfurt-vpc
KEY_PAIR=frankfurt-key
PUBLIC_HTTP=false
```

Load and use:
```bash
# Load environment
export $(cat .env | grep -v '^#' | xargs)

# Deploy
cdk deploy \
  -c local_ip=$MY_IP \
  -c local_internal_cidr=$MY_CIDR \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=$VPC_NAME \
  -c keypair=$KEY_PAIR \
  --all
```

## Configuration Validation

### Pre-Deployment Validation Script

```bash
#!/bin/bash
# validate-config.sh

echo "Validating configuration..."

# Check required parameters
if [[ -z "$LOCAL_IP" ]]; then
    echo "❌ LOCAL_IP not set"
    exit 1
fi
echo "✅ LOCAL_IP: $LOCAL_IP"

# Validate IP format
if ! [[ $LOCAL_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo "❌ Invalid IP format"
    exit 1
fi
echo "✅ IP format valid"

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo "❌ AWS credentials not configured"
    exit 1
fi
echo "✅ AWS credentials valid"

# Check VPC exists
if ! aws ec2 describe-vpcs \
    --filters "Name=tag:Name,Values=$VPC_NAME" \
    --region $REGION \
    --query 'Vpcs[0].VpcId' \
    --output text &>/dev/null; then
    echo "⚠️  Warning: VPC '$VPC_NAME' not found in $REGION"
fi

# Check key pair exists
if ! aws ec2 describe-key-pairs \
    --key-names $KEY_PAIR \
    --region $REGION &>/dev/null; then
    echo "⚠️  Warning: Key pair '$KEY_PAIR' not found in $REGION"
fi

echo "Configuration validation complete!"
```

## Best Practices

### Configuration Management

1. **Use Context Files for Production**: Store configurations in `cdk.context.json`
2. **Use Environment Variables for Secrets**: Never commit sensitive data
3. **Version Control Configurations**: Track configuration changes in git
4. **Separate Dev/Prod Configs**: Use different context files for environments
5. **Document Custom Settings**: Add comments explaining non-standard configurations

### Security

1. **Never Commit IPs**: Use environment variables or parameters
2. **Rotate Secrets Regularly**: Update Pi-hole passwords periodically
3. **Minimize Public Access**: Keep `public_http` disabled when possible
4. **Use IAM Roles**: Prefer roles over access keys where possible
5. **Review Security Groups**: Regularly audit security group rules

### Cost Optimization

1. **Use Graviton**: Prefer ARM64 instances where available (Frankfurt, Sydney)
2. **Right-size Resources**: Start with t4g.small, scale if needed
3. **Clean Up Unused Resources**: Destroy stacks not in use
4. **Monitor Costs**: Set up AWS Cost Alerts
5. **Use Reserved Instances**: For long-term deployments

---

## Quick Reference Card

```
REQUIRED PARAMETERS:
  -c local_ip=<IP>                    Your external IP
  -c local_internal_cidr=<CIDR>       Your internal network

OPTIONAL PARAMETERS:
  -c deployment_regions='[regions]'    Target regions (JSON array)
  -c vpc_name=<name>                  Default VPC name
  -c keypair=<name>                   Default key pair (default: pihole)
  -c public_http=<true|false>         Enable public ALB (default: false)
  -c usePrefixLists=<true|false>      Use prefix lists (default: true)
  -c region_configs='{...}'           Region-specific overrides (JSON)

FRANKFURT SPECIFICS:
  Region Code: eu-central-1
  Default Instance: t4g.small (ARM64)
  Stack Suffix: Frankfurt
  Resource Suffix: eu-central-1
```