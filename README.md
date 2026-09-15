# Coliseu Transporte

Dashboard corporativo para **Coliseu Transporte** (Coliseu Sistemas) — Firebird / PostgreSQL → Cloud com painel gerencial responsivo, otimizado para celular.

## Visão Geral
- **Objetivo**: visão gerencial em tempo real a partir do Firebird / PostgreSQL local em dashboard responsivo acessível do celular, tablet ou desktop.
- **Stack**:
  - **Middleware API** — Node.js Express / PostgreSQL Multi-Tenant na VPS
  - **API Edge** — Hono (TypeScript) em Cloudflare Workers/Pages
  - **Banco** — PostgreSQL Multi-Tenant / Cloudflare D1
  - **Frontend** — React 18 + Vite 5 + Tailwind CSS + TanStack Query + Recharts + Zustand
  - **Deploy** — Coolify / Docker / VPS (`https://transporte.coliseusistemas.com.br`)

## URLs
- **Produção**: https://transporte.coliseusistemas.com.br
- **Local**: http://localhost:8080 (frontend) | http://localhost:3100 (middleware)
- **API Health**: `/api/health`

## Credenciais de Demonstração
| Email                    | Perfil  |
|--------------------------|---------|
| admin@coliseutransporte.com.br | admin   |
| gerente@coliseutransporte.com.br | gerente |
| viewer@coliseutransporte.com.br | viewer  |

> Campo **senha** pode ficar vazio (modo de teste).

## Módulos (8 páginas)
1. **Início** — KPIs consolidados, últimas vendas, atalhos
2. **Vendas** — KPIs, séries temporais, por vendedor, por cliente
3. **Financeiro** — KPIs gerais + **Caixa** (entradas, saídas, saldo, ticket médio, movimentação acumulada) + **Espécies Vendidas** (top produtos, categorias, qtd, preço médio, total) + contas a receber/pagar + fluxo de caixa + vencidas
4. **Comissões** — KPIs, ranking, detalhes
5. **Ranking** — Vendedores, produtos, clientes
6. **Estatísticas** — Overview, crescimento, distribuição
7. **Produtos** — Lista, categorias, KPIs (estoque, valor, mais vendidos)
8. **Clientes** — Lista, KPIs (ativos, top faturamento)

> Módulos removidos em v2.1: Devoluções, Log, Compras, Lucratividade.

## Endpoints de API

### Auth
- `POST /api/auth/login` — body `{email, senha}` (senha vazia aceita)
- `GET /api/auth/me` · `POST /api/auth/refresh` · `POST /api/auth/logout` · `GET /api/auth/usuarios`

### Sync (para agente Python)
- `POST /api/sync/ingest` — header `X-Sync-Api-Key` · body `{tabela, rows[], mode}`
- `GET /api/sync/status` · `/api/sync/metadata` · `/api/sync/log` · `POST /api/sync/start`

### Módulos (todos protegidos por JWT — `?period=today|thisMonth|last7|last30|last12m|custom&start_date=&end_date=`)
| Módulo | Rotas |
|---|---|
| **Vendas** | `/kpis`, `/faturadas`, `/recentes`, `/por-vendedor`, `/por-cliente`, `/serie-temporal`, `/detalhes` |
| **Financeiro** | `/kpis`, `/caixa`, `/especies-vendidas`, `/contas-receber`, `/contas-pagar`, `/fluxo-caixa`, `/contas` |
| **Comissões** | `/kpis`, `/ranking`, `/detalhes` |
| **Ranking** | `/vendedores`, `/produtos`, `/clientes` |
| **Estatísticas** | `/overview`, `/crescimento`, `/distribuicao` |
| **Produtos** | `/lista`, `/categorias`, `/kpis` |
| **Clientes** | `/lista`, `/kpis` |

### Novos endpoints v2.1 (Financeiro)

