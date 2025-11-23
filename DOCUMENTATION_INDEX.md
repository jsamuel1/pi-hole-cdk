# Pi-hole CDK Documentation Index

Complete documentation for deploying Pi-hole infrastructure to AWS using CDK, with multi-region support including Frankfurt (eu-central-1), Sydney (ap-southeast-2), and Melbourne (ap-southeast-4).

## 📚 Documentation Structure

### Getting Started

#### 1. [README.md](README.md) - Project Overview
**Purpose**: Quick introduction and basic usage  
**Audience**: All users  
**Contents**:
- Project overview
- Prerequisites
- Quick start examples
- Basic configuration options
- Resource naming conventions

**Start here if**: You're new to the project and want a quick overview

---

### Deployment Guides

#### 2. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Comprehensive Deployment Guide
**Purpose**: Detailed deployment instructions for all scenarios  
**Audience**: All users deploying to any region  
**Contents**:
- Complete prerequisites checklist
- Architecture diagrams
- All deployment scenarios (single region, multi-region, specific stacks)
- Configuration reference
- Post-deployment setup
- Troubleshooting
- Maintenance procedures
- Cost information

**Start here if**: You need complete, detailed deployment instructions

#### 3. [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md) - Frankfurt Quick Start
**Purpose**: Streamlined Frankfurt-specific deployment guide  
**Audience**: Users deploying specifically to Frankfurt region  
**Contents**:
- Quick start instructions
- Frankfurt-specific prerequisites
- Step-by-step deployment process
- Frankfurt-specific troubleshooting
- Regional cost estimates (EUR)
- GDPR compliance considerations
- Advanced Frankfurt configurations

**Start here if**: You're deploying specifically to Frankfurt and want focused instructions

#### 4. [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md) - Deployment Checklist
**Purpose**: Interactive checklist for Frankfurt deployment  
**Audience**: Users following a structured deployment process  
**Contents**:
- Pre-deployment checklist
- Deployment execution checklist
- VPN configuration checklist
- Pi-hole configuration checklist
- Testing and validation checklist
- Troubleshooting checklist
- Success criteria

**Start here if**: You prefer a checklist-driven deployment approach

---

### Reference Documentation

#### 5. [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md) - Complete Configuration Reference
**Purpose**: Comprehensive reference for all configuration options  
**Audience**: Users needing detailed parameter documentation  
**Contents**:
- All configuration methods
- Complete context parameter reference
- Region-specific configuration details
- Deployment scenario examples
- Resource configuration details
- Environment variables
- Best practices

**Start here if**: You need to understand all available configuration options

#### 6. [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Troubleshooting Guide
**Purpose**: Comprehensive troubleshooting for all deployment issues  
**Audience**: Users encountering deployment or operational issues  
**Contents**:
- Pre-deployment issues
- VPC and network issues
- Key pair and SSH issues
- Instance capacity issues
- Secrets Manager issues
- Multi-region deployment issues
- VPN connectivity issues
- Monitoring and logging issues
- Emergency procedures

**Start here if**: Something isn't working and you need to diagnose the problem

---

### Technical Documentation

#### 7. [CHANGES.md](CHANGES.md) - Multi-Region Implementation Changes
**Purpose**: Technical summary of multi-region implementation  
**Audience**: Developers and technical users  
**Contents**:
- Implementation details
- Code changes summary
- Architecture changes
- Migration guide
- Testing validation
- Region support matrix

**Start here if**: You want to understand the technical implementation

#### 8. [SUMMARY.md](SUMMARY.md) - Project Summary
**Purpose**: High-level project summary  
**Audience**: Stakeholders and managers  
**Contents**:
- Project overview
- Key features
- Supported regions
- Use cases

**Start here if**: You need a high-level project overview

---

### Configuration Files

#### 9. [cdk.context.example.json](cdk.context.example.json) - Example Context File
**Purpose**: Template for CDK context configuration  
**Audience**: All users  
**Contents**:
- Example single-region configuration
- Example multi-region configuration
- All available parameters with comments

**Use this**: As a template for your own cdk.context.json file

#### 10. [deploy-multi-region.sh](deploy-multi-region.sh) - Deployment Script
**Purpose**: Automated deployment script  
**Audience**: Users preferring scripted deployment  
**Contents**:
- Command-line argument parsing
- Configuration validation
- Dry-run capability
- Interactive deployment

**Use this**: For simplified command-line deployments

---

## 🎯 Quick Navigation by User Type

### New User - First Time Deployment

1. Start: [README.md](README.md) - Understand the project
2. Then: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md) - Follow quick start
3. Use: [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md) - Track progress
4. Reference: [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - If issues arise

### Experienced User - Multi-Region Deployment

1. Review: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Multi-region scenarios
2. Reference: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md) - Advanced options
3. Use: [deploy-multi-region.sh](deploy-multi-region.sh) - Automate deployment
4. Check: [CHANGES.md](CHANGES.md) - Technical details

### Troubleshooting

1. Primary: [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Comprehensive troubleshooting
2. Secondary: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#troubleshooting - Quick fixes
3. Reference: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md) - Verify configuration

### Configuration Reference

1. Complete: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md) - All parameters
2. Examples: [cdk.context.example.json](cdk.context.example.json) - Template file
3. Specific: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)#configuration-examples

