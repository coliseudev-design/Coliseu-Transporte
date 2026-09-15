'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');

/**
 * Helper: constrói o fragmento SQL de filtro de departamento.
 * Retorna { clause, params } para injeção segura nas queries.
 *
 * @param {string|number|null} deptoId  - valor de req.query.depto_id
 * @param {number} nextParamIndex       - índice do próximo $N disponível
 * @param {string} alias                - alias da tabela (ex: 'v', 'f', 'c')
 * @returns {{ clause: string, params: any[] }}
 */
function buildDeptoFilter(deptoId, nextParamIndex, alias = 'v') {
    if (!deptoId || deptoId === 'todas' || deptoId === 'all') {
        return { clause: '', params: [] };
    }
    const num = parseInt(deptoId, 10);
    if (isNaN(num)) return { clause: '', params: [] };
    return {
        clause: ` AND (${alias}.depto_id = $${nextParamIndex} OR ${alias}.depto_id IS NULL)`,
        params: [num]
    };
}

function buildCentroCustoFilter(centroCustoId, nextParamIndex, alias = 'f') {
    if (!centroCustoId || centroCustoId === 'todas' || centroCustoId === 'all') {
        return { clause: '', params: [] };
    }
    const num = parseInt(centroCustoId, 10);
    if (isNaN(num)) return { clause: '', params: [] };
    return {
        clause: ` AND (${alias}.centro_custo = $${nextParamIndex} OR ${alias}.centro_custo IS NULL)`,
        params: [num]
    };
}

function buildVendedorFilter(vendedorId, nextParamIndex, alias = 'v') {
    if (!vendedorId || vendedorId === 'todos' || vendedorId === 'all' || vendedorId === 'undefined' || vendedorId === 'null') {
        return { clause: '', params: [] };
    }
    const num = parseInt(vendedorId, 10);
    if (isNaN(num)) return { clause: '', params: [] };
    return {
        clause: ` AND ${alias}.vendedor_id_firebird = $${nextParamIndex}`,
        params: [num]
    };
}

function buildCidadeFilter(cidade, nextParamIndex, alias = 'c') {
    if (!cidade || cidade === 'todas' || cidade === 'all' || cidade === 'undefined' || cidade === 'null' || cidade.toUpperCase() === 'TODOS') {
        return { clause: '', params: [] };
    }
    return {
        clause: ` AND UPPER(TRIM(${alias}.cidade)) = UPPER(TRIM($${nextParamIndex}))`,
        params: [cidade]
    };
}

// ----------------------------------------------------------------
// GET /api/filiais  →  Lista filiais do tenant
// ----------------------------------------------------------------
router.get('/', async (req, res, next) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: 'Tenant não autenticado.' });

    try {
        let syncDebugInfo = null;
        let identityUrlUsed = '';

        // 1) Sincroniza filiais do Identity Server para este tenant
        try {
            const config = require('../config/env');
            const identityUrl = config.security?.identityApiUrl || process.env.IDENTITY_API_URL || 'https://adminlicencas.coliseusistemas.com.br';
            identityUrlUsed = identityUrl;
            const internalKey = config.security?.identityInternalKey || process.env.IDENTITY_INTERNAL_KEY || 'Nexus2026!IdentitySuperSecretKeyOauth20';

            const resp = await fetch(`${identityUrl}/internal/companies/${tenantId}/branches`, {
                headers: { 'x-internal-api-key': internalKey },
                signal: AbortSignal.timeout(5000),
            });

            if (resp.ok) {
                const branches = await resp.json();
                const validBranches = branches.filter(b => b.erpDeptoPadrao != null);
                
                for (const b of validBranches) {
                    await db.query(
                        `INSERT INTO dash_filiais (tenant_id, empresa_erp, depto_id, centro_custo, nome, documento, is_default, ativo, sincronizado_em)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW())
                         ON CONFLICT (tenant_id, depto_id) DO UPDATE
                         SET empresa_erp=$2, centro_custo=$4, nome=$5, documento=$6, is_default=$7, ativo=true, sincronizado_em=NOW()`,
                        [tenantId, b.erpEmpresaId || 1, b.erpDeptoPadrao, b.erpCentroPadrao || null, b.name, b.cnpj || null, b.isDefault || false]
                    );
                }
            } else {
                syncDebugInfo = `HTTP ${resp.status} - ${await resp.text().catch(()=>'')}`;
                logger.warn(`[Filiais] Falha no sync com Identity Server (HTTP ${resp.status}) para tenant ${tenantId}`);
            }
        } catch (syncErr) {
            syncDebugInfo = syncErr.message;
            logger.warn(`[Filiais] Erro ao sincronizar filiais do Identity Server: ${syncErr.message}`);
        }

        // 2) Retorna as filiais atualizadas
        const { rows } = await db.query(
            `SELECT id, empresa_erp, depto_id, centro_custo, nome, documento, is_default, ativo
             FROM dash_filiais
             WHERE tenant_id = $1 AND ativo = true
             ORDER BY is_default DESC, nome ASC`,
            [tenantId]
        );

        if (rows.length === 0) {
            rows.push({
                id: 9999,
                empresa_erp: 99,
                depto_id: 9999,
                centro_custo: null,
                nome: `DEBUG T:${tenantId.substring(0,8)} | ${syncDebugInfo ? syncDebugInfo.substring(0, 40) : '200 OK (Vazio)'}`,
                documento: identityUrlUsed,
                is_default: false,
                ativo: true
            });
        }

        res.json({ filiais: rows, _debug: syncDebugInfo });
    } catch (err) {
        logger.error('[Filiais] Erro ao listar filiais:', err.message);
        next(err);
    }
});

// ----------------------------------------------------------------
// POST /api/sync/dash_filiais  →  Aceito pelo sync.js via Worker
// (Rota de leitura alternativa para o admin do tenant)
// ----------------------------------------------------------------
router.get('/check/:deptoId', async (req, res, next) => {
    const tenantId = req.tenant?.id;
    const deptoId = parseInt(req.params.deptoId, 10);
    if (!tenantId) return res.status(401).json({ error: 'Tenant não autenticado.' });

    try {
        const { rows } = await db.query(
            `SELECT EXISTS(
                SELECT 1 FROM dash_filiais
                WHERE tenant_id = $1 AND depto_id = $2 AND ativo = true
             ) AS tem_acesso`,
            [tenantId, deptoId]
        );
        res.json({ tem_acesso: rows[0]?.tem_acesso ?? false });
    } catch (err) {
        next(err);
    }
});

module.exports = { router, buildDeptoFilter, buildCentroCustoFilter, buildVendedorFilter, buildCidadeFilter };
