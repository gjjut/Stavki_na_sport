#!/usr/bin/env bash
# =============================================================================
# Безопасная подготовка нового IPv4-домена и HTTPS на существующем Nginx.
#
# 1) sudo bash deploy/setup-domain-ssl.sh prepare predictlab.ru [--www]
# 2) sudo bash deploy/setup-domain-ssl.sh issue predictlab.ru EMAIL PUBLIC_IPV4 [--www]
#
# Сначала прочитайте deploy/PREDICTLAB-DOMAIN-SSL.md. Скрипт не меняет .env,
# приложение, firewall или существующие сайты. Для IPv6/CDN/балансировщика
# нужна отдельная настройка; www включается только явным --www на обоих шагах.
# =============================================================================
set -euo pipefail
umask 077

NGINX_ROOT='/etc/nginx'
ACME_ROOT='/var/www/predictlab-acme'
LETSENCRYPT_ROOT='/etc/letsencrypt'
LOCK_DIR='/run/lock'

usage() {
  cat >&2 <<'EOF'
Использование:
  sudo bash deploy/setup-domain-ssl.sh prepare predictlab.ru [--www]
  sudo bash deploy/setup-domain-ssl.sh issue predictlab.ru EMAIL PUBLIC_IPV4 [--www]
Сначала прочитайте deploy/PREDICTLAB-DOMAIN-SSL.md и сделайте резервную копию.
EOF
  exit 2
}
die() { echo "ОШИБКА: $*" >&2; exit 1; }

