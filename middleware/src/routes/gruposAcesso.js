'use strict';

/**
 * gruposAcesso.js - Coliseu Transporte RBAC Engine
 * Rotas e serviços para Gestão de Grupos de Acesso (RBAC) e Permissões por Menu/Ações
 */

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { requireAdmin, invalidateUserAuthCache } = require('../middleware/auth');

const DEFAULT_MASTER_PERMISSIONS = {
  permissoes_menus: {
    operacao: { acesso: true, submenus: { cockpit: true, cargas: true, roteiro: true } },
    documentos: { acesso: true, submenus: { emitir_cte: true, emitir_mdfe: true, documentos_emitidos: true } },
    ciot: { acesso: true, submenus: { consultar_ciot: true } },
    cadastros: { acesso: true, submenus: { clientes: true, regioes: true, frota: true, partes: true } },
    relatorios: { acesso: true, submenus: { desempenho: true } },
    configuracoes: {
      acesso: true,
      submenus: {
        dados_empresa: true,
        regras_fiscais: true,
        campos_dinamicos: true,
        certificados: true,
        usuarios: true
      }
    }
  },
  permissoes_acoes: {
    permitir_emitir_cte: true,
    permitir_emitir_mdfe: true,
    permitir_cancelar_documentos: true,
    permitir_gerenciar_ciot: true,
    permitir_gerenciar_certificados: true,
    permitir_gerenciar_usuarios: true,
    permitir_ver_ficha_cliente: true,
    permitir_ver_titulos_cliente: true
  }
};

const DEFAULT_FISCAL_PERMISSIONS = {
  permissoes_menus: {
    operacao: { acesso: true, submenus: { cockpit: true, cargas: true, roteiro: true } },
    documentos: { acesso: true, submenus: { emitir_cte: true, emitir_mdfe: true, documentos_emitidos: true } },
    ciot: { acesso: true, submenus: { consultar_ciot: true } },
    cadastros: { acesso: true, submenus: { clientes: true, regioes: true, frota: true, partes: true } },
    relatorios: { acesso: true, submenus: { desempenho: true } },
    configuracoes: {
      acesso: true,
      submenus: {
        dados_empresa: false,
        regras_fiscais: true,
        campos_dinamicos: false,
        certificados: false,
        usuarios: false
      }
    }
  },
  permissoes_acoes: {
    permitir_emitir_cte: true,
    permitir_emitir_mdfe: true,
    permitir_cancelar_documentos: true,
    permitir_gerenciar_ciot: true,
    permitir_gerenciar_certificados: false,
    permitir_gerenciar_usuarios: false,
    permitir_ver_ficha_cliente: true,
    permitir_ver_titulos_cliente: true
  }
};

const DEFAULT_OPERACIONAL_PERMISSIONS = {
  permissoes_menus: {
    operacao: { acesso: true, submenus: { cockpit: true, cargas: true, roteiro: true } },
    documentos: { acesso: true, submenus: { emitir_cte: false, emitir_mdfe: true, documentos_emitidos: true } },
    ciot: { acesso: false, submenus: { consultar_ciot: false } },
    cadastros: { acesso: true, submenus: { clientes: true, regioes: true, frota: true, partes: true } },
    relatorios: { acesso: false, submenus: { desempenho: false } },
    configuracoes: {
      acesso: false,
      submenus: {
        dados_empresa: false,
        regras_fiscais: false,
        campos_dinamicos: false,
        certificados: false,
        usuarios: false
      }
    }
  },
  permissoes_acoes: {
    permitir_emitir_cte: false,
    permitir_emitir_mdfe: true,
    permitir_cancelar_documentos: false,
    permitir_gerenciar_ciot: false,
    permitir_gerenciar_certificados: false,
    permitir_gerenciar_usuarios: false,
    permitir_ver_ficha_cliente: true,
    permitir_ver_titulos_cliente: false
  }
};

