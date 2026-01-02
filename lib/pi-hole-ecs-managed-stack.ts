import * as cdk from 'aws-cdk-lib';
import { 
  aws_ec2, 
  aws_iam, 
  CfnOutput, 
  aws_ecs,
  aws_elasticloadbalancingv2,
  aws_logs,
  Size
} from 'aws-cdk-lib';
import { CpuManufacturer } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { PiHoleProps } from '../bin/pi-hole-cdk';
import { PiHoleNetworking, PiHoleStorage, PiHoleLoadBalancer, PiHoleIamPolicies } from './constructs';

/**
 * Pi-hole ECS Managed Instances Stack
 * 
 * Deploys Pi-hole as a containerized ECS workload on managed EC2 instances.
 * Uses awsvpc network mode for task-level networking with dedicated ENI.
 */
export class PiHoleEcsManagedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleProps) {
    super(scope, id, props);

    // Extract configuration from props
    const local_ip = props.appConfig.local_ip;
    const local_ip_cidr = props.appConfig.local_ip_cidr;
    const local_internal_cidr = props.appConfig.local_internal_cidr;
    const vpc_name = props.appConfig.vpc_name;
    const bPublic_http = props.appConfig.bPublic_http;
    const bUseIntel = props.appConfig.bUseIntel;

    // Create shared networking resources
    const networking = new PiHoleNetworking(this, 'networking', {
      vpcName: vpc_name || 'default',
      resourceSuffix: '-ecs'
    });

    // Create shared storage resources
    const storage = new PiHoleStorage(this, 'storage', {
      vpc: networking.vpc,
      securityGroup: networking.securityGroup,
      resourceSuffix: '-ecs'
    });

    // Create ECS Cluster
    const cluster = new aws_ecs.Cluster(this, 'pihole-ecs-cluster', {
      clusterName: 'pihole-cluster',
      vpc: networking.vpc,
      enableFargateCapacityProviders: false, // We be usin' Managed Instances, not Fargate
    });

