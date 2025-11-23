# Pi-hole CDK Multi-Region Troubleshooting Guide

This comprehensive troubleshooting guide addresses common issues encountered during multi-region Pi-hole deployments, with special focus on Frankfurt region deployments and cross-region scenarios.

## 🚨 Pre-Deployment Issues

### CDK Bootstrap Problems

#### Issue: CDK Not Bootstrapped in Target Region

**Error Messages**:
```
This stack uses assets, so the toolkit stack must be deployed to the environment (Run "cdk bootstrap aws://account/region")
```

**Solution**:
```bash
# Bootstrap specific region
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/eu-central-1

# Bootstrap all target regions
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/ap-southeast-2
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/ap-southeast-4
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/eu-central-1
```

**Prevention**:
- Always bootstrap CDK before first deployment to any region
- Include bootstrap step in your deployment automation

#### Issue: CDK Version Mismatch

**Error Messages**:
```
This CDK CLI is not compatible with the CDK library used by your application
```

**Solution**:
```bash
# Check versions
cdk --version
npm list aws-cdk-lib

# Update CDK CLI
npm install -g aws-cdk@latest

# Update project dependencies
npm update aws-cdk-lib
```

### AWS Credentials and Permissions

#### Issue: Insufficient IAM Permissions

**Error Messages**:
```
User: arn:aws:iam::ACCOUNT:user/USER is not authorized to perform: ec2:CreateVpc
```

**Solution**: Ensure your IAM user/role has the following permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:*",
                "efs:*",
                "elasticloadbalancing:*",
                "secretsmanager:*",
                "ssm:*",
                "iam:*",
                "cloudformation:*",
                "logs:*"
            ],
            "Resource": "*"
        }
    ]
}
```

#### Issue: Wrong AWS Region Configuration

**Error Messages**:
```
Could not find any resources in this account/region
```

**Solution**:
```bash
# Check current region
aws configure get region
echo $AWS_DEFAULT_REGION

# Set region for session
export AWS_DEFAULT_REGION=eu-central-1

# Or use specific region in commands
aws ec2 describe-vpcs --region eu-central-1
```

## 🌐 VPC and Network Issues

### VPC Discovery Problems

#### Issue: VPC Not Found in Target Region

**Error Messages**:
```
Cannot find VPC with name 'vpc-name' in region eu-central-1
```

**Diagnostic Steps**:
```bash
# List all VPCs in the region
aws ec2 describe-vpcs \
  --region eu-central-1 \
  --query 'Vpcs[*].[VpcId,Tags[?Key==`Name`].Value|[0],State]' \
  --output table

# Check if VPC exists but with different name
aws ec2 describe-vpcs \
  --region eu-central-1 \
  --filters "Name=state,Values=available"
```

**Solutions**:

1. **Use correct VPC name**:
   ```bash
   # Find the exact name (case-sensitive)
   aws ec2 describe-vpcs \
     --region eu-central-1 \
     --query 'Vpcs[*].Tags[?Key==`Name`].Value|[0]'
   ```

2. **Use VPC ID instead of name**:
   ```bash
   cdk deploy -c vpc_name=vpc-1234567890abcdef0 ...
   ```

3. **Create new VPC if needed**:
   ```bash
   aws ec2 create-vpc \
     --cidr-block 10.0.0.0/16 \
     --region eu-central-1 \
     --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=frankfurt-vpc}]'
   ```

#### Issue: VPC Lacks Required Resources

**Error Messages**:
```
No subnets found in VPC vpc-xxx for availability zones eu-central-1a, eu-central-1b
```

**Solution**: Ensure VPC has proper subnets:
```bash
# Check existing subnets
aws ec2 describe-subnets \
  --region eu-central-1 \
  --filters "Name=vpc-id,Values=vpc-your-vpc-id" \
  --query 'Subnets[*].[SubnetId,AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]' \
  --output table

# Create subnets if missing (example)
aws ec2 create-subnet \
  --vpc-id vpc-your-vpc-id \
  --cidr-block 10.0.1.0/24 \
  --availability-zone eu-central-1a \
  --region eu-central-1
```

### Security Group and Networking

#### Issue: Security Group Rules Conflict

**Error Messages**:
```
InvalidGroup.Duplicate: The security group 'sg-xxx' already exists
```

**Solution**:
```bash
# Clear CDK context cache
cdk context --clear

