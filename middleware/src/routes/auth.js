'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/postgres');
const config = require('../config/env');
const logger = require('../config/logger');
const { MASTER_TENANT_ID, invalidateUserAuthCache } = require('../middleware/auth');

/**
 * Valida a chave do módulo (COL-...) e obtém o limite real de dispositivos/usuários
 * diretamente no Painel de Licenças (fail-closed: nunca aprova chave inválida ou offline).
 */
async function validarLicencaCadastroEmpresa(companyKey, moduleKey) {
    const { identityApiUrl, identityInternalKey, expectedModuleSlug } = config.security;
    if (!identityApiUrl || !identityInternalKey) {
        const err = new Error('Servidor de licenças não configurado.');
        err.statusCode = 503;
        err.code = 'LICENSE_SERVER_UNAVAILABLE';
        throw err;
    }

    const baseUrl = identityApiUrl.replace(/\/+$/, '');
    const candidateSlugs = Array.from(
        new Set([expectedModuleSlug, 'coliseu-transporte', 'transporte'].filter(Boolean))
    );

    let validatedSlug = null;
    let lastReason = null;

    for (const slug of candidateSlugs) {
        const resKey = await fetch(
            `${baseUrl}/internal/companies/${encodeURIComponent(companyKey)}/modules/${encodeURIComponent(slug)}/validate-key`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Api-Key': identityInternalKey
                },
                body: JSON.stringify({ apiKey: moduleKey }),
                signal: AbortSignal.timeout(5000)
            }
        );

        if (resKey.status === 200) {
            const dataKey = await resKey.json().catch(() => ({}));
            if (dataKey.valid === true) {
                validatedSlug = slug;
                break;
            }
            lastReason = dataKey.reason || dataKey.error || 'Chave de licença do módulo inválida.';
            continue;
        }

        if (resKey.status === 403 || resKey.status === 404) {
            const dataKey = await resKey.json().catch(() => ({}));
            lastReason = dataKey.reason || dataKey.error || 'Empresa ou módulo Coliseu Transporte não habilitado.';
            continue;
        }
    }

    if (!validatedSlug) {
        const err = new Error(
            lastReason || 'Chave de licença (COL-...) inválida ou módulo Coliseu Transporte não contratado para esta empresa.'
        );
        err.statusCode = 403;
        err.code = 'INVALID_MODULE_KEY';
        throw err;
    }

    const resInfo = await fetch(
        `${baseUrl}/internal/companies/${encodeURIComponent(companyKey)}/modules/${encodeURIComponent(validatedSlug)}/info`,
        {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Api-Key': identityInternalKey
            },
            signal: AbortSignal.timeout(5000)
        }
    );

    if (resInfo.status !== 200) {
        const dataInfo = await resInfo.json().catch(() => ({}));
        const err = new Error(
            dataInfo.reason || dataInfo.error || 'Módulo Coliseu Transporte suspenso ou inativo para esta empresa.'
        );
        err.statusCode = 403;
        err.code = 'MODULE_BLOCKED';
        throw err;
    }

    const infoData = await resInfo.json().catch(() => ({}));
    if (infoData.valid === false) {
        const err = new Error(infoData.reason || 'Licença do módulo Coliseu Transporte inativa.');
        err.statusCode = 403;
        err.code = 'MODULE_BLOCKED';
        throw err;
    }

    const deviceLimit = Number(infoData.deviceLimit || 0);
    if (!Number.isFinite(deviceLimit) || deviceLimit <= 0) {
        const err = new Error('Esta empresa não possui vagas/licenças ativas liberadas no Painel de Licenças.');
        err.statusCode = 403;
        err.code = 'ZERO_LICENSE_LIMIT';
        throw err;
    }

    return { deviceLimit, slug: validatedSlug, nomeEmpresa: infoData.nomeDaEmpresa || null };
}

