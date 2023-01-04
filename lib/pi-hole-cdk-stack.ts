import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, aws_secretsmanager, CfnOutput } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import * as http from 'http';

export class PiHoleCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const local_ip_cidr = this.node.tryGetContext('local_ip_cidr');
      const vpc_name = this.node.tryGetContext('vpc_name');
      const keypair = this.node.tryGetContext('keypair'); 

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name });

      // start with default Linux userdata
      let user_data = aws_ec2.UserData.forLinux();

      var pwd = new aws_secretsmanager.Secret(this, 'piholepwd', {
          secretName: 'pihole-pwd',
          generateSecretString: {
              excludePunctuation: true,
              includeSpace: false }
      });

      user_data.addCommands('#!/bin/bash -x', 'SECRET_ARN=' + pwd.secretArn)

      // add data from file to user_data
      const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
      user_data.addCommands(userDataScript);

      // securityGroup
      let sg = new aws_ec2.SecurityGroup(this, 'allow_dns_http', { description: 'AllowDNSandSSHfrommyIP', vpc: vpc }); 
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(22), 'Allow_SSH')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow_HTTP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')


      var ec2 = new aws_ec2.Instance(this, 'pi-hole', {
          vpc: vpc,
          instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE4_GRAVITON, aws_ec2.InstanceSize.SMALL),
          machineImage: aws_ec2.MachineImage.genericLinux({
            'ap-southeast-2': 'ami-0078c27523980acff'  // Ubuntu 20.04 LTS / arm64 / ap-southeast-2 /Release 20221212
          }),
          vpcSubnets: { subnetType: aws_ec2.SubnetType.PUBLIC },
          userData: user_data,
          securityGroup: sg,
          keyName: keypair
        }
      )

      ec2.role.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
      ec2.addToRolePolicy(new PolicyStatement({
          actions: [
            "secretsmanager:GetResourcePolicy",
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
            "secretsmanager:ListSecretVersionIds"
          ],
          effect: Effect.ALLOW,
          resources: [pwd.secretArn]
      }));

      ec2.addToRolePolicy(new PolicyStatement({
        actions: [
          "secretsmanager:ListSecrets",
        ],
        effect: Effect.ALLOW,
        resources: ["*"]
    }));


      let eip = new aws_ec2.CfnEIP(this, 'elastic-ip', {
          domain: 'vpc', 
          instanceId: ec2.instanceId
      })

      new CfnOutput(this, 'public-ip-address', { value: eip.attrPublicIp })
      new CfnOutput(this, 'admin-url', { value: "http://" + eip.attrPublicIp + "/admin" });
      new CfnOutput(this, 'local-ip', { value: local_ip_cidr})
      new CfnOutput(this, 'SecretArn', { value: pwd.secretArn })
  }
}
