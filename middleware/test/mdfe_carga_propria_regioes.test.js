'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db/postgres');
const TransporteService = require('../src/services/transporteService');
const {
  resolverIbgeMunicipioSync,
  extrairMetadadosChave44,
  normalizarUf,
  listarMunicipiosDicionario,
} = require('../src/utils/ibgeMunicipios');
const {
  enriquecerLinhaCargaSync,
  consolidarCargasErpTenant,
  invalidarCacheConsolidacaoTenant,
} = require('../src/services/cargaConsolidatorService');

const EMITENTE_CARGA_PROPRIA_MS = {
  id: 1,
  tenant_id: 7,
  cnpj: '03272053000150',
  inscricao_estadual: '283100630',
  razao_social: 'YAMANARI COMERCIO DE ALIMENTOS LTDA',
  nome_fantasia: 'YAMANARI',
  logradouro: 'RUA ARGENTINA',
  numero: '715',
  bairro: 'PARQUE DAS NACOES',
  codigo_municipio: '5003702',
  municipio: 'Dourados',
  cep: '79841270',
  uf: 'MS',
  telefone: '6734164605',
  rntrc: '', // Carga própria sem RNTRC
  perfil_operacional: 'CARGA_PROPRIA',
  mdfe_tipo_emitente_padrao: '2',
  serie_mdfe: '1',
  focus_ambiente: 'homologacao',
};

const CHAVE_NFE_DOURADOS_1 = '50261103272053000150550010000010011000010015';
const CHAVE_NFE_DOURADOS_2 = '50261103272053000150550010000010021000010022';
const CHAVE_NFE_MARACAJU = '50261103272053000150550010000010031000010030';
const CHAVE_NFE_PONTA_PORA = '50261103272053000150550010000010041000010047';
const CHAVE_NFCE_CUPOM = '50261103272053000150650010000020011000020010';

test('1. Dicionário IBGE & Chave 44 dígitos: resolve cidades do interior de MS/PR/SP sem cair em Campo Grande e distingue NF-e 55 de NFC-e 65', () => {
  assert.equal(normalizarUf('MATO GROSSO DO SUL'), 'MS');
  assert.equal(normalizarUf('Paraná'), 'PR');

  const dourados = resolverIbgeMunicipioSync('', 'DOURADOS', 'MATO GROSSO DO SUL');
  assert.equal(dourados.codigo, '5003702');
  assert.equal(dourados.uf, 'MS');
  assert.equal(dourados.exato, true);

  const inexistente = resolverIbgeMunicipioSync('', 'Cidade Inexistente XYZ', 'MS');
  assert.equal(inexistente.exato, false);

  const maracaju = resolverIbgeMunicipioSync(null, 'Maracaju', 'MS');
  assert.equal(maracaju.codigo, '5005400');

  const pontaPora = resolverIbgeMunicipioSync('', 'Ponta Pora', 'MS');
  assert.equal(pontaPora.codigo, '5006606');

  const tresLagoas = resolverIbgeMunicipioSync('', 'Três Lagoas', 'MS');
  assert.equal(tresLagoas.codigo, '5008305');

  const cascavel = resolverIbgeMunicipioSync('', 'Cascavel', 'PR');
  assert.equal(cascavel.codigo, '4104808');

  const meta55 = extrairMetadadosChave44(CHAVE_NFE_MARACAJU);
  assert.equal(meta55.modelo, '55');
  assert.equal(meta55.uf_emitente, 'MS');
  assert.equal(meta55.numero, '1003');

  const meta65 = extrairMetadadosChave44(CHAVE_NFCE_CUPOM);
  assert.equal(meta65.modelo, '65');

  const listaMs = listarMunicipiosDicionario('MS', 'dourados');
  assert.equal(listaMs.some((m) => m.codigo === '5003702' && m.uf === 'MS' && m.nome === 'Dourados'), true);
});

