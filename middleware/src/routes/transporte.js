'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const TransporteService = require('../services/transporteService');
const veiculoService = require('../services/veiculoService');

let _transporteColsReady = false;
async function ensureTransporteColumns() {
    if (_transporteColsReady) return;
    try {
        await db.query(`
            ALTER TABLE dash_emitentes
              ADD COLUMN IF NOT EXISTS focus_token_homologacao VARCHAR(255),
              ADD COLUMN IF NOT EXISTS focus_token_producao VARCHAR(255),
              ADD COLUMN IF NOT EXISTS regime_tributario VARCHAR(2) DEFAULT '1',
              ADD COLUMN IF NOT EXISTS cfop_padrao_cte VARCHAR(8) DEFAULT '5353',
              ADD COLUMN IF NOT EXISTS natureza_padrao_cte VARCHAR(255) DEFAULT 'PRESTACAO DE SERVICO DE TRANSPORTE',
              ADD COLUMN IF NOT EXISTS aliquota_icms_padrao NUMERIC(7,4) DEFAULT 12.00,
              ADD COLUMN IF NOT EXISTS complemento VARCHAR(120),
              ADD COLUMN IF NOT EXISTS email VARCHAR(255);

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
              ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) DEFAULT '01';

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
              ADD COLUMN IF NOT EXISTS informacao_adicional TEXT,
              ADD COLUMN IF NOT EXISTS pagto_frete JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS contratantes JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS seguros JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS produtos_predominantes JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS lacres JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS pessoas_autorizadas JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS reboques JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS condutores JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS vale_pedagio JSONB DEFAULT '[]'::jsonb;
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
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 1. CARGAS (Notas Fiscais vindas do ERP Coliseu / Firebird)
// ─────────────────────────────────────────────────────────────

router.get('/cargas', async (req, res) => {
    const tenantId = req.tenant.id;
    const { status, search, cliente, data_inicio, data_fim, limit = 200, offset = 0 } = req.query;

    try {
        let sql = `SELECT * FROM dash_cargas WHERE tenant_id = $1`;
        const params = [tenantId];

        if (status && status !== 'TODAS') {
            params.push(status.toUpperCase());
            sql += ` AND status = $${params.length}`;
        }

        if (cliente) {
            params.push(`%${cliente}%`);
            sql += ` AND (destinatario_nome ILIKE $${params.length} OR destinatario_documento ILIKE $${params.length})`;
        }

        if (data_inicio) {
            params.push(`${data_inicio} 00:00:00`);
            sql += ` AND data_emissao >= $${params.length}::timestamptz`;
        }

        if (data_fim) {
            params.push(`${data_fim} 23:59:59`);
            sql += ` AND data_emissao <= $${params.length}::timestamptz`;
        }

        if (search) {
            params.push(`%${search.trim()}%`);
            sql += ` AND (chave_acesso ILIKE $${params.length} OR numero ILIKE $${params.length} OR remetente_nome ILIKE $${params.length} OR destinatario_nome ILIKE $${params.length})`;
        }

        // Contagem filtrada
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int as total');
        const countRes = await db.query(countSql, params);

        sql += ` ORDER BY data_emissao DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(sql, params);

        return res.json({
            success: true,
            data: rows,
            total: countRes.rows[0]?.total || 0
        });
    } catch (err) {
        logger.error('[Transporte API] Erro ao listar cargas:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar cargas' });
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
                   m.uf_inicio, m.uf_fim, NULL AS municipio_inicio, NULL AS municipio_fim,
                   NULL::numeric AS valor_total, m.valor_carga, m.peso_bruto,
                   NULL::numeric AS valor_icms, NULL::numeric AS aliquota_icms,
                   m.caminho_xml, m.caminho_damdfe AS caminho_pdf, m.protocolo,
                   m.data_emissao, m.created_at,
                   e.razao_social AS emitente_nome,
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
            LIMIT ${params.length + 1} OFFSET ${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const { rows } = await db.query(finalSql, params);
        return res.json({ success: true, data: rows, total: rows.length });
    } catch (err) {
        logger.error('[Documentos API] Erro ao listar documentos:', err.message);
        return res.status(500).json({ error: err.message });
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

router.get('/ctes/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    try {
        const { rows } = await db.query(
            `SELECT c.*, e.razao_social as emitente_nome
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
                documentos_json, quantidades_carga, modal_os_dados
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
                $55::jsonb, $56::jsonb, $57::jsonb
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
                parseFloat(b.aliquota_ibs || 0),
                parseFloat(b.aliquota_cbs || 0),
                b.codigo_situacao_fiscal || null,
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

router.put('/ctes/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const cteId = req.params.id;
    const b = req.body || {};

    try {
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
                updated_at = NOW()
             WHERE id = $56 AND tenant_id = $57
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
                b.codigo_situacao_fiscal ?? null,
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

router.get('/mdfes/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT m.*, e.razao_social as emitente_nome
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

        const tipoEmitenteFinal = String(b.tipo_emitente || (cargasIds.length > 0 && ctesIds.length === 0 ? '2' : '1'));
        const ref = TransporteService.gerarRef('MDFE', tenantId, Date.now().toString().slice(-6));

        const { rows } = await db.query(
            `INSERT INTO dash_mdfes (
                tenant_id, emitente_id, ref, status, serie, numero,
                tipo_emitente, tipo_transporte, uf_inicio, uf_fim,
                ufs_percurso, municipios_carregamento, municipios_descarregamento,
                codigo_municipio_carregamento, municipio_carregamento,
                codigo_municipio_descarregamento, municipio_descarregamento,
                veiculo_id, veiculo_placa,
                motorista_id, motorista_cpf, motorista_nome,
                condutores, reboques, contratantes, pagto_frete,
                seguros, produtos_predominantes, lacres, pessoas_autorizadas,
                informacao_adicional, ciot_codigo, vale_pedagio,
                qtd_cte, qtd_nfe, valor_carga, peso_bruto
             ) VALUES (
                $1, $2, $3, 'RASCUNHO', $4, $5,
                $6, $7, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb,
                $13, $14,
                $15, $16,
                $17, $18,
                $19, $20, $21,
                $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb,
                $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb,
                $30, $31, $32::jsonb,
                $33, $34, $35, $36
             ) RETURNING *`,
            [
                tenantId,
                emitId,
                ref,
                b.serie || '1',
                b.numero ? parseInt(b.numero, 10) : null,
                tipoEmitenteFinal,
                String(b.tipo_transporte || '1'),
                (b.uf_inicio || 'MS').toUpperCase(),
                (b.uf_fim || 'MS').toUpperCase(),
                JSON.stringify(b.ufs_percurso || []),
                JSON.stringify(b.municipios_carregamento || []),
                JSON.stringify(b.municipios_descarregamento || []),
                b.codigo_municipio_carregamento || b.municipios_carregamento?.[0]?.ibge || null,
                b.municipio_carregamento || b.municipios_carregamento?.[0]?.nome || null,
                b.codigo_municipio_descarregamento || b.municipios_descarregamento?.[0]?.ibge || null,
                b.municipio_descarregamento || b.municipios_descarregamento?.[0]?.nome || null,
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
                b.ciot_codigo || null,
                JSON.stringify(b.vale_pedagio || {}),
                ctesIds.length,
                cargasIds.length,
                parseFloat(b.valor_carga ?? b.valor_total_carga ?? 0),
                parseFloat(b.peso_bruto ?? b.peso_bruto_kg ?? 0),
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

        for (const cargaId of cargasIds) {
            const cargaRes = await db.query(
                `SELECT chave_acesso, destinatario_municipio, dados_nfe FROM dash_cargas WHERE id = $1 AND tenant_id = $2`,
                [cargaId, tenantId]
            );
            if (cargaRes.rows.length > 0 && cargaRes.rows[0].chave_acesso) {
                const cg = cargaRes.rows[0];
                const codIbge = cg.dados_nfe?.destinatario?.codigo_municipio || cg.dados_nfe?.destinatario?.cMun || null;
                await db.query(
                    `INSERT INTO dash_mdfe_documentos (tenant_id, mdfe_id, tipo_documento, chave, codigo_municipio_descarregamento, nome_municipio_descarregamento)
                     VALUES ($1, $2, 'NFE', $3, $4, $5)
                     ON CONFLICT (tenant_id, mdfe_id, chave) DO NOTHING`,
                    [tenantId, novoMdfe.id, cg.chave_acesso, codIbge, cg.destinatario_municipio]
                );
                await db.query(
                    `UPDATE dash_cargas SET status = 'EM_MDFE', mdfe_id = $1 WHERE id = $2`,
                    [novoMdfe.id, cargaId]
                );
            }
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
        id, placa, renavam, chassi, uf, tipo_rodado = '01', tipo_carroceria = '01',
        tara_kg = 0, capacidade_kg = 0, capacidade_m3 = 0, tipo_proprietario = '1',
        rntrc = null, cpf_cnpj_proprietario = null, nome_proprietario = null, uf_proprietario = null
    } = req.body || {};

    if (!placa || String(placa).replace(/\D/g, '').length < 7) {
        return res.status(400).json({ error: 'Placa é obrigatória (7 caracteres).' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_veiculos (
                tenant_id, id, placa, renavam, chassi, uf, tipo_rodado, tipo_carroceria,
                tara_kg, capacidade_kg, capacidade_m3, tipo_proprietario,
                rntrc, cpf_cnpj_proprietario, nome_proprietario, uf_proprietario
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
                tenantId, id || null, veiculoService.normalizarPlaca(placa), renavam || null,
                chassi || null, uf || null, tipo_rodado, tipo_carroceria,
                parseFloat(tara_kg || 0), parseFloat(capacidade_kg || 0), parseFloat(capacidade_m3 || 0),
                tipo_proprietario, rntrc || null, cpf_cnpj_proprietario || null,
                nome_proprietario || null, uf_proprietario || null
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

    if (!cpf || !nome) {
        return res.status(400).json({ error: 'CPF e nome são obrigatórios.' });
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_motoristas (
                tenant_id, id, cpf, nome, cnh, cnh_categoria, cnh_validade, telefone
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (tenant_id, cpf) DO UPDATE SET
                nome = EXCLUDED.nome,
                cnh = COALESCE(NULLIF(EXCLUDED.cnh, ''), dash_motoristas.cnh),
                cnh_categoria = COALESCE(NULLIF(EXCLUDED.cnh_categoria, ''), dash_motoristas.cnh_categoria),
                cnh_validade = COALESCE(EXCLUDED.cnh_validade, dash_motoristas.cnh_validade),
                telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), dash_motoristas.telefone),
                ativo = true,
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId, id || null, String(cpf).replace(/\D/g, ''), nome,
                cnh || null, cnh_categoria || null, cnh_validade || null, telefone || null
            ]
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

router.get('/emitentes', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        let { rows } = await db.query(
            `SELECT * FROM dash_emitentes WHERE tenant_id = $1 ORDER BY id ASC`,
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

        const enriched = rows.map((r) => {
            const tokHomolog =
                r.focus_token_homologacao ||
                cfg.focus_token_homologacao ||
                (r.focus_ambiente !== 'producao' ? r.focus_token : '') ||
                '';
            const tokProd =
                r.focus_token_producao ||
                cfg.focus_token_producao ||
                (r.focus_ambiente === 'producao' ? r.focus_token : '') ||
                '';
            return {
                ...r,
                focus_ambiente: r.focus_ambiente || cfg.focus_ambiente || 'homologacao',
                focus_token_homologacao: tokHomolog,
                focus_token_producao: tokProd,
                tem_token_homologacao: Boolean(tokHomolog),
                tem_token_producao: Boolean(tokProd),
                regime_tributario: r.regime_tributario || cfg.focus_regime_tributario || '1',
                serie_cte: r.serie_cte || cfg.focus_serie_cte || '1',
                serie_mdfe: r.serie_mdfe || cfg.focus_serie_mdfe || '1',
                cfop_padrao_cte: r.cfop_padrao_cte || cfg.focus_cfop_padrao || '5353',
                natureza_padrao_cte:
                    r.natureza_padrao_cte || cfg.focus_natureza_padrao || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                aliquota_icms_padrao: r.aliquota_icms_padrao ?? cfg.focus_aliquota_icms_padrao ?? 12.0,
            };
        });

        return res.json({ success: true, data: enriched });
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
    const { search = '' } = req.query;

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

        if (search) {
            params.push(`%${search.trim()}%`);
            sql += ` AND (r.cidade ILIKE $${params.length} OR c.nome ILIKE $${params.length} OR r.cod_ibge ILIKE $${params.length} OR c.codigo_ibge ILIKE $${params.length})`;
        }

        sql += ` ORDER BY cidade ASC LIMIT 100`;

        const { rows } = await db.query(sql, params);
        return res.json({ success: true, data: rows });
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

    try {
        const ambiente = String(b.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
            ? 'producao'
            : 'homologacao';

        const tokHomolog =
            b.focus_token_homologacao !== undefined
                ? String(b.focus_token_homologacao || '').trim()
                : ambiente === 'homologacao' && b.focus_token
                ? String(b.focus_token).trim()
                : null;

        const tokProd =
            b.focus_token_producao !== undefined
                ? String(b.focus_token_producao || '').trim()
                : ambiente === 'producao' && b.focus_token
                ? String(b.focus_token).trim()
                : null;

        const tokAtivo =
            b.focus_token ||
            (ambiente === 'producao' ? tokProd : tokHomolog) ||
            null;

        const { rows } = await db.query(
            `INSERT INTO dash_emitentes (
                tenant_id, cnpj, razao_social, nome_fantasia, inscricao_estadual,
                rntrc, regime_tributario,
                logradouro, numero, complemento, bairro, cep,
                uf, municipio, codigo_municipio, telefone, email,
                focus_token, focus_token_homologacao, focus_token_producao, focus_ambiente,
                serie_cte, serie_mdfe, cfop_padrao_cte, natureza_padrao_cte, aliquota_icms_padrao
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7,
                $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17,
                $18, $19, $20, $21,
                $22, $23, $24, $25, $26
             )
             ON CONFLICT (tenant_id, cnpj) DO UPDATE SET
                razao_social = EXCLUDED.razao_social,
                nome_fantasia = COALESCE(NULLIF(EXCLUDED.nome_fantasia, ''), dash_emitentes.nome_fantasia),
                inscricao_estadual = COALESCE(EXCLUDED.inscricao_estadual, dash_emitentes.inscricao_estadual),
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
                updated_at = NOW()
             RETURNING *`,
            [
                tenantId,
                cleanCnpj,
                b.razao_social || 'EMPRESA EMITENTE',
                b.nome_fantasia || b.razao_social || 'EMPRESA EMITENTE',
                b.inscricao_estadual || '',
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
            ]
        );

        const saved = rows[0];

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

        return res.json({ success: true, data: saved });
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
// 7. CONTRATOS DE TRANSPORTE + CIOT
// ─────────────────────────────────────────────────────────────

/**
 * Piso mínimo ANTT por tipo de operação (valores base em R$ por km).
 * Atualizável via dash_regras_fiscais — nunca codificar fixo no sistema.
 */
function calcularPisoMinimo(tipoOperacao, ufInicio, ufFim, valorFrete) {
    // Distância média de referência por tipo de operação (km) — base de cálculo conservadora.
    const distanciaRef = tipoOperacao === 'Carga Fracionada' ? 1200 : 800;
    const pisoPorKm = tipoOperacao === 'Carga Lotacao' ? 1.86 : 1.55;
    const piso = distanciaRef * pisoPorKm;
    const floor = Math.round(piso * 100) / 100;
    return {
        piso: floor,
        aprovado: Number(valorFrete || 0) >= floor,
        // Margem de segurança de 5% para absorver variações de tabela.
        margem: Math.round(floor * 1.05 * 100) / 100
    };
}

router.get('/contratos', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT * FROM dash_contratos_transporte WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 300`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/contratos', async (req, res) => {
    const tenantId = req.tenant.id;
    const {
        contratante_nome, contratante_documento,
        transportador_nome, transportador_documento, transportador_rntrc,
        tipo_transporte = '2', tipo_operacao = 'Carga Lotacao',
        uf_inicio, uf_fim,
        valor_frete = 0, valor_adiantamento = 0, valor_pedagio = 0, valor_combustivel = 0,
        forma_quitacao = 'PIX', emitente_id
    } = req.body || {};

    if (!contratante_nome || !transportador_nome || !uf_inicio || !uf_fim) {
        return res.status(400).json({ error: 'contratante, transportador, uf_inicio e uf_fim são obrigatórios.' });
    }

    try {
        // Resolve emitente padrão se não informado
        let emitId = emitente_id;
        if (!emitId) {
            const em = await db.query(
                `SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id LIMIT 1`,
                [tenantId]
            );
            if (em.rows.length === 0) {
                return res.status(400).json({ error: 'Cadastre uma transportadora (emitente) antes de criar contratos.' });
            }
            emitId = em.rows[0].id;
        }

        const piso = calcularPisoMinimo(tipo_operacao, uf_inicio, uf_fim, valor_frete);

        const { rows } = await db.query(
            `INSERT INTO dash_contratos_transporte (
                tenant_id, emitente_id,
                contratante_nome, contratante_documento,
                transportador_nome, transportador_documento, transportador_rntrc,
                tipo_transporte, tipo_operacao, uf_inicio, uf_fim,
                valor_frete, valor_adiantamento, valor_pedagio, valor_combustivel,
                forma_quitacao, piso_minimo_antt, piso_minimo_aprovado
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             RETURNING *`,
            [
                tenantId, emitId,
                contratante_nome, String(contratante_documento || '').replace(/\D/g, ''),
                transportador_nome, String(transportador_documento || '').replace(/\D/g, ''), transportador_rntrc,
                tipo_transporte, tipo_operacao, uf_inicio, uf_fim,
                parseFloat(valor_frete || 0), parseFloat(valor_adiantamento || 0),
                parseFloat(valor_pedagio || 0), parseFloat(valor_combustivel || 0),
                forma_quitacao, piso.piso, piso.aprovado
            ]
        );

        return res.status(201).json({
            success: true,
            data: rows[0],
            piso_minimo: piso
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Gera o payload do CIOT no formato exigido pela ANTT / Instituição de Pagamento.
 * O ColiseuTransporte NÃO emite o CIOT — apenas prepara e valida.
 */
router.post('/contratos/:id/gerar-ciot', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;

    try {
        const { rows } = await db.query(
            `SELECT * FROM dash_contratos_transporte WHERE id = $1 AND tenant_id = $2`,
            [contratoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contrato não encontrado.' });

        const c = rows[0];

        if (c.piso_minimo_aprovado === false) {
            return res.status(422).json({
                error: `Frete abaixo do piso mínimo da ANTT (R$ ${Number(c.piso_minimo_antt).toFixed(2)}). O CIOT não pode ser gerado.`,
                code: 'PISO_MINIMO_NAO_ATENDIDO'
            });
        }

        const payload = {
            ciot: {
                versao: '1.00',
                tipo_operacao: c.tipo_operacao,
                tipo_transporte: c.tipo_transporte,
                contratante: {
                    documento: c.contratante_documento,
                    nome: c.contratante_nome
                },
                transportador: {
                    documento: c.transportador_documento,
                    nome: c.transportador_nome,
                    rntrc: c.transportador_rntrc || null
                },
                percurso: {
                    uf_origem: c.uf_inicio,
                    uf_destino: c.uf_fim
                },
                valores: {
                    frete: parseFloat(c.valor_frete || 0).toFixed(2),
                    adiantamento: parseFloat(c.valor_adiantamento || 0).toFixed(2),
                    pedagio: parseFloat(c.valor_pedagio || 0).toFixed(2),
                    combustivel: parseFloat(c.valor_combustivel || 0).toFixed(2),
                    piso_minimo_referencia: c.piso_minimo_antt
                },
                quitacao: {
                    forma: c.forma_quitacao
                }
            },
            _meta: {
                gerado_em: new Date().toISOString(),
                origem: 'ColiseuTransporte',
                observacao: 'Payload gerado para transmissão à Instituição de Pagamento ou à API da ANTT.'
            }
        };

        await db.query(
            `UPDATE dash_contratos_transporte SET ciot_status = 'GERADO', ciot_payload_antt = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(payload), contratoId]
        );

        return res.json({ success: true, payload });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Registra o código do CIOT retornado pela Instituição de Pagamento / ANTT.
 */
router.patch('/contratos/:id/ciot', async (req, res) => {
    const tenantId = req.tenant.id;
    const contratoId = req.params.id;
    const { ciot_codigo, ciot_status = 'TRANSMITIDO' } = req.body || {};

    if (!ciot_codigo) return res.status(400).json({ error: 'ciot_codigo é obrigatório.' });

    try {
        const { rows } = await db.query(
            `UPDATE dash_contratos_transporte
             SET ciot_codigo = $1, ciot_status = $2, ciot_transmitido_em = NOW(), updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4 RETURNING *`,
            [String(ciot_codigo).trim(), ciot_status, contratoId, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contrato não encontrado.' });
        return res.json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Cancela um CIOT já registrado (operação não efetivada).
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
        return res.json({ success: true, data: rows[0] });
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
// 9. REGRAS FISCAIS (ICMS / FCP / Rateio)
// ─────────────────────────────────────────────────────────────

router.get('/regras', async (req, res) => {
    const tenantId = req.tenant.id;
    try {
        const { rows } = await db.query(
            `SELECT * FROM dash_regras_fiscais WHERE tenant_id = $1 ORDER BY
                CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END,
                uf_origem, uf_destino, id`,
            [tenantId]
        );
        return res.json({ success: true, data: rows });
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
        percentual_adicional = 0, emitente_id = null, ativo = true
    } = req.body || {};

    try {
        const { rows } = await db.query(
            `INSERT INTO dash_regras_fiscais (
                tenant_id, emitente_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, aliquota_icms, percentual_fcp,
                part_fcp_origem, part_fcp_destino, part_icms_origem, part_icms_destino,
                is_final_consumer, criterio_rateio, valor_minimo, valor_maximo,
                percentual_adicional, ativo
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             RETURNING *`,
            [
                tenantId, emitente_id, escopo, uf_origem, uf_destino, tipo_servico,
                situacao_tributaria, cfop, parseFloat(aliquota_icms || 0), parseFloat(percentual_fcp || 0),
                parseFloat(part_fcp_origem || 0), parseFloat(part_fcp_destino || 0),
                parseFloat(part_icms_origem || 0), parseFloat(part_icms_destino || 0),
                is_final_consumer, criterio_rateio,
                valor_minimo !== null && valor_minimo !== '' ? parseFloat(valor_minimo) : null,
                valor_maximo !== null && valor_maximo !== '' ? parseFloat(valor_maximo) : null,
                parseFloat(percentual_adicional || 0), ativo
            ]
        );
        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.patch('/regras/:id', async (req, res) => {
    const tenantId = req.tenant.id;
    const regraId = req.params.id;
    const camposPermitidos = [
        'escopo', 'uf_origem', 'uf_destino', 'tipo_servico', 'situacao_tributaria', 'cfop',
        'aliquota_icms', 'percentual_fcp', 'part_fcp_origem', 'part_fcp_destino',
        'part_icms_origem', 'part_icms_destino', 'is_final_consumer',
        'criterio_rateio', 'valor_minimo', 'valor_maximo', 'percentual_adicional', 'ativo'
    ];

    try {
        const body = req.body || {};
        const sets = [];
        const params = [tenantId, regraId];
        for (const c of camposPermitidos) {
            if (body[c] !== undefined) {
                params.push(body[c]);
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
});

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
        const { rows } = await db.query(
            `SELECT c.id, c.emitente_id, e.razao_social AS emitente_nome, e.cnpj,
                    c.nome_arquivo, c.valido_de, c.valido_ate, c.dias_para_vencer, c.status
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
    const { emitente_id, nome_arquivo, senha, arquivo_base64, valido_ate } = req.body || {};

    if (!emitente_id || !nome_arquivo || !senha) {
        return res.status(400).json({ error: 'emitente_id, nome_arquivo e senha são obrigatórios.' });
    }

    try {
        const pfxBuffer = arquivo_base64 ? Buffer.from(arquivo_base64, 'base64') : Buffer.alloc(0);
        const dataVenc = valido_ate ? new Date(valido_ate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
        const diffDias = Math.ceil((dataVenc.getTime() - Date.now()) / (1000 * 3600 * 24));

        const { rows } = await db.query(
            `INSERT INTO dash_certificados (
                tenant_id, emitente_id, nome_arquivo, arquivo_pfx, senha,
                valido_de, valido_ate, dias_para_vencer, status
             ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 'ATIVO')
             ON CONFLICT (tenant_id, emitente_id) DO UPDATE SET
                nome_arquivo = EXCLUDED.nome_arquivo,
                arquivo_pfx = EXCLUDED.arquivo_pfx,
                senha = EXCLUDED.senha,
                valido_ate = EXCLUDED.valido_ate,
                dias_para_vencer = EXCLUDED.dias_para_vencer,
                status = 'ATIVO',
                updated_at = NOW()
             RETURNING id, emitente_id, nome_arquivo, valido_ate, dias_para_vencer, status`,
            [tenantId, emitente_id, nome_arquivo, pfxBuffer, senha, dataVenc, diffDias]
        );

        return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
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

        const doc = rows[0];
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
