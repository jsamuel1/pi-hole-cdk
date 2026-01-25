# Pi-hole CDK Refactoring Plan

## Overview
Refactor two CDK stacks (`pi-hole-cdk-stack.ts` and `pi-hole-ecs-managed-stack.ts`) to eliminate code duplication and extract hardcoded values into configuration.

## Phase 1: Configuration Extraction

### Task 1: Create PiHoleConfig Interface
**Scope:** Create a new config interface with all hardcoded values
**File:** `lib/config/pihole-config.ts`
**Values to extract:**
- `revServerTarget` (default: '192.168.1.1')
- `revServerDomain` (default: 'localdomain')
- `dnsServers` (default: ['1.1.1.1', '1.0.0.1'])
- `containerMemoryMiB` (default: 512)
- `containerCpu` (default: 256)
- `deregistrationDelaySeconds` (default: 120)
- `logRetentionDays` (default: 7)
- `instanceVCpuMin/Max` (default: 2/4)
- `instanceMemoryMin/Max` (default: 2048/4096)

**Acceptance:** `bun run build` passes

### Task 2: Update AppConfig and Props
**Scope:** Extend existing `PiHoleProps` to include optional `PiHoleConfig`
**File:** `bin/pi-hole-cdk.ts`
**Acceptance:** `bun run build` && `cdk synth` passes

## Phase 2: Shared Constructs

### Task 3: Create PiHoleNetworking Construct
**Scope:** Extract VPC lookup, security group, and RFC1918 prefix list
**File:** `lib/constructs/pihole-networking.ts`
**Exposes:** `vpc`, `securityGroup`, `prefixList`
**Acceptance:** `bun run build` passes

### Task 4: Create PiHoleStorage Construct
**Scope:** Extract EFS file system and Secrets Manager secret creation
**File:** `lib/constructs/pihole-storage.ts`
**Exposes:** `fileSystem`, `passwordSecret`
**Acceptance:** `bun run build` passes

### Task 5: Create PiHoleLoadBalancer Construct
**Scope:** Extract NLB setup and IP retrieval custom resource
**File:** `lib/constructs/pihole-loadbalancer.ts`
**Exposes:** `nlb`, `dnsIp1`, `dnsIp2`, `targetGroup`
**Acceptance:** `bun run build` passes

### Task 5b: Create PiHoleIamPolicies Construct
**Scope:** Extract IAM policies for Secrets Manager and KMS access
**File:** `lib/constructs/pihole-iam-policies.ts`
**Exposes:** `createSecretsPolicy(secretArn)`, `createKmsPolicy()`, `getManagedPolicies()`
**Acceptance:** `bun run build` passes

### Task 6: Create Constructs Index
**Scope:** Create barrel export for all constructs
**File:** `lib/constructs/index.ts`
**Acceptance:** `bun run build` passes

## Phase 3: Stack Refactoring

### Task 7: Refactor ECS Stack to Use Constructs
**Scope:** Update `pi-hole-ecs-managed-stack.ts` to use shared constructs and config
**Acceptance:** `bun run build` && `cdk synth` passes

### Task 8: Refactor EC2 ASG Stack to Use Constructs
**Scope:** Update `pi-hole-cdk-stack.ts` to use shared constructs and config
**Acceptance:** `bun run build` && `cdk synth` passes

## Phase 4: Cleanup

### Task 9: Remove Dead Code and Fix Comments
**Scope:** 
- Remove unused `keypair` variable
- Remove pirate-speak from comments
- Trim excessive docstrings
**Acceptance:** `bun run build` && `cdk synth` passes

---

## Validation Commands
Each task must pass before commit:
```bash
bun run build
cdk synth --quiet
```
