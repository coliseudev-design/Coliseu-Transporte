import os

routes_dir = 'middleware/src/routes'
files_to_patch = ['vendas.js', 'ranking.js', 'estatisticas.js', 'clientes.js']

for filename in files_to_patch:
    path = os.path.join(routes_dir, filename)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Substituir a query de maxDate por new Date()
    content = content.replace(
        'const { rows: rMax } = await db.query(SELECT LEAST(COALESCE(MAX(data_venda), CURRENT_DATE), CURRENT_DATE) as d FROM dash_vendas WHERE tenant_id = , [tenantId]);\n        const maxDate = rMax[0].d;',
        'const maxDate = new Date();'
    )
    
    content = content.replace(
        'const { rows: rMax } = await db.query(SELECT LEAST(COALESCE(MAX(data_venda), CURRENT_DATE), CURRENT_DATE) as d FROM dash_vendas WHERE tenant_id = , [tenantId]);\n        const maxDate = rMax.length > 0 ? rMax[0].d : new Date();',
        'const maxDate = new Date();'
    )

    # estatisticas.js has a more complex block
    content = content.replace(
        '''        const [rMax, rMaxFin] = await Promise.all([
            db.query(SELECT LEAST(COALESCE(MAX(data_venda), CURRENT_DATE), CURRENT_DATE) as d FROM dash_vendas WHERE tenant_id = , [tenantId]),
            db.query(SELECT LEAST(COALESCE(MAX(data_emissao), CURRENT_DATE), CURRENT_DATE) as d FROM dash_financeiro WHERE tenant_id = , [tenantId])
        ]);
        
        const maxDate = rMax.rows[0].d;
        const maxDateFin = rMaxFin.rows[0].d;''',
        '''        const maxDate = new Date();
        const maxDateFin = new Date();'''
    )

    # ranking.js
    content = content.replace(
        '''        const { rows: rMax } = await db.query(
            SELECT LEAST(COALESCE(MAX(data_venda), CURRENT_DATE), CURRENT_DATE) as anchor FROM dash_vendas WHERE tenant_id = ,
            [tenantId]
        );
        const maxDate = rMax[0].anchor;''',
        'const maxDate = new Date();'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print('Patch aplicado!')
