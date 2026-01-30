# Bed-Search Service Investigation

**Date**: 2026-01-30
**Target Instance**: autoscale-a5db5e6e
**Instance ID**: 31ec5014-556e-42ab-ad51-4c5e14b12ea5
**Hetzner ID**: 119037353
**IP Address**: 49.13.225.218
**Task ID**: a5db5e6e-8851-4811-a9a8-8ca11bac2afa
**Repository**: lee101/bullet
**Branch**: main
**Workspace**: /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa

## Issue Summary
The bed-search file search service health check has failed on autoscale-a5db5e6e. Investigation is required to restore service functionality.

## Investigation Steps Taken

### 1. SSH Connectivity Check (FAILED)
**Status**: ❌ BLOCKED
**Issue**: SSH authentication failing for both root and codexu-ab532dbfb65b users

**Attempts Made**:
```bash
# Root user attempt
ssh root@49.13.225.218
# Result: Permission denied (publickey,password)

# Codexu user attempt
ssh codexu-ab532dbfb65b@49.13.225.218
# Result: Permission denied (publickey,password)
```

**Error Details**:
- Authentication method: Both publickey and password authentication failing
- Connection timeout: No timeout, authentication rejection
- Additional error: `/etc/profile.d/codex-env.sh: line 2: mise: command not found`

## Possible Root Causes

1. **SSH Key Issues**
   - SSH public key not installed on target machine
   - SSH key permissions incorrect locally
   - Wrong SSH key being used
   - SSH key expired or revoked

2. **Machine Access Issues**
   - Instance may have been terminated/recreated
   - Firewall rules blocking SSH from current IP
   - SSH service not running on target
   - Wrong IP address or DNS resolution issue

3. **User Configuration Issues**
   - Users (root, codexu-ab532dbfb65b) don't exist or disabled
   - Password authentication disabled in sshd_config
   - Account locked or password expired

## Next Steps Required

### Immediate Actions
1. **Verify SSH Key Setup**
   ```bash
   # Check if SSH key exists locally
   ls -la ~/.ssh/id_*

   # Check SSH key permissions
   chmod 600 ~/.ssh/id_rsa
   chmod 644 ~/.ssh/id_rsa.pub

   # Test with verbose output
   ssh -vvv root@49.13.225.218
   ```

2. **Verify Instance Status**
   - Check Hetzner Cloud Console for instance status (ID: 119037353)
   - Verify IP address hasn't changed
   - Check if instance was recently recreated
   - Review instance firewall rules

3. **Alternative Access Methods**
   - Use Hetzner Cloud Console for terminal access
   - Check if there's a bastion/jump host available
   - Review if VPN connection is required

### Once SSH Access Restored

4. **Check bed-search Service Status**
   ```bash
   systemctl status codex-bed-search --no-pager
   ```

5. **Review Service Logs**
   ```bash
   journalctl -u codex-bed-search --no-pager -n 200
   ```

6. **Test Service Health Endpoint**
   ```bash
   curl -sS -X POST -H 'Content-Type: application/json' \
     --data '{"query":"health","limit":1,"paths":3}' \
     http://127.0.0.1:7618/search
   ```

7. **Restart Service If Down**
   ```bash
   echo "realsudo" | sudo -S systemctl restart codex-bed-search
   # Re-test health endpoint
   curl -sS -X POST -H 'Content-Type: application/json' \
     --data '{"query":"health","limit":1,"paths":3}' \
     http://127.0.0.1:7618/search
   ```

8. **Rebuild bed-server If Missing**
   ```bash
   cd /opt/gobed && git pull
   go build -o /usr/local/bin/bed ./cmd/bed
   go build -o /usr/local/bin/bed-server ./cmd/bed-server
   systemctl restart codex-bed-search
   ```

9. **Verify Repository Configuration**
   ```bash
   # Check workspace exists and matches expected repo
   ls -la /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa
   cd /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa
   git remote -v  # Should show lee101/bullet
   git branch     # Should show main branch
   ```

## TODO: Resolution Required

- [ ] Establish SSH access to 49.13.225.218
- [ ] Diagnose codex-bed-search service failure
- [ ] Review service logs for error patterns
- [ ] Test service health endpoint
- [ ] Restart service if configuration is valid
- [ ] Rebuild bed-server binaries if corrupted/missing
- [ ] Verify repository workspace matches expected configuration
- [ ] Document root cause and permanent fix

## Critical Information for Resolution

**Sudo Password**: `realsudo`
**Service Name**: `codex-bed-search`
**Service Port**: 7618
**Binary Locations**:
- `/usr/local/bin/bed`
- `/usr/local/bin/bed-server`

**Build Source**: `/opt/gobed`

## Notes

- The SSH authentication failure is the primary blocker preventing investigation
- Without SSH access, remote diagnosis of the bed-search service is impossible
- Investigation can continue once SSH credentials/keys are properly configured
- The mise command error in profile suggests environment setup issues but is secondary to SSH access problem

## Recommended Follow-up

Contact infrastructure/DevOps team to:
1. Verify SSH key deployment to autoscale-a5db5e6e instance
2. Confirm instance is running and accessible
3. Provide alternative access method if SSH keys are not properly configured
4. Review autoscaling group configuration to ensure new instances are properly provisioned with access credentials
