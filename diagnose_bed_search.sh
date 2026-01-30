#!/bin/bash
#
# Bed-Search Service Diagnostic and Recovery Script
# Target: autoscale-a5db5e6e (49.13.225.218)
# Purpose: Diagnose and restore bed-search service functionality
#
# Usage:
#   ssh root@49.13.225.218 'bash -s' < diagnose_bed_search.sh
#   OR
#   scp diagnose_bed_search.sh root@49.13.225.218:/tmp/
#   ssh root@49.13.225.218 'bash /tmp/diagnose_bed_search.sh'

set -e

SUDO_PASS="realsudo"
SERVICE_NAME="codex-bed-search"
SERVICE_PORT=7618
BED_SERVER_BIN="/usr/local/bin/bed-server"
BED_BIN="/usr/local/bin/bed"
GOBED_SOURCE="/opt/gobed"
WORKSPACE="/home/codexu-ab532dbfb65b/workspaces/a5db5e6e-8851-4811-a9a8-8ca11bac2afa"
EXPECTED_REPO="lee101/bullet"
EXPECTED_BRANCH="main"

echo "========================================"
echo "Bed-Search Service Diagnostic Script"
echo "========================================"
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo "IP: $(hostname -I | awk '{print $1}')"
echo ""

# Function to run sudo commands
run_sudo() {
    echo "$SUDO_PASS" | sudo -S "$@" 2>/dev/null
}

# Step 1: Check service status
echo "=== Step 1: Checking service status ==="
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "✓ Service $SERVICE_NAME is ACTIVE"
else
    echo "✗ Service $SERVICE_NAME is NOT ACTIVE"
fi

echo ""
echo "Full service status:"
systemctl status "$SERVICE_NAME" --no-pager || true
echo ""

# Step 2: Check recent logs
echo "=== Step 2: Checking service logs (last 50 lines) ==="
journalctl -u "$SERVICE_NAME" --no-pager -n 50 || true
echo ""

# Step 3: Check if binaries exist
echo "=== Step 3: Checking binary files ==="
if [ -f "$BED_SERVER_BIN" ]; then
    echo "✓ $BED_SERVER_BIN exists"
    ls -lh "$BED_SERVER_BIN"
else
    echo "✗ $BED_SERVER_BIN MISSING"
fi

if [ -f "$BED_BIN" ]; then
    echo "✓ $BED_BIN exists"
    ls -lh "$BED_BIN"
else
    echo "✗ $BED_BIN MISSING"
fi
echo ""

# Step 4: Check if port is listening
echo "=== Step 4: Checking if port $SERVICE_PORT is listening ==="
if netstat -tuln 2>/dev/null | grep -q ":$SERVICE_PORT "; then
    echo "✓ Port $SERVICE_PORT is listening"
    netstat -tuln | grep ":$SERVICE_PORT "
elif ss -tuln 2>/dev/null | grep -q ":$SERVICE_PORT "; then
    echo "✓ Port $SERVICE_PORT is listening"
    ss -tuln | grep ":$SERVICE_PORT "
else
    echo "✗ Port $SERVICE_PORT is NOT listening"
fi
echo ""

# Step 5: Test health endpoint
echo "=== Step 5: Testing health endpoint ==="
HTTP_CODE=$(curl -sS -o /tmp/bed_search_response.json -w "%{http_code}" \
    -X POST -H 'Content-Type: application/json' \
    --data '{"query":"health","limit":1,"paths":3}' \
    "http://127.0.0.1:$SERVICE_PORT/search" 2>&1 || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Health endpoint returned HTTP $HTTP_CODE"
    echo "Response:"
    cat /tmp/bed_search_response.json
    echo ""
else
    echo "✗ Health endpoint returned HTTP $HTTP_CODE"
    if [ -f /tmp/bed_search_response.json ]; then
        echo "Response:"
        cat /tmp/bed_search_response.json
        echo ""
    fi
fi
echo ""

# Step 6: Check workspace and repository
echo "=== Step 6: Checking workspace and repository ==="
if [ -d "$WORKSPACE" ]; then
    echo "✓ Workspace exists: $WORKSPACE"
    cd "$WORKSPACE"

    if [ -d ".git" ]; then
        echo "✓ Git repository found"

        REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "NO_REMOTE")
        echo "Remote URL: $REMOTE_URL"

        if echo "$REMOTE_URL" | grep -q "$EXPECTED_REPO"; then
            echo "✓ Repository matches expected: $EXPECTED_REPO"
        else
            echo "✗ Repository does NOT match expected: $EXPECTED_REPO"
        fi

        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "UNKNOWN")
        echo "Current branch: $CURRENT_BRANCH"

        if [ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ]; then
            echo "✓ Branch matches expected: $EXPECTED_BRANCH"
        else
            echo "⚠ Branch does NOT match expected: $EXPECTED_BRANCH"
        fi
    else
        echo "✗ Not a git repository"
    fi
else
    echo "✗ Workspace does NOT exist: $WORKSPACE"
fi
echo ""

# Step 7: Check gobed source
echo "=== Step 7: Checking gobed source directory ==="
if [ -d "$GOBED_SOURCE" ]; then
    echo "✓ Gobed source exists: $GOBED_SOURCE"
    ls -la "$GOBED_SOURCE"
else
    echo "✗ Gobed source does NOT exist: $GOBED_SOURCE"
fi
echo ""

# Step 8: Decision and recovery
echo "=== Step 8: Recovery Actions ==="

NEEDS_RESTART=false
NEEDS_REBUILD=false

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "⚠ Service is not active"
    NEEDS_RESTART=true
fi

if [ ! -f "$BED_SERVER_BIN" ] || [ ! -f "$BED_BIN" ]; then
    echo "⚠ Binaries are missing"
    NEEDS_REBUILD=true
fi

if [ "$HTTP_CODE" != "200" ]; then
    echo "⚠ Health endpoint not responding correctly"
    NEEDS_RESTART=true
fi

if [ "$NEEDS_REBUILD" = true ]; then
    echo ""
    echo ">>> REBUILD REQUIRED <<<"
    echo "To rebuild bed-server binaries, run:"
    echo ""
    echo "  cd $GOBED_SOURCE && git pull"
    echo "  go build -o $BED_BIN ./cmd/bed"
    echo "  go build -o $BED_SERVER_BIN ./cmd/bed-server"
    echo "  systemctl restart $SERVICE_NAME"
    echo ""
elif [ "$NEEDS_RESTART" = true ]; then
    echo ""
    echo ">>> RESTART RECOMMENDED <<<"
    echo "To restart the service, run:"
    echo ""
    echo "  systemctl restart $SERVICE_NAME"
    echo "  # Then re-test:"
    echo "  curl -sS -X POST -H 'Content-Type: application/json' \\"
    echo "    --data '{\"query\":\"health\",\"limit\":1,\"paths\":3}' \\"
    echo "    http://127.0.0.1:$SERVICE_PORT/search"
    echo ""
else
    echo ""
    echo "✓ Service appears healthy. No immediate action required."
    echo ""
fi

echo "========================================"
echo "Diagnostic complete: $(date)"
echo "========================================"
