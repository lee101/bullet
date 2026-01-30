#!/bin/bash
#
# Bed-Search Service Automatic Recovery Script
# Target: autoscale-a5db5e6e (49.13.225.218)
# Purpose: Automatically restore bed-search service functionality
#
# Usage:
#   ssh root@49.13.225.218 'bash -s' < recover_bed_search.sh
#   OR
#   scp recover_bed_search.sh root@49.13.225.218:/tmp/
#   ssh root@49.13.225.218 'bash /tmp/recover_bed_search.sh'

set -e

SUDO_PASS="realsudo"
SERVICE_NAME="codex-bed-search"
SERVICE_PORT=7618
BED_SERVER_BIN="/usr/local/bin/bed-server"
BED_BIN="/usr/local/bin/bed"
GOBED_SOURCE="/opt/gobed"

echo "========================================"
echo "Bed-Search Service Recovery Script"
echo "========================================"
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo ""

# Function to run sudo commands
run_sudo() {
    echo "$SUDO_PASS" | sudo -S "$@" 2>&1
}

# Check if service is running
echo "[1/6] Checking current service status..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "✓ Service is currently active"
    SERVICE_WAS_ACTIVE=true
else
    echo "✗ Service is currently inactive"
    SERVICE_WAS_ACTIVE=false
fi
echo ""

# Check if binaries exist
echo "[2/6] Checking if binaries exist..."
BINARIES_EXIST=true
if [ ! -f "$BED_SERVER_BIN" ]; then
    echo "✗ Missing: $BED_SERVER_BIN"
    BINARIES_EXIST=false
fi
if [ ! -f "$BED_BIN" ]; then
    echo "✗ Missing: $BED_BIN"
    BINARIES_EXIST=false
fi

if [ "$BINARIES_EXIST" = true ]; then
    echo "✓ All binaries exist"
fi
echo ""

# Rebuild if necessary
if [ "$BINARIES_EXIST" = false ]; then
    echo "[3/6] Rebuilding missing binaries..."

    if [ ! -d "$GOBED_SOURCE" ]; then
        echo "✗ ERROR: Source directory $GOBED_SOURCE does not exist"
        echo "Cannot rebuild binaries. Manual intervention required."
        exit 1
    fi

    echo "Changing to source directory: $GOBED_SOURCE"
    cd "$GOBED_SOURCE"

    echo "Pulling latest changes..."
    git pull || echo "⚠ Git pull failed or no changes"

    echo "Building bed binary..."
    if go build -o "$BED_BIN" ./cmd/bed; then
        echo "✓ Built: $BED_BIN"
    else
        echo "✗ Failed to build: $BED_BIN"
        exit 1
    fi

    echo "Building bed-server binary..."
    if go build -o "$BED_SERVER_BIN" ./cmd/bed-server; then
        echo "✓ Built: $BED_SERVER_BIN"
    else
        echo "✗ Failed to build: $BED_SERVER_BIN"
        exit 1
    fi

    echo "✓ Rebuild complete"
else
    echo "[3/6] Binaries exist, skipping rebuild"
fi
echo ""

# Stop service if running
echo "[4/6] Stopping service..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "Stopping $SERVICE_NAME..."
    run_sudo systemctl stop "$SERVICE_NAME"
    sleep 2
    echo "✓ Service stopped"
else
    echo "Service already stopped"
fi
echo ""

# Start service
echo "[5/6] Starting service..."
echo "Starting $SERVICE_NAME..."
run_sudo systemctl start "$SERVICE_NAME"
sleep 3

if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "✓ Service started successfully"
else
    echo "✗ Service failed to start"
    echo ""
    echo "Recent service logs:"
    journalctl -u "$SERVICE_NAME" --no-pager -n 30
    exit 1
fi
echo ""

# Test health endpoint
echo "[6/6] Testing health endpoint..."
sleep 2  # Give service a moment to fully initialize

MAX_RETRIES=5
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -sS -o /tmp/bed_search_test.json -w "%{http_code}" \
        -X POST -H 'Content-Type: application/json' \
        --data '{"query":"health","limit":1,"paths":3}' \
        "http://127.0.0.1:$SERVICE_PORT/search" 2>&1 || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        echo "✓ Health check passed (HTTP $HTTP_CODE)"
        echo ""
        echo "Response:"
        cat /tmp/bed_search_test.json
        echo ""
        SUCCESS=true
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "⚠ Attempt $RETRY_COUNT/$MAX_RETRIES: Health check returned HTTP $HTTP_CODE"
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Retrying in 2 seconds..."
            sleep 2
        fi
    fi
done

if [ "$SUCCESS" = false ]; then
    echo ""
    echo "✗ Health check failed after $MAX_RETRIES attempts"
    echo ""
    echo "Service status:"
    systemctl status "$SERVICE_NAME" --no-pager
    echo ""
    echo "Recent logs:"
    journalctl -u "$SERVICE_NAME" --no-pager -n 50
    exit 1
fi

echo ""
echo "========================================"
echo "✓ RECOVERY SUCCESSFUL"
echo "========================================"
echo "Service: $SERVICE_NAME"
echo "Status: Active"
echo "Endpoint: http://127.0.0.1:$SERVICE_PORT/search"
echo "Timestamp: $(date)"
echo "========================================"
