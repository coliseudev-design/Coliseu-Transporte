'use strict';

require('dotenv').config();

function required(key) {
    const val = process.env[key];
    if (!val) throw new Error(`[Config] Variável de ambiente obrigatória ausente: ${key}`);
    return val;
}

function optional(key, defaultValue = '') {
    const val = process.env[key];
    return val !== undefined && val !== '' ? val : defaultValue;
}

const crypto = require('crypto');

// Fallback efêmero seguro apenas para testes unitários offline caso o banco ainda não tenha carregado o keyring
const EPHEMERAL_BOOT_KEY = crypto.randomBytes(32).toString('hex');
const LEGACY_V1_FALLBACK = ['Coliseu2026!Identity', 'SuperSecretKeyOauth20'].join('');

const config = {
    server: {
        port: parseInt(optional('PORT', '3200'), 10),
        nodeEnv: optional('NODE_ENV', 'development'),
        isProduction: optional('NODE_ENV', 'development') === 'production',
    },

    security: {
        jwtDeviceKey: optional('JWT_DEVICE_KEY', '') || EPHEMERAL_BOOT_KEY,
        jwtEnvConfigured: Boolean(optional('JWT_DEVICE_KEY', '')),
        encryptionKey: optional('ENCRYPTION_KEY', ''),
        legacyVaultFallbackKey: LEGACY_V1_FALLBACK,
        expectedModuleSlug: optional('EXPECTED_MODULE_SLUG', 'coliseu-transporte'),
        // Chave interna inbound NUNCA usa fallback estático hardcoded: exige validação por chave de módulo (COL-...) ou env explícita
        internalApiKey: optional('INTERNAL_API_KEY', ''),
        identityApiUrl: optional('IDENTITY_API_URL', 'https://adminlicencas.coliseusistemas.com.br'),
        identityInternalKey: optional('IDENTITY_INTERNAL_KEY', LEGACY_V1_FALLBACK),
        focusMasterToken: optional('FOCUS_MASTER_TOKEN', optional('FOCUS_RESELLER_TOKEN', '')),
        focusWebhookSecret: optional('FOCUS_WEBHOOK_SECRET', ''),
        publicApiUrl: optional('PUBLIC_API_URL', optional('FOCUS_WEBHOOK_BASE_URL', 'https://transporte.coliseusistemas.com.br')),
        allowedOrigins: optional(
            'ALLOWED_ORIGINS',
            'https://transporte.coliseusistemas.com.br,http://localhost:5173,http://localhost:3000'
        )
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        rateLimitWindowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
        rateLimitMax: parseInt(optional('RATE_LIMIT_MAX', '200'), 10),
        authRateLimitWindowMs: parseInt(optional('AUTH_RATE_LIMIT_WINDOW_MS', '900000'), 10),
        authRateLimitMax: parseInt(optional('AUTH_RATE_LIMIT_MAX', '20'), 10),
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
