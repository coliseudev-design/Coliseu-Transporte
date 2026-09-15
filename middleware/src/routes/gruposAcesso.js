'use strict';

/**
 * gruposAcesso.js - Antigravity Nexus Access Control Engine
 * Rotas e serviços para Gestão de Grupos de Acesso (RBAC) e Permissões por Menu/Ações
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');

// JSONs de Permissões Padrão para os Grupos "Master" e "Comercial"
const DEFAULT_MASTER_PERMISSIONS = {
  permissoes_menus: {
    cadastros: { acesso: true, submenus: { clientes: true, produtos: true, fornecedores: true, filiais: true } },
    consultas: { acesso: true, submenus: { clientes: true, titulos: true, produtos: true } },
    crm: { acesso: true, submenus: { kanban: true, contratos: true, pedidos: true } },
    cobranca: { acesso: true, submenus: { kanban: true, regua: true } },
    financeiro: { acesso: true, submenus: { titulos: true, fluxo_caixa: true, banco_asaas: true, emissao_lote: true, conciliacao: true } },
    marketing: { acesso: true, submenus: { massa: true, templates: true } },
    bi: { acesso: true, submenus: { radar: true, sales: true, finance: true } },
    configuracoes: { acesso: true, submenus: { usuarios: true, grupos: true, integracoes: true } }
  },
  permissoes_acoes: {
    permitir_cancelar_titulos: true,
    permitir_eliminar_titulos: true,
    permitir_ver_ficha_cliente: true,
    permitir_ver_titulos_cliente: true,
    permitir_cancelar_boletos: true,
    permitir_liquidar_titulos: true
  }
};

const DEFAULT_COMERCIAL_PERMISSIONS = {
  permissoes_menus: {
    cadastros: { acesso: true, submenus: { clientes: true, produtos: true, fornecedores: false, filiais: false } },
    consultas: { acesso: true, submenus: { clientes: true, titulos: false, produtos: true } },
    crm: { acesso: true, submenus: { kanban: true, contratos: true, pedidos: true } },
    cobranca: { acesso: false, submenus: { kanban: false, regua: false } },
    financeiro: { acesso: false, submenus: { titulos: false, fluxo_caixa: false, banco_asaas: false, emissao_lote: false, conciliacao: false } },
    marketing: { acesso: true, submenus: { massa: true, templates: true } },
    bi: { acesso: true, submenus: { radar: true, sales: true, finance: false } },
    configuracoes: { acesso: false, submenus: { usuarios: false, grupos: false, integracoes: false } }
  },
  permissoes_acoes: {
    permitir_cancelar_titulos: false,
    permitir_eliminar_titulos: false,
    permitir_ver_ficha_cliente: true,
    permitir_ver_titulos_cliente: false,
    permitir_cancelar_boletos: false,
    permitir_liquidar_titulos: false
  }
};

/**
 * Garante a criação da tabela e o seeding dos grupos padrão (Master e Comercial)
 */
async function ensureGruposTableAndSeeds(tenantId) {
  try {
    // 1. Tabela de Grupos de Acesso
    await db.query(`
      CREATE TABLE IF NOT EXISTS dash_grupos_acesso (
        id SERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL,
        nome VARCHAR(100) NOT NULL,
        descricao TEXT,
        permissoes_menus JSONB DEFAULT '{}'::jsonb,
        permissoes_acoes JSONB DEFAULT '{}'::jsonb,
        ativo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE dash_usuarios ADD COLUMN IF NOT EXISTS grupo_id INT;
    `);

    if (!tenantId) return;

    // 2. Busca ou cria o Grupo Master
    let masterRes = await db.query(
      `SELECT id FROM dash_grupos_acesso WHERE tenant_id = $1 AND LOWER(nome) = 'master' LIMIT 1`,
      [tenantId]
    );

    let masterGroupId;
    if (masterRes.rows.length === 0) {
      const newMaster = await db.query(
        `INSERT INTO dash_grupos_acesso (tenant_id, nome, descricao, permissoes_menus, permissoes_acoes, ativo)
         VALUES ($1, 'Master', 'Acesso total irrestrito a todos os módulos, menus e ações do sistema', $2, $3, true)
         RETURNING id`,
        [tenantId, DEFAULT_MASTER_PERMISSIONS.permissoes_menus, DEFAULT_MASTER_PERMISSIONS.permissoes_acoes]
      );
      masterGroupId = newMaster.rows[0].id;
    } else {
      masterGroupId = masterRes.rows[0].id;
    }

    // 3. Busca ou cria o Grupo Comercial
    let comercialRes = await db.query(
      `SELECT id FROM dash_grupos_acesso WHERE tenant_id = $1 AND LOWER(nome) = 'comercial' LIMIT 1`,
      [tenantId]
    );

    if (comercialRes.rows.length === 0) {
      await db.query(
        `INSERT INTO dash_grupos_acesso (tenant_id, nome, descricao, permissoes_menus, permissoes_acoes, ativo)
         VALUES ($1, 'Comercial', 'Perfil Comercial (Sem acesso à Gestão Financeira e sem permissão de cancelamentos)', $2, $3, true)`,
        [tenantId, DEFAULT_COMERCIAL_PERMISSIONS.permissoes_menus, DEFAULT_COMERCIAL_PERMISSIONS.permissoes_acoes]
      );
    }

    // 4. Associa todos os usuários sem grupo ao grupo Master por padrão
    await db.query(
      `UPDATE dash_usuarios SET grupo_id = $1 WHERE tenant_id = $2 AND grupo_id IS NULL`,
      [masterGroupId, tenantId]
    );

    return masterGroupId;
  } catch (err) {
    logger.error('[GruposAcesso] Erro ao garantir grupos padrão', { error: err.message });
  }
}

