#!/usr/bin/env bash
# =============================================================================
# Мобильный пульт управления сервером VALUEX для Termius (Android / iOS)
# Вызов в терминале одной командой: valuex
# Режимы без меню:
#   bash deploy/termius.sh start    — быстрый запуск всех служб за 3 сек
#   bash deploy/termius.sh smart    — умный старт (обновит и соберет, если вышли обновления)
#   bash deploy/termius.sh update   — принудительное обновление с GitHub и пересборка
#   bash deploy/termius.sh status   — проверка здоровья сервера
# =============================================================================

set -euo pipefail

PROJECT_DIR="/opt/Stavki_na_sport"
if [[ ! -d "${PROJECT_DIR}" ]]; then
  PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

BRANCH="arena/57277631-stavki-na-sport"
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo '194.67.125.155')"
ENV_FILE="${PROJECT_DIR}/frontend/.env.local"

ensure_base_services() {
  systemctl start postgresql >/dev/null 2>&1 || true
  systemctl start nginx >/dev/null 2>&1 || true
  systemctl start cron >/dev/null 2>&1 || true
}

fast_start() {
  echo "🚀 Запуск служб PostgreSQL + Nginx + PM2..."
  ensure_base_services
  cd "${PROJECT_DIR}/frontend"
  if [[ ! -d ".next" ]]; then
    echo "📦 Сборка не найдена — запускаю первичную сборку..."
    bash "${PROJECT_DIR}/deploy/update-regru.sh"
    return
  fi
  pm2 resurrect >/dev/null 2>&1 || true
  if pm2 describe valuex-web >/dev/null 2>&1; then
    pm2 restart valuex-web --update-env
  else
    pm2 start npm --name "valuex-web" -- run start
  fi
  pm2 save >/dev/null 2>&1 || true
  sleep 2
  print_status
}

smart_start() {
  echo "⚡ Умная проверка сервера VALUEX (${SERVER_IP})..."
  ensure_base_services
  cd "${PROJECT_DIR}"

  git fetch origin "${BRANCH}" >/dev/null 2>&1 || git fetch --all >/dev/null 2>&1 || true
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  if [[ "${CURRENT_BRANCH}" != "${BRANCH}" ]]; then
    git checkout "${BRANCH}" >/dev/null 2>&1 || git checkout -b "${BRANCH}" "origin/${BRANCH}" >/dev/null 2>&1 || true
  fi

  LOCAL_HASH="$(git rev-parse HEAD 2>/dev/null || echo 'none')"
  REMOTE_HASH="$(git rev-parse "origin/${BRANCH}" 2>/dev/null || echo "${LOCAL_HASH}")"

  if [[ "${LOCAL_HASH}" != "${REMOTE_HASH}" ]] || [[ ! -d "${PROJECT_DIR}/frontend/.next" ]]; then
    echo "🔄 Найдено обновление на GitHub (${LOCAL_HASH:0:7} -> ${REMOTE_HASH:0:7}) — обновляю..."
    git pull --ff-only origin "${BRANCH}" || git reset --hard "origin/${BRANCH}"
    bash "${PROJECT_DIR}/deploy/update-regru.sh"
  else
    echo "✅ Код уже актуален (${LOCAL_HASH:0:7}) — быстрый старт без пересборки!"
    fast_start
  fi
}

full_update() {
  echo "🔄 Полное обновление с ветки ${BRANCH}..."
  ensure_base_services
  cd "${PROJECT_DIR}"
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}" 2>/dev/null || git checkout -b "${BRANCH}" "origin/${BRANCH}"
  git pull --ff-only origin "${BRANCH}" || git reset --hard "origin/${BRANCH}"
  bash "${PROJECT_DIR}/deploy/update-regru.sh"
}

set_plusvibe_key() {
  echo ""
  read -r -p "Вставьте ключ PlusVibeAPI (sk-pv-...): " PV_KEY
  PV_KEY="$(echo "${PV_KEY}" | tr -d '[:space:]')"
  if [[ -z "${PV_KEY}" ]]; then
    echo "❌ Ключ пустой — отменено."
    return
  fi
  mkdir -p "$(dirname "${ENV_FILE}")"
  touch "${ENV_FILE}"
  grep -v '^PLUSVIBE_' "${ENV_FILE}" > "${ENV_FILE}.tmp" || true
  mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  cat >> "${ENV_FILE}" <<EOF
PLUSVIBE_API_KEY=${PV_KEY}
PLUSVIBE_BASE_URL=https://plusvibeapi.ru/v1
PLUSVIBE_MODEL=deepseek-v4.1-flash-1017
EOF
  cd "${PROJECT_DIR}/frontend"
  pm2 restart valuex-web --update-env || pm2 start npm --name "valuex-web" -- run start
  pm2 save >/dev/null 2>&1 || true
  echo "✅ Ключ PlusVibeAPI сохранен и применен!"
}

print_status() {
  echo "------------------------------------------"
  echo "🌐 Сервер:   http://${SERVER_IP}"
  echo "🔐 Админка:  http://${SERVER_IP}/admin"
  echo "📱 TG-апп:   http://${SERVER_IP}/tg-app"
  PG_STATE="$(systemctl is-active postgresql 2>/dev/null || echo 'unknown')"
  NG_STATE="$(systemctl is-active nginx 2>/dev/null || echo 'unknown')"
  RAM_INFO="$(free -m 2>/dev/null | awk '/Mem:/ {printf "%s/%s MB", $3, $2}' || echo 'n/a')"
  echo "🗄  Postgres: ${PG_STATE} | Nginx: ${NG_STATE} | RAM: ${RAM_INFO}"
  if curl -fsS --max-time 4 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "✅ Сайт ОТВЕЧАЕТ (HTTP 200 OK на порту 3000)"
  else
    echo "⚠️  Порт 3000 еще запускается или остановлен"
  fi
  echo "------------------------------------------"
}

ACTION="${1:-menu}"
case "${ACTION}" in
  start)  fast_start; exit 0 ;;
  smart)  smart_start; exit 0 ;;
  update) full_update; exit 0 ;;
  status) print_status; exit 0 ;;
esac

while true; do
  echo ""
  echo "====== ПУЛЬТ VALUEX (Termius) ======"
  print_status
  echo "1) 🚀 Быстрый запуск / рестарт (3 сек)"
  echo "2) 🔄 Обновить с GitHub + пересобрать"
  echo "3) 🔑 Вставить ключ PlusVibeAPI (sk-pv-...)"
  echo "4) 🤖 Запустить волну ИИ-автопилота сейчас"
  echo "5) 📜 Показать последние 35 строк логов"
  echo "6) 🧹 Очистить кэш эмблем команд"
  echo "0) Выход"
  echo "===================================="
  read -r -p "Выберите цифру [0-6]: " CHOICE
  case "${CHOICE}" in
    1) fast_start ;;
    2) full_update ;;
    3) set_plusvibe_key ;;
    4)
      echo "🤖 Запускаю цикл ИИ-автопилота..."
      curl -fsS http://127.0.0.1:3000/api/v1/cron/autopilot && echo "" || echo "Ошибка вызова"
      ;;
    5) pm2 logs valuex-web --lines 35 --nostream ;;
    6)
      rm -rf "${PROJECT_DIR}/frontend/.data/logo-cache"
      echo "✅ Кэш эмблем очищен — подтянутся заново при открытии страниц."
      ;;
    0) exit 0 ;;
    *) echo "Введите цифру от 0 до 6" ;;
  esac
done
