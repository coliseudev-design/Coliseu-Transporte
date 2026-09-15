import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

FE = "dashboard-frontend-irerzifjwjb4q8ucbpfk2gb8-184550458446"

# Run tail on Nginx access log
print("=== NGINX ACCESS LOG TAIL ===")
stdin, stdout, stderr = client.exec_command(f"docker exec {FE} tail -n 5000 /var/log/nginx/access.log")
access_log = stdout.read().decode('utf-8')
access_err = stderr.read().decode('utf-8')

if access_err:
    print("Err reading access log:", access_err)

matching_lines = []
for line in access_log.splitlines():
    if "c06a45f5" in line or "a822a7e7" in line or "sync" in line.lower() or "internal" in line.lower():
        matching_lines.append(line)

print(f"Total matching access lines in last 5000: {len(matching_lines)}")
for line in matching_lines[-50:]:  # Print last 50 matches
    print(line)

print("\n=== NGINX ERROR LOG TAIL ===")
stdin, stdout, stderr = client.exec_command(f"docker exec {FE} tail -n 100 /var/log/nginx/error.log")
print(stdout.read().decode('utf-8'))

client.close()
