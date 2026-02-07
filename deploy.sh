#!/bin/bash
# Deployment script for Aurora Global Database CDK stacks
# This script deploys stacks in the correct order based on dependencies
#
# Note: Regions are specified in the stack definitions (bin/aurora-global.ts),
# so no --region flags are needed. CDK automatically deploys to the correct region.

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo -e "${RED}Error: CDK CLI not found. Please install it with: npm install -g aws-cdk${NC}"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured. Please run 'aws configure'${NC}"
    exit 1
fi

echo -e "${GREEN}Starting Aurora Global Database deployment...${NC}"
echo ""

# Step 1: Deploy KMS stacks (can be done in parallel)
echo -e "${YELLOW}Step 1: Deploying KMS stacks in both regions...${NC}"
echo "Deploying AuroraGlobalKmsStackPrimary (us-east-1)..."
cdk deploy AuroraGlobalKmsStackPrimary --require-approval never

echo "Deploying AuroraGlobalKmsStackSecondary (us-west-2)..."
cdk deploy AuroraGlobalKmsStackSecondary --require-approval never

echo -e "${GREEN}✓ KMS stacks deployed successfully${NC}"
echo ""

# Step 2: Deploy Primary Stack
echo -e "${YELLOW}Step 2: Deploying Primary Stack (us-east-1)...${NC}"
echo "This creates the Aurora Global Database cluster and primary cluster..."
cdk deploy AuroraGlobalPrimaryStack --require-approval never

echo -e "${GREEN}✓ Primary stack deployed successfully${NC}"
echo ""

# Step 3: Deploy Secondary Stack
echo -e "${YELLOW}Step 3: Deploying Secondary Stack (us-west-2)...${NC}"
echo "This creates the replica cluster in the secondary region..."
cdk deploy AuroraGlobalSecondaryStack --require-approval never

echo -e "${GREEN}✓ Secondary stack deployed successfully${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All stacks deployed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "To view stack outputs:"
echo "  cdk list"
echo ""
echo "To destroy all stacks (in reverse order):"
echo "  ./destroy.sh"
