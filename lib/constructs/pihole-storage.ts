import { aws_ec2, aws_efs, aws_secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleStorageProps {
  vpc: aws_ec2.IVpc;
  securityGroup: aws_ec2.SecurityGroup;
  resourceSuffix?: string;
  replicationRegion?: string; // Region to replicate EFS to
  existingReplicationDestFsId?: string; // If set, use existing destination instead of creating new
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

    // Determine replication configuration
    let replicationConfig: aws_efs.ReplicationConfiguration | undefined;
    if (props.existingReplicationDestFsId) {
      // Use existing destination filesystem (replication already configured)
      const destFs = aws_efs.FileSystem.fromFileSystemAttributes(this, 'dest-fs', {
        fileSystemId: props.existingReplicationDestFsId,
        securityGroup: aws_ec2.SecurityGroup.fromSecurityGroupId(this, 'dest-sg', 'sg-placeholder'),
      });
      replicationConfig = aws_efs.ReplicationConfiguration.existingFileSystem(destFs);
    } else if (props.replicationRegion) {
      // Create new replication to region
      replicationConfig = aws_efs.ReplicationConfiguration.regionalFileSystem(props.replicationRegion);
    }

    this.fileSystem = new aws_efs.FileSystem(this, `pihole-fs${suffix}`, {
      vpc: props.vpc,
      encrypted: true,
      fileSystemName: `pihole-fs${suffix}`,
      replicationConfiguration: replicationConfig,
    });

    this.fileSystem.connections.allowDefaultPortFrom(props.securityGroup);
  }
}