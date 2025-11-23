# Frankfurt Region Pi-hole Deployment Guide

This guide provides focused, step-by-step instructions for deploying Pi-hole infrastructure to the Frankfurt (eu-central-1) region, either as a standalone deployment or as an addition to existing Sydney/Melbourne deployments.

## 🚀 Quick Start

### Prerequisites Checklist

- [ ] AWS CLI configured with appropriate credentials
- [ ] CDK bootstrapped in Frankfurt region: `cdk bootstrap aws://ACCOUNT-ID/eu-central-1`
- [ ] VPC available in Frankfurt region with internet access
- [ ] SSH key pair created in Frankfurt region
- [ ] Your external IP address determined
- [ ] Your internal network CIDR range identified

### Option 1: Frankfurt Only (Recommended for New Users)

Deploy Pi-hole to Frankfurt region only:

```bash
cd pi-hole-cdk

# Quick deployment with minimal configuration
cdk deploy \
  -c local_ip=$(curl -s ifconfig.me) \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=YOUR_VPC_NAME \
  -c keypair=YOUR_KEYPAIR_NAME \
  --all
```

### Option 2: Using the Deployment Script

```bash
# Create and deploy to Frankfurt
./deploy-multi-region.sh \
  --local-ip $(curl -s ifconfig.me) \
  --regions eu-central-1 \
  --frankfurt-vpc YOUR_VPC_NAME \
  --frankfurt-keypair YOUR_KEYPAIR_NAME
```

## 📋 Detailed Setup Process

### Step 1: AWS Infrastructure Preparation

#### 1.1 Create VPC (if needed)

If you don't have a suitable VPC in Frankfurt:

```bash
# Create VPC using AWS CLI
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --region eu-central-1 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=frankfurt-pihole-vpc}]'

# Note the VPC ID from the output for subnet creation
```

#### 1.2 Create SSH Key Pair

```bash
# Create key pair for Frankfurt region
aws ec2 create-key-pair \
  --key-name frankfurt-pihole-key \
  --region eu-central-1 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/frankfurt-pihole-key.pem

# Set appropriate permissions
chmod 400 ~/.ssh/frankfurt-pihole-key.pem
```

#### 1.3 Determine Your IP Address

```bash
# Get your external IP
curl -s ifconfig.me
# Or use: curl -s https://checkip.amazonaws.com
```

### Step 2: CDK Bootstrap (One-time setup)

```bash
# Bootstrap CDK in Frankfurt region
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/eu-central-1
```

### Step 3: Deploy Pi-hole Infrastructure

#### 3.1 Basic Frankfurt Deployment

```bash
cdk deploy \
  -c local_ip=YOUR_EXTERNAL_IP \
  -c local_internal_cidr=YOUR_INTERNAL_CIDR \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-pihole-vpc \
  -c keypair=frankfurt-pihole-key \
  --all
```

#### 3.2 Frankfurt with Temporary Public Access

If you need temporary web interface access before VPN setup:

```bash
cdk deploy \
  -c local_ip=YOUR_EXTERNAL_IP \
  -c local_internal_cidr=YOUR_INTERNAL_CIDR \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-pihole-vpc \
  -c keypair=frankfurt-pihole-key \
  -c public_http=true \
  --all
```

**⚠️ Security Note**: Disable public HTTP access after VPN configuration by redeploying with `public_http=false`.

### Step 4: Post-Deployment Configuration

#### 4.1 Retrieve Admin Password

```bash
# Get Pi-hole admin password from AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id pihole-pwd-eu-central-1 \
  --region eu-central-1 \
  --query SecretString \
  --output text
```

#### 4.2 Configure Site-to-Site VPN

1. **Navigate to AWS Console**: VPC → Site-to-Site VPN Connections
2. **Select Frankfurt region**
3. **Find your VPN connection**: Named `pihole-vpn-eu-central-1`
4. **Download configuration** for your router/firewall brand
5. **Configure your on-premises device** using the downloaded config

#### 4.3 Configure DNS Settings

After VPN is established:

