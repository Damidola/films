# Films

Фильмы, сериалы, трейлеры и личные коллекции.

Сайт: https://damidola.github.io/films/

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

GitHub Pages автоматически публикует main из корня репозитория. Основное приложение открывается в dist/. Предыдущий Sites-хостинг больше не используется.