/**
 * Login interno do Dashboard.
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios', code: 'MISSING_CREDENTIALS' });
        }

        // Buscar usuário localmente junto com os dados do seu grupo de acesso e empresa emitente
        const query = `
            SELECT u.id, u.tenant_id, u.email, u.nome, u.role, u.ativo, u.senha_hash, u.permissions, u.layout_version, u.grupo_id,
                   COALESCE(u.precisa_alterar_senha, false) AS precisa_alterar_senha,
                   g.nome AS grupo_nome, g.permissoes_menus, g.permissoes_acoes,
                   em.empresa_nome
            FROM dash_usuarios u
            LEFT JOIN dash_grupos_acesso g ON g.id = u.grupo_id AND g.tenant_id = u.tenant_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), NULLIF(TRIM(e.razao_social), '')) AS empresa_nome
                FROM dash_emitentes e
                WHERE e.tenant_id = u.tenant_id
                  AND e.ativo = true
                  AND UPPER(COALESCE(e.razao_social, '')) <> 'YMANARU'
                ORDER BY e.id ASC
                LIMIT 1
            ) em ON true
            WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1))
        `;
        const result = await db.query(query, [email]);

        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado', code: 'INVALID_LOGIN' });
        }

        const user = result.rows[0];

        if (!user.ativo) {
            return res.status(403).json({ error: 'Usuário inativo', code: 'USER_INACTIVE' });
        }

        // Validar senha
        const isMatch = await bcrypt.compare(password, user.senha_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Senha incorreta', code: 'INVALID_LOGIN' });
        }

        const { resolveIdentityCompanyInfo } = require('../services/identityCompanyCache');
        const identityInfo = await resolveIdentityCompanyInfo(user.tenant_id);
        const resolvedEmpresaNome =
            identityInfo?.nome ||
            user.empresa_nome ||
            (user.tenant_id === '00000000-0000-0000-0000-000000000000' ? 'Coliseu Sistemas (Master)' : null);

        // Gerar JWT
        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                tenant: user.tenant_id,
                tenantId: user.tenant_id,
                module: config.security.expectedModuleSlug,
                companyName: resolvedEmpresaNome || 'Empresa Cliente',
                role: user.role,
                grupoId: user.grupo_id
            },
            config.security.jwtDeviceKey,
            { expiresIn: '12h' }
        );

        logger.info('[Auth] Login interno bem-sucedido', { email: user.email, tenant: user.tenant_id });

        const isDefaultPassword = password === '123456';
        const mustChangePassword = Boolean(user.precisa_alterar_senha) || isDefaultPassword;

        res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                nome: user.nome,
                role: user.role,
                tenant_id: user.tenant_id,
                permissions: user.permissions,
                layout_version: user.layout_version,
                grupo_id: user.grupo_id,
                grupo_nome: user.grupo_nome,
                empresa_nome: resolvedEmpresaNome,
                permissoes_menus: user.permissoes_menus,
                permissoes_acoes: user.permissoes_acoes,
                precisa_alterar_senha: mustChangePassword
            }
        });

    } catch (err) {
        logger.error('[Auth] Erro na rota de login', err);
        res.status(500).json({ error: 'Erro interno no servidor', code: 'INTERNAL_ERROR' });
    }
});

/**
 * GET /api/auth/me
 * Retorna dados e permissões atualizadas do usuário logado.
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }
        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, config.security.jwtDeviceKey);
        } catch (err) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        const query = `
            SELECT u.id, u.tenant_id, u.email, u.nome, u.role, u.ativo, u.permissions, u.layout_version, u.grupo_id,
                   COALESCE(u.precisa_alterar_senha, false) AS precisa_alterar_senha,
                   g.nome AS grupo_nome, g.permissoes_menus, g.permissoes_acoes,
                   em.empresa_nome
            FROM dash_usuarios u
            LEFT JOIN dash_grupos_acesso g ON g.id = u.grupo_id AND g.tenant_id = u.tenant_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), NULLIF(TRIM(e.razao_social), '')) AS empresa_nome
                FROM dash_emitentes e
                WHERE e.tenant_id = u.tenant_id
                  AND e.ativo = true
                  AND UPPER(COALESCE(e.razao_social, '')) <> 'YMANARU'
                ORDER BY e.id ASC
                LIMIT 1
            ) em ON true
            WHERE u.id = $1
        `;
        const result = await db.query(query, [decoded.sub]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const user = result.rows[0];
        if (!user.ativo) {
            return res.status(403).json({ error: 'Usuário inativo', code: 'USER_INACTIVE' });
        }

        const { resolveIdentityCompanyInfo } = require('../services/identityCompanyCache');
        const identityInfo = await resolveIdentityCompanyInfo(user.tenant_id);
        user.empresa_nome =
            identityInfo?.nome ||
            user.empresa_nome ||
            (user.tenant_id === '00000000-0000-0000-0000-000000000000' ? 'Coliseu Sistemas (Master)' : null);

        return res.json({ user });
    } catch (err) {
        logger.error('[Auth] Erro ao buscar /me', err);
        return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
    }
});

/**
 * POST /api/auth/alterar-senha
 * Rota para alteração de senha (obrigatória ou voluntária)
 */