1. **Get DNS endpoint IPs** from CDK output (dns1 and dns2)
2. **Configure your router's DHCP settings** to use these DNS servers:
   - Primary DNS: [dns1 IP from CDK output]
   - Secondary DNS: [dns2 IP from CDK output]
3. **Test DNS resolution**: `nslookup google.com [dns1-ip]`

#### 4.4 Access Pi-hole Admin Interface

**Via VPN (Recommended)**:
```
http://pi.hole/admin
```

**Via Public ALB (if enabled)**:
URL provided in CDK output as `admin-public-url`

## 🔧 Configuration Examples

### Example 1: Minimal Frankfurt Deployment

```bash
# Set variables for easy reuse
export MY_IP=$(curl -s ifconfig.me)
export MY_CIDR="192.168.0.0/16"
export VPC_NAME="default-vpc"  # or your VPC name
export KEY_NAME="my-key"       # your key pair name

# Deploy
cdk deploy \
  -c local_ip=$MY_IP \
  -c local_internal_cidr=$MY_CIDR \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=$VPC_NAME \
  -c keypair=$KEY_NAME \
  --all
```

### Example 2: Frankfurt + Public HTTP Access

```bash
./deploy-multi-region.sh \
  --local-ip $(curl -s ifconfig.me) \
  --regions eu-central-1 \
  --frankfurt-vpc my-vpc \
  --frankfurt-keypair my-key \
  --public-http
```

### Example 3: Adding Frankfurt to Existing Multi-Region Setup

```bash
cdk deploy \
  -c local_ip=$(curl -s ifconfig.me) \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c region_configs='{
    "ap-southeast-2": {"vpc_name": "sydney-vpc", "keypair": "sydney-key"},
    "ap-southeast-4": {"vpc_name": "melbourne-vpc", "keypair": "melbourne-key"},
    "eu-central-1": {"vpc_name": "frankfurt-vpc", "keypair": "frankfurt-key"}
  }' \
  --all
```

## 🐛 Frankfurt-Specific Troubleshooting

### Issue: VPC Not Found in Frankfurt

**Error**: `Cannot find VPC with name 'your-vpc-name' in region eu-central-1`

**Solutions**:
1. **Verify VPC exists**:
   ```bash
   aws ec2 describe-vpcs \
     --region eu-central-1 \
     --filters "Name=tag:Name,Values=your-vpc-name"
   ```

2. **List all VPCs in Frankfurt**:
   ```bash
   aws ec2 describe-vpcs \
     --region eu-central-1 \
     --query 'Vpcs[*].[VpcId,Tags[?Key==`Name`].Value|[0]]' \
     --output table
   ```

3. **Use VPC ID instead of name**:
   ```bash
   # If your VPC doesn't have a Name tag, use VPC ID
   cdk deploy -c vpc_name=vpc-1234567890abcdef0 ...
   ```

### Issue: Key Pair Not Found

**Error**: `KeyPair 'your-key-name' does not exist in region eu-central-1`

**Solution**:
```bash
# List existing key pairs in Frankfurt
aws ec2 describe-key-pairs --region eu-central-1

# Create new key pair if needed
aws ec2 create-key-pair \
  --key-name frankfurt-pihole \
  --region eu-central-1 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/frankfurt-pihole.pem
```

### Issue: Insufficient t4g.small Capacity

**Error**: `We currently do not have sufficient t4g.small capacity`

**Solution**: Force Intel architecture:
```bash
cdk deploy \
  -c region_configs='{"eu-central-1": {"use_intel": true}}' \
  [other parameters...]
```

### Issue: Access Denied for Secrets Manager

**Error**: `User: arn:aws:iam::ACCOUNT:user/USER is not authorized to perform: secretsmanager:GetSecretValue`

