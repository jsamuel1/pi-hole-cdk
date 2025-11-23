import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, aws_secretsmanager, aws_efs, CfnOutput, aws_autoscaling, aws_elasticloadbalancingv2 } from 'aws-cdk-lib';
import { LaunchTemplate } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import { HealthChecks, UpdatePolicy } from 'aws-cdk-lib/aws-autoscaling';


export class PiHoleCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleProps) {
    super(scope, id, props);

    const local_ip = props.appConfig.local_ip;
    const local_ip_cidr = props.appConfig.local_ip_cidr;
    const local_internal_cidr = props.appConfig.local_internal_cidr;
    
    // Use region-specific configuration
    const regionConfig = props.regionConfig;
    const vpc_name = regionConfig.vpc_name || props.appConfig.vpc_name;
    const keypair = regionConfig.keypair || props.appConfig.keypair;
    const bPublic_http = props.appConfig.bPublic_http;

    const bUseIntel = regionConfig.use_intel || false;

    let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name, isDefault: false });

    // start with default Linux userdata
    let user_data = aws_ec2.UserData.forLinux();

    // Use region-specific naming to support multi-region deployments
    const regionSuffix = props.env?.region || 'default';
    
    var pwd = new aws_secretsmanager.Secret(this, 'piholepwd', {
      secretName: `pihole-pwd-${regionSuffix}`,
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false
      }
    });


    let file_system = new aws_efs.FileSystem(this, "pihole-fs", {
      vpc: vpc,
      encrypted: true,
      fileSystemName: `pihole-fs-${regionSuffix}`
    });

    user_data.addCommands('SECRET_ARN=' + pwd.secretArn)
    user_data.addCommands('EFS_ID=' + file_system.fileSystemId);
    user_data.addCommands('REV_SERVER_CIDR=' + local_internal_cidr);
    user_data.addCommands('REV_SERVER_TARGET=' + '192.168.1.1');

    // add data from file to user_data
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
    user_data.addCommands(userDataScript);


    // securityGroup
    let sgEc2 = new aws_ec2.SecurityGroup(this, 'allow_dns_http', { description: 'AllowDNSandSSHfrommyIP', vpc: vpc });

    let prefix_list = new aws_ec2.CfnPrefixList(this, "rfc1918prefix", {
      prefixListName: `RFC1918-${regionSuffix}`,
      addressFamily: "IPv4",
      maxEntries: 3,
      entries: [
        {
          cidr: "10.0.0.0/8",
          description: "RFC1918 10/8"
        },
        {
          cidr: "172.16.0.0/12",
          description: "RFC1918 172.16/12"
        },
        {
          cidr: "192.168.0.0/16",
          description: "RFC1918 192.168/16"
        }
      ]
    });
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(22), 'Allow_SSH')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(80), 'Allow_HTTP')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.icmpPing(), 'Allow ICMP Ping')

    file_system.connections.allowDefaultPortFrom(sgEc2);

    let role = new aws_iam.Role(this, 'pihole-role', {
      assumedBy: new aws_iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMPatchAssociation'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ],
      inlinePolicies: {
        'secretPolicy': new PolicyDocument(
          {
            statements: [
              new PolicyStatement({
                actions: [
                  "secretsmanager:GetResourcePolicy",
                  "secretsmanager:GetSecretValue",
                  "secretsmanager:DescribeSecret",
                  "secretsmanager:ListSecretVersionIds"
                ],
                effect: Effect.ALLOW,
                resources: [pwd.secretArn]
              }),
              new PolicyStatement({
                actions: [
                  "secretsmanager:ListSecrets",
                ],
                effect: Effect.ALLOW,
                resources: ["*"]
              })
            ]
          }
        ),
        'kmsPolicy': new PolicyDocument(
          {
            statements: [
              new PolicyStatement({
                actions: [
                  "kms:Encrypt",
                  "kms:Decrypt",
                  "kms:ReEncrypt*",
                  "kms:GenerateDataKey*",
                  "kms:DescribeKey"
                ],
                effect: Effect.ALLOW,
                resources: ['*']
              })
            ]
          }
        )
      }
    });

    var instanceType = aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE4_GRAVITON, aws_ec2.InstanceSize.SMALL);
    var machineImage = aws_ec2.MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id');

    if (bUseIntel) {
      instanceType = aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE3, aws_ec2.InstanceSize.SMALL);
      machineImage = aws_ec2.MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id');
    }

    var launchTemplate = new LaunchTemplate(this, 'pihole-asg-launchtemplate', {
      instanceType: instanceType,
      machineImage: machineImage,
      userData: user_data,
      role: role,
      securityGroup: sgEc2,
      requireImdsv2: true,
      keyPair: aws_ec2.KeyPair.fromKeyPairName(this, 'KeyPair', keypair)
    });

    const asg = new aws_autoscaling.AutoScalingGroup(this, 'pihole-asg', {
      launchTemplate: launchTemplate,
      vpc: vpc,
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
      maxInstanceLifetime: cdk.Duration.days(7),
      updatePolicy: UpdatePolicy.rollingUpdate(),
      healthChecks: HealthChecks.ec2()
    });

    if (bPublic_http) {
      let sgAlbIngress = new aws_ec2.SecurityGroup(this, 'sg-albIngress', { description: 'Security Group for ALB Ingress', vpc: vpc });
      sgAlbIngress.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let sgAlbTarget = new aws_ec2.SecurityGroup(this, 'sg-albTarget', { description: 'Security Group for ALB Target', vpc: vpc });
      sgAlbTarget.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'Allow access to ALB to any IP');
      sgEc2.addIngressRule(sgAlbTarget, aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'alb', {
        vpc: vpc,
        internetFacing: true,
        securityGroup: sgAlbTarget
      });

      let albListener = alb.addListener('ALBHttp', { port: 80, open: false });
      albListener.addTargets('targetgroup', { port: 80, targets: [asg] });
      albListener.connections.addSecurityGroup(sgAlbIngress);

      new CfnOutput(this, 'admin-public-url', { value: `http://${alb.loadBalancerDnsName}/admin` });
    }

    let nlb = new aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'nlb', {
      vpc: vpc,
      internetFacing: false,
      crossZoneEnabled: true,
      loadBalancerName: `pihole-${regionSuffix}`
    });
    let nlbListener = nlb.addListener('NLBDNS', { port: 53, protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP });
    let targetGroup = nlbListener.addTargets("piholesTargets", {
      port: 53, targets: [asg], deregistrationDelay: cdk.Duration.minutes(2),
      // healthCheck: { timeout: cdk.Duration.seconds(10), healthyThresholdCount: 4, unhealthyThresholdCount: 4 } 
    });

    targetGroup.setAttribute("deregistration_delay.connection_termination.enabled", "true");

    const getEndpointIps = new AwsCustomResource(this, 'GetEndpointIps', {
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          Filters: [{ Name: "description", Values: [`ELB ${nlb.loadBalancerFullName}`] }],
        },
        physicalResourceId: PhysicalResourceId.of('GetEndpointIps'),
        outputPaths: ['NetworkInterfaces.0.PrivateIpAddress', 'NetworkInterfaces.1.PrivateIpAddress', 'NetworkInterfaces.2.PrivateIpAddress']
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: false
    });

    getEndpointIps.node.addDependency(nlb);

    new CfnOutput(this, 'dns1', {
      value: getEndpointIps.getResponseField('NetworkInterfaces.0.PrivateIpAddress')
    });
    new CfnOutput(this, 'dns2', {
      value: getEndpointIps.getResponseField('NetworkInterfaces.1.PrivateIpAddress')
    });

    new CfnOutput(this, "admin-url", { value: "http://pi.hole/admin" }); // Only after setting up DNS
    new CfnOutput(this, 'SecretArn', { value: pwd.secretArn })
    new CfnOutput(this, 'RFC1918PrefixListId', { value: prefix_list.attrPrefixListId, exportName: `RFC1918PrefixListId-${regionSuffix}` })
  }
}
