'use strict';

/**
 * Middleware de Rate Limiting para Proteção de Endpoints Sensíveis (Asaas, Sync, Meta)
 */
const requestCounts = new Map();

function apiRateLimiter({ windowMs = 60000, maxRequests = 120, message = 'Muitas requisições efetuadas. Por favor, aguarde alguns segundos.' } = {}) {
    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
        const key = `${ip}:${req.baseUrl}${req.path}`;
        const now = Date.now();

        if (!requestCounts.has(key)) {
            requestCounts.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }

        const record = requestCounts.get(key);
        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
            return next();
        }

        record.count += 1;
        if (record.count > maxRequests) {
            return res.status(429).json({
                error: message,
                retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000)
            });
        }

        return next();
    };
}

module.exports = { apiRateLimiter };
