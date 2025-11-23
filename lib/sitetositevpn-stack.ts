import * as cdk from 'aws-cdk-lib';
import { aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PiHoleProps } from '../bin/pi-hole-cdk';

export class SiteToSiteVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleProps) {
    super(scope, id, props);

      const local_ip = props.appConfig.local_ip;
      const local_internal_cidr = props.appConfig.local_internal_cidr;
      
      // Use region-specific configuration
      const regionConfig = props.regionConfig;
      const vpc_name = regionConfig.vpc_name || props.appConfig.vpc_name;

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name, isDefault: false });

      vpc.addVpnConnection("sitetositevpn", 
      {
        ip: local_ip,
        staticRoutes: [ local_internal_cidr ],
      });
    }
  };
