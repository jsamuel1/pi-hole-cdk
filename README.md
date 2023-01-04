# Welcome to CDK PiHole Deployment

Prerequisites:
* An existing VPC with internet access
* A named SSH keypair
* Your local routers external IP address 

Do deploy, run:
cdk deploy -c local_ip_cidr=<local_ip/32> -c vpc_name=<vpcNAME> -c keypair=<keypairname>

eg.
cdk deploy -c local_ip_cidr=121.121.4.100/32 -c vpc_name=aws-controltower-VPC -c keypair=pihole

## Other Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
