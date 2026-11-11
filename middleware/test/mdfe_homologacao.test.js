const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db/postgres');
const TransporteService = require('../src/services/transporteService');

const EMITENTE_HOMOLOG_MS = {
  id: 1,
  tenant_id: 7,
  cnpj: '03272053000150',
  inscricao_estadual: '283100630',
  razao_social: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
  nome_fantasia: 'PANTANAL',
  logradouro: 'RUA ARGENTINA',
  numero: '715',
  bairro: 'PARQUE DAS NACOES',
  codigo_municipio: '5003702',
  municipio: 'Dourados',
  cep: '79841270',
  uf: 'MS',
  telefone: '6734164605',
  rntrc: '04755410',
  serie_mdfe: '1',
  focus_ambiente: 'homologacao',
};

const CHAVE_CTE_MS_MS = '50261103272053000150570010000000221206363520';
const CHAVE_CTE_MS_SP = '50261103272053000150570010000000231206363527';

test('MDF-e 3.00 — Geografia de UFs de percurso (BFS) e validadores SEFAZ', () => {
  // Mesma UF -> sem percurso
  assert.deepEqual(TransporteService.resolverPercursoUfs('MS', 'MS'), []);

  // UFs limítrofes diretas (MS faz divisa com SP, PR, MG, GO, MT) -> sem UF intermediária!
  assert.equal(TransporteService.saoUfsLimitrofes('MS', 'SP'), true);
  assert.deepEqual(TransporteService.resolverPercursoUfs('MS', 'SP'), []);

  // UFs não limítrofes -> menor caminho geográfico na ordem real de passagem (não alfabética!)
  assert.deepEqual(TransporteService.resolverPercursoUfs('MS', 'SC'), ['PR']);
  assert.deepEqual(TransporteService.resolverPercursoUfs('RS', 'SP'), ['SC', 'PR']);

  // Validadores de CPF (módulo 11) e placa Mercosul/antiga
  assert.equal(TransporteService.validarCpfReal('11144477735'), true);
  assert.equal(TransporteService.validarCpfReal('52998224725'), true);
  assert.equal(TransporteService.validarCpfReal('00000000000'), false);
  assert.equal(TransporteService.validarCpfReal('12345678900'), false);

  const placaGerada = TransporteService.gerarPlacaMercosulHomolog(15);
  assert.equal(TransporteService.validarPlacaVeiculoSefaz(placaGerada), true);
  assert.equal(TransporteService.validarPlacaVeiculoSefaz('ABC1234'), true);
  assert.equal(TransporteService.validarPlacaVeiculoSefaz('INVALIDA'), false);
});

