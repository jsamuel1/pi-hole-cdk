# Frankfurt Pi-hole Deployment Checklist

Use this checklist to ensure a successful Pi-hole deployment to the Frankfurt (eu-central-1) region.

## 📋 Pre-Deployment Checklist

### AWS Account Preparation

- [ ] **AWS CLI Installed and Configured**
  ```bash
  aws --version  # Should show version 2.x or later
  aws sts get-caller-identity  # Should return your account details
  ```

- [ ] **CDK Installed and Bootstrapped**
  ```bash
  cdk --version  # Should show version 2.x or later
  cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/eu-central-1
  ```

- [ ] **IAM Permissions Verified**
  - EC2 full access
  - EFS full access
  - Secrets Manager full access
  - VPC full access
  - CloudFormation full access
  - IAM permissions for resource creation

### Network Infrastructure

- [ ] **VPC Available in Frankfurt**
  ```bash
  aws ec2 describe-vpcs \
    --region eu-central-1 \
    --query 'Vpcs[*].[VpcId,Tags[?Key==`Name`].Value|[0]]' \
    --output table
  ```

- [ ] **VPC has Required Subnets**
  - [ ] At least 2 private subnets in different AZs
  - [ ] Internet access via NAT Gateway or similar
  - [ ] Public subnets if planning to use Site-to-Site VPN

- [ ] **SSH Key Pair Created**
  ```bash
  aws ec2 describe-key-pairs --region eu-central-1
  # Or create new:
  # aws ec2 create-key-pair --key-name frankfurt-pihole --region eu-central-1
  ```

### Local Network Information

- [ ] **External IP Address Determined**
  ```bash
  curl -s ifconfig.me
  # Record this IP: ________________
  ```

- [ ] **Internal CIDR Range Known**
  - Common ranges: 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12
  - Your range: ________________

- [ ] **Router Information Available**
  - Router make/model: ________________
  - VPN configuration capability: Yes / No
  - Current DNS servers: ________________

## 🚀 Deployment Checklist

### Configuration Preparation

- [ ] **Variables Set**
  ```bash
  export MY_IP=YOUR_EXTERNAL_IP
  export MY_CIDR=YOUR_INTERNAL_CIDR  
  export VPC_NAME=YOUR_VPC_NAME
  export KEY_NAME=YOUR_KEY_PAIR_NAME
  ```

- [ ] **Deployment Command Prepared**
  ```bash
  cdk deploy \
    -c local_ip=$MY_IP \
    -c local_internal_cidr=$MY_CIDR \
    -c deployment_regions='["eu-central-1"]' \
    -c vpc_name=$VPC_NAME \
    -c keypair=$KEY_NAME \
    --all
  ```

### Deployment Execution

- [ ] **CDK Synth Successful**
  ```bash
  cdk synth  # Should complete without errors
  ```

- [ ] **Deployment Initiated**
  ```bash
  cdk deploy --all
  ```

- [ ] **Deployment Completed Successfully**
  - All stacks created: PiHoleCdkStack-Frankfurt, SiteToSiteVpnStack-Frankfurt, TgwWithSiteToSiteVpnStack-Frankfurt
  - No error messages in output
  - CDK outputs displayed

### Post-Deployment Verification

- [ ] **Stack Outputs Recorded**
  ```bash
  aws cloudformation describe-stacks \
    --stack-name PiHoleCdkStack-Frankfurt \
    --region eu-central-1 \
    --query 'Stacks[0].Outputs'
  ```
  
  Record these values:
  - dns1: ________________
  - dns2: ________________
  - admin-url (if public): ________________

- [ ] **Admin Password Retrieved**
  ```bash
  aws secretsmanager get-secret-value \
    --secret-id pihole-pwd-eu-central-1 \
    --region eu-central-1 \
    --query SecretString \
    --output text
  ```
  
  Password recorded safely: ________________

- [ ] **EC2 Instances Running**
  ```bash
  aws ec2 describe-instances \
    --region eu-central-1 \
    --filters "Name=tag:Name,Values=*pihole*" \
    --query 'Reservations[*].Instances[*].[InstanceId,State.Name]'
  ```

