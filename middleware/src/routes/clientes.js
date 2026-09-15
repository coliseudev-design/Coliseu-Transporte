'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { getPeriodRange } = require('../utils/period');

function applySuperBuscaFilter(search, pIndex, where, binds) {
    if (!search || !String(search).trim()) return pIndex;

    const s = String(search).trim();
    const cleanDigits = s.replace(/\D/g, '');

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
        OR COALESCE(c.email, '') ILIKE $${pIndex}
        OR COALESCE(c.email_financeiro, '') ILIKE $${pIndex}
        OR COALESCE(c.responsavel_nome, '') ILIKE $${pIndex}
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

function formatCpfCnpj(val) {
    if (!val) return val;
    const digits = String(val).replace(/\D/g, '').slice(0, 14);
    if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return String(val).trim();
}

/**
 * Expressão SQL que identifica fornecedores/bancos/utilidades com precisão:
 * 1. Bancos e Instituições Financeiras (Bradesco, Santander, Itaú, Banco do Brasil, etc.)
 * 2. Concessionárias de Utilidades e Telefonia (Claro, Energisa, Sanesul, Telefonica, etc.)
 * 3. Contas Internas / Acertos de Sócios
 * 4. Classificação / tipo_cliente / classe explicitamente marcada como 'FORNECEDOR'
 * NOTE: Não usa EXISTS contra dash_fornecedores por documento pois muitos clientes têm
 * documentos duplicados nas duas tabelas, causando falsos positivos e zerando a listagem.
 */
function getFornecedorCondition(alias = 'c') {
    return `(
        ${alias}.tipo_cliente ILIKE '%FORNECEDOR%' 
        OR ${alias}.classificacao ILIKE '%FORNECEDOR%'
        OR ${alias}.classe ILIKE '%FORNECEDOR%'
        OR ${alias}.nome ILIKE 'BANCO %'
        OR ${alias}.nome ILIKE '%BRADESCO%'
        OR ${alias}.nome ILIKE '%BANCO DO BRASIL%'
        OR ${alias}.nome ILIKE '%SANTANDER%'
        OR ${alias}.nome ILIKE '%BANCO ITAU%'
        OR ${alias}.nome ILIKE '%BANCO GM%'
        OR ${alias}.nome ILIKE '%BANCO SAFRA%'
        OR ${alias}.nome ILIKE '%CAIXA ECONOMICA%'
        OR ${alias}.nome ILIKE 'CLARO %'
        OR ${alias}.nome ILIKE '%ENERGISA%'
        OR ${alias}.nome ILIKE '%ENERSUL%'
        OR ${alias}.nome ILIKE '%SANESUL%'
        OR ${alias}.nome ILIKE '%TELEFONICA%'
        OR ${alias}.nome ILIKE '%ACERTO DOS SOCIOS%'
        OR ${alias}.nome ILIKE '%COLISEU CHAVE EMERGENCIAL%'
        OR COALESCE(${alias}.razao_social, '') ILIKE 'BANCO %'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%BRADESCO%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%BANCO DO BRASIL%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%SANTANDER%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%BANCO ITAU%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%BANCO GM%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%CLARO %'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%ENERGISA%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%SANESUL%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%TELEFONICA%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%ACERTO DOS SOCIOS%'
        OR COALESCE(${alias}.razao_social, '') ILIKE '%COLISEU CHAVE EMERGENCIAL%'
    )`;
}

// GET /api/clientes/lista?search=&limit=&offset=&tipo_entidade=
router.get('/lista', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const search = req.query.search || '';
        const tipoEntidade = (req.query.tipo_entidade || 'CLIENTE').toUpperCase();
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
        const offset = parseInt(req.query.offset, 10) || 0;

        const where = ["LOWER(c.tenant_id::text) = LOWER($1::text)", 'c.ativo = true'];
        const binds = [tenantId];
        let pIndex = 2;


        if (tipoEntidade === 'FORNECEDOR') {
            where.push(getFornecedorCondition('c'));
        } else if (tipoEntidade === 'CLIENTE') {
            where.push(`NOT ${getFornecedorCondition('c')}`);
        }

        if (search) {
            pIndex = applySuperBuscaFilter(search, pIndex, where, binds);
        }

        if (req.query.cidade) {
            where.push(`c.cidade ILIKE $${pIndex}`);
            binds.push(`%${req.query.cidade}%`);
            pIndex++;
        }

        const whereSql = `WHERE ${where.join(' AND ')}`;

        const totalRes = await db.query(
            `SELECT COUNT(*) AS total FROM dash_clientes c ${whereSql}`,
            binds
        ).catch((e) => {
            logger.warn('[Clientes/lista] Erro no count:', e.message);
            return { rows: [{ total: 0 }] };
        });
        const total = parseInt(totalRes.rows[0]?.total || 0, 10);

        const limitIdx = pIndex++;
        const offsetIdx = pIndex++;

        // Query simplificada sem subqueries correlacionadas - muito mais rápida
        const { rows } = await db.query(`
            SELECT 
                c.id, c.id_firebird, c.nome, c.nome_fantasia, c.documento, c.email, c.email_financeiro, c.telefone, c.cidade, c.estado,
                c.classificacao, c.responsavel_nome, c.celular_secundario, c.endereco_completo,
                COALESCE(c.razao_social, c.nome) AS razao_social,
                CASE
                    WHEN c.classe IS NOT NULL AND TRIM(c.classe) NOT IN ('', 'Geral', 'GERAL', 'Geral ') THEN UPPER(TRIM(c.classe))
                    WHEN c.nome ILIKE '%MERCADO%' OR c.nome ILIKE '%SUPERMERCADO%' OR c.nome ILIKE '%MERCEARIA%' THEN 'SUPERMERCADO'
                    WHEN c.nome ILIKE '%SERVICO%' OR c.nome ILIKE '%SERVICOS%' OR c.nome ILIKE '%CONSTRUTORA%' OR c.nome ILIKE '%TECNOLOGIA%' THEN 'SERVIÇO'
                    WHEN c.nome ILIKE '%ATACADO%' OR c.nome ILIKE '%DISTRIB%' OR c.nome ILIKE '%IMPORT%' OR c.nome ILIKE '%FABRICA%' THEN 'ATACADO'
                    ELSE 'VAREJO'
                END AS classe,
                COALESCE(c.tipo_cliente, 'B2C') AS tipo_cliente,
                '${tipoEntidade}' AS tipo_entidade,
                c.data_cadastro,
                0 AS qtd_pedidos,
                NULL AS ultimo_pedido,
                0 AS total_gasto
            FROM dash_clientes c
            ${whereSql}
            ORDER BY c.nome
            LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `, [...binds, limit, offset]);

        const formatted = rows.map(r => ({
            ...r,
            qtd_pedidos: parseInt(r.qtd_pedidos || 0, 10),
            total_gasto: parseFloat(r.total_gasto || 0)
        }));

        res.json({ data: formatted, total, limit, offset });
    } catch (err) {
        logger.error('[Clientes/lista] Erro inesperado:', err.message, '\nStack:', err.stack);
        res.json({ data: [], total: 0, limit: parseInt(req.query.limit, 10) || 100, offset: parseInt(req.query.offset, 10) || 0, _error: err.message });
    }
});

