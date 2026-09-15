'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('./postgres');
const logger = require('../config/logger');

async function runInit() {
    logger.info('[Init DB] Iniciando setup do banco de dados...');
    const client = await pool.connect();
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const viewsPath = path.join(__dirname, 'views.sql');

        if (fs.existsSync(schemaPath)) {
            logger.info('[Init DB] Executando schema.sql...');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await client.query(schemaSql);
            logger.info('[Init DB] schema.sql executado com sucesso.');
        } else {
            logger.warn('[Init DB] schema.sql não encontrado!');
        }

        if (fs.existsSync(viewsPath)) {
            logger.info('[Init DB] Executando views.sql...');
            const viewsSql = fs.readFileSync(viewsPath, 'utf8');
            await client.query(viewsSql);
            logger.info('[Init DB] views.sql executado com sucesso.');
        } else {
            logger.warn('[Init DB] views.sql não encontrado!');
        }

        logger.info('[Init DB] Banco de dados inicializado com sucesso.');
    } catch (err) {
        logger.error('[Init DB] Erro fatal na inicialização', err);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

runInit();
