#!/bin/bash -x
# Pi-hole v6 installation script
# This script installs Pi-hole v6 which includes an embedded web server
# No longer requires lighttpd or PHP as Pi-hole v6 has these built-in
# 
# log user data output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

# Function to log with timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to retry commands with exponential backoff
retry_command() {
    local max_attempts=5
    local delay=1
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_message "Attempt $attempt of $max_attempts: $*"
        if "$@"; then
            log_message "Command succeeded: $*"
            return 0
        else
            log_message "Command failed: $*"
            if [ $attempt -lt $max_attempts ]; then
                log_message "Waiting ${delay}s before retry..."
                sleep $delay
                delay=$((delay * 2))
            fi
            attempt=$((attempt + 1))
        fi
    done
    
    log_message "Command failed after $max_attempts attempts: $*"
    return 1
}

log_message "Starting Pi-hole v6 installation userdata script"

# upgrade packages
log_message "Updating package lists and upgrading system"
retry_command apt update -y
retry_command apt upgrade -y

# Install essential packages (removed lighttpd, php-* packages, but kept Lua)
log_message "Installing required packages"
retry_command apt install -y dialog unzip idn2 dns-root-data jq git binutils make wget python3-pip curl

# Install Lua packages (still needed for web interface extensions and processing)
log_message "Installing Lua packages for web interface processing"
retry_command apt install -y lua5.1 liblua5.1-0-dev lua-cjson

# not amazon linux, so need to build the package
log_message "Building and installing EFS utils"
retry_command git clone https://github.com/aws/efs-utils /tmp/efs-utils/
cd /tmp/efs-utils
retry_command ./build-deb.sh
retry_command apt -y install ./build/amazon-efs-utils*deb
retry_command pip3 install botocore --upgrade

# Create pihole directory and setup EFS mount with proper error handling
log_message "Setting up EFS mount for Pi-hole configuration"
mkdir -p /etc/pihole/
echo "$EFS_ID:/ /etc/pihole/ efs _netdev,noresvport,tls,iam,nofail 0 0" >>/etc/fstab

# Retry EFS mount with better error handling
log_message "Mounting EFS filesystem"
if ! retry_command mount -av; then
    log_message "EFS mount failed, but continuing with local storage"
    # Ensure directory exists even if EFS mount fails
    mkdir -p /etc/pihole/
fi

# Verify EFS mount status
if mountpoint -q /etc/pihole; then
    log_message "EFS successfully mounted to /etc/pihole"
else
    log_message "WARNING: EFS not mounted, using local storage"
fi

# Configure Pi-hole v6 settings using environment variables (preferred method)
log_message "Setting Pi-hole v6 configuration via environment variables"

# Create environment file for Pi-hole FTL configuration
cat > /etc/environment << EOF
# Pi-hole v6 Configuration via Environment Variables
FTLCONF_dns_upstreams=1.1.1.1,1.0.0.1,2606:4700:4700::1111,2606:4700:4700::1001
FTLCONF_dns_listeningMode=all
FTLCONF_dns_dnssec=false
FTLCONF_dns_bogusPriv=false
FTLCONF_dns_fqdnRequired=false
FTLCONF_dns_queryLogging=true
FTLCONF_dns_revServer_enabled=true
FTLCONF_dns_revServer_cidr=$REV_SERVER_CIDR
FTLCONF_dns_revServer_target=$REV_SERVER_TARGET
FTLCONF_dns_revServer_domain=localdomain
FTLCONF_webserver_port_http=80
FTLCONF_webserver_port_https=443
EOF

# Source the environment variables
source /etc/environment

# Setup initial blocklists for v6
log_message "Setting up initial Pi-hole blocklists"
if [ ! -a /etc/pihole/adlists.list ]; then
	cat <<EOF >/etc/pihole/adlists.list
https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
https://v.firebog.net/hosts/Admiral.txt
https://v.firebog.net/hosts/Easylist.txt
https://v.firebog.net/hosts/Easyprivacy.txt
https://v.firebog.net/hosts/Prigent-Ads.txt
https://raw.githubusercontent.com/Perflyst/PiHoleBlocklist/master/SmartTV.txt
EOF
fi

# Stop any existing lighttpd service (in case it's running from previous installations)
log_message "Stopping any existing lighttpd service"
systemctl stop lighttpd 2>/dev/null || true
systemctl disable lighttpd 2>/dev/null || true

