import * as cdk from 'aws-cdk-lib';
import { aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import { TransitGateway, TransitGatewayAttachment, VpnConnection } from './constructs'; 
import { CfnCustomerGateway, CfnTransitGatewayRoute, CfnVPNConnectionRoute, PrefixList } from 'aws-cdk-lib/aws-ec2';

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
          ipv6Support: 'disable',
          applianceModeSupport: 'disable'
        }
      });

      let cgw = new CfnCustomerGateway(this, 'customer-gateway', {
        ipAddress: local_ip,
        type: 'ipsec.1',
        bgpAsn: 65001,
      });

      let vpn = new VpnConnection(this, 'sitetositevpnConnection', {
        name: 'pihole-vpn',
        customerGatewayId: cgw.ref,
        transitGatewayId: tgw.transitGatewayId,
        staticRoutesOnly: true,
        vpnTunnelOptionsSpecifications: [ 
                { preSharedKey: 'pihole-pwd', tunnelInsideCidr: '169.254.250.0/30'},
                { preSharedKey: 'pihole-pwd', tunnelInsideCidr: '169.254.251.0/30'}
            ]   
      });

      new CfnVPNConnectionRoute(this, 'sitetositevpnRoute', {
        destinationCidrBlock: local_internal_cidr,
        vpnConnectionId: vpn.vpnConnectionId});

      // todo -- TGW Route to onprem
      // new CfnTransitGatewayRoute(this, 'tgw-vpn-route', {
      //   transitGatewayRouteTableId: '',
      //   blackhole: false,
      //   destinationCidrBlock: local_internal_cidr,
      //   transitGatewayAttachmentId: ''
      // });

      let prefixList = PrefixList.fromPrefixListId(this, 'rfc1918-prefix-list', cdk.Fn.importValue('RFC1918PrefixListId'));
      
      vpc.privateSubnets.forEach(s => { 
        let subnet = s as aws_ec2.Subnet;
        subnet.addRoute(`tgw-vpn-route-${s.subnetId}`, {
          routerId: tgw.transitGatewayId,
          routerType: aws_ec2.RouterType.TRANSIT_GATEWAY,
          destinationCidrBlock: prefixList.prefixListId
        });
      } );
    }
  };
