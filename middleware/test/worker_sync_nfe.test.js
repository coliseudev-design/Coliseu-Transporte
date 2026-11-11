'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../src/db/postgres');
const config = require('../src/config/env');
const syncRouter = require('../src/routes/sync');
const TransporteService = require('../src/services/transporteService');
const {
  requireInternalAuth,
  clearInternalValidationCache,
} = require('../src/middleware/auth');

const CHAVE_NFE_ERP = '50261103272053000150550010000104251206363524';

const SAMPLE_NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${CHAVE_NFE_ERP}" versao="4.00">
      <ide>
        <cUF>50</cUF>
        <natOp>VENDA DE MERCADORIA</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>10425</nNF>
        <dhEmi>2026-11-11T09:15:00-04:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>03272053000150</CNPJ>
        <xNome>PANTANAL COMERCIO DE ALIMENTOS LTDA</xNome>
        <IE>283100630</IE>
        <enderEmit>
          <xLgr>RUA ARGENTINA</xLgr>
          <nro>715</nro>
          <xBairro>PARQUE DAS NACOES</xBairro>
          <cMun>5003702</cMun>
          <xMun>Dourados</xMun>
          <UF>MS</UF>
          <CEP>79841270</CEP>
          <fone>6734164605</fone>
        </enderEmit>
      </emit>
      <dest>
        <CNPJ>60746948000112</CNPJ>
        <xNome>SUPERMERCADO DESTINO SP LTDA</xNome>
        <indIEDest>1</indIEDest>
        <IE>110042490114</IE>
        <enderDest>
          <xLgr>AVENIDA PAULISTA</xLgr>
          <nro>1000</nro>
          <xBairro>BELA VISTA</xBairro>
          <cMun>3550308</cMun>
          <xMun>Sao Paulo</xMun>
          <UF>SP</UF>
          <CEP>01310100</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <xProd>ARROZ TIPO 1 FARDO 30KG</xProd>
          <NCM>10063021</NCM>
          <CFOP>6102</CFOP>
          <uCom>FD</uCom>
          <qCom>50.0000</qCom>
          <vUnCom>120.0000</vUnCom>
          <vProd>6000.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>6000.00</vProd>
          <vNF>6000.00</vNF>
        </ICMSTot>
      </total>
      <transp>
        <vol>
          <qVol>50</qVol>
          <esp>FARDOS</esp>
          <pesoL>1500.000</pesoL>
          <pesoB>1525.000</pesoB>
        </vol>
      </transp>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>${CHAVE_NFE_ERP}</chNFe>
      <nProt>150260009998887</nProt>
    </infProt>
  </protNFe>
