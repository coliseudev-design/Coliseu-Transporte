import paramiko
import sys

def run_ssh_cmd():
    host = '177.39.17.7'
    user = 'root'
    password = '6EFBC!c0:wzr%Ij'
    cmd = '''docker exec nexus-db-thyqkc5gkvp7i1nld555wakz-185809944773 psql -U nexus_admin -d nexus_identity -c 'SELECT email FROM "Users";' '''

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, username=user, password=password)
        stdin, stdout, stderr = client.exec_command(cmd)
        
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        
        print("STDOUT:")
        print(out)
        if err:
            print("STDERR:")
            print(err)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    run_ssh_cmd()
