'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const db = require('../db/postgres');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MASTER_TENANT_ID = '00000000-0000-0000-0000-000000000000';

function isValidUuid(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
    const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
    const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

// Cache curto (60s) para validar status ativo e papel atual do usuário sem sobrecarregar o banco
const userAuthCache = new Map();
const USER_CACHE_TTL_MS = 60 * 1000;

function invalidateUserAuthCache(userId) {
    if (userId === undefined || userId === null) {
        userAuthCache.clear();
        return;
    }
    userAuthCache.delete(String(userId));
}

async function resolveLocalUser(userId) {
    const key = String(userId);
    const cached = userAuthCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.user;
    }

    const res = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.nome, u.role, u.ativo, u.grupo_id,
                g.nome AS grupo_nome
         FROM dash_usuarios u
         LEFT JOIN dash_grupos_acesso g ON g.id = u.grupo_id AND g.tenant_id = u.tenant_id
         WHERE u.id = $1
         LIMIT 1`,
        [parseInt(key, 10)]
    );

    const user = res.rowCount > 0 ? res.rows[0] : null;
    userAuthCache.set(key, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    return user;
}

/**
 * Middleware para validar JWT das rotas Web protegidas.
 */
async function requireWebJwt(req, res, next) {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    }

    if (!token) {
        logger.warn('[Auth] Requisição sem token JWT no header Authorization', { ip: req.ip, path: req.path });
        return res.status(401).json({ error: 'Não autorizado', code: 'MISSING_JWT' });
    }

    try {
        const secret = config.security.jwtDeviceKey;
        const decoded = jwt.verify(token, secret);

        const rawTenantId = decoded.tenantId || decoded.tenant || decoded.companyId;
        const tenantId = typeof rawTenantId === 'string' ? rawTenantId.trim() : '';
        const moduleSlug = decoded.module;

        if (!isValidUuid(tenantId)) {
            logger.warn('[Auth] JWT inválido: tenant ausente ou malformado', { ip: req.ip, path: req.path });
            return res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN_CLAIMS' });
        }

        const allowedModules = [
            config.security.expectedModuleSlug,
            'coliseu-transporte',
            'transporte',
            'coliseu-dash',
            'dashboard',
            'nexus',
            'nexus-erp',
            'erp'
        ].filter(Boolean).map(m => m.toLowerCase());

        if (moduleSlug && typeof moduleSlug === 'string' && !allowedModules.includes(moduleSlug.toLowerCase())) {
            logger.warn('[Auth] Módulo não autorizado no token', {
                ip: req.ip,
                path: req.path,
                tokenModule: moduleSlug
            });
            return res.status(403).json({ error: 'Token emitido para outro módulo.', code: 'INVALID_MODULE' });
        }

        const rawUserId = decoded.userId ?? decoded.sub;
        const isNumericLocalUser = rawUserId !== undefined && rawUserId !== null && /^\d+$/.test(String(rawUserId));

        if (isNumericLocalUser) {
            const dbUser = await resolveLocalUser(rawUserId);
            if (!dbUser) {
                return res.status(401).json({ error: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });
            }
            if (!dbUser.ativo) {
                return res.status(403).json({ error: 'Usuário inativo.', code: 'USER_INACTIVE' });
            }

            req.tenant = {
                id: dbUser.tenant_id,
                name: decoded.companyName || (dbUser.tenant_id === MASTER_TENANT_ID ? 'Coliseu Sistemas (Master)' : 'Empresa Cliente')
            };
            req.user = {
                id: dbUser.id,
                sub: dbUser.id,
                email: dbUser.email,
                nome: dbUser.nome,
                role: dbUser.role || 'viewer',
                grupo_id: dbUser.grupo_id,
                grupo_nome: dbUser.grupo_nome || null
            };
        } else {
            // Compatibilidade com tokens externos emitidos pelo servidor de licenças (Device/OAuth)
            req.tenant = { id: tenantId, name: decoded.companyName || 'Unknown' };
            req.user = {
                id: rawUserId || 'external',
                sub: rawUserId || 'external',
                email: decoded.email || null,
                role: decoded.role || 'viewer',
                grupo_id: decoded.grupoId || null,
                grupo_nome: null
            };
            if (decoded.deviceId) {
                req.device = { id: decoded.deviceId };
            }
        }

        return next();
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
 * Middleware de controle de acesso administrativo (RBAC).
 * Permite apenas usuários Master, role 'admin'/'master' ou integrantes do grupo 'Master'.
 */
function requireAdmin(req, res, next) {
    const role = String(req.user?.role || '').toLowerCase();
    const grupoNome = String(req.user?.grupo_nome || '').toLowerCase();
    const isMasterTenant = req.tenant?.id === MASTER_TENANT_ID;

    if (isMasterTenant || role === 'master' || role === 'admin' || grupoNome === 'master') {
        return next();
    }

    logger.warn('[RBAC] Tentativa de acesso administrativo bloqueada', {
        userId: req.user?.id,
        email: req.user?.email,
        role,
        path: req.originalUrl
    });
    return res.status(403).json({
        error: 'Permissão insuficiente. Esta ação requer perfil Administrador.',
        code: 'FORBIDDEN_ADMIN_ONLY'
    });
}

// Cache em memória (TenantId:HashKey -> { valid: boolean, expiresAt: number })
const validationCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Middleware para autenticar rotas internas usadas pelo Worker (.NET / Firebird).
 */
async function requireInternalAuth(req, res, next) {
    const internalKey = typeof req.headers['x-internal-key'] === 'string' ? req.headers['x-internal-key'].trim() : '';
    const rawTenantId = req.headers['x-tenant-id'];
    const tenantId = typeof rawTenantId === 'string' ? rawTenantId.trim() : '';

    if (!tenantId) {
        logger.warn('[InternalAuth] Header X-Tenant-Id ausente', { ip: req.ip, path: req.path });
        return res.status(400).json({ error: 'X-Tenant-Id é obrigatório para rotas internas.', code: 'MISSING_TENANT' });
    }

    if (!isValidUuid(tenantId) || tenantId === MASTER_TENANT_ID) {
        logger.warn('[InternalAuth] X-Tenant-Id inválido ou reservado', { ip: req.ip, path: req.path, tenantId });
        return res.status(400).json({ error: 'X-Tenant-Id deve ser um UUID válido de empresa.', code: 'INVALID_TENANT_UUID' });
    }

    if (!internalKey) {
        logger.warn('[InternalAuth] Chave interna ausente', { ip: req.ip, path: req.path });
        return res.status(401).json({ error: 'Não autorizado', code: 'INVALID_INTERNAL_KEY' });
    }

    const { identityApiUrl, identityInternalKey, expectedModuleSlug, internalApiKey } = config.security;

    if (!identityApiUrl || !identityInternalKey) {
        if (!safeCompare(internalKey, internalApiKey)) {
            logger.warn('[InternalAuth] Fallback estático falhou', { ip: req.ip, tenantId });
            return res.status(401).json({ error: 'Não autorizado', code: 'INVALID_INTERNAL_KEY' });
        }
        req.tenant = { id: tenantId };
        req.device = { id: 'worker' };
        return next();
    }

    const keyFingerprint = crypto.createHash('sha256').update(internalKey, 'utf8').digest('hex').slice(0, 16);
    const cacheKey = `${tenantId}:${keyFingerprint}`;
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

    const candidateSlugs = Array.from(
        new Set([expectedModuleSlug, 'coliseu-transporte', 'transporte'].filter(Boolean))
    );

    try {
        let lastForbiddenReason = null;
        let lastUnexpectedStatus = null;

        for (const slug of candidateSlugs) {
            const response = await fetch(
                `${identityApiUrl}/internal/companies/${encodeURIComponent(tenantId)}/modules/${encodeURIComponent(slug)}/validate-key`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Internal-Api-Key': identityInternalKey
                    },
                    body: JSON.stringify({ apiKey: internalKey }),
                    signal: AbortSignal.timeout(3000)
                }
            );

            if (response.status === 200) {
                const data = await response.json().catch(() => ({}));
                if (data.valid) {
                    validationCache.set(cacheKey, { valid: true, slug, expiresAt: Date.now() + CACHE_TTL_MS });
                    req.tenant = { id: tenantId };
                    req.device = { id: 'worker', moduleSlug: slug };
                    return next();
                }
                lastForbiddenReason = data.reason || data.Reason || data.error || 'Chave de módulo inválida.';
                continue;
            }

            if (response.status === 403 || response.status === 404) {
                const data = await response.json().catch(() => ({}));
                lastForbiddenReason =
                    data.reason ||
                    data.Reason ||
                    data.error ||
                    data.Error ||
                    (response.status === 404
                        ? `Módulo ${slug} não registrado para o tenant.`
                        : 'Módulo bloqueado (HTTP 403).');
                logger.warn(`[InternalAuth] Identity retornou ${response.status} em slug=${slug} para tenant ${tenantId}:`, data);
                continue;
            }

            lastUnexpectedStatus = response.status;
        }

        if (safeCompare(internalKey, internalApiKey)) {
            logger.info(`[InternalAuth] Fallback static key OK — permitindo sync para tenant ${tenantId}`);
            validationCache.set(cacheKey, { valid: true, expiresAt: Date.now() + CACHE_TTL_MS });
            req.tenant = { id: tenantId };
            req.device = { id: 'worker' };
            return next();
        }

        if (lastForbiddenReason) {
            validationCache.set(cacheKey, {
                valid: false,
                reason: lastForbiddenReason,
                expiresAt: Date.now() + CACHE_TTL_MS
            });
            return res.status(403).json({ error: lastForbiddenReason, code: 'MODULE_BLOCKED' });
        }

        throw new Error(`Identity API retornou status ${lastUnexpectedStatus || 'desconhecido'}`);
    } catch (err) {
        logger.error('[InternalAuth] Erro ao validar no Identity API. Usando fallback.', { err: err.message, tenantId });

        if (safeCompare(internalKey, internalApiKey)) {
            req.tenant = { id: tenantId };
            req.device = { id: 'worker' };
            return next();
        }

        return res.status(401).json({ error: 'Falha na comunicação com controle de licenças', code: 'IDENTITY_API_ERROR' });
    }
}

/**
 * Autenticação híbrida compatível para /api/sync/*:
 * Aceita JWT Web/Device válido no header Authorization OU X-Internal-Key + X-Tenant-Id do Worker ERP.
 */
async function requireSyncOrWebAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return requireWebJwt(req, res, next);
    }

    if (req.headers['x-internal-key']) {
        if (!req.headers['x-tenant-id']) {
            const fallbackTenant = req.query?.tenant_id || req.body?.tenant_id;
            if (typeof fallbackTenant === 'string' && fallbackTenant.trim()) {
                req.headers['x-tenant-id'] = fallbackTenant.trim();
            }
        }
        return requireInternalAuth(req, res, next);
    }

    logger.warn('[SyncAuth] Requisição bloqueada sem credenciais em /api/sync', {
        ip: req.ip,
        path: req.originalUrl
    });
    return res.status(401).json({
        error: 'Autenticação obrigatória para sincronização.',
        code: 'UNAUTHORIZED_SYNC'
    });
}

/**
 * Verifica se o usuário autenticado possui privilégio Super Admin / Master da Software House.
 */
function isSuperAdminMaster(req) {
    const role = String(req.user?.role || '').toLowerCase();
    const email = String(req.user?.email || '').toLowerCase();
    const isMasterTenant = req.tenant?.id === MASTER_TENANT_ID;

    if (isMasterTenant || role === 'master') {
        return true;
    }
    if (role === 'admin' && (email.endsWith('@coliseusistemas.com.br') || email.endsWith('@silenus.com.br'))) {
        return true;
    }
    return false;
}

/**
 * Middleware exclusivo para configurações globais da Software House (ex: Token Principal Focus NFe).
 */
function requireSuperAdminMaster(req, res, next) {
    if (isSuperAdminMaster(req)) {
        return next();
    }
    logger.warn('[RBAC] Tentativa de acesso Super Admin Master bloqueada', {
        userId: req.user?.id,
        email: req.user?.email,
        tenantId: req.tenant?.id,
        role: req.user?.role,
        path: req.originalUrl
    });
    return res.status(403).json({
        error: 'Acesso restrito ao administrador Master da plataforma (Coliseu Sistemas).',
        code: 'FORBIDDEN_MASTER_ONLY'
    });
}

function clearInternalValidationCache() {
    validationCache.clear();
}

module.exports = {
    MASTER_TENANT_ID,
    requireWebJwt,
    requireAdmin,
    requireSuperAdminMaster,
    isSuperAdminMaster,
    requireInternalAuth,
    requireSyncOrWebAuth,
    invalidateUserAuthCache,
    clearInternalValidationCache,
    safeCompare,
    isValidUuid
};