    // 🏗️ Create IAM role fer ECS Task Execution (pulls images, writes logs)
    const taskExecutionRole = new aws_iam.Role(this, 'pihole-task-execution-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ]
    });

    // 🎯 Create IAM role fer ECS Task (container's runtime permissions)
    const taskRole = new aws_iam.Role(this, 'pihole-task-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: PiHoleIamPolicies.getManagedPolicies(),
      inlinePolicies: {
        'secretPolicy': PiHoleIamPolicies.createSecretsPolicy(storage.secret.secretArn),
        'kmsPolicy': PiHoleIamPolicies.createKmsPolicy()
      }
    });

    // Create CloudWatch Log Group for Pi-hole logs
    const logGroup = new aws_logs.LogGroup(this, 'pihole-logs', {
      logGroupName: '/ecs/pihole',
      retention: props.appConfig.piHoleConfig.logRetentionDays as aws_logs.RetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create ECS Task Definition for Pi-hole
    const taskDefinition = new aws_ecs.Ec2TaskDefinition(this, 'pihole-task-def', {
      networkMode: aws_ecs.NetworkMode.AWS_VPC,
      taskRole: taskRole,
      executionRole: taskExecutionRole,
      volumes: [
        {
          name: 'pihole-config',
          efsVolumeConfiguration: {
            fileSystemId: storage.fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              iam: 'ENABLED'
            }
          }
        }
      ]
    });

    // 📦 Add Pi-hole container to task definition
    const container = taskDefinition.addContainer('pihole', {
      image: aws_ecs.ContainerImage.fromRegistry('pihole/pihole:latest'), // Official Pi-hole Docker image
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
      },
      secrets: {
        // Pass the Pi-hole password from Secrets Manager
        WEBPASSWORD: aws_ecs.Secret.fromSecretsManager(storage.secret)
      },
      logging: aws_ecs.LogDrivers.awsLogs({
        streamPrefix: 'pihole',
        logGroup: logGroup
      }),
      // Health check to ensure Pi-hole DNS be workin'
      healthCheck: {
        command: ['CMD-SHELL', 'dig @127.0.0.1 google.com +short || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60)
      }
    });

    // Mount EFS volume to /etc/pihole and /etc/dnsmasq.d
    container.addMountPoints({
      sourceVolume: 'pihole-config',
      containerPath: '/etc/pihole',
      readOnly: false
    });

    // Port mappings for awsvpc mode
    container.addPortMappings(
      { containerPort: 53, protocol: aws_ecs.Protocol.TCP },
      { containerPort: 53, protocol: aws_ecs.Protocol.UDP },
      { containerPort: 80, protocol: aws_ecs.Protocol.TCP }
    );

    // 📝 Create IAM instance profile fer ECS container instances
    const instanceRole = new aws_iam.Role(this, 'pihole-instance-role', {
      assumedBy: new aws_iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'),
        ...PiHoleIamPolicies.getManagedPolicies()
      ]
    });

    const instanceProfile = new aws_iam.InstanceProfile(this, 'pihole-instance-profile', {
      role: instanceRole,
      instanceProfileName: 'pihole-ecs-instance-profile'
    });

    // ⚓ Create ECS Capacity Provider with Managed Instances (L2 construct)
    const capacityProvider = new aws_ecs.ManagedInstancesCapacityProvider(this, 'pihole-capacity-provider', {
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

    // Add capacity provider to cluster
    cluster.addManagedInstancesCapacityProvider(capacityProvider);
    // Workaround: CDK bug - addManagedInstancesCapacityProvider doesn't set hasEc2Capacity
    (cluster as any)._hasEc2Capacity = true;

    // 🚢 Create ECS Service to run Pi-hole tasks
    const service = new aws_ecs.Ec2Service(this, 'pihole-service', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
          base: 1
        }
      ],
      enableExecuteCommand: true,
      placementConstraints: [aws_ecs.PlacementConstraint.distinctInstances()],
      serviceName: 'pihole-service',
      // awsvpc network configuration
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [networking.securityGroup]
    });

    // Create shared load balancer resources
    const loadBalancer = new PiHoleLoadBalancer(this, 'loadbalancer', {
      vpc: networking.vpc,
      config: props.appConfig.piHoleConfig,
      resourceSuffix: '-ecs'
    });

    // Attach service to target groups
    service.attachToNetworkTargetGroup(loadBalancer.dnsTargetGroup);



    // 🌍 Optional: Create Application Load Balancer fer public HTTP access
    if (bPublic_http) {
      let sgAlbIngress = new aws_ec2.SecurityGroup(this, 'sg-albIngress-ecs', { 
        description: 'Security Group for ALB Ingress ECS', 
        vpc: networking.vpc 
      });
      sgAlbIngress.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let sgAlbTarget = new aws_ec2.SecurityGroup(this, 'sg-albTarget-ecs', { 
        description: 'Security Group for ALB Target ECS', 
        vpc: networking.vpc 
      });
      sgAlbTarget.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'Allow access to ALB to any IP');
      networking.securityGroup.addIngressRule(sgAlbTarget, aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'alb-ecs', {
        vpc: networking.vpc,
        internetFacing: true,
        securityGroup: sgAlbTarget
      });

      // Create target group fer HTTP traffic
      const albTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'pihole-alb-tg', {
        vpc: networking.vpc,
        port: 80,
        protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
        targetType: aws_elasticloadbalancingv2.TargetType.INSTANCE,
        healthCheck: {
          path: '/admin',
          protocol: aws_elasticloadbalancingv2.Protocol.HTTP,
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          interval: cdk.Duration.seconds(30)
        }
      });

      let albListener = alb.addListener('ALBHttp-ecs', { port: 80, open: false });
      albListener.addTargetGroups('targetgroup-ecs', { targetGroups: [albTargetGroup] });
      albListener.connections.addSecurityGroup(sgAlbIngress);

      // Attach service to ALB target group
      service.attachToApplicationTargetGroup(albTargetGroup);

      new CfnOutput(this, 'admin-public-url-ecs', { 
        value: `http://${alb.loadBalancerDnsName}/admin`,
        description: 'Public URL for Pi-hole admin interface'
      });
    }

    // 📤 Stack Outputs
    new CfnOutput(this, 'dns1-ecs', {
      value: loadBalancer.getEndpointIps.getResponseField('NetworkInterfaces.0.PrivateIpAddress'),
      description: 'Primary DNS server IP address'
    });
    new CfnOutput(this, 'dns2-ecs', {
      value: loadBalancer.getEndpointIps.getResponseField('NetworkInterfaces.1.PrivateIpAddress'),
      description: 'Secondary DNS server IP address'
    });
    new CfnOutput(this, "admin-url-ecs", { 
      value: "http://pi.hole/admin",
      description: 'Admin URL (configure DNS to point to NLB IPs first)'
    });
    new CfnOutput(this, 'SecretArn-ecs', { 
      value: storage.secret.secretArn,
      description: 'Secrets Manager ARN for Pi-hole password'
    });
    new CfnOutput(this, 'RFC1918PrefixListId-ecs', { 
      value: networking.prefixList.attrPrefixListId, 
      exportName: 'RFC1918PrefixListId-ECS',
      description: 'Prefix list ID fer RFC1918 private IP ranges'
    });
    new CfnOutput(this, 'ClusterName-ecs', {
      value: cluster.clusterName,
      description: 'ECS Cluster name for Pi-hole'
    });
    new CfnOutput(this, 'ServiceName-ecs', {
      value: service.serviceName || 'pihole-service',
      description: 'ECS Service name fer Pi-hole'
    });
    new CfnOutput(this, 'EfsFileSystemId-ecs', {
      value: storage.fileSystem.fileSystemId,
      description: 'EFS File System ID fer Pi-hole persistent storage'
    });
  }
}
