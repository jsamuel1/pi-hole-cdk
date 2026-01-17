# Welcome to CDK PiHole Deployment ⚓

Ahoy, matey! This treasure chest contains two Pi-hole deployment approaches fer AWS:

## 📦 Available Stacks

### 1. **PiHoleCdkStack** (Original EC2 Auto Scaling)
The traditional approach using EC2 Auto Scaling Groups with user-data scripts.

### 2. **PiHoleEcsManagedStack** (NEW! ⚓ ECS Managed Instances)
Modern containerized approach using AWS ECS Managed Instances. See [ECS-MIGRATION-GUIDE.md](./ECS-MIGRATION-GUIDE.md) fer details.

### 3. **SiteToSiteVpnStack** & **TgwWithSiteToSiteVpnStack**
VPN configurations fer secure connectivity.

## 🌐 Traffic Flows

### Pi-hole Admin UI (HTTPS)

```
Internet/Home → ALB (HTTPS:443) → Cognito Auth → Pi-hole (HTTP:80)
                     ↓
              ACM Certificate
```

- External access requires Cognito authentication
- ALB terminates SSL using ACM certificate
- WAF protects against common attacks

### Home Assistant (HTTPS)

```
Internet → ALB (HTTPS:443) → Home Assistant (HTTP:8123)
              ↓                      ↑
       ACM Certificate         Site-to-Site VPN

Home Network → Split-DNS → Home Assistant (HTTPS:443)
                               ↓
                        Let's Encrypt Certificate
```

**External Access (via ALB):**
- ALB terminates SSL (ACM certificate)
- Forwards HTTP to HA port 8123 via Site-to-Site VPN
- No Cognito auth (HA has its own authentication)
- HA requires `trusted_proxies` configured for VPC CIDR

**Local Access (Split-DNS):**
- Pi-hole returns local IP for HA hostname
- Direct HTTPS connection to HA's nginx proxy
- Uses Let's Encrypt certificate

### DNS Resolution

```
Pi-hole (AWS) ← Site-to-Site VPN → Home Router
     ↓                                  ↓
  Upstream DNS                    Local DNS
  (1.1.1.1)                    (DHCP clients)
     ↓
  Conditional Forwarding
  (*.localdomain → Home Router)
```

## Prerequisites:
* An existing VPC with internet access
* A named SSH keypair
* Your local router's external & internal IP addresses 

## 🤖 GitHub Actions CI/CD

This repository includes GitHub Actions workflows fer automated multi-region deployment! See [.github/workflows/README.md](./.github/workflows/README.md) fer details on:
- Automatic deployments on push to `main` branch
- Manual VPN deployment workflows
- Self-hosted runner configuration
- Migration strategy fer ECS (addresses issue #20)

**Quick Start with GitHub Actions**: Configure yer self-hosted runners with the `pi-hole-cdk` label and set the required secrets (`AWS_ACCOUNT_ID`, `LOCAL_IP`, `LOCAL_INTERNAL_CIDR`), then push to main! ⚓

## Deployment Instructions (Manual CDK)

### Deploy Original EC2 Stack
```bash
cdk deploy PiHoleCdkStack -c local_ip=<local_ip> -c vpc_name=<vpcNAME> -c keypair=<keypairname> -c local_internal_cidr=<internalcidr/range>
```

### Deploy NEW ECS Managed Instances Stack (Recommended fer new deployments)
```bash
cdk deploy PiHoleEcsManagedStack -c local_ip=<local_ip> -c vpc_name=<vpcNAME> -c keypair=<keypairname> -c local_internal_cidr=<internalcidr/range>
```

### Example:
```bash
cdk deploy PiHoleEcsManagedStack -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16
```

### Deploy All Stacks (includes VPN)
```bash
cdk deploy -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16 --all
```

This will deploy both a Site To Site VPN and the pihole.
You should then set up your local router to talk to the Site to Site VPN before configuring the router's DNS to use the IP addresses provided (which export DNS endpoints to the local network only).

Add the optional context parameter: `public_http=True` if you want to create an internet facing Application Load Balancer fer the web interface, locked down to yer external local IP address. Ye may want to enable this during the setup phase, until ye have yer VPN going, or if ye have automation.

## Post-Deployment Configuration

### EFS Replication (Multi-Region)

For multi-region deployments, EFS replication can be configured to replicate Pi-hole configuration data between regions:

```bash
# First deployment (creates new replication)
cdk deploy PiHoleCdkStack \
  --context efs_replication_region="ap-southeast-2"

# Subsequent deployments (uses existing replication destination)
# The workflow automatically looks up existing replication and passes the destination filesystem ID
```

**Context Parameters:**
- `efs_replication_region` - Target region for EFS replication (e.g., "ap-southeast-2")
- `efs_replication_dest_fs_id` - (Optional) Existing destination filesystem ID. If provided, uses existing replication instead of creating new.

The GitHub Actions workflow automatically detects existing EFS replication and passes the destination filesystem ID to avoid conflicts.

### Conditional Forwarding

Optionally, ye may wish to set up a conditional forwarder back to yer local DHCP server's DNS, if ye are not moving DHCP onto the pihole.
Do this from the PiHole web UI, or add the following variables into the PiHole setupVars.conf and reload the config:
```
REV_SERVER=true
REV_SERVER_CIDR=<your_internal_cidr>
REV_SERVER_TARGET=<your_router_ip>
REV_SERVER_DOMAIN=<your_domain>
```

For Unifi devices, the Unifi dnsmasq is not configured to listen to the tunnel interface. See the notes in the unifi-vpndns folder fer instructions to fix this, before setting up the conditional forwarding.

## 🏠 Home Assistant Integration

To expose Home Assistant through the ALB:

### CDK Context Parameters

```bash
-c home_assistant_ip=<HA_IP> \
-c home_assistant_port=8123
```

### Home Assistant Configuration

Add the VPC CIDR to `configuration.yaml`:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.30.33.0/24  # HA internal Docker network
    - <VPC_CIDR>      # AWS VPC CIDR (via Site-to-Site VPN)
```

### Certificate Domains

The ACM certificate automatically includes (when `home_assistant_ip` is set):

- `pihole-{region}.{hosted_zone}` (regional Pi-hole)
- `pihole.{hosted_zone}` (failover)
- `homeassistant.{hosted_zone}`
- `ha.{hosted_zone}`

### Split-DNS (Optional)

For local access without going through the ALB, configure Pi-hole Local DNS to return the local HA IP for the HA hostnames.

## 🗺️ Migration to ECS Managed Instances

If ye currently use the EC2 Auto Scaling approach and want to migrate to ECS Managed Instances:

1. Read the comprehensive [ECS-MIGRATION-GUIDE.md](./ECS-MIGRATION-GUIDE.md)
2. Test in a non-production region first
3. Gradually migrate production regions
4. Both stacks can coexist during migration

## Documentation

- [ECS Migration Guide](./ECS-MIGRATION-GUIDE.md) - Complete guide fer migrating to ECS Managed Instances
- [Original Stack](./lib/pi-hole-cdk-stack.ts) - EC2 Auto Scaling implementation
- [ECS Stack](./lib/pi-hole-ecs-managed-stack.ts) - ECS Managed Instances implementation

---

Arrr! Fair winds and happy sailin'! 🏴‍☠️
