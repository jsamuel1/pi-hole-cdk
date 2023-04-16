import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, aws_secretsmanager, aws_efs, CfnOutput, aws_autoscaling } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';

export class PiHoleCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const local_ip = this.node.tryGetContext('local_ip');
    const local_ip_cidr = local_ip + "/32"
    const vpc_name = this.node.tryGetContext('vpc_name');
    const keypair = this.node.tryGetContext('keypair');
    const public_http = this.node.tryGetContext('public_http');
    const bPublic_http = (public_http != undefined && (public_http == "True" || public_http == true));


    let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name });

    // start with default Linux userdata
    let user_data = aws_ec2.UserData.forLinux();

    var pwd = new aws_secretsmanager.Secret(this, 'piholepwd', {
      secretName: 'pihole-pwd',
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false
      }
    });


    let file_system = new aws_efs.FileSystem(this, "pihole-fs", {
      vpc: vpc,
      encrypted: true,
      fileSystemName: "pihole-fs"
    });

    user_data.addCommands('SECRET_ARN=' + pwd.secretArn)
    user_data.addCommands('EFS_ID=' + file_system.fileSystemId);

    // add data from file to user_data
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
    user_data.addCommands(userDataScript);


    // securityGroup
    let sgEc2 = new aws_ec2.SecurityGroup(this, 'allow_dns_http', { description: 'AllowDNSandSSHfrommyIP', vpc: vpc });

    if (this.region != "ap-southeast-4") {
      let prefix_list = new aws_ec2.CfnPrefixList(this, "rfc1918prefix", {
        prefixListName: "RFC1918",
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
    }
    else
    {
        // array of rfc1918 prefixes
        let rfc1918 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
        for (let i = 0; i < rfc1918.length; i++) {
            sgEc2.addIngressRule(aws_ec2.Peer.ipv4(rfc1918[i]), aws_ec2.Port.tcp(22), 'Allow_SSH')
            sgEc2.addIngressRule(aws_ec2.Peer.ipv4(rfc1918[i]), aws_ec2.Port.tcp(80), 'Allow_HTTP')
            sgEc2.addIngressRule(aws_ec2.Peer.ipv4(rfc1918[i]), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
            sgEc2.addIngressRule(aws_ec2.Peer.ipv4(rfc1918[i]), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')
        }
    }
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
                resources: [ '*' ]
              })
            ]
          }
        )
      }
    });

    var instanceType = aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE4_GRAVITON, aws_ec2.InstanceSize.MICRO);
    var machineImage = aws_ec2.MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id');

    if (this.region == 'ap-southeast-4')
    {
      instanceType = aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE3, aws_ec2.InstanceSize.MICRO);
      machineImage = aws_ec2.MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id');
    }

    const asg = new aws_autoscaling.AutoScalingGroup(this, 'pihole-asg', {
      vpc: vpc,
      instanceType: instanceType,
      machineImage: machineImage,
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
      userData: user_data,
      keyName: keypair,
      requireImdsv2: true,
      role: role,
      securityGroup: sgEc2
    });

    if (bPublic_http) {
      let sgAlbIngress = new aws_ec2.SecurityGroup(this, 'sg-albIngress', { description: 'Security Group for ALB Ingress', vpc: vpc });
      sgAlbIngress.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let sgAlbTarget = new aws_ec2.SecurityGroup(this, 'sg-albTarget', { description: 'Security Group for ALB Target', vpc: vpc });
      sgAlbTarget.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'Allow access to ALB to any IP');
      sgEc2.addIngressRule(sgAlbTarget, aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'alb', {
        vpc: vpc,
        internetFacing: true,
        securityGroup: sgAlbTarget
      });

      let albListener = alb.addListener('ALBHttp', { port: 80, open: false });
      albListener.addTargets('targetgroup', { port: 80, targets: [asg] });
      albListener.connections.addSecurityGroup(sgAlbIngress);

      new CfnOutput(this, 'admin-public-url', { value: `http://${alb.loadBalancerDnsName}/admin` });
    }

    let nlb = new cdk.aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'nlb', {
      vpc: vpc,
      internetFacing: false
    });
    let nlbListener = nlb.addListener('NLBDNS', { port: 53, protocol: cdk.aws_elasticloadbalancingv2.Protocol.TCP_UDP });
    nlbListener.addTargets("piholesTargets", { port: 53, targets: [asg] });

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

    new CfnOutput(this, "admin-url", { value: "http://pi.hole/admin"}); // Only after setting up DNS
    new CfnOutput(this, 'SecretArn', { value: pwd.secretArn })
  }
}
