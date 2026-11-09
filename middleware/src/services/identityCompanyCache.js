'use strict';

const config = require('../config/env');
const db = require('../db/postgres');
const logger = require('../config/logger');

const MASTER_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const MEMORY_TTL_MS = 5 * 60 * 1000; // 5 minutos

const memoryCache = new Map();
const inFlight = new Map();
let cacheTablePromise = null;

async function ensureCacheTable() {
  if (cacheTablePromise) return cacheTablePromise;
  cacheTablePromise = db
    .query(`
      CREATE TABLE IF NOT EXISTS dash_tenants_cache (
        tenant_id UUID PRIMARY KEY,
        nome_admin_licencas VARCHAR(255),
        modulo_transporte_ativo BOOLEAN DEFAULT FALSE,
        device_limit INT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    .catch((err) => {
      cacheTablePromise = null;
      logger.warn('[IdentityCache] Aviso ao criar dash_tenants_cache', { error: err.message });
    });
  return cacheTablePromise;
}

async function fetchJsonWithTimeout(url, apiKey, timeoutMs = 2800) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': apiKey
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (res.status !== 200) {
    return { status: res.status, data: null };
  }
  const data = await res.json().catch(() => null);
  return { status: 200, data };
}

async function queryIdentityServer(tenantId) {
  const { identityApiUrl, identityInternalKey, expectedModuleSlug } = config.security;
  if (!identityApiUrl || !identityInternalKey) return null;

  const baseUrl = identityApiUrl.replace(/\/+$/, '');
  const slug = expectedModuleSlug || 'coliseu-transporte';

  // 1. Consulta principal no módulo Coliseu Transporte
  try {
    const primary = await fetchJsonWithTimeout(
      `${baseUrl}/internal/companies/${encodeURIComponent(tenantId)}/modules/${encodeURIComponent(slug)}/info`,
      identityInternalKey
    );

    if (primary.status === 200 && primary.data) {
      const nome = String(primary.data.nomeDaEmpresa || '').trim() || null;
      return {
        nome,
        moduloTransporteAtivo: primary.data.valid !== false,
        deviceLimit: Number(primary.data.deviceLimit || 0)
      };
    }
  } catch (err) {
    logger.warn('[IdentityCache] Timeout/erro ao consultar módulo transporte no Admin Licenças', {
      tenantId,
      error: err.message
    });
  }

  // 2. Fallback para empresas do banco compartilhado que possuem outros módulos no Admin Licenças
  const fallbackUrls = [
    `${baseUrl}/internal/companies/${encodeURIComponent(tenantId)}/modules/coliseu-dash/info`,
    `${baseUrl}/internal/companies/${encodeURIComponent(tenantId)}/modules/coliseu-flow/info`,
    `${baseUrl}/internal/companies/${encodeURIComponent(tenantId)}/branches`
  ];

  const settled = await Promise.allSettled(
    fallbackUrls.map((u) => fetchJsonWithTimeout(u, identityInternalKey, 2500))
  );

  for (let i = 0; i < 2; i++) {
    const item = settled[i];
    if (item.status === 'fulfilled' && item.value.status === 200 && item.value.data?.nomeDaEmpresa) {
      return {
        nome: String(item.value.data.nomeDaEmpresa).trim(),
        moduloTransporteAtivo: false,
        deviceLimit: 0
      };
    }
  }

  const branchesRes = settled[2];
  if (
    branchesRes.status === 'fulfilled' &&
    branchesRes.value.status === 200 &&
    Array.isArray(branchesRes.value.data) &&
    branchesRes.value.data.length > 0
  ) {
    const defaultBranch =
      branchesRes.value.data.find((b) => b.isDefault && b.name) || branchesRes.value.data[0];
    if (defaultBranch?.name) {
      return {
        nome: String(defaultBranch.name).trim(),
        moduloTransporteAtivo: false,
        deviceLimit: 0
      };
    }
  }

  return {
    nome: null,
    moduloTransporteAtivo: false,
    deviceLimit: 0
  };
}

/**
 * Resolve o nome oficial da empresa conforme cadastrado no Admin Licenças (Identity Server),
 * com cache em memória (5 min) e fallback persistido em PostgreSQL.
 */
async function resolveIdentityCompanyInfo(tenantId, { forceRefresh = false } = {}) {
  const cleanId = String(tenantId || '').trim();
  if (!cleanId) return null;

  if (cleanId === MASTER_TENANT_ID) {
    return {
      nome: 'Coliseu Sistemas (Master)',
      moduloTransporteAtivo: true,
      deviceLimit: 999
    };
  }

  const now = Date.now();
  if (!forceRefresh) {
    const cached = memoryCache.get(cleanId);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  if (inFlight.has(cleanId)) {
    return inFlight.get(cleanId);
  }

  const promise = (async () => {
    await ensureCacheTable();

    const liveInfo = await queryIdentityServer(cleanId);
    if (liveInfo && liveInfo.nome) {
      memoryCache.set(cleanId, { value: liveInfo, expiresAt: Date.now() + MEMORY_TTL_MS });
      await db
        .query(
          `INSERT INTO dash_tenants_cache (tenant_id, nome_admin_licencas, modulo_transporte_ativo, device_limit, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (tenant_id) DO UPDATE SET
             nome_admin_licencas = EXCLUDED.nome_admin_licencas,
             modulo_transporte_ativo = EXCLUDED.modulo_transporte_ativo,
             device_limit = EXCLUDED.device_limit,
             updated_at = NOW()`,
          [cleanId, liveInfo.nome, liveInfo.moduloTransporteAtivo, liveInfo.deviceLimit]
        )
        .catch(() => {});
      return liveInfo;
    }

    // Fallback no cache persistido caso o servidor de licenças esteja temporariamente indisponível
    try {
      const { rows } = await db.query(
        `SELECT nome_admin_licencas, modulo_transporte_ativo, device_limit
         FROM dash_tenants_cache
         WHERE tenant_id = $1
         LIMIT 1`,
        [cleanId]
      );
      if (rows.length > 0 && rows[0].nome_admin_licencas) {
        const persisted = {
          nome: rows[0].nome_admin_licencas,
          moduloTransporteAtivo: Boolean(rows[0].modulo_transporte_ativo),
          deviceLimit: Number(rows[0].device_limit || 0)
        };
        memoryCache.set(cleanId, { value: persisted, expiresAt: Date.now() + 60 * 1000 });
        return persisted;
      }
    } catch (_) {
      // ignora erro de leitura de cache
    }

    const emptyVal = liveInfo || { nome: null, moduloTransporteAtivo: false, deviceLimit: 0 };
    memoryCache.set(cleanId, { value: emptyVal, expiresAt: Date.now() + 60 * 1000 });
    return emptyVal;
  })();

  inFlight.set(cleanId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(cleanId);
  }
}

/**
 * Resolve múltiplos tenant_ids em paralelo com deduplicação automática.
 * @param {string[]} tenantIds
 * @returns {Promise<Map<string, { nome: string|null, moduloTransporteAtivo: boolean, deviceLimit: number }>>}
 */
async function resolveManyIdentityCompanies(tenantIds = []) {
  const uniqueIds = Array.from(
    new Set(
      (tenantIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );

  const entries = await Promise.all(
    uniqueIds.map(async (id) => [id, await resolveIdentityCompanyInfo(id)])
  );

  return new Map(entries);
}

module.exports = {
  resolveIdentityCompanyInfo,
  resolveManyIdentityCompanies
};
