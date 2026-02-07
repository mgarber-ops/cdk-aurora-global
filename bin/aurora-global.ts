#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { PrimaryStack } from '../lib/stacks/primary-stack';
import { SecondaryStack } from '../lib/stacks/secondary-stack';
import { KmsStack } from '../lib/stacks/kms-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT || '';

// Step 1: Deploy KMS Stack to both regions
// Primary region KMS stack (us-east-1)
const primaryKmsStack = new KmsStack(app, 'AuroraGlobalKmsStackPrimary', {
  env: {
    account: account,
    region: 'us-east-1',
  },
  description: 'KMS key stack for encrypting Aurora Global Database secrets (us-east-1)',
});

// Secondary region KMS stack (us-west-2)
const secondaryKmsStack = new KmsStack(app, 'AuroraGlobalKmsStackSecondary', {
  env: {
    account: account,
    region: 'us-west-2',
  },
  description: 'KMS key stack for encrypting Aurora Global Database secrets (us-west-2)',
});

// Step 2: Deploy Primary Stack with encryption key
// The replica encryption key will be referenced via deterministic alias in the primary stack
// Primary region stack (us-east-1)
// This stack creates the global cluster and associates it with the Aurora cluster
const primaryStack = new PrimaryStack(app, 'AuroraGlobalPrimaryStack', {
  env: {
    account: account,
    region: 'us-east-1',
  },
  description: 'Primary region stack for Aurora Global Database (us-east-1)',
  encryptionKey: primaryKmsStack.encryptionKey,
});

// Step 3: Deploy Secondary Stack to us-west-2
const secondaryStack = new SecondaryStack(app, 'AuroraGlobalSecondaryStack', {
  env: {
    account: account,
    region: 'us-west-2',
  },
  description: 'Secondary region stack for Aurora Global Database (us-west-2)',
  globalDatabaseIdentifier: primaryStack.globalDatabaseIdentifier,
  encryptionKey: secondaryKmsStack.encryptionKey,
});

app.synth();
