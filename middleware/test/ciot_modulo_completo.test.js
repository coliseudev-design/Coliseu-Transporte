'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db/postgres');
const TransporteService = require('../src/services/transporteService');
const {
  calcularPisoMinimoAntt,
  estimarDistanciaRodoviariaKm,
  listarCategoriasCargaAntt,
} = require('../src/utils/anttPisoMinimo');
const {
  normalizarProtocoloCiot,
  calcularDigitoVerificadorCiot4,
  emitirOuRegistrarCiot,
  encerrarCiotContrato,
  estornarFinanceiroCiot,
} = require('../src/services/ciotProviderService');

test('1. ANTT Res. 5.867: estima distância real (Dourados -> Maracaju sem 800km fixos) e aplica CCD + CC por eixos e carga', () => {
  const categorias = listarCategoriasCargaAntt();
  assert.ok(categorias.length >= 6);
  assert.equal(categorias.some((c) => c.codigo === 'GRANEL_SOLIDO'), true);

  const kmCurto = estimarDistanciaRodoviariaKm({
    ufInicio: 'MS',
    municipioInicio: 'Dourados',
    ufFim: 'MS',
    municipioFim: 'Maracaju',
  });
  // Dourados -> Maracaju fica em torno de 90-100 km rodoviários (jamais 800 km!)
  assert.ok(kmCurto >= 70 && kmCurto <= 130, `Distância esperada ~95 km, obteve ${kmCurto}`);

  const piso2Eixos = calcularPisoMinimoAntt({
    categoriaCarga: 'GERAL',
    quantidadeEixos: 2,
    distanciaKm: 100,
    ufInicio: 'MS',
    ufFim: 'MS',
    valorFrete: 700,
  });
  // 100 * 3.6003 + 308.05 = 668.08
  assert.equal(piso2Eixos.piso, 668.08);
  assert.equal(piso2Eixos.aprovado, true);

  const piso6EixosAbaixo = calcularPisoMinimoAntt({
    categoriaCarga: 'GRANEL_SOLIDO',
    quantidadeEixos: 6,
    distanciaKm: 1000,
    ufInicio: 'MS',
    ufFim: 'SP',
    valorFrete: 5000,
  });
  // 1000 * 6.7620 + 493.80 = 7255.80
  assert.equal(piso6EixosAbaixo.piso, 7255.8);
  assert.equal(piso6EixosAbaixo.aprovado, false);

  // Isenção com motivo curto (<15 chars) deve reprovar; motivo completo (>=15 chars) aprova
  const isencaoInvalida = calcularPisoMinimoAntt({
    categoriaCarga: 'GERAL',
    quantidadeEixos: 3,
    distanciaKm: 200,
    valorFrete: 400,
    pisoIsento: true,
    pisoIsencaoMotivo: 'curto',
  });
  assert.equal(isencaoInvalida.aprovado, false);

  const isencaoValida = calcularPisoMinimoAntt({
    categoriaCarga: 'GERAL',
    quantidadeEixos: 3,
    distanciaKm: 200,
    valorFrete: 400,
    pisoIsento: true,
    pisoIsencaoMotivo: 'Operação de carga consolidada dispensada conforme acordo operacional',
  });
  assert.equal(isencaoValida.aprovado, true);
  assert.equal(isencaoValida.isento, true);
});

test('2. Normalização Blindada 12 + 4 dígitos (SEFAZ MDF-e vs Protocolo ANTT/IPEF)', () => {
  const comBarra = normalizarProtocoloCiot('202611120001/4829');
  assert.equal(comBarra.valido, true);
  assert.equal(comBarra.codigo, '202611120001');
  assert.equal(comBarra.verificador, '4829');
  assert.equal(comBarra.formatado, '202611120001/4829');

  const dozePuro = normalizarProtocoloCiot('202611120001');
  assert.equal(dozePuro.valido, true);
  assert.equal(dozePuro.codigo, '202611120001');
  assert.equal(dozePuro.verificador, null);

  const dezesseis = normalizarProtocoloCiot('2026111200014829');
  assert.equal(dezesseis.valido, true);
  assert.equal(dezesseis.codigo, '202611120001');
  assert.equal(dezesseis.verificador, '4829');

  const invalido14 = normalizarProtocoloCiot('03272053000150');
  assert.equal(invalido14.valido, false);

  const dv = calcularDigitoVerificadorCiot4('202611120001');
  assert.match(dv, /^\d{4}$/);
});