// GET /api/clientes/kpis

router.get('/kpis', async (req, res, next) => {
    try {
        const period = req.query.period || '30d';
        const tenantId = req.tenant.id;
        const { start_date, end_date } = req.query;
        const maxDate = new Date();
        const { start, end } = getPeriodRange(period, start_date, end_date, maxDate);

        const isFornecCond = getFornecedorCondition('dash_clientes');

        const totalP = await db.query(
            `SELECT COUNT(*) AS total FROM dash_clientes 
             WHERE (LOWER(tenant_id::text) = LOWER($1::text)) 
               AND ativo = true 
               AND NOT ${isFornecCond}`, 
            [tenantId]
        ).catch(() => ({ rows: [{ total: 0 }] }));

        let totalFornecedores = 0;
        try {
            const totalF = await db.query(
                `SELECT COUNT(*) AS total FROM dash_clientes 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text)) 
                   AND ativo = true 
                   AND ${isFornecCond}`,
                [tenantId]
            );
            totalFornecedores = parseInt(totalF.rows[0]?.total || 0, 10);
        } catch {
            totalFornecedores = 0;
        }

        const cidadesRes = await db.query(
            "SELECT DISTINCT cidade FROM dash_clientes WHERE (LOWER(tenant_id::text) = LOWER($1::text)) AND cidade IS NOT NULL AND cidade != '' ORDER BY cidade LIMIT 50",
            [tenantId]
        ).catch(() => ({ rows: [] }));
        const regioes = cidadesRes.rows.map(r => r.cidade);

        const ativosP = await db.query(`
            SELECT COUNT(DISTINCT cliente_id_firebird) AS total
            FROM dash_vendas
            WHERE (LOWER(tenant_id::text) = LOWER($1::text)) 
              AND data_venda >= $2 AND data_venda <= $3
              AND TRIM(status) IN ('FATURADO', 'FINALIZADO')
        `, [tenantId, start, end]);

        const topP = await db.query(`
            SELECT c.nome, SUM(v.valor_total) AS total
            FROM dash_vendas v
            JOIN dash_clientes c ON c.id_firebird = v.cliente_id_firebird AND (LOWER(c.tenant_id::text) = LOWER(v.tenant_id::text) OR c.tenant_id = v.tenant_id)
            WHERE (LOWER(v.tenant_id::text) = LOWER($1::text))
              AND v.data_venda >= $2 AND v.data_venda <= $3
              AND TRIM(v.status) IN ('FATURADO', 'FINALIZADO')
            GROUP BY c.id, c.nome
            ORDER BY total DESC LIMIT 1
        `, [tenantId, start, end]);

        const ticketP = await db.query(`
            SELECT COALESCE(AVG(totais.total), 0) AS ticket
            FROM (
                SELECT cliente_id_firebird, SUM(valor_total) AS total
                FROM dash_vendas
                WHERE (LOWER(tenant_id::text) = LOWER($1::text))
                  AND data_venda >= $2 AND data_venda <= $3
                  AND TRIM(status) IN ('FATURADO', 'FINALIZADO')
                GROUP BY cliente_id_firebird
            ) totais
        `, [tenantId, start, end]);

        const totalClientes = parseInt(totalP.rows[0]?.total || 0, 10);

        res.json({
            period: { start, end, label: period },
            regioes: regioes || [],
            kpis: {
                total_clientes: totalClientes,
                total_fornecedores: totalFornecedores,
                total_geral: totalClientes + totalFornecedores,
                clientes_ativos: parseInt(ativosP.rows[0]?.total || 0, 10),
                top_cliente: topP.rows[0]?.nome || '—',
                top_cliente_valor: parseFloat(topP.rows[0]?.total || 0),
                ticket_medio_por_cliente: parseFloat(ticketP.rows[0]?.ticket || 0)
            }
        });
    } catch (err) {
        logger.error('[Clientes/kpis] Erro inesperado:', err.message);
        res.json({
            period: { start: new Date().toISOString(), end: new Date().toISOString(), label: '30d' },
            regioes: [],
            kpis: {
                total_clientes: 0,
                total_fornecedores: 0,
                total_geral: 0,
                clientes_ativos: 0,
                top_cliente: '—',
                top_cliente_valor: 0,
                ticket_medio_por_cliente: 0
            }
        });
    }
});

