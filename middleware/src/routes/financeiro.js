'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { getPeriodRange } = require('../utils/period');

// Fallback do Tenant Master para Pet Club (Kleber) para fins de teste no painel financeiro
router.use((req, res, next) => {
    if (req.tenant && req.tenant.id === '00000000-0000-0000-0000-000000000000') {
        req.tenant.id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'; // Pet Club (Kleber) tenant
        req.tenant.name = 'Pet Club (Demo Fallback)';
    }
    next();
});

/**
 * Usa MAX(data_emissao) do financeiro como âncora para filtros de período.
 * Garante que dados antigos do Firebird sempre apareçam.
 */
async function getFinanceiroAnchor(tenantId, period, start_date, end_date) {
    if (start_date && end_date) {
        period = 'custom';
    }
    const { rows } = await db.query(
        `SELECT COALESCE(MAX(data_emissao), MAX(data_vencimento), NOW()) as anchor FROM dash_financeiro WHERE tenant_id = $1`,
        [tenantId]
    );
    const anchor = new Date(rows[0].anchor);
    const { getPeriodRange } = require('../utils/period');
    // Calcula usando a âncora como se fosse 'agora'
    const fakeNow = anchor;
    let start = new Date(fakeNow);
    let end = new Date(fakeNow);
    end.setHours(23, 59, 59, 999);

    switch (period) {
        case 'today': case 'hoje': start.setHours(0, 0, 0, 0); break;
        case 'yesterday':
            start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
            end = new Date(start); end.setHours(23, 59, 59, 999); break;
        case 'last7': case '7d': start.setDate(start.getDate() - 7); break;
        case 'thisMonth': case '1m':
            start = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), 1);
            end = new Date(fakeNow.getFullYear(), fakeNow.getMonth() + 1, 0, 23, 59, 59); break;
        case 'lastMonth':
            start = new Date(fakeNow.getFullYear(), fakeNow.getMonth() - 1, 1);
            end = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), 0, 23, 59, 59); break;
        case 'custom':
            if (start_date && end_date) {
                const [sy, sm, sd] = start_date.split('T')[0].split('-');
                const s = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd), 0, 0, 0, 0);
                
                const [ey, em, ed] = end_date.split('T')[0].split('-');
                const e = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed), 23, 59, 59, 999);
                return { start: s, end: e };
            }
            start.setFullYear(start.getFullYear() - 1); break;
        case 'all': start = new Date(1970, 0, 1); break;
        case 'last12m': case '1y': default:
            start.setFullYear(start.getFullYear() - 1); break;
    }
    return { start, end };
}

// Helper: classifica conta 
const CAT_SQL = `
  CASE
    WHEN TRIM(status_pagamento) = 'PAGO' THEN 'PAGA'
    WHEN TRIM(status_pagamento) = 'CANCELADO' THEN 'CANCELADA'
    WHEN data_vencimento < NOW() THEN 'VENCIDA'
    WHEN data_vencimento <= NOW() + INTERVAL '30 days' THEN 'A_VENCER'
    ELSE 'FUTURA'
  END
`;

