import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

node_script = """
const { Pool } = require('/app/node_modules/pg');
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
});
pool.query(`
  SELECT status, especie, COUNT(*) as qtd, SUM(valor_total) as valor_total
  FROM dash_vendas
  WHERE data_venda >= '2026-05-11' AND data_venda < '2026-05-12'
  GROUP BY status, especie
  ORDER BY qtd DESC
`).then(res => {
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
"""

script = f'''
cat << 'EOF_NODE' > /tmp/query.js
{node_script}
EOF_NODE
docker cp /tmp/query.js dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-235633084873:/tmp/query.js
docker exec -i dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-235633084873 node /tmp/query.js
'''
stdin, stdout, stderr = client.exec_command(script)
print('STDOUT:\n', stdout.read().decode('utf-8'))
print('STDERR:\n', stderr.read().decode('utf-8'))
