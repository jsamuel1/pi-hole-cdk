# Pi-Hole CDK Deployment Guide

This guide explains how to deploy the Pi-Hole CDK stack in different AWS regions, including the newly added Frankfurt region.

## Available Regions

The stack can be deployed in the following regions:

- Sydney (ap-southeast-2)
- Melbourne (ap-southeast-4)
- Frankfurt (eu-central-1) - *New!*

## Prerequisites

Before deploying the stack, ensure you have:

1. AWS CLI installed and configured
2. Node.js and npm installed
3. CDK installed globally (`npm install -g aws-cdk`)
4. A VPC already created in the target region
5. A key pair for SSH access in the target region

## Deployment Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd pi-hole-cdk
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Deployment Parameters

You can configure the deployment using CDK context parameters. Create a `cdk.context.json` file in the root directory with the following content:

```json
{
  "vpc_name": "your-vpc-name",
  "keypair": "your-keypair-name",
  "local_ip": "your-public-ip",
  "local_internal_cidr": "your-internal-network-cidr",
  "public_http": "True",
  "region": "eu-central-1"
}
```

Replace the values with your specific configuration:
- `vpc_name`: The name of your VPC in the target region
- `keypair`: The name of your EC2 key pair in the target region
- `local_ip`: Your public IP address for security group rules
- `local_internal_cidr`: Your internal network CIDR (e.g., "192.168.0.0/16")
- `public_http`: Set to "True" to expose the Pi-Hole admin interface via a public ALB
- `region`: The AWS region to deploy to (e.g., "eu-central-1" for Frankfurt)

### 4. Deploy the Stack

To deploy the stack to the Frankfurt region:

```bash
cdk deploy --all --context region=eu-central-1
```

Or to use the region specified in your context file:

```bash
cdk deploy --all
```

### 5. Region-Specific Considerations

#### Frankfurt (eu-central-1)

When deploying to Frankfurt:
- The stack will automatically use Intel-based EC2 instances (t3.small)
- Stack names will include the "-frankfurt" suffix for easy identification
- All resources will be created in the eu-central-1 region

#### Sydney (ap-southeast-2) and Melbourne (ap-southeast-4)

When deploying to Sydney or Melbourne:
- The stack will use ARM-based EC2 instances (t4g.small)
- Stack names will include the region name suffix ("-sydney" or "-melbourne")

## Post-Deployment

After deployment, the CDK will output several important values:

- `PiHoleCdkStack-frankfurt.adminurl`: The URL to access the Pi-Hole admin interface
- `PiHoleCdkStack-frankfurt.dns1` and `PiHoleCdkStack-frankfurt.dns2`: The IP addresses of the Pi-Hole DNS servers
- `PiHoleCdkStack-frankfurt.SecretArn`: The ARN of the secret containing the Pi-Hole admin password

To retrieve the Pi-Hole admin password:

```bash
aws secretsmanager get-secret-value --secret-id pihole-pwd --region eu-central-1 --query SecretString --output text
```

## Cleanup

To remove all resources:

```bash
cdk destroy --all --context region=eu-central-1
```

## Troubleshooting

If you encounter issues during deployment:

1. Ensure your AWS credentials are correctly configured
2. Verify that the VPC and key pair exist in the target region
3. Check that your local IP is correctly specified in the context
4. Review CloudFormation events in the AWS Console for detailed error messages