# Redeploy with fresh context
cdk deploy --all
```

#### Issue: Prefix List Unavailable

**Error Messages**:
```
The prefix list pl-xxx does not exist
```

**Solution**: Disable prefix lists if causing issues:
```bash
cdk deploy -c usePrefixLists=false ...
```

## 🔑 Key Pair and SSH Issues

### Key Pair Problems

#### Issue: Key Pair Not Found in Region

**Error Messages**:
```
InvalidKeyPair.NotFound: The key pair 'your-key' does not exist
```

**Solutions**:

1. **List existing key pairs**:
   ```bash
   aws ec2 describe-key-pairs --region eu-central-1
   ```

2. **Create new key pair**:
   ```bash
   aws ec2 create-key-pair \
     --key-name frankfurt-pihole \
     --region eu-central-1 \
     --query 'KeyMaterial' \
     --output text > ~/.ssh/frankfurt-pihole.pem
   chmod 400 ~/.ssh/frankfurt-pihole.pem
   ```

3. **Import existing public key**:
   ```bash
   aws ec2 import-key-pair \
     --key-name imported-key \
     --public-key-material fileb://~/.ssh/id_rsa.pub \
     --region eu-central-1
   ```

## 💾 Instance and Capacity Issues

### EC2 Instance Problems

#### Issue: Insufficient Capacity

**Error Messages**:
```
We currently do not have sufficient t4g.small capacity in the Availability Zone
```

**Solutions**:

1. **Use Intel instances instead of ARM**:
   ```bash
   cdk deploy \
     -c region_configs='{"eu-central-1": {"use_intel": true}}' \
     [other parameters...]
   ```

2. **Try different instance type**:
   ```bash
   # Modify the stack to use t3.medium instead of t4g.small
   ```

3. **Wait and retry** (capacity often becomes available later)

#### Issue: Instance Launch Failures

**Error Messages**:
```
The instance failed to start due to insufficient capacity
```

**Diagnostic Steps**:
```bash
# Check Auto Scaling Group events
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name pihole-asg-eu-central-1 \
  --region eu-central-1

# Check EC2 instance status
aws ec2 describe-instances \
  --region eu-central-1 \
  --filters "Name=tag:Name,Values=*pihole*"
```

**Solutions**:
1. Wait for capacity to become available
2. Change availability zones in VPC configuration
3. Use different instance type

## 🔐 Secrets Manager Issues

### Secret Access Problems

#### Issue: Secret Already Exists

**Error Messages**:
```
InvalidRequestException: The secret pihole-pwd-eu-central-1 already exists
```

**Solutions**:

1. **Use existing secret** (if from previous deployment):
   ```bash
   # Check if secret exists and is valid
   aws secretsmanager describe-secret \
     --secret-id pihole-pwd-eu-central-1 \
     --region eu-central-1
   ```

2. **Delete existing secret** (if safe to do so):
   ```bash
   aws secretsmanager delete-secret \
     --secret-id pihole-pwd-eu-central-1 \
     --region eu-central-1 \
     --force-delete-without-recovery
   ```

3. **Update stack to import existing secret**

#### Issue: Cannot Retrieve Secret Value

**Error Messages**:
```
AccessDeniedException: User is not authorized to perform: secretsmanager:GetSecretValue
```

**Solution**: Add IAM permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": "arn:aws:secretsmanager:*:*:secret:pihole-pwd-*"
        }
    ]
}
```

## 🌍 Multi-Region Deployment Issues

### Region Configuration Problems

#### Issue: Invalid Region Configuration

**Error Messages**:
```
Invalid region code: eu-central-1a
```

**Solution**: Use correct region codes:
```bash
# Correct region codes
-c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]'

# Not availability zones
-c deployment_regions='["ap-southeast-2a","ap-southeast-4b","eu-central-1c"]'  # WRONG
```

#### Issue: Region-Specific Resource Conflicts

**Error Messages**:
```
Stack PiHoleCdkStack-Frankfurt already exists
```

**Solutions**:

1. **Update existing stack**:
   ```bash
   cdk deploy PiHoleCdkStack-Frankfurt
   ```

2. **Delete and recreate**:
   ```bash
   cdk destroy PiHoleCdkStack-Frankfurt
   cdk deploy PiHoleCdkStack-Frankfurt
   ```

3. **Use different stack names** for different environments

### Context Configuration Issues

#### Issue: Invalid JSON in Context Parameters

**Error Messages**:
```
SyntaxError: Unexpected token in JSON
```

**Solution**: Validate JSON syntax:
```bash
# Test JSON validity
echo '{"eu-central-1": {"vpc_name": "test"}}' | jq .

# Use proper escaping in shell
cdk deploy -c region_configs='{"eu-central-1":{"vpc_name":"test"}}'
```

## 🔗 VPN and Connectivity Issues

### Site-to-Site VPN Problems

#### Issue: VPN Tunnel Not Establishing

**Diagnostic Steps**:
```bash
# Check VPN connection status
aws ec2 describe-vpn-connections \
  --region eu-central-1 \
  --filters "Name=tag:Name,Values=*pihole*"

# Check tunnel status
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/vpn/" \
  --region eu-central-1
```

**Common Solutions**:
1. Verify on-premises firewall allows IPSec traffic (UDP 500, 4500)
2. Check pre-shared keys match exactly
3. Verify BGP configuration if using dynamic routing
4. Ensure on-premises public IP is correct

