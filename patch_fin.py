import re

with open('middleware/src/routes/financeiro.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add getCaixas endpoint
caixas_endpoint = """
// GET /api/financeiro/caixas
router.get('/caixas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(`
            SELECT id_firebird AS id, descricao AS nome
            FROM dash_caixas
            WHERE tenant_id = $1
            ORDER BY descricao ASC
        `, [tenantId]);
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

"""
if '/api/financeiro/caixas' not in content:
    content = content.replace("module.exports = router;", caixas_endpoint + "module.exports = router;")

# Add caixaId parameter extraction to all endpoints that need it
def add_caixa_id(endpoint):
    global content
    content = re.sub(
        rf"(router\.get\('/{endpoint}', async \(req, res, next\) => {{\n\s+try {{\n\s+const tenantId = req\.tenant\.id;)",
        r"\1\n        const caixaId = req.query.caixa_id;\n        const filterCaixa = caixaId ? ` AND caixa_id_firebird = ${parseInt(caixaId)}` : '';",
        content
    )

for ep in ['contas-receber', 'contas-pagar', 'fluxo-caixa', 'kpis', 'caixa']:
    add_caixa_id(ep)

# Replace in contas-receber / contas-pagar
content = content.replace("AND TRIM(tipo) = 'RECEBER'\n            GROUP BY 1", "AND TRIM(tipo) = 'RECEBER'\n              ${filterCaixa}\n            GROUP BY 1")
content = content.replace("AND TRIM(tipo) = 'PAGAR'\n            GROUP BY 1", "AND TRIM(tipo) = 'PAGAR'\n              ${filterCaixa}\n            GROUP BY 1")

# Replace in fluxo-caixa
content = content.replace("AND COALESCE(data_pagamento, data_vencimento) <= $3\n            GROUP BY", "AND COALESCE(data_pagamento, data_vencimento) <= $3\n              ${filterCaixa}\n            GROUP BY")

# Replace in kpis (5 queries)
content = content.replace("AND TRIM(status_pagamento) = 'ABERTO'`, [tenantId]),", "AND TRIM(status_pagamento) = 'ABERTO' ${filterCaixa}`, [tenantId]),")
content = content.replace("AND TRIM(status_pagamento) = 'PAGO'`, [tenantId, finRange.start, finRange.end]),", "AND TRIM(status_pagamento) = 'PAGO' ${filterCaixa}`, [tenantId, finRange.start, finRange.end]),")
content = content.replace("AND data_vencimento < NOW()`, [tenantId]),", "AND data_vencimento < NOW() ${filterCaixa}`, [tenantId]),")
content = content.replace("AND TRIM(tipo) = 'RECEBER'`, [tenantId]),", "AND TRIM(tipo) = 'RECEBER' ${filterCaixa}`, [tenantId]),")
content = content.replace("AND data_emissao IS NOT NULL`, [tenantId])", "AND data_emissao IS NOT NULL ${filterCaixa}`, [tenantId])")

# Replace in caixa (2 queries)
content = content.replace("WHERE tenant_id = $1\n        `,", "WHERE tenant_id = $1\n              ${filterCaixa}\n        `,")
content = content.replace("AND COALESCE(data_pagamento, data_vencimento) <= $3\n            GROUP BY TO_CHAR", "AND COALESCE(data_pagamento, data_vencimento) <= $3\n              ${filterCaixa}\n            GROUP BY TO_CHAR")

# Replace in contas (dynamic where)
content = content.replace("""        if (statusPg === 'VENCIDA') {""", """        if (req.query.caixa_id) {
            where.push(`f.caixa_id_firebird = $${pIndex++}`);
            binds.push(parseInt(req.query.caixa_id));
        }

        if (statusPg === 'VENCIDA') {""")

with open('middleware/src/routes/financeiro.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied")
