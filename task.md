Ок, делаем **clawdini** как “Houdini/Nuke для агентов” — **вертикальные ноды**, коннекты сверху-вниз, и простейший пайплайн:

**Input → Agent A → (в параллель Agent B) → Merge → Output**

Хорошая новость: на базе OpenClaw это реально сделать **довольно прямолинейно**, потому что у Gateway уже есть:

* **WS-протокол с request/response + events** (frames) ([GitHub][1])
* методы **agents.list / models.list / sessions.list** ([GitHub][2])
* чат-методы **chat.send** (стримит delta/final) и **chat.abort** ([GitHub][3])

И важный референс: **Crabwalk** уже показывает, что ReactFlow + realtime WebSocket к Gateway работает и даже умеет автодоставать токен из `~/.openclaw/openclaw.json`. Но Crabwalk — это **monitoring**, не “оркестратор” (не запускает граф вычислений). ([GitHub][4])

---

## 1) MVP-цели (чётко)

### MVP умеет

1. Нарисовать граф в ReactFlow (вертикально, в стиле Houdini).
2. Добавить 4 типа нод:

   * **InputNode** (текст промпта)
   * **AgentNode** (выбор agentId из OpenClaw + запуск)
   * **MergeNode** (тестовый merge: склейка/простая “композиция”)
   * **OutputNode** (итог)
3. По кнопке **Run**:

   * дергает OpenClaw Gateway два раза (Agent A и Agent B),
   * ловит streaming события (delta/final),
   * кладёт output в ноды,
   * Merge объединяет и отдаёт в Output.

### MVP НЕ делает (пока)

* сложные типы merge (consensus, voting, RAG, tool-routing)
* полноценный scheduler / retries / очереди / distributed runs
* marketplace навыков/нод

---

## 2) Архитектура проекта (минимально правильно и безопасно)

### Почему нужен backend-прокси (и не “в лоб” из браузера в Gateway)

Gateway даёт мощные методы, и у тебя будет токен/скоупы. С точки зрения безопасности лучше:

* токен **не светить в браузер**
* соединяться с Gateway с сервера (локальный/на VPS), а UI общается с твоим сервером

Плюс в последних версиях часто всплывают нюансы со **scope**; `chat.send` требует `operator.write`, и если подключиться “не теми scopes”, словишь `missing scope`. ([GitHub][5])

---

## 3) Компоненты clawdini (MVP)

### A) `apps/ui` (ReactFlow фронт)

* React + ReactFlow
* Zustand/Redux (легко) для состояния графа
* Панель:

  * слева “палитра нод” (Input / Agent / Merge / Output)
  * центр канвас
  * справа “Node Inspector” (параметры выделенной ноды)
  * снизу “Run log / streaming output”

**Визуальный стиль Houdini:**

* **вертикальный layout** (один “стек”)
* у нод:

  * **вход сверху (target handle)**
  * **выход снизу (source handle)**
* edge — прямой/ступенькой вниз
* перемещение по X ограничить (или автоснап к колонкам)

### B) `apps/server` (Node.js “runner + gateway client”)

Два слоя:

1. **GatewayClient** (низкоуровневый WS клиент к OpenClaw)

   * реализует протокол `req/res/event`
   * handshake `connect` с `minProtocol/maxProtocol`, client info, scopes, auth token ([GitHub][1])
2. **GraphRunner** (выполнение графа)

   * топологическая сортировка
   * параллельный запуск веток (Agent A и B одновременно)
   * сбор результатов
   * пуш стрима в UI

**UI ↔ Server**:

* либо WebSocket (второй) `ui-events`
* либо SSE для стриминга + REST для команд

Я бы для MVP сделал:

* `POST /api/run` → старт ранa, возвращает `runId`
* `GET /api/runs/:runId/events` → SSE стрим событий (nodeStarted/nodeDelta/nodeFinal/nodeError)

---

## 4) Как именно дёргать OpenClaw Gateway (то, что даст “работает сразу”)

### 4.1 Handshake / connect

По схеме frames у connect есть поля `role`, `scopes`, `auth.token`, `client.*`. ([GitHub][1])
Тебе нужно просить хотя бы:

* `operator.read`
* `operator.write`

Иначе `chat.send` может падать по скоупам. ([GitHub][5])

### 4.2 Найти доступных агентов

Дёргаем `agents.list` → получаем `defaultId`, `mainKey`, список агентов. ([GitHub][2])
UI показывает dropdown “Agent” внутри AgentNode.

### 4.3 Выбор sessionKey под ноду (важно для изоляции)

Есть понятие **agent-scoped session keys** вида `agent:<id>:<name>` (в docs по ACP это прям зафиксировано как рекомендуемый паттерн). ([GitHub][6])

Для MVP можно делать так:

* `sessionKey = "agent:" + agentId + ":clawdini-" + graphId + "-" + nodeId`

(И опционально: перед запуском дернуть `sessions.reset` чтобы каждый run был “чистым”, если ты хочешь строго повторяемый output.) ([GitHub][7])

### 4.4 Запуск агента

Используем **`chat.send`**:
Поля: `sessionKey`, `message`, `thinking?`, `timeoutMs?`, `idempotencyKey` ([GitHub][3])

### 4.5 Получение результата (стрим)