**Solution**: Add IAM permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": "arn:aws:secretsmanager:eu-central-1:*:secret:pihole-pwd-eu-central-1-*"
        }
    ]
}
```

## 🔒 Frankfurt-Specific Security Considerations

### Network Security
- Pi-hole instances deployed in private subnets only
- Network Load Balancer provides internal DNS endpoint
- VPN required for admin interface access (recommended)
- Security groups restricted to your IP and internal networks

### Data Protection
- Admin password stored in AWS Secrets Manager
- EFS volumes encrypted at rest using AWS managed keys
- CloudWatch logs encrypted in transit and at rest

### GDPR Compliance
Since Frankfurt is in the EU, consider:
- Data processing within EU region
- Log retention policies
- User privacy for DNS queries
- Compliance with local data protection requirements

## 💰 Frankfurt Region Costs

### Estimated Monthly Costs (EUR)

| Service | Resource | Monthly Cost (EUR) |
|---------|----------|-------------------|
| EC2 | 1x t4g.small (ARM) | ~€13 |
| EFS | 1GB storage | ~€0.25 |
| NLB | Load balancer | ~€17 |
| Secrets Manager | 1 secret | ~€0.35 |
| VPN | Site-to-Site | ~€31 |
| Data Transfer | Variable | Variable |

**Total estimated**: ~€60-65 EUR/month

### Cost Optimization Tips
1. Use ARM64 instances (t4g.small) - 20% cheaper than Intel
2. Disable public HTTP ALB after VPN setup
3. Set appropriate EFS lifecycle policies
4. Monitor CloudWatch logs retention
5. Use VPC endpoints to reduce data transfer costs

## 🚀 Advanced Frankfurt Configurations

### Using CDK Context File

Create `cdk.context.json`:
```json
{
  "local_ip": "203.123.45.67",
  "local_internal_cidr": "192.168.0.0/16",
  "deployment_regions": ["eu-central-1"],
  "region_configs": {
    "eu-central-1": {
      "vpc_name": "frankfurt-prod-vpc",
      "keypair": "frankfurt-ops-key"
    }
  },
  "public_http": false
}
```

Then deploy with: `cdk deploy --all`

### Frankfurt with Transit Gateway

For advanced networking scenarios:

```bash
# Deploy with Transit Gateway support
cdk deploy \
  -c local_ip=YOUR_IP \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-key \
  TgwWithSiteToSiteVpnStack-Frankfurt
```

### Monitoring Frankfurt Deployment

Set up CloudWatch alarms:

```bash
# Example: Monitor EC2 instance health
aws cloudwatch put-metric-alarm \
  --alarm-name "Frankfurt-PiHole-Health" \
  --alarm-description "Monitor Pi-hole EC2 health" \
  --metric-name StatusCheckFailed \
  --namespace AWS/EC2 \
  --statistic Maximum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --region eu-central-1
```

## 📞 Support and Next Steps

### After Successful Deployment

1. **Test DNS Resolution**: Verify Pi-hole is blocking ads
2. **Configure Blocklists**: Add additional blocklists via admin interface
3. **Set Up Monitoring**: Configure CloudWatch dashboards
4. **Backup Configuration**: Export Pi-hole settings regularly
5. **Document Your Setup**: Keep record of your specific configuration

### Getting Help

- **AWS Support**: For infrastructure issues
- **Pi-hole Community**: For Pi-hole configuration questions
- **Repository Issues**: For CDK-specific problems

### Useful Commands

```bash
# Check deployment status
cdk list

# View stack outputs
aws cloudformation describe-stacks \
  --stack-name PiHoleCdkStack-Frankfurt \
  --region eu-central-1 \
  --query 'Stacks[0].Outputs'

# Clean up (WARNING: Deletes all resources)
cdk destroy --all -c deployment_regions='["eu-central-1"]'
```

---

## 🎯 Success Checklist

After completing this guide, you should have:

- [ ] Pi-hole running in Frankfurt region (eu-central-1)
- [ ] Site-to-Site VPN connection configured
- [ ] DNS endpoints accessible from your network
- [ ] Admin interface accessible via VPN
- [ ] Pi-hole blocking advertisements and tracking
- [ ] Monitoring and alerting configured
- [ ] Backup procedures documented

**Congratulations!** Your Frankfurt Pi-hole deployment is now operational. 🎉