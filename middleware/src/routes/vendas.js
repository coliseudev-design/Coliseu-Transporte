'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { getPeriodRange } = require('../utils/period');
const cfopUtil = require('../utils/cfop');
const { buildVendedorFilter } = require('./filiais');

// GET /api/vendas/faturadas?period=today
router.get('/faturadas', async (req, res, next) => {
    try {
        const period = req.query.period || '7d';
        const tenantId = req.tenant.id;
        const vendedorId = req.query.vendedor_id;
        const { start_date, end_date } = req.query;

        const tzOffset = -180;
        const anchorDate = new Date(Date.now() + (tzOffset * 60 * 1000));
        const { start, end } = getPeriodRange(period, start_date, end_date, anchorDate);

        const salesFilter = cfopUtil.getSalesFilterClause('v');
        const vf = buildVendedorFilter(vendedorId, 4, 'v');

        const { rows } = await db.query(`
            SELECT 
                TO_CHAR(COALESCE(v.data_vencimento, v.data_venda), 'YYYY-MM-DD') AS data,
                SUM(v.valor_total - COALESCE(v.valor_desconto, 0)) AS total,
                COUNT(*) AS quantidade
            FROM dash_vendas v
            WHERE v.tenant_id = $1 
              AND COALESCE(v.data_vencimento, v.data_venda) >= $2 
              AND COALESCE(v.data_vencimento, v.data_venda) <= $3
              ${salesFilter}
              ${vf.clause}
            GROUP BY TO_CHAR(COALESCE(v.data_vencimento, v.data_venda), 'YYYY-MM-DD')
            ORDER BY data
        `, [tenantId, start, end, ...vf.params]);

        // Retorna numbers para o frontend em total e quantidade
        const formatted = rows.map(r => ({
            data: r.data,
            total: parseFloat(r.total),
            quantidade: parseInt(r.quantidade, 10)
        }));

        res.json({ period: { start, end, label: period }, data: formatted });
    } catch (err) {
        next(err);
    }
});

// GET /api/vendas/por-horario
router.get('/por-horario', async (req, res, next) => {
    try {
        const date = req.query.date;
        const tenantId = req.tenant.id;
        let sql;
        let params;

        if (date) {
            sql = `
                SELECT 
                    EXTRACT(HOUR FROM COALESCE(data_vencimento, data_venda)) AS hora,
                    COUNT(*) AS quantidade,
                    SUM(valor_total - COALESCE(valor_desconto, 0)) AS total
                FROM dash_vendas
                WHERE tenant_id = $1
                  AND TO_CHAR(COALESCE(data_vencimento, data_venda), 'YYYY-MM-DD') = $2
                  ${cfopUtil.getSalesFilterClause('')}
                GROUP BY EXTRACT(HOUR FROM COALESCE(data_vencimento, data_venda))
                ORDER BY hora
            `;
            params = [tenantId, date];
        } else {
            // Últimos 30 dias
            sql = `
                SELECT 
                    EXTRACT(HOUR FROM COALESCE(data_vencimento, data_venda)) AS hora,
                    COUNT(*) AS quantidade,
                    SUM(valor_total - COALESCE(valor_desconto, 0)) AS total
                FROM dash_vendas
                WHERE tenant_id = $1
                  AND COALESCE(data_vencimento, data_venda) >= NOW() - INTERVAL '30 days'
                  ${cfopUtil.getSalesFilterClause('')}
                GROUP BY EXTRACT(HOUR FROM COALESCE(data_vencimento, data_venda))
                ORDER BY hora
            `;
            params = [tenantId];
        }

        const { rows } = await db.query(sql, params);

        const map = new Map();
        for (let h = 0; h < 24; h++) map.set(h, { hora: h, quantidade: 0, total: 0 });

        for (const r of rows) {
            const h = parseInt(r.hora, 10);
            map.set(h, { hora: h, quantidade: parseInt(r.quantidade, 10), total: parseFloat(r.total) || 0 });
        }

        res.json({ data: Array.from(map.values()) });
    } catch (err) {
        next(err);
    }
});