/**
 * GET /api/grupos-acesso
 * Lista todos os grupos de acesso do tenant com contagem de usuários
 */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    await ensureGruposTableAndSeeds(tenantId);

    const { rows } = await db.query(
      `SELECT g.*, 
              COUNT(u.id)::int AS total_usuarios
       FROM dash_grupos_acesso g
       LEFT JOIN dash_usuarios u ON u.grupo_id = g.id AND u.tenant_id = g.tenant_id
       WHERE g.tenant_id = $1
       GROUP BY g.id
       ORDER BY g.id ASC`,
      [tenantId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/grupos-acesso/:id
 * Detalhes de um grupo específico
 */
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const { rows } = await db.query(
      `SELECT * FROM dash_grupos_acesso WHERE tenant_id = $1 AND id = $2`,
      [tenantId, parseInt(id, 10)]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Grupo de acesso não encontrado.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/grupos-acesso
 * Cria um novo grupo de acesso
 */
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { nome, descricao, permissoes_menus, permissoes_acoes } = req.body;

    if (!nome || typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'Nome do grupo de acesso é obrigatório.' });
    }

    await ensureGruposTableAndSeeds(tenantId);

    const { rows } = await db.query(
      `INSERT INTO dash_grupos_acesso (tenant_id, nome, descricao, permissoes_menus, permissoes_acoes, ativo)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [
        tenantId,
        nome.trim(),
        descricao || '',
        permissoes_menus || DEFAULT_MASTER_PERMISSIONS.permissoes_menus,
        permissoes_acoes || DEFAULT_MASTER_PERMISSIONS.permissoes_acoes
      ]
    );

    res.json({ success: true, message: 'Grupo de acesso criado com sucesso!', data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/grupos-acesso/:id
 * Atualiza permissões e dados de um grupo de acesso
 */
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const { nome, descricao, permissoes_menus, permissoes_acoes, ativo } = req.body;

    const { rows } = await db.query(
      `UPDATE dash_grupos_acesso
       SET nome = COALESCE($1, nome),
           descricao = COALESCE($2, descricao),
           permissoes_menus = COALESCE($3, permissoes_menus),
           permissoes_acoes = COALESCE($4, permissoes_acoes),
           ativo = COALESCE($5, ativo),
           updated_at = NOW()
       WHERE tenant_id = $6 AND id = $7
       RETURNING *`,
      [
        nome ? nome.trim() : null,
        descricao,
        permissoes_menus,
        permissoes_acoes,
        ativo,
        tenantId,
        parseInt(id, 10)
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Grupo de acesso não localizado.' });
    }

    res.json({ success: true, message: 'Grupo de acesso atualizado com sucesso!', data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/grupos-acesso/:id
 * Desativa/Exclui um grupo de acesso
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const groupId = parseInt(id, 10);

    // Verifica se há usuários vinculados a este grupo
    const { rows: users } = await db.query(
      `SELECT COUNT(*)::int as count FROM dash_usuarios WHERE tenant_id = $1 AND grupo_id = $2`,
      [tenantId, groupId]
    );

    if (users[0].count > 0) {
      // Reatribui os usuários ao grupo Master
      const masterRes = await db.query(
        `SELECT id FROM dash_grupos_acesso WHERE tenant_id = $1 AND LOWER(nome) = 'master' LIMIT 1`,
        [tenantId]
      );
      if (masterRes.rows.length > 0) {
        await db.query(
          `UPDATE dash_usuarios SET grupo_id = $1 WHERE tenant_id = $2 AND grupo_id = $3`,
          [masterRes.rows[0].id, tenantId, groupId]
        );
      }
    }

    await db.query(
      `DELETE FROM dash_grupos_acesso WHERE tenant_id = $1 AND id = $2`,
      [tenantId, groupId]
    );

    res.json({ success: true, message: 'Grupo de acesso removido com sucesso!' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.ensureGruposTableAndSeeds = ensureGruposTableAndSeeds;
module.exports.DEFAULT_MASTER_PERMISSIONS = DEFAULT_MASTER_PERMISSIONS;
