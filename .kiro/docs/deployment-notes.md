# Pi-hole CDK Deployment Notes

## Monitoring GitHub Actions

Launch iTerm window to watch workflow:
```bash
osascript -e 'tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd /Users/sauhsoj/src/personal/pi-hole-cdk && gh run watch <RUN_ID>"
    end tell
end tell'
```

## Common Deployment Issues

### EFS Replication Conflicts
**Error**: "A replication already exists for this resource"

**Cause**: EFS replication was created but CloudFormation lost track of it (e.g., rollback).

**Fix**: 
1. Delete existing replication: `aws efs delete-replication-configuration --source-file-system-id <fs-id> --region <region>`
2. Wait for deletion to complete (can take 5-15 minutes)
3. Rerun deployment

The workflow now auto-detects existing replication via `efs_replication_dest_fs_id` context parameter.

### ALB Health Check Failures (HTTPS Target Group)
**Error**: "Task failed ELB health checks"

**Cause**: `/admin/` returns 302 redirect, but health check expected 200.

**Fix**: Set `healthyHttpCodes: '200-399'` in target group health check config.

Settings in `lib/constructs/pihole-https.ts`:
```typescript
healthCheck: {
  path: '/admin/',
  healthyHttpCodes: '200-399',
  interval: Duration.seconds(30),
  timeout: Duration.seconds(10),
  healthyThresholdCount: 2,
  unhealthyThresholdCount: 5,
}
```

### NLB Multiple Subnets Per AZ (Sydney)
**Error**: "A load balancer cannot be attached to multiple subnets in the same Availability Zone"

**Cause**: VPC has multiple private subnets per AZ (e.g., Control Tower + 100.64.x.x subnets).

**Fix**: Filter to RFC1918 subnets only in `lib/constructs/pihole-loadbalancer.ts`:
```typescript
vpcSubnets: { 
  subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
  onePerAz: true,
  subnetFilters: [aws_ec2.SubnetFilter.byCidrRanges(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'])],
}
```

### ECS Service Stabilization Timeout
**Cause**: Health check grace period too short, or health checks failing.

**Fix**: 
- Set `healthCheckGracePeriod: Duration.seconds(120)` on ECS service
- Ensure target group health checks are lenient during startup

## DNS Configuration

### Local Domain Forwarding
Configured in `lib/pi-hole-cdk-stack.ts` via dnsmasq:
```typescript
const dnsmasqCustomConfig = [
  `server=/local/${localDnsForwardTarget}`,
  `server=/localdomain/${localDnsForwardTarget}`,
  `server=/home.sauhsoj.wtf/${localDnsForwardTarget}`,
  `rev-server=192.168.0.0/22,${localDnsForwardTarget}`,
].join('\\n');
```

### Reverse DNS (PTR)
Use `rev-server=<CIDR>,<target>` for PTR lookups to local DNS.

## AWS Profiles
- Profile: `sauhsoj+ct+pihole-Admin`
- Melbourne: `ap-southeast-4`
- Sydney: `ap-southeast-2`

## Useful Commands

Check CloudFormation status:
```bash
aws cloudformation describe-stacks --stack-name PiHoleCdkStack --region <region> --profile "sauhsoj+ct+pihole-Admin" --query 'Stacks[0].StackStatus'
```

Check ECS service:
```bash
aws ecs describe-services --cluster pihole-cluster --services pihole-service --region <region> --profile "sauhsoj+ct+pihole-Admin" --query 'services[0].{Running:runningCount,Status:deployments[0].rolloutState}'
```

Check target health:
```bash
aws elbv2 describe-target-health --target-group-arn <arn> --region <region> --profile "sauhsoj+ct+pihole-Admin"
```

Exec into container:
```bash
aws ecs execute-command --cluster pihole-cluster --task <task-arn> --container pihole --interactive --command "/bin/bash" --region <region> --profile "sauhsoj+ct+pihole-Admin"
```
