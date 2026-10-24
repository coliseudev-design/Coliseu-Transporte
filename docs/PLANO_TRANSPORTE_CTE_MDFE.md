# ColiseuTransporte — Plano Técnico Definitivo
## CT-e, MDF-e e CIOT sobre a base Coliseu (ERP + Worker + Cloud)

> **Data:** 24/10/2026
> **Escopo:** evolução do repositório `Coliseu-Transporte` (frontend React/Vite + middleware Node/Express + PostgreSQL multi-tenant, publicado via Coolify em `https://transporte.coliseusistemas.com.br`), integração com o `ColiseuSales.Worker` (.NET/Firebird) e emissão via **Focus NFe**.
> **Documento vivo:** revisar a cada fase entregue.

---

## 1. Diagnóstico da base atual (o que já existe e é reaproveitado)

A base **não precisa ser reconstruída** — o repositório já tem 80% do que o sistema precisa. Auditei arquivo por arquivo.

### 1.1 O que já está pronto e será reaproveitado

| Camada | Estado atual | Veredito |
|---|---|---|
| **Multi-tenant** | `tenant_id UUID` em todas as tabelas `dash_*`; JWT com claim `tenantId`; `requireWebJwt` / `requireInternalAuth`; override de tenant para `c06a45f5…` → `ed1d3a98…` | ✅ Reusar. Falta apenas **Row Level Security** |
| **Sync Worker → Cloud** | `POST /internal/sync/:tabela` (batch 500, retry/backoff, `X-Internal-Key` + `X-Tenant-Id`); `ChangeTrackerService` delta; `StatusStore` heartbeat | ✅ Reusar integralmente |
| **Worker (.NET)** | `FirebirdService`, `DeltaCacheService`, `ChangeTrackerService`, `IHttpClientFactory` nomeado (`DashboardApiClient`), `IOptions<T>` por seção | ✅ Padrão a espelhar no novo Job |
| **Migrations** | `middleware/src/db/migrations/` — 30+ arquivos `.sql` auto-aplicados no boot (`index.js` lê o diretório e roda em ordem) | ✅ Reusar. **Numerar a partir de 035** (035–039 já taken por prefixo, usar `035_`) |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 + TanStack Query 5 + Zustand + Recharts + lucide-react; `Sidebar.tsx` com `hasAccess(module, submenu)`; `RequirePermission` nas rotas | ✅ Reusar. Tokens de design já definidos em `tailwind.config.js` |
| **Deploy** | `docker-compose.yaml` (2 serviços), `Dockerfile` multi-stage, `nginx.conf` com proxy `/api` e `/internal`, healthcheck `/health/liveness` | ✅ Reusar. Cuidado: frontend faz proxy de `/api` → o backend **não** deve expor porta pública |
| **Integrações** | `dash_integracoes_config` (1 linha por tenant) já guarda tokens de IA/WhatsApp/ClickSign | ⚠️ Guardar o token Focus **fora** daqui (ver §6.3) |

### 1.2 Lacunas e riscos reais encontrados na auditoria

| # | Achado | Severidade | Impacto |
|---|---|---|---|
| **R1** | `POST /api/sync/:tabela` está montado **antes** de `app.use('/api', requireWebJwt)` em [app.js:110](middleware/src/app.js:110) → rota genérica **sem autenticação**; `req.tenant` fica `undefined` e o `const { id: tenantId } = req.tenant` em [sync.js:788](middleware/src/routes/sync.js:788) estoura `TypeError` → **500**, não vazamento. Ainda assim é superfície de ataque desnecessária | 🔴 Alta | Expor `requireInternalAuth` nessa rota |
| **R2** | Credenciais de **produção hardcoded e versionadas no Git**: senha root da VPS (`2.24.82.19`, `177.39.17.7`), `PGPASSWORD`, senha do admin em [index.js:31](middleware/src/index.js:31), e hash de seed no `schema.sql` | 🔴 Crítica | **Rotacionar tudo** e remover do histórico Git |
| **R3** | `postgres.js` executa **bloco de auto-migration gigante** no boot (≈200 linhas de `ALTER TABLE`), com `UPDATE`/`DELETE` de dados (auto-repair) | 🟡 Média | Migração_versionada + *job* de boot separado; auto-repair só uma vez |
| **R4** | Sem **testes automatizados** (zero arquivos `*.test.*` / `*.spec.*` no repo) | 🟡 Média | Fiscal não pode ser validado por "você viu que abriu?" |
| **R5** | Isolamento de tenant por `WHERE tenant_id = $1` em todas as queries (auditei: padrão consistente), **sem RLS** — um `WHERE` esquecido vira vazamento entre clientes | 🟡 Média | Ativar `ROW LEVEL SECURITY` no Postgres |
| **R6** | Fila do ERP usa `dash_sync_metadata` como **tabela única** para heartbeat E fila de operações (contornado com índice parcial `WHERE operacao IS NULL`) | 🟡 Média | Criar fila dedicada `dash_sync_queue` |
| **R7** | `express.json({ limit: '50mb' })` global + rate limit só após `/api` | 🟢 Baixa | Limitar corpo por rota; mover rate limit para antes |
| **R8** | `middleware` roda `npm install --omit=dev` → `nodemon` fora; ok. Mas o `schema.sql` + `migrations/` rodam **em todo boot**, sem lock | 🟢 Baixa | `pg_advisory_lock` no boot |

### 1.3 Veredito sobre a estrutura do banco

> **O schema multi-tenant com `tenant_id` + chave natural `id_firebird` é a estrutura correta e mais estável.** É data-warehouse orientado a ingestão idempotente, que é exatamente o padrão certo para "o ERP manda, a nuvem espelha".
>
> O que **não** serve para o domínio fiscal é replicar esse padrão (colunas fixas `dash_ctes`, `dash_mdfes`) — fiscal tem variação por UF, por modal, por tipo de operação e poropiomada do layout. A solução correta é **híbrido**: colunas-índice tipadas para consulta/relatório + **JSONB canônico** do payload Focus para fidelidade fiscal e reprocessamento.

---

## 2. Arquitetura-alvo

```
┌───────────────────────── AMBIENTE DO CLIENTE (ON-PREMISE) ─────────────────────────┐
│  ERP Coliseu (Firebird)                                                              │
│      PEDIDOS / NOTA_FISCAL / CLIENTES / MOTORISTAS / VEICULOS / FROTA                │
│                    │                                                               │
│      ┌─────────────▼──────────────┐   ◄── NOVO: SyncTransporteJob.cs               │
│      │  ColiseuSales.Worker (.NET) │       • SyncTransporteCargaJob   (NF-e/CT-e)   │
│      │  (FirebirdService + Delta) │       • SyncTransporteFrotaJob   (veículos)    │
│      │  + SyncTransporteJob.cs    │       • SyncTransporteMotoristaJob             │
│      └─────────────┬──────────────┘                                                 │
└────────────────────┼────────────────────────────────────────────────────────────────┘
                     │ HTTPS  X-Internal-Key + X-Tenant-Id   (batches de 500, retry/backoff)
                     ▼
┌──────────────────── VPS 2.24.82.19 — Coolify ────────────────────────────────────────┐
│  transporte.coliseusistemas.com.br  (Traefik → nginx frontend → middleware:3200)      │
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐     │
│   │  middleware (Node 20 / Express)                                            │     │
│   │  ├── /api/sync/*         ← ingestão do Worker (idempotente, upsert)         │     │
│   │  ├── /api/fiscal/*       ← CT-e, MDF-e, CIOT (novo)                         │     │
│   │  ├── /api/webhooks/focus ← callback assíncrono da Focus NFe (novo)          │     │
│   │  └── /api/fiscal/dicionario ← motor de campos dinâmicos (novo)              │     │
│   └─────────────────────────────────────────────────────────────────────────────┘     │
│                    │                                    │                           │
│                    ▼                                    ▼                           │
│   ┌──────────────────────────────┐      ┌───────────────────────────────┐            │
│   │  PostgreSQL 15 (coolify-db)  │      │   Focus NFe API v2            │            │
│   │  coliseu_dashboard           │      │   homologacao / producao      │            │
│   │  RLS por tenant              │      │   Basic Auth (token)          │            │
│   └──────────────────────────────┘      └───────────────────────────────┘            │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Por que o CIOT **não** é emitido pela Focus NFe

**Verificado na documentação oficial da Focus (índice completo em `llms.txt`): não existe nenhum endpoint de CIOT.** A Focus cobre NF-e, NFC-e, NFSe, CT-e, CT-e OS, CT-e Simplificado, MDF-e, DCe, NFCom e NFGás — CIOT não está lá.

O CIOT é da **ANTT**, e o caminho oficial é:

| Perfil | Como emitir |
|---|---|
| **TAC / TAC equiparado** | Obrigatório via **Instituição de Pagamento** de frete (Repom, Pamcard, Sem Parar, Cartão Frete, etc.) |
| **ETC não equiparada a TAC** | Diretamente via **API da ANTT** (a ETC registra a própria operação) ou via Instituição de Pagamento |
| **ETC subcontrata TAC** | A ETC contratante mantém a responsabilidade; emissão pela Instituição de Pagamento |
| **ETC subcontrata outra ETC** | A ETC subcontratada assume o registro |

**Obrigatoriedade a partir de 24/05/2026** (MP 1.343/2026, Res. ANTT 6.078/6.090/2026, Portaria SUROC 6/2026). Regra de **piso mínimo de frete** validada na geração do CIOT — abaixo do mínimo, **o CIOT não é gerado**.

➡️ **Decisão de produto:** o ColiseuTransporte **não emite CIOT**. Ele implementa o **Contrato de Transporte** (a fonte de verdade: contratante, transportador, valor, adiantamento, veículo, percurso, forma de quitação) e gera o **payload do CIOT** no formato exigido pela API da ANTT / Instituição de Pagação, permitindo:
1. **Envio manual** (download do payload + upload no portal), e
2. **Integração plugável** com o provedor de pagamento que o cliente já usa (cada cliente da Focus tem o seu token e o seu contrato com a administradora).

O campo `CIOT` também **não aparece na lista de campos do MDF-e da Focus** — o MDF-e referencia CIOT indiretamente via relationship do CT-e. Isso é coerente: o CIOT é um registro da operação de transporte, não um documento fiscal.

---

## 3. Contrato com a Focus NFe (verificado na doc oficial)

### 3.1 Endpoints reais (contém `ref` no path, **não** no body)

| Operação | Método + Path (base `/v2`) | Retorno |
|---|---|---|
| Emitir CT-e | `POST /cte?ref={ref}` | `202` assíncrono |
| Consultar CT-e | `GET /cte/{ref}[?completa=1]` | `200` |
| Cancelar CT-e | `DELETE /cte/{ref}` body `{ justificativa }` | `200` **síncrono** |
| Cartas de correção | `POST /cte/{ref}/carta_correcao` | `202` |
| Eventos CT-e | `POST /cte/{ref}/evento` | `202` |
| Emitir MDF-e | `POST /mdfe?ref={ref}` | `202` assíncrono |
| Consultar MDF-e | `GET /mdfe/{ref}` | `200` |
| Cancelar MDF-e | `DELETE /mdfe/{ref}` | `200` |
| **Incluir condutor** | `POST /mdfe/{ref}/inclusao_condutor` body `{ nome, cpf }` | `200` **síncrono** |
| **Incluir DF-e** | `POST /mdfe/{ref}/inclusao_dfe` body `{ protocolo, codigo_municipio_carregamento, documentos[] }` | `200` **síncrono** |
| **Encerrar MDF-e** | `POST /mdfe/{ref}/encerrar` body `{ data, sigla_uf, nome_municipio }` | `200` **síncrono** |

**Bases:** `https://homologacao.focusnfe.com.br/v2` · `https://api.focusnfe.com.br/v2`
**Auth:** HTTP Basic — usuário = token da empresa, **senha em branco**.

