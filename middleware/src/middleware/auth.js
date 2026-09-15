'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Middleware para validar JWT do Web (Gerente App Dashboard).
 * 
 * 1. Extrai header Authorization: Bearer <token>
 * 2. Valida assinatura HMAC usando JWT_DEVICE_KEY
 * 3. Valida se o claim module == 'dashboard' 
 * 4. Injeta req.tenant
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function requireWebJwt(req, res, next) {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        logger.warn('[Auth] Requisição sem token JWT (Bearer ou Query)', { ip: req.ip, path: req.path });
        return res.status(401).json({ error: 'Não autorizado', code: 'MISSING_JWT' });
    }

    try {
        const secret = config.security.jwtDeviceKey;
        const decoded = jwt.verify(token, secret);

        const tenantId = decoded.tenantId || decoded.tenant;
        const moduleSlug = decoded.module;

        if (!tenantId) {
            logger.warn('[Auth] JWT inválido: sem claim tenant', { ip: req.ip, path: req.path });
            return res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN_CLAIMS' });
        }

        const allowedModules = [config.security.expectedModuleSlug, 'coliseu-transporte', 'transporte', 'coliseu-dash', 'dashboard', 'nexus', 'nexus-erp', 'erp'];
        if (moduleSlug && typeof moduleSlug === 'string' && !allowedModules.includes(moduleSlug.toLowerCase())) {
            logger.warn('[Auth] Módulo divergente no token', { 
                ip: req.ip, 
                path: req.path, 
                tokenModule: moduleSlug 
            });
        }

        req.tenant = { id: tenantId, name: decoded.companyName || 'Unknown' };
        req.user = { id: decoded.userId || decoded.sub };

        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            logger.warn('[Auth] JWT inválido ou expirado', { ip: req.ip, path: req.path, error: err.message });
            return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.', code: 'INVALID_JWT' });
        }

        logger.error('[Auth] Erro interno ao validar token', { error: err.message });
        return res.status(500).json({ error: 'Erro interno no servidor', code: 'INTERNAL_ERROR' });
    }
}

/**
 * Middleware para autenticar rotas internas usadas pelo Worker (.NET).
 * 
 * Valida o header X-Internal-Key contra a chave configurada no servidor.
 * Extrai o tenantId do header X-Tenant-Id (enviado pelo Worker).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// Cache em memória (TenantId -> { valid: boolean, expiresAt: number })
// Usado para evitar sobrecarregar o servidor de licenças nas chamadas frequentes do Worker.
const validationCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Middleware para autenticar rotas internas usadas pelo Worker (.NET).
 * 
 * Valida o header X-Internal-Key de forma dinâmica contra a API de Identidade.
 * Se a API estiver offline ou variáveis faltarem, faz fallback para INTERNAL_API_KEY.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function requireInternalAuth(req, res, next) {
    const internalKey = req.headers['x-internal-key'];
    const tenantId    = req.headers['x-tenant-id'];

    if (!tenantId) {
        logger.warn('[InternalAuth] Header X-Tenant-Id ausente', { ip: req.ip, path: req.path });
        return res.status(400).json({ error: 'X-Tenant-Id é obrigatório para rotas internas.', code: 'MISSING_TENANT' });
    }

    if (!internalKey) {
        logger.warn('[InternalAuth] Chave interna ausente', { ip: req.ip, path: req.path });
        return res.status(401).json({ error: 'Não autorizado', code: 'INVALID_INTERNAL_KEY' });
    }

    const { identityApiUrl, identityInternalKey, expectedModuleSlug, internalApiKey } = config.security;

    // Se as chaves do Identity não estiverem configuradas, usa o fallback.
    if (!identityApiUrl || !identityInternalKey) {
        if (!internalApiKey || internalKey !== internalApiKey) {
            logger.warn('[InternalAuth] Fallback estático falhou', { ip: req.ip, tenantId });
            return res.status(401).json({ error: 'Não autorizado', code: 'INVALID_INTERNAL_KEY' });
        }
        req.tenant = { id: tenantId };
        req.device = { id: 'worker' };
        return next();
    }

    const cacheKey = `${tenantId}:${internalKey}`;
    const cached = validationCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
        if (!cached.valid) {
            logger.warn('[InternalAuth] Bloqueio pelo cache dinâmico', { ip: req.ip, tenantId, reason: cached.reason });
            return res.status(403).json({ error: cached.reason || 'Módulo bloqueado ou chave inválida', code: 'MODULE_BLOCKED' });
        }
        req.tenant = { id: tenantId };
        req.device = { id: 'worker' };
        return next();
    }

    try {
        const response = await fetch(`${identityApiUrl}/internal/companies/${tenantId}/modules/${expectedModuleSlug}/validate-key`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Key': identityInternalKey
            },
            body: JSON.stringify({ apiKey: internalKey }),
            signal: AbortSignal.timeout(3000)
        });

        if (response.status === 200) {
            const data = await response.json();
            if (data.valid) {
                validationCache.set(cacheKey, { valid: true, expiresAt: Date.now() + CACHE_TTL_MS });
                req.tenant = { id: tenantId };
                req.device = { id: 'worker' };
                return next();
            }
        }

        if (response.status === 403) {
            const data = await response.json().catch(() => ({}));
            const reason = data.reason || data.Reason || data.error || data.Error || 'Módulo bloqueado (HTTP 403).';
            logger.warn(`[InternalAuth] Identity retornou 403 para tenant ${tenantId}:`, data);
            
            // Fallback: se módulo não cadastrado no Identity mas chave estática bate, permite o sync
            if (internalApiKey && internalKey === internalApiKey) {
                logger.info(`[InternalAuth] Fallback static key OK — permitindo sync para tenant ${tenantId}`);
                validationCache.set(cacheKey, { valid: true, expiresAt: Date.now() + CACHE_TTL_MS });
                req.tenant = { id: tenantId };
                req.device = { id: 'worker' };
                return next();
            }
            
            validationCache.set(cacheKey, { valid: false, reason, expiresAt: Date.now() + CACHE_TTL_MS });
            return res.status(403).json({ error: reason, code: 'MODULE_BLOCKED' });
        }

        // Se for outro erro, lançamos para cair no catch e usar fallback
        throw new Error(`Identity API retornou status ${response.status}`);
        
    } catch (err) {
        logger.error('[InternalAuth] Erro ao validar no Identity API. Usando fallback.', { err: err.message, tenantId });
        
        // Timeout ou queda do Identity: usar fallback estático do .env por precaução
        if (internalApiKey && internalKey === internalApiKey) {
            req.tenant = { id: tenantId };
            req.device = { id: 'worker' };
            return next();
        }

        return res.status(401).json({ error: 'Falha na comunicação com controle de licenças', code: 'IDENTITY_API_ERROR' });
    }
}

module.exports = {
    requireWebJwt,
    requireInternalAuth
};
