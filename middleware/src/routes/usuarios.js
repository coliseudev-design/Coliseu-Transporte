'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/postgres');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * GET /api/usuarios
 * Lista usuários. Se for Master, lista todos. Se for Tenant normal, lista apenas os do Tenant.
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const { ensureGruposTableAndSeeds } = require('./gruposAcesso');
        await ensureGruposTableAndSeeds(tenantId);

        let query = `
            SELECT u.id, u.tenant_id, u.email, u.nome, u.role, u.ativo, u.created_at, u.permissions, u.layout_version, u.filial_acesso, u.grupo_id,
                   g.nome AS grupo_nome, g.permissoes_menus, g.permissoes_acoes
            FROM dash_usuarios u
            LEFT JOIN dash_grupos_acesso g ON g.id = u.grupo_id AND g.tenant_id = u.tenant_id
        `;
        let params = [];
        
        if (tenantId !== '00000000-0000-0000-0000-000000000000') {
            query += ` WHERE u.tenant_id = $1`;
            params.push(tenantId);
        }
        
        query += ` ORDER BY u.created_at DESC`;
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        logger.error('[Usuarios] Erro ao listar', err);
        res.status(500).json({ error: 'Erro ao listar usuários' });
    }
});

/**
 * POST /api/usuarios
 * Cadastro de novo usuário por dentro do painel.
 */
router.post('/', async (req, res) => {
    try {
        const { nome, email, password, companyKey } = req.body;

        if (!nome || !email || !password || !companyKey) {
            return res.status(400).json({ error: 'Nome, email, senha e CompanyKey são obrigatórios' });
        }

        // Segurança: Se não for master, só pode criar usuário para a própria empresa
        if (req.tenant.id !== '00000000-0000-0000-0000-000000000000' && companyKey !== req.tenant.id) {
            return res.status(403).json({ error: 'Você só pode criar usuários para a sua própria empresa.' });
        }

        // Validação no Servidor de Licenças (Limite de Dispositivos/Cadastros)
        const { identityApiUrl, identityInternalKey, expectedModuleSlug } = config.security;

        if (!identityApiUrl || !identityInternalKey) {
            return res.status(500).json({ error: 'Erro de infraestrutura do sistema de licenças' });
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
                return res.status(403).json({ error: reason });
            }

            const data = await response.json();
            const deviceLimit = data.deviceLimit || 0;

            const countQuery = `SELECT COUNT(*) as total FROM dash_usuarios WHERE tenant_id = $1`;
            const countResult = await db.query(countQuery, [companyKey]);
            const currentUsersCount = parseInt(countResult.rows[0].total, 10);

            if (currentUsersCount >= deviceLimit) {
                return res.status(403).json({ 
                    error: `O limite de licenças (${deviceLimit}) para esta empresa foi atingido. Nenhuma nova conta pode ser criada.`
                });
            }
        } catch (err) {
            logger.error('[Usuarios] Erro ao comunicar com licenças', err);
            return res.status(503).json({ error: 'Servidor de licenças indisponível.' });
        }

        // Valida se o email já existe
        const checkQuery = `SELECT id FROM dash_usuarios WHERE email = $1`;
        const checkResult = await db.query(checkQuery, [email]);
        
        if (checkResult.rowCount > 0) {
            return res.status(409).json({ error: 'Este email já está em uso' });
        }

        // Hash da senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(password, salt);

        // Insere o usuário
        const insertQuery = `
            INSERT INTO dash_usuarios (tenant_id, email, nome, role, ativo, senha_hash, permissions, layout_version, filial_acesso)
            VALUES ($1, $2, $3, 'viewer', true, $4, NULL, 'v1.0', 'todas')
            RETURNING id, tenant_id, email, nome, role, ativo, created_at, permissions, layout_version, filial_acesso
        `;
        const result = await db.query(insertQuery, [companyKey, email, nome, senhaHash]);
        const user = result.rows[0];

        logger.info('[Usuarios] Novo usuário criado via painel', { email: user.email, by: req.user.email });

        res.status(201).json(user);
    } catch (err) {
        logger.error('[Usuarios] Erro ao criar', err);
        if (err.code === '22P02') {
            return res.status(400).json({ error: 'CompanyKey inválida (deve ser um UUID).' });
        }
        res.status(500).json({ error: 'Erro interno ao criar usuário' });
    }
});

/**
 * PUT /api/usuarios/:id/status
 * Ativa ou Inativa um usuário
 */
router.put('/:id/status', async (req, res) => {
    try {
        const { ativo } = req.body;
        const targetId = req.params.id;

        if (typeof ativo !== 'boolean') {
            return res.status(400).json({ error: 'O campo "ativo" deve ser booleano (true/false).' });
        }

        // Não deixa a pessoa se desativar sozinha (segurança)
        if (targetId === req.user.sub && !ativo) {
            return res.status(400).json({ error: 'Você não pode inativar seu próprio usuário.' });
        }

        let query = `UPDATE dash_usuarios SET ativo = $1 WHERE id = $2`;
        let params = [ativo, targetId];

        if (req.tenant.id !== '00000000-0000-0000-0000-000000000000') {
            query += ` AND tenant_id = $3`;
            params.push(req.tenant.id);
        }

        query += ` RETURNING id, ativo`;

        const result = await db.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado ou você não tem permissão para editá-lo.' });
        }

        logger.info('[Usuarios] Status alterado', { targetId, ativo, by: req.user.email });

        res.json({ message: 'Status atualizado com sucesso', user: result.rows[0] });
    } catch (err) {
        logger.error('[Usuarios] Erro ao alterar status', err);
        res.status(500).json({ error: 'Erro ao alterar status do usuário' });
    }
});