# Install Pi-hole v6 unattended
log_message "Installing Pi-hole v6"
retry_command wget -O /tmp/basic-install.sh https://install.pi-hole.net
retry_command bash /tmp/basic-install.sh --unattended

# Install AWS CLI
log_message "Installing AWS CLI"
retry_command snap install aws-cli --channel=v2/candidate --classic

# Wait for AWS CLI to be available
log_message "Waiting for AWS CLI to be available"
sleep 10

# Set the Pi-hole web UI password
log_message "Setting Pi-hole web UI password from Secrets Manager"
if retry_command aws secretsmanager get-secret-value --secret-id $SECRET_ARN; then
    PASSWORD=$(aws secretsmanager get-secret-value --secret-id $SECRET_ARN | jq .SecretString -j)
    /usr/local/bin/pihole -a -p "$PASSWORD"
    log_message "Pi-hole password set successfully"
else
    log_message "WARNING: Failed to retrieve password from Secrets Manager"
fi

# Apply whitelist
log_message "Applying common whitelists"
if retry_command git clone https://github.com/anudeepND/whitelist.git /tmp/whitelist/; then
    python3 /tmp/whitelist/scripts/whitelist.py
    log_message "Whitelist applied successfully"
else
    log_message "WARNING: Failed to apply whitelist"
fi

# Configure Pi-hole v6 settings using the command line interface
log_message "Configuring Pi-hole v6 settings via command line"

# Set DNS upstream servers
/usr/local/bin/pihole-FTL --config dns.upstreams "1.1.1.1,1.0.0.1,2606:4700:4700::1111,2606:4700:4700::1001" || true

# Set listening mode to all interfaces (restricted by security groups)
/usr/local/bin/pihole-FTL --config dns.listeningMode all || true

# Configure reverse DNS settings
/usr/local/bin/pihole-FTL --config dns.revServer.enabled true || true
/usr/local/bin/pihole-FTL --config dns.revServer.cidr "$REV_SERVER_CIDR" || true
/usr/local/bin/pihole-FTL --config dns.revServer.target "$REV_SERVER_TARGET" || true
/usr/local/bin/pihole-FTL --config dns.revServer.domain "localdomain" || true

# Enable query logging
/usr/local/bin/pihole-FTL --config dns.queryLogging true || true

# Configure web server ports (Pi-hole v6 embedded server)
/usr/local/bin/pihole-FTL --config webserver.port.http 80 || true
/usr/local/bin/pihole-FTL --config webserver.port.https 443 || true

# Start and enable Pi-hole FTL service
log_message "Starting Pi-hole FTL service"
systemctl restart pihole-FTL
systemctl enable pihole-FTL

# Wait for service to start
sleep 10

# Verify Pi-hole FTL service is running
log_message "Verifying Pi-hole FTL service status"
if systemctl is-active --quiet pihole-FTL; then
    log_message "Pi-hole FTL is running successfully"
else
    log_message "WARNING: Pi-hole FTL failed to start"
    systemctl status pihole-FTL
fi

# Verify web interface is accessible on port 80
log_message "Verifying Pi-hole v6 web interface accessibility"
sleep 5
if curl -s -f http://localhost/admin/ >/dev/null 2>&1; then
    log_message "Pi-hole v6 web interface is accessible on port 80"
elif curl -s -f http://localhost:8080/admin/ >/dev/null 2>&1; then
    log_message "Pi-hole v6 web interface is accessible on port 8080 (fallback)"
else
    log_message "WARNING: Pi-hole v6 web interface is not accessible"
fi

# Test DNS functionality
log_message "Testing DNS functionality"
if dig @127.0.0.1 google.com +short >/dev/null 2>&1; then
    log_message "DNS functionality test passed"
else
    log_message "WARNING: DNS functionality test failed"
fi

# Display Pi-hole v6 configuration summary
log_message "Pi-hole v6 configuration summary:"
/usr/local/bin/pihole-FTL --config --list 2>/dev/null || log_message "Could not retrieve configuration list"

# Check which ports Pi-hole is listening on
log_message "Checking Pi-hole listening ports:"
netstat -tlnp | grep pihole-FTL || log_message "Could not determine listening ports"

log_message "Pi-hole v6 installation userdata script completed successfully"
