import { aws_elasticloadbalancingv2, aws_ec2, Duration } from 'aws-cdk-lib';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PiHoleConfig } from '../config/pihole-config';

export interface PiHoleLoadBalancerProps {
  vpc: aws_ec2.IVpc;
  config: PiHoleConfig;
  resourceSuffix?: string;
}

export class PiHoleLoadBalancer extends Construct {
  public readonly nlb: aws_elasticloadbalancingv2.NetworkLoadBalancer;
  public readonly dnsTargetGroup: aws_elasticloadbalancingv2.NetworkTargetGroup;
  public readonly httpTargetGroup: aws_elasticloadbalancingv2.NetworkTargetGroup;
  // ECS awsvpc mode target groups (IP type, UDP-only DNS)
  public readonly ecsDnsTargetGroup: aws_elasticloadbalancingv2.NetworkTargetGroup;
  public readonly ecsHttpTargetGroup: aws_elasticloadbalancingv2.NetworkTargetGroup;
  public readonly getEndpointIps: AwsCustomResource;

  constructor(scope: Construct, id: string, props: PiHoleLoadBalancerProps) {
    super(scope, id);

    const suffix = props.resourceSuffix || '';
    
    this.nlb = new aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'nlb', {
      vpc: props.vpc,
      internetFacing: false,
      crossZoneEnabled: true,
      loadBalancerName: `pihole${suffix}`,
      securityGroups: []
    });

    // ASG target groups (INSTANCE type - TCP_UDP)
    this.dnsTargetGroup = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'dnsTargetGroup', {
      vpc: props.vpc,
      port: 53,
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP,
      targetType: aws_elasticloadbalancingv2.TargetType.INSTANCE,
      deregistrationDelay: Duration.minutes(props.config.deregistrationDelayMinutes),
    });
    this.dnsTargetGroup.setAttribute("deregistration_delay.connection_termination.enabled", "true");

    this.httpTargetGroup = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'httpTargetGroup', {
      vpc: props.vpc,
      port: 80,
      protocol: aws_elasticloadbalancingv2.Protocol.TCP,
      targetType: aws_elasticloadbalancingv2.TargetType.INSTANCE,
      deregistrationDelay: Duration.minutes(props.config.deregistrationDelayMinutes),
      healthCheck: { protocol: aws_elasticloadbalancingv2.Protocol.HTTP, path: '/admin/' }
    });

    // ECS target groups (IP type for awsvpc mode - UDP only for DNS)
    this.ecsDnsTargetGroup = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'ecsDnsTargetGroup', {
      vpc: props.vpc,
      port: 53,
      protocol: aws_elasticloadbalancingv2.Protocol.UDP,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      deregistrationDelay: Duration.minutes(props.config.deregistrationDelayMinutes),
    });

    this.ecsHttpTargetGroup = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'ecsHttpTargetGroup', {
      vpc: props.vpc,
      port: 80,
      protocol: aws_elasticloadbalancingv2.Protocol.TCP,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      deregistrationDelay: Duration.minutes(props.config.deregistrationDelayMinutes),
      healthCheck: { protocol: aws_elasticloadbalancingv2.Protocol.HTTP, path: '/admin/' }
    });

    // Listener with multiple target groups (ASG + ECS) - equal weights
    this.nlb.addListener('NLBDNS', { 
      port: 53, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP,
      defaultAction: aws_elasticloadbalancingv2.NetworkListenerAction.weightedForward([
        { targetGroup: this.dnsTargetGroup, weight: 1 },
        { targetGroup: this.ecsDnsTargetGroup, weight: 1 }
      ])
    });

    this.nlb.addListener('NLBHTTP', { 
      port: 80, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP,
      defaultAction: aws_elasticloadbalancingv2.NetworkListenerAction.weightedForward([
        { targetGroup: this.httpTargetGroup, weight: 1 },
        { targetGroup: this.ecsHttpTargetGroup, weight: 1 }
      ])
    });

    this.getEndpointIps = new AwsCustomResource(this, 'GetEndpointIps', {
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          Filters: [{ Name: "description", Values: [`ELB ${this.nlb.loadBalancerFullName}`] }],
        },
        physicalResourceId: PhysicalResourceId.of('GetEndpointIps'),
        outputPaths: ['NetworkInterfaces.0.PrivateIpAddress', 'NetworkInterfaces.1.PrivateIpAddress', 'NetworkInterfaces.2.PrivateIpAddress']
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: false
    });

    this.getEndpointIps.node.addDependency(this.nlb);
  }
}
