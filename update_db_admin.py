import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('177.39.17.7', username='root', password='6EFBC!c0:wzr%Ij')

sql = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE dash_usuarios ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;

DO $$ 
DECLARE 
    admin_id uuid;
BEGIN
    SELECT id INTO admin_id FROM dash_usuarios WHERE email = 'admin@silenus.com.br';
    
    IF admin_id IS NULL THEN
        INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash, permissions)
        VALUES ('00000000-0000-0000-0000-000000000000', 'admin@silenus.com.br', 'Admin Silenus', 'master', true, crypt('13894645.', gen_salt('bf')), NULL);
    ELSE
        UPDATE dash_usuarios 
        SET senha_hash = crypt('13894645.', gen_salt('bf')), role = 'master', permissions = NULL 
        WHERE id = admin_id;
    END IF;
END $$;
"""

# Escaping double quotes for the bash command
script = f'''docker exec -i nexus-db-thyqkc5gkvp7i1nld555wakz-131845936540 psql -U nexus_admin -d nexus_dashboard << 'EOF'
{sql}
EOF
'''

stdin, stdout, stderr = client.exec_command(script)
print('STDOUT:', stdout.read().decode('utf-8'))
print('STDERR:', stderr.read().decode('utf-8'))