router.post('/alterar-senha', async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token não fornecido', code: 'UNAUTHORIZED' });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, config.security.jwtDeviceKey);
        } catch (err) {
            return res.status(401).json({ error: 'Token inválido ou expirado', code: 'INVALID_TOKEN' });
        }

        const userId = decoded.sub;

        if (!novaSenha || typeof novaSenha !== 'string' || novaSenha.trim().length === 0) {
            return res.status(400).json({ error: 'A nova senha é obrigatória.' });
        }

        const cleanNovaSenha = novaSenha.trim();

        if (cleanNovaSenha === '123456') {
            return res.status(400).json({ 
                error: 'A nova senha não pode ser "123456". Escolha uma senha mais segura.',
                code: 'INVALID_PASSWORD_SIMPLE'
            });
        }

        if (cleanNovaSenha.length < 6) {
            return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
        }

        // Buscar hash atual e flag de troca forçada no banco
        const userRes = await db.query(
            'SELECT senha_hash, ativo, COALESCE(precisa_alterar_senha, false) AS precisa_alterar_senha FROM dash_usuarios WHERE id = $1',
            [userId]
        );
        if (userRes.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não localizado.' });
        }
        if (!userRes.rows[0].ativo) {
            return res.status(403).json({ error: 'Usuário inativo.' });
        }

        const currentHash = userRes.rows[0].senha_hash;
        const isForcedByAdmin = Boolean(userRes.rows[0].precisa_alterar_senha);

        if (!isForcedByAdmin) {
            if (!senhaAtual || typeof senhaAtual !== 'string' || senhaAtual.trim().length === 0) {
                return res.status(400).json({ error: 'A senha atual é obrigatória para confirmar sua identidade.' });
            }
            const isMatch = await bcrypt.compare(senhaAtual, currentHash);
            if (!isMatch) {
                return res.status(400).json({ error: 'Senha atual incorreta.' });
            }
        }

        // Gerar novo hash, limpar flag temporária e atualizar banco
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(cleanNovaSenha, salt);

        await db.query(
            'UPDATE dash_usuarios SET senha_hash = $1, precisa_alterar_senha = false WHERE id = $2',
            [newHash, userId]
        );
        invalidateUserAuthCache(userId);

        logger.info('[Auth] Senha alterada pelo próprio usuário com sucesso', { userId });

        return res.status(200).json({
            success: true,
            message: 'Senha alterada com sucesso!'
        });
    } catch (err) {
        logger.error('[Auth] Erro ao alterar senha', err);
        return res.status(500).json({ error: 'Erro ao alterar senha. Tente novamente mais tarde.' });
    }
});

/**
 * Cadastro de novo usuário mediante Serial da Empresa (UUID) + Chave de Licença do Módulo (COL-...)
 * respeitando estritamente o limite de dispositivos/usuários contratado no Painel de Licenças.
 */
