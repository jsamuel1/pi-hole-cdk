# Home Assistant Trusted Networks Configuration

When accessing Home Assistant through the ALB with Cognito authentication, HA needs to trust the ALB's IP addresses to allow auto-login after Cognito auth.

## Configuration

Add to your Home Assistant `configuration.yaml`:

```yaml
homeassistant:
  auth_providers:
    - type: trusted_networks
      trusted_networks:
        - 10.0.0.0/16  # VPC CIDR - ALB forwards from here
      allow_bypass_login: true
    - type: homeassistant  # Fallback for direct access
```

## How It Works

1. User accesses `ha.home.sauhsoj.wtf`
2. ALB redirects to Cognito for authentication
3. After Cognito auth, ALB forwards request to HA on port 8123
4. HA sees request from ALB IP (within VPC CIDR)
5. HA auto-logs in user via trusted_networks provider

## Security Notes

- WAF protects the ALB from malicious traffic
- Cognito ensures only authenticated users reach HA
- trusted_networks only trusts internal VPC IPs, not public internet
- Direct access to HA (bypassing ALB) still requires HA login
