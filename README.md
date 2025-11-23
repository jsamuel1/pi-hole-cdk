# Welcome to CDK PiHole Deployment

This CDK application deploys Pi-hole DNS infrastructure with optional Site-to-Site VPN and Transit Gateway configurations. It now supports multi-region deployments including Sydney (ap-southeast-2), Melbourne (ap-southeast-4), and Frankfurt (eu-central-1).

> 📚 **Complete Documentation**: See [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) for a comprehensive guide to all documentation.

## Prerequisites

* An existing VPC with internet access in each target region
* A named SSH keypair in each target region
* Your local router's external & internal IP addresses

## Single Region Deployment

To deploy to a single region, run:

```bash
cdk deploy -c local_ip=<local_ip> -c vpc_name=<vpcNAME> -c keypair=<keypairname> -c local_internal_cidr=<internalcidr/range> --all
```

Example:
```bash
cdk deploy -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16 --all
```

## Multi-Region Deployment

### Deploy to Multiple Regions

To deploy to multiple regions simultaneously, specify the `deployment_regions` context parameter:

```bash
cdk deploy -c local_ip=<local_ip> \
  -c local_internal_cidr=<internalcidr/range> \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c vpc_name=<default-vpc-name> \
  -c keypair=<default-keypair> \
  --all
```

Example:
```bash
cdk deploy -c local_ip=121.121.4.100 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c vpc_name=aws-controltower-VPC \
  -c keypair=pihole \
  --all
```

### Region-Specific Configuration

If you need different VPC names or keypairs per region, use the `region_configs` context parameter:

```bash
cdk deploy -c local_ip=121.121.4.100 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c region_configs='{
    "ap-southeast-2": {"vpc_name": "sydney-vpc", "keypair": "sydney-key"},
    "ap-southeast-4": {"vpc_name": "melbourne-vpc", "keypair": "melbourne-key", "use_intel": true},
    "eu-central-1": {"vpc_name": "frankfurt-vpc", "keypair": "frankfurt-key"}
  }' \
  --all
```

### Supported Regions

- **Sydney (ap-southeast-2)**: Uses ARM64/Graviton instances by default
- **Melbourne (ap-southeast-4)**: Uses Intel/x86 instances (Graviton not available)
- **Frankfurt (eu-central-1)**: Uses ARM64/Graviton instances by default

### Region-Specific Stack Names

Stacks are created with region-specific suffixes:
- `PiHoleCdkStack-Sydney` (ap-southeast-2)
- `PiHoleCdkStack-Melbourne` (ap-southeast-4)
- `PiHoleCdkStack-Frankfurt` (eu-central-1)

Similarly for VPN and TGW stacks:
- `SiteToSiteVpnStack-{Region}`
- `TgwWithSiteToSiteVpnStack-{Region}`

### Deploy to Specific Regions

To deploy only Frankfurt:
```bash
cdk deploy -c local_ip=121.121.4.100 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-key \
  PiHoleCdkStack-Frankfurt SiteToSiteVpnStack-Frankfurt TgwWithSiteToSiteVpnStack-Frankfurt
```

## Configuration Options

### Context Parameters

- **local_ip** (required): Your local router's external IP address
- **local_internal_cidr** (required): Your local internal network CIDR (e.g., 192.168.0.0/16)
- **deployment_regions** (optional): JSON array of AWS regions to deploy to
- **region_configs** (optional): JSON object with region-specific overrides
- **vpc_name** (optional): Default VPC name (can be overridden per region)
- **keypair** (optional): Default SSH keypair name (default: "pihole", can be overridden per region)
- **public_http** (optional): Enable public ALB for web interface (default: false)
- **usePrefixLists** (optional): Use prefix lists for security groups (default: true)

### Public HTTP Access

Add the optional context parameter `public_http=True` if you want to create an internet-facing Application Load Balancer for the web interface, locked down to your external local IP address. You may want to enable this during the setup phase until you have your VPN established, or if you have automation that needs to configure Pi-hole settings.

## Post-Deployment

This will deploy both a Site-to-Site VPN and the Pi-hole infrastructure. You should:

1. Configure your local router to establish the Site-to-Site VPN connection
2. Configure your router's DNS to use the IP addresses provided in the CDK outputs
3. The DNS endpoints are only accessible through the VPN or from within the VPC

## Conditional DNS Forwarding

Optionally, you may wish to set up a conditional forwarder back to your local DHCP server's DNS if you are not moving DHCP onto the Pi-hole.

Configure this from the Pi-hole web UI, or add the following variables to the Pi-hole `setupVars.conf` and reload the config:

```
REV_SERVER=true
REV_SERVER_CIDR=<your-local-cidr>
REV_SERVER_TARGET=<your-local-dns-server>
REV_SERVER_DOMAIN=<your-local-domain>
```

## UniFi-Specific Configuration

For UniFi devices, the UniFi dnsmasq is not configured to listen to the tunnel interface by default. See the notes in the `unifi-vpndns` folder for instructions to fix this before setting up conditional forwarding.

## Resource Naming

All resources are created with region-specific naming to support multi-region deployments:
- Secrets: `pihole-pwd-{region}`
- EFS: `pihole-fs-{region}`
- NLB: `pihole-{region}`
- Prefix Lists: `RFC1918-{region}`
- Transit Gateway: `pihole-tgw-{region}`
- VPN: `pihole-vpn-{region}`

## Architecture Notes

- **Sydney & Frankfurt**: ARM64-based instances (t4g.small) for cost optimization
- **Melbourne**: x86-based instances (t3.small) due to Graviton unavailability
- Ubuntu 22.04 LTS images are automatically fetched via SSM parameters
- Each region deployment is independent and isolated
- Auto-scaling groups provide high availability within each region

## 📚 Documentation

- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Comprehensive deployment guide with all scenarios
- **[FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)** - Frankfurt-specific quick start guide
- **[CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)** - Complete configuration options reference
- **[TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)** - Multi-region troubleshooting guide
- **[CHANGES.md](CHANGES.md)** - Summary of multi-region implementation changes

## 🚀 Quick Start

For new users deploying to Frankfurt only:

```bash
# Set your configuration
export MY_IP=$(curl -s ifconfig.me)
export VPC_NAME="your-vpc-name"
export KEY_NAME="your-key-name"

# Deploy to Frankfurt
cdk deploy \
  -c local_ip=$MY_IP \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=$VPC_NAME \
  -c keypair=$KEY_NAME \
  --all
```

See [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md) for detailed instructions.
