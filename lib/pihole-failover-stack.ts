import * as cdk from 'aws-cdk-lib';
import { aws_route53 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleFailoverStackProps extends cdk.StackProps {
  hostedZoneId: string;
  hostedZoneName: string;
  melAlbDnsName: string;
  sydAlbDnsName: string;
  melAlbHostedZoneId: string;
  sydAlbHostedZoneId: string;
}

export class PiHoleFailoverStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleFailoverStackProps) {
    super(scope, id, props);

    // Health checks for each region's ALB
    const melHealthCheck = new aws_route53.CfnHealthCheck(this, 'MelHealthCheck', {
      healthCheckConfig: {
        type: 'HTTPS',
        fullyQualifiedDomainName: props.melAlbDnsName,
        port: 443,
        resourcePath: '/admin/',
        requestInterval: 30,
        failureThreshold: 3,
      },
      healthCheckTags: [{ key: 'Name', value: 'pihole-mel-health' }],
    });

    const sydHealthCheck = new aws_route53.CfnHealthCheck(this, 'SydHealthCheck', {
      healthCheckConfig: {
        type: 'HTTPS',
        fullyQualifiedDomainName: props.sydAlbDnsName,
        port: 443,
        resourcePath: '/admin/',
        requestInterval: 30,
        failureThreshold: 3,
      },
      healthCheckTags: [{ key: 'Name', value: 'pihole-syd-health' }],
    });

    // Primary record - Melbourne
    new aws_route53.CfnRecordSet(this, 'PrimaryRecord', {
      hostedZoneId: props.hostedZoneId,
      name: props.hostedZoneName,
      type: 'A',
      aliasTarget: {
        dnsName: props.melAlbDnsName,
        hostedZoneId: props.melAlbHostedZoneId,
        evaluateTargetHealth: true,
      },
      setIdentifier: 'mel-primary',
      failover: 'PRIMARY',
      healthCheckId: melHealthCheck.attrHealthCheckId,
    });

    // Secondary record - Sydney
    new aws_route53.CfnRecordSet(this, 'SecondarySydRecord', {
      hostedZoneId: props.hostedZoneId,
      name: props.hostedZoneName,
      type: 'A',
      aliasTarget: {
        dnsName: props.sydAlbDnsName,
        hostedZoneId: props.sydAlbHostedZoneId,
        evaluateTargetHealth: true,
      },
      setIdentifier: 'syd-secondary',
      failover: 'SECONDARY',
      healthCheckId: sydHealthCheck.attrHealthCheckId,
    });

    new cdk.CfnOutput(this, 'FailoverDomain', { value: `https://${props.hostedZoneName}/admin` });
  }
}
