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
umask 077

PROJECT_DIR="/opt/Stavki_na_sport"
if [[ ! -d "${PROJECT_DIR}" ]]; then
  PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
ROOT_ENV="${PROJECT_DIR}/.env"
ENV_FILE="${PROJECT_DIR}/frontend/.env.local"

using_docker() {
  command -v docker >/dev/null 2>&1 && docker inspect valuex_web >/dev/null 2>&1
}

# Updating a checkout with local edits, an unknown upstream, or divergent
# history must stop rather than switch branches or erase work.
check_update_checkout() {
  cd "${PROJECT_DIR}"
  if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    echo "ОШИБКА: есть локальные или неотслеживаемые изменения. Сохраните их и выполните обновление вручную." >&2
    return 1
  fi
  if ! git symbolic-ref --quiet --short HEAD >/dev/null || ! git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    echo "ОШИБКА: текущей ветке не настроен upstream. Никаких веток автоматически не переключаем." >&2
    return 1
  fi
}

update_current_branch() {
  check_update_checkout
  local branch upstream
  branch="$(git symbolic-ref --short HEAD)"
  upstream="$(git rev-parse --abbrev-ref '@{upstream}')"
  echo "🔄 Проверяю текущую ветку ${branch} и ${upstream}..."
  git fetch --quiet
  if ! git merge-base --is-ancestor HEAD '@{upstream}'; then
    echo "ОШИБКА: ветки разошлись или локальная ветка опережает upstream; данные не изменены." >&2
    return 1
  fi
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse '@{upstream}')" ]]; then
    echo "Сначала создаётся резервная копия. Проверьте возможность её восстановления."
    bash "${PROJECT_DIR}/deploy/backup-db.sh"
    git pull --ff-only
    bash "${PROJECT_DIR}/deploy/update-regru.sh"
  else
    echo "✅ Текущая ветка уже актуальна."
    fast_start
  fi
}

ensure_base_services() {
  systemctl start postgresql >/dev/null 2>&1 || true
  systemctl start nginx >/dev/null 2>&1 || true
  systemctl start cron >/dev/null 2>&1 || true
}

fast_start() {
  if using_docker; then
    echo "🚀 Запуск Docker Compose..."
    cd "${PROJECT_DIR}"
    docker compose up -d
    print_status
    return
  fi
  echo "🚀 Запуск служб PostgreSQL + Nginx + PM2..."
  ensure_base_services
  cd "${PROJECT_DIR}/frontend"
  if [[ ! -d ".next" ]]; then
    echo "📦 Сборка не найдена. Перед обновлением конфигурации создаю резервную копию."
    bash "${PROJECT_DIR}/deploy/backup-db.sh"
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
  echo "⚡ Проверка сервера VALUEX (${SERVER_IP:-адрес не определён})..."
  update_current_branch
}

full_update() {
  update_current_branch
}

set_plusvibe_key() {
  local key env_file temp
  echo ""
  read -r -s -p "Вставьте ключ PlusVibeAPI (ввод скрыт): " key
  echo ""
  key="$(printf '%s' "${key}" | tr -d '[:space:]')"
  if [[ ! "${key}" =~ ^sk-pv-[A-Za-z0-9_-]+$ ]]; then
    echo "❌ Формат ключа не распознан — изменения отменены." >&2
    return 1
  fi
  env_file="${ENV_FILE}"
  if using_docker; then env_file="${ROOT_ENV}"; fi
  mkdir -p "$(dirname "${env_file}")"
  touch "${env_file}"
  temp="$(mktemp "${env_file}.XXXXXX")"
  awk '!/^PLUSVIBE_API_KEY=/' "${env_file}" > "${temp}"
  printf 'PLUSVIBE_API_KEY=%s\n' "${key}" >> "${temp}"
  chmod 600 "${temp}"
  mv "${temp}" "${env_file}"
  unset key
  if using_docker; then
    cd "${PROJECT_DIR}"
    docker compose up -d web
  else
    cd "${PROJECT_DIR}/frontend"
    pm2 restart valuex-web --update-env || pm2 start npm --name "valuex-web" -- run start
    pm2 save >/dev/null 2>&1 || true
  fi
  echo "✅ Ключ сохранён. Настройки провайдера, сохранённые в админке, могут иметь приоритет."
}

print_status() {
  local site_url=''
  if [[ -f "${ENV_FILE}" ]]; then site_url="$(sed -n 's/^NEXT_PUBLIC_SITE_URL=//p' "${ENV_FILE}" | tail -n 1)"; fi
  if using_docker && [[ -f "${ROOT_ENV}" ]]; then site_url="$(sed -n 's/^NEXT_PUBLIC_SITE_URL=//p' "${ROOT_ENV}" | tail -n 1)"; fi
  echo "------------------------------------------"
  if [[ "${site_url}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?/?$ ]]; then
    site_url="${site_url%/}"
    echo "🌐 Сервер:   ${site_url}"
    echo "🔐 Админка:  ${site_url}/admin"
    echo "📱 TG-апп:   ${site_url}/tg-app"
  else
    echo "⚠️  HTTPS-домен не настроен. Не вводите пароли и персональные данные по HTTP."
  fi
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
      CRON_SECRET=''
      if [[ -f "${ROOT_ENV}" ]]; then CRON_SECRET="$(sed -n 's/^AUTOPILOT_CRON_SECRET=//p' "${ROOT_ENV}" | tail -n 1)"; fi
      if [[ ${#CRON_SECRET} -lt 32 ]]; then
        echo "Секрет расписания не настроен в корневом .env."
      else
        curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3000/api/v1/cron/autopilot && echo "" || echo "Ошибка вызова"
      fi
      unset CRON_SECRET
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
