import { aws_ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleNetworkingProps {
  vpcName: string;
  resourceSuffix?: string;
}

export class PiHoleNetworking extends Construct {
  public readonly vpc: aws_ec2.IVpc;
  public readonly securityGroup: aws_ec2.SecurityGroup;
  public readonly prefixList: aws_ec2.CfnPrefixList;

  constructor(scope: Construct, id: string, props: PiHoleNetworkingProps) {
    super(scope, id);

    const suffix = props.resourceSuffix || '';

    this.vpc = aws_ec2.Vpc.fromLookup(this, 'vpc', { 
      vpcName: props.vpcName, 
      isDefault: false 
    });

    this.prefixList = new aws_ec2.CfnPrefixList(this, `rfc1918prefix${suffix}`, {
      prefixListName: `RFC1918${suffix}`,
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

    this.securityGroup = new aws_ec2.SecurityGroup(this, `allow_dns_http${suffix}`, { 
      description: `AllowDNSandSSH${suffix}`, 
      vpc: this.vpc 
    });

    this.securityGroup.addIngressRule(aws_ec2.Peer.prefixList(this.prefixList.attrPrefixListId), aws_ec2.Port.tcp(22), 'Allow_SSH');
    this.securityGroup.addIngressRule(aws_ec2.Peer.prefixList(this.prefixList.attrPrefixListId), aws_ec2.Port.tcp(80), 'Allow_HTTP');
    this.securityGroup.addIngressRule(aws_ec2.Peer.prefixList(this.prefixList.attrPrefixListId), aws_ec2.Port.tcp(53), 'Allow_DNS_over_TCP');
    this.securityGroup.addIngressRule(aws_ec2.Peer.prefixList(this.prefixList.attrPrefixListId), aws_ec2.Port.udp(53), 'Allow_DNS_over_UDP');
    this.securityGroup.addIngressRule(aws_ec2.Peer.prefixList(this.prefixList.attrPrefixListId), aws_ec2.Port.icmpPing(), 'Allow ICMP Ping');
  }
}