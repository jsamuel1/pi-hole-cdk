#!/bin/bash -x
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

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
echo "$EFS_ID:/ /etc/pihole/ efs _netdev,noresvport,tls,iam,nofail 0 0" >>/etc/fstab
mount -av

if [ ! -a /etc/pihole/pihole-FTL.conf ]; then
	echo >/etc/pihole/pihole-FTL.conf
fi
sed -i '/^REPLY_WHEN_BUSY=/{h;s/=.*/=ALLOW/};${x;/^$/{s//REPLY_WHEN_BUSY=ALLOW/;H};x}' /etc/pihole/pihole-FTL.conf

# set pihole dns server to cloudflare dns and initial adlists
if [ ! -a /etc/pihole/setupVars.conf ]; then
	echo >/etc/pihole/setupVars.conf #create with a blank line, so that sed will work
fi

declare -A kv

kv[BLOCKING_ENABLED]=true
kv[DNSSEC]=false
kv[DNS_FQDN_REQUIRED]=false
kv[DNS_BOGUS_PRIV]=false
kv[PIHOLE_DNS_1]=1.1.1.1
kv[PIHOLE_DNS_2]=1.0.0.1
kv[PIHOLE_DNS_3]=2606:4700:4700::1111
kv[PIHOLE_DNS_4]=2606:4700:4700::1001
# note - DNSMASQ_LISTENING=all -- only because we are limiting to our external IP address as a source - otherwise this is dangerous.
kv[DNSMASQ_LISTENING]=all
kv[QUERY_LOGGING]=true
kv[REV_SERVER]=true
kv[REV_SERVER_CIDR]=$(printf '%s\n' "$REV_SERVER_CIDR" | sed -e 's/[\/&]/\\&/g')
kv[REV_SERVER_TARGET]=$REV_SERVER_TARGET
kv[REV_SERVER_DOMAIN]=localdomain

VARFILE=/etc/pihole/setupVars.conf

for key in "${!kv[@]}"; do
	sed -i "/^${key}=/{h;s/=.*/=${kv[$key]}/};\${x;/^$/{s//${key}=${kv[$key]}/;H};x}" ${VARFILE}
done

if [ ! -a /etc/pihole/adlists.txt ]; then
	cat <<EOF >/etc/pihole/adlists.list
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

git clone https://github.com/anudeepND/whitelist.git /tmp/whitelist/
python3 /tmp/whitelist/scripts/whitelist.py

# Post-installation: Replace Pi-hole web interface with MCP-enabled fork
echo "Installing MCP-enabled Pi-hole web interface..."

# Stop lighttpd service
systemctl stop lighttpd

# Backup original web interface
if [ -d /var/www/html/admin ]; then
    mv /var/www/html/admin /var/www/html/admin.backup.$(date +%Y%m%d_%H%M%S)
fi

# Clone the MCP-enabled fork
git clone -b feature/mcp-integration https://github.com/jsamuel1/web.git /tmp/pi-hole-web-mcp

# Copy the web interface files
cp -r /tmp/pi-hole-web-mcp/* /var/www/html/admin/

# Set proper ownership and permissions
chown -R www-data:www-data /var/www/html/admin
chmod -R 755 /var/www/html/admin

# Ensure Lua files are executable
find /var/www/html/admin -name "*.lp" -exec chmod 644 {} \;

# Restart lighttpd service
systemctl start lighttpd
systemctl enable lighttpd

# Clean up temporary files
rm -rf /tmp/pi-hole-web-mcp

echo "MCP-enabled Pi-hole web interface installation completed"
