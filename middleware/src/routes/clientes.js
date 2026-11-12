'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { getPeriodRange } = require('../utils/period');
const {
    isTenantAdminOrMaster,
    hasActionPermission,
    hasMenuPermission,
} = require('../middleware/auth');
const {
    resolverIbgeMunicipioSync,
    resolverIbgeMunicipioAsync,
    normalizarUf,
} = require('../utils/ibgeMunicipios');

let _clientesColsReady = false;

async function ensureClientesTransporteColumns() {
    if (_clientesColsReady) return;
    try {
        await db.query(`
            ALTER TABLE dash_clientes
              ADD COLUMN IF NOT EXISTS inscricao_estadual VARCHAR(30),
              ADD COLUMN IF NOT EXISTS indicador_ie VARCHAR(5) DEFAULT '9',
              ADD COLUMN IF NOT EXISTS cep VARCHAR(15),
              ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255),
              ADD COLUMN IF NOT EXISTS numero VARCHAR(40),
              ADD COLUMN IF NOT EXISTS complemento VARCHAR(120),
              ADD COLUMN IF NOT EXISTS bairro VARCHAR(120),
              ADD COLUMN IF NOT EXISTS codigo_municipio VARCHAR(10);
        `);
        _clientesColsReady = true;
    } catch (err) {
        logger.debug('[Clientes TMS] Colunas fiscais verificadas com aviso:', err.message);
    }
}

function digitsOnly(val) {
    return String(val || '').replace(/\D/g, '');
}

function formatCpfCnpj(val) {
    if (!val) return val;
    const digits = digitsOnly(val).slice(0, 14);
    if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return String(val).trim();
}

function parseEnderecoCompleto(enderecoCompleto) {
    const raw = String(enderecoCompleto || '').trim();
    if (!raw) {
        return { logradouro: '', numero: '', bairro: '' };
    }
    const parts = raw
        .split(/[,|-]/)
        .map((p) => p.trim())
        .filter(Boolean);
    return {
        logradouro: parts[0] || raw,
        numero: parts[1] && parts[1].length <= 20 ? parts[1] : 'S/N',
        bairro: parts[2] || 'CENTRO',
    };
}

function composeEnderecoCompleto({ logradouro, numero, complemento, bairro, endereco_completo }) {
    const parts = [
        logradouro && String(logradouro).trim(),
        numero && String(numero).trim(),
        complemento && String(complemento).trim(),
        bairro && String(bairro).trim(),
    ].filter(Boolean);
    if (parts.length > 0) {
        return parts.join(', ').toUpperCase();
    }
    return endereco_completo ? String(endereco_completo).trim().toUpperCase() : null;
}

function resolveIndicadorIe(indicadorInput, ieInput) {
    const ieClean = String(ieInput || '').trim().toUpperCase();
    const indClean = String(indicadorInput || '').trim();
    if (['1', '2', '9'].includes(indClean)) {
        if (indClean === '1' && (!ieClean || ieClean === 'ISENTO')) return '9';
        return indClean;
    }
    if (ieClean === 'ISENTO') return '2';
    if (ieClean.length >= 4) return '1';
    return '9';
}

function canViewClienteFicha(req) {
    if (isTenantAdminOrMaster(req)) return true;
    if (req.user?.permissoes_acoes?.permitir_ver_ficha_cliente === false) return false;
    return (
        hasActionPermission(req, 'permitir_ver_ficha_cliente') ||
        hasMenuPermission(req, 'cadastros', 'clientes')
    );
}

function canManageClientes(req) {
    if (isTenantAdminOrMaster(req)) return true;
    return (
        hasMenuPermission(req, 'cadastros', 'clientes') ||
        hasMenuPermission(req, 'cadastros', 'partes') ||
        hasActionPermission(req, 'permitir_emitir_cte')
    );
}

function applySuperBuscaFilter(search, pIndex, where, binds) {
    if (!search || !String(search).trim()) return pIndex;

    const s = String(search).trim();
    const cleanDigits = digitsOnly(s);

    let docFilter = `c.documento ILIKE $${pIndex}`;
    if (cleanDigits.length >= 3) {
        docFilter += ` OR regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g') ILIKE $${pIndex + 1}`;
    }

    where.push(`(
        c.nome ILIKE $${pIndex}
        OR COALESCE(c.nome_fantasia, '') ILIKE $${pIndex}
        OR COALESCE(c.razao_social, '') ILIKE $${pIndex}
        OR ${docFilter}
        OR CAST(c.id_firebird AS TEXT) ILIKE $${pIndex}
        OR COALESCE(c.cidade, '') ILIKE $${pIndex}
        OR COALESCE(c.classificacao, '') ILIKE $${pIndex}
        OR COALESCE(c.inscricao_estadual, '') ILIKE $${pIndex}
        OR COALESCE(c.email, '') ILIKE $${pIndex}
        OR COALESCE(c.email_financeiro, '') ILIKE $${pIndex}
        OR COALESCE(c.telefone, '') ILIKE $${pIndex}
        OR COALESCE(c.celular_secundario, '') ILIKE $${pIndex}
    )`);

    binds.push(`%${s}%`);
    let nextIndex = pIndex + 1;

    if (cleanDigits.length >= 3) {
        binds.push(`%${cleanDigits}%`);
        nextIndex++;
    }

    return nextIndex;
}

function getFornecedorCondition(alias = 'c') {
    return `(
        UPPER(COALESCE(${alias}.tipo_cliente, '')) LIKE '%FORNECEDOR%'
        OR UPPER(COALESCE(${alias}.classificacao, '')) LIKE '%FORNECEDOR%'
        OR ${alias}.nome ILIKE 'BANCO %'
        OR ${alias}.nome ILIKE '%BRADESCO%'
        OR ${alias}.nome ILIKE '%BANCO DO BRASIL%'
        OR ${alias}.nome ILIKE '%SANTANDER%'
        OR ${alias}.nome ILIKE '%BANCO ITAU%'
        OR ${alias}.nome ILIKE '%BANCO GM%'
        OR ${alias}.nome ILIKE '%CLARO %'
        OR ${alias}.nome ILIKE '%ENERGISA%'
        OR ${alias}.nome ILIKE '%SANESUL%'
        OR ${alias}.nome ILIKE '%TELEFONICA%'
        OR ${alias}.nome ILIKE '%ACERTO DOS SOCIOS%'
        OR ${alias}.nome ILIKE '%COLISEU CHAVE EMERGENCIAL%'
    )`;
}

