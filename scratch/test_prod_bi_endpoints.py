import paramiko

def run_test():
    host = '2.24.82.19'
    user = 'root'
    password = 'Col@13894645'

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting to Production SSH...")
        client.connect(host, username=user, password=password)

        stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'nexus-middleware'")
        out = stdout.read().decode('utf-8').strip()
        if not out:
            print("Production nexus-middleware container not found!")
            return
        container = out.split('\n')[0]
        print(f"Targeting Production Container: {container}")

        # Let's write the Node.js test script that will run inside the container.
        # It signs a JWT token for the default production tenant and hits the local API.
        js_code = """
const jwt = require('jsonwebtoken');
const http = require('http');
const config = require('./src/config/env');

const secret = config.security.jwtDeviceKey;

// We need to find a valid tenant ID. Let's query the DB or use the default tenant ID from production.
// Let's first test with a couple of potential tenant IDs.
// A common one in this project seems to be 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5' or 'ce3067f6-04a3-4b6c-a1b8-6aa47f24aad6'.
const tenantId = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5'; 

const payload = {
  tenantId: tenantId,
  module: 'nexus',
  userId: 1,
  companyName: 'Production Test'
};

const token = jwt.sign(payload, secret, { expiresIn: '1h' });

function makeRequest(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3200,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, data: JSON.stringify({ error: err.message }) });
    });

    req.end();
  });
}

async function run() {
  const endpoints = [
    '/api/bi/dashboard-home',
    '/api/bi/sales/executive-summary?period=thisMonth',
    '/api/estatisticas/kpis?period=thisMonth',
    '/api/ranking/vendedores?period=thisMonth&limit=10',
    '/api/ranking/produtos?period=thisMonth&limit=10'
  ];

  for (const ep of endpoints) {
    const res = await makeRequest(ep);
    console.log(`Endpoint: ${ep}`);
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${res.data.substring(0, 500)}${res.data.length > 500 ? '...' : ''}`);
    console.log('--------------------------------------------------');
  }
  process.exit(0);
}

run();
"""

        sftp = client.open_sftp()
        with sftp.file('/tmp/test_real_http_prod.js', 'w') as f:
            f.write(js_code)
        sftp.close()

        # Copy the test file to the container
        client.exec_command(f"docker cp /tmp/test_real_http_prod.js {container}:/usr/src/app/test_real_http_prod.js")
        
        # Execute the test script inside the container
        stdin, stdout, stderr = client.exec_command(f"docker exec -w /usr/src/app {container} node test_real_http_prod.js 2>&1")
        print("=== PROD INTEGRATION TEST RESULTS ===")
        print(stdout.read().decode('utf-8'))

        # Clean up
        client.exec_command(f"docker exec -w /usr/src/app {container} rm test_real_http_prod.js")
        client.exec_command("rm /tmp/test_real_http_prod.js")

    except Exception as e:
        print("Error connecting or running test:", e)
    finally:
        client.close()

if __name__ == '__main__':
    run_test()
