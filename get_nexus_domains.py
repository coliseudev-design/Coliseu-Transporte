import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('2.24.82.19', username='root', password='Col@13894645', port=22)

# Get Traefik rules and names for containers containing 'nexus' or 'dashboard' or 'middleware'
stdin, stdout, stderr = client.exec_command("docker ps -q")
container_ids = stdout.read().decode('utf-8').strip().split()

print("=== DOMAINS FOR CONTAINERS ===")
for cid in container_ids:
    stdin, stdout, stderr = client.exec_command(f"docker inspect --format '{{{{.Name}}}}\t{{{{range $k, $v := .Config.Labels}}}}{{{{if eq $k \"traefik.http.routers.https-0-br0y0d05a1fq8fpwppb3y5bb-nexus-middleware.rule\"}}}}{{{{$v}}}}{{{{end}}}}{{{{if eq $k \"traefik.http.routers.https-0-g115wwb76cltjli9wew0cgfi-dashboard-middleware.rule\"}}}}{{{{$v}}}}{{{{end}}}}{{{{if eq $k \"traefik.http.routers.https-0-br0y0d05a1fq8fpwppb3y5bb-dashboard-frontend.rule\"}}}}{{{{$v}}}}{{{{end}}}}{{{{if eq $k \"traefik.http.routers.https-0-g115wwb76cltjli9wew0cgfi-dashboard-frontend.rule\"}}}}{{{{$v}}}}{{{{end}}}}{{{{if contains $k \"rule\"}}}}{{{{$k}}}}: {{{{$v}}}}\\n{{{{end}}}}{{{{end}}}}' {cid}")
    print(stdout.read().decode('utf-8').strip())

client.close()