**`GET /api/financeiro/caixa?period=thisMonth`**
```json
{
  "period": { "start": "...", "end": "...", "label": "Mês atual" },
  "kpis": {
    "entradas": 62116.85,          // total recebido no período
    "saidas": 20482.82,            // total pago no período
    "saldo": 41634.03,             // entradas - saídas
    "qtd_entradas": 34,
    "qtd_saidas": 4,
    "ticket_medio_entrada": 1826.96
  },
  "movimentacoes": [
    { "data": "2026-04-03", "entradas": 4096.31, "saidas": 0, "saldo_acumulado": 4096.31 },
    ...
  ]
}
```

**`GET /api/financeiro/especies-vendidas?period=thisMonth&limit=15`**
```json
{
  "period": { "start": "...", "end": "...", "label": "Mês atual" },
  "total": { "valor": 163164.87, "quantidade": 1391 },
  "produtos": [
    { "codigo": "COD-00004", "nome": "Naval 18mm 2.20x1.60", "categoria": "Compensado Naval",
      "quantidade_vendida": 67, "total_vendido": 23301.93, "qtd_vendas": 7, "preco_medio": 347.79 },
    ...
  ],
  "categorias": [
    { "categoria": "Compensado Naval", "quantidade": 109, "total": 33675.09 },
    ...
  ]
}
```

## Arquitetura de Dados

### Tabelas D1 (11 sync + 4 app)
- **Sync (espelho do Firebird)**: `sync_clientes`, `sync_produtos`, `sync_vendedores`, `sync_fornecedores`, `sync_vendas`, `sync_vendas_itens`, `sync_comissoes`, `sync_financeiro`, `sync_compras`, `sync_devolucoes`, `sync_log_atividades`
- **App**: `usuarios_web`, `sessoes`, `auditoria`, `cache_queries`

> Observação: tabelas `sync_compras`, `sync_devolucoes` e `sync_log_atividades` permanecem no schema/agente Python (o Firebird continua fornecendo os dados), mas não são exibidas na UI.

### Fluxo
```
Firebird / PostgreSQL local → Sync Worker (.NET / Python) → POST /internal/sync/ingest
  → VPS PostgreSQL (coliseu_dashboard) → Express Middleware / Hono API (JWT) → React SPA (mobile/desktop)
```

## Design & Responsividade
- **Mobile-first**: layout projetado para celular como dispositivo principal
- **Logo oficial**: logo Coliseu Transporte em `public/nexus-logo.png`
- **Sidebar**: drawer com backdrop blur em mobile, sticky em desktop, header dark gradient
- **Cards KPI**: padding e fonte reduzidos em mobile (`p-3 sm:p-5`, `text-lg sm:text-2xl`)
- **Tabelas**: scroll horizontal touch-friendly (`WebkitOverflowScrolling: touch`), colunas secundárias escondidas em mobile
- **Gráficos Recharts**: altura adaptativa (`h-64 sm:h-72`), tick font size 10 em mobile
- **Period filter**: scroll horizontal em mobile com flex-shrink-0
- **Login**: fundo dark gradient com logo destacado, input com `inputMode="email"` para teclado correto no celular
- **Breakpoints Tailwind**: mobile (padrão) · sm ≥640px · md ≥768px · lg ≥1024px

## Como Rodar Localmente
```bash
# Docker local
docker-compose -f docker-compose.local.yml up --build

# Ou manualmente
cd frontend && npm install && npm run dev
cd ../middleware && npm install && npm run dev
```

## Estrutura de Diretórios
```
ColiseuTransporte/
├── src/                           # Backend Hono Edge
├── middleware/                    # Backend Node.js Express / PG
├── frontend/                      # React SPA
│   ├── src/
│   │   ├── pages/                 # Login, Home, Vendas, Financeiro, Comissoes, etc.
│   │   ├── components/            # Sidebar, Header, DashboardLayout, etc.
│   │   ├── hooks/                 # useApi, usePeriodo, useSync, useAuth
│   │   ├── services/              # api (axios) com interceptor JWT
│   │   ├── store/                 # authStore, periodStore, themeStore (zustand)
│   │   └── workers/               # syncWorker.ts (Web Worker)
├── docker-compose.yml             # Docker production
└── docker-compose.local.yml       # Docker local
```
