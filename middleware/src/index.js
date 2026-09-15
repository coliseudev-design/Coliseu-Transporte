'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');
const db = require('./db/postgres');
const fs = require('fs');
const path = require('path');

async function startServer() {
    try {
        // 1. Inicia o servidor HTTP IMEDIATAMENTE na porta 3200 para garantir que o Coolify/Nginx não retornem 502 Bad Gateway no boot
        const server = app.listen(config.server.port, () => {
            logger.info(`[App] Dashboard Middleware rodando na porta ${config.server.port} [${config.server.nodeEnv}]`);
        });

        // Iniciar o Scheduler de Disparos Automáticos
        const scheduler = require('./utils/scheduler');
        scheduler.start();

        // 2. Inicialização assíncrona do banco e migrações
        const dbOk = await db.checkConnection();
        if (!dbOk) {
            logger.warn('[App] Banco de dados indisponível no boot. Servidor continuará iniciando para health-checks responderem.');
        } else {
            try {
                logger.info('[App] Sincronizando tabelas do banco de dados (schema.sql)...');
                const schemaPath = path.join(__dirname, 'db', 'schema.sql');
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                await db.query(schemaSql);

                logger.info('[App] Executando migração de permissões e admin...');
                await db.query('ALTER TABLE dash_usuarios ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;');

                const bcrypt = require('bcryptjs');
                const adminEmail = 'admin@silenus.com.br';
                const adminPass = '13894645';
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(adminPass, salt);

                const checkAdmin = await db.query('SELECT id FROM dash_usuarios WHERE email = $1', [adminEmail]);
                if (checkAdmin.rowCount > 0) {
                    await db.query('UPDATE dash_usuarios SET senha_hash = $1, role = $2, permissions = NULL, ativo = true WHERE email = $3', [hash, 'master', adminEmail]);
                } else {
                    await db.query(
                        `INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash, permissions)
                         VALUES ($1, $2, $3, $4, true, $5, NULL)`,
                        ['00000000-0000-0000-0000-000000000000', adminEmail, 'Admin Silenus', 'master', hash]
                    );
                }
                logger.info('[App] Tabelas inicializadas com sucesso.');

                // --- Migrações Automáticas ---
                try {
                    const migrationsDir = path.join(__dirname, 'db', 'migrations');
                    if (fs.existsSync(migrationsDir)) {
                        const files = fs.readdirSync(migrationsDir)
                            .filter(f => f.endsWith('.sql'))
                            .sort();
                        for (const file of files) {
                            try {
                                logger.info(`[App] Aplicando migração ${file}...`);
                                const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                                await db.query(migrationSql);
                                logger.info(`[App] Migração ${file} aplicada com sucesso.`);
                            } catch (err) {
                                logger.warn(`[App] Aviso na migração ${file} para main:`, err.message);
                            }
                        }
                    }
                } catch (migErr) {
                    logger.warn('[App] Erro na aplicação de migrações automáticas:', migErr.message);
                }

            } catch (dbErr) {
                logger.error('[App] Erro ao sincronizar as tabelas do banco:', dbErr);
            }
        }

        const shutdown = () => {
            logger.info('[App] Recebido sinal de parada. Fechando servidor...');
            // Parar o Scheduler
            const scheduler = require('./utils/scheduler');
            scheduler.stop();
            
            server.close(async () => {
                logger.info('[App] Servidor HTTP fechado.');
                await db.pool.end();
                logger.info('[App] Conexão com PostgreSQL fechada.');
                process.exit(0);
            });

            setTimeout(() => {
                logger.error('[App] Forçando encerramento após timeout.');
                process.exit(1);
            }, 10000).unref();
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (err) {
        logger.error('[App] Falha crítica ao iniciar servidor', err);
        process.exit(1);
    }
}

startServer();
