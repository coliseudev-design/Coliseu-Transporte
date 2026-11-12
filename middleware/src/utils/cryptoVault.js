'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../config/logger');

const STR_PREFIX_V1 = 'enc:v1:';
const STR_PREFIX = 'enc:v2:';
const BUF_PREFIX_V1 = Buffer.from('ENC1', 'utf8');
const BUF_PREFIX = Buffer.from('ENC2', 'utf8');
const MASK_PLACEHOLDER = '********';

let runtimeVaultSecret = null;
let keyringInitPromise = null;

const SECRET_CONFIG_FIELDS = [
    'ai_api_key',
    'ai_openai_key',
    'ai_deepseek_key',
    'ai_gemini_key',
    'ai_manus_key',
    'whatsapp_token',
    'whatsapp_meta_token',
    'whatsapp_meta_app_secret',
    'clicksign_token',
    'asaas_access_token',
    'asaas_webhook_secret',
    'cora_private_key',
    'email_smtp_pass',
    'email_brevo_api_key',
    'email_sendgrid_api_key',
    'focus_token_homologacao',
    'focus_token_producao',
    'focus_webhook_secret'
];

function deriveAesKey(rawSecret) {
    return crypto.createHash('sha256').update(String(rawSecret), 'utf8').digest();
}

function getVaultKey() {
    const rawSecret = config.security.encryptionKey || runtimeVaultSecret || config.security.jwtDeviceKey;
    if (!rawSecret) {
        throw new Error('[CryptoVault] Nenhuma chave configurada no cofre criptográfico.');
    }
    return deriveAesKey(rawSecret);
}

function getCandidateDecryptionKeys() {
    const candidates = [
        config.security.encryptionKey,
        runtimeVaultSecret,
        config.security.jwtDeviceKey,
        config.security.legacyVaultFallbackKey
    ].filter((s) => typeof s === 'string' && s.trim().length > 0);

    const unique = Array.from(new Set(candidates));
    return unique.map(deriveAesKey);
}

/**
 * Inicializa (e persiste de forma idempotente no PostgreSQL) chaves fortes de 256 bits
 * para assinatura JWT e cofre AES-256-GCM quando variáveis de ambiente não estão definidas no host.
 * Mantém leitura híbrida transparente para segredos v1 já gravados em produção.
 */
