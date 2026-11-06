# Plano de Ativação Fiscal Focus NFe v2 — Coliseu Transporte

## Objetivo
Ativar de ponta a ponta o módulo de documentos fiscais do **Coliseu Transporte** integrado à API oficial **Focus NFe v2**, contemplando:
1. **Provisionamento Automático Software House (`/v2/empresas`)** usando o Token Principal da conta parceira (`Coliseu Sistemas`), com opção híbrida de tokens manuais.
2. **Sincronização Automática de Certificados Digitais A1 (`.pfx`/`.p12`)** com extração de validade oficial retornada pela Focus NFe e proteção no cofre `AES-256-GCM`.
3. **Registro Automático de Webhooks Criptográficos (`/v2/hooks`)** para CT-e e MDF-e com cabeçalho `X-Focus-Token`.
4. **Módulo MDe / NF-es Destinadas e Transportadas (`/v2/nfes_recebidas`) + Importador XML de NF-e** na Central de Cargas para alimentar a emissão de CT-e (57), CT-e OS (67) e MDF-e (58).
5. **Painel Super Admin Master** para gestão segura do `FOCUS_MASTER_TOKEN` + UX de provisionamento e troca rápida de ambiente (`Homologação` <-> `Produção`).

---

## Tarefas e Critérios de Aceite

### [x] T1 — Configuração Global, Schema PostgreSQL & Cofre Master (`FOCUS_MASTER_TOKEN`) — CONCLUÍDO
- **Arquivos:** `middleware/src/config/env.js`, `docker-compose.yml`, `middleware/src/db/postgres.js`, `middleware/src/routes/transporte.js`, `middleware/src/middleware/auth.js`
- **Entregas:**
  - Suporte a `FOCUS_MASTER_TOKEN` (e `FOCUS_WEBHOOK_BASE_URL` / `PUBLIC_API_URL`) em `env.js` e `docker-compose.yml`.
  - Tabela `dash_plataforma_config` (`chave`, `valor`, `updated_at`) para persistir o Token Principal da Software House cifrado com `AES-256-GCM` (`enc:v1:...`).
  - Novas colunas em `dash_emitentes` (`focus_sincronizado_em`, `focus_ultimo_erro`, `focus_hooks_ativos`, `mde_ultima_versao`, `inscricao_municipal`, `certificado_valido_ate`) e `dash_certificados` (`focus_sincronizado`, `focus_sincronizado_em`).
  - Endpoints exclusivos Super Admin Master (`requireSuperAdminMaster`):
    - `GET /api/transporte/focus/master-config`
    - `POST /api/transporte/focus/master-config`
    - `POST /api/transporte/focus/master-testar`
- **Verificação:** Segredo Master nunca retornado em texto plano; acesso bloqueado (`403`) para tenants comuns.

### [x] T2 — Expansão Completa do Cliente Oficial Focus NFe v2 (`FocusClient`) — CONCLUÍDO
- **Arquivo:** `middleware/src/services/focus/focusClient.js`
- **Entregas:**
  - Instância Reseller (`FocusClient.forReseller(masterToken)` -> `https://api.focusnfe.com.br`):
    - `listarEmpresas(filtros)` (`GET /v2/empresas`)
    - `consultarEmpresa(id)` (`GET /v2/empresas/{id}`)
    - `criarEmpresa(dados)` (`POST /v2/empresas`)
    - `atualizarEmpresa(id, dados)` (`PUT /v2/empresas/{id}`)
  - Gestão de Webhooks (`/v2/hooks`):
    - `listarHooks()`, `criarHook(dados)`, `excluirHook(hookId)`
  - MDe / NF-es Recebidas (`/v2/nfes_recebidas`):
    - `listarNfesRecebidas({ cnpj, versao, pendente })` capturando headers `x-max-version` e `x-total-count`
    - `consultarNfeRecebida(chave, completa)` (`GET /v2/nfes_recebidas/{chave}?completa=1`)
    - `manifestarNfeRecebida(chave, { tipo, justificativa })` (`POST /v2/nfes_recebidas/{chave}/manifesto`)
  - Normalização de URLs de artefatos (`normalizarUrlArquivo`) e download seguro (`downloadArquivo`) compatível com paths relativos `/arquivos_development/...`, `/arquivos/...` e URLs S3 assinadas.
- **Verificação:** Teste unitário validando métodos Reseller, Hooks, MDe e normalização de URLs.

