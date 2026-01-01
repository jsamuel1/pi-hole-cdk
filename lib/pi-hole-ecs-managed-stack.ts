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
 * 🏴‍☠️ Pi-hole ECS Managed Instances Stack, matey! ⚓
 * 
 * This stack be implementin' Pi-hole as an ECS containerized workload runnin' on
 * AWS ECS Managed Instances instead of the traditional EC2 Auto Scaling approach.
 * 
 * ARCHITECTURAL OVERVIEW:
 * ======================
 * 
 * AWS ECS Managed Instances Suitability fer Pi-hole:
 * --------------------------------------------------
 * ✅ SUITABLE - ECS Managed Instances provide:
 *    - Fully managed EC2 infrastructure (no ASG management needed)
 *    - Automatic instance provisioning and optimization
 *    - Support fer EFS mounts (critical fer Pi-hole persistent storage)
 *    - Native container orchestration with health checks
 *    - Network mode "host" support (required fer DNS on port 53)
 *    - Cost optimization through intelligent instance selection
 * 
 * KEY DIFFERENCES FROM EC2 ASG APPROACH:
 * -------------------------------------
 * 1. Container-based: Pi-hole runs in a Docker container instead of directly on EC2
 * 2. ECS Service management: Health checks, scaling, and deployment handled by ECS
 * 3. Task Definition: Container configuration defined declaratively
 * 4. Capacity Provider: AWS manages the underlying EC2 instances automatically
 * 5. No user-data scripts: Container entrypoint handles initialization
 * 
 * RESOURCE COMPATIBILITY:
 * ----------------------
 * ✅ EFS File System: Mounted as ECS volume to /etc/pihole in container
 * ✅ Secrets Manager: Passed as environment variable to container
 * ✅ VPC Configuration: Same VPC, subnets, and security groups
 * ✅ Network Load Balancer: Same NLB configuration fer DNS traffic
 * ✅ IAM Roles: Task Execution Role (ECR, logs) + Task Role (EFS, Secrets, SSM)
 * 
 * MIGRATION STRATEGY:
 * ------------------
 * This stack be designed as a separate file to enable gradual regional migration:
 * 1. Deploy this stack to a test/dev region first
 * 2. Validate Pi-hole functionality (DNS resolution, web UI, blocklists)
 * 3. Once validated, deploy to production regions one at a time
 * 4. Keep existing EC2 ASG stack runnin' in other regions during migration
 * 5. Eventually deprecate pi-hole-cdk-stack.ts once all regions migrated
 * 
 * NETWORKING CONSIDERATIONS:
 * -------------------------
 * - Uses "host" network mode to bind directly to instance ports (53, 80)
 * - This be required fer DNS to work properly on port 53/UDP and 53/TCP
 * - Security groups control access just like the EC2 ASG approach
 * - NLB continues to provide static IP addresses fer DNS clients
 * 
 * FUTURE ENHANCEMENTS:
 * -------------------
 * - Consider Fargate support (would require ALB/NLB TCP mode adjustments)
 * - Add CloudWatch Container Insights fer detailed monitoring
 * - Implement blue/green deployments fer zero-downtime updates
 * - Add Service Discovery fer multi-region DNS failover
 */
export class PiHoleEcsManagedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PiHoleProps) {
    super(scope, id, props);

    // Ahoy! Extract configuration from props
    const local_ip = props.appConfig.local_ip;
    const local_ip_cidr = props.appConfig.local_ip_cidr;
    const local_internal_cidr = props.appConfig.local_internal_cidr;
    const vpc_name = props.appConfig.vpc_name;
    const keypair = props.appConfig.keypair;
    const bPublic_http = props.appConfig.bPublic_http;
    const bUseIntel = props.appConfig.bUseIntel;

    // 🌐 Create shared networking resources
    const networking = new PiHoleNetworking(this, 'networking', {
      vpcName: vpc_name || 'default',
      resourceSuffix: '-ecs'
    });

    // 💾 Create shared storage resources
    const storage = new PiHoleStorage(this, 'storage', {
      vpc: networking.vpc,
      securityGroup: networking.securityGroup,
      resourceSuffix: '-ecs'
    });

    // 🎭 Create ECS Cluster
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

    // 📋 Create CloudWatch Log Group fer Pi-hole logs
    const logGroup = new aws_logs.LogGroup(this, 'pihole-logs', {
      logGroupName: '/ecs/pihole',
      retention: props.appConfig.piHoleConfig.logRetentionDays as aws_logs.RetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // 🐋 Create ECS Task Definition fer Pi-hole
    const taskDefinition = new aws_ecs.Ec2TaskDefinition(this, 'pihole-task-def', {
      networkMode: aws_ecs.NetworkMode.HOST, // Required fer DNS on port 53
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

    // Add port mappings for host network mode (required by CDK validation)
    container.addPortMappings({
      containerPort: 53,
      protocol: aws_ecs.Protocol.TCP
    });
    container.addPortMappings({
      containerPort: 53,
      protocol: aws_ecs.Protocol.UDP
    });
    container.addPortMappings({
      containerPort: 80,
      protocol: aws_ecs.Protocol.TCP
    });

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
      serviceName: 'pihole-service'
    });

    // 🌐 Create shared load balancer resources
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
        description: 'Public URL fer Pi-hole admin interface (Ahoy!)'
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
      description: 'Secrets Manager ARN fer Pi-hole password'
    });
    new CfnOutput(this, 'RFC1918PrefixListId-ecs', { 
      value: networking.prefixList.attrPrefixListId, 
      exportName: 'RFC1918PrefixListId-ECS',
      description: 'Prefix list ID fer RFC1918 private IP ranges'
    });
    new CfnOutput(this, 'ClusterName-ecs', {
      value: cluster.clusterName,
      description: 'ECS Cluster name fer Pi-hole'
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
