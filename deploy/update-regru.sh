#!/usr/bin/env bash
# =============================================================================
# Обновление VALUEX.PRO с синхронизацией production env и проверкой health.
# Запуск: bash deploy/update-regru.sh [--pm2|--docker]
# Без аргумента режим определяется по существующему контейнеру valuex_web.
# =============================================================================

set -euo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"
ROOT_ENV="${PROJECT_DIR}/.env"
FRONTEND_ENV="${PROJECT_DIR}/frontend/.env.local"
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

UPDATE_MODE="${VALUEX_DEPLOY_MODE:-auto}"
case "${1:-}" in
  '') ;;
  --pm2) UPDATE_MODE='pm2' ;;
  --docker) UPDATE_MODE='docker' ;;
  *)
    echo "Использование: bash deploy/update-regru.sh [--pm2|--docker]" >&2
    exit 2
    ;;
esac

if [[ "${UPDATE_MODE}" == 'auto' ]]; then
  if command -v docker >/dev/null 2>&1 && {
    docker inspect valuex_web >/dev/null 2>&1 ||
      docker inspect valuex_postgres >/dev/null 2>&1
  }; then
    UPDATE_MODE='docker'
  else
    UPDATE_MODE='pm2'
  fi
fi
if [[ "${UPDATE_MODE}" != 'pm2' && "${UPDATE_MODE}" != 'docker' ]]; then
  echo "ОШИБКА: VALUEX_DEPLOY_MODE должен быть auto, pm2 или docker." >&2
  exit 2
fi

if [[ "${UPDATE_MODE}" == 'docker' ]]; then
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "ОШИБКА: для Docker-обновления требуется Docker Compose v2." >&2
    exit 1
  fi
  ENV_FILE="${ROOT_ENV}"
  if [[ ! -f "${ENV_FILE}" ]]; then
    if [[ -f "${FRONTEND_ENV}" ]]; then
      cp "${FRONTEND_ENV}" "${ENV_FILE}"
    else
      cp "${PROJECT_DIR}/.env.example" "${ENV_FILE}"
    fi
  fi
