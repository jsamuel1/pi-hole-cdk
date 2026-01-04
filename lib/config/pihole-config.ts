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
}

export const DEFAULT_PIHOLE_CONFIG: PiHoleConfig = {
  // DNS Configuration
  revServerTarget: '192.168.1.1',
  revServerDomain: 'localdomain',
  dns1: '1.1.1.1',
  dns2: '1.0.0.1',
  
  // Container/Instance Resources
  containerMemory: 1536,
  containerCpu: 256,
  
  // Load Balancer Configuration
  deregistrationDelayMinutes: 2,
  
  // Logging Configuration
  logRetentionDays: 7,
  
  // ECS Managed Instance Requirements
  vCpuMin: 2,
  vCpuMax: 4,
  memoryMinMiB: 2048,
  memoryMaxMiB: 4096,
};