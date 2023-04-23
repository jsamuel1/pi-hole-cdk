import * as cdk from 'aws-cdk-lib';
import { aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SiteToSiteVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const local_ip = this.node.tryGetContext('local_ip');
      const vpc_name = this.node.tryGetContext('vpc_name');
      const local_internal_cidr = this.node.tryGetContext('local_internal_cidr');

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name });

      vpc.addVpnConnection("sitetositevpn", 
      {
        ip: local_ip,
        staticRoutes: [ local_internal_cidr ],
      });
    }
  };