test('emitirMdfe — Veículo próprio MS -> SP (Carga Lotação): omite tpTransp/modal/percursos e preenche NT 2025.001', async (t) => {
  const payloadsEnviados = [];

  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_HOMOLOG_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async (ref, payload) => {
        payloadsEnviados.push({ ref, payload });
        return {
          status: 'autorizado',
          status_sefaz: '100',
          mensagem_sefaz: 'Autorizado o uso do MDF-e',
          chave_mdfe: '50261103272053000150580010000000121000000129',
          numero: payload.numero,
          serie: payload.serie,
          protocolo: '950260000012345',
          caminho_xml_nota_fiscal: '/arquivos_desenvolvimento/502611_mdfe.xml',
          caminho_damdfe: '/arquivos_desenvolvimento/502611_damdfe.pdf',
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
            id: 501,
            tenant_id: 7,
            emitente_id: 1,
            ref: null,
            status: 'RASCUNHO',
            serie: '1',
            numero: 12,
            tipo_emitente: '1',
            tipo_transporte: '1', // mesmo que venha '1' do form, veículo próprio deve omitir tpTransp!
            uf_inicio: 'MS',
            uf_fim: 'SP',
            ufs_percurso: ['MS', 'SP'], // lixo do form deve ser limpo!
            codigo_municipio_carregamento: '5003702',
            municipio_carregamento: 'Dourados',
            veiculo_placa: 'QAA1B23',
            condutores: [],
            contratantes: [],
            pagto_frete: [],
            seguros: [],
            produtos_predominantes: [],
            valor_carga: 3400,
            peso_bruto: 320,
          },
        ],
      };
    }
    if (s.includes('MAX(numero)')) {
      return { rows: [{ max_num: 11 }] };
    }
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'CTE',
            chave: CHAVE_CTE_MS_SP,
            codigo_municipio_descarregamento: '3550308',
            nome_municipio_descarregamento: 'Sao Paulo',
            cte_valor_total: 280.0,
            cte_valor_carga: 3400.0,
            cte_peso_bruto: 320.0,
            cte_produto: 'MERCADORIAS DIVERSAS',
            cte_uf_fim: 'SP',
            cte_cod_mun_fim: '3550308',
            cte_mun_fim: 'Sao Paulo',
            cte_tomador: '0',
            cte_tomador_doc: '03272053000150',
            cte_remetente_dados: {
              documento: '03272053000150',
              razao_social: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
              cep: '79841270',
            },
            cte_destinatario_dados: {
              documento: '11144477735',
              cep: '01310100',
            },
          },
        ],
      };
    }
    return { rows: [] };
  };

  const res = await TransporteService.emitirMdfe(7, 501, { pollIntervalMs: 0 });

  assert.equal(res.status, 'AUTORIZADO');
  assert.equal(res.status_sefaz, '100');
  assert.ok(res.caminho_damdfe.startsWith('https://homologacao.focusnfe.com.br/'));
  assert.ok(res.caminho_xml.startsWith('https://homologacao.focusnfe.com.br/'));
  assert.equal(payloadsEnviados.length, 1);

  const { payload } = payloadsEnviados[0];
  // 1. Não envia modal na raiz nem tipo_transporte para veículo próprio (evita Rejeição 745)
  assert.equal('modal' in payload, false);
  assert.equal('tipo_transporte' in payload, false);
  // 2. MS e SP fazem fronteira direta -> percursos omitido
  assert.equal('percursos' in payload, false);
  // 3. Carga Lotação (1 CT-e) -> NCM de 8 dígitos + CEPs de carregamento e descarregamento (evita Rejeição 726)
  assert.equal(payload.codigo_ncm_produto, '21069090');
  assert.equal(payload.cep_carregamento, '79841270');
  assert.equal(payload.cep_descarregamento, '01310100');
  assert.equal(payload.quantidade_total_cte, 1);
  // 4. Seguro RCTR-C obrigatório para tpEmit=1 (evita Rejeições 698/699)
  assert.equal(payload.seguros_carga.length, 1);
  assert.equal(payload.seguros_carga[0].cnpj_seguradora, '61198164000160');
  assert.deepEqual(payload.seguros_carga[0].numero_averbacao, ['00000000000000000001']);
  // 5. Contratante e Pagamento infPag obrigatórios NT 2025.001 (evita Rejeições 302/724/729/742)
  assert.equal(payload.modal_rodoviario.registro_nacional_transporte, '04755410');
  assert.equal(payload.modal_rodoviario.contratantes.length, 1);
  assert.equal(payload.modal_rodoviario.contratantes[0].cnpj, '03272053000150');
  assert.equal(payload.modal_rodoviario.pagamentos.length, 1);
  assert.deepEqual(payload.modal_rodoviario.pagamentos[0].componentes, [
    { tipo: '04', valor: '280.00' },
  ]);
  assert.equal(payload.modal_rodoviario.pagamentos[0].valor_total_contrato, '280.00');
  assert.equal(payload.modal_rodoviario.pagamentos[0].forma_pagamento, '0');
  assert.equal(payload.modal_rodoviario.pagamentos[0].numero_banco, '001');
  assert.equal(payload.modal_rodoviario.pagamentos[0].numero_agencia, '1234');
  // 6. Condutor fallback com CPF válido módulo 11 em homologação
  assert.equal(payload.modal_rodoviario.condutores[0].cpf, '11144477735');
});

