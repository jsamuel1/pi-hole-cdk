#!/bin/bash -x
# Pi-hole installation with MCP (Model Context Protocol) integration
# This script installs Pi-hole and replaces the web interface with an MCP-enabled version
# 
# Key fixes included:
# - Lua packages installation (lua5.1, liblua5.1-0-dev, lua-cjson) for .lp file processing
# - MCP endpoint verification and troubleshooting
# - Service restart coordination to prevent conflicts
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

log_message "Starting Pi-hole installation userdata script"

# upgrade packages
log_message "Updating package lists and upgrading system"
retry_command apt update -y
retry_command apt upgrade -y

log_message "Installing required packages"
retry_command apt install -y dialog unzip idn2 dns-root-data jq lighttpd php-common php-cgi php-sqlite3 php-xml php-intl php-json git binutils make wget python3-pip

# Install Lua packages required for Pi-hole web interface processing
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

# Configure Pi-hole FTL settings
log_message "Configuring Pi-hole FTL settings"
if [ ! -a /etc/pihole/pihole-FTL.conf ]; then
	echo >/etc/pihole/pihole-FTL.conf
fi
sed -i '/^REPLY_WHEN_BUSY=/{h;s/=.*/=ALLOW/};${x;/^$/{s//REPLY_WHEN_BUSY=ALLOW/;H};x}' /etc/pihole/pihole-FTL.conf

# set pihole dns server to cloudflare dns and initial adlists
log_message "Configuring Pi-hole DNS settings"
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

# Setup initial blocklists
log_message "Setting up initial Pi-hole blocklists"
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

# Stop lighttpd before Pi-hole installation to prevent port conflicts
log_message "Stopping lighttpd to prevent port conflicts during Pi-hole installation"
systemctl stop lighttpd 2>/dev/null || true

# install pihole unattended
log_message "Installing Pi-hole"
retry_command wget -O /tmp/basic-install.sh https://install.pi-hole.net
retry_command bash /tmp/basic-install.sh --unattended

# install aws cli
log_message "Installing AWS CLI"
retry_command snap install aws-cli --channel=v2/candidate --classic

# Wait for AWS CLI to be available
log_message "Waiting for AWS CLI to be available"
sleep 10

# set the pihole web ui password
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

# Post-installation: Replace Pi-hole web interface with MCP-enabled fork
log_message "Installing MCP-enabled Pi-hole web interface..."

# Stop both services to prevent conflicts
log_message "Stopping services to prevent conflicts"
systemctl stop pihole-FTL || true
systemctl stop lighttpd || true

# Wait a moment for services to stop
sleep 5

# Backup original web interface if it exists
if [ -d /var/www/html/admin ]; then
    log_message "Backing up original web interface"
    mv /var/www/html/admin /var/www/html/admin.backup.$(date +%Y%m%d_%H%M%S)
fi

# Ensure the admin directory exists
log_message "Creating admin directory"
mkdir -p /var/www/html/admin

# Clone the MCP-enabled fork with retry logic
log_message "Cloning MCP-enabled Pi-hole web interface"
if retry_command git clone -b feature/mcp-integration https://github.com/jsamuel1/web.git /tmp/pi-hole-web-mcp; then
    # Copy the web interface files
    log_message "Copying web interface files"
    if cp -r /tmp/pi-hole-web-mcp/* /var/www/html/admin/ 2>/dev/null; then
        log_message "Web interface files copied successfully"
    else
        log_message "WARNING: Failed to copy web interface files, restoring from backup"
        # Restore from backup if copy failed
        if [ -d /var/www/html/admin.backup.* ]; then
            BACKUP_DIR=$(ls -td /var/www/html/admin.backup.* | head -1)
            cp -r "$BACKUP_DIR"/* /var/www/html/admin/
        fi
    fi
    
    # Set proper ownership and permissions
    log_message "Setting proper ownership and permissions"
    chown -R www-data:www-data /var/www/html/admin
    chmod -R 755 /var/www/html/admin
    
    # Ensure Lua files have correct permissions
    find /var/www/html/admin -name "*.lp" -exec chmod 644 {} \; 2>/dev/null || true
    
    # Clean up temporary files
    rm -rf /tmp/pi-hole-web-mcp
    
    log_message "MCP-enabled web interface installation completed"
else
    log_message "WARNING: Failed to clone MCP-enabled fork, using original interface"
    # Restore from backup if clone failed
    if [ -d /var/www/html/admin.backup.* ]; then
        BACKUP_DIR=$(ls -td /var/www/html/admin.backup.* | head -1)
        cp -r "$BACKUP_DIR"/* /var/www/html/admin/
        chown -R www-data:www-data /var/www/html/admin
        chmod -R 755 /var/www/html/admin
    fi
fi

# Start services in the correct order to prevent port conflicts
log_message "Starting lighttpd service"
systemctl start lighttpd
systemctl enable lighttpd

# Wait a moment before starting Pi-hole FTL
sleep 5

log_message "Starting Pi-hole FTL service"
systemctl start pihole-FTL
systemctl enable pihole-FTL

# Verify services are running
log_message "Verifying service status"
if systemctl is-active --quiet lighttpd; then
    log_message "Lighttpd is running successfully"
else
    log_message "WARNING: Lighttpd failed to start"
fi

if systemctl is-active --quiet pihole-FTL; then
    log_message "Pi-hole FTL is running successfully"
else
    log_message "WARNING: Pi-hole FTL failed to start"
fi

# Verify MCP endpoint is working
log_message "Verifying MCP endpoint functionality"
sleep 10  # Give services time to fully start
if curl -s -f http://localhost/admin/mcp.lp >/dev/null 2>&1; then
    # Test if it returns Lua code (broken) or processes correctly
    MCP_RESPONSE=$(curl -s http://localhost/admin/mcp.lp | head -1)
    if [[ "$MCP_RESPONSE" == *"<?--"* ]]; then
        log_message "WARNING: MCP endpoint returning raw Lua code - Lua processing may not be working"
        log_message "Attempting to restart lighttpd to fix Lua processing"
        systemctl restart lighttpd
        sleep 5
    else
        log_message "MCP endpoint is responding correctly"
    fi
else
    log_message "WARNING: MCP endpoint is not accessible"
fi

# Final verification
log_message "Performing final verification"
if [ -d /var/www/html/admin ] && [ "$(ls -A /var/www/html/admin)" ]; then
    log_message "Web interface directory exists and is not empty"
else
    log_message "ERROR: Web interface directory is missing or empty"
fi

# Test DNS functionality
if dig @127.0.0.1 google.com +short >/dev/null 2>&1; then
    log_message "DNS functionality test passed"
else
    log_message "WARNING: DNS functionality test failed"
fi

log_message "Pi-hole installation userdata script completed"
