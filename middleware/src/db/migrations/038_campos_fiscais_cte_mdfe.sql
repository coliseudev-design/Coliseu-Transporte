-- ===================================================================
-- COLISEU TRANSPORTE — Campos fiscais faltantes (CT-e e MDF-e)
-- Migration: 038_campos_fiscais_cte_mdfe.sql
-- ===================================================================
-- Baseado no prompt de especificação "Prompts de sistema — Emissor fiscal
-- CTe, MDFe e CIOT" (Simplifique/Contmatic como referência de mercado).
-- Nenhuma regra tributária é fixada em código: tudo é dado de configuração.

-- ─────────────────────────────────────────────────────────────
-- CT-e: campos das abas Dados / Serviços e Impostos / Carga / Rodoviário
-- ─────────────────────────────────────────────────────────────
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS cfop VARCHAR(8) DEFAULT '5353';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS finalidade VARCHAR(3) DEFAULT '1';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS formato_dacte VARCHAR(10) DEFAULT 'retrato';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS modelo_cte VARCHAR(15) DEFAULT 'normal';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS retirar_mercadoria BOOLEAN DEFAULT TRUE;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS retirada_descricao TEXT;

-- Componentes do frete: lista editável (frete peso, frete valor, pedágio, GRIS, taxa admin, outros)
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS componentes_valor JSONB DEFAULT '[]'::jsonb;

-- Tributos da Reforma (IBS/CBS) — alíquotas com vigência futura configurável
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS aliquota_ibs NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS aliquota_cbs NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS codigo_situacao_fiscal VARCHAR(20);
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS aliquota_fcp NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS part_fcp_origem NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS part_fcp_destino NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS part_icms_origem NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS part_icms_destino NUMERIC(7,4) DEFAULT 0;

-- Carga
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS produto_predominante VARCHAR(255);
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS outras_caracteristicas_carga TEXT;
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS data_prevista_entrega DATE;

-- Seguro da carga
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS seguro_responsavel VARCHAR(2) DEFAULT '1';
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS seguro_nome VARCHAR(255);
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS seguro_apolice VARCHAR(40);
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS seguro_averbacao VARCHAR(40);

-- Observações (aba 6)
ALTER TABLE dash_ctes ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- ─────────────────────────────────────────────────────────────
-- MDF-e: campos das etapas Dados / Rodoviário / Pagamento / Docs / Seguros
-- ─────────────────────────────────────────────────────────────
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS tipo_emitente VARCHAR(2) DEFAULT '1';
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS tipo_transporte VARCHAR(2) DEFAULT '1';
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS ufs_percurso JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS municipios_carregamento JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS municipios_descarregamento JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS data_inicio_viagem TIMESTAMPTZ;
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS informacao_adicional TEXT;

-- Pagamento de frete (obrigatório desde a NT 2501)
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS pagto_frete JSONB DEFAULT '[]'::jsonb;

-- Contratantes
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS contratantes JSONB DEFAULT '[]'::jsonb;

-- Seguros
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS seguros JSONB DEFAULT '[]'::jsonb;

-- Produtos predominantes (NCM obrigatório)
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS produtos_predominantes JSONB DEFAULT '[]'::jsonb;

-- Lacre e autorizações de download
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS lacres JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS pessoas_autorizadas JSONB DEFAULT '[]'::jsonb;

-- Veículo: dados completos do veículo (tara, capacidade, tipo rodado/carroceria)
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_tara_kg NUMERIC(12,3);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_capacidade_kg NUMERIC(12,3);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_capacidade_m3 NUMERIC(12,3);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_tipo_rodado VARCHAR(4);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_tipo_carroceria VARCHAR(4);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_renavam VARCHAR(20);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS veiculo_uf VARCHAR(2);
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS reboques JSONB DEFAULT '[]'::jsonb;

-- Condutores múltiplos (inclusão de condutor durante a viagem)
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS condutores JSONB DEFAULT '[]'::jsonb;

-- Vale-pedágio
ALTER TABLE dash_mdfes ADD COLUMN IF NOT EXISTS vale_pedagio JSONB DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- Regras fiscais: vigência de data para IBS/CBS (alíquotas de transição expiram)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS aliquota_ibs NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS aliquota_cbs NUMERIC(7,4) DEFAULT 0;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS codigo_situacao_fiscal VARCHAR(20);
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS vigente_de DATE DEFAULT CURRENT_DATE;
ALTER TABLE dash_regras_fiscais ADD COLUMN IF NOT EXISTS vigente_ate DATE;
