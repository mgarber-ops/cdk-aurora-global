import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { getVpcCidrForRegion } from '../utils/vpc-cidr';

export interface SecondaryStackProps extends cdk.StackProps {
  globalDatabaseIdentifier: string;
  encryptionKey: kms.IKey;
}

export class SecondaryStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: rds.CfnDBCluster;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SecondaryStackProps) {
    super(scope, id, {
      ...props,
    });

    // Get region-specific CIDR block
    const vpcCidr = getVpcCidrForRegion(this.region);

    // Create VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'SecondaryVpc', {
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
      description: 'Security group for Aurora replica cluster',
      allowAllOutbound: true,
    });


    // Create Aurora replica cluster as part of global database
    const clusterResource = new rds.CfnDBCluster(this, 'ReplicaCluster', {
      engine: 'aurora-postgresql',
      engineVersion: '17.5',
      globalClusterIdentifier: 'aurora-global-cluster',
      dbClusterIdentifier: 'aurora-global-replica-cluster',
      vpcSecurityGroupIds: [this.securityGroup.securityGroupId],
      dbSubnetGroupName: new rds.SubnetGroup(this, 'SubnetGroup', {
        vpc: this.vpc,
        description: 'Subnet group for Aurora replica',
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      }).subnetGroupName,
      storageEncrypted: true,
      backupRetentionPeriod: 7,
      enableCloudwatchLogsExports: ['postgresql'],
      serverlessV2ScalingConfiguration: {
        minCapacity: 0,
        maxCapacity: 1.0,
      },
      enableGlobalWriteForwarding: true,
      kmsKeyId: props.encryptionKey.keyArn,
    });

    // Create serverless v2 instance
    new rds.CfnDBInstance(this, 'ReplicaInstance', {
      engine: 'aurora-postgresql',
      dbInstanceClass: 'db.serverless',
      dbClusterIdentifier: clusterResource.ref,
      publiclyAccessible: false,
    });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'Secondary VPC ID',
    });

    new cdk.CfnOutput(this, 'ClusterIdentifier', {
      value: clusterResource.ref,
      description: 'Aurora replica cluster identifier',
    });
  }
}