// POST /api/clientes
router.post('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const {
            nome, razao_social, nome_fantasia, documento, email, telefone, cidade, estado, classificacao, tipo_cliente,
            responsavel_nome, responsavel_rg, responsavel_cpf, email_financeiro, celular_secundario,
            regime_tributario, endereco_completo, observacoes
        } = req.body;

        if (!nome) {
            return res.status(400).json({ error: 'O nome é obrigatório.' });
        }

        const formattedDoc = formatCpfCnpj(documento);

        const { rows } = await db.query(
            `INSERT INTO dash_clientes (
                tenant_id, id_firebird, nome, razao_social, nome_fantasia, documento, email, telefone, cidade, estado, classificacao, ativo,
                responsavel_nome, responsavel_rg, responsavel_cpf, email_financeiro, celular_secundario,
                regime_tributario, endereco_completo, tipo_cliente, observacoes
             )
             VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             RETURNING *`,
            [
                tenantId, 
                nome ? nome.toUpperCase() : '', 
                razao_social ? razao_social.toUpperCase() : (nome ? nome.toUpperCase() : ''),
                nome_fantasia ? nome_fantasia.toUpperCase() : null,
                formattedDoc, 
                email, 
                telefone, 
                cidade ? cidade.toUpperCase() : '—', 
                estado ? estado.toUpperCase() : '—', 
                classificacao ? classificacao.toUpperCase() : 'ATIVO',
                responsavel_nome ? responsavel_nome.toUpperCase() : null, 
                responsavel_rg, 
                responsavel_cpf, 
                email_financeiro, 
                celular_secundario, 
                regime_tributario ? regime_tributario.toUpperCase() : null, 
                endereco_completo ? endereco_completo.toUpperCase() : null, 
                tipo_cliente ? tipo_cliente.toUpperCase() : 'B2C', 
                observacoes ? observacoes.toUpperCase() : null
            ]
        );

        const novoCliente = rows[0];

        // Enfileira cliente para o Worker cadastrar no ERP Firebird
        await db.query(`
            INSERT INTO dash_sync_metadata (tenant_id, tabela, operacao, payload, status, created_at)
            VALUES ($1, 'CLIENTES', 'INSERT', $2::jsonb, 'PENDENTE', NOW())
        `, [tenantId, JSON.stringify({
            id_nexus:            novoCliente.id,
            nome:                novoCliente.nome,
            razao_social:        novoCliente.razao_social,
            nome_fantasia:       novoCliente.nome_fantasia,
            documento:           formattedDoc,
            cpf_cnpj:            formattedDoc,
            cliente_documento:   formattedDoc,
            documento_formatado: formattedDoc,
            documento_limpo:     String(documento || '').replace(/\D/g, ''),
            email:               novoCliente.email,
            email_financeiro:    novoCliente.email_financeiro,
            telefone:            novoCliente.telefone,
            celular_secundario:  novoCliente.celular_secundario,
            cidade:              novoCliente.cidade,
            estado:              novoCliente.estado,
            endereco_completo:   novoCliente.endereco_completo,
            origem:              'NEXUS',
            criado_em:           new Date().toISOString()
        })]).catch((e) => {
            console.warn('[Sync] Falha ao enfileirar cliente para ERP:', e.message);
        });

        res.status(201).json({ data: novoCliente });
    } catch (err) {
        next(err);
    }
});