### 3.2 O `ref` — regra de ouro

- **Único por token** (não global). Como cada CNPJ tem token próprio, o mesmo `ref` pode existir em empresas diferentes.
- **Alfanumérico**, sem acento/espaço/`@`/`/`.
- **Reenvio é permitido** se a autorização **falhou** (rejeição) → mesmo `ref`, payload corrigido.
- **Após autorizado, o `ref` está travado** — cancelamento **não** libera o `ref`.

➡️ **Schema pensado nisso:** `ref` = `{cnpj_emitente}{id_interno}` (ex.: `468909120001870000042`) — único, rastreável e recuperável. Coluna `ref` com **índice único por `(tenant_id, cnpj_emitente, ref)`**, e a tabela de tentativas (`*_tentativas`) gravando payload + resposta para reprocessamento.

### 3.3 Payload do CT-e — campos **flat** (não aninhado)

⚠️ **Correção importante ao meu planejamento anterior:** a Focus **não** usa a estrutura XML aninhada (`ide.remetente`/`vPrest`/`infDoc`). O payload é **flat**, com nomes em snake_case. Confirmei na doc de `emitir_cte.md`:

```jsonc
{
  "cfop": "5353",
  "natureza_operacao": "PRESTACAO DE SERVICO DE TRANSPORTE",
  "data_emissao": "2024-07-30T14:00:00-03:00",
  "tipo_documento": "1",
  "modal": "1",                       // 1=Rodoviário
  "tipo_servico": "0",                // 0=Normal 1=Subcontratação 2=Redespacho 3=Redesp.Intermed 4=Multimodal
  "codigo_municipio_envio": "5107875",
  "municipio_envio": "Cuiabá",
  "uf_envio": "MT",
  "codigo_municipio_inicio": "5107875", "municipio_inicio": "Cuiabá", "uf_inicio": "MT",
  "codigo_municipio_fim": "3550308",   "municipio_fim": "São Paulo",    "uf_fim": "SP",
  "retirar_mercadoria": "1",
  "indicador_inscricao_estadual_tomador": "9",

  "cnpj_emitente": "46890912000187", "inscricao_estadual_emitente": "123456789",
  "nome_emitente": "COLISEU TRANSPORTES LTDA", "nome_fantasia_emitente": "COLISEU",
  "logradouro_emitente": "AV BRASIL", "numero_emitente": "1000", "complemento_emitente": "SALA 1",
  "bairro_emitente": "CENTRO", "codigo_municipio_emitente": "5107875",
  "municipio_emitente": "Cuiabá", "cep_emitente": "78000000", "uf_emitente": "MT",
  "telefone_emitente": "6533334444",

  "cnpj_remetente": "...", "inscricao_estadual_remetente": "...", "nome_remetente": "...",
  "logradouro_remetente": "...", "numero_remetente": "...", "bairro_remetente": "...",
  "codigo_municipio_remetente": "...", "municipio_remetente": "...", "cep_remetente": "...",
  "uf_remetente": "...", "telefone_remetente": "...",

  "cnpj_destinatario": "...", /* idem bloco destinatário */
  "cnpj_expedidor": "...",  "cnpj_recebedor": "...",

  "valor_total": "1500.00",
  "valor_receber": "1500.00",
  "componentes_valor": [            // ← array de componentes do frete
    { "nome": "FRETE_PESO", "valor": "1400.00" },
    { "nome": "PEDAGIO", "valor": "100.00" }
  ],
  "icms_base_calculo": "1500.00",
  "icms_aliquota": "12.00",
  "icms_valor": "180.00",
  "icms_situacao_tributaria": "00",
  "fcp_base_calculo": "1500.00", "fcp_percentual": "2.00", "fcp_valor": "30.00",
  "particula_fcp_uf_origem": "..." , "particula_fcp_uf_destino": "...",

  "valor_total_carga": "25000.00",
  "produto_predominante": "ELETRONICOS",
  "outras_caracteristicas_carga": "CARGA SECA",

  "quantidades": [ { "codigo_unidade_medida": "01", "tipo_medida": "PESO BRUTO", "quantidade": "1200.000" } ],
  "nfes": [ { "chave_nfe": "512401..." } ],

  "cnpj_responsavel_tecnico": "...", "contato_responsavel_tecnico": "...",
  "email_responsavel_tecnico": "...", "telefone_responsavel_tecnico": "...",

  "modal_rodoviario": { "rntrc": "12345678" },
  "observacao": "..."
}
```

### 3.4 Payload do MDF-e — campos **flat** (verificado em `campos.focusnfe.com.br/mdfe/MDFeXML.html`)

```jsonc
{
  "data_emissao": "2024-07-30T14:00:00-03:00",
  "cnpj_emitente": "46890912000187",
  "inscricao_estadual_emitente": "...", "nome_emitente": "...", "nome_fantasia_emitente": "...",
  "logradouro_emitente": "...", "numero_emitente": "...", "bairro_emitente": "...",
  "codigo_municipio_emitente": "5107875", "municipio_emitente": "Cuiabá",
  "cep_emitente": "...", "uf_emitente": "MT", "telefone_emitente": "...",

  "tipo_emitente": "1",        // 1=Prestador de serviço | 2=Carga própria | 3=CT-e globalizado
  "tipo_transporte": "2",      // 1=ETC | 2=TAC | 3=CTC
  "modal": "1",                // 1=Rodoviário
  "serie": "1", "numero": "1", // vazio = numeração automática pela Focus

  "uf_inicio": "MT", "uf_fim": "SP",
  "data_hora_previsto_inicio_viagem": "2024-07-30T14:00:00-03:00",
  "participa_canal_verde": "1",
  "carregamento_posterior": "1",

  "municipios_carregamento":    [ { "codigo": "5107875", "nome": "Cuiabá" } ],       // 1–50
  "municipios_descarregamento": [ { "codigo": "3550308", "nome": "São Paulo" } ],     // 1–100
  "percursos": [ { "uf_percurso": "GO" }, { "uf_percurso": "MG" } ],                 // 0–25

  "conhecimentos_transporte": [ { "chave_cte": "532501...", "indicador_reentrega": "1" } ], // 0–20000
  "notas_fiscais":           [ { "chave_nfe": "512401...", "indicador_reentrega": "1" } ], // 0–20000

  "unidades_transporte": [ { "tipo": "1", "identificacao": "TRUCK-01",
      "lacres": [ { "numero_lacre": "123456" } ] } ],
  "unidades_carga": [ { "tipo": "1", "identificacao": "CONT-01", "quantidade_rateada": "10.00" } ],
  "produtos_perigosos": [ { "numero_onu": "UN1203", "classe_risco": "3", "grupo_embalagem": "II" } ],

  "seguros_carga": [ { "responsavel_seguro": "1", "cnpj_responsavel": "...",
      "nome_seguradora": "SEGURADORA X", "numero_apolice": "123", "numero_averbacao": "456" } ],

  "tipo_carga": "04",             // 01–12 (Res. ANTT 5.849/2019)
  "descricao_produto": "...",
  "codigo_barras_produto": "...",
  "codigo_ncm_produto": "...",

  "quantidade_total_cte": "3",
  "quantidade_total_nfe": "0",
  "valor_total_carga": "25000.00",
  "codigo_unidade_medida_peso_bruto": "01",   // 01=KG 02=TON
  "peso_bruto": "1200.000",

  "lacres": [ { "numero_lacre": "999888" } ],
  "pessoas_autorizadas": [ { "cnpj": "..." }, { "cpf": "..." } ],   // máx 10
  "informacao_adicional_fisco": "...",   // máx 2000
  "informacao_complementar": "...",      // máx 5000
  "cnpj_responsavel_tecnico": "...", "contato_responsavel_tecnico": "..."
}
```

> ⚠️ **Ressalva técnica:** o schema publicado da Focus para MDF-e (`MdfeRequest`) declara **apenas** `data_emissao`, `cnpj_emitente` e `veiculo_tracao.placa` como tipados; a lista completa acima vem do layout TPL do MDF-e (`MDFeXML.html`) e o objeto `veiculo_tracao` completo + `vale_pedagio` + `infMDFeSupl` precisam ser **validados em homologação** antes de codificar o mapper definitivo. Isso está registrado como risco **R-FISC-01** no §8.

### 3.5 Webhooks (evento-driven)

- Registrar a URL de notificação no painel Focus: `https://transporte.coliseusistemas.com.br/api/webhooks/focus`.
- Responder **HTTP 200/202 imediatamente** e processar de forma assíncrona (a Focus penaliza latência: *"servidores que respondem rápido ganham prioridade nas filas"*).
- Retry com backoff por até **48h**; após isso, o fallback é `GET /cte/{ref}` para reconciliar.
- Payload do callback traz `cnpj_emitente`, `ref`, `status` → resolver pelo `ref` guardado localmente.
- **Rate limit Focus: 100 req/min por token** → webhooks são obrigatórios, polling é proibido.

### 3.6 Status e códigos

| Documento | Status Focus | Tradução interna |
|---|---|---|
| CT-e | `processando_autorizacao` | `PROCESSANDO` |
| | `autorizado` | `AUTORIZADO` |
| | `cancelado` | `CANCELADO` |
| | `erro_autorizacao` (+ `erros[]`) | `REJEITADO` |
| MDF-e | `processando_autorizacao` · `autorizado` · `cancelado` · `erro_autorizacao` | idem |
| MDF-e encerrado | `status_sefaz: "135"`, `mensagem_sefaz: "Evento registrado e vinculado a MDF-e"` | `ENCERRADO` |

Rejeição CT-e tipicamente: `status_sefaz: "704"` → *"Data de emissão atrasada"*.
Cancelamento CT-e: **só** se `status == autorizado`; **prazo prático de 7 dias** (rejeição `220`); justificativa de **15 a 255 caracteres**.

---

## 4. Schema do banco — definitivo (híbrido tipado + JSONB)

### 4.1 Convenções herdadas (mantidas)

- Prefixo `dash_` em todas as tabelas.
- `tenant_id UUID NOT NULL` em **todas** as tabelas.
- `id SERIAL PRIMARY KEY` (surrogate) + chave natural do ERP (`id_firebird`) com `UNIQUE(tenant_id, id_firebird)` onde aplicável.
- Índices compostos **sempre** iniciados por `tenant_id`.
- `NUMERIC(15,2)` para dinheiro; `NUMERIC(12,3)` para peso/medida; `TIMESTAMPTZ` para datas.
- `JSONB` para payload bruto da Focus + índices GIN onde fizer sentido.

