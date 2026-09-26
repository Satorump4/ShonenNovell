# Атмосферный ридер книги

Сайт одной книги: страница книги в стиле тёмной библиотеки ранобэ, спокойный ридер и админка.
Главная особенность — **сцены**: глава состоит из сцен, у каждой свои музыка и фон.
Когда читатель доходит до новой сцены, фон плавно перетекает в новый (crossfade),
а музыка плавно сменяется (fade-out → fade-in). Текст при этом остаётся полностью статичным.

## Стек

| Часть | Технологии |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 4, React Router |
| Редактор | Tiptap 3 (только в админке, отдельный чанк) |
| Backend | Node.js, Express 5, TypeScript, Zod |
| База | PostgreSQL + Prisma ORM |
| Файлы | Локальный диск / Railway Volume или S3-совместимое хранилище |
| Деплой | Docker, Railway |

Framer Motion **не используется**: по требованию атмосфера — это только плавная смена
фона и музыки, а для fade хватает CSS. Это экономит ~40 КБ на каждой странице.

## Архитектура

Один сервис (Express отдаёт и API, и собранный фронтенд) + PostgreSQL. Без микросервисов.

```
book-reader/
├── client/                 # React-приложение (Vite root)
│   └── src/
│       ├── api/            # HTTP-клиент, публичное и админское API
│       ├── components/     # Navbar, поиск, UI-примитивы
│       ├── pages/          # BookPage (главная), ReaderRoute (ридер)
│       ├── reader/         # аудио-движок, атмосфера, рендер текста, настройки
│       ├── admin/          # админка: главы, сцены, редактор, медиатека, книга
│       └── lib/            # настройки, прогресс чтения, форматирование
├── server/src/
│   ├── auth/               # пароли (bcrypt), сессии (JWT в httpOnly cookie)
│   ├── routes/             # public.ts + admin/* (REST)
│   ├── services/           # Tiptap-валидатор, медиа, хранилище (local/S3), slug
│   └── lib/                # ошибки, валидация, rate limit
├── shared/types.ts         # общие типы ответов API
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   ├── seed.ts             # демо-книга
│   └── demo/               # синтез демо-музыки, демо-обложка, демо-текст
├── Dockerfile, docker-compose.yml, railway.json, .env.example
```

### Модель данных

- **Book** — одна запись: название, оригинальное название, автор, описание, строки инфокарточки, обложка, favicon, фон по умолчанию.
- **Chapter** — `title`, `slug`, `volume`, `number`, `order`, `published`, `publishedAt`, даты.
  Текст главы — это её сцены (отдельного поля `content` у главы нет, чтобы не было двух источников текста).
- **Scene** — `chapterId`, `title`, `order`, `content` (Tiptap JSON), `musicMode`
  (`INHERIT` — продолжать, `TRACK` — свой трек, `SILENCE` — тишина), `musicId`, `volume`,
  `background` (цвет/градиент или пусто = как у предыдущей сцены), `backgroundImageId`,
  `backgroundDim` (затемнение картинки ради читаемости), `transitionMs`.
- **Media** — `filename`, `storageKey`, `url`, `type`, `mimeType`, `size`, `width/height`. Сами файлы в БД не хранятся.
- **AdminUser** — логин, bcrypt-хэш, `tokenVersion` (смена пароля завершает старые сессии).
- **Rating** — анонимная оценка книги (id браузера, без регистрации).

### Как работает смена атмосферы

1. `resolveAtmosphere()` превращает настройки сцен в итоговую атмосферу каждой сцены (с учётом наследования).
2. `useActiveScene()` следит за прокруткой: текущая сцена — последняя, чей верх пересёк линию на 45% высоты экрана.
3. Смена применяется через 350 мс стабильности — быстрый пролистывание не «дёргает» музыку.
4. `AtmosphereStage` кладёт новый фон слоем поверх старого и проявляет его через `opacity`
   за `transitionMs` (картинка сначала загружается, потом начинается переход).
5. `AudioDirector` делает кроссфейд через Web Audio `GainNode`:
   - одновременно звучит максимум один трек, старый после затухания останавливается;
   - тот же трек в следующей сцене не перезапускается;
   - пул из трёх `<audio>` — быстрые переключения не плодят плееры;
   - через Web Audio fade работает и на iOS, где `audio.volume` менять нельзя;
   - при первом визите показывается экран «Эта книга звучит» — этот клик и разрешает звук;
     если звук заблокирован, чтение работает, а внизу появляется кнопка «Включить музыку»;
   - музыка ставится на паузу, когда вкладка скрыта.
6. `prefers-reduced-motion` и настройка «Плавные переходы» сокращают переходы фона до 0,35 с.

## Локальный запуск

Нужны **Node.js 20.12+** (рекомендуется 22 LTS) и **PostgreSQL** (проще всего через Docker).

```bash
npm install
cp .env.example .env
```

В `.env` заполните `JWT_SECRET` (случайная строка ≥ 32 символов) и `ADMIN_PASSWORD` (≥ 10 символов).
Сгенерировать секрет:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Запустить PostgreSQL (или укажите свой `DATABASE_URL`):

```bash
docker compose up -d db
```

Применить миграции и создать демо-книгу:

```bash
npx prisma migrate deploy
npm run db:seed
```

