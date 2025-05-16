#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PiHoleCdkStack } from '../lib/pi-hole-cdk-stack';
import { SiteToSiteVpnStack } from '../lib/sitetositevpn-stack';
import { StackProps } from 'aws-cdk-lib/core/lib/stack';
import { TgwWithSiteToSiteVpnStack } from '../lib/tgw-with-sitetositevpn-stack';
import { Node } from 'constructs';

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
    // Use Intel architecture in Frankfurt region
    this.bUseIntel = (env.region == 'eu-central-1');
    
  }
}

export interface PiHoleProps extends StackProps
{
  readonly appConfig : AppConfig
}

// Define available deployment regions
const regions = {
  'sydney': 'ap-southeast-2',
  'melbourne': 'ap-southeast-4',
  'frankfurt': 'eu-central-1'
};

// Get the target region from context or use default
const targetRegion = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || regions.frankfurt;

var env : cdk.Environment = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: targetRegion 
};

var appConfig = new AppConfig(app.node, env);
var piHoleProps : PiHoleProps = {
  appConfig: appConfig,
  env: env
}

// Create stack with region-specific naming
const regionName = Object.keys(regions).find(key => regions[key] === targetRegion) || 'default';
const stackNameSuffix = `-${regionName}`;

new PiHoleCdkStack(app, `PiHoleCdkStack${stackNameSuffix}`, piHoleProps);

new SiteToSiteVpnStack(app, `SiteToSiteVpnStack${stackNameSuffix}`, piHoleProps);

new TgwWithSiteToSiteVpnStack(app, `TgwWithSiteToSiteVpnStack${stackNameSuffix}`, piHoleProps);

