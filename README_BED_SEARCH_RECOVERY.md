# Bed-Search Service Recovery Guide

This directory contains tools and documentation for investigating and recovering the bed-search file search service on autoscale-a5db5e6e.

## Quick Start

### If SSH Access is Working

```bash
# Option 1: Run diagnostic script remotely
ssh root@49.13.225.218 'bash -s' < diagnose_bed_search.sh

# Option 2: Run recovery script remotely (automatically fixes the service)
ssh root@49.13.225.218 'bash -s' < recover_bed_search.sh
```

### If SSH Access is NOT Working

1. Check SSH key configuration
2. Verify instance is running in Hetzner Cloud Console (Instance ID: 119037353)
3. Use Hetzner Cloud Console terminal access as fallback
4. See [BED_SEARCH_INVESTIGATION.md](BED_SEARCH_INVESTIGATION.md) for detailed troubleshooting

## Files in This Directory

### 1. BED_SEARCH_INVESTIGATION.md
Comprehensive investigation report documenting:
- Current SSH authentication issues
- Investigation steps taken
- Root cause analysis
- Next steps and action items

**When to use**: Read this first to understand the current state and blockers.

### 2. diagnose_bed_search.sh
Diagnostic script that checks the health of the bed-search service without making changes.

**What it checks**:
- Service status (active/inactive)
- Service logs (last 50 lines)
- Binary files existence
- Port listening status
- Health endpoint response
- Repository configuration
- Source code directory

**When to use**: Run this first to understand what's wrong before attempting fixes.

**Usage**:
```bash
# Copy and run on remote machine
scp diagnose_bed_search.sh root@49.13.225.218:/tmp/
ssh root@49.13.225.218 'bash /tmp/diagnose_bed_search.sh'

# Or pipe directly
ssh root@49.13.225.218 'bash -s' < diagnose_bed_search.sh
```

### 3. recover_bed_search.sh
Automatic recovery script that attempts to restore service functionality.

**What it does**:
1. Checks current service status
2. Verifies binary files exist
3. Rebuilds binaries if missing (from /opt/gobed)
4. Stops the service
5. Starts the service
6. Tests health endpoint with retries

**When to use**: Run this after diagnosing the issue to automatically fix the service.

**Usage**:
```bash
# Copy and run on remote machine
scp recover_bed_search.sh root@49.13.225.218:/tmp/
ssh root@49.13.225.218 'bash /tmp/recover_bed_search.sh'

# Or pipe directly
ssh root@49.13.225.218 'bash -s' < recover_bed_search.sh
```

## Target Instance Information

| Property | Value |
|----------|-------|
| **Name** | autoscale-a5db5e6e |
| **IP Address** | 49.13.225.218 |
| **Instance ID** | 31ec5014-556e-42ab-ad51-4c5e14b12ea5 |
| **Hetzner ID** | 119037353 |
| **Task ID** | a5db5e6e-8851-4811-a9a8-8ca11bac2afa |
| **Repository** | lee101/bullet |
| **Branch** | main |
| **Workspace** | /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa |
| **SSH Users** | root or codexu-ab532dbfb65b |
| **Sudo Password** | realsudo |

## Service Information

| Property | Value |
|----------|-------|
| **Service Name** | codex-bed-search |
| **Port** | 7618 |
| **bed-server Binary** | /usr/local/bin/bed-server |
| **bed Binary** | /usr/local/bin/bed |
| **Source Directory** | /opt/gobed |

## Manual Recovery Steps

If the automated scripts don't work, follow these manual steps:

### 1. Check Service Status
```bash
ssh root@49.13.225.218
systemctl status codex-bed-search --no-pager
```

### 2. Check Service Logs
```bash
journalctl -u codex-bed-search --no-pager -n 200
```

### 3. Test Health Endpoint
```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  --data '{"query":"health","limit":1,"paths":3}' \
  http://127.0.0.1:7618/search
```

### 4. Restart Service
```bash
echo "realsudo" | sudo -S systemctl restart codex-bed-search

# Wait a few seconds then re-test
sleep 3
curl -sS -X POST -H 'Content-Type: application/json' \
  --data '{"query":"health","limit":1,"paths":3}' \
  http://127.0.0.1:7618/search
```