const DEFAULT_GROUPS_SEED = [
  {
    nome: 'Master',
    descricao: 'Acesso total irrestrito a todos os módulos, emissões fiscais (CT-e / MDF-e), certificados A1 e configurações do sistema',
    permissoes_menus: DEFAULT_MASTER_PERMISSIONS.permissoes_menus,
    permissoes_acoes: DEFAULT_MASTER_PERMISSIONS.permissoes_acoes
  },
  {
    nome: 'Fiscal / Emissão',
    descricao: 'Emissão e gestão de CT-e, MDF-e, CIOT, Central de Cargas e Relatórios Fiscais (sem gestão de usuários ou certificados)',
    permissoes_menus: DEFAULT_FISCAL_PERMISSIONS.permissoes_menus,
    permissoes_acoes: DEFAULT_FISCAL_PERMISSIONS.permissoes_acoes
  },
  {
    nome: 'Operacional / Frota',
    descricao: 'Operação logística, Central de Cargas, Roteiro de Entrega, MDF-e e Cadastros de Frota/Condutores (sem cancelamentos fiscais ou configurações)',
    permissoes_menus: DEFAULT_OPERACIONAL_PERMISSIONS.permissoes_menus,
    permissoes_acoes: DEFAULT_OPERACIONAL_PERMISSIONS.permissoes_acoes
  }
];

let globalSchemaPromise = null;
const inFlightTenantSeeds = new Map();

/**
 * Executa uma única vez por processo a criação da tabela, migração dos perfis legados,
 * deduplicação de grupos repetidos e criação do índice UNIQUE por (tenant_id, LOWER(TRIM(nome))).
 */
