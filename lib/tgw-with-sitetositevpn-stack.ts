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

      const vpcAttachment = new TransitGatewayAttachment(this, 'vpc-tgw-attachment', {
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

      // Use prefix list ID from parameter or context (no longer using cross-stack import)
      const prefixListId = this.node.tryGetContext('rfc1918PrefixListId') || props.appConfig.rfc1918PrefixListId;
      
      vpc.privateSubnets.forEach(({routeTable: { routeTableId }}, index) => { 
        this.AddTgwRoute(index, routeTableId, prefixListId, tgw, vpcAttachment);
        });
      vpc.publicSubnets.forEach(({routeTable: { routeTableId }}, index) => {   
        this.AddTgwRoute(index, routeTableId, prefixListId, tgw, vpcAttachment);
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
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: ['*'],
      }),
    })

    const vpnTransitGatewayAttachmentId = customResourceGetTgwAttId.getResponseField('TransitGatewayAttachments.0.TransitGatewayAttachmentId')


    new CfnTransitGatewayRoute(this, `vpn-route-${index}-${vpn.name}-${destinationCidr}`, {
      destinationCidrBlock: destinationCidr,
      transitGatewayRouteTableId: routeTableId,
      transitGatewayAttachmentId: vpnTransitGatewayAttachmentId
    });
  }

  


  
  private AddTgwRoute(index: number, routeTableId: string, prefixListId: string, tgw: TransitGateway, vpcAttachment: TransitGatewayAttachment) {
    const customResource = new AwsCustomResource(this, `tgw-vpn-pl-route-${index}-${routeTableId}-prefixlist-transitgateway`, {
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: false,
      onCreate: {
        action: 'CreateRoute',
        service: 'ec2',
        physicalResourceId: PhysicalResourceId.of(`tgw-vpn-pl-route-${index}-${routeTableId}-${prefixListId}-${tgw.transitGatewayId}`),
        parameters: {
          DestinationPrefixListId: prefixListId,
          TransitGatewayId: tgw.transitGatewayId,
          RouteTableId: routeTableId
        }
      },
      onDelete: {
        action: 'DeleteRoute',
        service: 'ec2',
        physicalResourceId: PhysicalResourceId.of(`tgw-vpn-pl-route-${index}-${routeTableId}-${prefixListId}-${tgw.transitGatewayId}`),
        parameters: {
          DestinationPrefixListId: prefixListId,
          RouteTableId: routeTableId
        }
      }
    });
    // Must wait for VPC attachment to be available before creating routes
    customResource.node.addDependency(vpcAttachment);
  }
  };


