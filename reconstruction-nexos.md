# Nexos Reconstruction & Functional Implementation Plan

This plan details the full reconstruction and enhancement of the NEXOS system. It outlines the database migrations, backend route additions, and frontend views for all 11 functional modules requested.

---

## 🎨 Design Commitment (V3.0 Modern Layout)

To align with the high-aesthetic guidelines of `frontend-specialist`, we commit to the following visual and interaction design choices:

- **Geometry:** Crisp, modern, low border-radius geometry (4px to 6px) to evoke a professional, high-trust fintech feel, breaking the cliché of overly round and bubble-like SaaS templates.
- **Typography:** Outfit/Poppins for high-impact metric headers and clean Inter for tabular content.
- **Palette:** Deep slate-950 and dark charcoal for the sidebar menu, clean bright whites for content cards, and strict semantic accents:
  - **Success / Closed-Won / Paid:** Vibrant Emerald green (#10B981)
  - **Atrasado / Lost / Critical:** Crimson red (#EF4444)
  - **Pendente / In Negociação / Setup:** Deep amber (#F59E0B)
  - **New / Sent:** Premium cobalt blue (#2563EB)
  - **Accents:** Neon green alerts for warning/critical debts, completely avoiding any purple/indigo hues (Purple Ban ✅).
- **Layout Uniqueness:** 
  - Staggered horizontal flow panels for the CRM details panel.
  - Interactive multi-step Wizard for Contract generation instead of standard long scrolls.
  - Kanban columns with color-accented side borders (not full backgrounds) for a subtle but clear status visualization.
  - High-performance, GPU-accelerated micro-animations on hovers (scale-up, translate) and staggered item reveals.

---

## User Review Required

> [!IMPORTANT]
> **ClickSign, DeepSeek, and Uazapi Integrations:**
> We will implement full mock drivers/fallbacks for the WhatsApp (Uazapi), electronic signature (ClickSign), and AI Proposal (DeepSeek/OpenAI) modules. When API keys are not supplied in Configs, the system will use realistic mock dialogs and display simulated response flows (e.g. mock PDF contract signed instantly, mock WhatsApp delivery logs).

> [!WARNING]
> **Database Table Alterations:**
> We are altering the tables `dash_clientes`, `dash_produtos`, and `dash_financeiro` to drop the `NOT NULL` constraint on `id_firebird`. This is critical because manual entries generated within the new CRM or local catalog will not have immediate Firebird ERP identifiers.

---

## Open Questions

> [!IMPORTANT]
> 1. **Staging / VPS deployment:** Are there any particular environment configurations required for local testing with the docker-compose setup? We will target the local development setup (`docker-compose.local.yml`) on port 8080 (frontend) and port 3100 (middleware) as our primary verification sandbox.
> 2. **Sidebar groups:** We will implement the grouped collapsible sidebar structure specifically in the `layouts/v3.0` files since layout v3.0 matches your description of a modern dark sidebar and clear content area. Do you want this applied to layouts v1.0 and v2.0 as well?

---

## Proposed Changes

We will group our implementations into three core categories: Database Migrations, Backend API Routers, and Frontend Pages/Components.

---

### Database Layer

#### [NEW] [004_nexos_reconstruction.sql](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/db/migrations/004_nexos_reconstruction.sql)
Creates CRM opportunities, timeline, activities, billing réguas, templates, campaigns, bank accounts, plano de contas, and integration credentials. Alters `dash_clientes`, `dash_produtos`, and `dash_financeiro` to drop `NOT NULL` on `id_firebird`.

#### [MODIFY] [index.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/index.js)
Update the server startup logic to scan and execute all migration SQL scripts in the `db/migrations/` directory in alphabetical order, avoiding hardcoded migrations.

---

### Backend API Routes

#### [MODIFY] [app.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/app.js)
Register new routers for `/api/crm`, `/api/contratos`, `/api/cobranca`, `/api/templates`, `/api/campanhas`, and expand `/api/financeiro` with new accounting actions.

#### [NEW] [crm.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/routes/crm.js)
Handles leads (Kanban boards, detail overlays, timeline, activities agendamentos, AI proposal generation using OpenAI/DeepSeek mock fallbacks, conversion to client + contract, loss registration reasons).

#### [NEW] [contratos.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/routes/contratos.js)
Manages contracts (Modular basket creation, simulating setup & monthly installment grids into the database, ClickSign signature envelope creation mock/live, and auto-adjustment calculations).

#### [NEW] [cobranca.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/routes/cobranca.js)
Implements configuration for Réguas and Etapas, list of titles with batch actions, manual occurrence logs, and the daily Cron job (which links pending/late accounts to réguas and logs message delivery).

#### [NEW] [templates.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/routes/templates.js)
Provides CRUD for text/document templates and template string interpolation using dynamic variables (`{{nome_cliente}}`, etc.) rendering to HTML and mock PDF generation.

#### [NEW] [campanhas.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/routes/campanhas.js)
Fetches unified audience data (leads and customers with phone numbers), handles campaign template selection, and processes batch messaging (logging results).

#### [MODIFY] [financeiro.js](file:///Users/kleber/Documents/GitHub/Nexus/middleware/src/routes/financeiro.js)
Adds routes for bank account listings, Plano de Contas/DRE categories, receivables queries, cash flow trends, and the quitação/baixa endpoint which flags installments as PAID and updates bank balances.

---

### Frontend Components & Pages

#### [MODIFY] [Sidebar.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/layouts/v3.0/Sidebar.tsx)
Expand layout v3.0 sidebar menu to present collapsible groups:
1. **Dashboard** (Dashboard Executivo)
2. **Cadastros** (Clientes, Produtos/Catálogo)
3. **CRM e Vendas** (Kanban de Vendas)
4. **Faturamento** (Contratos)
5. **Cobrança** (Kanban Operacional, Régua de Cobrança)
6. **Financeiro** (Fluxo de Caixa, Tesouraria/Contas)
7. **Campanhas** (Marketing em Massa)
8. **Configurações** (Integrações / Chaves API)

#### [MODIFY] [App.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/App.tsx)
Register all routing paths corresponding to the sidebar links.

#### [MODIFY] [Home.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/Home.tsx)
Modify home selector or update `VisaoEstrategicaV3.tsx` to display the new **Módulo 1: Dashboard Executivo** (Total Leads, Conversão, Pipeline, Receita Ganha, 6-Month Closing chart, action buttons/shortcuts).

#### [NEW] [KanbanCRM.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/KanbanCRM.tsx)
**Módulo 2 (Kanban CRM):** Renders the 6 stages, drag-and-drop actions, opportunity creation form, detail panel with Timeline & Activities subtabs, Omnichannel modals, AI Proposals trigger, client conversion popup, and loss reasons registry.

#### [MODIFY] [Clientes.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/Clientes.tsx)
**Módulo 3 (Clientes):** Enhance with advanced search/filters, checkboxes, cadastro dialog with CNPJ CNPJAWS/Mock auto-completion, and detail Profile 360 page (LTV, contracts list, timeline).

#### [MODIFY] [Produtos.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/Produtos.tsx)
**Módulo 4 (Produtos):** Enhance table to manage type, charge model, and category fields.

#### [NEW] [Contratos.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/Contratos.tsx)
**Módulo 5 (Contratos):** High-level KPIs, modular 4-step wizard modal (Client -> Basket -> Simulação Parcelas -> Save), table action buttons (PDF generation, ClickSign mock sign, WhatsApp alert, delete).

#### [NEW] [ReguaCobranca.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/ReguaCobranca.tsx)
**Módulo 6 (Régua Cobrança):** Config tab (Etapa drag-drop, template select, rule conditions) and Títulos list tab (batch movements, manual overrides).

#### [NEW] [KanbanCobranca.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/KanbanCobranca.tsx)
**Módulo 7 (Kanban Cobrança):** 3-tab layout: Kanban (yellow, orange, red, dark red columns), Cobranças de Hoje, and Agendamentos. Detail overlay to register calls/chats and view history log.

#### [MODIFY] [Financeiro.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/Financeiro.tsx)
**Módulo 8 (Tesouraria):** 3-tab layout: Fluxo de Caixa (projected vs actual balances), Contas Bancárias (appeal, bank details, balance), Plano de Contas/DRE. Advanced receivables table with single-click quitação modal (bank selection, payment type, date, confirmed amount).

#### [NEW] [Acervos.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/Acervos.tsx)
**Módulo 9 (Templates):** Category filters, contentEditable toolbar editor, and sidebar click-to-insert placeholders.

#### [NEW] [MarketingMassa.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/MarketingMassa.tsx)
**Módulo 10 (Marketing):** Audience segment selector, batch checkboxes, draft template previews, progress feedback bar with final delivery counts.

#### [NEW] [ConfigIntegracoes.tsx](file:///Users/kleber/Documents/GitHub/Nexus/frontend/src/pages/ConfigIntegracoes.tsx)
**Módulo 11 (Configurações):** Forms for DeepSeek/OpenAI keys, WhatsApp instâncias, ClickSign credentials, current/previous Salário Mínimo parameter updates (triggering reajustes), and customized transaction messaging scripts.

---

## Verification Plan

### Automated Tests
- Run `npm run lint` and `npx tsc --noEmit` in `frontend` and validation scripts in `middleware` to confirm builds and type coverage.
- Execute local backend health checks: `curl http://localhost:3100/health/liveness`.

### Manual Verification
- We will boot the local docker containers via `docker-compose -f docker-compose.local.yml up --build` and confirm frontend UI operations at `http://localhost:8080` (login as `admin@silenus.com.br` / `13894645` or standard credentials).
- Validate drag-and-drop card movements, simulation grids, template insertion markers, batch campaigns, and single-click quitações.
