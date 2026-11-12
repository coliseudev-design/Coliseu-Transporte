'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const TransporteService = require('../services/transporteService');
const FocusClient = require('../services/focus/focusClient');
const veiculoService = require('../services/veiculoService');
const { requireSuperAdminMaster, isSuperAdminMaster } = require('../middleware/auth');
const {
    decryptSecret,
    maskSecret,
    encryptSecret,
    encryptBuffer,
    resolveSecretForSave
} = require('../utils/cryptoVault');
const {
    consolidarCargasErpTenant,
    consolidarCargasSeNecessario,
} = require('../services/cargaConsolidatorService');
const {
    resolverIbgeMunicipioAsync,
    normalizarUf,
    listarMunicipiosDicionario,
} = require('../utils/ibgeMunicipios');
const {
    EIXOS_VALIDOS,
    calcularPisoMinimoAntt,
    listarCategoriasCargaAntt,
} = require('../utils/anttPisoMinimo');
const {
    PROVEDORES_CIOT_SUPORTADOS,
    CNPJ_PADRAO_IPEF,
    normalizarProtocoloCiot,
    emitirOuRegistrarCiot,
    encerrarCiotContrato,
    estornarFinanceiroCiot,
} = require('../services/ciotProviderService');

let _transporteColsReady = false;
async function ensureTransporteColumns() {
    if (_transporteColsReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_plataforma_config (
                chave VARCHAR(100) PRIMARY KEY,
                valor TEXT,
                updated_by VARCHAR(180),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            ALTER TABLE dash_emitentes
              ADD COLUMN IF NOT EXISTS focus_token_homologacao TEXT,
              ADD COLUMN IF NOT EXISTS focus_token_producao TEXT,
              ADD COLUMN IF NOT EXISTS focus_empresa_id VARCHAR(60),
              ADD COLUMN IF NOT EXISTS focus_sincronizado_em TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS focus_ultimo_erro TEXT,
              ADD COLUMN IF NOT EXISTS focus_hooks_ativos BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS mde_ultima_versao BIGINT DEFAULT 0,
              ADD COLUMN IF NOT EXISTS inscricao_municipal VARCHAR(30),
              ADD COLUMN IF NOT EXISTS certificado_valido_ate TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS regime_tributario VARCHAR(2) DEFAULT '1',
              ADD COLUMN IF NOT EXISTS cfop_padrao_cte VARCHAR(8) DEFAULT '5353',
              ADD COLUMN IF NOT EXISTS natureza_padrao_cte VARCHAR(255) DEFAULT 'PRESTACAO DE SERVICO DE TRANSPORTE',
              ADD COLUMN IF NOT EXISTS aliquota_icms_padrao NUMERIC(7,4) DEFAULT 12.00,
              ADD COLUMN IF NOT EXISTS complemento VARCHAR(120),
              ADD COLUMN IF NOT EXISTS email VARCHAR(255),
              ADD COLUMN IF NOT EXISTS logo_base64 TEXT,
              ADD COLUMN IF NOT EXISTS logo_mime VARCHAR(40) DEFAULT 'image/png',
              ADD COLUMN IF NOT EXISTS logo_atualizada_em TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS logo_focus_sincronizada BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS pis_cofins_modo VARCHAR(20) DEFAULT 'NAO_APURADO',
              ADD COLUMN IF NOT EXISTS pis_cst VARCHAR(2),
              ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC(7,4),
              ADD COLUMN IF NOT EXISTS cofins_cst VARCHAR(2),
              ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC(7,4),
              ADD COLUMN IF NOT EXISTS excluir_icms_base_pis_cofins BOOLEAN DEFAULT TRUE,
              ADD COLUMN IF NOT EXISTS perfil_operacional VARCHAR(30) DEFAULT 'HIBRIDO',
              ADD COLUMN IF NOT EXISTS mdfe_tipo_emitente_padrao VARCHAR(2) DEFAULT '1',
              ADD COLUMN IF NOT EXISTS ciot_provedor VARCHAR(30) DEFAULT 'HOMOLOGACAO_LOCAL',
              ADD COLUMN IF NOT EXISTS ciot_ambiente VARCHAR(20) DEFAULT 'homologacao',
              ADD COLUMN IF NOT EXISTS ciot_integrador_token TEXT,
              ADD COLUMN IF NOT EXISTS ciot_usuario VARCHAR(120),
              ADD COLUMN IF NOT EXISTS ciot_senha TEXT,
              ADD COLUMN IF NOT EXISTS ciot_cnpj_ipef VARCHAR(14);

            ALTER TABLE dash_cargas
              ADD COLUMN IF NOT EXISTS modelo_documento VARCHAR(2) DEFAULT '55',
              ADD COLUMN IF NOT EXISTS destinatario_codigo_ibge VARCHAR(7),
              ADD COLUMN IF NOT EXISTS destinatario_bairro VARCHAR(120),
              ADD COLUMN IF NOT EXISTS destinatario_cep VARCHAR(10),
              ADD COLUMN IF NOT EXISTS remetente_codigo_ibge VARCHAR(7),
              ADD COLUMN IF NOT EXISTS produto_ncm VARCHAR(10),
              ADD COLUMN IF NOT EXISTS regiao_nome VARCHAR(120),
              ADD COLUMN IF NOT EXISTS cliente_id_firebird INTEGER,
              ADD COLUMN IF NOT EXISTS venda_id_firebird INTEGER;

            CREATE TABLE IF NOT EXISTS dash_transporte_regioes (
              id SERIAL PRIMARY KEY,
              tenant_id UUID NOT NULL,
              nome VARCHAR(120) NOT NULL,
              cor VARCHAR(24) DEFAULT 'sky',
              uf_padrao VARCHAR(2) DEFAULT 'MS',
              cidades JSONB NOT NULL DEFAULT '[]'::jsonb,
              descricao VARCHAR(255),
              ativo BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(tenant_id, nome)
            );

            ALTER TABLE dash_contratos_transporte
              ADD COLUMN IF NOT EXISTS veiculo_id INTEGER,
              ADD COLUMN IF NOT EXISTS veiculo_placa VARCHAR(10),
              ADD COLUMN IF NOT EXISTS quantidade_eixos INTEGER DEFAULT 2,
              ADD COLUMN IF NOT EXISTS motorista_id INTEGER,
              ADD COLUMN IF NOT EXISTS motorista_nome VARCHAR(160),
              ADD COLUMN IF NOT EXISTS motorista_cpf VARCHAR(14),
              ADD COLUMN IF NOT EXISTS municipio_inicio VARCHAR(120),
              ADD COLUMN IF NOT EXISTS codigo_ibge_inicio VARCHAR(7),
              ADD COLUMN IF NOT EXISTS municipio_fim VARCHAR(120),
              ADD COLUMN IF NOT EXISTS codigo_ibge_fim VARCHAR(7),
              ADD COLUMN IF NOT EXISTS distancia_km NUMERIC(10,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS categoria_carga_antt VARCHAR(40) DEFAULT 'GERAL',
              ADD COLUMN IF NOT EXISTS alto_desempenho BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS retorno_vazio BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS peso_carga_kg NUMERIC(12,3) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS valor_carga NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS ncm_carga VARCHAR(8),
              ADD COLUMN IF NOT EXISTS chaves_nfe JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(120),
              ADD COLUMN IF NOT EXISTS banco_codigo VARCHAR(10),
              ADD COLUMN IF NOT EXISTS banco_agencia VARCHAR(15),
              ADD COLUMN IF NOT EXISTS banco_conta VARCHAR(25),
              ADD COLUMN IF NOT EXISTS cnpj_ipef VARCHAR(14),
              ADD COLUMN IF NOT EXISTS data_saida DATE,
              ADD COLUMN IF NOT EXISTS data_prevista_entrega DATE,
              ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS valor_irrf NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS valor_sest_senat NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS valor_outros_descontos NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS ciot_verificador VARCHAR(10),
              ADD COLUMN IF NOT EXISTS ciot_provedor VARCHAR(30) DEFAULT 'HOMOLOGACAO_LOCAL',
              ADD COLUMN IF NOT EXISTS ciot_protocolo_encerramento VARCHAR(40),
              ADD COLUMN IF NOT EXISTS ciot_transmitido_em TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS ciot_encerrado_em TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS ciot_erro TEXT,
              ADD COLUMN IF NOT EXISTS piso_isento BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS piso_isencao_motivo TEXT,
              ADD COLUMN IF NOT EXISTS mdfe_id INTEGER,
              ADD COLUMN IF NOT EXISTS gerar_financeiro BOOLEAN DEFAULT TRUE,
              ADD COLUMN IF NOT EXISTS financeiro_ids JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS observacoes TEXT;

            ALTER TABLE dash_regras_fiscais
              ADD COLUMN IF NOT EXISTS pis_cofins_modo VARCHAR(20) DEFAULT 'NAO_APURADO',
              ADD COLUMN IF NOT EXISTS pis_cst VARCHAR(2),
              ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC(7,4),
              ADD COLUMN IF NOT EXISTS cofins_cst VARCHAR(2),
              ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC(7,4),
              ADD COLUMN IF NOT EXISTS excluir_icms_base_pis_cofins BOOLEAN DEFAULT TRUE;

            ALTER TABLE dash_certificados
              ADD COLUMN IF NOT EXISTS focus_sincronizado BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS focus_sincronizado_em TIMESTAMPTZ;

            ALTER TABLE dash_emitentes ALTER COLUMN focus_token TYPE TEXT;
            ALTER TABLE dash_emitentes ALTER COLUMN focus_token_homologacao TYPE TEXT;
            ALTER TABLE dash_emitentes ALTER COLUMN focus_token_producao TYPE TEXT;
            ALTER TABLE dash_certificados ALTER COLUMN senha TYPE TEXT;

            ALTER TABLE dash_ctes
              ADD COLUMN IF NOT EXISTS cfop VARCHAR(8) DEFAULT '5353',
              ADD COLUMN IF NOT EXISTS finalidade VARCHAR(3) DEFAULT '0',
              ADD COLUMN IF NOT EXISTS formato_dacte VARCHAR(10) DEFAULT 'retrato',
              ADD COLUMN IF NOT EXISTS modelo_cte VARCHAR(15) DEFAULT 'normal',
              ADD COLUMN IF NOT EXISTS retirar_mercadoria BOOLEAN DEFAULT TRUE,
              ADD COLUMN IF NOT EXISTS retirada_descricao TEXT,
              ADD COLUMN IF NOT EXISTS componentes_valor JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS aliquota_ibs NUMERIC(7,4) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS aliquota_cbs NUMERIC(7,4) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS codigo_situacao_fiscal VARCHAR(20),
              ADD COLUMN IF NOT EXISTS aliquota_fcp NUMERIC(7,4) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS part_fcp_origem NUMERIC(7,4) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS part_fcp_destino NUMERIC(7,4) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS produto_predominante VARCHAR(255),
              ADD COLUMN IF NOT EXISTS outras_caracteristicas_carga TEXT,
              ADD COLUMN IF NOT EXISTS data_prevista_entrega DATE,
              ADD COLUMN IF NOT EXISTS seguro_responsavel VARCHAR(2) DEFAULT '4',
              ADD COLUMN IF NOT EXISTS seguro_nome VARCHAR(255),
              ADD COLUMN IF NOT EXISTS seguro_apolice VARCHAR(40),
              ADD COLUMN IF NOT EXISTS seguro_averbacao VARCHAR(40),
              ADD COLUMN IF NOT EXISTS observacoes TEXT,
              ADD COLUMN IF NOT EXISTS remetente_dados JSONB DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS destinatario_dados JSONB DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS expedidor_dados JSONB DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS recebedor_dados JSONB DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS tomador_dados JSONB DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS quantidades_carga JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS documentos_json JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS modal_os_dados JSONB DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS chave_cte_referenciado VARCHAR(44),
              ADD COLUMN IF NOT EXISTS quantidade_volumes NUMERIC(15,4) DEFAULT 1,
              ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) DEFAULT '01',
              ADD COLUMN IF NOT EXISTS ibs_cbs_base_calculo NUMERIC(15,2),
              ADD COLUMN IF NOT EXISTS pis_cofins_modo VARCHAR(20) DEFAULT 'NAO_APURADO',
              ADD COLUMN IF NOT EXISTS pis_cst VARCHAR(2),
              ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC(7,4),
              ADD COLUMN IF NOT EXISTS valor_pis NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS cofins_cst VARCHAR(2),
              ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC(7,4),
              ADD COLUMN IF NOT EXISTS valor_cofins NUMERIC(15,2) DEFAULT 0,
              ADD COLUMN IF NOT EXISTS excluir_icms_base_pis_cofins BOOLEAN DEFAULT TRUE,
              ADD COLUMN IF NOT EXISTS pendencias_fiscais JSONB DEFAULT '[]'::jsonb;

            ALTER TABLE dash_mdfes
              ADD COLUMN IF NOT EXISTS tipo_emitente VARCHAR(2) DEFAULT '1',
              ADD COLUMN IF NOT EXISTS tipo_transporte VARCHAR(2) DEFAULT '1',
              ADD COLUMN IF NOT EXISTS ufs_percurso JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS municipios_carregamento JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS municipios_descarregamento JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS codigo_municipio_carregamento VARCHAR(7),
              ADD COLUMN IF NOT EXISTS municipio_carregamento VARCHAR(120),
              ADD COLUMN IF NOT EXISTS codigo_municipio_descarregamento VARCHAR(7),
              ADD COLUMN IF NOT EXISTS municipio_descarregamento VARCHAR(120),
              ADD COLUMN IF NOT EXISTS cep_carregamento VARCHAR(10),
              ADD COLUMN IF NOT EXISTS cep_descarregamento VARCHAR(10),
              ADD COLUMN IF NOT EXISTS tipo_carga VARCHAR(4) DEFAULT '05',
              ADD COLUMN IF NOT EXISTS produto_predominante_nome VARCHAR(120),
              ADD COLUMN IF NOT EXISTS produto_predominante_ncm VARCHAR(10),
              ADD COLUMN IF NOT EXISTS veiculo_tara_kg INTEGER,
              ADD COLUMN IF NOT EXISTS veiculo_capacidade_kg INTEGER,
              ADD COLUMN IF NOT EXISTS veiculo_capacidade_m3 INTEGER,
              ADD COLUMN IF NOT EXISTS veiculo_tipo_rodado VARCHAR(4),
              ADD COLUMN IF NOT EXISTS veiculo_tipo_carroceria VARCHAR(4),
              ADD COLUMN IF NOT EXISTS veiculo_renavam VARCHAR(15),
              ADD COLUMN IF NOT EXISTS veiculo_uf VARCHAR(2),
              ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS encerramento_uf VARCHAR(2),
              ADD COLUMN IF NOT EXISTS encerramento_municipio VARCHAR(120),
              ADD COLUMN IF NOT EXISTS informacao_adicional TEXT,
              ADD COLUMN IF NOT EXISTS pagto_frete JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS contratantes JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS seguros JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS produtos_predominantes JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS lacres JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS pessoas_autorizadas JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS reboques JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS condutores JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS vale_pedagio JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS ciot_codigo VARCHAR(50),
              ADD COLUMN IF NOT EXISTS ciot_responsavel_documento VARCHAR(14),
              ADD COLUMN IF NOT EXISTS ciots JSONB DEFAULT '[]'::jsonb;
        `);
        _transporteColsReady = true;
    } catch (e) {
        logger.warn('[Transporte Auto-Migration] Aviso:', e.message);
    }
}

router.use(async (_req, _res, next) => {
    await ensureTransporteColumns();
    next();
});

// Endpoint para testar conexão Focus NFe (Homologação ou Produção)
router.post('/focus/testar', async (req, res) => {
    const tenantId = req.tenant.id;
    const { ambiente, token_homologacao, token_producao, token, emitente_id } = req.body || {};
    try {
        const result = await TransporteService.testarConexaoFocus(tenantId, {
            ambiente,
            tokenHomologacao: token_homologacao,
            tokenProducao: token_producao,
            token,
            emitenteId: emitente_id,
        });
        const payload = { conectado: true, ...result };
        return res.json({ success: true, ...payload, data: payload });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 0. CONTA PARCEIRO / SOFTWARE HOUSE FOCUS NFe (Exclusivo Super Admin Master)
// ─────────────────────────────────────────────────────────────

router.get('/focus/master-config', requireSuperAdminMaster, async (_req, res) => {
    try {
        const cfg = await TransporteService.getMasterFocusConfig();
        return res.json({
            success: true,
            data: {
                tem_master_token: cfg.temMasterToken,
                master_token_masked: cfg.masterTokenMasked,
                master_token_preview: cfg.masterTokenPreview,
                origem: cfg.origem,
                webhook_base_url: cfg.webhookBaseUrl,
                webhook_endpoint: cfg.webhookEndpoint,
                updated_at: cfg.updatedAt,
                updated_by: cfg.updatedBy,
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/focus/master-config', requireSuperAdminMaster, async (req, res) => {
    try {
        const cfg = await TransporteService.salvarMasterFocusConfig({
            masterToken: req.body?.master_token,
            webhookBaseUrl: req.body?.webhook_base_url,
            updatedBy: req.user?.email || 'master',
        });
        return res.json({
            success: true,
            data: {
                tem_master_token: cfg.temMasterToken,
                master_token_masked: cfg.masterTokenMasked,
                master_token_preview: cfg.masterTokenPreview,
                origem: cfg.origem,
                webhook_base_url: cfg.webhookBaseUrl,
                webhook_endpoint: cfg.webhookEndpoint,
                updated_at: cfg.updatedAt,
                updated_by: cfg.updatedBy,
            }
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/focus/master-testar', requireSuperAdminMaster, async (req, res) => {
    try {
        const result = await TransporteService.testarMasterFocusToken(req.body?.master_token);
        const payload = { conectado: true, ...result };
        return res.json({ success: true, ...payload, data: payload });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 1. CARGAS (Notas Fiscais vindas do ERP Coliseu / Firebird)
// ─────────────────────────────────────────────────────────────

router.get('/cargas', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        status,
        search,
        cliente,
        data_inicio,
        data_fim,
        regiao,
        uf_destino,
        municipio,
        municipios,
        modelo,
        modo,
        apenas_nfe55,
        incluir_nfce,
        incluir_resumo = 'true',
        limit = 300,
        offset = 0,
    } = req.query;

    try {
        await consolidarCargasSeNecessario(tenantId).catch(() => null);

        const baseClauses = [`tenant_id = $1`];
        const baseParams = [tenantId];

        const statusUpper = status ? String(status).toUpperCase().trim() : '';
        if (statusUpper && statusUpper !== 'TODAS') {
            if (statusUpper === 'DISPONIVEIS') {
                baseClauses.push(`status = 'PENDENTE'`);
            } else {
                baseParams.push(statusUpper);
                baseClauses.push(`status = $${baseParams.length}`);
            }
        }

        const exigirModelo55 =
            incluir_nfce !== 'true' &&
            (modelo === '55' ||
                apenas_nfe55 === 'true' ||
                ['MDFE', 'CTE'].includes(String(modo || '').toUpperCase()));

        if (exigirModelo55) {
            baseClauses.push(
                `COALESCE(NULLIF(modelo_documento, ''), SUBSTRING(regexp_replace(COALESCE(chave_acesso, ''), '\\D', '', 'g') FROM 21 FOR 2), '55') = '55'`
            );
            baseClauses.push(
                `LENGTH(regexp_replace(COALESCE(chave_acesso, ''), '\\D', '', 'g')) = 44`
            );
        } else if (modelo && modelo !== 'TODAS') {
            baseParams.push(String(modelo).trim().slice(0, 2));
            baseClauses.push(`COALESCE(NULLIF(modelo_documento, ''), '55') = $${baseParams.length}`);
        }

        if (data_inicio) {
            baseParams.push(`${data_inicio} 00:00:00`);
            baseClauses.push(`data_emissao >= $${baseParams.length}::timestamptz`);
        }

        if (data_fim) {
            baseParams.push(`${data_fim} 23:59:59`);
            baseClauses.push(`data_emissao <= $${baseParams.length}::timestamptz`);
        }

        const filterClauses = [...baseClauses];
        const filterParams = [...baseParams];

        if (uf_destino && uf_destino !== 'TODAS') {
            const ufNorm = normalizarUf(uf_destino) || String(uf_destino).toUpperCase().trim().slice(0, 2);
            filterParams.push(ufNorm);
            filterClauses.push(`UPPER(TRIM(COALESCE(destinatario_uf, ''))) = $${filterParams.length}`);
        }

        if (regiao && regiao !== 'TODAS') {
            const regTrim = String(regiao).trim();
            if (regTrim === 'SEM_REGIAO') {
                filterClauses.push(`COALESCE(TRIM(regiao_nome), '') = ''`);
            } else {
                // Busca também cidades vinculadas a esta região customizada ou do ERP para filtro imediato
                const cidadesRegiaoSet = new Set();
                const [regCustomRes, regErpRes] = await Promise.all([
                    db
                        .query(
                            `SELECT cidades FROM dash_transporte_regioes WHERE tenant_id = $1 AND UPPER(TRIM(nome)) = UPPER(TRIM($2)) AND ativo = TRUE`,
                            [tenantId, regTrim]
                        )
                        .catch(() => ({ rows: [] })),
                    db
                        .query(
                            `SELECT cidade FROM dash_regioes WHERE tenant_id = $1 AND UPPER(TRIM(nome)) = UPPER(TRIM($2))`,
                            [tenantId, regTrim]
                        )
                        .catch(() => ({ rows: [] })),
                ]);
                for (const r of regCustomRes.rows) {
                    const arr = Array.isArray(r.cidades) ? r.cidades : [];
                    for (const c of arr) {
                        const mun = String(typeof c === 'string' ? c : c?.municipio || c?.cidade || c?.nome || '')
                            .toUpperCase()
                            .trim();
                        if (mun) cidadesRegiaoSet.add(mun);
                    }
                }
                for (const r of regErpRes.rows) {
                    const mun = String(r.cidade || '').toUpperCase().trim();
                    if (mun) cidadesRegiaoSet.add(mun);
                }

                filterParams.push(regTrim);
                const idxReg = filterParams.length;
                if (cidadesRegiaoSet.size > 0) {
                    filterParams.push(Array.from(cidadesRegiaoSet));
                    const idxCids = filterParams.length;
                    filterClauses.push(
                        `(UPPER(TRIM(COALESCE(regiao_nome, ''))) = UPPER(TRIM($${idxReg})) OR UPPER(TRIM(COALESCE(destinatario_municipio, ''))) = ANY($${idxCids}::text[]))`
                    );
                } else {
                    filterClauses.push(`UPPER(TRIM(COALESCE(regiao_nome, ''))) = UPPER(TRIM($${idxReg}))`);
                }
            }
        }

        const listaMunicipiosRaw = municipios || municipio || '';
        if (listaMunicipiosRaw && listaMunicipiosRaw !== 'TODOS') {
            const muns = String(listaMunicipiosRaw)
                .split(',')
                .map((m) => m.trim().toUpperCase())
                .filter(Boolean);
            if (muns.length > 0) {
                filterParams.push(muns);
                filterClauses.push(
                    `UPPER(TRIM(COALESCE(destinatario_municipio, ''))) = ANY($${filterParams.length}::text[])`
                );
            }
        }

        if (cliente) {
            filterParams.push(`%${String(cliente).trim()}%`);
            filterClauses.push(
                `(destinatario_nome ILIKE $${filterParams.length} OR destinatario_documento ILIKE $${filterParams.length})`
            );
        }

        if (search) {
            filterParams.push(`%${String(search).trim()}%`);
            filterClauses.push(
                `(chave_acesso ILIKE $${filterParams.length} OR numero ILIKE $${filterParams.length} OR remetente_nome ILIKE $${filterParams.length} OR destinatario_nome ILIKE $${filterParams.length} OR destinatario_documento ILIKE $${filterParams.length} OR destinatario_municipio ILIKE $${filterParams.length} OR regiao_nome ILIKE $${filterParams.length})`
            );
        }

        const whereFiltered = filterClauses.join(' AND ');
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 300, 1), 1000);
        const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

        const countRes = await db.query(
            `SELECT COUNT(*)::int AS total,
                    COALESCE(SUM(valor_total), 0)::numeric(15,2) AS valor_total,
                    COALESCE(SUM(peso_bruto), 0)::numeric(15,3) AS peso_total
             FROM dash_cargas
             WHERE ${whereFiltered}`,
            filterParams
        );

        const listParams = [...filterParams, safeLimit, safeOffset];
        const { rows } = await db.query(
            `SELECT *
             FROM dash_cargas
             WHERE ${whereFiltered}
             ORDER BY data_emissao DESC NULLS LAST, id DESC
             LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
            listParams
        );

        let resumo = null;
        if (incluir_resumo !== 'false') {
            const whereBase = baseClauses.join(' AND ');
            const [regFacets, cidFacets, ufFacets, customRegs] = await Promise.all([
                db.query(
                    `SELECT COALESCE(NULLIF(TRIM(regiao_nome), ''), 'SEM_REGIAO') AS nome,
                            COUNT(*)::int AS qtd,
                            COALESCE(SUM(valor_total), 0)::numeric(15,2) AS valor_total,
                            COALESCE(SUM(peso_bruto), 0)::numeric(15,3) AS peso_total
                     FROM dash_cargas
                     WHERE ${whereBase}
                     GROUP BY 1
                     ORDER BY qtd DESC, nome ASC`,
                    baseParams
                ),
                db.query(
                    `SELECT TRIM(destinatario_municipio) AS municipio,
                            UPPER(TRIM(COALESCE(destinatario_uf, 'MS'))) AS uf,
                            MAX(destinatario_codigo_ibge) AS codigo_ibge,
                            MAX(regiao_nome) AS regiao,
                            COUNT(*)::int AS qtd,
                            COALESCE(SUM(valor_total), 0)::numeric(15,2) AS valor_total,
                            COALESCE(SUM(peso_bruto), 0)::numeric(15,3) AS peso_total
                     FROM dash_cargas
                     WHERE ${whereBase} AND COALESCE(TRIM(destinatario_municipio), '') <> ''
                     GROUP BY 1, 2
                     ORDER BY qtd DESC, 1 ASC
                     LIMIT 200`,
                    baseParams
                ),
                db.query(
                    `SELECT UPPER(TRIM(COALESCE(destinatario_uf, 'MS'))) AS uf,
                            COUNT(*)::int AS qtd
                     FROM dash_cargas
                     WHERE ${whereBase} AND COALESCE(TRIM(destinatario_uf), '') <> ''
                     GROUP BY 1
                     ORDER BY qtd DESC, 1 ASC`,
                    baseParams
                ),
                db
                    .query(
                        `SELECT id, nome, cor, uf_padrao, cidades FROM dash_transporte_regioes WHERE tenant_id = $1 AND ativo = TRUE ORDER BY nome ASC`,
                        [tenantId]
                    )
                    .catch(() => ({ rows: [] })),
            ]);

            const regioesMap = new Map();
            for (const r of regFacets.rows) {
                regioesMap.set(String(r.nome).toUpperCase(), {
                    nome: r.nome,
                    qtd: Number(r.qtd || 0),
                    valor_total: Number(r.valor_total || 0),
                    peso_total: Number(r.peso_total || 0),
                });
            }
            for (const cr of customRegs.rows) {
                const key = String(cr.nome || '').toUpperCase().trim();
                if (key && !regioesMap.has(key)) {
                    regioesMap.set(key, {
                        nome: cr.nome,
                        cor: cr.cor,
                        qtd: 0,
                        valor_total: 0,
                        peso_total: 0,
                    });
                } else if (key && regioesMap.has(key)) {
                    regioesMap.get(key).cor = cr.cor;
                }
            }

            resumo = {
                total_filtrado: Number(countRes.rows[0]?.total || 0),
                valor_total_filtrado: Number(countRes.rows[0]?.valor_total || 0),
                peso_total_filtrado: Number(countRes.rows[0]?.peso_total || 0),
                regioes: Array.from(regioesMap.values()),
                cidades: cidFacets.rows.map((c) => ({
                    municipio: c.municipio,
                    uf: c.uf,
                    codigo_ibge: c.codigo_ibge,
                    regiao: c.regiao,
                    qtd: Number(c.qtd || 0),
                    valor_total: Number(c.valor_total || 0),
                    peso_total: Number(c.peso_total || 0),
                })),
                ufs: ufFacets.rows.map((u) => ({
                    uf: u.uf,
                    qtd: Number(u.qtd || 0),
                })),
            };
        }

        return res.json({
            success: true,
            data: rows,
            total: countRes.rows[0]?.total || 0,
            resumo,
        });
    } catch (err) {
        logger.error('[Transporte API] Erro ao listar cargas:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar cargas' });
    }
});