</nfeProc>`;

test('Blindagem 1 — Nginx expõe proxy dedicado para /internal/sync sem retornar 405 estático', () => {
  const nginxPath = path.resolve(__dirname, '../../frontend/nginx.conf');
  const nginxConf = fs.readFileSync(nginxPath, 'utf8');

  assert.match(nginxConf, /location\s+\^~\s+\/internal\/sync\s*\{/);
  assert.match(nginxConf, /location\s+\/api\/\s*\{/);
  assert.match(nginxConf, /http:\/\/coliseu-transporte-middleware:3200/);
});

test('Blindagem 2A — normalizarCargaErpRow mapeia colunas flat do Firebird/ERP sem depender do Coliseu Dash', () => {
  const row = syncRouter.normalizarCargaErpRow({
    id_nota: '9871',
    chave_nfe: `${CHAVE_NFE_ERP.slice(0, 4)}-${CHAVE_NFE_ERP.slice(4)}`,
    nnf: '10425',
    serie_nfe: '1',
    dt_emissao: '11/11/2026',
    cnpj_emitente: '03.272.053/0001-50',
    emitente_razao: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
    cidade_origem: 'Dourados',
    uf_origem: 'ms',
    cmun_emit: '5003702',
    cpf_cnpj: '60.746.948/0001-12',
    nome_cliente: 'SUPERMERCADO DESTINO SP LTDA',
    cidade_destino: 'Sao Paulo',
    uf_destino: 'sp',
    cod_ibge_destinatario: '3550308',
    cliente_cep: '01310-100',
    vnf: '6000.50',
    pesob: '1525.75',
    qvol: '50',
    esp: 'FARDOS',
    xprod: 'ARROZ TIPO 1 FARDO 30KG',
    cfop: '6102',
  });

  assert.equal(row.id_firebird, 9871);
  assert.equal(row.chave_acesso, CHAVE_NFE_ERP);
  assert.equal(row.numero, '10425');
  assert.equal(row.serie, '1');
  assert.equal(row.data_emissao, '2026-11-11');
  assert.equal(row.remetente_documento, '03272053000150');
  assert.equal(row.remetente_uf, 'MS');
  assert.equal(row.destinatario_documento, '60746948000112');
  assert.equal(row.destinatario_uf, 'SP');
  assert.equal(row.valor_total, 6000.5);
  assert.equal(row.peso_bruto, 1525.75);
  assert.equal(row.volumes, 50);
  assert.equal(row.status, 'PENDENTE');
  assert.equal(row.dados_nfe.origem, 'WORKER_ERP');
  assert.equal(row.dados_nfe.remetente.codigo_municipio, '5003702');
  assert.equal(row.dados_nfe.destinatario.codigo_municipio, '3550308');
  assert.equal(row.dados_nfe.destinatario.cep, '01310100');
});

test('Blindagem 2B — normalizarCargaErpRow extrai XML NF-e em Base64 e respeita cancelamento do ERP', () => {
  const xmlBase64 = Buffer.from(SAMPLE_NFE_XML, 'utf8').toString('base64');
  const row = syncRouter.normalizarCargaErpRow({
    id_nfe: 445,
    xml_nfe: xmlBase64,
  });

  assert.equal(row.id_firebird, 445);
  assert.equal(row.chave_acesso, CHAVE_NFE_ERP);
  assert.equal(row.numero, '10425');
  assert.equal(row.remetente_documento, '03272053000150');
  assert.equal(row.destinatario_documento, '60746948000112');
  assert.equal(row.destinatario_municipio, 'Sao Paulo');
  assert.equal(row.destinatario_uf, 'SP');
  assert.equal(row.valor_total, 6000);
  assert.equal(row.peso_bruto, 1525);
  assert.equal(row.produto_predominante, 'ARROZ TIPO 1 FARDO 30KG');
  assert.equal(row.dados_nfe.destinatario.codigo_municipio, '3550308');
  assert.equal(row.dados_nfe.itens.length, 1);

  const rowCancelada = syncRouter.normalizarCargaErpRow({
    chave_nfe: CHAVE_NFE_ERP,
    cancelada: 'S',
  });
  assert.equal(rowCancelada.status, 'CANCELADA');
});

test('Blindagem 2C — normalizarVeiculoErpRow, normalizarMotoristaErpRow e ALIAS_MAP do Transporte', () => {
  assert.equal(syncRouter.ALIAS_MAP['cargas'], 'dash_cargas');
  assert.equal(syncRouter.ALIAS_MAP['notas'], 'dash_cargas');
  assert.equal(syncRouter.ALIAS_MAP['nfes'], 'dash_cargas');
  assert.equal(syncRouter.ALIAS_MAP['frota'], 'dash_veiculos');
  assert.equal(syncRouter.ALIAS_MAP['condutores'], 'dash_motoristas');

  const veic = syncRouter.normalizarVeiculoErpRow({
    id_veiculo: '12',
    placa_veiculo: 'qek-4h63',
    tara: '4800',
    capacidade: '14000',
    rntrc: '04755-410',
  });
  assert.equal(veic.id_firebird, 12);
  assert.equal(veic.placa, 'QEK4H63');
  assert.equal(veic.tara_kg, 4800);
  assert.equal(veic.capacidade_kg, 14000);
  assert.equal(veic.rntrc, '04755410');

  const mot = syncRouter.normalizarMotoristaErpRow({
    id_motorista: '7',
    cpf_motorista: '111.444.777-35',
    nome_motorista: 'JOSE MOTORISTA ERP',
    categoria_cnh: 'ae',
    validade_cnh: '25/12/2028',
    celular: '(67) 99988-7766',
  });
  assert.equal(mot.id_firebird, 7);
  assert.equal(mot.cpf, '11144477735');
  assert.equal(mot.nome, 'JOSE MOTORISTA ERP');
  assert.equal(mot.cnh_categoria, 'AE');
  assert.equal(mot.cnh_validade, '2028-12-25');
  assert.equal(mot.telefone, '67999887766');
});

test('Blindagem 3 — requireInternalAuth valida fallback de slug transporte sem consultar coliseu-dash', async (t) => {
  const origFetch = global.fetch;
  const origSec = { ...config.security };

  t.after(() => {
    global.fetch = origFetch;
    Object.assign(config.security, origSec);
    clearInternalValidationCache();
  });

  clearInternalValidationCache();
  config.security.identityApiUrl = 'https://adminlicencas.coliseusistemas.com.br';
  config.security.identityInternalKey = 'mock-id';
  config.security.expectedModuleSlug = 'coliseu-transporte';
  config.security.internalApiKey = 'mock-key';

  const urlsChamadas = [];
  global.fetch = async (url) => {
    urlsChamadas.push(String(url));
    if (String(url).includes('/modules/coliseu-transporte/validate-key')) {
      return {
        status: 404,
        json: async () => ({ error: 'Módulo não encontrado com este slug' }),
      };
    }
    if (String(url).includes('/modules/transporte/validate-key')) {
      return {
        status: 200,
        json: async () => ({ valid: true }),
      };
    }
    throw new Error(`URL inesperada chamada: ${url}`);
  };

  const tenantUuid = 'ed1d3a98-1234-4abc-8def-1234567890ab';
  const req = {
    ip: '127.0.0.1',
    path: '/internal/sync/cargas',
    headers: {
      'x-internal-key': 'COL-TEST-TRAN-9999',
      'x-tenant-id': tenantUuid,
    },
  };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return { json: () => {} };
    },
  };
  let nextCalled = false;

  await requireInternalAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(statusCode, null);
  assert.equal(req.tenant.id, tenantUuid);
  assert.equal(req.device.moduleSlug, 'transporte');
  assert.equal(urlsChamadas.some((u) => u.includes('coliseu-dash')), false);
  assert.equal(urlsChamadas.length, 2);
});

test('Blindagem 4 — emitirMdfe Carga Própria (tpEmit=2) vincula NF-e direta e omite CT-e, RNTRC, CIOT e infPag em frota própria', async (t) => {
  const payloadsEnviados = [];
  const origQuery = db.query;
  const origGetFocusClient = TransporteService.getFocusClient;

  t.after(() => {
    db.query = origQuery;
    TransporteService.getFocusClient = origGetFocusClient;
  });

  TransporteService.getFocusClient = async () => ({
    emitente: {
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
      focus_ambiente: 'producao',
    },
    client: {
      ambiente: 'producao',
      emitirMdfe: async (ref, payload) => {
        payloadsEnviados.push({ ref, payload });
        return {
          status: 'autorizado',
          status_sefaz: '100',
          mensagem_sefaz: 'Autorizado o uso do MDF-e',
          chave_mdfe: '50261103272053000150580010000000251000000258',
          numero: payload.numero,
          serie: payload.serie,
          protocolo: '950260000099999',
        };
      },
      consultarMdfe: async () => null,
    },
  });

  db.query = async (sql) => {
    const s = String(sql);
    if (s.includes('FROM dash_mdfes m')) {
      return {
        rows: [
          {
            id: 25,
            tenant_id: 7,
            emitente_id: 1,
            ref: 'MDFE-PROPRIA-25',
            status: 'RASCUNHO',
            serie: '1',
            numero: 25,
            tipo_emitente: '2',
            tipo_transporte: '1',
            uf_inicio: 'MS',
            uf_fim: 'SP',
            codigo_municipio_carregamento: '5003702',
            municipio_carregamento: 'Dourados',
            veiculo_placa: 'QEK4H63',
            v_tipo_proprietario: '1',
            motorista_cpf: '11144477735',
            motorista_nome: 'MOTORISTA FROTA PROPRIA',
            valor_carga: 6000,
            peso_bruto: 1525,
            pagto_frete: [],
            produtos_predominantes: [
              {
                tipo_carga: '05',
                descricao: 'ARROZ TIPO 1 FARDO 30KG',
                ncm: '10063021',
                lotacao: true,
              },
            ],
          },
        ],
      };
    }
    if (s.includes('FROM dash_mdfe_documentos md')) {
      return {
        rows: [
          {
            tipo_documento: 'NFE',
            chave: CHAVE_NFE_ERP,
            codigo_municipio_descarregamento: '3550308',
            nome_municipio_descarregamento: 'Sao Paulo',
            nfe_mun_fim: 'Sao Paulo',
            nfe_uf_fim: 'SP',
            nfe_valor_total: 6000,
            nfe_peso_bruto: 1525,
            nfe_produto: 'ARROZ TIPO 1 FARDO 30KG',
            nfe_dados: {
              destinatario: { cep: '01310100', codigo_municipio: '3550308' },
            },
          },
        ],
      };
    }
    if (s.includes('MAX(numero)')) {
      return { rows: [{ max_num: 24 }] };
    }
    return { rows: [] };
  };

  const res = await TransporteService.emitirMdfe(7, 25);
  assert.equal(res.status, 'AUTORIZADO');
  assert.equal(payloadsEnviados.length, 1);

  const p = payloadsEnviados[0].payload;
  assert.equal(p.emitente, '2');
  assert.equal(p.quantidade_total_nfe, 1);
  assert.equal(p.quantidade_total_cte, undefined);
  assert.deepEqual(p.municipios_descarregamento[0].notas_fiscais, [
    { chave_nfe: CHAVE_NFE_ERP },
  ]);
  assert.equal(p.municipios_descarregamento[0].conhecimentos_transporte, undefined);
  assert.equal(p.modal_rodoviario.registro_nacional_transporte, undefined);
  assert.equal(p.modal_rodoviario.ciot, undefined);
  assert.equal(p.modal_rodoviario.pagamentos, undefined);
});
