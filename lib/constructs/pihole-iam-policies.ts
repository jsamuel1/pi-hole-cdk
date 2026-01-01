import { aws_iam } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement, IManagedPolicy } from 'aws-cdk-lib/aws-iam';

export class PiHoleIamPolicies {
  static createSecretsPolicy(secretArn: string): PolicyDocument {
    return new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: [
            "secretsmanager:GetResourcePolicy",
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
            "secretsmanager:ListSecretVersionIds"
          ],
          effect: Effect.ALLOW,
          resources: [secretArn]
        }),
        new PolicyStatement({
          actions: ["secretsmanager:ListSecrets"],
          effect: Effect.ALLOW,
          resources: ["*"]
        })
      ]
    });
  }

  static createKmsPolicy(): PolicyDocument {
    return new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: [
            "kms:Encrypt",
            "kms:Decrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:DescribeKey"
          ],
          effect: Effect.ALLOW,
          resources: ['*']
        })
      ]
    });
  }

  static getManagedPolicies(): IManagedPolicy[] {
    return [
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess'),
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMPatchAssociation'),
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
    ];
  }
}