# Welcome to CDK PiHole Deployment ⚓

Ahoy, matey! This treasure chest contains two Pi-hole deployment approaches fer AWS:

## 📦 Available Stacks

### 1. **PiHoleCdkStack** (Original EC2 Auto Scaling)
The traditional approach using EC2 Auto Scaling Groups with user-data scripts.

### 2. **PiHoleEcsManagedStack** (NEW! ⚓ ECS Managed Instances)
Modern containerized approach using AWS ECS Managed Instances. See [ECS-MIGRATION-GUIDE.md](./ECS-MIGRATION-GUIDE.md) fer details.

### 3. **SiteToSiteVpnStack** & **TgwWithSiteToSiteVpnStack**
VPN configurations fer secure connectivity.

## Prerequisites:
* An existing VPC with internet access
* A named SSH keypair
* Your local router's external & internal IP addresses 

## Deployment Instructions

### 🚨 Conditional Deployment Logic (Prevents Resource Conflicts!)

**IMPORTANT**: To prevent accidental deployment of both EC2 and ECS stacks to the same region simultaneously (which could cause resource conflicts), use these context flags:

#### Default Behavior (No flags)
Deploys **only EC2 stack** (backward compatible with existing deployments)
```bash
cdk deploy PiHoleCdkStack -c local_ip=<local_ip> -c vpc_name=<vpcNAME> -c keypair=<keypairname> -c local_internal_cidr=<internalcidr/range>
```

#### Deploy ECS Stack Only (Recommended fer new regions or full migration)
Use `deploy_ecs_only=true` to deploy **only ECS stack** (skips EC2 stack)
```bash
cdk deploy PiHoleEcsManagedStack -c deploy_ecs_only=true -c local_ip=<local_ip> -c vpc_name=<vpcNAME> -c keypair=<keypairname> -c local_internal_cidr=<internalcidr/range>
```

#### Deploy Both Stacks (Fer gradual regional migration)
Use `deploy_ecs=true` to deploy **both EC2 and ECS stacks** (fer parallel testing)
```bash
cdk deploy --all -c deploy_ecs=true -c local_ip=<local_ip> -c vpc_name=<vpcNAME> -c keypair=<keypairname> -c local_internal_cidr=<internalcidr/range>
```

**⚠️ WARNING**: Deploying both EC2 and ECS Pi-hole stacks simultaneously should **only** be used in the following scenarios:
- When deploying to **separate regions** (e.g., EC2 in us-east-1, ECS in us-west-2)
- When ye **intentionally want both stacks deployed** in the same region fer testing or gradual migration purposes

Deploying both stacks to the same region can cause resource conflicts, confusion with DNS endpoints, and increased costs. Make sure this is yer intended configuration before proceeding! 🏴‍☠️

**Note**: You cannot set both `deploy_ecs` and `deploy_ecs_only` simultaneously - this will throw an error! ⚠️

### Example Deployments:

#### Example 1: Fresh ECS deployment (new region)
```bash
cdk deploy PiHoleEcsManagedStack -c deploy_ecs_only=true -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16
```

#### Example 2: Gradual migration (both stacks fer testing)
```bash
cdk deploy --all -c deploy_ecs=true -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16
```

#### Example 3: Traditional EC2 deployment (default, no flags needed)
```bash
cdk deploy PiHoleCdkStack -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16
```

### Deploy All Stacks (includes VPN)
```bash
cdk deploy -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16 --all
```
**Note**: Without flags, this deploys EC2 stack + VPN stacks (ECS stack skipped)

This will deploy both a Site To Site VPN and the pihole.
You should then set up your local router to talk to the Site to Site VPN before configuring the router's DNS to use the IP addresses provided (which export DNS endpoints to the local network only).

Add the optional context parameter: `public_http=True` if you want to create an internet facing Application Load Balancer fer the web interface, locked down to yer external local IP address. Ye may want to enable this during the setup phase, until ye have yer VPN going, or if ye have automation.

## Post-Deployment Configuration

Optionally, ye may wish to set up a conditional forwarder back to yer local DHCP server's DNS, if ye are not moving DHCP onto the pihole.
Do this from the PiHole web UI, or add the following variables into the PiHole setupVars.conf and reload the config:
```
REV_SERVER=true
REV_SERVER_CIDR=<your_internal_cidr>
REV_SERVER_TARGET=<your_router_ip>
REV_SERVER_DOMAIN=<your_domain>
```

For Unifi devices, the Unifi dnsmasq is not configured to listen to the tunnel interface. See the notes in the unifi-vpndns folder fer instructions to fix this, before setting up the conditional forwarding.

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
