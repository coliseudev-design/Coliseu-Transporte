import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

container = "nexus-middleware-br0y0d05a1fq8fpwppb3y5bb-030128186593"
js_code = """
const express = require('express');
const app = require('./src/app');

// We will mock req, res, and next to call the app route directly
async function run() {
  const req = {
    method: 'GET',
    url: '/160973/detalhes-360',
    headers: {
      // Mock authorization to bypass requireWebJwt
      authorization: 'Bearer dummy_token'
    },
    params: { id: '160973' },
    tenant: { id: '1e40d65f-4319-4c68-ae13-66223820c095' },
    user: { id: 1 },
    ip: '127.0.0.1'
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      console.log('=== ROUTE JSON RESPONSE ===');
      console.log(JSON.stringify(data));
      process.exit(0);
    },
    send(data) {
      console.log('=== ROUTE SEND RESPONSE ===');
      console.log(data);
      process.exit(0);
    }
  };

  // Find the route handler in the express app
  // To bypass requireWebJwt and rateLimit, we can call the router handler directly!
  const db = require('./src/db/postgres');
  const clientesRouter = require('./src/routes/clientes');
  
  // Create a mini app to run the route
  const miniApp = express();
  miniApp.use((req, res, next) => {
    req.tenant = { id: '1e40d65f-4319-4c68-ae13-66223820c095' };
    next();
  });
  miniApp.use('/', clientesRouter);

  // Call the miniApp handler
  miniApp(req, res, (err) => {
    console.error('ERROR in routing:', err);
    process.exit(1);
  });
}
run();
"""

sftp = client.open_sftp()
with sftp.file('/tmp/check_route.js', 'w') as f:
    f.write(js_code)
sftp.close()

client.exec_command(f"docker cp /tmp/check_route.js {container}:/usr/src/app/check_route.js")
stdin, stdout, stderr = client.exec_command(f"docker exec -w /usr/src/app {container} node check_route.js 2>&1")
print("=== API ROUTE RESULTS ===")
print(stdout.read().decode('utf-8'))
client.close()
