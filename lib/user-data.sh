#!/bin/bash -x
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# upgrade yum repo list
dnf update -y
dnf upgrade -y
dnf install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
# al2022 efs-utils
#dnf install amazon-efs-utils -y
# not amazon linux -- need to build the rpm
dnf install git rpm-build make wget -y
git clone https://github.com/aws/efs-utils /tmp/efs-utils/
cd /tmp/efs-utils
make rpm
yum -y install build/amazon-efs-utils*rpm

mkdir /etc/pihole/
echo $EFS_ID:/ /etc/pihole/ efs _netdev,noresvport,tls,iam,nofail 0 0 >> /etc/fstab
mount -av

# Fedora - disable selinux - pihole doesn't come with an selinux policy
setenforce 0
sed -i -e "s/SELINUX=enforcing/SELINUX=permissive/" /etc/selinux/config

# pretend we are fedora on al2022 only
#echo "Fedora release 36 (Thirty Six)" > /etc/redhat-release

# set pihole dns server to cloudflare dns and initial adlists
if [ ! -a /etc/pihole/setupVars.conf ] ; then 
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
export PIHOLE_SKIP_OS_CHECK=true
wget -O /tmp/basic-install.sh https://install.pi-hole.net
# AL2022 has curl-minimal, not curl.  This breaks package installs if not changed.
#sed -i -e "s/\(PIHOLE_DEPS=.*\)curl/\1curl-minimal/" /tmp/basic-install.sh
bash /tmp/basic-install.sh --unattended
#sed -i -e "s/\(PIHOLE_DEPS=.*\)curl/\1curl-minimal/" "/etc/.pihole/automated install/basic-install.sh"

# install aws cli -- after pihole created /usr/local/bin
# unneeded on AL2022
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip -uq awscliv2.zip
sudo ./aws/install

# set the pihole web ui password
/usr/local/bin/pihole -a -p $(/usr/local/bin/aws secretsmanager get-secret-value --secret-id $SECRET_ARN | jq .SecretString -j)

