# Claude — Backend Project Instructions

## Язык

Всегда отвечай на русском языке.
Без лишних предисловий — сразу к делу.

---

## Стек

- Node.js + Express
- TypeScript (strict mode)
- PostgreSQL
- REST API
- typeorm
- typescript

---

## Структура проекта

```
src/
├── routes/         # Роуты Express (только регистрация эндпоинтов)
├── controllers/    # Обработчики запросов (req/res логика)
├── services/       # Бизнес-логика
├── repositories/   # Работа с БД (SQL-запросы)
├── middlewares/    # Express middleware
├── types/          # TypeScript типы и интерфейсы
├── utils/          # Вспомогательные функции
└── config/         # Конфигурация (env, db, и т.д.)
```

---

## Архитектура (слоистая)

Строгое разделение ответственности по слоям:

**Route → Controller → Service → Repository → DB**

- **routes/** — только регистрируют эндпоинты и вешают middleware
- **controllers/** — читают `req`, вызывают service, отдают `res`. Без бизнес-логики.
- **services/** — вся бизнес-логика. Не знают про `req`/`res`.
- **repositories/** — только SQL-запросы к PostgreSQL. Без логики.

```ts
// Пример: routes/userRoutes.ts
router.get('/users/:id', userController.getById)

// Пример: controllers/userController.ts
async getById(req: Request, res: Response) {
  const user = await userService.getById(req.params.id)
  res.json(user)
}

// Пример: services/userService.ts
async getById(id: string): Promise<User> {
  return userRepository.findById(id)
}

// Пример: repositories/userRepository.ts
async findById(id: string): Promise<User | null> {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0] ?? null
}
```

---

## REST API соглашения

- Именование эндпоинтов — **kebab-case**, существительные во множественном числе
- HTTP-методы по назначению: `GET` — чтение, `POST` — создание, `PUT/PATCH` — обновление, `DELETE` — удаление
- Коды ответов: `200` OK, `201` Created, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `500` Server Error
- Ответ всегда в формате JSON

```
GET    /users          # список
GET    /users/:id      # один
POST   /users          # создать
PATCH  /users/:id      # обновить частично
DELETE /users/:id      # удалить
```

Формат успешного ответа:

```json
{ "data": { ... } }
```

Формат ошибки:

```json
{ "error": "Описание ошибки" }
```

---

## Стиль кода

- Именование переменных и функций — **camelCase**
- Именование классов и типов — **PascalCase**
- Именование файлов — **camelCase.ts**
- TypeScript: всегда типизировать параметры и возвращаемые значения
- Избегать `any` — использовать `unknown` или конкретные типы
- Async/await везде, никаких `.then()` цепочек

---

## Обработка ошибок

- Использовать централизованный error middleware в Express
- В controllers не писать `try/catch` — пробрасывать ошибки через `next(err)`
- Создавать кастомные классы ошибок с HTTP-кодом

```ts
// utils/AppError.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

// middlewares/errorHandler.ts
app.use((err: AppError, req, res, next) => {
  res.status(err.statusCode ?? 500).json({ error: err.message });
});
```

---

## PostgreSQL

- Все запросы только в `repositories/`
- Использовать параметризованные запросы (никакого string interpolation — SQL-инъекции)
- Транзакции — для операций, затрагивающих несколько таблиц

```ts
// Правильно
db.query("SELECT * FROM users WHERE id = $1", [id]);

// Никогда так
db.query(`SELECT * FROM users WHERE id = ${id}`);
```

---

## Что НЕ делать

- Не писать SQL в controllers или services — только в repositories
- Не возвращать stack trace в ответе клиенту (только в dev-режиме)
- Не хранить секреты в коде — только через `.env`
- Не использовать `var` — только `const`/`let`
- Не оставлять `console.log` в коде — использовать логгер

---

## Формат ответов

- Показывай только изменённый фрагмент, не весь файл (если файл большой)
- Комментарии в коде — только для неочевидных мест
- Если нужно создать несколько файлов — показывай каждый отдельно с путём в заголовке
