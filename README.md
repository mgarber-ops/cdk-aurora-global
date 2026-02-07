# Aurora Global Database CDK Project

A comprehensive CDK TypeScript project demonstrating Aurora Global Database infrastructure deployment across two AWS regions (us-east-1 and us-west-2).

## Overview

This project showcases:

- **Aurora Global Database** spanning us-east-1 (primary) and us-west-2 (secondary)
- **Aurora Serverless v2** clusters in both regions
- **Cross-region replication** with write-forwarding enabled on the secondary region
- **Encrypted secrets** using KMS keys in both regions
- **VPC infrastructure** with public and private subnets in both regions

## Architecture

- **Primary Region (us-east-1)**: Aurora Serverless v2 cluster, VPC, KMS key, Secrets Manager secret
- **Secondary Region (us-west-2)**: Aurora replica cluster with write-forwarding, VPC, KMS key, replicated secret
- **Cross-Region**: Global database cluster managing replication between regions

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm
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
│   │   ├── kms-stack.ts             # KMS key stack
│   │   ├── primary-stack.ts         # Primary region stack
│   │   └── secondary-stack.ts       # Secondary region stack
│   └── utils/                       # Utility functions
│       └── vpc-cidr.ts              # VPC CIDR helper
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

After deployment, you can connect to the Aurora Global Database using the cluster endpoints:

### Primary Region Endpoints

- **Cluster Endpoint**: Available via stack output `ClusterEndpoint`
- **Reader Endpoint**: Available via the cluster's reader endpoint
- **Global Writer Endpoint**: Use the global cluster identifier to connect to the global writer endpoint

### Secondary Region Endpoints

- **Cluster Endpoint**: Available via stack output `ClusterIdentifier`
- **Write-Forwarding**: Enabled, allowing writes to be forwarded to the primary region

### Connecting to the Database

Use the secret ARN from the stack outputs to retrieve database credentials:

```bash
# Get database credentials
aws secretsmanager get-secret-value \
  --secret-id <SecretArn> \
  --query SecretString \
  --output text | jq -r '.password'
```

Connect using PostgreSQL client:

```bash
# Connect to primary cluster
psql -h <ClusterEndpoint> -U postgres -d auroraglobaldb

# Connect to global writer endpoint
psql -h aurora-global-cluster.cluster-xxxxx.us-east-1.rds.amazonaws.com -U postgres -d auroraglobaldb
```

## Monitoring

Monitor your Aurora Global Database using:
- **CloudWatch Logs**: PostgreSQL logs exported to CloudWatch
- **RDS Performance Insights**: Available for Aurora Serverless v2
- **CloudWatch Metrics**: Standard RDS metrics for both clusters

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture details
- [FAILOVER_SCENARIOS.md](docs/FAILOVER_SCENARIOS.md) - Failover scenario documentation
- [ENDPOINT_TYPES.md](docs/ENDPOINT_TYPES.md) - Endpoint type comparison
- [FAILOVER_ARCHITECTURE.md](docs/FAILOVER_ARCHITECTURE.md) - Failover architecture details

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
