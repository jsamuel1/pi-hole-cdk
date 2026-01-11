import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnTransitGatewayPeeringAttachment, CfnTransitGatewayRoute } from 'aws-cdk-lib/aws-ec2';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

export interface TgwPeeringStackProps extends cdk.StackProps {
  peerRegion: string;
}

/**
 * Creates TGW peering between two regions.
 * Routes are added by the accept stack after peering is active.
 */
export class TgwPeeringStack extends cdk.Stack {
  public readonly peeringAttachmentId: string;

  constructor(scope: Construct, id: string, props: TgwPeeringStackProps) {
    super(scope, id, props);

    const localTgwId = this.node.tryGetContext('tgw_id');
    const peerTgwId = this.node.tryGetContext('peer_tgw_id');

    if (!localTgwId || !peerTgwId) {
      throw new Error('Required context: tgw_id, peer_tgw_id');
    }

    // Create peering attachment (requester side)
    const peering = new CfnTransitGatewayPeeringAttachment(this, 'TgwPeering', {
      transitGatewayId: localTgwId,
      peerTransitGatewayId: peerTgwId,
      peerRegion: props.peerRegion,
      peerAccountId: this.account,
      tags: [{ key: 'Name', value: `tgw-peering-to-${props.peerRegion}` }],
    });

    this.peeringAttachmentId = peering.attrTransitGatewayAttachmentId;

    new cdk.CfnOutput(this, 'PeeringAttachmentId', {
      value: peering.attrTransitGatewayAttachmentId,
      description: 'TGW Peering Attachment ID - use this in accept stack',
    });
  }
}

export interface TgwPeeringAcceptStackProps extends cdk.StackProps {
  /** CIDR blocks to route to peer TGW (from requester) */
  requesterCidrs: string[];
  /** CIDR blocks to route back to requester (added to requester TGW) */
  peerCidrs?: string[];
  requesterTgwRouteTableId?: string;
}

/**
 * Accepts TGW peering and adds routes on both sides.
 */
export class TgwPeeringAcceptStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TgwPeeringAcceptStackProps) {
    super(scope, id, props);

    const peeringAttachmentId = this.node.tryGetContext('tgw_peering_attachment_id');
    const localTgwRouteTableId = this.node.tryGetContext('tgw_route_table_id');

    if (!peeringAttachmentId || !localTgwRouteTableId) {
      throw new Error('Required context: tgw_peering_attachment_id, tgw_route_table_id');
    }

    // Accept the peering attachment
    const acceptPeering = new AwsCustomResource(this, 'AcceptPeering', {
      onCreate: {
        service: 'EC2',
        action: 'acceptTransitGatewayPeeringAttachment',
        parameters: {
          TransitGatewayAttachmentId: peeringAttachmentId,
        },
        physicalResourceId: PhysicalResourceId.of(peeringAttachmentId),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: ['*'] }),
      installLatestAwsSdk: false,
    });

    // Add routes to requester CIDRs (on accepter side)
    props.requesterCidrs.forEach((cidr, index) => {
      const route = new CfnTransitGatewayRoute(this, `RouteToRequester${index}`, {
        transitGatewayRouteTableId: localTgwRouteTableId,
        destinationCidrBlock: cidr,
        transitGatewayAttachmentId: peeringAttachmentId,
      });
      route.node.addDependency(acceptPeering);
    });

    // Add routes on requester side (cross-region via custom resource)
    if (props.peerCidrs && props.requesterTgwRouteTableId) {
      props.peerCidrs.forEach((cidr, index) => {
        const route = new AwsCustomResource(this, `RouteToAccepter${index}`, {
          onCreate: {
            service: 'EC2',
            action: 'createTransitGatewayRoute',
            parameters: {
              TransitGatewayRouteTableId: props.requesterTgwRouteTableId,
              DestinationCidrBlock: cidr,
              TransitGatewayAttachmentId: peeringAttachmentId,
            },
            physicalResourceId: PhysicalResourceId.of(`${props.requesterTgwRouteTableId}-${cidr}`),
          },
          onDelete: {
            service: 'EC2',
            action: 'deleteTransitGatewayRoute',
            parameters: {
              TransitGatewayRouteTableId: props.requesterTgwRouteTableId,
              DestinationCidrBlock: cidr,
            },
          },
          policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: ['*'] }),
          installLatestAwsSdk: false,
        });
        route.node.addDependency(acceptPeering);
      });
    }
  }
}
