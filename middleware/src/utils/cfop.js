'use strict';

const db = require('../db/postgres');

// CFOPs válidos de venda (com nota fiscal emitida)
const SALES_CFOPS = [
    5101, 5102, 5103, 5104, 5105, 5106, 5109, 5110, 5111, 5112, 5113, 5114, 5115, 5116, 5118, 5119, 5120, 5122, 5123,
    5251, 5252, 5253, 5254, 5255, 5256, 5257, 5258,
    5401, 5402, 5403, 5405,
    6101, 6102, 6103, 6104, 6105, 6106, 6107, 6108, 6109, 6110, 6111, 6112, 6113, 6114, 6115, 6116, 6118, 6119, 6120, 6122, 6123,
    6251, 6252, 6253, 6254, 6255, 6256, 6257, 6258,
    6401, 6402, 6403, 6404
];

// CFOPs de devolução para desconto no faturamento líquido
const RETURN_CFOPS = [1201, 1202, 2201, 2202, 1411];

// Status excluídos do faturamento
const SALES_STATUS_EXCLUDE = [
    'CANCELADO', 'ABERTO', 'PENDENTE', 'ORÇAMENTO', 'ORCAMENTO', 'NULO', 'TESTE'
];

function isVetContext() {
    return false;
}

/**
 * STRICT_SALES_FILTER (CFOP): sem filtro de CFOP para Sistema Coliseu.
 */
function getCfopFilterClause(tableAlias = 'v') {
    return '';
}

/**
 * STATUS_FILTER para Sistema Coliseu (Layouts 1, 2 e 3):
 * Allowlist: inclui apenas FATURADO e FINALIZADO (status de venda concluída no ERP Coliseu).
 * Usa UPPER(TRIM()) para tolerância a espaços e variações de case.
 */
function getStatusFilterClause(tableAlias = 'v') {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `AND UPPER(TRIM(${prefix}status)) IN ('FATURADO', 'FINALIZADO', 'PROCESSADO')`;
}

/**
 * STRICT_SALES_FILTER completo.
 * Use este em todas as queries de faturamento e ranking.
 */
function getSalesFilterClause(tableAlias = 'v') {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `${getCfopFilterClause(tableAlias)} ${getStatusFilterClause(tableAlias)} AND UPPER(TRIM(COALESCE(${prefix}especie, ''))) NOT IN ('DEVOLUCAO DE CLIENTE', 'DEVOLUCAO', 'DEVOLUÇÃO') AND ${prefix}valor_total >= 0`;
}

module.exports = {
    SALES_CFOPS,
    RETURN_CFOPS,
    SALES_STATUS_EXCLUDE,
    isVetContext,
    getCfopFilterClause,
    getStatusFilterClause,
    getSalesFilterClause
};