// GET /api/financeiro/contas-receber
router.get('/contas-receber', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const caixaId = req.query.caixa_id;
        const filterCaixa = caixaId ? ` AND caixa_id_firebird = ${parseInt(caixaId)}` : '';
        const { rows } = await db.query(`
            SELECT 
                ${CAT_SQL} AS status,
                COUNT(*) AS quantidade,
                SUM(valor) AS total
            FROM dash_financeiro
            WHERE tenant_id = $1 
              AND TRIM(tipo) = 'RECEBER'
              ${filterCaixa}
            GROUP BY 1
            ORDER BY 1
        `, [tenantId]);

        const formatted = rows.map(r => ({
            status: r.status,
            quantidade: parseInt(r.quantidade, 10),
            total: parseFloat(r.total || 0)
        }));

        res.json({ data: formatted });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/contas-pagar
router.get('/contas-pagar', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const caixaId = req.query.caixa_id;
        const filterCaixa = caixaId ? ` AND caixa_id_firebird = ${parseInt(caixaId)}` : '';
        const { rows } = await db.query(`
            SELECT 
                ${CAT_SQL} AS status,
                COUNT(*) AS quantidade,
                SUM(valor) AS total
            FROM dash_financeiro
            WHERE tenant_id = $1 
              AND TRIM(tipo) = 'PAGAR'
              ${filterCaixa}
            GROUP BY 1
            ORDER BY 1
        `, [tenantId]);

        const formatted = rows.map(r => ({
            status: r.status,
            quantidade: parseInt(r.quantidade, 10),
            total: parseFloat(r.total || 0)
        }));

        res.json({ data: formatted });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/fluxo-caixa
router.get('/fluxo-caixa', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const caixaId = req.query.caixa_id;
        const filterCaixa = caixaId ? ` AND caixa_id_firebird = ${parseInt(caixaId)}` : '';
        const period = req.query.period || 'last12m';
        const { start, end } = await getFinanceiroAnchor(tenantId, period, req.query.start_date, req.query.end_date);

        const { rows } = await db.query(`
            SELECT 
                TO_CHAR(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM-DD') AS data,
                SUM(CASE WHEN TRIM(tipo) = 'RECEBER' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END) AS entradas,
                SUM(CASE WHEN TRIM(tipo) = 'PAGAR' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END) AS saidas
            FROM dash_financeiro
            WHERE tenant_id = $1
              AND COALESCE(data_pagamento, data_vencimento) >= $2
              AND COALESCE(data_pagamento, data_vencimento) <= $3
              ${filterCaixa}
            GROUP BY TO_CHAR(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM-DD')
            ORDER BY data
        `, [tenantId, start, end]);

        let acc = 0;
        const data = rows.map((r) => {
            const entradas = parseFloat(r.entradas || 0);
            const saidas = parseFloat(r.saidas || 0);
            acc += entradas - saidas;
            return {
                data: r.data,
                entradas,
                saidas,
                saldo: acc
            };
        });

        res.json({ period: { start, end, label: period }, data });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/kpis
router.get('/kpis', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const caixaId = req.query.caixa_id;
        const filterCaixa = caixaId ? ` AND caixa_id_firebird = ${parseInt(caixaId)}` : '';

        const [rReceber, rPagar, rVencidas, rGeral, rDmp] = await Promise.all([
            db.query(`SELECT COALESCE(SUM(valor - valor_pago), 0) AS v FROM dash_financeiro WHERE tenant_id = $1 AND TRIM(tipo) = 'RECEBER' AND TRIM(status_pagamento) = 'ABERTO' AND COALESCE(valor_pago, 0) < valor ${filterCaixa}`, [tenantId]),
            db.query(`SELECT COALESCE(SUM(valor - valor_pago), 0) AS v FROM dash_financeiro WHERE tenant_id = $1 AND TRIM(tipo) = 'PAGAR' AND TRIM(status_pagamento) = 'ABERTO' AND COALESCE(valor_pago, 0) < valor ${filterCaixa}`, [tenantId]),
            db.query(`SELECT COALESCE(SUM(valor - valor_pago), 0) AS vencidas_valor, COUNT(*) AS vencidas_qtd FROM dash_financeiro WHERE tenant_id = $1 AND TRIM(tipo) = 'RECEBER' AND TRIM(status_pagamento) = 'ABERTO' AND COALESCE(valor_pago, 0) < valor AND data_vencimento < NOW() ${filterCaixa}`, [tenantId]),
            db.query(`SELECT COALESCE(SUM(valor), 0) AS total_geral FROM dash_financeiro WHERE tenant_id = $1 AND TRIM(tipo) = 'RECEBER' ${filterCaixa}`, [tenantId]),
            db.query(`SELECT AVG(EXTRACT(EPOCH FROM (data_pagamento - data_emissao))/86400) AS dias FROM dash_financeiro WHERE tenant_id = $1 AND TRIM(tipo) = 'RECEBER' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) >= valor) AND data_pagamento IS NOT NULL AND data_emissao IS NOT NULL ${filterCaixa}`, [tenantId])
        ]);

        const totalReceberGeral = parseFloat(rGeral.rows[0]?.total_geral || 0);
        const vencidasValor = parseFloat(rVencidas.rows[0]?.vencidas_valor || 0);
        const inadimp = totalReceberGeral > 0 ? (vencidasValor / totalReceberGeral) * 100 : 0;
        const totalReceber = parseFloat(rReceber.rows[0]?.v || 0);
        const totalPagar = parseFloat(rPagar.rows[0]?.v || 0);

        res.json({
            kpis: {
                total_receber: totalReceber,
                total_pagar: totalPagar,
                saldo_liquido: totalReceber - totalPagar,
                inadimplencia_pct: Number(inadimp.toFixed(2)),
                vencidas_qtd: parseInt(rVencidas.rows[0]?.vencidas_qtd || 0, 10),
                vencidas_valor: vencidasValor,
                dias_medio_recebimento: Number(parseFloat(rDmp.rows[0]?.dias || 0).toFixed(1)),
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/caixa?period=
router.get('/caixa', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const caixaId = req.query.caixa_id;
        const filterCaixa = caixaId ? ` AND caixa_id_firebird = ${parseInt(caixaId)}` : '';
        const period = req.query.period || 'last12m';
        const { start, end } = await getFinanceiroAnchor(tenantId, period, req.query.start_date, req.query.end_date);

        const totP = await db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN TRIM(tipo) = 'RECEBER' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND COALESCE(data_pagamento, data_vencimento) >= $2 AND COALESCE(data_pagamento, data_vencimento) <= $3 THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END), 0) AS entradas,
                COALESCE(SUM(CASE WHEN TRIM(tipo) = 'PAGAR' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND COALESCE(data_pagamento, data_vencimento) >= $2 AND COALESCE(data_pagamento, data_vencimento) <= $3 THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END), 0) AS saidas,
                COUNT(DISTINCT CASE WHEN TRIM(tipo) = 'RECEBER' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND COALESCE(data_pagamento, data_vencimento) >= $2 AND COALESCE(data_pagamento, data_vencimento) <= $3 THEN id END) AS qtd_entradas,
                COUNT(DISTINCT CASE WHEN TRIM(tipo) = 'PAGAR' AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND COALESCE(data_pagamento, data_vencimento) >= $2 AND COALESCE(data_pagamento, data_vencimento) <= $3 THEN id END) AS qtd_saidas
            FROM dash_financeiro
            WHERE tenant_id = $1
              ${filterCaixa}
        `, [tenantId, start, end]);

        const movP = await db.query(`
            SELECT 
                TO_CHAR(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM-DD') AS data,
                SUM(CASE WHEN TRIM(tipo) = 'RECEBER' THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END) AS entradas,
                SUM(CASE WHEN TRIM(tipo) = 'PAGAR' THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END) AS saidas
            FROM dash_financeiro
            WHERE tenant_id = $1 
              AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
              AND COALESCE(data_pagamento, data_vencimento) >= $2 
              AND COALESCE(data_pagamento, data_vencimento) <= $3
              ${filterCaixa}
            GROUP BY TO_CHAR(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM-DD')
            ORDER BY data
        `, [tenantId, start, end]);

        let showEspecies = false;
        if (!caixaId) {
            showEspecies = true;
        } else {
            // Verifica o nome do caixa selecionado
            const caixaRes = await db.query('SELECT UPPER(descricao) as desc FROM dash_caixas WHERE tenant_id = $1 AND id_firebird = $2', [tenantId, parseInt(caixaId)]);
            if (caixaRes.rowCount > 0) {
                const desc = caixaRes.rows[0].desc || '';
                // Se o caixa for o diário/principal de vendas, mostramos as espécies (que vêm da dash_vendas global)
                if (desc.includes('DIARI') || desc.includes('DIÁRI') || desc.includes('GERAL') || desc.includes('VENDA') || desc.includes('LOJA')) {
                    showEspecies = true;
                }
            }
        }

        let especieP = { rows: [] };
        if (showEspecies) {
            especieP = await db.query(`
                SELECT TRIM(UPPER(especie)) as nome_especie, COALESCE(SUM(valor_total), 0) AS total_especie
                FROM dash_vendas
                WHERE tenant_id = $1
                  AND data_venda >= $2 AND data_venda <= $3
                  AND TRIM(UPPER(status)) IN ('FATURADO', 'FINALIZADO')
                  AND especie IS NOT NULL AND TRIM(especie) != ''
                GROUP BY TRIM(UPPER(especie))
                ORDER BY total_especie DESC
            `, [tenantId, start, end]);
        }

        let acc = 0;
        const movimentacoes = movP.rows.map(m => {
            const entradas = parseFloat(m.entradas || 0);
            const saidas = parseFloat(m.saidas || 0);
            acc += entradas - saidas;
            return {
                data: m.data,
                entradas,
                saidas,
                saldo_acumulado: acc
            };
        });

        const entradas = parseFloat(totP.rows[0].entradas || 0);
        const saidas = parseFloat(totP.rows[0].saidas || 0);
        const qtd_entradas = parseInt(totP.rows[0].qtd_entradas || 0, 10);
        const qtd_saidas = parseInt(totP.rows[0].qtd_saidas || 0, 10);
        const especies = especieP.rows.map(r => ({
            nome: r.nome_especie,
            total: parseFloat(r.total_especie || 0)
        }));

        res.json({
            period: { start, end, label: period },
            kpis: {
                entradas,
                saidas,
                saldo: entradas - saidas,
                qtd_entradas,
                qtd_saidas,
                especies,
                ticket_medio_entrada: qtd_entradas > 0 ? (entradas / qtd_entradas) : 0
            },
            movimentacoes
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/especies-vendidas
router.get('/especies-vendidas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const period = req.query.period || '30d';
        const { start, end } = await getFinanceiroAnchor(tenantId, period, req.query.start_date, req.query.end_date);
        const limit = parseInt(req.query.limit, 10) || 15;

        const prodP = await db.query(`
            SELECT 
                p.id_firebird AS id,
                p.codigo,
                p.nome,
                p.categoria,
                SUM(i.quantidade) AS quantidade_vendida,
                SUM(i.valor_total) AS total_vendido,
                COUNT(DISTINCT i.venda_id_firebird) AS qtd_vendas,
                AVG(i.preco_unitario) AS preco_medio
            FROM dash_vendas_itens i
            INNER JOIN dash_vendas v ON v.id_firebird = i.venda_id_firebird AND v.tenant_id = i.tenant_id
            INNER JOIN dash_produtos p ON p.id_firebird = i.produto_id_firebird AND p.tenant_id = i.tenant_id
            WHERE i.tenant_id = $1
              AND v.data_venda >= $2 AND v.data_venda <= $3
              AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
            GROUP BY p.id_firebird, p.codigo, p.nome, p.categoria
            ORDER BY total_vendido DESC
            LIMIT $4
        `, [tenantId, start, end, limit]);

        const catP = await db.query(`
            SELECT 
                COALESCE(NULLIF(p.categoria, ''), 'Sem categoria') AS categoria,
                SUM(i.quantidade) AS quantidade,
                SUM(i.valor_total) AS total
            FROM dash_vendas_itens i
            INNER JOIN dash_vendas v ON v.id_firebird = i.venda_id_firebird AND v.tenant_id = i.tenant_id
            INNER JOIN dash_produtos p ON p.id_firebird = i.produto_id_firebird AND p.tenant_id = i.tenant_id
            WHERE i.tenant_id = $1
              AND v.data_venda >= $2 AND v.data_venda <= $3
              AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
            GROUP BY COALESCE(NULLIF(p.categoria, ''), 'Sem categoria')
            ORDER BY total DESC
        `, [tenantId, start, end]);

        const totP = await db.query(`
            SELECT SUM(i.valor_total) AS total, SUM(i.quantidade) AS quantidade
            FROM dash_vendas_itens i
            INNER JOIN dash_vendas v ON v.id_firebird = i.venda_id_firebird AND v.tenant_id = i.tenant_id
            WHERE i.tenant_id = $1
              AND v.data_venda >= $2 AND v.data_venda <= $3
              AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
        `, [tenantId, start, end]);

        res.json({
            period: { start, end, label: period },
            total: {
                valor: parseFloat(totP.rows[0]?.total || 0),
                quantidade: parseFloat(totP.rows[0]?.quantidade || 0)
            },
            produtos: prodP.rows.map(r => ({ ...r, total_vendido: parseFloat(r.total_vendido), quantidade_vendida: parseFloat(r.quantidade_vendida) })),
            categorias: catP.rows.map(r => ({ ...r, total: parseFloat(r.total), quantidade: parseFloat(r.quantidade) }))
        });

    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/contas
router.get('/contas', async (req, res, next) => {
    try {
        const tipo = req.query.tipo;
        const statusPg = req.query.status;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10000, 50000);
        const tenantId = req.tenant.id;

        const where = [
            '(f.tenant_id = $1::uuid OR LOWER(f.tenant_id::text) = LOWER($1::text))',
            'COALESCE(f.valor, 0) > 0'
        ];
        const binds = [tenantId];
        let pIndex = 2;

        if (tipo) {
            const tipoUpper = tipo.trim().toUpperCase();
            if (tipoUpper === 'RECEBER' || tipoUpper === 'R') {
                where.push(`(f.tipo IS NULL OR UPPER(TRIM(f.tipo)) IN ('RECEBER', 'R', 'REC', 'RECEITA') OR UPPER(TRIM(f.tipo)) NOT IN ('PAGAR', 'DESPESA', 'P'))`);
            } else if (tipoUpper === 'PAGAR' || tipoUpper === 'P') {
                where.push(`(UPPER(TRIM(COALESCE(f.tipo, ''))) IN ('PAGAR', 'P', 'PAG', 'DESPESA'))`);
            } else {
                where.push(`(f.tipo = $${pIndex} OR f.tipo = $${pIndex} || ' ')`);
                binds.push(tipo.trim());
                pIndex++;
            }
        }
        
        if (req.query.caixa_id) {
            where.push(`f.caixa_id_firebird = $${pIndex++}`);
            binds.push(parseInt(req.query.caixa_id));
        }

        if (statusPg === 'VENCIDA') {
            where.push(`(
                f.data_cancelamento IS NULL
                AND UPPER(TRIM(COALESCE(f.status_pagamento, 'ABERTO'))) NOT IN (
                    'PAGO', 'QUITADO', 'CANCELADO', 'CANCELADA', 'CANCEL', 'CAN', 
                    'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'BAIXADA', 
                    'LIQUIDADO', 'LIQUIDADA', 'ESTORNADO', 'ESTORNADA', 'EXCLUIDO', 
                    'EXCLUIDA', 'ANULADO', 'ANULADA', 'INATIVO', 'C'
                )
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%CANCEL%'
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%ESTORN%'
                AND (f.descricao IS NULL OR (UPPER(f.descricao) NOT LIKE '%[CANCELADO]%' AND UPPER(f.descricao) NOT LIKE '%CANCELADO%'))
                AND COALESCE(f.valor_pago, 0) < f.valor
                AND f.data_vencimento < NOW()
            )`);
        } else if (statusPg === 'ABERTO') {
            where.push(`(
                f.data_cancelamento IS NULL
                AND UPPER(TRIM(COALESCE(f.status_pagamento, 'ABERTO'))) NOT IN (
                    'PAGO', 'QUITADO', 'CANCELADO', 'CANCELADA', 'CANCEL', 'CAN', 
                    'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'BAIXADA', 
                    'LIQUIDADO', 'LIQUIDADA', 'ESTORNADO', 'ESTORNADA', 'EXCLUIDO', 
                    'EXCLUIDA', 'ANULADO', 'ANULADA', 'INATIVO', 'C'
                )
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%CANCEL%'
                AND UPPER(TRIM(COALESCE(f.status_pagamento, ''))) NOT LIKE '%ESTORN%'
                AND (f.descricao IS NULL OR (UPPER(f.descricao) NOT LIKE '%[CANCELADO]%' AND UPPER(f.descricao) NOT LIKE '%CANCELADO%'))
                AND (COALESCE(f.valor_pago, 0) < f.valor OR COALESCE(f.valor, 0) = 0)
            )`);
        } else if (statusPg === 'PAGO' || statusPg === 'QUITADO' || statusPg === 'RECEIVED' || statusPg === 'CONFIRMED') {
            where.push(`(UPPER(TRIM(COALESCE(f.status_pagamento, ''))) IN ('PAGO', 'QUITADO', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'LIQUIDADO') OR (COALESCE(f.valor_pago, 0) >= f.valor AND COALESCE(f.valor, 0) > 0))`);
        } else if (statusPg) {
            where.push(`(f.status_pagamento = $${pIndex} OR f.status_pagamento = $${pIndex} || ' ')`);
            binds.push(statusPg.trim());
            pIndex++;
        }

        // Filtro para mostrar apenas boletos não emitidos (quando acionado no lote/modal)
        const semBoleto = req.query.apenas_sem_boleto === 'true' || 
                          req.query.apenas_sem_nosso_numero === 'true' || 
                          req.query.nao_emitidos === 'true' || 
                          req.query.sem_boleto === 'true' ||
                          req.query.apenas_sem_boleto === '1' ||
                          req.query.sem_boleto === '1';

        if (semBoleto) {
            where.push(`(f.nosso_numero IS NULL OR TRIM(f.nosso_numero) = '' OR f.nosso_numero = '—') AND (f.asaas_payment_id IS NULL OR TRIM(f.asaas_payment_id) = '')`);
        }

        const startDateRaw = req.query.startDate || req.query.start_date;
        const endDateRaw = req.query.endDate || req.query.end_date;

        function formatIsoDate(dateStr, isEnd = false) {
            if (!dateStr || typeof dateStr !== 'string') return null;
            let s = dateStr.trim();
            if (s.includes('/')) {
                const parts = s.split('/');
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2];
                    s = `${year}-${month}-${day}`;
                }
            }
            if (s.length === 10) {
                s = isEnd ? `${s} 23:59:59` : `${s} 00:00:00`;
            }
            return s;
        }

        const startDate = formatIsoDate(startDateRaw, false);
        const endDate = formatIsoDate(endDateRaw, true);

        if (startDate) {
            if (statusPg === 'ABERTO' || statusPg === 'VENCIDA') {
                where.push(`f.data_vencimento >= $${pIndex++}`);
            } else {
                where.push(`COALESCE(f.data_pagamento, f.data_vencimento) >= $${pIndex++}`);
            }
            binds.push(startDate);
        }
        if (endDate) {
            if (statusPg === 'ABERTO' || statusPg === 'VENCIDA') {
                where.push(`f.data_vencimento <= $${pIndex++}`);
            } else {
                where.push(`COALESCE(f.data_pagamento, f.data_vencimento) <= $${pIndex++}`);
            }
            binds.push(endDate);
        }

        const searchVal = req.query.search || req.query.q || req.query.cliente || req.query.nome;
        if (searchVal && String(searchVal).trim() !== '') {
            const rawSearch = String(searchVal).trim();
            const cleanSearch = rawSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const searchTerm = `%${cleanSearch}%`;
            const rawSearchTerm = `%${rawSearch}%`;

            where.push(`(
                translate(LOWER(COALESCE(cl.nome, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ILIKE $${pIndex} OR 
                translate(LOWER(COALESCE(cl.razao_social, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ILIKE $${pIndex} OR 
                translate(LOWER(COALESCE(cl.nome_fantasia, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ILIKE $${pIndex} OR 
                translate(LOWER(COALESCE(cl.apelido, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ILIKE $${pIndex} OR 
                translate(LOWER(COALESCE(f.cliente_nome, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ILIKE $${pIndex} OR 
                translate(LOWER(COALESCE(f.descricao, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ILIKE $${pIndex} OR 
                f.numero_documento ILIKE $${pIndex + 1} OR 
                CAST(f.id_firebird AS TEXT) ILIKE $${pIndex + 1} OR 
                CAST(f.cliente_id_firebird AS TEXT) = $${pIndex + 2} OR
                COALESCE(cl.documento, '') ILIKE $${pIndex + 1} OR
                COALESCE(f.cliente_documento, '') ILIKE $${pIndex + 1}
            )`);
            binds.push(searchTerm);
            binds.push(rawSearchTerm);
            binds.push(rawSearch);
            pIndex += 3;
        }

        binds.push(limit);
        const limitIdx = pIndex;

        const sql = `
            SELECT 
                f.id, f.id_firebird, f.tipo, f.descricao, f.data_emissao, f.data_vencimento, f.data_pagamento,
                f.valor, f.valor_pago, f.status_pagamento,
                f.nosso_numero, f.numero_documento, f.asaas_payment_id,
                COALESCE(f.portador_nome, 'CARTEIRA') AS portador,
                COALESCE(f.especie_nome, 'BOLETO') AS especie,
                COALESCE(NULLIF(TRIM(cl.nome), ''), NULLIF(TRIM(cl.razao_social), ''), NULLIF(TRIM(f.cliente_nome), ''), NULLIF(TRIM(f.descricao), ''), 'Cliente não identificado') AS cliente,
                COALESCE(cl.id_firebird, f.cliente_id_firebird) AS cliente_id_firebird,
                COALESCE(cl.documento, f.cliente_documento) AS cpf_cnpj,
                COALESCE(cl.documento, f.cliente_documento) AS cliente_documento,
                COALESCE(NULLIF(TRIM(cl.email_financeiro), ''), NULLIF(TRIM(cl.email), ''), NULLIF(TRIM(f.cliente_email), '')) AS cliente_email,
                COALESCE(NULLIF(TRIM(cl.email_financeiro), ''), NULLIF(TRIM(cl.email), ''), NULLIF(TRIM(f.cliente_email), '')) AS email,
                COALESCE(cl.celular_secundario, cl.telefone) AS cliente_telefone,
                COALESCE(cl.celular_secundario, cl.telefone) AS telefone,
                cl.endereco_completo AS cliente_endereco,
                cl.endereco_completo AS endereco,
                cl.cidade AS cliente_cidade,
                cl.cidade AS cidade,
                cl.estado AS cliente_estado,
                cl.estado AS estado
            FROM dash_financeiro f
            LEFT JOIN dash_clientes cl ON (cl.tenant_id = f.tenant_id OR LOWER(cl.tenant_id::text) = LOWER(f.tenant_id::text))
              AND (
                (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND cl.id_firebird = f.cliente_id_firebird)
                OR (f.fornecedor_id_firebird IS NOT NULL AND f.fornecedor_id_firebird > 0 AND cl.id_firebird = f.fornecedor_id_firebird)
                OR (f.cliente_id IS NOT NULL AND cl.id = f.cliente_id)
              )
            WHERE ${where.join(' AND ')}
            ORDER BY ${ (statusPg === 'PAGO' || statusPg === 'QUITADO') ? 'COALESCE(f.data_pagamento, f.data_vencimento) DESC, f.id DESC' : 'f.data_vencimento DESC, f.id DESC' }
            LIMIT $${limitIdx}
        `;

        const { rows } = await db.query(sql, binds);
        
        const formatted = rows.map(r => {
            const valNominal = parseFloat(r.valor || 0);
            const valPagoRaw = parseFloat(r.valor_pago || 0);
            const isPago = (r.status_pagamento || '').trim() === 'PAGO' || valPagoRaw > 0;
            const valPagoFinal = isPago ? (valPagoRaw > 0 ? valPagoRaw : valNominal) : valPagoRaw;
            const jurosMulta = isPago && valPagoRaw > valNominal ? parseFloat((valPagoRaw - valNominal).toFixed(2)) : 0;

            return {
                ...r,
                tipo: r.tipo ? r.tipo.trim() : r.tipo,
                status_pagamento: r.status_pagamento ? r.status_pagamento.trim() : r.status_pagamento,
                valor: valNominal,
                valor_original: valNominal,
                valor_pago: valPagoFinal,
                juros_multa: jurosMulta
            };
        });

        res.json({ data: formatted });
    } catch (err) {
        next(err);
    }
});


// GET /api/financeiro/caixas
router.get('/caixas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            `SELECT id_firebird AS id, descricao AS nome
             FROM dash_caixas
             WHERE tenant_id = $1
             ORDER BY descricao ASC`,
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// ------------------------------------------------------------
// TESOURARIA E CONTAS BANCÁRIAS (MÓDULO 8)
// ------------------------------------------------------------

// GET /api/financeiro/contas-bancarias
router.get('/contas-bancarias', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            'SELECT * FROM dash_contas_bancarias WHERE tenant_id = $1 ORDER BY apelido ASC',
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/contas-bancarias
router.post('/contas-bancarias', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { apelido, banco, agencia, conta, tipo, saldo_inicial } = req.body;

        if (!apelido) {
            return res.status(400).json({ error: 'O apelido da conta é obrigatório.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_contas_bancarias (tenant_id, apelido, banco, agencia, conta, tipo, saldo_inicial, saldo_atual)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [tenantId, apelido, banco, agencia, conta, tipo || 'Corrente', saldo_inicial || 0, saldo_inicial || 0]
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/financeiro/portadores — Lista portadores sincronizados do ERP
// ─────────────────────────────────────────────────────────────────────────────
router.get('/portadores', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            'SELECT id_firebird as id, descricao FROM dash_portadores WHERE tenant_id = $1 AND ativo = true ORDER BY descricao ASC',
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/financeiro/especies — Lista espécies de pagamento sincronizadas do ERP
// ─────────────────────────────────────────────────────────────────────────────
router.get('/especies', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            'SELECT id_firebird as id, descricao, tipo FROM dash_especies WHERE tenant_id = $1 AND ativo = true ORDER BY descricao ASC',
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/financeiro/titulos — Lança título (individual ou programação de contas)
// Aceita dois formatos:
//   1. Novo: { tipo, cliente_nome, parcelas: [{num_parcela, valor, data_vencimento, ...}], ... }
//   2. Legado: { tipo, valor, data_vencimento, numero_parcelas, ... }
// Insere no PostgreSQL e enfileira para o ERP Firebird via dash_sync_metadata
// ─────────────────────────────────────────────────────────────────────────────
router.post('/titulos', async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        const tenantId = req.tenant.id;
        const usuario = req.user?.nome || req.user?.email || 'Operador';
        const body = req.body;

        const {
            cliente_id,
            cliente_id_firebird,   // legado
            cliente_nome,
            descricao,
            portador_id,
            portador_nome,
            especie_id,
            especie_nome,
            data_emissao,
            plano_contas_id,
            plano_contas_nome,
            centro_custo,
            centro_custo_nome,
            observacoes,
            origem = 'NEXUS',
            tipo = 'RECEBER',
        } = body;

        // ── Normaliza array de parcelas (novo formato ou legado) ──────────────
        let parcelasInput = [];

        if (Array.isArray(body.parcelas) && body.parcelas.length > 0) {
            // Formato novo: array de parcelas vindas dos modais
            parcelasInput = body.parcelas;
        } else {
            // Formato legado: gera parcelas a partir de valor/data_vencimento/numero_parcelas
            const valor = parseFloat(String(body.valor || 0).replace(',', '.'));
            const numParcelas = Math.max(1, parseInt(body.numero_parcelas) || 1);
            const valorParcela = parseFloat((valor / numParcelas).toFixed(2));
            const baseDate = new Date(body.data_vencimento);
            const intervalo = body.intervalo || 'mensal';

            for (let i = 0; i < numParcelas; i++) {
                const dt = new Date(baseDate);
                if (i > 0) {
                    if (intervalo === 'quinzenal') dt.setDate(dt.getDate() + 15 * i);
                    else if (intervalo === 'semanal') dt.setDate(dt.getDate() + 7 * i);
                    else dt.setMonth(dt.getMonth() + i);
                }
                parcelasInput.push({
                    num_parcela: i + 1,
                    valor: valorParcela,
                    data_vencimento: dt.toISOString().split('T')[0],
                    ndoc: body.ndoc || '',
                    especie_id: especie_id || null,
                    especie_nome: especie_nome || '',
                });
            }
        }

        if (parcelasInput.length === 0) {
            return res.status(400).json({ error: 'Informe ao menos uma parcela.' });
        }

        const numParcelas = parcelasInput.length;
        const grupoId = `NEXUS-${Date.now()}`;

        await client.query('BEGIN');

        const parseId = (v) => (v && !isNaN(parseInt(v))) ? parseInt(v) : null;

        // Resolve cliente_id e cliente_id_firebird no banco para garantir que ambos estejam sempre preenchidos corretamente
        let resolvedClienteId = parseId(cliente_id);
        let resolvedClienteIdFirebird = parseId(cliente_id_firebird);
        let resolvedClienteNome = cliente_nome || null;
        let resolvedClienteDoc = null;

        if (resolvedClienteId || resolvedClienteIdFirebird || (resolvedClienteNome && resolvedClienteNome.trim() !== '')) {
            const cliCheck = await client.query(
                `SELECT id, id_firebird, nome, documento FROM dash_clientes 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                   AND (
                     ($2::int IS NOT NULL AND id = $2)
                     OR ($3::int IS NOT NULL AND id_firebird = $3)
                     OR ($4::text IS NOT NULL AND LOWER(TRIM(nome)) = LOWER(TRIM($4)))
                   )
                 LIMIT 1`,
                [String(tenantId), resolvedClienteId, resolvedClienteIdFirebird, resolvedClienteNome]
            );
            if (cliCheck.rows.length > 0) {
                resolvedClienteId = cliCheck.rows[0].id;
                resolvedClienteIdFirebird = cliCheck.rows[0].id_firebird || resolvedClienteIdFirebird;
                resolvedClienteNome = cliCheck.rows[0].nome || resolvedClienteNome;
                resolvedClienteDoc = cliCheck.rows[0].documento || null;
            }
        }

        // ── Busca configurações padrão de integrações do tenant ──────────────
        const configRes = await client.query(
            `SELECT padrao_centro_custo, padrao_centro_custo_id, padrao_plano_contas_id, padrao_plano_contas_nome,
                    padrao_moeda, padrao_portador, portador_padrao_id, portador_padrao_nome
             FROM dash_integracoes_config
             WHERE LOWER(tenant_id::text) = LOWER($1::text) OR tenant_id = '00000000-0000-0000-0000-000000000000'
             ORDER BY CASE WHEN tenant_id = '00000000-0000-0000-0000-000000000000' THEN 2 ELSE 1 END
             LIMIT 1`,
            [String(tenantId)]
        ).catch(() => ({ rows: [] }));
        const configPadrao = configRes.rows[0] || {};

        // ── Resolve Moeda e Portador ──────────────────────────────────────────
        const finalMoeda = req.body.moeda || configPadrao.padrao_moeda || 'REAL';
        const finalPortadorId = parseId(portador_id) || parseId(configPadrao.portador_padrao_id) || null;
        const finalPortadorNome = portador_nome || configPadrao.portador_padrao_nome || configPadrao.padrao_portador || 'CARTEIRA';

        // ── Resolve Centro de Custo (Nome e Código numérico para o ERP Coliseu) ──
        let finalCentroCustoNome = centro_custo_nome || (typeof centro_custo === 'string' && isNaN(centro_custo) && centro_custo.trim() !== '' ? centro_custo : null) || configPadrao.padrao_centro_custo || 'COLISEU RECEITAS';
        let finalCentroCustoId = (typeof centro_custo === 'number' || (centro_custo && !isNaN(parseInt(centro_custo)))) 
            ? parseInt(centro_custo) 
            : (configPadrao.padrao_centro_custo_id ? parseInt(configPadrao.padrao_centro_custo_id) : null);

        if (!finalCentroCustoId && finalCentroCustoNome) {
            const ccCheck = await client.query(
                `SELECT codigo FROM dash_centro_custos 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text) OR tenant_id = '00000000-0000-0000-0000-000000000000')
                   AND LOWER(TRIM(descricao)) = LOWER(TRIM($2))
                 LIMIT 1`,
                [String(tenantId), finalCentroCustoNome]
            ).catch(() => ({ rows: [] }));

            if (ccCheck.rows.length > 0 && ccCheck.rows[0].codigo) {
                finalCentroCustoId = parseInt(ccCheck.rows[0].codigo);
            } else {
                const filialCheck = await client.query(
                    `SELECT centro_custo FROM dash_filiais 
                     WHERE (LOWER(tenant_id::text) = LOWER($1::text) OR tenant_id = '00000000-0000-0000-0000-000000000000')
                       AND LOWER(TRIM(nome)) = LOWER(TRIM($2))
                     LIMIT 1`,
                    [String(tenantId), finalCentroCustoNome]
                ).catch(() => ({ rows: [] }));
                if (filialCheck.rows.length > 0 && filialCheck.rows[0].centro_custo) {
                    finalCentroCustoId = parseInt(filialCheck.rows[0].centro_custo);
                }
            }
        }
        if (!finalCentroCustoId) {
            // Busca centro de custo de receita (NUNCA despesa para títulos a receber!)
            const firstCC = await client.query(
                `SELECT codigo, descricao FROM dash_centro_custos 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text) OR tenant_id = '00000000-0000-0000-0000-000000000000')
                   AND (LOWER(tipo) = 'receita' OR LOWER(descricao) LIKE '%receita%' OR codigo = 6)
                 ORDER BY CASE WHEN codigo = 6 THEN 1 ELSE 2 END, codigo ASC 
                 LIMIT 1`,
                [String(tenantId)]
            ).catch(() => ({ rows: [] }));
            if (firstCC.rows.length > 0) {
                finalCentroCustoId = parseInt(firstCC.rows[0].codigo);
                if (!finalCentroCustoNome || finalCentroCustoNome === 'BRANDAO AUTO PECAS') {
                    finalCentroCustoNome = firstCC.rows[0].descricao;
                }
            } else {
                finalCentroCustoId = 6;
                if (!finalCentroCustoNome) finalCentroCustoNome = 'COLISEU RECEITAS';
            }
        }

        // ── Resolve Plano de Contas (ID e Nome) ───────────────────────────────
        let finalPlanoContasId = parseId(plano_contas_id) || parseId(configPadrao.padrao_plano_contas_id) || 1;
        let finalPlanoContasNome = plano_contas_nome || configPadrao.padrao_plano_contas_nome || 'MENSALIDADE / SERVIÇO';

        const inserted = [];
        for (let i = 0; i < numParcelas; i++) {
            const p = parcelasInput[i];
            const valorParcela = parseFloat(String(p.valor || 0).replace(',', '.'));

            if (!valorParcela || valorParcela <= 0) continue;
            if (!p.data_vencimento) continue;

            const descParcela = numParcelas > 1
                ? `${descricao || 'LANÇAMENTO'} ${String(p.num_parcela || i+1).padStart(2,'0')}/${numParcelas}`
                : (descricao || 'LANÇAMENTO');

            const { rows } = await client.query(`
                INSERT INTO dash_financeiro (
                    tenant_id, tipo, descricao, cliente_id, cliente_id_firebird, cliente_nome, cliente_documento,
                    data_emissao, data_vencimento, valor, valor_pago, status_pagamento,
                    portador_id, portador_nome, especie_id, especie_nome,
                    plano_contas_id, plano_contas_nome,
                    numero_parcela, tipo_parcela, origem,
                    centro_custo, centro_custo_nome, moeda
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, 0, $11,
                    $12, $13, $14, $15,
                    $16, $17,
                    $18, $19, $20,
                    $21, $22, $23
                ) RETURNING *`,
                [
                    tenantId,
                    String(tipo || 'RECEBER').substring(0, 20),
                    descParcela,
                    resolvedClienteId,
                    resolvedClienteIdFirebird,
                    resolvedClienteNome,
                    resolvedClienteDoc,
                    data_emissao || new Date().toISOString().split('T')[0],
                    p.data_vencimento,
                    valorParcela,
                    'ABERTO',
                    finalPortadorId,
                    finalPortadorNome,
                    parseId(p.especie_id || especie_id),
                    p.especie_nome || especie_nome || null,
                    finalPlanoContasId,
                    finalPlanoContasNome,
                    parseInt(p.num_parcela) || (i + 1),
                    numParcelas > 1 ? 'PARCELADO' : 'AVISTA',
                    String(origem || 'NEXUS').substring(0, 20),
                    finalCentroCustoId,
                    finalCentroCustoNome,
                    finalMoeda
                ]
            );
            inserted.push({ ...rows[0], ndoc: p.ndoc || '' });

            // Audit log para Lançamento do Título
            await client.query(
                `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, descricao)
                 VALUES ($1::UUID, $2, $3, 'CRIACAO_TITULO', $4, $5)`,
                [
                    String(tenantId),
                    rows[0].id,
                    rows[0].id,
                    usuario,
                    `Título de R$ ${parseFloat(valorParcela).toFixed(2)} lançado por ${usuario}. Vencimento: ${p.data_vencimento}.`
                ]
            ).catch(() => {});
        }

        await client.query('COMMIT');

        // ── Enfileira em lote para o ERP Firebird (assíncrono em paralelo) ──
        Promise.all(inserted.map(titulo => 
            db.query(`
                INSERT INTO dash_sync_metadata (tenant_id, tabela, operacao, payload, status, created_at)
                VALUES ($1, 'LANCTO_FINANCEIRO', 'INSERT', $2::jsonb, 'PENDENTE', NOW())
            `, [tenantId, JSON.stringify({
                id_nexus:            parseInt(titulo.id, 10),
                grupo_id:            grupoId,
                tipo:                titulo.tipo,
                cliente_id:          titulo.cliente_id ? parseInt(titulo.cliente_id, 10) : null,
                cliente_id_firebird: titulo.cliente_id_firebird ? parseInt(titulo.cliente_id_firebird, 10) : null,
                cliente_documento:   titulo.cliente_documento || null,
                cliente_nome:        titulo.cliente_nome,
                descricao:           titulo.descricao,
                data_emissao:        titulo.data_emissao,
                data_vencimento:     titulo.data_vencimento,
                valor:               parseFloat(titulo.valor) || 0,
                moeda:               finalMoeda,
                portador_id:         finalPortadorId,
                portador_nome:       finalPortadorNome,
                especie_id:          titulo.especie_id ? parseInt(titulo.especie_id, 10) : null,
                especie_nome:        titulo.especie_nome,
                plano_contas_id:     finalPlanoContasId,
                plano_contas:        finalPlanoContasNome,
                plano_contas_nome:   finalPlanoContasNome,
                centro_custo_id:     finalCentroCustoId,
                centro_custo:        finalCentroCustoNome,
                numero_parcela:      parseInt(titulo.numero_parcela, 10) || 1,
                total_parcelas:      parseInt(numParcelas, 10) || 1,
                ndoc:                titulo.ndoc || '',
                observacoes:         observacoes || '',
                origem:              'NEXUS',
                criado_em:           new Date().toISOString(),
            })]).catch((e) => {
                logger.warn('Falha ao enfileirar sync ERP:', e.message);
            })
        )).catch(() => {});

        res.status(201).json({
            success: true,
            message: `${inserted.length} título(s) lançado(s) com sucesso!`,
            data:    inserted,
            parcelas: inserted.map(t => ({
                parcela:     t.numero_parcela,
                vencimento:  t.data_vencimento,
                valor:       t.valor,
                ndoc:        t.ndoc,
                id:          t.id,
            }))
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});



// GET /api/financeiro/titulos-abertos — Lista títulos abertos para conciliação
router.get('/titulos-abertos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { tipo = 'RECEBER', limit = 100 } = req.query;
        const { rows } = await db.query(`
            SELECT id, tipo, descricao, cliente_nome, valor, data_vencimento, status_pagamento
            FROM dash_financeiro
            WHERE tenant_id = $1
              AND tipo = $2
              AND (status_pagamento = 'ABERTO' OR status_pagamento IS NULL)
              AND (asaas_payment_id IS NULL OR asaas_payment_id = '')
            ORDER BY data_vencimento DESC
            LIMIT $3
        `, [tenantId, tipo, parseInt(limit) || 100]);
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

router.get('/plano-contas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        let { rows } = await db.query(
            'SELECT * FROM dash_plano_contas WHERE tenant_id = $1 ORDER BY nome ASC',
            [tenantId]
        );

        if (rows.length === 0) {
            // Verifica se existem planos sincronizados do Firebird em rel_ic_contas_plano_res
            const fbRes = await db.query(
                `SELECT DISTINCT id_firebird, codigo, descricao, tipo 
                 FROM rel_ic_contas_plano_res 
                 WHERE (tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000') 
                   AND ativo = true AND descricao IS NOT NULL AND TRIM(descricao) != ''
                 ORDER BY descricao ASC`,
                [tenantId]
            ).catch(() => ({ rows: [] }));

            if (fbRes.rows.length > 0) {
                for (const item of fbRes.rows) {
                    await db.query(
                        `INSERT INTO dash_plano_contas (tenant_id, nome, tipo)
                         VALUES ($1, $2, $3)
                         ON CONFLICT DO NOTHING`,
                        [tenantId, item.descricao.toUpperCase(), item.tipo || 'Receita']
                    ).catch(() => {});
                }
            } else {
                // Auto-seed planos padrão de ERP
                const defaultPlanos = [
                    { nome: 'MENSALIDADE / SERVIÇO', tipo: 'Receita' },
                    { nome: 'VENDA DENTRO DO ESTADO', tipo: 'Receita' },
                    { nome: 'VENDA FORA DO ESTADO', tipo: 'Receita' },
                    { nome: 'PRESTAÇÃO DE SERVIÇOS', tipo: 'Receita' },
                    { nome: 'RECEITAS FINANCEIRAS', tipo: 'Receita' },
                    { nome: 'OUTRAS RECEITAS', tipo: 'Receita' },
                    { nome: 'DESPESAS OPERACIONAIS', tipo: 'Despesa' },
                    { nome: 'DESPESAS ADMINISTRATIVAS', tipo: 'Despesa' },
                    { nome: 'IMPOSTOS E TRIBUTOS', tipo: 'Despesa' }
                ];

                // Busca também planos históricos já utilizados em dash_financeiro
                const histRes = await db.query(
                    `SELECT DISTINCT plano_contas_nome FROM dash_financeiro 
                     WHERE (tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000')
                       AND plano_contas_nome IS NOT NULL AND TRIM(plano_contas_nome) != ''`,
                    [tenantId]
                ).catch(() => ({ rows: [] }));

                const allToInsert = [...defaultPlanos];
                for (const h of histRes.rows) {
                    if (!allToInsert.some(p => p.nome.toUpperCase() === h.plano_contas_nome.trim().toUpperCase())) {
                        allToInsert.push({ nome: h.plano_contas_nome.trim().toUpperCase(), tipo: 'Receita' });
                    }
                }

                for (const p of allToInsert) {
                    await db.query(
                        `INSERT INTO dash_plano_contas (tenant_id, nome, tipo)
                         VALUES ($1, $2, $3)
                         ON CONFLICT DO NOTHING`,
                        [tenantId, p.nome, p.tipo]
                    ).catch(() => {});
                }
            }

            const recheck = await db.query(
                'SELECT * FROM dash_plano_contas WHERE tenant_id = $1 ORDER BY tipo DESC, nome ASC',
                [tenantId]
            );
            rows = recheck.rows;
        }

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/plano-contas
router.post('/plano-contas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { nome, tipo } = req.body; // tipo: Receita, Despesa Fixa, Despesa Variável

        if (!nome || !tipo) {
            return res.status(400).json({ error: 'Nome e Tipo de categoria são obrigatórios.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_plano_contas (tenant_id, nome, tipo)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [tenantId, nome, tipo]
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/movimentacoes
router.get('/movimentacoes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const startDate = req.query.startDate || req.query.start_date;
        const endDate = req.query.endDate || req.query.end_date;

        const where = ['m.tenant_id = $1'];
        const binds = [tenantId];
        let pIndex = 2;

        if (startDate) {
            where.push(`m.data_movimentacao::date >= $${pIndex++}`);
            binds.push(startDate);
        }
        if (endDate) {
            where.push(`m.data_movimentacao::date <= $${pIndex++}`);
            binds.push(endDate);
        }

        const sql = `
            SELECT m.id, m.tipo, m.valor, m.data_movimentacao, m.forma_pagamento, m.observacao, m.created_at,
                    cb.apelido AS conta_apelido, pc.nome AS categoria_nome
             FROM dash_movimentacoes m
             INNER JOIN dash_contas_bancarias cb ON cb.id = m.conta_bancaria_id
             LEFT JOIN dash_plano_contas pc ON pc.id = m.plano_contas_id
             WHERE ${where.join(' AND ')}
             ORDER BY m.data_movimentacao DESC, m.created_at DESC
        `;

        const { rows } = await db.query(sql, binds);
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/quitacao
// POST /api/financeiro/quitacao
// Baixa de Título / Parcela (Quitação Total ou Parcial)
router.post('/quitacao', async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const tenantId = req.tenant.id;
        const {
            financeiro_id,
            conta_bancaria_id,
            caixa_id,
            forma_pagamento,
            data_recebimento,
            valor_recebido,
            juros_valor,
            multa_valor,
            desconto_valor,
            tipo_baixa
        } = req.body;

        if (!financeiro_id || !data_recebimento || !valor_recebido || parseFloat(valor_recebido) <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'financeiro_id, data_recebimento e valor_recebido válido são obrigatórios.' });
        }

        // 1. Fetch financeiro details
        const finRes = await client.query(
            'SELECT * FROM dash_financeiro WHERE tenant_id = $1 AND id = $2',
            [tenantId, parseInt(financeiro_id, 10)]
        );

        if (finRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Título financeiro não encontrado.' });
        }

        const title = finRes.rows[0];
        const valorOriginal = parseFloat(title.valor || 0);
        const valorPagoAnterior = parseFloat(title.valor_pago || 0);
        const saldoAnterior = Math.max(valorOriginal - valorPagoAnterior, 0);

        const valRecebido = parseFloat(valor_recebido);
        const vJuros = parseFloat(juros_valor || 0);
        const vMulta = parseFloat(multa_valor || 0);
        const vDesconto = parseFloat(desconto_valor || 0);

        const totalEsperado = Math.max(0, saldoAnterior + vJuros + vMulta - vDesconto);
        const novoValorPago = valorPagoAnterior + valRecebido;
        const saldoRemanescente = Math.max(0, totalEsperado - valRecebido);

        const isParcial = tipo_baixa === 'PARCIAL' || (valRecebido < totalEsperado - 0.01);
        const novoStatus = isParcial ? 'PARCIALMENTE PAGO' : 'PAGO';

        // 2. Update status and paid value in dash_financeiro
        await client.query(
            `UPDATE dash_financeiro
             SET status_pagamento = $1, data_pagamento = $2, valor_pago = $3
             WHERE tenant_id = $4 AND id = $5`,
            [novoStatus, data_recebimento, novoValorPago, tenantId, title.id]
        );

        // 3. Update bank account balance if account provided
        if (conta_bancaria_id) {
            const op = (title.tipo || '').trim().toLowerCase() === 'pagar' ? '-' : '+';
            await client.query(
                `UPDATE dash_contas_bancarias
                 SET saldo_atual = saldo_atual ${op} $1
                 WHERE tenant_id = $2 AND id = $3`,
                [valRecebido, tenantId, parseInt(conta_bancaria_id, 10)]
            );

            // 4. Create financial movement entry
            await client.query(
                `INSERT INTO dash_movimentacoes (tenant_id, conta_bancaria_id, financeiro_id, tipo, valor, data_movimentacao, forma_pagamento, observacao)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    tenantId, 
                    parseInt(conta_bancaria_id, 10), 
                    title.id, 
                    (title.tipo || '').trim().toLowerCase() === 'pagar' ? 'Saída' : 'Entrada', 
                    valRecebido, 
                    data_recebimento, 
                    forma_pagamento || 'DINHEIRO', 
                    `Baixa ${isParcial ? 'PARCIAL' : 'TOTAL'}: ${title.descricao}`
                ]
            );
        }

        // 5. Audit Log in dash_financeiro_logs e enfileiramento para o ERP Coliseu (Firebird)
        await client.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, descricao)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                tenantId,
                title.id,
                title.id,
                isParcial ? 'BAIXA_PARCIAL' : 'BAIXA_TOTAL',
                req.user?.nome || 'Operador',
                `Liquidação ${isParcial ? 'Parcial' : 'Total'} efetuada no valor de R$ ${valRecebido.toFixed(2)}. ${isParcial ? `Saldo devedor restante: R$ ${saldoRemanescente.toFixed(2)}` : 'Título 100% quitado.'}`
            ]
        );

        // Enfileiramento da Quitação para o ERP Coliseu (Firebird)
        try {
            await client.query(`
                INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDENTE', 0)
                ON CONFLICT (tenant_id, titulo_id) DO UPDATE
                SET valor_pago = EXCLUDED.valor_pago,
                    data_pagamento = EXCLUDED.data_pagamento,
                    forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, pending_payments.forma_pagamento),
                    id_firebird = COALESCE(EXCLUDED.id_firebird, pending_payments.id_firebird),
                    nosso_numero = COALESCE(EXCLUDED.nosso_numero, pending_payments.nosso_numero),
                    numero_documento = COALESCE(EXCLUDED.numero_documento, pending_payments.numero_documento),
                    status = 'PENDENTE',
                    tentativas = 0,
                    processado_em = NULL,
                    erro_mensagem = NULL;
            `, [
                tenantId,
                title.id,
                title.id_firebird || null,
                title.nosso_numero || null,
                title.numero_documento || null,
                valRecebido,
                data_recebimento || new Date().toISOString(),
                forma_pagamento || 'DINHEIRO'
            ]);
            logger.info('[Financeiro/Quitacao] Quitação enfileirada em pending_payments com sucesso', { tenantId, tituloId: title.id, idFirebird: title.id_firebird, valorPago: valRecebido });
        } catch (penErr) {
            logger.error('[Financeiro/Quitacao] Erro ao enfileirar em pending_payments:', { error: penErr.message, tenantId, tituloId: title.id });
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            status_pagamento: novoStatus,
            valor_pago: novoValorPago,
            saldo_remanescente: saldoRemanescente,
            message: `Baixa ${isParcial ? 'PARCIAL' : 'TOTAL'} registrada com sucesso!`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// POST /api/financeiro/titulos/:id/estornar
// Cancela a quitação de um título liquidado, retornando-o ao status EM ABERTO
router.post('/titulos/:id/estornar', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { id } = req.params;

        const idNum = parseInt(id, 10);
        const { rows } = await db.query(
            `SELECT * FROM dash_financeiro WHERE tenant_id = $1 AND (id = $2 OR id_firebird = $2)`,
            [tenantId, isNaN(idNum) ? -1 : idNum]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Título financeiro não encontrado.' });
        }

        const title = rows[0];

        await db.query(
            `UPDATE dash_financeiro
             SET status_pagamento = 'ABERTO', valor_pago = 0, data_pagamento = NULL
             WHERE tenant_id = $1 AND id = $2`,
            [tenantId, title.id]
        );

        res.json({ success: true, message: 'Quitação cancelada e título estornado para EM ABERTO com sucesso!' });
    } catch (err) {
        next(err);
    }
});

const biGerenciaCache = new Map();
const BI_CACHE_TTL = 60 * 1000; // 60 seconds cache per tenant

router.get('/bi-gerencia', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { period, month, year } = req.query;

        // Base date resolution for dynamic filtering:
        let refDateObj = new Date();
        if (period === 'lastMonth') {
            refDateObj.setMonth(refDateObj.getMonth() - 1);
        } else if (period === 'customMonth' && month && year) {
            refDateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        } else if (period === 'customYear' && year) {
            refDateObj = new Date(parseInt(year, 10), 0, 1);
        } else if (period === 'thisYear') {
            refDateObj = new Date(new Date().getFullYear(), 0, 1);
        }

        const targetDate = `${refDateObj.getFullYear()}-${String(refDateObj.getMonth() + 1).padStart(2, '0')}-01`;

        const cacheKey = `${tenantId}_${period || 'thisMonth'}_${month || ''}_${year || ''}`;
        const now = Date.now();
        const cached = biGerenciaCache.get(cacheKey);
        if (cached && (now - cached.timestamp < BI_CACHE_TTL)) {
            return res.json(cached.data);
        }

        // ── 1. KPIs: target month vs previous month vs month before vs future months ─
        const [rKpiCurrent, rKpiPrev, rKpiRetrasado, rKpiFuturo1, rKpiFuturo2] = await Promise.all([
            db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date) AS titulos_recebidos,
                    COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_recebido,
                    COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date AND f.data_pagamento > f.data_vencimento THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_fora_prazo,
                    COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date AND f.data_pagamento > f.data_vencimento) AS qtd_fora_prazo,
                    COUNT(*) FILTER (WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento < NOW() AND date_trunc('month', f.data_vencimento) = $2::date) AS qtd_inadimplente,
                    COALESCE(SUM(CASE WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento < NOW() AND date_trunc('month', f.data_vencimento) = $2::date THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_inadimplente,
                    COUNT(*) FILTER (WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento >= NOW() AND date_trunc('month', f.data_vencimento) = $2::date) AS qtd_a_receber,
                    COALESCE(SUM(CASE WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento >= NOW() AND date_trunc('month', f.data_vencimento) = $2::date THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_a_receber,
                    COALESCE(SUM(CASE WHEN date_trunc('month', f.data_vencimento) = $2::date THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS total_carteira,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 1 AND 5) AS qtd_1_5,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 1 AND 5 THEN f.valor END), 0) AS val_1_5,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 6 AND 10) AS qtd_6_10,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 6 AND 10 THEN f.valor END), 0) AS val_6_10,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 11 AND 15) AS qtd_11_15,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 11 AND 15 THEN f.valor END), 0) AS val_11_15,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 16 AND 20) AS qtd_16_20,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 16 AND 20 THEN f.valor END), 0) AS val_16_20,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) >= 21) AS qtd_21_31,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) >= 21 THEN f.valor END), 0) AS val_21_31
                FROM dash_financeiro f
                WHERE f.tenant_id = $1
                  AND TRIM(f.tipo) = 'RECEBER'
                  AND COALESCE(f.valor, 0) > 0
            `, [tenantId, targetDate]),
            db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '1 month') AS titulos_recebidos,
                    COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '1 month' THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_recebido,
                    COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '1 month' AND f.data_pagamento > f.data_vencimento THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_fora_prazo,
                    COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '1 month' AND f.data_pagamento > f.data_vencimento) AS qtd_fora_prazo,
                    COUNT(*) FILTER (WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento < NOW() AND date_trunc('month', f.data_vencimento) = $2::date - interval '1 month') AS qtd_inadimplente,
                    COALESCE(SUM(CASE WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento < NOW() AND date_trunc('month', f.data_vencimento) = $2::date - interval '1 month' THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_inadimplente,
                    COALESCE(SUM(CASE WHEN date_trunc('month', f.data_vencimento) = $2::date - interval '1 month' THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS total_carteira
                FROM dash_financeiro f
                WHERE f.tenant_id = $1
                  AND TRIM(f.tipo) = 'RECEBER'
                  AND COALESCE(f.valor, 0) > 0
            `, [tenantId, targetDate]),
            db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '2 month') AS titulos_recebidos,
                    COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '2 month' THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_recebido,
                    COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '2 month' AND f.data_pagamento > f.data_vencimento THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_fora_prazo,
                    COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '2 month' AND f.data_pagamento > f.data_vencimento) AS qtd_fora_prazo,
                    COUNT(*) FILTER (WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento < NOW() AND date_trunc('month', f.data_vencimento) = $2::date - interval '2 month') AS qtd_inadimplente,
                    COALESCE(SUM(CASE WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO') AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0) AND f.data_vencimento < NOW() AND date_trunc('month', f.data_vencimento) = $2::date - interval '2 month' THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_inadimplente,
                    COALESCE(SUM(CASE WHEN date_trunc('month', f.data_vencimento) = $2::date - interval '2 month' THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS total_carteira
                FROM dash_financeiro f
                WHERE f.tenant_id = $1
                  AND TRIM(f.tipo) = 'RECEBER'
                  AND COALESCE(f.valor, 0) > 0
            `, [tenantId, targetDate]),
            db.query(`
                SELECT
                    COUNT(*) AS qtd_a_receber,
                    COALESCE(SUM(f.valor - COALESCE(f.valor_pago, 0)), 0) AS valor_a_receber,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 1 AND 5) AS qtd_1_5,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 1 AND 5 THEN f.valor END), 0) AS val_1_5,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 6 AND 10) AS qtd_6_10,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 6 AND 10 THEN f.valor END), 0) AS val_6_10,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 11 AND 15) AS qtd_11_15,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 11 AND 15 THEN f.valor END), 0) AS val_11_15,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) BETWEEN 16 AND 20) AS qtd_16_20,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) BETWEEN 16 AND 20 THEN f.valor END), 0) AS val_16_20,

                    COUNT(*) FILTER (WHERE EXTRACT(DAY FROM f.data_vencimento) >= 21) AS qtd_21_31,
                    COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM f.data_vencimento) >= 21 THEN f.valor END), 0) AS val_21_31
                FROM dash_financeiro f
                WHERE f.tenant_id = $1
                  AND TRIM(f.tipo) = 'RECEBER'
                  AND TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                  AND COALESCE(f.valor, 0) > 0
                  AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                  AND date_trunc('month', f.data_vencimento) = $2::date + interval '1 month'
            `, [tenantId, targetDate]),
            db.query(`
                SELECT
                    COUNT(*) AS qtd_a_receber,
                    COALESCE(SUM(f.valor - COALESCE(f.valor_pago, 0)), 0) AS valor_a_receber
                FROM dash_financeiro f
                WHERE f.tenant_id = $1
                  AND TRIM(f.tipo) = 'RECEBER'
                  AND TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                  AND COALESCE(f.valor, 0) > 0
                  AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                  AND date_trunc('month', f.data_vencimento) = $2::date + interval '2 month'
            `, [tenantId, targetDate]),
        ]);

        const buildKpiMonth = (row) => {
            const totalCarteira  = parseFloat(row.total_carteira  || 0);
            const valorInadimpl  = parseFloat(row.valor_inadimplente || 0);
            return {
                titulos_recebidos:   parseInt(row.titulos_recebidos   || 0, 10),
                valor_recebido:      parseFloat(row.valor_recebido    || 0),
                valor_fora_prazo:    parseFloat(row.valor_fora_prazo  || 0),
                qtd_fora_prazo:      parseInt(row.qtd_fora_prazo      || 0, 10),
                qtd_inadimplente:    parseInt(row.qtd_inadimplente     || 0, 10),
                valor_inadimplente:  valorInadimpl,
                valor_a_receber:     parseFloat(row.valor_a_receber   || 0),
                qtd_a_receber:       parseInt(row.qtd_a_receber       || 0, 10),
                inadimplencia_pct:   totalCarteira > 0
                    ? Number(((valorInadimpl / totalCarteira) * 100).toFixed(2))
                    : 0,
                total_carteira:      totalCarteira,
                vencimentos_faixas: {
                    dias_1_5:   { qtd: parseInt(row.qtd_1_5   || 0, 10), valor: parseFloat(row.val_1_5   || 0) },
                    dias_6_10:  { qtd: parseInt(row.qtd_6_10  || 0, 10), valor: parseFloat(row.val_6_10  || 0) },
                    dias_11_15: { qtd: parseInt(row.qtd_11_15 || 0, 10), valor: parseFloat(row.val_11_15 || 0) },
                    dias_16_20: { qtd: parseInt(row.qtd_16_20 || 0, 10), valor: parseFloat(row.val_16_20 || 0) },
                    dias_21_31: { qtd: parseInt(row.qtd_21_31 || 0, 10), valor: parseFloat(row.val_21_31 || 0) },
                }
            };
        };

        const dNext1 = new Date();
        dNext1.setMonth(dNext1.getMonth() + 1);
        const labelFuturo1 = dNext1.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const dNext2 = new Date();
        dNext2.setMonth(dNext2.getMonth() + 2);
        const labelFuturo2 = dNext2.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const fut1Row = rKpiFuturo1.rows[0] || {};

        const kpis = {
            mes_atual:     buildKpiMonth(rKpiCurrent.rows[0]   || {}),
            mes_anterior:  buildKpiMonth(rKpiPrev.rows[0]      || {}),
            mes_retrasado: buildKpiMonth(rKpiRetrasado.rows[0] || {}),
            mes_futuro_1: {
                label: labelFuturo1.charAt(0).toUpperCase() + labelFuturo1.slice(1),
                valor_a_receber: parseFloat(fut1Row.valor_a_receber || 0),
                qtd_a_receber: parseInt(fut1Row.qtd_a_receber || 0, 10),
                vencimentos_faixas: {
                    dias_1_5:   { qtd: parseInt(fut1Row.qtd_1_5   || 0, 10), valor: parseFloat(fut1Row.val_1_5   || 0) },
                    dias_6_10:  { qtd: parseInt(fut1Row.qtd_6_10  || 0, 10), valor: parseFloat(fut1Row.val_6_10  || 0) },
                    dias_11_15: { qtd: parseInt(fut1Row.qtd_11_15 || 0, 10), valor: parseFloat(fut1Row.val_11_15 || 0) },
                    dias_16_20: { qtd: parseInt(fut1Row.qtd_16_20 || 0, 10), valor: parseFloat(fut1Row.val_16_20 || 0) },
                    dias_21_31: { qtd: parseInt(fut1Row.qtd_21_31 || 0, 10), valor: parseFloat(fut1Row.val_21_31 || 0) },
                }
            },
            mes_futuro_2: {
                label: labelFuturo2.charAt(0).toUpperCase() + labelFuturo2.slice(1),
                valor_a_receber: parseFloat(rKpiFuturo2.rows[0]?.valor_a_receber || 0),
                qtd_a_receber: parseInt(rKpiFuturo2.rows[0]?.qtd_a_receber || 0, 10),
            },
        };

        // ── 2. Evolução Mensal – last 13 months ───────────────────────────────
        const rEvolucao = await db.query(`
            SELECT
                to_char(date_trunc('month', COALESCE(data_pagamento, data_vencimento)), 'YYYY-MM') AS mes,
                COUNT(*)                                                               AS total_titulos,
                COUNT(*) FILTER (
                    WHERE (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
                )                                                                      AS titulos_recebidos,
                COUNT(*) FILTER (
                    WHERE (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
                      AND COALESCE(data_pagamento, data_vencimento) <= data_vencimento
                )                                                                      AS recebidos_no_prazo,
                COUNT(*) FILTER (
                    WHERE (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
                      AND data_pagamento > data_vencimento
                )                                                                      AS recebidos_fora_prazo,
                COUNT(*) FILTER (
                    WHERE TRIM(status_pagamento) = 'ABERTO'
                      AND COALESCE(valor_pago, 0) < valor
                      AND data_vencimento < NOW()
                )                                                                      AS inadimplentes,
                COALESCE(SUM(valor), 0)                                                AS valor_total,
                COALESCE(SUM(CASE WHEN (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) THEN COALESCE(NULLIF(valor_pago, 0), valor) END), 0) AS valor_recebido,
                COALESCE(SUM(CASE WHEN (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND data_pagamento > data_vencimento THEN COALESCE(NULLIF(valor_pago, 0), valor) END), 0) AS valor_fora_prazo
            FROM dash_financeiro
            WHERE tenant_id = $1
              AND TRIM(tipo) = 'RECEBER'
              AND COALESCE(valor, 0) > 0
              AND TRIM(status_pagamento) != 'CANCELADO'
              AND date_trunc('month', COALESCE(data_pagamento, data_vencimento)) >= date_trunc('month', NOW()) - interval '12 months'
              AND date_trunc('month', COALESCE(data_pagamento, data_vencimento)) <= date_trunc('month', NOW())
            GROUP BY date_trunc('month', COALESCE(data_pagamento, data_vencimento))
            ORDER BY date_trunc('month', COALESCE(data_pagamento, data_vencimento)) ASC
        `, [tenantId]);

        const evolucao_mensal = rEvolucao.rows.map(r => ({
            mes:                    r.mes,
            total_titulos:          parseInt(r.total_titulos         || 0, 10),
            titulos_recebidos:      parseInt(r.titulos_recebidos     || (r.recebidos_no_prazo + r.recebidos_fora_prazo) || 0, 10),
            recebidos_no_prazo:     parseInt(r.recebidos_no_prazo    || 0, 10),
            recebidos_fora_prazo:   parseInt(r.recebidos_fora_prazo  || 0, 10),
            inadimplentes:          parseInt(r.inadimplentes         || 0, 10),
            valor_total:            parseFloat(r.valor_total         || 0),
            valor_recebido:         parseFloat(r.valor_recebido      || 0),
            valor_fora_prazo:       parseFloat(r.valor_fora_prazo    || 0),
        }));

        // ── 3. Inadimplência Aging – last 6 months, by bucket (Apenas Clientes Ativos) ──
        const rAging = await db.query(`
            SELECT
                to_char(date_trunc('month', f.data_vencimento), 'YYYY-MM') AS mes,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) != 'PAGO'
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) BETWEEN 1  AND 30
                )                                                          AS aging_1_30,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) != 'PAGO'
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) BETWEEN 31 AND 60
                )                                                          AS aging_31_60,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) != 'PAGO'
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) BETWEEN 61 AND 90
                )                                                          AS aging_61_90,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) != 'PAGO'
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) > 90
                )                                                          AS aging_mais_90,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) != 'PAGO' AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) BETWEEN 1 AND 30
                    THEN f.valor END), 0)                                    AS valor_1_30,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) != 'PAGO' AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) BETWEEN 31 AND 60
                    THEN f.valor END), 0)                                    AS valor_31_60,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) != 'PAGO' AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) BETWEEN 61 AND 90
                    THEN f.valor END), 0)                                    AS valor_61_90,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) != 'PAGO' AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) > 90
                    THEN f.valor END), 0)                                    AS valor_mais_90
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c
              ON f.tenant_id = c.tenant_id
             AND f.cliente_id_firebird = c.id_firebird
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND COALESCE(f.valor, 0) > 0
              AND TRIM(f.status_pagamento) != 'CANCELADO'
              AND (c.ativo IS TRUE OR c.ativo IS NULL)
              AND date_trunc('month', f.data_vencimento) >= date_trunc('month', NOW()) - interval '5 months'
              AND date_trunc('month', f.data_vencimento) <= date_trunc('month', NOW())
            GROUP BY date_trunc('month', f.data_vencimento)
            ORDER BY date_trunc('month', f.data_vencimento) ASC
        `, [tenantId]);

        const inadimplencia_aging = rAging.rows.map(r => ({
            mes:           r.mes,
            aging_1_30:    { qtd: parseInt(r.aging_1_30    || 0, 10), valor: parseFloat(r.valor_1_30    || 0) },
            aging_31_60:   { qtd: parseInt(r.aging_31_60   || 0, 10), valor: parseFloat(r.valor_31_60   || 0) },
            aging_61_90:   { qtd: parseInt(r.aging_61_90   || 0, 10), valor: parseFloat(r.valor_61_90   || 0) },
            aging_mais_90: { qtd: parseInt(r.aging_mais_90 || 0, 10), valor: parseFloat(r.valor_mais_90 || 0) },
        }));

        // ── 3b. Summary of Aging for Total Active Overdue Portfolio ─
        const rAgingSummary = await db.query(`
            SELECT
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                      AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) BETWEEN 1 AND 30
                ) AS aging_1_30,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                      AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) BETWEEN 31 AND 60
                ) AS aging_31_60,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                      AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) BETWEEN 61 AND 90
                ) AS aging_61_90,
                COUNT(*) FILTER (
                    WHERE TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                      AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                      AND f.data_vencimento < NOW()
                      AND (NOW()::date - f.data_vencimento::date) > 90
                ) AS aging_mais_90,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                         AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                         AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) BETWEEN 1 AND 30
                    THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_1_30,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                         AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                         AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) BETWEEN 31 AND 60
                    THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_31_60,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                         AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                         AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) BETWEEN 61 AND 90
                    THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_61_90,
                COALESCE(SUM(CASE
                    WHEN TRIM(f.status_pagamento) NOT IN ('PAGO', 'CANCELADO')
                         AND COALESCE(f.valor, 0) > COALESCE(f.valor_pago, 0)
                         AND f.data_vencimento < NOW()
                         AND (NOW()::date - f.data_vencimento::date) > 90
                    THEN (f.valor - COALESCE(f.valor_pago, 0)) END), 0) AS valor_mais_90
            FROM dash_financeiro f
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND COALESCE(f.valor, 0) > 0
        `, [tenantId]);

        const agingSumRow = rAgingSummary.rows[0] || {};
        const inadimplencia_aging_summary = {
            aging_1_30:    { qtd: parseInt(agingSumRow.aging_1_30    || 0, 10), valor: parseFloat(agingSumRow.valor_1_30    || 0) },
            aging_31_60:   { qtd: parseInt(agingSumRow.aging_31_60   || 0, 10), valor: parseFloat(agingSumRow.valor_31_60   || 0) },
            aging_61_90:   { qtd: parseInt(agingSumRow.aging_61_90   || 0, 10), valor: parseFloat(agingSumRow.valor_61_90   || 0) },
            aging_mais_90: { qtd: parseInt(agingSumRow.aging_mais_90 || 0, 10), valor: parseFloat(agingSumRow.valor_mais_90 || 0) },
        };

        // ── 3c. Recuperação Faixas & Média de Atraso no Mês ─────────────────
        const rRecuperacaoFaixas = await db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_total_pago,
                COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)) AS qtd_total_pago,

                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND COALESCE(f.data_pagamento, f.data_vencimento) <= f.data_vencimento THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_no_prazo,
                COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND COALESCE(f.data_pagamento, f.data_vencimento) <= f.data_vencimento) AS qtd_no_prazo,

                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND (COALESCE(f.data_pagamento, f.data_vencimento)::date - f.data_vencimento::date) BETWEEN 1 AND 10 THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_1_10_dias,
                COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND (COALESCE(f.data_pagamento, f.data_vencimento)::date - f.data_vencimento::date) BETWEEN 1 AND 10) AS qtd_1_10_dias,

                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND (COALESCE(f.data_pagamento, f.data_vencimento)::date - f.data_vencimento::date) > 10 THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_mais_10_dias,
                COUNT(*) FILTER (WHERE (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND (COALESCE(f.data_pagamento, f.data_vencimento)::date - f.data_vencimento::date) > 10) AS qtd_mais_10_dias,

                COALESCE(AVG(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND COALESCE(f.data_pagamento, f.data_vencimento) > f.data_vencimento THEN (COALESCE(f.data_pagamento, f.data_vencimento)::date - f.data_vencimento::date) END), 0) AS media_dias_atraso
            FROM dash_financeiro f
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND COALESCE(f.valor, 0) > 0
              AND (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)
              AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', NOW())
        `, [tenantId]);

        const recRow = rRecuperacaoFaixas.rows[0] || {};
        const totalPagoVal = parseFloat(recRow.valor_total_pago || 0);

        const recuperacao_faixas = {
            media_dias_atraso: parseFloat(parseFloat(recRow.media_dias_atraso || 0).toFixed(1)),
            no_dia: {
                valor: parseFloat(recRow.valor_no_prazo || 0),
                qtd: parseInt(recRow.qtd_no_prazo || 0, 10),
                pct: totalPagoVal > 0 ? Number(((parseFloat(recRow.valor_no_prazo || 0) / totalPagoVal) * 100).toFixed(1)) : 0
            },
            dias_1_10: {
                valor: parseFloat(recRow.valor_1_10_dias || 0),
                qtd: parseInt(recRow.qtd_1_10_dias || 0, 10),
                pct: totalPagoVal > 0 ? Number(((parseFloat(recRow.valor_1_10_dias || 0) / totalPagoVal) * 100).toFixed(1)) : 0
            },
            mais_10_dias: {
                valor: parseFloat(recRow.valor_mais_10_dias || 0),
                qtd: parseInt(recRow.qtd_mais_10_dias || 0, 10),
                pct: totalPagoVal > 0 ? Number(((parseFloat(recRow.valor_mais_10_dias || 0) / totalPagoVal) * 100).toFixed(1)) : 0
            }
        };

        // ── 4. Carteira de Clientes – last 13 months ─────────────────────────
        const rCarteira = await db.query(`
            WITH primeira_ocorrencia AS (
                SELECT
                    cliente_id_firebird,
                    MIN(date_trunc('month', data_vencimento)) AS primeiro_mes
                FROM dash_financeiro
                WHERE tenant_id = $1
                  AND TRIM(tipo) = 'RECEBER'
                  AND cliente_id_firebird IS NOT NULL
                GROUP BY cliente_id_firebird
            )
            SELECT
                to_char(m.mes, 'YYYY-MM')                    AS mes,
                COUNT(DISTINCT df.cliente_id_firebird)        AS clientes_ativos,
                COUNT(DISTINCT CASE
                    WHEN po.primeiro_mes = m.mes THEN df.cliente_id_firebird
                END)                                          AS clientes_novos
            FROM (
                SELECT generate_series(
                    date_trunc('month', NOW()) - interval '12 months',
                    date_trunc('month', NOW()),
                    interval '1 month'
                ) AS mes
            ) m
            LEFT JOIN dash_financeiro df
                ON df.tenant_id = $1
               AND TRIM(df.tipo) = 'RECEBER'
               AND df.cliente_id_firebird IS NOT NULL
               AND date_trunc('month', df.data_vencimento) = m.mes
            LEFT JOIN primeira_ocorrencia po
                ON po.cliente_id_firebird = df.cliente_id_firebird
            GROUP BY m.mes
            ORDER BY m.mes ASC
        `, [tenantId]);

        const carteira_clientes = rCarteira.rows.map(r => ({
            mes:            r.mes,
            clientes_ativos: parseInt(r.clientes_ativos || 0, 10),
            clientes_novos:  parseInt(r.clientes_novos  || 0, 10),
        }));

        // ── 4b. Aquisição de Clientes Resumo (Mês Atual, Mês Anterior, YTD Atual, YTD Anterior) ──
        const rAquisicao = await db.query(`
            WITH primeira_transacao AS (
                SELECT
                    cliente_id_firebird,
                    MIN(date_trunc('month', data_vencimento)) AS mes_primeiro
                FROM dash_financeiro
                WHERE tenant_id = $1
                  AND TRIM(tipo) = 'RECEBER'
                  AND cliente_id_firebird IS NOT NULL
                GROUP BY cliente_id_firebird
            )
            SELECT
                COUNT(*) FILTER (WHERE mes_primeiro = date_trunc('month', $2::date)) AS novos_mes_atual,
                COUNT(*) FILTER (WHERE mes_primeiro = date_trunc('month', $2::date) - interval '1 month') AS novos_mes_anterior,
                COUNT(*) FILTER (
                    WHERE date_trunc('year', mes_primeiro) = date_trunc('year', $2::date)
                      AND EXTRACT(MONTH FROM mes_primeiro) <= EXTRACT(MONTH FROM $2::date)
                ) AS novos_ytd_atual,
                COUNT(*) FILTER (
                    WHERE date_trunc('year', mes_primeiro) = date_trunc('year', $2::date - interval '1 year')
                      AND EXTRACT(MONTH FROM mes_primeiro) <= EXTRACT(MONTH FROM $2::date)
                ) AS novos_ytd_anterior
            FROM primeira_transacao
        `, [tenantId, targetDate]);

        const acqRow = rAquisicao.rows[0] || {};
        const novosMesAtual = parseInt(acqRow.novos_mes_atual || 0, 10);
        const novosMesAnt = parseInt(acqRow.novos_mes_anterior || 0, 10);
        const novosYtdAtual = parseInt(acqRow.novos_ytd_atual || 0, 10);
        const novosYtdAnt = parseInt(acqRow.novos_ytd_anterior || 0, 10);

        const aquisicao_resumo = {
            mes_atual: novosMesAtual,
            mes_anterior: novosMesAnt,
            mom_pct: novosMesAnt > 0 ? Number((((novosMesAtual - novosMesAnt) / novosMesAnt) * 100).toFixed(1)) : 0,
            ytd_atual: novosYtdAtual,
            ytd_anterior: novosYtdAnt,
            yoy_pct: novosYtdAnt > 0 ? Number((((novosYtdAtual - novosYtdAnt) / novosYtdAnt) * 100).toFixed(1)) : 0,
        };

        // ── 4c. Clientes por Classe do Cadastro (Quantidade & Valor Recebido - Mês Atual e Mês Anterior) ──
        const rClassesAtual = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(c.classificacao::text), ''), 'Padrão / Sem Classe') AS classe,
                COUNT(DISTINCT f.cliente_id_firebird) AS qtd_clientes,
                COALESCE(SUM(COALESCE(f.valor_pago, f.valor)), 0) AS valor_recebido
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND TRIM(f.status_pagamento) = 'PAGO'
              AND (
                date_trunc('month', f.data_pagamento) = date_trunc('month', $2::date)
                OR (f.data_pagamento IS NULL AND date_trunc('month', f.data_vencimento) = date_trunc('month', $2::date))
              )
              AND c.ativo IS TRUE
            GROUP BY COALESCE(NULLIF(TRIM(c.classificacao::text), ''), 'Padrão / Sem Classe')
            ORDER BY valor_recebido DESC
        `, [tenantId, targetDate]);

        const rClassesAnterior = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(c.classificacao::text), ''), 'Padrão / Sem Classe') AS classe,
                COUNT(DISTINCT f.cliente_id_firebird) AS qtd_clientes,
                COALESCE(SUM(COALESCE(f.valor_pago, f.valor)), 0) AS valor_recebido
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)
              AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', $2::date) - interval '1 month'
            GROUP BY COALESCE(NULLIF(TRIM(c.classificacao::text), ''), 'Padrão / Sem Classe')
            ORDER BY valor_recebido DESC
        `, [tenantId, targetDate]);

        // ── 4d. Plano de Contas / Centro de Custo Recebido ───────────────────
        const rPlanoAtual = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(f.centro_custo::text), ''), NULLIF(TRIM(f.tipo_documento::text), ''), 'Mensalidade / Serviço') AS plano_contas,
                COUNT(*) AS qtd_titulos,
                COALESCE(SUM(COALESCE(NULLIF(f.valor_pago, 0), f.valor)), 0) AS valor_total
            FROM dash_financeiro f
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)
              AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', $2::date)
            GROUP BY 1
            ORDER BY valor_total DESC
        `, [tenantId, targetDate]);

        const rPlanoAnterior = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(f.centro_custo::text), ''), NULLIF(TRIM(f.tipo_documento::text), ''), 'Mensalidade / Serviço') AS plano_contas,
                COUNT(*) AS qtd_titulos,
                COALESCE(SUM(COALESCE(NULLIF(f.valor_pago, 0), f.valor)), 0) AS valor_total
            FROM dash_financeiro f
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)
              AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', $2::date) - interval '1 month'
            GROUP BY 1
            ORDER BY valor_total DESC
        `, [tenantId, targetDate]);

        // ── 4e. Top 50 Clientes com Maior Saldo Recebido ────────────────────
        const rTop50Atual = await db.query(`
            SELECT
                COALESCE(c.id_firebird, f.cliente_id_firebird) AS id_firebird,
                COALESCE(TRIM(c.nome), TRIM(f.cliente_nome), 'Cliente #' || f.cliente_id_firebird::text) AS nome_cliente,
                COALESCE(NULLIF(TRIM(c.classificacao::text), ''), 'Padrão') AS classe,
                COUNT(f.id) AS qtd_titulos,
                COALESCE(SUM(COALESCE(NULLIF(f.valor_pago, 0), f.valor)), 0) AS valor_recebido
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)
              AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', $2::date)
            GROUP BY COALESCE(c.id_firebird, f.cliente_id_firebird), c.nome, f.cliente_nome, c.classificacao, f.cliente_id_firebird
            ORDER BY valor_recebido DESC
            LIMIT 50
        `, [tenantId, targetDate]);

        const rTop50Anterior = await db.query(`
            SELECT
                COALESCE(c.id_firebird, f.cliente_id_firebird) AS id_firebird,
                COALESCE(TRIM(c.nome), TRIM(f.cliente_nome), 'Cliente #' || f.cliente_id_firebird::text) AS nome_cliente,
                COALESCE(NULLIF(TRIM(c.classificacao::text), ''), 'Padrão') AS classe,
                COUNT(f.id) AS qtd_titulos,
                COALESCE(SUM(COALESCE(NULLIF(f.valor_pago, 0), f.valor)), 0) AS valor_recebido
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
            WHERE f.tenant_id = $1
              AND TRIM(f.tipo) = 'RECEBER'
              AND (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0)
              AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', $2::date) - interval '1 month'
            GROUP BY COALESCE(c.id_firebird, f.cliente_id_firebird), c.nome, f.cliente_nome, c.classificacao, f.cliente_id_firebird
            ORDER BY valor_recebido DESC
            LIMIT 50
        `, [tenantId, targetDate]);

        // ── 8. Estatísticas por Região (Cidade / Estado) ──
        const rRegiaoAtual = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(c.cidade::text), ''), 'NÃO INFORMADO') || ' - ' || COALESCE(NULLIF(TRIM(c.estado::text), ''), 'MS') AS regiao,
                COUNT(DISTINCT c.id_firebird) AS qtd_clientes,
                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_recebido
            FROM dash_clientes c
            LEFT JOIN dash_financeiro f 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
             AND TRIM(f.tipo) = 'RECEBER'
            WHERE c.tenant_id = $1
            GROUP BY 1 ORDER BY valor_recebido DESC, qtd_clientes DESC
        `, [tenantId, targetDate]);

        const rRegiaoAnterior = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(c.cidade::text), ''), 'NÃO INFORMADO') || ' - ' || COALESCE(NULLIF(TRIM(c.estado::text), ''), 'MS') AS regiao,
                COUNT(DISTINCT c.id_firebird) AS qtd_clientes,
                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = $2::date - interval '1 month' THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_recebido
            FROM dash_clientes c
            LEFT JOIN dash_financeiro f 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
             AND TRIM(f.tipo) = 'RECEBER'
            WHERE c.tenant_id = $1
            GROUP BY 1 ORDER BY valor_recebido DESC, qtd_clientes DESC
        `, [tenantId, targetDate]);

        // ── 9. Estatísticas por Regime Tributário ──
        const rRegimeAtual = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(c.regime_tributario::text), ''), 'Simples Nacional / MEI') AS regime,
                COUNT(DISTINCT c.id_firebird) AS qtd_clientes,
                COALESCE(SUM(CASE WHEN (TRIM(f.status_pagamento) = 'PAGO' OR COALESCE(f.valor_pago, 0) > 0) AND date_trunc('month', COALESCE(f.data_pagamento, f.data_vencimento)) = date_trunc('month', NOW()) THEN COALESCE(NULLIF(f.valor_pago, 0), f.valor) END), 0) AS valor_recebido
            FROM dash_clientes c
            LEFT JOIN dash_financeiro f 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
             AND TRIM(f.tipo) = 'RECEBER'
            WHERE c.tenant_id = $1 AND c.ativo IS TRUE
            GROUP BY 1 ORDER BY valor_recebido DESC, qtd_clientes DESC
        `, [tenantId]);

        const rRegimeAnterior = await db.query(`
            SELECT
                COALESCE(NULLIF(TRIM(c.regime_tributario::text), ''), 'Simples Nacional / MEI') AS regime,
                COUNT(DISTINCT c.id_firebird) AS qtd_clientes,
                COALESCE(SUM(CASE WHEN TRIM(f.status_pagamento) = 'PAGO' AND (date_trunc('month', f.data_pagamento) = date_trunc('month', NOW()) - interval '1 month' OR (f.data_pagamento IS NULL AND date_trunc('month', f.data_vencimento) = date_trunc('month', NOW()) - interval '1 month')) THEN COALESCE(f.valor_pago, f.valor) END), 0) AS valor_recebido
            FROM dash_clientes c
            LEFT JOIN dash_financeiro f 
              ON f.tenant_id = c.tenant_id 
             AND f.cliente_id_firebird = c.id_firebird
             AND TRIM(f.tipo) = 'RECEBER'
            WHERE c.tenant_id = $1 AND c.ativo IS TRUE
            GROUP BY 1 ORDER BY valor_recebido DESC, qtd_clientes DESC
        `, [tenantId]);

        const clientes_por_classe = {
            mes_atual: rClassesAtual.rows.map(r => ({
                classe: r.classe,
                qtd_clientes: parseInt(r.qtd_clientes || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
            mes_anterior: rClassesAnterior.rows.map(r => ({
                classe: r.classe,
                qtd_clientes: parseInt(r.qtd_clientes || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
        };

        const estatisticas_regiao = {
            mes_atual: rRegiaoAtual.rows.map(r => ({
                regiao: r.regiao,
                qtd_clientes: parseInt(r.qtd_clientes || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
            mes_anterior: rRegiaoAnterior.rows.map(r => ({
                regiao: r.regiao,
                qtd_clientes: parseInt(r.qtd_clientes || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
        };

        const estatisticas_regime = {
            mes_atual: rRegimeAtual.rows.map(r => ({
                regime: r.regime,
                qtd_clientes: parseInt(r.qtd_clientes || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
            mes_anterior: rRegimeAnterior.rows.map(r => ({
                regime: r.regime,
                qtd_clientes: parseInt(r.qtd_clientes || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
        };

        const plano_contas_recebido = {
            mes_atual: rPlanoAtual.rows.map(r => ({
                plano_contas: r.plano_contas,
                qtd_titulos: parseInt(r.qtd_titulos || 0, 10),
                valor_total: parseFloat(r.valor_total || 0),
            })),
            mes_anterior: rPlanoAnterior.rows.map(r => ({
                plano_contas: r.plano_contas,
                qtd_titulos: parseInt(r.qtd_titulos || 0, 10),
                valor_total: parseFloat(r.valor_total || 0),
            })),
        };

        const top50_clientes = {
            mes_atual: rTop50Atual.rows.map(r => ({
                id_firebird: r.id_firebird,
                nome_cliente: r.nome_cliente,
                classe: r.classe,
                qtd_titulos: parseInt(r.qtd_titulos || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
            mes_anterior: rTop50Anterior.rows.map(r => ({
                id_firebird: r.id_firebird,
                nome_cliente: r.nome_cliente,
                classe: r.classe,
                qtd_titulos: parseInt(r.qtd_titulos || 0, 10),
                valor_recebido: parseFloat(r.valor_recebido || 0),
            })),
        };

        // ── 8. Estatísticas Gerais do Cadastro, Regime Tributário, Módulos e Servidores ──
        const rClasseFull = await db.query(`
            SELECT COALESCE(NULLIF(TRIM(classificacao::text), ''), 'NÃO DEFINIDO') AS classe, COUNT(*) AS qtd
            FROM dash_clientes
            WHERE tenant_id = $1 AND (ativo IS TRUE OR ativo IS NULL)
            GROUP BY 1 ORDER BY qtd DESC
        `, [tenantId]);

        const rRegimeFull = await db.query(`
            SELECT COALESCE(NULLIF(TRIM(regime_tributario::text), ''), 'Simples Nacional') AS regime, COUNT(*) AS qtd
            FROM dash_clientes
            WHERE tenant_id = $1 AND (ativo IS TRUE OR ativo IS NULL)
            GROUP BY 1 ORDER BY qtd DESC
        `, [tenantId]);

        const rSoftFull = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE TRIM(usa_nfe) IN ('SIM', 'TRUE', '1')) AS nfe,
                COUNT(*) FILTER (WHERE TRIM(usa_nfce) IN ('SIM', 'TRUE', '1')) AS nfce,
                COUNT(*) FILTER (WHERE TRIM(usa_nfse) IN ('SIM', 'TRUE', '1')) AS nfse,
                COUNT(*) FILTER (WHERE TRIM(usa_mdfe) IN ('SIM', 'TRUE', '1')) AS mdfe,
                COUNT(*) FILTER (WHERE TRIM(usa_cte) IN ('SIM', 'TRUE', '1')) AS cte,
                COUNT(*) FILTER (WHERE TRIM(usa_sped) IN ('SIM', 'TRUE', '1')) AS sped,
                COUNT(*) FILTER (WHERE TRIM(usa_boleto) IN ('SIM', 'TRUE', '1')) AS boleto,
                COUNT(*) FILTER (WHERE TRIM(usa_folha) IN ('SIM', 'TRUE', '1')) AS folha,
                COUNT(*) FILTER (WHERE TRIM(usa_whats) IN ('SIM', 'TRUE', '1')) AS whats,
                COUNT(*) FILTER (WHERE TRIM(usa_pix) IN ('SIM', 'TRUE', '1')) AS pix,
                COUNT(*) FILTER (WHERE TRIM(usa_cobranca) IN ('SIM', 'TRUE', '1')) AS cobranca,
                COUNT(*) FILTER (WHERE TRIM(usa_os) IN ('SIM', 'TRUE', '1')) AS os,
                COUNT(*) FILTER (WHERE TRIM(usa_sales) IN ('SIM', 'TRUE', '1')) AS sales,
                COUNT(*) FILTER (WHERE TRIM(usa_dash) IN ('SIM', 'TRUE', '1')) AS dash,
                COUNT(*) FILTER (WHERE TRIM(usa_coletor) IN ('SIM', 'TRUE', '1')) AS coletor
            FROM dash_estatisticas_software
            WHERE tenant_id = $1
        `, [tenantId]).catch(() => ({ rows: [] }));

        const rServidorFull = await db.query(`
            SELECT COALESCE(NULLIF(TRIM(servidor::text), ''), 'LOCAL / PRINCIPAL') AS servidor, COUNT(*) AS qtd
            FROM dash_estatisticas_software
            WHERE tenant_id = $1
            GROUP BY 1 ORDER BY qtd DESC
        `, [tenantId]).catch(() => ({ rows: [] }));

        const estatisticas_gerais = {
            classes: rClasseFull.rows.map(r => ({ classe: r.classe, qtd: parseInt(r.qtd, 10) })),
            regimes: rRegimeFull.rows.map(r => ({ regime: r.regime, qtd: parseInt(r.qtd, 10) })),
            modulos: rSoftFull.rows[0] || {},
            servidores: rServidorFull.rows.map(r => ({ servidor: r.servidor, qtd: parseInt(r.qtd, 10) }))
        };

        // ── 5. Comparativo MoM detalhado ──────────────────────────────────────
        const pct = (curr, prev) =>
            prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(2)) : null;

        const cur  = kpis.mes_atual;
        const prev = kpis.mes_anterior;

        const comparativo_mom = {
            titulos_recebidos: {
                atual:     cur.titulos_recebidos,
                anterior:  prev.titulos_recebidos,
                variacao:  cur.titulos_recebidos - prev.titulos_recebidos,
                variacao_pct: pct(cur.titulos_recebidos, prev.titulos_recebidos),
            },
            valor_recebido: {
                atual:     cur.valor_recebido,
                anterior:  prev.valor_recebido,
                variacao:  Number((cur.valor_recebido - prev.valor_recebido).toFixed(2)),
                variacao_pct: pct(cur.valor_recebido, prev.valor_recebido),
            },
            valor_fora_prazo: {
                atual:     cur.valor_fora_prazo,
                anterior:  prev.valor_fora_prazo,
                variacao:  Number((cur.valor_fora_prazo - prev.valor_fora_prazo).toFixed(2)),
                variacao_pct: pct(cur.valor_fora_prazo, prev.valor_fora_prazo),
            },
            inadimplencia_pct: {
                atual:     cur.inadimplencia_pct,
                anterior:  prev.inadimplencia_pct,
                variacao:  Number((cur.inadimplencia_pct - prev.inadimplencia_pct).toFixed(2)),
            },
            qtd_inadimplente: {
                atual:     cur.qtd_inadimplente,
                anterior:  prev.qtd_inadimplente,
                variacao:  cur.qtd_inadimplente - prev.qtd_inadimplente,
                variacao_pct: pct(cur.qtd_inadimplente, prev.qtd_inadimplente),
            },
        };

        // ── 6. Comparativo YoY (Ano Atual vs. Ano Anterior) ────────────────
        const rYoY = await db.query(`
            SELECT
                EXTRACT(MONTH FROM COALESCE(data_pagamento, data_vencimento))::int AS mes_num,
                to_char(COALESCE(data_pagamento, data_vencimento), 'Mon') AS mes_nome,
                COALESCE(SUM(CASE WHEN (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND EXTRACT(YEAR FROM COALESCE(data_pagamento, data_vencimento)) = EXTRACT(YEAR FROM NOW()) THEN COALESCE(NULLIF(valor_pago, 0), valor) END), 0) AS valor_atual,
                COALESCE(SUM(CASE WHEN (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0) AND EXTRACT(YEAR FROM COALESCE(data_pagamento, data_vencimento)) = EXTRACT(YEAR FROM NOW()) - 1 THEN COALESCE(NULLIF(valor_pago, 0), valor) END), 0) AS valor_anterior,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM NOW()) THEN valor END), 0) AS previsto_atual,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM NOW()) - 1 THEN valor END), 0) AS previsto_anterior
            FROM dash_financeiro
            WHERE tenant_id = $1
              AND TRIM(tipo) = 'RECEBER'
              AND COALESCE(valor, 0) > 0
              AND COALESCE(data_pagamento, data_vencimento) >= date_trunc('year', NOW() - interval '1 year')
            GROUP BY EXTRACT(MONTH FROM COALESCE(data_pagamento, data_vencimento)), to_char(COALESCE(data_pagamento, data_vencimento), 'Mon')
            ORDER BY mes_num
        `, [tenantId]);

        const yoy_mensal = rYoY.rows.map(r => ({
            mes_num:           parseInt(r.mes_num, 10),
            mes_nome:          r.mes_nome,
            valor_atual:       parseFloat(r.valor_atual || 0),
            valor_anterior:    parseFloat(r.valor_anterior || 0),
            previsto_atual:    parseFloat(r.previsto_atual || 0),
            previsto_anterior: parseFloat(r.previsto_anterior || 0),
        }));

        // ── 7. Top 5 Meses Anteriores que Mais Contribuíram em Recuperação ────
        const rRecupTop = await db.query(`
            SELECT
                to_char(date_trunc('month', data_vencimento), 'YYYY-MM') AS mes_origem,
                to_char(date_trunc('month', data_vencimento), 'Mon/YYYY') AS mes_origem_label,
                COUNT(*) AS total_titulos,
                COALESCE(SUM(COALESCE(NULLIF(valor_pago, 0), valor)), 0) AS valor_recuperado
            FROM dash_financeiro
            WHERE tenant_id = $1
              AND TRIM(tipo) = 'RECEBER'
              AND COALESCE(valor, 0) > 0
              AND (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
              AND COALESCE(data_pagamento, data_vencimento) > data_vencimento
            GROUP BY date_trunc('month', data_vencimento), to_char(data_vencimento, 'Mon/YYYY')
            ORDER BY valor_recuperado DESC
            LIMIT 5
        `, [tenantId]);

        const recuperacao_top_meses = rRecupTop.rows.map(r => ({
            mes_origem:       r.mes_origem,
            mes_origem_label: r.mes_origem_label,
            total_titulos:    parseInt(r.total_titulos || 0, 10),
            valor_recuperado: parseFloat(r.valor_recuperado || 0),
        }));

        // ── 8. Comparativo MTD (Month-To-Date: até o dia X do mês atual vs dia X do mês anterior) ──
        const rMtd = await db.query(`
            SELECT
                COALESCE(SUM(CASE
                    WHEN (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
                     AND date_trunc('month', COALESCE(data_pagamento, data_vencimento)) = date_trunc('month', NOW())
                     AND EXTRACT(DAY FROM COALESCE(data_pagamento, data_vencimento)) <= EXTRACT(DAY FROM NOW())
                    THEN COALESCE(NULLIF(valor_pago, 0), valor)
                END), 0) AS valor_mtd_atual,
                COALESCE(SUM(CASE
                    WHEN (TRIM(status_pagamento) = 'PAGO' OR COALESCE(valor_pago, 0) > 0)
                     AND date_trunc('month', COALESCE(data_pagamento, data_vencimento)) = date_trunc('month', NOW()) - interval '1 month'
                     AND EXTRACT(DAY FROM COALESCE(data_pagamento, data_vencimento)) <= EXTRACT(DAY FROM NOW())
                    THEN COALESCE(NULLIF(valor_pago, 0), valor)
                END), 0) AS valor_mtd_anterior,
                EXTRACT(DAY FROM NOW())::int AS dia_corte
            FROM dash_financeiro
            WHERE tenant_id = $1
              AND TRIM(tipo) = 'RECEBER'
              AND COALESCE(valor, 0) > 0
        `, [tenantId]);

        const mtdRow = rMtd.rows[0] || {};
        const valorMtdAtual = parseFloat(mtdRow.valor_mtd_atual || 0);
        const valorMtdAnterior = parseFloat(mtdRow.valor_mtd_anterior || 0);
        const mtdVariacaoPct = valorMtdAnterior > 0
            ? Number((((valorMtdAtual - valorMtdAnterior) / valorMtdAnterior) * 100).toFixed(2))
            : 0;

        const mtd = {
            dia_corte: parseInt(mtdRow.dia_corte || new Date().getDate(), 10),
            valor_atual: valorMtdAtual,
            valor_anterior: valorMtdAnterior,
            variacao: Number((valorMtdAtual - valorMtdAnterior).toFixed(2)),
            variacao_pct: mtdVariacaoPct,
        };
        const responseData = {
            kpis,
            evolucao_mensal,
            inadimplencia_aging,
            inadimplencia_aging_summary,
            recuperacao_faixas,
            carteira_clientes,
            aquisicao_resumo,
            clientes_por_classe,
            estatisticas_regiao,
            estatisticas_regime,
            plano_contas_recebido,
            top30_clientes: top50_clientes,
            top50_clientes,
            comparativo_mom,
            yoy_mensal,
            recuperacao_top_meses,
            mtd,
            estatisticas_gerais,
        };

        biGerenciaCache.set(tenantId, { timestamp: Date.now(), data: responseData });
        res.json(responseData);

    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/boletos-emitidos
