'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const defaultLimit = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em instantes.', code: 'RATE_LIMITED' },
    keyGenerator: (req) => {
        // Limita por tenant (ou por IP se não autenticado)
        return req.tenant?.id || req.ip;
    }
});

const authLimit = rateLimit({
    windowMs: config.security.authRateLimitWindowMs || 15 * 60 * 1000,
    max: config.security.authRateLimitMax || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de autenticação. Aguarde alguns minutos e tente novamente.', code: 'AUTH_RATE_LIMITED' },
    keyGenerator: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return `${req.ip}:${email}`;
    }
});

module.exports = {
    defaultLimit,
    authLimit
};
