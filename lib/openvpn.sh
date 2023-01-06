#!/bin/bash

dnf install openvpn openssl ca-certificates tar firewalld -y

systemctl enable --now firewalld.service

# selected lines from https://github.com/Nyr/openvpn-install/blob/master/openvpn-install.sh
# setup server.conf
ip=$(ip -4 addr | grep inet | grep -vE '127(\.[0-9]{1,3}){3}' | grep -vE 'tun0' | cut -d '/' -f 1 | grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}')
public_ip=$PUBLIC_IP
protocol=udp
port="1194"
client="client"

## TODO --- Import existing PKI from efs if it exists

# Get easy-rsa
easy_rsa_url='https://github.com/OpenVPN/easy-rsa/releases/download/v3.1.1/EasyRSA-3.1.1.tgz'
mkdir -p /etc/openvpn/server/easy-rsa/
{ wget -qO- "$easy_rsa_url" 2>/dev/null || curl -sL "$easy_rsa_url" ; } | tar xz -C /etc/openvpn/server/easy-rsa/ --strip-components 1
chown -R root:root /etc/openvpn/server/easy-rsa/
cd /etc/openvpn/server/easy-rsa/
# Create the PKI, set up the CA and the server and client certificates
cd /etc/openvpn/server/easy-rsa/
./easyrsa --batch init-pki
./easyrsa --batch build-ca nopass
./easyrsa --batch --days=3650 build-server-full server nopass
./easyrsa --batch --days=3650 build-client-full "$client" nopass
./easyrsa --batch --days=3650 gen-crl

cp pki/ca.crt pki/private/ca.key pki/issued/server.crt pki/private/server.key pki/crl.pem /etc/openvpn/server
# CRL is read with each client connection, while OpenVPN is dropped to nobody
chown nobody:nobody /etc/openvpn/server/crl.pem
# Without +x in the directory, OpenVPN can't run a stat() on the CRL file
chmod o+x /etc/openvpn/server/
# Generate key for tls-crypt
openvpn --genkey secret /etc/openvpn/server/tc.key

# Create the DH parameters file using the predefined ffdhe2048 group
cat <<EOF > /etc/openvpn/server/dh.pem
-----BEGIN DH PARAMETERS-----
MIIBCAKCAQEA//////////+t+FRYortKmq/cViAnPTzx2LnFg84tNpWp4TZBFGQz
+8yTnc4kmz75fS/jY2MMddj2gbICrsRhetPfHtXV/WVhJDP1H18GbtCFY2VVPe0a
87VXE15/V8k1mE8McODmi3fipona8+/och3xWKE2rec1MKzKT0g6eXq8CrGCsyT7
YdEIqUuyyOP7uWrat2DX9GgdT0Kj3jlN9K5W7edjcrsZCwenyO4KbXCeAvzhzffi
7MA0BM0oNC9hkXL+nOmFg/+OTxIy7vKBg8P+OxtMb61zO7X8vC7CIAXFjvGDfRaD
ssbzSibBsu/6iGtCOGEoXJf//////////wIBAg==
-----END DH PARAMETERS-----
EOF

# Generate server.conf
cat <<EOF > /etc/openvpn/server/server.conf
local $ip
port $port
proto $protocol
dev tun
ca ca.crt
cert server.crt
key server.key
dh dh.pem
auth SHA512
tls-crypt tc.key
topology subnet
server 10.8.0.0 255.255.255.0
push "redirect-gateway def1 bypass-dhcp"
ifconfig-pool-persist ipp.txt
push "dhcp-option DNS $ip"
push "block-outside-dns"
keepalive 10 120
cipher AES-256-CBC
user nobody
group nobody
persist-key
persist-tun
verb 3
crl-verify crl.pem
explicit-exit-notify
EOF

# Enable net.ipv4.ip_forward for the system
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-openvpn-forward.conf
# Enable without waiting for a reboot or service restart
echo 1 > /proc/sys/net/ipv4/ip_forward

# Using both permanent and not permanent rules to avoid a firewalld
# reload.
# We don't use --add-service=openvpn because that would only work with
# the default port and protocol.
firewall-cmd --add-port="$port"/"$protocol"
firewall-cmd --zone=trusted --add-source=10.8.0.0/24
firewall-cmd --permanent --add-port="$port"/"$protocol"
firewall-cmd --permanent --zone=trusted --add-source=10.8.0.0/24
# Set NAT for the VPN subnet
firewall-cmd --direct --add-rule ipv4 nat POSTROUTING 0 -s 10.8.0.0/24 ! -d 10.8.0.0/24 -j SNAT --to "$ip"
firewall-cmd --permanent --direct --add-rule ipv4 nat POSTROUTING 0 -s 10.8.0.0/24 ! -d 10.8.0.0/24 -j SNAT --to "$ip"

# client-commont.txt
cat <<EOF > /etc/openvpn/server/client-common.txt
client
dev tun
proto udp
remote $public_ip $port
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
auth SHA512
cipher AES-256-CBC
tls-client
tls-version-min 1.2
ignore-unknown-option 
block-outside-dns
verb 3
EOF

systemctl enable --now openvpn-server@server.service

if [ ! -a /etc/pihole/"$client".ovpn ] ; then
# Generates the custom client.ovpn
	{
	cat /etc/openvpn/server/client-common.txt
	echo "<ca>"
	cat /etc/openvpn/server/easy-rsa/pki/ca.crt
	echo "</ca>"
	echo "<cert>"
	sed -ne '/BEGIN CERTIFICATE/,$ p' /etc/openvpn/server/easy-rsa/pki/issued/"$client".crt
	echo "</cert>"
	echo "<key>"
	cat /etc/openvpn/server/easy-rsa/pki/private/"$client".key
	echo "</key>"
	echo "<tls-crypt>"
	sed -ne '/BEGIN OpenVPN Static key/,$ p' /etc/openvpn/server/tc.key
	echo "</tls-crypt>"
	} > /etc/pihole/"$client".ovpn
fi
