import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export class KmsStack extends cdk.Stack {
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create KMS key for encrypting secrets
    this.encryptionKey = new kms.Key(this, 'SecretsEncryptionKey', {
      description: 'KMS key for encrypting Aurora Global Database secrets',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add alias for easier identification
    new kms.Alias(this, 'SecretsEncryptionKeyAlias', {
      aliasName: 'alias/aurora-global-secrets',
      targetKey: this.encryptionKey,
    });

    // Output the key ARN
    new cdk.CfnOutput(this, 'EncryptionKeyArn', {
      value: this.encryptionKey.keyArn,
      description: 'KMS Key ARN for encrypting secrets',
      exportName: 'SecretsEncryptionKeyArn',
    });

    // Output the key ID
    new cdk.CfnOutput(this, 'EncryptionKeyId', {
      value: this.encryptionKey.keyId,
      description: 'KMS Key ID',
    });
  }
}
