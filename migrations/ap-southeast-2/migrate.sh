#!/bin/bash
# Migration script for PiHoleCdkStack in ap-southeast-2
# This script migrates existing resources to new logical IDs using CloudFormation import

set -e

STACK_NAME="PiHoleCdkStack"
REGION="ap-southeast-2"
PROFILE="sauhsoj+ct+pihole-Admin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Pi-hole CDK Stack Migration ==="
echo "Stack: $STACK_NAME"
echo "Region: $REGION"
echo ""

# Step 1: Synthesize the new template
echo "Step 1: Synthesizing new CDK template..."
cd "$SCRIPT_DIR/../.."
cdk synth $STACK_NAME -c vpc_name=aws-controltower-VPC --profile "$PROFILE" -o cdk.out.migration

# Step 2: Create the import change set
echo ""
echo "Step 2: Creating import change set..."
aws cloudformation create-change-set \
  --stack-name "$STACK_NAME" \
  --change-set-name "MigrateToSharedConstructs" \
  --change-set-type IMPORT \
  --resources-to-import "file://$SCRIPT_DIR/resources-to-import.json" \
  --template-body "file://cdk.out.migration/$STACK_NAME.template.json" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --profile "$PROFILE" \
  --region "$REGION"

echo ""
echo "Step 3: Waiting for change set to be created..."
aws cloudformation wait change-set-create-complete \
  --stack-name "$STACK_NAME" \
  --change-set-name "MigrateToSharedConstructs" \
  --profile "$PROFILE" \
  --region "$REGION"

echo ""
echo "Step 4: Describing change set..."
aws cloudformation describe-change-set \
  --stack-name "$STACK_NAME" \
  --change-set-name "MigrateToSharedConstructs" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'Changes[*].[ResourceChange.Action,ResourceChange.LogicalResourceId,ResourceChange.PhysicalResourceId]' \
  --output table

echo ""
echo "=== Review the changes above ==="
echo ""
read -p "Execute the change set? (yes/no): " CONFIRM

if [ "$CONFIRM" = "yes" ]; then
  echo "Executing change set..."
  aws cloudformation execute-change-set \
    --stack-name "$STACK_NAME" \
    --change-set-name "MigrateToSharedConstructs" \
    --profile "$PROFILE" \
    --region "$REGION"
  
  echo "Waiting for stack update to complete..."
  aws cloudformation wait stack-import-complete \
    --stack-name "$STACK_NAME" \
    --profile "$PROFILE" \
    --region "$REGION"
  
  echo "Migration complete!"
else
  echo "Change set not executed. You can execute it manually with:"
  echo "aws cloudformation execute-change-set --stack-name $STACK_NAME --change-set-name MigrateToSharedConstructs --profile $PROFILE --region $REGION"
fi
