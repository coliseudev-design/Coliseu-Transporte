import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect('2.24.82.19', username='root', password='6EFBC!c0:wzr%Ij', timeout=5)
    script = "docker ps --format '{{.Names}} - {{.Image}}'"
    stdin, stdout, stderr = client.exec_command(script)
    print('STDOUT:', stdout.read().decode('utf-8'))
    print('STDERR:', stderr.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)