### [x] T3 — Provisionamento Automático de Empresas, Certificados A1 & Webhooks — CONCLUÍDO
- **Arquivos:** `middleware/src/services/transporteService.js`, `middleware/src/routes/transporte.js`, `middleware/src/app.js`
- **Entregas:**
  - Validação rigorosa de CNPJ (14 dígitos com dígitos verificadores reais), IE, Razão Social, CEP e Município IBGE antes de provisionar na Focus NFe.
  - `TransporteService.provisionarEmpresaFocus(tenantId, emitenteId, opcoes)`:
    - Localiza empresa existente na conta parceira Focus NFe (`focus_empresa_id` ou busca por `cnpj`) e executa `POST /v2/empresas` ou `PUT /v2/empresas/{id}` habilitando `habilita_cte: true`, `habilita_cteos: true`, `habilita_mdfe: true`, `habilita_manifestacao: true`.
    - Envia automaticamente `arquivo_certificado_base64` + `senha_certificado` quando houver Certificado A1 ativo no cofre local e atualiza `valido_ate` / `dias_para_vencer` reais retornados pela Focus NFe.
    - Captura e cifra no cofre `AES-256-GCM` os tokens `token_homologacao` e `token_producao` gerados pela Focus, iniciando novas empresas em `homologacao`.
    - Registra automaticamente os webhooks `cte` e `mdfe` (`/v2/hooks`) com segredo exclusivo por tenant (`focus_webhook_secret` + header `X-Focus-Token`).
  - Integração automática no upload de certificado (`POST /api/transporte/certificados`) e endpoint dedicado `POST /api/transporte/certificados/:id/sincronizar-focus`.
  - Troca rápida de ambiente (`PATCH /api/transporte/emitentes/:id/ambiente`) e proxy autenticado de download de XML/DACTE/DAMDFE (`GET /api/transporte/documentos/:tipo/:id/download/:formato`).
- **Verificação:** Testes automatizados de validação de CNPJ, montagem de payload `/v2/empresas`, persistência cifrada e normalização de URLs de DACTE/DAMDFE/XML.

### [x] T4 — MDe (`/v2/nfes_recebidas`) + Importação XML de NF-e na Central de Cargas — CONCLUÍDO
- **Arquivos:** `middleware/src/services/transporteService.js`, `middleware/src/routes/transporte.js`
- **Entregas:**
  - Parser nativo e seguro de XML de NF-e (`parseNfeXml`) extraindo chave de 44 dígitos, número, série, emissão, emitente/remetente (CNPJ/CPF, IE, endereço, município IBGE, UF), destinatário (CNPJ/CPF, IE, endereço, município IBGE, UF), totais, peso bruto/líquido, volumes, produto predominante e itens.
  - Endpoints MDe e Importação XML:
    - `GET /api/transporte/mde/nfes` (consulta na Focus `/v2/nfes_recebidas` + lista sincronizada)
    - `POST /api/transporte/mde/sincronizar` (busca novas NF-es na SEFAZ via Focus, manifesta Ciência opcionalmente, baixa XML autorizado quando disponível e importa em `dash_cargas`)
    - `POST /api/transporte/mde/:chave/manifestar` (`ciencia`, `confirmacao`, `desconhecimento`, `nao_realizada`)
    - `POST /api/transporte/cargas/importar-xml` (upload em lote de arquivos `.xml` de NF-e direto para `dash_cargas`, atualizando `app.js` `largeJsonParser` para esta rota).
- **Verificação:** Teste automatizado do parser XML NF-e 4.00 e upsert em `dash_cargas`.

### [x] T5 — Interfaces Frontend (`DadosEmpresaPage`, `CertificadosPage`, `CargasPage`, `DocumentosEmitidosPage`, `DocumentoDrawer`) — CONCLUÍDO
- **Arquivos:**
  - `frontend/src/pages/transporte/DadosEmpresaPage.tsx`
  - `frontend/src/pages/transporte/CertificadosPage.tsx`
  - `frontend/src/pages/transporte/CargasPage.tsx`
  - `frontend/src/pages/transporte/DocumentosEmitidosPage.tsx`
  - `frontend/src/components/DocumentoDrawer.tsx`
  - `frontend/src/store/authStore.ts`
- **Entregas (respeitando estritamente o Purple Ban — zero tons roxos/violeta):**
  - `DadosEmpresaPage.tsx`:
    - Card exclusivo **Super Admin Master** (`Conta Parceiro Focus NFe — Coliseu Sistemas`) para configurar e testar o `Token Principal Produção` + URL pública de Webhook.
    - Card **Provisionamento Automático Focus NFe** para a transportadora com status de sincronização, ID Focus, Webhooks ativos, seletor rápido `Homologação` / `Produção`, botão **"Provisionar / Sincronizar na Focus NFe"** e seção recolhível para **Tokens Manuais (Avançado)**.
    - Validação visual de CNPJ de 14 dígitos e consulta automática de CNPJ/CEP para evitar cadastros inválidos.
  - `CertificadosPage.tsx`:
    - Status de sincronização com a Focus NFe, validade real extraída do certificado e botão **"Sincronizar com Focus NFe"**.
  - `CargasPage.tsx`:
    - Botões **"Buscar NF-es SEFAZ (Focus MDe)"** (modal completo de consulta, manifestação de Ciência/Confirmação e importação) e **"Importar XML NF-e"** (upload múltiplo de `.xml`).
  - `DocumentosEmitidosPage.tsx` & `DocumentoDrawer.tsx`:
    - Download confiável de XML, DACTE e DAMDFE usando URL normalizada / endpoint autenticado.

### [x] T6 — Verificação Final, Auditorias e Git Commit & Push — CONCLUÍDO
- Sintaxe Node.js (`node --check`) em todos os arquivos backend.
- Testes automatizados cobrindo `FocusClient`, `parseNfeXml`, validação de CNPJ e criptografia.
- Type-check (`npx tsc --noEmit`) e build de produção (`npm run build`) no frontend com zero erros.
- Scanners `security_scan.py` (0 segredos expostos / 0 padrões perigosos) e `ux_audit.py` (0 violações de Purple Ban).
- Commit descritivo e `git push origin main` no repositório `Coliseu-Transporte.git`.
