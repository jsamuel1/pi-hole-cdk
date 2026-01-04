#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PiHoleCdkStack } from '../lib/pi-hole-cdk-stack';
import { SiteToSiteVpnStack } from '../lib/sitetositevpn-stack';
import { StackProps } from 'aws-cdk-lib';
import { TgwWithSiteToSiteVpnStack } from '../lib/tgw-with-sitetositevpn-stack';
import { PiHoleFailoverStack } from '../lib/pihole-failover-stack';
import { Node } from 'constructs';
import { PiHoleConfig, DEFAULT_PIHOLE_CONFIG } from '../lib/config/pihole-config';

const app = new cdk.App();

export class AppConfig
{
  readonly local_ip : string;
  readonly local_ip_cidr : string;
  readonly local_internal_cidr : string;
  readonly vpc_name ?: string;
  readonly keypair : string;
  readonly bPublic_http : boolean;
  readonly bUsePrefixLists : boolean; 
  readonly bUseIntel : boolean;
  readonly node : Node;
  readonly piHoleConfig : PiHoleConfig;
  readonly rfc1918PrefixListId ?: string;

  constructor(scope: Node, env: cdk.Environment)
  {

    this.node = scope;

    this.local_ip = this.node.tryGetContext('local_ip') || "127.0.0.1";
    this.local_ip_cidr = this.local_ip + "/32"
    this.local_internal_cidr = this.node.tryGetContext('local_internal_cidr') || "192.168.0.0/16";
    this.vpc_name = this.node.tryGetContext('vpc_name');
    this.keypair = this.node.tryGetContext('keypair') || "pihole";
    var public_http = this.node.tryGetContext('public_http');
    this.bPublic_http = (public_http != undefined && (public_http == "True" || public_http == true));

    var usePrefixLists = this.node.tryGetContext('usePrefixLists');
    this.bUsePrefixLists = (usePrefixLists == undefined || (usePrefixLists == "True" || usePrefixLists == true));
    this.bUseIntel = false;//(env.region == 'ap-southeast-4');
    
    this.piHoleConfig = {
      ...DEFAULT_PIHOLE_CONFIG,
      revServerTarget: this.node.tryGetContext('rev_server_target') || DEFAULT_PIHOLE_CONFIG.revServerTarget,
      httpsEnabled: this.node.tryGetContext('https_enabled') === 'true' || this.node.tryGetContext('https_enabled') === true,
      hostedZoneId: this.node.tryGetContext('hosted_zone_id'),
      hostedZoneName: this.node.tryGetContext('hosted_zone_name'),
      regionSubdomain: this.node.tryGetContext('region_subdomain'),
      efsReplicationRegions: this.node.tryGetContext('efs_replication_regions')?.split(',').filter((r: string) => r),
    };
    this.rfc1918PrefixListId = this.node.tryGetContext('rfc1918PrefixListId');
  }
}

export interface PiHoleProps extends StackProps
{
  readonly appConfig : AppConfig
}
var env : cdk.Environment = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: process.env.CDK_DEFAULT_REGION 
};

var appConfig = new AppConfig(app.node, env);
var piHoleProps : PiHoleProps = {
  appConfig: appConfig,
  env: env
}

// Pi-hole stack with EC2 ASG and ECS deployments behind shared NLB
new PiHoleCdkStack(app, 'PiHoleCdkStack', piHoleProps);

new SiteToSiteVpnStack(app, 'SiteToSiteVpnStack', piHoleProps);

new TgwWithSiteToSiteVpnStack(app, 'TgwWithSiteToSiteVpnStack', piHoleProps);

// Route 53 failover stack (deployed to us-east-1 for global health checks)
const hostedZoneId = app.node.tryGetContext('hosted_zone_id');
const hostedZoneName = app.node.tryGetContext('hosted_zone_name');
const melAlbDns = app.node.tryGetContext('mel_alb_dns');
const melAlbZone = app.node.tryGetContext('mel_alb_zone');
const sydAlbDns = app.node.tryGetContext('syd_alb_dns');
const sydAlbZone = app.node.tryGetContext('syd_alb_zone');

if (hostedZoneId && melAlbDns && sydAlbDns) {
  new PiHoleFailoverStack(app, 'PiHoleFailoverStack', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
    hostedZoneId,
    hostedZoneName,
    melAlbDnsName: melAlbDns,
    sydAlbDnsName: sydAlbDns,
    melAlbHostedZoneId: melAlbZone,
    sydAlbHostedZoneId: sydAlbZone,
  });
}