---

## 📖 Documentation by Topic

### Architecture

- **Overview**: [README.md](README.md)#architecture-notes
- **Detailed**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#architecture
- **Changes**: [CHANGES.md](CHANGES.md)#architecture-changes

### Deployment

- **All Scenarios**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#deployment-scenarios
- **Frankfurt Only**: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)
- **Checklist**: [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md)
- **Script**: [deploy-multi-region.sh](deploy-multi-region.sh)

### Configuration

- **Complete Reference**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)
- **Quick Reference**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#configuration-reference
- **Examples**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#configuration-examples
- **Template**: [cdk.context.example.json](cdk.context.example.json)

### Regional Information

#### Frankfurt (eu-central-1)
- **Quick Start**: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)
- **Checklist**: [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md)
- **Configuration**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#frankfurt-eu-central-1-specific
- **Costs**: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)#frankfurt-region-costs

#### Sydney (ap-southeast-2)
- **Configuration**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#sydney-ap-southeast-2-specific
- **Deployment**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#scenario-2-deploy-all-three-regions

#### Melbourne (ap-southeast-4)
- **Configuration**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#melbourne-ap-southeast-4-specific
- **Deployment**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#scenario-2-deploy-all-three-regions

### Troubleshooting

- **Comprehensive Guide**: [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
- **Frankfurt Specific**: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)#frankfurt-specific-troubleshooting
- **Quick Reference**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#troubleshooting

### Operations & Maintenance

- **Updates**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#maintenance-and-updates
- **Monitoring**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#monitoring
- **Backup**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#backup-and-recovery
- **Checklist**: [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md)#monitoring-setup

### Costs & Optimization

- **Overview**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#cost-optimization
- **Frankfurt Specific**: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)#frankfurt-region-costs
- **Best Practices**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#best-practices

### Security

- **Overview**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#security-considerations
- **Frankfurt/GDPR**: [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)#frankfurt-specific-security-considerations
- **Best Practices**: [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#security

---

## 🔍 Common Questions & Where to Find Answers

### "How do I deploy to Frankfurt?"
→ [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md) - Complete Frankfurt guide

### "What configuration options are available?"
→ [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md) - All options explained

### "My deployment is failing, what do I do?"
→ [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Comprehensive troubleshooting

### "How do I deploy to multiple regions?"
→ [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)#scenario-2-deploy-all-three-regions

### "What are the cost implications?"
→ [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md)#frankfurt-region-costs

### "How do I configure VPN?"
→ [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md)#vpn-configuration-checklist

### "What changed with multi-region support?"
→ [CHANGES.md](CHANGES.md) - Technical implementation details

### "Can I use a template for configuration?"
→ [cdk.context.example.json](cdk.context.example.json) - Configuration template

### "Is there an automated deployment script?"
→ [deploy-multi-region.sh](deploy-multi-region.sh) - Deployment automation

---

## 📊 Documentation Maintenance

### Document Owners

- **README.md**: Core team
- **DEPLOYMENT_GUIDE.md**: DevOps team
- **FRANKFURT_DEPLOYMENT_GUIDE.md**: Regional team
- **TROUBLESHOOTING_GUIDE.md**: Support team
- **CONFIGURATION_REFERENCE.md**: Engineering team
- **CHANGES.md**: Development team

### Update Frequency

- **README.md**: As needed with major changes
- **Deployment Guides**: With each release
- **Troubleshooting**: As issues are discovered
- **Configuration Reference**: With new features
- **CHANGES.md**: With each significant update

---

## 🎓 Learning Path

### Beginner

1. [README.md](README.md) - Understand basics
2. [FRANKFURT_DEPLOYMENT_GUIDE.md](FRANKFURT_DEPLOYMENT_GUIDE.md) - Deploy to one region
3. [FRANKFURT_DEPLOYMENT_CHECKLIST.md](FRANKFURT_DEPLOYMENT_CHECKLIST.md) - Follow checklist
4. [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Learn common issues

### Intermediate

1. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - All deployment scenarios
2. [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md) - Advanced configuration
3. [deploy-multi-region.sh](deploy-multi-region.sh) - Automation
4. Multi-region deployment practice

### Advanced

1. [CHANGES.md](CHANGES.md) - Technical implementation
2. Custom modifications to stacks
3. [CONFIGURATION_REFERENCE.md](CONFIGURATION_REFERENCE.md)#best-practices - Optimization
4. Multi-region architecture design

---

## 🔗 External Resources

- **AWS CDK Documentation**: https://docs.aws.amazon.com/cdk/
- **AWS Multi-Region Guide**: https://docs.aws.amazon.com/whitepapers/latest/aws-multi-region-fundamentals/
- **Pi-hole Documentation**: https://docs.pi-hole.net/
- **AWS VPN Documentation**: https://docs.aws.amazon.com/vpn/
- **Frankfurt Region Info**: https://aws.amazon.com/about-aws/global-infrastructure/regions_az/

---

## 📝 Documentation Feedback

Found an issue or have a suggestion? 
- Create an issue in the repository
- Propose documentation improvements via pull request
- Contact the documentation team

---

**Last Updated**: Documentation index current as of latest commit  
**Maintained By**: Pi-hole CDK Project Team