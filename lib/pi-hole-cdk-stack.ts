import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, CfnOutput, aws_autoscaling, aws_elasticloadbalancingv2 } from 'aws-cdk-lib';
import { LaunchTemplate } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import { HealthChecks, UpdatePolicy } from 'aws-cdk-lib/aws-autoscaling';
import { PiHoleNetworking, PiHoleStorage, PiHoleLoadBalancer, PiHoleIamPolicies } from './constructs';


export class PiHoleCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleProps) {
    super(scope, id, props);

    const local_ip = props.appConfig.local_ip;
    const local_ip_cidr = props.appConfig.local_ip_cidr;
    const local_internal_cidr = props.appConfig.local_internal_cidr;
    const vpc_name = props.appConfig.vpc_name;
    const keypair = props.appConfig.keypair;
    const bPublic_http = props.appConfig.bPublic_http;
    const bUseIntel = props.appConfig.bUseIntel;

    // Use shared constructs
    const networking = new PiHoleNetworking(this, 'PiHoleNetworking', {
      vpcName: vpc_name!
    });

    const storage = new PiHoleStorage(this, 'PiHoleStorage', {
      vpc: networking.vpc,
      securityGroup: networking.securityGroup
    });

    // start with default Linux userdata
    let user_data = aws_ec2.UserData.forLinux();

    user_data.addCommands('SECRET_ARN=' + storage.secret.secretArn)
    user_data.addCommands('EFS_ID=' + storage.fileSystem.fileSystemId);
    user_data.addCommands('REV_SERVER_CIDR=' + local_internal_cidr);
    user_data.addCommands('REV_SERVER_TARGET=' + props.appConfig.piHoleConfig.revServerTarget);

    // add data from file to user_data
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
    user_data.addCommands(userDataScript);

    let role = new aws_iam.Role(this, 'pihole-role', {
      assumedBy: new aws_iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMPatchAssociation'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ],
      inlinePolicies: {
        'secretPolicy': PiHoleIamPolicies.createSecretsPolicy(storage.secret.secretArn),
        'kmsPolicy': PiHoleIamPolicies.createKmsPolicy()
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
      securityGroup: networking.securityGroup,
      requireImdsv2: true,
      keyPair: aws_ec2.KeyPair.fromKeyPairName(this, 'KeyPair', keypair)
    });

    const asg = new aws_autoscaling.AutoScalingGroup(this, 'pihole-asg', {
      launchTemplate: launchTemplate,
      vpc: networking.vpc,
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
      maxInstanceLifetime: cdk.Duration.days(7),
      updatePolicy: UpdatePolicy.rollingUpdate(),
      healthChecks: HealthChecks.ec2()
    });

    if (bPublic_http) {
      let sgAlbIngress = new aws_ec2.SecurityGroup(this, 'sg-albIngress', { description: 'Security Group for ALB Ingress', vpc: networking.vpc });
      sgAlbIngress.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let sgAlbTarget = new aws_ec2.SecurityGroup(this, 'sg-albTarget', { description: 'Security Group for ALB Target', vpc: networking.vpc });
      sgAlbTarget.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'Allow access to ALB to any IP');
      networking.securityGroup.addIngressRule(sgAlbTarget, aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'alb', {
        vpc: networking.vpc,
        internetFacing: true,
        securityGroup: sgAlbTarget
      });

      let albListener = alb.addListener('ALBHttp', { port: 80, open: false });
      albListener.addTargets('targetgroup', { port: 80, targets: [asg] });
      albListener.connections.addSecurityGroup(sgAlbIngress);

      new CfnOutput(this, 'admin-public-url', { value: `http://${alb.loadBalancerDnsName}/admin` });
    }

    const loadBalancer = new PiHoleLoadBalancer(this, 'PiHoleLoadBalancer', {
      vpc: networking.vpc,
      config: props.appConfig.piHoleConfig
    });

    // Add targets to the load balancer
    loadBalancer.dnsTargetGroup.addTarget(asg);
    loadBalancer.httpTargetGroup.addTarget(asg);

    new CfnOutput(this, 'dns1', {
      value: loadBalancer.getEndpointIps.getResponseField('NetworkInterfaces.0.PrivateIpAddress')
    });
    new CfnOutput(this, 'dns2', {
      value: loadBalancer.getEndpointIps.getResponseField('NetworkInterfaces.1.PrivateIpAddress')
    });

    new CfnOutput(this, "admin-url", { value: "http://pi.hole/admin" }); // Only after setting up DNS
    new CfnOutput(this, 'SecretArn', { value: storage.secret.secretArn })
    new CfnOutput(this, 'RFC1918PrefixListId', { value: networking.prefixList.attrPrefixListId, exportName: 'RFC1918PrefixListId' })
  }
}
