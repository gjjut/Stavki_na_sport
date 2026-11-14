#!/usr/bin/env bash
# =============================================================================
# Ежедневный резервный дамп PostgreSQL (PM2 или Docker) и локального JSON.
# Хранит архивы за последние 14 дней в /var/backups/valuex/.
# Запуск вручную: bash deploy/backup-db.sh
# =============================================================================

set -euo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="${PROJECT_DIR}/.env"
BACKUP_DIR="/var/backups/valuex"
STAMP="$(date +%Y-%m-%d_%H-%M)"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

get_env_value() {
  local key="$1"
  local file="$2"
  if [[ -f "${file}" ]]; then
    sed -n "s/^${key}=//p" "${file}" | tail -n 1
  fi
}

POSTGRES_USER="$(get_env_value POSTGRES_USER "${ROOT_ENV}")"
POSTGRES_DB="$(get_env_value POSTGRES_DB "${ROOT_ENV}")"
POSTGRES_USER="${POSTGRES_USER:-tipster_user}"
POSTGRES_DB="${POSTGRES_DB:-tipster_db}"
if [[ ! "${POSTGRES_USER}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ || ! "${POSTGRES_DB}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "ОШИБКА: POSTGRES_USER или POSTGRES_DB в ${ROOT_ENV} содержит недопустимое имя." >&2
  exit 1
fi

PG_DUMP_FILE="${BACKUP_DIR}/postgres_${POSTGRES_DB}_${STAMP}.sql.gz"
PG_DUMP_TEMP="$(mktemp "${BACKUP_DIR}/.postgres_${POSTGRES_DB}_${STAMP}.XXXXXX")"
trap 'rm -f "${PG_DUMP_TEMP}"' EXIT

if command -v docker >/dev/null 2>&1 && docker inspect valuex_postgres >/dev/null 2>&1; then
  docker exec -u postgres valuex_postgres pg_dump \
    -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges \
    | gzip -9 > "${PG_DUMP_TEMP}"
  mv "${PG_DUMP_TEMP}" "${PG_DUMP_FILE}"
  echo "[OK] PostgreSQL backup сохранён через контейнер valuex_postgres."
elif command -v pg_dump >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  if sudo -u postgres psql -lqt 2>/dev/null | cut -d '|' -f 1 | tr -d '[:space:]' | grep -qx "${POSTGRES_DB}"; then
    sudo -u postgres pg_dump "${POSTGRES_DB}" --no-owner --no-privileges \
      | gzip -9 > "${PG_DUMP_TEMP}"
    mv "${PG_DUMP_TEMP}" "${PG_DUMP_FILE}"
    echo "[OK] PostgreSQL backup сохранён с системного сервера."
  else
    echo "ОШИБКА: база данных ${POSTGRES_DB} не найдена; PostgreSQL backup не создан." >&2
    exit 1
  fi
else
  echo "ОШИБКА: не найден доступный PostgreSQL (pg_dump или контейнер valuex_postgres)." >&2
  exit 1
fi

# Локальный JSON только копируется в архив; исходный production-файл не изменяется.
LOCAL_JSON="${PROJECT_DIR}/frontend/.data/valuex-production.json"
if [[ -f "${LOCAL_JSON}" ]]; then
  gzip -9 -c "${LOCAL_JSON}" > "${BACKUP_DIR}/local_state_${STAMP}.json.gz"
fi

find "${BACKUP_DIR}" -type f -name "*.gz" -mtime +14 -delete || true
echo "[OK] Резервная копия сохранена в ${BACKUP_DIR} (${STAMP})"
