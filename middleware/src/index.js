'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');
const db = require('./db/postgres');
const fs = require('fs');
const path = require('path');

async function startServer() {
    try {
        // 1. Inicia o servidor HTTP IMEDIATAMENTE na porta configurada para que Coolify/Nginx não retornem 502 no boot
        const server = app.listen(config.server.port, '0.0.0.0', () => {
            logger.info(`[App] Coliseu Transporte Middleware rodando na porta ${config.server.port} [${config.server.nodeEnv}]`);
        });

        const transporteWorker = require('./utils/transporteWorker');

        // 2. Inicialização assíncrona do banco e migrações
        const dbOk = await db.checkConnection();
        if (!dbOk) {
            logger.warn('[App] Banco de dados indisponível no boot. Servidor continuará iniciando para health-checks responderem.');
        } else {
            try {
                // Inicializa keyring seguro persistido (JWT signing key + Vault AES-256-GCM v2 com fallback híbrido v1)
                const { initSystemKeyring } = require('./utils/cryptoVault');
                await initSystemKeyring(db);

                // Define o ambiente no banco (usado por seeds condicionais estritos de demo)
                const ambiente = process.env.APP_AMBIENTE || process.env.NODE_ENV || 'production';
                await db.query(`SELECT set_config('app.ambiente', $1, false)`, [ambiente]);
                logger.info(`[App] Ambiente de banco definido como: ${ambiente}`);

                logger.info('[App] Sincronizando estrutura base (schema.sql)...');
                const schemaPath = path.join(__dirname, 'db', 'schema.sql');
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                await db.query(schemaSql);

                await db.query(`
                    ALTER TABLE dash_usuarios
                    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL,
                    ADD COLUMN IF NOT EXISTS precisa_alterar_senha BOOLEAN NOT NULL DEFAULT false;
                `);

                // --- Migrações Automáticas ANTES da manutenção complementar ---
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
                                logger.warn(`[App] Aviso na migração ${file}:`, err.message);
                            }
                        }
                    }
                } catch (migErr) {
                    logger.warn('[App] Erro na aplicação de migrações automáticas:', migErr.message);
                }

                await db.runStartupMaintenance();

                // Bootstrap opcional e seguro de administrador inicial (sem sobrescrever credenciais existentes)
                const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
                const initialAdminPass = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();
                if (initialAdminEmail && initialAdminPass && initialAdminPass.length >= 8) {
                    const bcrypt = require('bcryptjs');
                    const salt = await bcrypt.genSalt(10);
                    const hash = await bcrypt.hash(initialAdminPass, salt);
                    await db.query(
                        `INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash, permissions)
                         VALUES ($1, $2, $3, $4, true, $5, NULL)
                         ON CONFLICT (tenant_id, email) DO NOTHING`,
                        ['00000000-0000-0000-0000-000000000000', initialAdminEmail, 'Admin Inicial', 'master', hash]
                    );
                }

                logger.info('[App] Banco de dados pronto para operação.');
                transporteWorker.start();
            } catch (dbErr) {
                logger.error('[App] Erro ao sincronizar as tabelas do banco:', dbErr);
            }
        }

        const shutdown = () => {
            logger.info('[App] Recebido sinal de parada. Fechando servidor...');
            transporteWorker.stop();

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
