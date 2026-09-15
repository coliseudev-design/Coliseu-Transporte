import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

print("=== WG SHOW (WIREGUARD) ===")
stdin, stdout, stderr = client.exec_command("wg show 2>&1")
print(stdout.read().decode('utf-8'))

print("=== NETSTAT (ESTABLISHED CONNECTIONS TO/FROM 2.24.82.19) ===")
stdin, stdout, stderr = client.exec_command("netstat -anp | grep '2.24.82.19' 2>&1")
print(stdout.read().decode('utf-8'))

print("=== NETSTAT (ALL ESTABLISHED HTTP/HTTPS OR OTHER EXTERNAL CONNECTIONS) ===")
stdin, stdout, stderr = client.exec_command("netstat -anpt | grep -E 'ESTABLISHED' | head -50")
print(stdout.read().decode('utf-8'))

print("=== PUBLIC DOMAIN RESOLUTIONS FROM SERVER HOST ===")
stdin, stdout, stderr = client.exec_command("nslookup dashboard.coliseusistemas.com.br && nslookup nexus.coliseusistemas.com.br")
print(stdout.read().decode('utf-8'))

client.close()