MODE="${1:-}"
case "$MODE" in
  prepare)
    [[ $# -ge 2 && $# -le 3 ]] || usage
    DOMAIN="${2,,}"
    FLAG="${3:-}"
    ;;
  issue)
    [[ $# -ge 4 && $# -le 5 ]] || usage
    DOMAIN="${2,,}"
    EMAIL="$3"
    PUBLIC_IPV4="$4"
    FLAG="${5:-}"
    ;;
  *) usage ;;
esac
[[ -z "$FLAG" || "$FLAG" == '--www' ]] || usage
WITH_WWW=false
[[ "$FLAG" == '--www' ]] && WITH_WWW=true

# Only plain DNS labels are accepted; they are interpolated into nginx config.
if [[ ${#DOMAIN} -gt 200 || "$DOMAIN" != *.* || "$DOMAIN" == www.* || "$DOMAIN" == *..* || "$DOMAIN" == *. ]]; then
  die 'Укажите основное имя домена без www, схемы и пути, например predictlab.ru.'
fi
IFS='.' read -r -a labels <<< "$DOMAIN"
for label in "${labels[@]}"; do
  [[ ${#label} -le 63 && "$label" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || die 'Некорректное доменное имя.'
done
[[ "${labels[${#labels[@]}-1]}" =~ [a-z] ]] || die 'Укажите доменное имя, не IP-адрес.'

valid_ipv4() {
  local ip="$1" part
  local -a parts
  [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r -a parts <<< "$ip"
  for part in "${parts[@]}"; do
    [[ "$part" == '0' || "$part" != 0* ]] || return 1
    (( 10#$part <= 255 )) || return 1
  done
}
if [[ "$MODE" == 'issue' ]]; then
  [[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die 'Укажите действующий email для уведомлений Certbot.'
  valid_ipv4 "$PUBLIC_IPV4" || die 'Укажите публичный IPv4 сервера из панели хостинга.'
fi
(( EUID == 0 )) || die 'Запустите от root через sudo.'
for command in nginx systemctl curl flock; do
  command -v "$command" >/dev/null 2>&1 || die "Не найдена команда $command. См. инструкцию."
done
if [[ "$MODE" == 'issue' ]]; then
  for command in dig certbot; do command -v "$command" >/dev/null 2>&1 || die "Не найдена команда $command. См. инструкцию."; done
fi
[[ -d "$NGINX_ROOT/sites-available" && -d "$NGINX_ROOT/sites-enabled" ]] || die 'Ожидалась стандартная структура Nginx Ubuntu sites-available/sites-enabled.'
systemctl is-active --quiet nginx || die 'Nginx не запущен. Сначала разберитесь с текущим сервером.'

mkdir -p "$LOCK_DIR"
exec 9>"$LOCK_DIR/predictlab-domain-${DOMAIN}.lock"
flock -n 9 || die "Настройка ${DOMAIN} уже выполняется в другом процессе."

AVAILABLE="$NGINX_ROOT/sites-available/${DOMAIN}.conf"
ENABLED="$NGINX_ROOT/sites-enabled/${DOMAIN}.conf"
CERT_DIR="$LETSENCRYPT_ROOT/live/$DOMAIN"
RENEWAL_FILE="$LETSENCRYPT_ROOT/renewal/${DOMAIN}.conf"
HOOK="$LETSENCRYPT_ROOT/renewal-hooks/deploy/${DOMAIN}-reload-nginx"
NAMES="$DOMAIN"
$WITH_WWW && NAMES="$DOMAIN www.$DOMAIN"

TMP_DIR="$(mktemp -d)"
HTTP_TEMPLATE="$TMP_DIR/http.conf"
TLS_TEMPLATE="$TMP_DIR/https.conf"
HOOK_TEMPLATE="$TMP_DIR/reload-hook"
PROBE_FILE=''
CONFIG_TEMP=''
CREATED_FILE=false
CREATED_LINK=false
CREATED_HOOK=false
SITE_MODIFIED=false
RELOAD_ATTEMPTED=false
COMMITTED=false

# Until HTTPS is ready, never serve the application over plain HTTP.
cat > "$HTTP_TEMPLATE" <<EOF
# Managed by setup-domain-ssl.sh: HTTP-01 preparation for ${DOMAIN}.
server {
    listen 80;
    server_name ${NAMES};
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 503; }
}
EOF

nginx_check() {
  if ! nginx -t >"$TMP_DIR/nginx-check.log" 2>&1; then
    cat "$TMP_DIR/nginx-check.log" >&2
    return 1
  fi
  if grep -qi 'conflicting server name' "$TMP_DIR/nginx-check.log"; then
    cat "$TMP_DIR/nginx-check.log" >&2
    echo 'Обнаружен конфликт имени сайта в Nginx.' >&2
    return 1
  fi
}

cleanup() {
  local result=$?
  trap - EXIT
  set +e
  [[ -z "$PROBE_FILE" ]] || rm -f -- "$PROBE_FILE"
  [[ -z "$CONFIG_TEMP" ]] || rm -f -- "$CONFIG_TEMP"
  if (( result != 0 )) && ! $COMMITTED; then
    local restored=true
    if [[ "$MODE" == 'prepare' ]]; then
      if $CREATED_LINK; then
        if [[ -L "$ENABLED" && "$(readlink "$ENABLED")" == "$AVAILABLE" ]]; then
          rm -f -- "$ENABLED"
        else
          restored=false
          echo "ПРЕДУПРЕЖДЕНИЕ: ссылка $ENABLED изменилась; не удалена." >&2
        fi
      fi
      if $CREATED_FILE; then
        if cmp -s "$HTTP_TEMPLATE" "$AVAILABLE"; then
          rm -f -- "$AVAILABLE"
        else
          restored=false
          echo "ПРЕДУПРЕЖДЕНИЕ: $AVAILABLE изменился; не удалён." >&2
        fi
      fi
    elif $SITE_MODIFIED; then
      if cmp -s "$HTTP_TEMPLATE" "$AVAILABLE"; then
        : # The atomic replacement did not happen.
      elif cmp -s "$TLS_TEMPLATE" "$AVAILABLE"; then
        local rollback_temp
        rollback_temp="$(mktemp "$NGINX_ROOT/sites-available/.${DOMAIN}.rollback.XXXXXXXX")"
        if [[ -z "$rollback_temp" ]] || ! install -m 644 "$HTTP_TEMPLATE" "$rollback_temp" || ! mv -f -- "$rollback_temp" "$AVAILABLE"; then
          [[ -z "$rollback_temp" ]] || rm -f -- "$rollback_temp"
          restored=false
        fi
      else
        restored=false
        echo "ПРЕДУПРЕЖДЕНИЕ: $AVAILABLE изменился; автоматический откат не выполнен." >&2
      fi
    fi
    if $CREATED_HOOK; then
      if cmp -s "$HOOK_TEMPLATE" "$HOOK"; then rm -f -- "$HOOK"; else restored=false; fi
    fi
    if $RELOAD_ATTEMPTED && $restored; then
      if nginx_check && systemctl reload nginx; then
        echo 'Изменение нового сайта отменено; предыдущая конфигурация Nginx перезагружена.' >&2
      else
        echo 'ПРЕДУПРЕЖДЕНИЕ: не удалось перезагрузить прежнюю конфигурацию Nginx. Проверьте nginx -t и systemctl status nginx.' >&2
      fi
    fi
    if [[ "$MODE" == 'issue' && ( -e "$CERT_DIR" || -e "$RENEWAL_FILE" ) ]]; then
      echo "Сертификат или запись продления уже могли быть созданы. Проверьте certbot certificates и инструкцию; не запускайте выпуск повторно вслепую." >&2
    fi
  fi
  rm -rf -- "$TMP_DIR"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

probe_http_challenge() {
  if [[ ! -d "$ACME_ROOT/.well-known/acme-challenge" ]]; then
    install -d -m 755 "$ACME_ROOT/.well-known/acme-challenge"
  fi
  PROBE_FILE="$(mktemp "$ACME_ROOT/.well-known/acme-challenge/predictlab-probe-XXXXXXXX")"
  local token host response attempt passed
  token="$(basename "$PROBE_FILE")"
  printf '%s\n' "$token" > "$PROBE_FILE"
  chmod 644 "$PROBE_FILE"
  local -a hosts=("$DOMAIN")
  $WITH_WWW && hosts+=("www.$DOMAIN")
  for host in "${hosts[@]}"; do
    passed=false
    # nginx -s reload is asynchronous; old workers may briefly answer first.
    for attempt in {1..10}; do
      if response="$(curl --noproxy '*' -fsS --max-time 10 --resolve "${host}:80:127.0.0.1" "http://${host}/.well-known/acme-challenge/${token}" 2>/dev/null)" && [[ "$response" == "$token" ]]; then
        passed=true
        break
      fi
      sleep 1
    done
    $passed || die "Локальная проверка HTTP-01 для ${host} не прошла: проверьте порядок и конфликты сайтов Nginx."
  done
  rm -f -- "$PROBE_FILE"
  PROBE_FILE=''
}

nginx_check || die 'Исходная конфигурация Nginx не прошла проверку.'

if [[ "$MODE" == 'prepare' ]]; then
  # Be conservative: even a mention elsewhere may represent an existing vhost,
  # certificate or proxy rule. Review it manually instead of taking over a name.
  nginx -T >"$TMP_DIR/nginx-dump" 2>"$TMP_DIR/nginx-dump-errors" || die 'Не удалось прочитать конфигурацию Nginx.'
  if grep -Fiq -- "$DOMAIN" "$TMP_DIR/nginx-dump"; then
    die "${DOMAIN} уже упоминается в действующей конфигурации Nginx. Проверьте её вручную; ничего не перезаписано."
  fi
  if [[ -e "$AVAILABLE" || -L "$AVAILABLE" || -e "$ENABLED" || -L "$ENABLED" ]]; then
    die 'Файл или ссылка сайта уже существуют. Не перезаписываю их.'
  fi
  if [[ -e "$CERT_DIR" || -L "$CERT_DIR" || -e "$RENEWAL_FILE" || -L "$RENEWAL_FILE" || -e "$HOOK" || -L "$HOOK" ]]; then
    die 'Для этого имени уже есть сертификат или hook Certbot. Разберите существующую конфигурацию вручную.'
  fi
  # noclobber and a plain symlink: never replace an existing site.
  ( set -o noclobber; cat "$HTTP_TEMPLATE" > "$AVAILABLE" ) || die 'Не удалось безопасно создать файл нового сайта.'
  CREATED_FILE=true
  chmod 644 "$AVAILABLE"
  ln -s "$AVAILABLE" "$ENABLED" || die 'Не удалось создать ссылку нового сайта.'
  CREATED_LINK=true
  nginx_check || die 'Новая HTTP-конфигурация не прошла проверку Nginx.'
  RELOAD_ATTEMPTED=true
  systemctl reload nginx || die 'Не удалось перезагрузить Nginx.'
  probe_http_challenge
  COMMITTED=true
  echo "Подготовлено: ${NAMES}. HTTP отдаёт только ACME-проверку и 503, приложение не опубликовано по HTTP."
  echo 'Настройте DNS и приложение по инструкции, затем выполните шаг issue с тем же выбором --www.'
  exit 0
fi

# Refuse to take over a modified site. The exact prepare output and symlink are required.
[[ -f "$AVAILABLE" && ! -L "$AVAILABLE" && -L "$ENABLED" && "$(readlink "$ENABLED")" == "$AVAILABLE" ]] || die 'Не найден сайт, созданный шагом prepare. Проверьте пути и выбор --www.'
cmp -s "$HTTP_TEMPLATE" "$AVAILABLE" || die 'Подготовленный конфиг был изменён или выбран другой режим www. Не перезаписываю его.'
if [[ -e "$CERT_DIR" || -L "$CERT_DIR" || -e "$RENEWAL_FILE" || -L "$RENEWAL_FILE" || -e "$HOOK" || -L "$HOOK" ]]; then
  die 'Для этого имени уже есть сертификат или hook. Проверьте certbot certificates; не выпускайте повторно вслепую.'
fi

check_dns() {
  local host="$1" answer ipv6 line found=false
  answer="$(dig +time=3 +tries=1 +short A "$host")" || die "Не удалось запросить A-запись ${host}."
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == *. ]] && continue # CNAME target
    valid_ipv4 "$line" || die "Неожиданный DNS-ответ для ${host}."
    found=true
    [[ "$line" == "$PUBLIC_IPV4" ]] || die "A-запись ${host} указывает не только на заданный IPv4."
  done <<< "$answer"
  $found || die "Нет A-записи ${host}; дождитесь DNS или проверьте панель управления."
  ipv6="$(dig +time=3 +tries=1 +short AAAA "$host")" || die "Не удалось проверить AAAA-запись ${host}."
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == *. ]] && continue # CNAME target
    die "Для ${host} есть AAAA или неожиданный DNS-ответ. Эта инструкция рассчитана только на IPv4."
  done <<< "$ipv6"
}
check_dns "$DOMAIN"
$WITH_WWW && check_dns "www.$DOMAIN"
probe_http_challenge
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null || die 'Приложение на 127.0.0.1:3000 не прошло /api/health. Сначала устраните проблему.'

CERT_NAMES=(-d "$DOMAIN")
$WITH_WWW && CERT_NAMES+=(-d "www.$DOMAIN")
echo 'Локальная проверка DNS пройдена. Certbot проверит доступность домена извне по HTTP-01.'
certbot certonly --webroot -w "$ACME_ROOT" --cert-name "$DOMAIN" "${CERT_NAMES[@]}" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive || die 'Certbot не выпустил сертификат. Проверьте DNS, CAA, порты и журнал.'
[[ -f "$CERT_DIR/fullchain.pem" && -f "$CERT_DIR/privkey.pem" ]] || die 'Certbot не создал ожидаемые файлы сертификата.'

cat > "$TLS_TEMPLATE" <<EOF
# Managed by setup-domain-ssl.sh for ${DOMAIN}.
server {
    listen 80;
    server_name ${NAMES};
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 308 https://${DOMAIN}\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${DOMAIN};
    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 12M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
if $WITH_WWW; then
  cat >> "$TLS_TEMPLATE" <<EOF
server {
    listen 443 ssl;
    server_name www.${DOMAIN};
    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 308 https://${DOMAIN}\$request_uri;
}
EOF
fi
cat > "$HOOK_TEMPLATE" <<EOF
#!/bin/sh
# Reload Nginx only when this certificate is successfully renewed.
PATH=/usr/sbin:/usr/bin:/sbin:/bin
if [ "\${RENEWED_LINEAGE:-}" = "${CERT_DIR}" ]; then
  nginx -t && systemctl reload nginx
fi
EOF

# Confirm ownership again before replacing our own temporary configuration.
[[ -L "$ENABLED" && "$(readlink "$ENABLED")" == "$AVAILABLE" ]] || die 'Ссылка сайта изменилась во время выпуска; не перезаписываю конфигурацию.'
cmp -s "$HTTP_TEMPLATE" "$AVAILABLE" || die 'Подготовленный конфиг изменился во время выпуска; не перезаписываю его.'
if [[ ! -d "$LETSENCRYPT_ROOT/renewal-hooks/deploy" ]]; then
  install -d -m 755 "$LETSENCRYPT_ROOT/renewal-hooks/deploy"
fi
( set -o noclobber; cat "$HOOK_TEMPLATE" > "$HOOK" ) || die 'Не удалось безопасно создать hook продления.'
CREATED_HOOK=true
chmod 755 "$HOOK"
# Write on the same filesystem and rename atomically; a failed copy must not
# truncate the prepared vhost that is already in use.
CONFIG_TEMP="$(mktemp "$NGINX_ROOT/sites-available/.${DOMAIN}.XXXXXXXX")"
install -m 644 "$TLS_TEMPLATE" "$CONFIG_TEMP"
SITE_MODIFIED=true
mv -f -- "$CONFIG_TEMP" "$AVAILABLE"
CONFIG_TEMP=''
nginx_check || die 'HTTPS-конфигурация не прошла проверку Nginx.'
RELOAD_ATTEMPTED=true
systemctl reload nginx || die 'Не удалось перезагрузить Nginx с HTTPS.'
COMMITTED=true

# Leave a valid new vhost in place if an application/health check fails now;
# do not silently claim success or repeatedly issue certificates.
https_ready=false
for attempt in {1..10}; do
  if curl --noproxy '*' -fsS --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    https_ready=true
    break
  fi
  sleep 1
done
$https_ready || die 'HTTPS-конфигурация сохранена, но локальная HTTPS-проверка приложения не прошла. Проверьте сертификат и health; повторно не выпускайте сертификат.'

check_redirect() {
  local host="$1" scheme="$2" port="$3" redirect attempt
  for attempt in {1..10}; do
    if redirect="$(curl --noproxy '*' -sS -o /dev/null --max-time 10 --resolve "${host}:${port}:127.0.0.1" -w '%{http_code} %{redirect_url}' "${scheme}://${host}/predictlab-check?x=1" 2>/dev/null)" &&
      [[ "$redirect" == "308 https://${DOMAIN}/predictlab-check?x=1" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}
check_redirect "$DOMAIN" http 80 || die 'HTTPS сохранён, но проверка HTTP-перенаправления не прошла.'
if $WITH_WWW; then
  check_redirect "www.$DOMAIN" https 443 || die 'HTTPS сохранён, но проверка www-перенаправления не прошла.'
fi

echo "Локальная HTTPS-проверка пройдена: https://${DOMAIN}"
echo 'Проверьте сайт извне, таймер Certbot и тестовое продление по инструкции. Автопродление ещё не подтверждено.'
echo "ЮKassa webhook: https://${DOMAIN}/api/v1/webhooks/yookassa"