Запуск в режиме разработки (API на :3000, Vite на :5173 с прокси `/api` и `/uploads`):

```bash
npm run dev
```

Откройте http://localhost:5173 — главная страница книги; http://localhost:5173/admin — админка
(логин/пароль из `ADMIN_USERNAME` / `ADMIN_PASSWORD`).

Демо-книга «Последний рассвет»: в третьей главе три сцены — «Перед боем» (тёмно-синий фон,
спокойная музыка), «Бой» (тёмно-красный фон, боевой луп) и «После боя» (фоновое изображение,
другая музыка). Музыка синтезируется seed-скриптом, лицензии не нужны.

### Изменение схемы БД

```bash
# после правки prisma/schema.prisma
npx prisma migrate dev --name describe_change
```

## Production-сборка

```bash
npm run build          # фронтенд → dist/client, сервер → dist/server
npm run start:prod     # prisma migrate deploy → seed (если SEED_DEMO=true) → сервер
```

Или целиком в Docker, как на Railway:

```bash
docker compose --profile full up --build
```

## Деплой на Railway

1. Загрузите проект в GitHub-репозиторий.
2. В Railway: **New Project → Deploy from GitHub repo** — сборка пойдёт по `Dockerfile` (`railway.json`).
3. **+ New → Database → PostgreSQL**.
4. В сервисе приложения → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = длинная случайная строка
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`
   - `SEED_DEMO` = `true` (для первого запуска с демо-книгой; потом можно убрать — seed не трогает непустую базу)
5. Хранилище файлов — один из вариантов:
   - **Volume** (проще): сервис → **Settings → Volumes → New Volume**, mount path `/data`.
     `STORAGE_TYPE=local` и `STORAGE_DIR=/data/uploads` уже заданы в образе.
     Без Volume загруженные файлы пропадут при следующем деплое.
   - **S3** (Cloudflare R2, AWS S3, Backblaze B2…): `STORAGE_TYPE=s3` и переменные `S3_*`.
     Бакет должен быть публичным на чтение по `S3_PUBLIC_URL` и разрешать CORS (GET) для домена сайта —
     иначе Web Audio не сможет воспроизводить музыку с другого домена.
6. **Settings → Networking → Generate Domain**.

Миграции применяются автоматически при каждом старте (`prisma migrate deploy`).
Проверка здоровья: `GET /api/health`.

## API

Публичные (только чтение, кроме анонимной оценки):

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/book` | книга, рейтинг, число глав |
| GET | `/api/chapters` | опубликованные главы |
| GET | `/api/chapters/:slug` | глава со сценами + соседние главы |
| GET | `/api/search?q=` | поиск по названиям и тексту |
| GET | `/api/book/download` | все опубликованные главы одним .txt |
| POST | `/api/rating` | оценка 1–10 (id браузера) |

Админские (httpOnly cookie-сессия):

| Метод | Путь |
|---|---|
| POST | `/api/admin/login`, `/api/admin/logout` · GET `/api/admin/me` · PUT `/api/admin/password` |
| GET/PUT | `/api/admin/book` |
| GET/POST | `/api/admin/chapters` · GET/PUT/DELETE `/api/admin/chapters/:id` |
| PUT | `/api/admin/chapters/order/all` · `/api/admin/chapters/:id/scenes/order` |
| POST | `/api/admin/scenes` · PUT/DELETE `/api/admin/scenes/:id` |
| GET/POST | `/api/admin/media` · DELETE `/api/admin/media/:id` · GET `/api/admin/media/:id/usage` |

## Безопасность

- Пароль админа — только из переменных окружения, в БД — bcrypt-хэш (cost 12).
- Сессия — JWT (HS256) в `httpOnly`, `SameSite=Strict`, `Secure` (в production) cookie; смена пароля отзывает старые сессии.
- Изменяющие админские запросы проверяют `Origin`; вход ограничен 10 попытками за 15 минут с IP.
- Все входные данные валидируются Zod; SQL — только через Prisma (параметризованные запросы).
- Tiptap JSON проверяется на сервере по белому списку узлов/меток/атрибутов; ссылки — только `http(s)`, `mailto`, относительные; картинки — только `https` или `/uploads/`. Ридер рендерит JSON React-компонентами без `innerHTML`.
- CSS-фон сцены проходит белый список (цвета и градиенты, без `url()`/`var()`).
- Загрузки: тип определяется по сигнатуре файла, SVG запрещён, лимиты размера, изображения перекодируются в WebP через sharp.
- Helmet: CSP, `X-Content-Type-Options`, `frame-ancestors 'none'` и др.

## Что сделано упрощённо (осознанно)

- **Регистрации читателей нет**: прогресс, история, «Добавить в планы» и отметки «прочитано» хранятся в `localStorage` браузера.
- **Вкладки «Комментарии», «Обсуждения», «Отзывы» и пункт «Форум» из референса не добавлены**: им нужна регистрация читателей и модерация. Вместо фиктивных кнопок — рабочие «О книге» и «Главы». «Каталог» стал «Главами» (на сайте одна книга).
- **Оценка книги анонимная** (по id браузера): накрутить её можно, очистив хранилище браузера. Для MVP это приемлемо.
- **Rate limit** хранится в памяти процесса — корректно для одного инстанса.
- Кнопка **«Войти»** ведёт на вход в админку (других аккаунтов на сайте нет).
