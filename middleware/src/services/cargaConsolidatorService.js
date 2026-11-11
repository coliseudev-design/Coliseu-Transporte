'use strict';

const db = require('../db/postgres');
const logger = require('../config/logger');
const {
  normalizarTextoBusca,
  normalizarUf,
  extrairMetadadosChave44,
  resolverIbgeMunicipioAsync,
  resolverIbgeMunicipioSync,
} = require('../utils/ibgeMunicipios');

const tenantConsolidationCache = new Map();
const CONSOLIDATION_TTL_MS = 90 * 1000;

let _schemaConsolidatorReady = false;
async function ensureCargaConsolidatorSchema(runner = db) {
  if (_schemaConsolidatorReady && runner === db) return;
  try {
    await runner.query(`
      ALTER TABLE dash_cargas
        ADD COLUMN IF NOT EXISTS modelo_documento VARCHAR(4) DEFAULT '55',
        ADD COLUMN IF NOT EXISTS destinatario_codigo_ibge VARCHAR(7),
        ADD COLUMN IF NOT EXISTS destinatario_bairro VARCHAR(120),
        ADD COLUMN IF NOT EXISTS destinatario_cep VARCHAR(10),
        ADD COLUMN IF NOT EXISTS remetente_codigo_ibge VARCHAR(7),
        ADD COLUMN IF NOT EXISTS produto_ncm VARCHAR(10),
        ADD COLUMN IF NOT EXISTS regiao_nome VARCHAR(120),
        ADD COLUMN IF NOT EXISTS cliente_id_firebird INTEGER,
        ADD COLUMN IF NOT EXISTS venda_id_firebird INTEGER;

      CREATE TABLE IF NOT EXISTS dash_transporte_regioes (
        id SERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL,
        nome VARCHAR(120) NOT NULL,
        descricao VARCHAR(255),
        uf_padrao VARCHAR(2),
        cor VARCHAR(24) DEFAULT 'sky',
        cidades JSONB NOT NULL DEFAULT '[]'::jsonb,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_dash_transporte_regioes_tenant_nome UNIQUE (tenant_id, nome)
      );
    `);
    if (runner === db) _schemaConsolidatorReady = true;
  } catch (err) {
    logger.warn('[CargaConsolidator] Aviso ao garantir schema:', err.message);
  }
}

function digitsOnly(val) {
  return String(val || '').replace(/\D/g, '');
}

