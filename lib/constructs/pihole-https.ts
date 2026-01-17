import { aws_elasticloadbalancingv2, aws_elasticloadbalancingv2_targets, aws_ec2, aws_certificatemanager, aws_route53, aws_route53_targets, aws_wafv2, Duration, CfnOutput, SecretValue } from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2_actions } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PiHoleCognito } from './pihole-cognito';

export interface PiHoleHttpsProps {
  vpc: aws_ec2.IVpc;
  hostedZoneId?: string;  // Optional - only needed for DNS validation
  hostedZoneName: string;
  regionSubdomain: string;
  targetGroup: aws_elasticloadbalancingv2.INetworkTargetGroup;
  localIpCidr: string;
  cognitoDomainPrefix?: string;
  homeAssistantIp?: string;
  homeAssistantPort?: number;
  // External Cognito config
  externalCognitoUserPoolArn?: string;
  externalCognitoClientId?: string;
  externalCognitoClientSecret?: string;
  externalCognitoDomain?: string;
  // Use existing certificate instead of creating new one
  certificateArn?: string;
  // Allow unauthenticated API access from specific source IPs
  apiAllowedCidrs?: string[];
}

export class PiHoleHttps extends Construct {
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly certificate: aws_certificatemanager.ICertificate;
  public readonly regionalRecord?: aws_route53.ARecord;
  public readonly albTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
  public readonly cognito?: PiHoleCognito;

