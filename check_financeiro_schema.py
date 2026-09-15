import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"
js_code = """
const pg = require('pg');
const pool = new pg.Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: parseInt(process.env.PG_PORT || 5432)
});

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'dash_financeiro'
  `);
  console.log(JSON.stringify(res.rows));
  pool.end();
}
run();
"""

sftp = client.open_sftp()
with sftp.file('/tmp/check_schema.js', 'w') as f:
    f.write(js_code)
sftp.close()

client.exec_command(f"docker cp /tmp/check_schema.js {container}:/usr/src/app/check_schema.js")
stdin, stdout, stderr = client.exec_command(f"docker exec -w /usr/src/app {container} node check_schema.js 2>&1")
print("=== SCHEMA RESULTS ===")
print(stdout.read().decode('utf-8'))
client.close()
