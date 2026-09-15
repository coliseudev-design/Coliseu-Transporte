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

module.exports = {
    defaultLimit
};
