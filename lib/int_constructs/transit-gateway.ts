/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { v4 as uuidv4 } from 'uuid';
import * as t from './common-types';
import { NetworkConfigTypes, TransitGatewayAttachmentOptionsConfig, TransitGatewayRouteTableConfig } from './network-config';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';

const path = require('path');

export class TransitGatewayConfig implements t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig> {
  /**
   * A friendly name for the Transit Gateway.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the Transit Gateway to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: string = '';
  /**
   * The friendly name of the account to deploy the Transit Gateway.
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account: string = '';
  /**
   * The region name to deploy the Transit Gateway.
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * A Border Gateway Protocol (BGP) Autonomous System Number (ASN).
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment will cause the Transit Gateway to be recreated.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   *
   * The range is 64512 to 65534 for 16-bit ASNs.
   *
   * The range is 4200000000 to 4294967294 for 32-bit ASNs.
   */
  readonly asn: number = 65521;
  /**
   * Configure DNS support between VPCs.
   *
   * @remarks
   * Enable this option if you need the VPC to resolve public IPv4 DNS host names
   * to private IPv4 addresses when queried from instances in another VPC attached
   * to the transit gateway.
   */
  readonly dnsSupport: t.EnableDisable = 'enable';
  /**
   * Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   *
   * @remarks
   * Enable this option if you need Equal Cost Multipath (ECMP) routing support between VPN tunnels.
   * If connections advertise the same CIDRs, the traffic is distributed equally between them.
   */
  readonly vpnEcmpSupport: t.EnableDisable = 'enable';
  /**
   * Configure default route table association.
   *
   * @remarks
   * Enable this option to automatically associate transit gateway attachments with the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTableAssociation: t.EnableDisable = 'enable';
  /**
   * Configure default route table propagation.
   *
   * @remarks
   * Enable this option to automatically propagate transit gateway attachments to the default
   * route table for the transit gateway.
   */
  readonly defaultRouteTablePropagation: t.EnableDisable = 'enable';
  /**
   * Enable this option to automatically accept cross-account attachments.
   */
  readonly autoAcceptSharingAttachments: t.EnableDisable = 'disable';
  /**
   * An array of Transit Gateway route table configuration objects.
   *
   * @see {@link TransitGatewayRouteTableConfig}
   */
  readonly routeTables: TransitGatewayRouteTableConfig[] = [];
  /**
   * (OPTIONAL) An array of tag objects for the Transit Gateway.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

export interface ITransitGatewayRouteTableAssociation extends cdk.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export interface TransitGatewayRouteTableAssociationProps {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export class TransitGatewayRouteTableAssociation extends cdk.Resource implements ITransitGatewayRouteTableAssociation {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTableAssociationProps) {
    super(scope, id);

    this.transitGatewayAttachmentId = props.transitGatewayAttachmentId;
    this.transitGatewayRouteTableId = props.transitGatewayRouteTableId;

    new cdk.aws_ec2.CfnTransitGatewayRouteTableAssociation(this, 'Resource', {
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
    });
  }
}

export interface ITransitGatewayRouteTablePropagation extends cdk.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export interface TransitGatewayRouteTablePropagationProps {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;
}

export class TransitGatewayRouteTablePropagation extends cdk.Resource implements ITransitGatewayRouteTablePropagation {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayRouteTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayRouteTablePropagationProps) {
    super(scope, id);

    this.transitGatewayAttachmentId = props.transitGatewayAttachmentId;
    this.transitGatewayRouteTableId = props.transitGatewayRouteTableId;

    new cdk.aws_ec2.CfnTransitGatewayRouteTablePropagation(this, 'Resource', {
      transitGatewayAttachmentId: props.transitGatewayAttachmentId,
      transitGatewayRouteTableId: props.transitGatewayRouteTableId,
    });
  }
}

export interface ITransitGatewayAttachment extends cdk.IResource {
  readonly transitGatewayAttachmentId: string;
  readonly transitGatewayAttachmentName: string;
}

export interface TransitGatewayAttachmentProps {
  readonly name: string;
  readonly partition: string;
  readonly transitGatewayId: string;
  readonly subnetIds: string[];
  readonly vpcId: string;
  readonly options?: TransitGatewayAttachmentOptionsConfig;
  readonly tags?: cdk.CfnTag[];
}

export enum TransitGatewayAttachmentType {
  DXGW = 'direct-connect-gateway',
  PEERING = 'peering',
  VPC = 'vpc',
  VPN = 'vpn',
}

export interface TransitGatewayAttachmentLookupOptions {
  readonly name: string;
  readonly owningAccountId: string;
  readonly transitGatewayId: string;
  readonly type: TransitGatewayAttachmentType;
  readonly roleName?: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class TransitGatewayAttachment extends cdk.Resource implements ITransitGatewayAttachment {
  public static fromLookup(
    scope: Construct,
    id: string,
    options: TransitGatewayAttachmentLookupOptions,
  ): ITransitGatewayAttachment {
    class Import extends cdk.Resource implements ITransitGatewayAttachment {
      public readonly transitGatewayAttachmentId: string;
      public readonly transitGatewayAttachmentName = options.name;

      constructor(scope: Construct, id: string) {
        super(scope, id);

        const GET_TRANSIT_GATEWAY_ATTACHMENT = 'Custom::GetTransitGatewayAttachment';

        const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, GET_TRANSIT_GATEWAY_ATTACHMENT, {
          codeDirectory: path.join(__dirname, 'get-transit-gateway-attachment/dist'),
          runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
          policyStatements: [
            {
              Effect: 'Allow',
              Action: ['sts:AssumeRole'],
              Resource: '*',
            },
            {
              Effect: 'Allow',
              Action: ['ec2:DescribeTransitGatewayAttachments', 'ec2:DescribeVpnConnections'],
              Resource: '*',
            },
          ],
        });

        // Construct role arn if this is a cross-account lookup
        let roleArn: string | undefined = undefined;
        if (options.roleName) {
          roleArn = cdk.Stack.of(this).formatArn({
            service: 'iam',
            region: '',
            account: options.owningAccountId,
            resource: 'role',
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: options.roleName,
          });
        }

        const resource = new cdk.CustomResource(this, 'Resource', {
          resourceType: GET_TRANSIT_GATEWAY_ATTACHMENT,
          serviceToken: provider.serviceToken,
          properties: {
            region: cdk.Stack.of(this).region,
            name: options.name,
            transitGatewayId: options.transitGatewayId,
            type: options.type,
            roleArn,
            uuid: uuidv4(), // Generates a new UUID to force the resource to update
          },
        });

        /**
         * Singleton pattern to define the log group for the singleton function
         * in the stack
         */
        const stack = cdk.Stack.of(scope);
        const logGroup =
          (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
          new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
            logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
            retention: options.logRetentionInDays,
            encryptionKey: options.kmsKey,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });
        resource.node.addDependency(logGroup);

        this.transitGatewayAttachmentId = resource.ref;
      }
    }
    return new Import(scope, id);
  }

  public readonly transitGatewayAttachmentId: string;
  public readonly transitGatewayAttachmentName: string;

  constructor(scope: Construct, id: string, props: TransitGatewayAttachmentProps) {
    super(scope, id);

    let resource: cdk.aws_ec2.CfnTransitGatewayVpcAttachment | cdk.aws_ec2.CfnTransitGatewayAttachment;
    switch (props.partition) {
      case 'aws':
        resource = new cdk.aws_ec2.CfnTransitGatewayVpcAttachment(this, 'Resource', {
          vpcId: props.vpcId,
          transitGatewayId: props.transitGatewayId,
          subnetIds: props.subnetIds,
          options: {
            ApplianceModeSupport: props.options?.applianceModeSupport ?? 'disable',
            DnsSupport: props.options?.dnsSupport ?? 'enable',
            Ipv6Support: props.options?.ipv6Support ?? 'disable',
          },
          tags: props.tags,
        });
        break;
      case 'aws-us-gov':
        resource = new cdk.aws_ec2.CfnTransitGatewayAttachment(this, 'Resource', {
          vpcId: props.vpcId,
          transitGatewayId: props.transitGatewayId,
          subnetIds: props.subnetIds,
          options: {
            ApplianceModeSupport: props.options?.applianceModeSupport ?? 'disable',
            DnsSupport: props.options?.dnsSupport ?? 'enable',
            Ipv6Support: props.options?.ipv6Support ?? 'disable',
          },
          tags: props.tags,
        });
        break;
      default:
        resource = new cdk.aws_ec2.CfnTransitGatewayAttachment(this, 'Resource', {
          vpcId: props.vpcId,
          transitGatewayId: props.transitGatewayId,
          subnetIds: props.subnetIds,
          tags: props.tags,
        });
        break;
    }
    // Add name tag
    cdk.Tags.of(this).add('Name', props.name);

    this.transitGatewayAttachmentId = resource.ref;
    this.transitGatewayAttachmentName = props.name;
  }
}

