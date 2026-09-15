import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

script = 'docker ps -a --format "{{.Names}} - {{.Image}}"'
stdin, stdout, stderr = client.exec_command(script)
print(stdout.read().decode('utf-8'))
