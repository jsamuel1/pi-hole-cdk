# Multi-Region Support Changes

## Summary

This document describes the changes made to support multi-region deployment of the Pi-hole CDK stack, specifically adding Frankfurt (eu-central-1) as a deployment target alongside existing Sydney (ap-southeast-2) and Melbourne (ap-southeast-4) deployments.

## Key Changes

### 1. Multi-Region Configuration (`bin/pi-hole-cdk.ts`)

**New Interface: `RegionConfig`**
- Added `RegionConfig` interface to define region-specific settings
- Properties: `region`, `vpc_name`, `keypair`, `use_intel`

**Enhanced `AppConfig` Class**
- Added `deployment_regions` property to support multiple target regions
- Added `parseDeploymentRegions()` method to parse region configurations from context
- Added `shouldUseIntel()` method to automatically determine instance architecture based on region
- Added `getRegionConfig()` method to retrieve region-specific configuration

**Updated `PiHoleProps` Interface**
- Added `regionConfig` property to pass region-specific settings to stacks

**Multi-Stack Deployment**
- Modified stack instantiation to create separate stacks for each configured region
- Stack names now include region suffixes (e.g., `PiHoleCdkStack-Frankfurt`)
- Added `getRegionSuffix()` helper function for consistent naming

### 2. Stack Updates

#### `lib/pi-hole-cdk-stack.ts`
- **Region-specific configuration**: Uses `regionConfig` for VPC name, keypair, and architecture
- **Resource naming**: All resources now include region suffix to avoid conflicts:
  - Secrets: `pihole-pwd-{region}`
  - EFS: `pihole-fs-{region}`
  - NLB: `pihole-{region}`
  - Prefix Lists: `RFC1918-{region}`
  - Export names: `RFC1918PrefixListId-{region}`

#### `lib/sitetositevpn-stack.ts`
- Updated to use `regionConfig` for region-specific VPC name

#### `lib/tgw-with-sitetositevpn-stack.ts`
- Updated to use `regionConfig` for region-specific VPC name
- Added region suffix to Transit Gateway and VPN resource names
- Updated import reference to use region-specific prefix list export

### 3. Transit Gateway Update (`lib/int_constructs/transit-gateway.ts`)
- Replaced `uuid` package dependency with CDK native `cdk.Names.uniqueId()`
- Removed ES Module import issue

### 4. Documentation

#### New Files Created

**`README.md` (Updated)**
- Comprehensive deployment guide for both single and multi-region scenarios
- Detailed examples for each supported region
- Configuration options reference
- Architecture notes highlighting instance type differences per region

**`DEPLOYMENT_GUIDE.md`**
- Detailed step-by-step deployment instructions
- Prerequisites checklist
- Multiple deployment scenarios with examples
- Troubleshooting section
- Maintenance and update procedures
- Security considerations
- Cost optimization tips

**`cdk.context.example.json`**
- Example configuration file
- Shows how to configure single and multi-region deployments
- Documents all available configuration options

**`deploy-multi-region.sh`**
- Bash script to simplify multi-region deployments
- Command-line argument parsing
- Dry-run mode
- Interactive confirmation
- Configuration validation

**`CHANGES.md`** (This file)
- Summary of all changes made

## New Features

### 1. Multi-Region Deployment
- Deploy to one or more regions simultaneously
- Each region operates independently
- No cross-region dependencies

### 2. Region-Specific Configuration
- Override VPC names per region
- Override keypair names per region
- Force Intel architecture if needed (automatic for Melbourne)

### 3. Context-Based Configuration
Two new context parameters:

**`deployment_regions`**
- JSON array of region codes
- Example: `'["ap-southeast-2","ap-southeast-4","eu-central-1"]'`
- Defaults to current AWS region if not specified

**`region_configs`**
- JSON object with region-specific overrides
- Example:
```json
{
  "eu-central-1": {
    "vpc_name": "frankfurt-vpc",
    "keypair": "frankfurt-key"
  }
}
```

### 4. Automatic Architecture Selection
- Sydney (ap-southeast-2): Graviton (ARM64) by default
- Melbourne (ap-southeast-4): Intel (x86) automatically (Graviton unavailable)
- Frankfurt (eu-central-1): Graviton (ARM64) by default
- Can be overridden with `use_intel` in region config

### 5. Resource Isolation
- All resources include region identifiers in names
- Prevents naming conflicts in multi-region deployments
- Allows independent operation and deletion

## Usage Examples