export interface ITransitGateway extends cdk.IResource {
  /**
   * The identifier of the transit gateway
   *
   * @attribute
   */
  readonly transitGatewayId: string;

  /**
   * The name of the transit gateway
   *
   * @attribute
   */
  readonly transitGatewayName: string;

  /**
   * The ARN of the transit gateway
   *
   * @attribute
   */
  readonly transitGatewayArn: string;
}

export interface TransitGatewayProps {
  /**
   * The name of the transit gateway. Will be assigned to the Name tag
   */
  readonly name: string;

  /**
   * A private Autonomous System Number (ASN) for the Amazon side of a BGP session. The range is
   * 64512 to 65534 for 16-bit ASNs. The default is 64512.
   */
  readonly amazonSideAsn?: number;

  /**
   * Enable or disable automatic acceptance of attachment requests. Disabled by default.
   */
  readonly autoAcceptSharedAttachments?: string;

  /**
   * Enable or disable automatic association with the default association route table. Enabled by
   * default.
   */
  readonly defaultRouteTableAssociation?: string;

  /**
   * Enable or disable automatic propagation of routes to the default propagation route table.
   * Enabled by default.
   */
  readonly defaultRouteTablePropagation?: string;

  /**
   * The description of the transit gateway.
   */
  readonly description?: string;

