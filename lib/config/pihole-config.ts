export interface PiHoleConfig {
  // DNS Configuration
  revServerTarget: string;
  revServerDomain: string;
  dns1: string;
  dns2: string;
  
  // Container/Instance Resources
  containerMemory: number;
  containerCpu: number;
  
  // Load Balancer Configuration
  deregistrationDelayMinutes: number;
  
  // Logging Configuration
  logRetentionDays: number;
  
  // ECS Managed Instance Requirements
  vCpuMin: number;
  vCpuMax: number;
  memoryMinMiB: number;
  memoryMaxMiB: number;

  // HTTPS Configuration (optional)
  httpsEnabled?: boolean;
  hostedZoneId?: string;
  hostedZoneName?: string;
  regionSubdomain?: string;
  cognitoDomainPrefix?: string;
  certificateArn?: string;  // Use existing certificate instead of creating new

  // External Cognito Configuration (cross-account)
  externalCognitoUserPoolArn?: string;
  externalCognitoClientId?: string;
  externalCognitoClientSecret?: string;
  externalCognitoDomain?: string;

  // Local DNS Configuration
  localDnsSuffix?: string;

  // EFS Replication (optional - only for primary region)
  efsReplicationRegion?: string;
  existingReplicationDestFsId?: string;

  // UniFi DNS Sync Configuration (optional)
  unifiBaseUrl?: string;
  unifiSiteId?: string;
  piholeApiUrl?: string;

  // Home Assistant Configuration (optional)
  homeAssistantIp?: string;
  homeAssistantPort?: number;

  // API access without Cognito auth (for agents/automation)
  apiAllowedCidrs?: string[];

  // API Gateway Cognito client (M2M auth for programmatic access)
  apiCognitoClientId?: string;
}

export const DEFAULT_PIHOLE_CONFIG: PiHoleConfig = {
  // DNS Configuration
  revServerTarget: '192.168.1.1',
  revServerDomain: 'localdomain',
  dns1: '1.1.1.1',
  dns2: '1.0.0.1',
  
  // Container/Instance Resources
  containerMemory: 1536,
  containerCpu: 2048,
  
  // Load Balancer Configuration
  deregistrationDelayMinutes: 2,
  
  // Logging Configuration
  logRetentionDays: 7,
  
  // ECS Managed Instance Requirements
  vCpuMin: 2,
  vCpuMax: 4,
  memoryMinMiB: 2048,
  memoryMaxMiB: 4096,

  // UniFi DNS Sync defaults
  unifiSiteId: 'default',

  // Home Assistant defaults
  homeAssistantPort: 8123,
};