test('emitirMdfe — Veículo de terceiro PF (CPF) MS -> SC: define tipo_transporte=2 (TAC) e percursos=[PR]', async (t) => {
  let payloadCapturado = null;
  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_HOMOLOG_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async (_ref, payload) => {
        payloadCapturado = payload;
        return {
          status: 'autorizado',
          status_sefaz: '100',
          chave_mdfe: '50261103272053000150580010000000131000000134',
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
            id: 502,
            tenant_id: 7,
            emitente_id: 1,
            status: 'RASCUNHO',
            serie: '1',
            numero: 13,
            tipo_emitente: '1',
            tipo_transporte: '1',
            uf_inicio: 'MS',
            uf_fim: 'SC',
            ufs_percurso: [],
            v_placa: 'QBB2C34',
            v_tipo_proprietario: '2',
            v_doc_prop: '52998224725', // CPF válido módulo 11 (autônomo TAC)
            v_nome_prop: 'JOSE AUTONOMO TAC',
            v_uf_prop: 'MS',
            v_rntrc: '12345678',
          },
        ],
      };
    }
    if (s.includes('MAX(numero)')) return { rows: [{ max_num: 12 }] };
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'CTE',
            chave: CHAVE_CTE_MS_SP,
            codigo_municipio_descarregamento: '4205407',
            nome_municipio_descarregamento: 'Florianopolis',
            cte_valor_total: 420.0,
            cte_valor_carga: 5000.0,
            cte_peso_bruto: 900.0,
          },
        ],
      };
    }
    return { rows: [] };
  };

  await TransporteService.emitirMdfe(7, 502, { pollIntervalMs: 0 });

  assert.equal(payloadCapturado.tipo_transporte, '2');
  assert.equal(payloadCapturado.modal_rodoviario.cpf_proprietario_veiculo, '52998224725');
  assert.deepEqual(payloadCapturado.percursos, [{ uf_percurso: 'PR' }]);
});

test('emitirMdfe — Auto-recuperação em homologação para placa com MDF-e aberto (611) e duplicidade (204)', async (t) => {
  const tentativas = [];
  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_HOMOLOG_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async (ref, payload) => {
        tentativas.push({
          ref,
          numero: payload.numero,
          placa: payload.modal_rodoviario.placa_veiculo,
        });
        if (tentativas.length === 1) {
          return {
            status: 'erro_autorizacao',
            status_sefaz: '611',
            mensagem_sefaz: 'Rejeicao: Existe MDF-e nao encerrado para esta placa',
          };
        }
        return {
          status: 'autorizado',
          status_sefaz: '100',
          mensagem_sefaz: 'Autorizado o uso do MDF-e',
          chave_mdfe: '50261103272053000150580010000000161000000160',
          numero: payload.numero,
          serie: payload.serie,
          caminho_damdfe: '/arquivos_desenvolvimento/ok.pdf',
          caminho_xml_nota_fiscal: '/arquivos_desenvolvimento/ok.xml',
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
            id: 503,
            tenant_id: 7,
            emitente_id: 1,
            status: 'RASCUNHO',
            serie: '1',
            numero: 15,
            uf_inicio: 'MS',
            uf_fim: 'MS',
            veiculo_placa: 'QAA1B23',
          },
        ],
      };
    }
    if (s.includes('MAX(numero)')) return { rows: [{ max_num: 14 }] };
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'CTE',
            chave: CHAVE_CTE_MS_MS,
            codigo_municipio_descarregamento: '5002704',
            nome_municipio_descarregamento: 'Campo Grande',
            cte_valor_total: 150.0,
          },
        ],
      };
    }
    return { rows: [] };
  };

  const res = await TransporteService.emitirMdfe(7, 503, { pollIntervalMs: 0 });
  assert.equal(res.status, 'AUTORIZADO');
  assert.equal(tentativas.length, 2);
  assert.notEqual(tentativas[0].placa, tentativas[1].placa);
  assert.ok(tentativas[1].numero > tentativas[0].numero);
});

