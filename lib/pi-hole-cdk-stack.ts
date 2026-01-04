import * as cdk from 'aws-cdk-lib';
import { aws_ec2, aws_iam, CfnOutput, aws_autoscaling, aws_elasticloadbalancingv2, aws_ecs, aws_logs, Size, aws_route53 } from 'aws-cdk-lib';
import { LaunchTemplate, CpuManufacturer } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import { HealthChecks, UpdatePolicy } from 'aws-cdk-lib/aws-autoscaling';
import { PiHoleNetworking, PiHoleStorage, PiHoleLoadBalancer, PiHoleIamPolicies, PiHoleHttps } from './constructs';


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
    const networking = new PiHoleNetworking(this, 'networking', {
      vpcName: vpc_name!
    });

    const storage = new PiHoleStorage(this, 'storage', {
      vpc: networking.vpc,
      securityGroup: networking.securityGroup,
      replicationRegions: props.appConfig.piHoleConfig.efsReplicationRegions,
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

    const loadBalancer = new PiHoleLoadBalancer(this, 'loadbalancer', {
      vpc: networking.vpc,
      config: props.appConfig.piHoleConfig
    });

    // Add targets to the load balancer
    loadBalancer.dnsTargetGroup.addTarget(asg);
    loadBalancer.httpTargetGroup.addTarget(asg);

    // ========== ECS DEPLOYMENT (shares NLB, EFS, secrets with EC2) ==========
    
    const cluster = new aws_ecs.Cluster(this, 'pihole-ecs-cluster', {
      clusterName: 'pihole-cluster',
      vpc: networking.vpc,
    });

    const taskExecutionRole = new aws_iam.Role(this, 'pihole-task-execution-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ]
    });

    const taskRole = new aws_iam.Role(this, 'pihole-task-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: PiHoleIamPolicies.getManagedPolicies(),
      inlinePolicies: {
        'secretPolicy': PiHoleIamPolicies.createSecretsPolicy(storage.secret.secretArn),
        'kmsPolicy': PiHoleIamPolicies.createKmsPolicy()
      }
    });

    const logGroup = new aws_logs.LogGroup(this, 'pihole-ecs-logs', {
      logGroupName: '/ecs/pihole',
      retention: props.appConfig.piHoleConfig.logRetentionDays as aws_logs.RetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const taskDefinition = new aws_ecs.Ec2TaskDefinition(this, 'pihole-task-def', {
      networkMode: aws_ecs.NetworkMode.AWS_VPC,
      taskRole: taskRole,
      executionRole: taskExecutionRole,
      volumes: [{
        name: 'pihole-config',
        efsVolumeConfiguration: {
          fileSystemId: storage.fileSystem.fileSystemId,
          transitEncryption: 'ENABLED',
          authorizationConfig: { iam: 'ENABLED' }
        }
      }]
    });

    // Local domain forwarding config - forwards .local and .localdomain to UniFi gateway
    const localDnsForwardTarget = props.appConfig.piHoleConfig.revServerTarget;
    const dnsmasqCustomConfig = [
      `server=/local/${localDnsForwardTarget}`,
      `server=/localdomain/${localDnsForwardTarget}`,
    ].join('\\n');

    const container = taskDefinition.addContainer('pihole', {
      image: aws_ecs.ContainerImage.fromRegistry('pihole/pihole:latest'),
      memoryReservationMiB: props.appConfig.piHoleConfig.containerMemory,
      cpu: props.appConfig.piHoleConfig.containerCpu,
      essential: true,
      environment: {
        TZ: 'UTC',
        REV_SERVER: 'true',
        REV_SERVER_CIDR: local_internal_cidr,
        REV_SERVER_TARGET: props.appConfig.piHoleConfig.revServerTarget,
        REV_SERVER_DOMAIN: props.appConfig.piHoleConfig.revServerDomain,
        DNS1: props.appConfig.piHoleConfig.dns1,
        DNS2: props.appConfig.piHoleConfig.dns2,
        DNSMASQ_LISTENING: 'all',
        // Enable custom dnsmasq.d configs and set local domain forwarding
        DNSMASQ_CUSTOM_CONFIG: dnsmasqCustomConfig,
      },
      secrets: { WEBPASSWORD: aws_ecs.Secret.fromSecretsManager(storage.secret) },
      logging: aws_ecs.LogDrivers.awsLogs({ streamPrefix: 'pihole', logGroup: logGroup }),
      healthCheck: {
        command: ['CMD-SHELL', 'dig @127.0.0.1 google.com +short || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(300)
      },
      // Create dnsmasq.d config, enable it, and set listeningMode to allow all queries (for NLB)
      command: [
        '/bin/bash', '-c',
        `mkdir -p /etc/dnsmasq.d && echo -e "${dnsmasqCustomConfig}" > /etc/dnsmasq.d/99-local-forward.conf && ` +
        `sed -i 's/etc_dnsmasq_d = false/etc_dnsmasq_d = true/' /etc/pihole/pihole.toml 2>/dev/null || true && ` +
        `sed -i 's/listeningMode = "LOCAL"/listeningMode = "all"/' /etc/pihole/pihole.toml 2>/dev/null || true && ` +
        `/s6-init`
      ]
    });

    container.addMountPoints({
      sourceVolume: 'pihole-config',
      containerPath: '/etc/pihole',
      readOnly: false
    });

    // awsvpc mode: expose DNS (UDP on 53) and HTTP
    container.addPortMappings(
      { containerPort: 53, protocol: aws_ecs.Protocol.UDP },
      { containerPort: 80, protocol: aws_ecs.Protocol.TCP }
    );

    // Role name must start with 'ecsInstanceRole' to match the PassRole permission
    // in AmazonECSInfrastructureRolePolicyForManagedInstances managed policy
    const ecsInstanceRole = new aws_iam.Role(this, 'pihole-ecs-instance-role', {
      roleName: `ecsInstanceRole-pihole-${cdk.Stack.of(this).region}`,
      assumedBy: new aws_iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'),
        ...PiHoleIamPolicies.getManagedPolicies()
      ]
    });

    const instanceProfile = new aws_iam.InstanceProfile(this, 'pihole-ecs-instance-profile', {
      role: ecsInstanceRole,
    });

    // Infrastructure role for ECS Managed Instances
    const infrastructureRole = new aws_iam.Role(this, 'pihole-ecs-infrastructure-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonECSInfrastructureRolePolicyForManagedInstances'),
      ],
    });

    const capacityProvider = new aws_ecs.ManagedInstancesCapacityProvider(this, 'pihole-capacity-provider', {
      infrastructureRole: infrastructureRole,
      capacityProviderName: 'pihole-managed-instances',
      ec2InstanceProfile: instanceProfile,
      subnets: networking.vpc.selectSubnets({ subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnets,
      securityGroups: [networking.securityGroup],
      taskVolumeStorage: Size.gibibytes(30),
      monitoring: aws_ecs.InstanceMonitoring.DETAILED,
      instanceRequirements: {
        vCpuCountMin: props.appConfig.piHoleConfig.vCpuMin,
        vCpuCountMax: props.appConfig.piHoleConfig.vCpuMax,
        memoryMin: Size.mebibytes(props.appConfig.piHoleConfig.memoryMinMiB),
        memoryMax: Size.mebibytes(props.appConfig.piHoleConfig.memoryMaxMiB),
        cpuManufacturers: bUseIntel ? [CpuManufacturer.INTEL, CpuManufacturer.AMD] : [CpuManufacturer.AWS]
      }
    });

    cluster.addManagedInstancesCapacityProvider(capacityProvider);
    (cluster as any)._hasEc2Capacity = true;

    const ecsService = new aws_ecs.Ec2Service(this, 'pihole-ecs-service', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      capacityProviderStrategies: [{ capacityProvider: capacityProvider.capacityProviderName, weight: 1, base: 1 }],
      enableExecuteCommand: true,
      placementConstraints: [aws_ecs.PlacementConstraint.distinctInstances()],
      serviceName: 'pihole-service',
      securityGroups: [networking.securityGroup],
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // awsvpc mode: register with IP-type target groups
    loadBalancer.ecsDnsTargetGroup.addTarget(ecsService.loadBalancerTarget({
      containerName: 'pihole',
      containerPort: 53,
      protocol: aws_ecs.Protocol.UDP
    }));
    loadBalancer.ecsHttpTargetGroup.addTarget(ecsService.loadBalancerTarget({
      containerName: 'pihole',
      containerPort: 80,
      protocol: aws_ecs.Protocol.TCP
    }));

    // HTTPS ALB with ACM certificate (if configured)
    if (props.appConfig.piHoleConfig.httpsEnabled && 
        props.appConfig.piHoleConfig.hostedZoneId && 
        props.appConfig.piHoleConfig.hostedZoneName &&
        props.appConfig.piHoleConfig.regionSubdomain) {
      
      const https = new PiHoleHttps(this, 'https', {
        vpc: networking.vpc,
        hostedZoneId: props.appConfig.piHoleConfig.hostedZoneId,
        hostedZoneName: props.appConfig.piHoleConfig.hostedZoneName,
        regionSubdomain: props.appConfig.piHoleConfig.regionSubdomain,
        targetGroup: loadBalancer.ecsHttpTargetGroup,
        localIpCidr: local_ip_cidr,
      });

      // Register ECS service with ALB target group
      https.albTargetGroup.addTarget(ecsService.loadBalancerTarget({
        containerName: 'pihole',
        containerPort: 80,
        protocol: aws_ecs.Protocol.TCP
      }));

      // Export ALB info for failover stack
      new CfnOutput(this, 'AlbDnsName', { value: https.alb.loadBalancerDnsName, exportName: `pihole-alb-dns-${props.appConfig.piHoleConfig.regionSubdomain}` });
      new CfnOutput(this, 'AlbHostedZoneId', { value: https.alb.loadBalancerCanonicalHostedZoneId, exportName: `pihole-alb-zone-${props.appConfig.piHoleConfig.regionSubdomain}` });
    }

    new CfnOutput(this, 'dns1', {
      value: loadBalancer.getEndpointIps.getResponseField('NetworkInterfaces.0.PrivateIpAddress')
    });
    new CfnOutput(this, 'dns2', {
      value: loadBalancer.getEndpointIps.getResponseField('NetworkInterfaces.1.PrivateIpAddress')
    });

    new CfnOutput(this, "admin-url", { value: "http://pi.hole/admin" }); // Only after setting up DNS
    new CfnOutput(this, 'SecretArn', { value: storage.secret.secretArn })
    new CfnOutput(this, 'RFC1918PrefixListId', { value: networking.prefixList.attrPrefixListId, exportName: 'RFC1918PrefixListId' })
    new CfnOutput(this, 'EfsFileSystemId', { value: storage.fileSystem.fileSystemId })
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName })
    new CfnOutput(this, 'EcsServiceName', { value: ecsService.serviceName || 'pihole-service' })
  }
}
