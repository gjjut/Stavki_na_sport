#!/usr/bin/env bash
# =============================================================================
# Привязка домена и выпуск бесплатного HTTPS SSL (Let's Encrypt) для ЮKassa.
# Запуск: bash deploy/setup-domain-ssl.sh ваш-домен.ru [ваш-email@mail.ru]
# Поддерживаются PM2 и Docker Compose; режим определяется по контейнеру valuex_web.
# =============================================================================

set -euo pipefail
umask 077

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [[ -z "${DOMAIN}" ]]; then
  echo "Использование: bash deploy/setup-domain-ssl.sh ваш-домен.ru [ваш-email@mail.ru]" >&2
  exit 2
fi

# Убираем http(s)://, путь и www, если передали полную ссылку.
DOMAIN="$(printf '%s' "${DOMAIN}" | sed -E 's#^https?://##; s#/.*$##; s#^www\.##' | tr '[:upper:]' '[:lower:]')"
if [[ ${#DOMAIN} -gt 253 || ! "${DOMAIN}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ || "${DOMAIN}" != *.* || "${DOMAIN}" == *..* ]]; then
  echo "ОШИБКА: укажите корректное доменное имя, например example.ru." >&2
  exit 2
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="${PROJECT_DIR}/.env"
FRONTEND_ENV="${PROJECT_DIR}/frontend/.env.local"
DEPLOY_MODE='pm2'
if command -v docker >/dev/null 2>&1 && {
  docker inspect valuex_web >/dev/null 2>&1 ||
    docker inspect valuex_postgres >/dev/null 2>&1
}; then
  if ! docker compose version >/dev/null 2>&1; then
    echo "ОШИБКА: обнаружен Docker-контейнер, но Docker Compose v2 недоступен." >&2
    exit 1
  fi
  DEPLOY_MODE='docker'
  ENV_FILE="${ROOT_ENV}"
  if [[ ! -f "${ENV_FILE}" && -f "${FRONTEND_ENV}" ]]; then
    cp "${FRONTEND_ENV}" "${ENV_FILE}"
  fi
else
  ENV_FILE="${FRONTEND_ENV}"
  if [[ ! -f "${ENV_FILE}" && -f "${ROOT_ENV}" ]]; then
    cp "${ROOT_ENV}" "${ENV_FILE}"
  fi
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ОШИБКА: не найден файл окружения ${ENV_FILE}. Сначала выполните установку или обновление." >&2
  exit 1
fi

echo "=================================================================="
echo " Привязка домена ${DOMAIN} и выпуск бесплатного HTTPS сертификата"
echo " Режим приложения: ${DEPLOY_MODE}"
echo "=================================================================="

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

# 1. Настройка Nginx для основного домена и www.
cat > /etc/nginx/sites-available/valuex <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/valuex /etc/nginx/sites-enabled/valuex
nginx -t
systemctl enable --now nginx
systemctl reload nginx
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true

# 2. Выпуск сертификата Let's Encrypt с перенаправлением HTTP -> HTTPS.
CERTBOT_EMAIL_ARGS=("--register-unsafely-without-email")
if [[ -n "${EMAIL}" ]]; then
  CERTBOT_EMAIL_ARGS=("--email" "${EMAIL}")
fi
if host "www.${DOMAIN}" >/dev/null 2>&1 || getent hosts "www.${DOMAIN}" >/dev/null 2>&1; then
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos "${CERTBOT_EMAIL_ARGS[@]}" --redirect
else
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos "${CERTBOT_EMAIL_ARGS[@]}" --redirect
fi
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

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

if [[ "${DEPLOY_MODE}" == 'pm2' && -f "${ROOT_ENV}" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      current="$(sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1)"
      if [[ -z "${current}" && -n "${value}" ]]; then
        set_env_value "${key}" "${value}" "${ENV_FILE}"
      fi
    fi
  done < "${ROOT_ENV}"
fi

# PM2 запускает Next.js из frontend/.env.local, Docker Compose — из корневого .env.
set_env_value NEXT_PUBLIC_SITE_URL "https://${DOMAIN}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
if [[ "${DEPLOY_MODE}" == 'pm2' ]]; then
  cp "${ENV_FILE}" "${ROOT_ENV}"
  chmod 600 "${ROOT_ENV}"
fi

# 3. Пересборка и перезапуск нужного режима, затем production healthcheck.
if [[ "${DEPLOY_MODE}" == 'docker' ]]; then
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
  cd "${PROJECT_DIR}"
  docker compose up -d --build web
else
  cd "${PROJECT_DIR}/frontend"
  NODE_OPTIONS="--max-old-space-size=1536" npm run build
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart valuex-web --update-env || pm2 start npm --name "valuex-web" -- run start
    pm2 save
  else
    echo "ОШИБКА: PM2 не установлен; сборка прошла, но приложение не перезапущено." >&2
    exit 1
  fi
fi

HEALTH_FILE="$(mktemp)"
HEALTH_STATUS=''
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
  echo "ОШИБКА: сайт доступен не в здоровом production-состоянии (HTTP ${HEALTH_STATUS:-no-response})." >&2
  if [[ "${DEPLOY_MODE}" == 'docker' ]]; then
    docker compose logs --tail=100 web >&2 || true
  else
    pm2 logs valuex-web --lines 100 --nostream >&2 || true
  fi
  exit 1
fi

echo "=================================================================="
echo " ГОТОВО! Сайт работает по защищенному адресу: https://${DOMAIN}"
echo ""
echo " Адрес HTTP-уведомлений (Webhook) для личного кабинета ЮKassa:"
echo "   https://${DOMAIN}/api/v1/webhooks/yookassa"
echo ""
echo " SSL-сертификат продлевается автоматически (certbot.timer)."
echo " Production env: ${ENV_FILE} (права 600)."
echo "=================================================================="