test('encerrarMdfe — Envia estritamente { data, sigla_uf, nome_municipio }, faz fallback de acento e preserva DAMDFE/XML', async (t) => {
  const chamadasEncerrar = [];
  let updateParams = null;

  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_HOMOLOG_MS },
    client: {
      ambiente: 'homologacao',
      consultarMdfe: async () => ({
        status: 'autorizado',
        caminho_damdfe: '/arquivos_desenvolvimento/damdfe_504.pdf',
        caminho_xml_nota_fiscal: '/arquivos_desenvolvimento/mdfe_504.xml',
      }),
      encerrarMdfe: async (ref, payload) => {
        chamadasEncerrar.push({ ref, payload });
        if (payload.nome_municipio === 'Sao Paulo') {
          throw new Error('Município inválido na tabela IBGE');
        }
        return {
          status: 'encerrado',
          status_sefaz: '135',
          mensagem_sefaz: 'Evento registrado e vinculado a MDF-e',
        };
      },
    },
  });

  db.query = async (sql, params) => {
    const s = String(sql);
    if (s.includes('SELECT m.* FROM dash_mdfes m')) {
      return {
        rows: [
          {
            id: 504,
            tenant_id: 7,
            emitente_id: 1,
            ref: 'MDFE_7_504',
            status: 'AUTORIZADO',
            uf_fim: 'SP',
            codigo_municipio_descarregamento: '3550308',
            municipio_descarregamento: 'Sao Paulo',
            caminho_damdfe: null,
            caminho_xml: null,
          },
        ],
      };
    }
    if (s.includes("status = 'ENCERRADO'")) {
      updateParams = params;
      return { rows: [] };
    }
    return { rows: [] };
  };

  const res = await TransporteService.encerrarMdfe(7, 504, {
    siglaUf: 'SP',
    codigoMunicipio: '3550308',
    nomeMunicipio: 'Sao Paulo',
  });

  assert.equal(res.status, 'ENCERRADO');
  assert.equal(res.status_sefaz, '135');
  assert.equal(chamadasEncerrar.length, 2);
  // Verifica que NENHUM campo extra (como codigo_municipio) foi enviado no body de /encerrar
  assert.deepEqual(Object.keys(chamadasEncerrar[0].payload).sort(), [
    'data',
    'nome_municipio',
    'sigla_uf',
  ]);
  assert.equal(chamadasEncerrar[0].payload.nome_municipio, 'Sao Paulo');
  assert.equal(chamadasEncerrar[1].payload.nome_municipio, 'São Paulo');
  assert.ok(res.caminho_damdfe.includes('damdfe_504.pdf'));
  assert.ok(res.caminho_xml.includes('mdfe_504.xml'));
  assert.ok(updateParams);
});