router.post('/register', async (req, res) => {
    try {
        const { nome, email, password, companyKey, moduleKey } = req.body || {};

        const cleanNome = String(nome || '').trim();
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPassword = String(password || '');
        const cleanCompanyKey = String(companyKey || '').trim();
        const cleanModuleKey = String(moduleKey || '').trim();

        if (!cleanNome || !cleanEmail || !cleanPassword || !cleanCompanyKey || !cleanModuleKey) {
            return res.status(400).json({
                error: 'Nome, e-mail, senha, Serial da Empresa (UUID) e Chave de Licença do Módulo (COL-...) são obrigatórios.',
                code: 'MISSING_FIELDS'
            });
        }

        if (cleanPassword.length < 6 || cleanPassword === '123456') {
            return res.status(400).json({
                error: 'Escolha uma senha segura com no mínimo 6 caracteres (não utilize "123456").',
                code: 'WEAK_PASSWORD'
            });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(cleanCompanyKey)) {
            return res.status(400).json({
                error: 'Serial da Empresa inválido. Informe o UUID exibido abaixo do nome da empresa no Painel de Licenças.',
                code: 'INVALID_UUID'
            });
        }

        // Bloqueio absoluto de auto-cadastro no tenant Master Global
        if (cleanCompanyKey.toLowerCase() === MASTER_TENANT_ID) {
            logger.warn('[Auth] Tentativa bloqueada de auto-cadastro no MASTER_TENANT_ID', { email: cleanEmail, ip: req.ip });
            return res.status(403).json({
                error: 'Cadastro público não permitido para o identificador reservado da plataforma.',
                code: 'FORBIDDEN_MASTER_TENANT'
            });
        }

        // 1. Validação estrita (fail-closed) da Chave COL-... e do Limite de Licenças no servidor oficial
        let licenca;
        try {
            licenca = await validarLicencaCadastroEmpresa(cleanCompanyKey, cleanModuleKey);
        } catch (licErr) {
            if (licErr.statusCode === 403 || licErr.statusCode === 503) {
                return res.status(licErr.statusCode).json({
                    error: licErr.message,
                    code: licErr.code || 'LICENSE_VALIDATION_FAILED'
                });
            }
            logger.error('[Auth] Falha de comunicação com servidor de licenças no /register', {
                companyKey: cleanCompanyKey,
                error: licErr.message
            });
            return res.status(503).json({
                error: 'Não foi possível validar a chave da empresa no Servidor de Licenças no momento. Tente novamente em instantes.',
                code: 'LICENSE_SERVER_UNAVAILABLE'
            });
        }

        const { ensureGruposTableAndSeeds } = require('./gruposAcesso');
        await ensureGruposTableAndSeeds(cleanCompanyKey);

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(cleanPassword, salt);

        // 2. Transação atômica com lock por empresa para impedir ultrapassar o limite em cadastros simultâneos
        const client = await db.pool.connect();
        let createdUser = null;
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [cleanCompanyKey]);

            // Nenhum bypass por domínio de e-mail em rota pública: toda conta ativa consome 1 vaga da licença
            const countResult = await client.query(
                `SELECT COUNT(*)::int AS total
                 FROM dash_usuarios
                 WHERE tenant_id = $1
                   AND ativo = true`,
                [cleanCompanyKey]
            );
            const currentUsersCount = Number(countResult.rows[0]?.total || 0);

            if (currentUsersCount >= licenca.deviceLimit) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: `O limite de licenças (${licenca.deviceLimit}) contratado para esta empresa foi atingido. Nenhuma nova conta pode ser criada.`,
                    code: 'LICENSE_LIMIT_REACHED'
                });
            }

            const checkResult = await client.query(
                `SELECT id FROM dash_usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
                [cleanEmail]
            );
            if (checkResult.rowCount > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Este email já está em uso.', code: 'EMAIL_IN_USE' });
            }

            // O 1º usuário da empresa assume perfil Admin (grupo Master) para parametrizar o sistema;
            // os demais entram com menor privilégio (Operacional / Frota) até promoção pelo Admin da empresa.
            const isFirstTenantUser = currentUsersCount === 0;
            const initialRole = isFirstTenantUser ? 'admin' : 'viewer';
            const targetGroupName = isFirstTenantUser ? 'Master' : 'Operacional / Frota';

            const groupRes = await client.query(
                `SELECT id FROM dash_grupos_acesso
                 WHERE tenant_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2))
                 LIMIT 1`,
                [cleanCompanyKey, targetGroupName]
            );
            const grupoId = groupRes.rows[0]?.id || null;

            const insertResult = await client.query(
                `INSERT INTO dash_usuarios (tenant_id, email, nome, role, grupo_id, ativo, senha_hash, permissions, layout_version, filial_acesso)
                 VALUES ($1, $2, $3, $4, $5, true, $6, NULL, 'v1.0', 'todas')
                 RETURNING id, tenant_id, email, nome, role, grupo_id, permissions, layout_version`,
                [cleanCompanyKey, cleanEmail, cleanNome, initialRole, grupoId, senhaHash]
            );
            createdUser = insertResult.rows[0];

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK').catch(() => {});
            throw txErr;
        } finally {
            client.release();
        }

        logger.info('[Auth] Novo usuário cadastrado com licença validada', {
            email: createdUser.email,
            tenant: createdUser.tenant_id,
            role: createdUser.role,
            limit: licenca.deviceLimit
        });

        return res.status(201).json({
            message: 'Usuário cadastrado com sucesso',
            user: createdUser
        });
    } catch (err) {
        logger.error('[Auth] Erro na rota de cadastro', err);
        if (err.code === '22P02') {
            return res.status(400).json({
                error: 'Serial da Empresa inválido. O identificador deve ser um UUID válido.',
                code: 'INVALID_UUID'
            });
        }
        return res.status(500).json({ error: 'Erro interno no servidor ao cadastrar', code: 'INTERNAL_ERROR' });
    }
});

router.validarLicencaCadastroEmpresa = validarLicencaCadastroEmpresa;
module.exports = router;
