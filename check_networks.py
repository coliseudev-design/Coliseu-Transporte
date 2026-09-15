import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

MW = "dashboard-middleware-irerzifjwjb4q8ucbpfk2gb8-143954252857"

# Redes do middleware
stdin, stdout, stderr = client.exec_command(f"docker inspect {MW} --format '{{{{json .NetworkSettings.Networks}}}}' 2>&1")
print("=== Redes do middleware ===")
import json
nets = json.loads(stdout.read().decode('utf-8'))
for net_name, net_info in nets.items():
    print(f"  Network: {net_name}")
    print(f"  IP: {net_info.get('IPAddress')}")
    print(f"  Gateway: {net_info.get('Gateway')}")

print()

# Lista todos containers nas mesmas redes do middleware  
for net_name in nets.keys():
    stdin, stdout, stderr = client.exec_command(f"docker network inspect {net_name} --format '{{{{json .Containers}}}}' 2>&1")
    print(f"=== Containers na rede {net_name} ===")
    try:
        containers = json.loads(stdout.read().decode('utf-8'))
        for c_id, c_info in containers.items():
            print(f"  {c_info.get('Name')} -> {c_info.get('IPv4Address')}")
    except:
        print("  (erro ao parsear)")

client.close()
