# 🏴‍☠️ Pi-hole on ECS Managed Instances Architecture ⚓

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Cloud (VPC)                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              ECS Cluster (pihole-cluster)                   │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐      │    │
│  │  │  Capacity Provider (Managed Instances)           │      │    │
│  │  │  - Infrastructure Role (AWS manages instances)   │      │    │
│  │  │  - Infrastructure Optimization (scale in 5min)   │      │    │
│  │  │  - Flexible instance types (Graviton or x86)     │      │    │
│  │  └──────────────────────────────────────────────────┘      │    │
│  │                         │                                   │    │
│  │                         ▼                                   │    │
│  │  ┌──────────────────────────────────────────────────┐      │    │
│  │  │  ECS Service (pihole-service)                    │      │    │
│  │  │  - Desired Count: 1                              │      │    │
│  │  │  - Health Checks enabled                         │      │    │
│  │  │  - ECS Exec enabled (troubleshooting)            │      │    │
│  │  └──────────────────────────────────────────────────┘      │    │
│  │                         │                                   │    │
│  │                         ▼                                   │    │
│  │  ┌──────────────────────────────────────────────────┐      │    │
│  │  │  ECS Task (Host Network Mode)                    │      │    │
│  │  │                                                   │      │    │
│  │  │  ┌─────────────────────────────────────────┐     │      │    │
│  │  │  │  Pi-hole Container                      │     │      │    │
│  │  │  │  - Image: pihole/pihole:latest          │     │      │    │
│  │  │  │  - Binds to port 53 (DNS)               │     │      │    │
│  │  │  │  - Binds to port 80 (HTTP)              │     │      │    │
│  │  │  │  - Memory: 512 MB                       │     │      │    │
│  │  │  │  - CPU: 256 units                       │     │      │    │
│  │  │  └─────────────────────────────────────────┘     │      │    │
│  │  └──────────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Network Load Balancer (DNS Traffic)                       │    │
│  │  - Port 53 TCP/UDP                                         │    │
│  │  - Static IP addresses for DNS clients                     │    │
│  │  - Cross-zone enabled                                      │    │
│  └────────────────────────────────────────────────────────────┘    │
│                         │                                           │
│                         ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Application Load Balancer (Optional - HTTP Admin)         │    │
│  │  - Port 80 HTTP                                            │    │
│  │  - Internet-facing (locked to specific IP)                 │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  EFS File System (pihole-fs-ecs)                           │    │
│  │  - Encrypted at rest                                       │    │
│  │  - Mounted to /etc/pihole in container                     │    │
│  │  - IAM authentication + TLS encryption                     │    │
│  │  - Persistent Pi-hole configuration and blocklists         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Secrets Manager (pihole-pwd-ecs)                          │    │
│  │  - Auto-generated password                                 │    │
│  │  - Passed to container as env var (WEBPASSWORD)            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  CloudWatch Logs (/ecs/pihole)                             │    │
│  │  - Container stdout/stderr logs                            │    │
│  │  - 7 day retention                                         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Security Group (allow_dns_http_ecs)                       │    │
│  │  - RFC1918 prefix list ingress                             │    │
│  │  - Port 22 (SSH), 53 (DNS), 80 (HTTP), ICMP               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## IAM Roles

### Infrastructure Role
- **Purpose**: Allows ECS to manage EC2 instances
- **Managed Policy**: `AmazonECSInfrastructureRolePolicyForManagedInstances`
- **Used By**: ECS Capacity Provider

### Instance Role
- **Purpose**: Permissions for EC2 instances running ECS agent
- **Managed Policies**:
  - `AmazonEC2ContainerServiceforEC2Role`
  - `AmazonSSMManagedInstanceCore`
  - `AmazonElasticFileSystemClientReadWriteAccess`
  - `CloudWatchAgentServerPolicy`
- **Used By**: EC2 instances (via Instance Profile)

### Task Execution Role
- **Purpose**: Permissions for ECS to pull images and write logs
- **Managed Policy**: `AmazonECSTaskExecutionRolePolicy`
- **Used By**: ECS Task (execution)

