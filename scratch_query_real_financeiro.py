import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

def run_query(sql):
    cmd = f"""docker exec {MW} node -e "
const pg = require('pg');
const pool = new pg.Pool({{
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'nexus_admin',
  password: process.env.PG_PASSWORD || 'NexusDB2026Prod',
  database: process.env.PG_DATABASE || 'nexus_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
}});
pool.query(\`{sql}\`).then(res => {{
  console.log('RESULT:' + JSON.stringify(res.rows));
  pool.end();
}}).catch(err => {{
  console.error('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""
    stdin, stdout, stderr = client.exec_command(cmd)
    output = stdout.read().decode('utf-8')
    for line in output.splitlines():
        if line.startswith('RESULT:'):
            return json.loads(line.replace('RESULT:', '').strip())
    return []

# 1. Total faturado/recebido por mês nos últimos 6 meses
# Usando a data_emissao ou data_vencimento
print("=== Monthly Receivables (Last 6 Months) ===")
q1 = """
    SELECT 
        TO_CHAR(data_vencimento, 'YYYY-MM') as mes,
        COUNT(*) as total_titulos,
        SUM(valor) as valor_total,
        SUM(valor_pago) as valor_pago
    FROM dash_financeiro
    WHERE tenant_id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'
      AND tipo = 'RECEBER'
      AND data_vencimento >= NOW() - INTERVAL '6 months'
    GROUP BY 1
    ORDER BY 1
"""
print(run_query(q1))

# 2. Overdue invoices (faturas vencidas atraso)
print("\n=== Overdue Invoices ===")
q2 = """
    SELECT 
        c.nome as cliente,
        f.valor - f.valor_pago as valor_aberto,
        EXTRACT(DAY FROM NOW() - f.data_vencimento) as dias_atraso
    FROM dash_financeiro f
    LEFT JOIN dash_clientes c ON c.id_firebird = f.cliente_id_firebird AND c.tenant_id = f.tenant_id
    WHERE f.tenant_id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'
      AND f.tipo = 'RECEBER'
      AND f.status_pagamento = 'ABERTO'
      AND f.data_vencimento < NOW()
    ORDER BY valor_aberto DESC
    LIMIT 10
"""
print(run_query(q2))

# 3. Daily cash flow entries and exits for last 7 days
print("\n=== Cash Flow (Last 7 Days) ===")
q3 = """
    SELECT 
        TO_CHAR(COALESCE(data_pagamento, data_vencimento), 'YYYY-MM-DD') as data,
        SUM(CASE WHEN tipo = 'RECEBER' AND status_pagamento = 'PAGO' THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END) as entradas,
        SUM(CASE WHEN tipo = 'PAGAR' AND status_pagamento = 'PAGO' THEN COALESCE(NULLIF(valor_pago, 0), valor) ELSE 0 END) as saidas
    FROM dash_financeiro
    WHERE tenant_id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'
      AND COALESCE(data_pagamento, data_vencimento) >= NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1
"""
print(run_query(q3))

client.close()
