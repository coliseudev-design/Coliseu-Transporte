'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');

// 1x1 transparent GIF buffer (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

/**
 * Ensure tracking tables exist in PostgreSQL
 */
async function ensureTrackingTables() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_email_sends (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID,
                campanha_id INTEGER,
                destinatario_nome VARCHAR(255),
                destinatario_email VARCHAR(255) NOT NULL,
                destinatario_documento VARCHAR(50),
                assunto TEXT,
                status VARCHAR(50) DEFAULT 'Enviado',
                enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                aberto BOOLEAN DEFAULT FALSE,
                primeira_abertura TIMESTAMP WITH TIME ZONE,
                ultima_abertura TIMESTAMP WITH TIME ZONE,
                total_aberturas INTEGER DEFAULT 0,
                total_cliques INTEGER DEFAULT 0,
                metadata JSONB
            );

            CREATE TABLE IF NOT EXISTS dash_email_events (
                id SERIAL PRIMARY KEY,
                tenant_id UUID,
                email_id UUID REFERENCES dash_email_sends(id) ON DELETE CASCADE,
                campanha_id INTEGER,
                type VARCHAR(20) NOT NULL,
                url TEXT,
                ip VARCHAR(100),
                user_agent TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_email_sends_campanha ON dash_email_sends(campanha_id);
            CREATE INDEX IF NOT EXISTS idx_email_sends_email ON dash_email_sends(destinatario_email);
            CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON dash_email_events(email_id);
        `);
    } catch (err) {
        logger.error('[Tracking DB] Error ensuring tracking tables:', err.message);
    }
}

// Ensure tables on module load
ensureTrackingTables();

/**
 * GET /track/open/:email_id
 * Or GET /api/track/open/:email_id
 * Returns a 1x1 transparent GIF and records an open event.
 */
router.get('/open/:email_id', async (req, res) => {
    // Send 1x1 GIF headers immediately for ultra-fast response
    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    res.status(200).end(TRANSPARENT_GIF);

    // Asynchronously record event (fail-silent)
    try {
        const { email_id } = req.params;
        if (!email_id || email_id.length < 10) return;

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const userAgent = req.headers['user-agent'] || '';

        // 1. Update dash_email_sends
        const updRes = await db.query(
            `UPDATE dash_email_sends
             SET aberto = TRUE,
                 total_aberturas = COALESCE(total_aberturas, 0) + 1,
                 primeira_abertura = COALESCE(primeira_abertura, NOW()),
                 ultima_abertura = NOW()
             WHERE id = $1::uuid
             RETURNING tenant_id, campanha_id`,
            [email_id]
        );

        const tenantId = updRes.rows[0]?.tenant_id || null;
        const campanhaId = updRes.rows[0]?.campanha_id || null;

        // 2. Insert into dash_email_events
        await db.query(
            `INSERT INTO dash_email_events (tenant_id, email_id, campanha_id, type, ip, user_agent, created_at)
             VALUES ($1, $2::uuid, $3, 'open', $4, $5, NOW())`,
            [tenantId, email_id, campanhaId, String(ip).slice(0, 100), String(userAgent).slice(0, 500)]
        );
    } catch (err) {
        logger.warn('[Tracking Open] Warning processing open event:', err.message);
    }
});

/**
 * GET /track/click/:email_id?url=...
 * Or GET /api/track/click/:email_id?url=...
 * Records click event and redirects to destination URL.
 */
router.get('/click/:email_id', async (req, res) => {
    const { email_id } = req.params;
    const targetUrl = req.query.url;

    // Default safe fallback if url is missing
    const destination = targetUrl ? String(targetUrl) : 'https://coliseusistemas.com.br';

    // Asynchronously record click (fail-silent)
    try {
        if (email_id && email_id.length >= 10) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            const userAgent = req.headers['user-agent'] || '';

            // 1. Update dash_email_sends
            const updRes = await db.query(
                `UPDATE dash_email_sends
                 SET total_cliques = COALESCE(total_cliques, 0) + 1,
                     aberto = TRUE,
                     primeira_abertura = COALESCE(primeira_abertura, NOW()),
                     ultima_abertura = NOW()
                 WHERE id = $1::uuid
                 RETURNING tenant_id, campanha_id`,
                [email_id]
            );

            const tenantId = updRes.rows[0]?.tenant_id || null;
            const campanhaId = updRes.rows[0]?.campanha_id || null;

            // 2. Insert into dash_email_events
            await db.query(
                `INSERT INTO dash_email_events (tenant_id, email_id, campanha_id, type, url, ip, user_agent, created_at)
                 VALUES ($1, $2::uuid, $3, 'click', $4, $5, $6, NOW())`,
                [tenantId, email_id, campanhaId, destination, String(ip).slice(0, 100), String(userAgent).slice(0, 500)]
            );
        }
    } catch (err) {
        logger.warn('[Tracking Click] Warning processing click event:', err.message);
    }

    // Always redirect user to destination immediately
    return res.redirect(302, destination);
});

module.exports = {
    router,
    ensureTrackingTables
};
