import * as cdk from 'aws-cdk-lib';
import { aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import * as c from './constructs';
import { TransitGateway, TransitGatewayAttachment, VpnConnection } from './constructs'; 
import { CfnCustomerGateway, CfnVPNConnectionRoute } from 'aws-cdk-lib/aws-ec2';

export class TgwWithSiteToSiteVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleProps) {
    super(scope, id, props);

      const local_ip = props.appConfig.local_ip;
      const vpc_name = props.appConfig.vpc_name;
      const local_internal_cidr = props.appConfig.local_internal_cidr;

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name, isDefault: false });

      let tgw = new TransitGateway(this, 'tgw', {
        name: 'pihole-tgw'
      })

      new TransitGatewayAttachment(this, 'vpc-tgw-attachment', {
        partition: 'aws',
        name: 'vpc-attachment',
        transitGatewayId: tgw.transitGatewayId,
        subnetIds: vpc.privateSubnets.map(a => {return a.subnetId}),
        vpcId: vpc.vpcId,
        options: {
          dnsSupport: 'enable',
          ipv6Support: 'enable',
          applianceModeSupport: 'disable'
        }
      });

      let cgw = new CfnCustomerGateway(this, 'customer-gateway', {
        ipAddress: local_ip,
        type: 'ipsec.1',
        bgpAsn: 65001,
      });

      new VpnConnection(this, 'sitetositevpnConnection', {
        name: 'pihole-vpn',
        customerGatewayId: cgw.ref,
        transitGatewayId: tgw.transitGatewayId,
        staticRoutesOnly: false,
        vpnTunnelOptionsSpecifications: [ 
                { preSharedKey: 'pihole-pwd', tunnelInsideCidr: '169.254.250.0/30'},
                { preSharedKey: 'pihole-pwd', tunnelInsideCidr: '169.254.251.0/30'}
            ]   
      });
    }
  };
