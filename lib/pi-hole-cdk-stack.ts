import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, aws_secretsmanager, aws_efs, CfnOutput, aws_autoscaling } from 'aws-cdk-lib';
import { AutoScalingAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import * as http from 'http';

export class PiHoleCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const local_ip = this.node.tryGetContext('local_ip');
      const local_ip_cidr = local_ip + "/32"
      const vpc_name = this.node.tryGetContext('vpc_name');
      const keypair = this.node.tryGetContext('keypair'); 

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name });

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

      // start with default Linux userdata
      let user_data = aws_ec2.UserData.forLinux();

      var pwd = new aws_secretsmanager.Secret(this, 'piholepwd', {
          secretName: 'pihole-pwd',
          generateSecretString: {
              excludePunctuation: true,
              includeSpace: false }
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
      sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(22), 'Allow_SSH')
      sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(80), 'Allow_HTTP')
      sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
      sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')
      file_system.connections.allowDefaultPortFrom(sgEc2);

      let sgAlbIngress = new aws_ec2.SecurityGroup(this, 'sg-albIngress', { description: 'Security Group for ALB Ingress', vpc: vpc }); 
      sgAlbIngress.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let sgAlbTarget = new aws_ec2.SecurityGroup(this, 'sg-albTarget', { description: 'Security Group for ALB Target', vpc: vpc }); 
      sgAlbTarget.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'Allow access to ALB to any IP');
      sgEc2.addIngressRule(sgAlbTarget, aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

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
          )
        }
      });

      const asg = new aws_autoscaling.AutoScalingGroup(this, 'pihole-asg', {
          vpc: vpc,
          instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE4_GRAVITON, aws_ec2.InstanceSize.SMALL),
          machineImage: aws_ec2.MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id'),        
          vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
          userData: user_data,
          keyName: keypair,
          requireImdsv2: true,
          role: role
      });

      let alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'alb', {
          vpc: vpc,
          internetFacing: true,
          securityGroup: sgAlbTarget
      });
      
      let albListener = alb.addListener('ALBHttp', { port: 80, open: false} );
      albListener.addTargets('targetgroup', { port: 80, targets: [asg] });
      albListener.connections.addSecurityGroup(sgAlbIngress);

      

      new CfnOutput(this, 'admin-url', { value: "http://" + alb.loadBalancerDnsName + "/admin" });
      new CfnOutput(this, 'local-ip', { value: local_ip_cidr})
      new CfnOutput(this, 'SecretArn', { value: pwd.secretArn })
  }
}
