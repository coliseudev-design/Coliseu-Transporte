# Blindagem de Segurança & Correções Funcionais — Coliseu Transporte

## Overview
Blindagem OWASP Top 10:2025 e correção de bugs funcionais no ecossistema **Coliseu Transporte** (`Coliseu-Transporte.git`), preservando 100% de compatibilidade com o Sync Worker C#/Firebird, Web Worker do frontend e credenciais existentes em produção.

- **Project Type:** WEB + BACKEND (Node.js/Express + PostgreSQL Multi-Tenant + React 18/Vite/TypeScript)
- **Decisions Confirmadas:**
  1. Autenticação híbrida compatível em `/api/sync/*` (`JWT Web` OU `X-Internal-Key` + `X-Tenant-Id` UUIDv4).
  2. Criptografia AES-256-GCM retrocompatível (`enc:v1:...` e `ENC1`) para chaves Cora, tokens Focus/Asaas/Meta/IA e Certificados A1 (`dash_certificados.arquivo_pfx` e `senha`), com mascaramento `********` nos `GET`s.
  3. Manter frontend focado em Transporte/TMS e blindar todas as rotas do backend.

## Success Criteria
- [x] Zero contas backdoor/resets automáticos de senha no boot (`index.js` e `schema.sql`).
- [x] RBAC real no backend (`requireAdmin`), bloqueio de usuários inativos, fim da promoção automática a `'Master'` e validação obrigatória de `senhaAtual` em `/api/auth/alterar-senha`.
- [x] `/api/sync/*` sem SQL Injection, sem bypass `00000000-...` e protegido por autenticação híbrida (`requireSyncOrWebAuth`).
- [x] Webhooks (`Focus NFe`, `Cora`, `Asaas`, `WhatsApp`) isolados das rotas de operação (`DELETE /boleto/:id` bloqueado sem JWT) e validando assinatura/token ou confirmação ativa na API.
- [x] Fim do vazamento cross-tenant `LIMIT 1` no Asaas, dos redirecionamentos hardcoded de `tenant.id` e dos `UPDATE`/`DELETE` sem `tenant_id` em `postgres.js`.
- [x] Cofre criptográfico retrocompatível (`cryptoVault.js`) protegendo segredos e senhas/PFX de Certificados A1 em repouso + máscara `********` em respostas `GET`.
- [x] Hardening de Nginx (remoção de `/internal/`, headers de segurança, buffer seguro `128k`), Docker Compose, upload de imagens (bloqueio de SVG), redirect tracking e `/health/readiness` leve (`SELECT 1`).
- [x] Bugs corrigidos: consulta de placas de 7 dígitos na BrasilAPI (`veiculoService.js`), estorno `PAYMENT_RECEIVED_IN_CASH_UNDONE` (`asaasService.js`), case sensitivity `CoraService` e limpeza de `debug.js`, `*.py` e scripts órfãos com credenciais.
- [x] Frontend protegido: remoção da senha em texto puro no `localStorage` (`Login.tsx`), sanitização DOM contra XSS (`SafeHtml.tsx`, `sanitizeHtml.ts`, `CoraService.js`, `Acervos.tsx`, `MarketingMassa.tsx`, `Clientes.tsx`) e remoção de classes/cores `purple`/`violet` (Purple Ban).

## Task Breakdown
- [x] **T1:** Remover backdoors de boot (`index.js`, `schema.sql`), blindar `/alterar-senha` e aplicar rate limiting em `/api/auth` (`app.js`, `rateLimiter.js`).
- [x] **T2:** Implementar RBAC (`middleware/auth.js`), proteger `/api/usuarios` e `/api/grupos-acesso` e corrigir promoção indevida a `'Master'`.
- [x] **T3:** Proteger `/api/sync/*` com auth híbrida, parametrizar SQL Injections em `sync.js` e eliminar vazamentos cross-tenant (`asaasService.js`, `asaas.js`, `financeiro.js`, `postgres.js`, `app.js`).
- [x] **T4:** Isolar routers públicos de webhooks (`Focus NFe`, `Cora`, `Asaas`, `WhatsApp`) e adicionar verificação de assinatura/token/status na origem.
- [x] **T5:** Implementar `utils/cryptoVault.js` (AES-256-GCM retrocompatível + máscara) em `configuracoes.js`, `transporte.js` (Certificados A1) e services consumidores.
- [x] **T6:** Hardening de `frontend/nginx.conf`, `docker-compose.yml`, `health.js` + `postgres.js` (migração 1x no boot), `imageHandler.js` e `tracking.js`.
- [x] **T7:** Corrigir bugs funcionais em `veiculoService.js` (placas 7 dígitos + `mapearTipoRodado`), `asaasService.js` e remover arquivos órfãos/quebrados (`debug.js`, `.!1756!debug.js`, `*.py` em `services/`, `middlewares/`, scripts `test_*`/`scratch_*`).
- [x] **T8:** Remover senha em texto puro em `Login.tsx`, escapar/sanitizar HTML contra XSS e eliminar `purple`/`violet` nos componentes frontend.
- [x] **T9 (Phase X):** Validar sintaxe JS (60 arquivos), testes unitários (`cryptoVault` + `veiculoService` + `app.js`), build Vite/React, rodar `security_scan.py` (0 vulnerabilidades) e `ux_audit.py` (0 Purple Ban), commitar e enviar para `origin/main` no GitHub.

## ✅ PHASE X COMPLETE
- **Backend Syntax & Boot:** 60/60 arquivos `.js` validados via `node --check`; carregamento completo do `app.js` e testes unitários de `cryptoVault` (AES-256-GCM string/buffer + máscara + retrocompatibilidade) e `veiculoService` aprovados.
- **Frontend Build:** `npm run build` (`vite build`) concluído com sucesso (`1731 modules transformed`).
- **Security Scan (`security_scan.py`):** `0` segredos expostos e `0` padrões perigosos em `middleware` e `frontend` (`[OK] SECURE`).
- **UX Audit (`ux_audit.py`):** `0` violações de Purple Ban nos `106` arquivos auditados.
