import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, aws_secretsmanager, aws_efs, CfnOutput } from 'aws-cdk-lib';
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


      let eip = new aws_ec2.CfnEIP(this, 'elastic-ip', {
        domain: 'vpc' 
    })

      user_data.addCommands('SECRET_ARN=' + pwd.secretArn)
      user_data.addCommands('EFS_ID=' + file_system.fileSystemId); 
      user_data.addCommands('PUBLIC_IP=' + eip.attrPublicIp )
      
      // add data from file to user_data
      const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
      user_data.addCommands(userDataScript);

      const openvpnScript = readFileSync('./lib/openvpn.sh', 'utf8');
      user_data.addCommands(openvpnScript);

      // securityGroup
      let sg = new aws_ec2.SecurityGroup(this, 'allow_dns_http', { description: 'AllowDNSandSSHfrommyIP', vpc: vpc }); 
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(22), 'Allow_SSH')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow_HTTP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')
      sg.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.udp(1194), 'OpenVPN tunnel')
      sg.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(22), 'Allow_SSH')
      sg.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(80), 'Allow_HTTP')
      sg.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
      sg.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')
      
      var ec2 = new aws_ec2.Instance(this, 'pi-hole', {
          vpc: vpc,
          instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.BURSTABLE4_GRAVITON, aws_ec2.InstanceSize.SMALL),
//          machineImage: aws_ec2.MachineImage.fromSsmParameter('/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-default-arm64'),
          machineImage: aws_ec2.MachineImage.genericLinux({
            'ap-southeast-2': 'ami-057d8973356164881'}
          ),
          vpcSubnets: { subnetType: aws_ec2.SubnetType.PUBLIC },
          userData: user_data,
          securityGroup: sg,
          keyName: keypair,
          userDataCausesReplacement: true        
        }
      )

      ec2.role.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess'));
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

    file_system.connections.allowDefaultPortFrom(ec2);

    new aws_ec2.CfnEIPAssociation(this, 'ec2assoc', {
      eip: eip.ref,
        instanceId: ec2.instanceId
    });

      new CfnOutput(this, 'public-ip-address', { value: eip.attrPublicIp })
      new CfnOutput(this, 'admin-url', { value: "http://" + eip.attrPublicIp + "/admin" });
      new CfnOutput(this, 'local-ip', { value: local_ip_cidr})
      new CfnOutput(this, 'SecretArn', { value: pwd.secretArn })
  }
}
