#!/bin/bash

# Multi-region Pi-hole deployment script
# This script demonstrates how to deploy Pi-hole to multiple regions

set -e

# Configuration
LOCAL_IP="${LOCAL_IP:-}"
LOCAL_INTERNAL_CIDR="${LOCAL_INTERNAL_CIDR:-192.168.0.0/16}"
DEFAULT_VPC_NAME="${DEFAULT_VPC_NAME:-aws-controltower-VPC}"
DEFAULT_KEYPAIR="${DEFAULT_KEYPAIR:-pihole}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -i, --local-ip IP           Your external IP address (required)"
    echo "  -c, --local-cidr CIDR       Your internal network CIDR (default: 192.168.0.0/16)"
    echo "  -v, --vpc-name NAME         Default VPC name (default: aws-controltower-VPC)"
    echo "  -k, --keypair NAME          Default keypair name (default: pihole)"
    echo "  -r, --regions REGIONS       Comma-separated list of regions (default: ap-southeast-2,ap-southeast-4,eu-central-1)"
    echo "  -p, --public-http           Enable public HTTP access (default: false)"
    echo "  --sydney-vpc NAME           Sydney-specific VPC name"
    echo "  --sydney-keypair NAME       Sydney-specific keypair name"
    echo "  --melbourne-vpc NAME        Melbourne-specific VPC name"
    echo "  --melbourne-keypair NAME    Melbourne-specific keypair name"
    echo "  --frankfurt-vpc NAME        Frankfurt-specific VPC name"
    echo "  --frankfurt-keypair NAME    Frankfurt-specific keypair name"
    echo "  --dry-run                   Show deployment command without executing"
    echo "  -h, --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  # Deploy to all supported regions with default settings"
    echo "  $0 -i 203.123.45.67"
    echo ""
    echo "  # Deploy to specific regions"
    echo "  $0 -i 203.123.45.67 -r ap-southeast-2,eu-central-1"
    echo ""
    echo "  # Deploy with region-specific VPCs"
    echo "  $0 -i 203.123.45.67 --sydney-vpc sydney-vpc --frankfurt-vpc frankfurt-vpc"
}

# Parse command line arguments
REGIONS="ap-southeast-2,ap-southeast-4,eu-central-1"
PUBLIC_HTTP="false"
DRY_RUN=false
SYDNEY_VPC=""
SYDNEY_KEYPAIR=""
MELBOURNE_VPC=""
MELBOURNE_KEYPAIR=""
FRANKFURT_VPC=""
FRANKFURT_KEYPAIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--local-ip)
            LOCAL_IP="$2"
            shift 2
            ;;
        -c|--local-cidr)
            LOCAL_INTERNAL_CIDR="$2"
            shift 2
            ;;
        -v|--vpc-name)
            DEFAULT_VPC_NAME="$2"
            shift 2
            ;;
        -k|--keypair)
            DEFAULT_KEYPAIR="$2"
            shift 2
            ;;
        -r|--regions)
            REGIONS="$2"
            shift 2
            ;;
        -p|--public-http)
            PUBLIC_HTTP="true"
            shift
            ;;
        --sydney-vpc)
            SYDNEY_VPC="$2"
            shift 2
            ;;
        --sydney-keypair)
            SYDNEY_KEYPAIR="$2"
            shift 2
            ;;
        --melbourne-vpc)
            MELBOURNE_VPC="$2"
            shift 2
            ;;
        --melbourne-keypair)
            MELBOURNE_KEYPAIR="$2"
            shift 2
            ;;
        --frankfurt-vpc)
            FRANKFURT_VPC="$2"
            shift 2
            ;;
        --frankfurt-keypair)
            FRANKFURT_KEYPAIR="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$LOCAL_IP" ]]; then
    echo -e "${RED}Error: Local IP address is required. Use -i or --local-ip${NC}"
    print_usage
    exit 1
fi

# Convert comma-separated regions to JSON array
IFS=',' read -ra REGION_ARRAY <<< "$REGIONS"
DEPLOYMENT_REGIONS="["
for i in "${!REGION_ARRAY[@]}"; do
    if [[ $i -gt 0 ]]; then
        DEPLOYMENT_REGIONS="${DEPLOYMENT_REGIONS},"
    fi
    DEPLOYMENT_REGIONS="${DEPLOYMENT_REGIONS}\"${REGION_ARRAY[i]}\""
done
DEPLOYMENT_REGIONS="${DEPLOYMENT_REGIONS}]"

