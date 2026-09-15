'use strict';

const repository = require('../repositories/financeiroRepository');
const logger = require('../config/logger');

class FinanceiroService {
    /**
     * Retorna a lista de boletos e Pix emitidos com ordenação e cache inteligente
     */
    async getBoletosEmitidos(tenantId, filters) {
        try {
            const rawLancamentos = await repository.getLancamentosByPeriod(tenantId, filters);
            return rawLancamentos.map(item => {
                const cat = (item.categoria_pagamento || '').toUpperCase();
                const esp = (item.especie || '').toUpperCase();
                const isPixDirect = cat === 'PIX_DIRETO' || esp === 'PIX_DIRETO' || (item.billing_type === 'PIX' && !item.nosso_numero);
                
                return {
                    ...item,
                    is_pix_direto: isPixDirect,
                    is_boleto_pix: !isPixDirect && (cat === 'BOLETO_PAGO_PIX' || esp.includes('PIX'))
                };
            });
        } catch (err) {
            logger.error('[FinanceiroService] Erro ao buscar boletos emitidos', { tenantId, error: err.message });
            throw err;
        }
    }
}

module.exports = new FinanceiroService();
