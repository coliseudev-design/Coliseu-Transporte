'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const db = require('../src/db/postgres');
const app = require('../src/app');
const TransporteService = require('../src/services/transporteService');
const {
  emitirViaEfrete,
  emitirOuRegistrarCiot,
} = require('../src/services/ciotProviderService');

function startEphemeralServer(expressApp) {
  return new Promise((resolve) => {
    const server = http.createServer(expressApp);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test('GOLIVE-01: Numeração fiscal atômica respeita piso de migração (ultimo_numero_cte / ultimo_numero_mdfe) por emitente e série', async () => {
  const prevConnect = db.pool.connect;
  let updatedNumeroNoCte = null;

  try {
    db.pool.connect = async () => ({
      async query(sql, params = []) {
        const s = String(sql);
        if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
        if (s.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (s.includes('FROM dash_emitentes') && s.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 7, ultimo_num: 1842 }],
          };
        }
        if (s.includes('MAX(numero)')) {
          // Mesmo que exista um rascunho antigo nº 1 no banco, o piso 1842 prevalece
          return { rows: [{ max_num: 1 }] };
        }
        if (s.includes('UPDATE dash_ctes SET numero = $1, serie = $2')) {
          updatedNumeroNoCte = params[0];
          return { rowCount: 1, rows: [] };
        }
        return { rows: [] };
      },
      release() {},
    });

    const alocado = await TransporteService.alocarNumeroFiscalAtomico({
      tabela: 'dash_ctes',
      tenantId: '4b722801-99ad-4b3f-8b56-abb4bfbed4d5',
      emitenteId: 7,
      docId: 99,
      serie: '1',
      numeroAtual: 1,
      ultimoNumeroMigracao: 1842,
      precisaNovoNumeroHomolog: false,
    });

    assert.equal(alocado.maxNumExistente, 1842);
    assert.equal(alocado.numeroEnvio, 1843);
    assert.equal(updatedNumeroNoCte, 1843);
  } finally {
    db.pool.connect = prevConnect;
  }
});

test('GOLIVE-02: Carta de Correção (CC-e CT-e) envia array estruturado SEFAZ e bloqueia campos vedados pelo CONFAZ', async () => {
  // 1. Bloqueio de campos vedados pelo Ajuste SINIEF 09/07
  assert.throws(
    () =>
      TransporteService.normalizarCorrecoesCceCte({
        correcoes: [{ grupo_corrigido: 'vPrest', campo_corrigido: 'vTPrest', valor_corrigido: '1900.00' }],
      }),
    /vedação legal CONFAZ/i
  );

  assert.throws(
    () =>
      TransporteService.normalizarCorrecoesCceCte({
        correcoes: [{ grupo_corrigido: 'rem', campo_corrigido: 'CNPJ', valor_corrigido: '11222333000181' }],
      }),
    /vedação legal CONFAZ/i
  );

  // 2. Normalização estruturada e transmissão Focus NFe
  const prevQuery = db.query;
  const prevGetFocus = TransporteService.getFocusClient;
  let focusPayloadCapturado = null;

  try {
    db.query = async (sql) => {
      if (String(sql).includes('FROM dash_ctes c WHERE c.id = $1')) {
        return {
          rows: [{ ref: 'CTE-PROD-55', emitente_id: 7, status: 'AUTORIZADO', modelo: '57', modelo_cte: 'cte' }],
        };
      }
      return { rowCount: 1, rows: [] };
    };

    TransporteService.getFocusClient = async () => ({
      client: {
        async cartaCorrecaoCte(_ref, payload) {
          focusPayloadCapturado = payload;
          return { status: 'autorizado', status_sefaz: '135', numero_carta_correcao: 1 };
        },
      },
    });

    const res = await TransporteService.cartaCorrecaoCte('tenant-1', 55, {
      correcoes: [
        {
          grupo_corrigido: 'compl',
          campo_corrigido: 'xObs',
          valor_corrigido: 'Retificação do número do pedido do embarcador para PED-2026-991',
        },
        {
          grupo_corrigido: 'enderDest',
          campo_corrigido: 'nro',
          valor_corrigido: '1450',
          numero_item_alterado: 1,
        },
      ],
    });

    assert.equal(res.success, true);
    assert.ok(focusPayloadCapturado && Array.isArray(focusPayloadCapturado.correcoes));
    assert.equal(focusPayloadCapturado.correcoes.length, 2);
    assert.deepEqual(focusPayloadCapturado.correcoes[0], {
      grupo_corrigido: 'compl',
      campo_corrigido: 'xObs',
      valor_corrigido: 'Retificação do número do pedido do embarcador para PED-2026-991',
    });
    assert.equal(focusPayloadCapturado.correcoes[1].numero_item_alterado, '01');
  } finally {
    db.query = prevQuery;
    TransporteService.getFocusClient = prevGetFocus;
  }
});

test('GOLIVE-03: Cancelamento de CT-e e MDF-e destrava cargas vinculadas de volta para PENDENTE', async () => {
  const prevQuery = db.query;
  const prevGetFocus = TransporteService.getFocusClient;
  let updateCargasExecutado = false;

  try {
    db.query = async (sql) => {
      const s = String(sql);
      if (s.includes('SELECT * FROM dash_ctes WHERE id = $1')) {
        return { rows: [{ id: 101, emitente_id: 7, ref: 'CTE-101', modelo: '57' }] };
      }
      if (s.includes('UPDATE dash_cargas c') && s.includes("'PENDENTE'")) {
        updateCargasExecutado = true;
        return { rowCount: 2, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    };

    TransporteService.getFocusClient = async () => ({
      client: {
        async cancelarCte() {
          return { status: 'cancelado', status_sefaz: '135', mensagem_sefaz: 'Evento registrado e vinculado' };
        },
      },
    });

    const out = await TransporteService.cancelarCte(
      'tenant-1',
      101,
      'Erro no preenchimento dos dados comerciais do frete'
    );
    assert.equal(out.success, true);
    assert.equal(out.cargas_liberadas, 2);
    assert.equal(updateCargasExecutado, true);
  } finally {
    db.query = prevQuery;
    TransporteService.getFocusClient = prevGetFocus;
  }
});

test('GOLIVE-04: Inclusão de DF-e em trânsito separa IBGE carregamento vs descarregamento e diferencia CT-e (57) de NF-e (55)', async () => {
  const prevQuery = db.query;
  const prevGetFocus = TransporteService.getFocusClient;
  let payloadIncluirDfe = null;

  const chaveCte57 = '50261103272053000150570010000001231000001238';
  const chaveNfe55 = '35261103272053000150550010000009871000009872';

  try {
    db.query = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM dash_mdfes m WHERE m.id = $1')) {
        return {
          rows: [
            {
              ref: 'MDFE-700',
              emitente_id: 7,
              status: 'AUTORIZADO',
              tipo_emitente: '1',
              protocolo: '950260000123456',
              uf_inicio: 'MS',
              uf_fim: 'SP',
              municipios_carregamento: JSON.stringify([{ codigo: '5003702', nome: 'Dourados' }]),
            },
          ],
        };
      }
      return { rowCount: 1, rows: [] };
    };

    TransporteService.getFocusClient = async () => ({
      emitente: { uf: 'MS', municipio: 'Dourados', codigo_municipio: '5003702', mdfe_tipo_emitente_padrao: '1' },
      client: {
        async incluirDfeMdfe(_ref, payload) {
          payloadIncluirDfe = payload;
          return { status: 'autorizado', status_sefaz: '135' };
        },
      },
    });

    const out = await TransporteService.incluirDfe('tenant-1', 700, {
      codigo_municipio_carregamento: '5003702',
      nome_municipio_carregamento: 'Dourados',
      uf_carregamento: 'MS',
      documentos: [
        {
          chave: chaveCte57,
          codigo_municipio_descarregamento: '3550308',
          nome_municipio_descarregamento: 'Sao Paulo',
          uf_descarregamento: 'SP',
        },
        {
          chave: chaveNfe55,
          codigo_municipio_descarregamento: '3509502',
          nome_municipio_descarregamento: 'Campinas',
          uf_descarregamento: 'SP',
        },
      ],
    });

    assert.equal(out.success, true);
    assert.equal(payloadIncluirDfe.protocolo, '950260000123456');
    assert.equal(payloadIncluirDfe.codigo_municipio_carregamento, '5003702');
    assert.equal(payloadIncluirDfe.documentos[0].codigo_municipio_descarregamento, '3550308');
    assert.equal(payloadIncluirDfe.documentos[0].chave_cte, chaveCte57);
    assert.equal(payloadIncluirDfe.documentos[0].chave_nfe, undefined);
    assert.equal(payloadIncluirDfe.documentos[1].codigo_municipio_descarregamento, '3509502');
    assert.equal(payloadIncluirDfe.documentos[1].chave_nfe, chaveNfe55);
    assert.equal(payloadIncluirDfe.documentos[1].chave_cte, undefined);
  } finally {
    db.query = prevQuery;
    TransporteService.getFocusClient = prevGetFocus;
  }
});

test('GOLIVE-05: CIOT e-Frete executa handshake LogonService.asmx (<Token>) e bloqueia falso-positivo em Produção', async () => {
  const prevFetch = global.fetch;
  const soapCalls = [];

  try {
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      const xmlBody = String(opts.body || '');
      soapCalls.push({ url: u, body: xmlBody });

      if (u.includes('LogonService.asmx')) {
        return {
          status: 200,
          text: async () =>
            `<?xml version="1.0" encoding="utf-8"?><soap:Envelope><soap:Body><LoginResponse><LoginResult><Sucesso>true</Sucesso><Token>SESSAO-EFRETE-TOKEN-998877</Token></LoginResult></LoginResponse></soap:Body></soap:Envelope>`,
        };
      }

      if (u.includes('PefService.asmx')) {
        return {
          status: 200,
          text: async () =>
            `<?xml version="1.0" encoding="utf-8"?><soap:Envelope><soap:Body><AdicionarOperacaoTransportePdfResponse><CodigoIdentificacaoOperacao>887766554433/9182</CodigoIdentificacaoOperacao><Protocolo>PROT-EFRETE-2026</Protocolo></AdicionarOperacaoTransportePdfResponse></soap:Body></soap:Envelope>`,
        };
      }

      return { status: 404, text: async () => '' };
    };

    const contratoEfrete = {
      tipo_transporte: '2',
      transportador_documento: '70503214191',
      transportador_rntrc: '04755410',
      motorista_cpf: '70503214191',
      veiculo_placa: 'QAR5644',
      uf_inicio: 'PR',
      municipio_inicio: 'Curitiba',
      codigo_ibge_inicio: '4106902',
      uf_fim: 'SP',
      municipio_fim: 'Sao Paulo',
      codigo_ibge_fim: '3550308',
      valor_frete: 4500,
      valor_liquido: 4200,
      valor_irrf: 0,
      valor_inss: 220,
      valor_sest_senat: 80,
      distancia_km: 408,
    };

    const ret = await emitirViaEfrete(
      contratoEfrete,
      { uf: 'PR', cnpj: '03272053000150' },
      {
        ambiente: 'producao',
        integrador: 'HASH-INTEGRADOR-COLISEU',
        usuario: 'operador@transportadora.com.br',
        senha: 'SenhaForteIpef2026!',
      }
    );

    assert.equal(soapCalls.length, 2);
    assert.equal(soapCalls[0].url.includes('LogonService.asmx'), true);
    assert.equal(soapCalls[1].url.includes('PefService.asmx'), true);
    assert.equal(soapCalls[1].body.includes('<Token xmlns="http://schemas.ipc.adm.br/efrete/objects">SESSAO-EFRETE-TOKEN-998877</Token>'), true);
    assert.equal(soapCalls[1].body.includes('<CodigoMunicipioOrigem>4106902</CodigoMunicipioOrigem>'), true);
    assert.equal(soapCalls[1].body.includes('<CodigoMunicipioDestino>3550308</CodigoMunicipioDestino>'), true);
    assert.equal(ret.codigo, '887766554433');
    assert.equal(ret.verificador, '9182');

    // Verifica bloqueio de falso-positivo em Produção quando SIMULADOR_LOCAL ou PAMCARD sem endpoint produtivo está selecionado
    const baseRowProd = {
      id: 77,
      ciot_status: 'RASCUNHO',
      contratante_documento: '03272053000150',
      contratante_nome: 'TRANS PROD LTDA',
      transportador_documento: '70503214191',
      transportador_nome: 'MOTORISTA TAC',
      transportador_rntrc: '04755410',
      tipo_transporte: '2',
      veiculo_placa: 'QAR5644',
      uf_inicio: 'PR',
      municipio_inicio: 'Curitiba',
      uf_fim: 'SP',
      municipio_fim: 'Sao Paulo',
      distancia_km: 408,
      quantidade_eixos: 6,
      valor_frete: 8500,
      focus_ambiente: 'producao',
      emit_ciot_ambiente: 'producao',
      emit_ciot_provedor: 'HOMOLOGACAO_LOCAL',
    };

    const mockRunnerSimulador = {
      async query(sql) {
        if (String(sql).includes('FROM dash_contratos_transporte')) {
          return { rows: [baseRowProd] };
        }
        return { rows: [] };
      },
    };

    await assert.rejects(
      () =>
        emitirOuRegistrarCiot({
          runner: mockRunnerSimulador,
          tenantId: 'tenant-prod',
          contratoId: 77,
        }),
      /Simulador Local \(Homologação\)|NT 2026\.001/i
    );

    const mockRunnerPamcardSemUrl = {
      async query(sql) {
        if (String(sql).includes('FROM dash_contratos_transporte')) {
          return {
            rows: [
              {
                ...baseRowProd,
                ciot_provedor: 'PAMCARD',
                emit_ciot_provedor: 'PAMCARD',
                emit_ciot_token: 'TOKEN-TESTE-PAMCARD',
                emit_ciot_api_url_producao: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    await assert.rejects(
      () =>
        emitirOuRegistrarCiot({
          runner: mockRunnerPamcardSemUrl,
          tenantId: 'tenant-prod',
          contratoId: 77,
        }),
      /URL da API de Produção|MANUAL/i
    );
  } finally {
    global.fetch = prevFetch;
  }
});

test('GOLIVE-06: Validador .pfx A1 rejeita arquivo corrompido e seed fiscal multi-UF respeita Simples Nacional vs Regime Normal', async () => {
  assert.throws(
    () => TransporteService.validarArquivoESenhaPfx(Buffer.from('ARQUIVO_TEXTO_INVALIDO'), '123456'),
    /Certificado A1/i
  );

  const prevQuery = db.query;
  const regrasInseridas = [];
  try {
    db.query = async (sql, params = []) => {
      const s = String(sql);
      if (s.includes('SELECT 1 FROM dash_regras_fiscais')) {
        return { rowCount: 0, rows: [] };
      }
      if (s.includes('INSERT INTO dash_regras_fiscais')) {
        regrasInseridas.push({ sql: s, params });
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    };

    const resSimples = await TransporteService.semearRegrasFiscaisIniciaisEmitente('tenant-pr', {
      uf: 'PR',
      regime_tributario: '1',
    });
    assert.equal(resSimples.criadas, 3);
    assert.equal(resSimples.uf, 'PR');
    assert.equal(resSimples.situacao_tributaria, 'SN');
    assert.equal(regrasInseridas[0].params[3], 'SN');
    assert.equal(regrasInseridas[0].params[4], 0);

    regrasInseridas.length = 0;
    const resNormal = await TransporteService.semearRegrasFiscaisIniciaisEmitente('tenant-pr-normal', {
      uf: 'PR',
      regime_tributario: '3',
    });
    assert.equal(resNormal.situacao_tributaria, '00');
    assert.equal(regrasInseridas[0].params[3], '00');
    assert.equal(regrasInseridas[0].params[4], 19.5);
  } finally {
    db.query = prevQuery;
  }
});

test('GOLIVE-07: Isolamento total contra legados do Nexus (rotas desmontadas, webhooks Focus ativos e assets limpos)', async () => {
  const nexusRoutesRemovidas = [
    'asaas.js',
    'automacoes.js',
    'bi.js',
    'campanhas.js',
    'cobranca.js',
    'contratos.js',
    'cora.js',
    'crm.js',
    'estatisticas.js',
    'financeiro.js',
    'produtos.js',
    'ranking.js',
    'templates.js',
    'tracking.js',
    'vendas.js',
    'webhooks.js',
  ];
  const routesDir = path.join(__dirname, '..', 'src', 'routes');
  for (const rFile of nexusRoutesRemovidas) {
    assert.equal(
      fs.existsSync(path.join(routesDir, rFile)),
      false,
      `Arquivo legado do Nexus deveria ter sido removido: routes/${rFile}`
    );
  }

  const prevProcessar = TransporteService.processarWebhook;
  const srv = await startEphemeralServer(app);
  try {
    TransporteService.processarWebhook = async (body) => ({
      processed: true,
      ref: body?.ref || 'OK',
    });

    const rFocus1 = await fetch(`${srv.url}/api/webhooks/focus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'CTE-HOOK-1', status: 'autorizado' }),
    });
    assert.equal(rFocus1.status, 200);

    const rFocus2 = await fetch(`${srv.url}/api/v1/webhooks/focus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'MDFE-HOOK-2', status: 'autorizado' }),
    });
    assert.equal(rFocus2.status, 200);

    const rAsaas = await fetch(`${srv.url}/api/webhooks/asaas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'PAYMENT_RECEIVED' }),
    });
    assert.notEqual(rAsaas.status, 200);
  } finally {
    TransporteService.processarWebhook = prevProcessar;
    await srv.close();
  }

  const frontendPublic = path.join(__dirname, '..', '..', 'frontend', 'public');
  assert.equal(fs.existsSync(path.join(frontendPublic, 'logo-nexus.png')), false);
  assert.equal(fs.existsSync(path.join(frontendPublic, 'nexus-logo.png')), false);
  assert.equal(fs.existsSync(path.join(frontendPublic, 'assets', 'logo-coliseu-transporte.svg')), true);
});

test('GOLIVE-08: Painel de Sequência Fiscal restringe ajuste a Admin (Master), bloqueia nº já usado na SEFAZ e atualiza sequência contínua', async () => {
  const express = require('express');
  const transporteRouter = require('../src/routes/transporte');
  const prevQuery = db.query;

  let estadoEmitente = {
    id: 5,
    tenant_id: '11111111-2222-3333-4444-555555555555',
    cnpj: '12345678000199',
    razao_social: 'TRANSPORTADORA SEQUENCIA LTDA',
    serie_cte: '1',
    serie_mdfe: '1',
    ultimo_numero_cte: 120,
    ultimo_numero_mdfe: 40,
    focus_empresa_id: null,
  };

  try {
    db.query = async (sql, params = []) => {
      const s = String(sql);
      if (s.includes('FROM dash_emitentes')) {
        return { rows: [{ ...estadoEmitente }] };
      }
      if (s.includes('FROM dash_integracoes_config')) {
        return { rows: [{}] };
      }
      if (s.includes('numero_exato_usado') && s.includes('FROM dash_ctes')) {
        const serieConsultada = String(params[2] || '1');
        const numTentado = Number(params[3] || 0);
        const maxSefaz = serieConsultada === '1' ? 120 : 0;
        return {
          rows: [
            {
              max_sefaz: maxSefaz,
              numero_exato_usado: serieConsultada === '1' && numTentado <= 120,
            },
          ],
        };
      }
      if (s.includes('UPDATE dash_emitentes') && s.includes('ultimo_numero_cte')) {
        estadoEmitente.serie_cte = String(params[0]);
        estadoEmitente.ultimo_numero_cte = Number(params[1]);
        return { rowCount: 1, rows: [{ ...estadoEmitente }] };
      }
      if (s.includes('MAX(numero)') && s.includes('FROM dash_ctes')) {
        const serieQ = String(params[2] || '1');
        const maxSefaz = serieQ === '1' ? 120 : 0;
        return { rows: [{ max_geral: maxSefaz, max_sefaz: maxSefaz }] };
      }
      if (s.includes('MAX(numero)') && s.includes('FROM dash_mdfes')) {
        return { rows: [{ max_geral: 40, max_sefaz: 40 }] };
      }
      return { rows: [], rowCount: 0 };
    };

    // 1. Monta servidor efêmero simulando usuário Operador Fiscal vs Admin Master
    let currentRole = 'viewer';
    let currentGrupo = 'Fiscal / Emissão';
    const testApp = express();
    testApp.use(express.json());
    testApp.use((req, _res, next) => {
      req.tenant = { id: estadoEmitente.tenant_id };
      req.user = {
        id: 88,
        email: 'operador@transportadora.com.br',
        role: currentRole,
        grupo_nome: currentGrupo,
        permissoes_acoes: { permitir_emitir_cte: true, permitir_emitir_mdfe: true },
      };
      next();
    });
    testApp.use('/api/transporte', transporteRouter);

    const srv = await startEphemeralServer(testApp);
    try {
      // A1: Operador comum (Fiscal / Emissão) é bloqueado ao tentar alterar sequência
      const rViewer = await fetch(`${srv.url}/api/transporte/emitentes/5/sequencia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'CTE', serie: '1', proximo_numero: 1850 }),
      });
      assert.equal(rViewer.status, 403);

      // Promove contexto para Administrador (Master)
      currentRole = 'admin';
      currentGrupo = 'Master';

      // A2: Bloqueia tentativa de definir próximo número <= maior já utilizado na SEFAZ (120)
      const rColisao = await fetch(`${srv.url}/api/transporte/emitentes/5/sequencia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'CTE', serie: '1', proximo_numero: 120 }),
      });
      assert.equal(rColisao.status, 409);

      // A2: Define próximo número contínuo = 1850 -> grava ultimo_numero_cte = 1849 e retorna proximo_numero_cte = 1850
      const rOk = await fetch(`${srv.url}/api/transporte/emitentes/5/sequencia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'CTE', serie: '1', proximo_numero: 1850 }),
      });
      assert.equal(rOk.status, 200);
      const jOk = await rOk.json();
      assert.equal(estadoEmitente.ultimo_numero_cte, 1849);
      assert.equal(jOk.data.proximo_numero_cte, 1850);
    } finally {
      await srv.close();
    }
  } finally {
    db.query = prevQuery;
  }
});

