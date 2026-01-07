import { aws_cognito, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleCognitoProps {
  domainPrefix: string;
  callbackUrls: string[];
}

export class PiHoleCognito extends Construct {
  public readonly userPool: aws_cognito.UserPool;
  public readonly userPoolClient: aws_cognito.UserPoolClient;
  public readonly userPoolDomain: aws_cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: PiHoleCognitoProps) {
    super(scope, id);

    this.userPool = new aws_cognito.UserPool(this, 'UserPool', {
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

    // Enable passkeys (requires Essentials tier - set via feature plan)
    const cfnUserPool = this.userPool.node.defaultChild as aws_cognito.CfnUserPool;
    cfnUserPool.userPoolTier = 'ESSENTIALS';
    
    // Configure WebAuthn (passkeys)
    cfnUserPool.webAuthnRelyingPartyId = 'home.sauhsoj.wtf';
    cfnUserPool.webAuthnUserVerification = 'preferred';

    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });

    this.userPoolClient = this.userPool.addClient('AlbClient', {
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [aws_cognito.OAuthScope.OPENID, aws_cognito.OAuthScope.EMAIL, aws_cognito.OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
      },
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      supportedIdentityProviders: [aws_cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: this.userPoolDomain.baseUrl() });
  }
}
