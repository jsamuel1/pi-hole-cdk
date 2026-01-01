import { aws_ec2, aws_efs, aws_secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleStorageProps {
  vpc: aws_ec2.IVpc;
  securityGroup: aws_ec2.SecurityGroup;
  resourceSuffix?: string;
}

export class PiHoleStorage extends Construct {
  public readonly fileSystem: aws_efs.FileSystem;
  public readonly secret: aws_secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: PiHoleStorageProps) {
    super(scope, id);

    const suffix = props.resourceSuffix || '';

    this.secret = new aws_secretsmanager.Secret(this, `piholepwd${suffix}`, {
      secretName: `pihole-pwd${suffix}`,
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false
      }
    });

    this.fileSystem = new aws_efs.FileSystem(this, `pihole-fs${suffix}`, {
      vpc: props.vpc,
      encrypted: true,
      fileSystemName: `pihole-fs${suffix}`
    });

    this.fileSystem.connections.allowDefaultPortFrom(props.securityGroup);
  }
}