- [ ] **Load Balancer Healthy**
  ```bash
  aws elbv2 describe-target-health \
    --target-group-arn $(aws elbv2 describe-target-groups \
      --region eu-central-1 \
      --query 'TargetGroups[?contains(TargetGroupName,`pihole`)].TargetGroupArn' \
      --output text) \
    --region eu-central-1
  ```

## 🔗 VPN Configuration Checklist

### AWS Site-to-Site VPN Setup

- [ ] **VPN Connection Details Retrieved**
  ```bash
  aws ec2 describe-vpn-connections \
    --region eu-central-1 \
    --filters "Name=tag:Name,Values=*pihole*"
  ```

- [ ] **VPN Configuration Downloaded**
  - Log into AWS Console → VPC → Site-to-Site VPN
  - Select Frankfurt region
  - Download config for your router brand

- [ ] **Customer Gateway Information**
  - Your public IP: ________________
  - BGP ASN (if using dynamic routing): ________________

### Router Configuration

- [ ] **VPN Configuration Applied to Router**
  - IPSec tunnel 1 configured
  - IPSec tunnel 2 configured (for redundancy)
  - Pre-shared keys applied correctly

- [ ] **VPN Tunnel Status Verified**
  ```bash
  aws ec2 describe-vpn-connections \
    --region eu-central-1 \
    --query 'VpnConnections[*].VgwTelemetry[*].[StatusMessage,Status]'
  ```
  
  Both tunnels should show "UP" status

- [ ] **Routing Configured**
  - Static routes to AWS VPC CIDR
  - Or BGP routing if using dynamic routing
  - Route to 10.0.0.0/8 (or your VPC CIDR) via VPN

### DNS Configuration

- [ ] **Router DNS Settings Updated**
  - Primary DNS: [dns1 from CDK output]
  - Secondary DNS: [dns2 from CDK output]
  - DHCP DNS servers updated

- [ ] **DNS Resolution Tested**
  ```bash
  nslookup google.com [dns1-ip]
  nslookup pi.hole [dns1-ip]
  ```

- [ ] **Ad Blocking Verified**
  - Visit a site with ads (e.g., cnn.com)
  - Ads should be blocked
  - Pi-hole query log should show blocked queries

## 🛠️ Pi-hole Configuration Checklist

### Initial Access

- [ ] **Pi-hole Admin Interface Accessible**
  - Via VPN: http://pi.hole/admin
  - Via public ALB (if enabled): [URL from CDK output]

- [ ] **Login Successful**
  - Username: admin
  - Password: [from Secrets Manager]

- [ ] **Dashboard Loading Correctly**
  - Shows query statistics
  - Shows blocked domains count
  - No error messages

### Basic Configuration

- [ ] **Upstream DNS Servers Configured**
  - Default: Cloudflare (1.1.1.1, 1.0.0.1)
  - Or your preferred DNS servers
  - Test upstream connectivity

- [ ] **Blocklists Updated**
  - Default blocklists active
  - Additional blocklists added if desired
  - Gravity database updated

- [ ] **Local DNS Records Added** (if needed)
  - Local domain resolution
  - Custom DNS entries for internal services

### Advanced Configuration (Optional)

- [ ] **Conditional Forwarding Configured**
  - For local domain resolution
  - Forward local domain to local DNS server
  
  Settings → DNS → Conditional forwarding:
  - Reverse DNS: Yes
  - Local network CIDR: [your CIDR]
  - Target: [your local DNS server]
  - Domain: [your local domain]

- [ ] **DHCP Server Disabled/Configured**
  - Keep disabled if using router DHCP
  - Or configure Pi-hole as DHCP server

- [ ] **Query Logging Settings**
  - Set appropriate log retention
  - Configure privacy settings

## 🔍 Testing and Validation Checklist

### Network Connectivity Tests

- [ ] **Basic Connectivity**
  ```bash
  ping pi.hole  # Should resolve and respond
  ```