test('GOLIVE-09: Modo Híbrido (Com Worker ERP) vs Modo Independente (Sem ERP) — preservação COALESCE, fila seletiva e dicionário nacional IBGE', async () => {
  const express = require('express');
  const syncRouter = require('../src/routes/sync');
  const clientesRouter = require('../src/routes/clientes');
  const transporteRouter = require('../src/routes/transporte');

  const prevQuery = db.query;
  const prevPoolConnect = db.pool.connect;
  const sqlCapturadosSync = [];
  const syncQueueInserts = [];
  let simulandoErpAtivo = false;

  try {
    db.pool.connect = async () => ({
      async query(sql) {
        sqlCapturadosSync.push(String(sql));
        return { rows: [], rowCount: 1 };
      },
      release() {},
    });

    db.query = async (sql) => {
      const s = String(sql);
      if (s.includes('AS erp_integrado')) {
        return { rows: [{ erp_integrado: simulandoErpAtivo }] };
      }
      if (s.includes('INSERT INTO dash_clientes')) {
        return {
          rows: [
            {
              id: 301,
              id_firebird: null,
              nome: 'EMBARCADOR STANDALONE LTDA',
              razao_social: 'EMBARCADOR STANDALONE LTDA',
              documento: '11.222.333/0001-81',
              cidade: 'SAO PAULO',
              estado: 'SP',
              codigo_municipio: '3550308',
            },
          ],
          rowCount: 1,
        };
      }
      if (s.includes('INSERT INTO dash_sync_metadata') && s.includes("'CLIENTES'")) {
        syncQueueInserts.push(s);
        return { rows: [], rowCount: 1 };
      }
      if (s.includes('INSERT INTO dash_partes')) {
        return { rows: [{ id: 901 }], rowCount: 1 };
      }
      if (s.includes('FROM dash_regioes') && s.includes('dash_coordenadas_municipios')) {
        return { rows: [] };
      }
      return { rows: [{ total: 0, pendentes: 0 }], rowCount: 0 };
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use((req, _res, next) => {
      req.tenant = { id: '22222222-3333-4444-5555-666666666666' };
      req.user = { id: 1, role: 'admin', grupo_nome: 'Master' };
      next();
    });
    testApp.use('/internal/sync', syncRouter);
    testApp.use('/api/clientes', clientesRouter);
    testApp.use('/api/transporte', transporteRouter);

    const srv = await startEphemeralServer(testApp);
    try {
      // 1. Cenário SEM ERP (Modo Independente): salva cliente local, espelha em Partes e NÃO polui fila do Worker
      simulandoErpAtivo = false;
      const rDiagInd = await fetch(`${srv.url}/api/transporte/diagnostico`);
      const jDiagInd = await rDiagInd.json();
      assert.equal(jDiagInd.data.modo_operacao, 'INDEPENDENTE');
      assert.equal(jDiagInd.data.erp_integrado, false);

      const rCliInd = await fetch(`${srv.url}/api/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razao_social: 'EMBARCADOR STANDALONE LTDA',
          documento: '11222333000181',
          cidade: 'Sao Paulo',
          estado: 'SP',
        }),
      });
      assert.equal(rCliInd.status, 201);
      const jCliInd = await rCliInd.json();
      assert.equal(jCliInd.erp_integrado, false);
      assert.equal(syncQueueInserts.length, 0);

      // 2. Municípios sem ERP retorna São Paulo/SP (final do alfabeto, > 150) sem truncamento prematuro
      const rMun = await fetch(`${srv.url}/api/transporte/municipios`);
      const jMun = await rMun.json();
      assert.equal(
        jMun.data.some((m) => m.codigo_ibge === '3550308'),
        true,
        'São Paulo (3550308) deve estar disponível no seletor mesmo sem ERP sincronizado'
      );

      // 3. Cenário COM ERP (Modo Híbrido): enfileira cliente para o Worker e preserva campos fiscais locais com COALESCE
      simulandoErpAtivo = true;
      const rCliErp = await fetch(`${srv.url}/api/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razao_social: 'CLIENTE HIBRIDO ERP LTDA',
          documento: '11222333000181',
          cidade: 'Curitiba',
          estado: 'PR',
        }),
      });
      assert.equal(rCliErp.status, 201);
      assert.equal(syncQueueInserts.length, 1);

      // Testa Worker sync preservando RNTRC/Tara em dash_veiculos, CNH em dash_motoristas e Regiões
      const rSyncVeic = await fetch(`${srv.url}/internal/sync/veiculos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ placa: 'ABC1D23', tara_kg: 0, rntrc: '' }]),
      });
      assert.equal(rSyncVeic.status, 200);
      assert.equal(
        sqlCapturadosSync.some(
          (q) =>
            q.includes('CASE WHEN COALESCE(EXCLUDED.tara_kg, 0) > 0') &&
            q.includes("COALESCE(NULLIF(EXCLUDED.rntrc::text, ''), dash_veiculos.rntrc)")
        ),
        true
      );

      const rSyncReg = await fetch(`${srv.url}/internal/sync/regioes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ codigo: 10, cidade: 'DOURADOS', uf: 'MS', cod_ibge: '5003702' }]),
      });
      assert.equal(rSyncReg.status, 200);
    } finally {
      await srv.close();
    }
  } finally {
    db.query = prevQuery;
    db.pool.connect = prevPoolConnect;
  }
});

