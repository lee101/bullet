# Bed-Search Investigation: autoscale-a5db5e6e

## Issue Summary
SSH probe failed for bed-search file search service on autoscale-a5db5e6e (49.13.225.218)

## Instance Details
- **Instance ID**: 31ec5014-556e-42ab-ad51-4c5e14b12ea5
- **Hetzner ID**: 119037353
- **Name**: autoscale-a5db5e6e
- **IP**: 49.13.225.218
- **Task ID**: a5db5e6e-8851-4811-a9a8-8ca11bac2afa
- **Repo**: lee101/bullet
- **Branch**: main
- **Workspace**: /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa

## Investigation Status

### SSH Connection Issue
**Problem**: Unable to establish SSH connection to the server
- Attempted: `root@49.13.225.218` - Permission denied (publickey,password)
- Attempted: `codexu-ab532dbfb65b@49.13.225.218` - Permission denied (publickey,password)

**Root Cause**: SSH keys are not configured or authorized_keys is not set up for either user on this instance.

## Manual Debugging Steps

### Step 1: Fix SSH Access
First, establish SSH access to the server:

```bash
# Option A: Add your SSH public key to the server
# If you have Hetzner console access, add your public key to:
# /root/.ssh/authorized_keys
# /home/codexu-ab532dbfb65b/.ssh/authorized_keys

# Option B: Use password authentication (if enabled)
ssh root@49.13.225.218
# Enter password when prompted

# Option C: Use Hetzner Cloud Console
# Access via web console in Hetzner dashboard
```

### Step 2: Check Service Status
Once connected, run these commands:

```bash
# Check service status
systemctl status codex-bed-search --no-pager

# View recent logs
journalctl -u codex-bed-search --no-pager -n 200

# Check if bed-search is listening
netstat -tlnp | grep 7618
# or
ss -tlnp | grep 7618
```

### Step 3: Test Service Health
```bash
# Health check
curl -sS -X POST -H 'Content-Type: application/json' \
  --data '{"query":"health","limit":1,"paths":3}' \
  http://127.0.0.1:7618/search
```

### Step 4: Restart Service (if down)
```bash
systemctl restart codex-bed-search
systemctl status codex-bed-search --no-pager

# Re-test
curl -sS -X POST -H 'Content-Type: application/json' \
  --data '{"query":"health","limit":1,"paths":3}' \
  http://127.0.0.1:7618/search
```

### Step 5: Rebuild Binaries (if missing/corrupted)
```bash
# Navigate to gobed directory
cd /opt/gobed

# Pull latest changes
git pull

# Build bed binary
go build -o /usr/local/bin/bed ./cmd/bed

# Build bed-server binary
go build -o /usr/local/bin/bed-server ./cmd/bed-server

# Restart service
systemctl restart codex-bed-search
systemctl status codex-bed-search --no-pager
```

### Step 6: Verify Configuration
```bash
# Check systemd service file
cat /etc/systemd/system/codex-bed-search.service

# Verify workspace and repo
ls -la /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa
cd /home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa
git remote -v  # Should show lee101/bullet
git branch     # Should show main or related branch
```

## Common Issues & Solutions

### Issue: Service won't start
**Check**:
- Binary exists: `ls -la /usr/local/bin/bed-server`
- Binary is executable: `chmod +x /usr/local/bin/bed-server`
- Dependencies installed: `which go`
- Port not in use: `netstat -tlnp | grep 7618`

### Issue: Service starts but crashes
**Check**:
- Logs: `journalctl -u codex-bed-search -n 500`
- Permissions: Service user can access workspace directory
- Disk space: `df -h`
- Memory: `free -h`

### Issue: Service responds but returns errors
**Check**:
- Index is built: Check if bed has indexed the workspace
- Workspace path is correct in service config
- File permissions allow reading workspace files

## TODO Items

- [ ] Establish SSH access to autoscale-a5db5e6e (49.13.225.218)
- [ ] Run diagnostic commands to identify bed-search failure
- [ ] Review service logs for error messages
- [ ] Restart service if it's simply stopped
- [ ] Rebuild binaries if they're missing or corrupted
- [ ] Verify workspace matches expected repo (lee101/bullet)
- [ ] Confirm service responds to health check
- [ ] Document root cause and resolution

## Next Steps

1. **Immediate**: Fix SSH access by adding SSH keys via Hetzner console
2. **Diagnose**: Run status and log commands to identify failure
3. **Remediate**: Apply appropriate fix (restart, rebuild, or reconfigure)
4. **Verify**: Confirm service health with curl test
5. **Monitor**: Set up alerts if service fails again

## Notes
- SSH probe failure suggests the server may be unreachable or SSH daemon issues
- Could also indicate firewall rules blocking SSH (port 22)
- Server may need to be restarted if completely unresponsive
- Consider checking Hetzner dashboard for instance health
