#!/bin/bash
# Destruction script for Aurora Global Database CDK stacks
# This script destroys stacks in the reverse order of deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Aurora Global Database destruction...${NC}"
echo -e "${RED}WARNING: This will destroy all resources!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Destruction cancelled."
    exit 0
fi

echo ""

# Step 1: Destroy Secondary Stack
echo -e "${YELLOW}Step 1: Destroying Secondary Stack (us-west-2)...${NC}"
cdk destroy AuroraGlobalSecondaryStack --force || echo "Secondary stack may not exist or already destroyed"

echo ""

# Step 2: Destroy Primary Stack
echo -e "${YELLOW}Step 2: Destroying Primary Stack (us-east-1)...${NC}"
cdk destroy AuroraGlobalPrimaryStack --force || echo "Primary stack may not exist or already destroyed"

echo ""

# Step 3: Destroy KMS Stacks
echo -e "${YELLOW}Step 3: Destroying KMS stacks...${NC}"
echo "Destroying AuroraGlobalKmsStackSecondary (us-west-2)..."
cdk destroy AuroraGlobalKmsStackSecondary --force || echo "Secondary KMS stack may not exist or already destroyed"

echo "Destroying AuroraGlobalKmsStackPrimary (us-east-1)..."
cdk destroy AuroraGlobalKmsStackPrimary --force || echo "Primary KMS stack may not exist or already destroyed"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Destruction complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Note: KMS keys have RemovalPolicy.RETAIN and may need manual deletion${NC}"
echo "To delete KMS keys manually:"
echo "  aws kms schedule-key-deletion --key-id <key-id> --pending-window-in-days 7"