test('2. Consolidação ERP: enriquecerLinhaCargaSync + consolidarCargasErpTenant resgata NF-es de dash_vendas e classifica Região de Entrega', async (t) => {
  const rowSync = enriquecerLinhaCargaSync({
    chave_acesso: CHAVE_NFE_MARACAJU,
    destinatario_municipio: 'MARACAJU',
    destinatario_uf: 'MATO GROSSO DO SUL',
    remetente_municipio: 'DOURADOS',
    remetente_uf: 'MS',
  });
  assert.equal(rowSync.modelo_documento, '55');
  assert.equal(rowSync.destinatario_uf, 'MS');
  assert.equal(rowSync.destinatario_codigo_ibge, '5005400');
  assert.equal(rowSync.remetente_codigo_ibge, '5003702');

  const origQuery = db.query;
  const updatesExecutados = [];
  let inseriuDeVendas = false;

  t.after(() => {
    db.query = origQuery;
    invalidarCacheConsolidacaoTenant(7);
  });

  invalidarCacheConsolidacaoTenant(7);
  db.query = async (sql, params = []) => {
    const s = String(sql);
    if (s.includes('FROM dash_transporte_regioes')) {
      return {
        rows: [
          {
            nome: 'Região Grande Dourados',
            uf_padrao: 'MS',
            cidades: [
              { municipio: 'Dourados', uf: 'MS', codigo_ibge: '5003702' },
              { municipio: 'Maracaju', uf: 'MS', codigo_ibge: '5005400' },
            ],
          },
        ],
      };
    }
    if (s.includes('INSERT INTO dash_cargas') && s.includes('FROM dash_vendas v')) {
      inseriuDeVendas = true;
      return { rowCount: 3, rows: [] };
    }
    if (s.includes('SELECT DISTINCT') && s.includes('FROM dash_cargas')) {
      return {
        rows: [
          {
            destinatario_municipio: 'Maracaju',
            destinatario_uf: 'MS',
            destinatario_codigo_ibge: null,
            json_ibge: null,
          },
        ],
      };
    }
    if (s.includes('UPDATE dash_cargas') && s.includes('destinatario_codigo_ibge = COALESCE($2')) {
      updatesExecutados.push(params);
      return { rowCount: 4, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };

  const res = await consolidarCargasErpTenant(7);
  assert.equal(inseriuDeVendas, true);
  assert.equal(res.inseridas_de_vendas, 3);
  assert.equal(updatesExecutados.length, 1);
  // Verifica IBGE 5005400 (Maracaju) e Região Grande Dourados preenchidos na consolidação
  assert.equal(updatesExecutados[0][1], '5005400');
  assert.equal(updatesExecutados[0][3], 'Região Grande Dourados');
});

test('3. emitirMdfe — Carga Própria (tpEmit=2) em Frota Própria com 3 cidades na região gera 3 <infMunDescarga> distintos e limpa resíduos de CIOT/Frete', async (t) => {
  const payloadsEnviados = [];
  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_CARGA_PROPRIA_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async (ref, payload) => {
        payloadsEnviados.push({ ref, payload });
        return {
          status: 'autorizado',
          status_sefaz: '100',
          mensagem_sefaz: 'Autorizado o uso do MDF-e',
          chave_mdfe: '50261103272053000150580010000000501000000508',
          numero: payload.numero,
          serie: payload.serie,
          protocolo: '950260000099991',
          caminho_xml_nota_fiscal: '/arquivos_desenvolvimento/mdfe_regiao.xml',
          caminho_damdfe: '/arquivos_desenvolvimento/damdfe_regiao.pdf',
        };
      },
      consultarMdfe: async () => null,
    },
  });

  db.query = async (sql) => {
    const s = String(sql);
    if (s.includes('FROM dash_mdfes m') && s.includes('LEFT JOIN dash_veiculos')) {
      return {
        rows: [
          {
            id: 701,
            tenant_id: 7,
            emitente_id: 1,
            status: 'RASCUNHO',
            serie: '1',
            numero: 50,
            tipo_emitente: '2',
            uf_inicio: 'MS',
            uf_fim: 'MS',
            codigo_municipio_carregamento: '5003702',
            municipio_carregamento: 'Dourados',
            veiculo_placa: 'QAA1B23',
            v_tipo_proprietario: '1', // Frota própria!
            // Mesmo que haja resíduos de rascunho em ciot_codigo / contratantes / pagto_frete, devem ser suprimidos!
            ciot_codigo: '202611100010',
            contratantes: [{ documento: '03272053000150', nome: 'RESIDUO CONTRATANTE' }],
            pagto_frete: [{ responsavel: '03272053000150', valor: 250 }],
            seguros: [],
            produtos_predominantes: [],
            valor_carga: 0,
            peso_bruto: 0,
          },
        ],
      };
    }
    if (s.includes('MAX(numero)')) {
      return { rows: [{ max_num: 49 }] };
    }
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_DOURADOS_1,
            nfe_mun_fim: 'Dourados',
            nfe_uf_fim: 'MS',
            nfe_valor_total: 1200.0,
            nfe_peso_bruto: 150.0,
            nfe_produto: 'ARROZ TIPO 1',
            nfe_ncm: '10063021',
          },
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_DOURADOS_2,
            nfe_mun_fim: 'DOURADOS',
            nfe_uf_fim: 'MS',
            nfe_valor_total: 800.0,
            nfe_peso_bruto: 90.0,
          },
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_MARACAJU,
            nfe_mun_fim: 'Maracaju',
            nfe_uf_fim: 'MS',
            nfe_valor_total: 1500.0,
            nfe_peso_bruto: 210.0,
          },
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_PONTA_PORA,
            nfe_mun_fim: 'Ponta Porã',
            nfe_uf_fim: 'MS',
            nfe_valor_total: 950.0,
            nfe_peso_bruto: 110.0,
          },
        ],
      };
    }
    return { rows: [] };
  };

  const res = await TransporteService.emitirMdfe(7, 701, { pollIntervalMs: 0 });
  assert.equal(res.status, 'AUTORIZADO');
  assert.equal(payloadsEnviados.length, 1);

  const { payload } = payloadsEnviados[0];
  assert.equal(payload.emitente, '2');
  assert.equal(payload.quantidade_total_nfe, 4);
  assert.equal('quantidade_total_cte' in payload, false);
  assert.equal(payload.valor_total_carga, '4450.00');
  assert.equal(payload.peso_bruto, '560.0000');
  assert.equal(payload.codigo_ncm_produto, '10063021');

  // Verifica 3 blocos <infMunDescarga> separados com os códigos IBGE reais de cada cidade
  assert.equal(payload.municipios_descarregamento.length, 3);
  const porIbge = new Map(payload.municipios_descarregamento.map((m) => [m.codigo, m]));
  assert.equal(porIbge.get('5003702')?.notas_fiscais.length, 2); // Dourados (2 NF-es)
  assert.equal(porIbge.get('5005400')?.notas_fiscais.length, 1); // Maracaju (1 NF-e)
  assert.equal(porIbge.get('5006606')?.notas_fiscais.length, 1); // Ponta Porã (1 NF-e)

  // Verifica omissão estrita de RNTRC, CIOT, Contratantes, Pagamentos e tpTransp em Frota Própria
  assert.equal('tipo_transporte' in payload, false);
  assert.equal('registro_nacional_transporte' in payload.modal_rodoviario, false);
  assert.equal('ciot' in payload.modal_rodoviario, false);
  assert.equal('contratantes' in payload.modal_rodoviario, false);
  assert.equal('pagamentos' in payload.modal_rodoviario, false);
});

