# 🏴‍☠️ GitHub Actions Quick Reference Card ⚓

Ahoy! This be yer quick reference fer the GitHub Actions workflows, matey!

## 🚀 Quick Start

### 1. Setup Self-Hosted Runner
```bash
# In yer AWS account, configure a runner with:
Label: pi-hole-cdk
IAM Role: CDK deployment permissions
Node.js: 18+
```

### 2. Add GitHub Secrets
```
Settings → Secrets and variables → Actions → New repository secret

AWS_ACCOUNT_ID         = 123456789012
LOCAL_IP               = 121.121.4.100
LOCAL_INTERNAL_CIDR    = 192.168.0.0/16
```

### 3. Deploy!
```bash
# Automatic: Push to main
git push origin main

# Manual: Go to Actions tab → Select workflow → Run workflow
```

## 📋 Workflow Overview

| Workflow | Trigger | Stacks | Regions |
|----------|---------|--------|---------|
| **Multiregion_PiHole_Deploy** | Push to main | EC2 + ECS | 3 regions |
| **Multiregion_SiteToSiteVPN_Deploy** | Manual | VPN | 2 regions |
| **Multiregion_TgwWithSiteToSiteVPN_Deploy** | Manual | TGW+VPN | 3 regions |

## 🗺️ Regions

- **ap-southeast-2** (Sydney)
- **ap-southeast-4** (Melbourne)  
- **us-west-1** (San Francisco)

## 🎯 Issue #20: ECS Migration

The main workflow deploys **both** stacks:
- ✅ PiHoleCdkStack (EC2 Auto Scaling)
- ✅ PiHoleEcsManagedStack (ECS Managed)

This allows gradual migration from EC2 to ECS!

## 📚 Documentation

- [Workflows README](./.github/workflows/README.md)
- [Migration Guide](./.github/CODECATALYST-TO-GITHUB-MIGRATION.md)
- [ECS Migration Guide](../ECS-MIGRATION-GUIDE.md)

Arrr! Happy sailin'! 🏴‍☠️⚓
