'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/postgres');
const config = require('../config/env');
const logger = require('../config/logger');
const { invalidateUserAuthCache } = require('../middleware/auth');

let authUsuariosSchemaReady = false;
async function ensureAuthUsuariosSchema() {
    if (authUsuariosSchemaReady) return;
    await db.query(`
        ALTER TABLE dash_usuarios
        ADD COLUMN IF NOT EXISTS precisa_alterar_senha BOOLEAN NOT NULL DEFAULT false
    `);
    authUsuariosSchemaReady = true;
}

/**
 * Login interno do Dashboard.
 */
router.post('/login', async (req, res) => {
    try {
        await ensureAuthUsuariosSchema();
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
        await ensureAuthUsuariosSchema();
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
        await ensureAuthUsuariosSchema();
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
 * Cadastro de novo usuário.
 */
router.post('/register', async (req, res) => {
    try {
        const { nome, email, password, companyKey } = req.body;

        const cleanNome = String(nome || '').trim();
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPassword = String(password || '');
        const cleanCompanyKey = String(companyKey || '').trim();

        if (!cleanNome || !cleanEmail || !cleanPassword || !cleanCompanyKey) {
            return res.status(400).json({ error: 'Nome, email, senha e ID da Empresa (CompanyKey) são obrigatórios', code: 'MISSING_FIELDS' });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(cleanCompanyKey)) {
            return res.status(400).json({ error: 'ID da Empresa inválido. O CompanyKey deve ser um UUID válido.', code: 'INVALID_UUID' });
        }

        const isSuperAdminEmail = cleanEmail.endsWith('@silenus.com.br') || cleanEmail.endsWith('@coliseusistemas.com.br');

        // 1. Validação no Servidor de Licenças (Limite de Dispositivos/Cadastros)
        const { identityApiUrl, identityInternalKey, expectedModuleSlug } = config.security;
        let deviceLimit = 10;

        if (identityApiUrl && identityInternalKey) {
            try {
                const url = `${identityApiUrl}/internal/companies/${cleanCompanyKey}/modules/${expectedModuleSlug}/info`;
                
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Internal-Api-Key': identityInternalKey
                    },
                    signal: controller.signal
                });
                clearTimeout(timeout);

                if (response.status === 200) {
                    const data = await response.json();
                    deviceLimit = data.deviceLimit || 10;
                } else {
                    const data = await response.json().catch(() => ({}));
                    const reason = data.reason || data.error || '';
                    // Se o módulo estiver explicitamente suspenso/desativado no painel de licenças, bloqueia
                    if (reason.toLowerCase().includes('suspenso') || reason.toLowerCase().includes('desativado')) {
                        return res.status(403).json({ error: reason, code: 'MODULE_BLOCKED' });
                    }
                    // Caso a empresa/módulo ainda esteja em aprovação ou não sincronizada no Identity, permite com limite padrão (10)
                    logger.warn('[Auth] Empresa/Módulo ainda não consta no Identity API durante cadastro; aplicando fallback de licença local.', {
                        companyKey: cleanCompanyKey,
                        status: response.status,
                        reason
                    });
                }
            } catch (err) {
                logger.warn('[Auth] Aviso ao consultar servidor de licenças durante cadastro; aplicando fallback local.', {
                    companyKey: cleanCompanyKey,
                    error: err.message
                });
            }
        }

        // Checar a quantidade atual de usuários ativos para este tenant (excluindo contas de suporte/gestão)
        const countQuery = `
            SELECT COUNT(*) as total FROM dash_usuarios
            WHERE tenant_id = $1
              AND ativo = true
              AND LOWER(email) NOT LIKE '%@silenus.com.br'
              AND LOWER(email) NOT LIKE '%@coliseusistemas.com.br'
        `;
        const countResult = await db.query(countQuery, [cleanCompanyKey]);
        const currentUsersCount = parseInt(countResult.rows[0].total, 10);

        if (!isSuperAdminEmail && currentUsersCount >= deviceLimit) {
            return res.status(403).json({
                error: `O limite de licenças (${deviceLimit}) para esta empresa foi atingido. Nenhuma nova conta pode ser criada.`,
                code: 'LICENSE_LIMIT_REACHED'
            });
        }

        // 2. Valida se o email já existe (case-insensitive)
        const checkQuery = `SELECT id FROM dash_usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`;
        const checkResult = await db.query(checkQuery, [cleanEmail]);
        
        if (checkResult.rowCount > 0) {
            return res.status(409).json({ error: 'Este email já está em uso', code: 'EMAIL_IN_USE' });
        }

        // Hash da senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(cleanPassword, salt);

        // Insere o usuário (admin por padrão no cadastro da empresa para permitir configuração fiscal/operacional)
        const initialRole = 'admin';
        const insertQuery = `
            INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash, permissions, layout_version)
            VALUES ($1, $2, $3, $5, true, $4, NULL, 'v1.0')
            RETURNING id, tenant_id, email, nome, role, permissions, layout_version
        `;
        const result = await db.query(insertQuery, [cleanCompanyKey, cleanEmail, cleanNome, senhaHash, initialRole]);
        const user = result.rows[0];

        const { ensureGruposTableAndSeeds } = require('./gruposAcesso');
        await ensureGruposTableAndSeeds(cleanCompanyKey);

        logger.info('[Auth] Novo usuário cadastrado', { email: user.email, tenant: user.tenant_id, role: user.role });

        // Retorna sucesso. O front pode fazer auto-login depois.
        res.status(201).json({
            message: 'Usuário cadastrado com sucesso',
            user
        });
    } catch (err) {
        logger.error('[Auth] Erro na rota de cadastro', err);
        // Tratar erro de UUID mal formatado (caso o usuário digite texto comum em vez de CompanyKey válida)
        if (err.code === '22P02') {
            return res.status(400).json({ error: 'ID da Empresa inválido. O CompanyKey deve ser um UUID válido.', code: 'INVALID_UUID' });
        }
        res.status(500).json({ error: 'Erro interno no servidor ao cadastrar', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