test('GOLIVE-10: Catálogo Oficial Completo IBGE (5.571 municípios / 27 UFs) + Distritos Personalizados', async () => {
  const express = require('express');
  const transporteRouter = require('../src/routes/transporte');
  const cadastrosRouter = require('../src/routes/cadastros');
  const {
    obterEstatisticasIbgeBrasil,
    resolverIbgeMunicipioSync,
  } = require('../src/utils/ibgeMunicipios');

  // 1. Cobertura integral da malha oficial IBGE (27 UFs, 5.571 municípios)
  const stats = obterEstatisticasIbgeBrasil();
  assert.equal(stats.total_municipios >= 5570, true, `Esperado >= 5570 municípios oficiais, obtido ${stats.total_municipios}`);
  assert.equal(stats.total_ufs, 27, 'Deve cobrir todas as 27 Unidades da Federação');

  // 2. Resolução exata de municípios pequenos/médios/novos que antes não estavam no dicionário parcial
  const abdon = resolverIbgeMunicipioSync('', 'Abdon Batista', 'SC');
  assert.equal(abdon.codigo, '4200051');
  assert.equal(abdon.exato, true);

  const sorriso = resolverIbgeMunicipioSync('', 'Sorriso', 'MT');
  assert.equal(sorriso.codigo, '5107925');
  assert.equal(sorriso.exato, true);

  const uberlandia = resolverIbgeMunicipioSync('', 'Uberlandia', 'MG');
  assert.equal(uberlandia.codigo, '3170206');
  assert.equal(uberlandia.exato, true);

  const boaEsperanca = resolverIbgeMunicipioSync('', 'Boa Esperanca do Norte', 'MT');
  assert.equal(boaEsperanca.codigo, '5101837');
  assert.equal(boaEsperanca.exato, true);

  // Lookup reverso somente pelo código IBGE de 7 dígitos
  const reverso = resolverIbgeMunicipioSync('4200051', '', '');
  assert.equal(reverso.nome, 'Abdon Batista');
  assert.equal(reverso.uf, 'SC');

  // 3. API /api/transporte/municipios + /api/cadastros/regioes (distritos personalizados com herança IBGE)
  const prevQuery = db.query;
  let distritoSalvo = null;
  try {
    db.query = async (sql, params) => {
      const s = String(sql);
      if (s.includes('AS next_cod')) {
        return { rows: [{ next_cod: 1001 }], rowCount: 1 };
      }
      if (s.includes('FROM dash_regioes')) {
        return {
          rows: distritoSalvo ? [distritoSalvo] : [],
          rowCount: distritoSalvo ? 1 : 0,
        };
      }
      if (s.includes('INSERT INTO dash_regioes')) {
        distritoSalvo = {
          id: 77,
          codigo: params[1],
          cidade: params[2],
          distrito: params[3],
          uf: params[4],
          localizacao: params[5],
          cod_ibge: params[6],
          cod_pais: params[7],
          nome_pais: params[8],
        };
        return { rows: [distritoSalvo], rowCount: 1 };
      }
      return { rows: [{ proximo: 1001 }], rowCount: 1 };
    };

    const testApp = express();
    testApp.use(express.json());
    testApp.use((req, _res, next) => {
      req.tenant = { id: '33333333-4444-5555-6666-777777777777' };
      req.user = { id: 1, role: 'admin', grupo_nome: 'Master' };
      next();
    });
    testApp.use('/api/transporte', transporteRouter);
    testApp.use('/api/cadastros', cadastrosRouter);

    const srv = await startEphemeralServer(testApp);
    try {
      const rAll = await fetch(`${srv.url}/api/transporte/municipios`);
      assert.equal(rAll.status, 200);
      const jAll = await rAll.json();
      assert.equal(jAll.total >= 5570, true);
      assert.equal(jAll.total_ufs, 27);
      assert.equal(jAll.por_uf.MG, 853);
      assert.equal(jAll.por_uf.SP, 645);
      assert.equal(jAll.por_uf.MS, 79);

      const rBusca = await fetch(`${srv.url}/api/transporte/municipios?uf=SC&search=abdon`);
      const jBusca = await rBusca.json();
      assert.equal(jBusca.data.length >= 1, true);
      assert.equal(jBusca.data[0].codigo_ibge, '4200051');

      // Cadastro de distrito local sem informar cod_ibge -> herda automaticamente 5003702 de Dourados/MS
      const rPostDistrito = await fetch(`${srv.url}/api/cadastros/regioes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cidade: 'DOURADOS',
          uf: 'MS',
          distrito: 'VILA VARGAS',
          localizacao: 'BR-163 KM 285',
        }),
      });
      assert.equal(rPostDistrito.status, 201);
      const jPostDistrito = await rPostDistrito.json();
      assert.equal(jPostDistrito.data.cod_ibge, '5003702');
    } finally {
      await srv.close();
    }
  } finally {
    db.query = prevQuery;
  }
});
