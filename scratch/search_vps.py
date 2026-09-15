import paramiko
import os

host = '177.39.17.7'
user = 'root'
password = '6EFBC!c0:wzr%Ij'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

sftp = client.open_sftp()

# Local JS code
js_code = """
const pg = require('pg');
const pool = new pg.Pool({
  host: process.env.PG_HOST || 'coliseu-db',
  user: process.env.PG_USER || 'coliseu_admin',
  password: process.env.PG_PASSWORD || 'ColiseuDB2026Prod',
  database: 'coliseu_dashboard',
  port: parseInt(process.env.PG_PORT || 5432),
  ssl: false
});

async function run() {
  try {
    const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = tablesRes.rows.map(r => r.table_name);
    
    for (const t of tables) {
      const colsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${t}' AND data_type IN ('character varying', 'text')`);
      const cols = colsRes.rows.map(r => r.column_name);
      
      for (const col of cols) {
        try {
          const countRes = await pool.query(`SELECT COUNT(*) as count FROM ${t} WHERE ${col} ILIKE '%ciplan%'`);
          const count = parseInt(countRes.rows[0].count, 10);
          if (count > 0) {
            console.log(`FOUND_MATCH: Table=${t}, Column=${col}, Count=${count}`);
            const sampleRes = await pool.query(`SELECT * FROM ${t} WHERE ${col} ILIKE '%ciplan%' LIMIT 2`);
            console.log('SAMPLE:' + JSON.stringify(sampleRes.rows));
          }
        } catch (colErr) {
          // ignore column errors
        }
      }
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    pool.end();
  }
}
run();
"""

# Write local temporary file
local_js = "search_temp.js"
with open(local_js, "w") as f:
    f.write(js_code)

# SFTP upload
sftp.put(local_js, "/tmp/search_temp.js")
os.remove(local_js)

# Find container
stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
container = stdout.read().decode('utf-8').strip().split('\n')[0]
print(f"Container: {container}")

# Copy file into container
client.exec_command(f"docker cp /tmp/search_temp.js {container}:/tmp/search_temp.js")

# Execute JS script
stdin, stdout, stderr = client.exec_command(f"docker exec {container} node /tmp/search_temp.js")
print("STDOUT:")
print(stdout.read().decode('utf-8'))
print("STDERR:")
print(stderr.read().decode('utf-8'))

# Clean up
client.exec_command(f"rm /tmp/search_temp.js")
client.exec_command(f"docker exec {container} rm /tmp/search_temp.js")

client.close()
sftp.close()
