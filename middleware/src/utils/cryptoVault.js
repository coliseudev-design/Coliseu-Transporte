'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../config/logger');

const STR_PREFIX = 'enc:v1:';
const BUF_PREFIX = Buffer.from('ENC1', 'utf8');
const MASK_PLACEHOLDER = '********';

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

function getVaultKey() {
    const rawSecret = config.security.encryptionKey || config.security.jwtDeviceKey;
    if (!rawSecret) {
        throw new Error('[CryptoVault] Nenhuma chave configurada em ENCRYPTION_KEY ou JWT_DEVICE_KEY.');
    }
    return crypto.createHash('sha256').update(String(rawSecret), 'utf8').digest();
}

function isEncryptedSecret(value) {
    return typeof value === 'string' && value.startsWith(STR_PREFIX);
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
    if (!str.startsWith(STR_PREFIX)) {
        // Retrocompatível com valores legados salvos em texto plano antes da blindagem
        return str;
    }

    try {
        const payload = str.slice(STR_PREFIX.length);
        const parts = payload.split(':');
        if (parts.length !== 3) {
            logger.warn('[CryptoVault] Formato inválido de segredo cifrado.');
            return '';
        }

        const [ivHex, tagHex, cipherHex] = parts;
        const key = getVaultKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(tagHex, 'hex');
        const encrypted = Buffer.from(cipherHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (err) {
        logger.warn('[CryptoVault] Falha ao decifrar segredo em repouso:', { error: err.message });
        return '';
    }
}

function encryptBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) return buf;
    if (buf.length > 32 && buf.subarray(0, 4).equals(BUF_PREFIX)) {
        return buf;
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
    if (buf.length <= 32 || !buf.subarray(0, 4).equals(BUF_PREFIX)) {
        // Retrocompatível com certificados PFX legados salvos sem envelope ENC1
        return buf;
    }

    const key = getVaultKey();
    const iv = buf.subarray(4, 16);
    const authTag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
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
    BUF_PREFIX,
    MASK_PLACEHOLDER,
    SECRET_CONFIG_FIELDS,
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
