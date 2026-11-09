#!/usr/bin/env bash
# ==============================================================================
# Idempotent Google Cloud Scheduler Provisioning / Update Script
#
# Purpose: Wakes up KPI-KHTC backup scheduler tick endpoint every 5 minutes.
# Timezone: Asia/Ho_Chi_Minh
# Target: https://kpi-khtc.ai.studio/api/backups/scheduler-tick
# Authentication: Protected by BACKUP_SCHEDULER_TOKEN in header
# Server autonomously determines when a backup slot is due.
# ==============================================================================

set -euo pipefail

JOB_NAME="${SCHEDULER_JOB_NAME:-kpi-khtc-backup-scheduler}"
SCHEDULE="${SCHEDULER_CRON:-*/5 * * * *}"
TIMEZONE="${SCHEDULER_TIMEZONE:-Asia/Ho_Chi_Minh}"
TARGET_URL="${SCHEDULER_TARGET_URL:-https://kpi-khtc.ai.studio/api/backups/scheduler-tick}"
LOCATION="${SCHEDULER_LOCATION:-asia-southeast1}"
TOKEN="${BACKUP_SCHEDULER_TOKEN:-}"

echo "================================================================================"
echo " [Cloud Scheduler] Provisioning / Updating Job: ${JOB_NAME}"
echo " Schedule:    ${SCHEDULE} (${TIMEZONE})"
echo " Target URL:  ${TARGET_URL}"
echo " Region:      ${LOCATION}"
echo "================================================================================"

if [ -z "${TOKEN}" ]; then
  echo "⚠️  CẢNH BÁO: Biến môi trường BACKUP_SCHEDULER_TOKEN chưa được cung cấp."
  echo "   Vui lòng export BACKUP_SCHEDULER_TOKEN='<secret_token>' trước khi chạy script."
  echo "   (Token được bảo mật và so khớp constant-time trên server)."
  exit 1
fi

if ! command -v gcloud &> /dev/null; then
  echo "❌ gcloud CLI chưa được cài đặt trong môi trường này."
  echo "👉 Lệnh gcloud tương đương để chạy trên Google Cloud Shell:"
  echo ""
  echo "gcloud scheduler jobs create http ${JOB_NAME} \\"
  echo "  --location=\"${LOCATION}\" \\"
  echo "  --schedule=\"${SCHEDULE}\" \\"
  echo "  --time-zone=\"${TIMEZONE}\" \\"
  echo "  --uri=\"${TARGET_URL}\" \\"
  echo "  --http-method=POST \\"
  echo "  --headers=\"X-Backup-Scheduler-Token=\${BACKUP_SCHEDULER_TOKEN},Content-Type=application/json\" \\"
  echo "  --message-body='{\"source\":\"cloud_scheduler\"}' \\"
  echo "  --attempt-deadline=180s \\"
  echo "  --description=\"Trigger automated backup scheduler check every 5 minutes in Asia/Ho_Chi_Minh\""
  exit 0
fi

# Check if the job already exists
if gcloud scheduler jobs describe "${JOB_NAME}" --location="${LOCATION}" > /dev/null 2>&1; then
  echo "ℹ️  Job '${JOB_NAME}' đã tồn tại trong vùng '${LOCATION}'. Đang tiến hành CẬP NHẬT (Update)..."
  gcloud scheduler jobs update http "${JOB_NAME}" \
    --location="${LOCATION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${TARGET_URL}" \
    --http-method=POST \
    --headers="X-Backup-Scheduler-Token=${TOKEN},Content-Type=application/json" \
    --message-body='{"source":"cloud_scheduler"}' \
    --attempt-deadline=180s \
    --description="Trigger automated backup scheduler check every 5 minutes in Asia/Ho_Chi_Minh"
  echo "✅ Đã cập nhật Google Cloud Scheduler job '${JOB_NAME}' thành công!"
else
  echo "ℹ️  Job '${JOB_NAME}' chưa tồn tại. Đang tiến hành TẠO MỚI (Create)..."
  gcloud scheduler jobs create http "${JOB_NAME}" \
    --location="${LOCATION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${TARGET_URL}" \
    --http-method=POST \
    --headers="X-Backup-Scheduler-Token=${TOKEN},Content-Type=application/json" \
    --message-body='{"source":"cloud_scheduler"}' \
    --attempt-deadline=180s \
    --description="Trigger automated backup scheduler check every 5 minutes in Asia/Ho_Chi_Minh"
  echo "✅ Đã tạo mới Google Cloud Scheduler job '${JOB_NAME}' thành công!"
fi
