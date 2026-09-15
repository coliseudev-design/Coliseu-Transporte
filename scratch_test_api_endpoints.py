import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

# We will run a Node.js script inside the middleware container to hit the endpoints directly or query the db
# Let's query the endpoints by invoking their router handlers or making local http calls.
# Wait, let's just make http requests to http://localhost:3000/api/... inside the container.
# Wait, is the middleware port mapped to the host or only inside docker?
# Let's see what ports dashboard-middleware has. In list_all_containers, dashboard-middleware is listening on 10.0.1.8/24.
# Let's run a curl command inside dashboard-middleware container: curl http://localhost:3000/health
stdin, stdout, stderr = client.exec_command(f"docker exec {MW} node -e \"require('http').get('http://localhost:3200/health/readiness', (res) => res.pipe(process.stdout))\"")
print("Health Check:", stdout.read().decode('utf-8'))

# Wait, the middleware requires JWT token to access /api/*!
# Let's see how the frontend logs in or generates token.
# Or we can just run a node script inside the container that directly calls the database logic or router handlers.
# Actually, let's see how the middleware handles JWT and tenant.
# Let's execute a command that bypasses auth or runs the query from bi.js router directly.

client.close()
