import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

def run_coolify_query(sql):
    # Runs query in coolify-db postgres container
    # The default database is 'coolify', user is 'coolify'
    cmd = f"""docker exec coolify-db psql -U coolify -d coolify -c "{sql}" 2>&1"""
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8')

print("=== TABLES IN COOLIFY DATABASE ===")
print(run_coolify_query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"))

# Query servers table
print("=== SERVERS IN COOLIFY ===")
print(run_coolify_query("SELECT id, name, ip, port, user FROM servers"))

# Query private keys
print("=== PRIVATE KEYS IN COOLIFY ===")
print(run_coolify_query("SELECT id, name, description FROM private_keys"))

client.close()
