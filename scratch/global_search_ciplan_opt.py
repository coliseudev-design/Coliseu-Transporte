import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

# Write a single Node.js script that will connect, search all text fields in all tables, and print the results
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
        // query count of matches
        const countRes = await pool.query(`SELECT COUNT(*) as count FROM ${t} WHERE ${col} ILIKE '%ciplan%'`);
        const count = parseInt(countRes.rows[0].count, 10);
        if (count > 0) {
          console.log(`FOUND_MATCH: Table=${t}, Column=${col}, Count=${count}`);
          const sampleRes = await pool.query(`SELECT * FROM ${t} WHERE ${col} ILIKE '%ciplan%' LIMIT 2`);
          console.log('SAMPLE:' + JSON.stringify(sampleRes.rows));
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

# Escape JS code for bash command
escaped_js = js_code.replace("`", "\\`").replace('"', '\\"').replace('$', '\\$')

cmd = f'docker exec {MW} node -e "{escaped_js}" 2>&1'
stdin, stdout, stderr = client.exec_command(cmd)
print("STDOUT:")
print(stdout.read().decode('utf-8'))
print("STDERR:")
print(stderr.read().decode('utf-8'))

client.close()
