import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { getVpcCidrForRegion } from '../utils/vpc-cidr';

export interface PrimaryStackProps extends cdk.StackProps {
  databaseName?: string;
  globalDatabaseIdentifier?: string;
  encryptionKey?: kms.IKey;
}

export class PrimaryStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: cdk.aws_rds.DatabaseCluster;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly secret: cdk.aws_secretsmanager.Secret;
  public readonly globalDatabaseIdentifier: string;
  public readonly globalCluster: rds.CfnGlobalCluster;

  constructor(scope: Construct, id: string, props?: PrimaryStackProps) {
    super(scope, id, props);

    const databaseName = props?.databaseName || 'auroraglobaldb';

    // Get region-specific CIDR block
    const vpcCidr = getVpcCidrForRegion(this.region);

    // Create VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'PrimaryVpc', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Security group for Aurora
    this.securityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Aurora Global Database',
      allowAllOutbound: true,
    });

    // Create database credentials secret
    // For replica region, use the deterministic alias ARN since the alias name is fixed
    // Construct the alias ARN: arn:aws:kms:REGION:ACCOUNT:alias/ALIAS_NAME
    const replicaRegion = 'us-west-2';
    const replicaAliasName = 'aurora-global-secrets';
    const replicaAliasArn = `arn:aws:kms:${replicaRegion}:${this.account}:alias/${replicaAliasName}`;
    
    // Use fromKeyArn with the alias ARN - AWS services accept alias ARNs where key ARNs are expected
    const replicaEncryptionKey = kms.Key.fromKeyArn(
      this,
      'ReplicaEncryptionKey',
      replicaAliasArn
    );
    
    this.secret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      description: 'Aurora Global Database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 32,
      },
      ...(props?.encryptionKey && {
        encryptionKey: props.encryptionKey,
        replicaRegions: [
          {
            region: replicaRegion,
            encryptionKey: replicaEncryptionKey,
          },
        ],
      }),
    });




    // Create Aurora Serverless v2 cluster first
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_5,
      }),
      credentials: rds.Credentials.fromSecret(this.secret),
      defaultDatabaseName: databaseName,
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.securityGroup],
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1.0,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: false,
      storageEncrypted: true,
      enableDataApi: false,
      clusterIdentifier: 'aurora-global-primary-cluster',
    });
    // Define global database identifier as a constant string
    const globalDatabaseIdentifier = props?.globalDatabaseIdentifier || 'aurora-global-cluster';

    // Create Global Database cluster FIRST (without source cluster)
    // This must exist before any cluster can reference it
    this.globalCluster = new rds.CfnGlobalCluster(this, 'GlobalCluster', {
      globalClusterIdentifier: globalDatabaseIdentifier,
      deletionProtection: false,
      sourceDbClusterIdentifier: this.cluster.clusterArn,
    });

    
    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'Primary VPC ID',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora cluster endpoint',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'Aurora cluster ARN',
      exportName: 'PrimaryClusterArn',
    });

    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.secret.secretArn,
      description: 'Database secret ARN',
      exportName: 'PrimarySecretArn',
    });

    new cdk.CfnOutput(this, 'GlobalClusterArn', {
      value: this.globalCluster.ref,
      description: 'Aurora Global Database cluster ARN',
      exportName: 'GlobalClusterArn',
    });
  }
}
