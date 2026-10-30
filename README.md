# Films

Фильмы, сериалы, трейлеры и личные коллекции.

Сайт: https://dark-comedy-guide.nutmegmoth1.chatgpt.site

## Запуск

Нужен Node.js 22 или новее.

```sh
npm ci
npm run dev
```

Локально: http://localhost:8000

## Сборка

```sh
npm run build
```

Результат: `.site-build/`. Сервер — Cloudflare Worker; отметки хранятся в D1, привязка `DB`. Миграции — `drizzle/`.

Новые ручные добавления: `content/manual-additions.json`. Архитектура — `ARCHITECTURE.md`, порядок работы — `START_HERE.md`.

GitHub хранит исходники. Автопубликация в текущий Sites-хостинг из GitHub пока не настроена.
