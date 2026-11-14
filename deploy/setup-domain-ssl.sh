#!/usr/bin/env bash
# =============================================================================
# Автопривязка домена + выпуск бесплатного HTTPS SSL (Let's Encrypt) для ЮKassa
# Запуск на сервере Reg.ru (предварительно направьте A-запись домена на IP сервера):
#   bash deploy/setup-domain-ssl.sh ваш-домен.ru [ваш-email@mail.ru]
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "${DOMAIN}" ]]; then
  echo "Использование: bash deploy/setup-domain-ssl.sh ваш-домен.ru [ваш-email@mail.ru]"
  exit 1
fi

# Убираем http(s):// и слэши, если пользователь скопировал полную ссылку
DOMAIN="$(echo "${DOMAIN}" | sed -E 's#^https?://##; s#/.*$##; s#^www\.##' | tr '[:upper:]' '[:lower:]')"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=================================================================="
echo " Привязка домена ${DOMAIN} и выпуск бесплатного HTTPS сертификата"
echo "=================================================================="

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

# 1. Конфигурация Nginx для основного домена и www
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

# 2. Выпуск SSL-сертификата Let's Encrypt с автоперенаправлением HTTP -> HTTPS
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

# 3. Обновление NEXT_PUBLIC_SITE_URL для корректных ссылок ЮKassa и картинок в Telegram
for ENV_TARGET in "${PROJECT_DIR}/.env" "${PROJECT_DIR}/frontend/.env.local"; do
  if [[ -f "${ENV_TARGET}" ]]; then
    sed -i '/^NEXT_PUBLIC_SITE_URL=/d' "${ENV_TARGET}" || true
    echo "NEXT_PUBLIC_SITE_URL=https://${DOMAIN}" >> "${ENV_TARGET}"
  fi
done

# 4. Пересборка и мягкий перезапуск приложения с HTTPS URL
cd "${PROJECT_DIR}/frontend"
NODE_OPTIONS="--max-old-space-size=1536" npm run build
pm2 restart valuex-web --update-env || pm2 start npm --name "valuex-web" -- run start
pm2 save

echo "=================================================================="
echo " ГОТОВО! Сайт работает по защищенному адресу: https://${DOMAIN}"
echo ""
echo " Адрес HTTP-уведомлений (Webhook) для личного кабинета ЮKassa:"
echo "   https://${DOMAIN}/api/v1/webhooks/yookassa"
echo ""
echo " SSL-сертификат продлевается автоматически (certbot.timer)."
echo "=================================================================="