async function ensureGlobalSchemaAndDeduplicate() {
  if (globalSchemaPromise) return globalSchemaPromise;

  globalSchemaPromise = (async () => {
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

    // 1. Atualiza grupos legados "Comercial" (template antigo ERP) para "Operacional / Frota"
    await db.query(
      `UPDATE dash_grupos_acesso
       SET nome = 'Operacional / Frota',
           descricao = $1,
           permissoes_menus = $2::jsonb,
           permissoes_acoes = $3::jsonb,
           updated_at = NOW()
       WHERE LOWER(TRIM(nome)) = 'comercial'
         AND (descricao IS NULL OR descricao LIKE 'Perfil Comercial%')`,
      [
        DEFAULT_GROUPS_SEED[2].descricao,
        JSON.stringify(DEFAULT_OPERACIONAL_PERMISSIONS.permissoes_menus),
        JSON.stringify(DEFAULT_OPERACIONAL_PERMISSIONS.permissoes_acoes)
      ]
    );

    // 2. Atualiza grupos "Master" antigos para incluir os menus nativos do Coliseu Transporte
    await db.query(
      `UPDATE dash_grupos_acesso
       SET descricao = $1,
           permissoes_menus = $2::jsonb,
           permissoes_acoes = $3::jsonb,
           updated_at = NOW()
       WHERE LOWER(TRIM(nome)) = 'master'
         AND NOT (COALESCE(permissoes_menus, '{}'::jsonb) ? 'operacao')`,
      [
        DEFAULT_GROUPS_SEED[0].descricao,
        JSON.stringify(DEFAULT_MASTER_PERMISSIONS.permissoes_menus),
        JSON.stringify(DEFAULT_MASTER_PERMISSIONS.permissoes_acoes)
      ]
    );

    // 3. Reaponta usuários vinculados a grupos duplicados para o menor ID canônico do mesmo tenant
    await db.query(`
      WITH canon AS (
        SELECT tenant_id, LOWER(TRIM(nome)) AS norm_nome, MIN(id) AS keep_id
        FROM dash_grupos_acesso
        GROUP BY tenant_id, LOWER(TRIM(nome))
        HAVING COUNT(*) > 1
      )
      UPDATE dash_usuarios u
      SET grupo_id = c.keep_id
      FROM dash_grupos_acesso g
      JOIN canon c ON c.tenant_id = g.tenant_id AND c.norm_nome = LOWER(TRIM(g.nome))
      WHERE u.grupo_id = g.id AND g.id <> c.keep_id;
    `);

    // 4. Remove registros duplicados mantendo o menor ID por (tenant_id, LOWER(TRIM(nome)))
    await db.query(`
      DELETE FROM dash_grupos_acesso g
      USING (
        SELECT tenant_id, LOWER(TRIM(nome)) AS norm_nome, MIN(id) AS keep_id
        FROM dash_grupos_acesso
        GROUP BY tenant_id, LOWER(TRIM(nome))
        HAVING COUNT(*) > 1
      ) c
      WHERE g.tenant_id = c.tenant_id
        AND LOWER(TRIM(g.nome)) = c.norm_nome
        AND g.id <> c.keep_id;
    `);

    // 5. Trava definitiva contra duplicidade concorrente
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_dash_grupos_acesso_tenant_nome
        ON dash_grupos_acesso (tenant_id, LOWER(TRIM(nome)));
    `);
  })().catch((err) => {
    globalSchemaPromise = null;
    throw err;
  });

  return globalSchemaPromise;
}

/**
 * Garante a criação da tabela e o seeding idempotente dos grupos padrão por tenant.
 */
async function ensureGruposTableAndSeeds(tenantId) {
  try {
    await ensureGlobalSchemaAndDeduplicate();
    if (!tenantId) return null;

    if (inFlightTenantSeeds.has(tenantId)) {
      return await inFlightTenantSeeds.get(tenantId);
    }

    const seedTask = (async () => {
      for (const seed of DEFAULT_GROUPS_SEED) {
        await db.query(
          `INSERT INTO dash_grupos_acesso (tenant_id, nome, descricao, permissoes_menus, permissoes_acoes, ativo)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, true)
           ON CONFLICT DO NOTHING`,
          [
            tenantId,
            seed.nome,
            seed.descricao,
            JSON.stringify(seed.permissoes_menus),
            JSON.stringify(seed.permissoes_acoes)
          ]
        );
      }

      const { rows: groupRows } = await db.query(
        `SELECT id, LOWER(TRIM(nome)) AS norm_nome
         FROM dash_grupos_acesso
         WHERE tenant_id = $1`,
        [tenantId]
      );

      const masterGroupId = groupRows.find((r) => r.norm_nome === 'master')?.id || null;
      const operacionalGroupId =
        groupRows.find((r) => r.norm_nome === 'operacional / frota')?.id ||
        groupRows.find((r) => r.norm_nome !== 'master')?.id ||
        masterGroupId;

      if (masterGroupId && operacionalGroupId) {
        // Vincula usuários sem grupo ou cujo grupo_id pertencia a outro tenant
        await db.query(
          `UPDATE dash_usuarios u
           SET grupo_id = CASE
             WHEN LOWER(COALESCE(u.role, '')) IN ('master', 'admin') THEN $1::int
             ELSE $2::int
           END
           WHERE u.tenant_id = $3
             AND (
               u.grupo_id IS NULL
               OR NOT EXISTS (
                 SELECT 1 FROM dash_grupos_acesso g
                 WHERE g.id = u.grupo_id AND g.tenant_id = u.tenant_id
               )
             )`,
          [masterGroupId, operacionalGroupId, tenantId]
        );
      }

      return masterGroupId;
    })();

    inFlightTenantSeeds.set(tenantId, seedTask);
    try {
      return await seedTask;
    } finally {
      inFlightTenantSeeds.delete(tenantId);
    }
  } catch (err) {
    logger.error('[GruposAcesso] Erro ao garantir grupos padrão', { error: err.message });
    return null;
  }
}

/**
 * Resolve um grupo_id garantindo que pertença ao tenant do usuário alvo.
 * Se o Super Admin Master selecionar um grupo do próprio tenant Master, resolve (ou replica)
 * automaticamente o grupo equivalente pelo nome dentro do tenant do usuário alvo.
 */
async function resolveGroupForTenant(targetTenantId, sourceGroupId) {
  if (!targetTenantId || !sourceGroupId) return null;
  await ensureGruposTableAndSeeds(targetTenantId);

  const { rows: srcRows } = await db.query(
    `SELECT id, tenant_id, nome, descricao, permissoes_menus, permissoes_acoes
     FROM dash_grupos_acesso
     WHERE id = $1
     LIMIT 1`,
    [parseInt(sourceGroupId, 10)]
  );

  if (srcRows.length === 0) return null;
  const src = srcRows[0];

  if (src.tenant_id === targetTenantId) {
    return src;
  }

  // Busca grupo de mesmo nome no tenant do usuário alvo
  const { rows: existing } = await db.query(
    `SELECT id, tenant_id, nome, descricao, permissoes_menus, permissoes_acoes
     FROM dash_grupos_acesso
     WHERE tenant_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2))
     LIMIT 1`,
    [targetTenantId, src.nome]
  );

  if (existing.length > 0) {
    return existing[0];
  }

  // Caso seja um perfil customizado criado pelo Master, replica no tenant alvo
  const { rows: created } = await db.query(
    `INSERT INTO dash_grupos_acesso (tenant_id, nome, descricao, permissoes_menus, permissoes_acoes, ativo)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, true)
     ON CONFLICT DO NOTHING
     RETURNING id, tenant_id, nome, descricao, permissoes_menus, permissoes_acoes`,
    [
      targetTenantId,
      src.nome.trim(),
      src.descricao || '',
      JSON.stringify(src.permissoes_menus || {}),
      JSON.stringify(src.permissoes_acoes || {})
    ]
  );

  if (created.length > 0) return created[0];

  const { rows: fallback } = await db.query(
    `SELECT id, tenant_id, nome, descricao, permissoes_menus, permissoes_acoes
     FROM dash_grupos_acesso
     WHERE tenant_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2))
     LIMIT 1`,
    [targetTenantId, src.nome]
  );
  return fallback[0] || null;
}

/**
 * GET /api/grupos-acesso
 * Lista todos os grupos de acesso do tenant sem duplicatas e com contagem de usuários
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
       ORDER BY
         CASE LOWER(TRIM(g.nome))
           WHEN 'master' THEN 1
           WHEN 'fiscal / emissão' THEN 2
           WHEN 'operacional / frota' THEN 3
           ELSE 4
         END,
         g.id ASC`,
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
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { nome, descricao, permissoes_menus, permissoes_acoes } = req.body;

    if (!nome || typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'Nome do grupo de acesso é obrigatório.' });
    }

    const cleanNome = nome.trim();
    await ensureGruposTableAndSeeds(tenantId);

    const dup = await db.query(
      `SELECT id FROM dash_grupos_acesso WHERE tenant_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2)) LIMIT 1`,
      [tenantId, cleanNome]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ error: `Já existe um grupo de acesso chamado "${cleanNome}" nesta empresa.` });
    }

    const { rows } = await db.query(
      `INSERT INTO dash_grupos_acesso (tenant_id, nome, descricao, permissoes_menus, permissoes_acoes, ativo)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, true)
       RETURNING *`,
      [
        tenantId,
        cleanNome,
        descricao || '',
        JSON.stringify(permissoes_menus || DEFAULT_MASTER_PERMISSIONS.permissoes_menus),
        JSON.stringify(permissoes_acoes || DEFAULT_MASTER_PERMISSIONS.permissoes_acoes)
      ]
    );

    res.json({ success: true, message: 'Grupo de acesso criado com sucesso!', data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um grupo de acesso com este nome nesta empresa.' });
    }
    next(err);
  }
});