# Build region configs if any region-specific settings are provided
REGION_CONFIGS=""
if [[ -n "$SYDNEY_VPC" || -n "$SYDNEY_KEYPAIR" || -n "$MELBOURNE_VPC" || -n "$MELBOURNE_KEYPAIR" || -n "$FRANKFURT_VPC" || -n "$FRANKFURT_KEYPAIR" ]]; then
    REGION_CONFIGS="{"
    
    # Sydney config
    if [[ -n "$SYDNEY_VPC" || -n "$SYDNEY_KEYPAIR" ]]; then
        REGION_CONFIGS="${REGION_CONFIGS}\"ap-southeast-2\":{"
        if [[ -n "$SYDNEY_VPC" ]]; then
            REGION_CONFIGS="${REGION_CONFIGS}\"vpc_name\":\"$SYDNEY_VPC\""
        fi
        if [[ -n "$SYDNEY_KEYPAIR" ]]; then
            if [[ -n "$SYDNEY_VPC" ]]; then
                REGION_CONFIGS="${REGION_CONFIGS},"
            fi
            REGION_CONFIGS="${REGION_CONFIGS}\"keypair\":\"$SYDNEY_KEYPAIR\""
        fi
        REGION_CONFIGS="${REGION_CONFIGS}}"
    fi
    
    # Melbourne config
    if [[ -n "$MELBOURNE_VPC" || -n "$MELBOURNE_KEYPAIR" ]]; then
        if [[ "$REGION_CONFIGS" != "{" ]]; then
            REGION_CONFIGS="${REGION_CONFIGS},"
        fi
        REGION_CONFIGS="${REGION_CONFIGS}\"ap-southeast-4\":{"
        if [[ -n "$MELBOURNE_VPC" ]]; then
            REGION_CONFIGS="${REGION_CONFIGS}\"vpc_name\":\"$MELBOURNE_VPC\""
        fi
        if [[ -n "$MELBOURNE_KEYPAIR" ]]; then
            if [[ -n "$MELBOURNE_VPC" ]]; then
                REGION_CONFIGS="${REGION_CONFIGS},"
            fi
            REGION_CONFIGS="${REGION_CONFIGS}\"keypair\":\"$MELBOURNE_KEYPAIR\""
        fi
        REGION_CONFIGS="${REGION_CONFIGS},\"use_intel\":true}"
    fi
    
    # Frankfurt config
    if [[ -n "$FRANKFURT_VPC" || -n "$FRANKFURT_KEYPAIR" ]]; then
        if [[ "$REGION_CONFIGS" != "{" ]]; then
            REGION_CONFIGS="${REGION_CONFIGS},"
        fi
        REGION_CONFIGS="${REGION_CONFIGS}\"eu-central-1\":{"
        if [[ -n "$FRANKFURT_VPC" ]]; then
            REGION_CONFIGS="${REGION_CONFIGS}\"vpc_name\":\"$FRANKFURT_VPC\""
        fi
        if [[ -n "$FRANKFURT_KEYPAIR" ]]; then
            if [[ -n "$FRANKFURT_VPC" ]]; then
                REGION_CONFIGS="${REGION_CONFIGS},"
            fi
            REGION_CONFIGS="${REGION_CONFIGS}\"keypair\":\"$FRANKFURT_KEYPAIR\""
        fi
        REGION_CONFIGS="${REGION_CONFIGS}}"
    fi
    
    REGION_CONFIGS="${REGION_CONFIGS}}"
fi

# Build CDK command
CDK_CMD="cdk deploy"
CDK_CMD="${CDK_CMD} -c local_ip=${LOCAL_IP}"
CDK_CMD="${CDK_CMD} -c local_internal_cidr=${LOCAL_INTERNAL_CIDR}"
CDK_CMD="${CDK_CMD} -c deployment_regions='${DEPLOYMENT_REGIONS}'"
CDK_CMD="${CDK_CMD} -c vpc_name=${DEFAULT_VPC_NAME}"
CDK_CMD="${CDK_CMD} -c keypair=${DEFAULT_KEYPAIR}"
CDK_CMD="${CDK_CMD} -c public_http=${PUBLIC_HTTP}"

if [[ -n "$REGION_CONFIGS" ]]; then
    CDK_CMD="${CDK_CMD} -c region_configs='${REGION_CONFIGS}'"
fi

CDK_CMD="${CDK_CMD} --all"

# Display configuration summary
echo -e "${GREEN}Pi-hole Multi-Region Deployment Configuration:${NC}"
echo -e "  Local IP: ${YELLOW}${LOCAL_IP}${NC}"
echo -e "  Local CIDR: ${YELLOW}${LOCAL_INTERNAL_CIDR}${NC}"
echo -e "  Target Regions: ${YELLOW}${REGIONS}${NC}"
echo -e "  Default VPC: ${YELLOW}${DEFAULT_VPC_NAME}${NC}"
echo -e "  Default Keypair: ${YELLOW}${DEFAULT_KEYPAIR}${NC}"
echo -e "  Public HTTP: ${YELLOW}${PUBLIC_HTTP}${NC}"

if [[ -n "$REGION_CONFIGS" ]]; then
    echo -e "  Region-specific configs: ${YELLOW}Yes${NC}"
fi

echo ""
echo -e "${GREEN}Deployment Command:${NC}"
echo "${CDK_CMD}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}Dry run mode - not executing deployment${NC}"
    exit 0
fi

# Confirm deployment
read -p "Proceed with deployment? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

# Execute deployment
echo -e "${GREEN}Starting deployment...${NC}"
eval "$CDK_CMD"

echo -e "${GREEN}Deployment completed!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure your router's Site-to-Site VPN using the connection details from the CDK outputs"
echo "2. Update your router's DNS settings to use the Pi-hole DNS endpoints"
echo "3. The Pi-hole admin interface will be available at http://pi.hole/admin once DNS is configured"