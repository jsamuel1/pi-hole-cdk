#!/bin/bash -x
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# upgrade yum repo list
apt update
apt upgrade -y

# set pihole dns server to cloudflare dns
mkdir /etc/pihole/

# note - DNSMASQ_LISTENING=all -- only because we are limiting to our external IP address as a source - otherwise this is dangerous.
cat <<EOF > /etc/pihole/setupVars.conf
BLOCKING_ENABLED=true
DNSSEC=false
REV_SERVER=false
DNS_FQDN_REQUIRED=true
DNS_BOGUS_PRIV=true
PIHOLE_DNS_1=1.1.1.1
PIHOLE_DNS_2=1.0.0.1
PIHOLE_DNS_3=2606:4700:4700::1111
PIHOLE_DNS_4=2606:4700:4700::1001
DNSMASQ_LISTENING=all
QUERY_LOGGING=true
EOF

# workaround bug 
sudo rm -f /etc/resolv.conf
sudo ln -s /run/systemd/resolve/resolv.conf /etc/resolv.conf

# install pihole unattended
export PIHOLE_SKIP_OS_CHECK=true
wget -O /tmp/basic-install.sh https://install.pi-hole.net
bash /tmp/basic-install.sh --unattended

# install aws cli -- after pihole created /usr/local/bin
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# set the pihole web ui password
/usr/local/bin/pihole -a -p $(/usr/local/bin/aws secretsmanager get-secret-value --secret-id $SECRET_ARN | jq .SecretString -j)

