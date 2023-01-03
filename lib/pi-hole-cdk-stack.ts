import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_secretsmanager, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { ClientRequest, request } from 'http';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class PiHoleCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      // get the local ip address
      const local_ip = new ClientRequest("http://ip.42.pl/raw") + "/32";

      let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { isDefault: true });

      // start with default Linux userdata
      let user_data = aws_ec2.UserData.forLinux();

      var pwd = new aws_secretsmanager.Secret(this, 'piholepwd', {
          secretName: 'pihole-pwd'
      });

      user_data.addCommands('#!/bin/bash -x', 'SECRET_ARN=' + pwd.secretArn)

      // add data from file to user_data
      const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
      user_data.addCommands(userDataScript);

      // securityGroup
      let sg = new aws_ec2.SecurityGroup(this, 'allow_dns_http', { description: 'Allow DNS and SSH from my IP"', vpc: vpc }); 
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip), aws_ec2.Port.tcp(22), 'Allow SSH')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip), aws_ec2.Port.tcp(80), 'Allow HTTP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip), aws_ec2.Port.tcp(53), 'Allow DNS over TCP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip), aws_ec2.Port.udp(53), 'Allow DNS over UDP')


      var ec2 = new aws_ec2.Instance(this, 'pi-hole', {
          vpc: vpc,
          instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE4_GRAVITON, aws_ec2.InstanceSize.SMALL),
          machineImage: aws_ec2.MachineImage.genericLinux({
            'ap-southeast-2': 'ami-057d8973356164881',
            'us-east-1': 'ami-0e9221491fc51fca6',
            'us-east-2': 'ami-0e5ef720e9e713b90',
            'us-west-1': 'ami-0c18f05c0265a6d58',
            'us-west-2': 'ami-0ebb55611b3232f0d'}
          ),
          vpcSubnets: { subnetType: aws_ec2.SubnetType.PUBLIC },
          userData: user_data,
          securityGroup: sg
        }
      )

      let eip = new aws_ec2.CfnEIP(this, 'elastic-ip', {
          domain: 'vpc', 
          instanceId: ec2.instanceId
      })

      new CfnOutput(this, 'public-ip-address', { value: eip.attrPublicIp })
      new CfnOutput(this, 'local-ip', { value: local_ip})
      new CfnOutput(this, 'SecretArn', { value: pwd.secretArn })
  }
}
