# Aurora Global Database CDK Project

A comprehensive CDK TypeScript project demonstrating Aurora Global Database across two AWS regions (us-east-1 and us-west-2) with AWS Lambda functions performing CRUD operations using different endpoint types, including automated failover capabilities.

## Overview

This project showcases:

- **Aurora Global Database** spanning us-east-1 (primary) and us-west-2 (secondary)
- **Python Lambda functions** for CRUD operations against different endpoint types:
  - Global writer endpoint
  - Replica endpoint with write-forwarding enabled
- **Automated failover Lambda functions** that detect region role and trigger failover
- **VPC peering** for cross-region connectivity
- **Concurrent CRUD operations during failover** to measure reliability

## Architecture

- **Primary Region (us-east-1)**: Aurora Serverless v2 cluster, Lambda functions, VPC
- **Secondary Region (us-west-2)**: Aurora replica cluster, Lambda functions, VPC
- **Cross-Region**: VPC peering for Lambda access to Aurora endpoints

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm
- Python 3.11+
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- CDK bootstrapped in both regions:
  ```bash
  cdk bootstrap aws://ACCOUNT/us-east-1
  cdk bootstrap aws://ACCOUNT/us-west-2
  ```

## Project Structure

```
aurora-global-lambda/
├── bin/
│   └── aurora-global.ts              # CDK app entry point
├── lib/
│   ├── stacks/                       # CDK stacks
│   ├── constructs/                   # Reusable constructs
│   └── lambda/                       # Python Lambda functions
│       ├── crud-operations/          # CRUD Lambda handlers
│       └── failover/                 # Failover Lambda handlers
├── docs/                             # Documentation
├── package.json
├── tsconfig.json
└── cdk.json
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies (for Lambda functions):
   ```bash
   cd lib/lambda/crud-operations && pip install -r requirements.txt -t .
   cd ../failover && pip install -r requirements.txt -t .
   ```

## Deployment

The stacks have dependencies and **must be deployed in the correct order**:

### Deployment Order

**Note**: Regions are specified in the stack definitions (`bin/aurora-global.ts`), so CDK automatically deploys to the correct region. No `--region` flags needed.

1. **KMS Stacks** (both regions - can be deployed in parallel):
   - These create encryption keys needed for Secrets Manager
   ```bash
   cdk deploy AuroraGlobalKmsStackPrimary      # → us-east-1 (auto)
   cdk deploy AuroraGlobalKmsStackSecondary    # → us-west-2 (auto)
   ```

2. **Primary Stack** (us-east-1):
   - Creates the Aurora Global Database cluster and primary cluster
   - Requires both KMS keys from Step 1
   ```bash
   cdk deploy AuroraGlobalPrimaryStack          # → us-east-1 (auto)
   ```

3. **Secondary Stack** (us-west-2):
   - Creates the replica cluster in the secondary region
   - Requires the global database identifier from Step 2
   ```bash
   cdk deploy AuroraGlobalSecondaryStack        # → us-west-2 (auto)
   ```

### Automated Deployment

Use the provided deployment script to deploy all stacks in the correct order:

```bash
./deploy.sh
```

This script will:
- Deploy KMS stacks in both regions
- Deploy the Primary stack
- Deploy the Secondary stack
- Handle all dependencies automatically

### Manual Deployment

If you prefer to deploy manually, ensure you follow the order above. **Do not use `cdk deploy --all`** as it may not respect the dependency order.

## Usage

### Invoking CRUD Lambda Functions

**Global Endpoint Lambda** (from primary region):
```bash
aws lambda invoke \
  --function-name <GlobalEndpointLambdaArn> \
  --payload '{"trigger_failover": false, "operations": 10, "operation_type": "mixed"}' \
  response.json
```

**Write-Forwarding Lambda** (from replica region):
```bash
aws lambda invoke \
  --function-name <WriteForwardingLambdaArn> \
  --payload '{"trigger_failover": false, "operations": 10}' \
  response.json
```

### Triggering Failover

**Via API Gateway**:
```bash
curl -X POST https://<FailoverApiUrl>/failover \
  -H "Content-Type: application/json" \
  -d '{"failover_type": "planned"}'
```

**Via Lambda directly**:
```bash
aws lambda invoke \
  --function-name <FailoverLambdaArn> \
  --payload '{"failover_type": "planned"}' \
  response.json
```

### Testing Failover with Concurrent CRUD Operations

To test failover reliability with concurrent operations:

```bash
# Trigger CRUD operations with failover
aws lambda invoke \
  --function-name <GlobalEndpointLambdaArn> \
  --payload '{"trigger_failover": true, "operations": 50, "operation_type": "mixed"}' \
  response.json
```

This will:
1. Asynchronously trigger failover Lambda
2. Immediately begin CRUD operations
3. Continue operations throughout failover
4. Publish metrics to CloudWatch

## Monitoring

View CloudWatch metrics:
- `AuroraGlobalDB/Failover/OperationsDuringFailover`
- `AuroraGlobalDB/Failover/SuccessRate`
- `AuroraGlobalDB/Failover/Latency`
- `AuroraGlobalDB/Failover/RetryCount`

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture details
- [FAILOVER_SCENARIOS.md](docs/FAILOVER_SCENARIOS.md) - Failover scenario documentation
- [ENDPOINT_TYPES.md](docs/ENDPOINT_TYPES.md) - Endpoint type comparison

## Cleanup

To destroy all resources in the correct order (reverse of deployment):

### Automated Cleanup

```bash
./destroy.sh
```

This script will:
- Destroy the Secondary stack first
- Destroy the Primary stack
- Destroy both KMS stacks
- Handle dependencies automatically

### Manual Cleanup

Destroy stacks in reverse order:

```bash
cdk destroy AuroraGlobalSecondaryStack    # us-west-2
cdk destroy AuroraGlobalPrimaryStack       # us-east-1
cdk destroy AuroraGlobalKmsStackSecondary  # us-west-2
cdk destroy AuroraGlobalKmsStackPrimary    # us-east-1
```

**Important Notes**:
- Aurora clusters have `RemovalPolicy.RETAIN` by default. Manual deletion may be required.
- KMS keys have `RemovalPolicy.RETAIN` and will need manual deletion:
  ```bash
  aws kms schedule-key-deletion --key-id <key-id> --pending-window-in-days 7
  ```

## License

Apache-2.0
# cdk-aurora-global
