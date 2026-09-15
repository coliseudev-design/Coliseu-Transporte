# Especificação: 01 - Database Schema

**Agente Responsável:** `database-architect` / `backend-specialist`
**Habilidades Relacionadas:** `database-design`

## Objetivo
Converter o banco de dados do Nexus de Cloudflare D1 (SQLite) para PostgreSQL (`nexus_dashboard`), visivelmente suportando a arquitetura multi-tenant (várias empresas na mesma tabela isoladas por `tenant_id`).

## Requisitos Técnicos

1. **Arquivo Alvo:** Criar `middleware/src/db/schema.sql` (arquitetura nova do Node.js).
2. **Multi-Tenant (MANDATÓRIO):** 
   - TODA tabela de sincronização e dados do cliente deve ter `tenant_id UUID NOT NULL`.
   - As chaves únicas que antes eram `UNIQUE(id_firebird)` devem virar `UNIQUE(tenant_id, id_firebird)`.
   - Não use chaves estrangeiras (`FOREIGN KEY`) conectando ao ID do Firebird diretamente sem contextualizar o tenant (recomendado usar a surrogate key `id SERIAL PRIMARY KEY` e linká-las ou usar garantias lógicas, mas como os IDs vêm do Firebird, o Worker enviará o FK correspondente do Firebird; na inserção, é melhor que o Worker envie apenas o `id_firebird` ou que as constraints FK sejam removidas temporariamente se o sync for passivo). Para simplificar e igual ao AutoCenter: use soft-relations ou chaves compostas nas fks se necessário, porém no dashboard, focamos em ingestão rápida de dados (Data Warehouse approach).
3. **Conversões D1 (SQLite) para Postgres:**
   - `INTEGER PRIMARY KEY AUTOINCREMENT` -> `id SERIAL PRIMARY KEY`
   - `TEXT DEFAULT CURRENT_TIMESTAMP` -> `created_at TIMESTAMPTZ DEFAULT NOW()`
   - `REAL` para valores monetários -> `DECIMAL(15,2)` ou `DECIMAL(10,2)`
   - `INTEGER` para booleanos (`ativo INTEGER DEFAULT 1`) -> `ativo BOOLEAN DEFAULT TRUE`
4. **Tabelas a criar (`dash_` prefix):**
   - Sincronizadas do ERP: `dash_clientes`, `dash_produtos`, `dash_vendedores`, `dash_fornecedores`, `dash_vendas`, `dash_vendas_itens`, `dash_comissoes`, `dash_financeiro`.
   - Sistema Web: `dash_sync_metadata`, `dash_usuarios`, `dash_auditoria`.
   *(Nota: `sessoes` web não será mais necessária caso o JWT do Identity Server seja validado via signature/HMAC sem state).*

## Ponto de Partida
Leia o arquivo herdado `migrations/0001_initial_schema.sql` (D1) e traduza-o para o dialeto Postgres usando o design especificado.

## Critério de Aceite
Script `schema.sql` roda perfeitamente em um container PostgreSQL limpo via `psql -f schema.sql` sem erros de sintaxe ou missing extensions (`uuid-ossp`).
