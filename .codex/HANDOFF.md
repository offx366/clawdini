# HANDOFF (Codex → Minimax)

## Контекст
- Цель MVP: UI/Server запускают граф, Server ходит в OpenClaw Gateway по WS и умеет `agents.list` + `chat.send` (стрим).
- Блокер джуна: `missing scope: operator.write` и попытка “добавить scopes в openclaw.json” (это не поддерживается).
- Правильная модель OpenClaw: запрошенные scopes на WS handshake применяются только при наличии `connect.params.device` (device identity + подпись), иначе gateway сбрасывает scopes.

## Что я уже сделал (тимлид)
- В `apps/server/src/gateway/client.ts` включен `connect.challenge` flow (connect отправляется после challenge).
- В `apps/server/src/gateway/client.ts` включен device auth; критично: `device.publicKey` должен быть base64url от RAW ed25519 public key bytes (32 байта), а не от полного SPKI DER.
- Добавлен nonce из `connect.challenge` в device payload/signature (для не-local подключений).

## Junior TODO (строго по пунктам)
1) [ ] Проверь, что `apps/server/src/gateway/client.ts` кодирует `device.publicKey` как **raw ed25519 key** (strip `302a300506032b6570032100` prefix) и что `device.id` совпадает с sha256(rawKey).
2) [ ] Убедись, что `~/.openclaw/identity/device.json` существует. Если файл отсутствует, воспроизведи bootstrap: `openclaw gateway call health --json` (он создаёт identity).
3) [ ] Smoke test: `pnpm --filter clawdini-server build` + node-snippet/CLI, который делает `agents.list` и `chat.send` без `missing scope`.
4) [ ] Обнови только `.claude/REPORT.md`: что сделал, какие файлы, результат smoke test, verify.

## Acceptance Criteria (как я приму)
- [ ] `agents.list` проходит через наш `GatewayClient` (не через `openclaw gateway call`), без `missing scope`.
- [ ] `chat.send` проходит и возвращает `runId`, без `missing scope: operator.write`.
- [ ] `./scripts/verify.sh` PASS.

## Allowed files (что можно трогать)
- `apps/server/src/gateway/client.ts`
- `apps/server/src/index.ts` (если нужно пробросить config/paths)
- `.claude/REPORT.md` (только репорт)

## Verify (копипаст)
```bash
./scripts/verify.sh

Если упёрся:

Не расширяй Allowed files сам.

Собери лог проверки и опиши блокер в .claude/REPORT.md.
```
