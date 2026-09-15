import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', timeout=10)

def run_cmd(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    return out, err

print("=== Altering Schema in nexus_dashboard ===")
out, err = run_cmd("docker exec vasjsucz4yxcb7m4rtqindd2 psql -U coliseu_admin -d nexus_dashboard -c \"ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS data_vencimento TIMESTAMPTZ DEFAULT NULL; ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS cfop INTEGER DEFAULT NULL; ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS numero_nota INTEGER DEFAULT NULL; ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS data_hora_proc TIMESTAMPTZ DEFAULT NULL; ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS es INTEGER DEFAULT NULL; ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS processo INTEGER DEFAULT NULL;\"")
print(out)
if err: print("ERR:", err)

# Discovery container dynamically
out, err = run_cmd("docker ps --format '{{.Names}}' | grep 'dashboard-middleware'")
container = out.strip().split('\n')[0]
print(f"Using container: {container}")

# Upload local JS script to VPS
print("Uploading scratch_align_all_data.js to VPS...")
sftp = client.open_sftp()
sftp.put('scratch/scratch_align_all_data.js', '/tmp/scratch_align_all_data.js')
sftp.close()

# Copy to container
print("Copying script to container...")
run_cmd(f"docker cp /tmp/scratch_align_all_data.js {container}:/usr/src/app/scratch_align_all_data.js")

# Execute script in container
print("Executing script in container...")
out_exec, err_exec = run_cmd(f"docker exec -w /usr/src/app {container} node scratch_align_all_data.js")
print(out_exec)
if err_exec: print("ERR:", err_exec)

# Cleanup
print("Cleaning up...")
run_cmd(f"docker exec {container} rm /usr/src/app/scratch_align_all_data.js")
run_cmd("rm /tmp/scratch_align_all_data.js")
print("Data alignment process finished.")

client.close()
