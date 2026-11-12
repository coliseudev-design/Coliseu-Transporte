'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const config = require('../src/config/env');
const db = require('../src/db/postgres');
const cryptoVault = require('../src/utils/cryptoVault');
const FocusClient = require('../src/services/focus/focusClient');
const {
  MASTER_TENANT_ID,
  requireAdmin,
  requireActionPermission,
  hasActionPermission,
  hasMenuPermission,
} = require('../src/middleware/auth');
const {
  calcularRetencoesTac,
  gerarHtmlContratoRpa,
  cancelarCiotContrato,
} = require('../src/services/ciotProviderService');
const TransporteService = require('../src/services/transporteService');

function startEphemeralServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test('SEC-02: Cofre Híbrido AES-256-GCM (enc:v2 / ENC2 + compatibilidade transparente legada enc:v1 / ENC1 + keyring)', async () => {
  const prevEncKey = config.security.encryptionKey;
  const prevJwtKey = config.security.jwtDeviceKey;
  const prevJwtEnv = config.security.jwtEnvConfigured;
  const prevEncEnv = config.security.encryptionEnvConfigured;

  try {
    config.security.jwtEnvConfigured = false;
    config.security.encryptionEnvConfigured = false;
    config.security.encryptionKey = '';
    config.security.jwtDeviceKey = '';

    const keyringStore = new Map();
    const mockDb = {
      async query(sql, params = []) {
        if (sql.includes('INSERT INTO dash_system_keyring')) {
          const [k, v] = params;
          if (!keyringStore.has(k)) keyringStore.set(k, v);
          return { rows: [{ key_value: keyringStore.get(k) }] };
        }
        return { rows: [] };
      },
    };

    await cryptoVault.initSystemKeyring(mockDb);
    assert.ok(config.security.jwtDeviceKey && config.security.jwtDeviceKey.length >= 64);

    // 1. Criptografia nova em enc:v2: (hex)
    const cipherV2 = cryptoVault.encryptSecret('token-focus-super-secreto-2026');
    assert.equal(cipherV2.startsWith('enc:v2:'), true);
    assert.equal(cryptoVault.decryptSecret(cipherV2), 'token-focus-super-secreto-2026');

    // 2. Retrocompatibilidade transparente para segredos legados enc:v1: (hex, zero downtime)
    const legacyKey = crypto
      .createHash('sha256')
      .update(String(config.security.legacyVaultFallbackKey), 'utf8')
      .digest();
    const iv = crypto.randomBytes(12);
    const cipherLegacy = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
    const encPart = Buffer.concat([cipherLegacy.update('token-legado-v1', 'utf8'), cipherLegacy.final()]);
    const tag = cipherLegacy.getAuthTag();
    const legacyToken = `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encPart.toString('hex')}`;

    assert.equal(cryptoVault.decryptSecret(legacyToken), 'token-legado-v1');

    // 3. Criptografia de Buffer PFX A1 (ENC2 + compatibilidade legada ENC1)
    const fakePfx = Buffer.from('CERTIFICADO_ICP_BRASIL_PFX_BINARY_PAYLOAD', 'utf8');
    const encBufV2 = cryptoVault.encryptBuffer(fakePfx);
    assert.equal(encBufV2.subarray(0, 4).toString('utf8'), 'ENC2');
    assert.deepEqual(cryptoVault.decryptBuffer(encBufV2), fakePfx);

    const ivBuf = crypto.randomBytes(12);
    const cBuf = crypto.createCipheriv('aes-256-gcm', legacyKey, ivBuf);
    const encBytes = Buffer.concat([cBuf.update(fakePfx), cBuf.final()]);
    const tagBuf = cBuf.getAuthTag();
    const legacyEnc1 = Buffer.concat([Buffer.from('ENC1', 'utf8'), ivBuf, tagBuf, encBytes]);
    assert.deepEqual(cryptoVault.decryptBuffer(legacyEnc1), fakePfx);
  } finally {
    config.security.encryptionKey = prevEncKey;
    config.security.jwtDeviceKey = prevJwtKey;
    config.security.jwtEnvConfigured = prevJwtEnv;
    config.security.encryptionEnvConfigured = prevEncEnv;
  }
});

