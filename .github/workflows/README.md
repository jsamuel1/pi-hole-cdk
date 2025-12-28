# 🏴‍☠️ GitHub Actions Workflows fer Pi-hole CDK Deployment ⚓

Ahoy, matey! This directory contains GitHub Actions workflows that be replacin' the CodeCatalyst workflows fer multi-region Pi-hole deployments. Arrr!

## 📦 Available Workflows

### 1. **Multiregion_PiHole_Deploy** 🚢
- **File**: `multiregion-pihole-deploy.yaml`
- **Purpose**: Deploys both PiHoleCdkStack (EC2) and PiHoleEcsManagedStack (ECS) to multiple regions
- **Trigger**: Automatically on push to `main` branch, or manually via workflow_dispatch
- **Regions**: 
  - ap-southeast-2 (Sydney)
  - ap-southeast-4 (Melbourne)
  - us-west-1 (San Francisco)
- **Addresses Issue #20**: Deploys both EC2 and ECS stacks to support gradual migration strategy

### 2. **Multiregion_SiteToSiteVPN_Deploy** 🔐
- **File**: `multiregion-sitetositevpn-deploy.yaml`
- **Purpose**: Deploys SiteToSiteVpnStack to multiple regions
- **Trigger**: Manual only (workflow_dispatch)
- **Regions**: 
  - ap-southeast-2 (Sydney)
  - ap-southeast-4 (Melbourne)

### 3. **Multiregion_TgwWithSiteToSiteVPN_Deploy** 🌐
- **File**: `multiregion-tgw-sitetositevpn-deploy.yaml`
- **Purpose**: Deploys TgwWithSiteToSiteVpnStack (Transit Gateway with Site-to-Site VPN)
- **Trigger**: Manual only (workflow_dispatch)
- **Regions**: 
  - ap-southeast-2 (Sydney)
  - ap-southeast-4 (Melbourne)
  - us-west-1 (San Francisco)

## 🔧 Self-Hosted Runner Requirements

All workflows be configured to run exclusively on **self-hosted runners** with the label: `pi-hole-cdk`

### Runner Setup Requirements:
- Runners must be configured in the target AWS account
- Runners need appropriate IAM permissions fer CDK operations:
  - CloudFormation full access
  - IAM role creation and management
  - EC2, ECS, VPC resource creation
  - Secrets Manager access
  - EFS access
  - S3 access fer CDK bootstrapping
- Node.js 18+ should be available on the runners (or installed via workflow)
- AWS credentials configured via IAM role or environment variables

## 🔐 Required GitHub Secrets

Configure these secrets in yer GitHub repository settings (Settings → Secrets and variables → Actions):

| Secret Name | Description | Example |
|------------|-------------|---------|
| `AWS_ACCOUNT_ID` | The AWS account ID where resources be deployed | `123456789012` |
| `LOCAL_IP` | Yer local router's external IP address | `121.121.4.100` |
| `LOCAL_INTERNAL_CIDR` | Yer internal network CIDR range | `192.168.0.0/16` |

### Optional Secrets:
- `VPC_NAME` - If ye want to override the VPC lookup (can also be in context)
- `KEYPAIR` - SSH keypair name (defaults to "pihole" if not provided)

## 🚀 How to Use These Workflows

### Automatic Deployment (Main Pi-hole Stack)
The **Multiregion_PiHole_Deploy** workflow runs automatically when ye push to the `main` branch:
```bash
git add .
git commit -m "Update Pi-hole configuration"
git push origin main
```

This be equivalent to the original CodeCatalyst `Workflow_ac5a.yaml` behavior! ⚓

### Manual Deployment (VPN Stacks)
Fer VPN deployments, navigate to:
1. GitHub repository → Actions tab
2. Select the workflow ye want to run
3. Click "Run workflow" button
4. Confirm and watch the treasure unfold! 🗺️

## 📊 Workflow Features

Each workflow includes:
- ✅ CDK Bootstrap fer each region
- ✅ CDK Synth to verify templates before deployment
- ✅ Multi-region parallel or sequential deployments
- ✅ Proper dependency management via npm
- ✅ Context passing fer configuration values
- ✅ Automatic approval disabled (`--require-approval never`)

## 🗺️ Migration from CodeCatalyst

### Mapping Table
| CodeCatalyst Workflow | GitHub Actions Workflow | Trigger |
|-----------------------|------------------------|---------|
| `Workflow_ac5a.yaml` | `multiregion-pihole-deploy.yaml` | Push to main |
| `Multiregion_SiteToSiteVPN_Deploy.yaml` | `multiregion-sitetositevpn-deploy.yaml` | Manual |
| `Multiregion_TgwWithSiteToSiteVPN_Deploy.yaml` | `multiregion-tgw-sitetositevpn-deploy.yaml` | Manual |

### Key Differences from CodeCatalyst:
1. **Runner Type**: Self-hosted runners instead of CodeCatalyst managed fleets
2. **Secrets Management**: GitHub Secrets instead of CodeCatalyst Secrets
3. **AWS Authentication**: Handled by self-hosted runner's IAM role
4. **Region Configuration**: Set via environment variables instead of Action configuration
5. **Parallel Execution**: Jobs run in parallel by default (can be configured with `needs:` if sequential required)

## 🔍 Addressing Issue #20: ECS Migration Strategy

The main Pi-hole workflow (**multiregion-pihole-deploy.yaml**) addresses issue #20 by:

1. **Deploying Both Stacks**: Each region deploys both:
   - `PiHoleCdkStack` (original EC2 Auto Scaling approach) 🚢
   - `PiHoleEcsManagedStack` (new ECS Managed Instances approach) ⚓

2. **Supporting Gradual Migration**: This allows:
   - Both stacks to coexist during migration
   - Traffic shifting between stacks as needed
   - Regional rollout at yer own pace
   - Easy rollback if needed

3. **Following Migration Guide**: The workflow implements the strategy outlined in `ECS-MIGRATION-GUIDE.md`:
   - Phase 1-3: Both stacks deployed
   - Phase 4: After successful migration, ye can modify workflow to deploy only ECS stack

### To Complete Migration (Phase 4):
Once ye be satisfied with the ECS stack, edit `multiregion-pihole-deploy.yaml` and remove the EC2 deployment steps:
```yaml
# Comment out or remove these steps:
# - name: Deploy Original EC2 Stack (PiHoleCdkStack) to Sydney 🚢
#   run: |
#     npx cdk deploy PiHoleCdkStack ...
```

## 🛠️ Troubleshooting

### Workflow Fails on Bootstrap
- Verify AWS credentials be properly configured on the self-hosted runner
- Check IAM permissions include S3 and CloudFormation access fer CDK bootstrap

### Workflow Fails on Deploy
- Check CloudWatch logs fer CDK deployment errors
- Verify secrets `LOCAL_IP` and `LOCAL_INTERNAL_CIDR` be correctly set
- Ensure VPC exists in the target regions

### Runner Not Picking Up Jobs
- Verify self-hosted runner be online in GitHub settings
- Check runner has the `pi-hole-cdk` label configured
- Ensure runner process be running

### Need Help Debuggin'?
Check the workflow run logs in the Actions tab fer detailed information about each step! 🔍

## 📚 Related Documentation

- [ECS Migration Guide](../ECS-MIGRATION-GUIDE.md) - Complete migration strategy fer ECS
- [README.md](../README.md) - Main project documentation
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

Arrr! May yer deployments be smooth sailin' and yer DNS always resolve true! 🏴‍☠️⚓🗺️

Fair winds, matey!
