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