Gateway шлёт `event` фреймы, а payload для чата — это `ChatEventSchema` со `state: delta|final|error|aborted`, `runId`, `seq`, etc. ([GitHub][3])

GraphRunner:

* копит `delta` в буфер
* на `final` фиксирует output ноды и помечает done

### 4.6 Cancel (кнопка Stop)

`chat.abort` принимает `sessionKey` и опционально `runId`. ([GitHub][3])

---

## 5) Merge node в MVP (2 режима)

### Режим 0 (самый быстрый и “железно работает”)

**Детерминированная склейка:**

```text
=== Agent A ===
{a}

=== Agent B ===
{b}

=== Combined ===
- Key points A: …
- Key points B: …
```

То есть merge просто объединяет строки и чуть форматирует.

### Режим 1 (чуть “магии”, но тоже просто)

Merge нода сама делает ещё один `chat.send` в **отдельную merge-session** (например `agent:<defaultId>:merge`) и просит:

* “сделай consensus / summary / reconcile contradictions”
  Это уже “похоже на Houdini merge, но умный”.

Для MVP я бы делал **Режим 0**, а Режим 1 — флажком “LLM merge”.

---

## 6) Структура репозитория (понятно кодеру)

**pnpm monorepo**

```
clawdini/
  apps/
    ui/
      src/
        nodes/ (InputNode, AgentNode, MergeNode, OutputNode)
        panels/ (Inspector, RunLog)
        graph/ (serializer, layout)
    server/
      src/
        gateway/ (GatewayClient, frame types, reconnect)
        runner/ (GraphRunner, topo sort, parallel exec)
        api/ (run routes + SSE)
  packages/
    types/
      src/ (Graph JSON schema, NodeData typings)
```

---

## 7) Поэтапный план “День 1 / 2 / 3” (как ты просил)

### День 1 — “канвас живой + вижу агентов”

**Цель дня:** UI рисует ноды, сервер коннектится к Gateway, UI видит список агентов.

* [server] GatewayClient:

  * WS connect + `connect` handshake со scopes ([GitHub][1])
  * метод `agents.list` прокинуть на UI ([GitHub][2])
* [ui] ReactFlow:

  * вертикальные ноды (минимальный стиль Houdini)
  * add/remove nodes
  * Node Inspector: у AgentNode выпадашка agentId
* [ui↔server] REST: `/api/agents`

**Definition of done:**

* открываю UI → добавляю AgentNode → выбираю agent из списка.

---

### День 2 — “Run: два агента → outputs”

**Цель дня:** Run запускает два `chat.send` и стримит текст в ноды.

* [server] реализовать `POST /api/run`:

  * принять graph JSON
  * вычислить порядок
  * запустить Agent A и B параллельно
  * слушать `chat` events и пушить в SSE
* [ui] сделать:

  * кнопка Run
  * RunLog (видно delta текст)
  * output внутри AgentNode

**Definition of done:**

* Input текст → Run → в обоих AgentNode появляется результат.

---

### День 3 — “Merge + Output + Stop + сохранение графа”

**Цель дня:** появился MergeNode, OutputNode, cancel, persist.

* [server] MergeNode computation (Mode 0: concat)
* [ui] OutputNode показывает итог
* [server+ui] Stop:

  * дергать `chat.abort` по sessionKey/runId ([GitHub][3])
* [ui] сохранение графа:

  * localStorage + export/import JSON

**Definition of done:**

* Input → A/B → Merge → Output полностью работает.
* Можно остановить run.

---

## 8) Стоит ли форкать Crabwalk?

**Если цель — максимально быстро поднять работающий WebSocket-клиент и визуализацию:** да, Crabwalk — супер референс: там уже ReactFlow, realtime стриминг и подход к токену/URL. ([GitHub][4])

**Но** Crabwalk архитектурно заточен под “мониторинг цепочек”, а тебе нужен “graph authoring + execution engine”. Поэтому мой практичный совет для MVP:

* **не форкать целиком**,
* а **взять оттуда только идеи** (как они подключаются к Gateway, как рисуют activity graph),
* и сделать чистый `clawdini` с нуля, чтобы не тащить лишний стек (tRPC/TanStack DB и т.п.) ([GitHub][4])

---

Если хочешь — следующим шагом я могу:

1. накидать **Graph JSON schema** (как именно хранить ноды/рёбра/параметры)
2. расписать **контракты API** (`/run`, SSE events payloads)
3. и дать “чеклист реализации GatewayClient” (корреляция req/res, подписка на chat events, idempotencyKey генерация).

[1]: https://raw.githubusercontent.com/openclaw/openclaw/main/src/gateway/protocol/schema/frames.ts "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/openclaw/openclaw/main/src/gateway/protocol/schema/agents-models-skills.ts "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/openclaw/openclaw/main/src/gateway/protocol/schema/logs-chat.ts "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/luccast/crabwalk/master/README.md "raw.githubusercontent.com"
[5]: https://github.com/openclaw/openclaw/issues/17482/linked_closing_reference?reference_location=REPO_ISSUES_INDEX&utm_source=chatgpt.com "[Bug]: missing scope: operator.write when chat.send #17408"
[6]: https://raw.githubusercontent.com/openclaw/openclaw/main/docs.acp.md "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/openclaw/openclaw/main/src/gateway/protocol/schema/sessions.ts "raw.githubusercontent.com"
