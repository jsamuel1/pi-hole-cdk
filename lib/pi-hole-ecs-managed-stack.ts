import * as cdk from 'aws-cdk-lib';
import { 
  aws_ec2, 
  aws_iam, 
  aws_secretsmanager, 
  aws_efs, 
  CfnOutput, 
  aws_ecs,
  aws_elasticloadbalancingv2,
  aws_logs
} from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PiHoleProps } from '../bin/pi-hole-cdk';

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

    // Look up the existing VPC, just like the original stack
    let vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { vpcName: vpc_name, isDefault: false });

    // 🗝️ Create Secrets Manager secret fer Pi-hole password
    var pwd = new aws_secretsmanager.Secret(this, 'piholepwd-ecs', {
      secretName: 'pihole-pwd-ecs',
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false
      }
    });

    // 💾 Create EFS file system fer persistent Pi-hole configuration
    let file_system = new aws_efs.FileSystem(this, "pihole-fs-ecs", {
      vpc: vpc,
      encrypted: true,
      fileSystemName: "pihole-fs-ecs"
    });

    // 🛡️ Security Group fer Pi-hole containers (same rules as EC2 approach)
    let sgEc2 = new aws_ec2.SecurityGroup(this, 'allow_dns_http_ecs', { 
      description: 'AllowDNSandSSHforECSPihole', 
      vpc: vpc 
    });

    // Create RFC1918 prefix list fer private IP ranges
    let prefix_list = new aws_ec2.CfnPrefixList(this, "rfc1918prefix-ecs", {
      prefixListName: "RFC1918-ECS",
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

    // Add ingress rules fer DNS and HTTP
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(22), 'Allow_SSH')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(80), 'Allow_HTTP')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP')
    sgEc2.addIngressRule(aws_ec2.Peer.prefixList(prefix_list.attrPrefixListId), aws_ec2.Port.icmpPing(), 'Allow ICMP Ping')

    // Allow EFS access from containers
    file_system.connections.allowDefaultPortFrom(sgEc2);

    // 🎭 Create ECS Cluster
    const cluster = new aws_ecs.Cluster(this, 'pihole-ecs-cluster', {
      clusterName: 'pihole-cluster',
      vpc: vpc,
      enableFargateCapacityProviders: false, // We be usin' Managed Instances, not Fargate
    });

    // 🏗️ Create IAM role fer ECS infrastructure management (required by Managed Instances)
    const infrastructureRole = new aws_iam.Role(this, 'pihole-infrastructure-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonECSInfrastructureRolePolicyForManagedInstances')
      ],
      roleName: 'pihole-ecs-infrastructure-role'
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
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ],
      inlinePolicies: {
        'secretPolicy': new PolicyDocument({
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
              actions: ["secretsmanager:ListSecrets"],
              effect: Effect.ALLOW,
              resources: ["*"]
            })
          ]
        }),
        'kmsPolicy': new PolicyDocument({
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
        })
      }
    });

    // 📋 Create CloudWatch Log Group fer Pi-hole logs
    const logGroup = new aws_logs.LogGroup(this, 'pihole-logs', {
      logGroupName: '/ecs/pihole',
      retention: aws_logs.RetentionDays.ONE_WEEK,
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
            fileSystemId: file_system.fileSystemId,
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
      memoryReservationMiB: 512,
      cpu: 256,
      essential: true,
      environment: {
        TZ: 'UTC',
        REV_SERVER: 'true',
        REV_SERVER_CIDR: local_internal_cidr,
        REV_SERVER_TARGET: '192.168.1.1',
        REV_SERVER_DOMAIN: 'localdomain',
        DNS1: '1.1.1.1',
        DNS2: '1.0.0.1',
        DNSMASQ_LISTENING: 'all',
      },
      secrets: {
        // Pass the Pi-hole password from Secrets Manager
        WEBPASSWORD: aws_ecs.Secret.fromSecretsManager(pwd)
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

    // Port mappings required by CDK validation (host mode uses same port on host)
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
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientReadWriteAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ]
    });

    const instanceProfile = new aws_iam.CfnInstanceProfile(this, 'pihole-instance-profile', {
      roles: [instanceRole.roleName],
      instanceProfileName: 'pihole-ecs-instance-profile'
    });

    // Determine instance requirements based on architecture preference
    var instanceRequirements: any = {
      vCpuCount: {
        min: 2,
        max: 4
      },
      memoryMiB: {
        min: 2048,
        max: 4096
      }
    };

    if (bUseIntel) {
      instanceRequirements.cpuManufacturers = ['intel', 'amd'];
    } else {
      instanceRequirements.cpuManufacturers = ['amazon-web-services']; // Graviton
    }

    // ⚓ Create ECS Capacity Provider with Managed Instances
    // This be the magic that replaces the EC2 Auto Scaling Group!
    const capacityProvider = new aws_ecs.CfnCapacityProvider(this, 'pihole-capacity-provider', {
      name: 'pihole-managed-instances',
      managedInstancesProvider: {
        // Infrastructure role ARN fer ECS to manage instances
        infrastructureRoleArn: infrastructureRole.roleArn,
        // Launch template configuration fer Managed Instances
        instanceLaunchTemplate: {
          // Instance profile with permissions fer ECS agent and tasks
          ec2InstanceProfileArn: instanceProfile.attrArn,
          // Network configuration
          networkConfiguration: {
            securityGroups: [sgEc2.securityGroupId],
            subnets: vpc.selectSubnets({ 
              subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS 
            }).subnetIds
          },
          // Instance requirements fer flexible instance type selection
          instanceRequirements: instanceRequirements,
          // Storage configuration
          storageConfiguration: {
            storageSizeGiB: 30
          },
          // Enable detailed monitoring fer better observability
          monitoring: 'ENABLED'
        },
        // Enable infrastructure optimization - AWS will manage instance lifecycle
        // Scale in after 5 minutes of idle time (300 seconds)
        infrastructureOptimization: {
          scaleInAfter: 300
        }
      }
    });

    // Associate capacity provider with the cluster
    const cfnCluster = cluster.node.defaultChild as aws_ecs.CfnCluster;
    cfnCluster.capacityProviders = [capacityProvider.ref];
    cfnCluster.defaultCapacityProviderStrategy = [
      {
        capacityProvider: capacityProvider.ref,
        weight: 1,
        base: 1 // Always keep at least 1 instance runnin'
      }
    ];

    // 🚢 Create ECS Service to run Pi-hole tasks
    // Note: We use CfnService to bypass CDK validation that doesn't recognize
    // Managed Instances capacity providers (a newer ECS feature)
    const cfnService = new aws_ecs.CfnService(this, 'pihole-service', {
      cluster: cluster.clusterArn,
      taskDefinition: taskDefinition.taskDefinitionArn,
      desiredCount: 1,
      deploymentConfiguration: {
        minimumHealthyPercent: 0,
        maximumPercent: 100
      },
      capacityProviderStrategy: [
        {
          capacityProvider: capacityProvider.ref,
          weight: 1,
          base: 1
        }
      ],
      enableExecuteCommand: true,
      placementConstraints: [
        { type: 'distinctInstance' }
      ],
      serviceName: 'pihole-service'
    });

    // Add dependency to ensure capacity provider exists before service
    cfnService.addDependency(capacityProvider);

    // 🌐 Create Network Load Balancer fer DNS traffic (same as original stack)
    let nlb = new aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'nlb-ecs', {
      vpc: vpc,
      internetFacing: false,
      crossZoneEnabled: true,
      loadBalancerName: 'pihole-ecs'
    });

    // Add listener fer DNS on port 53 (both TCP and UDP)
    let nlbListener = nlb.addListener('NLBDNS-ecs', { 
      port: 53, 
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP 
    });

    // Note: ECS Service can be added as a target, but with host networking
    // we need to manually register the underlying instances. For simplicity,
    // we'll create a target group and let ECS handle the registration.
    const targetGroup = new aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'pihole-tg-ecs', {
      vpc: vpc,
      port: 53,
      protocol: aws_elasticloadbalancingv2.Protocol.TCP_UDP,
      targetType: aws_elasticloadbalancingv2.TargetType.INSTANCE,
      deregistrationDelay: cdk.Duration.minutes(2),
      healthCheck: {
        enabled: true,
        protocol: aws_elasticloadbalancingv2.Protocol.TCP,
        port: '53'
      }
    });

    nlbListener.addTargetGroups('pihole-targets-ecs', targetGroup);

    // Note: With CfnService and Managed Instances, target group registration
    // is handled via the service's loadBalancers property
    cfnService.loadBalancers = [
      {
        containerName: 'pihole',
        containerPort: 53,
        targetGroupArn: targetGroup.targetGroupArn
      }
    ];

    targetGroup.setAttribute("deregistration_delay.connection_termination.enabled", "true");

    // 🔍 Get NLB private IP addresses fer client configuration
    const getEndpointIps = new AwsCustomResource(this, 'GetEndpointIps-ecs', {
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          Filters: [{ Name: "description", Values: [`ELB ${nlb.loadBalancerFullName}`] }],
        },
        physicalResourceId: PhysicalResourceId.of('GetEndpointIps-ecs'),
        outputPaths: ['NetworkInterfaces.0.PrivateIpAddress', 'NetworkInterfaces.1.PrivateIpAddress', 'NetworkInterfaces.2.PrivateIpAddress']
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: false
    });

    getEndpointIps.node.addDependency(nlb);

    // 🌍 Optional: Create Application Load Balancer fer public HTTP access
    if (bPublic_http) {
      let sgAlbIngress = new aws_ec2.SecurityGroup(this, 'sg-albIngress-ecs', { 
        description: 'Security Group for ALB Ingress ECS', 
        vpc: vpc 
      });
      sgAlbIngress.addIngressRule(aws_ec2.Peer.ipv4(local_ip_cidr), aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let sgAlbTarget = new aws_ec2.SecurityGroup(this, 'sg-albTarget-ecs', { 
        description: 'Security Group for ALB Target ECS', 
        vpc: vpc 
      });
      sgAlbTarget.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'Allow access to ALB to any IP');
      sgEc2.addIngressRule(sgAlbTarget, aws_ec2.Port.tcp(80), 'Allow access to ALB to local IP');

      let alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'alb-ecs', {
        vpc: vpc,
        internetFacing: true,
        securityGroup: sgAlbTarget
      });

      // Create target group fer HTTP traffic
      const albTargetGroup = new aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'pihole-alb-tg', {
        vpc: vpc,
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

      // Add ALB target group to service load balancers
      cfnService.loadBalancers = [
        ...(cfnService.loadBalancers as any[] || []),
        {
          containerName: 'pihole',
          containerPort: 80,
          targetGroupArn: albTargetGroup.targetGroupArn
        }
      ];

      new CfnOutput(this, 'admin-public-url-ecs', { 
        value: `http://${alb.loadBalancerDnsName}/admin`,
        description: 'Public URL fer Pi-hole admin interface (Ahoy!)'
      });
    }

    // 📤 Stack Outputs
    new CfnOutput(this, 'dns1-ecs', {
      value: getEndpointIps.getResponseField('NetworkInterfaces.0.PrivateIpAddress'),
      description: 'Primary DNS server IP address'
    });
    new CfnOutput(this, 'dns2-ecs', {
      value: getEndpointIps.getResponseField('NetworkInterfaces.1.PrivateIpAddress'),
      description: 'Secondary DNS server IP address'
    });
    new CfnOutput(this, "admin-url-ecs", { 
      value: "http://pi.hole/admin",
      description: 'Admin URL (configure DNS to point to NLB IPs first)'
    });
    new CfnOutput(this, 'SecretArn-ecs', { 
      value: pwd.secretArn,
      description: 'Secrets Manager ARN fer Pi-hole password'
    });
    new CfnOutput(this, 'RFC1918PrefixListId-ecs', { 
      value: prefix_list.attrPrefixListId, 
      exportName: 'RFC1918PrefixListId-ECS',
      description: 'Prefix list ID fer RFC1918 private IP ranges'
    });
    new CfnOutput(this, 'ClusterName-ecs', {
      value: cluster.clusterName,
      description: 'ECS Cluster name fer Pi-hole'
    });
    new CfnOutput(this, 'ServiceName-ecs', {
      value: cfnService.attrName,
      description: 'ECS Service name fer Pi-hole'
    });
    new CfnOutput(this, 'EfsFileSystemId-ecs', {
      value: file_system.fileSystemId,
      description: 'EFS File System ID fer Pi-hole persistent storage'
    });
  }
}