### Deploy Frankfurt Only

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["eu-central-1"]' \
  -c vpc_name=frankfurt-vpc \
  -c keypair=frankfurt-pihole \
  --all
```

### Deploy All Three Regions

```bash
cdk deploy \
  -c local_ip=203.123.45.67 \
  -c local_internal_cidr=192.168.0.0/16 \
  -c deployment_regions='["ap-southeast-2","ap-southeast-4","eu-central-1"]' \
  -c region_configs='{
    "ap-southeast-2": {"vpc_name": "sydney-vpc", "keypair": "sydney-key"},
    "ap-southeast-4": {"vpc_name": "melbourne-vpc", "keypair": "melbourne-key"},
    "eu-central-1": {"vpc_name": "frankfurt-vpc", "keypair": "frankfurt-key"}
  }' \
  --all
```

### Using Deployment Script

```bash
./deploy-multi-region.sh \
  --local-ip 203.123.45.67 \
  --regions eu-central-1 \
  --frankfurt-vpc frankfurt-vpc \
  --frankfurt-keypair frankfurt-key
```

## Backward Compatibility

The changes maintain backward compatibility:

1. **Single-Region Default**: If `deployment_regions` is not specified, the stack deploys to the current AWS region (from environment variables)

2. **Existing Context Parameters**: All existing context parameters continue to work:
   - `local_ip`
   - `local_internal_cidr`
   - `vpc_name`
   - `keypair`
   - `public_http`
   - `usePrefixLists`

3. **Stack Names**: For single-region deployments, stack names will include the region suffix, which is a minor change but maintains functionality

## Migration Guide

### From Single-Region to Multi-Region

If you have an existing single-region deployment and want to add more regions:

1. **Existing deployments continue to work** - No changes needed to maintain current setup

2. **To add a new region** (e.g., Frankfurt):
   ```bash
   cdk deploy \
     -c local_ip=YOUR_IP \
     -c local_internal_cidr=YOUR_CIDR \
     -c deployment_regions='["eu-central-1"]' \
     -c vpc_name=frankfurt-vpc \
     -c keypair=frankfurt-key \
     --all
   ```

3. **To manage all regions together**, update your deployment command to include all regions in `deployment_regions`

### Updating Existing Deployments

**Note**: Existing stacks will need to be recreated with new names if you want to use the regional naming convention. Alternatively, continue deploying to existing stacks by specifying only that region in `deployment_regions`.

## Testing

The code has been validated:
1. ✅ TypeScript compilation successful
2. ✅ CDK synth generates CloudFormation templates
3. ✅ Multi-region configuration parsing works correctly
4. ✅ Stack names include region suffixes
5. ✅ Resource naming includes region identifiers

## Dependencies

No new dependencies added. Removed problematic `uuid` dependency usage by replacing with CDK native functionality.

## Region Support Matrix

| Region | Region Code | Instance Type | Architecture | Status |
|--------|-------------|---------------|--------------|--------|
| Sydney | ap-southeast-2 | t4g.small | ARM64 (Graviton) | ✅ Supported |
| Melbourne | ap-southeast-4 | t3.small | x86 (Intel) | ✅ Supported |
| Frankfurt | eu-central-1 | t4g.small | ARM64 (Graviton) | ✅ Newly Added |

## Security Considerations

1. **Secrets Management**: Each region has its own Secret in Secrets Manager
2. **Network Isolation**: Each regional deployment is independent
3. **Resource Naming**: Region suffixes prevent accidental cross-region access
4. **VPN Configuration**: Each region requires separate VPN setup

## Cost Implications

Adding Frankfurt region will incur additional costs:
- EC2 instances: ~$15/month (t4g.small)
- EFS storage: ~$0.30/GB/month
- NLB: ~$20/month
- VPN: ~$36/month (if configured)
- Data transfer: Variable

**Total estimated cost per region**: ~$70-75 USD/month

## Future Enhancements

Potential future improvements:
1. Support for additional AWS regions
2. Cross-region DNS failover
3. Automated region health checking
4. Consolidated monitoring dashboard
5. Terraform equivalent for alternative IaC option

## Contributors

Changes implemented to support multi-region deployment with Frankfurt region addition.

## References

- AWS CDK Documentation: https://docs.aws.amazon.com/cdk/
- Pi-hole Documentation: https://docs.pi-hole.net/
- AWS Multi-Region Architecture: https://aws.amazon.com/solutions/implementations/multi-region-infrastructure-deployment/
