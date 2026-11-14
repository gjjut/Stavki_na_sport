#!/usr/bin/env bash
# =============================================================================
# Ежедневное резервное копирование базы данных VALUEX (PostgreSQL + JSON)
# Хранит архивы за последние 14 дней в /var/backups/valuex/
# Запуск вручную: bash deploy/backup-db.sh
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="/var/backups/valuex"
STAMP="$(date +%Y-%m-%d_%H-%M)"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# 1. Дамп PostgreSQL (если установлен и используется база tipster_db)
if command -v pg_dump >/dev/null 2>&1; then
  if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw tipster_db; then
    sudo -u postgres pg_dump tipster_db | gzip -9 > "${BACKUP_DIR}/postgres_tipster_db_${STAMP}.sql.gz"
  fi
fi

# 2. Резервная копия локального JSON-хранилища (если задействовано)
LOCAL_JSON="${PROJECT_DIR}/frontend/.data/valuex-production.json"
if [[ -f "${LOCAL_JSON}" ]]; then
  gzip -9 -c "${LOCAL_JSON}" > "${BACKUP_DIR}/local_state_${STAMP}.json.gz"
fi

# 3. Очистка архивов старше 14 дней
find "${BACKUP_DIR}" -type f -name "*.gz" -mtime +14 -delete || true

echo "[OK] Резервная копия сохранена в ${BACKUP_DIR} (${STAMP})"
