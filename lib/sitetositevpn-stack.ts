import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, aws_secretsmanager, aws_efs, CfnOutput } from 'aws-cdk-lib';
import { CfnRoute } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import * as http from 'http';

export class SiteToSiteVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const local_ip = this.node.tryGetContext('local_ip');
      const vpc_name = this.node.tryGetContext('vpc_name');
      const keypair = this.node.tryGetContext('keypair'); 
      const local_internal_cidr = this.node.tryGetContext('local_internal_cidr');

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name });

      vpc.addVpnConnection("sitetositevpn", 
      {
        ip: local_ip,
        staticRoutes: [ local_internal_cidr ],
      });
    }
  };
