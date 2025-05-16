import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PiHoleCdkStack } from '../lib/pi-hole-cdk-stack';
import { AppConfig, PiHoleProps } from '../bin/pi-hole-cdk';
import { Node } from 'constructs';

describe('Pi-Hole CDK Stack Tests', () => {
  test('Stack can be deployed in Frankfurt region', () => {
    // GIVEN
    const app = new cdk.App();
    const env: cdk.Environment = {
      account: '123456789012', // Mock account ID
      region: 'eu-central-1'   // Frankfurt region
    };
    
    // Mock AppConfig
    const appConfig = new AppConfig(app.node, env);
    
    // WHEN
    const props: PiHoleProps = {
      appConfig: appConfig,
      env: env
    };
    
    const stack = new PiHoleCdkStack(app, 'PiHoleCdkStack-frankfurt', props);
    
    // THEN
    const template = Template.fromStack(stack);
    
    // Verify that the stack uses Intel architecture in Frankfurt
    template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
      LaunchTemplateData: {
        InstanceType: 't3.small' // Intel instance type
      }
    });
  });
  
  test('Stack can be deployed in Sydney region', () => {
    // GIVEN
    const app = new cdk.App();
    const env: cdk.Environment = {
      account: '123456789012', // Mock account ID
      region: 'ap-southeast-2' // Sydney region
    };
    
    // Mock AppConfig
    const appConfig = new AppConfig(app.node, env);
    
    // WHEN
    const props: PiHoleProps = {
      appConfig: appConfig,
      env: env
    };
    
    const stack = new PiHoleCdkStack(app, 'PiHoleCdkStack-sydney', props);
    
    // THEN
    const template = Template.fromStack(stack);
    
    // Verify that the stack uses ARM architecture in Sydney
    template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
      LaunchTemplateData: {
        InstanceType: 't4g.small' // ARM instance type
      }
    });
  });
});
