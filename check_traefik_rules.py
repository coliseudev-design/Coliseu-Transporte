import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

containers = [
    "dashboard-frontend-irerzifjwjb4q8ucbpfk2gb8-184550458446",
    "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-184550465141",
    "frontend-nsnopymisrq9qphl5qjc3w5l-145010675012",
    "api-nsnopymisrq9qphl5qjc3w5l-145010651736"
]

for container in containers:
    print(f"\n=== Labels for {container} ===")
    stdin, stdout, stderr = client.exec_command(f"docker inspect {container} --format '{{{{range $k, $v := .Config.Labels}}}}{{{{$k}}}}={{{{$v}}}}\\n{{{{end}}}}' 2>&1")
    labels = stdout.read().decode('utf-8')
    for line in labels.splitlines():
        if "traefik" in line.lower() or "fqdn" in line.lower() or "host" in line.lower():
            print(line)

client.close()