### Task Role
- **Purpose**: Permissions for the Pi-hole container at runtime
- **Managed Policies**:
  - `AmazonSSMManagedInstanceCore`
  - `AmazonElasticFileSystemClientReadWriteAccess`
  - `CloudWatchAgentServerPolicy`
- **Inline Policies**:
  - Secrets Manager (read pihole-pwd-ecs)
  - KMS (encrypt/decrypt)
- **Used By**: ECS Task (runtime)

## Data Flow

### DNS Query Flow
```
Client → NLB (port 53) → ECS Task (host network) → Pi-hole Container → Upstream DNS (1.1.1.1)
                                                                      ↓
                                                              EFS (/etc/pihole)
                                                              - Blocklists
                                                              - Configuration
                                                              - Query logs
```

### Admin Web UI Flow
```
User → ALB (port 80) → ECS Task (host network) → Pi-hole Container → EFS (/etc/pihole)
                                                          ↓
                                                   Secrets Manager
                                                   (admin password)
```

### Container Lifecycle
```
ECS Service creates Task
    ↓
Capacity Provider provisions EC2 instance (if needed)
    ↓
ECS places Task on instance
    ↓
Task pulls pihole/pihole:latest image
    ↓
Task mounts EFS volume to /etc/pihole
    ↓
Task fetches WEBPASSWORD from Secrets Manager
    ↓
Pi-hole container starts
    ↓
Health check validates DNS functionality
    ↓
Task registered to NLB target group
    ↓
Ready to serve DNS queries
```

## Scaling Behavior

### Infrastructure Optimization (Managed Instances)
- **Scale Out**: AWS automatically provisions instances when tasks pending
- **Scale In**: AWS terminates idle instances after 300 seconds (5 minutes)
- **Instance Selection**: AWS selects cost-optimized instances matching requirements
- **Warm-up Period**: Instances ready for task placement after provisioning

### Task Scaling (Pi-hole Service)
- **Current**: Desired count = 1 (single Pi-hole instance)
- **Future**: Can increase for redundancy (multiple Pi-hole instances)
- **Placement**: Distinct instances constraint (tasks on different hosts)

## Network Modes

### Host Network Mode (Used)
- **Pros**:
  - Pi-hole binds directly to port 53 on the host
  - No port mapping needed
  - Best performance for DNS
  - Compatible with existing NLB setup
- **Cons**:
  - Limited to one Pi-hole task per instance
  - No network isolation between container and host

### Alternative: awsvpc (Not Used)
- Would require ALB/NLB TCP mode adjustments
- Pi-hole would need to listen on alternate ports
- More complex configuration

## Comparison: EC2 ASG vs ECS Managed Instances

| Aspect | EC2 ASG | ECS Managed Instances |
|--------|---------|----------------------|
| Instance Management | Manual (Launch Template, ASG) | Automatic (AWS managed) |
| Pi-hole Deployment | User-data script | Docker container |
| Scaling | ASG policies | ECS + Infrastructure Optimization |
| Health Checks | EC2 health checks | Container health checks |
| Updates | Terminate & launch new instances | Pull new image, rolling update |
| Monitoring | CloudWatch Logs (via script) | CloudWatch Logs (native) |
| Troubleshooting | SSH to instance | ECS Exec to container |
| Cost Optimization | Manual ASG adjustments | Automatic infrastructure optimization |

## Key Benefits of ECS Managed Instances

1. **No ASG Management**: AWS handles instance lifecycle
2. **Container Benefits**: Official image, easy updates, consistent deployments
3. **Better Health Checks**: Container-level health validation
4. **Automatic Recovery**: ECS restarts failed containers
5. **Cost Savings**: Infrastructure optimization reduces idle time
6. **Observability**: Native CloudWatch integration
7. **Flexibility**: Easy to adjust resources (CPU, memory, count)

---

**Arrr! This be a fine architecture fer runnin' Pi-hole in the cloud!** 🏴‍☠️⚓
