#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PiHoleCdkStack } from '../lib/pi-hole-cdk-stack';
import { SiteToSiteVpnStack } from '../lib/sitetositevpn-stack';
import { StackProps } from 'aws-cdk-lib';
import { TgwWithSiteToSiteVpnStack } from '../lib/tgw-with-sitetositevpn-stack';
import { Node } from 'constructs';

const app = new cdk.App();

export interface RegionConfig {
  region: string;
  vpc_name?: string;
  keypair?: string;
  use_intel?: boolean;
}

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
  readonly deployment_regions : RegionConfig[];
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
    
    // Intel architecture requirement for Melbourne region (ap-southeast-4)
    this.bUseIntel = (env.region == 'ap-southeast-4');
    
    // Configure deployment regions
    this.deployment_regions = this.parseDeploymentRegions(env);
  }

  private parseDeploymentRegions(env: cdk.Environment): RegionConfig[] {
    const regions_context = this.node.tryGetContext('deployment_regions');
    const region_configs_context = this.node.tryGetContext('region_configs');
    
    // If deployment_regions is specified, use it; otherwise fall back to single region
    let target_regions: string[] = [];
    if (regions_context && Array.isArray(regions_context)) {
      target_regions = regions_context;
    } else if (env.region) {
      target_regions = [env.region];
    } else {
      target_regions = ['us-east-1']; // Default fallback
    }

    // Build region configurations
    const region_configs: RegionConfig[] = [];
    for (const region of target_regions) {
      let config: RegionConfig = {
        region: region,
        vpc_name: this.vpc_name,
        keypair: this.keypair,
        use_intel: this.shouldUseIntel(region)
      };

      // Override with region-specific configs if provided
      if (region_configs_context && region_configs_context[region]) {
        const region_override = region_configs_context[region];
        config.vpc_name = region_override.vpc_name || config.vpc_name;
        config.keypair = region_override.keypair || config.keypair;
        config.use_intel = region_override.use_intel !== undefined ? region_override.use_intel : config.use_intel;
      }

      region_configs.push(config);
    }

    return region_configs;
  }

  private shouldUseIntel(region: string): boolean {
    // Melbourne region (ap-southeast-4) requires Intel architecture
    // Frankfurt (eu-central-1) supports both, but we'll use Graviton for better cost/performance
    // Sydney (ap-southeast-2) supports both, we'll use Graviton
    return region === 'ap-southeast-4';
  }

  // Get region-specific configuration
  getRegionConfig(region: string): RegionConfig {
    const config = this.deployment_regions.find(r => r.region === region);
    if (!config) {
      throw new Error(`No configuration found for region: ${region}`);
    }
    return config;
  }
}

export interface PiHoleProps extends StackProps
{
  readonly appConfig : AppConfig;
  readonly regionConfig : RegionConfig;
}

// Initialize with default environment to parse configuration
var defaultEnv : cdk.Environment = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: process.env.CDK_DEFAULT_REGION 
};

var appConfig = new AppConfig(app.node, defaultEnv);

// Helper function to get region name suffix for stack naming
function getRegionSuffix(region: string): string {
  const regionMap: { [key: string]: string } = {
    'ap-southeast-2': 'Sydney',
    'ap-southeast-4': 'Melbourne',
    'eu-central-1': 'Frankfurt'
  };
  return regionMap[region] || region;
}

// Deploy stacks for each configured region
for (const regionConfig of appConfig.deployment_regions) {
  const regionEnv: cdk.Environment = {
    account: process.env.CDK_DEFAULT_ACCOUNT || defaultEnv.account,
    region: regionConfig.region
  };

  const regionSuffix = getRegionSuffix(regionConfig.region);
  
  // Create region-specific AppConfig
  const regionalAppConfig = new AppConfig(app.node, regionEnv);
  
  const piHoleProps: PiHoleProps = {
    appConfig: regionalAppConfig,
    regionConfig: regionConfig,
    env: regionEnv
  };

  // Create stacks with region-specific naming
  new PiHoleCdkStack(app, `PiHoleCdkStack-${regionSuffix}`, piHoleProps);

  new SiteToSiteVpnStack(app, `SiteToSiteVpnStack-${regionSuffix}`, piHoleProps);

  new TgwWithSiteToSiteVpnStack(app, `TgwWithSiteToSiteVpnStack-${regionSuffix}`, piHoleProps);
}

