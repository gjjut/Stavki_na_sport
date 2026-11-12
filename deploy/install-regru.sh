#!/usr/bin/env bash
# =============================================================================
# Скрипт автоматического развертывания платформы VALUEX.PRO на Reg.ru Cloud
# ОС: Ubuntu 22.04 / 24.04 LTS (под пользователем root)
# Использование:
#   bash deploy/install-regru.sh            # Надежный режим для РФ: Node 22 + PM2 + PostgreSQL + Nginx
#   bash deploy/install-regru.sh --docker   # Режим Docker Compose (с автонастройкой зеркал Docker Hub для РФ)
# =============================================================================

set -euo pipefail

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

# 2. Установка базовых системных пакетов, Nginx и Certbot
echo "[2/6] Обновление пакетов и установка Nginx + Certbot..."
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt-get update -y
apt-get install -y sudo curl git ca-certificates gnupg ufw nginx certbot python3-certbot-nginx

# 3. Подготовка .env файла, если еще не создан
cd "${PROJECT_DIR}"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[3/6] Создан файл .env из шаблона .env.example"
fi

if [[ "${MODE}" == "docker" ]]; then
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

  echo "[5/6] Сборка и запуск контейнеров PostgreSQL + Redis + Web..."
  docker compose up -d --build
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

  npm install -g pm2 --no-audit --no-fund

  # Инициализация БД PostgreSQL и накат схемы database/schema.sql
  systemctl enable --now postgresql
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='tipster_user'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER tipster_user WITH PASSWORD 'strong_postgres_password';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='tipster_db'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE tipster_db OWNER tipster_user;"
  sudo -u postgres psql -d tipster_db -f "${PROJECT_DIR}/database/schema.sql" >/dev/null 2>&1 || true

  echo "[5/6] Сборка фронтенда и серверного API Next.js..."
  cd "${PROJECT_DIR}/frontend"
  cp "${PROJECT_DIR}/.env" "${PROJECT_DIR}/frontend/.env.local" || true
  npm ci --no-audit --no-fund
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

echo "=================================================================="
echo " ГОТОВО! Платформа успешно запущена на сервере Reg.ru Cloud!"
echo " Откройте в браузере: http://${SERVER_IP}"
echo ""
echo " Чтобы привязать домен и включить бесплатный HTTPS (для ЮKassa):"
echo "   sed -i 's/server_name _;/server_name ваш-домен.ру www.ваш-домен.ру;/' /etc/nginx/sites-available/valuex"
echo "   nginx -t && systemctl reload nginx"
echo "   certbot --nginx -d ваш-домен.ру -d www.ваш-домен.ру"
echo "=================================================================="
