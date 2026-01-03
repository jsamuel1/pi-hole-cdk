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

    // Target groups (INSTANCE type - shared by ASG and ECS HOST mode)
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

    this.nlb.addListener('NLBDNS', { 
      port: 53, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP,
      defaultTargetGroups: [this.dnsTargetGroup]
    });

    this.nlb.addListener('NLBHTTP', { 
      port: 80, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP,
      defaultTargetGroups: [this.httpTargetGroup]
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
