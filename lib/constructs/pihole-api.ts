import { aws_apigateway, aws_cognito, aws_iam, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleApiProps {
  piholeUrl: string;  // Internal Pi-hole URL (NLB or direct)
  cognitoUserPoolArn: string;
  cognitoClientId: string;
}

export class PiHoleApi extends Construct {
  public readonly api: aws_apigateway.RestApi;
  public readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: PiHoleApiProps) {
    super(scope, id);

    const userPool = aws_cognito.UserPool.fromUserPoolArn(this, 'UserPool', props.cognitoUserPoolArn);

    const authorizer = new aws_apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });

    this.api = new aws_apigateway.RestApi(this, 'Api', {
      restApiName: 'pihole-api',
      description: 'Pi-hole API Gateway with Cognito auth',
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    });

    // Proxy all /api/* requests to Pi-hole
    const apiResource = this.api.root.addResource('api');
    const proxyResource = apiResource.addProxy({
      anyMethod: false,
      defaultIntegration: new aws_apigateway.HttpIntegration(`${props.piholeUrl}/api/{proxy}`, {
        httpMethod: 'ANY',
        options: {
          requestParameters: {
            'integration.request.path.proxy': 'method.request.path.proxy',
          },
        },
      }),
    });

    // Add methods with Cognito auth
    const methodOptions: aws_apigateway.MethodOptions = {
      authorizer,
      authorizationType: aws_apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['pihole-api/read', 'pihole-api/write'],
      requestParameters: {
        'method.request.path.proxy': true,
      },
    };

    proxyResource.addMethod('GET', undefined, methodOptions);
    proxyResource.addMethod('POST', undefined, methodOptions);
    proxyResource.addMethod('PUT', undefined, methodOptions);
    proxyResource.addMethod('DELETE', undefined, methodOptions);

    this.apiEndpoint = this.api.url;

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'Pi-hole API Gateway endpoint',
      exportName: 'pihole-api-endpoint',
    });
  }
}
