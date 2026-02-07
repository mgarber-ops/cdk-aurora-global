# Deployment Guide

This document provides detailed instructions for deploying the Aurora Global Database infrastructure.

## Prerequisites

Before deploying, ensure:

1. **AWS CLI configured** with appropriate credentials:
   ```bash
   aws configure
   aws sts get-caller-identity  # Verify credentials
   ```

2. **CDK bootstrapped** in both regions:
   ```bash
   export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   cdk bootstrap aws://${AWS_ACCOUNT}/us-east-1
   cdk bootstrap aws://${AWS_ACCOUNT}/us-west-2
   ```

3. **Dependencies installed**:
   ```bash
   npm install
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

## How Regions Work

**Important**: Regions are specified in the stack definitions (`bin/aurora-global.ts`) using the `env` property:
- `env: { region: 'us-east-1' }` for primary region stacks
- `env: { region: 'us-west-2' }` for secondary region stacks

When you run `cdk deploy StackName`, CDK automatically reads the region from the stack definition and deploys to that region. **You don't need to pass `--region` flags** - CDK handles this automatically.

To verify which region a stack will deploy to:
```bash
cdk synth AuroraGlobalPrimaryStack | grep -A 5 "Resources"
# Or check the stack definition in bin/aurora-global.ts
```

However, ensure:
- Your AWS credentials have access to both regions
- CDK is bootstrapped in both regions (see Prerequisites)
- Your default AWS CLI region doesn't matter - CDK uses the region from the stack definition

## Deployment Order

The stacks have the following dependencies:

```
AuroraGlobalKmsStackPrimary (us-east-1)
    │
    ├──> AuroraGlobalPrimaryStack (us-east-1)
    │         │
    │         └──> AuroraGlobalSecondaryStack (us-west-2)
    │
AuroraGlobalKmsStackSecondary (us-west-2)
    │
    └──> AuroraGlobalPrimaryStack (us-east-1)
```

### Why This Order?

1. **KMS Stacks First**: The primary stack needs encryption keys from both regions to create Secrets Manager secrets with replica regions.

2. **Primary Stack Second**: Creates the Aurora Global Database cluster and the primary Aurora cluster. This must exist before the secondary cluster can join.

3. **Secondary Stack Last**: Creates the replica cluster that joins the existing global database. It requires the global database identifier from the primary stack.

## Deployment Methods

### Method 1: Automated Script (Recommended)

The easiest way to deploy everything:

```bash
./deploy.sh
```

This script:
- Checks prerequisites
- Deploys stacks in the correct order
- Provides progress feedback
- Handles errors gracefully

### Method 2: Manual Step-by-Step

If you prefer more control or need to troubleshoot:

#### Step 1: Deploy KMS Stacks

Deploy both KMS stacks (can be done in parallel):

```bash
# Terminal 1 - Primary region KMS (automatically deploys to us-east-1)
cdk deploy AuroraGlobalKmsStackPrimary

# Terminal 2 - Secondary region KMS (automatically deploys to us-west-2)
cdk deploy AuroraGlobalKmsStackSecondary
```

Or sequentially:

```bash
# CDK automatically deploys to us-east-1 based on stack definition
cdk deploy AuroraGlobalKmsStackPrimary

# CDK automatically deploys to us-west-2 based on stack definition
cdk deploy AuroraGlobalKmsStackSecondary
```

**Note**: No `--region` flags needed! The region is specified in the stack's `env` property.

**Expected Output**: Both stacks should show KMS key ARNs in their outputs.

#### Step 2: Deploy Primary Stack

```bash
# Automatically deploys to us-east-1 (region specified in stack definition)
cdk deploy AuroraGlobalPrimaryStack
```

**Expected Output**:
- VPC ID
- Cluster endpoint
- Cluster ARN
- Secret ARN
- Global Database Identifier

**Wait for**: The Aurora cluster to be fully available (this can take 10-15 minutes).

#### Step 3: Deploy Secondary Stack

```bash
# Automatically deploys to us-west-2 (region specified in stack definition)
cdk deploy AuroraGlobalSecondaryStack
```

**Expected Output**:
- VPC ID
- Cluster identifier

**Wait for**: The replica cluster to join the global database (this can take 10-15 minutes).

## Verification

After deployment, verify everything is working:

### 1. Check Stack Status

```bash
cdk list
```

All stacks should be listed.

### 2. Verify Global Database

```bash
# Check global database status
aws rds describe-global-clusters \
  --global-cluster-identifier aurora-global-cluster \
  --region us-east-1

# Check primary cluster
aws rds describe-db-clusters \
  --db-cluster-identifier aurora-global-cluster \
  --region us-east-1

# Check secondary cluster
aws rds describe-db-clusters \
  --db-cluster-identifier aurora-global-replica-cluster \
  --region us-west-2
```

### 3. Verify Secrets

```bash
# Check primary secret
aws secretsmanager describe-secret \
  --secret-id $(aws cloudformation describe-stacks \
    --stack-name AuroraGlobalPrimaryStack \
    --query 'Stacks[0].Outputs[?OutputKey==`SecretArn`].OutputValue' \
    --output text \
    --region us-east-1) \
  --region us-east-1

# Check replica secret (should be replicated)
aws secretsmanager list-secrets \
  --region us-west-2 \
  --filters Key=name,Values=aurora-global
```

### 4. Test Connectivity

```bash
# Get cluster endpoint
PRIMARY_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name AuroraGlobalPrimaryStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' \
  --output text \
  --region us-east-1)

echo "Primary endpoint: $PRIMARY_ENDPOINT"
```

## Troubleshooting

### Issue: "KMS key not found"

**Solution**: Ensure both KMS stacks are deployed before the primary stack.

### Issue: "Global cluster not found" when deploying secondary stack

**Solution**: Wait for the primary stack deployment to complete fully. The Aurora cluster must be in "available" status before the secondary stack can join.

### Issue: Cross-region reference errors

**Solution**: Ensure CDK is bootstrapped in both regions with the same account.

### Issue: Stack deployment hangs

**Solution**: Aurora cluster creation can take 10-15 minutes. Check CloudFormation console for progress. Do not cancel the deployment.

## Rollback

If a deployment fails:

1. **Do not destroy stacks** until you understand the failure
2. **Check CloudFormation events** for error details
3. **Fix the issue** and redeploy the failed stack
4. If necessary, destroy in reverse order (see DESTROY.md)

## Next Steps

After successful deployment:

1. Configure VPC peering (if needed)
2. Deploy Lambda functions
3. Configure security groups
4. Test connectivity and failover scenarios

See the main README.md for usage instructions.