/**
 * PUT /api/grupos-acesso/:id
 * Atualiza permissões e dados de um grupo de acesso
 */
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const groupId = parseInt(id, 10);
    const { nome, descricao, permissoes_menus, permissoes_acoes, ativo } = req.body;

    if (nome && typeof nome === 'string') {
      const dup = await db.query(
        `SELECT id FROM dash_grupos_acesso
         WHERE tenant_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2)) AND id <> $3
         LIMIT 1`,
        [tenantId, nome.trim(), groupId]
      );
      if (dup.rowCount > 0) {
        return res.status(409).json({ error: `Já existe outro grupo com o nome "${nome.trim()}".` });
      }
    }

    const { rows } = await db.query(
      `UPDATE dash_grupos_acesso
       SET nome = COALESCE($1, nome),
           descricao = COALESCE($2, descricao),
           permissoes_menus = COALESCE($3::jsonb, permissoes_menus),
           permissoes_acoes = COALESCE($4::jsonb, permissoes_acoes),
           ativo = COALESCE($5, ativo),
           updated_at = NOW()
       WHERE tenant_id = $6 AND id = $7
       RETURNING *`,
      [
        nome ? nome.trim() : null,
        descricao ?? null,
        permissoes_menus ? JSON.stringify(permissoes_menus) : null,
        permissoes_acoes ? JSON.stringify(permissoes_acoes) : null,
        ativo ?? null,
        tenantId,
        groupId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Grupo de acesso não localizado.' });
    }

    invalidateUserAuthCache();
    res.json({ success: true, message: 'Grupo de acesso atualizado com sucesso!', data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe outro grupo com este nome nesta empresa.' });
    }
    next(err);
  }
});

