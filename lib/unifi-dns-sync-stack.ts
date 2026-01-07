import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import { Construct } from 'constructs';

export interface UnifiDnsSyncStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  fileSystem: efs.IFileSystem;
  ecsClusterArn: string;
  ecsServiceName: string;
  unifiBaseUrl: string;
  unifiSiteId: string;
  piholeApiUrl: string;
  localDnsSuffix: string;
  piholeSecret: secretsmanager.ISecret;
}

export class UnifiDnsSyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UnifiDnsSyncStackProps) {
    super(scope, id, props);

    const secret = new secretsmanager.Secret(this, 'UnifiCredentials', {
      description: 'UniFi controller credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: '' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\'
      }
    });

    const accessPoint = new efs.AccessPoint(this, 'LambdaAccessPoint', {
      fileSystem: props.fileSystem,
      path: '/',
      posixUser: { gid: '0', uid: '0' }
    });

    const lambdaFunction = new lambda.Function(this, 'UnifiDnsSyncFunction', {
      code: lambda.Code.fromAsset('lib/lambda/unifi-dns-sync'),
      handler: 'index.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      filesystem: lambda.FileSystem.fromEfsAccessPoint(accessPoint, '/mnt/efs'),
      environment: {
        UNIFI_BASE_URL: props.unifiBaseUrl,
        UNIFI_SITE_ID: props.unifiSiteId,
        PIHOLE_API_URL: props.piholeApiUrl,
        UNIFI_SECRET_NAME: secret.secretName,
        PIHOLE_SECRET_NAME: props.piholeSecret.secretName,
        LOCAL_DNS_SUFFIX: props.localDnsSuffix
      }
    });

    secret.grantRead(lambdaFunction);
    props.piholeSecret.grantRead(lambdaFunction);
    props.fileSystem.grantRootAccess(lambdaFunction);

    new events.Rule(this, 'ScheduleRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(lambdaFunction)]
    });
  }
}