async function initSystemKeyring(db) {
    if (keyringInitPromise) return keyringInitPromise;
    keyringInitPromise = (async () => {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS dash_system_keyring (
                    key_name VARCHAR(80) PRIMARY KEY,
                    key_value TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            `);

            const ensurePersistentKey = async (keyName) => {
                const generated = crypto.randomBytes(32).toString('hex');
                const { rows } = await db.query(
                    `INSERT INTO dash_system_keyring (key_name, key_value)
                     VALUES ($1, $2)
                     ON CONFLICT (key_name) DO UPDATE SET key_name = EXCLUDED.key_name
                     RETURNING key_value`,
                    [keyName, generated]
                );
                return rows[0]?.key_value || generated;
            };

            if (!config.security.jwtEnvConfigured) {
                const persistedJwtKey = await ensurePersistentKey('jwt_signing_key');
                config.security.jwtDeviceKey = persistedJwtKey;
                logger.info('[CryptoVault] JWT signing key carregada do keyring seguro persistido.');
            }

            if (!config.security.encryptionKey) {
                runtimeVaultSecret = await ensurePersistentKey('vault_master_key');
                logger.info('[CryptoVault] Vault AES-256-GCM master key (v2) carregada com suporte híbrido v1.');
            }
        } catch (err) {
            keyringInitPromise = null;
            logger.warn('[CryptoVault] Aviso ao inicializar dash_system_keyring:', { error: err.message });
        }
    })();
    return keyringInitPromise;
}

function isEncryptedSecret(value) {
    return (
        typeof value === 'string' &&
        (value.startsWith(STR_PREFIX) || value.startsWith(STR_PREFIX_V1))
    );
}

const BULLET_CHAR = '\u2022';
const BULLET_MASK = BULLET_CHAR.repeat(8);
const BULLET_ONLY_REGEX = new RegExp(`^${BULLET_CHAR}+$`);

function isMaskedValue(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed === MASK_PLACEHOLDER || trimmed === BULLET_MASK) return true;
    if (/^\*+$/.test(trimmed) || BULLET_ONLY_REGEX.test(trimmed)) return true;
    if (trimmed.includes(MASK_PLACEHOLDER) || trimmed.includes(BULLET_MASK)) return true;
    if (trimmed.length < 48 && trimmed.includes('...')) return true;
    return false;
}

function encryptSecret(value) {
    if (value === null || value === undefined) return null;
    const str = String(value);
    if (str.trim() === '') return '';
    if (str.startsWith(STR_PREFIX)) return str;

    const key = getVaultKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${STR_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(value) {
    if (value === null || value === undefined) return value;
    const str = String(value);
    const activePrefix = str.startsWith(STR_PREFIX)
        ? STR_PREFIX
        : str.startsWith(STR_PREFIX_V1)
        ? STR_PREFIX_V1
        : null;

    if (!activePrefix) {
        // Retrocompatível com valores legados salvos em texto plano antes da blindagem
        return str;
    }

    const payload = str.slice(activePrefix.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
        logger.warn('[CryptoVault] Formato inválido de segredo cifrado.');
        return '';
    }

    const [ivHex, tagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(cipherHex, 'hex');

    const candidateKeys = getCandidateDecryptionKeys();
    for (const key of candidateKeys) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return decrypted.toString('utf8');
        } catch (_) {
            // Tenta a próxima chave candidata do keyring híbrido (v2 -> v1 legado)
        }
    }

    logger.warn('[CryptoVault] Falha ao decifrar segredo em repouso em todas as chaves do keyring.');
    return '';
}

function encryptBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) return buf;
    if (buf.length > 32 && buf.subarray(0, 4).equals(BUF_PREFIX)) {
        return buf;
    }
    if (buf.length > 32 && buf.subarray(0, 4).equals(BUF_PREFIX_V1)) {
        const plain = decryptBuffer(buf);
        if (Buffer.isBuffer(plain) && plain.length > 0 && !plain.subarray(0, 4).equals(BUF_PREFIX_V1)) {
            buf = plain;
        }
    }

    const key = getVaultKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([BUF_PREFIX, iv, authTag, encrypted]);
}

function decryptBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) return buf;
    const isV2 = buf.length > 32 && buf.subarray(0, 4).equals(BUF_PREFIX);
    const isV1 = buf.length > 32 && buf.subarray(0, 4).equals(BUF_PREFIX_V1);
    if (!isV2 && !isV1) {
        // Retrocompatível com certificados PFX legados salvos sem envelope ENC1/ENC2
        return buf;
    }

    const iv = buf.subarray(4, 16);
    const authTag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);

    const candidateKeys = getCandidateDecryptionKeys();
    for (const key of candidateKeys) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(encrypted), decipher.final()]);
        } catch (_) {
            // Tenta próxima chave do keyring híbrido
        }
    }

    throw new Error('[CryptoVault] Não foi possível decifrar o certificado digital no keyring.');
}

function maskSecret(value) {
    if (value === null || value === undefined) return value;
    const plain = decryptSecret(value);
    if (!plain || String(plain).trim() === '') return '';
    return MASK_PLACEHOLDER;
}

function resolveSecretForSave(incomingValue, existingStoredValue) {
    if (
        incomingValue === undefined ||
        incomingValue === null ||
        String(incomingValue).trim() === '' ||
        isMaskedValue(incomingValue)
    ) {
        if (!existingStoredValue || String(existingStoredValue).trim() === '') {
            return null;
        }
        const plainExisting = decryptSecret(existingStoredValue);
        return plainExisting ? encryptSecret(plainExisting) : null;
    }

    return encryptSecret(String(incomingValue).trim());
}

function decryptIntegracoesRow(row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const field of SECRET_CONFIG_FIELDS) {
        if (field in out && out[field] !== null && out[field] !== undefined) {
            out[field] = decryptSecret(out[field]);
        }
    }
    if ('cora_token_cache' in out && out.cora_token_cache) {
        out.cora_token_cache = decryptSecret(out.cora_token_cache);
    }
    return out;
}

function maskIntegracoesRow(row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const field of SECRET_CONFIG_FIELDS) {
        if (field in out && out[field] !== null && out[field] !== undefined) {
            out[field] = maskSecret(out[field]);
        }
    }
    delete out.cora_token_cache;
    delete out.cora_token_expires_at;
    return out;
}

module.exports = {
    STR_PREFIX,
    STR_PREFIX_V1,
    BUF_PREFIX,
    BUF_PREFIX_V1,
    MASK_PLACEHOLDER,
    SECRET_CONFIG_FIELDS,
    initSystemKeyring,
    isEncryptedSecret,
    isMaskedValue,
    encryptSecret,
    decryptSecret,
    encryptBuffer,
    decryptBuffer,
    maskSecret,
    resolveSecretForSave,
    decryptIntegracoesRow,
    maskIntegracoesRow
};
