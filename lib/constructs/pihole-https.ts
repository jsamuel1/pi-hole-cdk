import { aws_elasticloadbalancingv2, aws_ec2, aws_certificatemanager, aws_route53, aws_route53_targets, Duration, CfnOutput } from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2_actions } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PiHoleCognito } from './pihole-cognito';

export interface PiHoleHttpsProps {
  vpc: aws_ec2.IVpc;
  hostedZoneId: string;
  hostedZoneName: string;
  regionSubdomain: string;
  targetGroup: aws_elasticloadbalancingv2.INetworkTargetGroup;
  localIpCidr: string;
  cognitoDomainPrefix?: string;
}

export class PiHoleHttps extends Construct {
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly certificate: aws_certificatemanager.Certificate;
  public readonly regionalRecord: aws_route53.ARecord;
  public readonly albTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly cognito?: PiHoleCognito;

  constructor(scope: Construct, id: string, props: PiHoleHttpsProps) {
    super(scope, id);

    const hostedZone = aws_route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    const regionalDomain = `pihole-${props.regionSubdomain}.${props.hostedZoneName}`;

    this.certificate = new aws_certificatemanager.Certificate(this, 'Cert', {
      domainName: regionalDomain,
      subjectAlternativeNames: [`pihole.${props.hostedZoneName}`],
      validation: aws_certificatemanager.CertificateValidation.fromDns(hostedZone),
    });

    const albSg = new aws_ec2.SecurityGroup(this, 'AlbSg', {
      vpc: props.vpc,
      description: 'Pi-hole HTTPS ALB',
    });
    albSg.addIngressRule(aws_ec2.Peer.ipv4(props.localIpCidr), aws_ec2.Port.tcp(443), 'HTTPS from local');
    albSg.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(443), 'HTTPS from internet');

    this.alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSg,
    });

    this.albTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'HttpTarget', {
      vpc: props.vpc,
      port: 80,
      protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      healthCheck: {
        path: '/admin/',
        protocol: aws_elasticloadbalancingv2.Protocol.HTTP,
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        healthyHttpCodes: '200-399',
      },
    });

    // Set up Cognito if domain prefix provided
    if (props.cognitoDomainPrefix) {
      this.cognito = new PiHoleCognito(this, 'Cognito', {
        domainPrefix: props.cognitoDomainPrefix,
        callbackUrls: [
          `https://${regionalDomain}/oauth2/idpresponse`,
          `https://pihole.${props.hostedZoneName}/oauth2/idpresponse`,
        ],
      });

      const listener = this.alb.addListener('Https', {
        port: 443,
        certificates: [this.certificate],
        defaultAction: new aws_elasticloadbalancingv2_actions.AuthenticateCognitoAction({
          userPool: this.cognito.userPool,
          userPoolClient: this.cognito.userPoolClient,
          userPoolDomain: this.cognito.userPoolDomain,
          next: aws_elasticloadbalancingv2.ListenerAction.forward([this.albTargetGroup]),
        }),
      });
    } else {
      this.alb.addListener('Https', {
        port: 443,
        certificates: [this.certificate],
        defaultAction: aws_elasticloadbalancingv2.ListenerAction.forward([this.albTargetGroup]),
      });
    }

    this.regionalRecord = new aws_route53.ARecord(this, 'RegionalRecord', {
      zone: hostedZone,
      recordName: `pihole-${props.regionSubdomain}`,
      target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(this.alb)),
    });

    new CfnOutput(this, 'HttpsUrl', { value: `https://${regionalDomain}/admin` });
  }
}
