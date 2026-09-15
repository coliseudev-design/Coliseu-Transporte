import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

def test_external_db():
    script = """
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:0r0E6oV!qG3h@2.24.82.19:5432/nexusdash',
  connectionTimeoutMillis: 5000
});
client.connect()
  .then(() => {
    console.log('RESULT_CONN:Success');
    return client.query('SELECT COUNT(*) AS total FROM dash_clientes');
  })
  .then(res => {
    console.log('RESULT_CLI:' + JSON.stringify(res.rows));
    return client.query('SELECT COUNT(*) AS total FROM dash_financeiro');
  })
  .then(res => {
    console.log('RESULT_FIN:' + JSON.stringify(res.rows));
    return client.query('SELECT tenant_id::text, COUNT(*) FROM dash_clientes GROUP BY tenant_id');
  })
  .then(res => {
     console.log('RESULT_TENANTS:' + JSON.stringify(res.rows));
     client.end();
  })
  .catch(err => {
    console.log('RESULT_ERR:' + err.message);
    client.end();
  });
"""
    cmd = f"docker exec {MW} node -e \"{script}\" 2>&1"
    stdin, stdout, stderr = client.exec_command(cmd)
    print("=== EXTERNAL DB TEST ===")
    print(stdout.read().decode('utf-8'))

if __name__ == '__main__':
    try:
        test_external_db()
    finally:
        client.close()