test('4. emitirMdfe — Bloqueia mistura de NF-es de UFs de destino diferentes (ex.: MS + PR) no mesmo MDF-e', async (t) => {
  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_CARGA_PROPRIA_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async () => ({ status: 'autorizado', status_sefaz: '100' }),
    },
  });

  db.query = async (sql) => {
    const s = String(sql);
    if (s.includes('FROM dash_mdfes m') && s.includes('LEFT JOIN dash_veiculos')) {
      return {
        rows: [
          {
            id: 702,
            tenant_id: 7,
            emitente_id: 1,
            status: 'RASCUNHO',
            tipo_emitente: '2',
            uf_inicio: 'MS',
            uf_fim: 'MS',
            veiculo_placa: 'QAA1B23',
          },
        ],
      };
    }
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_DOURADOS_1,
            nfe_mun_fim: 'Dourados',
            nfe_uf_fim: 'MS',
          },
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_MARACAJU,
            nfe_mun_fim: 'Cascavel',
            nfe_uf_fim: 'PR',
          },
        ],
      };
    }
    return { rows: [] };
  };

  await assert.rejects(
    () => TransporteService.emitirMdfe(7, 702, { pollIntervalMs: 0 }),
    /UFs de descarregamento diferentes \(MS, PR\)/i
  );
});