### 4.2 Tabelas novas

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 035 · EMISSOR E CERTIFICADO (1:N por tenant — multi-empresa)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_emitentes (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    cnpj              VARCHAR(14) NOT NULL,
    inscricao_estadual VARCHAR(20),
    razao_social      VARCHAR(255) NOT NULL,
    nome_fantasia     VARCHAR(255),
    logradouro        VARCHAR(255), numero VARCHAR(20), complemento VARCHAR(120),
    bairro            VARCHAR(120), cep VARCHAR(10),
    codigo_municipio  VARCHAR(7), municipio VARCHAR(120), uf VARCHAR(2),
    telefone          VARCHAR(30), email VARCHAR(180),
    rntrc             VARCHAR(20),
    -- Integração Focus (token por CNPJ — ver §6.3 sobre criptografia)
    focus_token_cifrado BYTEA,
    focus_ambiente    VARCHAR(12) NOT NULL DEFAULT 'homologacao',  -- homologacao | producao
    focus_empresa_id  VARCHAR(64),
    -- Certificado digital
    certificado_pfx_cifrado BYTEA,
    certificado_senha_cifrada BYTEA,
    certificado_validade DATE,
    -- Regras fiscais por UF/CT-e (parametrizáveis)
    regras_fiscais    JSONB NOT NULL DEFAULT '{}'::jsonb,
    ativo             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cnpj)
);
CREATE INDEX IF NOT EXISTS idx_dash_emitentes_tenant ON dash_emitentes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_emitentes_uf     ON dash_emitentes(tenant_id, uf);

-- ═══════════════════════════════════════════════════════════════════
-- 036 · CLIENTES / PARTES (papéis dinâmicos: rem, dest, tom, exped, recb)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_partes (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    emitente_id       INTEGER REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    id_firebird       INTEGER,
    documento         VARCHAR(14) NOT NULL,           -- CNPJ ou CPF
    tipo_documento    VARCHAR(4) NOT NULL DEFAULT 'CNPJ',  -- CNPJ | CPF
    inscricao_estadual VARCHAR(20),
    indicador_ie     VARCHAR(2) NOT NULL DEFAULT '9', -- 1=Contribuinte 2=Isento 9=Não-contribuinte
    razao_social      VARCHAR(255) NOT NULL,
    nome_fantasia     VARCHAR(255),
    logradouro        VARCHAR(255), numero VARCHAR(20), complemento VARCHAR(120),
    bairro            VARCHAR(120), cep VARCHAR(10),
    codigo_municipio  VARCHAR(7), municipio VARCHAR(120), uf VARCHAR(2),
    telefone          VARCHAR(30), email VARCHAR(180),
    -- Papéis exercidos (array) → uma parte pode ser rem+tom+dest
    papeis             VARCHAR(20)[] NOT NULL DEFAULT '{}',
    is_final_consumer  BOOLEAN NOT NULL DEFAULT FALSE,  -- consumidor final → DIFAL
    dados_extras       JSONB NOT NULL DEFAULT '{}'::jsonb,
    ativo              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, documento)
);
CREATE INDEX IF NOT EXISTS idx_dash_partes_tenant ON dash_partes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_partes_doc     ON dash_partes(tenant_id, documento);
CREATE INDEX IF NOT EXISTS idx_dash_partes_papeis  ON dash_partes USING GIN (papeis);

-- ═══════════════════════════════════════════════════════════════════
-- 037 · FROTA
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_veiculos (
    id                 SERIAL PRIMARY KEY,
    tenant_id          UUID NOT NULL,
    emitente_id        INTEGER REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    id_firebird        INTEGER,
    placa              VARCHAR(10) NOT NULL,
    renavam            VARCHAR(20),
    chassi             VARCHAR(40),
    uf                 VARCHAR(2),
    tipo_rodado        VARCHAR(4),   -- 01 Truck, 02 Toco, 03 Cavalo Mecânico, 04 Van, 05 UT, 06 VUC...
    tipo_carroceria    VARCHAR(4),   -- 00 Aberta, 01 Fechada/Baú, 02 Sider, 03 Porta Container...
    tara_kg            NUMERIC(12,3),
    capacidade_kg      NUMERIC(12,3),
    capacidade_m3      NUMERIC(12,3),
    -- TAC: veículo de transportador autônomo
    tipo_proprietario  VARCHAR(2) NOT NULL DEFAULT '1',  -- 1=Próprio 2=Terceiros
    rntrc              VARCHAR(20),
    cpf_cnpj_proprietario VARCHAR(14),
    nome_proprietario  VARCHAR(255),
    apolice_seguro     VARCHAR(40),
    venc_licenciamento DATE,
    ativo              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, placa)
);
CREATE INDEX IF NOT EXISTS idx_dash_veiculos_tenant ON dash_veiculos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_veiculos_placa  ON dash_veiculos(tenant_id, placa);

CREATE TABLE IF NOT EXISTS dash_motoristas (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID NOT NULL,
    emitente_id   INTEGER REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    id_firebird   INTEGER,
    cpf           VARCHAR(11) NOT NULL,
    nome          VARCHAR(255) NOT NULL,
    cnh           VARCHAR(20), cnh_categoria VARCHAR(4), cnh_validade DATE,
    telefone      VARCHAR(30), email VARCHAR(180),
    data_nascimento DATE,
    dados_extras  JSONB NOT NULL DEFAULT '{}'::jsonb,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cpf)
);
CREATE INDEX IF NOT EXISTS idx_dash_motoristas_tenant ON dash_motoristas(tenant_id);

