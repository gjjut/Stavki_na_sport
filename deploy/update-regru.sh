#!/usr/bin/env bash
# =============================================================================
# Скрипт быстрого обновления платформы VALUEX.PRO до актуальной версии
# Запуск на сервере Reg.ru:
#   cd /opt/Stavki_na_sport && git pull && bash deploy/update-regru.sh
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_IP="$(hostname -I | awk '{print $1}')"

echo "=================================================================="
echo " Обновление платформы VALUEX.PRO на сервере (${SERVER_IP})..."
echo "=================================================================="

cd "${PROJECT_DIR}"

# 1. Выдача полных прав пользователю PostgreSQL на схему public (для Ubuntu 24.04 / 26.04)
if command -v psql >/dev/null 2>&1; then
  sudo -u postgres psql -d tipster_db -c "GRANT ALL ON SCHEMA public TO tipster_user;" >/dev/null 2>&1 || true
fi

# 2. Актуализация переменных окружения для фронтенда/API
ENV_FILE="${PROJECT_DIR}/frontend/.env.local"
if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${PROJECT_DIR}/.env.example" "${ENV_FILE}"
fi

if ! grep -q '^SESSION_SECRET=' "${ENV_FILE}"; then
  RAND_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  echo "SESSION_SECRET=${RAND_SECRET}" >> "${ENV_FILE}"
fi

if ! grep -q '^DATABASE_URL=' "${ENV_FILE}"; then
  echo "DATABASE_URL=postgresql://tipster_user:strong_postgres_password@127.0.0.1:5432/tipster_db" >> "${ENV_FILE}"
fi

# Очищаем устаревшие демо-заглушки из старого .env, если они остались с v1
sed -i 's/^TELEGRAM_BOT_TOKEN=.*replace_with.*/TELEGRAM_BOT_TOKEN=/' "${ENV_FILE}" || true
sed -i 's/^YOOKASSA_SECRET_KEY=.*replace_with.*/YOOKASSA_SECRET_KEY=/' "${ENV_FILE}" || true

# 3. Установка новых пакетов (pg), чистая сборка и перезапуск PM2
cd "${PROJECT_DIR}/frontend"
npm install --no-audit --no-fund
rm -rf .next
NODE_OPTIONS="--max-old-space-size=1536" npm run build

pm2 restart valuex-web || pm2 start npm --name "valuex-web" -- run start
pm2 save

echo "=================================================================="
echo " ГОТОВО! Обновленная коммерческая версия v2 активна!"
echo " Витрина сайта:  http://${SERVER_IP}"
echo " Вход в админку: http://${SERVER_IP}/login"
echo "   Логин:  admin@valuex.pro"
echo "   Пароль: Admin2026! (рекомендуем сменить в /admin -> Настройки)"
echo "=================================================================="
