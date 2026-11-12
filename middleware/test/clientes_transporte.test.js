'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const db = require('../src/db/postgres');
const clientesRouter = require('../src/routes/clientes');

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

test('TMS-CLIENTES-01: GET /:id/ficha-transporte respeita isolamento multi-tenant, RBAC e agrega Cargas, CT-es e Entregas', async () => {
  const origQuery = db.query;
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  let currentUser = {
    id: 10,
    role: 'admin',
    permissoes_menus: { cadastros: { acesso: true, submenus: { clientes: true } } },
    permissoes_acoes: { permitir_ver_ficha_cliente: true },
  };
  let currentTenant = TENANT_A;

  db.query = async (sql, params = []) => {
    if (sql.includes('ALTER TABLE dash_clientes')) return { rows: [] };
    if (sql.includes('FROM dash_clientes c') && sql.includes('LIMIT 1')) {
      const [tenantId, id] = params;
      if (tenantId === TENANT_A && id === 42) {
        return {
          rows: [
            {
              id: 42,
              id_firebird: 1025,
              tenant_id: TENANT_A,
              nome: '3K CONSTRUTORA LTDA',
              razao_social: '3K COMERCIAL E CONSTRUTORA LTDA',
              nome_fantasia: '3K CONSTRUTORA',
              documento: '13.877.637/0001-82',
              cidade: 'DOURADOS',
              estado: 'MS',
              classificacao: 'GRANDE DOURADOS',
              email: 'fiscal@3k.com.br',
            },
          ],
        };
      }
      return { rows: [] };
    }
    if (sql.includes('FROM dash_partes')) {
      return {
        rows: [
          {
            id: 99,
            documento: '13877637000182',
            inscricao_estadual: '283334445',
            indicador_ie: '1',
            codigo_municipio: '5003702',
            municipio: 'DOURADOS',
            uf: 'MS',
          },
        ],
      };
    }
    if (sql.includes('FROM dash_cargas cg')) {
      return {
        rows: [
          {
            id: 501,
            modelo_documento: '55',
            numero: '9840',
            serie: '1',
            chave_acesso: '50261103272053000150550010000098401000098405',
            valor_total: '1500.00',
            peso_bruto: '320.500',
            volumes: 12,
            status: 'PENDENTE',
            destinatario_municipio: 'DOURADOS',
            destinatario_uf: 'MS',
          },
        ],
      };
    }
    if (sql.includes('FROM dash_ctes ct')) {
      return {
        rows: [
          {
            id: 77,
            numero: 14,
            serie: '1',
            status: 'AUTORIZADO',
            valor_total: '420.00',
            uf_inicio: 'MS',
            municipio_inicio: 'DOURADOS',
            uf_fim: 'MS',
            municipio_fim: 'PONTA PORA',
            papel_cliente: 'TOMADOR',
          },
        ],
      };
    }
    if (sql.includes('FROM dash_roteiro_pontos rp')) {
      return {
        rows: [
          {
            id: 300,
            roteiro_id: 12,
            ordem_entrega: 1,
            municipio: 'DOURADOS',
            uf: 'MS',
            valor_produtos: '1500.00',
            status_entrega: 'ENTREGUE',
            possui_canhoto: true,
          },
        ],
      };
    }
    return { rows: [] };
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    req.tenant = { id: currentTenant };
    next();
  });
  app.use('/api/clientes', clientesRouter);

  const srv = await startEphemeralServer(app);
  try {
    // 1. Sucesso para o tenant proprietário
    const rOk = await fetch(`${srv.url}/api/clientes/42/ficha-transporte`);
    assert.equal(rOk.status, 200);
    const bodyOk = await rOk.json();
    assert.equal(bodyOk.success, true);
    assert.equal(bodyOk.data.cliente.codigo_municipio_resolvido, '5003702');
    assert.equal(bodyOk.data.cliente.vinculado_parte, true);
    assert.equal(bodyOk.data.resumo_logistico.total_cargas, 1);
    assert.equal(bodyOk.data.resumo_logistico.total_ctes, 1);
    assert.equal(bodyOk.data.resumo_logistico.canhotos_assinados, 1);

    // 2. Isolamento multi-tenant: Tenant B não enxerga cliente do Tenant A
    currentTenant = TENANT_B;
    const rOtherTenant = await fetch(`${srv.url}/api/clientes/42/ficha-transporte`);
    assert.equal(rOtherTenant.status, 404);

    // 3. RBAC: Operador com permissão explicitamente revogada recebe 403
    currentTenant = TENANT_A;
    currentUser = {
      id: 11,
      role: 'operador',
      permissoes_menus: { cadastros: { acesso: true, submenus: { clientes: true } } },
      permissoes_acoes: { permitir_ver_ficha_cliente: false },
    };
    const rForbidden = await fetch(`${srv.url}/api/clientes/42/ficha-transporte`);
    assert.equal(rForbidden.status, 403);
  } finally {
    db.query = origQuery;
    await srv.close();
  }
});

