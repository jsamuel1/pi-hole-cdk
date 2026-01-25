# 🏴‍☠️ Pi-hole ECS Managed Instances Migration Guide ⚓

Ahoy, matey! This guide be helpin' ye migrate from the traditional EC2 Auto Scaling Group approach to AWS ECS Managed Instances fer runnin' Pi-hole.

## 📖 Table of Contents

1. [Overview](#overview)
2. [Architecture Comparison](#architecture-comparison)
3. [ECS Managed Instances Suitability Assessment](#ecs-managed-instances-suitability-assessment)
4. [Migration Strategy](#migration-strategy)
5. [Deployment Instructions](#deployment-instructions)
6. [Validation Steps](#validation-steps)
7. [Rollback Plan](#rollback-plan)
8. [Troubleshooting](#troubleshooting)

## Overview

### What Be Changin'? 🗺️

The new stack (`pi-hole-ecs-managed-stack.ts`) replaces the EC2 Auto Scaling Group approach with:
- **ECS Cluster** with Managed Instances capacity provider
- **ECS Task Definition** defining the Pi-hole container workload
- **ECS Service** managing Pi-hole task lifecycle and health
- **Docker containerization** using the official `pihole/pihole` image

### What Stays the Same? 🔒

- **VPC Configuration**: Same VPC lookup and subnet configuration
- **EFS File System**: Persistent storage fer `/etc/pihole` configuration
- **Secrets Manager**: Password management fer Pi-hole admin interface
- **Network Load Balancer**: DNS traffic routing on port 53 (TCP/UDP)
- **Security Groups**: Same network access controls (RFC1918 ranges)
- **IAM Permissions**: Similar permissions fer EFS, Secrets Manager, SSM

## Architecture Comparison

### Current EC2 ASG Approach 🚢

```
┌─────────────────────────────────────────────────┐
│ EC2 Auto Scaling Group                          │
│  ├─ Launch Template                             │
│  │   ├─ Ubuntu 22.04 AMI                        │
│  │   ├─ User Data Script (installs Pi-hole)     │
│  │   └─ IAM Instance Profile                    │
│  └─ Auto Scaling Policies                       │
│                                                  │
│ Resources:                                       │
│  ├─ EC2 Instances run Pi-hole directly          │
│  ├─ EFS mounted via fstab                       │
│  ├─ Secrets fetched via AWS CLI in user-data    │
│  └─ Network Load Balancer (DNS port 53)         │
└─────────────────────────────────────────────────┘
```

### New ECS Managed Instances Approach ⚓

```
┌─────────────────────────────────────────────────┐
│ ECS Cluster with Managed Instances              │
│  ├─ Capacity Provider (ManagedInstancesProvider)│
│  │   └─ AWS manages EC2 instances automatically │
│  ├─ Task Definition                             │
│  │   ├─ pihole/pihole:latest container          │
│  │   ├─ EFS Volume Configuration                │
│  │   └─ Environment Variables & Secrets         │
│  └─ ECS Service                                 │
│      ├─ Desired Count: 1                        │
│      ├─ Health Checks                           │
│      └─ Target Group Attachment                 │
│                                                  │
│ Resources:                                       │
│  ├─ Docker containers run on managed instances  │
│  ├─ EFS mounted as ECS volume                   │
│  ├─ Secrets passed as environment variables     │
│  └─ Network Load Balancer (DNS port 53)         │
└─────────────────────────────────────────────────┘
```

## ECS Managed Instances Suitability Assessment

### ✅ Why ECS Managed Instances Be Perfect Fer Pi-hole

1. **Infrastructure Management** 🏗️
   - AWS automatically provisions and scales EC2 instances
   - No need to manage Auto Scaling Groups, Launch Templates, or user-data scripts
   - Infrastructure optimization reduces idle instance costs

2. **Container Benefits** 🐋
   - Official Pi-hole Docker image with proven stability
   - Consistent deployment across regions
   - Easier version upgrades (update image tag)
   - Better isolation and resource management

3. **EFS Compatibility** 💾
   - Native EFS support via ECS volume configuration
   - IAM-based authentication (no mount helper needed)
   - Transit encryption enabled by default

4. **Network Mode Support** 🌐
   - Host networking mode allows Pi-hole to bind to port 53
   - Critical fer DNS functionality (UDP/TCP on port 53)
   - Same network behavior as running directly on EC2

5. **Health Management** 🏥
   - Built-in container health checks
   - Automatic restart of unhealthy tasks
   - ECS Service ensures desired count maintained

6. **Observability** 🔍
   - Container logs automatically sent to CloudWatch
   - ECS Container Insights available fer detailed metrics
   - ECS Exec enables direct container access fer debuggin'

### ⚠️ Considerations

1. **Learning Curve**: Team needs familiarity with ECS concepts
2. **Debugging**: Different from SSH-ing into EC2 instances (use ECS Exec)
3. **Cost**: Small overhead from ECS service (free tier available)
4. **Regional Availability**: ECS Managed Instances available in most regions

## Migration Strategy

### Phase 1: Development/Test Region 🧪

1. Deploy the new ECS stack to a non-production region
2. Validate all functionality:
   - DNS resolution
   - Web admin interface
   - Blocklist updates
   - EFS persistence
3. Monitor fer 1-2 weeks to ensure stability

### Phase 2: Parallel Production Deployment 🔄

1. Deploy ECS stack in one production region while keeping EC2 ASG stack runnin'
2. Configure Route 53 health checks to route traffic to healthy endpoint
3. Monitor both stacks fer comparison
4. Gradually shift traffic to ECS stack

### Phase 3: Regional Rollout 🌍

1. Deploy ECS stack to additional regions one at a time
2. Validate each deployment before proceeding to next region
3. Keep EC2 ASG stacks runnin' as backup during migration
4. Document any region-specific issues or adjustments

### Phase 4: Decommission Old Stack 🗑️

1. Once all regions migrated and stable fer 30+ days
2. Remove EC2 ASG stack deployments region by region
3. Archive `pi-hole-cdk-stack.ts` fer reference
4. Update documentation to reflect ECS as primary approach

## Deployment Instructions

### Prerequisites 📋

- AWS CDK v2.189.1 or higher
- Node.js and TypeScript
- AWS CLI configured
- Existing VPC with name configured in context
- EC2 key pair fer debugging (optional)

### Step 1: Update CDK App Entry Point

Edit `bin/pi-hole-cdk.ts` to add the new stack:

```typescript
import { PiHoleEcsManagedStack } from '../lib/pi-hole-ecs-managed-stack';

// Add this line after existing stack instantiation:
new PiHoleEcsManagedStack(app, 'PiHoleEcsManagedStack', piHoleProps);
```

### Step 2: Build the Project

```bash
cd /projects/sandbox/pi-hole-cdk
bun run build
```

### Step 3: Synthesize CloudFormation Template

```bash
cdk synth PiHoleEcsManagedStack
```

Review the generated CloudFormation template to verify resources.

### Step 4: Deploy to Development Region

```bash
# Set region to development/test environment
export AWS_REGION=us-west-2  # or yer preferred test region
export CDK_DEFAULT_REGION=$AWS_REGION

# Deploy the stack
cdk deploy PiHoleEcsManagedStack \
  --context vpc_name="your-vpc-name" \
  --context local_internal_cidr="192.168.0.0/16" \
  --context keypair="your-keypair-name"
```

### Step 5: Wait fer Deployment

The deployment will create:
- ECS Cluster
- Capacity Provider
- Task Definition
- ECS Service (will provision instances and start tasks)
- NLB, Target Groups
- Security Groups, EFS, Secrets

This may take 10-15 minutes.

## Validation Steps

### 1. Verify ECS Service Health ✅

```bash
# Get cluster and service names from stack outputs
aws ecs describe-services \
  --cluster pihole-cluster \
  --services pihole-service \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

Expected output:
```json
{
  "Status": "ACTIVE",
  "Running": 1,
  "Desired": 1
}
```

### 2. Check Container Logs 📝

```bash
# View Pi-hole container logs
aws logs tail /ecs/pihole --follow
```

Look fer successful startup messages and no errors.

### 3. Test DNS Resolution 🔍

```bash
# Get DNS server IPs from stack outputs
DNS1=$(aws cloudformation describe-stacks \
  --stack-name PiHoleEcsManagedStack \
  --query 'Stacks[0].Outputs[?OutputKey==`dns1-ecs`].OutputValue' \
  --output text)

# Test DNS query
dig @$DNS1 google.com +short
```

Should return IP addresses fer google.com.

### 4. Verify Web Interface 🌐

```bash
# Get secret ARN from stack outputs
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name PiHoleEcsManagedStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SecretArn-ecs`].OutputValue' \
  --output text)

# Retrieve password
PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text)

echo "Pi-hole admin password: $PASSWORD"
```

Access `http://pi.hole/admin` (after configuring DNS to use Pi-hole) and log in.

### 5. Check EFS Persistence 💾

```bash
# Use ECS Exec to access container
aws ecs execute-command \
  --cluster pihole-cluster \
  --task <task-id> \
  --container pihole \
  --interactive \
  --command "/bin/bash"

# Inside container, check EFS mount
ls -la /etc/pihole/
```

Should see Pi-hole configuration files.

### 6. Verify Blocklists 🚫

In the Pi-hole admin interface:
1. Navigate to Group Management → Adlists
2. Verify default blocklists are loaded
3. Update gravity (Tools → Update Gravity)
4. Check that blocked domains resolve to 0.0.0.0

## Rollback Plan

If issues arise durin' migration:

### Option 1: Keep Both Stacks Runnin'

- Don't delete the EC2 ASG stack
- Simply don't route traffic to the ECS stack
- Investigate issues at yer leisure

### Option 2: Quick Rollback

```bash
# Delete the ECS stack
cdk destroy PiHoleEcsManagedStack

# Ensure EC2 ASG stack still runnin'
aws autoscaling describe-auto-scaling-groups \
  --query 'AutoScalingGroups[?contains(AutoScalingGroupName, `pihole`)].{Name:AutoScalingGroupName,Instances:length(Instances)}'
```

### Option 3: Traffic Shift

If usin' Route 53:
- Update DNS records to point back to EC2 ASG NLB
- ECS stack can remain fer further investigation

## Troubleshooting

### Container Won't Start 🚨

**Symptoms**: ECS service shows 0 running tasks

**Diagnosis**:
```bash
# Check service events
aws ecs describe-services \
  --cluster pihole-cluster \
  --services pihole-service \
  --query 'services[0].events[0:5]'
```

**Common Causes**:
- Image pull failures (check task execution role permissions)
- EFS mount failures (check security groups, EFS mount targets)
- Insufficient resources (check instance type constraints)

### DNS Not Resolving 🔍

**Symptoms**: `dig` queries timeout or fail

**Diagnosis**:
```bash
# Check task is runnin'
aws ecs list-tasks --cluster pihole-cluster --service-name pihole-service

# Check security group rules
aws ec2 describe-security-groups \
  --filters Name=group-name,Values=*allow_dns_http_ecs* \
  --query 'SecurityGroups[0].IpPermissions'
```

**Common Causes**:
- Security group not allowin' port 53 UDP/TCP
- Target group health check failin'
- Container not bindin' to correct network interface (check host mode)

### EFS Mount Failures 💾

**Symptoms**: Container logs show EFS errors

**Diagnosis**:
```bash
# Check EFS mount targets
EFS_ID=$(aws cloudformation describe-stacks \
  --stack-name PiHoleEcsManagedStack \
  --query 'Stacks[0].Outputs[?OutputKey==`EfsFileSystemId-ecs`].OutputValue' \
  --output text)

aws efs describe-mount-targets --file-system-id $EFS_ID
```

**Common Causes**:
- Mount targets not in correct subnets
- Security group not allowin' NFS traffic (port 2049)
- IAM role lackin' EFS permissions

### High Costs 💰

**Symptoms**: Unexpected AWS charges

**Diagnosis**:
```bash
# Check runnin' instances
aws ec2 describe-instances \
  --filters Name=tag:aws:ecs:clusterName,Values=pihole-cluster \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]'
```

**Optimization**:
- Verify infrastructure optimization be enabled in capacity provider
- Set appropriate `instanceWarmupPeriod` to reduce idle time
- Consider Spot instances fer non-critical regions (requires additional config)

### Need to Access Container 🔧

**Use ECS Exec**:
```bash
# Enable execute command (already enabled in stack)
aws ecs execute-command \
  --cluster pihole-cluster \
  --task $(aws ecs list-tasks --cluster pihole-cluster --service-name pihole-service --query 'taskArns[0]' --output text) \
  --container pihole \
  --interactive \
  --command "/bin/bash"
```

## Additional Resources 📚

- [AWS ECS Managed Instances Documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ManagedInstances.html)
- [Pi-hole Docker Hub](https://hub.docker.com/r/pihole/pihole)
- [ECS Task Definition Parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html)
- [Original EC2 Stack Documentation](./README.md)

## Success Criteria ✅

The migration be considered successful when:

- [ ] ECS service maintains desired count of 1 task
- [ ] Container health checks consistently pass
- [ ] DNS queries resolve correctly (100% success rate)
- [ ] Web admin interface accessible and functional
- [ ] Blocklists update successfully
- [ ] EFS persistence verified (survives task restarts)
- [ ] Monitoring shows no errors in CloudWatch logs
- [ ] Cost be comparable or lower than EC2 ASG approach
- [ ] Team comfortable with ECS operations and troubleshootin'

---

**Note**: This migration be designed to be gradual and reversible. Take yer time, validate thoroughly, and keep the treasure maps (documentation) up to date! 🗺️⚓

Arrr! Fair winds and followin' seas on yer migration journey! 🏴‍☠️
