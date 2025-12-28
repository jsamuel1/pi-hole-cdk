#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PiHoleCdkStack } from '../lib/pi-hole-cdk-stack';
import { PiHoleEcsManagedStack } from '../lib/pi-hole-ecs-managed-stack';
import { SiteToSiteVpnStack } from '../lib/sitetositevpn-stack';
import { StackProps } from 'aws-cdk-lib';
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
    this.bUseIntel = false;//(env.region == 'ap-southeast-4');
    
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

// 🏴‍☠️ Conditional deployment logic to prevent resource conflicts, arr! ⚓
// Context flags control which stack(s) get deployed to prevent accidental
// deployment of both EC2 and ECS stacks to the same region simultaneously
const deployEcs = app.node.tryGetContext('deploy_ecs');
const deployEcsOnly = app.node.tryGetContext('deploy_ecs_only');

// Validate that both flags aren't set simultaneously (would be confusin', matey!)
if (deployEcs && deployEcsOnly) {
  throw new Error("Arr! Ye can't set both 'deploy_ecs' and 'deploy_ecs_only' flags at the same time, matey! ⚠️");
}

// 🏴‍☠️ Original EC2 Auto Scaling Group stack (preserved fer current deployments)
// Deploy by default, or when deploy_ecs is true, but NOT when deploy_ecs_only is true
if (!deployEcsOnly) {
  new PiHoleCdkStack(app, 'PiHoleCdkStack', piHoleProps);
  console.log('🏴‍☠️ Deploying EC2 Auto Scaling Group stack (PiHoleCdkStack)');
} else {
  console.log('⚓ Skippin\' EC2 stack - deploy_ecs_only flag be set, arr!');
}

// ⚓ New ECS Managed Instances stack (fer gradual regional migration)
// This stack uses containerized Pi-hole with ECS Managed Instances
// Deploy this to new regions or gradually migrate existing regions
// Only deploy when deploy_ecs or deploy_ecs_only flags are explicitly set
if (deployEcs || deployEcsOnly) {
  new PiHoleEcsManagedStack(app, 'PiHoleEcsManagedStack', piHoleProps);
  console.log('⚓ Deploying ECS Managed Instances stack (PiHoleEcsManagedStack)');
} else {
  console.log('🏴‍☠️ Skippin\' ECS stack - use deploy_ecs or deploy_ecs_only flag to enable, matey!');
}

new SiteToSiteVpnStack(app, 'SiteToSiteVpnStack', piHoleProps);

new TgwWithSiteToSiteVpnStack(app, 'TgwWithSiteToSiteVpnStack', piHoleProps);