function enrichClienteTransporteRow(row) {
    const docDigits = digitsOnly(row.documento);
    const ufResolvida = normalizarUf(row.estado || row.parte_uf || '') || (row.estado ? String(row.estado).trim().toUpperCase().slice(0, 2) : '');
    const cidadeNome = String(row.cidade || row.parte_municipio || '').trim();
    const ibgeInfo = resolverIbgeMunicipioSync(
        row.codigo_municipio || row.parte_codigo_municipio || '',
        cidadeNome,
        ufResolvida || 'MS'
    );
    const ieEfetiva = String(row.inscricao_estadual || row.parte_ie || '').trim();
    const indicadorIeEfetivo = resolveIndicadorIe(row.indicador_ie || row.parte_indicador_ie, ieEfetiva);
    const docValido = docDigits.length === 11 || docDigits.length === 14;
    const temCidadeUf = Boolean(cidadeNome && cidadeNome !== '—' && ufResolvida.length === 2);
    const prontoCte = Boolean(docValido && temCidadeUf && ibgeInfo.codigo && ibgeInfo.codigo.length === 7);

    return {
        ...row,
        documento_limpo: docDigits,
        uf_normalizada: ufResolvida,
        inscricao_estadual_efetiva: ieEfetiva || null,
        indicador_ie_efetivo: indicadorIeEfetivo,
        codigo_municipio_resolvido: temCidadeUf ? ibgeInfo.codigo : (digitsOnly(row.codigo_municipio || row.parte_codigo_municipio) || null),
        ibge_exato: Boolean(temCidadeUf && ibgeInfo.exato),
        vinculado_parte: Boolean(row.parte_id),
        pronto_cte: prontoCte,
    };
}

/**
 * Sincroniza um cliente do ERP (`dash_clientes`) para `dash_partes` (Remetente/Destinatário/Tomador CT-e)
 * resolvendo automaticamente código IBGE, IE, Indicador IE e endereço estruturado.
 */
async function upsertParteTransporteFromCliente(tenantId, cli, overrides = {}) {
    const rawDoc = overrides.documento ?? cli.documento ?? '';
    const docDigits = digitsOnly(rawDoc);
    if (docDigits.length !== 11 && docDigits.length !== 14) {
        const err = new Error('O cliente precisa possuir CPF (11 dígitos) ou CNPJ (14 dígitos) válido para ser habilitado em Partes do Transporte.');
        err.statusCode = 400;
        throw err;
    }

    const tipoDocumento = docDigits.length === 11 ? 'CPF' : 'CNPJ';
    const razaoSocial = String(
        overrides.razao_social || cli.razao_social || overrides.nome || cli.nome || ''
    ).trim().toUpperCase();

    if (!razaoSocial) {
        const err = new Error('Razão Social / Nome é obrigatório para sincronizar em Partes do Transporte.');
        err.statusCode = 400;
        throw err;
    }

    const nomeFantasia = String(
        overrides.nome_fantasia ?? cli.nome_fantasia ?? razaoSocial
    ).trim().toUpperCase();

    const cidadeInput = String(overrides.cidade ?? cli.cidade ?? '').replace(/^—$/, '').trim();
    const ufInput = normalizarUf(overrides.estado ?? cli.estado ?? 'MS') || 'MS';
    const ibgeInfo = await resolverIbgeMunicipioAsync(
        db,
        overrides.codigo_municipio || cli.codigo_municipio || '',
        cidadeInput,
        ufInput
    );

    const parsedEnd = parseEnderecoCompleto(overrides.endereco_completo ?? cli.endereco_completo);
    const logradouro = String(overrides.logradouro || cli.logradouro || parsedEnd.logradouro || 'ENDERECO NAO INFORMADO').trim().toUpperCase();
    const numero = String(overrides.numero || cli.numero || parsedEnd.numero || 'S/N').trim().toUpperCase();
    const complemento = overrides.complemento ?? cli.complemento ?? null;
    const bairro = String(overrides.bairro || cli.bairro || parsedEnd.bairro || 'CENTRO').trim().toUpperCase();
    const cepDigits = digitsOnly(overrides.cep ?? cli.cep ?? '').slice(0, 8) || null;

    const ieClean = String(overrides.inscricao_estadual ?? cli.inscricao_estadual ?? '').trim().toUpperCase() || null;
    const indicadorIe = resolveIndicadorIe(overrides.indicador_ie ?? cli.indicador_ie, ieClean);

    const telefone = String(overrides.telefone ?? cli.telefone ?? cli.celular_secundario ?? '').trim() || null;
    const email = String(overrides.email ?? cli.email ?? cli.email_financeiro ?? '').trim().toLowerCase() || null;
    const municipioFinal = (cidadeInput || ibgeInfo.nome || 'CAMPO GRANDE').toUpperCase();

    const { rows } = await db.query(
        `INSERT INTO dash_partes (
            tenant_id, documento, tipo_documento, razao_social, nome_fantasia,
            inscricao_estadual, indicador_ie, logradouro, numero, complemento,
            bairro, cep, codigo_municipio, municipio, uf, telefone, email
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (tenant_id, documento) DO UPDATE SET
            razao_social = EXCLUDED.razao_social,
            nome_fantasia = COALESCE(EXCLUDED.nome_fantasia, dash_partes.nome_fantasia),
            inscricao_estadual = COALESCE(EXCLUDED.inscricao_estadual, dash_partes.inscricao_estadual),
            indicador_ie = EXCLUDED.indicador_ie,
            logradouro = COALESCE(NULLIF(EXCLUDED.logradouro, 'ENDERECO NAO INFORMADO'), dash_partes.logradouro, EXCLUDED.logradouro),
            numero = COALESCE(NULLIF(EXCLUDED.numero, 'S/N'), dash_partes.numero, EXCLUDED.numero),
            complemento = COALESCE(EXCLUDED.complemento, dash_partes.complemento),
            bairro = COALESCE(EXCLUDED.bairro, dash_partes.bairro),
            cep = COALESCE(EXCLUDED.cep, dash_partes.cep),
            codigo_municipio = EXCLUDED.codigo_municipio,
            municipio = EXCLUDED.municipio,
            uf = EXCLUDED.uf,
            telefone = COALESCE(EXCLUDED.telefone, dash_partes.telefone),
            email = COALESCE(EXCLUDED.email, dash_partes.email),
            ativo = true,
            updated_at = NOW()
         RETURNING *`,
        [
            tenantId,
            docDigits,
            tipoDocumento,
            razaoSocial,
            nomeFantasia || null,
            ieClean,
            indicadorIe,
            logradouro,
            numero,
            complemento ? String(complemento).trim().toUpperCase() : null,
            bairro,
            cepDigits,
            ibgeInfo.codigo,
            municipioFinal,
            ibgeInfo.uf || ufInput,
            telefone,
            email,
        ]
    );

    if (cli.id && ibgeInfo.codigo && !cli.codigo_municipio) {
        await db
            .query(
                `UPDATE dash_clientes
                 SET codigo_municipio = COALESCE(codigo_municipio, $1)
                 WHERE tenant_id = $2 AND id = $3`,
                [ibgeInfo.codigo, tenantId, cli.id]
            )
            .catch(() => {});
    }

    return rows[0];
}