function parseCidadesJson(cidadesVal) {
  if (!cidadesVal) return [];
  if (Array.isArray(cidadesVal)) return cidadesVal;
  try {
    const parsed = JSON.parse(String(cidadesVal));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Monta mapa em memória de (UF:CIDADE_NORMALIZADA) e (CODIGO_IBGE) -> nome da Região de Entrega.
 * Prioridade:
 *   1. Regiões personalizadas de entrega (`dash_transporte_regioes`)
 *   2. Regiões sincronizadas do ERP (`dash_regioes.localizacao`)
 */
async function carregarMapaRegioesTenant(tenantId, runner = db) {
  const porIbge = new Map();
  const porUfCidade = new Map();
  const porCidadeSemUf = new Map();

  // 1. Regiões do ERP (dash_regioes)
  try {
    const { rows: erpRegs } = await runner.query(
      `SELECT cidade, uf, localizacao, cod_ibge
       FROM dash_regioes
       WHERE tenant_id = $1 AND localizacao IS NOT NULL AND TRIM(localizacao) <> ''`,
      [tenantId]
    );
    for (const r of erpRegs || []) {
      const regNome = String(r.localizacao || '').trim();
      if (!regNome) continue;
      const ufNorm = normalizarUf(r.uf);
      const cidNorm = normalizarTextoBusca(r.cidade);
      const codIbge = digitsOnly(r.cod_ibge);
      if (codIbge.length === 7 && !porIbge.has(codIbge)) porIbge.set(codIbge, regNome);
      if (ufNorm && cidNorm && !porUfCidade.has(`${ufNorm}:${cidNorm}`)) {
        porUfCidade.set(`${ufNorm}:${cidNorm}`, regNome);
      }
      if (cidNorm && !porCidadeSemUf.has(cidNorm)) porCidadeSemUf.set(cidNorm, regNome);
    }
  } catch (_) {
    // ignora se dash_regioes não existir
  }

  // 2. Regiões personalizadas de Transporte (dash_transporte_regioes — precedência máxima)
  try {
    const { rows: transpRegs } = await runner.query(
      `SELECT id, nome, uf_padrao, cidades
       FROM dash_transporte_regioes
       WHERE tenant_id = $1 AND ativo = TRUE
       ORDER BY id ASC`,
      [tenantId]
    );
    for (const reg of transpRegs || []) {
      const regNome = String(reg.nome || '').trim();
      if (!regNome) continue;
      const listaCidades = parseCidadesJson(reg.cidades);
      for (const item of listaCidades) {
        const cidadeItem = typeof item === 'string' ? item : item?.cidade || item?.nome;
        const ufItem = normalizarUf((typeof item === 'object' ? item?.uf : '') || reg.uf_padrao || '');
        const ibgeItem = digitsOnly(typeof item === 'object' ? item?.codigo_ibge || item?.ibge : '');
        const cidNorm = normalizarTextoBusca(cidadeItem);

        if (ibgeItem.length === 7) porIbge.set(ibgeItem, regNome);
        if (ufItem && cidNorm) porUfCidade.set(`${ufItem}:${cidNorm}`, regNome);
        if (cidNorm) porCidadeSemUf.set(cidNorm, regNome);
      }
    }
  } catch (_) {
    // ignora se tabela não existir em mock
  }

  return {
    resolverRegiao(codigoIbge, municipio, uf) {
      const cod = digitsOnly(codigoIbge);
      if (cod.length === 7 && porIbge.has(cod)) return porIbge.get(cod);
      const ufNorm = normalizarUf(uf);
      const cidNorm = normalizarTextoBusca(municipio);
      if (ufNorm && cidNorm && porUfCidade.has(`${ufNorm}:${cidNorm}`)) {
        return porUfCidade.get(`${ufNorm}:${cidNorm}`);
      }
      if (cidNorm && porCidadeSemUf.has(cidNorm)) {
        return porCidadeSemUf.get(cidNorm);
      }
      return null;
    },
  };
}

/**
 * Consolida e enriquece integralmente as NF-es do ERP de um tenant dentro do Coliseu Transporte:
 *  1. Faz backfill em `dash_cargas` de chaves NF-e de 44 dígitos presentes em `dash_vendas` ainda não importadas.
 *  2. Extrai `modelo_documento` (`55` = NF-e, `65` = NFC-e) pela Chave de Acesso.
 *  3. Cruza dados faltantes de Destinatário (`dash_clientes`), Remetente (`dash_emitentes` / `dash_filiais`)
 *     e Peso / Produto Predominante (`dash_vendas_itens` + `dash_produtos`).
 *  4. Resolve Código IBGE de 7 dígitos (`destinatario_codigo_ibge`) e Região de Entrega (`regiao_nome`).
 */
async function consolidarCargasErpTenant(tenantId, runner = db) {
  if (!tenantId) return { ok: false, inseridas_de_vendas: 0, enriquecidas: 0, ibge_resolvidos: 0 };

  await ensureCargaConsolidatorSchema(runner);

  let inseridasDeVendas = 0;
  let enriquecidas = 0;
  let ibgeResolvidos = 0;

  // 1. Backfill de NF-es presentes em dash_vendas (chave_nfe de 44 dígitos) ausentes em dash_cargas
  try {
    const insVendasRes = await runner.query(
      `WITH emit_padrao AS (
         SELECT cnpj, razao_social, municipio, uf, codigo_municipio
         FROM dash_emitentes
         WHERE tenant_id = $1 AND ativo = TRUE
         ORDER BY id ASC
         LIMIT 1
       ),
       itens_agg AS (
         SELECT
           vi.venda_id_firebird,
           SUM(COALESCE(vi.quantidade, 0) * COALESCE(pr.peso, 0))::numeric(15,3) AS peso_calculado,
           GREATEST(1, ROUND(SUM(COALESCE(vi.quantidade, 1))))::int AS volumes_calculados,
           (ARRAY_AGG(COALESCE(NULLIF(TRIM(vi.produto), ''), NULLIF(TRIM(pr.nome), '')) ORDER BY COALESCE(vi.valor_total, 0) DESC NULLS LAST))[1] AS prod_principal
         FROM dash_vendas_itens vi
         LEFT JOIN dash_produtos pr
           ON pr.tenant_id = vi.tenant_id
          AND pr.id_firebird = vi.produto_id_firebird
         WHERE vi.tenant_id = $1
         GROUP BY vi.venda_id_firebird
       )
       INSERT INTO dash_cargas (
         tenant_id, id_firebird, venda_id_firebird, cliente_id_firebird,
         tipo_documento, modelo_documento, chave_acesso, numero, serie, data_emissao,
         remetente_documento, remetente_nome, remetente_municipio, remetente_uf, remetente_codigo_ibge,
         destinatario_documento, destinatario_nome, destinatario_municipio, destinatario_uf,
         valor_total, valor_produtos, peso_bruto, peso_liquido, volumes, especie,
         produto_predominante, regiao_nome, status, dados_nfe
       )
       SELECT
         v.tenant_id,
         v.id_firebird,
         v.id_firebird,
         v.cliente_id_firebird,
         'NFE',
         SUBSTRING(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g') FROM 21 FOR 2),
         REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g'),
         COALESCE(
           NULLIF(TRIM(v.numero_nota), ''),
           LTRIM(SUBSTRING(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g') FROM 26 FOR 9), '0'),
           '1'
         ),
         COALESCE(
           NULLIF(LTRIM(SUBSTRING(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g') FROM 23 FOR 3), '0'), ''),
           '1'
         ),
         COALESCE(v.data_venda::date, CURRENT_DATE),
         COALESCE(ep.cnpj, SUBSTRING(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g') FROM 7 FOR 14)),
         COALESCE(ep.razao_social, 'EMITENTE ERP'),
         ep.municipio,
         COALESCE(ep.uf, 'MS'),
         ep.codigo_municipio,
         REGEXP_REPLACE(COALESCE(cl.documento, ''), '\\D', '', 'g'),
         COALESCE(NULLIF(TRIM(cl.razao_social), ''), NULLIF(TRIM(cl.nome), ''), 'DESTINATARIO ERP'),
         NULLIF(TRIM(cl.cidade), ''),
         NULLIF(UPPER(TRIM(cl.estado)), ''),
         COALESCE(v.valor_total, 0),
         COALESCE(v.valor_total, 0),
         COALESCE(ia.peso_calculado, 0),
         COALESCE(ia.peso_calculado, 0),
         COALESCE(ia.volumes_calculados, 1),
         COALESCE(NULLIF(TRIM(v.especie), ''), 'VOLUMES'),
         COALESCE(ia.prod_principal, 'MERCADORIAS DIVERSAS'),
         NULLIF(TRIM(cl.classificacao), ''),
         'PENDENTE',
         jsonb_build_object(
           'origem', 'CONSOLIDACAO_VENDAS_ERP',
           'cfop', v.cfop,
           'venda_id_firebird', v.id_firebird
         )
       FROM dash_vendas v
       LEFT JOIN emit_padrao ep ON TRUE
       LEFT JOIN dash_clientes cl
         ON cl.tenant_id = v.tenant_id
        AND cl.id_firebird = v.cliente_id_firebird
       LEFT JOIN itens_agg ia
         ON ia.venda_id_firebird = v.id_firebird
       WHERE v.tenant_id = $1
         AND v.chave_nfe IS NOT NULL
         AND LENGTH(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g')) = 44
         AND SUBSTRING(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g') FROM 21 FOR 2) IN ('55', '65')
         AND COALESCE(UPPER(TRIM(v.status)), '') NOT IN ('CANCELADO', 'CANCELADA', 'DENEGADO', 'DENEGADA', 'INUTILIZADO', 'INUTILIZADA')
         AND NOT EXISTS (
           SELECT 1 FROM dash_cargas cg
           WHERE cg.tenant_id = v.tenant_id
             AND cg.chave_acesso = REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g')
         )
       ON CONFLICT (tenant_id, chave_acesso) DO NOTHING`,
      [tenantId]
    );
    inseridasDeVendas = insVendasRes.rowCount || 0;
  } catch (err) {
    logger.debug('[CargaConsolidator] Backfill dash_vendas ignorado/parcial:', err.message);
  }

  // 2. Padroniza modelo_documento (55 vs 65), numero e serie pela chave de 44 dígitos
  try {
    await runner.query(
      `UPDATE dash_cargas
       SET modelo_documento = SUBSTRING(REGEXP_REPLACE(chave_acesso, '\\D', '', 'g') FROM 21 FOR 2),
           numero = COALESCE(NULLIF(TRIM(numero), ''), LTRIM(SUBSTRING(REGEXP_REPLACE(chave_acesso, '\\D', '', 'g') FROM 26 FOR 9), '0'), '1'),
           serie = COALESCE(NULLIF(TRIM(serie), ''), NULLIF(LTRIM(SUBSTRING(REGEXP_REPLACE(chave_acesso, '\\D', '', 'g') FROM 23 FOR 3), '0'), ''), '1')
       WHERE tenant_id = $1
         AND chave_acesso IS NOT NULL
         AND LENGTH(REGEXP_REPLACE(chave_acesso, '\\D', '', 'g')) = 44
         AND (
           modelo_documento IS NULL
           OR modelo_documento = ''
           OR (modelo_documento = '55' AND SUBSTRING(REGEXP_REPLACE(chave_acesso, '\\D', '', 'g') FROM 21 FOR 2) <> '55')
           OR numero IS NULL
           OR serie IS NULL
         )`,
      [tenantId]
    );
  } catch (_) {}

  // 3. Vincula venda_id_firebird / cliente_id_firebird e enriquece peso/produto predominante via dash_vendas + dash_vendas_itens + dash_produtos
  try {
    const enrVendas = await runner.query(
      `WITH vendas_match AS (
         SELECT
           v.id_firebird AS venda_fb,
           v.cliente_id_firebird AS cliente_fb,
           REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g') AS chave_limpa,
           ia.peso_calculado,
           ia.prod_principal
         FROM dash_vendas v
         LEFT JOIN (
           SELECT
             vi.venda_id_firebird,
             SUM(COALESCE(vi.quantidade, 0) * COALESCE(pr.peso, 0))::numeric(15,3) AS peso_calculado,
             (ARRAY_AGG(COALESCE(NULLIF(TRIM(vi.produto), ''), NULLIF(TRIM(pr.nome), '')) ORDER BY COALESCE(vi.valor_total, 0) DESC NULLS LAST))[1] AS prod_principal
           FROM dash_vendas_itens vi
           LEFT JOIN dash_produtos pr
             ON pr.tenant_id = vi.tenant_id
            AND pr.id_firebird = vi.produto_id_firebird
           WHERE vi.tenant_id = $1
           GROUP BY vi.venda_id_firebird
         ) ia ON ia.venda_id_firebird = v.id_firebird
         WHERE v.tenant_id = $1
           AND v.chave_nfe IS NOT NULL
           AND LENGTH(REGEXP_REPLACE(v.chave_nfe, '\\D', '', 'g')) = 44
       )
       UPDATE dash_cargas cg
       SET venda_id_firebird = COALESCE(cg.venda_id_firebird, vm.venda_fb),
           cliente_id_firebird = COALESCE(cg.cliente_id_firebird, vm.cliente_fb),
           peso_bruto = CASE
             WHEN COALESCE(cg.peso_bruto, 0) <= 0 AND COALESCE(vm.peso_calculado, 0) > 0 THEN vm.peso_calculado
             ELSE cg.peso_bruto
           END,
           produto_predominante = CASE
             WHEN (cg.produto_predominante IS NULL OR TRIM(cg.produto_predominante) = '' OR UPPER(TRIM(cg.produto_predominante)) IN ('MERCADORIA EM GERAL', 'MERCADORIAS DIVERSAS'))
                  AND vm.prod_principal IS NOT NULL THEN vm.prod_principal
             ELSE cg.produto_predominante
           END
       FROM vendas_match vm
       WHERE cg.tenant_id = $1
         AND cg.chave_acesso = vm.chave_limpa
         AND (
           cg.venda_id_firebird IS NULL
           OR cg.cliente_id_firebird IS NULL
           OR COALESCE(cg.peso_bruto, 0) <= 0
           OR cg.produto_predominante IS NULL
           OR TRIM(cg.produto_predominante) = ''
         )`,
      [tenantId]
    );
    enriquecidas += enrVendas.rowCount || 0;
  } catch (_) {}

  // 4. Enriquece Destinatário (Cidade, UF, Documento, Nome, Classificação/Região) cruzando com dash_clientes
  try {
    const enrCli = await runner.query(
      `UPDATE dash_cargas cg
       SET destinatario_documento = COALESCE(NULLIF(TRIM(cg.destinatario_documento), ''), REGEXP_REPLACE(COALESCE(cl.documento, ''), '\\D', '', 'g')),
           destinatario_nome = COALESCE(NULLIF(TRIM(cg.destinatario_nome), ''), NULLIF(TRIM(cl.razao_social), ''), NULLIF(TRIM(cl.nome), '')),
           destinatario_municipio = COALESCE(NULLIF(TRIM(cg.destinatario_municipio), ''), NULLIF(TRIM(cl.cidade), '')),
           destinatario_uf = COALESCE(NULLIF(TRIM(cg.destinatario_uf), ''), NULLIF(UPPER(TRIM(cl.estado)), '')),
           regiao_nome = COALESCE(NULLIF(TRIM(cg.regiao_nome), ''), NULLIF(TRIM(cl.classificacao), ''))
       FROM dash_clientes cl
       WHERE cg.tenant_id = $1
         AND cl.tenant_id = $1
         AND (
           (cg.cliente_id_firebird IS NOT NULL AND cl.id_firebird = cg.cliente_id_firebird)
           OR (
             cg.destinatario_documento IS NOT NULL
             AND LENGTH(REGEXP_REPLACE(cg.destinatario_documento, '\\D', '', 'g')) >= 11
             AND REGEXP_REPLACE(cl.documento, '\\D', '', 'g') = REGEXP_REPLACE(cg.destinatario_documento, '\\D', '', 'g')
           )
         )
         AND (
           cg.destinatario_municipio IS NULL OR TRIM(cg.destinatario_municipio) = ''
           OR cg.destinatario_uf IS NULL OR TRIM(cg.destinatario_uf) = ''
           OR cg.destinatario_nome IS NULL OR TRIM(cg.destinatario_nome) = ''
           OR cg.destinatario_documento IS NULL OR TRIM(cg.destinatario_documento) = ''
         )`,
      [tenantId]
    );
    enriquecidas += enrCli.rowCount || 0;
  } catch (_) {}

  // 5. Enriquece Remetente padrão pela Empresa Emitente quando ausente
  try {
    await runner.query(
      `UPDATE dash_cargas cg
       SET remetente_documento = COALESCE(NULLIF(TRIM(cg.remetente_documento), ''), em.cnpj),
           remetente_nome = COALESCE(NULLIF(TRIM(cg.remetente_nome), ''), em.razao_social),
           remetente_municipio = COALESCE(NULLIF(TRIM(cg.remetente_municipio), ''), em.municipio),
           remetente_uf = COALESCE(NULLIF(TRIM(cg.remetente_uf), ''), em.uf),
           remetente_codigo_ibge = COALESCE(NULLIF(TRIM(cg.remetente_codigo_ibge), ''), em.codigo_municipio)
       FROM (
         SELECT cnpj, razao_social, municipio, uf, codigo_municipio
         FROM dash_emitentes
         WHERE tenant_id = $1 AND ativo = TRUE
         ORDER BY id ASC
         LIMIT 1
       ) em
       WHERE cg.tenant_id = $1
         AND (
           cg.remetente_municipio IS NULL OR TRIM(cg.remetente_municipio) = ''
           OR cg.remetente_uf IS NULL OR TRIM(cg.remetente_uf) = ''
           OR cg.remetente_codigo_ibge IS NULL OR TRIM(cg.remetente_codigo_ibge) = ''
         )`,
      [tenantId]
    );
  } catch (_) {}

  // 6. Resolve Código IBGE de 7 dígitos, UF normalizada (2 letras) e Região de Entrega por grupo distinto (Município, UF)
  try {
    const mapaRegioes = await carregarMapaRegioesTenant(tenantId, runner);
    const { rows: gruposDestino } = await runner.query(
      `SELECT DISTINCT
         destinatario_municipio,
         destinatario_uf,
         destinatario_codigo_ibge,
         dados_nfe->'destinatario'->>'codigo_municipio' AS json_ibge,
         dados_nfe->'destinatario'->>'cep' AS json_cep,
         dados_nfe->'destinatario'->>'bairro' AS json_bairro
       FROM dash_cargas
       WHERE tenant_id = $1
         AND (destinatario_municipio IS NOT NULL OR destinatario_codigo_ibge IS NOT NULL OR dados_nfe IS NOT NULL)`,
      [tenantId]
    );

    for (const grp of gruposDestino || []) {
      const munRaw = grp.destinatario_municipio;
      const ufRaw = grp.destinatario_uf;
      const ibgeCand = digitsOnly(grp.destinatario_codigo_ibge || grp.json_ibge);

      if (!munRaw && !ibgeCand) continue;

      const ibgeRes = await resolverIbgeMunicipioAsync(runner, ibgeCand, munRaw, ufRaw);
      const regiaoCalculada = mapaRegioes.resolverRegiao(
        ibgeRes.exato ? ibgeRes.codigo : ibgeCand,
        munRaw || ibgeRes.nome,
        ibgeRes.uf || ufRaw
      );

      const codigoParaGravar = ibgeRes.exato ? ibgeRes.codigo : (ibgeCand.length === 7 ? ibgeCand : null);
      const ufParaGravar = normalizarUf(ufRaw) || ibgeRes.uf || null;

      if (!codigoParaGravar && !regiaoCalculada && (!ufRaw || ufRaw === ufParaGravar)) {
        continue;
      }

      const updRes = await runner.query(
        `UPDATE dash_cargas
         SET destinatario_codigo_ibge = COALESCE($2, destinatario_codigo_ibge),
             destinatario_uf = COALESCE($3, destinatario_uf),
             regiao_nome = COALESCE($4, regiao_nome),
             destinatario_cep = COALESCE(destinatario_cep, NULLIF(REGEXP_REPLACE(dados_nfe->'destinatario'->>'cep', '\\D', '', 'g'), '')),
             destinatario_bairro = COALESCE(destinatario_bairro, NULLIF(TRIM(dados_nfe->'destinatario'->>'bairro'), ''))
         WHERE tenant_id = $1
           AND COALESCE(destinatario_municipio, '') IS NOT DISTINCT FROM COALESCE($5, '')
           AND COALESCE(destinatario_uf, '') IS NOT DISTINCT FROM COALESCE($6, '')
           AND (
             (destinatario_codigo_ibge IS DISTINCT FROM COALESCE($2, destinatario_codigo_ibge))
             OR (destinatario_uf IS DISTINCT FROM COALESCE($3, destinatario_uf))
             OR ($4::varchar IS NOT NULL AND regiao_nome IS DISTINCT FROM $4)
           )`,
        [tenantId, codigoParaGravar, ufParaGravar, regiaoCalculada, munRaw, ufRaw]
      );
      ibgeResolvidos += updRes.rowCount || 0;
    }
  } catch (err) {
    logger.warn('[CargaConsolidator] Aviso ao resolver IBGE/Região em lote:', err.message);
  }

  tenantConsolidationCache.set(String(tenantId), Date.now());

  return {
    ok: true,
    inseridas_de_vendas: inseridasDeVendas,
    enriquecidas,
    ibge_resolvidos: ibgeResolvidos,
  };
}

/**
 * Executa consolidação de cargas com throttle de 90s por tenant (ou imediata com `force: true`).
 */
async function consolidarCargasSeNecessario(tenantId, opts = {}) {
  if (!tenantId) return null;
  const key = String(tenantId);
  const agora = Date.now();
  const ultimo = tenantConsolidationCache.get(key) || 0;
  if (!opts.force && agora - ultimo < CONSOLIDATION_TTL_MS) {
    return { ok: true, cached: true };
  }
  tenantConsolidationCache.set(key, agora);
  return await consolidarCargasErpTenant(tenantId, opts.runner || db);
}

function invalidarCacheConsolidacaoTenant(tenantId) {
  if (tenantId) tenantConsolidationCache.delete(String(tenantId));
}

/**
 * Normaliza campos adicionais em linha individual de `dash_cargas` durante o sync em tempo real.
 */
function enriquecerLinhaCargaSync(row) {
  if (!row || typeof row !== 'object') return row;

  const meta = extrairMetadadosChave44(row.chave_acesso);
  if (meta) {
    row.modelo_documento = meta.modelo;
    if (!row.numero) row.numero = meta.numero;
    if (!row.serie) row.serie = meta.serie;
    if (!row.remetente_uf && meta.uf_emitente) row.remetente_uf = meta.uf_emitente;
  } else if (row.modelo_documento) {
    row.modelo_documento = digitsOnly(row.modelo_documento).slice(0, 4) || '55';
  }

  if (row.destinatario_uf) {
    const ufN = normalizarUf(row.destinatario_uf);
    if (ufN) row.destinatario_uf = ufN;
  }
  if (row.remetente_uf) {
    const ufR = normalizarUf(row.remetente_uf);
    if (ufR) row.remetente_uf = ufR;
  }

  const destIbge = digitsOnly(
    row.destinatario_codigo_ibge ||
      row.destinatario_codigo_municipio ||
      row.dados_nfe?.destinatario?.codigo_municipio
  );
  if (destIbge.length === 7) {
    row.destinatario_codigo_ibge = destIbge;
  } else if (row.destinatario_municipio) {
    const resSync = resolverIbgeMunicipioSync('', row.destinatario_municipio, row.destinatario_uf);
    if (resSync.exato) {
      row.destinatario_codigo_ibge = resSync.codigo;
      if (!row.destinatario_uf) row.destinatario_uf = resSync.uf;
    }
  }

  const remIbge = digitsOnly(
    row.remetente_codigo_ibge ||
      row.remetente_codigo_municipio ||
      row.dados_nfe?.remetente?.codigo_municipio
  );
  if (remIbge.length === 7) {
    row.remetente_codigo_ibge = remIbge;
  } else if (row.remetente_municipio) {
    const resRem = resolverIbgeMunicipioSync('', row.remetente_municipio, row.remetente_uf);
    if (resRem.exato) {
      row.remetente_codigo_ibge = resRem.codigo;
    }
  }

  const regiaoCand =
    row.regiao_nome ||
    row.regiao ||
    row.nome_regiao ||
    row.rota ||
    row.nome_rota ||
    row.praca ||
    row.localizacao ||
    row.setor_entrega;
  if (regiaoCand && String(regiaoCand).trim()) {
    row.regiao_nome = String(regiaoCand).trim().slice(0, 120);
  }

  const cliFb = row.cliente_id_firebird ?? row.id_cliente ?? row.cod_cliente ?? row.cliente_codigo;
  if (cliFb !== undefined && cliFb !== null && cliFb !== '') {
    const parsedCli = parseInt(String(cliFb), 10);
    if (!Number.isNaN(parsedCli)) row.cliente_id_firebird = parsedCli;
  }

  const venFb = row.venda_id_firebird ?? row.id_venda ?? row.cod_venda;
  if (venFb !== undefined && venFb !== null && venFb !== '') {
    const parsedVen = parseInt(String(venFb), 10);
    if (!Number.isNaN(parsedVen)) row.venda_id_firebird = parsedVen;
  }

  if (!row.destinatario_cep && row.dados_nfe?.destinatario?.cep) {
    row.destinatario_cep = digitsOnly(row.dados_nfe.destinatario.cep).slice(0, 10);
  }
  if (!row.destinatario_bairro && row.dados_nfe?.destinatario?.bairro) {
    row.destinatario_bairro = String(row.dados_nfe.destinatario.bairro).trim().slice(0, 120);
  }

  const ncmItem = digitsOnly(
    row.produto_ncm ||
      row.ncm ||
      row.ncm_predominante ||
      row.dados_nfe?.itens?.[0]?.ncm
  );
  if (ncmItem.length === 8) {
    row.produto_ncm = ncmItem;
  }

  return row;
}

module.exports = {
  ensureCargaConsolidatorSchema,
  carregarMapaRegioesTenant,
  consolidarCargasErpTenant,
  consolidarCargasSeNecessario,
  invalidarCacheConsolidacaoTenant,
  enriquecerLinhaCargaSync,
};
