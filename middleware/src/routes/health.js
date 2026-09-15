'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');

/**
 * Health check para Load Balancers e Docker Healtcheck.
 * Não requer autenticação.
 */
router.get('/liveness', async (req, res) => {
    // Apenas verifica se o node/express está responsivo
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Readiness check (inclui verificação do banco).
 */
router.get('/readiness', async (req, res) => {
    const isDbAlive = await db.checkConnection();
    
    if (isDbAlive) {
        res.status(200).json({ status: 'ready', database: 'connected' });
    } else {
        res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
});

module.exports = router;