- [ ] **DNS Resolution Tests**
  ```bash
  nslookup google.com
  nslookup facebook.com
  nslookup ads.google.com  # Should be blocked/redirected
  ```

- [ ] **Ad Blocking Tests**
  - [ ] Visit ad-heavy websites
  - [ ] Check Pi-hole query log for blocked queries
  - [ ] Verify ads are not displaying

### Performance Tests

- [ ] **DNS Response Time**
  ```bash
  dig @[dns1-ip] google.com +stats
  # Query time should be < 50ms typically
  ```

- [ ] **Load Balancer Health**
  - Both EC2 instances should be healthy
  - DNS queries distributed between instances

- [ ] **VPN Performance**
  - Test internet speed through VPN
  - Should be reasonable (depends on connection)

### Monitoring Setup

- [ ] **CloudWatch Metrics Available**
  - EC2 instance metrics
  - Load balancer metrics
  - VPN connection metrics

- [ ] **Pi-hole Statistics Working**
  - Query over time graph
  - Top blocked domains
  - Top clients

- [ ] **Backup Strategy Implemented**
  - Pi-hole configuration export
  - EFS backup if needed
  - Document recovery procedure

## 🚨 Troubleshooting Checklist

If something doesn't work:

- [ ] **Check AWS Resources**
  ```bash
  # EC2 instances
  aws ec2 describe-instances --region eu-central-1 --filters "Name=tag:Name,Values=*pihole*"
  
  # Load balancer health
  aws elbv2 describe-target-health --target-group-arn [arn] --region eu-central-1
  
  # VPN status
  aws ec2 describe-vpn-connections --region eu-central-1
  ```

- [ ] **Check VPN Connectivity**
  - Router VPN status
  - AWS VPN tunnel status
  - Routing tables

- [ ] **Check DNS Configuration**
  - Router DNS settings
  - Device DNS settings
  - Pi-hole upstream DNS

- [ ] **Review Documentation**
  - [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
  - [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)

## ✅ Success Criteria

Your Frankfurt Pi-hole deployment is successful when:

- [ ] **Infrastructure is Running**
  - All CDK stacks deployed successfully
  - EC2 instances running and healthy
  - Load balancer passing health checks

- [ ] **VPN is Connected**
  - Both VPN tunnels show "UP" status
  - Can ping Pi-hole from local network
  - Routing is working correctly

- [ ] **DNS is Working**
  - DNS queries resolve correctly
  - Ad blocking is active
  - Pi-hole admin interface accessible

- [ ] **Monitoring is Active**
  - Pi-hole dashboard shows statistics
  - CloudWatch metrics are being collected
  - Backup procedures documented

## 📝 Deployment Record

**Deployment Information:**
- Date: ________________
- Deployer: ________________
- AWS Account: ________________
- VPC Used: ________________
- Key Pair: ________________
- External IP: ________________
- Internal CIDR: ________________

**Generated Resources:**
- DNS Endpoint 1: ________________
- DNS Endpoint 2: ________________
- Admin Password: ________________ (store securely!)
- VPN Connection ID: ________________

**Notes:**
```
_________________________________________________
_________________________________________________
_________________________________________________
```

---

## 🎯 Quick Commands Reference

```bash
# Get deployment status
cdk list --long

# View stack outputs
aws cloudformation describe-stacks --stack-name PiHoleCdkStack-Frankfurt --region eu-central-1 --query 'Stacks[0].Outputs'

# Check instance health
aws ec2 describe-instances --region eu-central-1 --filters "Name=tag:Name,Values=*pihole*" --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PrivateIpAddress]'

# Get admin password
aws secretsmanager get-secret-value --secret-id pihole-pwd-eu-central-1 --region eu-central-1 --query SecretString --output text

# Check VPN status
aws ec2 describe-vpn-connections --region eu-central-1 --query 'VpnConnections[*].VgwTelemetry[*].[StatusMessage,Status]'

# Test DNS
nslookup google.com [dns-ip]
```

**Congratulations on your successful Frankfurt Pi-hole deployment! 🎉**