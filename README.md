# VALUEX.PRO — Платформа продажи спортивных прогнозов (+EV Tipster Platform)

Высококонверсионная Full-Stack платформа спортивной аналитики с прозрачной верифицированной статистикой (**ROI, Yield, Win Rate, Equity Curve**), системой банк-менеджмента **Флэт (% от банка / Юниты)**, криптографической защитой коэффициентов (**SHA-256** до начала матча), оплатой через **ЮKassa (разовые покупки + рекуррентные автопродления + чеки 54-ФЗ)**, партнерской программой **RevShare** для вебмастеров и интеграцией с закрытым **VIP Telegram-каналом**.

---

## Состав репозитория

```text
Stavki_na_sport/
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
│   ├── Dockerfile                          # Multi-stage сборка для продакшена
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

## Вариант 1. Быстрый запуск на локальном ПК (Windows / macOS / Linux)

Подойдет, чтобы сразу запустить сайт на своем компьютере без установки Docker и PostgreSQL (приложение автоматически создаст локальное серверное хранилище `frontend/.data/platform-store.json`).

### 1. Требования
- Установленный **Node.js версии 20 или 22 LTS** ([скачать с nodejs.org](https://nodejs.org/))
- **Git**

### 2. Команды запуска
Откройте терминал (`PowerShell` на Windows или `Terminal` на macOS/Linux):

```bash
# 1. Клонируйте репозиторий и перейдите в нужную ветку
git clone https://github.com/gjjut/Stavki_na_sport.git
cd Stavki_na_sport

# 2. (Опционально) Создайте файл переменных окружения для Telegram / ЮKassa
cp .env.example frontend/.env.local

# 3. Перейдите в папку фронтенда и установите зависимости
cd frontend
npm install

# 4. Запустите режим разработки
npm run dev
```

Откройте в браузере: **`http://localhost:3000`**

Для запуска в быстром **production-режиме** локально:
```bash
npm run build
npm run start
```

---

## Вариант 2. Запуск всего стека через Docker Compose (1 команда)

Поднимает сразу **PostgreSQL 16** (автоматически накатывает схему и триггеры из `database/schema.sql`), **Redis 7** и собранное **Web-приложение** на порту `3000`.

```bash
# 1. Скопируйте шаблон переменных окружения и при необходимости заполните ключи
cp .env.example .env

# 2. Соберите и запустите контейнеры в фоновом режиме
docker compose up -d --build

# 3. Проверка логов и статуса контейнеров
docker compose ps
docker compose logs -f web
```

После сборки платформа будет доступна по адресу **`http://localhost:3000`** (или `http://IP_ВАШЕГО_СЕРВЕРА:3000`).

Проверить развернутую базу данных PostgreSQL внутри контейнера можно командой:
```bash
docker exec -it valuex_postgres psql -U tipster_user -d tipster_db -c "\dt"
```

---

## Вариант 3. Боевой деплой на VPS сервер (Ubuntu 22.04 / 24.04 + Домен + HTTPS)

> **Важно:** ЮKassa отправляет HTTP-уведомления (Webhooks) **только на защищенный HTTPS-адрес (порт 443 или 8443)** с валидным SSL-сертификатом.

### Шаг 1. Подготовка сервера (под `root` или через `sudo`)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx

# Установка официального Docker + Docker Compose plugin
curl -fsSL https://get.docker.com | sh
```

### Шаг 2. Клонирование проекта и настройка `.env`
```bash
cd /opt
git clone https://github.com/gjjut/Stavki_na_sport.git
cd Stavki_na_sport

cp .env.example .env
nano .env
```
Заполните в `.env` надежный пароль БД (`POSTGRES_PASSWORD`), ключи ЮKassa (`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`) и токен Telegram-бота (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_VIP_CHANNEL_ID`).

Запустите стек:
```bash
docker compose up -d --build
```

### Шаг 3. Настройка домена, Nginx и бесплатного SSL-сертификата
1. В панели DNS вашего домена (например, `valuex.pro`) направьте `A`-запись на IP вашего VPS.
2. Создайте конфиг Nginx `/etc/nginx/sites-available/valuex`:

```nginx
server {
    listen 80;
    server_name valuex.pro www.valuex.pro;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Включите сайт и выпустите бесплатный HTTPS-сертификат Let's Encrypt:
```bash
sudo ln -s /etc/nginx/sites-available/valuex /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d valuex.pro -d www.valuex.pro
```

---

## Инструкция по подключению ЮKassa и Telegram-бота

### 1. Настройка ЮKassa (`YOOKASSA_*`)
1. Войдите в личный кабинет [ЮKassa](https://yookassa.ru/) $\rightarrow$ **Интеграция** $\rightarrow$ **Ключи API**:
   - Скопируйте `shopId` в `YOOKASSA_SHOP_ID`.
   - Выпустите и скопируйте секретный ключ в `YOOKASSA_SECRET_KEY`.
2. Перейдите в **Интеграция** $\rightarrow$ **HTTP-уведомления** и укажите URL для Webhooks:
   ```text
   https://ВАШ_ДОМЕН/api/v1/webhooks/yookassa
   ```
   Отметьте события: `payment.succeeded`, `payment.canceled`, `refund.succeeded`.
3. Для работы **рекуррентных автопродлений** попросите менеджера ЮKassa активировать опцию *«Сохранение способа оплаты (автоплатежи)»* для вашего `shopId`.
4. В разделе **Онлайн-касса (54-ФЗ)** выберите вашу ставку НДС и укажите соответствующий код в `YOOKASSA_VAT_CODE` (`1` = без НДС для УСН/НПД). В чеке автоматически передается корректная формулировка услуги: *«Доступ к информационно-аналитическому материалу»*.

### 2. Настройка Telegram-бота и закрытого VIP-канала (`TELEGRAM_*`)
1. Создайте бота в `@BotFather` (`/newbot`) и скопируйте токен в `TELEGRAM_BOT_TOKEN`.
2. Создайте **частный (закрытый)** Telegram-канал для VIP-подписчиков.
3. Добавьте созданного бота в **Администраторы** этого закрытого канала и обязательно включите ему права:
   - *«Пригласительные ссылки»* (`Invite Users via Link`) — необходимо для генерации одноразовых ссылок `member_limit = 1` после оплаты;
   - *«Публикация сообщений»* (`Post Messages`) — для автопушей прогнозов из Админ-панели;
   - *«Блокировка участников»* (`Ban Users`) — для автоматического исключения из VIP-канала при истечении подписки или возврате средств (`refund.succeeded`).
4. Узнайте ID закрытого канала (начинается с `-100...`, например через пересылку любого поста из канала в `@userinfobot`) и пропишите его в `TELEGRAM_VIP_CHANNEL_ID`.
