'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/postgres');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Login interno do Dashboard.
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios', code: 'MISSING_CREDENTIALS' });
        }

        // Buscar usuário localmente junto com os dados do seu grupo de acesso
        const query = `
            SELECT u.id, u.tenant_id, u.email, u.nome, u.role, u.ativo, u.senha_hash, u.permissions, u.layout_version, u.grupo_id,
                   g.nome AS grupo_nome, g.permissoes_menus, g.permissoes_acoes
            FROM dash_usuarios u
            LEFT JOIN dash_grupos_acesso g ON g.id = u.grupo_id AND g.tenant_id = u.tenant_id
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

        // Gerar JWT
        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                tenant: user.tenant_id,
                tenantId: user.tenant_id,
                module: config.security.expectedModuleSlug,
                companyName: user.tenant_id === '00000000-0000-0000-0000-000000000000' ? 'Coliseu Sistemas (Master)' : 'Empresa Cliente',
                role: user.role,
                grupoId: user.grupo_id
            },
            config.security.jwtDeviceKey,
            { expiresIn: '12h' }
        );

        logger.info('[Auth] Login interno bem-sucedido', { email: user.email, tenant: user.tenant_id });

        const isDefaultPassword = password === '123456';

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
                permissoes_menus: user.permissoes_menus,
                permissoes_acoes: user.permissoes_acoes,
                precisa_alterar_senha: isDefaultPassword
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
                   g.nome AS grupo_nome, g.permissoes_menus, g.permissoes_acoes
            FROM dash_usuarios u
            LEFT JOIN dash_grupos_acesso g ON g.id = u.grupo_id AND g.tenant_id = u.tenant_id
            WHERE u.id = $1
        `;
        const result = await db.query(query, [decoded.sub]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const user = result.rows[0];
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

        // Buscar hash atual no banco
        const userRes = await db.query('SELECT senha_hash FROM dash_usuarios WHERE id = $1', [userId]);
        if (userRes.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não localizado.' });
        }

        const currentHash = userRes.rows[0].senha_hash;

        // Se informou senha atual, verifica a validade
        if (senhaAtual && senhaAtual !== '123456') {
            const isMatch = await bcrypt.compare(senhaAtual, currentHash);
            if (!isMatch) {
                return res.status(400).json({ error: 'Senha atual incorreta.' });
            }
        }

        // Gerar novo hash e atualizar banco
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(cleanNovaSenha, salt);

        await db.query('UPDATE dash_usuarios SET senha_hash = $1 WHERE id = $2', [newHash, userId]);

        logger.info('[Auth] Senha alterada com sucesso', { userId });

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

        if (!nome || !email || !password || !companyKey) {
            return res.status(400).json({ error: 'Nome, email, senha e ID da Empresa (CompanyKey) são obrigatórios', code: 'MISSING_FIELDS' });
        }

        // 1. Validação no Servidor de Licenças (Limite de Dispositivos/Cadastros)
        const { identityApiUrl, identityInternalKey, expectedModuleSlug } = config.security;

        if (!identityApiUrl || !identityInternalKey) {
            logger.warn('[Auth] Falta configuração do IDENTITY_API_URL/KEY. Bloqueando cadastro por segurança.');
            return res.status(500).json({ error: 'Erro de infraestrutura do sistema de licenças', code: 'CONFIG_ERROR' });
        }

        try {
            const url = `${identityApiUrl}/internal/companies/${companyKey}/modules/${expectedModuleSlug}/info`;
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Api-Key': identityInternalKey
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.status !== 200) {
                const data = await response.json().catch(() => ({}));
                const reason = data.reason || data.error || 'Empresa inativa ou módulo bloqueado.';
                return res.status(403).json({ error: reason, code: 'MODULE_BLOCKED' });
            }

            const data = await response.json();
            const deviceLimit = data.deviceLimit || 0;

            // Checar a quantidade atual de usuários para este tenant
            const countQuery = `SELECT COUNT(*) as total FROM dash_usuarios WHERE tenant_id = $1`;
            const countResult = await db.query(countQuery, [companyKey]);
            const currentUsersCount = parseInt(countResult.rows[0].total, 10);

            if (currentUsersCount >= deviceLimit) {
                return res.status(403).json({ 
                    error: `O limite de licenças (${deviceLimit}) para esta empresa foi atingido. Nenhuma nova conta pode ser criada.`, 
                    code: 'LICENSE_LIMIT_REACHED' 
                });
            }
        } catch (err) {
            logger.error('[Auth] Erro ao comunicar com o servidor de licenças durante cadastro', err);
            return res.status(503).json({ error: 'Servidor de licenças temporariamente indisponível. Não foi possível validar sua licença.', code: 'LICENSE_API_ERROR' });
        }

        // 2. Valida se o email já existe
        const checkQuery = `SELECT id FROM dash_usuarios WHERE email = $1`;
        const checkResult = await db.query(checkQuery, [email]);
        
        if (checkResult.rowCount > 0) {
            return res.status(409).json({ error: 'Este email já está em uso', code: 'EMAIL_IN_USE' });
        }

        // Hash da senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(password, salt);

        // Insere o usuário (default role: viewer)
        const insertQuery = `
            INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash, permissions, layout_version)
            VALUES ($1, $2, $3, 'viewer', true, $4, NULL, 'v1.0')
            RETURNING id, tenant_id, email, nome, role, permissions, layout_version
        `;
        const result = await db.query(insertQuery, [companyKey, email, nome, senhaHash]);
        const user = result.rows[0];

        logger.info('[Auth] Novo usuário cadastrado', { email: user.email, tenant: user.tenant_id });

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