test('5. emitirMdfe — Carga Própria (tpEmit=2) com Veículo de Terceiro (TAC) reativa tpTransp, CIOT, Contratantes e infPag', async (t) => {
  const payloadsEnviados = [];
  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_CARGA_PROPRIA_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async (ref, payload) => {
        payloadsEnviados.push({ ref, payload });
        return {
          status: 'autorizado',
          status_sefaz: '100',
          mensagem_sefaz: 'Autorizado o uso do MDF-e',
          chave_mdfe: '50261103272053000150580010000000511000000516',
          numero: payload.numero,
          serie: payload.serie,
          protocolo: '950260000099992',
        };
      },
      consultarMdfe: async () => null,
    },
  });

  db.query = async (sql) => {
    const s = String(sql);
    if (s.includes('FROM dash_mdfes m') && s.includes('LEFT JOIN dash_veiculos')) {
      return {
        rows: [
          {
            id: 703,
            tenant_id: 7,
            emitente_id: 1,
            status: 'RASCUNHO',
            serie: '1',
            numero: 51,
            tipo_emitente: '2',
            uf_inicio: 'MS',
            uf_fim: 'MS',
            codigo_municipio_carregamento: '5003702',
            municipio_carregamento: 'Dourados',
            veiculo_placa: 'QBB2C34',
            v_tipo_proprietario: '2', // Terceiro (TAC)!
            v_doc_prop: '12345678909',
            v_nome_prop: 'MOTORISTA AUTONOMO TAC',
            v_rntrc_prop: '12345678',
            v_uf_prop: 'MS',
            ciot_codigo: '202611100099',
            ciot_cpf_cnpj: '03272053000150',
            contratantes: [{ documento: '03272053000150', nome: 'YAMANARI COMERCIO DE ALIMENTOS LTDA' }],
            pagto_frete: [{ responsavel: '03272053000150', valor: 450, forma: '0' }],
            seguros: [],
            produtos_predominantes: [],
          },
        ],
      };
    }
    if (s.includes('MAX(numero)')) {
      return { rows: [{ max_num: 50 }] };
    }
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_MARACAJU,
            nfe_mun_fim: 'Maracaju',
            nfe_uf_fim: 'MS',
            nfe_valor_total: 2200.0,
            nfe_peso_bruto: 300.0,
          },
        ],
      };
    }
    return { rows: [] };
  };

  const res = await TransporteService.emitirMdfe(7, 703, { pollIntervalMs: 0 });
  assert.equal(res.status, 'AUTORIZADO');
  const { payload } = payloadsEnviados[0];
  assert.equal(payload.emitente, '2');
  assert.equal(payload.tipo_transporte, '2'); // TAC (CPF)
  assert.equal(Array.isArray(payload.modal_rodoviario.ciot), true);
  assert.equal(payload.modal_rodoviario.ciot[0].ciot, '202611100099');
  assert.equal(Array.isArray(payload.modal_rodoviario.contratantes), true);
  assert.equal(Array.isArray(payload.modal_rodoviario.pagamentos), true);
});
