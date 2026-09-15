import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get active container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Active Nexus MW Container: {MW}")

# Client mapping data: id_firebird -> (name, phone)
client_mappings = {
    11: ("VENDAS", "(67)-99962-7756"),
    12: ("COLISEU", "(67)-99969-9415"),
    13: ("KLEBER", "(67)-98427-8256"),
    14: ("Coliseu 1", "(67)-99871-8390"),
    15: ("CLAUDIO", "(67)-98407-4388"),
    16: ("KELY KLEBER", "(67)-98458-0096"),
    20: ("DANIEL", "(67)-98427-8227"),
    22: ("SUPORTE DOURADOS", "(67)-98402-8572"),
    26: ("KELY DANIEL", "(67)-98446-0096"),
    28: ("Coliseu 2", "(67)-99236-8720"),
    29: ("COMERCIAL CG", "(67)-99894-2582"),
    30: ("ROBERSON", "(67)-99693-7775"),
    32: ("Coliseu 3", "(67)-99896-1893"),
    33: ("SUPORTE GERAL", "(67)-99826-9796"),
    34: ("PIETRO", "(67)-99250-8295"),
    35: ("KELY DANIEL", "(67)-98409-0097"),
    36: ("THAILON", "(67)-98406-9153"),
    37: ("JEFFERSON", "(67)-99229-2937"),
    38: ("FINANCEIRO", "(67)-99856-4972"),
    41: ("Coliseu 4", "(67)-99695-6033")
}

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
  console.log('ERROR:' + err.message);
  pool.end();
}});
" 2>&1"""
    stdin, stdout, stderr = client.exec_command(cmd)
    output = stdout.read().decode('utf-8')
    for line in output.splitlines():
        if line.startswith('RESULT:'):
            return json.loads(line.replace('RESULT:', '').strip())
        elif line.startswith('ERROR:'):
            print("SQL Error:", line)
            return None
    return None

# Update clients
print("Updating clients...")
for fb_id, (name, phone) in client_mappings.items():
    update_sql = f"""
        UPDATE dash_clientes
        SET nome = '{name}', telefone = '{phone}', data_nascimento = '18/11'
        WHERE tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6' AND id_firebird = {fb_id}
    """
    run_query(update_sql)
    print(f"Updated Client FB: {fb_id} -> Name: {name}, Phone: {phone}, Niver: 18/11")

# Update sales records to associate with COLISEU (vendedor_id_firebird = 1)
print("\nUpdating sales records to seller COLISEU (FB ID: 1)...")
fb_ids_str = ",".join(str(x) for x in client_mappings.keys())
update_sales_sql = f"""
    UPDATE dash_vendas
    SET vendedor_id_firebird = 1
    WHERE tenant_id = 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6' AND cliente_id_firebird IN ({fb_ids_str})
    RETURNING id
"""
res_sales = run_query(update_sales_sql)
if res_sales is not None:
    print(f"Successfully updated {len(res_sales)} sales records to seller COLISEU.")
else:
    print("Failed to update sales records.")

client.close()
