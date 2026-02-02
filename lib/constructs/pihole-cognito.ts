import { aws_cognito, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleCognitoProps {
  callbackUrls: string[];
  // Local pool config
  domainPrefix?: string;
  // External pool config (cross-account)
  externalUserPoolArn?: string;
  externalClientId?: string;
  externalClientSecret?: string;
  externalDomain?: string;
}

export class PiHoleCognito extends Construct {
  public readonly userPool: aws_cognito.IUserPool;
  public readonly userPoolClient: aws_cognito.IUserPoolClient;
  public readonly userPoolDomain: aws_cognito.IUserPoolDomain;

  constructor(scope: Construct, id: string, props: PiHoleCognitoProps) {
    super(scope, id);

    if (props.externalUserPoolArn && props.externalClientId && props.externalClientSecret && props.externalDomain) {
      // Use external Cognito pool
      this.userPool = aws_cognito.UserPool.fromUserPoolArn(this, 'UserPool', props.externalUserPoolArn);
      this.userPoolDomain = aws_cognito.UserPoolDomain.fromDomainName(this, 'Domain', props.externalDomain);
      this.userPoolClient = aws_cognito.UserPoolClient.fromUserPoolClientId(this, 'Client', props.externalClientId);
      
      // Store secret for ALB to use (ALB needs the secret value)
      // The secret is passed via context and used directly by ALB action
    } else if (props.domainPrefix) {
      // Create local pool
      const userPool = new aws_cognito.UserPool(this, 'UserPool', {
        userPoolName: 'pihole-auth',
        selfSignUpEnabled: false,
        signInAliases: { email: true },
        autoVerify: { email: true },
        passwordPolicy: {
          minLength: 8,
          requireLowercase: false,
          requireUppercase: false,
          requireDigits: false,
          requireSymbols: false,
        },
        accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
        removalPolicy: RemovalPolicy.RETAIN,
        signInCaseSensitive: false,
      });
      this.userPool = userPool;

      const cfnUserPool = userPool.node.defaultChild as aws_cognito.CfnUserPool;
      cfnUserPool.userPoolTier = 'ESSENTIALS';

      this.userPoolDomain = userPool.addDomain('Domain', {
        cognitoDomain: { domainPrefix: props.domainPrefix },
      });

      this.userPoolClient = userPool.addClient('AlbClient', {
        generateSecret: true,
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [aws_cognito.OAuthScope.OPENID, aws_cognito.OAuthScope.EMAIL, aws_cognito.OAuthScope.PROFILE],
          callbackUrls: props.callbackUrls,
        },
        supportedIdentityProviders: [aws_cognito.UserPoolClientIdentityProvider.COGNITO],
      });

      new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
      new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    } else {
      throw new Error('Either domainPrefix or external pool config required');
    }
  }
}