### 5. Rebuild Binaries (if missing or corrupted)
```bash
cd /opt/gobed
git pull

# Build bed binary
go build -o /usr/local/bin/bed ./cmd/bed

# Build bed-server binary
go build -o /usr/local/bin/bed-server ./cmd/bed-server

# Restart service
systemctl restart codex-bed-search

# Test health
curl -sS -X POST -H 'Content-Type: application/json' \
  --data '{"query":"health","limit":1,"paths":3}' \
  http://127.0.0.1:7618/search
```

## Common Issues and Solutions

### Issue: SSH Authentication Failing
**Symptoms**: `Permission denied (publickey,password)` when trying to SSH

**Solutions**:
1. Verify SSH key is properly configured locally
   ```bash
   ls -la ~/.ssh/id_*
   chmod 600 ~/.ssh/id_rsa
   ```

2. Check instance status in Hetzner Cloud Console

3. Use Hetzner Cloud Console terminal access as alternative

4. Contact DevOps to verify SSH key deployment

### Issue: Service Won't Start
**Symptoms**: `systemctl start` fails or service immediately stops

**Solutions**:
1. Check logs for error messages:
   ```bash
   journalctl -u codex-bed-search --no-pager -n 100
   ```

2. Verify binaries exist and are executable:
   ```bash
   ls -lh /usr/local/bin/bed*
   ```

3. Check if port 7618 is already in use:
   ```bash
   netstat -tuln | grep 7618
   # or
   ss -tuln | grep 7618
   ```

4. Rebuild binaries from source (see step 5 in manual steps)

### Issue: Health Endpoint Not Responding
**Symptoms**: Curl returns connection refused or timeout

**Solutions**:
1. Verify service is running:
   ```bash
   systemctl status codex-bed-search
   ```

2. Check if service is listening on port:
   ```bash
   netstat -tuln | grep 7618
   ```

3. Check firewall rules (service should be accessible from localhost):
   ```bash
   iptables -L -n | grep 7618
   ```

4. Review logs for binding errors:
   ```bash
   journalctl -u codex-bed-search --no-pager | grep -i "bind\|listen\|port"
   ```

### Issue: Repository Mismatch
**Symptoms**: Workspace shows wrong repository or branch

**Solutions**:
1. Verify workspace directory:
   ```bash
   cd /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa
   git remote -v
   git branch --show-current
   ```

2. Expected values:
   - Remote: lee101/bullet
   - Branch: main

3. If mismatch, contact DevOps to verify autoscaling configuration

## Troubleshooting Workflow

```
┌─────────────────────────┐
│  Can you SSH in?        │
└───────┬─────────────────┘
        │
        ├─ NO ──> Check BED_SEARCH_INVESTIGATION.md
        │         Fix SSH access first
        │
        └─ YES
           │
           ▼
┌─────────────────────────┐
│ Run diagnose script     │
│ ./diagnose_bed_search.sh│
└───────┬─────────────────┘
        │
        ├─ Service healthy? ──> Done
        │
        └─ Service unhealthy
           │
           ▼
┌─────────────────────────┐
│ Run recovery script     │
│ ./recover_bed_search.sh │
└───────┬─────────────────┘
        │
        ├─ Recovery successful? ──> Done
        │
        └─ Recovery failed
           │
           ▼
┌─────────────────────────┐
│ Follow manual steps     │
│ Review logs             │
│ Escalate if needed      │
└─────────────────────────┘
```

## Current Status

**Last Updated**: 2026-01-30

**Status**: 🔴 SSH ACCESS BLOCKED

**Issue**: Cannot establish SSH connection to 49.13.225.218 with either root or codexu-ab532dbfb65b user. Both publickey and password authentication are failing.

**Blocker**: Investigation and recovery cannot proceed until SSH access is restored.

**Next Action**: Verify SSH key deployment or use Hetzner Cloud Console terminal access.

## Contact and Escalation

If you cannot resolve the issue using these tools:

1. Check Hetzner Cloud Console for instance status (ID: 119037353)
2. Review autoscaling group logs for provisioning issues
3. Contact DevOps team with:
   - Output from diagnostic script (if SSH works)
   - Service logs (from journalctl)
   - This investigation report
   - Steps already attempted

## Additional Resources

- **Service binary source**: https://github.com/lee101/gobed (assumed)
- **Service configuration**: /etc/systemd/system/codex-bed-search.service (or similar)
- **Hetzner Cloud Console**: https://console.hetzner.cloud/

## Notes

- All scripts use non-interactive sudo with password "realsudo"
- Scripts are idempotent (safe to run multiple times)
- Recovery script includes automatic retries for health checks
- Both scripts provide detailed output for troubleshooting
