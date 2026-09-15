# Especificação: 02 - Middleware Core & Auth

**Agente Responsável:** `backend-specialist`
**Habilidades Relacionadas:** `nodejs-best-practices`, `api-patterns`

## Objetivo
Criar a base do servidor Node.js/Express (`dashboard-middleware`) seguindo estritamente a arquitetura do AutoCenter e Nexus Sales (Express, pg, cors, helmet, middlewares de JWT e API Key).

## Requisitos Técnicos

1. **Estrutura de Pastas:**
   - Criar `middleware/` (raiz).
   - `middleware/package.json` ( dependências esperadas: `express, cors, helmet, pg, jsonwebtoken, dotenv, winston, express-rate-limit, dumb-init`).
   - `middleware/src/index.js` (startup server & db check).
   - `middleware/src/app.js` (express config, cors, helmet, rotas globais).
   - `middleware/src/config/env.js` e `logger.js`.
   - `middleware/src/db/postgres.js`.
2. **Módulo Middlewares (`src/middleware/auth.js`):**
   - `requireWebJwt(req, res, next)`:
     - Extrai Token do header `Authorization: Bearer <token>`.
     - Verifica HMAC via `config.security.jwtDeviceKey`.
     - **Regra Crucial (Socratic Flow):** Deve validar `if (decoded.module !== 'dashboard') return 403`.
     - Injeta `req.tenant = { id: tenantId }`.
   - `requireInternalAuth(req, res, next)`:
     - Valida `req.headers['x-internal-key'] === config.security.internalApiKey`.
     - Extrai `req.headers['x-tenant-id']`.
     - Injeta `req.tenant = { id: tenantId }`.
3. **Módulo de Erros:**
   - Implementar `errorHandler.js` global standard (captura de async exceptions).

## Critério de Aceite
Comando `npm start` (no dev) inicia o Express na porta 3200 (configurável via ENV) e responde à rota `/health` publicamente. Todas as rotas sob `/api` retornam 401 Unauthorized se acessadas sem os headers corretos.
