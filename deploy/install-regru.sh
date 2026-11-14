#!/usr/bin/env bash
# =============================================================================
# Скрипт автоматического развертывания платформы VALUEX.PRO на Reg.ru Cloud
# ОС: Ubuntu 22.04 / 24.04 LTS (под пользователем root)
# Использование:
#   bash deploy/install-regru.sh            # Надежный режим для РФ: Node 22 + PM2 + PostgreSQL + Nginx
#   bash deploy/install-regru.sh --docker   # Режим Docker Compose (с автонастройкой зеркал Docker Hub для РФ)
# =============================================================================

set -euo pipefail
umask 077

MODE="pm2"
if [[ "${1:-}" == "--docker" ]]; then
  MODE="docker"
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_IP="$(hostname -I | awk '{print $1}')"

echo "=================================================================="
echo " Старт установки VALUEX.PRO на сервер Reg.ru Cloud (${SERVER_IP})"
echo " Режим развертывания: ${MODE}"
echo "=================================================================="

# 1. Создание Swap-файла 2 ГБ (защита от OOM Killed на тарифах Reg.ru 1-2 ГБ ОЗУ при сборке Next.js)
if [[ $(swapon --show | wc -l) -eq 0 ]]; then
  echo "[1/6] Добавление Swap-файла 2 ГБ для стабильной сборки..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
else
  echo "[1/6] Swap уже активен — пропускаем."
fi

# 2. Установка базовых системных пакетов, Cron, Nginx и Certbot
echo "[2/6] Обновление пакетов и установка Cron + Nginx + Certbot..."
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt-get update -y
apt-get install -y sudo curl git cron fonts-dejavu-core ca-certificates gnupg ufw nginx certbot python3-certbot-nginx
systemctl enable --now cron >/dev/null 2>&1 || true

# 3. Подготовка переменных окружения и генерация уникальных секретов
cd "${PROJECT_DIR}"
if [[ ! -f .env ]]; then
  cp .env.example .env
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
  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