function assertPostgresParamSafety(sql, params) {
  const matches = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  if (matches.length === 0) {
    assert.equal(params.length, 0, `SQL sem placeholders recebeu ${params.length} params: ${sql}`);
    return;
  }
  const counts = new Map();
  for (const idx of matches) {
    counts.set(idx, (counts.get(idx) || 0) + 1);
    assert.ok(
      idx >= 1 && idx <= params.length,
      `Placeholder $${idx} fora do intervalo de params (1..${params.length}) em: ${sql}`
    );
  }
  for (const [idx, count] of counts.entries()) {
    assert.equal(
      count,
      1,
      `Placeholder $${idx} reutilizado ${count}x (risco de "inconsistent types deduced for parameter $${idx}") em: ${sql}`
    );
  }
  assert.equal(
    counts.size,
    params.length,
    `Quantidade de placeholders distintos (${counts.size}) difere de params.length (${params.length}) em: ${sql}`
  );
}

test('3. Ciclo Completo CIOT Homologação + Contas a Pagar (Adiantamento + Saldo sem duplicidade) + Estorno no Cancelamento', async () => {
  const tenantUuid = '11111111-2222-3333-4444-555555555555';
  const titulosCriados = [];
  let contratoMemoria = {
    id: 42,
    tenant_id: tenantUuid,
    emitente_id: 1,
    contratante_nome: 'YAMANARI COMERCIO DE ALIMENTOS LTDA',
    contratante_documento: '03272053000150',
    transportador_nome: 'JOAO CAMINHONEIRO TAC',
    transportador_documento: '11144477735',
    transportador_rntrc: '12345678',
    tipo_transporte: '2',
    tipo_operacao: 'Carga Lotacao',
    uf_inicio: 'MS',
    municipio_inicio: 'Dourados',
    codigo_ibge_inicio: '5003702',
    uf_fim: 'MS',
    municipio_fim: 'Maracaju',
    codigo_ibge_fim: '5005400',
    distancia_km: 100,
    categoria_carga_antt: 'GERAL',
    quantidade_eixos: 2,
    valor_frete: 1000,
    valor_adiantamento: 400,
    valor_pedagio: 50,
    valor_inss: 25,
    valor_irrf: 0,
    valor_sest_senat: 15,
    forma_quitacao: 'PIX',
    chave_pix: '11144477735',
    ciot_provedor: 'HOMOLOGACAO_LOCAL',
    focus_ambiente: 'homologacao',
    emit_ciot_provedor: 'HOMOLOGACAO_LOCAL',
    emit_ciot_ambiente: 'homologacao',
    ciot_status: 'PENDENTE',
    gerar_financeiro: true,
    financeiro_ids: [],
  };

  const mockRunner = {
    async query(sql, params = []) {
      assertPostgresParamSafety(sql, params);
      const norm = sql.replace(/\s+/g, ' ').trim();
      if (norm.startsWith('SELECT c.*,')) {
        return { rows: [{ ...contratoMemoria }] };
      }
      if (norm.startsWith('SELECT * FROM dash_contratos_transporte')) {
        return { rows: [{ ...contratoMemoria }] };
      }
      if (norm.startsWith('UPDATE dash_contratos_transporte SET ciot_status = $1')) {
        assert.equal(typeof params[10], 'boolean');
        contratoMemoria = {
          ...contratoMemoria,
          ciot_status: params[0],
          ciot_codigo: params[1] || contratoMemoria.ciot_codigo,
          ciot_verificador: params[2] || contratoMemoria.ciot_verificador,
          ciot_provedor: params[3],
          cnpj_ipef: params[4] || contratoMemoria.cnpj_ipef,
          piso_minimo_antt: params[5],
          piso_minimo_aprovado: params[6],
          ciot_payload_antt: JSON.parse(params[7]),
        };
        return { rows: [{ ...contratoMemoria }] };
      }
      if (norm.startsWith('INSERT INTO dash_financeiro (')) {
        const novoId = 900 + titulosCriados.length + 1;
        titulosCriados.push({
          id: novoId,
          tenant_id: params[0],
          descricao: params[1],
          valor: params[6],
          numero_parcela: params[8],
          tipo_parcela: params[9],
          status_pagamento: 'PENDENTE',
          valor_pago: 0,
        });
        return { rows: [{ id: novoId }] };
      }
      if (norm.startsWith('INSERT INTO dash_financeiro_logs')) {
        return { rows: [] };
      }
      if (norm.startsWith('UPDATE dash_contratos_transporte SET financeiro_ids =')) {
        contratoMemoria.financeiro_ids = JSON.parse(params[0]);
        return { rows: [{ ...contratoMemoria }] };
      }
      if (norm.startsWith('UPDATE dash_financeiro SET status_pagamento =')) {
        const idsAlvo = params[1];
        let count = 0;
        for (const t of titulosCriados) {
          if (idsAlvo.includes(t.id) && t.valor_pago === 0) {
            t.status_pagamento = 'CANCELADO';
            count += 1;
          }
        }
        return { rowCount: count };
      }
      if (norm.startsWith("UPDATE dash_contratos_transporte SET ciot_status = 'ENCERRADO'")) {
        contratoMemoria.ciot_status = 'ENCERRADO';
        contratoMemoria.ciot_protocolo_encerramento = params[0];
        return { rows: [{ ...contratoMemoria }] };
      }
      throw new Error('SQL inesperado no mockRunner: ' + norm);
    },
  };

  // 3a. Emissão em homologação gera 12 dígitos + 4 verificadores + 2 títulos financeiros (400 adiantamento + 560 saldo líquido)
  const resEmit = await emitirOuRegistrarCiot({
    runner: mockRunner,
    tenantId: tenantUuid,
    contratoId: 42,
    usuario: 'Tester',
  });

  assert.equal(resEmit.contrato.ciot_status, 'TRANSMITIDO');
  assert.match(resEmit.contrato.ciot_codigo, /^\d{12}$/);
  assert.match(resEmit.contrato.ciot_verificador, /^\d{4}$/);
  assert.equal(titulosCriados.length, 2);
  assert.equal(titulosCriados[0].tipo_parcela, 'ADIANTAMENTO_FRETE');
  assert.equal(titulosCriados[0].valor, 400);
  assert.equal(titulosCriados[1].tipo_parcela, 'SALDO_FRETE');
  // 1000 - 400 (adiant) - 25 (inss) - 15 (sest/senat) = 560
  assert.equal(titulosCriados[1].valor, 560);

  // 3b. Rechamada idempotente NÃO duplica títulos em dash_financeiro
  const resReemit = await emitirOuRegistrarCiot({
    runner: mockRunner,
    tenantId: tenantUuid,
    contratoId: 42,
  });
  assert.equal(resReemit.financeiro_ids.length, 2);
  assert.equal(titulosCriados.length, 2);

  // 3c. Encerramento manual do contrato CIOT
  const encerrado = await encerrarCiotContrato({
    runner: mockRunner,
    tenantId: tenantUuid,
    contratoId: 42,
  });
  assert.equal(encerrado.ciot_status, 'ENCERRADO');
  assert.ok(encerrado.ciot_protocolo_encerramento.startsWith('ENC-'));

  // 3d. Estorno financeiro no cancelamento
  const qtdEstornada = await estornarFinanceiroCiot(
    mockRunner,
    tenantUuid,
    contratoMemoria,
    'Cancelamento de teste',
    'Tester'
  );
  assert.equal(qtdEstornada, 2);
  assert.equal(titulosCriados.every((t) => t.status_pagamento === 'CANCELADO'), true);
});