// GET /api/clientes/opcoes-transporte
router.get('/opcoes-transporte', async (req, res) => {
    await ensureClientesTransporteColumns();
    const tenantId = req.tenant.id;
    try {
        const [ufsRes, classRes, regTranspRes, regErpRes] = await Promise.all([
            db.query(
                `SELECT DISTINCT UPPER(TRIM(estado)) AS uf
                 FROM dash_clientes
                 WHERE tenant_id = $1
                   AND ativo = true
                   AND estado IS NOT NULL
                   AND LENGTH(TRIM(estado)) = 2
                   AND TRIM(estado) <> '—'
                 ORDER BY 1 ASC`,
                [tenantId]
            ),
            db.query(
                `SELECT DISTINCT UPPER(TRIM(classificacao)) AS nome
                 FROM dash_clientes
                 WHERE tenant_id = $1
                   AND ativo = true
                   AND classificacao IS NOT NULL
                   AND TRIM(classificacao) NOT IN ('', '—', 'ATIVO', 'INATIVO')
                 ORDER BY 1 ASC`,
                [tenantId]
            ),
            db
                .query(
                    `SELECT id, nome, cor, uf_padrao, cidades
                     FROM dash_transporte_regioes
                     WHERE tenant_id = $1 AND ativo = true
                     ORDER BY nome ASC`,
                    [tenantId]
                )
                .catch(() => ({ rows: [] })),
            db
                .query(
                    `SELECT DISTINCT UPPER(TRIM(localizacao)) AS nome
                     FROM dash_regioes
                     WHERE tenant_id = $1
                       AND localizacao IS NOT NULL
                       AND TRIM(localizacao) <> ''
                     ORDER BY 1 ASC`,
                    [tenantId]
                )
                .catch(() => ({ rows: [] })),
        ]);

        const regioesMap = new Map();
        for (const r of regTranspRes.rows || []) {
            const key = String(r.nome || '').trim().toUpperCase();
            if (!key) continue;
            regioesMap.set(key, {
                nome: String(r.nome).trim(),
                origem: 'TRANSPORTE',
                cidades: Array.isArray(r.cidades)
                    ? r.cidades.map((c) => (typeof c === 'string' ? c : c?.municipio || c?.cidade || '')).filter(Boolean)
                    : [],
            });
        }
        for (const r of regErpRes.rows || []) {
            const key = String(r.nome || '').trim().toUpperCase();
            if (key && !regioesMap.has(key)) {
                regioesMap.set(key, { nome: key, origem: 'ERP_REGIOES', cidades: [] });
            }
        }
        for (const r of classRes.rows || []) {
            const key = String(r.nome || '').trim().toUpperCase();
            if (key && !regioesMap.has(key)) {
                regioesMap.set(key, { nome: key, origem: 'CLASSIFICACAO_ERP', cidades: [] });
            }
        }

        return res.json({
            success: true,
            data: {
                ufs: (ufsRes.rows || []).map((r) => r.uf).filter(Boolean),
                regioes: Array.from(regioesMap.values()),
            },
        });
    } catch (err) {
        logger.error('[Clientes TMS] Erro em /opcoes-transporte:', err.message);
        return res.status(500).json({ error: 'Erro ao carregar filtros logísticos de clientes.' });
    }
});

