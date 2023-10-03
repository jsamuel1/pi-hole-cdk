import * as cdk from 'aws-cdk-lib';
import { aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import { TransitGateway, TransitGatewayAttachment, VpnConnection } from './int_constructs'; 
import { CfnCustomerGateway, CfnRoute, CfnTransitGatewayRoute, PrefixList } from 'aws-cdk-lib/aws-ec2';
import { AwsCustomResource, AwsCustomResourcePolicy, AwsSdkCall, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

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

      // No prefixlist support in CloudFormation/CDK for PrefixLists in Route Tables yet!!
      let prefixList = PrefixList.fromPrefixListId(this, 'rfc1918-prefix-list', cdk.Fn.importValue('RFC1918PrefixListId'));
      
      vpc.privateSubnets.forEach(({routeTable: { routeTableId }}, index) => { 
        this.AddTgwRoute(index, routeTableId, prefixList, tgw);
        });
      vpc.publicSubnets.forEach(({routeTable: { routeTableId }}, index) => {   
        this.AddTgwRoute(index, routeTableId, prefixList, tgw);
        });


        // Now add the VPN Route


      this.AddVpnRoute(0, tgw.routeTableId, local_internal_cidr, vpn);
  
      }

  private AddVpnRoute(index: number, routeTableId: string, destinationCidr: string, vpn: VpnConnection) {
    const sdkCall: AwsSdkCall = {
      service: 'EC2',
      action: 'describeTransitGatewayAttachments',
      parameters: {
        Filters: [{
          'Name': 'resource-id',
          'Values': [
            vpn.vpnConnectionId
          ]
        }],
      },
      physicalResourceId: PhysicalResourceId.of(vpn.vpnConnectionId),
    }
    const customResourceGetTgwAttId = new AwsCustomResource(this, 'custom-resource-get-tgw-att-id', {
      onCreate: sdkCall,
      onUpdate: sdkCall,
      installLatestAwsSdk: true,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: ['*'],
      }),
    })

    const vpnTransitGatewayAttachmentId = customResourceGetTgwAttId.getResponseField('TransitGatewayAttachments.0.TransitGatewayAttachmentId')


    new CfnTransitGatewayRoute(this, `vpn-route-${index}-${vpn.vpnConnectionId}-${destinationCidr}`, {
      destinationCidrBlock: destinationCidr,
      transitGatewayRouteTableId: routeTableId,
      transitGatewayAttachmentId: vpnTransitGatewayAttachmentId
    });
  }

  


  
  private AddTgwRoute(index: number, routeTableId: string, prefixList: cdk.aws_ec2.IPrefixList, tgw: TransitGateway) {
    new AwsCustomResource(this, `tgw-vpn-pl-route-${index}-${routeTableId}-prefixlist-transitgateway`, {
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: true,
      onCreate: {
        action: 'createRoute',
        service: 'EC2',
        physicalResourceId: PhysicalResourceId.of(`tgw-vpn-pl-route-${index}-${routeTableId}-${prefixList.prefixListId}-${tgw.transitGatewayId}`),
        parameters: {
          DestinationPrefixListId: prefixList.prefixListId,
          TransitGatewayId: tgw.transitGatewayId,
          RouteTableId: routeTableId
        }
      },
      onDelete: {
        action: 'deleteRoute',
        service: 'EC2',
        physicalResourceId: PhysicalResourceId.of(`tgw-vpn-pl-route-${index}-${routeTableId}-${prefixList.prefixListId}-${tgw.transitGatewayId}`),
        parameters: {
          DestinationPrefixListId: prefixList.prefixListId,
          RouteTableId: routeTableId
        }
      }
    });
  }
  };