router.get('/boletos-emitidos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { startDate, endDate, tipo_data, status, portador, search } = req.query;

        const isQuitadoFilter = status === 'quitados' || status === 'quitado' || status === 'PAGO' || status === 'QUITADO';
        const stUpper = (status || '').toUpperCase();
        const tipoData = (tipo_data || 'emissao').toLowerCase();

        const safeDateMs = (str, isEnd = false) => {
            if (!str) return isEnd ? Infinity : 0;
            if (typeof str === 'string' && str.includes('T')) return new Date(str).getTime();
            if (typeof str === 'string' && str.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const p = str.split('-');
                const h = isEnd ? 23 : 0;
                const m = isEnd ? 59 : 0;
                const s = isEnd ? 59 : 0;
                return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), h, m, s).getTime();
            }
            const t = new Date(str).getTime();
            return isNaN(t) ? 0 : t;
        }

        const itemsMap = new Map();

        // 0. Sincronização proativa de quitações do Banco Cora (cache em memória de 45s)
        try {
            const CoraService = require('../services/CoraService');
            if (!global._coraSyncCache) {
                global._coraSyncCache = new Map();
            }
            const coraCacheKey = `${tenantId}`;
            const coraCached = global._coraSyncCache.get(coraCacheKey);
            if (!coraCached || (Date.now() - coraCached.timestamp > 45000)) {
                await Promise.race([
                    CoraService.sincronizarFaturasCora(tenantId),
                    new Promise(resolve => setTimeout(resolve, 8000))
                ]).catch(err => console.warn('[BoletosEmitidos] Aviso no sync Cora:', err?.message || err));
                global._coraSyncCache.set(coraCacheKey, { timestamp: Date.now() });
            }
        } catch (coraErr) {
            console.warn('[BoletosEmitidos] Erro ao sincronizar Cora:', coraErr?.message || coraErr);
        }

        // 1. Consulta SQL dos títulos locais no Postgres (sem filtro de data aqui — o filtro em memória cobre isso)
        // Carrega TODOS os títulos para garantir que os mapas de lookup funcionem mesmo quando
        // o período não coincide com data_emissao vs data_vencimento
        const { rows: allLocalTitles } = await db.query(
            `SELECT f.id, f.id_firebird, f.cliente_id_firebird, f.cliente_id, f.cliente_nome, f.cliente_documento, f.descricao, f.valor, f.valor_pago, f.status_pagamento, f.nosso_numero, f.numero_documento, f.asaas_payment_id, f.data_vencimento, f.data_pagamento, f.data_emissao, f.especie_nome, f.portador_nome, f.categoria_pagamento, f.billing_type, f.data_vinculo, f.usuario_vinculo,
                    c.documento AS cliente_documento_db, c.email AS cliente_email, COALESCE(c.celular_secundario, c.telefone) AS cliente_phone,
                    COALESCE(NULLIF(c.nome, ''), NULLIF(c.razao_social, ''), NULLIF(f.cliente_nome, ''), NULLIF(f.descricao, ''), 'Cliente Coliseu Transporte') AS cliente_full
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
             WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($1::text))
               AND (f.tipo IS NULL OR UPPER(TRIM(f.tipo)) NOT IN ('PAGAR', 'DESPESA', 'P'))
               AND COALESCE(f.valor, 0) > 0`,
            [String(tenantId)]
        ).catch(err => {
            console.error('[BoletosEmitidos] Erro na consulta de títulos locais:', err?.message || err);
            return { rows: [] };
        });

        const titleByAsaasIdMap = new Map();
        const titleByNossoNumMap = new Map();
        const titleByIdFirebirdMap = new Map();
        const titleByNumDocMap = new Map();
        const titleByIdMap = new Map();
        const titleByValAndDateMap = new Map();
        const titleByValAndClientMap = new Map();
        const titleByValAndNameMap = new Map();
        const titleByClientAndValMap = new Map();

        const cleanDigits = (s) => (s ? String(s).replace(/\D/g, '') : '');
        const cleanNoZeros = (s) => (s ? String(s).replace(/^0+/, '') : '');
        const cleanDigitsNoZeros = (s) => cleanNoZeros(cleanDigits(s));
        const normalizeName = (s) => (s ? String(s).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

        allLocalTitles.forEach(t => {
            if (t.asaas_payment_id) titleByAsaasIdMap.set(String(t.asaas_payment_id).trim(), t);

            if (t.nosso_numero) {
                const rawN = String(t.nosso_numero).trim();
                if (rawN && rawN !== '—') {
                    titleByNossoNumMap.set(rawN, t);
                    const nz = cleanNoZeros(rawN);
                    if (nz) titleByNossoNumMap.set(nz, t);
                    const cd = cleanDigits(rawN);
                    if (cd) titleByNossoNumMap.set(cd, t);
                    const cdnz = cleanDigitsNoZeros(rawN);
                    if (cdnz) titleByNossoNumMap.set(cdnz, t);
                }
            }

            if (t.numero_documento) {
                const rawD = String(t.numero_documento).trim();
                if (rawD && rawD !== '—') {
                    titleByNumDocMap.set(rawD, t);
                    const cd = cleanDigits(rawD);
                    if (cd) titleByNumDocMap.set(cd, t);
                    const cdnz = cleanDigitsNoZeros(rawD);
                    if (cdnz) titleByNumDocMap.set(cdnz, t);
                }
            }

            if (t.id_firebird != null) titleByIdFirebirdMap.set(String(t.id_firebird).trim(), t);
            if (t.id != null) titleByIdMap.set(String(t.id).trim(), t);

            if (t.valor) {
                const vStr = parseFloat(t.valor).toFixed(2);
                if (t.data_vencimento) {
                    const dStr = String(t.data_vencimento).split('T')[0].split(' ')[0];
                    titleByValAndDateMap.set(`${vStr}_${dStr}`, t);
                }
                if (t.data_emissao) {
                    const eStr = String(t.data_emissao).split('T')[0].split(' ')[0];
                    titleByValAndDateMap.set(`${vStr}_${eStr}`, t);
                }
                if (t.cliente_id_firebird) titleByClientAndValMap.set(`fb_${t.cliente_id_firebird}_${vStr}`, t);
                if (t.cliente_id) titleByClientAndValMap.set(`id_${t.cliente_id}_${vStr}`, t);

                if (t.cliente_documento_db || t.cliente_documento) {
                    const cleanDoc = (t.cliente_documento_db || t.cliente_documento).replace(/\D/g, '');
                    if (cleanDoc) {
                        titleByValAndClientMap.set(`${vStr}_${cleanDoc}`, t);
                        titleByClientAndValMap.set(`doc_${cleanDoc}_${vStr}`, t);
                    }
                }
                if (t.cliente_full && t.cliente_full !== 'Cliente Coliseu Transporte' && t.cliente_full !== 'Cliente Nexus' && t.cliente_full !== 'Cliente não identificado') {
                    const normN = normalizeName(t.cliente_full);
                    if (normN && normN.length >= 3) {
                        titleByValAndNameMap.set(`${vStr}_${normN}`, t);
                        titleByValAndNameMap.set(`${vStr}_${normN.substring(0, 8)}`, t);
                        titleByClientAndValMap.set(`name_${normN}_${vStr}`, t);
                    }
                }
            }
        });

        const { rows: allLocalCustomers } = await db.query(
            `SELECT id, id_firebird, asaas_customer_id, nome, razao_social, nome_fantasia, documento, email, telefone FROM dash_clientes 
             WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text))`,
            [String(tenantId)]
        ).catch(() => ({ rows: [] }));

        const customerCache = new Map();
        const customerCacheByDoc = new Map();
        const customerCacheByName = new Map();

        allLocalCustomers.forEach(c => {
            const custName = c.nome || c.razao_social || c.nome_fantasia;
            const custObj = { name: custName, cpfCnpj: c.documento, email: c.email, phone: c.telefone, id_firebird: c.id_firebird, id: c.id, asaas_customer_id: c.asaas_customer_id };
            if (c.asaas_customer_id) customerCache.set(String(c.asaas_customer_id).toLowerCase().trim(), custObj);
            if (c.id_firebird != null) customerCache.set(String(c.id_firebird).trim(), custObj);
            if (c.id != null) customerCache.set(String(c.id).trim(), custObj);
            if (c.documento) {
                const cleanDoc = c.documento.replace(/\D/g, '');
                if (cleanDoc) customerCacheByDoc.set(cleanDoc, custObj);
            }
            if (custName) customerCacheByName.set(normalizeName(custName), custObj);
        });

        // 2. Consulta direta na API do Asaas com cache inteligente (45s) para consulta ultra-rápida
        try {
            const AsaasService = require('../services/asaasService');
            if (!global._asaasPaymentsCache) {
                global._asaasPaymentsCache = new Map();
            }

            const cacheKey = `${tenantId}_${startDate}_${endDate}_${tipoData}_${isQuitadoFilter}`;
            const cachedEntry = global._asaasPaymentsCache.get(cacheKey);
            let asaasPayments = { data: [] };

            if (cachedEntry && (Date.now() - cachedEntry.timestamp < 45000)) {
                asaasPayments = { data: cachedEntry.data };
            } else {
                const mapP = new Map();
                const fetchPromise = Promise.all([
                    AsaasService.listPayments(tenantId, { status: 'RECEIVED', limit: 500 }).catch(() => ({ data: [] })),
                    AsaasService.listPayments(tenantId, { status: 'CONFIRMED', limit: 300 }).catch(() => ({ data: [] }))
                ]);

                const [recRes, confRes] = await Promise.race([
                    fetchPromise,
                    new Promise(resolve => setTimeout(() => resolve([{ data: [] }, { data: [] }]), 12000))
                ]);

                (recRes?.data || []).forEach(p => mapP.set(p.id, p));
                (confRes?.data || []).forEach(p => mapP.set(p.id, p));

                if (startDate || endDate) {
                    const asaasFilters = { limit: 500 };
                    if (tipoData === 'quitacao' || tipoData === 'pagamento') {
                        if (startDate) asaasFilters['paymentDate[ge]'] = startDate;
                        if (endDate)   asaasFilters['paymentDate[le]'] = endDate;
                    } else if (tipoData === 'vencimento') {
                        if (startDate) asaasFilters['dueDate[ge]'] = startDate;
                        if (endDate)   asaasFilters['dueDate[le]'] = endDate;
                    } else {
                        if (startDate) asaasFilters['dateCreated[ge]'] = startDate;
                        if (endDate)   asaasFilters['dateCreated[le]'] = endDate;
                    }
                    try {
                        const dateRes = await Promise.race([
                            AsaasService.listPayments(tenantId, asaasFilters),
                            new Promise(resolve => setTimeout(() => resolve({ data: [] }), 12000))
                        ]);
                        (dateRes?.data || []).forEach(p => mapP.set(p.id, p));
                    } catch(e) {}
                }

                const listData = Array.from(mapP.values());
                if (listData.length > 0) {
                    global._asaasPaymentsCache.set(cacheKey, { data: listData, timestamp: Date.now() });
                }
                asaasPayments = { data: listData };
            }

            (asaasPayments.data || []).forEach(p => {
                const pId = p.id ? String(p.id).trim() : null;
                const nossoNum = p.nossoNumero ? String(p.nossoNumero).trim() : '';
                const cdNossoP = cleanDigits(nossoNum);
                const cdnzNossoP = cleanDigitsNoZeros(nossoNum);
                const extRef = p.externalReference ? String(p.externalReference).trim() : '';
                const pValue = parseFloat(p.value || 0);
                const isPaidStatus = p.status === 'RECEIVED' || p.status === 'CONFIRMED' || p.status === 'RECEIVED_IN_CASH';
                const isCancelledStatus = p.status === 'REFUNDED' || p.status === 'CHARGEBACK_REQUESTED' || p.status === 'CANCELLED';

                // Extrai qualquer número de 3+ dígitos da descrição ou externalReference
                let matchTitleIds = [];
                if (p.description) {
                    const nums = p.description.match(/\d{3,}/g);
                    if (nums) matchTitleIds.push(...nums);
                }
                if (extRef) {
                    const nums = String(extRef).match(/\d{3,}/g);
                    if (nums) matchTitleIds.push(...nums);
                }

                let customerObj = p.customer ? customerCache.get(String(p.customer).toLowerCase().trim()) : null;
                if (!customerObj && p.cpfCnpj) {
                    const cleanDoc = p.cpfCnpj.replace(/\D/g, '');
                    if (cleanDoc) customerObj = customerCacheByDoc.get(cleanDoc);
                }
                if (!customerObj && (p.customerName || p.customer_name)) {
                    const cNorm = normalizeName(p.customerName || p.customer_name);
                    customerObj = customerCacheByName.get(cNorm);
                }

                const valStr = pValue.toFixed(2);
                const valDateKey = `${valStr}_${p.dueDate}`;
                const valEmissaoKey = p.dateCreated ? `${valStr}_${p.dateCreated}` : null;
                const valDocKey = customerObj?.cpfCnpj ? `${valStr}_${customerObj.cpfCnpj.replace(/\D/g, '')}` : (p.cpfCnpj ? `${valStr}_${p.cpfCnpj.replace(/\D/g, '')}` : null);
                
                const pNameNorm = normalizeName(p.customerName || p.customer_name || customerObj?.name);
                const valNameKey = pNameNorm ? `${valStr}_${pNameNorm}` : null;
                const valNameShortKey = (pNameNorm && pNameNorm.length >= 8) ? `${valStr}_${pNameNorm.substring(0, 8)}` : null;

                let matchedTitle = (pId ? titleByAsaasIdMap.get(pId) : null) || 
                                     (nossoNum ? (
                                        titleByNossoNumMap.get(nossoNum) || 
                                        titleByNossoNumMap.get(cdNossoP) || 
                                        titleByNossoNumMap.get(cdnzNossoP) || 
                                        titleByNumDocMap.get(nossoNum) || 
                                        titleByNumDocMap.get(cdNossoP) || 
                                        titleByNumDocMap.get(cdnzNossoP) ||
                                        titleByIdFirebirdMap.get(cdNossoP) ||
                                        titleByIdMap.get(cdNossoP)
                                     ) : null) || 
                                     (extRef ? (
                                        titleByIdFirebirdMap.get(extRef) || 
                                        titleByNumDocMap.get(extRef) || 
                                        titleByIdMap.get(extRef) ||
                                        titleByNossoNumMap.get(extRef)
                                     ) : null);

                if (!matchedTitle && matchTitleIds.length > 0) {
                    for (const numId of matchTitleIds) {
                        const candidate = titleByNumDocMap.get(numId) || titleByIdFirebirdMap.get(numId) || titleByIdMap.get(numId) || titleByNossoNumMap.get(numId);
                        if (candidate) {
                            matchedTitle = candidate;
                            break;
                        }
                    }
                }

                if (!matchedTitle) {
                    matchedTitle = (valDocKey ? titleByValAndClientMap.get(valDocKey) : null) ||
                                   (valNameKey ? titleByValAndNameMap.get(valNameKey) : null) ||
                                   (valNameShortKey ? titleByValAndNameMap.get(valNameShortKey) : null) ||
                                   titleByValAndDateMap.get(valDateKey) ||
                                   (valEmissaoKey ? titleByValAndDateMap.get(valEmissaoKey) : null);
                }

                // Fallback adicional por Cliente + Valor
                if (!matchedTitle && customerObj && pValue > 0) {
                    if (customerObj.id_firebird) matchedTitle = titleByClientAndValMap.get(`fb_${customerObj.id_firebird}_${valStr}`);
                    if (!matchedTitle && customerObj.id) matchedTitle = titleByClientAndValMap.get(`id_${customerObj.id}_${valStr}`);
                    if (!matchedTitle && customerObj.cpfCnpj) {
                        const cleanDoc = customerObj.cpfCnpj.replace(/\D/g, '');
                        if (cleanDoc) matchedTitle = titleByClientAndValMap.get(`doc_${cleanDoc}_${valStr}`);
                    }
                    if (!matchedTitle && pNameNorm) matchedTitle = titleByClientAndValMap.get(`name_${pNameNorm}_${valStr}`);
                }

                let boletoClientName = customerObj?.name || (matchedTitle && matchedTitle.cliente_full !== 'Cliente não identificado' ? matchedTitle.cliente_full : null) || p.customerName || p.customer_name || 'Cliente Asaas';
                let clienteDocumento = customerObj?.cpfCnpj || matchedTitle?.cliente_documento || p.cpfCnpj || null;

                const temVinculo = Boolean(matchedTitle);
                const vinculoCodigo = matchedTitle ? (matchedTitle.id_firebird || matchedTitle.id) : null;
                const clienteNexus = matchedTitle ? matchedTitle.cliente_full : '— (Sem Vínculo)';
                const vencimentoReal = p.dueDate || matchedTitle?.data_vencimento || null;
                const pDate = p.paymentDate || p.confirmedDate || p.creditDate || new Date().toISOString().split('T')[0];

                const isPixType = p.billingType === 'PIX';
                const hasAsaasBoletoNo = Boolean(nossoNum && nossoNum !== '—' && p.nossoNumero);
                const isPixDirect = isPixType && !hasAsaasBoletoNo;
                const isBoletoPix = isPixType && hasAsaasBoletoNo;
                const especieLabel = isPixDirect ? 'PIX_DIRETO' : (isBoletoPix ? 'BOLETO_PAGO_PIX' : (p.billingType === 'CREDIT_CARD' ? 'CARTAO' : 'BOLETO'));

                if (matchedTitle) {
                    db.query(
                        `UPDATE dash_financeiro 
                         SET nosso_numero = COALESCE(NULLIF(nosso_numero, '—'), $1),
                             asaas_payment_id = COALESCE(asaas_payment_id, $2),
                             status_pagamento = CASE WHEN $3 = true THEN 'PAGO' ELSE status_pagamento END, 
                             data_pagamento = CASE WHEN $3 = true THEN COALESCE($4::timestamptz, data_pagamento, NOW()) ELSE data_pagamento END, 
                             valor_pago = CASE WHEN $3 = true THEN COALESCE(NULLIF($5::numeric, 0), valor_pago, valor) ELSE valor_pago END,
                             portador_nome = 'ASAAS',
                             especie_nome = CASE WHEN $6 = true THEN 'PIX_DIRETO' WHEN $7 = true THEN 'BOLETO_PAGO_PIX' ELSE especie_nome END
                         WHERE id = $8`,
                        [nossoNum || null, pId || null, isPaidStatus, pDate, pValue, isPixDirect, isBoletoPix, matchedTitle.id]
                    ).catch(err => console.error('[BoletosEmitidos] Erro ao atualizar título:', err.message));

                    if (isPaidStatus && (matchedTitle.id_firebird || matchedTitle.id)) {
                        db.query(
                            `INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                             VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, 'PENDENTE', 0)
                             ON CONFLICT (tenant_id, titulo_id) DO UPDATE
                             SET valor_pago = EXCLUDED.valor_pago,
                                 data_pagamento = EXCLUDED.data_pagamento,
                                 forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, pending_payments.forma_pagamento),
                                 id_firebird = COALESCE(EXCLUDED.id_firebird, pending_payments.id_firebird),
                                 nosso_numero = COALESCE(EXCLUDED.nosso_numero, pending_payments.nosso_numero),
                                 numero_documento = COALESCE(EXCLUDED.numero_documento, pending_payments.numero_documento),
                                 status = 'PENDENTE',
                                 tentativas = 0,
                                 processado_em = NULL,
                                 erro_mensagem = NULL`,
                            [
                                tenantId, matchedTitle.id, matchedTitle.id_firebird, nossoNum || matchedTitle.nosso_numero,
                                matchedTitle.numero_documento || matchedTitle.id_firebird, pValue > 0 ? pValue : parseFloat(matchedTitle.valor || 0),
                                pDate, especieLabel
                            ]
                        ).catch(err => console.error('[BoletosEmitidos/Sync] Erro ao enfileirar em pending_payments:', err.message));
                    }

                    const effectiveNossoNum = nossoNum || matchedTitle.nosso_numero || '—';

                    itemsMap.set(pId, {
                        id: matchedTitle.id,
                        id_firebird: matchedTitle.id_firebird,
                        tipo: 'RECEBER',
                        descricao: matchedTitle.descricao || p.description || 'Cobrança Asaas',
                        cliente_boleto: boletoClientName,
                        cliente_nexus: clienteNexus || matchedTitle.cliente_full || 'Cliente Coliseu Transporte',
                        cliente_coliseu: clienteNexus || matchedTitle.cliente_full || 'Cliente Coliseu Transporte',
                        cliente: clienteNexus || boletoClientName,
                        cliente_documento: clienteDocumento,
                        data_emissao: p.dateCreated || matchedTitle.data_emissao || new Date().toISOString(),
                        data_vencimento: vencimentoReal,
                        data_pagamento: isPaidStatus ? (pDate || matchedTitle.data_pagamento || vencimentoReal) : matchedTitle.data_pagamento,
                        valor: pValue > 0 ? pValue : parseFloat(matchedTitle.valor || 0),
                        valor_pago: isPaidStatus ? (pValue > 0 ? pValue : parseFloat(matchedTitle.valor || 0)) : parseFloat(matchedTitle.valor_pago || 0),
                        status_pagamento: isPaidStatus ? 'PAGO' : isCancelledStatus ? 'CANCELADO' : (matchedTitle.status_pagamento || 'ABERTO'),
                        nosso_numero: effectiveNossoNum,
                        asaas_nosso_numero: p.nossoNumero || null,
                        numero_documento: matchedTitle.numero_documento || matchedTitle.id_firebird || matchedTitle.id,
                        portador: 'ASAAS (BANCO)',
                        billing_type: p.billingType || 'BOLETO',
                        categoria_pagamento: isPixDirect ? 'PIX_DIRETO' : (isBoletoPix ? 'BOLETO_PAGO_PIX' : 'BOLETO'),
                        especie: isPixDirect ? 'PIX_DIRETO' : (isBoletoPix ? 'BOLETO_PAGO_PIX' : (p.billingType === 'CREDIT_CARD' ? 'CARTAO' : (matchedTitle.especie || 'BOLETO'))),
                        asaas_payment_id: pId,
                        tem_vinculo: true,
                        vinculo_codigo: vinculoCodigo,
                        bank_slip_url: p.bankSlipUrl || p.invoiceUrl || null,
                        invoice_url: p.invoiceUrl || p.bankSlipUrl || null,
                        customer_email: customerObj?.email || matchedTitle.cliente_email || null,
                        customer_phone: customerObj?.phone || matchedTitle.cliente_phone || null
                    });
                } else {
                    const key = pId || nossoNum || `asaas_${Math.random()}`;
                    itemsMap.set(key, {
                        id: `asaas_${pId}`,
                        id_firebird: null,
                        tipo: 'RECEBER',
                        descricao: p.description || 'Cobrança gerada no Asaas',
                        cliente_boleto: boletoClientName,
                        cliente_nexus: clienteNexus,
                        cliente_coliseu: clienteNexus,
                        cliente: boletoClientName,
                        cliente_documento: clienteDocumento,
                        data_emissao: p.dateCreated || new Date().toISOString(),
                        data_vencimento: vencimentoReal,
                        data_pagamento: isPaidStatus ? pDate : null,
                        valor: pValue,
                        valor_pago: isPaidStatus ? pValue : 0,
                        status_pagamento: isPaidStatus ? 'PAGO' : isCancelledStatus ? 'CANCELADO' : 'ABERTO',
                        nosso_numero: nossoNum || '—',
                        asaas_nosso_numero: p.nossoNumero || null,
                        numero_documento: vinculoCodigo || null,
                        portador: 'ASAAS (BANCO)',
                        billing_type: p.billingType || 'BOLETO',
                        categoria_pagamento: isPixDirect ? 'PIX_DIRETO' : (isBoletoPix ? 'BOLETO_PAGO_PIX' : 'BOLETO'),
                        especie: especieLabel,
                        asaas_payment_id: pId,
                        tem_vinculo: false,
                        vinculo_codigo: null,
                        bank_slip_url: p.bankSlipUrl || p.invoiceUrl || null,
                        invoice_url: p.invoiceUrl || p.bankSlipUrl || null,
                        customer_email: customerObj?.email || null,
                        customer_phone: customerObj?.phone || null
                    });
                }
            });
        } catch (errAsaas) {
            console.error('Aviso ao consultar Asaas em boletos-emitidos:', errAsaas?.message);
        }

        // 2b. Adiciona boletos emitidos via Banco Cora (dash_financeiro) ao itemsMap
        allLocalTitles.forEach(t => {
            const isCora = (t.portador_nome || '').toUpperCase().includes('CORA') || 
                           (t.asaas_payment_id && String(t.asaas_payment_id).startsWith('inv_'));
            if (isCora) {
                const pId = t.asaas_payment_id || `cora_${t.id}`;
                if (!itemsMap.has(pId)) {
                    const st = (t.status_pagamento || '').trim().toUpperCase();
                    const isPaidStatus = st === 'PAGO' || st === 'QUITADO' || st === 'RECEBIDO' || st === 'RECEIVED' || st === 'CONFIRMED' || st === 'LIQUIDADO' || st === 'BAIXADO' || st === 'PAID' || st === 'Q' || st === 'F';
                    const isCancelledStatus = st === 'CANCELADO';
                    const valorNum = parseFloat(t.valor || 0);
                    const valorPagoNum = parseFloat(t.valor_pago || 0);

                    itemsMap.set(pId, {
                        id: t.id,
                        id_firebird: t.id_firebird,
                        tipo: 'RECEBER',
                        descricao: t.descricao || 'Cobrança Banco Cora',
                        cliente_boleto: t.cliente_full || t.cliente_nome || 'Cliente',
                        cliente_nexus: t.cliente_full || t.cliente_nome || 'Cliente Coliseu Transporte',
                        cliente_coliseu: t.cliente_full || t.cliente_nome || 'Cliente Coliseu Transporte',
                        cliente: t.cliente_full || t.cliente_nome || 'Cliente',
                        cliente_documento: t.cliente_documento_db || t.cliente_documento || null,
                        data_emissao: t.data_emissao || new Date().toISOString(),
                        data_vencimento: t.data_vencimento,
                        data_pagamento: isPaidStatus ? (t.data_pagamento || t.data_vencimento) : t.data_pagamento,
                        valor: valorNum,
                        valor_pago: isPaidStatus ? (valorPagoNum > 0 ? valorPagoNum : valorNum) : valorPagoNum,
                        status_pagamento: isPaidStatus ? 'PAGO' : isCancelledStatus ? 'CANCELADO' : (t.status_pagamento || 'ABERTO'),
                        nosso_numero: t.nosso_numero || '—',
                        asaas_nosso_numero: null,
                        numero_documento: t.numero_documento || t.id_firebird || t.id,
                        portador: 'CORA (BANCO)',
                        billing_type: 'BOLETO',
                        categoria_pagamento: 'BOLETO',
                        especie: 'BOLETO',
                        asaas_payment_id: pId,
                        tem_vinculo: true,
                        vinculo_codigo: t.id_firebird || t.id,
                        bank_slip_url: `/api/cora/boleto/${pId}?format=html`,
                        invoice_url: `/api/cora/boleto/${pId}?format=html`,
                        customer_email: t.cliente_email || null,
                        customer_phone: t.cliente_phone || null
                    });
                }
            }
        });

        let data = Array.from(itemsMap.values());

        // 3. Filtragem por Status em Memória
        if (stUpper === 'ABERTO' || stUpper === 'ABERTOS') {
            data = data.filter(d => {
                const st = (d.status_pagamento || '').trim().toUpperCase();
                const isPaidStatus = st === 'PAGO' || st === 'QUITADO' || st === 'RECEBIDO' || st === 'RECEIVED' || st === 'CONFIRMED' || st === 'LIQUIDADO' || st === 'BAIXADO' || st === 'PAID' || st === 'Q' || st === 'F';
                if (isPaidStatus) return false;
                const isPaidVal = (parseFloat(d.valor || 0) > 0 && parseFloat(d.valor_pago || 0) >= parseFloat(d.valor || 0));
                return !isPaidVal;
            });
        } else if (isQuitadoFilter) {
            data = data.filter(d => {
                const st = (d.status_pagamento || '').trim().toUpperCase();
                const isExplicitlyPaid = st === 'PAGO' || st === 'QUITADO' || st === 'RECEBIDO' || st === 'RECEIVED' || st === 'CONFIRMED' || st === 'RECEIVED_IN_CASH' || st === 'LIQUIDADO' || st === 'BAIXADO' || st === 'PAID' || st === 'Q' || st === 'F';
                const isPartialPaid = parseFloat(d.valor_pago || 0) > 0;
                const isPaidVal = (parseFloat(d.valor || 0) > 0 && parseFloat(d.valor_pago || 0) >= parseFloat(d.valor || 0));
                return isExplicitlyPaid || isPartialPaid || isPaidVal;
            });
        } else if (stUpper === 'CANCELADO' || stUpper === 'CANCELADOS') {
            data = data.filter(d => (d.status_pagamento || '').trim().toUpperCase() === 'CANCELADO');
        }

        // 4. Filtragem por Período de Datas em Memória
        if (startDate || endDate) {
            const startMs = startDate ? safeDateMs(startDate, false) : 0;
            const endMs   = endDate   ? safeDateMs(endDate, true)    : Infinity;

            data = data.filter(item => {
                let dtStr = null;

                if (tipoData === 'quitacao' || tipoData === 'pagamento') {
                    // Para quitação: prioriza data_pagamento
                    // Se não há data_pagamento mas status é PAGO, deixa passar (será exibido)
                    if (item.data_pagamento) {
                        dtStr = item.data_pagamento;
                    } else {
                        const st = (item.status_pagamento || '').trim().toUpperCase();
                        const isPaid = st === 'PAGO' || st === 'QUITADO' || st === 'RECEBIDO' ||
                                       st === 'RECEIVED' || st === 'CONFIRMED' || st === 'RECEIVED_IN_CASH' ||
                                       st === 'LIQUIDADO' || st === 'BAIXADO' || st === 'PAID' ||
                                       parseFloat(item.valor_pago || 0) > 0;
                        // Se está quitado mas sem data de pagamento, inclui (melhor mostrar a mais)
                        if (isPaid) return true;
                        dtStr = item.data_vencimento || item.data_emissao;
                    }
                } else if (tipoData === 'vencimento') {
                    dtStr = item.data_vencimento || item.data_emissao;
                } else {
                    dtStr = item.data_emissao || item.data_vencimento;
                }

                if (!dtStr) return true; // sem data: inclui para não ocultar
                const itemMs = safeDateMs(dtStr, false);
                if (itemMs === 0) return true;
                if (startMs && itemMs < startMs) return false;
                if (endMs   && itemMs > endMs)   return false;
                return true;
            });
        }

        // 5. Filtragem por Portador e Busca Textual em Memória
        if (portador && portador !== 'todos') {
            const pSearch = portador.toLowerCase();
            data = data.filter(d => (d.portador || '').toLowerCase().includes(pSearch));
        }

        if (search) {
            const s = search.toLowerCase();
            data = data.filter(d => 
                (d.cliente_boleto || '').toLowerCase().includes(s) ||
                (d.cliente_nexus || '').toLowerCase().includes(s) ||
                (d.descricao || '').toLowerCase().includes(s) ||
                (d.nosso_numero || '').toLowerCase().includes(s) ||
                String(d.id || '').includes(s) ||
                String(d.id_firebird || '').includes(s)
            );
        }

        // 6. Ordenação em Memória por Data Decrescente
        if (isQuitadoFilter || tipoData === 'quitacao' || tipoData === 'pagamento') {
            data.sort((a, b) => {
                const dtA = safeDateMs(a.data_pagamento || a.data_vencimento || a.data_emissao);
                const dtB = safeDateMs(b.data_pagamento || b.data_vencimento || b.data_emissao);
                return dtB - dtA;
            });
        } else if (tipoData === 'vencimento') {
            data.sort((a, b) => {
                const dtA = safeDateMs(a.data_vencimento || a.data_emissao);
                const dtB = safeDateMs(b.data_vencimento || b.data_emissao);
                return dtB - dtA;
            });
        } else {
            data.sort((a, b) => {
                const dtA = safeDateMs(a.data_emissao);
                const dtB = safeDateMs(b.data_emissao);
                return dtB - dtA;
            });
        }

        res.json({ data });
    } catch (err) {
        console.error('❌ [GET /api/financeiro/boletos-emitidos ERROR]:', err);
        res.status(500).json({ error: err.message || 'Erro interno ao listar boletos emitidos' });
    }
});