random_secret() {
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

SESSION_SECRET="$(get_env_value SESSION_SECRET .env)"
if [[ ${#SESSION_SECRET} -lt 32 || "${SESSION_SECRET}" == 'change_this_to_a_long_random_64_char_secret_string' || "${SESSION_SECRET}" == 'valuex-prod-default-hmac-secret-change-in-env-2026' ]]; then
  SESSION_SECRET="$(random_secret)"
  set_env_value SESSION_SECRET "${SESSION_SECRET}" .env
fi

AUTOPILOT_CRON_SECRET="$(get_env_value AUTOPILOT_CRON_SECRET .env)"
if [[ ${#AUTOPILOT_CRON_SECRET} -lt 32 ]]; then
  AUTOPILOT_CRON_SECRET="$(random_secret)"
  set_env_value AUTOPILOT_CRON_SECRET "${AUTOPILOT_CRON_SECRET}" .env
fi

ADMIN_EMAIL="$(get_env_value ADMIN_EMAIL .env)"
if [[ -z "${ADMIN_EMAIL}" ]]; then
  ADMIN_EMAIL='admin@valuex.pro'
  set_env_value ADMIN_EMAIL "${ADMIN_EMAIL}" .env
fi
ADMIN_PASSWORD="$(get_env_value ADMIN_PASSWORD .env)"
ADMIN_PASSWORD_CHANGED=false
if [[ ${#ADMIN_PASSWORD} -lt 12 || "${ADMIN_PASSWORD}" == 'Admin2026!' ]]; then
  ADMIN_PASSWORD="$(random_secret)$(random_secret)"
  set_env_value ADMIN_PASSWORD "${ADMIN_PASSWORD}" .env
  ADMIN_PASSWORD_CHANGED=true
fi

POSTGRES_USER='tipster_user'
POSTGRES_DB='tipster_db'
POSTGRES_PASSWORD="$(get_env_value POSTGRES_PASSWORD .env)"
if [[ ! "${POSTGRES_PASSWORD}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  POSTGRES_PASSWORD="$(random_secret)"
  set_env_value POSTGRES_PASSWORD "${POSTGRES_PASSWORD}" .env
fi
set_env_value POSTGRES_USER "${POSTGRES_USER}" .env
set_env_value POSTGRES_DB "${POSTGRES_DB}" .env
DATABASE_HOST='127.0.0.1'
if [[ "${MODE}" == "docker" ]]; then
  DATABASE_HOST='postgres'
fi
set_env_value DATABASE_URL "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DATABASE_HOST}:5432/${POSTGRES_DB}" .env

NEXT_PUBLIC_SITE_URL="$(get_env_value NEXT_PUBLIC_SITE_URL .env)"
if [[ -z "${NEXT_PUBLIC_SITE_URL}" ]]; then
  set_env_value NEXT_PUBLIC_SITE_URL "http://${SERVER_IP}" .env
fi
sed -i 's/^TELEGRAM_BOT_TOKEN=.*replace_with.*/TELEGRAM_BOT_TOKEN=/' .env || true
sed -i 's/^YOOKASSA_SECRET_KEY=.*replace_with.*/YOOKASSA_SECRET_KEY=/' .env || true
chmod 600 .env

if [[ "${MODE}" == "docker" ]]; then
  # Не даём локальным секретам и production JSON попасть в build context или образ.
  cat > frontend/.dockerignore <<'EOF'
node_modules
.next
.data
.env
.env.*
*.tsbuildinfo
next-env.d.ts
npm-debug.log*
EOF
  echo "[4/6] Установка Docker и настройка зеркал Docker Hub для ДЦ в РФ..."
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi

  mkdir -p /etc/docker
  if [[ ! -f /etc/docker/daemon.json ]]; then
    cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://dockerhub.timeweb.cloud",
    "https://mirror.gcr.io",
    "https://huecker.io"
  ]
}
EOF
    systemctl daemon-reload
    systemctl restart docker
  fi

  echo "[5/6] Сборка и запуск контейнеров PostgreSQL + Web..."
  docker compose up -d --build
  POSTGRES_READY=false
  for attempt in $(seq 1 30); do
    if docker exec valuex_postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      POSTGRES_READY=true
      break
    fi
    sleep 1
  done
  if [[ "${POSTGRES_READY}" != true ]]; then
    echo "ОШИБКА: контейнер valuex_postgres не стал готов за 30 секунд; установка остановлена." >&2
    docker compose logs --tail=80 postgres >&2 || true
    exit 1
  fi
  docker exec valuex_postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "ALTER USER \"${POSTGRES_USER}\" WITH PASSWORD '${POSTGRES_PASSWORD}';"
else
  echo "[4/6] Установка PostgreSQL, Node.js 22 LTS и менеджера процессов PM2..."
  apt-get install -y postgresql postgresql-contrib

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
    if curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; then
      apt-get install -y nodejs
    else
      echo "NodeSource недоступен для текущей версии Ubuntu — ставим свежий Node.js и npm из штатного репозитория Ubuntu..."
      rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/sources.list.d/nodesource.sources || true
      apt-get update -y
      apt-get install -y nodejs npm
    fi
  fi

  if ! command -v npm >/dev/null 2>&1; then
    apt-get install -y npm
  fi

  npm install -g pm2 --no-audit --no-fund

  # Инициализация БД PostgreSQL с паролем, сгенерированным для этой установки
  systemctl enable --now postgresql
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='tipster_user'" | grep -q 1; then
    sudo -u postgres psql -c "ALTER USER tipster_user WITH PASSWORD '${POSTGRES_PASSWORD}';"
  else
    sudo -u postgres psql -c "CREATE USER tipster_user WITH PASSWORD '${POSTGRES_PASSWORD}';"
  fi
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='tipster_db'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE tipster_db OWNER tipster_user;"
  sudo -u postgres psql -d tipster_db -c "GRANT ALL ON SCHEMA public TO tipster_user;" >/dev/null 2>&1 || true
  sudo -u postgres psql -d tipster_db -f "${PROJECT_DIR}/database/schema.sql" >/dev/null 2>&1 || true

  echo "[5/6] Сборка фронтенда и серверного API Next.js..."
  cd "${PROJECT_DIR}/frontend"
  cp "${PROJECT_DIR}/.env" "${PROJECT_DIR}/frontend/.env.local"
  chmod 600 "${PROJECT_DIR}/frontend/.env.local"
  npm ci --no-audit --no-fund
  rm -rf .next
  NODE_OPTIONS="--max-old-space-size=1536" npm run build

  pm2 delete valuex-web >/dev/null 2>&1 || true
  pm2 start npm --name "valuex-web" -- run start
  pm2 save
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi

# 6. Настройка Nginx Reverse Proxy (порт 80 -> 127.0.0.1:3000) и открытие портов
echo "[6/6] Настройка Nginx Reverse Proxy и правил файрвола..."
cat > /etc/nginx/sites-available/valuex <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/valuex /etc/nginx/sites-enabled/valuex
nginx -t
systemctl enable --now nginx
systemctl reload nginx

ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true

# Настройка системного планировщика Cron (ИИ-Автопилот каждые 15 мин + ежедневный бэкап БД в 03:30)
chmod +x "${PROJECT_DIR}/deploy/"*.sh || true
if [[ -d /etc/cron.d ]]; then
  cat > /etc/cron.d/valuex-autopilot <<EOF
*/15 * * * * root CRON_SECRET="\$(sed -n 's/^AUTOPILOT_CRON_SECRET=//p' '${PROJECT_DIR}/.env' | tail -n 1)" && curl -fsS -H "Authorization: Bearer \${CRON_SECRET}" http://127.0.0.1:3000/api/v1/cron/autopilot >/dev/null 2>&1 || true
30 3 * * * root bash ${PROJECT_DIR}/deploy/backup-db.sh >/dev/null 2>&1 || true
EOF
  chmod 0644 /etc/cron.d/valuex-autopilot || true
fi

echo "Ожидание здорового состояния сервиса (/api/health)..."
HEALTH_FILE="$(mktemp)"
HEALTH_STATUS=''
for attempt in $(seq 1 30); do
  HEALTH_STATUS="$(curl --silent --show-error --max-time 5 -o "${HEALTH_FILE}" -w '%{http_code}' http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if [[ "${HEALTH_STATUS}" == '200' ]]; then
    break
  fi
  sleep 1
done
cat "${HEALTH_FILE}"
printf '\n'
rm -f "${HEALTH_FILE}"
if [[ "${HEALTH_STATUS}" != '200' ]]; then
  echo "ОШИБКА: сервис не прошёл /api/health (HTTP ${HEALTH_STATUS:-no-response}); проверьте логи приложения, PostgreSQL и production-секреты. Установка не отмечается как успешная." >&2
  exit 1
fi
echo ""

echo "=================================================================="
echo " ГОТОВО! Платформа успешно запущена на сервере Reg.ru Cloud!"
echo " Откройте в браузере: http://${SERVER_IP}"
echo ""
echo " Чтобы привязать ваш домен и включить бесплатный HTTPS (для ЮKassa):"
echo "   bash deploy/setup-domain-ssl.sh ваш-домен.ru ваш@email.ru"
if [[ "${ADMIN_PASSWORD_CHANGED}" == true ]]; then
  echo "Первичный вход: ${ADMIN_EMAIL}; случайный пароль (сохраните сейчас): ${ADMIN_PASSWORD}"
fi
echo "Секреты хранятся только в .env (права 600); не публикуйте этот файл."
echo "=================================================================="
