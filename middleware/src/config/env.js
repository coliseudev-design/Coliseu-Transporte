'use strict';

require('dotenv').config();

function required(key) {
    const val = process.env[key];
    if (!val) throw new Error(`[Config] Variável de ambiente obrigatória ausente: ${key}`);
    return val;
}

function optional(key, defaultValue = '') {
    return process.env[key] ?? defaultValue;
}

const config = {
    server: {
        port: parseInt(optional('PORT', '3200'), 10),
        nodeEnv: optional('NODE_ENV', 'development'),
        isProduction: optional('NODE_ENV', 'development') === 'production',
    },

    security: {
        jwtDeviceKey: required('JWT_DEVICE_KEY'),
        expectedModuleSlug: optional('EXPECTED_MODULE_SLUG', 'coliseu-transporte'),
        internalApiKey: optional('INTERNAL_API_KEY', ''),  // Chave de fallback ou depreciada
        identityApiUrl: optional('IDENTITY_API_URL', 'https://adminlicencas.coliseusistemas.com.br'),
        identityInternalKey: optional('IDENTITY_INTERNAL_KEY', ''),
        allowedOrigins: optional('ALLOWED_ORIGINS', '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        rateLimitWindowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
        rateLimitMax: parseInt(optional('RATE_LIMIT_MAX', '200'), 10),
    },

    postgres: {
        host: optional('PG_HOST', 'localhost'),
        port: parseInt(optional('PG_PORT', '5432'), 10),
        database: optional('PG_DATABASE', 'coliseu_dashboard'),
        user: optional('PG_USER', 'postgres'),
        password: optional('PG_PASSWORD', ''),
        ssl: optional('PG_SSL', 'false') === 'true',
    },
};

module.exports = config;
