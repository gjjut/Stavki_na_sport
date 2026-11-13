# VALUEX.PRO — Платформа продажи спортивных прогнозов (+EV Tipster Platform)

Высококонверсионная Full-Stack платформа спортивной аналитики с прозрачной верифицированной статистикой (**ROI, Yield, Win Rate, Equity Curve**), системой банк-менеджмента **Флэт (% от банка / Юниты)**, криптографической защитой коэффициентов (**SHA-256** до начала матча), оплатой через **ЮKassa (разовые покупки + рекуррентные автопродления + чеки 54-ФЗ)**, партнерской программой **RevShare** для вебмастеров и интеграцией с закрытым **VIP Telegram-каналом**.

---

## Пошаговая инструкция запуска на Облаке Рег.ру (`cloud.reg.ru`)

Ниже — готовый регламент развертывания с нуля под ваш облачный сервер в панели **`https://cloud.reg.ru/panel/servers/.../information`** (ОС **Ubuntu 22.04 / 24.04 LTS**).

### Шаг 1. Подключитесь к вашему серверу в панели Reg.ru Cloud

1. Откройте страницу вашего сервера в панели [cloud.reg.ru](https://cloud.reg.ru/):
   - Во вкладке **«Информация»** скопируйте публичный **IPv4-адрес** сервера (например, `89.108.xx.xx`).
   - Во вкладке **«Доступ»** (или в письме на почту от Рег.ру) возьмите пароль пользователя `root` (если вы не привязывали SSH-ключ).
   - Если в панели Reg.ru включен облачный **«Файрвол»** — убедитесь, что разрешены входящие порты **`22` (SSH)**, **`80` (HTTP)** и **`443` (HTTPS)**.
2. Подключитесь к серверу с вашего компьютера (через `PowerShell` в Windows или `Terminal` на macOS/Linux) **или** просто нажмите кнопку **«Консоль»** прямо в браузере в панели `cloud.reg.ru`:

```bash
ssh root@ВАШ_IP_СЕРВЕРА
```
*(При первом входе введите `yes` и вставьте пароль `root` — при вводе символы пароля в терминале не отображаются, это нормально).*

---

### Шаг 2. Склонируйте репозиторий и запустите автоустановку (1 скрипт)

В проекте уже подготовлен специальный скрипт `deploy/install-regru.sh`, адаптированный под российские дата-центры **Reg.ru Cloud**:
- автоматически добавляет **Swap 2 ГБ** (чтобы сборка Next.js не падала с ошибкой нехватки памяти `OOM Killed` на младших тарифах Рег.ру 1–2 ГБ RAM);
- ставит **PostgreSQL** и накатывает таблицы + триггеры из `database/schema.sql`;
- ставит **Node.js 22 LTS + PM2** (автозапуск при перезагрузке сервера, **не зависит от блокировок Docker Hub в РФ**);
- собирает платформу и настраивает **Nginx** на 80 порту.

Выполните на сервере:

```bash
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt update -y && apt install -y git
cd /opt
git clone https://github.com/gjjut/Stavki_na_sport.git
cd Stavki_na_sport

# Запуск автоматической установки (займет ~3-5 минут)
bash deploy/install-regru.sh
```

**Готово!** Сразу после завершения скрипта откройте в браузере:
```text
http://ВАШ_IP_СЕРВЕРА
```
Сайт, витрина прогнозов, графики и админ-панель уже работают.

> **Альтернатива через Docker Compose на Reg.ru Cloud:**
> Если вы предпочитаете запуск в Docker-контейнерах, запустите скрипт с флагом `--docker` — он автоматически пропишет рабочие в РФ зеркала (`dockerhub.timeweb.cloud`, `mirror.gcr.io`) в `/etc/docker/daemon.json` и поднимет `postgres + redis + web`:
> ```bash
> bash deploy/install-regru.sh --docker
> ```

---

### Шаг 3. Привяжите домен в Рег.ру и включите бесплатный HTTPS (обязательно для ЮKassa)

ЮKassa отправляет уведомления об оплатах (Webhooks) **строго по протоколу HTTPS (порт 443)**.

1. Зайдите в управление DNS-зоной вашего домена в личном кабинете `reg.ru` $\rightarrow$ **Домены** $\rightarrow$ ваш домен $\rightarrow$ **DNS-серверы и управление зоной**:
   - Создайте/измените запись **`A`** для `@` $\rightarrow$ укажите **IP вашего облачного сервера**.
   - Создайте/измените запись **`A`** для `www` $\rightarrow$ укажите **IP вашего облачного сервера**.
   - Подождите 5–15 минут обновления DNS.

2. На сервере пропишите ваш домен в Nginx и выпустите бесплатный SSL-сертификат Let's Encrypt одной командой (замените `ваш-домен.ру` на свой):

```bash
sed -i 's/server_name _;/server_name ваш-домен.ру www.ваш-домен.ру;/' /etc/nginx/sites-available/valuex
nginx -t && systemctl reload nginx

certbot --nginx -d ваш-домен.ру -d www.ваш-домен.ру --redirect
```

Теперь ваша платформа открывается по защищенному адресу **`https://ваш-домен.ру`**, а сертификат будет продлеваться автоматически.

---

### Шаг 4. Пропишите боевые ключи ЮKassa и Telegram-бота

Откройте конфигурационный файл на сервере:

```bash
nano /opt/Stavki_na_sport/.env
```

Заполните ваши данные:
```env
# ЮKassa API v3 + Чеки 54-ФЗ
YOOKASSA_SHOP_ID=ваш_shopId
YOOKASSA_SECRET_KEY=live_ваш_секретный_ключ
YOOKASSA_VAT_CODE=1
PUBLIC_RETURN_URL=https://ваш-домен.ру/?payment=success

# Telegram Bot API + Закрытый VIP-канал
TELEGRAM_BOT_TOKEN=1234567890:AAF_ваш_токен_от_BotFather
TELEGRAM_VIP_CHANNEL_ID=-100xxxxxxxxxx
```

Скопируйте обновленный конфиг и перезапустите процесс (занимает 1 секунду):
```bash
cp /opt/Stavki_na_sport/.env /opt/Stavki_na_sport/frontend/.env.local
pm2 restart valuex-web --update-env
```
*(Если запускали в режиме `--docker`, выполните: `cd /opt/Stavki_na_sport && docker compose up -d --force-recreate web`).*

#### Настройка на стороне ЮKassa и Telegram:
1. **В кабинете ЮKassa** (*Интеграция $\rightarrow$ HTTP-уведомления*) укажите адрес Webhook:
   ```text
   https://ваш-домен.ру/api/v1/webhooks/yookassa
   ```
   Включите галочки: `payment.succeeded`, `payment.canceled`, `refund.succeeded`. Для работы автопродлений подписок активируйте у менеджера ЮKassa опцию *«Сохранение способа оплаты (автоплатежи)»*.
2. **В Telegram:** создайте бота в `@BotFather`, создайте частный (закрытый) VIP-канал и добавьте бота в **Администраторы** канала с правами:
   - *Пригласительные ссылки* (для выдачи одноразовых ссылок `member_limit = 1` после оплаты);
   - *Публикация сообщений* (для автопушей новых прогнозов из Админки);
   - *Блокировка участников* (для автоудаления из канала при возврате `refund` или истечении подписки).

---

### Шаг 5. Полезные команды обслуживания сервера на Reg.ru

```bash
# Посмотреть статус приложения и потребление ОЗУ/CPU
pm2 status

# Смотреть живые логи сайта и входящих Webhooks ЮKassa
pm2 logs valuex-web

# Обновить сайт после новых изменений в Git
cd /opt/Stavki_na_sport
git pull
cd frontend && npm ci && npm run build
pm2 restart valuex-web
```

---

## Состав репозитория и архитектура

```text
Stavki_na_sport/
├── deploy/
│   └── install-regru.sh                    # Автоустановщик под Ubuntu 22.04/24.04 в Reg.ru Cloud (Swap + PG + Node 22 + PM2/Docker + Nginx)
├── database/
│   └── schema.sql                          # Полная схема PostgreSQL 15+ (таблицы, индексы, триггер фиксации кэфа и расчета прибыли)
├── backend/                                # Модули серверной бизнес-логики (NestJS / TypeScript)
│   └── src/
│       ├── predictions/dto/                # Server-Side маскировка закрытых исходов (защита от просмотра через DevTools)
│       ├── billing/yookassa.service.ts     # ЮKassa API v3 (разовые платежи, рекурренты, чеки 54-ФЗ)
│       ├── billing/yookassa-webhook.controller.ts # Защищенный прием Webhooks (CIDR IP-фильтр + S2S сверка + ACID транзакции)
│       ├── billing/recurring-cron.service.ts      # Фоновое автопродление подписок по сохраненному способу оплаты
│       ├── stats/stats-calculator.service.ts      # Математический движок расчета Yield, ROI, WinStreak и просадки
│       └── telegram/telegram-vip.service.ts       # Одноразовые инвайты (member_limit=1) и автопуши в закрытый VIP-канал
├── frontend/                               # Веб-приложение (Next.js 14 App Router + API Routes + Tailwind CSS + Framer Motion)
│   ├── Dockerfile                          # Multi-stage сборка для контейнеризации
│   └── src/
│       ├── app/                            # Главная витрина, личный кабинет, тарифы, админка и REST API (/api/v1/*)
│       ├── components/predictions/         # Карточка прогноза (FOMO-таймер, Blur-замок, SHA-256 верификатор)
│       ├── components/admin/               # Админ-панель (форма публикации с калькулятором выгоды юзера, CRM, ЮKassa, TG)
│       ├── components/stats/               # Интерактивный график роста банка (Equity Curve)
│       ├── components/billing/             # Модальное окно оплаты ЮKassa (СБП, Карта РФ, Депозит)
│       ├── components/triggers/            # Live-тосты социального доказательства (Social Proof)
│       └── server/platformStore.ts         # Серверное ядро с персистентным хранилищем, SHA-256 и Telegram Bot API
├── docker-compose.yml                      # Оркестрация PostgreSQL 16 + Redis 7 + Web-приложения
└── .env.example                            # Шаблон всех переменных окружения
```

---

## Локальный запуск для разработки (Windows / macOS / Linux)

```bash
git clone https://github.com/gjjut/Stavki_na_sport.git
cd Stavki_na_sport/frontend
npm install
npm run dev
```
После запуска локальная версия доступна по адресу **`http://localhost:3000`**.
