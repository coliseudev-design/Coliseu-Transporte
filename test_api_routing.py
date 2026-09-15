import paramiko
import urllib.request
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-184550465141"

print("Curling https://dashboard.coliseusistemas.com.br/api/health/liveness...")
try:
    req = urllib.request.Request(
        'https://dashboard.coliseusistemas.com.br/api/health/liveness',
        headers={'User-Agent': 'TestApiRoutingAgent999'}
    )
    resp = urllib.request.urlopen(req, timeout=5)
    print("Curl success! Status:", resp.status)
    print("Response:", resp.read().decode('utf-8'))
except Exception as e:
    print("Curl error:", e)

# Wait 2 seconds
time.sleep(2)

# Check middleware logs
stdin, stdout, stderr = client.exec_command(f"docker logs --since 1m {MW} 2>&1")
logs = stdout.read().decode('utf-8')
print("\n=== MIDDLEWARE LOGS IN THE LAST 1 MINUTE ===")
print(logs)

if "TestApiRoutingAgent999" in logs or "liveness" in logs:
    print("\n>>> MATCH FOUND! Traffic to dashboard.coliseusistemas.com.br is routed to 177.39.17.7! <<<")
else:
    print("\n>>> NO MATCH! Traffic to dashboard.coliseusistemas.com.br is NOT routed to 177.39.17.7. <<<")

client.close()
