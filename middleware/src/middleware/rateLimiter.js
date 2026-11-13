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
        return req.tenant?.id || req.ip;
    }
});

// Limite global por IP contra password spraying / enumeração de múltiplas contas
const authIpLimit = rateLimit({
    windowMs: config.security.authRateLimitWindowMs || 15 * 60 * 1000,
    max: Number(process.env.AUTH_IP_RATE_LIMIT_MAX || 45),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas originadas deste endereço IP. Aguarde alguns minutos.', code: 'AUTH_IP_RATE_LIMITED' }
});

// Limite estrito por par IP + conta contra força bruta direcionada
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
    authIpLimit,
    authLimit
};