  /**
   * Enable or disable DNS support. Enabled by default.
   */
  readonly dnsSupport?: string;

  /**
   * Indicates whether multicast is enabled on the transit gateway
   */
  readonly multicastSupport?: string;

  /**
   * Enable or disable Equal Cost Multipath Protocol support. Enabled by default.
   */
  readonly vpnEcmpSupport?: string;

  /**
   * Tags that will be attached to the transit gateway
   */
  readonly tags?: cdk.CfnTag[];
}

/**
 * Creates a Transit Gateway
 */
export class TransitGateway extends cdk.Resource implements ITransitGateway {
  readonly transitGatewayId: string;

  readonly transitGatewayName: string;

  readonly transitGatewayArn: string;

  readonly routeTableTgwId: string;  // tgw_rtb_xxxxx
  readonly routeTableId: string;   // rtb_xxxx

  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id);

    const resource = new cdk.aws_ec2.CfnTransitGateway(this, 'Resource', {
      amazonSideAsn: props.amazonSideAsn,
      autoAcceptSharedAttachments: props.autoAcceptSharedAttachments,
      defaultRouteTableAssociation: props.defaultRouteTableAssociation,
      defaultRouteTablePropagation: props.defaultRouteTablePropagation,
      dnsSupport: props.dnsSupport,
      vpnEcmpSupport: props.vpnEcmpSupport,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.transitGatewayId = resource.ref;

    this.transitGatewayName = props.name;

    this.transitGatewayArn = cdk.Stack.of(this).formatArn({
      service: 'ec2',
      resource: 'transit-gateway',
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: this.transitGatewayId,
    });

    const getDefaultRouteTableId = new AwsCustomResource(this, 'GetDefaultRouteTableId', {
      onUpdate: {
        service: 'EC2',
        action: 'describeTransitGateways',
        parameters: {
          TransitGatewayIds: [this.transitGatewayId],
        },
        physicalResourceId: PhysicalResourceId.of('GetDefaultRouteTableId'),
      },
      installLatestAwsSdk: true,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
    
    this.routeTableId = getDefaultRouteTableId.getResponseField(
      'TransitGateways.0.Options.AssociationDefaultRouteTableId',
    );
    
    // console.log(`Transit Gateway created:\n transitGatewayId: ${this.transitGatewayId}\n transitGatewayName: ${this.transitGatewayName}\n`
    //   + `transitGatewayArn: ${this.transitGatewayArn}\n routeTableTgwId: ${this.routeTableTgwId}\n routeTableId: ${this.routeTableId}\n`);
    

  }
}
