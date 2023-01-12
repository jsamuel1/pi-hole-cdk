# Welcome to CDK PiHole Deployment

Prerequisites:
* An existing VPC with internet access
* A named SSH keypair
* Your local routers external & internal IP addresses 

Do deploy, run:
cdk deploy -c local_ip=\<local_ip\> -c vpc_name=\<vpcNAME\> -c keypair=\<keypairname\> --local_internal_cidr=<internalcide/range>--all

eg.
cdk deploy -c local_ip=121.121.4.100 -c vpc_name=aws-controltower-VPC -c keypair=pihole -c local_internal_cidr=192.168.0.0/16 --all

This will deploy both a Site To Site VPN and the pihole.
You should then set up your local router to talk to the Site to Site VPN before configuring the routers DNS to use the IP addresses provided (which export DNS endpoints to the local network only)

Add the optional context parameter: `public_http=True` if you want to create an internet facing Application Load Balancer for the web interface, locked down to your external local ip address.  You may want to enable this during the setup phase, until you have your VPN going, or if you have automations that you want to run against the PiHole from the internet (in which case, you will need to change the security group of this load balancer to accept connections from elsewhere)

Optionally, you may wish to set up a conditional forwarder back to your local DHCP servers DNS, if you are not moving DHCP onto the pihole.
Do this from the PiHole web UI, or add in the following variables into the PiHole setupVars.conf and reload the config:
REV_SERVER=true
REV_SERVER_CIDR=
REV_SERVER_TARGET=
REV_SERVER_DOMAIN=

For Unifi devices, the Unifi dnsmasq is not configured to listen to the tunnel interface.  See the notes in the unifi-vpndns folder for instructions to fix this, before setting up the conditional forwarding.
