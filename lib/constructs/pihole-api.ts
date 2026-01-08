import { aws_apigateway, aws_cognito, aws_ec2, aws_elasticloadbalancingv2, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleApiProps {
  vpc: aws_ec2.IVpc;
  nlb: aws_elasticloadbalancingv2.INetworkLoadBalancer;
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

    // VPC Link for private NLB access
    const vpcLink = new aws_apigateway.VpcLink(this, 'VpcLink', {
      targets: [props.nlb],
    });

    this.api = new aws_apigateway.RestApi(this, 'Api', {
      restApiName: 'pihole-api',
      description: 'Pi-hole API Gateway with Cognito auth',
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    });

    const integration = new aws_apigateway.Integration({
      type: aws_apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      uri: `http://${props.nlb.loadBalancerDnsName}/api/{proxy}`,
      options: {
        connectionType: aws_apigateway.ConnectionType.VPC_LINK,
        vpcLink,
        requestParameters: {
          'integration.request.path.proxy': 'method.request.path.proxy',
        },
      },
    });

    const methodOptions: aws_apigateway.MethodOptions = {
      authorizer,
      authorizationType: aws_apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['pihole-api/read', 'pihole-api/write'],
      requestParameters: {
        'method.request.path.proxy': true,
      },
    };

    // Proxy all /api/* requests to Pi-hole
    const apiResource = this.api.root.addResource('api');
    const proxyResource = apiResource.addProxy({ anyMethod: false });

    proxyResource.addMethod('GET', integration, methodOptions);
    proxyResource.addMethod('POST', integration, methodOptions);
    proxyResource.addMethod('PUT', integration, methodOptions);
    proxyResource.addMethod('DELETE', integration, methodOptions);

    this.apiEndpoint = this.api.url;

    new CfnOutput(this, 'Endpoint', {
      value: this.api.url,
      description: 'Pi-hole API Gateway endpoint',
    });
  }
}