// GET /api/vendas/pedidos-abertos
router.get('/pedidos-abertos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(`
            SELECT 
                TRIM(status) as status, 
                COUNT(*) AS quantidade, 
                SUM(valor_total - COALESCE(valor_desconto, 0)) AS total
            FROM dash_vendas
            WHERE tenant_id = $1 
              AND TRIM(status) NOT IN ('FATURADO', 'FINALIZADO', 'CANCELADO', 'PROCESSADO')
            GROUP BY TRIM(status)
            ORDER BY quantidade DESC
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

// GET /api/vendas/kpis
router.get('/kpis', async (req, res, next) => {
    try {
        const period = req.query.period || 'hoje';
        const tenantId = req.tenant.id;
        const { start_date, end_date } = req.query;

        const tzOffset = -180;
        const anchorDate = new Date(Date.now() + (tzOffset * 60 * 1000));
        const { start, end } = getPeriodRange(period, start_date, end_date, anchorDate);

        const salesFilter = cfopUtil.getSalesFilterClause('v');

        const { rows } = await db.query(`
            SELECT 
                COALESCE(SUM(v.valor_total - COALESCE(v.valor_desconto, 0)), 0) AS total_faturado,
                COUNT(*) AS qtd_pedidos,
                COALESCE(AVG(v.valor_total - COALESCE(v.valor_desconto, 0)), 0) AS ticket_medio,
                COALESCE(MAX(v.valor_total - COALESCE(v.valor_desconto, 0)), 0) AS maior_venda,
                COALESCE(MIN(v.valor_total - COALESCE(v.valor_desconto, 0)), 0) AS menor_venda
            FROM dash_vendas v
            WHERE v.tenant_id = $1
              AND COALESCE(v.data_vencimento, v.data_venda) >= $2
              AND COALESCE(v.data_vencimento, v.data_venda) <= $3
              ${salesFilter}
        `, [tenantId, start, end]);

        const kpis = {
            total_faturado: parseFloat(rows[0].total_faturado),
            qtd_pedidos: parseInt(rows[0].qtd_pedidos, 10),
            ticket_medio: parseFloat(rows[0].ticket_medio),
            maior_venda: parseFloat(rows[0].maior_venda),
            menor_venda: parseFloat(rows[0].menor_venda)
        };

        res.json({ period: { start, end, label: period }, kpis });
    } catch (err) {
        next(err);
    }
});

// GET /api/vendas/recentes
router.get('/recentes', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const tenantId = req.tenant.id;
        const vendedorId = req.query.vendedor_id;

        const vf = buildVendedorFilter(vendedorId, 3, 'v');

        // join com tabelas sincronizadas usa id_firebird pq é ele quem vem nos FKs da tabela de vendas
        const salesFilter = cfopUtil.getSalesFilterClause('v');
        const { rows } = await db.query(`
            SELECT 
                v.id_firebird AS id, 
                v.numero_pedido, 
                COALESCE(v.data_vencimento, v.data_venda) AS data_venda, 
                (v.valor_total - COALESCE(v.valor_desconto, 0)) AS valor_total, 
                v.status,
                c.nome AS cliente, 
                vd.nome AS vendedor
            FROM dash_vendas v
            LEFT JOIN dash_clientes c ON c.id_firebird = v.cliente_id_firebird AND c.tenant_id = v.tenant_id
            LEFT JOIN dash_vendedores vd ON vd.id_firebird = v.vendedor_id_firebird AND vd.tenant_id = v.tenant_id
            WHERE v.tenant_id = $1 ${salesFilter} ${vf.clause}
            ORDER BY COALESCE(v.data_vencimento, v.data_venda) DESC
            LIMIT $2
        `, [tenantId, limit, ...vf.params]);

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/vendas/pedidos-faturados
router.get('/pedidos-faturados', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { start_date, end_date, search } = req.query;

        let sql = `
            SELECT 
                v.id_firebird AS id,
                v.numero_pedido,
                COALESCE(v.data_vencimento, v.data_venda) AS data_venda,
                v.valor_total,
                v.status,
                v.especie,
                c.nome AS cliente,
                c.id_firebird AS cliente_codigo,
                c.telefone AS cliente_telefone,
                c.celular_secundario AS cliente_celular_secundario,
                vd.nome AS vendedor
            FROM dash_vendas v
            LEFT JOIN dash_clientes c ON c.id_firebird = v.cliente_id_firebird AND c.tenant_id = v.tenant_id
            LEFT JOIN dash_vendedores vd ON vd.id_firebird = v.vendedor_id_firebird AND vd.tenant_id = v.tenant_id
            WHERE v.tenant_id = $1
              ${cfopUtil.getSalesFilterClause('v')}
        `;

        const params = [tenantId];
        let paramIdx = 2;

        if (start_date) {
            sql += ` AND COALESCE(v.data_vencimento, v.data_venda) >= $${paramIdx}`;
            params.push(new Date(start_date + 'T00:00:00'));
            paramIdx++;
        }
        if (end_date) {
            sql += ` AND COALESCE(v.data_vencimento, v.data_venda) <= $${paramIdx}`;
            params.push(new Date(end_date + 'T23:59:59'));
            paramIdx++;
        }

        if (search) {
            sql += ` AND (
                c.nome ILIKE $${paramIdx} 
                OR CAST(c.id_firebird AS TEXT) = $${paramIdx + 1}
                OR TRIM(v.numero_pedido) = $${paramIdx + 1}
            )`;
            params.push(`%${search}%`);
            params.push(search.trim());
            paramIdx += 2;
        }

        sql += ` ORDER BY COALESCE(v.data_vencimento, v.data_venda) DESC`;

        const { rows } = await db.query(sql, params);

        const formatted = rows.map(r => {
            const isDev = (r.valor_total < 0) || (r.especie && r.especie.trim() === 'DEVOLUCAO DE CLIENTE');
            const tipo = isDev ? 'Devolução' : 'Venda';
            
            let valTotal = parseFloat(r.valor_total) || 0;
            if (isDev && valTotal > 0) {
                valTotal = -valTotal;
            }

            return {
                id: r.id,
                numero_pedido: r.numero_pedido || r.id,
                numero_nota: null,
                data: r.data_venda,
                cliente: r.cliente || 'AO CONSUMIDOR',
                cliente_codigo: r.cliente_codigo,
                cliente_telefone: r.cliente_telefone,
                cliente_celular_secundario: r.cliente_celular_secundario,
                vendedor: r.vendedor || 'COLISEU',
                tipo,
                valor_total: valTotal
            };
        });

        const totalNotas = formatted.length;
        const acumulado = formatted.reduce((acc, curr) => acc + curr.valor_total, 0);

        res.json({
            data: formatted,
            summary: {
                total_notas: totalNotas,
                acumulado: acumulado
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
