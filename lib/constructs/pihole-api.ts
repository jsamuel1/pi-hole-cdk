import { aws_apigateway, aws_cognito, aws_lambda, aws_ec2, aws_iam, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PiHoleApiProps {
  vpc: aws_ec2.IVpc;
  piholeUrl: string;  // Internal Pi-hole URL
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

    // Lambda proxy function in VPC
    const proxyFn = new aws_lambda.Function(this, 'ProxyFn', {
      runtime: aws_lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: aws_lambda.Code.fromInline(`
import json
import urllib.request
import urllib.error
import os

PIHOLE_URL = os.environ['PIHOLE_URL']

def handler(event, context):
    path = event.get('pathParameters', {}).get('proxy', '')
    method = event.get('httpMethod', 'GET')
    body = event.get('body')
    headers = {k: v for k, v in (event.get('headers') or {}).items() 
               if k.lower() not in ['host', 'authorization', 'x-forwarded-for']}
    
    url = f"{PIHOLE_URL}/api/{path}"
    if event.get('queryStringParameters'):
        qs = '&'.join(f"{k}={v}" for k, v in event['queryStringParameters'].items())
        url = f"{url}?{qs}"
    
    req = urllib.request.Request(url, method=method, headers=headers)
    if body:
        req.data = body.encode() if isinstance(body, str) else body
    
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return {
                'statusCode': resp.status,
                'headers': {'Content-Type': 'application/json'},
                'body': resp.read().decode()
            }
    except urllib.error.HTTPError as e:
        return {
            'statusCode': e.code,
            'headers': {'Content-Type': 'application/json'},
            'body': e.read().decode()
        }
`),
      vpc: props.vpc,
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: { PIHOLE_URL: props.piholeUrl },
      timeout: Duration.seconds(29),
    });

    this.api = new aws_apigateway.RestApi(this, 'Api', {
      restApiName: 'pihole-api',
      description: 'Pi-hole API Gateway with Cognito auth',
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    });

    const methodOptions: aws_apigateway.MethodOptions = {
      authorizer,
      authorizationType: aws_apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['pihole-api/read', 'pihole-api/write'],
      requestParameters: { 'method.request.path.proxy': true },
    };

    const lambdaIntegration = new aws_apigateway.LambdaIntegration(proxyFn);
    const apiResource = this.api.root.addResource('api');
    const proxyResource = apiResource.addProxy({ anyMethod: false });

    proxyResource.addMethod('GET', lambdaIntegration, methodOptions);
    proxyResource.addMethod('POST', lambdaIntegration, methodOptions);
    proxyResource.addMethod('PUT', lambdaIntegration, methodOptions);
    proxyResource.addMethod('DELETE', lambdaIntegration, methodOptions);

    this.apiEndpoint = this.api.url;

    new CfnOutput(this, 'Endpoint', { value: this.api.url });
  }
}