test('TMS-CLIENTES-02: POST /:id/sincronizar-parte resolve IBGE automaticamente e faz UPSERT em dash_partes', async () => {
  const origQuery = db.query;
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  let upsertedParams = null;

  db.query = async (sql, params = []) => {
    if (sql.includes('ALTER TABLE dash_clientes')) return { rows: [] };
    if (sql.includes('SELECT * FROM dash_clientes')) {
      const [, id] = params;
      if (id === 42) {
        return {
          rows: [
            {
              id: 42,
              tenant_id: TENANT_A,
              nome: 'MERCADO PLANALTO',
              razao_social: 'MERCADO PLANALTO LTDA',
              documento: '32.672.285/0001-81',
              inscricao_estadual: '281112223',
              cidade: 'PONTA PORA',
              estado: 'MS',
              endereco_completo: 'AV BRASIL, 1500, CENTRO',
              email: 'nfe@planalto.com.br',
            },
          ],
        };
      }
      if (id === 99) {
        return {
          rows: [{ id: 99, tenant_id: TENANT_A, nome: 'SEM DOC', documento: '123' }],
        };
      }
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO dash_partes')) {
      upsertedParams = params;
      return {
        rows: [
          {
            id: 555,
            documento: params[1],
            tipo_documento: params[2],
            razao_social: params[3],
            codigo_municipio: params[12],
            municipio: params[13],
            uf: params[14],
          },
        ],
      };
    }
    return { rows: [] };
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 1, role: 'admin' };
    req.tenant = { id: TENANT_A };
    next();
  });
  app.use('/api/clientes', clientesRouter);

  const srv = await startEphemeralServer(app);
  try {
    const rSync = await fetch(`${srv.url}/api/clientes/42/sincronizar-parte`, { method: 'POST' });
    assert.equal(rSync.status, 200);
    const body = await rSync.json();
    assert.equal(body.success, true);
    assert.equal(body.data.documento, '32672285000181');
    // Ponta Porã / MS = IBGE 5006606
    assert.equal(body.data.codigo_municipio, '5006606');
    assert.equal(upsertedParams[5], '281112223'); // inscricao_estadual
    assert.equal(upsertedParams[6], '1'); // indicador_ie Contribuinte ICMS
    assert.equal(upsertedParams[7], 'AV BRASIL'); // logradouro decomposto
    assert.equal(upsertedParams[8], '1500'); // numero decomposto

    // Cliente sem CPF/CNPJ válido retorna 400 amigável
    const rBad = await fetch(`${srv.url}/api/clientes/99/sincronizar-parte`, { method: 'POST' });
    assert.equal(rBad.status, 400);
  } finally {
    db.query = origQuery;
    await srv.close();
  }
});

test('TMS-CLIENTES-03: Auditoria estática de segurança e Purple Ban no módulo Clientes Transporte', () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'clientes.js'),
    'utf8'
  );
  assert.equal(
    /Fallback financeiro sem tenant_id/i.test(routeSrc),
    false,
    'clientes.js não pode conter fallback financeiro sem tenant_id'
  );
  assert.equal(
    /_error:\s*err\.message/i.test(routeSrc),
    false,
    'clientes.js não pode vazar err.message para o cliente HTTP'
  );

  const pageSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Clientes.tsx'),
    'utf8'
  );
  assert.equal(
    /\b(purple|violet|fuchsia|indigo)-\d{2,3}\b/i.test(pageSrc),
    false,
    'Clientes.tsx deve respeitar estritamente o Purple Ban e a paleta nativa do Transporte'
  );
  assert.equal(
    /ModalEscolhaLancamento|ModalBoletoPreview|ModalAnexarContrato|\/contratos/i.test(pageSrc),
    false,
    'Clientes.tsx não deve importar modais financeiros/contratos herdados do Nexus'
  );
});