else
  ENV_FILE="${FRONTEND_ENV}"
  if [[ ! -f "${ENV_FILE}" ]]; then
    if [[ -f "${ROOT_ENV}" ]]; then
      cp "${ROOT_ENV}" "${ENV_FILE}"
    else
      cp "${PROJECT_DIR}/.env.example" "${ENV_FILE}"
    fi
  fi
  # Старые PM2-установки могли сохранить дополнительные значения только в корневом .env.
  # Используем frontend/.env.local как активную конфигурацию, заполняя лишь отсутствующие поля.
  if [[ -f "${ROOT_ENV}" ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do
      if [[ "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        key="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        current="$(sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1)"
        if [[ -z "${current}" && -n "${value}" ]]; then
          escaped_value="${value//\\/\\\\}"
          escaped_value="${escaped_value//&/\\&}"
          escaped_value="${escaped_value//|/\\|}"
          if grep -q "^${key}=" "${ENV_FILE}"; then
            sed -i "s|^${key}=.*|${key}=${escaped_value}|" "${ENV_FILE}"
          else
            printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
          fi
        fi
      fi
    done < "${ROOT_ENV}"
  fi
fi

get_env_value() {
  local key="$1"
  local file="$2"
  sed -n "s/^${key}=//p" "${file}" | tail -n 1
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local escaped_value="${value//\\/\\\\}"
  escaped_value="${escaped_value//&/\\&}"
  escaped_value="${escaped_value//|/\\|}"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

random_secret() {
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

SESSION_SECRET="$(get_env_value SESSION_SECRET "${ENV_FILE}")"
if [[ ${#SESSION_SECRET} -lt 32 || "${SESSION_SECRET}" == 'change_this_to_a_long_random_64_char_secret_string' || "${SESSION_SECRET}" == 'valuex-prod-default-hmac-secret-change-in-env-2026' ]]; then
  SESSION_SECRET="$(random_secret)"
  set_env_value SESSION_SECRET "${SESSION_SECRET}" "${ENV_FILE}"
fi

AUTOPILOT_CRON_SECRET="$(get_env_value AUTOPILOT_CRON_SECRET "${ENV_FILE}")"
if [[ ${#AUTOPILOT_CRON_SECRET} -lt 32 || "${AUTOPILOT_CRON_SECRET}" == *'replace_with'* ]]; then
  AUTOPILOT_CRON_SECRET="$(random_secret)"
  set_env_value AUTOPILOT_CRON_SECRET "${AUTOPILOT_CRON_SECRET}" "${ENV_FILE}"
fi

ADMIN_EMAIL="$(get_env_value ADMIN_EMAIL "${ENV_FILE}")"
if [[ -z "${ADMIN_EMAIL}" ]]; then
  ADMIN_EMAIL='admin@valuex.pro'
  set_env_value ADMIN_EMAIL "${ADMIN_EMAIL}" "${ENV_FILE}"
fi
ADMIN_PASSWORD="$(get_env_value ADMIN_PASSWORD "${ENV_FILE}")"
ADMIN_PASSWORD_CHANGED=false
if [[ ${#ADMIN_PASSWORD} -lt 12 || "${ADMIN_PASSWORD}" == 'Admin2026!' ]]; then
  ADMIN_PASSWORD="$(random_secret)$(random_secret)"
  set_env_value ADMIN_PASSWORD "${ADMIN_PASSWORD}" "${ENV_FILE}"
  ADMIN_PASSWORD_CHANGED=true
fi

POSTGRES_USER="$(get_env_value POSTGRES_USER "${ENV_FILE}")"
POSTGRES_DB="$(get_env_value POSTGRES_DB "${ENV_FILE}")"
POSTGRES_PASSWORD="$(get_env_value POSTGRES_PASSWORD "${ENV_FILE}")"
POSTGRES_USER="${POSTGRES_USER:-tipster_user}"
POSTGRES_DB="${POSTGRES_DB:-tipster_db}"
if [[ ! "${POSTGRES_USER}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ || "${POSTGRES_USER}" == 'postgres' ]]; then
  echo "ОШИБКА: POSTGRES_USER должен быть допустимым именем роли и не может быть postgres." >&2
  exit 1
fi
if [[ ! "${POSTGRES_DB}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "ОШИБКА: POSTGRES_DB должен быть допустимым именем базы данных." >&2
  exit 1
fi
if [[ ! "${POSTGRES_PASSWORD}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  POSTGRES_PASSWORD="$(random_secret)"
fi

DATABASE_HOST='127.0.0.1'
if [[ "${UPDATE_MODE}" == 'docker' ]]; then
  DATABASE_HOST='postgres'
fi
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DATABASE_HOST}:5432/${POSTGRES_DB}"
set_env_value POSTGRES_USER "${POSTGRES_USER}" "${ENV_FILE}"
set_env_value POSTGRES_DB "${POSTGRES_DB}" "${ENV_FILE}"
set_env_value POSTGRES_PASSWORD "${POSTGRES_PASSWORD}" "${ENV_FILE}"
set_env_value DATABASE_URL "${DATABASE_URL}" "${ENV_FILE}"

NEXT_PUBLIC_SITE_URL="$(get_env_value NEXT_PUBLIC_SITE_URL "${ENV_FILE}")"
if [[ -z "${NEXT_PUBLIC_SITE_URL}" ]]; then
  set_env_value NEXT_PUBLIC_SITE_URL "http://${SERVER_IP:-127.0.0.1}" "${ENV_FILE}"
fi
sed -i 's/^TELEGRAM_BOT_TOKEN=.*replace_with.*/TELEGRAM_BOT_TOKEN=/' "${ENV_FILE}" || true
sed -i 's/^YOOKASSA_SECRET_KEY=.*replace_with.*/YOOKASSA_SECRET_KEY=/' "${ENV_FILE}" || true
chmod 600 "${ENV_FILE}"

# PM2 reads frontend/.env.local; cron and maintenance scripts read the root .env.
# Keep them byte-for-byte aligned so the cron bearer token and database settings agree.
if [[ "${UPDATE_MODE}" == 'pm2' ]]; then
  cp "${ENV_FILE}" "${ROOT_ENV}"
  chmod 600 "${ROOT_ENV}"
fi

ensure_database_user_and_schema() {
  if [[ "${UPDATE_MODE}" == 'docker' ]]; then
    docker compose up -d postgres
    local ready=false
    for attempt in $(seq 1 60); do
      if docker exec -u postgres valuex_postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; then
        ready=true
        break
      fi
      sleep 1
    done
    if [[ "${ready}" != true ]]; then
      echo "ОШИБКА: контейнер PostgreSQL не стал готов за 60 секунд." >&2
      docker compose logs --tail=80 postgres >&2 || true
      return 1
    fi
    if docker exec -u postgres valuex_postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | tr -d '[:space:]' | grep -qx '1'; then
      docker exec -i -u postgres valuex_postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
ALTER ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}';
SQL
    else
      docker exec -i -u postgres valuex_postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
SQL
    fi
    if ! docker exec -u postgres valuex_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | tr -d '[:space:]' | grep -qx '1'; then
      docker exec -u postgres valuex_postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"
    fi
    docker exec -i -u postgres valuex_postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
ALTER DATABASE ${POSTGRES_DB} OWNER TO ${POSTGRES_USER};
SQL
    docker exec -i -u postgres valuex_postgres psql -v ON_ERROR_STOP=1 -U postgres -d "${POSTGRES_DB}" <<SQL
GRANT ALL ON SCHEMA public TO ${POSTGRES_USER};
SQL
  else
    if ! command -v psql >/dev/null 2>&1 || ! command -v sudo >/dev/null 2>&1; then
      echo "ОШИБКА: PM2-обновлению нужны psql и sudo для синхронизации роли PostgreSQL." >&2
      return 1
    fi
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | tr -d '[:space:]' | grep -qx '1'; then
      sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres <<SQL
ALTER ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}';
SQL
    else
      sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres <<SQL
CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
SQL
    fi
    if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | tr -d '[:space:]' | grep -qx '1'; then
      sudo -u postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"
    fi
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres <<SQL
ALTER DATABASE ${POSTGRES_DB} OWNER TO ${POSTGRES_USER};
SQL
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${POSTGRES_DB}" <<SQL
GRANT ALL ON SCHEMA public TO ${POSTGRES_USER};
SQL
  fi
}

ensure_database_user_and_schema

echo "Режим обновления: ${UPDATE_MODE}; production env синхронизирован."
if [[ "${UPDATE_MODE}" == 'docker' ]]; then
  # Исключаем локальные env-файлы, node_modules и локальные данные из build context.
  cat > "${PROJECT_DIR}/frontend/.dockerignore" <<'EOF'
node_modules
.next
.data
.env
.env.*
*.tsbuildinfo
next-env.d.ts
npm-debug.log*
EOF
  docker compose up -d --build
else
  cd "${PROJECT_DIR}/frontend"
  npm ci --no-audit --no-fund
  rm -rf .next
  NODE_OPTIONS="--max-old-space-size=1536" npm run build
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart valuex-web --update-env || pm2 start npm --name "valuex-web" -- run start
  else
    echo "ОШИБКА: PM2 не установлен; приложение собрано, но не перезапущено." >&2
    exit 1
  fi
  pm2 save
fi

# Системный планировщик использует тот же root .env, что и Docker Compose.
chmod +x "${PROJECT_DIR}/deploy/"*.sh || true
if [[ -f "${PROJECT_DIR}/deploy/termius.sh" ]]; then
  ln -sf "${PROJECT_DIR}/deploy/termius.sh" /usr/local/bin/valuex || true
fi
if ! command -v cron >/dev/null 2>&1 || [[ ! -f /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf ]]; then
  apt-get update -y && apt-get install -y cron fonts-dejavu-core || true
fi
if [[ -d /etc/cron.d ]]; then
  cat > /etc/cron.d/valuex-autopilot <<EOF
*/15 * * * * root CRON_SECRET="\$(sed -n 's/^AUTOPILOT_CRON_SECRET=//p' '${ROOT_ENV}' | tail -n 1)" && curl -fsS -H "Authorization: Bearer \${CRON_SECRET}" http://127.0.0.1:3000/api/v1/cron/autopilot >/dev/null 2>&1 || true
30 3 * * * root bash ${PROJECT_DIR}/deploy/backup-db.sh >/dev/null 2>&1 || true
EOF
  chmod 0644 /etc/cron.d/valuex-autopilot
  systemctl enable --now cron >/dev/null 2>&1 || true
fi

HEALTH_FILE="$(mktemp)"
HEALTH_STATUS=''
echo "Ожидание здорового состояния сервиса (/api/health)..."
for attempt in $(seq 1 60); do
  HEALTH_STATUS="$(curl --silent --max-time 5 -o "${HEALTH_FILE}" -w '%{http_code}' http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if [[ "${HEALTH_STATUS}" == '200' ]]; then
    break
  fi
  sleep 1
done
cat "${HEALTH_FILE}"
printf '\n'
rm -f "${HEALTH_FILE}"
if [[ "${HEALTH_STATUS}" != '200' ]]; then
  echo "ОШИБКА: приложение не прошло /api/health (HTTP ${HEALTH_STATUS:-no-response})." >&2
  if [[ "${UPDATE_MODE}" == 'docker' ]]; then
    docker compose logs --tail=100 web >&2 || true
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 logs valuex-web --lines 100 --nostream >&2 || true
  fi
  exit 1
fi

echo "=================================================================="
echo " Обновление VALUEX.PRO завершено; режим: ${UPDATE_MODE}."
echo " Витрина сайта: http://${SERVER_IP:-127.0.0.1}"
echo " Вход в админку: http://${SERVER_IP:-127.0.0.1}/login"
if [[ "${ADMIN_PASSWORD_CHANGED}" == true ]]; then
  echo "Логин: ${ADMIN_EMAIL}; новый случайный пароль (сохраните сейчас): ${ADMIN_PASSWORD}"
fi
echo "Production env: ${ENV_FILE} (права 600); Docker Compose/cron синхронизированы через ${ROOT_ENV}."
echo "Не публикуйте .env и не запускайте неизвестные команды от Termius."
echo "=================================================================="
