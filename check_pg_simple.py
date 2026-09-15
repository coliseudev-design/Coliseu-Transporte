import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857"

# Script mais simples, sem async/await
script = """
const {Pool} = require('/app/node_modules/pg');
const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: 5432
});
pool.query('SELECT NOW() as now, CURRENT_DATE as hoje').then(r=>{
  console.log('NOW='+r.rows[0].now+' HOJE='+r.rows[0].hoje);
  return pool.query('SELECT data_venda::text, status, COUNT(*), SUM(valor_total) FROM dash_vendas WHERE data_venda >= NOW()-interval\\'10 days\\' GROUP BY 1,2 ORDER BY 1 DESC');
}).then(r=>{
  r.rows.forEach(row=>console.log('ROW|'+row.data_venda+'|'+row.status+'|'+row.count+'|'+row.sum));
  return pool.end();
}).catch(e=>{console.error('ERR:'+e.message);process.exit(1)});
"""

cmd = f"docker exec {MW} node -e \"{script.strip().replace(chr(10), ' ').replace('\"', chr(39))}\" 2>&1"
stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode('utf-8'))

# Alternativa: lê diretamente os logs do worker para ver o ultimo sync
stdin2, stdout2, stderr2 = client.exec_command("tail -n 30 /Sales/logs/worker-*.log 2>/dev/null || ls /Sales/logs/ 2>&1")
print("=== Logs Worker ===")
print(stdout2.read().decode('utf-8', errors='replace'))

client.close()