#### Issue: Cannot Access Pi-hole After VPN Setup

**Diagnostic Steps**:
```bash
# Test VPN connectivity
ping pi.hole

# Check DNS resolution
nslookup pi.hole

# Test specific IP
ping [dns1-ip-from-output]
```

**Solutions**:
1. Configure on-premises DNS to use Pi-hole IPs
2. Check routing tables on both sides
3. Verify security group rules allow DNS traffic

## 📊 Monitoring and Logging Issues

### CloudWatch Problems

#### Issue: No Logs Appearing

**Diagnostic Steps**:
```bash
# Check if log groups exist
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/ec2/pihole" \
  --region eu-central-1

# Check EC2 instance logs
aws ssm start-session \
  --target i-1234567890abcdef0 \
  --region eu-central-1
```

**Solutions**:
1. Ensure CloudWatch agent is installed and configured
2. Check IAM permissions for CloudWatch
3. Verify log group configuration

### Health Check Failures

#### Issue: Load Balancer Health Checks Failing

**Diagnostic Steps**:
```bash
# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --region eu-central-1

# Check security group rules
aws ec2 describe-security-groups \
  --region eu-central-1 \
  --filters "Name=tag:Name,Values=*pihole*"
```

**Solutions**:
1. Verify Pi-hole service is running on instances
2. Check security group allows health check traffic
3. Ensure instances are in correct subnets

## 🛠️ General Troubleshooting Tools

### CDK Debugging Commands

```bash
# Show what CDK will deploy
cdk synth

# Show differences before deployment
cdk diff

# List all stacks
cdk list

# Show detailed stack information
cdk context

# Clear cached context
cdk context --clear
```

### AWS CLI Debugging

```bash
# Enable debug output
aws configure set cli_follow_jumps false
aws configure set max_attempts 1
aws configure set cli_debug_log true

# Check credentials
aws sts get-caller-identity

# Test region connectivity
aws ec2 describe-regions --region eu-central-1
```

### Network Connectivity Testing

```bash
# Test from local machine
ping [dns-endpoint-ip]
nslookup google.com [dns-endpoint-ip]
dig @[dns-endpoint-ip] google.com

# Test from within AWS
aws ssm start-session --target [instance-id] --region eu-central-1
# Then inside the session:
systemctl status pihole-FTL
tail -f /var/log/pihole.log
```

## 🆘 Emergency Procedures

### Complete Deployment Failure Recovery

1. **Save Configuration**:
   ```bash
   # Export current context
   cdk context --json > context-backup.json
   ```

2. **Clean Slate Recovery**:
   ```bash
   # Clear all context
   cdk context --clear
   
   # Destroy failed stacks
   cdk destroy --all
   
   # Redeploy from scratch
   cdk deploy --all
   ```

3. **Partial Recovery** (if some stacks are working):
   ```bash
   # Destroy only problem stacks
   cdk destroy PiHoleCdkStack-Frankfurt
   
   # Redeploy specific stack
   cdk deploy PiHoleCdkStack-Frankfurt
   ```

### Data Recovery

If you need to recover Pi-hole configuration:

1. **From EFS backup** (if configured):
   ```bash
   # Mount EFS from another instance
   # Copy configuration files
   ```

2. **From Pi-hole teleporter export** (if available):
   - Access working Pi-hole admin interface
   - Settings → Teleporter → Import

## 📞 Getting Additional Help

### Information to Gather Before Seeking Help

1. **Error Messages**: Full error text from CDK and AWS CLI
2. **CDK Version**: `cdk --version`
3. **AWS CLI Version**: `aws --version`
4. **Region**: Which region(s) you're deploying to
5. **Context Configuration**: Your `cdk.context.json` or command-line parameters
6. **Stack Names**: Which stacks are affected
7. **Timeline**: When the issue started occurring

### Support Channels

- **AWS Support**: For infrastructure and service issues
- **CDK GitHub Issues**: For CDK-specific bugs
- **Pi-hole Community**: For Pi-hole configuration questions
- **Repository Issues**: For deployment script problems

### Self-Help Resources

- [AWS CDK Troubleshooting Guide](https://docs.aws.amazon.com/cdk/latest/guide/troubleshooting.html)
- [AWS CloudFormation Troubleshooting](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/troubleshooting.html)
- [Pi-hole Documentation](https://docs.pi-hole.net/)

---

## 🎯 Quick Reference Checklist

When troubleshooting, check these items first:

- [ ] CDK bootstrapped in target region
- [ ] Correct AWS credentials and region configured
- [ ] VPC exists and has proper subnets
- [ ] Key pair exists in target region
- [ ] IAM permissions are sufficient
- [ ] Context parameters are valid JSON
- [ ] Region codes are correct (not AZ names)
- [ ] No naming conflicts with existing resources
- [ ] Network connectivity allows required traffic

This checklist resolves 90% of common deployment issues.