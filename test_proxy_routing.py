import paramiko
import urllib.request
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

FE = "dashboard-frontend-irerzifjwjb4q8ucbpfk2gb8-184550458446"

# Clear or get tail of Nginx logs before curl
stdin, stdout, stderr = client.exec_command(f"docker exec {FE} tail -n 5 /var/log/nginx/access.log")
before_log = stdout.read().decode('utf-8')
print("Logs before curl:")
print(before_log)

# Perform curl from local machine (with a unique user agent so we can identify it)
print("Curling https://dashboard.coliseusistemas.com.br/...")
try:
    req = urllib.request.Request(
        'https://dashboard.coliseusistemas.com.br/',
        headers={'User-Agent': 'TestProxyRoutingAgent12345'}
    )
    urllib.request.urlopen(req, timeout=5)
    print("Curl success!")
except Exception as e:
    print("Curl error:", e)

# Wait 2 seconds
time.sleep(2)

# Check logs again
stdin, stdout, stderr = client.exec_command(f"docker exec {FE} tail -n 20 /var/log/nginx/access.log")
after_log = stdout.read().decode('utf-8')
print("Logs after curl:")
print(after_log)

if "TestProxyRoutingAgent12345" in after_log:
    print("\n>>> MATCH FOUND! 2.24.82.19 is port-forwarding/proxying to 177.39.17.7! <<<")
else:
    print("\n>>> NO MATCH! 2.24.82.19 is a completely separate server, not forwarding to 177.39.17.7. <<<")

client.close()
