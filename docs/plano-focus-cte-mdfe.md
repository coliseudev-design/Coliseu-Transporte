# Plano de Implementação: Focus NFe v2 (CT-e 57, CT-e OS 67 e MDF-e 58) + Configurações Homologação/Produção

## 1. Objetivo
Deixar o sistema 100% preparado para emissão de **CT-e (Modelo 57)**, **CT-e OS (Modelo 67)** e **MDF-e (Modelo 58)** via API **Focus NFe v2**, permitindo que o usuário configure os tokens de **Homologação** e **Produção** e alterne o ambiente diretamente em **Configurações (`/config-integracoes` -> Fiscal)** ou em **Dados da Empresa / Emitentes**, com sincronização automática entre ambos e preenchimento automático de participantes a partir das NF-es vinculadas.

## 2. Escopo das Alterações

### 2.1 Banco de Dados (`040_focus_config_e_participantes_cte_mdfe.sql` + Auto-Migration)
- **`dash_integracoes_config`**:
  - `focus_token_homologacao`, `focus_token_producao`, `focus_ambiente` (`homologacao` | `producao`)
  - `focus_regime_tributario`, `focus_rntrc`, `focus_serie_cte`, `focus_serie_mdfe`, `focus_cfop_padrao`, `focus_natureza_padrao`, `focus_aliquota_icms_padrao`
  - `focus_codigo_municipio`, `focus_municipio`, `focus_uf`
- **`dash_emitentes`**:
  - `focus_token_homologacao`, `focus_token_producao`, `regime_tributario`, `cfop_padrao_cte`, `natureza_padrao_cte`, `aliquota_icms_padrao`, `complemento`, `email`
- **`dash_ctes`**:
  - `remetente_dados`, `destinatario_dados`, `expedidor_dados`, `recebedor_dados`, `tomador_dados` (JSONB)
  - `quantidades_carga`, `documentos_json`, `modal_os_dados`, `componentes_valor` (JSONB)

### 2.2 Cliente Focus NFe v2 (`middleware/src/services/focus/focusClient.js`)
- Seleção automática do token conforme o ambiente ativo (`producao` usa `focus_token_producao || focus_token`, `homologacao` usa `focus_token_homologacao || focus_token`).
- Suporte completo a:
  - **CT-e (`/v2/cte`)**: Emissão, Consulta (`?completa=1`), Cancelamento, Carta de Correção, Prestação em Desacordo, Insucesso de Entrega, Cancelamento de Insucesso de Entrega, Envio de E-mail e Reenvio de Webhook.
  - **CT-e OS (`/v2/cteos`)**: Emissão, Consulta, Cancelamento, Carta de Correção, Prestação em Desacordo e Reenvio de Webhook.
  - **MDF-e (`/v2/mdfe`)**: Emissão, Consulta (`?completa=1`), Encerramento, Inclusão de Condutor, Inclusão de DF-e, Cancelamento e Reenvio de Webhook.

### 2.3 Serviço de Emissão (`middleware/src/services/transporteService.js`)
- **`emitirCte`**:
  - Mapeamento completo do Emitente, Remetente, Destinatário, Expedidor, Recebedor e Tomador (`tomador = 0..4`), com fallback automático para os dados da NF-e (`dash_cargas` / `dados_nfe`) e `dash_partes`.
  - Mapeamento de todas as CSTs de ICMS (`00`, `20`, `40`, `41`, `51`, `60`, `90`, `SN` Simples Nacional), DIFAL/FCP e Reforma Tributária (IBS/CBS).
  - Suporte a CT-e Normal, Complementar, Substituição, Simplificado, Globalizado e CT-e OS (Modelo 67).
- **`emitirMdfe`**:
  - Mapeamento completo do Emitente, `municipios_carregamento`, `percurso` (UFs de percurso), e agrupamento obrigatório de CT-es e NF-es dentro de `municipios_descarregamento`.
  - Mapeamento de `modal_rodoviario` (`rntrc`, `veiculo_tracao`, `condutor`, `proprietario` TAC/terceiro, `veiculo_reboque`, `ciot`, `vale_pedagio`, `contratantes`, `pagamento_frete`), `seguros`, `produto_predominante`, `lacres` e `autorizados_xml`.

### 2.4 Rotas Backend (`configuracoes.js` & `transporte.js`)
- Sincronização bidirecional entre `dash_integracoes_config` e `dash_emitentes`.
- Endpoint `POST /api/transporte/focus/testar` para validar token e conectividade no ambiente selecionado.
- Persistência integral de todos os campos nos endpoints `POST/PUT /api/transporte/ctes` e `POST/PUT /api/transporte/mdfes`, além das rotas de eventos fiscais.

### 2.5 Frontend (`ConfigIntegracoes.tsx`, `DadosEmpresaPage.tsx`, `EmitentesPage.tsx`, `CteWizardPage.tsx`, `MdfeWizardPage.tsx`, `CtesPage.tsx`, `MdfesPage.tsx`)
- Aba **Fiscal** em `/config-integracoes` com configuração completa de Homologação e Produção, tokens separados, teste de conexão e URL de Webhook.
- Preenchimento automático e edição de Remetente/Destinatário/Expedidor/Recebedor no Wizard de CT-e a partir da NF-e selecionada.
- Suporte completo a eventos fiscais e Municípios de Descarregamento no Wizard de MDF-e.
