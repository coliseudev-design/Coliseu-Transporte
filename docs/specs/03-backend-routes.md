# Especificação: 03 - Backend Routes (Hono → Express)

**Agente Responsável:** `backend-specialist`
**Habilidades Relacionadas:** `nodejs-best-practices`, `api-patterns`, `sql-queries`

## Objetivo
Traduzir as rotas existentes escritas em TypeScript/Hono para Cloudflare D1 localizadas na pasta `src/api/routes` para o formato Express Router + PostgreSQL (`pg`).

## Requisitos Técnicos

1. **Rotas Internas (`/internal/sync/*.js`):**
   - Recebem cargas úteis JSON massivas do Worker (`mode=upsert`).
   - Assinadas via `requireInternalAuth` no router pai.
   - **Ingestão Base:** Cada endpoint (`/clientes`, `/produtos`, `/vendas`, etc.) deve receber array de objetos, iterar e fazer `INSERT ... ON CONFLICT (tenant_id, id_firebird) DO UPDATE ...`. Isso evita duplicações. (Dica: utilize upserts otimizados ou um `Promise.all` com inserts diretos).
2. **Rotas da API Web (`/api/vendas.js`, `/api/financeiro.js`, etc.):**
   - Essas rotas são consumidas pelo Frontend (React).
   - Assinadas via `requireWebJwt` no router pai.
   - Todo endpoint DEVE filtrar explicitamente por `tenant_id`:
     `SELECT * FROM dash_vendas WHERE tenant_id = $1 AND ...`
   - Extrair a lógica do hook `getPeriodRange` do projeto anterior (converte "hoje", "7d", "30d" para DATETIME) localizando as funções no atual `src/api/lib/period.ts` para um utilitário `src/utils/period.js`.
3. **Mapeamento:**
   - Converta os `LIMIT 1` simplistas ou agregação `SUM(valor)` do D1 para a sintaxe Pg (`req.tenant.id` entra sempre como o `$1`).
4. **Respostas Padrão:**
   - Consistência: Mantenha as estruturas de resposta (`{ data: [...] }` ou `{ summary: ... }`) idênticas ao que o frontend React espera, evitando quebrar os componentes de Gráfico/KPI já existentes. 

## Critério de Aceite
Todos os endpoints listados em `src/api/routes` (exceto sync via Hono, e auth jwt local Hono, que foi substituída) estão portados para `middleware/src/routes`. O frontend React pode apontar para essa API sem necessitar alterar os reducers/hooks de fetch.
