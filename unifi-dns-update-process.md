# UniFi DNS Update Process - Pi-hole Migration

## Current Configuration (Discovered)

**Site:** Default (ID: 88f7af54-98f8-306a-a1c7-c9349722b1f6)

**Network:** Default (ID: 5553bfdecfd6bebdf90a3d24)
- Subnet: 192.168.1.1/23
- DHCP Range: 192.168.0.11 - 192.168.1.254
- Current DNS Servers:
  - Primary: 10.0.170.120 (old Pi-hole - to be replaced)
  - Secondary: 172.31.44.67

## Melbourne Pi-hole NLB Endpoints
- 10.0.144.62 (recommended primary)
- 10.0.128.113 (backup option)
- 10.0.162.217 (backup option)

## Update Process

### Step 1: Update Default Network DNS
Replace the primary DNS server (10.0.170.120) with Melbourne Pi-hole NLB IP (10.0.144.62):

```bash
# Using UniFi API or Controller UI:
# Network: Default
# Primary DNS: 10.0.144.62
# Secondary DNS: 172.31.44.67 (keep existing)
```

### Step 2: Verify Configuration
After update, confirm:
- DHCP clients receive new DNS server
- DNS resolution works through Melbourne Pi-hole
- Ad blocking functionality active

### Step 3: Monitor
- Check Pi-hole logs for query activity
- Verify network performance
- Monitor for any DNS resolution issues

## Process for Sydney Deployment

When Sydney Pi-hole is deployed:

1. **Identify Sydney NLB IPs** (similar to Melbourne deployment)
2. **Update UniFi DNS Configuration:**
   - Primary DNS: [Sydney Pi-hole NLB IP]
   - Secondary DNS: 10.0.144.62 (Melbourne as backup)
3. **Test and Verify** DNS resolution and ad blocking
4. **Document** the Sydney-specific IPs and configuration

## Network Details for Reference
- Network ID: 5553bfdecfd6bebdf90a3d24
- Site ID: 88f7af54-98f8-306a-a1c7-c9349722b1f6
- VLAN: 0 (Default)
- Purpose: Corporate
- DHCP Enabled: Yes
- DNS Enabled: Yes

## Notes
- Keep secondary DNS as backup (either existing or Melbourne IP when switching to Sydney)
- Test DNS resolution after changes
- Consider gradual rollout if multiple networks exist
- Document any custom DNS settings per network