// POST /api/financeiro/boletos-emitidos/vincular
router.post('/boletos-emitidos/vincular', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { asaas_payment_id, nosso_numero, titulo_id, observacao, especie, categoria_pagamento } = req.body;
        const usuario = req.user?.nome || req.user?.email || 'Operador';

        if (!titulo_id) {
            return res.status(400).json({ error: 'Selecione um título válido do Coliseu Transporte para vincular.' });
        }

        const isPaid = req.body.is_paid || req.body.status === 'RECEIVED' || req.body.status === 'CONFIRMED' || req.body.status === 'RECEIVED_IN_CASH' || req.body.status === 'PAGO' || req.body.status === 'QUITADO' || req.body.status === 'Quitados';
        const especieLabel = categoria_pagamento || especie || (req.body.billing_type === 'PIX' ? 'PIX_DIRETO' : null);

        const updateRes = await db.query(
            `UPDATE dash_financeiro 
             SET nosso_numero = COALESCE($1, nosso_numero),
                 asaas_payment_id = COALESCE($2, asaas_payment_id),
                 data_vinculo = COALESCE(data_vinculo, NOW()),
                 usuario_vinculo = $3,
                 status_pagamento = CASE WHEN $6 = true THEN 'PAGO' ELSE status_pagamento END,
                 data_pagamento = CASE WHEN $6 = true THEN COALESCE(data_pagamento, NOW()) ELSE data_pagamento END,
                 valor_pago = CASE WHEN $6 = true THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE valor_pago END,
                 especie_nome = COALESCE($7, especie_nome)
             WHERE id = $4 AND tenant_id = $5
             RETURNING id, id_firebird, cliente_nome, descricao, nosso_numero, asaas_payment_id, status_pagamento, valor_pago, especie_nome`,
            [nosso_numero || null, asaas_payment_id || null, usuario, titulo_id, tenantId, isPaid, especieLabel]
        );

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ error: 'Título não encontrado no banco de dados do Coliseu Transporte.' });
        }

        const updated = updateRes.rows[0];

        // Se o título vinculado já estiver quitado/pago, enfileira em pending_payments para o Worker do ERP Coliseu (Firebird) dar baixa
        if ((updated.status_pagamento === 'PAGO' || isPaid) && (updated.id_firebird || updated.id)) {
            await db.query(`
                INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, 'PENDENTE', 0)
                ON CONFLICT (tenant_id, titulo_id) DO UPDATE
                SET valor_pago = EXCLUDED.valor_pago,
                    data_pagamento = EXCLUDED.data_pagamento,
                    forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, pending_payments.forma_pagamento),
                    id_firebird = COALESCE(EXCLUDED.id_firebird, pending_payments.id_firebird),
                    nosso_numero = COALESCE(EXCLUDED.nosso_numero, pending_payments.nosso_numero),
                    numero_documento = COALESCE(EXCLUDED.numero_documento, pending_payments.numero_documento),
                    status = 'PENDENTE',
                    tentativas = 0,
                    processado_em = NULL,
                    erro_mensagem = NULL;
            `, [
                tenantId,
                updated.id,
                updated.id_firebird || null,
                updated.nosso_numero || nosso_numero || null,
                String(updated.id_firebird || updated.id),
                updated.valor_pago || updated.valor || 0,
                updated.data_pagamento || new Date().toISOString(),
                especieLabel || 'BOLETO_ASAAS'
            ]).catch(err => console.error('⚠️ [Vincular] Erro ao registrar em pending_payments:', err.message));
        }

        // Registro de Log de Vínculo
        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao)
             VALUES ($1, $2, 'VINCULO', $3, $4, $5, $6)`,
            [tenantId, updated.id, usuario, updated.nosso_numero || nosso_numero || null, String(updated.id_firebird || updated.id), observacao || 'Vínculo do boleto com o título efetuado']
        ).catch(() => {});

        res.json({
            success: true,
            message: `Boleto vinculado ao Título #${updated.id_firebird || updated.id} com sucesso!`,
            titulo: updated
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/boletos-emitidos/cancelar (Cancela no Asaas + atualiza no banco local + grava log)
router.post('/boletos-emitidos/cancelar', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { titulo_id, asaas_payment_id, nosso_numero, motivo } = req.body;
        const usuario = (req.user && (req.user.nome || req.user.email)) || 'Operador';
        const AsaasService = require('../services/asaasService');

        let targetPaymentId = asaas_payment_id;
        let targetTituloId = titulo_id;

        // Auto-migration para colunas de auditoria
        await db.query(`
            ALTER TABLE dash_financeiro 
            ADD COLUMN IF NOT EXISTS data_cancelamento TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS usuario_cancelamento VARCHAR(100),
            ADD COLUMN IF NOT EXISTS data_vinculo TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS usuario_vinculo VARCHAR(100);
        `).catch(() => {});

        // Se só passaram titulo_id, busca o paymentId e o tenant no banco
        let targetTenantId = tenantId;
        if (targetTituloId) {
            const tRes = await db.query(
                `SELECT id, tenant_id, asaas_payment_id, nosso_numero FROM dash_financeiro WHERE (CAST(id AS TEXT) = $1 OR CAST(id_firebird AS TEXT) = $1) AND ($2 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($2::text)) LIMIT 1`,
                [String(targetTituloId), String(tenantId)]
            );
            if (tRes.rows.length > 0) {
                targetPaymentId = targetPaymentId || tRes.rows[0].asaas_payment_id;
                targetTenantId = tRes.rows[0].tenant_id || tenantId;
                targetTituloId = tRes.rows[0].id;
            }
        }

        // 1. Cancela no Asaas se houver paymentId válido (começa com pay_)
        let asaasSuccess = false;
        // 2. Atualiza o status_pagamento para CANCELADO no banco
        if (targetTituloId) {
            await db.query(
                `UPDATE dash_financeiro 
                 SET status_pagamento = 'CANCELADO',
                     data_cancelamento = COALESCE(data_cancelamento, NOW()),
                     usuario_cancelamento = $1
                 WHERE id = $2 AND ($3 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($3::text))`,
                [usuario, targetTituloId, String(tenantId)]
            ).catch(async () => {
                // Fallback se colunas de usuário falharem
                await db.query(
                    `UPDATE dash_financeiro SET status_pagamento = 'CANCELADO' WHERE id = $1 AND ($2 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($2::text))`,
                    [targetTituloId, String(tenantId)]
                );
            });

            // 3. Grava Log de Cancelamento
            await db.query(
                `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, tipo_evento, usuario, nosso_numero, descricao)
                 VALUES ($1::UUID, $2, 'CANCELAMENTO', $3, $4, $5)`,
                [String(targetTenantId), targetTituloId, usuario, nosso_numero || null, `Cancelamento efetuado. ${asaasSuccess ? 'Confirmado no Asaas.' : asaasError ? 'Aviso Asaas: ' + asaasError : 'Cancelado no sistema.'}`]
            ).catch(() => {});
        }

        res.json({
            success: true,
            message: `Cancelamento da emissão efetuado com sucesso${asaasSuccess ? ' no Banco (Asaas) e no sistema' : ' no sistema'}!`,
            asaasSuccess,
            asaasError
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/boletos-emitidos/reenviar-quitacoes
// Reenfileira TODAS as quitações dos títulos vinculados no Postgres para o Worker do ERP Coliseu (Firebird) sincronizar
router.post('/boletos-emitidos/reenviar-quitacoes', async (req, res, next) => {
    try {
        const tenantId = req.tenant?.id || req.body.tenant_id;
        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant ID não informado.' });
        }

        let queryResult;
        try {
            queryResult = await db.query(`
                INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                SELECT 
                    f.tenant_id,
                    f.id AS titulo_id,
                    COALESCE(NULLIF(f.id_firebird, 0), f.id) AS id_firebird,
                    f.nosso_numero,
                    f.numero_documento,
                    COALESCE(NULLIF(f.valor_pago, 0), f.valor) AS valor_pago,
                    COALESCE(f.data_pagamento, NOW()) AS data_pagamento,
                    COALESCE(f.especie_nome, 'BOLETO_ASAAS') AS forma_pagamento,
                    'PENDENTE' AS status,
                    0 AS tentativas
                FROM dash_financeiro f
                WHERE (LOWER(f.tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                  AND (f.id_firebird IS NOT NULL OR f.id IS NOT NULL)
                  AND (
                    UPPER(COALESCE(f.status_pagamento, '')) IN ('PAGO', 'QUITADO', 'RECEBIDO', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'LIQUIDADO')
                    OR (f.valor_pago IS NOT NULL AND f.valor_pago >= f.valor AND f.valor > 0)
                  )
                ON CONFLICT (tenant_id, titulo_id) DO UPDATE
                SET valor_pago = EXCLUDED.valor_pago,
                    id_firebird = EXCLUDED.id_firebird,
                    status = 'PENDENTE',
                    tentativas = 0,
                    processado_em = NULL
                RETURNING id;
            `, [String(tenantId)]);
        } catch (confErr) {
            logger.warn('[ReenviarQuitacoes] Upsert ON CONFLICT falhou, executando re-enfileiramento por substituição:', confErr.message);
            await db.query(`
                DELETE FROM pending_payments 
                WHERE (LOWER(tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                  AND status IN ('PENDENTE', 'ERRO', 'PROCESSANDO');
            `, [String(tenantId)]).catch(() => {});

            queryResult = await db.query(`
                INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas)
                SELECT 
                    f.tenant_id,
                    f.id AS titulo_id,
                    COALESCE(NULLIF(f.id_firebird, 0), f.id) AS id_firebird,
                    f.nosso_numero,
                    f.numero_documento,
                    COALESCE(NULLIF(f.valor_pago, 0), f.valor) AS valor_pago,
                    COALESCE(f.data_pagamento, NOW()) AS data_pagamento,
                    COALESCE(f.especie_nome, 'BOLETO_ASAAS') AS forma_pagamento,
                    'PENDENTE' AS status,
                    0 AS tentativas
                FROM dash_financeiro f
                WHERE (LOWER(f.tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
                  AND (f.id_firebird IS NOT NULL OR f.id IS NOT NULL)
                  AND (
                    UPPER(COALESCE(f.status_pagamento, '')) IN ('PAGO', 'QUITADO', 'RECEBIDO', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'LIQUIDADO')
                    OR (f.valor_pago IS NOT NULL AND f.valor_pago >= f.valor AND f.valor > 0)
                  )
                RETURNING id;
            `, [String(tenantId)]);
        }

        logger.info('[ReenviarQuitacoes] Quitações reenfileiradas para o ERP Coliseu', { tenantId, count: queryResult.rows.length });

        res.json({
            success: true,
            count: queryResult.rows.length,
            message: `${queryResult.rows.length} quitação(ões) re-enfileirada(s) com sucesso para o Worker sincronizar no ERP Coliseu!`
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/boletos-emitidos/gerar-lote-item (Emite 1 boleto via Asaas ou Cora + grava BD + envia E-mail individual)
router.post('/boletos-emitidos/gerar-lote-item', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { titulo_id, mensagem, banco } = req.body;
        const usuario = (req.user && (req.user.nome || req.user.email)) || 'Operador';
        const AsaasService = require('../services/asaasService');
        const CoraService = require('../services/CoraService');
        const EmailService = require('../services/emailService');

        if (!titulo_id) {
            return res.status(400).json({ error: 'ID do título não informado.' });
        }

        // 1. Busca os dados do título e do cliente no banco
        const { rows } = await db.query(
            `SELECT f.*, 
                    c.nome AS cliente_nome_db, 
                    c.email AS email_comercial,
                    c.email_financeiro,
                    c.documento AS cliente_cnpj_db,
                    COALESCE(c.celular_secundario, c.telefone) AS cliente_phone_db, 
                    c.endereco_completo AS cliente_end_db, 
                    c.cidade AS cliente_cid_db
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON (
                 (f.cliente_id_firebird IS NOT NULL AND (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id_firebird)) OR
                 (f.cliente_id IS NOT NULL AND c.id = f.cliente_id)
             ) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
             WHERE (f.id = $1 OR f.id_firebird = $1) 
               AND ($2 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($2::text))`,
            [parseInt(titulo_id, 10), String(tenantId)]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: `Título #${titulo_id} não localizado.` });
        }

        const title = rows[0];
        const targetTenantId = title.tenant_id || tenantId;

        const resolvedEmail = (title.email_financeiro || title.email_comercial || title.cliente_email || '').trim().toLowerCase();
        const clientName = req.body.cliente_nome || title.cliente_nome_db || title.cliente_nome || title.descricao || 'Cliente Coliseu Transporte';
        const clientDoc = (req.body.cpfCnpj || req.body.cpf_cnpj || title.cliente_cnpj_db || title.cliente_documento || title.cpf_cnpj || '').replace(/\D/g, '');
        const clientPhone = req.body.phone || req.body.telefone || title.cliente_phone_db || title.cliente_telefone || title.cliente_celular;
        const clientAddress = req.body.address || req.body.endereco || title.cliente_end_db || title.cliente_endereco;
        const clientCity = req.body.province || req.body.cidade || title.cliente_cid_db || title.cliente_cidade;

        const formatDateToYYYYMMDD = (dateVal) => {
            if (!dateVal) return new Date().toISOString().split('T')[0];
            if (typeof dateVal === 'string') {
                const clean = dateVal.split('T')[0].split(' ')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
            }
            try {
                return new Date(dateVal).toISOString().split('T')[0];
            } catch {
                return new Date().toISOString().split('T')[0];
            }
        };

        const dueDateStr = formatDateToYYYYMMDD(title.data_vencimento);
        const valorCobrar = parseFloat(title.valor || 0);

        let nossoNum = null;
        let bankSlipUrl = null;
        let linhaDigitavel = null;
        let barCode = null;
        let paymentId = null;
        let customerId = null;
        let portadorNome = 'Asaas';

        const isCoraSelected = banco && banco.toLowerCase() === 'cora';

        if (isCoraSelected) {
            // Emissão via Banco Cora
            if (valorCobrar < 5.0) {
                return res.status(400).json({
                    success: false,
                    error: `O Banco Cora exige valor mínimo de R$ 5,00 por boleto (título valor R$ ${valorCobrar.toFixed(2)}). Emita via Asaas.`
                });
            }
            portadorNome = 'CORA';
            const { rows: cfgRows } = await db.query(
                'SELECT cora_juros_padrao, cora_multa_padrao, cora_desconto_padrao FROM dash_integracoes_config WHERE tenant_id = $1',
                [targetTenantId]
            );
            const cfg = cfgRows[0] || {};

            const coraResult = await CoraService.emitirBoleto(targetTenantId, {
                cliente: {
                    nome: clientName,
                    documento: clientDoc,
                    email: resolvedEmail,
                    endereco: clientAddress,
                    cidade: clientCity
                },
                services: [{
                    nome: title.descricao || 'Cobrança',
                    descricao: `Cobrança N° ${title.id_firebird || title.id} - ${title.descricao || 'Coliseu Transporte'}`,
                    valor: valorCobrar
                }],
                vencimento: dueDateStr,
                juros: parseFloat(cfg.cora_juros_padrao || 1.0),
                multa: parseFloat(cfg.cora_multa_padrao || 2.0),
                desconto: parseFloat(cfg.cora_desconto_padrao || 0.0)
            });

            paymentId = coraResult.id;
            let bankSlip = coraResult.payment_options?.bank_slip || coraResult.payment_details?.bank_slip || {};
            bankSlipUrl = bankSlip.url || bankSlip.pdf_url || coraResult.pdf_url || null;
            linhaDigitavel = bankSlip.digitable || bankSlip.digitable_line || bankSlip.barcode || null;
            barCode = bankSlip.barcode || null;
            nossoNum = bankSlip.our_number || coraResult.code || paymentId;
            let pixEmv = bankSlip.emv || coraResult.payment_options?.pix?.emv || coraResult.pix?.emv || null;

            // Se o POST inicial não retornou a URL do PDF ou Nosso Número diretamente (geração assíncrona do Cora), consulta a invoice imediatamente
            if ((!bankSlipUrl || !linhaDigitavel || !bankSlip.our_number || !pixEmv) && paymentId) {
                try {
                    await new Promise(r => setTimeout(r, 500));
                    const invDetails = await CoraService.consultarBoleto(targetTenantId, paymentId);
                    const bs = invDetails?.payment_options?.bank_slip || invDetails?.payment_details?.bank_slip || {};
                    bankSlipUrl = bs.url || bs.pdf_url || invDetails?.pdf_url || bankSlipUrl;
                    linhaDigitavel = bs.digitable || bs.digitable_line || bs.barcode || linhaDigitavel;
                    barCode = bs.barcode || barCode;
                    nossoNum = bs.our_number || invDetails?.code || nossoNum;
                    pixEmv = bs.emv || invDetails?.payment_options?.pix?.emv || invDetails?.pix?.emv || pixEmv;
                } catch (errConsult) {
                    logger.warn('[GerarLoteItem-Cora] Aviso ao consultar detalhes pós-emissão:', errConsult.message);
                }
            }

            await db.query(
                `UPDATE dash_financeiro
                 SET asaas_payment_id = $1,
                     asaas_bank_slip_url = $2,
                     bank_slip_url = $2,
                     pdf_url = $2,
                     asaas_linha_digitavel = $3,
                     asaas_bar_code = $4,
                     nosso_numero = $5,
                     portador_nome = 'CORA',
                     status_boleto = 'AGUARDANDO',
                     data_vinculo = NOW(),
                     usuario_vinculo = $6
                 WHERE (id = $7 OR id_firebird = $7)
                   AND ($8 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($8::text) OR tenant_id = $8::uuid)`,
                [
                    paymentId,
                    bankSlipUrl,
                    linhaDigitavel,
                    barCode,
                    nossoNum,
                    usuario,
                    title.id,
                    String(targetTenantId || tenantId)
                ]
            ).catch((dbErr) => logger.warn('[GerarLoteItem-Cora] Erro ao atualizar dash_financeiro:', dbErr.message));

        } else {
            // Emissão via Banco Asaas
            portadorNome = 'Asaas';
            const customerAsaas = await AsaasService.createOrGetCustomer(targetTenantId, {
                name: clientName,
                cpfCnpj: clientDoc,
                email: resolvedEmail,
                phone: clientPhone,
                address: clientAddress,
                province: clientCity
            });
            customerId = customerAsaas.id;

            const paymentRes = await AsaasService.createPayment(targetTenantId, {
                customerId: customerAsaas.id,
                value: valorCobrar,
                dueDate: dueDateStr,
                description: `Boleto N° ${title.id_firebird || title.id} - ${title.descricao}`
            });

            paymentId = paymentRes.id;
            nossoNum = paymentRes.nossoNumero || paymentRes.id;
            bankSlipUrl = paymentRes.bankSlipUrl || paymentRes.invoiceUrl;
            linhaDigitavel = paymentRes.linhaDigitavel || null;
            barCode = paymentRes.barCode || null;

            await db.query(
                `UPDATE dash_financeiro
                 SET asaas_payment_id = $1,
                     asaas_customer_id = $2,
                     asaas_bank_slip_url = $3,
                     bank_slip_url = $3,
                     pdf_url = $3,
                     asaas_linha_digitavel = $4,
                     asaas_bar_code = $5,
                     nosso_numero = $6,
                     portador_nome = 'Asaas',
                     status_boleto = 'AGUARDANDO',
                     data_vinculo = NOW(),
                     usuario_vinculo = $7
                 WHERE (id = $8 OR id_firebird = $8)
                   AND ($9 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($9::text) OR tenant_id = $9::uuid)`,
                [
                    paymentId,
                    customerId,
                    bankSlipUrl,
                    linhaDigitavel,
                    barCode,
                    nossoNum,
                    usuario,
                    title.id,
                    String(targetTenantId || tenantId)
                ]
            ).catch((dbErr) => logger.warn('[GerarLoteItem-Asaas] Erro ao atualizar dash_financeiro:', dbErr.message));
        }

        // 5. Prepara a campanha de emissão em lote de hoje (ou cria uma única para o dia)
        let campanhaId = null;
        try {
            await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'WHATSAPP'`).catch(() => {});
            await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS assunto TEXT`).catch(() => {});
            await db.query(`ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS conteudo TEXT`).catch(() => {});

            const campNome = `Emissão de Cobrança em Lote - ${new Date().toLocaleDateString('pt-BR')}`;
            let campResult = await db.query(
                `SELECT id FROM dash_campanhas WHERE tenant_id = $1 AND nome = $2 AND DATE(created_at) = CURRENT_DATE LIMIT 1`,
                [tenantId, campNome]
            ).catch(() => ({ rows: [] }));

            if (campResult.rows.length > 0) {
                campanhaId = campResult.rows[0].id;
            } else {
                const ins = await db.query(
                    `INSERT INTO dash_campanhas (tenant_id, nome, canal, assunto, conteudo)
                     VALUES ($1, $2, 'EMAIL', $3, $4)
                     RETURNING id`,
                    [tenantId, campNome, 'Cobrança Ref. ao Sistema Coliseu', mensagem || '']
                );
                campanhaId = ins.rows[0]?.id;
            }
        } catch (campErr) {
            logger.warn('[GerarLoteItem] Aviso ao preparar campanha:', campErr.message);
        }

        // 6. Envia o e-mail para TODOS os endereços válidos do cliente com rastreamento (Timeout de 7s)
        let emailEnviado = false;

        // Resolve todos os e-mails válidos (financeiro + comercial), em minúsculas, sem duplicatas
        const destEmails = [];
        const _emailSeen = new Set();
        for (const e of [title.email_financeiro, title.email_comercial, title.cliente_email]) {
            if (!e) continue;
            const norm = String(e).trim().toLowerCase();
            if (norm && norm.includes('@') && !_emailSeen.has(norm)) {
                _emailSeen.add(norm);
                destEmails.push(norm);
            }
        }

        if (destEmails.length > 0) {
            try {
                const configEmail = await EmailService.getConfig(tenantId).catch(() => null);
                if (configEmail && configEmail.remetenteEmail) {
                    const [yVenc, mVenc, dVenc] = dueDateStr.split('-');
                    const vencFormatted = (yVenc && mVenc && dVenc) ? `${dVenc}/${mVenc}/${yVenc}` : dueDateStr;

                    const clienteNomeFmt = title.cliente_nome_db || title.cliente_nome || 'Prezado(a) Cliente';
                    const htmlCorpo = EmailService.defaultTemplateCobranca({
                        nomeCliente: clienteNomeFmt,
                        valorCobranca: valorCobrar.toFixed(2),
                        dataVencimento: vencFormatted,
                        linkPagamento: bankSlipUrl,
                        linhaDigitavel: linhaDigitavel || null,
                        mensagemPersonalizada: mensagem || null
                    });

                    const sendTask = async () => {
                        for (const dest of destEmails) {
                            const emailSendId = require('crypto').randomUUID();

                            // 1. Registra envio em dash_email_sends para tracking de abertura e cliques
                            await db.query(
                                `INSERT INTO dash_email_sends (id, tenant_id, campanha_id, destinatario_nome, destinatario_email, destinatario_documento, assunto, status, enviado_em)
                                 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'Enviando', NOW())`,
                                [emailSendId, tenantId, campanhaId, clienteNomeFmt, dest, title.cliente_documento || null, 'Cobrança Ref. ao Sistema Coliseu']
                            ).catch(e => logger.warn('[GerarLoteItem] Aviso ao criar dash_email_sends:', e.message));

                            // 2. Injeta tracking (pixel de abertura + cliques)
                            const trackedHtml = EmailService.injectTracking(htmlCorpo, emailSendId);

                            let loteAttachments = [];
                            if (isCora) {
                                try {
                                    const BoletoPdfService = require('../services/BoletoPdfService');
                                    const pdfBuf = await BoletoPdfService.gerarBoletoPdf({
                                        cliente: {
                                            nome: clienteNomeFmt,
                                            documento: title.cliente_documento || clientDoc,
                                            endereco_completo: clientAddress || title.cliente_endereco || '—'
                                        },
                                        titulo: {
                                            id: title.id,
                                            id_firebird: title.id_firebird,
                                            descricao: title.descricao,
                                            valor: valorCobrar,
                                            data_vencimento: dueDateStr,
                                            data_emissao: new Date().toISOString().split('T')[0],
                                            multa_percentual: parseFloat(cfg.cora_multa_padrao || 2.0),
                                            juros_percentual: parseFloat(cfg.cora_juros_padrao || 1.0),
                                            nosso_numero: nossoNum || title.nosso_numero
                                        },
                                        cora: {
                                            linhaDigitavel: linhaDigitavel,
                                            barCode: barCode,
                                            nossoNumero: nossoNum,
                                            pdfUrl: bankSlipUrl,
                                            pixCopiaECola: pixEmv
                                        }
                                    });
                                    loteAttachments = [
                                        {
                                            filename: `boleto_${nossoNum || title.id}.pdf`,
                                            content: pdfBuf,
                                            contentType: 'application/pdf'
                                        }
                                    ];
                                } catch (pdfErr) {
                                    logger.warn('[GerarLoteItem] Falha ao gerar PDF Coliseu/Cora:', pdfErr.message);
                                    if (bankSlipUrl) {
                                        loteAttachments = [{ filename: `boleto_${nossoNum || title.id}.pdf`, path: bankSlipUrl }];
                                    }
                                }
                            } else if (bankSlipUrl) {
                                loteAttachments = [{ filename: `boleto_${nossoNum || title.id}.pdf`, path: bankSlipUrl }];
                            }

                            try {
                                if (configEmail.provedor === 'smtp') {
                                    const transporter = EmailService.createSmtpTransporter(configEmail);
                                    await EmailService.enviarSmtp(transporter, {
                                        de: `"${configEmail.remetenteNome}" <${configEmail.remetenteEmail}>`,
                                        para: dest,
                                        assunto: 'Cobrança Ref. ao Sistema Coliseu',
                                        html: trackedHtml,
                                        attachments: loteAttachments
                                    });
                                    transporter.close();
                                } else if (configEmail.provedor === 'brevo') {
                                    await EmailService.enviarLoteBrevo(configEmail, [{
                                        para: dest,
                                        nomeCliente: clienteNomeFmt,
                                        assunto: 'Cobrança Ref. ao Sistema Coliseu',
                                        html: trackedHtml,
                                        attachments: loteAttachments
                                    }]);
                                }

                                // Marca como enviado com sucesso
                                await db.query(
                                    `UPDATE dash_email_sends SET status = 'Enviado' WHERE id = $1::uuid`,
                                    [emailSendId]
                                ).catch(() => {});

                                if (campanhaId) {
                                    await db.query(
                                        `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status)
                                         VALUES ($1, $2, $3, $4, 'Sucesso')`,
                                        [tenantId, campanhaId, clienteNomeFmt, dest]
                                    ).catch(() => {});
                                }
                            } catch (singleErr) {
                                logger.error('[GerarLoteItem] Erro ao enviar para destinatario ' + dest + ':', singleErr);
                                await db.query(
                                    `UPDATE dash_email_sends SET status = 'Falha', metadata = $1 WHERE id = $2::uuid`,
                                    [JSON.stringify({ erro: singleErr.message }), emailSendId]
                                ).catch(() => {});

                                if (campanhaId) {
                                    await db.query(
                                        `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                                         VALUES ($1, $2, $3, $4, 'Falha', $5)`,
                                        [tenantId, campanhaId, clienteNomeFmt, dest, singleErr.message]
                                    ).catch(() => {});
                                }
                                throw singleErr;
                            }
                        }
                        emailEnviado = true;
                    };

                    await Promise.race([
                        sendTask(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de disparo de e-mail (15s)')), 15000))
                    ]).catch(e => logger.warn('[BatchEmissaoItem] Aviso disparo e-mail:', e.message));
                }
            } catch (errEmail) {
                logger.warn('[BatchEmissaoItem] Aviso envio e-mail:', errEmail.message);
            }
        } else if (campanhaId) {
            // Registra que o cliente não possui e-mail cadastrado
            await db.query(
                `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                 VALUES ($1, $2, $3, $4, 'Falha', 'Cliente sem e-mail cadastrado')`,
                [tenantId, campanhaId, title.cliente_nome_db || title.cliente_nome || 'Cliente', 'sem-email']
            ).catch(() => {});
        }

        const destEmailsStr = destEmails.join(', ');
        const logDesc = `Boleto (Nosso Nº ${nossoNum}) no valor de R$ ${valorCobrar.toFixed(2)} (Vencimento: ${dueDateStr}) emitido em lote via Banco ${portadorNome} pelo operador ${usuario}. ${emailEnviado ? 'E-mail enviado para ' + destEmailsStr : (destEmails.length > 0 ? 'E-mail não disparado' : 'Sem e-mail cadastrado')}`;


        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, data_evento)
             VALUES ($1::UUID, $2, $3, 'EMISSAO_BOLETO_LOTE', $4, $5, $6, $7, NOW())`,
            [String(targetTenantId), title.id, title.id, usuario, nossoNum, String(title.id_firebird || title.id), logDesc]
        ).catch(async (err) => {
            logger.warn('[BatchEmissaoLog] Erro ao gravar financeiro_log:', err.message);
            await db.query(
                `INSERT INTO dash_financeiro_logs (tenant_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, data_evento)
                 VALUES ($1::UUID, 'EMISSAO_BOLETO_LOTE', $2, $3, $4, $5, NOW())`,
                [String(targetTenantId), usuario, nossoNum, String(title.id_firebird || title.id), logDesc]
            ).catch(() => {});
        });

        // 7. Grava ocorrência na guia de Ocorrências (Aba Cobrança)
        await db.query(
            `INSERT INTO dash_automacoes_logs (tenant_id, cliente_id, financeiro_id, tipo, canal, destinatario, subcategoria, status, erro, enviado_em)
             VALUES ($1::UUID, $2, $3, 'EMISSAO_LOTE', 'EMAIL', $4, 'emissao', $5, $6, NOW())`,
            [
                tenantId,
                title.cliente_id_firebird || null,
                title.id,
                destEmailsStr || title.cliente_nome || 'Cliente sem email',
                emailEnviado ? 'Sucesso' : (destEmails.length > 0 ? 'Falha' : 'Sem Email'),
                emailEnviado ? null : (destEmails.length > 0 ? 'Falha ao disparar e-mail' : 'Cliente sem e-mail cadastrado no sistema')
            ]
        ).catch((err) => logger.warn('[BatchLog] Erro ao gravar automacao_log:', err.message));



        res.json({
            success: true,
            nosso_numero: nossoNum,
            bank_slip_url: bankSlipUrl,
            emailEnviado,
            destEmail: destEmailsStr,
            message: `Boleto (Nosso Nº ${nossoNum}) emitido com sucesso! ${emailEnviado ? 'E-mail enviado para ' + destEmailsStr : ''}`
        });

    } catch (err) {
        logger.error('[GerarLoteItem] Falha ao emitir boleto em lote', { error: err.message });
        res.status(400).json({
            success: false,
            error: err.message || 'Falha ao emitir boleto no Asaas.'
        });
    }
});

// POST /api/financeiro/boletos-emitidos/reenviar-email
router.post('/boletos-emitidos/reenviar-email', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { titulo_id, email_destino } = req.body;

        if (!titulo_id) {
            return res.status(400).json({ error: 'ID do título não informado.' });
        }

        const titleRes = await db.query(
            `SELECT f.id, f.id_firebird, f.descricao, f.nosso_numero, f.asaas_payment_id, f.bank_slip_url, f.asaas_bank_slip_url, f.pdf_url, f.valor, f.data_vencimento, f.data_emissao,
                    f.multa_percentual, f.juros_percentual,
                    f.asaas_linha_digitavel, f.asaas_bar_code, f.portador_nome,
                    COALESCE(c.nome, f.cliente_nome, f.descricao, 'Cliente') AS cliente_nome,
                    COALESCE(c.documento, f.cliente_documento) AS cliente_documento,
                    COALESCE(c.endereco_completo, f.cliente_endereco) AS cliente_endereco,
                    c.cidade AS cliente_cidade, c.estado AS cliente_estado,
                    c.email_financeiro,
                    c.email AS email_comercial,
                    f.cliente_email
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON (
                 (f.cliente_id IS NOT NULL AND c.id = f.cliente_id) OR
                 (f.cliente_id_firebird IS NOT NULL AND c.id_firebird = f.cliente_id_firebird)
             ) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
             WHERE (CAST(f.id AS TEXT) = $2 OR CAST(f.id_firebird AS TEXT) = $2) AND LOWER(f.tenant_id::text) = LOWER($1::text) LIMIT 1`,
            [String(tenantId), String(titulo_id)]
        );

        if (titleRes.rows.length === 0) {
            return res.status(404).json({ error: 'Título não encontrado.' });
        }

        const title = titleRes.rows[0];

        // Resolve todos os e-mails válidos (financeiro + comercial), em minúsculas, sem duplicatas
        let destEmails = [];
        if (email_destino) {
            destEmails = [email_destino.trim().toLowerCase()];
        } else {
            const _seen = new Set();
            for (const e of [title.email_financeiro, title.email_comercial, title.cliente_email]) {
                if (!e) continue;
                const norm = String(e).trim().toLowerCase();
                if (norm && norm.includes('@') && !_seen.has(norm)) {
                    _seen.add(norm);
                    destEmails.push(norm);
                }
            }
        }

        if (destEmails.length === 0) {
            return res.status(400).json({ error: 'E-mail de destino inválido ou não cadastrado.' });
        }
        const destEmailsStr = destEmails.join(', ');

        const EmailService = require('../services/emailService');
        const configEmail = await EmailService.getConfig(tenantId).catch(() => null);
        if (!configEmail || !configEmail.remetenteEmail) {
            return res.status(400).json({ error: 'Configuração de e-mail do remetente não encontrada ou incompleta.' });
        }

        const valorCobrar = parseFloat(title.valor) || 0;
        const dueDateStr = title.data_vencimento ? new Date(title.data_vencimento).toISOString().split('T')[0] : '';
        const [yVenc, mVenc, dVenc] = dueDateStr.split('-');
        const vencFormatted = (yVenc && mVenc && dVenc) ? `${dVenc}/${mVenc}/${yVenc}` : dueDateStr;

        let boletoUrl = title.bank_slip_url || title.asaas_bank_slip_url || title.pdf_url;
        let linhaDigitavel = title.asaas_linha_digitavel;
        const isCora = (title.portador_nome || '').toUpperCase() === 'CORA';
        let coraBsDetails = {};
        let coraPixEmv = null;

        // Se a URL não estiver no banco, tenta buscar via API do respectivo banco
        if (title.asaas_payment_id) {
            try {
                if (isCora) {
                    const CoraService = require('../services/CoraService');
                    const coraData = await CoraService.consultarBoleto(tenantId, title.asaas_payment_id);
                    coraBsDetails = coraData?.payment_options?.bank_slip || coraData?.payment_details?.bank_slip || {};
                    coraPixEmv = coraBsDetails.emv || coraData?.payment_options?.pix?.emv || coraData?.pix?.emv || null;
                    boletoUrl = coraBsDetails.url || coraBsDetails.pdf_url || coraData?.pdf_url || coraData?.url || boletoUrl;
                    linhaDigitavel = coraBsDetails.digitable || coraBsDetails.digitable_line || coraBsDetails.barcode || linhaDigitavel;
                } else {
                    const AsaasService = require('../services/asaasService');
                    const asaasData = await AsaasService.getPayment(tenantId, title.asaas_payment_id);
                    boletoUrl = asaasData?.bankSlipUrl || asaasData?.invoiceUrl || boletoUrl;
                    linhaDigitavel = asaasData?.identificationField || linhaDigitavel;
                }

                if (boletoUrl) {
                    await db.query(
                        `UPDATE dash_financeiro 
                         SET bank_slip_url = $1, asaas_bank_slip_url = $1, asaas_linha_digitavel = COALESCE($2, asaas_linha_digitavel) 
                         WHERE id = $3`,
                        [boletoUrl, linhaDigitavel || null, title.id]
                    ).catch(() => {});
                }
            } catch (errConsult) {
                logger.warn('[ReenviarEmail] Aviso ao consultar boleto na API do banco:', errConsult.message);
            }
        }

        const htmlCorpo = EmailService.defaultTemplateCobranca({
            nomeCliente: title.cliente_nome,
            valorCobranca: valorCobrar.toFixed(2),
            dataVencimento: vencFormatted,
            linkPagamento: boletoUrl,
            linhaDigitavel: linhaDigitavel
        });

        // Prepara o anexo do PDF com dados completos (layout oficial Coliseu / Febraban Cora com endereço completo)
        let emailAttachments = [];
        if (isCora) {
            try {
                const BoletoPdfService = require('../services/BoletoPdfService');
                const pdfBuffer = await BoletoPdfService.gerarBoletoPdf({
                    cliente: {
                        nome: title.cliente_nome,
                        documento: title.cliente_documento,
                        endereco_completo: title.cliente_endereco || (title.cliente_cidade ? `${title.cliente_cidade} - ${title.cliente_estado || ''}` : '—')
                    },
                    titulo: {
                        id: title.id,
                        id_firebird: title.id_firebird,
                        descricao: title.descricao,
                        valor: valorCobrar,
                        data_vencimento: dueDateStr,
                        data_emissao: title.data_emissao,
                        multa_percentual: title.multa_percentual || 2.0,
                        juros_percentual: title.juros_percentual || 1.0,
                        nosso_numero: coraBsDetails.our_number || title.nosso_numero
                    },
                    cora: {
                        linhaDigitavel: coraBsDetails.digitable || coraBsDetails.digitable_line || linhaDigitavel,
                        barCode: coraBsDetails.barcode || title.asaas_bar_code,
                        nossoNumero: coraBsDetails.our_number || title.nosso_numero,
                        pdfUrl: boletoUrl,
                        pixCopiaECola: coraPixEmv
                    }
                });
                emailAttachments = [
                    {
                        filename: `boleto_${title.nosso_numero || title.id}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ];
            } catch (errPdf) {
                logger.warn('[ReenviarEmail] Falha ao gerar PDF Coliseu/Cora, usando fallback:', errPdf.message);
                if (boletoUrl) {
                    emailAttachments = [{ filename: `boleto_${title.nosso_numero || title.id}.pdf`, path: boletoUrl }];
                }
            }
        } else if (boletoUrl) {
            emailAttachments = [{ filename: `boleto_${title.nosso_numero || title.id}.pdf`, path: boletoUrl }];
        }

        let emailEnviado = false;
        const sendTask = async () => {
            for (const dest of destEmails) {
                if (configEmail.provedor === 'smtp') {
                    const transporter = EmailService.createSmtpTransporter(configEmail);
                    await EmailService.enviarSmtp(transporter, {
                        de: `"${configEmail.remetenteNome}" <${configEmail.remetenteEmail}>`,
                        para: dest,
                        assunto: 'Reenvio de Cobrança Ref. ao Sistema Coliseu',
                        html: htmlCorpo,
                        attachments: emailAttachments
                    });
                    transporter.close();
                } else if (configEmail.provedor === 'brevo') {
                    await EmailService.enviarLoteBrevo(configEmail, [{
                        para: dest,
                        nomeCliente: title.cliente_nome,
                        assunto: 'Reenvio de Cobrança Ref. ao Sistema Coliseu',
                        html: htmlCorpo,
                        attachments: emailAttachments
                    }]);
                }

                // Registra o reenvio em dash_email_sends
                await db.query(
                    `INSERT INTO dash_email_sends (id, tenant_id, destinatario_nome, destinatario_email, destinatario_documento, assunto, status, enviado_em)
                     VALUES ($1::uuid, $2, $3, $4, $5, $6, 'Enviado', NOW())`,
                    [require('crypto').randomUUID(), tenantId, title.cliente_nome, dest, null, 'Reenvio de Cobrança Ref. ao Sistema Coliseu']
                ).catch(() => {});
            }
            emailEnviado = true;
        };

        await Promise.race([
            sendTask(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de envio de e-mail excedido (15s).')), 15000))
        ]);

        const usuario = req.user?.nome || req.user?.email || 'Operador';
        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, data_evento)
             VALUES ($1::UUID, $2, $3, 'REENVIO_BOLETO_EMAIL', $4, $5, $6, $7, NOW())`,
            [
                tenantId,
                title.id,
                title.id,
                usuario,
                title.nosso_numero,
                title.nosso_numero,
                `Boleto (Nosso Nº ${title.nosso_numero}) reenviado para ${destEmailsStr} pelo operador ${usuario}.`
            ]
        ).catch((logErr) => {
            logger.warn('[ReenviarEmailLog] Erro ao gravar no log:', logErr.message);
        });

        res.json({
            success: true,
            message: `E-mail de cobrança reenviado com sucesso para ${destEmailsStr}!`
        });

    } catch (err) {
        logger.error('[ReenviarEmail] Falha ao reenviar e-mail de boleto:', { error: err.message });
        res.status(400).json({
            success: false,
            error: err.message || 'Falha ao reenviar e-mail de boleto.'
        });
    }
});

// GET /api/financeiro/titulos/:id/logs (Histórico / Rastreabilidade de Movimentações do Título)
router.get('/titulos/:id/logs', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tituloId = req.params.id;

        const titleRes = await db.query(
            `SELECT id, id_firebird, tenant_id, nosso_numero FROM dash_financeiro WHERE (CAST(id AS TEXT) = $2 OR CAST(id_firebird AS TEXT) = $2) AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) LIMIT 1`,
            [String(tenantId), String(tituloId)]
        );

        const realId = titleRes.rows[0]?.id || tituloId;
        const realFbId = titleRes.rows[0]?.id_firebird || tituloId;
        const targetTenantId = titleRes.rows[0]?.tenant_id || tenantId;
        const nossoNumero = titleRes.rows[0]?.nosso_numero || '';

        const { rows } = await db.query(
            `SELECT * FROM dash_financeiro_logs 
             WHERE ($1 = '00000000-0000-0000-0000-000000000000' 
                    OR LOWER(tenant_id::text) = LOWER($1::text) 
                    OR LOWER(tenant_id::text) = LOWER($4::text)) 
               AND (
                 titulo_id = $2 OR CAST(titulo_id AS TEXT) = $2 OR CAST(titulo_id AS TEXT) = $3
                 OR financeiro_id = $2 OR CAST(financeiro_id AS TEXT) = $2 OR CAST(financeiro_id AS TEXT) = $3
                 OR CAST(numero_documento AS TEXT) = $2 OR CAST(numero_documento AS TEXT) = $3
                 OR (nosso_numero IS NOT NULL AND TRIM(nosso_numero) != '' AND nosso_numero = $5)
               ) 
             ORDER BY data_evento DESC`,
            [String(tenantId), realId, String(realFbId), String(targetTenantId), String(nossoNumero)]
        );

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/titulos/:id/detalhes-log (Detalhes completos do título + Logs)
router.get('/titulos/:id/detalhes-log', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tituloId = req.params.id;

        // 1. Busca prioritariamente pelo ID primário único do PostgreSQL (id)
        let titleRes = await db.query(
            `SELECT f.*, 
                    COALESCE(NULLIF(f.cliente_nome, ''), c.nome, f.descricao, 'Cliente não identificado') AS cliente_nome_full,
                    COALESCE(c.documento, f.cliente_documento) AS cliente_documento, 
                    COALESCE(NULLIF(c.email, ''), NULLIF(f.cliente_email, '')) AS cliente_email,
                    COALESCE(NULLIF(c.email_financeiro, ''), NULLIF(c.email, ''), NULLIF(f.cliente_email, '')) AS cliente_email_financeiro,
                    COALESCE(NULLIF(c.email_financeiro, ''), NULLIF(c.email, ''), NULLIF(f.cliente_email, '')) AS cliente_email_pref,
                    COALESCE(c.telefone, c.celular_secundario, f.cliente_telefone) AS cliente_telefone
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text) 
               AND (
                 (f.cliente_id IS NOT NULL AND c.id = f.cliente_id)
                 OR (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND c.id_firebird = f.cliente_id_firebird)
               )
             WHERE CAST(f.id AS TEXT) = $2
               AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($1::text))
             LIMIT 1`,
            [String(tenantId), String(tituloId)]
        );

        // 2. Se não encontrar pelo ID local, busca pelo ID Firebird
        if (titleRes.rows.length === 0) {
            titleRes = await db.query(
                `SELECT f.*, 
                        COALESCE(NULLIF(f.cliente_nome, ''), c.nome, f.descricao, 'Cliente não identificado') AS cliente_nome_full,
                        COALESCE(c.documento, f.cliente_documento) AS cliente_documento, 
                        COALESCE(NULLIF(c.email, ''), NULLIF(f.cliente_email, '')) AS cliente_email,
                        COALESCE(NULLIF(c.email_financeiro, ''), NULLIF(c.email, ''), NULLIF(f.cliente_email, '')) AS cliente_email_financeiro,
                        COALESCE(NULLIF(c.email_financeiro, ''), NULLIF(c.email, ''), NULLIF(f.cliente_email, '')) AS cliente_email_pref,
                        COALESCE(c.telefone, c.celular_secundario, f.cliente_telefone) AS cliente_telefone
                 FROM dash_financeiro f
                 LEFT JOIN dash_clientes c ON LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text) 
                   AND (
                     (f.cliente_id IS NOT NULL AND c.id = f.cliente_id)
                     OR (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND c.id_firebird = f.cliente_id_firebird)
                   )
                 WHERE CAST(f.id_firebird AS TEXT) = $2
                   AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($1::text))
                 LIMIT 1`,
                [String(tenantId), String(tituloId)]
            );
        }

        if (titleRes.rows.length === 0) {
            return res.status(404).json({ error: 'Título não encontrado.' });
        }

        const title = titleRes.rows[0];

        // Busca logs unificados de auditoria e automação (com suporte a Master Tenant, tenant_id do título, nosso_numero e logs de automação)
        let logsRes = await db.query(
            `SELECT * FROM (
                SELECT 
                    id, tenant_id::text, CAST(titulo_id AS TEXT) AS titulo_id, CAST(financeiro_id AS TEXT) AS financeiro_id, 
                    tipo_evento, data_evento, usuario, nosso_numero, numero_documento, descricao, detalhes
                FROM dash_financeiro_logs
                WHERE (
                    $1 = '00000000-0000-0000-0000-000000000000' 
                    OR tenant_id IS NULL 
                    OR LOWER(tenant_id::text) = LOWER($1::text) 
                    OR LOWER(tenant_id::text) = LOWER($4::text)
                )
                AND (
                    CAST(titulo_id AS TEXT) = $2 OR CAST(titulo_id AS TEXT) = $3
                    OR CAST(financeiro_id AS TEXT) = $2 OR CAST(financeiro_id AS TEXT) = $3
                    OR CAST(numero_documento AS TEXT) = $2 OR CAST(numero_documento AS TEXT) = $3
                    OR (nosso_numero IS NOT NULL AND TRIM(nosso_numero) != '' AND (nosso_numero = $5 OR LOWER(nosso_numero) = LOWER($5)))
                )

                UNION ALL

                SELECT 
                    id, tenant_id::text, CAST(financeiro_id AS TEXT) AS titulo_id, CAST(financeiro_id AS TEXT) AS financeiro_id, 
                    'EMISSAO_LOTE' AS tipo_evento, enviado_em AS data_evento, 'Sistema' AS usuario, 
                    NULL AS nosso_numero, NULL AS numero_documento, 
                    ('Disparo de cobrança em lote via E-mail para ' || COALESCE(destinatario, 'cliente') || '. Status: ' || COALESCE(status, 'Sucesso') || COALESCE(' — ' || erro, '')) AS descricao, 
                    NULL::jsonb AS detalhes
                FROM dash_automacoes_logs
                WHERE (
                    $1 = '00000000-0000-0000-0000-000000000000' 
                    OR tenant_id IS NULL 
                    OR LOWER(tenant_id::text) = LOWER($1::text) 
                    OR LOWER(tenant_id::text) = LOWER($4::text)
                )
                AND (
                    CAST(financeiro_id AS TEXT) = $2 OR CAST(financeiro_id AS TEXT) = $3
                )
            ) all_logs
            ORDER BY data_evento DESC`,
            [
                String(tenantId),
                String(title.id),
                String(title.id_firebird || title.id),
                String(title.tenant_id),
                String(title.nosso_numero || '')
            ]
        ).catch((err) => {
            console.error('[DetalhesLog] Erro ao buscar logs:', err);
            return { rows: [] };
        });

        // Auto-recuperação/recomposição de histórico: Se o título tem boleto (nosso_numero/asaas_payment_id) mas zero logs registrados
        if (logsRes.rows.length === 0 && (title.nosso_numero || title.asaas_payment_id)) {
            const nosNum = title.nosso_numero || title.asaas_payment_id;
            const valorStr = parseFloat(title.valor || 0).toFixed(2);
            const vencStr = title.data_vencimento ? new Date(title.data_vencimento).toLocaleDateString('pt-BR') : '';
            const userStr = title.usuario_vinculo || 'Operador';
            const autoLogDesc = `Boleto (Nosso Nº ${nosNum}) no valor de R$ ${valorStr} (Vencimento: ${vencStr}) emitido e vinculado ao Banco Asaas pelo operador ${userStr}.`;

            await db.query(
                `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, data_evento)
                 VALUES ($1::UUID, $2, $3, 'EMISSAO_BOLETO', $4, $5, $6, $7, COALESCE($8, NOW()))`,
                [
                    String(title.tenant_id || tenantId),
                    title.id,
                    title.id,
                    userStr,
                    nosNum,
                    String(title.id_firebird || title.id),
                    autoLogDesc,
                    title.data_vinculo || title.created_at || new Date()
                ]
            ).catch((e) => console.error('[AutoLogRecovery] Erro ao auto-gerar log de boleto:', e.message));

            const refreshedLogs = await db.query(
                `SELECT 
                    id, tenant_id::text, CAST(titulo_id AS TEXT) AS titulo_id, CAST(financeiro_id AS TEXT) AS financeiro_id, 
                    tipo_evento, data_evento, usuario, nosso_numero, numero_documento, descricao, detalhes
                 FROM dash_financeiro_logs 
                 WHERE (CAST(titulo_id AS TEXT) = $1 OR CAST(titulo_id AS TEXT) = $2 
                        OR CAST(financeiro_id AS TEXT) = $1 OR CAST(financeiro_id AS TEXT) = $2
                        OR CAST(numero_documento AS TEXT) = $1 OR CAST(numero_documento AS TEXT) = $2
                        OR (nosso_numero IS NOT NULL AND TRIM(nosso_numero) != '' AND nosso_numero = $3))
                 ORDER BY data_evento DESC`,
                [String(title.id), String(title.id_firebird || title.id), String(title.nosso_numero || '')]
            ).catch(() => ({ rows: [] }));
            
            if (refreshedLogs.rows.length > 0) {
                logsRes = refreshedLogs;
            }
        }

        res.json({
            data: title,
            logs: logsRes.rows
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/titulos/:id/desvincular-boleto (Desvincular/Cancelar Boleto para Emissão de Novo)
router.post('/titulos/:id/desvincular-boleto', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tituloId = req.params.id;
        const usuario = req.user?.nome || req.user?.email || 'Operador';

        // Busca título no banco com suporte a Master Tenant e id_firebird
        const titleRes = await db.query(
            `SELECT * FROM dash_financeiro 
             WHERE (CAST(id AS TEXT) = $2 OR CAST(id_firebird AS TEXT) = $2) 
               AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) 
             LIMIT 1`,
            [String(tenantId), String(tituloId)]
        );

        if (titleRes.rows.length === 0) {
            return res.status(404).json({ error: 'Título não encontrado.' });
        }

        const title = titleRes.rows[0];
        const targetTenantId = title.tenant_id || tenantId;
        const oldNossoNumero = title.nosso_numero;
        const oldAsaasId = title.asaas_payment_id;

        // Se tiver payment ID no Cora (começando com inv_) ou portador CORA, cancela na Cora via API
        if (oldAsaasId && String(oldAsaasId).startsWith('inv_')) {
            try {
                const CoraService = require('../services/CoraService');
                await CoraService.cancelarBoleto(targetTenantId, oldAsaasId).catch(() => {});
            } catch (cErr) {
                console.warn('[DesvincularBoleto] Aviso ao cancelar no Cora:', cErr.message);
            }
        } else if (oldAsaasId && String(oldAsaasId).startsWith('pay_')) {
            // Se tiver payment ID no Asaas (começando com pay_), cancela no Asaas via API
            try {
                const AsaasService = require('../services/asaasService');
                await AsaasService.cancelPayment(targetTenantId, oldAsaasId).catch(() => {});
            } catch (aErr) {
                console.warn('[DesvincularBoleto] Aviso ao cancelar no Asaas:', aErr.message);
            }
        }

        // Limpa vínculo do boleto para permitir nova emissão
        await db.query(
            `UPDATE dash_financeiro
             SET nosso_numero = NULL,
                 asaas_payment_id = NULL,
                 bank_slip_url = NULL,
                 pdf_url = NULL,
                 asaas_bank_slip_url = NULL,
                 asaas_linha_digitavel = NULL,
                 asaas_bar_code = NULL,
                 status_boleto = NULL,
                 portador_nome = 'CARTEIRA',
                 alerta_bloqueio = false
             WHERE id = $1 AND ($2 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($2::text))`,
            [title.id, String(tenantId)]
        );

        // Registra log de auditoria
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_financeiro_logs (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(100) NOT NULL,
                titulo_id INT,
                financeiro_id INT,
                tipo_evento VARCHAR(50) NOT NULL,
                data_evento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                usuario VARCHAR(100) DEFAULT 'Sistema',
                nosso_numero VARCHAR(100),
                numero_documento VARCHAR(100),
                descricao TEXT,
                detalhes JSONB
            );
            ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS titulo_id INT;
            ALTER TABLE dash_financeiro_logs ADD COLUMN IF NOT EXISTS financeiro_id INT;
            ALTER TABLE dash_financeiro_logs ALTER COLUMN titulo_id DROP NOT NULL;
            ALTER TABLE dash_financeiro_logs ALTER COLUMN financeiro_id DROP NOT NULL;
        `).catch(() => {});

        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao)
             VALUES ($1::UUID, $2, $3, 'BOLETO_CANCELADO', $4, $5, $6, $7)`,
            [
                String(targetTenantId),
                title.id,
                title.id,
                usuario,
                oldNossoNumero || 'N/A',
                String(title.id_firebird || title.id),
                `Boleto (Nosso Nº ${oldNossoNumero || 'sem número'}, ID Asaas ${oldAsaasId || 'sem ID'}) foi cancelado pelo operador ${usuario}. O título permanece em aberto para emissão de novo boleto.`
            ]
        ).catch(err => {
            console.error('[DesvincularBoleto] Erro ao gravar log:', err);
        });

        res.json({
            success: true,
            message: 'Boleto cancelado e desvinculado com sucesso! O título permanece em aberto para emissão de um novo boleto.'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/opcoes-erp
// Retorna listas de opções cadastradas no ERP (Centros de Custo, Planos de Contas, Classes de Clientes)
router.get('/opcoes-erp', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        
        const ccRes = await db.query(
            `SELECT DISTINCT nome AS item FROM dash_filiais WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) AND nome IS NOT NULL AND TRIM(nome) != ''
             UNION
             SELECT DISTINCT centro_custo AS item FROM dash_financeiro WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) AND centro_custo IS NOT NULL AND TRIM(centro_custo) != ''
             ORDER BY item ASC`,
            [String(tenantId)]
        ).catch(() => ({ rows: [] }));

        const pcRes = await db.query(
            `SELECT DISTINCT plano_contas_nome AS item FROM dash_financeiro WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) AND plano_contas_nome IS NOT NULL AND TRIM(plano_contas_nome) != ''
             UNION
             SELECT DISTINCT tipo_documento AS item FROM dash_financeiro WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) AND tipo_documento IS NOT NULL AND TRIM(tipo_documento) != ''
             ORDER BY item ASC`,
            [String(tenantId)]
        ).catch(() => ({ rows: [] }));

        const clRes = await db.query(
            `SELECT DISTINCT classe AS item FROM dash_clientes WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) AND classe IS NOT NULL AND TRIM(classe) != ''
             ORDER BY item ASC`,
            [String(tenantId)]
        ).catch(() => ({ rows: [] }));

        const defaultCentrosCusto = ['COLISEU CAMPO GRANDE', 'COLISEU DOURADOS', 'COLISEU PONTA PORÃ', 'MATRIZ', 'GERAL'];
        const defaultPlanosContas = ['VENDA DENTRO DO ESTADO', 'VENDA FORA DO ESTADO', 'PRESTAÇÃO DE SERVIÇOS', 'MENSALIDADE / SERVIÇO', 'RECEITAS FINANCEIRAS', 'OUTRAS RECEITAS'];
        const defaultClassesCliente = ['VAREJO ROUPAS', 'VAREJO', 'ATACADO', 'DISTRIBUIDORA', 'REVENDA', 'GERAL'];

        const centrosCusto = Array.from(new Set([...defaultCentrosCusto, ...ccRes.rows.map(r => r.item)]));
        const planosContas = Array.from(new Set([...defaultPlanosContas, ...pcRes.rows.map(r => r.item)]));
        const classesCliente = Array.from(new Set([...defaultClassesCliente, ...clRes.rows.map(r => r.item)]));

        res.json({ centrosCusto, planosContas, classesCliente });
    } catch (err) {
        next(err);
    }
});

// PUT /api/financeiro/titulos/:id
// Atualiza dados cadastrais de um título (Centro Custo, Plano Contas, Portador, Setor, Histórico, Valor, Vencimento, etc.)
router.put('/titulos/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tituloId = req.params.id;
        const usuario = req.user?.nome || req.user?.email || 'Operador';
        const {
            centro_custo,
            setor,
            plano_contas,
            portador_nome,
            especie_nome,
            descricao,
            data_vencimento,
            valor,
            historico
        } = req.body;

        let titleRes = await db.query(
            `SELECT * FROM dash_financeiro 
             WHERE CAST(id AS TEXT) = $2 
               AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) 
             LIMIT 1`,
            [String(tenantId), String(tituloId)]
        );

        if (titleRes.rows.length === 0) {
            titleRes = await db.query(
                `SELECT * FROM dash_financeiro 
                 WHERE CAST(id_firebird AS TEXT) = $2 
                   AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($1::text)) 
                 LIMIT 1`,
                [String(tenantId), String(tituloId)]
            );
        }

        if (titleRes.rows.length === 0) {
            return res.status(404).json({ error: 'Título não encontrado.' });
        }

        const title = titleRes.rows[0];
        const targetTenantId = title.tenant_id || tenantId;

        // Compara valores antigos x novos para o histórico de auditoria
        const changes = [];
        if (valor !== undefined && valor !== null && parseFloat(valor) !== parseFloat(title.valor || 0)) {
            changes.push(`Valor: R$ ${parseFloat(title.valor || 0).toFixed(2)} ➔ R$ ${parseFloat(valor).toFixed(2)}`);
        }
        if (data_vencimento && title.data_vencimento) {
            const oldVenc = new Date(title.data_vencimento).toISOString().split('T')[0];
            const newVenc = new Date(data_vencimento).toISOString().split('T')[0];
            if (oldVenc !== newVenc) {
                changes.push(`Vencimento: ${oldVenc} ➔ ${newVenc}`);
            }
        }
        if (portador_nome && portador_nome !== title.portador_nome) {
            changes.push(`Portador: ${title.portador_nome || 'N/A'} ➔ ${portador_nome}`);
        }
        if (centro_custo && centro_custo !== title.centro_custo) {
            changes.push(`Centro Custo: ${title.centro_custo || 'N/A'} ➔ ${centro_custo}`);
        }
        if (plano_contas && plano_contas !== title.plano_contas_nome) {
            changes.push(`Plano Contas: ${title.plano_contas_nome || 'N/A'} ➔ ${plano_contas}`);
        }
        if (setor && setor !== title.setor) {
            changes.push(`Setor: ${title.setor || 'N/A'} ➔ ${setor}`);
        }
        if (historico !== undefined && historico !== title.historico) {
            changes.push(`Histórico atualizado`);
        }

        const updatedRes = await db.query(
            `UPDATE dash_financeiro
             SET centro_custo = COALESCE($1, centro_custo),
                 setor = COALESCE($2, setor),
                 plano_contas_nome = COALESCE($3, plano_contas_nome),
                 portador_nome = COALESCE($4, portador_nome),
                 especie_nome = COALESCE($5, especie_nome),
                 descricao = COALESCE($6, descricao),
                 data_vencimento = COALESCE($7, data_vencimento),
                 valor = COALESCE($8, valor),
                 historico = COALESCE($9, historico)
             WHERE id = $10 AND ($11 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($11::text))
             RETURNING *`,
            [
                centro_custo || null,
                setor || null,
                plano_contas || null,
                portador_nome || null,
                especie_nome || null,
                descricao || null,
                data_vencimento || null,
                valor !== undefined && valor !== null ? parseFloat(valor) : null,
                historico !== undefined ? historico : null,
                title.id,
                String(tenantId)
            ]
        );

        // Registra Log detalhado das alterações no Título
        const descLog = changes.length > 0
            ? `Alterações no título efetuadas por ${usuario}: ${changes.join(' | ')}`
            : `Edição cadastral do título realizada pelo operador ${usuario}.`;

        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, descricao)
             VALUES ($1::UUID, $2, $3, 'ALTERACAO_TITULO', $4, $5, $6)`,
            [
                String(targetTenantId),
                title.id,
                title.id,
                usuario,
                title.nosso_numero || null,
                descLog
            ]
        ).catch((err) => {
            console.error('[UpdateTitle] Erro ao gravar log:', err);
        });

        const updatedTitle = updatedRes.rows[0] || title;

        // Enfileira alteração do título para sincronismo no ERP Coliseu (Firebird)
        await db.query(`
            INSERT INTO dash_sync_metadata (tenant_id, tabela, operacao, payload, status, created_at)
            VALUES ($1, 'ALTERACAO_TITULO', 'UPDATE', $2::jsonb, 'PENDENTE', NOW())
        `, [
            String(targetTenantId),
            JSON.stringify({
                id_nexus: updatedTitle.id,
                id_firebird: updatedTitle.id_firebird || null,
                descricao: updatedTitle.descricao,
                data_vencimento: updatedTitle.data_vencimento,
                valor: updatedTitle.valor,
                nosso_numero: updatedTitle.nosso_numero || null,
                portador_nome: updatedTitle.portador_nome || null,
                especie_nome: updatedTitle.especie_nome || null,
                historico: historico || null,
                moeda: updatedTitle.moeda || 'REAL',
                centro_custo: updatedTitle.centro_custo_nome || updatedTitle.centro_custo || 'COLISEU RECEITAS',
                centro_custo_id: updatedTitle.centro_custo || 6,
                plano_contas: updatedTitle.plano_contas_nome || 'MENSALIDADE / SERVIÇO',
                plano_contas_id: updatedTitle.plano_contas_id || 1
            })
        ]).catch((e) => console.error('[Financeiro] Falha ao enfileirar ALTERACAO_TITULO:', e.message));

        res.json({
            success: true,
            data: updatedRes.rows[0],
            message: 'Título financeiro atualizado com sucesso!'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/financeiro/titulos/:id/eliminar (Eliminar Título com registro em Log de Auditoria)
router.post('/titulos/:id/eliminar', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tituloId = req.params.id;
        const { motivo } = req.body || {};
        const usuario = req.user?.nome || req.user?.email || 'Operador';

        // 1. Localiza o título antes da exclusão
        const titleRes = await db.query(
            `SELECT f.*, COALESCE(c.nome, f.cliente_nome, f.descricao, 'Cliente não identificado') AS cliente_nome_full
             FROM dash_financeiro f
             LEFT JOIN dash_clientes c ON (c.id_firebird = f.cliente_id_firebird OR c.id = f.cliente_id) AND LOWER(c.tenant_id::text) = LOWER(f.tenant_id::text)
             WHERE (CAST(f.id AS TEXT) = $2 OR CAST(f.id_firebird AS TEXT) = $2 OR f.nosso_numero = $2 OR f.asaas_payment_id = $2)
               AND ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(f.tenant_id::text) = LOWER($1::text))
             LIMIT 1`,
            [String(tenantId), String(tituloId)]
        );

        if (titleRes.rows.length === 0) {
            return res.status(404).json({ error: 'Título financeiro não encontrado.' });
        }

        const title = titleRes.rows[0];
        const targetTenantId = title.tenant_id || tenantId;

        // 2. Grava o Log de Eliminação com Detalhes Completos
        const descLog = `TÍTULO ELIMINADO: Título #${title.id} (Cliente: ${title.cliente_nome_full}, NossoNº: ${title.nosso_numero || '—'}, Valor: R$ ${parseFloat(title.valor || 0).toFixed(2)}) foi eliminado do sistema por ${usuario}. Motivo: ${motivo || 'Eliminação manual efetuada pelo usuário'}.`;

        await db.query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, nosso_numero, numero_documento, descricao, detalhes, data_evento)
             VALUES ($1::UUID, $2, $3, 'ELIMINACAO_TITULO', $4, $5, $6, $7, $8, NOW())`,
            [
                String(targetTenantId),
                title.id,
                title.id,
                usuario,
                title.nosso_numero || null,
                title.numero_documento || null,
                descLog,
                JSON.stringify({
                    id: title.id,
                    nosso_numero: title.nosso_numero,
                    cliente_nome: title.cliente_nome_full,
                    valor: title.valor,
                    data_vencimento: title.data_vencimento,
                    motivo: motivo || 'Eliminação manual'
                })
            ]
        ).catch((err) => {
            console.error('[EliminarTitulo] Erro ao gravar log de eliminação:', err);
        });

        // 3. Exclui o título do banco de dados
        await db.query(
            `DELETE FROM dash_financeiro WHERE id = $1 AND ($2 = '00000000-0000-0000-0000-000000000000' OR LOWER(tenant_id::text) = LOWER($2::text))`,
            [title.id, String(targetTenantId)]
        );

        res.json({
            success: true,
            message: `Título #${title.id} eliminado com sucesso e registrado no log de auditoria.`
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/logs (Central de Logs de Auditoria do Sistema)
router.get('/logs', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { search, tipo_evento, startDate, endDate, page = 1, limit = 50 } = req.query;

        const pNum = Math.max(1, parseInt(page) || 1);
        const lNum = Math.max(1, Math.min(500, parseInt(limit) || 50));
        const offset = (pNum - 1) * lNum;

        const where = [
            `($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(l.tenant_id::text) = LOWER($1::text))`
        ];
        const binds = [String(tenantId)];
        let pIndex = 2;

        if (tipo_evento && tipo_evento !== 'TODOS' && tipo_evento !== 'todos') {
            where.push(`LOWER(l.tipo_evento) = $${pIndex++}`);
            binds.push(tipo_evento.toLowerCase());
        }

        if (startDate) {
            where.push(`l.data_evento::date >= $${pIndex++}`);
            binds.push(startDate);
        }

        if (endDate) {
            where.push(`l.data_evento::date <= $${pIndex++}`);
            binds.push(endDate);
        }

        if (search) {
            where.push(`(
                LOWER(COALESCE(l.descricao, '')) LIKE $${pIndex} OR
                LOWER(COALESCE(l.usuario, '')) LIKE $${pIndex} OR
                LOWER(COALESCE(l.nosso_numero, '')) LIKE $${pIndex} OR
                LOWER(COALESCE(l.tipo_evento, '')) LIKE $${pIndex}
            )`);
            binds.push(`%${search.toLowerCase()}%`);
            pIndex++;
        }

        const countSql = `SELECT COUNT(*) as total FROM dash_financeiro_logs l WHERE ${where.join(' AND ')}`;
        const { rows: countRows } = await db.query(countSql, binds);
        const total = parseInt(countRows[0]?.total || '0');

        const sql = `
            SELECT 
                l.id, l.tenant_id, l.titulo_id, l.financeiro_id, l.tipo_evento, l.usuario,
                l.nosso_numero, l.numero_documento, l.descricao, l.detalhes, l.data_evento
            FROM dash_financeiro_logs l
            WHERE ${where.join(' AND ')}
            ORDER BY l.data_evento DESC
            LIMIT ${lNum} OFFSET ${offset}
        `;
        const { rows } = await db.query(sql, binds);

        res.json({
            data: rows,
            logs: rows,
            total,
            page: pNum,
            limit: lNum,
            totalPages: Math.ceil(total / lNum)
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/financeiro/varredura-origens
// Retorna um relatório analítico dos títulos criados no Nexus vs importados do ERP
router.get('/varredura-origens', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;

        // 1. Visão geral estatística
        const statsRes = await db.query(`
            SELECT 
                COUNT(*) as total_titulos,
                COUNT(*) FILTER (WHERE id_firebird IS NOT NULL AND id_firebird > 1) as importados_erp,
                COUNT(*) FILTER (WHERE id_firebird IS NULL OR id_firebird <= 1 OR origem = 'NEXUS' OR origem = 'individual' OR origem = 'CONTRATO') as lancados_nexus,
                COUNT(*) FILTER (WHERE status_pagamento = 'PAGO' OR status_pagamento = 'QUITADO') as total_pagos,
                COUNT(*) FILTER (WHERE status_pagamento = 'ABERTO') as total_abertos,
                COUNT(*) FILTER (WHERE nosso_numero IS NOT NULL AND TRIM(nosso_numero) != '' AND nosso_numero != '—') as com_boleto_emitido
            FROM dash_financeiro
            WHERE (LOWER(tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
        `, [String(tenantId)]);

        // 2. Lista dos títulos lançados diretamente no Nexus
        const titulosNexusRes = await db.query(`
            SELECT 
                f.id AS id_nexus,
                f.id_firebird,
                f.tipo,
                f.descricao,
                COALESCE(NULLIF(f.cliente_nome, ''), c.nome, 'Não informado') AS cliente_nome,
                COALESCE(c.documento, f.cliente_documento, f.cnpj_cpf) AS cliente_documento,
                f.cliente_id,
                f.cliente_id_firebird,
                f.valor,
                f.valor_pago,
                f.status_pagamento,
                f.data_emissao,
                f.data_vencimento,
                f.data_pagamento,
                f.portador_nome,
                f.especie_nome,
                f.nosso_numero,
                f.asaas_payment_id,
                f.origem,
                f.contrato_id,
                f.numero_parcela,
                f.created_at
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c ON (c.id = f.cliente_id OR (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND c.id_firebird = f.cliente_id_firebird))
            WHERE (LOWER(f.tenant_id::text) = LOWER($1::text) OR $1 = '00000000-0000-0000-0000-000000000000')
              AND (f.id_firebird IS NULL OR f.id_firebird <= 1 OR f.origem = 'NEXUS' OR f.origem = 'individual' OR f.origem = 'CONTRATO')
            ORDER BY f.id DESC
            LIMIT 200
        `, [String(tenantId)]);

        res.json({
            estatisticas: statsRes.rows[0],
            titulos_nexus: titulosNexusRes.rows,
            total_encontrados: titulosNexusRes.rows.length
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

