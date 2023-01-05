#!/bin/bash -x
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# upgrade yum repo list
dnf update
dnf upgrade -y
dnf install amazon-efs-utils -y

mkdir /etc/pihole/
echo $EFS_ID:/ /etc/pihole/ efs _netdev,noresvport,tls,iam,nofail 0 0 >> /etc/fstab
mount -av

# Add Fedora repos to AL2022
# Until dialog and lighttpd are available.
# Source from https://github.com/amazonlinux/amazon-linux-2022/issues/232
# references
# - all files https://src.fedoraproject.org/rpms/fedora-repos/tree/f35
# - script https://src.fedoraproject.org/rpms/fedora-repos/blob/rawhide/f/fedora-repos.spec
stable_enabled=1
releasever=36
expire_value='7d'

curl --silent --location "https://src.fedoraproject.org/rpms/fedora-repos/raw/f$releasever/f/fedora-modular.repo" --output "/etc/yum.repos.d/fedora-modular.repo"
curl --silent --location "https://src.fedoraproject.org/rpms/fedora-repos/raw/f$releasever/f/fedora.repo" --output "/etc/yum.repos.d/fedora.repo"
curl --silent --location "https://src.fedoraproject.org/rpms/fedora-repos/raw/f$releasever/f/fedora-updates-modular.repo" --output "/etc/yum.repos.d/fedora-updates-modular.repo"
curl --silent --location "https://src.fedoraproject.org/rpms/fedora-repos/raw/f$releasever/f/fedora-updates.repo" --output "/etc/yum.repos.d/fedora-updates.repo"

for repo in /etc/yum.repos.d/fedora{,-modular,-updates,-updates-modular}.repo; do
    sed -i -e "s/\$releasever/${releasever}/" -e "/^enabled=/ s/AUTO_VALUE/${stable_enabled}/" -e "/^metadata_expire=/ s/AUTO_VALUE/${expire_value}/" $repo || exit 1
done

curl --silent --location "https://src.fedoraproject.org/rpms/fedora-repos/raw/f$releasever/f/RPM-GPG-KEY-fedora-$releasever-primary" --output "/etc/pki/rpm-gpg/RPM-GPG-KEY-fedora-$releasever-primary"

keyfile="/etc/pki/rpm-gpg/RPM-GPG-KEY-fedora-$releasever-primary"
for arch in x86_64 aarch64; do
    # replace last part with $arch (fedora-20-primary -> fedora-20-$arch)
    ln -s $keyfile ${keyfile%-*}-$arch
done

dnf update

# pretend we are fedora
echo "Fedora release 36 (Thirty Six)" > /etc/redhat-release

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
sed -i -e "s/\(PIHOLE_DEPS=.*\)curl/\1curl-minimal/" /tmp/basic-install.sh
bash /tmp/basic-install.sh --unattended
sed -i -e "s/\(PIHOLE_DEPS=.*\)curl/\1curl-minimal/" "/etc/.pihole/automated install/basic-install.sh"

# install aws cli -- after pihole created /usr/local/bin
# unneeded on AL2022
#cd /tmp
#curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
#unzip awscliv2.zip
#sudo ./aws/install

# set the pihole web ui password
/usr/local/bin/pihole -a -p $(aws secretsmanager get-secret-value --secret-id $SECRET_ARN | jq .SecretString -j)