/**
 * PUT /api/usuarios/:id/permissions
 * Atualiza as permissões (abas/módulos) do usuário
 */
router.put('/:id/permissions', async (req, res) => {
    try {
        const { permissions } = req.body;
        const targetId = req.params.id;

        if (permissions !== null && !Array.isArray(permissions)) {
            return res.status(400).json({ error: 'O campo "permissions" deve ser um array de strings ou nulo.' });
        }

        // Apenas master pode editar permissões? Ou usuários admin do tenant.
        // O frontend passará um array como ['inicio', 'financeiro']

        let query = `UPDATE dash_usuarios SET permissions = $1 WHERE id = $2`;
        let params = [permissions ? JSON.stringify(permissions) : null, targetId];

        if (req.tenant.id !== '00000000-0000-0000-0000-000000000000') {
            query += ` AND tenant_id = $3`;
            params.push(req.tenant.id);
        }

        query += ` RETURNING id, permissions`;

        const result = await db.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado ou você não tem permissão para editá-lo.' });
        }

        logger.info('[Usuarios] Permissões alteradas', { targetId, permissions, by: req.user.email });

        res.json({ message: 'Permissões atualizadas com sucesso', user: result.rows[0] });
    } catch (err) {
        logger.error('[Usuarios] Erro ao alterar permissões', err);
        res.status(500).json({ error: 'Erro ao alterar permissões do usuário' });
    }
});

/**
 * PUT /api/usuarios/:id/layout
 * Altera a versão do layout para um usuário
 */
router.put('/:id/layout', async (req, res) => {
    try {
        const { layout_version } = req.body;
        const targetId = req.params.id;

        if (!['v1.0', 'v2.0', 'v3.0'].includes(layout_version)) {
            return res.status(400).json({ error: 'Versão de layout inválida. Opções: v1.0, v2.0, v3.0' });
        }

        let query = `UPDATE dash_usuarios SET layout_version = $1 WHERE id = $2`;
        let params = [layout_version, targetId];

        if (req.tenant.id !== '00000000-0000-0000-0000-000000000000') {
            query += ` AND tenant_id = $3`;
            params.push(req.tenant.id);
        }

        query += ` RETURNING id, layout_version`;

        const result = await db.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado ou sem permissão.' });
        }

        logger.info('[Usuarios] Layout version alterado', { targetId, layout_version, by: req.user.email });
        res.json({ message: 'Versão do layout atualizada com sucesso', user: result.rows[0] });
    } catch (err) {
        logger.error('[Usuarios] Erro ao alterar layout version', err);
        res.status(500).json({ error: 'Erro interno ao alterar versão do layout.' });
    }
});

/**
 * PUT /api/usuarios/:id/filial-acesso
 * Define quais filiais (depto_ids) o usuário pode visualizar.
 * Formato: 'todas' | '1' | '1,3' (IDs separados por vírgula)
 */
router.put('/:id/filial-acesso', async (req, res) => {
    try {
        const { filial_acesso } = req.body;
        const targetId = req.params.id;

        // Validar formato: 'todas' ou lista de números separados por vírgula
        const validFormat = /^(todas|\d+(,\d+)*)$/.test(String(filial_acesso || 'todas').trim());
        if (!validFormat) {
            return res.status(400).json({ error: 'Formato inválido. Use "todas" ou IDs separados por vírgula (ex: "1,3").' });
        }

        let query = `UPDATE dash_usuarios SET filial_acesso = $1 WHERE id = $2`;
        let params = [filial_acesso, targetId];

        if (req.tenant.id !== '00000000-0000-0000-0000-000000000000') {
            query += ` AND tenant_id = $3`;
            params.push(req.tenant.id);
        }

        query += ` RETURNING id, filial_acesso`;

        const result = await db.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado ou sem permissão.' });
        }

        logger.info('[Usuarios] Acesso de filial alterado', { targetId, filial_acesso, by: req.user.email });
        res.json({ message: 'Acesso de filiais atualizado com sucesso', user: result.rows[0] });
    } catch (err) {
        logger.error('[Usuarios] Erro ao alterar filial_acesso', err);
        res.status(500).json({ error: 'Erro interno ao alterar acesso de filiais.' });
    }
});

/**
 * PUT /api/usuarios/:id/grupo
 * Associa um usuário a um grupo de acesso (grupo_id)
 */
router.put('/:id/grupo', async (req, res) => {
    try {
        const { grupo_id } = req.body;
        const targetId = req.params.id;

        const grupoIdNum = grupo_id ? parseInt(grupo_id, 10) : null;

        let query = `UPDATE dash_usuarios SET grupo_id = $1 WHERE id = $2`;
        let params = [grupoIdNum, targetId];

        if (req.tenant.id !== '00000000-0000-0000-0000-000000000000') {
            query += ` AND tenant_id = $3`;
            params.push(req.tenant.id);
        }

        query += ` RETURNING id, grupo_id`;

        const result = await db.query(query, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado ou sem permissão.' });
        }

        logger.info('[Usuarios] Grupo de acesso alterado', { targetId, grupoIdNum, by: req.user.email });
        res.json({ message: 'Grupo de acesso do usuário atualizado com sucesso', user: result.rows[0] });
    } catch (err) {
        logger.error('[Usuarios] Erro ao alterar grupo_id', err);
        res.status(500).json({ error: 'Erro interno ao alterar grupo de acesso.' });
    }
});

module.exports = router;
