#!/usr/bin/env bash
# Runs the API and BullMQ worker as sibling processes in one container (single
# Railway service). Previously the Dockerfile CMD only started the API, so the
# worker never ran — every queued job (report exports, performance exports,
# payroll exports, AI report generation) sat in Redis forever with nothing to
# consume it.
#
# If either process exits, the other is killed and the container exits with
# that process's code, so Railway's restart policy takes over instead of
# leaving the container half-alive with only one process still running.
set -euo pipefail

node dist/apps/api/src/main.js &
API_PID=$!

node dist/apps/worker/src/main.js &
WORKER_PID=$!

trap 'kill -TERM "$API_PID" "$WORKER_PID" 2>/dev/null || true' TERM INT

set +e
wait -n "$API_PID" "$WORKER_PID"
EXIT_CODE=$?
set -e

kill "$API_PID" "$WORKER_PID" 2>/dev/null || true
exit "$EXIT_CODE"