// GET /api/clientes/:id/detalhes-360
router.get('/:id/detalhes-360', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);

        if (isNaN(clientId) || clientId <= 0) {
            return res.status(400).json({ error: 'ID de cliente inválido: ' + req.params.id });
        }

        let cli = null;
        // 1. Tenta buscar por ID ou ID Firebird com tenant_id
        const cliRes = await db.query(
            `SELECT c.* FROM dash_clientes c 
             WHERE (LOWER(c.tenant_id::text) = LOWER($1::text))
               AND (c.id = $2 OR c.id_firebird = $2) 
             LIMIT 1`,
            [tenantId, clientId]
        ).catch(() => ({ rows: [] }));

        if (cliRes.rows && cliRes.rows.length > 0) {
            cli = cliRes.rows[0];
        } else {
            // 2. Fallback: busca por id ou id_firebird sem filtrar tenant
            const fallbackRes = await db.query(
                `SELECT c.* FROM dash_clientes c 
                 WHERE (c.id = $1 OR c.id_firebird = $1) 
                 LIMIT 1`,
                [clientId]
            ).catch(() => ({ rows: [] }));
            if (fallbackRes.rows && fallbackRes.rows.length > 0) {
                cli = fallbackRes.rows[0];
            }
        }

        if (!cli) {
            return res.status(404).json({ error: `Cliente #${clientId} não foi encontrado no banco de dados.` });
        }

        const actualClientId = cli.id || clientId;
        const clientIdFirebird = (cli.id_firebird !== null && cli.id_firebird !== undefined && Number(cli.id_firebird) > 0) ? Number(cli.id_firebird) : (clientId || -999999);

        // 1. Contratos
        let contractsRows = [];
        try {
            const contracts = await db.query(
                `SELECT * FROM dash_contratos 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text))
                   AND (cliente_id = $2 OR (cliente_id_firebird IS NOT NULL AND cliente_id_firebird > 0 AND cliente_id_firebird = $3))`,
                [tenantId, actualClientId, clientIdFirebird]
            ).catch(() => ({ rows: [] }));
            contractsRows = contracts.rows || [];
        } catch (e) {
            logger.warn('[detalhes-360] Erro ao buscar contratos:', e.message);
        }

        // 2. Financeiro (Contas a Receber e a Pagar vinculados ao cliente/fornecedor)
        let financeiroRows = [];
        try {
            const financeiro = await db.query(
                `SELECT 
                    f.id,
                    f.id_firebird,
                    f.tenant_id,
                    f.tipo,
                    f.tipo_documento,
                    f.descricao,
                    f.cliente_id_firebird,
                    f.fornecedor_id_firebird,
                    f.data_emissao,
                    f.data_vencimento,
                    f.data_pagamento,
                    f.valor,
                    COALESCE(f.valor_pago, 0) AS valor_pago,
                    COALESCE(f.status_pagamento, 'ABERTO') AS status_pagamento,
                    f.caixa_id_firebird,
                    f.nosso_numero,
                    f.numero_documento,
                    f.asaas_payment_id,
                    f.asaas_bank_slip_url,
                    f.asaas_linha_digitavel,
                    f.asaas_bar_code,
                    f.bank_slip_url,
                    f.pdf_url,
                    f.portador_nome,
                    f.especie_nome,
                    f.categoria_pagamento,
                    f.billing_type,
                    f.data_vinculo,
                    f.usuario_vinculo
                 FROM dash_financeiro f 
                 WHERE (LOWER(f.tenant_id::text) = LOWER($1::text))
                   AND (
                       (f.cliente_id IS NOT NULL AND f.cliente_id = $2)
                       OR (f.cliente_id IS NULL AND (
                           (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND f.cliente_id_firebird = $3)
                           OR (f.fornecedor_id_firebird IS NOT NULL AND f.fornecedor_id_firebird > 0 AND f.fornecedor_id_firebird = $3)
                       ))
                   )
                   AND (f.status_pagamento IS NULL OR (UPPER(f.status_pagamento) NOT LIKE '%CANCEL%' AND UPPER(f.status_pagamento) NOT LIKE '%ESTORN%'))
                   AND f.data_cancelamento IS NULL
                 ORDER BY f.data_vencimento ASC`,
                [tenantId, actualClientId, clientIdFirebird]
            ).catch(async (err1) => {
                logger.warn('[detalhes-360] Fallback financeiro sem tenant_id:', err1.message);
                return await db.query(
                    `SELECT 
                        f.id,
                        f.id_firebird,
                        f.tenant_id,
                        f.tipo,
                        f.tipo_documento,
                        f.descricao,
                        f.cliente_id_firebird,
                        f.fornecedor_id_firebird,
                        f.data_emissao,
                        f.data_vencimento,
                        f.data_pagamento,
                        f.valor,
                        COALESCE(f.valor_pago, 0) AS valor_pago,
                        COALESCE(f.status_pagamento, 'ABERTO') AS status_pagamento,
                        f.caixa_id_firebird,
                        f.nosso_numero,
                        f.numero_documento,
                        f.asaas_payment_id,
                        f.asaas_bank_slip_url,
                        f.asaas_linha_digitavel,
                        f.asaas_bar_code,
                        f.bank_slip_url,
                        f.pdf_url,
                        f.portador_nome,
                        f.especie_nome,
                        f.categoria_pagamento,
                        f.billing_type,
                        f.data_vinculo,
                        f.usuario_vinculo
                     FROM dash_financeiro f 
                     WHERE (
                         (f.cliente_id IS NOT NULL AND f.cliente_id = $1)
                         OR (f.cliente_id IS NULL AND (
                             (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND f.cliente_id_firebird = $2)
                             OR (f.fornecedor_id_firebird IS NOT NULL AND f.fornecedor_id_firebird > 0 AND f.fornecedor_id_firebird = $2)
                         ))
                     )
                     AND (f.status_pagamento IS NULL OR (UPPER(f.status_pagamento) NOT LIKE '%CANCEL%' AND UPPER(f.status_pagamento) NOT LIKE '%ESTORN%'))
                     AND f.data_cancelamento IS NULL
                     ORDER BY f.data_vencimento ASC`,
                    [actualClientId, clientIdFirebird]
                ).catch(() => ({ rows: [] }));
            });
            financeiroRows = (financeiro.rows || []).map(r => ({
                ...r,
                portador: r.portador || r.portador_nome || (r.asaas_payment_id ? 'Asaas' : 'CARTEIRA'),
                especie: r.especie || r.especie_nome || 'BOLETO'
            }));
        } catch (e) {
            logger.warn('[detalhes-360] Erro ao buscar financeiro:', e.message);
        }

        // 3. Timeline / Logs de Cobrança
        let logsRows = [];
        try {
            const logs = await db.query(
                `SELECT l.*, COALESCE(f.descricao, '') AS titulo_descricao
                 FROM dash_cobrancas_logs l
                 LEFT JOIN dash_financeiro f ON f.id = l.financeiro_id
                 WHERE (LOWER(l.tenant_id::text) = LOWER($1::text))
                   AND (
                     (f.cliente_id IS NOT NULL AND f.cliente_id = $2)
                     OR (f.cliente_id IS NULL AND (
                       (f.cliente_id_firebird IS NOT NULL AND f.cliente_id_firebird > 0 AND f.cliente_id_firebird = $3)
                       OR (f.fornecedor_id_firebird IS NOT NULL AND f.fornecedor_id_firebird > 0 AND f.fornecedor_id_firebird = $3)
                     ))
                   )
                 ORDER BY l.data_envio DESC`,
                [tenantId, actualClientId, clientIdFirebird]
            ).catch(() => ({ rows: [] }));
            logsRows = logs.rows || [];
        } catch (e) {
            logger.warn('[detalhes-360] Erro ao buscar logs de cobrança:', e.message);
        }

        // 4. Calcular métricas 360 (LTV & Ticket Médio)
        let ltv = 0;
        let ticketMedio = 0;
        try {
            const salesSum = await db.query(
                `SELECT COALESCE(SUM(valor_total), 0) AS total, COALESCE(AVG(valor_total), 0) AS avg 
                 FROM dash_vendas 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text))
                   AND (cliente_id_firebird IS NOT NULL AND cliente_id_firebird > 0 AND cliente_id_firebird = $2)
                   AND TRIM(status) IN ('FATURADO', 'FINALIZADO')`,
                [tenantId, clientIdFirebird]
            ).catch(() => ({ rows: [] }));
            ltv = parseFloat(salesSum.rows[0]?.total || 0);
            ticketMedio = parseFloat(salesSum.rows[0]?.avg || 0);
        } catch (e) {
            logger.warn('[detalhes-360] Erro ao calcular vendas/LTV:', e.message);
        }

        // Débitos pendentes (apenas títulos do tipo RECEBER, não cancelados, não pagos, com vencimento anterior à data de hoje)
        let pendingDebts = 0;
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            pendingDebts = financeiroRows
                .filter(f => {
                    const status = (f.status_pagamento || '').trim().toUpperCase();
                    const isCanceled = status.includes('CANCEL') || status.includes('ESTORN') || Boolean(f.data_cancelamento);
                    const isPaid = status === 'PAGO' || (parseFloat(f.valor_pago) || 0) >= parseFloat(f.valor);
                    const isReceber = !f.tipo || String(f.tipo).toUpperCase() === 'RECEBER';
                    const vencStr = f.data_vencimento ? f.data_vencimento.split(/[T ]/)[0] : '';
                    return isReceber && !isCanceled && !isPaid && vencStr && vencStr < todayStr;
                })
                .reduce((sum, f) => sum + (parseFloat(f.valor || 0) - (parseFloat(f.valor_pago || 0))), 0);
        } catch (_) {}

        // 5. Estatísticas de Software e Módulos
        let estatisticasSoftware = null;
        let defaultCertDate = '2026-12-31';
        try {
            if (cli.data_cadastro) {
                const cadDate = new Date(cli.data_cadastro);
                if (!isNaN(cadDate.getTime())) {
                    const m = cadDate.getMonth();
                    const d = Math.max(1, Math.min(28, cadDate.getDate()));
                    const now = new Date();
                    const certYear = now.getFullYear() + (now.getMonth() > m || (now.getMonth() === m && now.getDate() > d) ? 1 : 0);
                    const targetCert = new Date(certYear, m, d);
                    if (!isNaN(targetCert.getTime())) {
                        defaultCertDate = targetCert.toISOString().split('T')[0];
                    }
                }
            }
        } catch (_) {
            defaultCertDate = '2026-12-31';
        }

        try {
            const softRes = await db.query(
                `SELECT * FROM dash_estatisticas_software 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text))
                   AND (cliente_id_firebird = $2 OR (cliente_id IS NOT NULL AND cliente_id = $3))
                 LIMIT 1`,
                [tenantId, clientIdFirebird, actualClientId]
            ).catch(() => ({ rows: [] }));
            
            estatisticasSoftware = softRes.rows[0];

            if (!estatisticasSoftware) {
                estatisticasSoftware = getDefaultSoftwareModulesForClient(cli, defaultCertDate);
            } else {
                if (!estatisticasSoftware.certificado_vencimento) {
                    estatisticasSoftware.certificado_vencimento = defaultCertDate;
                }
                if (!estatisticasSoftware.softwares || estatisticasSoftware.softwares.length === 0) {
                    estatisticasSoftware.softwares = ["COLISEU GESTAO", "APP"];
                }
            }
        } catch (e) {
            estatisticasSoftware = getDefaultSoftwareModulesForClient(cli, defaultCertDate);
        }

        // Anexos de Contratos
        let attachedContracts = [];
        try {
            await ensureContratosAnexosTable();
            const attachedRes = await db.query(
                `SELECT id, tenant_id, cliente_id, cliente_id_firebird, titulo, plataforma_origem, nome_arquivo, tipo_arquivo, tamanho_bytes, observacoes, criado_por, created_at
                 FROM dash_cliente_contratos_anexos 
                 WHERE (LOWER(tenant_id::text) = LOWER($1::text))
                   AND (cliente_id = $2 OR (cliente_id_firebird IS NOT NULL AND cliente_id_firebird = $3))
                 ORDER BY created_at DESC`,
                [tenantId, actualClientId, clientIdFirebird]
            ).catch(() => ({ rows: [] }));
            attachedContracts = attachedRes.rows || [];
        } catch (e) {}

        // 6. Produtos e Serviços Licenciados
        let produtos = [
            { nome: 'Coliseu Gestão ERP Empresarial', plataforma: 'Desktop / Servidor Local', tipo: 'Licenciamento / ERP', valor: 0.00 },
            { nome: 'Módulo Emissor Fiscal (NFe / NFCe / MDFe / CTe)', plataforma: 'Desktop / Cloud', tipo: 'Módulo Integrado ERP', valor: 0.00 },
            { nome: 'Coliseu Transporte Web & Mobile (App BI / Indicadores)', plataforma: 'Web Cloud / Mobile', tipo: 'Serviço Conectado', valor: 0.00 }
        ];

        let tempoRelacionamento = 1;
        try {
            if (cli.data_cadastro) {
                const dCad = new Date(cli.data_cadastro);
                if (!isNaN(dCad.getTime())) {
                    const diffMonths = Math.ceil(Math.abs(Date.now() - dCad.getTime()) / (1000 * 60 * 60 * 24 * 30));
                    tempoRelacionamento = isNaN(diffMonths) || diffMonths <= 0 ? 1 : diffMonths;
                }
            }
        } catch (_) {
            tempoRelacionamento = 1;
        }

        res.json({
            cliente: cli,
            contratos: contractsRows,
            contratos_anexos: attachedContracts,
            produtos: produtos,
            financeiro: financeiroRows,
            historico: logsRows,
            estatisticas_software: estatisticasSoftware,
            metrics: {
                ltv,
                ticket_medio: ticketMedio,
                tempo_relacionamento: tempoRelacionamento,
                contratos_ativos: contractsRows.filter(c => c.status === 'Finalizado' || c.status === 'Em Aberto').length,
                debitos_pendentes: pendingDebts
            }
        });
    } catch (err) {
        logger.error('[detalhes-360] Erro ao carregar ficha do cliente:', err.message, err.stack);
        res.status(500).json({ error: 'Erro interno ao processar a ficha 360 do cliente: ' + err.message });
    }
});

