#!/bin/bash -x
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# upgrade yum repo list
apt upgrade -y

# set pihole dns server to cloudflare dns
mkdir /etc/pihole/
echo "PIHOLE_DNS_1=1.1.1.1" > /etc/pihole/setupVars.conf
echo "PIHOLE_DNS_1=1.0.0.1" > /etc/pihole/setupVars.conf
echo "DNSMASQ_LISTENING=all" > /etc/pihole/setupVars.conf

# install pihole unattended
export PIHOLE_SKIP_OS_CHECK=true
wget -O /tmp/basic-install.sh https://install.pi-hole.net
bash /tmp/basic-install.sh --unattended

# set the pihole web ui password
/usr/local/bin/pihole -a -p "$(aws secretsmanager get-secret-value --secret-id $SECRET_ARN)"

