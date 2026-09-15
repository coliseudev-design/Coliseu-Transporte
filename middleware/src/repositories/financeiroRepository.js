'use strict';

const db = require('../db/postgres');

/**
 * Repositório de Acesso a Dados do Módulo Financeiro
 */
class FinanceiroRepository {
    /**
     * Busca lançamentos financeiros salvos no Postgres por tenant e período
     */
    async getLancamentosByPeriod(tenantId, { startDate, endDate, status, portador, tipoData }) {
        let dateColumn = 'data_vencimento';
        if (tipoData === 'quitacao') dateColumn = 'data_pagamento';
        if (tipoData === 'emissao') dateColumn = 'data_emissao';

        const params = [tenantId];
        let sql = `
            SELECT f.*, c.nome AS cliente_nome, c.documento AS cliente_documento
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c ON c.tenant_id = f.tenant_id AND c.id_firebird = f.cliente_id_firebird
            WHERE f.tenant_id = $1
        `;

        if (startDate && endDate) {
            params.push(startDate, endDate);
            sql += ` AND f.${dateColumn} >= $${params.length - 1} AND f.${dateColumn} <= $${params.length}`;
        }

        if (status && status !== 'TODOS') {
            params.push(status);
            sql += ` AND f.status_pagamento = $${params.length}`;
        }

        if (portador && portador !== 'todos') {
            params.push(`%${portador}%`);
            sql += ` AND f.portador ILIKE $${params.length}`;
        }

        sql += ` ORDER BY f.${dateColumn} DESC LIMIT 500`;

        const result = await db.query(sql, params);
        return result.rows;
    }

    /**
     * Upsert de pagamento do Asaas / Pix Direto na tabela local
     */
    async upsertAsaasPayment(tenantId, paymentData) {
        const sql = `
            INSERT INTO dash_financeiro (
                tenant_id, asaas_payment_id, nosso_numero, cliente_boleto,
                cliente_documento, valor, valor_pago, status_pagamento,
                data_emissao, data_vencimento, data_pagamento, portador,
                billing_type, categoria_pagamento, especie
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            ON CONFLICT (tenant_id, asaas_payment_id) DO UPDATE SET
                valor_pago = EXCLUDED.valor_pago,
                status_pagamento = EXCLUDED.status_pagamento,
                data_pagamento = EXCLUDED.data_pagamento,
                categoria_pagamento = EXCLUDED.categoria_pagamento
            RETURNING *;
        `;

        const params = [
            tenantId,
            paymentData.asaas_payment_id,
            paymentData.nosso_numero,
            paymentData.cliente_boleto,
            paymentData.cliente_documento,
            paymentData.valor,
            paymentData.valor_pago || 0,
            paymentData.status_pagamento,
            paymentData.data_emissao,
            paymentData.data_vencimento,
            paymentData.data_pagamento,
            paymentData.portador || 'ASAAS',
            paymentData.billing_type,
            paymentData.categoria_pagamento,
            paymentData.especie
        ];

        const res = await db.query(sql, params);
        return res.rows[0];
    }
}

module.exports = new FinanceiroRepository();