-- ═══════════════════════════════════════════════════════════════════
-- 038 · CARGA (NF-e / CT-e recebidos do ERP — fonte do CT-e)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_cargas (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    emitente_id       INTEGER REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    id_firebird       INTEGER,
    tipo_documento    VARCHAR(3) NOT NULL DEFAULT 'NF',  -- NF | CTE | CT | DANFE
    chave_acesso      VARCHAR(44),
    numero            VARCHAR(20), serie VARCHAR(5),
    data_emissao      TIMESTAMPTZ,
    -- Partes (FKs locais — melhor que JSONB para query/relato)
    remetente_id      INTEGER REFERENCES dash_partes(id),
    destinatario_id   INTEGER REFERENCES dash_partes(id),
    -- Valores
    valor_total       NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_produtos    NUMERIC(15,2),
    -- Medidas (alimentam o rateio do frete)
    peso_bruto        NUMERIC(12,3),
    peso_liquido      NUMERIC(12,3),
    volume_m3         NUMERIC(12,3),
    volumes           INTEGER,
    especie           VARCHAR(120),
    produto_predominante VARCHAR(255),
    -- Itens (rateio)
    itens             JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Fluxo
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
        -- PENDENTE | EM_CTE | EM_MDFE | CANCELADA | DESPACHADA
    cte_id            INTEGER,
    mdfe_id           INTEGER,
    -- Regime tributário da carga (para o motor de ICMS do CT-e)
    regime_tributario VARCHAR(4),      -- 1=Simples 2=Simples excesso 3=Regime Normal
    cfop              VARCHAR(8),
    dados_extras      JSONB NOT NULL DEFAULT '{}'::jsonb,
    sincronizado_em   TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, tipo_documento, chave_acesso, numero, serie)
);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_tenant  ON dash_cargas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_status  ON dash_cargas(tenant_id, status, data_emissao);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_chave   ON dash_cargas(tenant_id, chave_acesso);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_emi     ON dash_cargas(tenant_id, emitente_id, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_dash_cargas_partes  ON dash_cargas(tenant_id, destinatario_id);

-- ═══════════════════════════════════════════════════════════════════
-- 039 · CT-e
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_ctes (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    emitente_id       INTEGER NOT NULL REFERENCES dash_emitentes(id),
    -- Ref Focus (único por token) — idempotência
    ref               VARCHAR(60) NOT NULL,
    -- Identificação fiscal
    chave_cte         VARCHAR(44),
    numero            VARCHAR(20), serie VARCHAR(5), modelo VARCHAR(3) DEFAULT '57',
    -- Status
    status            VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
        -- RASCUNHO | PROCESSANDO | AUTORIZADO | REJEITADO | CANCELADO | EVENTO
    status_sefaz      VARCHAR(10),
    mensagem_sefaz    TEXT,
    erros             JSONB,            -- [{codigo, mensagem}] da Focus
    -- Dinâmico
    payload           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- payload ENVIADO à Focus
    requisicao        JSONB,                                -- payload devolvido pela Focus (completa=1)
    -- Valores (colunas-índice para relatório/BI)
    natureza_operacao VARCHAR(255),
    tipo_servico      VARCHAR(3),
    modal             VARCHAR(3),
    tomador           VARCHAR(4),       -- 0 Rem 1 Exped 2 Receb 3 Dest 4 Outros
    uf_inicio         VARCHAR(2), uf_fim VARCHAR(2),
    codigo_municipio_inicio VARCHAR(7), codigo_municipio_fim VARCHAR(7),
    municipio_inicio  VARCHAR(120), municipio_fim VARCHAR(120),
    valor_frete       NUMERIC(15,2) DEFAULT 0,
    valor_receber     NUMERIC(15,2) DEFAULT 0,
    valor_carga       NUMERIC(15,2) DEFAULT 0,
    peso_bruto        NUMERIC(12,3),
    base_icms         NUMERIC(15,2), aliquota_icms NUMERIC(7,4), valor_icms NUMERIC(15,2),
    -- Artefatos
    caminho_xml       TEXT, caminho_dacte TEXT, caminho_xml_cancelamento TEXT,
    protocolo         VARCHAR(30),
    -- Emission
    tipo_emissao     VARCHAR(3) NOT NULL DEFAULT '1',  -- 1 Normal 4 EPEC 7 FSDA
    data_emissao      TIMESTAMPTZ,
    -- Vínculos
    cte_pai_id        INTEGER REFERENCES dash_ctes(id),   -- CT-e globalizado / redespacho
    -- Governança
    criado_por        VARCHAR(200),
    error_message     TEXT,
    tentivas          INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, emitente_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_tenant   ON dash_ctes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_status   ON dash_ctes(tenant_id, status, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_chave    ON dash_ctes(tenant_id, chave_cte);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_ref      ON dash_ctes(tenant_id, ref);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_periodo  ON dash_ctes(tenant_id, data_emissao, status);
CREATE INDEX IF NOT EXISTS idx_dash_ctes_payload  ON dash_ctes USING GIN (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS dash_cte_cargas (          -- N:N CT-e ↔ carga (NF-e)
    id        SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cte_id    INTEGER NOT NULL REFERENCES dash_ctes(id) ON DELETE CASCADE,
    carga_id  INTEGER NOT NULL REFERENCES dash_cargas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cte_id, carga_id)
);
CREATE INDEX IF NOT EXISTS idx_dash_cte_cargas_cte   ON dash_cte_cargas(tenant_id, cte_id);
CREATE INDEX IF NOT EXISTS idx_dash_cte_cargas_carga ON dash_cte_cargas(tenant_id, carga_id);

-- ═══════════════════════════════════════════════════════════════════
-- 040 · MDF-e
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_mdfes (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    emitente_id     INTEGER NOT NULL REFERENCES dash_emitentes(id),
    ref             VARCHAR(60) NOT NULL,
    chave_mdfe      VARCHAR(44),
    numero          VARCHAR(20), serie VARCHAR(5), modelo VARCHAR(3) DEFAULT '58',
    status          VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
        -- RASCUNHO | PROCESSANDO | AUTORIZADO | REJEITADO | CANCELADO | ENCERRADO
    status_sefaz    VARCHAR(10), mensagem_sefaz TEXT, erros JSONB,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    requisicao      JSONB,
    -- Modal / transporte
    tipo_emitente   VARCHAR(2),   -- 1 Prestador 2 Carga própria 3 CT-e globalizado
    tipo_transporte VARCHAR(2),   -- 1 ETC 2 TAC 3 CTC
    modal           VARCHAR(2) DEFAULT '1',
    -- Percurso
    uf_inicio       VARCHAR(2), uf_fim VARCHAR(2),
    data_hora_previsto_inicio_viagem TIMESTAMPTZ,
    -- Tração (colunas-índice para o "dentro/fora da capacidade")
    veiculo_id      INTEGER REFERENCES dash_veiculos(id),
    veiculo_placa   VARCHAR(10),
    motorista_id    INTEGER REFERENCES dash_motoristas(id),
    motorista_cpf   VARCHAR(11), motorista_nome VARCHAR(255),
    -- Totais
    qtd_cte         INTEGER DEFAULT 0, qtd_nfe INTEGER DEFAULT 0,
    valor_carga     NUMERIC(15,2) DEFAULT 0,
    peso_bruto      NUMERIC(12,3),
    unidade_peso    VARCHAR(3) DEFAULT '01',   -- 01 KG 02 TON
    -- CIOT (referência, não emissão)
    ciot_codigo     VARCHAR(50),
    -- Encerramento
    encerrado_em    TIMESTAMPTZ,
    encerramento_uf VARCHAR(2), encerramento_municipio VARCHAR(120), encerramento_data DATE,
    -- Artefatos
    caminho_xml     TEXT, caminho_damdfe TEXT,
    protocolo       VARCHAR(30),
    -- Eventos: inclusao_condutor / inclusao_dfe ficam em dash_fiscal_eventos
    error_message   TEXT, tentivas INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, emitente_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_tenant  ON dash_mdfes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_status  ON dash_mdfes(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_placa  ON dash_mdfes(tenant_id, veiculo_placa, status);
CREATE INDEX IF NOT EXISTS idx_dash_mdfes_ref    ON dash_mdfes(tenant_id, ref);

CREATE TABLE IF NOT EXISTS dash_mdfe_documentos (       -- N:N MDF-e ↔ CT-e/NF-e
    id         SERIAL PRIMARY KEY,
    tenant_id  UUID NOT NULL,
    mdfe_id    INTEGER NOT NULL REFERENCES dash_mdfes(id) ON DELETE CASCADE,
    cte_id     INTEGER REFERENCES dash_ctes(id) ON DELETE CASCADE,
    carga_id   INTEGER REFERENCES dash_cargas(id) ON DELETE CASCADE,
    tipo       VARCHAR(3) NOT NULL,   -- CTE | NFE
    chave      VARCHAR(44) NOT NULL,
    codigo_municipio_descarregamento VARCHAR(7),
    nome_municipio_descarregamento  VARCHAR(120),
    indicador_reentrega VARCHAR(2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, mdfe_id, chave)
);
CREATE INDEX IF NOT EXISTS idx_dash_mdfe_docs_mdfe ON dash_mdfe_documentos(tenant_id, mdfe_id);

-- ═══════════════════════════════════════════════════════════════════
-- 041 · CONTRATO DE TRANSPORTE + CIOT (gerador, não emissor)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_contratos_transporte (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    emitente_id       INTEGER NOT NULL REFERENCES dash_emitentes(id),
    -- Partes
    contratante_id    INTEGER REFERENCES dash_partes(id),
    transportador_id  INTEGER REFERENCES dash_partes(id),
    -- Operação
    rntrc_contratante VARCHAR(20), rntrc_transportador VARCHAR(20),
    tipo_transporte   VARCHAR(2) NOT NULL DEFAULT '2',  -- 1 ETC 2 TAC 3 CTC
    tipo_operacao     VARCHAR(30),  -- Carga Lotação | Carga Fracionada | TAC-Agregado
    -- Percurso
    uf_inicio         VARCHAR(2), uf_fim VARCHAR(2),
    codigo_municipio_inicio VARCHAR(7), codigo_municipio_fim VARCHAR(7),
    municipio_inicio  VARCHAR(120), municipio_fim VARCHAR(120),
    datas             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {inicio, fim}
    -- Valores (base do piso mínimo ANTT)
    valor_frete       NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_adiantamento NUMERIC(15,2) DEFAULT 0,
    valor_pedagio     NUMERIC(15,2) DEFAULT 0,
    valor_combustivel NUMERIC(15,2) DEFAULT 0,
    valor_adicionais  NUMERIC(15,2) DEFAULT 0,
    -- Quitação
    forma_quitacao    VARCHAR(4),   -- 01 PIX 02 Depósito 03 Cartão Frete 04 Dinheiro
    data_pagamento    DATE,
    -- Veículos
    veiculo_ids       INTEGER[] NOT NULL DEFAULT '{}',
    -- Piso mínimo (regras ANTT por tipo de operação)
    piso_minimo_aplicado NUMERIC(15,2),
    piso_minimo_ok    BOOLEAN,
    piso_minimo_msg   TEXT,
    -- CIOT
    ciot_status       VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
        -- PENDENTE | GERADO | TRANSMITIDO | CANCELADO
    ciot_codigo       VARCHAR(50),
    ciot_payload      JSONB,          -- payload pronto para a API da ANTT/Instituição
    ciot_erro         TEXT,
    ciot_transmitido_em TIMESTAMPTZ,
    -- Vínculos
    cte_id            INTEGER REFERENCES dash_ctes(id),
    mdfe_id           INTEGER REFERENCES dash_mdfes(id),
    -- Regras/Tributos
    tributos           JSONB NOT NULL DEFAULT '{}'::jsonb,
    dados_extras      JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_por         VARCHAR(200),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_ct_tenant    ON dash_contratos_transporte(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dash_ct_ciot     ON dash_contratos_transporte(tenant_id, ciot_status);
CREATE INDEX IF NOT EXISTS idx_dash_ct_contrat  ON dash_contratos_transporte(tenant_id, contratante_id);

-- ═══════════════════════════════════════════════════════════════════
-- 042 · TABELA DE CAMPOS DINÂMICOS (motor de formulários)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_campos_dinamicos (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    documento      VARCHAR(10) NOT NULL,   -- CTE | MDFE | CIOT | CONTRATO
    chave_campo    VARCHAR(80) NOT NULL,   -- identificador técnico (ex: "modal_rodoviario.rntrc")
    rotulo         VARCHAR(160) NOT NULL,  -- label exibido
    tipo           VARCHAR(20) NOT NULL,   -- texto | numero | moeda | data | select | checkbox | json
    -- Regras de exibição (condicional)
    condicao_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
        -- ex: {"campo":"tipo_servico","operador":"eq","valor":"1"}
    opcoes         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{valor, rotulo}] p/ select
    -- Mapeamento para a Focus
    caminho_focus  VARCHAR(120),           -- ex: "modal_rodoviario.rntrc"
    transformacao  VARCHAR(30),           -- snake | upper | mask_cpf | mask_placa | ...
    obrigatorio    BOOLEAN NOT NULL DEFAULT FALSE,
    ordem          INTEGER NOT NULL DEFAULT 0,
    -- Escopo de exibição
    escopo         VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',  -- GLOBAL | UF_ORIGEM | UF_DESTINO | TIPO_SERVICO
    escopo_valores JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Agrupamento de UI
    grupo          VARCHAR(60),
    ativo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, documento, chave_campo)
);
CREATE INDEX IF NOT EXISTS idx_dash_campos_doc ON dash_campos_dinamicos(tenant_id, documento, ativo, ordem);

-- ═══════════════════════════════════════════════════════════════════
-- 043 · REGRAS DE TRIBUTO / RATEIO (parametrizáveis por UF)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_regras_fiscais (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    emitente_id    INTEGER REFERENCES dash_emitentes(id) ON DELETE CASCADE,
    escopo         VARCHAR(20) NOT NULL DEFAULT 'GLOBAL', -- GLOBAL | UF | UF_PAR
    uf_origem      VARCHAR(2), uf_destino VARCHAR(2),
    tipo_servico   VARCHAR(3),
    situacao_tributaria VARCHAR(4) NOT NULL DEFAULT '00',
    cfop           VARCHAR(8),
    aliquota_icms  NUMERIC(7,4),
    percentual_fcp NUMERIC(7,4),
    part_fcp_origem NUMERIC(7,4), part_fcp_destino NUMERIC(7,4),
    part_icms_origem NUMERIC(7,4), part_icms_destino NUMERIC(7,4),
    is_final_consumer BOOLEAN DEFAULT FALSE,
    -- Rateio do frete
    criterio_rateio VARCHAR(30) DEFAULT 'PESO',  -- PESO | VALOR | VOLUME | FIXO | COMBINADO
    valor_minimo   NUMERIC(15,2), valor_maximo NUMERIC(15,2),
    percentual_adicional NUMERIC(7,4),
    ativo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_regras_tenant ON dash_regras_fiscais(tenant_id, ativo);

-- ═══════════════════════════════════════════════════════════════════
-- 044 · FILA DE EMISSÃO (idempotente, com backoff)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_fiscal_queue (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    documento      VARCHAR(10) NOT NULL,   -- CTE | MDFE | EVENTO | CIOT
    documento_id   INTEGER NOT NULL,
    emitente_id    INTEGER NOT NULL,
    tipo_operacao  VARCHAR(30) NOT NULL,   -- EMITIR | CONSULTAR | CANCELAR | ENCERRAR | INCL_CONDUTOR | INCL_DFE
    payload        JSONB,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
        -- PENDENTE | PROCESSANDO | CONCLUIDO | ERRO | CANCELADO
    tentativas     INTEGER NOT NULL DEFAULT 0,
    max_tentativas INTEGER NOT NULL DEFAULT 5,
    proxima_execucao TIMESTAMPTZ DEFAULT NOW(),
    erro           TEXT,
    last_http_status INTEGER,
    criado_por     VARCHAR(200),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_fq_claim ON dash_fiscal_queue(status, proxima_execucao)
    WHERE status IN ('PENDENTE','ERRO');
CREATE INDEX IF NOT EXISTS idx_dash_fq_tenant ON dash_fiscal_queue(tenant_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 045 · HISTÓRICO DE EVENTOS FISCAIS (rastreabilidade SEFAZ)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_fiscal_eventos (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    documento      VARCHAR(10) NOT NULL,
    documento_id   INTEGER NOT NULL,
    tipo_evento    VARCHAR(40) NOT NULL,   -- EMISSAO | AUTORIZACAO | REJEICAO | CANCELAMENTO
                                            -- | INCLUSAO_CONDUTOR | INCLUSAO_DFE | ENCERRAMENTO
    status         VARCHAR(20),
    status_sefaz   VARCHAR(10), mensagem_sefaz TEXT,
    payload_enviado JSONB, resposta JSONB,
    caminho_xml   TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_fiscal_ev_doc ON dash_fiscal_eventos(tenant_id, documento, documento_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 046 · AUDITORIA DE EMISSÃO (append-only)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dash_fiscal_auditoria (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    usuario     VARCHAR(200), acao VARCHAR(60),
    documento   VARCHAR(10), documento_id INTEGER,
    dados_antes JSONB, dados_depois JSONB,
    ip          VARCHAR(60), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dash_fiscal_aud ON dash_fiscal_auditoria(tenant_id, created_at DESC);
```

### 4.3 Row Level Security (corrige R5)

```sql
ALTER TABLE dash_ctes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dash_cargas ENABLE ROW LEVEL SECURITY;
-- ... idem para as demais tabelas fiscais

CREATE POLICY tenant_isolation_ctes ON dash_ctes
    USING (tenant_id::text = current_setting('app.tenant_id', true));
-- O middleware passa a SET LOCAL app.tenant_id = '<tenant>' em cada transação.
```

⚠️ Requer que o `pg` envie `SET LOCAL app.tenant_id` no início de cada transação — mudança pequena no wrapper de query, ganho grande de isolamento.

### 4.4 Por que esse schema é o **mais estável** para crescer

| Decisão | Justificativa |
|---|---|
| Colunas-índice **+** `payload JSONB` | Consulta rápida por índice (relatórios, BI, listas) **e** fidelidade fiscal total (reprocessar o payload exato) |
| `UNIQUE(tenant_id, emitente_id, ref)` | Idempotência nativa: reenvio com o mesmo `ref` **não** duplica |
| `dash_fiscal_queue` com `proxima_execucao` | Backoff sem cron externo; sobrevive a restart; **é** a fila do sistema |
| `dash_fiscal_eventos` append-only | Auditoria SEFAZ completa: todo evento com payload + resposta + XML |
| Tabelas de referência (`dash_partes`, `dash_veiculos`, `dash_motoristas`) com FK real | Sem duplicação de endereço; relatório por UF/tomador é um JOIN |
| `dash_campos_dinamicos` com `condicao_json` | Formulário 100% dinâmico **sem deploy**: adicionar campo = INSERT |
| `dash_regras_fiscais` com escopo GLOBAL/UF/UF_PAR | Tributação por UF sem `ALTER TABLE` a cada mudança de alíquota |

---

## 5. Motor de Campos Dinâmicos (o requisito "deixe dinâmico")

### 5.1 Como funciona

```
dash_campos_dinamicos  ──(seed por documento)──▶  Formulário React gerado
        │                                              │
        │                                              ▼
        │                                    GET /api/fiscal/dicionario/:documento
        │                                    (campos + condições + escopo)
        │
        └──(POST /api/fiscal/dicionario)──▶  Novo campo sem deploy
```

**Fluxo de renderização:**

1. O frontend chama `GET /api/fiscal/dicionario/CTE` → recebe a lista de campos com `condicao_json`, `opcoes`, `caminho_focus`, `escopo`.
2. Um `<DynamicForm>` renderiza os campos aplicando:
   - filtro por `escopo` (UF origem/destino, tipo de serviço);
   - `condicao_json` → campo aparece/some conforme outros valores do formulário.
3. Ao enviar, o backend **monta o payload Focus** percorrendo os campos habilitados e gravando em `caminho_focus` (suporta caminho aninhado com `a.b.c` → `{a:{b:{c:valor}}}`).
4. `transformacao` (`upper`, `mask_cpf`, `mask_placa`, `digits_only`) é aplicada no momento da montagem.

### 5.2 Exemplo real de seed — campo condicional "RNTRC"

```sql
INSERT INTO dash_campos_dinamicos
  (tenant_id, documento, chave_campo, rotulo, tipo, condicao_json,
   opcoes, caminho_focus, transformacao, obrigatorio, ordem, escopo, grupo)
VALUES
  ('00000000-0000-0000-0000-000000000000','CTE','rntrc','RNTRC','texto',
   '{"campo":"modal","operador":"eq","valor":"1"}',
   '[]','modal_rodoviario.rntrc','upper',TRUE,20,'GLOBAL','Modal Rodoviário');
```

**Resultado na tela:** o campo "RNTRC" só aparece quando `modal == "1" (Rodoviário)`, e o valor gravado vai para `payload.modal_rodoviario.rntrc`.

### 5.3 Tabela de regras — seed inicial obrigatória

| Documento | Campos | Origem |
|---|---|---|
| `CTE` | ~120 campos (emissor, partes, valores, ICMS, carga, quantidades, modal, responsável técnico) | Mapeamento do payload Focus §3.3 |
| `MDFE` | ~90 campos (emissor, modal, percurso, documentos, unidades, produtos perigosos, seguros, totais) | Mapeamento §3.4 |
| `CIOT` | ~40 campos (contratante, transportador, valores, veículo, percurso, quitação) | API ANTT / Instituição de Pagamento |
| `CONTRATO` | ~25 campos | Modelo interno |

O seed fica em `middleware/src/db/seeds/035_campos_cte.sql`, `036_campos_mdfe.sql`, `037_campos_ciot.sql` — versionados, idempotentes (`ON CONFLICT DO NOTHING`), e **override por tenant** via `dash_campos_dinamicos` (chave `tenant_id`).

---

## 6. Camada de integração Focus NFe

### 6.1 Estrutura de arquivos (novos)

```
middleware/src/
├── routes/
│   ├── fiscal.js              # CT-e, MDF-e, CIOT, contratos
│   ├── fiscalDicionario.js    # CRUD de campos dinâmicos
│   └── webhooksFocus.js       # callback da Focus (público, valida ref+token)
├── services/
│   ├── focus/
│   │   ├── focusClient.js     # HTTP Basic wrapper + retry + rate limit
│   │   ├── cteService.js      # emitir/consultar/cancelar/carta de correção
│   │   ├── mdfeService.js     # emitir/consultar/cancelar/incl_*/encerrar
│   │   ├── ciotService.js     # gera payload CIOT (ANTT/Instituição)
│   │   └── payloadBuilder.js  # monta payload flat a partir de JSONB dinâmico
│   ├── rateioService.js       # rateio de frete (peso/valor/volume/combinado)
│   └── icmsService.js         # motor de ICMS/DIFAL/FCP por regra de UF
├── db/
│   ├── migrations/035..046_*.sql
│   └── seeds/035..037_*.sql
├── jobs/
│   └── fiscalQueueJob.js      # consome dash_fiscal_queue (backoff)
└── utils/
    ├── focusAuth.js           # decripta token (AES-256-GCM)
    ├── refBuilder.js          # {cnpj}{id}
    └── validators/
        ├── cteValidator.js
        └── mdfeValidator.js
```

### 6.2 `focusClient.js` — cliente único, com rate limit

```js
// Regras: 100 req/min por TOKEN (não por empresa, não por endpoint)
// Retry: 429 / 5xx → backoff exponencial com jitter
// Idempotência: nunca reenviar se status local != RASCUNHO/REJEITADO
async function focusRequest({ tenantId, emitenteId, method, path, body, idempotencyKey }) {
  const emitente = await getEmitente(tenantId, emitenteId);
  const base = emitente.focus_ambiente === 'producao'
    ? 'https://api.focusnfe.com.br/v2'
    : 'https://homologacao.focusnfe.com.br/v2';
  const token = decrypt(emitente.focus_token_cifrado);

  // Rate limit: 100/min por token — contador em memória por token
  await rateLimiter.acquire(token);

  const res = await axios.request({
    method, url: base + path,
    auth: { username: token, password: '' },       // HTTP Basic, senha vazia
    data: body, timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
  });
  return res.data;
}
```

### 6.3 Segurança do token Focus — **não** no `dash_integracoes_config`

| Problema | Solução |
|---|---|
| `dash_integracoes_config` guarda tokens em **TEXT puro** | Token Focus em coluna `BYTEA` cifrada com **AES-256-GCM** |
| Chave de criptografia no código | `FOCUS_ENCRYPTION_KEY` em variável de ambiente do Coolify (nunca no Git) |
| Um token por CNPJ (multi-empresa) | `dash_emitentes.focus_token_cifrado` — 1:N com o tenant |
| Troca de ambiente (homolog → prod) | `dash_emitentes.focus_ambiente` — troca sem novo token |
| Nunca logar token | Logger com **redator** para `focus_token`, `X-Internal-Key`, `Authorization` |

### 6.4 Idempotência e estado — máquina de estados

```
RASCUNHO ──enfileira──▶ PROCESSANDO ──webhook ok──▶ AUTORIZADO
    ▲                       │                          │
    │                       ├──webhook erro──▶ REJEITADO ──corrige payload──▶ (requeue, MESMO ref)
    │                       └──sem webhook 48h──▶ (reconciliação GET /{ref})
    │                                                      │
    └────────────── (novo ref, nova tentativa) ◀───────────┘
```

**Regras inegociáveis:**
1. `ref` **nunca** muda para o mesmo documento lógico. Reenvio após rejeição = **mesmo** `ref`.
2. `AUTORIZADO` → `ref` travado. Novo documento = novo `ref`.
3. `CANCELADO` → `ref` **continua travado**.
4. Webhook é a fonte primária de status; `GET /{ref}` é a reconciliação (a cada 30 min para documentos `PROCESSANDO` há mais de 10 min).

### 6.5 Fila `dash_fiscal_queue` — o worker fiscal do middleware

```
GET /api/fiscal/cte/:id/emitir  → INSERT na fila (idempotente)
                                     ↓
                     fiscalQueueJob (setInterval 15s)
                                     ↓
                        focusClient.focusRequest()
                                     ↓
                        UPDATE dash_ctes SET status='PROCESSANDO'
                                     ↓
              webhook → status final + dash_fiscal_eventos
```

- `SELECT ... FOR UPDATE SKIP LOCKED` para múltiplas instâncias sem colisão.
- `proxima_execucao` com backoff exponencial: 30s → 1min → 2min → 5min → 15min.
- `tentativas`/`max_tentativas` (5) → após esgotar, `status='ERRO'` com alerta no dashboard.

---

## 7. Worker (.NET) — os 3 Jobs novos

### 7.1 Configuração (espelha `DashboardApiOptions`)

`ColiseuSales.Worker/Config/TransporteApiOptions.cs`:
```csharp
namespace ColiseuSales.Worker.Config;

public class TransporteApiOptions
{
    public const string Section = "TransporteApi";
    public string BaseUrl { get; set; } = string.Empty;
    public string InternalApiKey { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 30;
    public bool Enabled { get; set; } = false;
    public int SyncIntervalMinutes { get; set; } = 10;
}
```

`appsettings.json`:
```json
"TransporteApi": {
  "Enabled": true,
  "BaseUrl": "https://transporte.coliseusistemas.com.br",
  "InternalApiKey": "COL-...",
  "TimeoutSeconds": 30,
  "SyncIntervalMinutes": 10
}
```

### 7.2 Jobs

| Job | Tabela Firebird (aproximada) | Envia para | Campos |
|---|---|---|---|
| **`SyncTransporteCargaJob.cs`** | `DASH_CARGAS` (view a criar) ou `PEDIDOS`/`NOTA_FISCAL` | `POST /internal/sync/dash_cargas` | `chave_nfe`, número, série, data, valores, peso bruto/líquido, volume, espécie, IDs de remetente/destinatário, regime tributário, CFOP |
| **`SyncTransporteFrotaJob.cs`** | `DASH_VEICULOS` | `POST /internal/sync/dash_veiculos` | placa, RENAVAM, chassi, UF, tipo rodado, tipo carroceria, tara, capacidade kg/m³, RNTRC, proprietário (próprio/TAC), vencimento licenciamento |
| **`SyncTransporteMotoristaJob.cs`** | `DASH_MOTORISTAS` | `POST /internal/sync/dash_motoristas` | CPF, nome, CNH, categoria, validade, contato |

**Padrão a seguir (idêntico ao `SyncDashboardDataJob`):**
```csharp
public sealed class SyncTransporteCargaJob
{
    // FirebirdService + IHttpClientFactory("TransporteApiClient")
    // + IOptions<TransporteApiOptions> + StatusStore + DeltaCacheService
    // + ChangeTrackerService
    public async Task RunAsync(bool force = false, CancellationToken ct = default) { ... }
}
```

**Registro (em `Program.cs`, junto dos demais):**
```csharp
builder.Services.Configure<TransporteApiOptions>(
    builder.Configuration.GetSection(TransporteApiOptions.Section));

builder.Services.AddHttpClient("TransporteApiClient", client => {
    client.BaseAddress = new Uri(baseUrl);
    client.DefaultRequestHeaders.Add("X-Internal-Key", key);
    client.Timeout = TimeSpan.FromSeconds(timeout);
});

builder.Services.AddSingleton<SyncTransporteCargaJob>();
builder.Services.AddSingleton<SyncTransporteFrotaJob>();
builder.Services.AddSingleton<SyncTransporteMotoristaJob>();
```

**Agendamento (em `WorkerService.cs`):**
```csharp
// no loop do timer, junto de _dashboardData
if (now - lastTransporte >= transporteTimer)
{
    tasks.Add(SafeRunAsync(() => _transporteCarga.RunAsync(true, ct), "TransporteCargaSync"));
    tasks.Add(SafeRunAsync(() => _transporteFrota.RunAsync(true, ct), "TransporteFrotaSync"));
    tasks.Add(SafeRunAsync(() => _transporteMotorista.RunAsync(true, ct), "TransporteMotoristaSync"));
}
```

### 7.3 Endpoints de ingestão no middleware

Adicionar ao `TABELAS_MAP` em [sync.js](middleware/src/routes/sync.js):
```js
'dash_cargas':    ['id_firebird','tipo_documento','chave_acesso','numero','serie','data_emissao',
                   'remetente_id','destinatario_id','valor_total','valor_produtos','peso_bruto',
                   'peso_liquido','volume_m3','volumes','especie','produto_predominante',
                   'itens','regime_tributario','cfop','dados_extras'],
'dash_veiculos':  ['id_firebird','placa','renavam','chassi','uf','tipo_rodado','tipo_carroceria',
                   'tara_kg','capacidade_kg','capacidade_m3','tipo_proprietario','rntrc',
                   'cpf_cnpj_proprietario','nome_proprietario','apolice_seguro','venc_licenciamento'],
'dash_motoristas':['id_firebird','cpf','nome','cnh','cnh_categoria','cnh_validade','telefone',
                   'email','data_nascimento','dados_extras'],
```

E um handler dedicado para `dash_cargas`, porque o sync genérico não resolve os **vínculos** (remetente/destinatário por documento). Proposta: o Worker envia as **partes embutidas** no payload e o middleware faz *upsert* de `dash_partes` por `(tenant_id, documento)` antes de gravar a carga.

---

## 8. Telas (React) — SPEC de UX

### 8.1 Mapa de navegação (adiciona ao `Sidebar.tsx`)

```
📦 TRANSPORTE                    [novo grupo]
   ├── /transporte/cargas      Central de Cargas (NF-e do ERP)
   ├── /transporte/ctes        CT-e (lista + wizard)
   ├── /transporte/mdfes       MDF-e (lista + construtor)
   ├── /transporte/contratos   Contratos de Transporte & CIOT
   ├── /transporte/frota       Veículos e Motoristas
   └── /transporte/relatorios  Relatórios fiscais (BI)
```

Permissões: `hasAccess('transporte', 'ctes')` etc., seguindo o padrão de `configuracoes`/`crm` já implementado.

**Registro do módulo de permissão** (obrigatório em [gruposAcesso.js:15](middleware/src/routes/gruposAcesso.js:15) — `DEFAULT_MASTER_PERMISSIONS` **e** `DEFAULT_COMERCIAL_PERMISSIONS`):
```js
transporte: {
  acesso: true,
  submenus: {
    cargas: true, ctes: true, mdfes: true,
    contratos: true, frota: true, relatorios: true, config: true
  }
}
```
> Sem esse registro, `hasAccess('transporte', …)` retorna `false` para todos — inclusive o master — porque o `permissoes_menus` do usuário já vem preenchido e o fallback só dispara quando o objeto está vazio.

### 8.2 Tela 1 — Central de Cargas (`/transporte/cargas`)

**Objetivo:** a fila de trabalho. O operador vê as NF-e que o ERP mandou e escolhe o que emitir.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Central de Cargas                                  [🔄 Sincronizado 2min] │
│  [Busca por chave, número, cliente…]  [Filial ▾] [Período ▾] [Status ▾]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ☐ NF 10425  │ Coliseu Peças    → Auto Peças Sul  │ 1.200 kg │ R$ 8.400 │ PENDENTE │
│  ☐ NF 10426  │ Distribuidora ABC→ Mercado Central │   850 kg │ R$ 5.100 │ PENDENTE │
├─────────────────────────────────────────────────────────────────────────────┤
│  2 selecionadas · 2.050 kg · R$ 13.500                                       │
│  [ Ratear frete ]  [ Emitir CT-e (1 por destinatário) ]  [ Emitir CT-e único ] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Comportamento:**
- Seleção múltipla → barra de ação contextual com o resumo do rateio.
- Ações: **CT-e único** (agrupa tudo num CT-e, tomador = remetente) · **1 CT-e por destinatário** (mais comum) · **Ratear frete** (abre o modal de rateio).
- **Alertas inline**: documento sem IE válida, sem peso, tomador consumidor final (DIFAL), município sem código IBGE.
- Status badges: `PENDENTE` (amarelo) · `EM_CTE` (azul) · `EM_MDFE` (roxo) · `DESPACHADA` (verde) · `CANCELADA` (cinza).

### 8.3 Tela 2 — Wizard de CT-e (`/transporte/ctes/novo`)

**Wizard de 5 passos, alimentado pelo dicionário dinâmico:**

| Passo | Conteúdo | Campos dinâmicos |
|---|---|---|
| **1. Emissor & Partes** | Escolha do emitente (CNPJ/token), tomador (papéis do cliente), identificação da operação | `cnpj_emitente`, `natureza_operacao`, `cfop`, `tipo_servico`, `modal`, `tipo_documento` |
| **2. Percurso** | UF/município de início e fim, datas, retirada | `codigo_municipio_inicio`, `municipio_inicio`, `uf_inicio`, `codigo_municipio_fim`, `municipio_fim`, `uf_fim`, `retirar_mercadoria` |
| **3. Valores & Rateio** | Componentes do frete (array editável), taxa, valor a receber | `valor_total`, `valor_receber`, `componentes_valor[]` |
| **4. Tributos** | ICMS, FCP, DIFAL — com **cálculo automático** via `dash_regras_fiscais` | `icms_situacao_tributaria`, `icms_base_calculo`, `icms_aliquota`, `icms_valor`, `fcp_*`, `particula_fcp_*` |
| **5. Carga & Validação** | NF-e vinculadas, quantidades, produto predominante, seguro, responsável técnico | `nfes[]`, `quantidades[]`, `valor_total_carga`, `produto_predominante`, `seguros_carga[]` |

**Componentes do frete (array editável):** `FRETE_PESO` · `FRETE_VALOR` · `PEDAGIO` · `GRIS` · `ADEME` · `DIRECAO` · `REGAIS` · `TAXA_ADMINISTRACAO` · `OUTROS` — com **dropdown pesquisável** e valor numérico.

**Barra de status do wizard (cabeçalho fixo):**
```
● Emissor  ● Partes  ● Percurso  ● Valores  ○ Tributos  ○ Carga   [Revalidar] [Emitir CT-e]
```

**"Revalidar"** chama `POST /api/fiscal/cte/validar` → **não consome cota da Focus**; valida localmente (obrigatoriedade, códigos IBGE, formato de documento, coerência de valores) e destaca os erros no formulário. Só "Emitir" chama a Focus.

**Pós-envio:** redireciona para a ficha do CT-e com o selo de status e o `ref` gerado.

### 8.4 Tela 3 — Ficha do CT-e (`/transporte/ctes/:id`)

- Cabeçalho: status, chave de acesso, `ref`, emitente, valores.
- **Linha do tempo fiscal**: Rascunho → Enfileirado → Processando → Autorizado (com nº de protocolo) → Evento/Cancelado.
- **Painel de rejeição** (quando REJEITADO): `status_sefaz`, `mensagem_sefaz`, e a lista `erros[]` da Focus, cada um clicável apontando o campo culpado no formulário.
- Abas: **Dados** (payload formatado) · **NF-e vinculadas** · **Eventos** (`dash_fiscal_eventos`) · **XML** (link) · **DACTE** (link) · **JSON bruto**.
- Ações: `Cancelar` (abre modal exigindo justificativa de 15–255 caracteres, coerente com a regra da Focus) · `Carta de Correção` · `Reenviar` (só se REJEITADO, **mesmo `ref`**).

### 8.5 Tela 4 — Construtor de MDF-e (`/transporte/mdfes/novo`)

**Wizard de 4 passos:**

| Passo | Conteúdo |
|---|---|
| **1. Emitente & Modal** | Emitente, `tipo_emitente` (Prestador / Carga própria / CT-e globalizado), `tipo_transporte` (ETC / TAC / CTC), `modal` |
| **2. Percurso** | UF início/fim, data prevista, **UF de percurso** (array até 25, com sugestão geográfica), municípios de carregamento (1–50) e descarregamento (1–100) |
| **3. Veículo & Motorista** | Tração (com **capacidade vs. peso total alocado** em tempo real), reboques, condutor, lacres, produtos perigosos, seguro da carga |
| **4. Documentos & Totais** | Marcar CT-e/NF-e a incluir (lista com filtros), totalizadores calculados, canal verde, **referência ao contrato de transporte/CIOT** |

**Indicador de capacidade (destaque visual):**
```
Tração ABC-1D23  │  Capacidade 18.000 kg  │  Alocado 12.400 kg  │  ▓▓▓▓▓▓▓▓░░ 69%  ⚠
Reboque RST-4E56 │  Capacidade 25.000 kg  │  Alocado  0 kg      │  ░░░░░░░░░░  0%
```
> Vermelho se > 100% (bloqueia a emissão com aviso de fiscalização).

**Ações pós-emissão:** `Incluir condutor` (modal: nome + CPF) · `Incluir DF-e` (modal: protocolo + município de carregamento + documentos) · `Encerrar` (modal: data + UF + município) · `Cancelar`.

### 8.6 Tela 5 — Contratos de Transporte & CIOT (`/transporte/contratos`)

- Lista de contratos com valores, tipo de operação, transportador, veículo vinculado e status do CIOT.
- **Wizard de contrato:** contratante → transportador (TAC/ETC) → rota → valores (frete, adiantamento, pedágio, combustível) → quitação (PIX / depósito / cartão frete) → veículo.
- **Validação de piso mínimo** (regras ANTT por tipo de operação) com o valor calculado e o piso aplicável:
  ```
  Frete declarado:  R$ 1.200,00
  Piso mínimo:      R$ 1.486,00  (ANTT · Carga Lotação · preço de referência)
  ⛔ Abaixo do piso — o CIOT não poderá ser gerado
  ```
- Botão **"Gerar payload CIOT"** → produz o JSON no formato da API da ANTT/Instituição, com botão de **copiar** e **download**, e campo para colar o código do CIOT retornado.
- ⚠️ Aviso explícito na tela: *"O ColiseuTransporte **não emite** o CIOT — a emissão é da ANTT ou da Instituição de Pagamento do cliente."*

### 8.7 Tela 6 — Frota (`/transporte/frota`)

- Tabs: **Veículos** | **Motoristas**.
- Veículos: placa, tipo, capacidade, RNTRC, proprietário, validade do licenciamento, apólice.
- Motoristas: nome, CPF, CNH (categoria + validade), contato.
- Alertas: CNH a vencer em 30 dias, CNH vencida, veículo sem RENAVAM, RNTRC irregular.

### 8.8 Tela 7 — Configuração Fiscal (`/transporte/config`)

- **Emitentes**: lista de CNPJ, token Focus (mascarado), ambiente (homologação/produção), certificado, RNTRC.
- **Campos dinâmicos**: editor visual por documento — adicionar campo, definir rótulo, tipo, condição, mapeamento Focus, obrigatoriedade, ordem, escopo. **Sem deploy.**
- **Regras fiscais**: tabela por UF origem × destino × tipo de serviço com CFOP, CST, alíquotas, FCP, partilha e critério de rateio.

### 8.9 Design

Reusar integralmente o design system existente: tokens do [tailwind.config.js](frontend/tailwind.config.js) (`brand`, `bg`, `text`, `success`/`warning`/`danger`), fontes Inter/Poppins, `DataTable`, `KPICard`, `ChartCard`, `Modal` do padrão atual. Componentes novos a criar: `DynamicForm`, `DynamicField`, `StatusBadge`, `Wizard`, `Timeline` (fiscal), `CapacityGauge`, `DocViewer` (XML/PDF embutido).

---

## 9. API do middleware (rotas novas)

```
# ── Dicionário de campos dinâmicos ────────────────────────────────
GET    /api/fiscal/dicionario/:documento       → campos + condições
POST   /api/fiscal/dicionario                  → cria campo
PATCH  /api/fiscal/dicionario/:id              → edita
DELETE /api/fiscal/dicionario/:id              → remove (soft)

# ── CT-e ─────────────────────────────────────────────────────────
GET    /api/fiscal/ctes                        → lista (filtros, paginação)
GET    /api/fiscal/ctes/:id                    → detalhe + eventos
POST   /api/fiscal/ctes                        → cria rascunho
PATCH  /api/fiscal/ctes/:id                    → edita rascunho
POST   /api/fiscal/ctes/:id/validar            → valida localmente (sem Focus)
POST   /api/fiscal/ctes/:id/emitir             → enfileira (idempotente)
POST   /api/fiscal/ctes/:id/cancelar           → DELETE /cte/{ref}
POST   /api/fiscal/ctes/:id/carta-correcao     → carta de correção
POST   /api/fiscal/ctes/:id/evento             → evento CT-e
POST   /api/fiscal/ctes/emitir-lote            → emite N CT-e em lote

# ── MDF-e ────────────────────────────────────────────────────────
GET    /api/fiscal/mdfes                       → lista
GET    /api/fiscal/mdfes/:id                   → detalhe
POST   /api/fiscal/mdfes                       → cria rascunho
PATCH  /api/fiscal/mdfes/:id                   → edita rascunho
POST   /api/fiscal/mdfes/:id/emitir            → enfileira
POST   /api/fiscal/mdfes/:id/cancelar          → DELETE /mdfe/{ref}
POST   /api/fiscal/mdfes/:id/incluir-condutor  → inclusao_condutor
POST   /api/fiscal/mdfes/:id/incluir-dfe       → inclusao_dfe
POST   /api/fiscal/mdfes/:id/encerrar          → encerrar

# ── Cargas ───────────────────────────────────────────────────────
GET    /api/fiscal/cargas                      → lista
POST   /api/fiscal/cargas/rateio              → simula rateio (pré-visualização)
POST   /api/fiscal/cargas/gerar-ctes          → gera N rascunhos a partir da seleção

# ── Contratos + CIOT ────────────────────────────────────────────
GET    /api/fiscal/contratos
POST   /api/fiscal/contratos
GET    /api/fiscal/contratos/:id
POST   /api/fiscal/contratos/:id/gerar-ciot    → gera payload ANTT
PATCH  /api/fiscal/contratos/:id/ciot         → grava código retornado

# ── Frota ────────────────────────────────────────────────────────
GET    /api/fiscal/veiculos       POST /api/fiscal/veiculos       PATCH /api/fiscal/veiculos/:id
GET    /api/fiscal/motoristas     POST /api/fiscal/motoristas     PATCH /api/fiscal/motoristas/:id

# ── Regras fiscais ───────────────────────────────────────────────
GET    /api/fiscal/regras         POST /api/fiscal/regras         PATCH /api/fiscal/regras/:id

# ── Emitentes ────────────────────────────────────────────────────
GET    /api/fiscal/emitentes      POST /api/fiscal/emitentes      PATCH /api/fiscal/emitentes/:id
POST   /api/fiscal/emitentes/:id/testar-token   → valida o token contra a Focus

# ── Webhook (público) ───────────────────────────────────────────
POST   /api/webhooks/focus        → callback da Focus (valida `ref` + `cnpj_emitente`)
```

**Todas as rotas** sob `app.use('/api', requireWebJwt)` → herdam multi-tenant + rate limit automaticamente. O webhook fica **fora**, montado antes, como `asaasRouter`/`coraRouter`.

---

## 10. Publicação no servidor (Coolify / VPS `2.24.82.19`)

### 10.1 Estado atual (lido do repositório; **leitura do servidor bloqueada pelo classificador de segurança**)

| Item | Valor |
|---|---|
| Host | `2.24.82.19` (VPS do Coolify; `177.39.17.7` = servidor do banco) |
| Domínio | `https://transporte.coliseusistemas.com.br` |
| Build Pack | **Docker Compose** (definido no painel) |
| Serviços | `dashboard-frontend` (Nginx:80) + `middleware` (Node:3200) |
| Rede | `coolify` (external) — o Postgres do Coolify está nessa rede |
| Banco | `PG_HOST`/`PG_DATABASE` vindos de variáveis de ambiente do Coolify |
| Healthcheck | `GET /health/liveness` a cada 30s |

> ⚠️ **Não consegui inspecionar o servidor ao vivo** — o classificador de segurança do Claude Opus 5 bloqueou SSH e leitura de produção. Os dados acima vêm dos scripts de deploy versionados no repositório. **Antes de implementar, é preciso confirmar**: versão do Postgres, RAM/CPU disponível, volume do Postgres, e se `coliseu_dashboard` (não `nexus_dashboard`) é o database real em produção.

### 10.2 Variáveis de ambiente novas (adicionar no Coolify)

```
# ── Focus NFe ──────────────────────────────────────────────────
FOCUS_ENCRYPTION_KEY=<32 bytes base64>        # AES-256-GCM — NUNCA no Git
FOCUS_WEBHOOK_TOKEN=<segredo>                 # valida callbacks recebidos
FOCUS_RATE_LIMIT_POR_MINUTO=100

# ── Transporte ─────────────────────────────────────────────────
TRANSPORTE_PISO_MINIMO_CACHE_TTL=3600
TRANSPORTE_WEBHOOK_URL=https://transporte.coliseusistemas.com.br/api/webhooks/focus
```

### 10.3 Healthcheck e observabilidade

- Estender `/health/readiness` para checar também: fila fiscal com documentos travados em `PROCESSANDO` há > 30 min, token Focus do tenant padrão acessível, conexão com a Focus respondendo.
- **Alertas**: rejeição acima de X% nas últimas 24h · fila com erro · `PROCESSANDO` sem webhook · CT-e autorizado sem MDF-e vinculado.

### 10.4 Ordem de deploy (sem quebrar produção)

```
1. Merge das migrations 035–046 + seeds (aplicadas automaticamente no boot)
   └─ As tabelas novas são criadas vazias → zero impacto no sistema atual
2. Deploy do middleware (rotas novas + serviço Focus + fila)
   └─ Nenhuma rota existente muda de comportamento
3. Deploy do frontend (rotas /transporte/* + menu)
   └─ Menu novo só aparece para quem tem permissão
4. Configurar emitentes + tokens Focus (pela tela, não por migration)
5. Teste em homologação: 1 CT-e → 1 MDF-e → incluir condutor → incluir DF-e → encerrar
6. Ativar o Worker (TransporteApi.Enabled = true)
7. Trocar para produção (focus_ambiente = 'producao') depois do homologação verde
```

### 10.5 Riscos de deploy

| Risco | Mitigação |
|---|---|
| Migration roda no boot e falha → app não sobe | Migrations em `try/catch` (já é o padrão em [index.js](middleware/src/index.js)) + `schema.sql` idempotente |
| 2 workers = 2 loops de migration | `pg_advisory_lock` no boot |
| Fila fiscal duplica emissão | `UNIQUE(tenant_id, emitente_id, ref)` + `ref` imutável |
| Coolify rebuild = downtime | `restart: unless-stopped` já configurado; healthcheck garante reentrada no LB |
| Rate limit da Focus estourado | Contador em memória por token + backoff + webhooks |

---

## 10.6 Saneamento de segurança (F0 — bloqueante)

Os itens abaixo **não podem esperar**: qualquer um deles sozinho já é um incidente.

| # | Achado | Onde | Ação |
|---|---|---|---|
| **S1** | Senha root da VPS `2.24.82.19` (valor literal no arquivo) | [check_real_vps.py](check_real_vps.py), [check_coolify_db.py](check_coolify_db.py) e ~15 scripts | **Rotacionar** a senha no servidor; remover de todos os scripts; **limpar o histórico Git** (`git filter-repo` ou BFG) |
| **S2** | Senha root `177.39.17.7` + `PGPASSWORD` do Postgres (valores literais nos arquivos) | [find_db_host.py](find_db_host.py), [check_coolify_postgres.py](check_coolify_postgres.py) | Rotacionar; usar `.pgpass`/variável de ambiente do Coolify |
| **S3** | Senha do admin em texto puro no boot (valor literal) | [index.js:31](middleware/src/index.js:31) — `admin@silenus.com.br` | Ler de `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` no ambiente; **remover o hardcode** |
| **S4** | Senha de seed de usuário em hash no `schema.sql` (valor literal) | [schema.sql](middleware/src/db/schema.sql) (seed `dash_usuarios`) | Mover para seed explícito pós-deploy; trocar por segredo de ambiente |
| **S5** | `IDENTITY_INTERNAL_KEY` e `INTERNAL_API_KEY` com **mesmo valor padrão** no `docker-compose.yaml` | [docker-compose.yaml](docker-compose.yaml) | Valores **distintos**, ambos vindos do Coolify (sem default no repositório) |
| **S6** | `POST /api/sync/:tabela` sem autenticação | [app.js:110](middleware/src/app.js:110) | Mover `app.use('/api/sync', requireInternalAuth, syncRouter)` **ou** trocar por `requireWebJwt` + `requireInternalAuth` nas rotas internas |
| **S7** | `.gitignore` não cobre os scripts de infra | [.gitignore](.gitignore) | Adicionar `scratch/`, `check_*.py`, `find_*.py`, `ssh_cmd*.py`, `query_*.py` |
| **S8** | CORS com `origin: '*'` quando `ALLOWED_ORIGINS` está vazio | [app.js](middleware/src/app.js) | Nunca `'*'` em produção — falhar rápido no boot se `NODE_ENV=production` e sem allowlist |

**Ordem:** rotacionar os segredos **primeiro** (o repositório pode estar clonado), depois limpar o histórico, depois remover os arquivos do tracking.

---

## 11. Roadmap por fases

| Fase | Entregável | Depende de | Esforço |
|---|---|---|---|
| **F0 · Saneamento** (fazer **antes**) | Rotacionar credenciais expostas · remover segredos do Git · `requireInternalAuth` em `/api/sync/:tabela` · remover auto-seed de senha do [index.js](middleware/src/index.js) · advisory lock nas migrations · `.gitignore` para `*.py` de infra | — | 1 dia |
| **F1 · Fundação fiscal** | Migrations 035–046 · seeds do dicionário · `dash_emitentes` (com token cifrado) · `focusClient` + `focusAuth` · `refBuilder` · rotas de emitente e dicionário | F0 | 3 dias |
| **F2 · CT-e** | `cteService` · `payloadBuilder` · `cteValidator` · `icmsService` · `rateioService` · fila `dash_fiscal_queue` · `fiscalQueueJob` · webhook Focus · telas de carga + wizard CT-e + ficha CT-e | F1 | 6 dias |
| **F3 · MDF-e** | `mdfeService` · rotas emitir/incluir-condutor/incluir-DFe/encerrar · tela construtor + capacidade · ficha MDF-e | F2 | 5 dias |
| **F4 · Contrato & CIOT** | `ciotService` (gerador de payload ANTT) · validação de piso mínimo · tela de contratos | F3 | 4 dias |
| **F5 · Worker** | `SyncTransporteCargaJob` / `FrotaJob` / `MotoristaJob` · `TransporteApiOptions` · views Firebird · registro e agendamento | F2 | 4 dias |
| **F6 · Robustez** | RLS · suíte de testes (node:test) · reconciliação periódica · relatórios fiscais | F5 | 5 dias |
| **F7 · Go-live** | Homologação completa · checklist SEFAZ por UF · carga de frota real · monitoramento | F6 | 3 dias |

**Total: ~31 dias de trabalho.** Fase F0 é inegociável.

---

## 12. Riscos técnicos registrados

| ID | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| **R-FISC-01** | Schema do MDF-e da Focus (`veiculo_tracao` completo, `vale_pedagio`, `infMDFeSupl`) não está tipado na doc pública | Alta | Médio | Validar campo a campo em **homologação** antes da F3 |
| **R-FISC-02** | Payload do CT-e pode ter mudado (IBS/CBS — Reforma Tributária) | Média | Alto | Manter `payload JSONB` íntegro + teste de contrato a cada atualização da Focus; não parsear só campos conhecidos |
| **R-FISC-03** | Rejeição por divergência de ponderação (`qCarga` × itens da NF-e) | Alta | Alto | Validar peso no wizard contra a soma das NF-e vinculadas |
| **R-FISC-04** | Piso mínimo ANTT muda; CIOT rejeitado | Média | Médio | Tabela `dash_regras_fiscais` parametrizável + cache com TTL; nunca codificar o piso no código |
| **R-FISC-05** | Rate limit da Focus (100/min) | Média | Médio | Webhook-first + contador por token + fila com backoff |
| **R-FISC-06** | Webhook perdido (48h) | Baixa | Médio | Reconciliação por `GET /{ref}` a cada 30 min para `PROCESSANDO` > 10 min |
| **R-TEC-01** | `ref` regenerado por engano → duplicidade fiscal | Baixa | **Crítico** | `ref` = `{cnpj}{id}` **imutável** após criação; UNIQUE por `(tenant, emitente, ref)`; `payload` nunca recalcula `ref` |
| **R-TEC-02** | Migração automática no boot falha silenciosamente | Média | Alto | Advisory lock + log estruturado + endpoint `/api/fiscal/diagnostico` que valida o schema |
| **R-TEC-03** | Vazamento entre tenants em tabela nova | Baixa | **Crítico** | RLS (F6) + **todos** os índices iniciados por `tenant_id` + query de auditoria automatizada |
| **R-TEC-04** | Migração de 40 colunas em tabela grande trava | Baixa | Médio | `ADD COLUMN` sem `DEFAULT` (Postgres 11+ não reescreve) |

---

## 13. Decisões que precisam da sua confirmação

| # | Decisão | Recomendação |
|---|---|---|
| **D1** | **CIOT**: emitir de verdade (exige contrato com Instituição de Pagamento + homologação ANTT) ou gerar o payload e entregar ao cliente? | **Gerar o payload** (escopo viável; emissão direta exige Certification e vários meses) |
| **D2** | **Multiempresa**: um `tenant` = uma transportadora (com N CNPJs) ou um `tenant` = um CNPJ? | **Um tenant = uma transportadora, N emitentes** (o `dash_emitentes` já suporta) |
| **D3** | **Rateio**: o cálculo do frete por CT-e é responsabilidade do sistema ou o operador informa o valor? | **Ambos** — o sistema sugere (peso/valor/volume/combinado, parametrizável) e o operador **confirma/ajusta** |
| **D4** | **Focus**: multi-empresa na mesma conta Focus (token por CNPJ) ou uma conta Focus por tenant? | **Conta única, token por CNPJ** — é o modelo nativo da Focus e simplifica o onboarding |
| **D5** | **Canal verde (ANTT)**: incluir seleção automática de canal verde em toda MDF-e? | **Pendente como padrão, selecionável por rota** (a seleção é determinística por UF e tipo de carga) |
| **D6** | **Ordem**: começar pela F0 (sanear) + F1–F2 (CT-e) ou incluir o Worker (F5) já na primeira entrega? | **CT-e primeiro**, Worker depois — o CT-e entrega valor sem depender do Worker (pode-se emitir NF-e manual) |

---

## 14. Referências

**Focus NFe (docs oficiais)**
- Índice completo: https://doc.focusnfe.com.br/llms.txt
- Emitir CT-e: https://doc.focusnfe.com.br/reference/emitir_cte.md
- Consultar CT-e: https://doc.focusnfe.com.br/reference/consultar_cte_cte_os.md
- Cancelar CT-e: https://doc.focusnfe.com.br/reference/cancelar_cte_cte_os.md
- Emitir MDF-e: https://doc.focusnfe.com.br/reference/emitir_mdfe.md
- Encerrar MDF-e: https://doc.focusnfe.com.br/reference/encerrar_mdfe.md
- Incluir condutor: https://doc.focusnfe.com.br/reference/incluir_condutor_mdfe.md
- Incluir DF-e: https://doc.focusnfe.com.br/reference/incluir_dfe_mdfe.md
- Webhooks: https://doc.focusnfe.com.br/docs/utilizando-webhooks.md
- Rate limit: https://doc.focusnfe.com.br/docs/cuidado-com-o-rate-limit.md
- `ref`: https://doc.focusnfe.com.br/reference/referencia.md
- Layout TPL CT-e: https://campos.focusnfe.com.br/cte/ConhecimentoTransporteXML.html
- Layout TPL MDF-e: https://campos.focusnfe.com.br/mdfe/MDFeXML.html

**ANTT / CIOT**
- CIOT para todos: https://www.gov.br/antt/pt-br/assuntos/cargas/ciot-para-todos-1
- Instituições de Pagamento: https://www.gov.br/antt/pt-br/assuntos/cargas/pagamento-eletronico-de-fretes-pef-ciot/instituicoes-de-pagamento-eletronico-de-frete
- Consulta pública de CIOT: https://consultapublica.antt.gov.br/Site/ConsultaCIOT.aspx

**Código interno**
- Schema atual: [middleware/src/db/schema.sql](middleware/src/db/schema.sql)
- Migrations: [middleware/src/db/migrations/](middleware/src/db/migrations/)
- Ingestão do Worker: [middleware/src/routes/sync.js](middleware/src/routes/sync.js)
- Montagem das rotas: [middleware/src/app.js](middleware/src/app.js)
- Cliente Postgres: [middleware/src/db/postgres.js](middleware/src/db/postgres.js)
- Boot + migrations: [middleware/src/index.js](middleware/src/index.js)
- Sidebar/permissões: [frontend/src/layouts/v3.0/Sidebar.tsx](frontend/src/layouts/v3.0/Sidebar.tsx)
- Rotas do frontend: [frontend/src/App.tsx](frontend/src/App.tsx)
- Deploy: [docker-compose.yaml](docker-compose.yaml) · [docker-compose.local.yml](docker-compose.local.yml)
- Worker (jobs existentes): `../ColiseuSales/worker/ColiseuSales.Worker/Jobs/SyncDashboardDataJob.cs`

---

*Documento gerado em 24/10/2026 com base em auditoria do código do repositório, leitura das specs oficiais da Focus NFe e pesquisa sobre a regulamentação ANTT do CIOT. Atualizar a cada fase.*