test('4. Encerramento Sincronizado MDF-e -> CIOT: encerrarMdfe encerra automaticamente o CIOT vinculado', async (t) => {
  const origQuery = db.query;
  const origGetFocus = TransporteService.getFocusClient;

  let ciotEncerradoChamado = false;
  let paramsUpdateCiot = null;

  db.query = async (sql, params = []) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    if (norm.startsWith('SELECT m.* FROM dash_mdfes m')) {
      return {
        rows: [
          {
            id: 77,
            tenant_id: '11111111-2222-3333-4444-555555555555',
            emitente_id: 1,
            ref: 'mdfe_77',
            status: 'AUTORIZADO',
            uf_fim: 'MS',
            municipio_descarregamento: 'Maracaju',
            codigo_municipio_descarregamento: '5005400',
            protocolo: '950260000123456',
            ciot_codigo: '261112000042',
            caminho_xml: '/xml/77.xml',
            caminho_damdfe: '/pdf/77.pdf',
          },
        ],
      };
    }
    if (norm.startsWith('SELECT cod_ibge, cidade, uf FROM dash_regioes')) {
      return { rows: [] };
    }
    if (norm.startsWith('UPDATE dash_mdfes SET')) {
      return { rowCount: 1 };
    }
    if (norm.includes("UPDATE dash_contratos_transporte SET ciot_status = 'ENCERRADO'")) {
      assertPostgresParamSafety(sql, params);
      ciotEncerradoChamado = true;
      paramsUpdateCiot = params;
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  TransporteService.getFocusClient = async () => ({
    emitente: { id: 1, uf: 'MS', focus_ambiente: 'homologacao' },
    client: {
      encerrarMdfe: async () => ({
        status: 'encerrado',
        status_sefaz: '135',
        mensagem_sefaz: 'Evento registrado e vinculado a MDF-e',
      }),
    },
  });

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocus;
  });

  const res = await TransporteService.encerrarMdfe(
    '11111111-2222-3333-4444-555555555555',
    77,
    { siglaUf: 'MS', nomeMunicipio: 'Maracaju' }
  );

  assert.equal(res.success, true);
  assert.equal(res.status, 'ENCERRADO');
  assert.equal(res.ciots_encerrados, 1);
  assert.equal(ciotEncerradoChamado, true);
  assert.equal(paramsUpdateCiot[1], 77);
  assert.equal(paramsUpdateCiot[3], 77);
  assert.equal(paramsUpdateCiot[4], true);
  assert.equal(paramsUpdateCiot[5], '261112000042');
});