// GET /api/clientes/lista?search=&limit=&offset=&tipo_entidade=&uf=&regiao=&status_fiscal=
router.get('/lista', async (req, res) => {
    await ensureClientesTransporteColumns();
    try {
        const tenantId = req.tenant.id;
        const search = req.query.search || '';
        const rawTipo = String(req.query.tipo_entidade || 'CLIENTE').toUpperCase();
        const tipoEntidade = ['CLIENTE', 'FORNECEDOR', 'TODOS'].includes(rawTipo) ? rawTipo : 'CLIENTE';
        const ufFiltro = normalizarUf(req.query.uf || '');
        const regiaoFiltro = String(req.query.regiao || '').trim();
        const statusFiscal = String(req.query.status_fiscal || 'TODOS').toUpperCase();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const where = ['c.tenant_id = $1', 'c.ativo = true'];
        const binds = [tenantId];
        let pIndex = 2;

        if (tipoEntidade === 'FORNECEDOR') {
            where.push(getFornecedorCondition('c'));
        } else if (tipoEntidade === 'CLIENTE') {
            where.push(`NOT ${getFornecedorCondition('c')}`);
        }

        if (ufFiltro) {
            where.push(`UPPER(TRIM(COALESCE(c.estado, ''))) = $${pIndex}`);
            binds.push(ufFiltro);
            pIndex++;
        }

        if (regiaoFiltro) {
            // Verifica se a região selecionada também possui cidades mapeadas em dash_transporte_regioes
            let cidadesRegiao = [];
            try {
                const regRes = await db.query(
                    `SELECT cidades FROM dash_transporte_regioes
                     WHERE tenant_id = $1 AND UPPER(TRIM(nome)) = UPPER(TRIM($2)) AND ativo = true
                     LIMIT 1`,
                    [tenantId, regiaoFiltro]
                );
                if (regRes.rows[0] && Array.isArray(regRes.rows[0].cidades)) {
                    cidadesRegiao = regRes.rows[0].cidades
                        .map((item) => String(typeof item === 'string' ? item : item?.municipio || item?.cidade || '').trim().toUpperCase())
                        .filter(Boolean);
                }
            } catch (_) {
                // fallback apenas por classificacao
            }

            if (cidadesRegiao.length > 0) {
                where.push(
                    `(UPPER(TRIM(COALESCE(c.classificacao, ''))) = UPPER(TRIM($${pIndex})) OR UPPER(TRIM(COALESCE(c.cidade, ''))) = ANY($${pIndex + 1}::text[]))`
                );
                binds.push(regiaoFiltro, cidadesRegiao);
                pIndex += 2;
            } else {
                where.push(`UPPER(TRIM(COALESCE(c.classificacao, ''))) ILIKE $${pIndex}`);
                binds.push(`%${regiaoFiltro}%`);
                pIndex++;
            }
        }

        if (statusFiscal === 'VINCULADO_PARTE') {
            where.push(`p.id IS NOT NULL`);
        } else if (statusFiscal === 'NAO_VINCULADO') {
            where.push(`p.id IS NULL`);
        } else if (statusFiscal === 'PRONTO_CTE') {
            where.push(
                `LENGTH(regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g')) IN (11, 14)
                 AND COALESCE(TRIM(c.cidade), '') NOT IN ('', '—')
                 AND LENGTH(TRIM(COALESCE(c.estado, ''))) = 2`
            );
        } else if (statusFiscal === 'PENDENTE_FISCAL') {
            where.push(
                `(LENGTH(regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g')) NOT IN (11, 14)
                  OR COALESCE(TRIM(c.cidade), '') IN ('', '—')
                  OR LENGTH(TRIM(COALESCE(c.estado, ''))) <> 2)`
            );
        }

        pIndex = applySuperBuscaFilter(search, pIndex, where, binds);
        const whereClause = where.join(' AND ');

        const joinPartesSql = `
            FROM dash_clientes c
            LEFT JOIN LATERAL (
                SELECT dp.id, dp.inscricao_estadual, dp.indicador_ie, dp.codigo_municipio, dp.municipio, dp.uf
                FROM dash_partes dp
                WHERE dp.tenant_id = c.tenant_id
                  AND dp.ativo = true
                  AND LENGTH(regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g')) IN (11, 14)
                  AND dp.documento = regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g')
                ORDER BY dp.updated_at DESC NULLS LAST, dp.id DESC
                LIMIT 1
            ) p ON TRUE
        `;

        const countResult = await db.query(
            `SELECT COUNT(*)::int AS total ${joinPartesSql} WHERE ${whereClause}`,
            binds
        );
        const total = countResult.rows[0]?.total || 0;

        const listBinds = [...binds, tipoEntidade, limit, offset];
        const tipoParamIdx = pIndex;
        const limitParamIdx = pIndex + 1;
        const offsetParamIdx = pIndex + 2;

        const { rows } = await db.query(
            `SELECT
                c.id,
                c.id_firebird,
                c.nome,
                COALESCE(c.razao_social, c.nome) AS razao_social,
                COALESCE(c.nome_fantasia, c.nome) AS nome_fantasia,
                COALESCE(c.classe, 'GERAL') AS classe,
                c.documento,
                c.inscricao_estadual,
                c.indicador_ie,
                c.email,
                c.email_financeiro,
                c.telefone,
                c.celular_secundario,
                c.cidade,
                c.estado,
                c.cep,
                c.logradouro,
                c.numero,
                c.complemento,
                c.bairro,
                c.codigo_municipio,
                c.endereco_completo,
                c.classificacao,
                c.tipo_cliente,
                c.regime_tributario,
                c.responsavel_nome,
                c.observacoes,
                c.ativo,
                c.data_cadastro,
                p.id AS parte_id,
                p.inscricao_estadual AS parte_ie,
                p.indicador_ie AS parte_indicador_ie,
                p.codigo_municipio AS parte_codigo_municipio,
                p.municipio AS parte_municipio,
                p.uf AS parte_uf,
                CASE
                    WHEN $${tipoParamIdx}::text = 'TODOS' THEN
                        CASE WHEN ${getFornecedorCondition('c')} THEN 'FORNECEDOR' ELSE 'CLIENTE' END
                    ELSE $${tipoParamIdx}::text
                END AS tipo_entidade
             ${joinPartesSql}
             WHERE ${whereClause}
             ORDER BY c.nome ASC
             LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
            listBinds
        );

        const enriched = rows.map(enrichClienteTransporteRow);

        return res.json({ data: enriched, total, limit, offset });
    } catch (err) {
        logger.error('Erro em /api/clientes/lista:', err.message);
        return res.status(500).json({ error: 'Erro ao listar clientes do ERP.' });
    }
});

// GET /api/clientes/kpis
router.get('/kpis', async (req, res) => {
    await ensureClientesTransporteColumns();
    try {
        const tenantId = req.tenant.id;
        const { from, to } = getPeriodRange(req.query);

        const [clientesStats, partesCountRes, cargasPendRes, regioesRes] = await Promise.all([
            db.query(
                `SELECT
                    COUNT(*) FILTER (WHERE NOT ${getFornecedorCondition('c')})::int AS total_clientes,
                    COUNT(*) FILTER (WHERE ${getFornecedorCondition('c')})::int AS total_fornecedores,
                    COUNT(*) FILTER (
                        WHERE NOT ${getFornecedorCondition('c')}
                          AND LENGTH(regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g')) IN (11, 14)
                          AND COALESCE(TRIM(c.cidade), '') NOT IN ('', '—')
                          AND LENGTH(TRIM(COALESCE(c.estado, ''))) = 2
                    )::int AS prontos_cte,
                    COUNT(*) FILTER (
                        WHERE NOT ${getFornecedorCondition('c')}
                          AND COALESCE(TRIM(c.inscricao_estadual), '') <> ''
                    )::int AS com_ie_direta
                 FROM dash_clientes c
                 WHERE c.tenant_id = $1 AND c.ativo = true`,
                [tenantId]
            ),
            db
                .query(
                    `SELECT COUNT(DISTINCT dp.documento)::int AS vinculados_partes
                     FROM dash_partes dp
                     INNER JOIN dash_clientes c
                       ON c.tenant_id = dp.tenant_id
                      AND c.ativo = true
                      AND dp.documento = regexp_replace(COALESCE(c.documento, ''), '\\D', '', 'g')
                     WHERE dp.tenant_id = $1 AND dp.ativo = true`,
                    [tenantId]
                )
                .catch(() => ({ rows: [{ vinculados_partes: 0 }] })),
            db
                .query(
                    `SELECT COUNT(*)::int AS cargas_pendentes
                     FROM dash_cargas
                     WHERE tenant_id = $1 AND status = 'PENDENTE'`,
                    [tenantId]
                )
                .catch(() => ({ rows: [{ cargas_pendentes: 0 }] })),
            db
                .query(
                    `SELECT COUNT(DISTINCT reg)::int AS total_regioes FROM (
                        SELECT UPPER(TRIM(nome)) AS reg FROM dash_transporte_regioes WHERE tenant_id = $1 AND ativo = true
                        UNION
                        SELECT UPPER(TRIM(classificacao)) AS reg FROM dash_clientes
                        WHERE tenant_id = $1 AND ativo = true
                          AND classificacao IS NOT NULL
                          AND TRIM(classificacao) NOT IN ('', '—', 'ATIVO', 'INATIVO')
                     ) t`,
                    [tenantId]
                )
                .catch(() => ({ rows: [{ total_regioes: 0 }] })),
        ]);

        const st = clientesStats.rows[0] || {};
        return res.json({
            period: { from, to },
            kpis: {
                total_clientes: st.total_clientes || 0,
                total_fornecedores: st.total_fornecedores || 0,
                prontos_cte: st.prontos_cte || 0,
                vinculados_partes: partesCountRes.rows[0]?.vinculados_partes || 0,
                cargas_pendentes: cargasPendRes.rows[0]?.cargas_pendentes || 0,
                regioes_ativas: regioesRes.rows[0]?.total_regioes || 0,
                clientes_ativos_periodo: st.total_clientes || 0,
            },
        });
    } catch (err) {
        logger.error('Erro em /api/clientes/kpis:', err.message);
        return res.json({
            period: { from: '', to: '' },
            kpis: {
                total_clientes: 0,
                total_fornecedores: 0,
                prontos_cte: 0,
                vinculados_partes: 0,
                cargas_pendentes: 0,
                regioes_ativas: 0,
                clientes_ativos_periodo: 0,
            },
        });
    }
});

// GET /api/clientes/:id/ficha-transporte — Ficha Logística Nativa do Coliseu Transporte
router.get('/:id/ficha-transporte', async (req, res) => {
    await ensureClientesTransporteColumns();
    try {
        if (!canViewClienteFicha(req)) {
            return res.status(403).json({
                error: 'Permissão insuficiente para visualizar a ficha logística do cliente.',
                code: 'FORBIDDEN_ACTION',
            });
        }

        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        if (!Number.isFinite(clientId) || clientId <= 0) {
            return res.status(400).json({ error: 'ID de cliente inválido.' });
        }

        const cliRes = await db.query(
            `SELECT c.*
             FROM dash_clientes c
             WHERE c.tenant_id = $1 AND (c.id = $2 OR c.id_firebird = $2)
             ORDER BY CASE WHEN c.id = $2 THEN 0 ELSE 1 END
             LIMIT 1`,
            [tenantId, clientId]
        );

        if (cliRes.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const rawCli = cliRes.rows[0];
        const docDigits = digitsOnly(rawCli.documento);
        const fbId = rawCli.id_firebird ? parseInt(rawCli.id_firebird, 10) : null;

        // 1. Parte vinculada em dash_partes
        let parteVinculada = null;
        if (docDigits.length === 11 || docDigits.length === 14) {
            const parteRes = await db
                .query(
                    `SELECT * FROM dash_partes
                     WHERE tenant_id = $1 AND documento = $2 AND ativo = true
                     LIMIT 1`,
                    [tenantId, docDigits]
                )
                .catch(() => ({ rows: [] }));
            parteVinculada = parteRes.rows[0] || null;
        }

        const clienteEnriquecido = enrichClienteTransporteRow({
            ...rawCli,
            parte_id: parteVinculada?.id || null,
            parte_ie: parteVinculada?.inscricao_estadual || null,
            parte_indicador_ie: parteVinculada?.indicador_ie || null,
            parte_codigo_municipio: parteVinculada?.codigo_municipio || null,
            parte_municipio: parteVinculada?.municipio || null,
            parte_uf: parteVinculada?.uf || null,
        });

        // 2. Histórico de NF-es / Cargas do ERP (dash_cargas) vinculadas ao documento ou id_firebird do cliente
        let cargas = [];
        if (docDigits.length >= 11 || fbId) {
            const cgConds = [];
            const cgBinds = [tenantId];
            if (docDigits.length >= 11) {
                cgBinds.push(docDigits);
                const idx = cgBinds.length;
                cgConds.push(
                    `regexp_replace(COALESCE(cg.destinatario_documento, ''), '\\D', '', 'g') = $${idx}`,
                    `regexp_replace(COALESCE(cg.remetente_documento, ''), '\\D', '', 'g') = $${idx}`
                );
            }
            if (fbId) {
                cgBinds.push(fbId);
                const idx = cgBinds.length;
                cgConds.push(`cg.cliente_id_firebird = $${idx}`);
            }

            const cargasRes = await db
                .query(
                    `SELECT
                        cg.id,
                        cg.tipo_documento,
                        COALESCE(cg.modelo_documento, '55') AS modelo_documento,
                        cg.numero,
                        cg.serie,
                        cg.chave_acesso,
                        cg.data_emissao,
                        cg.remetente_nome,
                        cg.destinatario_nome,
                        cg.destinatario_municipio,
                        cg.destinatario_uf,
                        cg.valor_total,
                        cg.peso_bruto,
                        cg.volumes,
                        cg.produto_predominante,
                        cg.regiao_nome,
                        cg.status,
                        cg.created_at
                     FROM dash_cargas cg
                     WHERE cg.tenant_id = $1
                       AND (${cgConds.join(' OR ')})
                     ORDER BY COALESCE(cg.data_emissao::timestamptz, cg.created_at) DESC, cg.id DESC
                     LIMIT 30`,
                    cgBinds
                )
                .catch(() => ({ rows: [] }));
            cargas = cargasRes.rows || [];
        }

        // 3. Histórico de CT-es (dash_ctes) onde o cliente figura como Remetente, Destinatário ou Tomador
        let ctes = [];
        if (docDigits.length >= 11) {
            const ctesRes = await db
                .query(
                    `SELECT
                        ct.id,
                        ct.numero,
                        ct.serie,
                        ct.chave_cte,
                        ct.status,
                        ct.status_sefaz,
                        ct.uf_inicio,
                        ct.municipio_inicio,
                        ct.uf_fim,
                        ct.municipio_fim,
                        ct.valor_total,
                        ct.valor_carga,
                        ct.peso_bruto,
                        ct.caminho_dacte,
                        ct.caminho_xml,
                        ct.created_at,
                        CASE
                            WHEN regexp_replace(COALESCE(ct.tomador_documento, ct.tomador_dados->>'documento', ct.tomador_dados->>'cnpj', ''), '\\D', '', 'g') = $2 THEN 'TOMADOR'
                            WHEN regexp_replace(COALESCE(ct.destinatario_dados->>'documento', ct.destinatario_dados->>'cnpj', ct.destinatario_dados->>'cpf', ''), '\\D', '', 'g') = $2 THEN 'DESTINATARIO'
                            ELSE 'REMETENTE'
                        END AS papel_cliente
                     FROM dash_ctes ct
                     WHERE ct.tenant_id = $1
                       AND (
                           regexp_replace(COALESCE(ct.tomador_documento, ''), '\\D', '', 'g') = $2
                           OR regexp_replace(COALESCE(ct.remetente_dados->>'documento', ct.remetente_dados->>'cnpj', ct.remetente_dados->>'cpf', ''), '\\D', '', 'g') = $2
                           OR regexp_replace(COALESCE(ct.destinatario_dados->>'documento', ct.destinatario_dados->>'cnpj', ct.destinatario_dados->>'cpf', ''), '\\D', '', 'g') = $2
                           OR regexp_replace(COALESCE(ct.tomador_dados->>'documento', ct.tomador_dados->>'cnpj', ct.tomador_dados->>'cpf', ''), '\\D', '', 'g') = $2
                       )
                     ORDER BY ct.created_at DESC, ct.id DESC
                     LIMIT 30`,
                    [tenantId, docDigits]
                )
                .catch(() => ({ rows: [] }));
            ctes = ctesRes.rows || [];
        }

        // 4. Histórico de Roteiros de Entrega & Canhotos POD (dash_roteiro_pontos)
        let entregas = [];
        const chavesCargas = cargas.map((c) => c.chave_acesso).filter(Boolean);
        if (docDigits.length >= 11 || chavesCargas.length > 0) {
            const entConds = [];
            const entBinds = [tenantId];
            if (docDigits.length >= 11) {
                entBinds.push(docDigits);
                entConds.push(`regexp_replace(COALESCE(rp.documento_cliente, ''), '\\D', '', 'g') = $${entBinds.length}`);
            }
            if (chavesCargas.length > 0) {
                entBinds.push(chavesCargas);
                entConds.push(`rp.documento_chave = ANY($${entBinds.length}::text[])`);
            }

            const entregasRes = await db
                .query(
                    `SELECT
                        rp.id,
                        rp.roteiro_id,
                        rp.ordem_entrega,
                        rp.documento_tipo,
                        rp.documento_chave,
                        rp.cliente_nome,
                        rp.municipio,
                        rp.uf,
                        rp.peso_kg,
                        rp.valor_produtos,
                        rp.status_entrega,
                        rp.entregue_em,
                        rp.recebedor_nome,
                        rp.recebedor_documento,
                        rp.observacao,
                        (rp.canhoto_base64 IS NOT NULL AND LENGTH(rp.canhoto_base64) > 20) AS possui_canhoto
                     FROM dash_roteiro_pontos rp
                     WHERE rp.tenant_id = $1
                       AND (${entConds.join(' OR ')})
                     ORDER BY COALESCE(rp.entregue_em, rp.created_at) DESC NULLS LAST, rp.id DESC
                     LIMIT 20`,
                    entBinds
                )
                .catch(() => ({ rows: [] }));
            entregas = entregasRes.rows || [];
        }

        const valorMovimentadoCargas = cargas.reduce((acc, c) => acc + parseFloat(c.valor_total || 0), 0);
        const pesoTotalCargas = cargas.reduce((acc, c) => acc + parseFloat(c.peso_bruto || 0), 0);
        const freteTotalCtes = ctes
            .filter((c) => c.status !== 'CANCELADO' && c.status !== 'REJEITADO')
            .reduce((acc, c) => acc + parseFloat(c.valor_total || 0), 0);

        return res.json({
            success: true,
            data: {
                cliente: clienteEnriquecido,
                parte_vinculada: parteVinculada,
                resumo_logistico: {
                    total_cargas: cargas.length,
                    cargas_pendentes: cargas.filter((c) => c.status === 'PENDENTE').length,
                    valor_movimentado_cargas: Number(valorMovimentadoCargas.toFixed(2)),
                    peso_total_kg: Number(pesoTotalCargas.toFixed(3)),
                    total_ctes: ctes.length,
                    ctes_autorizados: ctes.filter((c) => c.status === 'AUTORIZADO').length,
                    frete_total_ctes: Number(freteTotalCtes.toFixed(2)),
                    total_entregas: entregas.length,
                    entregas_concluidas: entregas.filter((e) => e.status_entrega === 'ENTREGUE').length,
                    canhotos_assinados: entregas.filter((e) => e.possui_canhoto).length,
                },
                cargas,
                ctes,
                entregas,
            },
        });
    } catch (err) {
        logger.error('[Clientes TMS] Erro em /:id/ficha-transporte:', err.message);
        return res.status(500).json({ error: 'Erro interno ao carregar a ficha logística do cliente.' });
    }
});

// POST /api/clientes/:id/sincronizar-parte — Habilita/atualiza cliente em Partes do Transporte (1-clique)
router.post('/:id/sincronizar-parte', async (req, res) => {
    await ensureClientesTransporteColumns();
    try {
        if (!canManageClientes(req)) {
            return res.status(403).json({
                error: 'Permissão insuficiente para sincronizar partes do transporte.',
                code: 'FORBIDDEN_ACTION',
            });
        }

        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        if (!Number.isFinite(clientId) || clientId <= 0) {
            return res.status(400).json({ error: 'ID de cliente inválido.' });
        }

        const cliRes = await db.query(
            `SELECT * FROM dash_clientes WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
            [tenantId, clientId]
        );
        if (cliRes.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const parte = await upsertParteTransporteFromCliente(tenantId, cliRes.rows[0], req.body || {});
        return res.json({
            success: true,
            message: 'Cliente habilitado e sincronizado em Partes do Transporte com código IBGE validado.',
            data: parte,
        });
    } catch (err) {
        if (err.statusCode === 400) {
            return res.status(400).json({ error: err.message });
        }
        logger.error('[Clientes TMS] Erro em /:id/sincronizar-parte:', err.message);
        return res.status(500).json({ error: 'Erro interno ao sincronizar cliente com Partes do Transporte.' });
    }
});

// POST /api/clientes/sincronizar-partes-lote — Habilita múltiplos clientes do ERP em Partes do Transporte
router.post('/sincronizar-partes-lote', async (req, res) => {
    await ensureClientesTransporteColumns();
    try {
        if (!canManageClientes(req)) {
            return res.status(403).json({
                error: 'Permissão insuficiente para sincronizar partes do transporte.',
                code: 'FORBIDDEN_ACTION',
            });
        }

        const tenantId = req.tenant.id;
        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
        const ids = rawIds
            .map((x) => parseInt(x, 10))
            .filter((x) => Number.isFinite(x) && x > 0)
            .slice(0, 200);

        if (ids.length === 0) {
            return res.status(400).json({ error: 'Selecione ao menos um cliente para sincronizar.' });
        }

        const { rows } = await db.query(
            `SELECT * FROM dash_clientes WHERE tenant_id = $1 AND id = ANY($2::int[])`,
            [tenantId, ids]
        );

        let sincronizados = 0;
        const ignorados = [];

        for (const cli of rows) {
            try {
                await upsertParteTransporteFromCliente(tenantId, cli);
                sincronizados++;
            } catch (itemErr) {
                ignorados.push({
                    id: cli.id,
                    nome: cli.nome,
                    motivo: itemErr.message,
                });
            }
        }

        return res.json({
            success: true,
            data: {
                solicitados: ids.length,
                sincronizados,
                ignorados,
            },
        });
    } catch (err) {
        logger.error('[Clientes TMS] Erro em /sincronizar-partes-lote:', err.message);
        return res.status(500).json({ error: 'Erro interno ao sincronizar clientes em lote.' });
    }
});

// POST /api/clientes — Cadastra cliente no Transporte, enfileira sync para ERP Firebird e (opcionalmente) habilita em Partes
router.post('/', async (req, res, next) => {
    await ensureClientesTransporteColumns();
    try {
        if (!canManageClientes(req)) {
            return res.status(403).json({
                error: 'Permissão insuficiente para cadastrar clientes.',
                code: 'FORBIDDEN_ACTION',
            });
        }

        const tenantId = req.tenant.id;
        const {
            nome,
            razao_social,
            nome_fantasia,
            documento,
            inscricao_estadual,
            indicador_ie,
            email,
            telefone,
            cidade,
            estado,
            cep,
            logradouro,
            numero,
            complemento,
            bairro,
            codigo_municipio,
            classificacao,
            classe,
            tipo_cliente,
            responsavel_nome,
            responsavel_rg,
            responsavel_cpf,
            email_financeiro,
            celular_secundario,
            regime_tributario,
            endereco_completo,
            observacoes,
            sincronizar_parte = true,
        } = req.body || {};

        const nomeFinal = String(nome || razao_social || '').trim().toUpperCase();
        if (!nomeFinal) {
            return res.status(400).json({ error: 'Razão Social / Nome é obrigatório.' });
        }

        const formattedDoc = formatCpfCnpj(documento);
        const ufNorm = normalizarUf(estado || '') || (estado ? String(estado).trim().toUpperCase().slice(0, 2) : '—');
        const cidadeClean = cidade ? String(cidade).trim().toUpperCase() : '—';
        const ibgeResolvido =
            cidadeClean !== '—' && ufNorm.length === 2
                ? (await resolverIbgeMunicipioAsync(db, codigo_municipio, cidadeClean, ufNorm)).codigo
                : digitsOnly(codigo_municipio) || null;

        const ieClean = inscricao_estadual ? String(inscricao_estadual).trim().toUpperCase() : null;
        const indicadorIeClean = resolveIndicadorIe(indicador_ie, ieClean);
        const enderecoFinal = composeEnderecoCompleto({
            logradouro,
            numero,
            complemento,
            bairro,
            endereco_completo,
        });

        const { rows } = await db.query(
            `INSERT INTO dash_clientes (
                tenant_id, id_firebird, nome, razao_social, nome_fantasia, documento,
                inscricao_estadual, indicador_ie, email, telefone, cidade, estado,
                cep, logradouro, numero, complemento, bairro, codigo_municipio,
                classificacao, classe, ativo, responsavel_nome, responsavel_rg, responsavel_cpf,
                email_financeiro, celular_secundario, regime_tributario, endereco_completo, tipo_cliente, observacoes
             )
             VALUES (
                $1, NULL, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17,
                $18, $19, true, $20, $21, $22,
                $23, $24, $25, $26, $27, $28
             )
             RETURNING *`,
            [
                tenantId,
                nomeFinal,
                razao_social ? String(razao_social).trim().toUpperCase() : nomeFinal,
                nome_fantasia ? String(nome_fantasia).trim().toUpperCase() : null,
                formattedDoc || null,
                ieClean,
                indicadorIeClean,
                email ? String(email).trim().toLowerCase() : null,
                telefone || null,
                cidadeClean,
                ufNorm,
                digitsOnly(cep).slice(0, 8) || null,
                logradouro ? String(logradouro).trim().toUpperCase() : null,
                numero ? String(numero).trim().toUpperCase() : null,
                complemento ? String(complemento).trim().toUpperCase() : null,
                bairro ? String(bairro).trim().toUpperCase() : null,
                ibgeResolvido,
                classificacao ? String(classificacao).trim().toUpperCase() : 'ATIVO',
                classe ? String(classe).trim().toUpperCase() : 'GERAL',
                responsavel_nome ? String(responsavel_nome).trim().toUpperCase() : null,
                responsavel_rg || null,
                responsavel_cpf || null,
                email_financeiro ? String(email_financeiro).trim().toLowerCase() : null,
                celular_secundario || null,
                regime_tributario ? String(regime_tributario).trim().toUpperCase() : null,
                enderecoFinal,
                tipo_cliente ? String(tipo_cliente).trim().toUpperCase() : 'CLIENTE',
                observacoes ? String(observacoes).trim().toUpperCase() : null,
            ]
        );

        const novoCliente = rows[0];

        // Mantém sincronização bidirecional para o Worker C# cadastrar no ERP Firebird
        await db
            .query(
                `INSERT INTO dash_sync_metadata (tenant_id, tabela, operacao, payload, status, created_at)
                 VALUES ($1, 'CLIENTES', 'INSERT', $2::jsonb, 'PENDENTE', NOW())`,
                [
                    tenantId,
                    JSON.stringify({
                        id_nexus: novoCliente.id,
                        nome: novoCliente.nome,
                        razao_social: novoCliente.razao_social,
                        nome_fantasia: novoCliente.nome_fantasia,
                        documento: formattedDoc,
                        cpf_cnpj: formattedDoc,
                        cliente_documento: formattedDoc,
                        documento_formatado: formattedDoc,
                        documento_limpo: digitsOnly(documento),
                        inscricao_estadual: novoCliente.inscricao_estadual,
                        email: novoCliente.email,
                        email_financeiro: novoCliente.email_financeiro,
                        telefone: novoCliente.telefone,
                        celular_secundario: novoCliente.celular_secundario,
                        cidade: novoCliente.cidade,
                        estado: novoCliente.estado,
                        cep: novoCliente.cep,
                        codigo_municipio: novoCliente.codigo_municipio,
                        endereco_completo: novoCliente.endereco_completo,
                        origem: 'TRANSPORTE',
                        criado_em: new Date().toISOString(),
                    }),
                ]
            )
            .catch((e) => {
                logger.warn('[Sync] Falha ao enfileirar cliente para ERP:', e.message);
            });

        let parteSincronizada = null;
        if (sincronizar_parte && [11, 14].includes(digitsOnly(documento).length)) {
            parteSincronizada = await upsertParteTransporteFromCliente(tenantId, novoCliente).catch(() => null);
        }

        return res.status(201).json({ data: novoCliente, parte: parteSincronizada });
    } catch (err) {
        return next(err);
    }
});

// PUT /api/clientes/:id — Atualiza dados fiscais/região, enfileira sync ERP Firebird e (opcionalmente) atualiza Partes
router.put('/:id', async (req, res, next) => {
    await ensureClientesTransporteColumns();
    try {
        if (!canManageClientes(req)) {
            return res.status(403).json({
                error: 'Permissão insuficiente para editar clientes.',
                code: 'FORBIDDEN_ACTION',
            });
        }

        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        if (!Number.isFinite(clientId) || clientId <= 0) {
            return res.status(400).json({ error: 'ID de cliente inválido.' });
        }

        const {
            nome,
            razao_social,
            nome_fantasia,
            documento,
            inscricao_estadual,
            indicador_ie,
            email,
            telefone,
            cidade,
            estado,
            cep,
            logradouro,
            numero,
            complemento,
            bairro,
            codigo_municipio,
            classificacao,
            classe,
            tipo_cliente,
            responsavel_nome,
            responsavel_rg,
            responsavel_cpf,
            email_financeiro,
            celular_secundario,
            regime_tributario,
            endereco_completo,
            observacoes,
            sincronizar_parte = true,
        } = req.body || {};

        const nomeFinal = String(nome || razao_social || '').trim().toUpperCase();
        if (!nomeFinal) {
            return res.status(400).json({ error: 'Razão Social / Nome é obrigatório.' });
        }

        const formattedDoc = formatCpfCnpj(documento);
        const ufNorm = normalizarUf(estado || '') || (estado ? String(estado).trim().toUpperCase().slice(0, 2) : '—');
        const cidadeClean = cidade ? String(cidade).trim().toUpperCase() : '—';
        const ibgeResolvido =
            cidadeClean !== '—' && ufNorm.length === 2
                ? (await resolverIbgeMunicipioAsync(db, codigo_municipio, cidadeClean, ufNorm)).codigo
                : digitsOnly(codigo_municipio) || null;

        const ieClean = inscricao_estadual !== undefined
            ? (String(inscricao_estadual).trim().toUpperCase() || null)
            : null;
        const indicadorIeClean = resolveIndicadorIe(indicador_ie, ieClean);
        const enderecoFinal = composeEnderecoCompleto({
            logradouro,
            numero,
            complemento,
            bairro,
            endereco_completo,
        });

        const { rows, rowCount } = await db.query(
            `UPDATE dash_clientes
             SET nome = $1,
                 razao_social = $2,
                 nome_fantasia = $3,
                 documento = $4,
                 inscricao_estadual = $5,
                 indicador_ie = $6,
                 email = $7,
                 telefone = $8,
                 cidade = $9,
                 estado = $10,
                 cep = $11,
                 logradouro = $12,
                 numero = $13,
                 complemento = $14,
                 bairro = $15,
                 codigo_municipio = $16,
                 classificacao = $17,
                 classe = COALESCE($18, classe),
                 responsavel_nome = $19,
                 responsavel_rg = $20,
                 responsavel_cpf = $21,
                 email_financeiro = $22,
                 celular_secundario = $23,
                 regime_tributario = $24,
                 endereco_completo = $25,
                 tipo_cliente = $26,
                 observacoes = $27,
                 data_cadastro = COALESCE(data_cadastro, NOW())
             WHERE tenant_id = $28 AND id = $29
             RETURNING *`,
            [
                nomeFinal,
                razao_social ? String(razao_social).trim().toUpperCase() : nomeFinal,
                nome_fantasia ? String(nome_fantasia).trim().toUpperCase() : null,
                formattedDoc || null,
                ieClean,
                indicadorIeClean,
                email ? String(email).trim().toLowerCase() : null,
                telefone || null,
                cidadeClean,
                ufNorm,
                digitsOnly(cep).slice(0, 8) || null,
                logradouro ? String(logradouro).trim().toUpperCase() : null,
                numero ? String(numero).trim().toUpperCase() : null,
                complemento ? String(complemento).trim().toUpperCase() : null,
                bairro ? String(bairro).trim().toUpperCase() : null,
                ibgeResolvido,
                classificacao ? String(classificacao).trim().toUpperCase() : 'ATIVO',
                classe ? String(classe).trim().toUpperCase() : null,
                responsavel_nome ? String(responsavel_nome).trim().toUpperCase() : null,
                responsavel_rg || null,
                responsavel_cpf || null,
                email_financeiro ? String(email_financeiro).trim().toLowerCase() : null,
                celular_secundario || null,
                regime_tributario ? String(regime_tributario).trim().toUpperCase() : null,
                enderecoFinal,
                tipo_cliente ? String(tipo_cliente).trim().toUpperCase() : 'CLIENTE',
                observacoes ? String(observacoes).trim().toUpperCase() : null,
                tenantId,
                clientId,
            ]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const clienteAtualizado = rows[0];

        // Enfileira alteração para o Worker C# atualizar no ERP Firebird
        await db
            .query(
                `INSERT INTO dash_sync_metadata (tenant_id, tabela, operacao, payload, status, created_at)
                 VALUES ($1, 'CLIENTES', 'UPDATE', $2::jsonb, 'PENDENTE', NOW())`,
                [
                    tenantId,
                    JSON.stringify({
                        id_nexus: clienteAtualizado.id,
                        id_firebird: clienteAtualizado.id_firebird || null,
                        nome: clienteAtualizado.nome,
                        razao_social: clienteAtualizado.razao_social,
                        nome_fantasia: clienteAtualizado.nome_fantasia,
                        documento: formattedDoc,
                        cpf_cnpj: formattedDoc,
                        cliente_documento: formattedDoc,
                        documento_formatado: formattedDoc,
                        documento_limpo: digitsOnly(documento),
                        inscricao_estadual: clienteAtualizado.inscricao_estadual,
                        email: clienteAtualizado.email,
                        email_financeiro: clienteAtualizado.email_financeiro,
                        telefone: clienteAtualizado.telefone,
                        celular_secundario: clienteAtualizado.celular_secundario,
                        cidade: clienteAtualizado.cidade,
                        estado: clienteAtualizado.estado,
                        cep: clienteAtualizado.cep,
                        codigo_municipio: clienteAtualizado.codigo_municipio,
                        endereco_completo: clienteAtualizado.endereco_completo,
                        origem: 'TRANSPORTE',
                        alterado_em: new Date().toISOString(),
                    }),
                ]
            )
            .catch((e) => {
                logger.warn('[Sync] Falha ao enfileirar atualização de cliente para ERP:', e.message);
            });

        let parteSincronizada = null;
        if (sincronizar_parte && [11, 14].includes(digitsOnly(clienteAtualizado.documento).length)) {
            parteSincronizada = await upsertParteTransporteFromCliente(tenantId, clienteAtualizado).catch(() => null);
        }

        return res.json({ data: clienteAtualizado, parte: parteSincronizada });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
