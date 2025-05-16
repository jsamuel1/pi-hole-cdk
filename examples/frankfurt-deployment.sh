#!/bin/bash
# Frankfurt Deployment Example Script
# This script demonstrates how to deploy the Pi-Hole CDK stack to the Frankfurt region

# Set your variables here
LOCAL_IP="YOUR_PUBLIC_IP"  # Replace with your public IP address
VPC_NAME="YOUR_VPC_NAME"   # Replace with your VPC name in Frankfurt
KEYPAIR="YOUR_KEYPAIR"     # Replace with your keypair name in Frankfurt
LOCAL_CIDR="192.168.0.0/16"  # Replace with your local network CIDR

# Make sure AWS CLI is configured for Frankfurt region
export AWS_DEFAULT_REGION=eu-central-1

# Check if the VPC exists
echo "Checking if VPC '$VPC_NAME' exists in Frankfurt region..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=$VPC_NAME" --query "Vpcs[0].VpcId" --output text)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
  echo "Error: VPC '$VPC_NAME' not found in Frankfurt region."
  echo "Please create a VPC first or specify an existing VPC."
  exit 1
fi

echo "VPC found: $VPC_ID"

# Check if the keypair exists
echo "Checking if keypair '$KEYPAIR' exists in Frankfurt region..."
KEY_EXISTS=$(aws ec2 describe-key-pairs --key-names "$KEYPAIR" --query "KeyPairs[0].KeyName" --output text 2>/dev/null || echo "")

if [ "$KEY_EXISTS" == "" ]; then
  echo "Error: Keypair '$KEYPAIR' not found in Frankfurt region."
  echo "Please create a keypair first or specify an existing keypair."
  exit 1
fi

echo "Keypair found: $KEYPAIR"

# Deploy the stack
echo "Deploying Pi-Hole CDK stack to Frankfurt region..."
cdk deploy \
  -c region=eu-central-1 \
  -c local_ip=$LOCAL_IP \
  -c vpc_name=$VPC_NAME \
  -c keypair=$KEYPAIR \
  -c local_internal_cidr=$LOCAL_CIDR \
  -c public_http=True \
  --all

# Get the Pi-Hole admin password
echo "Retrieving Pi-Hole admin password..."
aws secretsmanager get-secret-value --secret-id pihole-pwd --region eu-central-1 --query SecretString --output text

echo "Deployment complete!"
echo "Please check the outputs above for the Pi-Hole admin URL and DNS server IPs."
echo "For more information, see the DEPLOYMENT.md file."