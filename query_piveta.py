import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

script = """docker exec coolify-db psql -U coolify -d identity -c "
SELECT id, name FROM \\"Companies\\" WHERE name ILIKE '%piveta%';
"
"""
stdin, stdout, stderr = client.exec_command(script)
print('STDOUT:', stdout.read().decode('utf-8'))
print('STDERR:', stderr.read().decode('utf-8'))

script2 = """docker exec coolify-db psql -U coolify -l"""
stdin, stdout, stderr = client.exec_command(script2)
print('DATABASES STDOUT:', stdout.read().decode('utf-8'))