test('gerarMdfesTesteHomologacaoMs — Emite MDF-e #1 (MS->MS encerrado 135) e MDF-e #2 (MS->SP autorizado 100) e bloqueia produção', async (t) => {
  const mdfesStore = new Map();
  const docsStore = new Map();
  let nextMdfeId = 900;

  const origQuery = db.query;
  const origGetEmitente = TransporteService.getEmitente;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getEmitente = origGetEmitente;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  // 1. Garante bloqueio estrito em produção
  TransporteService.getEmitente = async () => ({
    ...EMITENTE_HOMOLOG_MS,
    focus_ambiente: 'producao',
  });
  await assert.rejects(
    () => TransporteService.gerarMdfesTesteHomologacaoMs(7, { pollIntervalMs: 0 }),
    /Homologação/i
  );

  // 2. Execução completa em homologação
  TransporteService.getEmitente = async () => ({ ...EMITENTE_HOMOLOG_MS });
  TransporteService.getFocusClient = async () => ({
    emitente: { ...EMITENTE_HOMOLOG_MS },
    client: {
      ambiente: 'homologacao',
      emitirMdfe: async (ref, payload) => ({
        status: 'autorizado',
        status_sefaz: '100',
        mensagem_sefaz: 'Autorizado o uso do MDF-e',
        chave_mdfe: `5026110327205300015058001${String(payload.numero).padStart(9, '0')}1000000019`,
        numero: payload.numero,
        serie: payload.serie,
        protocolo: `9502600000${payload.numero}`,
        caminho_damdfe: `/arquivos_desenvolvimento/damdfe_${ref}.pdf`,
        caminho_xml_nota_fiscal: `/arquivos_desenvolvimento/mdfe_${ref}.xml`,
      }),
      consultarMdfe: async (ref) => ({
        status: 'autorizado',
        caminho_damdfe: `/arquivos_desenvolvimento/damdfe_${ref}.pdf`,
        caminho_xml_nota_fiscal: `/arquivos_desenvolvimento/mdfe_${ref}.xml`,
      }),
      encerrarMdfe: async () => ({
        status: 'encerrado',
        status_sefaz: '135',
        mensagem_sefaz: 'Evento registrado e vinculado a MDF-e',
      }),
    },
  });

  db.query = async (sql, params = []) => {
    const s = String(sql);
    if (s.includes('FROM dash_mdfes') && s.includes("status = 'AUTORIZADO'") && s.includes('ILIKE')) {
      return { rows: [] };
    }
    if (s.includes('FROM dash_ctes') && s.includes("status = 'AUTORIZADO'")) {
      return {
        rows: [
          {
            id: 23,
            numero: 23,
            serie: '1',
            chave_cte: CHAVE_CTE_MS_SP,
            uf_inicio: 'MS',
            uf_fim: 'SP',
            municipio_inicio: 'Dourados',
            codigo_municipio_inicio: '5003702',
            municipio_fim: 'Sao Paulo',
            codigo_municipio_fim: '3550308',
            valor_total: 280.0,
            valor_carga: 3400.0,
            peso_bruto: 320.0,
            produto_predominante: 'MERCADORIAS DIVERSAS',
            tomador: '0',
            tomador_documento: '03272053000150',
          },
          {
            id: 22,
            numero: 22,
            serie: '1',
            chave_cte: CHAVE_CTE_MS_MS,
            uf_inicio: 'MS',
            uf_fim: 'MS',
            municipio_inicio: 'Dourados',
            codigo_municipio_inicio: '5003702',
            municipio_fim: 'Campo Grande',
            codigo_municipio_fim: '5002704',
            valor_total: 150.0,
            valor_carga: 1850.0,
            peso_bruto: 180.0,
            produto_predominante: 'ALIMENTOS EM GERAL',
            tomador: '0',
            tomador_documento: '03272053000150',
          },
        ],
      };
    }
    if (s.includes('MAX(numero)') && s.includes('dash_mdfes')) {
      return { rows: [{ max_num: 19, total_mdfes: 0 }] };
    }
    if (s.includes('INSERT INTO dash_mdfes')) {
      const id = ++nextMdfeId;
      const row = {
        id,
        tenant_id: params[0],
        emitente_id: params[1],
        ref: params[2],
        status: 'RASCUNHO',
        serie: '1',
        numero: params[3],
        tipo_emitente: '1',
        tipo_transporte: '1',
        uf_inicio: params[4],
        uf_fim: params[5],
        ufs_percurso: JSON.parse(params[6]),
        municipios_carregamento: JSON.parse(params[7]),
        municipios_descarregamento: JSON.parse(params[8]),
        codigo_municipio_carregamento: params[9],
        municipio_carregamento: params[10],
        codigo_municipio_descarregamento: params[11],
        municipio_descarregamento: params[12],
        veiculo_placa: params[13],
        motorista_cpf: '11144477735',
        motorista_nome: 'MOTORISTA HOMOLOGACAO SEFAZ',
        condutores: JSON.parse(params[14]),
        contratantes: JSON.parse(params[15]),
        pagto_frete: JSON.parse(params[16]),
        seguros: JSON.parse(params[17]),
        produtos_predominantes: JSON.parse(params[18]),
        informacao_adicional: params[19],
        valor_carga: params[20],
        peso_bruto: params[21],
      };
      mdfesStore.set(id, row);
      return { rows: [row] };
    }
    if (s.includes('INSERT INTO dash_mdfe_documentos')) {
      docsStore.set(params[1], [
        {
          tipo_documento: 'CTE',
          chave: params[2],
          codigo_municipio_descarregamento: params[3],
          nome_municipio_descarregamento: params[4],
          cte_valor_total: params[2] === CHAVE_CTE_MS_MS ? 150.0 : 280.0,
          cte_valor_carga: params[2] === CHAVE_CTE_MS_MS ? 1850.0 : 3400.0,
          cte_peso_bruto: params[2] === CHAVE_CTE_MS_MS ? 180.0 : 320.0,
        },
      ]);
      return { rows: [] };
    }
    if (s.includes('FROM dash_mdfes m') && s.includes('LEFT JOIN dash_veiculos')) {
      const r = mdfesStore.get(params[0]);
      return { rows: r ? [r] : [] };
    }
    if (s.includes('SELECT m.* FROM dash_mdfes m')) {
      const r = mdfesStore.get(params[0]);
      return { rows: r ? [r] : [] };
    }
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return { rows: docsStore.get(params[0]) || [] };
    }
    if (s.includes('UPDATE dash_mdfes SET') && params.length === 14) {
      const r = mdfesStore.get(params[13]);
      if (r) {
        r.status = params[0];
        r.status_sefaz = params[1] || r.status_sefaz;
        r.mensagem_sefaz = params[2] || r.mensagem_sefaz;
        r.chave_mdfe = params[3] || r.chave_mdfe;
        r.numero = params[4] || r.numero;
        r.caminho_xml = params[7] || r.caminho_xml;
        r.caminho_damdfe = params[8] || r.caminho_damdfe;
      }
      return { rows: [] };
    }
    if (s.includes('UPDATE dash_mdfes SET') && s.includes("status = 'PROCESSANDO'")) {
      const r = mdfesStore.get(params[5]);
      if (r) r.ref = params[0];
      return { rows: [] };
    }
    if (s.includes("status = 'ENCERRADO'")) {
      const r = mdfesStore.get(params[7]);
      if (r) {
        r.status = 'ENCERRADO';
        r.status_sefaz = params[0];
        r.mensagem_sefaz = params[1];
      }
      return { rows: [] };
    }
    return { rows: [] };
  };

  const lote = await TransporteService.gerarMdfesTesteHomologacaoMs(7, { pollIntervalMs: 0 });

  assert.equal(lote.success, true);
  assert.equal(lote.criados, 2);
  assert.equal(lote.autorizados, 2);
  assert.equal(lote.encerrados, 1);
  // MDF-e #1: MS -> MS autorizado e encerrado (135)
  assert.equal(lote.resultados[0].status, 'ENCERRADO');
  assert.equal(lote.resultados[0].status_sefaz, '135');
  assert.equal(lote.resultados[0].encerrado_sefaz, true);
  assert.ok(lote.resultados[0].caminho_damdfe);
  assert.ok(lote.resultados[0].caminho_xml);
  // MDF-e #2: MS -> SP autorizado e mantido em aberto (100)
  assert.equal(lote.resultados[1].status, 'AUTORIZADO');
  assert.equal(lote.resultados[1].status_sefaz, '100');
  assert.ok(lote.resultados[1].caminho_damdfe);
  assert.ok(lote.resultados[1].caminho_xml);
});
