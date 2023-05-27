#!/bin/bash -x
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# upgrade yum repo list
apt update -y
apt upgrade -y
apt install -y dialog unzip idn2 dns-root-data jq lighttpd php-common php-cgi php-sqlite3 php-xml php-intl php-json git binutils make wget python3-pip
#chkconfig newt slang cronie nmap-ncat lighttpd-fastcgi

# not amazon linux, so need to build the package
git clone https://github.com/aws/efs-utils /tmp/efs-utils/
cd /tmp/efs-utils
./build-deb.sh
apt -y install ./build/amazon-efs-utils*deb
pip3 install botocore --upgrade

mkdir /etc/pihole/
echo $EFS_ID:/ /etc/pihole/ efs _netdev,noresvport,tls,iam,nofail 0 0 >> /etc/fstab
mount -av

# set pihole dns server to cloudflare dns and initial adlists
if [ ! -a /etc/pihole/setupVars.conf ] ; then 
    # note - DNSMASQ_LISTENING=all -- only because we are limiting to our external IP address as a source - otherwise this is dangerous.
    cat <<EOF > /etc/pihole/setupVars.conf
BLOCKING_ENABLED=true
DNSSEC=false
REV_SERVER=false
DNS_FQDN_REQUIRED=false
DNS_BOGUS_PRIV=false
PIHOLE_DNS_1=1.1.1.1
PIHOLE_DNS_2=1.0.0.1
PIHOLE_DNS_3=2606:4700:4700::1111
PIHOLE_DNS_4=2606:4700:4700::1001
DNSMASQ_LISTENING=all
QUERY_LOGGING=true
EOF

    cat <<EOF > /etc/pihole/adlists.list
https://raw.githubusercontent.com/Perflyst/PiHoleBlocklist/master/SmartTV.txt
https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
https://v.firebog.net/hosts/Admiral.txt
https://v.firebog.net/hosts/Easylist.txt
https://v.firebog.net/hosts/Easyprivacy.txt
https://v.firebog.net/hosts/Prigent-Ads.txt
EOF
fi

# install pihole unattended
#export PIHOLE_SKIP_OS_CHECK=true
wget -O /tmp/basic-install.sh https://install.pi-hole.net
bash /tmp/basic-install.sh --unattended

# install aws cli 
snap install aws-cli --channel=v2/candidate --classic

# set the pihole web ui password
/usr/local/bin/pihole -a -p $(aws secretsmanager get-secret-value --secret-id $SECRET_ARN | jq .SecretString -j)

