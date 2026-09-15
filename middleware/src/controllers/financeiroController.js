'use strict';

const service = require('../services/financeiroService');

class FinanceiroController {
    /**
     * Handler para listar boletos emitidos
     */
    async listarBoletosEmitidos(req, res) {
        try {
            const tenantId = req.tenantId || req.user?.tenant_id;
            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID não informado ou token inválido.' });
            }

            const { startDate, endDate, status, portador, tipo_data } = req.query;

            const boletos = await service.getBoletosEmitidos(tenantId, {
                startDate,
                endDate,
                status,
                portador,
                tipoData: tipo_data || 'vencimento'
            });

            return res.json({
                success: true,
                count: boletos.length,
                data: boletos
            });
        } catch (err) {
            return res.status(500).json({
                error: 'Erro interno ao processar listagem financeira.',
                details: err.message
            });
        }
    }
}

module.exports = new FinanceiroController();
