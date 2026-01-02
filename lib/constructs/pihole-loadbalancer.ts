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
  public readonly dnsTargetGroupEcs: aws_elasticloadbalancingv2.NetworkTargetGroup;
  public readonly httpTargetGroupEcs: aws_elasticloadbalancingv2.NetworkTargetGroup;
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

    // Target groups for ASG (INSTANCE type)
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

    // Target groups for ECS (IP type for awsvpc mode)
    this.dnsTargetGroupEcs = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'dnsTargetGroupEcs', {
      vpc: props.vpc,
      port: 53,
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      deregistrationDelay: Duration.minutes(props.config.deregistrationDelayMinutes),
    });
    this.dnsTargetGroupEcs.setAttribute("deregistration_delay.connection_termination.enabled", "true");

    this.httpTargetGroupEcs = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'httpTargetGroupEcs', {
      vpc: props.vpc,
      port: 80,
      protocol: aws_elasticloadbalancingv2.Protocol.TCP,
      targetType: aws_elasticloadbalancingv2.TargetType.IP,
      deregistrationDelay: Duration.minutes(props.config.deregistrationDelayMinutes),
      healthCheck: { protocol: aws_elasticloadbalancingv2.Protocol.HTTP, path: '/admin/' }
    });

    // Listeners with multiple target groups (weighted)
    const dnsListener = this.nlb.addListener('NLBDNS', { 
      port: 53, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP,
      defaultAction: aws_elasticloadbalancingv2.NetworkListenerAction.weightedForward([
        { targetGroup: this.dnsTargetGroup, weight: 1 },
        { targetGroup: this.dnsTargetGroupEcs, weight: 1 }
      ])
    });

    const httpListener = this.nlb.addListener('NLBHTTP', { 
      port: 80, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP,
      defaultAction: aws_elasticloadbalancingv2.NetworkListenerAction.weightedForward([
        { targetGroup: this.httpTargetGroup, weight: 1 },
        { targetGroup: this.httpTargetGroupEcs, weight: 1 }
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