  constructor(scope: Construct, id: string, props: PiHoleHttpsProps) {
    super(scope, id);

    const hostedZone = props.hostedZoneId ? aws_route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    }) : undefined;

    const regionalDomain = `pihole-${props.regionSubdomain}.${props.hostedZoneName}`;
    const haDomains = [`ha.${props.hostedZoneName}`, `homeassistant.${props.hostedZoneName}`];

    const certDomains = [`pihole.${props.hostedZoneName}`];
    if (props.homeAssistantIp) {
      certDomains.push(...haDomains);
    }

    // Use existing certificate or create new one with DNS validation
    if (props.certificateArn) {
      this.certificate = aws_certificatemanager.Certificate.fromCertificateArn(this, 'Cert', props.certificateArn);
    } else if (hostedZone) {
      this.certificate = new aws_certificatemanager.Certificate(this, 'Cert', {
        domainName: regionalDomain,
        subjectAlternativeNames: certDomains,
        validation: aws_certificatemanager.CertificateValidation.fromDns(hostedZone),
      });
    } else {
      throw new Error('Either certificateArn or hostedZoneId must be provided');
    }

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

    // WAF WebACL with AWS managed rules
    const webAcl = new aws_wafv2.CfnWebACL(this, 'WebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'PiHoleWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputs',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'IpReputation',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new aws_wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
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

    // Home Assistant target group (if configured) - HTTP on port 8123
    // ALB terminates SSL, forwards to HA's native HTTP port
    // HA must have trusted_proxies configured to include VPC CIDR (10.0.0.0/16)
    const haPort = props.homeAssistantPort || 8123;
    let haTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup | undefined;
    if (props.homeAssistantIp) {
      haTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'HaTarget', {
        vpc: props.vpc,
        port: haPort,
        protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
        targetType: aws_elasticloadbalancingv2.TargetType.IP,
        healthCheck: {
          path: '/',
          port: String(haPort),
          protocol: aws_elasticloadbalancingv2.Protocol.HTTP,
          interval: Duration.seconds(30),
          timeout: Duration.seconds(10),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 5,
          healthyHttpCodes: '200-399',
        },
      });
      haTargetGroup.addTarget(new aws_elasticloadbalancingv2_targets.IpTarget(props.homeAssistantIp, haPort, 'all'));
    }

    // Set up Cognito if domain prefix provided or external config
    if (props.externalCognitoUserPoolArn && props.externalCognitoClientId && props.externalCognitoClientSecret && props.externalCognitoDomain) {
      // Use external Cognito pool via OIDC
      const userPoolId = props.externalCognitoUserPoolArn.split('/')[1];
      const issuer = `https://cognito-idp.ap-southeast-4.amazonaws.com/${userPoolId}`;

      this.cognito = new PiHoleCognito(this, 'Cognito', {
        callbackUrls: [],
        externalUserPoolArn: props.externalCognitoUserPoolArn,
        externalClientId: props.externalCognitoClientId,
        externalClientSecret: props.externalCognitoClientSecret,
        externalDomain: props.externalCognitoDomain,
      });

      const listener = this.alb.addListener('Https', {
        port: 443,
        certificates: [this.certificate],
        defaultAction: aws_elasticloadbalancingv2.ListenerAction.authenticateOidc({
          authorizationEndpoint: `https://${props.externalCognitoDomain}/oauth2/authorize`,
          tokenEndpoint: `https://${props.externalCognitoDomain}/oauth2/token`,
          userInfoEndpoint: `https://${props.externalCognitoDomain}/oauth2/userInfo`,
          clientId: props.externalCognitoClientId,
          clientSecret: SecretValue.unsafePlainText(props.externalCognitoClientSecret),
          issuer,
          next: aws_elasticloadbalancingv2.ListenerAction.forward([this.albTargetGroup]),
        }),
      });

      // Home Assistant - bypass Cognito, use HA's own auth (protected by WAF)
      if (haTargetGroup) {
        listener.addAction('HaRule', {
          priority: 10,
          conditions: [aws_elasticloadbalancingv2.ListenerCondition.hostHeaders(haDomains)],
          action: aws_elasticloadbalancingv2.ListenerAction.forward([haTargetGroup]),
        });
      }

      // Allow unauthenticated API access from specific CIDRs
      if (props.apiAllowedCidrs && props.apiAllowedCidrs.length > 0) {
        listener.addAction('ApiBypass', {
          priority: 5,
          conditions: [
            aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(['/api/*']),
            aws_elasticloadbalancingv2.ListenerCondition.sourceIps(props.apiAllowedCidrs),
          ],
          action: aws_elasticloadbalancingv2.ListenerAction.forward([this.albTargetGroup]),
        });
      }
    } else if (props.cognitoDomainPrefix) {
      this.cognito = new PiHoleCognito(this, 'Cognito', {
        domainPrefix: props.cognitoDomainPrefix,
        callbackUrls: [
          `https://${regionalDomain}/oauth2/idpresponse`,
          `https://pihole.${props.hostedZoneName}/oauth2/idpresponse`,
          ...(props.homeAssistantIp ? haDomains.map(d => `https://${d}/oauth2/idpresponse`) : []),
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

      // Home Assistant - bypass Cognito, use HA's own auth (protected by WAF)
      if (haTargetGroup) {
        listener.addAction('HaRule', {
          priority: 10,
          conditions: [aws_elasticloadbalancingv2.ListenerCondition.hostHeaders(haDomains)],
          action: aws_elasticloadbalancingv2.ListenerAction.forward([haTargetGroup]),
        });
      }

      // Allow unauthenticated API access from specific CIDRs
      if (props.apiAllowedCidrs && props.apiAllowedCidrs.length > 0) {
        listener.addAction('ApiBypass', {
          priority: 5,
          conditions: [
            aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(['/api/*']),
            aws_elasticloadbalancingv2.ListenerCondition.sourceIps(props.apiAllowedCidrs),
          ],
          action: aws_elasticloadbalancingv2.ListenerAction.forward([this.albTargetGroup]),
        });
      }
    } else {
      this.alb.addListener('Https', {
        port: 443,
        certificates: [this.certificate],
        defaultAction: aws_elasticloadbalancingv2.ListenerAction.forward([this.albTargetGroup]),
      });
    }

    // Only create DNS record if hosted zone is provided (same account)
    if (hostedZone) {
      this.regionalRecord = new aws_route53.ARecord(this, 'RegionalRecord', {
        zone: hostedZone,
        recordName: `pihole-${props.regionSubdomain}`,
        target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(this.alb)),
      });
    }

    new CfnOutput(this, 'HttpsUrl', { value: `https://${regionalDomain}/admin` });
  }
}
