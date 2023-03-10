#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PiHoleCdkStack } from '../lib/pi-hole-cdk-stack';
import { SiteToSiteVpnStack } from '../lib/sitetositevpn-stack';

const app = new cdk.App();

new PiHoleCdkStack(app, 'PiHoleCdkStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  }
});

new SiteToSiteVpnStack(app, 'SiteToSiteVpnStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