// GET /api/clientes/:id/contratos-anexos
router.get('/:id/contratos-anexos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        await ensureContratosAnexosTable();

        const cliRes = await db.query('SELECT id, id_firebird FROM dash_clientes WHERE tenant_id = $1 AND id = $2', [tenantId, clientId]);
        const bindId = cliRes.rows[0]?.id_firebird || -99999;

        const { rows } = await db.query(
            `SELECT id, tenant_id, cliente_id, cliente_id_firebird, titulo, plataforma_origem, nome_arquivo, tipo_arquivo, tamanho_bytes, observacoes, criado_por, created_at
             FROM dash_cliente_contratos_anexos
             WHERE tenant_id = $1 AND (cliente_id = $2 OR (cliente_id_firebird IS NOT NULL AND cliente_id_firebird = $3))
             ORDER BY created_at DESC`,
            [tenantId, clientId, bindId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/clientes/:id/contratos-anexos/:anexoId/download
router.get('/:id/contratos-anexos/:anexoId/download', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const anexoId = parseInt(req.params.anexoId, 10);
        const { rows } = await db.query(
            `SELECT * FROM dash_cliente_contratos_anexos WHERE tenant_id = $1 AND id = $2`,
            [tenantId, anexoId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Anexo de contrato não encontrado.' });
        }
        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// POST /api/clientes/:id/contratos-anexos
router.post('/:id/contratos-anexos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        const usuario = req.user?.nome || req.user?.email || 'Operador';
        const { titulo, plataforma_origem, nome_arquivo, tipo_arquivo, tamanho_bytes, arquivo_data, observacoes } = req.body;

        if (!titulo || !arquivo_data || !nome_arquivo) {
            return res.status(400).json({ error: 'Título, arquivo e nome do documento são obrigatórios.' });
        }

        await ensureContratosAnexosTable();

        const cliRes = await db.query('SELECT id, id_firebird FROM dash_clientes WHERE tenant_id = $1 AND id = $2', [tenantId, clientId]);
        const idFirebird = cliRes.rows[0]?.id_firebird || null;

        const { rows } = await db.query(
            `INSERT INTO dash_cliente_contratos_anexos 
             (tenant_id, cliente_id, cliente_id_firebird, titulo, plataforma_origem, nome_arquivo, tipo_arquivo, tamanho_bytes, arquivo_data, observacoes, criado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, tenant_id, cliente_id, cliente_id_firebird, titulo, plataforma_origem, nome_arquivo, tipo_arquivo, tamanho_bytes, observacoes, criado_por, created_at`,
            [
                tenantId,
                clientId,
                idFirebird,
                titulo.trim(),
                plataforma_origem || 'Externa / Outra Plataforma',
                nome_arquivo,
                tipo_arquivo || 'application/pdf',
                tamanho_bytes || 0,
                arquivo_data,
                observacoes || null,
                usuario
            ]
        );

        res.status(201).json({
            success: true,
            data: rows[0],
            message: 'Contrato externo anexado com sucesso!'
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/clientes/:id/contratos-anexos/:anexoId
router.delete('/:id/contratos-anexos/:anexoId', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const anexoId = parseInt(req.params.anexoId, 10);

        const { rowCount } = await db.query(
            `DELETE FROM dash_cliente_contratos_anexos WHERE tenant_id = $1 AND id = $2`,
            [tenantId, anexoId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Contrato anexo não encontrado.' });
        }

        res.json({ success: true, message: 'Contrato anexo removido com sucesso!' });
    } catch (err) {
        next(err);
    }
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        const {
            nome, razao_social, nome_fantasia, documento, email, telefone, cidade, estado, classificacao, tipo_cliente,
            responsavel_nome, responsavel_rg, responsavel_cpf, email_financeiro, celular_secundario,
            regime_tributario, endereco_completo, observacoes
        } = req.body;

        if (!nome) {
            return res.status(400).json({ error: 'O nome é obrigatório.' });
        }

        const formattedDoc = formatCpfCnpj(documento);

        const { rows, rowCount } = await db.query(
            `UPDATE dash_clientes 
             SET nome = $1, razao_social = $2, nome_fantasia = $3, documento = $4, email = $5, telefone = $6, cidade = $7, estado = $8, 
                 classificacao = $9, responsavel_nome = $10, responsavel_rg = $11, responsavel_cpf = $12, 
                 email_financeiro = $13, celular_secundario = $14, regime_tributario = $15, 
                 endereco_completo = $16, tipo_cliente = $17, observacoes = $18, data_cadastro = COALESCE(data_cadastro, NOW())
             WHERE tenant_id = $19 AND id = $20
             RETURNING *`,
            [
                nome ? nome.toUpperCase() : '', 
                razao_social ? razao_social.toUpperCase() : (nome ? nome.toUpperCase() : ''),
                nome_fantasia ? nome_fantasia.toUpperCase() : null,
                formattedDoc, 
                email, 
                telefone, 
                cidade ? cidade.toUpperCase() : '—', 
                estado ? estado.toUpperCase() : '—', 
                classificacao ? classificacao.toUpperCase() : 'ATIVO',
                responsavel_nome ? responsavel_nome.toUpperCase() : null, 
                responsavel_rg, 
                responsavel_cpf, 
                email_financeiro, 
                celular_secundario, 
                regime_tributario ? regime_tributario.toUpperCase() : null, 
                endereco_completo ? endereco_completo.toUpperCase() : null, 
                tipo_cliente ? tipo_cliente.toUpperCase() : 'B2C', 
                observacoes ? observacoes.toUpperCase() : null,
                tenantId, 
                clientId
            ]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const clienteAtualizado = rows[0];

        // Enfileira alteração do cliente para o Worker atualizar no ERP Firebird
        await db.query(`
            INSERT INTO dash_sync_metadata (tenant_id, tabela, operacao, payload, status, created_at)
            VALUES ($1, 'CLIENTES', 'UPDATE', $2::jsonb, 'PENDENTE', NOW())
        `, [tenantId, JSON.stringify({
            id_nexus:            clienteAtualizado.id,
            id_firebird:         clienteAtualizado.id_firebird || null,
            nome:                clienteAtualizado.nome,
            razao_social:        clienteAtualizado.razao_social,
            nome_fantasia:       clienteAtualizado.nome_fantasia,
            documento:           formattedDoc,
            cpf_cnpj:            formattedDoc,
            cliente_documento:   formattedDoc,
            documento_formatado: formattedDoc,
            documento_limpo:     String(documento || '').replace(/\D/g, ''),
            email:               clienteAtualizado.email,
            email_financeiro:    clienteAtualizado.email_financeiro,
            telefone:            clienteAtualizado.telefone,
            celular_secundario:  clienteAtualizado.celular_secundario,
            cidade:              clienteAtualizado.cidade,
            estado:              clienteAtualizado.estado,
            endereco_completo:   clienteAtualizado.endereco_completo,
            origem:              'NEXUS',
            alterado_em:         new Date().toISOString()
        })]).catch((e) => {
            console.warn('[Sync] Falha ao enfileirar atualização de cliente para ERP:', e.message);
        });

        res.json({ data: clienteAtualizado });
    } catch (err) {
        next(err);
    }
});

// PUT /api/clientes/:id/modulos - Salva e personaliza os módulos e softwares do cliente
router.put('/:id/modulos', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const clientId = parseInt(req.params.id, 10);
        const {
            usa_nfe, usa_nfce, usa_nfse, usa_mdfe, usa_cte, usa_sped,
            usa_boleto, usa_folha, usa_whats, usa_pix, usa_cobranca,
            usa_pontuacao, usa_os, usa_sales, usa_dash, usa_coletor,
            softwares, versao_atualizacao, versao_software, certificado_vencimento
        } = req.body;

        const cliRes = await db.query(
            `SELECT id, id_firebird FROM dash_clientes WHERE tenant_id = $1 AND id = $2`,
            [tenantId, clientId]
        );
        if (cliRes.rowCount === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        const cli = cliRes.rows[0];
        const fbId = cli.id_firebird || null;

        // Upsert na tabela dash_estatisticas_software
        const { rows } = await db.query(
            `INSERT INTO dash_estatisticas_software (
                tenant_id, cliente_id, cliente_id_firebird,
                usa_nfe, usa_nfce, usa_nfse, usa_mdfe, usa_cte, usa_sped,
                usa_boleto, usa_folha, usa_whats, usa_pix, usa_cobranca,
                usa_pontuacao, usa_os, usa_sales, usa_dash, usa_coletor,
                softwares, versao_atualizacao, versao_software, certificado_vencimento, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20::jsonb, $21, $22, $23, NOW()
            )
            ON CONFLICT (tenant_id, cliente_id_firebird) DO UPDATE SET
                usa_nfe = EXCLUDED.usa_nfe,
                usa_nfce = EXCLUDED.usa_nfce,
                usa_nfse = EXCLUDED.usa_nfse,
                usa_mdfe = EXCLUDED.usa_mdfe,
                usa_cte = EXCLUDED.usa_cte,
                usa_sped = EXCLUDED.usa_sped,
                usa_boleto = EXCLUDED.usa_boleto,
                usa_folha = EXCLUDED.usa_folha,
                usa_whats = EXCLUDED.usa_whats,
                usa_pix = EXCLUDED.usa_pix,
                usa_cobranca = EXCLUDED.usa_cobranca,
                usa_pontuacao = EXCLUDED.usa_pontuacao,
                usa_os = EXCLUDED.usa_os,
                usa_sales = EXCLUDED.usa_sales,
                usa_dash = EXCLUDED.usa_dash,
                usa_coletor = EXCLUDED.usa_coletor,
                softwares = EXCLUDED.softwares,
                versao_atualizacao = EXCLUDED.versao_atualizacao,
                versao_software = EXCLUDED.versao_software,
                certificado_vencimento = EXCLUDED.certificado_vencimento,
                updated_at = NOW()
            RETURNING *`,
            [
                tenantId, clientId, fbId,
                usa_nfe || 'NÃO', usa_nfce || 'NÃO', usa_nfse || 'NÃO', usa_mdfe || 'NÃO', usa_cte || 'NÃO', usa_sped || 'NÃO',
                usa_boleto || 'NÃO', usa_folha || 'NÃO', usa_whats || 'NÃO', usa_pix || 'NÃO', usa_cobranca || 'NÃO',
                usa_pontuacao || 'NÃO', usa_os || 'NÃO', usa_sales || 'NÃO', usa_dash || 'NÃO', usa_coletor || 'NÃO',
                JSON.stringify(Array.isArray(softwares) ? softwares : []),
                versao_atualizacao || '2026.07.15',
                versao_software || 'COLISEU GESTÃO v2.5',
                certificado_vencimento || null
            ]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// Helper que calcula os módulos e softwares padrão de acordo com o segmento da empresa
function getDefaultSoftwareModulesForClient(cli, defaultCertDate) {
    const text = ((cli.nome || '') + ' ' + (cli.razao_social || '') + ' ' + (cli.nome_fantasia || '') + ' ' + (cli.classificacao || '')).toUpperCase();
    
    const isTransporte = /TRANSPORT|LOGIST|FRETE|CARGA|EXPRESSO|RODOVIAR/i.test(text);
    const isServico = /CONSULTORIA|TECNOLOGIA|SERVIC|AGRICO|ENGENHARIA|ASSESSORIA|CLINICA|HOSPITAL|ADVOCACIA|ESTUDIO|PROJETOS|LOCACAO|TREINAMENTO|CURSO/i.test(text);
    const isOficina = /OFICINA|MECANICA|AUTO CENTER|ELETRONICA|MANUTENCAO|REFRIGERACAO|INSTALACO|MOTO|DIESEL|FUNILARIA/i.test(text);
    const isVarejo = /COMERCIO|MERCADO|SUPERMERCADO|LOJA|MODA|BOUTIQUE|RESTAURANTE|BAR|PADARIA|CONVENIENCIA|DROGARIA|FARMACIA|CALCADOS|VESTUARIO|PAPELARIA|PERFUM/i.test(text);
    const isDistribuidora = /DISTRIBUIDORA|ATACADO|REPRESENTA|IMPORT|EXPORT/i.test(text);

    // Módulos base essenciais
    const usaNfe = 'SIM';
    const usaBoleto = 'SIM';
    const usaPix = 'SIM';
    const usaCobranca = 'SIM';
    const usaWhats = 'SIM';

    // Módulos específicos por perfil da empresa
    const usaNfce = isVarejo || isDistribuidora ? 'SIM' : 'NÃO';
    const usaNfse = isServico || isOficina ? 'SIM' : 'NÃO';
    const usaCte = isTransporte ? 'SIM' : 'NÃO';
    const usaMdfe = isTransporte || isDistribuidora ? 'SIM' : 'NÃO';
    const usaOs = isOficina || isServico ? 'SIM' : 'NÃO';
    const usaSped = isTransporte || isDistribuidora || isVarejo ? 'SIM' : 'NÃO';
    const usaSales = isDistribuidora || isVarejo ? 'SIM' : 'NÃO';
    const usaDash = isDistribuidora || isTransporte || isServico ? 'SIM' : 'NÃO';
    const usaFolha = 'NÃO';
    const usaColetor = isDistribuidora || isVarejo ? 'SIM' : 'NÃO';
    const usaPontuacao = isVarejo ? 'SIM' : 'NÃO';

    // Softwares licenciados específicos
    const softwares = ["COLISEU GESTAO"];
    if (isVarejo || isDistribuidora || isTransporte) softwares.push("COLISEU FISCAL");
    if (isServico || isDistribuidora || isTransporte) softwares.push("COLISEU WEB");
    softwares.push("APP");

    return {
        versao_software: 'COLISEU GESTÃO v2.5',
        versao_atualizacao: '2026.07.15',
        servidor: 'LOCAL / SERVIDOR-PRINCIPAL',
        certificado_vencimento: defaultCertDate,
        usa_nfe: usaNfe,
        usa_nfce: usaNfce,
        usa_nfse: usaNfse,
        usa_sped: usaSped,
        usa_boleto: usaBoleto,
        usa_folha: usaFolha,
        usa_whats: usaWhats,
        usa_pix: usaPix,
        usa_cobranca: usaCobranca,
        usa_pontuacao: usaPontuacao,
        usa_os: usaOs,
        usa_cte: usaCte,
        usa_mdfe: usaMdfe,
        usa_sales: usaSales,
        usa_dash: usaDash,
        usa_coletor: usaColetor,
        softwares: Array.from(new Set(softwares))
    };
}

// Helper para garantir a existencia da tabela de anexos
async function ensureContratosAnexosTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_cliente_contratos_anexos (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                cliente_id INT,
                cliente_id_firebird INT,
                titulo VARCHAR(255) NOT NULL,
                plataforma_origem VARCHAR(100) DEFAULT 'Externa',
                nome_arquivo VARCHAR(255) NOT NULL,
                tipo_arquivo VARCHAR(100) DEFAULT 'application/pdf',
                tamanho_bytes BIGINT DEFAULT 0,
                arquivo_data TEXT NOT NULL,
                observacoes TEXT,
                criado_por VARCHAR(150),
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_cliente_contratos_anexos_cli ON dash_cliente_contratos_anexos(tenant_id, cliente_id, cliente_id_firebird);
        `);
    } catch (e) {
        logger.warn('[Clientes] Falha ao verificar/criar tabela de anexos de contrato:', e.message);
    }
}

module.exports = router;