/**
 * POST /api/transporte/cargas/consolidar-erp
 * Consolida e enriquece 100% das NF-es vindas do ERP (dash_cargas + dash_vendas + dash_clientes + dash_vendas_itens + dash_regioes).
 */
router.post('/cargas/consolidar-erp', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const resultado = await consolidarCargasErpTenant(tenantId);
        const totaisRes = await db.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'PENDENTE')::int AS pendentes,
                    COUNT(*) FILTER (WHERE COALESCE(modelo_documento, '55') = '55' AND status = 'PENDENTE')::int AS nfe55_pendentes
             FROM dash_cargas WHERE tenant_id = $1`,
            [tenantId]
        );
        return res.json({
            success: true,
            data: {
                ...resultado,
                ...(totaisRes.rows[0] || {}),
            },
        });
    } catch (err) {
        logger.error('[Transporte API] Erro ao consolidar cargas do ERP:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * CRUD de Regiões / Rotas de Entrega do Transporte (dash_transporte_regioes)
 * integrado às regiões originais do ERP (dash_regioes / dash_clientes.classificacao).
 */
router.get('/regioes-entrega', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const [customRes, erpRegsRes, cidadesErpRes] = await Promise.all([
            db.query(
                `SELECT * FROM dash_transporte_regioes WHERE tenant_id = $1 ORDER BY ativo DESC, nome ASC`,
                [tenantId]
            ),
            db
                .query(
                    `SELECT TRIM(nome) AS nome, COUNT(DISTINCT cidade)::int AS qtd_cidades,
                            ARRAY_AGG(DISTINCT TRIM(cidade)) FILTER (WHERE COALESCE(TRIM(cidade), '') <> '') AS cidades
                     FROM dash_regioes
                     WHERE tenant_id = $1 AND COALESCE(TRIM(nome), '') <> ''
                     GROUP BY TRIM(nome)
                     ORDER BY 1 ASC`,
                    [tenantId]
                )
                .catch(() => ({ rows: [] })),
            db.query(
                `SELECT TRIM(destinatario_municipio) AS municipio,
                        UPPER(TRIM(COALESCE(destinatario_uf, 'MS'))) AS uf,
                        MAX(destinatario_codigo_ibge) AS codigo_ibge,
                        MAX(regiao_nome) AS regiao_atual,
                        COUNT(*) FILTER (WHERE status = 'PENDENTE')::int AS pendentes,
                        COUNT(*)::int AS total
                 FROM dash_cargas
                 WHERE tenant_id = $1 AND COALESCE(TRIM(destinatario_municipio), '') <> ''
                 GROUP BY 1, 2
                 ORDER BY pendentes DESC, 1 ASC`,
                [tenantId]
            ),
        ]);

        return res.json({
            success: true,
            data: {
                regioes_customizadas: customRes.rows,
                regioes_erp: erpRegsRes.rows,
                cidades_cargas: cidadesErpRes.rows,
            },
        });
    } catch (err) {
        logger.error('[Transporte API] Erro ao listar regiões de entrega:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.post('/regioes-entrega', async (req, res) => {
    const tenantId = req.tenant.id;
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    if (!nome) {
        return res.status(400).json({ error: 'Informe o nome da Região / Rota de Entrega.' });
    }

    try {
        const ufPadrao = normalizarUf(b.uf_padrao || 'MS') || 'MS';
        const cidadesRaw = Array.isArray(b.cidades) ? b.cidades : [];
        const cidadesNorm = [];
        const vistas = new Set();

        for (const c of cidadesRaw) {
            const munNome = String(typeof c === 'string' ? c : c?.municipio || c?.cidade || c?.nome || '').trim();
            if (!munNome) continue;
            const ufCid = normalizarUf((typeof c === 'object' && c?.uf) || ufPadrao) || ufPadrao;
            const chaveUnica = `${munNome.toUpperCase()}|${ufCid}`;
            if (vistas.has(chaveUnica)) continue;
            vistas.add(chaveUnica);
            const ibge = await resolverIbgeMunicipioAsync(
                db,
                typeof c === 'object' ? c?.codigo_ibge || c?.ibge : '',
                munNome,
                ufCid
            );
            cidadesNorm.push({
                municipio: ibge.exato ? ibge.nome : munNome,
                uf: ibge.uf || ufCid,
                codigo_ibge: ibge.codigo,
            });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_transporte_regioes (tenant_id, nome, cor, uf_padrao, cidades, descricao, ativo, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
             ON CONFLICT (tenant_id, nome) DO UPDATE SET
               cor = EXCLUDED.cor,
               uf_padrao = EXCLUDED.uf_padrao,
               cidades = EXCLUDED.cidades,
               descricao = EXCLUDED.descricao,
               ativo = EXCLUDED.ativo,
               updated_at = NOW()
             RETURNING *`,
            [
                tenantId,
                nome.slice(0, 120),
                String(b.cor || '#0284c7').slice(0, 20),
                ufPadrao,
                JSON.stringify(cidadesNorm),
                b.descricao ? String(b.descricao).slice(0, 255) : null,
                b.ativo !== false,
            ]
        );

        await consolidarCargasErpTenant(tenantId).catch(() => null);

        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        logger.error('[Transporte API] Erro ao salvar região de entrega:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.put('/regioes-entrega/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    if (!nome) {
        return res.status(400).json({ error: 'Informe o nome da Região / Rota de Entrega.' });
    }

    try {
        const ufPadrao = normalizarUf(b.uf_padrao || 'MS') || 'MS';
        const cidadesRaw = Array.isArray(b.cidades) ? b.cidades : [];
        const cidadesNorm = [];
        const vistas = new Set();

        for (const c of cidadesRaw) {
            const munNome = String(typeof c === 'string' ? c : c?.municipio || c?.cidade || c?.nome || '').trim();
            if (!munNome) continue;
            const ufCid = normalizarUf((typeof c === 'object' && c?.uf) || ufPadrao) || ufPadrao;
            const chaveUnica = `${munNome.toUpperCase()}|${ufCid}`;
            if (vistas.has(chaveUnica)) continue;
            vistas.add(chaveUnica);
            const ibge = await resolverIbgeMunicipioAsync(
                db,
                typeof c === 'object' ? c?.codigo_ibge || c?.ibge : '',
                munNome,
                ufCid
            );
            cidadesNorm.push({
                municipio: ibge.exato ? ibge.nome : munNome,
                uf: ibge.uf || ufCid,
                codigo_ibge: ibge.codigo,
            });
        }

        const { rows } = await db.query(
            `UPDATE dash_transporte_regioes
             SET nome = $1, cor = $2, uf_padrao = $3, cidades = $4::jsonb, descricao = $5, ativo = $6, updated_at = NOW()
             WHERE id = $7 AND tenant_id = $8
             RETURNING *`,
            [
                nome.slice(0, 120),
                String(b.cor || '#0284c7').slice(0, 20),
                ufPadrao,
                JSON.stringify(cidadesNorm),
                b.descricao ? String(b.descricao).slice(0, 255) : null,
                b.ativo !== false,
                id,
                tenantId,
            ]
        );
        if (!rows[0]) {
            return res.status(404).json({ error: 'Região não encontrada.' });
        }

        await consolidarCargasErpTenant(tenantId).catch(() => null);
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        logger.error('[Transporte API] Erro ao atualizar região:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/regioes-entrega/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const id = parseInt(req.params.id, 10);
    try {
        await db.query(`DELETE FROM dash_transporte_regioes WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
        await consolidarCargasErpTenant(tenantId).catch(() => null);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Endpoint para gerar/redirecionar para o DANFE da NF-e com base na Chave de Acesso.
 * Usa provedor seguro de DANFE ou URL homologada.
 */
router.get('/cargas/:id/danfe', async (req, res) => {
    const tenantId = req.tenant.id;
    const id = req.params.id;

    try {
        const { rows } = await db.query(
            `SELECT chave_acesso, numero, serie, dados_nfe FROM dash_cargas WHERE id = $1 AND tenant_id = $2`,
            [id, tenantId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Carga/NF-e não encontrada' });
        }

        const chave = rows[0].chave_acesso;
        if (!chave || chave.length < 44) {
            return res.status(400).json({ error: 'Chave de acesso inválida ou ausente para esta nota' });
        }

        // URL oficial de consulta/impressão de DANFE direto por chave de 44 dígitos
        const danfeUrl = `https://meudanfe.com.br/danfe?chave=${chave}`;

        return res.json({
            success: true,
            chave,
            numero: rows[0].numero,
            danfe_url: danfeUrl
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Importa um ou mais arquivos XML de NF-e direto na Central de Cargas.
 */
router.post('/cargas/importar-xml', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const result = await TransporteService.importarXmlsNfe(tenantId, req.body?.arquivos);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Sincroniza NF-es recebidas/destinadas direto da SEFAZ via MDe Focus NFe (/v2/nfes_recebidas).
 */
router.post('/mde/sincronizar', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const result = await TransporteService.sincronizarNfesRecebidasFocus(tenantId, {
            emitenteId: req.body?.emitente_id || null,
            ambiente: req.body?.ambiente || null,
            autoCiencia: req.body?.auto_ciencia !== false,
            desdeInicio: Boolean(req.body?.desde_inicio),
        });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Registra Manifestação do Destinatário (ciencia, confirmacao, desconhecimento, nao_realizada)
 * para uma chave NF-e de 44 dígitos na Focus NFe.
 */
router.post('/mde/:chave/manifestar', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const result = await TransporteService.manifestarNfeFocus(tenantId, req.params.chave, {
            tipo: req.body?.tipo,
            justificativa: req.body?.justificativa,
            emitenteId: req.body?.emitente_id || null,
            ambiente: req.body?.ambiente || null,
        });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 1.5 DOCUMENTOS EMITIDOS (listagem unificada CT-e + MDF-e)
// ─────────────────────────────────────────────────────────────

/**
 * Lista CT-e e MDF-e na mesma tabela, para consulta unificada.
 * Filtros: tipo (TODOS | CTE | MDFE), status, período, cliente e número do documento.
 */
router.get('/documentos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        tipo = 'TODOS', status, search,
        data_inicio, data_fim, limit = 200, offset = 0
    } = req.query;

    try {
        const tipos = tipo.toUpperCase() === 'MDFE' ? ['MDFE']
            : tipo.toUpperCase() === 'CTE' ? ['CTE'] : ['CTE', 'MDFE'];

        // ── CT-e ──
        let cteSql = `
            SELECT 'CTE' AS tipo_documento,
                   c.id, c.ref, c.numero, c.serie, c.modelo,
                   c.status, c.status_sefaz, c.mensagem_sefaz,
                   c.chave_cte AS chave,
                   c.natureza_operacao, c.tipo_servico, c.modal, c.tomador,
                   c.uf_inicio, c.uf_fim, c.municipio_inicio, c.municipio_fim,
                   c.valor_total, c.valor_carga, c.peso_bruto,
                   c.valor_icms, c.aliquota_icms,
                   c.caminho_xml, c.caminho_dacte AS caminho_pdf, c.protocolo,
                   c.data_emissao, c.created_at,
                   e.razao_social AS emitente_nome,
                   COALESCE(e.focus_ambiente, 'homologacao') AS focus_ambiente,
                   (SELECT COUNT(*)::int FROM dash_cte_cargas cc WHERE cc.cte_id = c.id) AS qtd_documentos
            FROM dash_ctes c
            LEFT JOIN dash_emitentes e ON e.id = c.emitente_id
            WHERE c.tenant_id = $1`;
        const params = [tenantId];

        // ── MDF-e ──
        let mdfeSql = `
            SELECT 'MDFE' AS tipo_documento,
                   m.id, m.ref, m.numero, m.serie, m.modelo,
                   m.status, m.status_sefaz, m.mensagem_sefaz,
                   m.chave_mdfe AS chave,
                   m.tipo_emitente AS natureza_operacao, m.tipo_transporte AS tipo_servico, m.modal, NULL AS tomador,
                   m.uf_inicio, m.uf_fim, m.municipio_carregamento AS municipio_inicio, m.municipio_descarregamento AS municipio_fim,
                   NULL::numeric AS valor_total, m.valor_carga, m.peso_bruto,
                   NULL::numeric AS valor_icms, NULL::numeric AS aliquota_icms,
                   m.caminho_xml, m.caminho_damdfe AS caminho_pdf, m.protocolo,
                   m.data_emissao, m.created_at,
                   e.razao_social AS emitente_nome,
                   COALESCE(e.focus_ambiente, 'homologacao') AS focus_ambiente,
                   (SELECT COUNT(*)::int FROM dash_mdfe_documentos md WHERE md.mdfe_id = m.id) AS qtd_documentos
            FROM dash_mdfes m
            LEFT JOIN dash_emitentes e ON e.id = m.emitente_id
            WHERE m.tenant_id = $1`;

        const clauses = [];
        const p = (v) => { params.push(v); return `$${params.length}`; };

        if (status && status !== 'TODAS') {
            clauses.push(`status = ${p(status.toUpperCase())}`);
        }
        if (data_inicio) {
            clauses.push(`data_emissao >= ${p(`${data_inicio} 00:00:00`)}::timestamptz`);
        }
        if (data_fim) {
            clauses.push(`data_emissao <= ${p(`${data_fim} 23:59:59`)}::timestamptz`);
        }
        if (search) {
            const s = p(`%${String(search).trim()}%`);
            clauses.push(`(
                chave ILIKE ${s} OR ref ILIKE ${s} OR CAST(numero AS TEXT) ILIKE ${s}
                OR emitente_nome ILIKE ${s} OR CAST(serie AS TEXT) ILIKE ${s}
            )`);
        }

        const whereExtra = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';

        // ── Monta a UNION conforme o filtro de tipo ──
        let unionSql = '';
        if (tipos.includes('CTE')) unionSql += cteSql + whereExtra;
        if (tipos.includes('MDFE')) {
            if (unionSql) unionSql += '\n                UNION ALL\n';
            unionSql += mdfeSql + whereExtra;
        }

        const finalSql = `
            SELECT * FROM (
                ${unionSql}
            ) docs
            ORDER BY data_emissao DESC NULLS LAST, id DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        // Garante que em homologação o lote inicial de testes SEFAZ/MS seja criado e os documentos presos em nCT=1 sejam destravados (uma única vez por tenant)
        await Promise.race([
            TransporteService.reconciliarEGerarTestesHomologacaoMs(tenantId),
            new Promise((r) => setTimeout(r, 25000)),
        ]);

        let { rows } = await db.query(finalSql, params);

        // Se houver documentos em PROCESSANDO ou AUTORIZADO/ENCERRADO sem PDF sincronizado, consulta sequencialmente a Focus NFe
        const processandoRows = rows
            .filter(
                (r) =>
                    r.ref &&
                    (r.status === 'PROCESSANDO' ||
                        ((r.status === 'AUTORIZADO' || r.status === 'ENCERRADO') && !r.caminho_pdf))
            )
            .slice(0, 4);
        if (processandoRows.length > 0) {
            for (const r of processandoRows) {
                try {
                    if (r.tipo_documento === 'MDFE') {
                        await TransporteService.consultarMdfeFocus(tenantId, r.id);
                    } else {
                        await TransporteService.consultarCteFocus(tenantId, r.id);
                    }
                } catch (_) {
                    // ignora falha individual de consulta
                }
            }
            const refreshed = await db.query(finalSql, params);
            rows = refreshed.rows;
        }

        const normalizedRows = rows.map((r) => ({
            ...r,
            protocolo: TransporteService.extrairProtocoloFocus(r.protocolo),
            caminho_xml: FocusClient.normalizarUrlArquivo(r.caminho_xml, r.focus_ambiente),
            caminho_pdf: FocusClient.normalizarUrlArquivo(r.caminho_pdf, r.focus_ambiente),
        }));
        return res.json({ success: true, data: normalizedRows, total: normalizedRows.length });
    } catch (err) {
        logger.error('[Documentos API] Erro ao listar documentos:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Proxy autenticado para download de XML ou PDF (DACTE / DAMDFE) de CT-e ou MDF-e.
 */
router.get('/documentos/:tipo/:id/download/:formato', async (req, res) => {
    const tenantId = req.tenant.id;
    const tipo = String(req.params.tipo || 'CTE').toUpperCase();
    const docId = parseInt(req.params.id, 10);
    const formato = String(req.params.formato || 'pdf').toLowerCase();

    if (!['xml', 'pdf'].includes(formato)) {
        return res.status(400).json({ error: 'Formato inválido. Use xml ou pdf.' });
    }

    try {
        const { buffer, contentType, filename } = await TransporteService.baixarArtefatoDocumento(
            tenantId,
            tipo,
            docId,
            formato
        );
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Content-Disposition', `${formato === 'pdf' ? 'inline' : 'attachment'}; filename="${filename}"`);
        return res.send(buffer);
    } catch (err) {
        return res.status(404).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 2. CT-e (Conhecimento de Transporte - Modelo 57 e CT-e OS - Modelo 67)
// ─────────────────────────────────────────────────────────────

router.get('/ctes', async (req, res) => {
    const tenantId = req.tenant.id;
    const { status, limit = 50, offset = 0 } = req.query;

    try {
        let sql = `SELECT c.*, e.razao_social as emitente_nome
                   FROM dash_ctes c
                   LEFT JOIN dash_emitentes e ON e.id = c.emitente_id
                   WHERE c.tenant_id = $1`;
        const params = [tenantId];

        if (status) {
            params.push(status.toUpperCase());
            sql += ` AND c.status = $${params.length}`;
        }

        sql += ` ORDER BY c.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/ctes/gerar-teste-homologacao', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await aplicarRegrasPadraoSefazMs(tenantId);
        const result = await TransporteService.gerarCtesTesteHomologacaoMs(tenantId);
        return res.json(result);
    } catch (err) {
        logger.error('[Transporte API] Erro ao gerar CT-es de teste em homologação:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.get('/ctes/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    try {
        const { rows } = await db.query(
            `SELECT c.*, e.razao_social as emitente_nome,
                    COALESCE(e.focus_ambiente, 'homologacao') as focus_ambiente
             FROM dash_ctes c
             LEFT JOIN dash_emitentes e ON e.id = c.emitente_id
             WHERE c.id = $1 AND c.tenant_id = $2`,
            [cteId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'CT-e não encontrado' });

        const { rows: cargasRows } = await db.query(
            `SELECT cc.*, cg.numero, cg.serie, cg.remetente_nome, cg.remetente_documento,
                    cg.destinatario_nome, cg.destinatario_documento, cg.dados_nfe
             FROM dash_cte_cargas cc
             LEFT JOIN dash_cargas cg ON cg.id = cc.carga_id
             WHERE cc.cte_id = $1 AND cc.tenant_id = $2`,
            [cteId, tenantId]
        );

        const data = rows[0];
        data.cargas_vinculadas = cargasRows;
        data.cargas_ids = cargasRows.map((r) => r.carga_id).filter(Boolean);
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

async function resolverEmitentePadraoId(tenantId, emitenteIdInformado) {
    if (emitenteIdInformado) return emitenteIdInformado;
    const em = await db.query(
        `SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`,
        [tenantId]
    );
    if (em.rows.length > 0) return em.rows[0].id;

    // Se não existir registro em dash_emitentes, tenta criar automaticamente a partir de dash_integracoes_config
    const emit = await TransporteService.getEmitente(tenantId);
    if (emit && emit.cnpj) {
        const ins = await db.query(
            `INSERT INTO dash_emitentes (
                tenant_id, cnpj, razao_social, nome_fantasia, inscricao_estadual, rntrc,
                regime_tributario, logradouro, numero, complemento, bairro, cep,
                codigo_municipio, municipio, uf, telefone, email,
                focus_ambiente, focus_token, focus_token_homologacao, focus_token_producao,
                serie_cte, serie_mdfe, ativo
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,true)
             ON CONFLICT (tenant_id, cnpj) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [
                tenantId,
                emit.cnpj,
                emit.razao_social,
                emit.nome_fantasia,
                emit.inscricao_estadual,
                emit.rntrc,
                emit.regime_tributario || '1',
                emit.logradouro,
                emit.numero,
                emit.complemento,
                emit.bairro,
                emit.cep,
                emit.codigo_municipio,
                emit.municipio,
                emit.uf,
                emit.telefone,
                emit.email,
                emit.focus_ambiente || 'homologacao',
                emit.focus_token || null,
                emit.focus_token_homologacao || null,
                emit.focus_token_producao || null,
                emit.serie_cte || '1',
                emit.serie_mdfe || '1',
            ]
        );
        return ins.rows[0].id;
    }
    throw new Error('Cadastre os dados da transportadora em Configurações > Fiscal ou Dados da Empresa antes de emitir.');
}

router.post('/ctes', async (req, res) => {
    const tenantId = req.tenant.id;
    const b = req.body || {};

    try {
        const emitId = await resolverEmitentePadraoId(tenantId, b.emitente_id);
        const ref = TransporteService.gerarRef('CTE', tenantId, Date.now().toString().slice(-6));
        const cargasIds = Array.isArray(b.cargas_ids) ? b.cargas_ids : [];

        // Se houver NF-e vinculada e remetente_dados/destinatario_dados não vierem preenchidos, extrai da primeira NF-e
        let remetenteDados = b.remetente_dados || {};
        let destinatarioDados = b.destinatario_dados || {};
        let ufInicio = b.uf_inicio;
        let munInicio = b.municipio_inicio;
        let codMunInicio = b.codigo_municipio_inicio;
        let ufFim = b.uf_fim;
        let munFim = b.municipio_fim;
        let codMunFim = b.codigo_municipio_fim;
        let pesoTotal = parseFloat(b.peso_bruto || 0);
        let valorCargaTotal = parseFloat(b.valor_carga || 0);

        if (cargasIds.length > 0) {
            const { rows: cgRows } = await db.query(
                `SELECT * FROM dash_cargas WHERE id = ANY($1::int[]) AND tenant_id = $2`,
                [cargasIds.map((x) => parseInt(x, 10)).filter(Boolean), tenantId]
            );
            if (cgRows.length > 0) {
                const c0 = cgRows[0];
                const nfe = c0.dados_nfe || {};
                if (!remetenteDados.documento && !remetenteDados.cnpj && (c0.remetente_documento || nfe.remetente)) {
                    remetenteDados = {
                        documento: c0.remetente_documento || nfe.remetente?.cnpj || nfe.remetente?.cpf || '',
                        razao_social: c0.remetente_nome || nfe.remetente?.razao_social || nfe.remetente?.xNome || '',
                        inscricao_estadual: nfe.remetente?.inscricao_estadual || nfe.remetente?.ie || '',
                        logradouro: nfe.remetente?.logradouro || nfe.remetente?.xLgr || '',
                        numero: nfe.remetente?.numero || nfe.remetente?.nro || '',
                        bairro: nfe.remetente?.bairro || nfe.remetente?.xBairro || '',
                        cep: nfe.remetente?.cep || nfe.remetente?.CEP || '',
                        municipio: c0.remetente_municipio || nfe.remetente?.municipio || nfe.remetente?.xMun || '',
                        codigo_municipio: nfe.remetente?.codigo_municipio || nfe.remetente?.cMun || '',
                        uf: c0.remetente_uf || nfe.remetente?.uf || '',
                        ...remetenteDados,
                    };
                }
                if (!destinatarioDados.documento && !destinatarioDados.cnpj && (c0.destinatario_documento || nfe.destinatario)) {
                    destinatarioDados = {
                        documento: c0.destinatario_documento || nfe.destinatario?.cnpj || nfe.destinatario?.cpf || '',
                        razao_social: c0.destinatario_nome || nfe.destinatario?.razao_social || nfe.destinatario?.xNome || '',
                        inscricao_estadual: nfe.destinatario?.inscricao_estadual || nfe.destinatario?.ie || '',
                        logradouro: nfe.destinatario?.logradouro || nfe.destinatario?.xLgr || '',
                        numero: nfe.destinatario?.numero || nfe.destinatario?.nro || '',
                        bairro: nfe.destinatario?.bairro || nfe.destinatario?.xBairro || '',
                        cep: nfe.destinatario?.cep || nfe.destinatario?.CEP || '',
                        municipio: c0.destinatario_municipio || nfe.destinatario?.municipio || nfe.destinatario?.xMun || '',
                        codigo_municipio: nfe.destinatario?.codigo_municipio || nfe.destinatario?.cMun || '',
                        uf: c0.destinatario_uf || nfe.destinatario?.uf || '',
                        ...destinatarioDados,
                    };
                }
                if (!ufInicio && c0.remetente_uf) ufInicio = c0.remetente_uf;
                if (!munInicio && c0.remetente_municipio) munInicio = c0.remetente_municipio;
                if (!ufFim && c0.destinatario_uf) ufFim = c0.destinatario_uf;
                if (!munFim && c0.destinatario_municipio) munFim = c0.destinatario_municipio;
                if (!pesoTotal) {
                    pesoTotal = cgRows.reduce((s, r) => s + parseFloat(r.peso_bruto || 0), 0);
                }
                if (!valorCargaTotal) {
                    valorCargaTotal = cgRows.reduce((s, r) => s + parseFloat(r.valor_total || 0), 0);
                }
            }
        }

        const modeloCodigo = b.modelo === '67' || b.modelo_cte === 'cteos' ? '67' : '57';

        const { rows } = await db.query(
            `INSERT INTO dash_ctes (
                tenant_id, emitente_id, ref, status, serie, numero, modelo,
                formato_dacte, finalidade, cfop, natureza_operacao, modelo_cte, tipo_servico, modal,
                retirar_mercadoria, retirada_descricao,
                tomador, tomador_documento,
                uf_inicio, municipio_inicio, codigo_municipio_inicio,
                uf_fim, municipio_fim, codigo_municipio_fim,
                valor_total, valor_receber, peso_bruto, quantidade_volumes, unidade_medida, valor_carga,
                componentes_valor, icms_situacao_tributaria, base_icms, aliquota_icms, valor_icms,
                aliquota_ibs, aliquota_cbs, codigo_situacao_fiscal, aliquota_fcp, part_fcp_origem, part_fcp_destino,
                produto_predominante, outras_caracteristicas_carga, data_prevista_entrega,
                seguro_responsavel, seguro_nome, seguro_apolice, seguro_averbacao,
                observacoes, chave_cte_referenciado,
                remetente_dados, destinatario_dados, expedidor_dados, recebedor_dados, tomador_dados,
                documentos_json, quantidades_carga, modal_os_dados,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs_mun, reducao_aliquota_ibs_cbs,
                ibs_cbs_base_calculo, pis_cofins_modo, pis_cst, aliquota_pis, valor_pis,
                cofins_cst, aliquota_cofins, valor_cofins, excluir_icms_base_pis_cofins
             ) VALUES (
                $1, $2, $3, 'RASCUNHO', $4, $5, $6,
                $7, $8, $9, $10, $11, $12, $13,
                $14, $15,
                $16, $17,
                $18, $19, $20,
                $21, $22, $23,
                $24, $25, $26, $27, $28, $29,
                $30::jsonb, $31, $32, $33, $34,
                $35, $36, $37, $38, $39, $40,
                $41, $42, $43,
                $44, $45, $46, $47,
                $48, $49,
                $50::jsonb, $51::jsonb, $52::jsonb, $53::jsonb, $54::jsonb,
                $55::jsonb, $56::jsonb, $57::jsonb,
                $58, $59, $60, $61,
                $62, $63, $64, $65, $66, $67, $68, $69, $70
             ) RETURNING *`,
            [
                tenantId,
                emitId,
                ref,
                b.serie || '1',
                b.numero ? parseInt(b.numero, 10) : null,
                modeloCodigo,
                b.formato_dacte || 'retrato',
                b.finalidade || '0',
                b.cfop || '5353',
                b.natureza_operacao || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                b.modelo_cte || 'normal',
                b.tipo_servico || '0',
                b.modal || '01',
                b.retirar_mercadoria !== false && b.retirar_mercadoria !== '0',
                b.retirada_descricao || null,
                b.tomador || b.tomador_tipo || '0',
                b.tomador_documento ? String(b.tomador_documento).replace(/\D/g, '') : null,
                ufInicio || 'MS',
                munInicio || null,
                codMunInicio ? String(codMunInicio).replace(/\D/g, '') : null,
                ufFim || 'MS',
                munFim || null,
                codMunFim ? String(codMunFim).replace(/\D/g, '') : null,
                parseFloat(b.valor_total || 0),
                parseFloat(b.valor_receber ?? b.valor_total ?? 0),
                pesoTotal,
                parseFloat(b.quantidade_volumes || 1),
                b.unidade_medida || '01',
                valorCargaTotal,
                JSON.stringify(b.componentes_valor || []),
                b.icms_situacao_tributaria || '00',
                parseFloat(b.base_icms ?? b.valor_total ?? 0),
                parseFloat(b.aliquota_icms || 0),
                parseFloat(b.valor_icms || 0),
                parseFloat(b.aliquota_ibs ?? 0.1),
                parseFloat(b.aliquota_cbs ?? 0.9),
                b.codigo_situacao_fiscal || b.ibs_cbs_class_trib || '000001',
                parseFloat(b.aliquota_fcp || 0),
                parseFloat(b.part_fcp_origem || 0),
                parseFloat(b.part_fcp_destino || 0),
                b.produto_predominante || 'MERCADORIA EM GERAL',
                b.outras_caracteristicas_carga || null,
                b.data_prevista_entrega || null,
                b.seguro_responsavel || '4',
                b.seguro_nome || null,
                b.seguro_apolice || null,
                b.seguro_averbacao || null,
                b.observacoes || null,
                b.chave_cte_referenciado ? String(b.chave_cte_referenciado).replace(/\D/g, '') : null,
                JSON.stringify(remetenteDados || {}),
                JSON.stringify(destinatarioDados || {}),
                JSON.stringify(b.expedidor_dados || {}),
                JSON.stringify(b.recebedor_dados || {}),
                JSON.stringify(b.tomador_dados || {}),
                JSON.stringify(b.documentos || b.documentos_json || []),
                JSON.stringify(b.quantidades_carga || []),
                JSON.stringify(b.modal_os_dados || {}),
                b.ibs_cbs_cst || '000',
                b.ibs_cbs_class_trib || b.codigo_situacao_fiscal || '000001',
                parseFloat(b.aliquota_ibs_mun || 0),
                parseFloat(b.reducao_aliquota_ibs_cbs || 0),
                b.ibs_cbs_base_calculo !== undefined && b.ibs_cbs_base_calculo !== null && b.ibs_cbs_base_calculo !== ''
                    ? parseFloat(b.ibs_cbs_base_calculo)
                    : null,
                b.pis_cofins_modo || 'NAO_APURADO',
                b.pis_cst || null,
                b.aliquota_pis !== undefined && b.aliquota_pis !== null && b.aliquota_pis !== ''
                    ? parseFloat(b.aliquota_pis)
                    : null,
                parseFloat(b.valor_pis || 0),
                b.cofins_cst || null,
                b.aliquota_cofins !== undefined && b.aliquota_cofins !== null && b.aliquota_cofins !== ''
                    ? parseFloat(b.aliquota_cofins)
                    : null,
                parseFloat(b.valor_cofins || 0),
                b.excluir_icms_base_pis_cofins !== false,
            ]
        );

        const novoCte = rows[0];

        if (cargasIds.length > 0) {
            for (const cargaId of cargasIds) {
                const cargaRes = await db.query(
                    `SELECT chave_acesso, valor_total, peso_bruto FROM dash_cargas WHERE id = $1 AND tenant_id = $2`,
                    [cargaId, tenantId]
                );
                if (cargaRes.rows.length > 0) {
                    const c = cargaRes.rows[0];
                    await db.query(
                        `INSERT INTO dash_cte_cargas (tenant_id, cte_id, carga_id, chave_nfe, valor_nfe, peso_nfe)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (tenant_id, cte_id, carga_id) DO NOTHING`,
                        [tenantId, novoCte.id, cargaId, c.chave_acesso, c.valor_total, c.peso_bruto]
                    );
                    await db.query(
                        `UPDATE dash_cargas SET status = 'EM_CTE', cte_id = $1 WHERE id = $2`,
                        [novoCte.id, cargaId]
                    );
                }
            }
        }

        return res.status(201).json({ success: true, data: novoCte });
    } catch (err) {
        logger.error('[Transporte API] Erro ao criar CT-e:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/transporte/ctes/lote
 * Gera 1 rascunho de CT-e por Destinatário a partir de uma seleção de NF-es do ERP
 * (respeitando a regra SEFAZ de 1 Remetente + 1 Destinatário por CT-e Normal).
 */
router.post('/ctes/lote', async (req, res) => {
    const tenantId = req.tenant.id;
    const b = req.body || {};
    const cargasIds = Array.isArray(b.cargas_ids)
        ? b.cargas_ids.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x) && x > 0)
        : [];

    if (cargasIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos uma NF-e do ERP para gerar CT-es em lote.' });
    }

    try {
        const emitente = await TransporteService.getEmitente(tenantId, b.emitente_id || null);
        const { rows: cgRows } = await db.query(
            `SELECT * FROM dash_cargas WHERE tenant_id = $1 AND id = ANY($2::int[]) ORDER BY id ASC`,
            [tenantId, cargasIds]
        );

        const validas = cgRows.filter(
            (r) => String(r.chave_acesso || '').replace(/\D/g, '').length === 44
        );
        if (validas.length === 0) {
            return res.status(400).json({
                error: 'Nenhuma das cargas selecionadas possui chave de acesso de 44 dígitos válida.',
            });
        }

        // Agrupa NF-es por destinatário (CNPJ/CPF ou Nome + Município)
        const gruposMap = new Map();
        for (const cg of validas) {
            const docDest = String(cg.destinatario_documento || '').replace(/\D/g, '');
            const chaveGrupo =
                docDest.length >= 11
                    ? `DOC:${docDest}`
                    : `NOME:${String(cg.destinatario_nome || 'DESTINATARIO').toUpperCase().trim()}|${String(cg.destinatario_municipio || '').toUpperCase().trim()}`;
            if (!gruposMap.has(chaveGrupo)) {
                gruposMap.set(chaveGrupo, []);
            }
            gruposMap.get(chaveGrupo).push(cg);
        }

        const grupos = Array.from(gruposMap.values());
        const somaGeralMercadorias = validas.reduce((acc, c) => acc + (parseFloat(c.valor_total || 0) || 0), 0);
        const valorFreteLoteTotal = parseFloat(b.valor_frete_total_lote || 0) || 0;
        const valorFretePadraoUnit = parseFloat(b.valor_frete_padrao || 0) || 0;
        const ratearProporcional = Boolean(b.ratear_frete_proporcional && valorFreteLoteTotal > 0);

        const ctesCriados = [];
        let freteAcumulado = 0;

        for (let idx = 0; idx < grupos.length; idx++) {
            const nfsGrupo = grupos[idx];
            const c0 = nfsGrupo[0];
            const nfe0 = c0.dados_nfe || {};

            const valorCargaGrupo = nfsGrupo.reduce((acc, c) => acc + (parseFloat(c.valor_total || 0) || 0), 0);
            const pesoGrupo = nfsGrupo.reduce(
                (acc, c) => acc + (parseFloat(c.peso_bruto || 0) || 0),
                0
            );
            const pesoFinalGrupo = pesoGrupo > 0 ? pesoGrupo : Math.max(nfsGrupo.length * 10, 10);

            let valorFreteGrupo = valorFretePadraoUnit;
            if (ratearProporcional) {
                if (idx === grupos.length - 1) {
                    valorFreteGrupo = Math.max(0, Number((valorFreteLoteTotal - freteAcumulado).toFixed(2)));
                } else {
                    const prop = somaGeralMercadorias > 0 ? valorCargaGrupo / somaGeralMercadorias : 1 / grupos.length;
                    valorFreteGrupo = Number((valorFreteLoteTotal * prop).toFixed(2));
                    freteAcumulado += valorFreteGrupo;
                }
            }

            const ufInicio = normalizarUf(c0.remetente_uf || emitente.uf || 'MS') || 'MS';
            const ufFim = normalizarUf(c0.destinatario_uf || nfe0?.destinatario?.uf || ufInicio) || ufInicio;
            const ibgeIni = await resolverIbgeMunicipioAsync(
                db,
                c0.remetente_codigo_ibge || emitente.codigo_municipio,
                c0.remetente_municipio || emitente.municipio,
                ufInicio
            );
            const ibgeFim = await resolverIbgeMunicipioAsync(
                db,
                c0.destinatario_codigo_ibge || nfe0?.destinatario?.codigo_municipio || nfe0?.destinatario?.cMun,
                c0.destinatario_municipio || nfe0?.destinatario?.municipio,
                ufFim
            );

            const cfopAuto = b.cfop || (ufInicio === ufFim ? emitente.cfop_padrao_cte || '5353' : '6353');
            const aliqIcms = parseFloat(emitente.aliquota_icms_padrao ?? 12.0) || 0;
            const valorIcms = Number(((valorFreteGrupo * aliqIcms) / 100).toFixed(2));

            const remetenteDados = {
                documento: emitente.cnpj || String(c0.remetente_documento || '').replace(/\D/g, ''),
                razao_social: emitente.razao_social || c0.remetente_nome || 'EMITENTE',
                inscricao_estadual: emitente.inscricao_estadual || '',
                logradouro: emitente.logradouro || 'RUA PRINCIPAL',
                numero: emitente.numero || 'SN',
                bairro: emitente.bairro || 'CENTRO',
                cep: emitente.cep || '',
                municipio: ibgeIni.nome,
                codigo_municipio: ibgeIni.codigo,
                uf: ufInicio,
            };

            const destinatarioDados = {
                documento: String(c0.destinatario_documento || nfe0?.destinatario?.cnpj || nfe0?.destinatario?.cpf || '').replace(/\D/g, ''),
                razao_social: c0.destinatario_nome || nfe0?.destinatario?.razao_social || 'DESTINATARIO',
                inscricao_estadual: nfe0?.destinatario?.inscricao_estadual || nfe0?.destinatario?.ie || '',
                logradouro: nfe0?.destinatario?.logradouro || 'ENDERECO CADASTRADO',
                numero: nfe0?.destinatario?.numero || 'SN',
                bairro: c0.destinatario_bairro || nfe0?.destinatario?.bairro || 'CENTRO',
                cep: String(c0.destinatario_cep || nfe0?.destinatario?.cep || '').replace(/\D/g, ''),
                municipio: ibgeFim.nome,
                codigo_municipio: ibgeFim.codigo,
                uf: ufFim,
            };

            const documentosJson = nfsGrupo.map((nf) => ({
                tipo: 'nfe',
                chave: String(nf.chave_acesso).replace(/\D/g, ''),
                numero: nf.numero || '',
                serie: nf.serie || '1',
                valor: parseFloat(nf.valor_total || 0) || 0,
                peso_bruto: parseFloat(nf.peso_bruto || 0) || 0,
            }));

            const tomadorTipo = String(b.tomador || '0');
            const tomadorDoc =
                tomadorTipo === '3'
                    ? destinatarioDados.documento || remetenteDados.documento
                    : remetenteDados.documento;

            const ref = TransporteService.gerarRef('CTE', tenantId, `${Date.now().toString().slice(-5)}_${idx + 1}`);
            const componentesValor =
                valorFreteGrupo > 0
                    ? [{ nome: 'FRETE VALOR', valor: valorFreteGrupo }]
                    : [];

            const { rows: insRows } = await db.query(
                `INSERT INTO dash_ctes (
                    tenant_id, emitente_id, ref, status, serie, modelo,
                    formato_dacte, finalidade, cfop, natureza_operacao, modelo_cte, tipo_servico, modal,
                    tomador, tomador_documento,
                    uf_inicio, municipio_inicio, codigo_municipio_inicio,
                    uf_fim, municipio_fim, codigo_municipio_fim,
                    valor_total, valor_receber, peso_bruto, quantidade_volumes, unidade_medida, valor_carga,
                    componentes_valor, icms_situacao_tributaria, base_icms, aliquota_icms, valor_icms,
                    produto_predominante, regiao,
                    remetente_dados, destinatario_dados, documentos_json, quantidades_carga
                 ) VALUES (
                    $1, $2, $3, 'RASCUNHO', $4, '57',
                    'retrato', '0', $5, $6, 'normal', '0', '01',
                    $7, $8,
                    $9, $10, $11,
                    $12, $13, $14,
                    $15, $15, $16, $17, '01', $18,
                    $19::jsonb, '00', $15, $20, $21,
                    $22, $23,
                    $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb
                 ) RETURNING *`,
                [
                    tenantId,
                    emitente.id,
                    ref,
                    emitente.serie_cte || '1',
                    cfopAuto,
                    b.natureza_operacao || emitente.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                    tomadorTipo,
                    tomadorDoc || null,
                    ufInicio,
                    ibgeIni.nome,
                    ibgeIni.codigo,
                    ufFim,
                    ibgeFim.nome,
                    ibgeFim.codigo,
                    valorFreteGrupo,
                    pesoFinalGrupo,
                    Math.max(nfsGrupo.length, 1),
                    valorCargaGrupo,
                    JSON.stringify(componentesValor),
                    aliqIcms,
                    valorIcms,
                    c0.produto_predominante || 'MERCADORIA EM GERAL',
                    c0.regiao_nome || null,
                    JSON.stringify(remetenteDados),
                    JSON.stringify(destinatarioDados),
                    JSON.stringify(documentosJson),
                    JSON.stringify([{ codigo_unidade: '01', tipo_medida: 'PESO BRUTO', quantidade: pesoFinalGrupo }]),
                ]
            );

            const cteCriado = insRows[0];
            for (const nf of nfsGrupo) {
                await db.query(
                    `INSERT INTO dash_cte_cargas (tenant_id, cte_id, carga_id, chave_nfe, valor_nfe, peso_nfe)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (tenant_id, cte_id, carga_id) DO NOTHING`,
                    [tenantId, cteCriado.id, nf.id, nf.chave_acesso, nf.valor_total, nf.peso_bruto]
                );
                await db.query(
                    `UPDATE dash_cargas SET status = 'EM_CTE', cte_id = $1 WHERE id = $2 AND tenant_id = $3`,
                    [cteCriado.id, nf.id, tenantId]
                );
            }

            ctesCriados.push({
                ...cteCriado,
                qtd_nfes: nfsGrupo.length,
                destinatario_resumo: `${destinatarioDados.razao_social} (${ibgeFim.nome}/${ufFim})`,
            });
        }

        return res.status(201).json({
            success: true,
            total_ctes: ctesCriados.length,
            total_nfes: validas.length,
            data: ctesCriados,
        });
    } catch (err) {
        logger.error('[Transporte API] Erro ao gerar CT-es em lote:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.put('/ctes/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const b = req.body || {};

    try {
        const atualRes = await db.query(
            `SELECT id, status FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
            [cteId, tenantId]
        );
        if (atualRes.rows.length === 0) {
            return res.status(404).json({ error: 'CT-e não encontrado' });
        }
        if (atualRes.rows[0].status === 'AUTORIZADO') {
            return res.status(409).json({
                error: 'CT-e já AUTORIZADO pela SEFAZ não pode ser alterado. Gere um novo documento para retificação ou teste.'
            });
        }

        const modeloCodigo = b.modelo === '67' || b.modelo_cte === 'cteos' ? '67' : '57';
        const { rows } = await db.query(
            `UPDATE dash_ctes SET
                emitente_id = COALESCE($1, emitente_id),
                serie = COALESCE($2, serie),
                numero = COALESCE($3, numero),
                modelo = $4,
                formato_dacte = COALESCE($5, formato_dacte),
                finalidade = COALESCE($6, finalidade),
                cfop = COALESCE($7, cfop),
                natureza_operacao = COALESCE($8, natureza_operacao),
                modelo_cte = COALESCE($9, modelo_cte),
                tipo_servico = COALESCE($10, tipo_servico),
                modal = COALESCE($11, modal),
                retirar_mercadoria = COALESCE($12, retirar_mercadoria),
                retirada_descricao = $13,
                tomador = COALESCE($14, tomador),
                tomador_documento = $15,
                uf_inicio = COALESCE($16, uf_inicio),
                municipio_inicio = COALESCE($17, municipio_inicio),
                codigo_municipio_inicio = COALESCE($18, codigo_municipio_inicio),
                uf_fim = COALESCE($19, uf_fim),
                municipio_fim = COALESCE($20, municipio_fim),
                codigo_municipio_fim = COALESCE($21, codigo_municipio_fim),
                valor_total = COALESCE($22, valor_total),
                valor_receber = COALESCE($23, valor_receber),
                peso_bruto = COALESCE($24, peso_bruto),
                quantidade_volumes = COALESCE($25, quantidade_volumes),
                unidade_medida = COALESCE($26, unidade_medida),
                valor_carga = COALESCE($27, valor_carga),
                componentes_valor = COALESCE($28::jsonb, componentes_valor),
                icms_situacao_tributaria = COALESCE($29, icms_situacao_tributaria),
                base_icms = COALESCE($30, base_icms),
                aliquota_icms = COALESCE($31, aliquota_icms),
                valor_icms = COALESCE($32, valor_icms),
                aliquota_ibs = COALESCE($33, aliquota_ibs),
                aliquota_cbs = COALESCE($34, aliquota_cbs),
                codigo_situacao_fiscal = $35,
                aliquota_fcp = COALESCE($36, aliquota_fcp),
                part_fcp_origem = COALESCE($37, part_fcp_origem),
                part_fcp_destino = COALESCE($38, part_fcp_destino),
                produto_predominante = COALESCE($39, produto_predominante),
                outras_caracteristicas_carga = $40,
                data_prevista_entrega = $41,
                seguro_responsavel = COALESCE($42, seguro_responsavel),
                seguro_nome = $43,
                seguro_apolice = $44,
                seguro_averbacao = $45,
                observacoes = $46,
                chave_cte_referenciado = $47,
                remetente_dados = COALESCE($48::jsonb, remetente_dados),
                destinatario_dados = COALESCE($49::jsonb, destinatario_dados),
                expedidor_dados = COALESCE($50::jsonb, expedidor_dados),
                recebedor_dados = COALESCE($51::jsonb, recebedor_dados),
                tomador_dados = COALESCE($52::jsonb, tomador_dados),
                documentos_json = COALESCE($53::jsonb, documentos_json),
                quantidades_carga = COALESCE($54::jsonb, quantidades_carga),
                modal_os_dados = COALESCE($55::jsonb, modal_os_dados),
                ibs_cbs_cst = COALESCE($58, ibs_cbs_cst),
                ibs_cbs_class_trib = COALESCE($59, ibs_cbs_class_trib),
                aliquota_ibs_mun = COALESCE($60, aliquota_ibs_mun),
                reducao_aliquota_ibs_cbs = COALESCE($61, reducao_aliquota_ibs_cbs),
                ibs_cbs_base_calculo = COALESCE($62, ibs_cbs_base_calculo),
                pis_cofins_modo = COALESCE($63, pis_cofins_modo),
                pis_cst = COALESCE($64, pis_cst),
                aliquota_pis = COALESCE($65, aliquota_pis),
                valor_pis = COALESCE($66, valor_pis),
                cofins_cst = COALESCE($67, cofins_cst),
                aliquota_cofins = COALESCE($68, aliquota_cofins),
                valor_cofins = COALESCE($69, valor_cofins),
                excluir_icms_base_pis_cofins = COALESCE($70, excluir_icms_base_pis_cofins),
                updated_at = NOW()
             WHERE id = $56 AND tenant_id = $57 AND status <> 'AUTORIZADO'
             RETURNING *`,
            [
                b.emitente_id || null,
                b.serie || null,
                b.numero ? parseInt(b.numero, 10) : null,
                modeloCodigo,
                b.formato_dacte || null,
                b.finalidade || null,
                b.cfop || null,
                b.natureza_operacao || null,
                b.modelo_cte || null,
                b.tipo_servico || null,
                b.modal || null,
                b.retirar_mercadoria !== undefined ? Boolean(b.retirar_mercadoria) : null,
                b.retirada_descricao ?? null,
                b.tomador || b.tomador_tipo || null,
                b.tomador_documento ? String(b.tomador_documento).replace(/\D/g, '') : null,
                b.uf_inicio || null,
                b.municipio_inicio || null,
                b.codigo_municipio_inicio ? String(b.codigo_municipio_inicio).replace(/\D/g, '') : null,
                b.uf_fim || null,
                b.municipio_fim || null,
                b.codigo_municipio_fim ? String(b.codigo_municipio_fim).replace(/\D/g, '') : null,
                b.valor_total !== undefined ? parseFloat(b.valor_total || 0) : null,
                b.valor_receber !== undefined ? parseFloat(b.valor_receber || 0) : null,
                b.peso_bruto !== undefined ? parseFloat(b.peso_bruto || 0) : null,
                b.quantidade_volumes !== undefined ? parseFloat(b.quantidade_volumes || 1) : null,
                b.unidade_medida || null,
                b.valor_carga !== undefined ? parseFloat(b.valor_carga || 0) : null,
                b.componentes_valor ? JSON.stringify(b.componentes_valor) : null,
                b.icms_situacao_tributaria || null,
                b.base_icms !== undefined ? parseFloat(b.base_icms || 0) : null,
                b.aliquota_icms !== undefined ? parseFloat(b.aliquota_icms || 0) : null,
                b.valor_icms !== undefined ? parseFloat(b.valor_icms || 0) : null,
                b.aliquota_ibs !== undefined ? parseFloat(b.aliquota_ibs || 0) : null,
                b.aliquota_cbs !== undefined ? parseFloat(b.aliquota_cbs || 0) : null,
                b.codigo_situacao_fiscal ?? b.ibs_cbs_class_trib ?? null,
                b.aliquota_fcp !== undefined ? parseFloat(b.aliquota_fcp || 0) : null,
                b.part_fcp_origem !== undefined ? parseFloat(b.part_fcp_origem || 0) : null,
                b.part_fcp_destino !== undefined ? parseFloat(b.part_fcp_destino || 0) : null,
                b.produto_predominante || null,
                b.outras_caracteristicas_carga ?? null,
                b.data_prevista_entrega || null,
                b.seguro_responsavel || null,
                b.seguro_nome ?? null,
                b.seguro_apolice ?? null,
                b.seguro_averbacao ?? null,
                b.observacoes ?? null,
                b.chave_cte_referenciado ? String(b.chave_cte_referenciado).replace(/\D/g, '') : null,
                b.remetente_dados ? JSON.stringify(b.remetente_dados) : null,
                b.destinatario_dados ? JSON.stringify(b.destinatario_dados) : null,
                b.expedidor_dados ? JSON.stringify(b.expedidor_dados) : null,
                b.recebedor_dados ? JSON.stringify(b.recebedor_dados) : null,
                b.tomador_dados ? JSON.stringify(b.tomador_dados) : null,
                b.documentos || b.documentos_json ? JSON.stringify(b.documentos || b.documentos_json) : null,
                b.quantidades_carga ? JSON.stringify(b.quantidades_carga) : null,
                b.modal_os_dados ? JSON.stringify(b.modal_os_dados) : null,
                cteId,
                tenantId,
                b.ibs_cbs_cst || null,
                b.ibs_cbs_class_trib || b.codigo_situacao_fiscal || null,
                b.aliquota_ibs_mun !== undefined ? parseFloat(b.aliquota_ibs_mun || 0) : null,
                b.reducao_aliquota_ibs_cbs !== undefined ? parseFloat(b.reducao_aliquota_ibs_cbs || 0) : null,
                b.ibs_cbs_base_calculo !== undefined && b.ibs_cbs_base_calculo !== '' ? parseFloat(b.ibs_cbs_base_calculo) : null,
                b.pis_cofins_modo || null,
                b.pis_cst || null,
                b.aliquota_pis !== undefined && b.aliquota_pis !== '' && b.aliquota_pis !== null ? parseFloat(b.aliquota_pis) : null,
                b.valor_pis !== undefined && b.valor_pis !== '' && b.valor_pis !== null ? parseFloat(b.valor_pis) : null,
                b.cofins_cst || null,
                b.aliquota_cofins !== undefined && b.aliquota_cofins !== '' && b.aliquota_cofins !== null ? parseFloat(b.aliquota_cofins) : null,
                b.valor_cofins !== undefined && b.valor_cofins !== '' && b.valor_cofins !== null ? parseFloat(b.valor_cofins) : null,
                b.excluir_icms_base_pis_cofins !== undefined ? Boolean(b.excluir_icms_base_pis_cofins) : null,
            ]
        );

        if (rows.length === 0) return res.status(404).json({ error: 'CT-e não encontrado' });

        if (Array.isArray(b.cargas_ids)) {
            await db.query(`DELETE FROM dash_cte_cargas WHERE cte_id = $1 AND tenant_id = $2`, [cteId, tenantId]);
            for (const cargaId of b.cargas_ids) {
                const cargaRes = await db.query(
                    `SELECT chave_acesso, valor_total, peso_bruto FROM dash_cargas WHERE id = $1 AND tenant_id = $2`,
                    [cargaId, tenantId]
                );
                if (cargaRes.rows.length > 0) {
                    const c = cargaRes.rows[0];
                    await db.query(
                        `INSERT INTO dash_cte_cargas (tenant_id, cte_id, carga_id, chave_nfe, valor_nfe, peso_nfe)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (tenant_id, cte_id, carga_id) DO NOTHING`,
                        [tenantId, cteId, cargaId, c.chave_acesso, c.valor_total, c.peso_bruto]
                    );
                }
            }
        }

        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        logger.error('[Transporte API] Erro ao atualizar CT-e:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.post('/ctes/:id/emitir', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;

    try {
        const result = await TransporteService.emitirCte(tenantId, cteId);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/ctes/:id/consultar-focus', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    try {
        const result = await TransporteService.consultarCteFocus(tenantId, cteId);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/ctes/:id/cancelar', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const { justificativa } = req.body || {};

    try {
        const result = await TransporteService.cancelarCte(tenantId, cteId, justificativa);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/ctes/:id/prestacao-desacordo', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const { observacoes } = req.body || {};
    try {
        const result = await TransporteService.prestacaoDesacordoCte(tenantId, cteId, observacoes);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/ctes/:id/insucesso-entrega', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    try {
        const result = await TransporteService.insucessoEntregaCte(tenantId, cteId, req.body || {});
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/ctes/:id/cancelar-insucesso-entrega', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const { numero_sequencial_evento } = req.body || {};
    try {
        const result = await TransporteService.cancelarInsucessoEntregaCte(
            tenantId,
            cteId,
            numero_sequencial_evento
        );
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/ctes/:id/enviar-email', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const { emails } = req.body || {};
    try {
        const result = await TransporteService.enviarEmailCte(tenantId, cteId, emails);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 3. MDF-e (Manifesto Eletrônico de Carga - Modelo 58)
// ─────────────────────────────────────────────────────────────

router.get('/mdfes', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT m.*, e.razao_social as emitente_nome
             FROM dash_mdfes m
             LEFT JOIN dash_emitentes e ON e.id = m.emitente_id
             WHERE m.tenant_id = $1
             ORDER BY m.id DESC LIMIT 100`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes/gerar-teste-homologacao', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await aplicarRegrasPadraoSefazMs(tenantId);
        const result = await TransporteService.gerarMdfesTesteHomologacaoMs(tenantId);
        return res.json(result);
    } catch (err) {
        logger.error('[Transporte API] Erro ao gerar MDF-es de teste em homologação:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.get('/mdfes/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT m.*, e.razao_social as emitente_nome,
                    COALESCE(e.focus_ambiente, 'homologacao') as focus_ambiente
             FROM dash_mdfes m
             LEFT JOIN dash_emitentes e ON e.id = m.emitente_id
             WHERE m.id = $1 AND m.tenant_id = $2`,
            [req.params.id, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'MDF-e não encontrado' });

        const { rows: docs } = await db.query(
            `SELECT * FROM dash_mdfe_documentos WHERE mdfe_id = $1 AND tenant_id = $2`,
            [req.params.id, tenantId]
        );
        const data = rows[0];
        data.documentos_vinculados = docs;
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes', async (req, res) => {
    const tenantId = req.tenant.id;
    const b = req.body || {};

    try {
        const emitId = await resolverEmitentePadraoId(tenantId, b.emitente_id);
        const ctesIds = Array.isArray(b.ctes_ids) ? b.ctes_ids : [];
        const cargasIds = Array.isArray(b.cargas_ids) ? b.cargas_ids : [];
        const chavesNfeManuais = Array.isArray(b.chaves_nfe)
            ? Array.from(
                  new Set(
                      b.chaves_nfe
                          .map((ch) => String(ch || '').replace(/\D/g, ''))
                          .filter((ch) => ch.length === 44)
                  )
              )
            : [];
        const veiculoId = b.veiculo_id || b.veiculo_tracao_id || null;
        const motoristaId = b.motorista_id || null;

        let veiculoPlaca = b.veiculo_placa || '';
        if (!veiculoPlaca && veiculoId) {
            const vRes = await db.query(
                `SELECT placa FROM dash_veiculos WHERE id = $1 AND tenant_id = $2`,
                [veiculoId, tenantId]
            );
            veiculoPlaca = vRes.rows[0]?.placa || '';
        }

        let motoristaCpf = b.motorista_cpf ? String(b.motorista_cpf).replace(/\D/g, '') : '';
        let motoristaNome = b.motorista_nome || '';
        if ((!motoristaCpf || !motoristaNome) && motoristaId) {
            const mRes = await db.query(
                `SELECT cpf, nome FROM dash_motoristas WHERE id = $1 AND tenant_id = $2`,
                [motoristaId, tenantId]
            );
            if (mRes.rows[0]) {
                motoristaCpf = motoristaCpf || String(mRes.rows[0].cpf || '').replace(/\D/g, '');
                motoristaNome = motoristaNome || mRes.rows[0].nome || '';
            }
        }
        if ((!motoristaCpf || !motoristaNome) && Array.isArray(b.condutores) && b.condutores[0]) {
            motoristaCpf = motoristaCpf || String(b.condutores[0].cpf || '').replace(/\D/g, '');
            motoristaNome = motoristaNome || b.condutores[0].nome || '';
        }

        const codMunCarreg =
            b.codigo_municipio_carregamento ||
            b.codigo_municipio_carga ||
            b.municipios_carregamento?.[0]?.codigo ||
            b.municipios_carregamento?.[0]?.ibge ||
            null;
        const nomeMunCarreg =
            b.municipio_carregamento ||
            b.municipio_carga ||
            b.municipios_carregamento?.[0]?.nome ||
            null;
        const munCarregArray =
            Array.isArray(b.municipios_carregamento) && b.municipios_carregamento.length > 0
                ? b.municipios_carregamento
                : codMunCarreg || nomeMunCarreg
                ? [{ codigo: codMunCarreg, nome: nomeMunCarreg }]
                : [];

        let codMunDesc =
            b.codigo_municipio_descarregamento ||
            b.municipios_descarregamento?.[0]?.codigo ||
            b.municipios_descarregamento?.[0]?.ibge ||
            null;
        let nomeMunDesc =
            b.municipio_descarregamento ||
            b.municipios_descarregamento?.[0]?.nome ||
            null;
        let ufFimResolvida = (b.uf_fim || '').toUpperCase();

        if ((!codMunDesc || !nomeMunDesc || !ufFimResolvida) && ctesIds.length > 0) {
            const ctFirst = await db.query(
                `SELECT codigo_municipio_fim, municipio_fim, uf_fim
                 FROM dash_ctes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [ctesIds[0], tenantId]
            );
            if (ctFirst.rows[0]) {
                codMunDesc = codMunDesc || ctFirst.rows[0].codigo_municipio_fim || null;
                nomeMunDesc = nomeMunDesc || ctFirst.rows[0].municipio_fim || null;
                ufFimResolvida = ufFimResolvida || String(ctFirst.rows[0].uf_fim || 'MS').toUpperCase();
            }
        }

        let cargasSelecionadasRows = [];
        if (cargasIds.length > 0) {
            const cgAll = await db.query(
                `SELECT id, chave_acesso, destinatario_municipio, destinatario_uf,
                        destinatario_codigo_ibge, destinatario_cep,
                        produto_predominante, produto_ncm, valor_total, peso_bruto, dados_nfe
                 FROM dash_cargas
                 WHERE id = ANY($1::int[]) AND tenant_id = $2
                 ORDER BY id ASC`,
                [cargasIds, tenantId]
            );
            cargasSelecionadasRows = cgAll.rows;

            const ufsCargas = Array.from(
                new Set(
                    cargasSelecionadasRows
                        .map((r) => normalizarUf(r.destinatario_uf || r.dados_nfe?.destinatario?.uf || ''))
                        .filter((u) => u && u.length === 2)
                )
            );
            if (ufsCargas.length > 1) {
                return res.status(400).json({
                    error: `Regra SEFAZ MDF-e: um único Manifesto não pode misturar NF-es de UFs de destino diferentes (${ufsCargas.join(', ')}). Filtre uma UF por vez para emitir.`,
                });
            }

            if (cargasSelecionadasRows[0]) {
                const c0 = cargasSelecionadasRows[0];
                const dNfe = c0.dados_nfe || {};
                ufFimResolvida =
                    normalizarUf(ufFimResolvida || ufsCargas[0] || c0.destinatario_uf || dNfe?.destinatario?.uf || 'MS') || 'MS';
                const ibgeFirst = await resolverIbgeMunicipioAsync(
                    db,
                    codMunDesc || c0.destinatario_codigo_ibge || dNfe?.destinatario?.codigo_municipio || dNfe?.destinatario?.cMun,
                    nomeMunDesc || c0.destinatario_municipio || dNfe?.destinatario?.municipio,
                    ufFimResolvida
                );
                codMunDesc = codMunDesc || ibgeFirst.codigo;
                nomeMunDesc = nomeMunDesc || ibgeFirst.nome;
            }
        }

        // Pré-agrupa municípios de descarregamento (<infMunDescarga>) com código IBGE real de 7 dígitos por cidade
        const munDescAgrupadosMap = new Map();
        const cargasIbgeResolvidoMap = new Map();
        for (const cg of cargasSelecionadasRows) {
            const dNfe = cg.dados_nfe || {};
            const ufDoc = normalizarUf(cg.destinatario_uf || dNfe?.destinatario?.uf || ufFimResolvida || 'MS') || 'MS';
            const ibge = await resolverIbgeMunicipioAsync(
                db,
                cg.destinatario_codigo_ibge || dNfe?.destinatario?.codigo_municipio || dNfe?.destinatario?.cMun,
                cg.destinatario_municipio || dNfe?.destinatario?.municipio,
                ufDoc
            );
            cargasIbgeResolvidoMap.set(cg.id, ibge);
            if (!munDescAgrupadosMap.has(ibge.codigo)) {
                munDescAgrupadosMap.set(ibge.codigo, {
                    codigo: ibge.codigo,
                    nome: ibge.nome,
                    notas_fiscais: [],
                });
            }
            const chLimpa = String(cg.chave_acesso || '').replace(/\D/g, '');
            if (chLimpa.length === 44) {
                munDescAgrupadosMap.get(ibge.codigo).notas_fiscais.push({ chave_nfe: chLimpa });
            }
        }

        const munDescFinal =
            Array.isArray(b.municipios_descarregamento) && b.municipios_descarregamento.length > 0
                ? b.municipios_descarregamento
                : Array.from(munDescAgrupadosMap.values());

        const somaValorCargas = cargasSelecionadasRows.reduce(
            (acc, r) => acc + (parseFloat(r.valor_total || 0) || 0),
            0
        );
        const somaPesoCargas = cargasSelecionadasRows.reduce(
            (acc, r) => acc + (parseFloat(r.peso_bruto || 0) || 0),
            0
        );
        const valorCargaSalvar =
            parseFloat(b.valor_carga ?? b.valor_total_carga ?? 0) > 0
                ? parseFloat(b.valor_carga ?? b.valor_total_carga ?? 0)
                : somaValorCargas;
        const pesoBrutoSalvar =
            parseFloat(b.peso_bruto ?? b.peso_bruto_kg ?? 0) > 0
                ? parseFloat(b.peso_bruto ?? b.peso_bruto_kg ?? 0)
                : somaPesoCargas;

        const tipoEmitenteFinal = String(
            b.tipo_emitente ||
                ((cargasIds.length > 0 || chavesNfeManuais.length > 0) && ctesIds.length === 0 ? '2' : '1')
        );
        const ref = TransporteService.gerarRef('MDFE', tenantId, Date.now().toString().slice(-6));

        const { rows } = await db.query(
            `INSERT INTO dash_mdfes (
                tenant_id, emitente_id, ref, status, serie, numero,
                tipo_emitente, tipo_transporte, uf_inicio, uf_fim,
                ufs_percurso, municipios_carregamento, municipios_descarregamento,
                codigo_municipio_carregamento, municipio_carregamento,
                codigo_municipio_descarregamento, municipio_descarregamento,
                cep_carregamento, cep_descarregamento,
                veiculo_id, veiculo_placa,
                motorista_id, motorista_cpf, motorista_nome,
                condutores, reboques, contratantes, pagto_frete,
                seguros, produtos_predominantes, lacres, pessoas_autorizadas,
                informacao_adicional, ciot_codigo, ciot_responsavel_documento, ciots, vale_pedagio,
                qtd_cte, qtd_nfe, valor_carga, peso_bruto
             ) VALUES (
                $1, $2, $3, 'RASCUNHO', $4, $5,
                $6, $7, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb,
                $13, $14,
                $15, $16,
                $17, $18,
                $19, $20,
                $21, $22, $23,
                $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb,
                $28::jsonb, $29::jsonb, $30::jsonb, $31::jsonb,
                $32, $33, $34, $35::jsonb, $36::jsonb,
                $37, $38, $39, $40
             ) RETURNING *`,
            [
                tenantId,
                emitId,
                ref,
                b.serie || '1',
                b.numero ? parseInt(b.numero, 10) : null,
                tipoEmitenteFinal,
                String(b.tipo_transporte || '1'),
                normalizarUf(b.uf_inicio || 'MS') || 'MS',
                normalizarUf(ufFimResolvida || 'MS') || 'MS',
                JSON.stringify(b.ufs_percurso || []),
                JSON.stringify(munCarregArray),
                JSON.stringify(munDescFinal),
                codMunCarreg,
                nomeMunCarreg,
                codMunDesc,
                nomeMunDesc,
                b.cep_carregamento ? String(b.cep_carregamento).replace(/\D/g, '').slice(0, 8) : null,
                b.cep_descarregamento ? String(b.cep_descarregamento).replace(/\D/g, '').slice(0, 8) : null,
                veiculoId,
                veiculoPlaca || 'AAA0000',
                motoristaId,
                motoristaCpf || '00000000000',
                motoristaNome || 'CONDUTOR NAO INFORMADO',
                JSON.stringify(b.condutores || []),
                JSON.stringify(b.reboques || []),
                JSON.stringify(b.contratantes || []),
                JSON.stringify(b.pagto_frete || []),
                JSON.stringify(b.seguros || []),
                JSON.stringify(b.produtos_predominantes || []),
                JSON.stringify(b.lacres || []),
                JSON.stringify(b.pessoas_autorizadas || []),
                b.informacao_adicional || null,
                b.ciot_codigo ? String(b.ciot_codigo).replace(/\D/g, '').slice(0, 12) : null,
                b.ciot_responsavel_documento ? String(b.ciot_responsavel_documento).replace(/\D/g, '').slice(0, 14) : null,
                JSON.stringify(Array.isArray(b.ciots) ? b.ciots : []),
                JSON.stringify(b.vale_pedagio || {}),
                ctesIds.length,
                cargasIds.length + chavesNfeManuais.length,
                valorCargaSalvar,
                pesoBrutoSalvar,
            ]
        );

        const novoMdfe = rows[0];

        for (const cteId of ctesIds) {
            const cteRes = await db.query(
                `SELECT chave_cte, codigo_municipio_fim, municipio_fim FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
                [cteId, tenantId]
            );
            if (cteRes.rows.length > 0 && cteRes.rows[0].chave_cte) {
                const ct = cteRes.rows[0];
                await db.query(
                    `INSERT INTO dash_mdfe_documentos (tenant_id, mdfe_id, tipo_documento, chave, codigo_municipio_descarregamento, nome_municipio_descarregamento)
                     VALUES ($1, $2, 'CTE', $3, $4, $5)
                     ON CONFLICT (tenant_id, mdfe_id, chave) DO NOTHING`,
                    [tenantId, novoMdfe.id, ct.chave_cte, ct.codigo_municipio_fim, ct.municipio_fim]
                );
            }
        }

        for (const cg of cargasSelecionadasRows) {
            if (!cg.chave_acesso) continue;
            const ibge = cargasIbgeResolvidoMap.get(cg.id);
            await db.query(
                `INSERT INTO dash_mdfe_documentos (tenant_id, mdfe_id, tipo_documento, chave, codigo_municipio_descarregamento, nome_municipio_descarregamento)
                 VALUES ($1, $2, 'NFE', $3, $4, $5)
                 ON CONFLICT (tenant_id, mdfe_id, chave) DO NOTHING`,
                [
                    tenantId,
                    novoMdfe.id,
                    cg.chave_acesso,
                    ibge?.codigo || cg.destinatario_codigo_ibge || null,
                    ibge?.nome || cg.destinatario_municipio || null,
                ]
            );
            await db.query(
                `UPDATE dash_cargas SET status = 'EM_MDFE', mdfe_id = $1 WHERE id = $2 AND tenant_id = $3`,
                [novoMdfe.id, cg.id, tenantId]
            );
        }

        for (const chaveNfeManual of chavesNfeManuais) {
            await db.query(
                `INSERT INTO dash_mdfe_documentos (tenant_id, mdfe_id, tipo_documento, chave, codigo_municipio_descarregamento, nome_municipio_descarregamento)
                 VALUES ($1, $2, 'NFE', $3, $4, $5)
                 ON CONFLICT (tenant_id, mdfe_id, chave) DO NOTHING`,
                [tenantId, novoMdfe.id, chaveNfeManual, codMunDesc, nomeMunDesc]
            );
        }

        const ciotContratoIdVinc = b.ciot_contrato_id ? parseInt(b.ciot_contrato_id, 10) : null;
        const ciotCodVinc = b.ciot_codigo ? String(b.ciot_codigo).replace(/\D/g, '').slice(0, 12) : '';
        if (Number.isFinite(ciotContratoIdVinc) || ciotCodVinc) {
            await db
                .query(
                    `UPDATE dash_contratos_transporte
                     SET mdfe_id = $1, updated_at = NOW()
                     WHERE tenant_id = $2
                       AND (
                         ($3::int IS NOT NULL AND id = $3)
                         OR ($4 <> '' AND ciot_codigo = $4)
                       )`,
                    [novoMdfe.id, tenantId, Number.isFinite(ciotContratoIdVinc) ? ciotContratoIdVinc : null, ciotCodVinc]
                )
                .catch(() => null);
        }

        return res.status(201).json({ success: true, data: novoMdfe });
    } catch (err) {
        logger.error('[Transporte API] Erro ao criar MDF-e:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes/:id/emitir', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = req.params.id;

    try {
        const result = await TransporteService.emitirMdfe(tenantId, mdfeId);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes/:id/consultar-focus', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = req.params.id;
    try {
        const result = await TransporteService.consultarMdfeFocus(tenantId, mdfeId);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.post('/mdfes/:id/encerrar', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = req.params.id;
    try {
        const result = await TransporteService.encerrarMdfe(tenantId, mdfeId, req.body || {});
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/mdfes/:id/cancelar', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = req.params.id;
    const { justificativa } = req.body || {};
    try {
        const result = await TransporteService.cancelarMdfe(tenantId, mdfeId, justificativa);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 4. FROTA (Veículos e Motoristas)
// ─────────────────────────────────────────────────────────────

router.get('/veiculos', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(`SELECT * FROM dash_veiculos WHERE tenant_id = $1 AND ativo = true ORDER BY placa`, [tenantId]);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Cadastra (ou atualiza) um veículo.
 */
router.post('/veiculos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        id, placa, renavam, chassi, uf, tipo_rodado = '01', tipo_carroceria = '02',
        tara_kg = 0, capacidade_kg = 0, capacidade_m3 = 0, tipo_proprietario = '1',
        rntrc = null, cpf_cnpj_proprietario = null, nome_proprietario = null, uf_proprietario = null
    } = req.body || {};

    const checkPlaca = veiculoService.validarPlaca(placa);
    if (!checkPlaca.valida) {
        return res.status(400).json({
            error: 'Placa inválida. Informe uma placa brasileira no padrão antigo (ABC-1234) ou Mercosul (ABC1D23).'
        });
    }

    const cleanRenavam = renavam ? String(renavam).replace(/\D/g, '').slice(0, 20) : null;
    const cleanChassi = chassi ? String(chassi).trim().toUpperCase().slice(0, 40) : null;
    const cleanUf = uf ? String(uf).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2) : null;
    const cleanRntrc = rntrc ? String(rntrc).replace(/\D/g, '').slice(0, 20) : null;
    const cleanDocProp = cpf_cnpj_proprietario
        ? String(cpf_cnpj_proprietario).replace(/\D/g, '').slice(0, 14)
        : null;
    const cleanNomeProp = nome_proprietario ? String(nome_proprietario).trim().slice(0, 255) : null;
    const cleanUfProp = uf_proprietario
        ? String(uf_proprietario).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2)
        : null;
    const parsedTara = Number.isFinite(parseFloat(tara_kg)) ? parseFloat(tara_kg) : 0;
    const parsedCapKg = Number.isFinite(parseFloat(capacidade_kg)) ? parseFloat(capacidade_kg) : 0;
    const parsedCapM3 = Number.isFinite(parseFloat(capacidade_m3)) ? parseFloat(capacidade_m3) : 0;
    const numericId = Number(id) > 0 ? parseInt(id, 10) : null;

    try {
        if (numericId) {
            const upd = await db.query(
                `UPDATE dash_veiculos SET
                    placa = $1,
                    renavam = $2,
                    chassi = $3,
                    uf = $4,
                    tipo_rodado = $5,
                    tipo_carroceria = $6,
                    tara_kg = $7,
                    capacidade_kg = $8,
                    capacidade_m3 = $9,
                    tipo_proprietario = $10,
                    rntrc = $11,
                    cpf_cnpj_proprietario = $12,
                    nome_proprietario = $13,
                    uf_proprietario = $14,
                    ativo = true,
                    updated_at = NOW()
                 WHERE id = $15 AND tenant_id = $16
                 RETURNING *`,
                [
                    checkPlaca.limpa, cleanRenavam, cleanChassi, cleanUf,
                    tipo_rodado, tipo_carroceria, parsedTara, parsedCapKg, parsedCapM3,
                    tipo_proprietario, cleanRntrc, cleanDocProp, cleanNomeProp, cleanUfProp,
                    numericId, tenantId
                ]
            );
            if (upd.rowCount > 0) {
                return res.json({ success: true, data: upd.rows[0] });
            }
        }

        const { rows } = await db.query(
            `INSERT INTO dash_veiculos (
                tenant_id, placa, renavam, chassi, uf, tipo_rodado, tipo_carroceria,
                tara_kg, capacidade_kg, capacidade_m3, tipo_proprietario,
                rntrc, cpf_cnpj_proprietario, nome_proprietario, uf_proprietario
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (tenant_id, placa) DO UPDATE SET
                renavam = COALESCE(NULLIF(EXCLUDED.renavam, ''), dash_veiculos.renavam),
                chassi = COALESCE(NULLIF(EXCLUDED.chassi, ''), dash_veiculos.chassi),
                uf = COALESCE(NULLIF(EXCLUDED.uf, ''), dash_veiculos.uf),
                tipo_rodado = EXCLUDED.tipo_rodado,
                tipo_carroceria = EXCLUDED.tipo_carroceria,
                tara_kg = EXCLUDED.tara_kg,
                capacidade_kg = EXCLUDED.capacidade_kg,
                capacidade_m3 = EXCLUDED.capacidade_m3,
                tipo_proprietario = EXCLUDED.tipo_proprietario,
                rntrc = COALESCE(EXCLUDED.rntrc, dash_veiculos.rntrc),
                cpf_cnpj_proprietario = COALESCE(EXCLUDED.cpf_cnpj_proprietario, dash_veiculos.cpf_cnpj_proprietario),
                nome_proprietario = COALESCE(EXCLUDED.nome_proprietario, dash_veiculos.nome_proprietario),
                uf_proprietario = COALESCE(EXCLUDED.uf_proprietario, dash_veiculos.uf_proprietario),
                ativo = true,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId, checkPlaca.limpa, cleanRenavam,
                cleanChassi, cleanUf, tipo_rodado, tipo_carroceria,
                parsedTara, parsedCapKg, parsedCapM3,
                tipo_proprietario, cleanRntrc, cleanDocProp,
                cleanNomeProp, cleanUfProp
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/veiculos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`UPDATE dash_veiculos SET ativo = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Consulta a placa nas bases públicas e devolve os dados preenchidos.
 */
router.get('/veiculos/placa/:placa', async (req, res) => {
    try {
        const resultado = await veiculoService.consultarPlaca(req.params.placa);
        return res.json({ success: true, ...resultado });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get('/motoristas', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(`SELECT * FROM dash_motoristas WHERE tenant_id = $1 AND ativo = true ORDER BY nome`, [tenantId]);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Cadastra (ou atualiza) um motorista.
 */
router.post('/motoristas', async (req, res) => {
    const tenantId = req.tenant.id;
    const { id, cpf, nome, cnh = null, cnh_categoria = null, cnh_validade = null, telefone = null } = req.body || {};

    const cleanCpf = String(cpf || '').replace(/\D/g, '');
    const cleanNome = String(nome || '').trim();
    if (cleanCpf.length !== 11 || !cleanNome) {
        return res.status(400).json({ error: 'CPF válido (11 dígitos) e nome completo são obrigatórios.' });
    }

    const cleanCnh = cnh ? String(cnh).replace(/\D/g, '').slice(0, 20) : null;
    const cleanCat = cnh_categoria ? String(cnh_categoria).trim().toUpperCase().slice(0, 4) : null;
    const cleanValidade = cnh_validade && String(cnh_validade).trim() ? String(cnh_validade).slice(0, 10) : null;
    const cleanFone = telefone ? String(telefone).trim().slice(0, 30) : null;
    const numericId = Number(id) > 0 ? parseInt(id, 10) : null;

    try {
        if (numericId) {
            const upd = await db.query(
                `UPDATE dash_motoristas SET
                    cpf = $1,
                    nome = $2,
                    cnh = $3,
                    cnh_categoria = $4,
                    cnh_validade = $5,
                    telefone = $6,
                    ativo = true,
                    updated_at = NOW()
                 WHERE id = $7 AND tenant_id = $8
                 RETURNING *`,
                [cleanCpf, cleanNome, cleanCnh, cleanCat, cleanValidade, cleanFone, numericId, tenantId]
            );
            if (upd.rowCount > 0) {
                return res.json({ success: true, data: upd.rows[0] });
            }
        }

        const { rows } = await db.query(
            `INSERT INTO dash_motoristas (
                tenant_id, cpf, nome, cnh, cnh_categoria, cnh_validade, telefone
             ) VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (tenant_id, cpf) DO UPDATE SET
                nome = EXCLUDED.nome,
                cnh = COALESCE(NULLIF(EXCLUDED.cnh, ''), dash_motoristas.cnh),
                cnh_categoria = COALESCE(NULLIF(EXCLUDED.cnh_categoria, ''), dash_motoristas.cnh_categoria),
                cnh_validade = COALESCE(EXCLUDED.cnh_validade, dash_motoristas.cnh_validade),
                telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), dash_motoristas.telefone),
                ativo = true,
                updated_at = NOW()
             RETURNING *`,
            [tenantId, cleanCpf, cleanNome, cleanCnh, cleanCat, cleanValidade, cleanFone]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/motoristas/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`UPDATE dash_motoristas SET ativo = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 5. CONFIGURAÇÕES FISCAIS / EMITENTES
// ─────────────────────────────────────────────────────────────

router.get('/emitentes/consultar-cnpj/:cnpj', async (req, res) => {
    try {
        const dados = await TransporteService.consultarCnpjReceita(req.params.cnpj);
        return res.json({ success: true, data: dados });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.get('/emitentes', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await TransporteService.autoHidratarEmitentePeloCertificado(tenantId);
        let { rows } = await db.query(
            `SELECT * FROM dash_emitentes
             WHERE tenant_id = $1
             ORDER BY CASE WHEN LENGTH(REGEXP_REPLACE(COALESCE(cnpj, ''), '\\D', '', 'g')) = 14 THEN 0 ELSE 1 END, id ASC`,
            [tenantId]
        );

        // Buscar configurações da aba Fiscal (dash_integracoes_config) para mesclar tokens/dados
        const cfgRes = await db.query(
            `SELECT * FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
            [tenantId]
        ).catch(() => ({ rows: [] }));
        const cfg = cfgRes.rows[0] || {};

        if (rows.length === 0) {
            const filialRes = await db.query(
                `SELECT nome, documento FROM dash_filiais WHERE tenant_id = $1 AND ativo = true ORDER BY is_default DESC LIMIT 1`,
                [tenantId]
            ).catch(() => ({ rows: [] }));
            const f = filialRes.rows[0] || {};
            const cleanDoc =
                String(cfg.empresa_cnpj || f.documento || '').replace(/\D/g, '') || '00000000000100';
            const razao = cfg.empresa_razao_social || cfg.empresa_nome || f.nome || 'EMPRESA EMITENTE';
            const fantasia = cfg.empresa_nome || razao;
            const insRes = await db.query(
                `INSERT INTO dash_emitentes (
                    tenant_id, cnpj, razao_social, nome_fantasia, inscricao_estadual, rntrc,
                    regime_tributario, logradouro, numero, complemento, bairro, cep,
                    uf, municipio, codigo_municipio, telefone, email,
                    focus_ambiente, focus_token_homologacao, focus_token_producao, focus_token,
                    serie_cte, serie_mdfe, cfop_padrao_cte, natureza_padrao_cte, aliquota_icms_padrao, ativo
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,true)
                 ON CONFLICT (tenant_id, cnpj) DO UPDATE SET razao_social = EXCLUDED.razao_social
                 RETURNING *`,
                [
                    tenantId,
                    cleanDoc,
                    razao,
                    fantasia,
                    cfg.focus_inscricao_estadual || cfg.empresa_ie || '',
                    cfg.focus_rntrc || '',
                    cfg.focus_regime_tributario || '1',
                    cfg.focus_logradouro || cfg.empresa_endereco || 'RUA PRINCIPAL',
                    cfg.focus_numero || cfg.empresa_numero || 'SN',
                    cfg.focus_complemento || cfg.empresa_complemento || '',
                    cfg.focus_bairro || cfg.empresa_bairro || 'CENTRO',
                    String(cfg.focus_cep || cfg.empresa_cep || '79004000').replace(/\D/g, ''),
                    cfg.focus_uf || 'MS',
                    cfg.focus_municipio || cfg.empresa_regiao || 'Campo Grande',
                    cfg.focus_codigo_municipio || '5002704',
                    String(cfg.empresa_fone1 || '').replace(/\D/g, ''),
                    cfg.empresa_email || '',
                    cfg.focus_ambiente || 'homologacao',
                    cfg.focus_token_homologacao || null,
                    cfg.focus_token_producao || null,
                    cfg.focus_ambiente === 'producao' ? cfg.focus_token_producao : cfg.focus_token_homologacao,
                    cfg.focus_serie_cte || '1',
                    cfg.focus_serie_mdfe || '1',
                    cfg.focus_cfop_padrao || '5353',
                    cfg.focus_natureza_padrao || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                    cfg.focus_aliquota_icms_padrao ?? 12.0,
                ]
            );
            rows = insRes.rows;
        }

        const masterCfg = await TransporteService.getMasterFocusConfig();

        const enriched = rows.map((r) => {
            const rawTokHomolog =
                r.focus_token_homologacao ||
                cfg.focus_token_homologacao ||
                (r.focus_ambiente !== 'producao' ? r.focus_token : '') ||
                '';
            const rawTokProd =
                r.focus_token_producao ||
                cfg.focus_token_producao ||
                (r.focus_ambiente === 'producao' ? r.focus_token : '') ||
                '';
            const plainHomolog = String(decryptSecret(rawTokHomolog) || '').trim();
            const plainProd = String(decryptSecret(rawTokProd) || '').trim();
            const plainCiotToken = String(decryptSecret(r.ciot_integrador_token) || '').trim();
            const plainCiotSenha = String(decryptSecret(r.ciot_senha) || '').trim();
            return {
                ...r,
                focus_ambiente: r.focus_ambiente || cfg.focus_ambiente || 'homologacao',
                focus_token: maskSecret(r.focus_token),
                focus_token_homologacao: maskSecret(rawTokHomolog),
                focus_token_producao: maskSecret(rawTokProd),
                tem_token_homologacao: Boolean(plainHomolog),
                tem_token_producao: Boolean(plainProd),
                token_homologacao_preview: plainHomolog ? `${plainHomolog.slice(0, 4)}••••` : null,
                token_producao_preview: plainProd ? `${plainProd.slice(0, 4)}••••` : null,
                ciot_provedor: PROVEDORES_CIOT_SUPORTADOS.includes(String(r.ciot_provedor || '').toUpperCase())
                    ? String(r.ciot_provedor).toUpperCase()
                    : 'HOMOLOGACAO_LOCAL',
                ciot_ambiente: String(r.ciot_ambiente || r.focus_ambiente || 'homologacao').toLowerCase(),
                ciot_usuario: r.ciot_usuario || '',
                ciot_cnpj_ipef: r.ciot_cnpj_ipef || '',
                ciot_integrador_token: maskSecret(r.ciot_integrador_token),
                ciot_senha: maskSecret(r.ciot_senha),
                tem_ciot_token: Boolean(plainCiotToken),
                tem_ciot_senha: Boolean(plainCiotSenha),
                cnpj_valido: TransporteService.validarCnpjReal(r.cnpj),
                software_house_disponivel: masterCfg.temMasterToken,
                tem_logo: Boolean(r.logo_base64),
                logo_data_uri: r.logo_base64
                    ? `data:${r.logo_mime || 'image/png'};base64,${r.logo_base64}`
                    : null,
                regime_tributario: r.regime_tributario || cfg.focus_regime_tributario || '1',
                perfil_operacional: ['CARGA_PROPRIA', 'TRANSPORTADORA', 'HIBRIDO'].includes(
                    String(r.perfil_operacional || '').toUpperCase()
                )
                    ? String(r.perfil_operacional).toUpperCase()
                    : 'HIBRIDO',
                mdfe_tipo_emitente_padrao:
                    String(r.perfil_operacional || '').toUpperCase() === 'CARGA_PROPRIA'
                        ? '2'
                        : String(r.perfil_operacional || '').toUpperCase() === 'TRANSPORTADORA'
                        ? '1'
                        : String(r.mdfe_tipo_emitente_padrao || '1') === '2'
                        ? '2'
                        : '1',
                serie_cte: r.serie_cte || cfg.focus_serie_cte || '1',
                serie_mdfe: r.serie_mdfe || cfg.focus_serie_mdfe || '1',
                cfop_padrao_cte: r.cfop_padrao_cte || cfg.focus_cfop_padrao || '5353',
                natureza_padrao_cte:
                    r.natureza_padrao_cte || cfg.focus_natureza_padrao || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                aliquota_icms_padrao:
                    String(r.uf || 'MS').toUpperCase() === 'MS' && Number(r.aliquota_icms_padrao ?? 12) === 12
                        ? 17.0
                        : r.aliquota_icms_padrao ?? cfg.focus_aliquota_icms_padrao ?? 17.0,
            };
        });

        return res.json({
            success: true,
            data: enriched,
            meta: {
                software_house_disponivel: masterCfg.temMasterToken,
                is_super_admin_master: isSuperAdminMaster(req),
                webhook_endpoint: masterCfg.webhookEndpoint,
            },
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/transporte/municipios
 * Busca municípios e códigos IBGE a partir de dash_regioes (sincronizado do ERP)
 * e complementa com dash_coordenadas_municipios.
 */
/**
 * Diagnóstico da sincronização do módulo Transporte.
 * Mostra se o Worker estáConfigured, se as notas chegaram e o que fazer.
 */
router.get('/diagnostico', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const [cargas, ultimaSync, emitteres, heartbeat] = await Promise.all([
            db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'PENDENTE')::int AS pendentes,
                        MAX(sincronizado_em) AS ultima
                 FROM dash_cargas WHERE tenant_id = $1`,
                [tenantId]
            ).catch(() => ({ rows: [{ total: 0, pendentes: 0, ultima: null }] })),
            db.query(
                `SELECT MAX(ultima_sincronizacao) AS ultima, MAX(registros_sincronizados)::int AS registros
                 FROM dash_sync_metadata WHERE tenant_id = $1 AND tabela = 'dash_cargas'`,
                [tenantId]
            ).catch(() => ({ rows: [{ ultima: null, registros: 0 }] })),
            db.query(
                `SELECT COUNT(*)::int AS total FROM dash_emitentes WHERE tenant_id = $1`,
                [tenantId]
            ).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(
                `SELECT status, ultima_sincronizacao FROM dash_sync_metadata
                 WHERE tenant_id = $1 AND tabela = 'dash_cargas'`,
                [tenantId]
            ).catch(() => ({ rows: [] }))
        ]);

        const totalCargas = cargas.rows[0]?.total || 0;
        const meta = ultimaSync.rows[0] || {};
        const hb = heartbeat.rows[0] || {};

        const diagnostico = {
            notas_no_banco: totalCargas,
            notas_pendentes: cargas.rows[0]?.pendentes || 0,
            ultima_sincronizacao: cargas.rows[0]?.ultima || meta.ultima || null,
            registros_no_metadata: meta.registros || 0,
            status_sync: hb.status || 'NUNCA_SINCRONIZOU',
            emitentes_cadastrados: emitteres.rows[0]?.total || 0,
            diagnostico: null,
            acoes: []
        };

        if (totalCargas === 0) {
            diagnostico.diagnostico =
                'O Worker do ERP ainda nao enviou as notas fiscais para este tenant. Verifique no Configurator do Cliente: ative o modulo "Coliseu Transporte" e informe a Internal API Key.';
            diagnostico.acoes = [
                'No Configurator (ColiseuSales), marque "Coliseu Transporte" como habilitado',
                'Confirme a URL: https://transporte.coliseusistemas.com.br',
                'Informe a Internal API Key do módulo no campo correspondente',
                'Reinicie o servico ColiseuSales.Worker no Windows do cliente',
                'Aguarde o primeiro ciclo de sincronizacao (o Worker envia a cada 10 minutos)'
            ];
        } else if (diagnostico.emitentes_cadastrados === 0) {
            diagnostico.diagnostico =
                'As notas chegaram, mas nenhum emitente fiscal esta cadastrado. Configure em Configuracoes > Dados da Empresa.';
            diagnostico.acoes = [
                'Acesse Configuracoes > Dados da Empresa no Coliseu Transporte',
                'Cadastre o CNPJ, Inscricao Estadual, RNTRC e o token da Focus NFe'
            ];
        } else {
            diagnostico.diagnostico = 'Sincronizacao ativa.';
        }

        return res.json({ success: true, data: diagnostico });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get('/municipios', async (req, res) => {
    const tenantId = req.tenant.id;
    const { search = '', uf = '' } = req.query;

    try {
        let sql = `
            SELECT DISTINCT
                COALESCE(r.cidade, c.nome) AS cidade,
                COALESCE(r.uf, c.uf) AS uf,
                COALESCE(r.cod_ibge, c.codigo_ibge) AS codigo_ibge
            FROM dash_regioes r
            FULL OUTER JOIN dash_coordenadas_municipios c ON UPPER(TRIM(c.nome)) = UPPER(TRIM(r.cidade))
            WHERE (r.tenant_id = $1 OR r.tenant_id IS NULL)
        `;
        const params = [tenantId];

        if (uf) {
            const ufNorm = normalizarUf(uf) || String(uf).toUpperCase().trim().slice(0, 2);
            params.push(ufNorm);
            sql += ` AND (UPPER(TRIM(r.uf)) = $${params.length} OR UPPER(TRIM(c.uf)) = $${params.length})`;
        }

        if (search) {
            params.push(`%${search.trim()}%`);
            sql += ` AND (r.cidade ILIKE $${params.length} OR c.nome ILIKE $${params.length} OR r.cod_ibge ILIKE $${params.length} OR c.codigo_ibge ILIKE $${params.length})`;
        }

        sql += ` ORDER BY cidade ASC LIMIT 100`;

        const { rows } = await db.query(sql, params).catch(() => ({ rows: [] }));
        const dictList = listarMunicipiosDicionario(uf, search);

        const merged = new Map();
        for (const r of rows) {
            if (!r.cidade) continue;
            const key = `${String(r.cidade).toUpperCase().trim()}|${String(r.uf || '').toUpperCase().trim()}`;
            merged.set(key, {
                cidade: r.cidade,
                uf: normalizarUf(r.uf) || r.uf,
                codigo_ibge: r.codigo_ibge,
            });
        }
        for (const d of dictList) {
            const key = `${String(d.nome).toUpperCase().trim()}|${d.uf}`;
            if (!merged.has(key) || !merged.get(key).codigo_ibge) {
                merged.set(key, {
                    cidade: d.nome,
                    uf: d.uf,
                    codigo_ibge: d.codigo,
                });
            }
        }

        return res.json({
            success: true,
            data: Array.from(merged.values()).slice(0, 150),
        });
    } catch (err) {
        logger.error('[Transporte] Erro ao buscar municípios:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar municípios' });
    }
});

router.post('/emitentes', async (req, res) => {
    const tenantId = req.tenant.id;
    const b = req.body || {};
    const cleanCnpj = String(b.cnpj || '').replace(/\D/g, '');
    if (!cleanCnpj) {
        return res.status(400).json({ error: 'CNPJ é obrigatório.' });
    }
    if (!TransporteService.validarCnpjReal(cleanCnpj)) {
        return res.status(400).json({
            error: `O CNPJ informado ("${b.cnpj}") é inválido. Informe o CNPJ real de 14 dígitos da transportadora.`
        });
    }

    try {
        const ambiente = String(b.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
            ? 'producao'
            : 'homologacao';

        const byIdRes = b.id
            ? await db.query(
                `SELECT * FROM dash_emitentes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [parseInt(b.id, 10), tenantId]
            )
            : { rows: [] };
        const byCnpjRes = await db.query(
            `SELECT * FROM dash_emitentes WHERE tenant_id = $1 AND cnpj = $2 LIMIT 1`,
            [tenantId, cleanCnpj]
        );

        const targetById = byIdRes.rows[0] || null;
        const targetByCnpj = byCnpjRes.rows[0] || null;
        const existingEmit = targetByCnpj || targetById || {};

        const incomingHomolog =
            b.focus_token_homologacao !== undefined
                ? b.focus_token_homologacao
                : (ambiente === 'homologacao' ? b.focus_token : undefined);

        const incomingProd =
            b.focus_token_producao !== undefined
                ? b.focus_token_producao
                : (ambiente === 'producao' ? b.focus_token : undefined);

        const tokHomolog = resolveSecretForSave(incomingHomolog, existingEmit.focus_token_homologacao);
        const tokProd = resolveSecretForSave(incomingProd, existingEmit.focus_token_producao);
        const tokAtivo =
            resolveSecretForSave(b.focus_token, null) ||
            (ambiente === 'producao' ? tokProd : tokHomolog) ||
            resolveSecretForSave(null, existingEmit.focus_token);

        const perfilOpRaw = String(b.perfil_operacional || existingEmit.perfil_operacional || 'HIBRIDO')
            .toUpperCase()
            .trim();
        const perfilOperacional = ['CARGA_PROPRIA', 'TRANSPORTADORA', 'HIBRIDO'].includes(perfilOpRaw)
            ? perfilOpRaw
            : 'HIBRIDO';
        const mdfeTipoEmitentePadrao =
            perfilOperacional === 'CARGA_PROPRIA'
                ? '2'
                : perfilOperacional === 'TRANSPORTADORA'
                ? '1'
                : String(b.mdfe_tipo_emitente_padrao || existingEmit.mdfe_tipo_emitente_padrao || '1') === '2'
                ? '2'
                : '1';

        const ciotProvedorRaw = String(
            b.ciot_provedor || existingEmit.ciot_provedor || 'HOMOLOGACAO_LOCAL'
        )
            .toUpperCase()
            .trim();
        const ciotProvedor = PROVEDORES_CIOT_SUPORTADOS.includes(ciotProvedorRaw)
            ? ciotProvedorRaw
            : 'HOMOLOGACAO_LOCAL';
        const ciotAmbiente =
            String(b.ciot_ambiente || existingEmit.ciot_ambiente || ambiente).toLowerCase() === 'producao'
                ? 'producao'
                : 'homologacao';
        const ciotUsuario =
            b.ciot_usuario !== undefined ? String(b.ciot_usuario || '').trim() || null : (existingEmit.ciot_usuario || null);
        const ciotCnpjIpef =
            b.ciot_cnpj_ipef !== undefined
                ? String(b.ciot_cnpj_ipef || '').replace(/\D/g, '').slice(0, 14) || null
                : (existingEmit.ciot_cnpj_ipef || null);
        const ciotTokenSaved = resolveSecretForSave(
            b.ciot_integrador_token,
            existingEmit.ciot_integrador_token
        );
        const ciotSenhaSaved = resolveSecretForSave(b.ciot_senha, existingEmit.ciot_senha);

        let saved = null;

        // Se está editando o emitente atual (ex: corrigindo CNPJ placeholder 00000000000100 ou "1"), atualiza in-place mantendo o ID!
        if (targetById && (!targetByCnpj || targetByCnpj.id === targetById.id)) {
            const { rows } = await db.query(
                `UPDATE dash_emitentes SET
                    cnpj = $1,
                    razao_social = $2,
                    nome_fantasia = $3,
                    inscricao_estadual = $4,
                    inscricao_municipal = $5,
                    rntrc = $6,
                    regime_tributario = $7,
                    logradouro = $8,
                    numero = $9,
                    complemento = $10,
                    bairro = $11,
                    cep = $12,
                    uf = $13,
                    municipio = $14,
                    codigo_municipio = $15,
                    telefone = $16,
                    email = $17,
                    focus_token = COALESCE(NULLIF($18, ''), focus_token),
                    focus_token_homologacao = COALESCE(NULLIF($19, ''), focus_token_homologacao),
                    focus_token_producao = COALESCE(NULLIF($20, ''), focus_token_producao),
                    focus_ambiente = $21,
                    serie_cte = $22,
                    serie_mdfe = $23,
                    cfop_padrao_cte = $24,
                    natureza_padrao_cte = $25,
                    aliquota_icms_padrao = $26,
                    perfil_operacional = $27,
                    mdfe_tipo_emitente_padrao = $28,
                    ciot_provedor = $29,
                    ciot_ambiente = $30,
                    ciot_usuario = $31,
                    ciot_cnpj_ipef = $32,
                    ciot_integrador_token = COALESCE(NULLIF($33, ''), ciot_integrador_token),
                    ciot_senha = COALESCE(NULLIF($34, ''), ciot_senha),
                    updated_at = NOW()
                 WHERE id = $35 AND tenant_id = $36
                 RETURNING *`,
                [
                    cleanCnpj,
                    b.razao_social || 'EMPRESA EMITENTE',
                    b.nome_fantasia || b.razao_social || 'EMPRESA EMITENTE',
                    b.inscricao_estadual || '',
                    b.inscricao_municipal ? String(b.inscricao_municipal).replace(/\D/g, '') : (targetById.inscricao_municipal || null),
                    b.rntrc || '',
                    b.regime_tributario || '1',
                    b.logradouro || null,
                    b.numero || null,
                    b.complemento || null,
                    b.bairro || null,
                    b.cep ? String(b.cep).replace(/\D/g, '') : null,
                    b.uf ? String(b.uf).toUpperCase().slice(0, 2) : null,
                    b.municipio || null,
                    b.codigo_municipio ? String(b.codigo_municipio).replace(/\D/g, '') : null,
                    b.telefone ? String(b.telefone).replace(/\D/g, '') : null,
                    b.email || null,
                    tokAtivo,
                    tokHomolog,
                    tokProd,
                    ambiente,
                    b.serie_cte || '1',
                    b.serie_mdfe || '1',
                    b.cfop_padrao_cte || '5353',
                    b.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                    b.aliquota_icms_padrao !== undefined ? parseFloat(b.aliquota_icms_padrao) : 12.0,
                    perfilOperacional,
                    mdfeTipoEmitentePadrao,
                    ciotProvedor,
                    ciotAmbiente,
                    ciotUsuario,
                    ciotCnpjIpef,
                    ciotTokenSaved,
                    ciotSenhaSaved,
                    targetById.id,
                    tenantId,
                ]
            );
            saved = rows[0];
        } else {
            const { rows } = await db.query(
                `INSERT INTO dash_emitentes (
                    tenant_id, cnpj, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal,
                    rntrc, regime_tributario,
                    logradouro, numero, complemento, bairro, cep,
                    uf, municipio, codigo_municipio, telefone, email,
                    focus_token, focus_token_homologacao, focus_token_producao, focus_ambiente,
                    serie_cte, serie_mdfe, cfop_padrao_cte, natureza_padrao_cte, aliquota_icms_padrao,
                    perfil_operacional, mdfe_tipo_emitente_padrao,
                    ciot_provedor, ciot_ambiente, ciot_usuario, ciot_cnpj_ipef, ciot_integrador_token, ciot_senha
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8,
                    $9, $10, $11, $12, $13,
                    $14, $15, $16, $17, $18,
                    $19, $20, $21, $22,
                    $23, $24, $25, $26, $27,
                    $28, $29,
                    $30, $31, $32, $33, $34, $35
                 )
                 ON CONFLICT (tenant_id, cnpj) DO UPDATE SET
                    razao_social = EXCLUDED.razao_social,
                    nome_fantasia = COALESCE(NULLIF(EXCLUDED.nome_fantasia, ''), dash_emitentes.nome_fantasia),
                    inscricao_estadual = COALESCE(EXCLUDED.inscricao_estadual, dash_emitentes.inscricao_estadual),
                    inscricao_municipal = COALESCE(EXCLUDED.inscricao_municipal, dash_emitentes.inscricao_municipal),
                    rntrc = COALESCE(EXCLUDED.rntrc, dash_emitentes.rntrc),
                    regime_tributario = COALESCE(EXCLUDED.regime_tributario, dash_emitentes.regime_tributario),
                    logradouro = COALESCE(NULLIF(EXCLUDED.logradouro, ''), dash_emitentes.logradouro),
                    numero = COALESCE(NULLIF(EXCLUDED.numero, ''), dash_emitentes.numero),
                    complemento = COALESCE(EXCLUDED.complemento, dash_emitentes.complemento),
                    bairro = COALESCE(NULLIF(EXCLUDED.bairro, ''), dash_emitentes.bairro),
                    cep = COALESCE(NULLIF(EXCLUDED.cep, ''), dash_emitentes.cep),
                    uf = COALESCE(NULLIF(EXCLUDED.uf, ''), dash_emitentes.uf),
                    municipio = COALESCE(NULLIF(EXCLUDED.municipio, ''), dash_emitentes.municipio),
                    codigo_municipio = COALESCE(NULLIF(EXCLUDED.codigo_municipio, ''), dash_emitentes.codigo_municipio),
                    telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), dash_emitentes.telefone),
                    email = COALESCE(NULLIF(EXCLUDED.email, ''), dash_emitentes.email),
                    focus_token = COALESCE(NULLIF(EXCLUDED.focus_token, ''), dash_emitentes.focus_token),
                    focus_token_homologacao = COALESCE(NULLIF(EXCLUDED.focus_token_homologacao, ''), dash_emitentes.focus_token_homologacao),
                    focus_token_producao = COALESCE(NULLIF(EXCLUDED.focus_token_producao, ''), dash_emitentes.focus_token_producao),
                    focus_ambiente = EXCLUDED.focus_ambiente,
                    serie_cte = COALESCE(NULLIF(EXCLUDED.serie_cte, ''), dash_emitentes.serie_cte),
                    serie_mdfe = COALESCE(NULLIF(EXCLUDED.serie_mdfe, ''), dash_emitentes.serie_mdfe),
                    cfop_padrao_cte = COALESCE(NULLIF(EXCLUDED.cfop_padrao_cte, ''), dash_emitentes.cfop_padrao_cte),
                    natureza_padrao_cte = COALESCE(NULLIF(EXCLUDED.natureza_padrao_cte, ''), dash_emitentes.natureza_padrao_cte),
                    aliquota_icms_padrao = COALESCE(EXCLUDED.aliquota_icms_padrao, dash_emitentes.aliquota_icms_padrao),
                    perfil_operacional = EXCLUDED.perfil_operacional,
                    mdfe_tipo_emitente_padrao = EXCLUDED.mdfe_tipo_emitente_padrao,
                    ciot_provedor = EXCLUDED.ciot_provedor,
                    ciot_ambiente = EXCLUDED.ciot_ambiente,
                    ciot_usuario = COALESCE(EXCLUDED.ciot_usuario, dash_emitentes.ciot_usuario),
                    ciot_cnpj_ipef = COALESCE(EXCLUDED.ciot_cnpj_ipef, dash_emitentes.ciot_cnpj_ipef),
                    ciot_integrador_token = COALESCE(NULLIF(EXCLUDED.ciot_integrador_token, ''), dash_emitentes.ciot_integrador_token),
                    ciot_senha = COALESCE(NULLIF(EXCLUDED.ciot_senha, ''), dash_emitentes.ciot_senha),
                    updated_at = NOW()
                 RETURNING *`,
                [
                    tenantId,
                    cleanCnpj,
                    b.razao_social || 'EMPRESA EMITENTE',
                    b.nome_fantasia || b.razao_social || 'EMPRESA EMITENTE',
                    b.inscricao_estadual || '',
                    b.inscricao_municipal ? String(b.inscricao_municipal).replace(/\D/g, '') : null,
                    b.rntrc || '',
                    b.regime_tributario || '1',
                    b.logradouro || null,
                    b.numero || null,
                    b.complemento || null,
                    b.bairro || null,
                    b.cep ? String(b.cep).replace(/\D/g, '') : null,
                    b.uf ? String(b.uf).toUpperCase().slice(0, 2) : null,
                    b.municipio || null,
                    b.codigo_municipio ? String(b.codigo_municipio).replace(/\D/g, '') : null,
                    b.telefone ? String(b.telefone).replace(/\D/g, '') : null,
                    b.email || null,
                    tokAtivo,
                    tokHomolog,
                    tokProd,
                    ambiente,
                    b.serie_cte || '1',
                    b.serie_mdfe || '1',
                    b.cfop_padrao_cte || '5353',
                    b.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                    b.aliquota_icms_padrao !== undefined ? parseFloat(b.aliquota_icms_padrao) : 12.0,
                    perfilOperacional,
                    mdfeTipoEmitentePadrao,
                    ciotProvedor,
                    ciotAmbiente,
                    ciotUsuario,
                    ciotCnpjIpef,
                    ciotTokenSaved,
                    ciotSenhaSaved,
                ]
            );
            saved = rows[0];
        }

        // Sincronizar de volta com dash_integracoes_config para manter a aba Fiscal em Configurações atualizada
        await db.query(
            `UPDATE dash_integracoes_config
             SET focus_ambiente = $1,
                 focus_token_homologacao = COALESCE(NULLIF($2, ''), focus_token_homologacao),
                 focus_token_producao = COALESCE(NULLIF($3, ''), focus_token_producao),
                 focus_regime_tributario = COALESCE($4, focus_regime_tributario),
                 focus_rntrc = COALESCE(NULLIF($5, ''), focus_rntrc),
                 focus_serie_cte = COALESCE($6, focus_serie_cte),
                 focus_serie_mdfe = COALESCE($7, focus_serie_mdfe),
                 focus_cfop_padrao = COALESCE($8, focus_cfop_padrao),
                 focus_natureza_padrao = COALESCE($9, focus_natureza_padrao),
                 focus_aliquota_icms_padrao = COALESCE($10, focus_aliquota_icms_padrao),
                 focus_codigo_municipio = COALESCE(NULLIF($11, ''), focus_codigo_municipio),
                 focus_municipio = COALESCE(NULLIF($12, ''), focus_municipio),
                 focus_uf = COALESCE(NULLIF($13, ''), focus_uf),
                 focus_inscricao_estadual = COALESCE(NULLIF($14, ''), focus_inscricao_estadual),
                 focus_logradouro = COALESCE(NULLIF($15, ''), focus_logradouro),
                 focus_numero = COALESCE(NULLIF($16, ''), focus_numero),
                 focus_complemento = COALESCE($17, focus_complemento),
                 focus_bairro = COALESCE(NULLIF($18, ''), focus_bairro),
                 focus_cep = COALESCE(NULLIF($19, ''), focus_cep),
                 updated_at = NOW()
             WHERE tenant_id = $20`,
            [
                saved.focus_ambiente,
                saved.focus_token_homologacao,
                saved.focus_token_producao,
                saved.regime_tributario,
                saved.rntrc,
                saved.serie_cte,
                saved.serie_mdfe,
                saved.cfop_padrao_cte,
                saved.natureza_padrao_cte,
                saved.aliquota_icms_padrao,
                saved.codigo_municipio,
                saved.municipio,
                saved.uf,
                saved.inscricao_estadual,
                saved.logradouro,
                saved.numero,
                saved.complemento,
                saved.bairro,
                saved.cep,
                tenantId,
            ]
        ).catch(() => {});

        if (
            b.pis_cofins_modo !== undefined ||
            b.pis_cst !== undefined ||
            b.aliquota_pis !== undefined ||
            b.cofins_cst !== undefined ||
            b.aliquota_cofins !== undefined ||
            b.excluir_icms_base_pis_cofins !== undefined
        ) {
            const pcRes = await db.query(
                `UPDATE dash_emitentes
                 SET pis_cofins_modo = COALESCE($1, pis_cofins_modo),
                     pis_cst = CASE WHEN $2::boolean THEN $3 ELSE pis_cst END,
                     aliquota_pis = CASE WHEN $4::boolean THEN $5 ELSE aliquota_pis END,
                     cofins_cst = CASE WHEN $6::boolean THEN $7 ELSE cofins_cst END,
                     aliquota_cofins = CASE WHEN $8::boolean THEN $9 ELSE aliquota_cofins END,
                     excluir_icms_base_pis_cofins = COALESCE($10, excluir_icms_base_pis_cofins),
                     updated_at = NOW()
                 WHERE id = $11 AND tenant_id = $12
                 RETURNING *`,
                [
                    b.pis_cofins_modo || null,
                    b.pis_cst !== undefined,
                    b.pis_cst !== '' && b.pis_cst !== null ? String(b.pis_cst).padStart(2, '0').slice(-2) : null,
                    b.aliquota_pis !== undefined,
                    b.aliquota_pis !== '' && b.aliquota_pis !== null && b.aliquota_pis !== undefined ? parseFloat(b.aliquota_pis) : null,
                    b.cofins_cst !== undefined,
                    b.cofins_cst !== '' && b.cofins_cst !== null ? String(b.cofins_cst).padStart(2, '0').slice(-2) : null,
                    b.aliquota_cofins !== undefined,
                    b.aliquota_cofins !== '' && b.aliquota_cofins !== null && b.aliquota_cofins !== undefined ? parseFloat(b.aliquota_cofins) : null,
                    b.excluir_icms_base_pis_cofins !== undefined ? Boolean(b.excluir_icms_base_pis_cofins) : null,
                    saved.id,
                    tenantId,
                ]
            );
            if (pcRes.rows[0]) saved = pcRes.rows[0];
        }

        if (b.logo_base64 && typeof b.logo_base64 === 'string' && b.logo_base64.trim().length > 32) {
            const normLogo = TransporteService.normalizarLogoBase64(b.logo_base64);
            const logoRes = await db.query(
                `UPDATE dash_emitentes
                 SET logo_base64 = $1,
                     logo_mime = $2,
                     logo_atualizada_em = NOW(),
                     updated_at = NOW()
                 WHERE id = $3 AND tenant_id = $4
                 RETURNING *`,
                [normLogo.rawBase64, normLogo.mime, saved.id, tenantId]
            );
            if (logoRes.rows[0]) saved = logoRes.rows[0];
        } else if (b.remover_logo === true) {
            const logoRes = await db.query(
                `UPDATE dash_emitentes
                 SET logo_base64 = NULL,
                     logo_mime = NULL,
                     logo_atualizada_em = NOW(),
                     logo_focus_sincronizada = FALSE,
                     updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2
                 RETURNING *`,
                [saved.id, tenantId]
            );
            if (logoRes.rows[0]) saved = logoRes.rows[0];
        }

        const plainHomologSaved = String(decryptSecret(saved.focus_token_homologacao) || '').trim();
        const plainProdSaved = String(decryptSecret(saved.focus_token_producao) || '').trim();

        const maskedSaved = {
            ...saved,
            focus_token: maskSecret(saved.focus_token),
            focus_token_homologacao: maskSecret(saved.focus_token_homologacao),
            focus_token_producao: maskSecret(saved.focus_token_producao),
            tem_token_homologacao: Boolean(plainHomologSaved),
            tem_token_producao: Boolean(plainProdSaved),
            token_homologacao_preview: plainHomologSaved ? `${plainHomologSaved.slice(0, 4)}••••` : null,
            token_producao_preview: plainProdSaved ? `${plainProdSaved.slice(0, 4)}••••` : null,
            tem_logo: Boolean(saved.logo_base64),
            logo_data_uri: saved.logo_base64
                ? `data:${saved.logo_mime || 'image/png'};base64,${saved.logo_base64}`
                : null,
            cnpj_valido: true,
        };

        return res.json({ success: true, data: maskedSaved });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Envia / atualiza a logomarca da empresa e sincroniza automaticamente com a Focus NFe (/v2/empresas -> arquivo_logo_base64)
 * para impressão oficial no cabeçalho do DACTE (CT-e), DAMDFE (MDF-e) e DANFE (NF-e).
 */
router.post('/emitentes/:id/logo', async (req, res) => {
    const tenantId = req.tenant.id;
    const emitenteId = parseInt(req.params.id, 10);
    if (!emitenteId) {
        return res.status(400).json({ error: 'Salve os Dados da Empresa primeiro antes de enviar a logomarca.' });
    }

    try {
        const { logo_base64 } = req.body || {};
        const norm = TransporteService.normalizarLogoBase64(logo_base64);

        const upd = await db.query(
            `UPDATE dash_emitentes
             SET logo_base64 = $1,
                 logo_mime = $2,
                 logo_atualizada_em = NOW(),
                 logo_focus_sincronizada = FALSE,
                 updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4
             RETURNING id`,
            [norm.rawBase64, norm.mime, emitenteId, tenantId]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ error: 'Empresa emitente não encontrada para este tenant.' });
        }

        const syncRes = await TransporteService.sincronizarLogoFocus(tenantId, emitenteId, {
            deleteLogo: false,
        });

        return res.json({
            success: true,
            ...syncRes,
            tem_logo: true,
            logo_mime: norm.mime,
            logo_bytes: norm.bytes,
            logo_data_uri: `data:${norm.mime};base64,${norm.rawBase64}`,
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Remove a logomarca da empresa no banco e na Focus NFe (/v2/empresas -> delete_logo: true).
 */
router.delete('/emitentes/:id/logo', async (req, res) => {
    const tenantId = req.tenant.id;
    const emitenteId = parseInt(req.params.id, 10);
    if (!emitenteId) {
        return res.status(400).json({ error: 'ID do emitente inválido.' });
    }

    try {
        const upd = await db.query(
            `UPDATE dash_emitentes
             SET logo_base64 = NULL,
                 logo_mime = NULL,
                 logo_atualizada_em = NOW(),
                 logo_focus_sincronizada = FALSE,
                 updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING id`,
            [emitenteId, tenantId]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ error: 'Empresa emitente não encontrada para este tenant.' });
        }

        let syncRes = {
            focus_sincronizado: false,
            mensagem: 'Logomarca removida com sucesso.',
        };
        try {
            syncRes = await TransporteService.sincronizarLogoFocus(tenantId, emitenteId, {
                deleteLogo: true,
            });
        } catch (focusErr) {
            logger.warn('[Transporte Logo] Logo removida localmente, aviso Focus NFe:', focusErr.message);
        }

        return res.json({
            success: true,
            ...syncRes,
            tem_logo: false,
            logo_data_uri: null,
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Provisiona ou sincroniza automaticamente a empresa na conta parceira Focus NFe (/v2/empresas),
 * envia o Certificado Digital A1, captura os tokens (Homologação e Produção) cifrados em AES-256-GCM
 * e registra os Webhooks (/v2/hooks).
 */
router.post('/emitentes/provisionar-focus', async (req, res) => {
    const tenantId = req.tenant.id;
    const { emitente_id, registrar_webhooks = true, incluir_certificado = true } = req.body || {};
    try {
        const result = await TransporteService.provisionarEmpresaFocus(tenantId, emitente_id || null, {
            registrarWebhooks: registrar_webhooks !== false,
            incluirCertificado: incluir_certificado !== false,
        });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Registra / revalida os Webhooks de CT-e e MDF-e (/v2/hooks) da transportadora na Focus NFe.
 */
router.post('/emitentes/:id/webhooks-focus', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const result = await TransporteService.registrarWebhooksFocus(tenantId, parseInt(req.params.id, 10));
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Alternância rápida 1-clique entre Homologação e Produção para o emitente fiscal.
 */
router.patch('/emitentes/:id/ambiente', async (req, res) => {
    const tenantId = req.tenant.id;
    const emitenteId = parseInt(req.params.id, 10);
    const novoAmbiente = String(req.body?.ambiente || '').toLowerCase() === 'producao'
        ? 'producao'
        : 'homologacao';

    try {
        const { rows: curRows } = await db.query(
            `SELECT * FROM dash_emitentes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [emitenteId, tenantId]
        );
        if (curRows.length === 0) {
            return res.status(404).json({ error: 'Emitente não encontrado.' });
        }

        const cur = curRows[0];
        const novoTokenAtivo =
            novoAmbiente === 'producao'
                ? cur.focus_token_producao || cur.focus_token
                : cur.focus_token_homologacao || cur.focus_token;

        await db.query(
            `UPDATE dash_emitentes
             SET focus_ambiente = $1, focus_token = $2, updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [novoAmbiente, novoTokenAtivo || null, emitenteId, tenantId]
        );

        await db.query(
            `UPDATE dash_integracoes_config
             SET focus_ambiente = $1, updated_at = NOW()
             WHERE tenant_id = $2`,
            [novoAmbiente, tenantId]
        ).catch(() => {});

        return res.json({
            success: true,
            ambiente: novoAmbiente,
            mensagem: novoAmbiente === 'producao'
                ? 'Ambiente alterado para Produção (SEFAZ Real com validade jurídica).'
                : 'Ambiente alterado para Homologação (Testes SEFAZ sem valor fiscal).',
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 6. PARTES (Remetentes, Destinatários, Tomadores)
// ─────────────────────────────────────────────────────────────

router.get('/partes', async (req, res) => {
    const tenantId = req.tenant.id;
    const { search } = req.query;
    try {
        let sql = `SELECT * FROM dash_partes WHERE tenant_id = $1 AND ativo = true`;
        const params = [tenantId];
        if (search) {
            params.push(`%${search}%`);
            sql += ` AND (razao_social ILIKE $${params.length} OR nome_fantasia ILIKE $${params.length} OR documento ILIKE $${params.length})`;
        }
        sql += ` ORDER BY razao_social ASC LIMIT 500`;
        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/partes', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        documento, tipo_documento = 'CNPJ', razao_social, nome_fantasia,
        inscricao_estadual, indicador_ie = '9', logradouro, numero, complemento,
        bairro, cep, codigo_municipio, municipio, uf, telefone, email
    } = req.body || {};

    if (!documento || !razao_social) {
        return res.status(400).json({ error: 'documento e razao_social são obrigatórios.' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_partes (
                tenant_id, documento, tipo_documento, razao_social, nome_fantasia,
                inscricao_estadual, indicador_ie, logradouro, numero, complemento,
                bairro, cep, codigo_municipio, municipio, uf, telefone, email
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             ON CONFLICT (tenant_id, documento) DO UPDATE SET
                razao_social = EXCLUDED.razao_social,
                nome_fantasia = EXCLUDED.nome_fantasia,
                inscricao_estadual = EXCLUDED.inscricao_estadual,
                indicador_ie = EXCLUDED.indicador_ie,
                logradouro = EXCLUDED.logradouro,
                numero = EXCLUDED.numero,
                complemento = EXCLUDED.complemento,
                bairro = EXCLUDED.bairro,
                cep = EXCLUDED.cep,
                codigo_municipio = EXCLUDED.codigo_municipio,
                municipio = EXCLUDED.municipio,
                uf = EXCLUDED.uf,
                telefone = EXCLUDED.telefone,
                email = EXCLUDED.email,
                ativo = true,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId, String(documento).replace(/\D/g, ''), tipo_documento, razao_social, nome_fantasia,
                inscricao_estadual, indicador_ie, logradouro, numero, complemento,
                bairro, cep, codigo_municipio, municipio, uf, telefone, email
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 7. CONTRATOS DE TRANSPORTE + CIOT (ANTT Res. 5.867 + IPEF + Financeiro)
// ─────────────────────────────────────────────────────────────

router.get('/ciot/tabelas-antt', (_req, res) => {
    return res.json({
        success: true,
        data: {
            categorias: listarCategoriasCargaAntt(),
            eixos: EIXOS_VALIDOS,
            provedores: PROVEDORES_CIOT_SUPORTADOS,
            cnpj_padrao_ipef: CNPJ_PADRAO_IPEF,
        },
    });
});

router.post('/ciot/calcular-piso', (req, res) => {
    const b = req.body || {};
    const calc = calcularPisoMinimoAntt({
        categoriaCarga: b.categoria_carga_antt || b.categoriaCarga || 'GERAL',
        tipoOperacao: b.tipo_operacao || b.tipoOperacao || 'Carga Lotacao',
        quantidadeEixos: b.quantidade_eixos ?? b.quantidadeEixos ?? 2,
        distanciaKm: b.distancia_km ?? b.distanciaKm ?? 0,
        ufInicio: b.uf_inicio || b.ufInicio || 'MS',
        ufFim: b.uf_fim || b.ufFim || 'MS',
        municipioInicio: b.municipio_inicio || b.municipioInicio || '',
        municipioFim: b.municipio_fim || b.municipioFim || '',
        altoDesempenho: Boolean(b.alto_desempenho ?? b.altoDesempenho),
        retornoVazio: Boolean(b.retorno_vazio ?? b.retornoVazio),
        valorFrete: b.valor_frete ?? b.valorFrete ?? 0,
        pisoIsento: Boolean(b.piso_isento ?? b.pisoIsento),
        pisoIsencaoMotivo: b.piso_isencao_motivo || b.pisoIsencaoMotivo || '',
    });
    return res.json({ success: true, data: calc });
});

router.get('/contratos', async (req, res) => {
    const tenantId = req.tenant.id;
    const { status = '', disponivel_mdfe = '', search = '' } = req.query || {};
    try {
        const params = [tenantId];
        let whereSql = `c.tenant_id = $1`;

        if (status && status !== 'TODOS') {
            params.push(String(status).toUpperCase().trim());
            whereSql += ` AND c.ciot_status = $${params.length}`;
        }
        if (String(disponivel_mdfe).toLowerCase() === 'true') {
            whereSql += ` AND c.ciot_status = 'TRANSMITIDO' AND c.ciot_codigo IS NOT NULL`;
        }
        if (search && String(search).trim()) {
            params.push(`%${String(search).trim()}%`);
            whereSql += ` AND (
                c.transportador_nome ILIKE $${params.length}
                OR c.contratante_nome ILIKE $${params.length}
                OR COALESCE(c.ciot_codigo, '') ILIKE $${params.length}
                OR COALESCE(c.veiculo_placa, '') ILIKE $${params.length}
                OR COALESCE(c.motorista_nome, '') ILIKE $${params.length}
            )`;
        }

        const { rows } = await db.query(
            `SELECT c.*,
                    m.numero AS mdfe_numero,
                    m.serie AS mdfe_serie,
                    m.status AS mdfe_status,
                    m.chave_mdfe AS mdfe_chave
             FROM dash_contratos_transporte c
             LEFT JOIN dash_mdfes m ON m.id = c.mdfe_id AND m.tenant_id = c.tenant_id
             WHERE ${whereSql}
             ORDER BY c.created_at DESC
             LIMIT 300`,
            params
        );

        const enriched = rows.map((r) => ({
            ...r,
            ciot_protocolo_formatado: r.ciot_codigo
                ? r.ciot_verificador
                    ? `${r.ciot_codigo}/${r.ciot_verificador}`
                    : r.ciot_codigo
                : null,
        }));

        const resumo = enriched.reduce(
            (acc, r) => {
                acc.total += 1;
                const st = String(r.ciot_status || 'PENDENTE').toUpperCase();
                if (st === 'TRANSMITIDO') acc.transmitidos += 1;
                else if (st === 'ENCERRADO') acc.encerrados += 1;
                else if (st === 'CANCELADO') acc.cancelados += 1;
                else acc.pendentes += 1;

                if (st !== 'CANCELADO') {
                    const frete = Number(r.valor_frete || 0);
                    const adiant = Number(r.valor_adiantamento || 0);
                    acc.total_frete += frete;
                    acc.total_adiantamento += adiant;
                    acc.total_saldo += Math.max(0, frete - adiant);
                }
                return acc;
            },
            {
                total: 0,
                transmitidos: 0,
                encerrados: 0,
                pendentes: 0,
                cancelados: 0,
                total_frete: 0,
                total_adiantamento: 0,
                total_saldo: 0,
            }
        );

        return res.json({ success: true, data: enriched, resumo });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/contratos', async (req, res) => {
    const tenantId = req.tenant.id;
    const b = req.body || {};

    try {
        // Resolve emitente padrão se não informado
        let emitRow = null;
        if (b.emitente_id) {
            const em = await db.query(
                `SELECT * FROM dash_emitentes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [parseInt(b.emitente_id, 10), tenantId]
            );
            emitRow = em.rows[0] || null;
        }
        if (!emitRow) {
            const em = await db.query(
                `SELECT * FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`,
                [tenantId]
            );
            emitRow = em.rows[0] || null;
        }
        if (!emitRow) {
            return res.status(400).json({ error: 'Cadastre uma empresa emitente antes de criar operações de CIOT.' });
        }

        const contratanteNome = String(b.contratante_nome || emitRow.razao_social || '').trim();
        const contratanteDoc = String(b.contratante_documento || emitRow.cnpj || '').replace(/\D/g, '');
        const transportadorNome = String(b.transportador_nome || '').trim();
        const transportadorDoc = String(b.transportador_documento || '').replace(/\D/g, '');
        const ufInicio = normalizarUf(b.uf_inicio || emitRow.uf || 'MS') || 'MS';
        const ufFim = normalizarUf(b.uf_fim || 'MS') || 'MS';

        if (!contratanteNome || !transportadorNome || !ufInicio || !ufFim) {
            return res.status(400).json({
                error: 'Contratante, Transportador, UF de Origem e UF de Destino são obrigatórios.',
            });
        }
        if (transportadorDoc.length !== 11 && transportadorDoc.length !== 14) {
            return res.status(400).json({
                error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para o Transportador contratado.',
            });
        }

        // Resolve códigos IBGE de origem e destino quando município foi informado
        let munInicio = String(b.municipio_inicio || emitRow.municipio || '').trim() || null;
        let codIbgeInicio = String(b.codigo_ibge_inicio || '').replace(/\D/g, '').slice(0, 7) || null;
        if (munInicio && !codIbgeInicio) {
            const rIni = await resolverIbgeMunicipioAsync(db, {
                municipio: munInicio,
                uf: ufInicio,
                permitirFallbackCapital: false,
            });
            if (rIni?.codigo) {
                codIbgeInicio = rIni.codigo;
                munInicio = rIni.nome || munInicio;
            }
        }

        let munFim = String(b.municipio_fim || '').trim() || null;
        let codIbgeFim = String(b.codigo_ibge_fim || '').replace(/\D/g, '').slice(0, 7) || null;
        if (munFim && !codIbgeFim) {
            const rFim = await resolverIbgeMunicipioAsync(db, {
                municipio: munFim,
                uf: ufFim,
                permitirFallbackCapital: false,
            });
            if (rFim?.codigo) {
                codIbgeFim = rFim.codigo;
                munFim = rFim.nome || munFim;
            }
        }

        const tipoOperacao = b.tipo_operacao || 'Carga Lotacao';
        const categoriaCarga = String(b.categoria_carga_antt || 'GERAL').toUpperCase();
        const qtdEixos = parseInt(b.quantidade_eixos, 10) || 2;
        const pisoIsento = Boolean(b.piso_isento);
        const pisoIsencaoMotivo = b.piso_isencao_motivo ? String(b.piso_isencao_motivo).trim() : null;

        const piso = calcularPisoMinimoAntt({
            categoriaCarga,
            tipoOperacao,
            quantidadeEixos: qtdEixos,
            distanciaKm: b.distancia_km,
            ufInicio,
            ufFim,
            municipioInicio: munInicio,
            municipioFim: munFim,
            altoDesempenho: Boolean(b.alto_desempenho),
            retornoVazio: Boolean(b.retorno_vazio),
            valorFrete: b.valor_frete,
            pisoIsento,
            pisoIsencaoMotivo,
        });

        const provedorEscolhido = PROVEDORES_CIOT_SUPORTADOS.includes(
            String(b.ciot_provedor || emitRow.ciot_provedor || '').toUpperCase()
        )
            ? String(b.ciot_provedor || emitRow.ciot_provedor).toUpperCase()
            : 'HOMOLOGACAO_LOCAL';

        const chavesNfeArr = Array.isArray(b.chaves_nfe)
            ? b.chaves_nfe
                  .map((ch) => String(ch || '').replace(/\D/g, ''))
                  .filter((ch) => ch.length === 44)
            : [];

        const { rows } = await db.query(
            `INSERT INTO dash_contratos_transporte (
                tenant_id, emitente_id,
                contratante_nome, contratante_documento,
                transportador_nome, transportador_documento, transportador_rntrc,
                tipo_transporte, tipo_operacao,
                uf_inicio, municipio_inicio, codigo_ibge_inicio,
                uf_fim, municipio_fim, codigo_ibge_fim,
                distancia_km, categoria_carga_antt, quantidade_eixos,
                alto_desempenho, retorno_vazio,
                peso_carga_kg, valor_carga, ncm_carga, chaves_nfe,
                veiculo_id, veiculo_placa,
                motorista_id, motorista_nome, motorista_cpf,
                valor_frete, valor_adiantamento, valor_pedagio, valor_combustivel,
                valor_inss, valor_irrf, valor_sest_senat, valor_outros_descontos,
                forma_quitacao, chave_pix, banco_codigo, banco_agencia, banco_conta, cnpj_ipef,
                data_saida, data_prevista_entrega,
                piso_minimo_antt, piso_minimo_aprovado, piso_isento, piso_isencao_motivo,
                ciot_provedor, gerar_financeiro, observacoes
             ) VALUES (
                $1,$2,
                $3,$4,
                $5,$6,$7,
                $8,$9,
                $10,$11,$12,
                $13,$14,$15,
                $16,$17,$18,
                $19,$20,
                $21,$22,$23,$24::jsonb,
                $25,$26,
                $27,$28,$29,
                $30,$31,$32,$33,
                $34,$35,$36,$37,
                $38,$39,$40,$41,$42,$43,
                $44,$45,
                $46,$47,$48,$49,
                $50,$51,$52
             )
             RETURNING *`,
            [
                tenantId,
                emitRow.id,
                contratanteNome,
                contratanteDoc,
                transportadorNome,
                transportadorDoc,
                b.transportador_rntrc ? String(b.transportador_rntrc).replace(/\D/g, '').slice(0, 20) : null,
                String(b.tipo_transporte || '2'),
                tipoOperacao,
                ufInicio,
                munInicio,
                codIbgeInicio,
                ufFim,
                munFim,
                codIbgeFim,
                piso.distancia_km,
                piso.categoria_codigo,
                piso.eixos,
                Boolean(b.alto_desempenho),
                Boolean(b.retorno_vazio),
                parseFloat(b.peso_carga_kg || 0) || 0,
                parseFloat(b.valor_carga || 0) || 0,
                b.ncm_carga ? String(b.ncm_carga).replace(/\D/g, '').slice(0, 8) : null,
                JSON.stringify(chavesNfeArr),
                b.veiculo_id ? parseInt(b.veiculo_id, 10) : null,
                b.veiculo_placa
                    ? String(b.veiculo_placa).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10)
                    : null,
                b.motorista_id ? parseInt(b.motorista_id, 10) : null,
                b.motorista_nome ? String(b.motorista_nome).trim() : transportadorNome,
                b.motorista_cpf
                    ? String(b.motorista_cpf).replace(/\D/g, '').slice(0, 14)
                    : transportadorDoc.slice(0, 14),
                parseFloat(b.valor_frete || 0) || 0,
                parseFloat(b.valor_adiantamento || 0) || 0,
                parseFloat(b.valor_pedagio || 0) || 0,
                parseFloat(b.valor_combustivel || 0) || 0,
                parseFloat(b.valor_inss || 0) || 0,
                parseFloat(b.valor_irrf || 0) || 0,
                parseFloat(b.valor_sest_senat || 0) || 0,
                parseFloat(b.valor_outros_descontos || 0) || 0,
                b.forma_quitacao || 'PIX',
                b.chave_pix ? String(b.chave_pix).trim().slice(0, 120) : null,
                b.banco_codigo ? String(b.banco_codigo).trim().slice(0, 10) : null,
                b.banco_agencia ? String(b.banco_agencia).trim().slice(0, 15) : null,
                b.banco_conta ? String(b.banco_conta).trim().slice(0, 25) : null,
                b.cnpj_ipef ? String(b.cnpj_ipef).replace(/\D/g, '').slice(0, 14) : null,
                b.data_saida || null,
                b.data_prevista_entrega || null,
                piso.piso,
                piso.aprovado,
                pisoIsento,
                pisoIsencaoMotivo,
                provedorEscolhido,
                b.gerar_financeiro !== false,
                b.observacoes ? String(b.observacoes).trim() : null,
            ]
        );

        let contratoCriado = rows[0];
        let payloadGerado = null;
        let financeiroIds = [];

        if (b.emitir_agora === true || (b.ciot_codigo && String(b.ciot_codigo).trim())) {
            const emitRes = await emitirOuRegistrarCiot({
                tenantId,
                contratoId: contratoCriado.id,
                modoExplicito: b.ciot_codigo ? 'MANUAL' : provedorEscolhido,
                codigoManual: b.ciot_codigo || null,
                verificadorManual: b.ciot_verificador || null,
                usuario: req.user?.nome || req.user?.email || 'Operador',
            });
            contratoCriado = emitRes.contrato;
            payloadGerado = emitRes.payload;
            financeiroIds = emitRes.financeiro_ids || [];
        }

        return res.status(201).json({
            success: true,
            data: {
                ...contratoCriado,
                ciot_protocolo_formatado: contratoCriado.ciot_codigo
                    ? contratoCriado.ciot_verificador
                        ? `${contratoCriado.ciot_codigo}/${contratoCriado.ciot_verificador}`
                        : contratoCriado.ciot_codigo
                    : null,
            },
            payload: payloadGerado,
            piso_minimo: piso,
            financeiro_ids: financeiroIds,
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            error: err.message,
            code: err.code || undefined,
            piso_detalhes: err.piso_detalhes || undefined,
        });
    }
});

/**
 * Emite o CIOT (Simulador Homologação ANTT ou Conector IPEF) ou prepara o Payload estruturado.
 */
router.post('/contratos/:id/gerar-ciot', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const b = req.body || {};

    try {
        const result = await emitirOuRegistrarCiot({
            tenantId,
            contratoId,
            modoExplicito: b.provedor || null,
            codigoManual: b.ciot_codigo || null,
            verificadorManual: b.ciot_verificador || null,
            usuario: req.user?.nome || req.user?.email || 'Operador',
        });

        return res.json({
            success: true,
            data: {
                ...result.contrato,
                ciot_protocolo_formatado: result.contrato.ciot_codigo
                    ? result.contrato.ciot_verificador
                        ? `${result.contrato.ciot_codigo}/${result.contrato.ciot_verificador}`
                        : result.contrato.ciot_codigo
                    : null,
            },
            payload: result.payload,
            piso_minimo: result.piso_minimo,
            financeiro_ids: result.financeiro_ids,
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            error: err.message,
            code: err.code || undefined,
            piso_detalhes: err.piso_detalhes || undefined,
        });
    }
});

/**
 * Registra o código do CIOT retornado pela Instituição de Pagamento / ANTT (12 dígitos ou 12+4 dígitos).
 */
router.patch('/contratos/:id/ciot', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const { ciot_codigo, ciot_verificador } = req.body || {};

    if (!ciot_codigo) {
        return res.status(400).json({ error: 'Informe o código CIOT de 12 dígitos (ou 12 dígitos + 4 verificadores).' });
    }

    const checkNorm = normalizarProtocoloCiot(ciot_codigo, ciot_verificador);
    if (!checkNorm.valido) {
        return res.status(400).json({ error: checkNorm.erro, code: 'CIOT_FORMATO_INVALIDO' });
    }

    try {
        const result = await emitirOuRegistrarCiot({
            tenantId,
            contratoId,
            modoExplicito: 'MANUAL',
            codigoManual: ciot_codigo,
            verificadorManual: ciot_verificador || null,
            usuario: req.user?.nome || req.user?.email || 'Operador',
        });
        return res.json({
            success: true,
            data: {
                ...result.contrato,
                ciot_protocolo_formatado: checkNorm.formatado,
            },
            financeiro_ids: result.financeiro_ids,
        });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            error: err.message,
            code: err.code || undefined,
        });
    }
});

/**
 * Encerra a operação de CIOT (libera saldo de quitação / encerra viagem na ANTT/IPEF).
 */
router.post('/contratos/:id/ciot/encerrar', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const { protocolo_encerramento } = req.body || {};

    try {
        const encerrado = await encerrarCiotContrato({
            tenantId,
            contratoId,
            protocoloEncerramento: protocolo_encerramento || null,
        });
        return res.json({ success: true, data: encerrado });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ error: err.message });
    }
});

/**
 * Cancela um CIOT já registrado (operação não efetivada) e estorna títulos pendentes no Financeiro.
 */
router.post('/contratos/:id/ciot/cancelar', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const { motivo } = req.body || {};

    if (!motivo || String(motivo).trim().length < 10) {
        return res.status(400).json({ error: 'Informe o motivo do cancelamento (mínimo 10 caracteres).' });
    }

    try {
        const { rows } = await db.query(
            `UPDATE dash_contratos_transporte
             SET ciot_status = 'CANCELADO', ciot_erro = $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3
               AND (ciot_status IS NULL OR ciot_status <> 'CANCELADO')
             RETURNING *`,
            [String(motivo).trim(), contratoId, tenantId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contrato não encontrado ou CIOT já cancelado.' });
        }

        const estornados = await estornarFinanceiroCiot(
            db,
            tenantId,
            rows[0],
            String(motivo).trim(),
            req.user?.nome || req.user?.email || 'Operador'
        );

        return res.json({
            success: true,
            data: rows[0],
            titulos_estornados: estornados,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Lista os títulos de Contas a Pagar (dash_financeiro) gerados pela operação de CIOT.
 */
router.get('/contratos/:id/financeiro', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    try {
        const cRes = await db.query(
            `SELECT id, financeiro_ids, ciot_codigo, valor_frete, valor_adiantamento
             FROM dash_contratos_transporte
             WHERE id = $1 AND tenant_id = $2
             LIMIT 1`,
            [contratoId, tenantId]
        );
        if (cRes.rows.length === 0) {
            return res.status(404).json({ error: 'Operação de CIOT não encontrada.' });
        }
        const ids = Array.isArray(cRes.rows[0].financeiro_ids)
            ? cRes.rows[0].financeiro_ids.map(Number).filter(Number.isFinite)
            : [];
        if (ids.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const finRes = await db.query(
            `SELECT id, tipo, descricao, cliente_nome, cliente_documento,
                    data_emissao, data_vencimento, valor, valor_pago,
                    status_pagamento, especie_nome, plano_contas_nome,
                    numero_parcela, tipo_parcela, origem
             FROM dash_financeiro
             WHERE tenant_id = $1 AND id = ANY($2::int[])
             ORDER BY numero_parcela ASC, id ASC`,
            [tenantId, ids]
        );
        return res.json({ success: true, data: finRes.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 8. RELATÓRIOS FISCAIS
// ─────────────────────────────────────────────────────────────

router.get('/relatorios', async (req, res) => {
    const tenantId = req.tenant.id;
    const { tipo = 'resumo' } = req.query;

    try {
        if (tipo === 'cte') {
            const { rows } = await db.query(
                `SELECT id, numero, serie, status, status_sefaz, natureza_operacao,
                        uf_inicio, uf_fim, municipio_inicio, municipio_fim,
                        valor_total, valor_carga, peso_bruto, base_icms, aliquota_icms, valor_icms,
                        data_emissao, created_at
                 FROM dash_ctes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1000`,
                [tenantId]
            );
            return res.json({ success: true, data: rows });
        }

        if (tipo === 'mdfe') {
            const { rows } = await db.query(
                `SELECT id, numero, serie, status, status_sefaz, tipo_emitente, tipo_transporte,
                        uf_inicio, uf_fim, veiculo_placa, motorista_nome, motorista_cpf,
                        qtd_cte, qtd_nfe, valor_carga, peso_bruto, ciot_codigo,
                        data_emissao, encerrado_em, created_at
                 FROM dash_mdfes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1000`,
                [tenantId]
            );
            return res.json({ success: true, data: rows });
        }

        // Resumo consolidado
        const [ctes, mdfes, status, meses] = await Promise.all([
            db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'AUTORIZADO')::int AS autorizados,
                        COUNT(*) FILTER (WHERE status = 'REJEITADO')::int AS rejeitados,
                        COALESCE(SUM(valor_total) FILTER (WHERE status = 'AUTORIZADO'), 0) AS valor_frete,
                        COALESCE(SUM(peso_bruto), 0) AS peso
                 FROM dash_ctes WHERE tenant_id = $1`,
                [tenantId]
            ),
            db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'AUTORIZADO')::int AS autorizados,
                        COUNT(*) FILTER (WHERE status = 'ENCERRADO')::int AS encerrados,
                        COALESCE(SUM(valor_carga), 0) AS valor_carga
                 FROM dash_mdfes WHERE tenant_id = $1`,
                [tenantId]
            ),
            db.query(
                `SELECT status, COUNT(*)::int AS total FROM dash_ctes
                 WHERE tenant_id = $1 GROUP BY status ORDER BY total DESC`,
                [tenantId]
            ),
            db.query(
                `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
                        COUNT(*)::int AS total,
                        COALESCE(SUM(valor_total), 0) AS valor
                 FROM dash_ctes
                 WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'
                 GROUP BY 1 ORDER BY 1 DESC`,
                [tenantId]
            )
        ]);

        const c = ctes.rows[0] || {};
        const m = mdfes.rows[0] || {};

        return res.json({
            success: true,
            data: {
                total_ctes: c.total || 0,
                ctes_autorizados: c.autorizados || 0,
                ctes_rejeitados: c.rejeitados || 0,
                total_mdfes: m.total || 0,
                mdfes_autorizados: m.autorizados || 0,
                mdfes_encerrados: m.encerrados || 0,
                valor_frete_total: parseFloat(c.valor_frete || 0),
                valor_carga_total: parseFloat(m.valor_carga || 0),
                peso_total_kg: parseFloat(c.peso || 0),
                por_status: status.rows,
                por_mes: meses.rows
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 9. REGRAS FISCAIS (ICMS / FCP / Rateio / Reforma Tributária SEFAZ-MS)
// ─────────────────────────────────────────────────────────────

async function aplicarRegrasPadraoSefazMs(tenantId, { incluirCorredores = false } = {}) {
    // 1. Regra Interna MS -> MS (Art. 41, III da Lei Estadual MS nº 1.810/1997 e RICMS/MS: ICMS 17%, CFOP 5353, FCP 0%)
    //    Reforma Tributária 2026 (LC 214/2025 · NT 2025.001 / 2026.002): CST 000, cClassTrib 000001, IBS UF 0,10%, IBS Mun 0,00%, CBS 0,90%
    const { rows: msInterna } = await db.query(
        `SELECT id FROM dash_regras_fiscais
         WHERE tenant_id = $1 AND escopo = 'UF_PAR' AND uf_origem = 'MS' AND uf_destino = 'MS'
         LIMIT 1`,
        [tenantId]
    );
    if (msInterna.length > 0) {
        await db.query(
            `UPDATE dash_regras_fiscais
             SET situacao_tributaria = '00',
                 cfop = COALESCE(NULLIF(cfop, ''), '5353'),
                 aliquota_icms = 17.0000,
                 percentual_fcp = 0.0000,
                 ibs_cbs_cst = COALESCE(NULLIF(ibs_cbs_cst, ''), '000'),
                 ibs_cbs_class_trib = COALESCE(NULLIF(ibs_cbs_class_trib, ''), '000001'),
                 codigo_situacao_fiscal = COALESCE(NULLIF(codigo_situacao_fiscal, ''), '000001'),
                 aliquota_ibs = COALESCE(aliquota_ibs, 0.1000),
                 aliquota_ibs_mun = COALESCE(aliquota_ibs_mun, 0.0000),
                 aliquota_cbs = COALESCE(aliquota_cbs, 0.9000),
                 reducao_aliquota_ibs_cbs = COALESCE(reducao_aliquota_ibs_cbs, 0.00),
                 vigente_de = COALESCE(vigente_de, DATE '2026-01-01'),
                 ativo = TRUE,
                 updated_at = NOW()
             WHERE id = $1`,
            [msInterna[0].id]
        );
    } else {
        await db.query(
            `INSERT INTO dash_regras_fiscais (
                tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
             ) VALUES (
                $1, 'UF_PAR', 'MS', 'MS', '0',
                '00', '5353', 17.0000, 0.0000,
                0, 0, 0, 0,
                FALSE, 'PESO', 0, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.00, 0.00, '000001', DATE '2026-01-01'
             )`,
            [tenantId]
        );
    }

    // 2. Regra Por UF de Origem MS -> Demais UFs (Resolução do Senado nº 22/1989: ICMS Interestadual Centro-Oeste = 12%, CFOP 6353)
    const { rows: msOrigem } = await db.query(
        `SELECT id FROM dash_regras_fiscais
         WHERE tenant_id = $1 AND escopo = 'UF' AND uf_origem = 'MS' AND (uf_destino IS NULL OR uf_destino = '')
         LIMIT 1`,
        [tenantId]
    );
    if (msOrigem.length > 0) {
        await db.query(
            `UPDATE dash_regras_fiscais
             SET situacao_tributaria = '00',
                 cfop = '6353',
                 aliquota_icms = 12.0000,
                 percentual_fcp = 0.0000,
                 ibs_cbs_cst = COALESCE(NULLIF(ibs_cbs_cst, ''), '000'),
                 ibs_cbs_class_trib = COALESCE(NULLIF(ibs_cbs_class_trib, ''), '000001'),
                 codigo_situacao_fiscal = COALESCE(NULLIF(codigo_situacao_fiscal, ''), '000001'),
                 aliquota_ibs = COALESCE(aliquota_ibs, 0.1000),
                 aliquota_ibs_mun = COALESCE(aliquota_ibs_mun, 0.0000),
                 aliquota_cbs = COALESCE(aliquota_cbs, 0.9000),
                 vigente_de = COALESCE(vigente_de, DATE '2026-01-01'),
                 ativo = TRUE,
                 updated_at = NOW()
             WHERE id = $1`,
            [msOrigem[0].id]
        );
    } else {
        await db.query(
            `INSERT INTO dash_regras_fiscais (
                tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
             ) VALUES (
                $1, 'UF', 'MS', NULL, '0',
                '00', '6353', 12.0000, 0.0000,
                0, 0, 0, 0,
                FALSE, 'PESO', 0, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.00, 0.00, '000001', DATE '2026-01-01'
             )`,
            [tenantId]
        );
    }

    // 3. Regra Global (contingência interestadual padrão: ICMS 12%, CFOP 6353, IBS 0,10% + CBS 0,90%)
    const { rows: globalRows } = await db.query(
        `SELECT id FROM dash_regras_fiscais
         WHERE tenant_id = $1 AND escopo = 'GLOBAL'
         LIMIT 1`,
        [tenantId]
    );
    if (globalRows.length === 0) {
        await db.query(
            `INSERT INTO dash_regras_fiscais (
                tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
             ) VALUES (
                $1, 'GLOBAL', NULL, NULL, '0',
                '00', '6353', 12.0000, 0.0000,
                0, 0, 0, 0,
                FALSE, 'PESO', 0, TRUE,
                '000', '000001', 0.1000, 0.0000, 0.9000,
                0.00, 0.00, '000001', DATE '2026-01-01'
             )`,
            [tenantId]
        );
    }

    // 4. Corredores interestaduais explícitos a partir do MS (opcional no botão "Aplicar Legislação SEFAZ/MS")
    if (incluirCorredores) {
        const ufsDestino = ['SP', 'PR', 'MT', 'GO', 'MG', 'SC', 'RS', 'RJ', 'BA', 'DF'];
        for (const ufDest of ufsDestino) {
            const { rows: parRows } = await db.query(
                `SELECT id FROM dash_regras_fiscais
                 WHERE tenant_id = $1 AND escopo = 'UF_PAR' AND uf_origem = 'MS' AND uf_destino = $2
                 LIMIT 1`,
                [tenantId, ufDest]
            );
            if (parRows.length === 0) {
                await db.query(
                    `INSERT INTO dash_regras_fiscais (
                        tenant_id, escopo, uf_origem, uf_destino, tipo_servico,
                        situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                        part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                        is_final_consumer, criterio_rateio, percentual_adicional, ativo,
                        ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                        reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal, vigente_de
                     ) VALUES (
                        $1, 'UF_PAR', 'MS', $2, '0',
                        '00', '6353', 12.0000, 0.0000,
                        0, 0, 0, 0,
                        FALSE, 'PESO', 0, TRUE,
                        '000', '000001', 0.1000, 0.0000, 0.9000,
                        0.00, 0.00, '000001', DATE '2026-01-01'
                     )`,
                    [tenantId, ufDest]
                );
            }
        }
    }
}

router.get('/regras', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        let { rows } = await db.query(
            `SELECT * FROM dash_regras_fiscais WHERE tenant_id = $1 ORDER BY
                CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END,
                uf_origem, uf_destino, id`,
            [tenantId]
        );
        const temRegraMsInterna = rows.some(
            r => r.escopo === 'UF_PAR' && r.uf_origem === 'MS' && r.uf_destino === 'MS'
        );
        if (rows.length === 0 || !temRegraMsInterna) {
            await aplicarRegrasPadraoSefazMs(tenantId, { incluirCorredores: false });
            const recarregado = await db.query(
                `SELECT * FROM dash_regras_fiscais WHERE tenant_id = $1 ORDER BY
                    CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END,
                    uf_origem, uf_destino, id`,
                [tenantId]
            );
            rows = recarregado.rows;
        }
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/regras/padrao-ms', async (req, res) => {
    const tenantId = req.tenant.id;
    const incluirCorredores = req.body?.incluir_corredores !== false;
    try {
        await aplicarRegrasPadraoSefazMs(tenantId, { incluirCorredores });
        const { rows } = await db.query(
            `SELECT * FROM dash_regras_fiscais WHERE tenant_id = $1 ORDER BY
                CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END,
                uf_origem, uf_destino, id`,
            [tenantId]
        );
        return res.json({
            success: true,
            message: 'Regras fiscais SEFAZ/MS (Lei Estadual MS nº 1.810/1997 + Resolução SF nº 22/1989 + Reforma Tributária LC 214/2025) aplicadas com sucesso.',
            data: rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/regras', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        escopo = 'GLOBAL', uf_origem = null, uf_destino = null, tipo_servico = null,
        situacao_tributaria = '00', cfop = null,
        aliquota_icms = 0, percentual_fcp = 0,
        part_fcp_origem = 0, part_fcp_destino = 0,
        part_icms_origem = 0, part_icms_destino = 0,
        is_final_consumer = false,
        criterio_rateio = 'PESO', valor_minimo = null, valor_maximo = null,
        percentual_adicional = 0, emitente_id = null, ativo = true,
        ibs_cbs_cst = '000', ibs_cbs_class_trib = '000001',
        aliquota_ibs = 0.10, aliquota_ibs_mun = 0.00, aliquota_cbs = 0.90,
        reducao_aliquota_ibs_cbs = 0, diferimento_ibs_cbs = 0,
        codigo_situacao_fiscal = null, vigente_de = null, vigente_ate = null,
        pis_cofins_modo = 'NAO_APURADO', pis_cst = null, aliquota_pis = null,
        cofins_cst = null, aliquota_cofins = null, excluir_icms_base_pis_cofins = true
    } = req.body || {};

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_regras_fiscais (
                tenant_id, emitente_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                is_final_consumer, criterio_rateio, valor_minimo, valor_maximo,
                percentual_adicional, ativo,
                ibs_cbs_cst, ibs_cbs_class_trib, aliquota_ibs, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota_ibs_cbs, diferimento_ibs_cbs, codigo_situacao_fiscal,
                vigente_de, vigente_ate,
                pis_cofins_modo, pis_cst, aliquota_pis, cofins_cst, aliquota_cofins, excluir_icms_base_pis_cofins
             ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
                $31,$32,$33,$34,$35,$36
             )
             RETURNING *`,
            [
                tenantId, emitente_id, escopo,
                uf_origem ? String(uf_origem).toUpperCase().trim() : null,
                uf_destino ? String(uf_destino).toUpperCase().trim() : null,
                tipo_servico,
                situacao_tributaria, cfop, parseFloat(aliquota_icms || 0), parseFloat(percentual_fcp || 0),
                parseFloat(part_fcp_origem || 0), parseFloat(part_fcp_destino || 0),
                parseFloat(part_icms_origem || 0), parseFloat(part_icms_destino || 0),
                is_final_consumer, criterio_rateio,
                valor_minimo !== null && valor_minimo !== '' ? parseFloat(valor_minimo) : null,
                valor_maximo !== null && valor_maximo !== '' ? parseFloat(valor_maximo) : null,
                parseFloat(percentual_adicional || 0), ativo,
                String(ibs_cbs_cst || '000').padStart(3, '0').slice(0, 3),
                String(ibs_cbs_class_trib || codigo_situacao_fiscal || '000001').padStart(6, '0').slice(0, 6),
                parseFloat(aliquota_ibs ?? 0.10),
                parseFloat(aliquota_ibs_mun ?? 0.00),
                parseFloat(aliquota_cbs ?? 0.90),
                parseFloat(reducao_aliquota_ibs_cbs || 0),
                parseFloat(diferimento_ibs_cbs || 0),
                codigo_situacao_fiscal || ibs_cbs_class_trib || '000001',
                vigente_de || null,
                vigente_ate || null,
                pis_cofins_modo || 'NAO_APURADO',
                pis_cst ? String(pis_cst).padStart(2, '0').slice(-2) : null,
                aliquota_pis !== null && aliquota_pis !== '' && aliquota_pis !== undefined ? parseFloat(aliquota_pis) : null,
                cofins_cst ? String(cofins_cst).padStart(2, '0').slice(-2) : null,
                aliquota_cofins !== null && aliquota_cofins !== '' && aliquota_cofins !== undefined ? parseFloat(aliquota_cofins) : null,
                excluir_icms_base_pis_cofins !== false
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const atualizarRegraHandler = async (req, res) => {
    const tenantId = req.tenant.id;
    const regraId = req.params.id;
    const camposPermitidos = [
        'escopo', 'uf_origem', 'uf_destino', 'tipo_servico', 'situacao_tributaria', 'cfop',
        'aliquota_icms', 'percentual_fcp', 'part_fcp_origem', 'part_fcp_destino',
        'part_icms_origem', 'part_icms_destino', 'is_final_consumer',
        'criterio_rateio', 'valor_minimo', 'valor_maximo', 'percentual_adicional', 'ativo',
        'ibs_cbs_cst', 'ibs_cbs_class_trib', 'aliquota_ibs', 'aliquota_ibs_mun', 'aliquota_cbs',
        'reducao_aliquota_ibs_cbs', 'diferimento_ibs_cbs', 'codigo_situacao_fiscal',
        'vigente_de', 'vigente_ate',
        'pis_cofins_modo', 'pis_cst', 'aliquota_pis', 'cofins_cst', 'aliquota_cofins', 'excluir_icms_base_pis_cofins'
    ];

    try {
        const body = req.body || {};
        const sets = [];
        const params = [tenantId, regraId];
        for (const c of camposPermitidos) {
            if (body[c] !== undefined) {
                let val = body[c];
                if (
                    (c === 'valor_minimo' ||
                        c === 'valor_maximo' ||
                        c === 'vigente_de' ||
                        c === 'vigente_ate' ||
                        c === 'pis_cst' ||
                        c === 'cofins_cst' ||
                        c === 'aliquota_pis' ||
                        c === 'aliquota_cofins') &&
                    val === ''
                ) {
                    val = null;
                }
                params.push(val);
                sets.push(`${c} = $${params.length}`);
            }
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

        const { rows } = await db.query(
            `UPDATE dash_regras_fiscais SET ${sets.join(', ')}, updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2 RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Regra não encontrada.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

router.patch('/regras/:id', atualizarRegraHandler);
router.put('/regras/:id', atualizarRegraHandler);

router.delete('/regras/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`DELETE FROM dash_regras_fiscais WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 10. CAMPOS DINÂMICOS (motor de formulários)
// ─────────────────────────────────────────────────────────────

router.get('/campos', async (req, res) => {
    const tenantId = req.tenant.id;
    const { documento } = req.query;
    try {
        let sql = `SELECT * FROM dash_campos_dinamicos WHERE tenant_id = $1`;
        const params = [tenantId];
        if (documento) {
            params.push(documento.toUpperCase());
            sql += ` AND documento = $${params.length}`;
        }
        sql += ` ORDER BY documento, ordem, id`;
        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/campos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        documento = 'CTE', chave_campo, rotulo, tipo = 'texto',
        opcoes = [], condicao_json = {}, caminho_focus = null,
        obrigatorio = false, ordem = 100, escopo = 'GLOBAL',
        escopo_valores = [], ativo = true
    } = req.body || {};

    if (!chave_campo || !rotulo) {
        return res.status(400).json({ error: 'chave_campo e rotulo são obrigatórios.' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_campos_dinamicos (
                tenant_id, documento, chave_campo, rotulo, tipo,
                opcoes, condicao_json, caminho_focus, obrigatorio, ordem,
                escopo, escopo_valores, ativo
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (tenant_id, documento, chave_campo) DO UPDATE SET
                rotulo = EXCLUDED.rotulo,
                tipo = EXCLUDED.tipo,
                opcoes = EXCLUDED.opcoes,
                condicao_json = EXCLUDED.condicao_json,
                caminho_focus = EXCLUDED.caminho_focus,
                obrigatorio = EXCLUDED.obrigatorio,
                ordem = EXCLUDED.ordem,
                escopo = EXCLUDED.escopo,
                escopo_valores = EXCLUDED.escopo_valores,
                ativo = EXCLUDED.ativo,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId, documento.toUpperCase(), String(chave_campo).replace(/\s/g, '_'), rotulo, tipo,
                JSON.stringify(opcoes), JSON.stringify(condicao_json), caminho_focus,
                obrigatorio, ordem, escopo, JSON.stringify(escopo_valores), ativo
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.patch('/campos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const campoId = req.params.id;
    const body = req.body || {};

    try {
        const sets = [];
        const params = [tenantId, campoId];
        const permitidos = ['rotulo', 'tipo', 'caminho_focus', 'obrigatorio', 'ordem', 'escopo', 'ativo'];
        for (const c of permitidos) {
            if (body[c] !== undefined) {
                params.push(body[c]);
                sets.push(`${c} = $${params.length}`);
            }
        }
        if (body.opcoes !== undefined) {
            params.push(JSON.stringify(body.opcoes));
            sets.push(`opcoes = $${params.length}::jsonb`);
        }
        if (body.condicao_json !== undefined) {
            params.push(JSON.stringify(body.condicao_json));
            sets.push(`condicao_json = $${params.length}::jsonb`);
        }
        if (body.escopo_valores !== undefined) {
            params.push(JSON.stringify(body.escopo_valores));
            sets.push(`escopo_valores = $${params.length}::jsonb`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

        const { rows } = await db.query(
            `UPDATE dash_campos_dinamicos SET ${sets.join(', ')}, updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2 RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Campo não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/campos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`DELETE FROM dash_campos_dinamicos WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 11. ROTEIROS DE ENTREGA (MAPA E LOGÍSTICA)
// ─────────────────────────────────────────────────────────────

/**
 * Calcula a distância em km entre dois pontos (fórmula de Haversine).
 */
function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Gera (ou recupera) o roteiro de entrega sequencial a partir de um MDF-e.
 * As paradas saem dos documentos vinculados (CT-e / NF-e) e recebem
 * coordenadas para plotagem no mapa.
 */
router.get('/roteiro/:mdfe_id', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = parseInt(req.params.mdfe_id, 10);

    if (!mdfeId || Number.isNaN(mdfeId)) {
        return res.status(400).json({ error: 'MDF-e inválido.' });
    }

    try {
        // 1) Verifica se já existe roteiro criado
        let { rows: roteiros } = await db.query(
            `SELECT r.*, m.numero AS mdfe_numero, m.chave_mdfe, m.veiculo_placa,
                    m.motorista_nome, m.motorista_cpf, m.uf_inicio, m.uf_fim,
                    m.status AS mdfe_status, m.qtd_cte, m.qtd_nfe
             FROM dash_roteiros_entrega r
             JOIN dash_mdfes m ON m.id = r.mdfe_id
             WHERE r.mdfe_id = $1 AND r.tenant_id = $2`,
            [mdfeId, tenantId]
        );

        let roteiro = roteiros[0];

        // 2) Se não existir, gera a partir dos documentos vinculados
        if (!roteiro) {
            const { rows: mdfes } = await db.query(
                `SELECT * FROM dash_mdfes WHERE id = $1 AND tenant_id = $2`,
                [mdfeId, tenantId]
            );
            if (mdfes.length === 0) {
                return res.status(404).json({ error: 'MDF-e não encontrado.' });
            }
            const m = mdfes[0];

            const ins = await db.query(
                `INSERT INTO dash_roteiros_entrega (
                    tenant_id, mdfe_id, titulo, status, total_paradas,
                    peso_total_kg, valor_total_carga
                 ) VALUES ($1, $2, $3, 'EM_ROTA', 0, $4, $5) RETURNING *`,
                [
                    tenantId, mdfeId,
                    `Viagem ${m.uf_inicio} → ${m.uf_fim} · ${m.veiculo_placa}`,
                    parseFloat(m.peso_bruto || 0),
                    parseFloat(m.valor_carga || 0)
                ]
            );
            roteiro = {
                ...ins.rows[0],
                mdfe_numero: m.numero,
                chave_mdfe: m.chave_mdfe,
                veiculo_placa: m.veiculo_placa,
                motorista_nome: m.motorista_nome,
                motorista_cpf: m.motorista_cpf,
                uf_inicio: m.uf_inicio,
                uf_fim: m.uf_fim,
                mdfe_status: m.status,
                qtd_cte: m.qtd_cte,
                qtd_nfe: m.qtd_nfe
            };

            // Documentos vinculados (CT-e e NF-e)
            const { rows: docs } = await db.query(
                `SELECT md.tipo_documento, md.chave, md.codigo_municipio_descarregamento,
                        md.nome_municipio_descarregamento,
                        c.destinatario_nome, c.destinatario_municipio, c.destinatario_uf,
                        c.remetente_nome, c.valor_total, c.peso_bruto, c.dados_nfe
                 FROM dash_mdfe_documentos md
                 LEFT JOIN dash_cargas c
                        ON c.chave_acesso = md.chave AND c.tenant_id = md.tenant_id
                 WHERE md.mdfe_id = $1 AND md.tenant_id = $2
                 ORDER BY md.id ASC`,
                [mdfeId, tenantId]
            );

            let ordem = 1;
            for (const doc of docs) {
                const mun = doc.destinatario_municipio || doc.nome_municipio_descarregamento || m.uf_fim;
                const uf = doc.destinatario_uf || m.uf_fim;

                const coordRes = await db.query(
                    `SELECT latitude, longitude FROM dash_coordenadas_municipios
                     WHERE codigo_ibge = $1 OR UPPER(TRIM(nome)) = UPPER(TRIM($2))
                     LIMIT 1`,
                    [doc.codigo_municipio_descarregamento, mun]
                );

                // Sem coordenada exata: usa o centroid do UF como aproximação
                const lat = coordRes.rows[0]?.latitude ? parseFloat(coordRes.rows[0].latitude) : null;
                const lng = coordRes.rows[0]?.longitude ? parseFloat(coordRes.rows[0].longitude) : null;

                // Extrai endereço do XML da NF-e quando disponível
                let endereco = null;
                const nfe = doc.dados_nfe || {};
                if (nfe.endereco_entrega) endereco = nfe.endereco_entrega;
                else if (nfe.endereco) endereco = nfe.endereco;

                await db.query(
                    `INSERT INTO dash_roteiro_pontos (
                        tenant_id, roteiro_id, ordem_entrega, tipo_ponto,
                        documento_tipo, documento_chave, cliente_nome, documento_cliente,
                        endereco_completo, municipio, uf, cep,
                        latitude, longitude, peso_kg, valor_produtos, status_entrega
                     ) VALUES ($1,$2,$3,'DESCARGA',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDENTE')`,
                    [
                        tenantId, roteiro.id, ordem,
                        doc.tipo_documento, doc.chave,
                        doc.destinatario_nome || doc.remetente_nome || 'Destinatário',
                        nfe.documento_destinatario || null,
                        endereco, mun, uf, nfe.cep || null,
                        lat, lng,
                        parseFloat(doc.peso_bruto || 0),
                        parseFloat(doc.valor_total || 0)
                    ]
                );
                ordem++;
            }

            await db.query(
                `UPDATE dash_roteiros_entrega SET total_paradas = $1, updated_at = NOW() WHERE id = $2`,
                [ordem - 1, roteiro.id]
            );
            roteiro.total_paradas = ordem - 1;
        }

        // 3) Pontos do roteiro
        const { rows: pontos } = await db.query(
            `SELECT * FROM dash_roteiro_pontos
             WHERE roteiro_id = $1 AND tenant_id = $2
             ORDER BY ordem_entrega ASC`,
            [roteiro.id, tenantId]
        );

        // 4) Métricas calculadas: distância total e tempo estimado
        let distancia = 0;
        let tempoMin = 0;
        for (let i = 1; i < pontos.length; i++) {
            const a = pontos[i - 1];
            const b = pontos[i];
            if (a.latitude && a.longitude && b.latitude && b.longitude) {
                const d = distanciaKm(
                    parseFloat(a.latitude), parseFloat(a.longitude),
                    parseFloat(b.latitude), parseFloat(b.longitude)
                );
                distancia += d;
                // Velocidade média de carga 55 km/h + 30 min parado por entrega
                tempoMin += Math.round((d / 55) * 60) + 30;
            }
        }

        return res.json({
            success: true,
            data: {
                roteiro: {
                    ...roteiro,
                    distancia_total_km: Math.round(distancia * 100) / 100,
                    tempo_estimado_minutos: tempoMin
                },
                pontos,
                metricas: {
                    entregas: pontos.filter(p => p.status_entrega === 'ENTREGUE').length,
                    pendentes: pontos.filter(p => p.status_entrega === 'PENDENTE').length,
                    concluidas_percentual: pontos.length
                        ? Math.round((pontos.filter(p => p.status_entrega === 'ENTREGUE').length / pontos.length) * 100)
                        : 0
                }
            }
        });
    } catch (err) {
        logger.error('[Roteiro] Erro ao carregar roteiro:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Atualiza o status de uma parada (entregue, recusado, reentrega).
 */
router.patch('/roteiro/pontos/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const pontoId = parseInt(req.params.id, 10);
    const { status_entrega, recebedor_nome, recebedor_documento, observacao } = req.body || {};

    try {
        const { rows } = await db.query(
            `UPDATE dash_roteiro_pontos SET
                status_entrega = COALESCE($1, status_entrega),
                entregue_em = CASE WHEN $1 = 'ENTREGUE' THEN NOW() ELSE entregue_em END,
                recebedor_nome = COALESCE($2, recebedor_nome),
                recebedor_documento = COALESCE($3, recebedor_documento),
                observacao = COALESCE($4, observacao)
             WHERE id = $5 AND tenant_id = $6 RETURNING *`,
            [status_entrega, recebedor_nome, recebedor_documento, observacao, pontoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Ponto de entrega não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Inicia a rota (muda status para EM_ROTA e registra horário).
 */
router.post('/roteiro/:mdfe_id/iniciar', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = parseInt(req.params.mdfe_id, 10);
    try {
        const { rows } = await db.query(
            `UPDATE dash_roteiros_entrega SET status = 'EM_ROTA', iniciado_em = COALESCE(iniciado_em, NOW()), updated_at = NOW()
             WHERE mdfe_id = $1 AND tenant_id = $2 RETURNING *`,
            [mdfeId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Roteiro não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Conclui a rota quando todas as entregas foram finalizadas.
 */
router.post('/roteiro/:mdfe_id/concluir', async (req, res) => {
    const tenantId = req.tenant.id;
    const mdfeId = parseInt(req.params.mdfe_id, 10);
    try {
        const { rows } = await db.query(
            `UPDATE dash_roteiros_entrega SET status = 'CONCLUIDO', concluido_em = NOW(), updated_at = NOW()
             WHERE mdfe_id = $1 AND tenant_id = $2 RETURNING *`,
            [mdfeId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Roteiro não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 12. CERTIFICADOS DIGITAIS A1
// ─────────────────────────────────────────────────────────────

router.get('/certificados', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await TransporteService.autoHidratarEmitentePeloCertificado(tenantId);
        const { rows } = await db.query(
            `SELECT c.id, c.emitente_id, e.razao_social AS emitente_nome, e.cnpj,
                    c.nome_arquivo, c.valido_de, c.valido_ate,
                    COALESCE(
                        CASE WHEN c.valido_ate IS NOT NULL
                             THEN GREATEST(-9999, CEIL(EXTRACT(EPOCH FROM (c.valido_ate - NOW())) / 86400))::int
                        END,
                        c.dias_para_vencer
                    ) AS dias_para_vencer,
                    c.status,
                    COALESCE(c.focus_sincronizado, FALSE) AS focus_sincronizado,
                    c.focus_sincronizado_em
             FROM dash_certificados c
             JOIN dash_emitentes e ON e.id = c.emitente_id
             WHERE c.tenant_id = $1
             ORDER BY c.valido_ate ASC`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/certificados', async (req, res) => {
    const tenantId = req.tenant.id;
    const { emitente_id, nome_arquivo, senha, arquivo_base64, valido_ate, sincronizar_focus = true } = req.body || {};

    if (!emitente_id || !nome_arquivo || !senha) {
        return res.status(400).json({ error: 'emitente_id, nome_arquivo e senha são obrigatórios.' });
    }

    try {
        const emitCheck = await db.query(
            `SELECT id, cnpj FROM dash_emitentes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [emitente_id, tenantId]
        );
        if (emitCheck.rowCount === 0) {
            return res.status(404).json({ error: 'Emitente não encontrado para esta empresa.' });
        }

        const existingCertRes = await db.query(
            `SELECT senha FROM dash_certificados WHERE tenant_id = $1 AND emitente_id = $2 LIMIT 1`,
            [tenantId, emitente_id]
        );
        const encryptedSenha = resolveSecretForSave(senha, existingCertRes.rows[0]?.senha);
        if (!encryptedSenha) {
            return res.status(400).json({ error: 'Senha do certificado inválida.' });
        }

        const rawPfxBuffer = arquivo_base64 ? Buffer.from(arquivo_base64, 'base64') : Buffer.alloc(0);
        const encryptedPfx = rawPfxBuffer.length > 0 ? encryptBuffer(rawPfxBuffer) : rawPfxBuffer;
        const dataVenc = valido_ate ? new Date(valido_ate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
        const diffDias = Math.ceil((dataVenc.getTime() - Date.now()) / (1000 * 3600 * 24));

        const { rows } = await db.query(
            `INSERT INTO dash_certificados (
                tenant_id, emitente_id, nome_arquivo, arquivo_pfx, senha,
                valido_de, valido_ate, dias_para_vencer, status, focus_sincronizado
             ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 'ATIVO', FALSE)
             ON CONFLICT (tenant_id, emitente_id) DO UPDATE SET
                nome_arquivo = EXCLUDED.nome_arquivo,
                arquivo_pfx = EXCLUDED.arquivo_pfx,
                senha = EXCLUDED.senha,
                valido_ate = EXCLUDED.valido_ate,
                dias_para_vencer = EXCLUDED.dias_para_vencer,
                status = 'ATIVO',
                focus_sincronizado = FALSE,
                updated_at = NOW()
             RETURNING id, emitente_id, nome_arquivo, valido_ate, dias_para_vencer, status, focus_sincronizado`,
            [tenantId, emitente_id, nome_arquivo, encryptedPfx, encryptedSenha, dataVenc, diffDias]
        );

        let focusSync = null;
        if (sincronizar_focus !== false) {
            await TransporteService.autoHidratarEmitentePeloCertificado(tenantId);
            const emitRefresh = await db.query(
                `SELECT cnpj, focus_empresa_id FROM dash_emitentes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [emitente_id, tenantId]
            );
            const masterCfg = await TransporteService.getMasterFocusConfig();
            const cnpjEmit = emitRefresh.rows[0]?.cnpj;
            if (masterCfg.temMasterToken && TransporteService.validarCnpjReal(cnpjEmit)) {
                try {
                    focusSync = await TransporteService.provisionarEmpresaFocus(tenantId, emitente_id, {
                        incluirCertificado: true,
                        registrarWebhooks: true,
                    });
                } catch (syncErr) {
                    focusSync = { success: false, erro: syncErr.message };
                }
            }
        }

        return res.status(201).json({ success: true, data: rows[0], focus_sync: focusSync });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/certificados/:id/sincronizar-focus', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT id, emitente_id FROM dash_certificados WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [parseInt(req.params.id, 10), tenantId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Certificado não encontrado.' });
        }
        await TransporteService.autoHidratarEmitentePeloCertificado(tenantId);
        const result = await TransporteService.provisionarEmpresaFocus(tenantId, rows[0].emitente_id, {
            incluirCertificado: true,
            registrarWebhooks: true,
        });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

router.delete('/certificados/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        await db.query(`DELETE FROM dash_certificados WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 13. PERMISSÕES GRANULARES DO MÓDULO TRANSPORTE
// ─────────────────────────────────────────────────────────────

/**
 * Matriz de permissões do módulo de Transporte, por ação.
 * Usada pelo editor de Grupos de Acesso para conceder apenas o necessário.
 */
router.get('/permissoes-transporte', async (req, res) => {
    return res.json({
        success: true,
        data: {
            documentos: [
                {
                    chave: 'cte',
                    rotulo: 'CT-e (Conhecimento de Transporte)',
                    acoes: [
                        { chave: 'cte.gerar', rotulo: 'Gerar rascunho de CT-e' },
                        { chave: 'cte.consultar', rotulo: 'Consultar CT-e' },
                        { chave: 'cte.emitir', rotulo: 'Emitir / transmitir CT-e à SEFAZ' },
                        { chave: 'cte.cancelar', rotulo: 'Cancelar CT-e' },
                        { chave: 'cte.corrigir', rotulo: 'Emitir Carta de Correção' }
                    ]
                },
                {
                    chave: 'mdfe',
                    rotulo: 'MDF-e (Manifesto de Carga)',
                    acoes: [
                        { chave: 'mdfe.gerar', rotulo: 'Gerar rascunho de MDF-e' },
                        { chave: 'mdfe.consultar', rotulo: 'Consultar MDF-e' },
                        { chave: 'mdfe.emitir', rotulo: 'Emitir / transmitir MDF-e à SEFAZ' },
                        { chave: 'mdfe.cancelar', rotulo: 'Cancelar MDF-e' },
                        { chave: 'mdfe.encerrar', rotulo: 'Encerrar MDF-e (liberar veículo)' },
                        { chave: 'mdfe.incluir_condutor', rotulo: 'Incluir condutor em trânsito' },
                        { chave: 'mdfe.incluir_dfe', rotulo: 'Incluir CT-e/NF-e no manifesto' }
                    ]
                },
                {
                    chave: 'ciot',
                    rotulo: 'CIOT e Contratos de Transporte',
                    acoes: [
                        { chave: 'ciot.gerar', rotulo: 'Criar contrato de transporte' },
                        { chave: 'ciot.emitir', rotulo: 'Gerar payload do CIOT' },
                        { chave: 'ciot.consultar', rotulo: 'Consultar contratos e CIOT' }
                    ]
                },
                {
                    chave: 'operacao',
                    rotulo: 'Operação e Logística',
                    acoes: [
                        { chave: 'carga.consultar', rotulo: 'Consultar cargas (NF-e do ERP)' },
                        { chave: 'rota.gerar', rotulo: 'Gerar roteiro de entrega' },
                        { chave: 'rota.entregar', rotulo: 'Registrar entrega de rota' },
                        { chave: 'frota.gerenciar', rotulo: 'Gerenciar veículos e motoristas' },
                        { chave: 'relatorio.consultar', rotulo: 'Consultar relatórios fiscais' },
                        { chave: 'certificado.gerenciar', rotulo: 'Gerenciar certificados digitais' }
                    ]
                }
            ]
        }
    });
});

/**
 * Salva as permissões de transporte de um grupo de acesso.
 */
router.put('/grupos-acesso/:id/permissoes-transporte', async (req, res) => {
    const tenantId = req.tenant.id;
    const grupoId = parseInt(req.params.id, 10);
    const { permissoes_transporte } = req.body || {};

    try {
        const { rows } = await db.query(
            `UPDATE dash_grupos_acesso
             SET permissoes_transporte = $1::jsonb, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3 RETURNING id, nome, permissoes_transporte`,
            [JSON.stringify(permissoes_transporte || {}), grupoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Grupo de acesso não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 14. VALIDAÇÃO PREVENTIVA, CORREÇÕES E OPERAÇÕES AVANÇADAS
// ─────────────────────────────────────────────────────────────

/**
 * Validação local do CT-e — não consome cota da Focus.
 * Retorna impedimentos (bloqueiam) e alertas (exigem confirmação).
 */
router.post('/ctes/:id/validar', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const resultado = await TransporteService.validarCte(tenantId, parseInt(req.params.id, 10));
        return res.json({ success: true, ...resultado });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Carta de Correção Eletrônica (CC-e) do CT-e autorizado.
 */
router.post('/ctes/:id/carta-correcao', async (req, res) => {
    const tenantId = req.tenant.id;
    const { correcao } = req.body || {};
    try {
        const result = await TransporteService.cartaCorrecaoCte(tenantId, parseInt(req.params.id, 10), correcao);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Inclui condutor em MDF-e em trânsito.
 */
router.post('/mdfes/:id/incluir-condutor', async (req, res) => {
    const tenantId = req.tenant.id;
    const { nome, cpf } = req.body || {};
    try {
        const result = await TransporteService.incluirCondutor(tenantId, parseInt(req.params.id, 10), { nome, cpf });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Inclui CT-e/NF-e em MDF-e já autorizado.
 */
router.post('/mdfes/:id/incluir-dfe', async (req, res) => {
    const tenantId = req.tenant.id;
    const { protocolo, codigo_municipio_carregamento, documentos } = req.body || {};
    try {
        const result = await TransporteService.incluirDfe(tenantId, parseInt(req.params.id, 10), {
            protocolo,
            codigo_municipio_carregamento,
            documentos
        });
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * Reconciliação de documentos presos em PROCESSANDO (job periódico).
 */
router.post('/reconciliar', async (req, res) => {
    const tenantId = req.tenant?.id || null;
    try {
        const result = await TransporteService.reconciliarProcessando(tenantId);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Timeline unificada de eventos fiscais de um documento (CT-e ou MDF-e).
 */
router.get('/timeline/:tipo/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const tipo = req.params.tipo.toUpperCase();
    const docId = parseInt(req.params.id, 10);

    try {
        const tabela = tipo === 'MDFE' ? 'dash_mdfes' : 'dash_ctes';
        const { rows } = await db.query(
            `SELECT * FROM ${tabela} WHERE id = $1 AND tenant_id = $2`,
            [docId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado.' });

        let doc = rows[0];
        let emitAmb = 'homologacao';
        if (doc.emitente_id) {
            const emAmbRes = await db.query(
                `SELECT focus_ambiente FROM dash_emitentes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [doc.emitente_id, tenantId]
            ).catch(() => ({ rows: [] }));
            emitAmb = emAmbRes.rows[0]?.focus_ambiente || 'homologacao';
        }

        if (
            tipo === 'CTE' &&
            doc.status === 'REJEITADO' &&
            String(emitAmb).toLowerCase() !== 'producao' &&
            (['310', '360', '365', '693'].includes(String(doc.status_sefaz || '').trim()) ||
                /dPrev|Grupo Documentos Transportados|IBS|CBS|vTotDFe/i.test(String(doc.mensagem_sefaz || '')))
        ) {
            try {
                await TransporteService.emitirCte(tenantId, docId);
                const retriedDoc = await db.query(
                    `SELECT * FROM ${tabela} WHERE id = $1 AND tenant_id = $2`,
                    [docId, tenantId]
                );
                if (retriedDoc.rows[0]) doc = retriedDoc.rows[0];
            } catch (_) {
                // ignora falha transitória de auto-reenvio
            }
        }

        const pdfField = tipo === 'MDFE' ? doc.caminho_damdfe : doc.caminho_dacte;
        if (
            doc.ref &&
            (doc.status === 'PROCESSANDO' || (doc.status === 'AUTORIZADO' && !pdfField))
        ) {
            try {
                if (tipo === 'MDFE') {
                    await TransporteService.consultarMdfeFocus(tenantId, docId);
                } else {
                    await TransporteService.consultarCteFocus(tenantId, docId);
                }
                const refreshedDoc = await db.query(
                    `SELECT * FROM ${tabela} WHERE id = $1 AND tenant_id = $2`,
                    [docId, tenantId]
                );
                if (refreshedDoc.rows[0]) doc = refreshedDoc.rows[0];
            } catch (_) {
                // ignora falha transitória de sincronização
            }
        }
        doc.focus_ambiente = emitAmb;
        doc.protocolo = TransporteService.extrairProtocoloFocus(doc.protocolo);
        doc.caminho_xml = FocusClient.normalizarUrlArquivo(doc.caminho_xml, emitAmb);
        if (doc.caminho_dacte) doc.caminho_dacte = FocusClient.normalizarUrlArquivo(doc.caminho_dacte, emitAmb);
        if (doc.caminho_damdfe) doc.caminho_damdfe = FocusClient.normalizarUrlArquivo(doc.caminho_damdfe, emitAmb);
        const eventos = [];

        // Evento de criação
        eventos.push({
            tipo: 'CRIACAO',
            status: 'CONCLUIDO',
            titulo: 'Rascunho criado',
            descricao: `Documento ${tipo} ${doc.numero ? 'nº ' + doc.numero : ''} criado no sistema.`,
            data: doc.created_at
        });

        // Envio à Focus
        const retorno = doc.retorno_focus || {};
        if (retorno.processando_autorizacao || doc.status === 'PROCESSANDO') {
            eventos.push({
                tipo: 'ENVIO',
                status: 'CONCLUIDO',
                titulo: 'Enviado para autorização',
                descricao: `Payload transmitido à Focus NFe (ref: ${doc.ref}).`,
                data: doc.updated_at
            });
        }

        // Resposta oficial da SEFAZ
        if (doc.status_sefaz) {
            eventos.push({
                tipo: doc.status === 'AUTORIZADO' ? 'AUTORIZACAO' : doc.status === 'REJEITADO' ? 'REJEICAO' : 'RESPOSTA',
                status: doc.status === 'AUTORIZADO' ? 'SUCESSO' : doc.status === 'REJEITADO' ? 'ERRO' : 'PENDENTE',
                titulo: doc.status === 'AUTORIZADO' ? 'Autorizado pela SEFAZ' :
                        doc.status === 'REJEITADO' ? 'Rejeitado pela SEFAZ' : 'Retorno da SEFAZ',
                descricao: `${doc.status_sefaz} — ${doc.mensagem_sefaz || ''}`,
                data: doc.updated_at
            });
        }

        // Cancelamento
        if (doc.status === 'CANCELADO') {
            eventos.push({
                tipo: 'CANCELAMENTO',
                status: 'CONCLUIDO',
                titulo: 'Documento cancelado',
                descricao: 'Evento de cancelamento registrado na SEFAZ.',
                data: doc.updated_at
            });
        }

        // Encerramento (MDF-e)
        if (tipo === 'MDFE' && doc.encerrado_em) {
            eventos.push({
                tipo: 'ENCERRAMENTO',
                status: 'CONCLUIDO',
                titulo: 'Viagem encerrada',
                descricao: `Encerramento registrado em ${doc.encerramento_municipio || ''}/${doc.encerramento_uf || ''}.`,
                data: doc.encerrado_em
            });
        }

        // Eventos adicionais gravados pela Focus (CC-e, inclusão de condutor/DF-e)
        if (retorno.carta_correcao) {
            eventos.push({
                tipo: 'CARTA_CORRECAO',
                status: 'CONCLUIDO',
                titulo: 'Carta de Correção registrada',
                descricao: 'CC-e emitida e vinculada ao CT-e.',
                data: doc.updated_at
            });
        }
        if (retorno.inclusao_condutor) {
            eventos.push({
                tipo: 'INCLUSAO_CONDUTOR',
                status: 'CONCLUIDO',
                titulo: 'Condutor incluído',
                descricao: 'Novo condutor registrado durante a viagem.',
                data: doc.updated_at
            });
        }
        if (retorno.inclusao_dfe) {
            eventos.push({
                tipo: 'INCLUSAO_DFE',
                status: 'CONCLUIDO',
                titulo: 'DF-e incluído no manifesto',
                descricao: 'CT-e/NF-e vinculados ao MDF-e autorizado.',
                data: doc.updated_at
            });
        }

        eventos.sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));

        return res.json({
            success: true,
            data: {
                documento: doc,
                tipo,
                eventos
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