/**
 * DELETE /api/grupos-acesso/:id
 * Exclui um grupo de acesso e reatribui eventuais usuários vinculados
 */
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const groupId = parseInt(id, 10);

    const checkGroup = await db.query(
      `SELECT nome FROM dash_grupos_acesso WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, groupId]
    );
    if (checkGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Grupo de acesso não encontrado.' });
    }
    if (String(checkGroup.rows[0].nome).trim().toLowerCase() === 'master') {
      return res.status(400).json({ error: 'O grupo padrão Master não pode ser excluído.' });
    }

    const { rows: users } = await db.query(
      `SELECT COUNT(*)::int AS count FROM dash_usuarios WHERE tenant_id = $1 AND grupo_id = $2`,
      [tenantId, groupId]
    );

    if (users[0].count > 0) {
      const fallbackRes = await db.query(
        `SELECT id FROM dash_grupos_acesso
         WHERE tenant_id = $1 AND id <> $2
         ORDER BY
           CASE WHEN LOWER(TRIM(nome)) = 'operacional / frota' THEN 0 ELSE 1 END,
           id ASC
         LIMIT 1`,
        [tenantId, groupId]
      );
      if (fallbackRes.rows.length > 0) {
        await db.query(
          `UPDATE dash_usuarios SET grupo_id = $1 WHERE tenant_id = $2 AND grupo_id = $3`,
          [fallbackRes.rows[0].id, tenantId, groupId]
        );
      } else {
        await db.query(
          `UPDATE dash_usuarios SET grupo_id = NULL WHERE tenant_id = $1 AND grupo_id = $2`,
          [tenantId, groupId]
        );
      }
    }

    await db.query(
      `DELETE FROM dash_grupos_acesso WHERE tenant_id = $1 AND id = $2`,
      [tenantId, groupId]
    );

    invalidateUserAuthCache();
    res.json({ success: true, message: 'Grupo de acesso removido com sucesso!' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.ensureGruposTableAndSeeds = ensureGruposTableAndSeeds;
module.exports.resolveGroupForTenant = resolveGroupForTenant;
module.exports.DEFAULT_MASTER_PERMISSIONS = DEFAULT_MASTER_PERMISSIONS;
module.exports.DEFAULT_FISCAL_PERMISSIONS = DEFAULT_FISCAL_PERMISSIONS;
module.exports.DEFAULT_OPERACIONAL_PERMISSIONS = DEFAULT_OPERACIONAL_PERMISSIONS;
