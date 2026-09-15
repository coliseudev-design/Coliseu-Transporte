import paramiko
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

stdin, stdout, stderr = client.exec_command("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
MW = stdout.read().decode('utf-8').strip().split('\n')[0]

sftp = client.open_sftp()
with open('query_identity_db.js', 'rb') as f:
    sftp.putfo(f, '/tmp/query_identity_db.js')
sftp.close()

# Copy to container
client.exec_command(f"docker cp /tmp/query_identity_db.js {MW}:/usr/src/app/query_identity_db.js")
time.sleep(1)

# Run inside container
stdin, stdout, stderr = client.exec_command(f"docker exec {MW} node query_identity_db.js 2>&1")
print(stdout.read().decode('utf-8'))

# Clean up
client.exec_command(f"docker exec {MW} rm query_identity_db.js")
client.exec_command("rm -f /tmp/query_identity_db.js")

client.close()