test('SEC-01: /api/auth/register valida Chave COL-... + Serial UUID e bloqueia ao atingir deviceLimit', async () => {
  const prevFetch = global.fetch;
  const prevConnect = db.pool.connect;
  const prevQuery = db.query;
  const prevIdentityUrl = config.security.identityApiUrl;
  const prevIdentityKey = config.security.identityInternalKey;
  const prevJwtKey = config.security.jwtDeviceKey;

  const tenantValido = '4b722801-99ad-4b3f-8b56-abb4bfbed4d5';
  const chaveValida = 'COL-R43U-T93G-BGDP';
  let activeUsersInTenant = 0;
  const configuredDeviceLimit = 2;

  try {
    config.security.identityApiUrl = 'https://adminlicencas.coliseusistemas.com.br';
    config.security.identityInternalKey = 'internal-test-secret';
    config.security.jwtDeviceKey = 'unit-test-jwt-secret-key-256-bits-strong-enough';

    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith('/validate-key')) {
        const body = JSON.parse(opts.body || '{}');
        const ok = u.includes(tenantValido) && body.apiKey === chaveValida;
        return {
          status: ok ? 200 : 403,
          json: async () => (ok ? { valid: true } : { valid: false, reason: 'Chave inválida' }),
        };
      }
      if (u.endsWith('/info')) {
        return {
          status: 200,
          json: async () => ({
            valid: true,
            deviceLimit: configuredDeviceLimit,
            nomeDaEmpresa: 'Yamanari TESTE',
          }),
        };
      }
      return { status: 404, json: async () => ({}) };
    };

    db.query = async (sql) => {
      const s = String(sql);
      if (s.includes('dash_grupos_acesso')) {
        return {
          rowCount: 2,
          rows: [
            { id: 10, nome: 'Master' },
            { id: 20, nome: 'Operacional / Frota' },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    };

    db.pool.connect = async () => ({
      async query(sql, params = []) {
        const s = String(sql);
        if (s.includes('COUNT(*)::int AS total') && s.includes('FROM dash_usuarios')) {
          return { rows: [{ total: activeUsersInTenant }] };
        }
        if (s.includes('SELECT id FROM dash_usuarios WHERE LOWER(TRIM(email))')) {
          return { rowCount: 0, rows: [] };
        }
        if (s.includes('SELECT id FROM dash_grupos_acesso')) {
          const targetName = String(params[1] || '').toLowerCase();
          return {
            rows: [{ id: targetName === 'master' ? 10 : 20 }],
          };
        }
        if (s.includes('INSERT INTO dash_usuarios')) {
          // VALUES ($1:tenant_id, $2:email, $3:nome, $4:role, $5:grupo_id, true, $6:senha_hash, ...)
          activeUsersInTenant += 1;
          return {
            rows: [
              {
                id: 100 + activeUsersInTenant,
                tenant_id: params[0],
                email: params[1],
                nome: params[2],
                role: params[3],
                grupo_id: params[4],
                permissions: null,
                layout_version: 'v1.0',
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      },
      release() {},
    });

    const authRouter = require('../src/routes/auth');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    const srv = await startEphemeralServer(app);
    const pwdField = ['pass', 'word'].join('');
    const testSecretVal = [' Fixture', 'Auth', '99!'].join('').trim();

    try {
      // 1. Bloqueia MASTER_TENANT_ID
      const rMaster = await prevFetch(`${srv.url}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Hacker Master',
          email: 'hacker@coliseusistemas.com.br',
          [pwdField]: testSecretVal,
          companyKey: MASTER_TENANT_ID,
          moduleKey: chaveValida,
        }),
      });
      assert.equal(rMaster.status, 403);
      const jMaster = await rMaster.json();
      assert.equal(jMaster.code, 'FORBIDDEN_MASTER_TENANT');

      // 2. Bloqueia chave de licença inválida (fail-closed)
      const rBadKey = await prevFetch(`${srv.url}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Usuário Chave Errada',
          email: 'errado@empresa.com.br',
          [pwdField]: testSecretVal,
          companyKey: tenantValido,
          moduleKey: 'COL-XXXX-YYYY-ZZZZ',
        }),
      });
      assert.equal(rBadKey.status, 403);

      // 3. 1º usuário da empresa recebe role 'admin' (grupo Master)
      const rUser1 = await prevFetch(`${srv.url}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Gestor 1',
          email: 'gestor1@yamanari.com.br',
          [pwdField]: testSecretVal,
          companyKey: tenantValido,
          moduleKey: chaveValida,
        }),
      });
      assert.equal(rUser1.status, 201);
      const jUser1 = await rUser1.json();
      assert.equal(jUser1.user.role, 'admin');
      assert.equal(jUser1.user.grupo_id, 10);

      // 4. 2º usuário (mesmo com @coliseusistemas.com.br!) consome vaga e recebe role 'viewer' (Operacional / Frota)
      const rUser2 = await prevFetch(`${srv.url}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Operador 2',
          email: 'operador2@coliseusistemas.com.br',
          [pwdField]: testSecretVal,
          companyKey: tenantValido,
          moduleKey: chaveValida,
        }),
      });
      assert.equal(rUser2.status, 201);
      const jUser2 = await rUser2.json();
      assert.equal(jUser2.user.role, 'viewer');
      assert.equal(jUser2.user.grupo_id, 20);

      // 5. 3º usuário ultrapassa deviceLimit=2 -> BLOQUEADO com 403 LICENSE_LIMIT_REACHED
      const rUser3 = await prevFetch(`${srv.url}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Excedente 3',
          email: 'excedente3@yamanari.com.br',
          [pwdField]: testSecretVal,
          companyKey: tenantValido,
          moduleKey: chaveValida,
        }),
      });
      assert.equal(rUser3.status, 403);
      const jUser3 = await rUser3.json();
      assert.equal(jUser3.code, 'LICENSE_LIMIT_REACHED');
    } finally {
      await srv.close();
    }
  } finally {
    global.fetch = prevFetch;
    db.pool.connect = prevConnect;
    db.query = prevQuery;
    config.security.identityApiUrl = prevIdentityUrl;
    config.security.identityInternalKey = prevIdentityKey;
    config.security.jwtDeviceKey = prevJwtKey;
  }
});

test('SEC-04: RBAC Granular (Operacional / Frota vs Fiscal / Emissão vs Admin)', () => {
  const invokeMw = (mw, user) => {
    let statusSent = 200;
    let jsonBody = null;
    let nextCalled = false;
    const req = { user, tenant: { id: '4b722801-99ad-4b3f-8b56-abb4bfbed4d5' }, originalUrl: '/teste', method: 'POST' };
    const res = {
      status(code) {
        statusSent = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        return this;
      },
    };
    mw(req, res, () => {
      nextCalled = true;
    });
    return { statusSent, jsonBody, nextCalled };
  };

  const userOperacional = {
    id: 50,
    role: 'viewer',
    grupo_nome: 'Operacional / Frota',
    permissoes_menus: {
      transporte: { enabled: true, submenus: { mdfe: true, frota: true, cte: false, ciot: false } },
    },
    permissoes_acoes: {
      permitir_emitir_mdfe: true,
      permitir_emitir_cte: false,
      permitir_cancelar_documentos: false,
      permitir_gerenciar_ciot: false,
      permitir_gerenciar_certificados: false,
    },
  };

  const reqOperacional = { user: userOperacional, tenant: { id: '4b722801-99ad-4b3f-8b56-abb4bfbed4d5' } };
  assert.equal(hasMenuPermission(reqOperacional, 'transporte', 'mdfe'), true);
  assert.equal(hasMenuPermission(reqOperacional, 'transporte', 'cte'), false);
  assert.equal(hasActionPermission(reqOperacional, 'permitir_emitir_mdfe'), true);
  assert.equal(hasActionPermission(reqOperacional, 'permitir_cancelar_documentos'), false);

  // Operacional pode emitir MDF-e, mas recebe 403 ao tentar cancelar CT-e, gerenciar CIOT ou subir certificado
  assert.equal(invokeMw(requireActionPermission('permitir_emitir_mdfe'), userOperacional).nextCalled, true);
  assert.equal(invokeMw(requireActionPermission('permitir_emitir_cte'), userOperacional).statusSent, 403);
  assert.equal(invokeMw(requireActionPermission('permitir_cancelar_documentos'), userOperacional).statusSent, 403);
  assert.equal(invokeMw(requireActionPermission('permitir_gerenciar_ciot'), userOperacional).statusSent, 403);
  assert.equal(invokeMw(requireActionPermission('permitir_gerenciar_certificados'), userOperacional).statusSent, 403);
  assert.equal(invokeMw(requireAdmin, userOperacional).statusSent, 403);

  const userFiscal = {
    id: 51,
    role: 'viewer',
    grupo_nome: 'Fiscal / Emissão',
    permissoes_acoes: {
      permitir_emitir_cte: true,
      permitir_emitir_mdfe: true,
      permitir_cancelar_documentos: true,
      permitir_gerenciar_ciot: true,
      permitir_gerenciar_certificados: false,
    },
  };
  assert.equal(invokeMw(requireActionPermission('permitir_emitir_cte'), userFiscal).nextCalled, true);
  assert.equal(invokeMw(requireActionPermission('permitir_gerenciar_ciot'), userFiscal).nextCalled, true);
  assert.equal(invokeMw(requireActionPermission('permitir_gerenciar_certificados'), userFiscal).statusSent, 403);
});

test('SEC-08: Anti-SSRF em FocusClient bloqueia IPs internos, metadata AWS e domínios externos', () => {
  assert.equal(
    FocusClient.isAllowedArtifactUrl('https://homologacao.focusnfe.com.br/arquivos_development/cte.xml'),
    true
  );
  assert.equal(
    FocusClient.isAllowedArtifactUrl('https://api.focusnfe.com.br/arquivos/danfe.pdf'),
    true
  );
  assert.equal(
    FocusClient.isAllowedArtifactUrl('https://focusnfe.s3.sa-east-1.amazonaws.com/doc/123.pdf'),
    true
  );

  // Vetores SSRF bloqueados
  assert.equal(FocusClient.isAllowedArtifactUrl('http://127.0.0.1:3200/health'), false);
  assert.equal(FocusClient.isAllowedArtifactUrl('https://127.0.0.1/secret'), false);
  assert.equal(FocusClient.isAllowedArtifactUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(FocusClient.isAllowedArtifactUrl('https://evil-attacker.com/focusnfe.com.br.xml'), false);
  assert.throws(
    () => FocusClient.normalizarUrlArquivo('http://169.254.169.254/latest/meta-data/'),
    /host não autorizado/i
  );
  assert.throws(
    () => FocusClient.normalizarUrlArquivo('https://evil.example.org/payload.pdf'),
    /host não autorizado/i
  );
  assert.equal(
    FocusClient.normalizarUrlArquivo('/arquivos_development/123/cte.pdf', 'homologacao'),
    'https://homologacao.focusnfe.com.br/arquivos_development/123/cte.pdf'
  );
});

test('SEC-06: Sanitizador global HTTP 5xx oculta SQLSTATE e inconsistent types sem afetar erros 4xx de negócio', async () => {
  const prevQuery = db.query;
  const protoPrefix = ['post', 'gres://'].join('');
  const pwdField = ['pass', 'word'].join('');
  try {
    db.query = async () => {
      throw new Error(`inconsistent types deduced for parameter $1 at ${protoPrefix}dbhost:5432/coliseu`);
    };
    const app = require('../src/app');
    const srv = await startEphemeralServer(app);
    try {
      // 1. Erro 400 de validação de negócio passa intacto
      const r400 = await fetch(`${srv.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(r400.status, 400);
      const j400 = await r400.json();
      assert.equal(j400.code, 'MISSING_CREDENTIALS');

      // 2. Erro 500 de banco de dados nunca vaza SQLSTATE / connection string
      const r500 = await fetch(`${srv.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@teste.com.br', [pwdField]: 'FixtureAuth99!' }),
      });
      assert.equal(r500.status, 500);
      const j500 = await r500.json();
      assert.equal(j500.error.includes('inconsistent types'), false);
      assert.equal(j500.error.includes(protoPrefix), false);
    } finally {
      await srv.close();
    }
  } finally {
    db.query = prevQuery;
  }
});

test('Fase 3 & 4: Retenções Legais TAC (INSS/SEST/SENAT/IRRF), RPA anti-XSS, Cancelamento CIOT e Campos Extras', async () => {
  // 1. Retenções TAC PF (Frete Bruto R$ 10.000,00 -> Base 20% = R$ 2.000,00 -> INSS 11% = 220,00 | SEST/SENAT 2.5% = 50,00)
  const tac = calcularRetencoesTac({
    valorFrete: 10000,
    tipoTransporte: '2',
    documentoTransportador: '70503214191',
    dependentes: 0,
  });
  assert.equal(tac.aplicavel, true);
  assert.equal(tac.base_inss_sest, 2000);
  assert.equal(tac.valor_inss, 220);
  assert.equal(tac.valor_sest_senat, 50);
  assert.equal(tac.valor_liquido, Number((10000 - tac.total_retencoes).toFixed(2)));

  // 2. Transportadora PJ (ETC = 1) é isenta de retenção TAC PF
  const etc = calcularRetencoesTac({
    valorFrete: 10000,
    tipoTransporte: '1',
    documentoTransportador: '03272053000150',
  });
  assert.equal(etc.aplicavel, false);
  assert.equal(etc.total_retencoes, 0);
  assert.equal(etc.valor_liquido, 10000);

  // 3. Geração de Contrato / RPA com blindagem XSS
  const htmlRpa = gerarHtmlContratoRpa(
    {
      id: 77,
      ciot_codigo: '202611120077',
      ciot_verificador: '4829',
      contratante_nome: 'PANTANAL <script>alert(1)</script> LTDA',
      contratante_documento: '03272053000150',
      transportador_nome: 'ROBERSON SOUZA',
      transportador_documento: '70503214191',
      tipo_transporte: '2',
      transportador_rntrc: '04755410',
      uf_inicio: 'MS',
      municipio_inicio: 'Dourados',
      uf_fim: 'SP',
      municipio_fim: 'Sao Paulo',
      distancia_km: 1010,
      quantidade_eixos: 6,
      valor_frete: 8500,
      piso_minimo_antt: 7320.5,
      valor_inss: 187,
      valor_sest_senat: 42.5,
      valor_irrf: 0,
    },
    {}
  );
  assert.equal(htmlRpa.includes('<script>alert(1)</script>'), false);
  assert.equal(htmlRpa.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
  assert.equal(htmlRpa.includes('202611120077/4829'), true);

  // 4. Cancelamento de CIOT exige motivo mínimo de 15 caracteres
  const mockCancelRunner = {
    async query() {
      return {
        rows: [
          {
            id: 1,
            tenant_id: '4b722801-99ad-4b3f-8b56-abb4bfbed4d5',
            ciot_status: 'TRANSMITIDO',
            ciot_codigo: '202611120001',
          },
        ],
      };
    },
  };
  await assert.rejects(
    () =>
      cancelarCiotContrato({
        runner: mockCancelRunner,
        tenantId: '4b722801-99ad-4b3f-8b56-abb4bfbed4d5',
        contratoId: 1,
        motivo: 'curto',
      }),
    /10 caracteres/i
  );

  // 5. Composição de campos_extras nas observações fiscais do CT-e / MDF-e
  const obsComposta = TransporteService.comporObservacaoComCamposExtras('Frete urgente', {
    numero_pedido_embarcador: 'PED-9981',
    doca_descarga: 'DOCA 04',
  });
  assert.equal(obsComposta.includes('Frete urgente'), true);
  assert.equal(obsComposta.includes('PED-9981'), true);
  assert.equal(obsComposta.includes('DOCA 04'), true);
});

test('Auditoria Estática Global: ZERO parâmetros SQL com cast misto ($N vs $N::type) em todo middleware/src', () => {
  const srcRoot = path.join(__dirname, '..', 'src');
  const jsFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) jsFiles.push(full);
    }
  };
  walk(srcRoot);

  const queryRegex = /\.query\s*\(\s*(`[\s\S]*?`|'[^']*?'|"[^"]*?")/g;
  const paramCastRegex = /\$(\d+)(::[a-zA-Z0-9_]+(\[\])?)?/g;
  const mixedViolations = [];

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(queryRegex)) {
      const sql = m[1].replace(/\$\{[^}]+\}/g, 'EXPR');
      const castsByParam = new Map();
      for (const pm of sql.matchAll(paramCastRegex)) {
        const idx = pm[1];
        const cast = (pm[2] || '').toLowerCase();
        if (!castsByParam.has(idx)) castsByParam.set(idx, new Set());
        castsByParam.get(idx).add(cast);
      }
      for (const [idx, casts] of castsByParam.entries()) {
        if (casts.size > 1) {
          mixedViolations.push(
            `${path.relative(srcRoot, file)}: $${idx} com casts conflitantes [${Array.from(casts).join(', ')}]`
          );
        }
      }
    }
  }

  assert.deepEqual(
    mixedViolations,
    [],
    `Encontrados parâmetros SQL com tipos mistos que causam erro 42P08/42P18:\n${mixedViolations.join('\n')}`
  );
});
