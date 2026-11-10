'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  calcularTributosCte400,
  montarCamposFocusImpostosCte400,
  resolverVigenciaReforma,
} = require('../src/services/fiscal/cteTaxCalculator');

const {
  gerarXmlCte400PreAssinatura,
  assinarXmlCte400TesteOffline,
  validarXmlCte400NoXsdOficial,
} = require('../src/services/fiscal/cteXmlBuilder');

const db = require('../src/db/postgres');
const TransporteService = require('../src/services/transporteService');

const EMITENTE_CENARIO_MS = {
  id: 1,
  cnpj: '03272053000150',
  inscricao_estadual: '283100630',
  razao_social: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
  nome_fantasia: 'PANTANAL',
  regime_tributario: '3', // CRT=3 (Regime Normal)
  rntrc: '04755410',
  logradouro: 'RUA ARGENTINA',
  numero: '715',
  bairro: 'PARQUE DAS NACOES',
  cep: '79841270',
  uf: 'MS',
  municipio: 'Dourados',
  codigo_municipio: '5003702',
  telefone: '6734164605',
  focus_ambiente: 'homologacao',
};

const REGRA_MS_SP_2026 = {
  escopo: 'UF_PAR',
  uf_origem: 'MS',
  uf_destino: 'SP',
  situacao_tributaria: '00',
  cfop: '6353',
  aliquota_icms: '12.00',
  ibs_cbs_cst: '000',
  ibs_cbs_class_trib: '000001',
  aliquota_ibs: '0.10',
  aliquota_ibs_mun: '0.00',
  aliquota_cbs: '0.90',
  reducao_aliquota_ibs_cbs: '0.00',
};

const CTE_BASE_CENARIO_280 = {
  serie: '1',
  numero: 24, // Novo documento de teste (preserva o nº 23 já autorizado)
  modelo: '57',
  modal: '01',
  tipo_servico: '0',
  cfop: '6353',
  natureza_operacao: 'PRESTACAO DE SERVICO DE TRANSPORTE INTERESTADUAL',
  uf_inicio: 'MS',
  municipio_inicio: 'Dourados',
  codigo_municipio_inicio: '5003702',
  uf_fim: 'SP',
  municipio_fim: 'Sao Paulo',
  codigo_municipio_fim: '3550308',
  tomador: '0',
  valor_total: '280.00',
  valor_receber: '280.00',
  componentes_valor: [{ nome: 'FRETE VALOR', valor: '280.00' }],
  icms_situacao_tributaria: '00',
  aliquota_icms: '12.00',
  ibs_cbs_cst: '000',
  ibs_cbs_class_trib: '000001',
  aliquota_ibs: '0.10',
  aliquota_ibs_mun: '0.00',
  aliquota_cbs: '0.90',
  valor_carga: '3400.00',
  peso_bruto: '320.0000',
  produto_predominante: 'MERCADORIAS DIVERSAS',
  outras_caracteristicas_carga: 'CAIXAS',
  remetente_dados: {
    documento: '03272053000150',
    inscricao_estadual: '283100630',
    razao_social: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
    logradouro: 'RUA ARGENTINA',
    numero: '715',
    bairro: 'PARQUE DAS NACOES',
    codigo_municipio: '5003702',
    municipio: 'Dourados',
    cep: '79841270',
    uf: 'MS',
    telefone: '6734164605',
  },
  destinatario_dados: {
    documento: '11144477735',
    inscricao_estadual: '',
    razao_social: 'DESTINATARIO TESTE SP',
    logradouro: 'AVENIDA PAULISTA',
    numero: '1000',
    bairro: 'BELA VISTA',
    codigo_municipio: '3550308',
    municipio: 'Sao Paulo',
    cep: '01310100',
    uf: 'SP',
    telefone: '6734164605',
  },
  documentos_json: [{ tipo: 'OUTRO', numero: '102' }],
  observacoes: 'DOCUMENTO DE TESTE OFFLINE - REVISAO BASE IBS/CBS LC 214/2025 ART. 12 PAR. 2 INC. V',
};

test('1. Cenário isolado de referência (MS -> SP, CRT=3, vTPrest=280.00, ICMS 12%=33.60, sem outras deduções)', () => {
  // Arrange & Act
  const calculo = calcularTributosCte400({
    cte: CTE_BASE_CENARIO_280,
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  const focusPayload = montarCamposFocusImpostosCte400(calculo, {
    cte: CTE_BASE_CENARIO_280,
    ufInicio: 'MS',
    ufFim: 'SP',
  });

  // Assert — Preservação do ICMS
  assert.equal(calculo.valores.vTPrest, '280.00');
  assert.equal(calculo.valores.icms.CST || calculo.valores.icms.cst, '00');
  assert.equal(calculo.valores.icms.vBC, '280.00');
  assert.equal(calculo.valores.icms.pICMS, '12.00');
  assert.equal(calculo.valores.icms.vICMS, '33.60');

  // Assert — Exclusão do ICMS da base IBS/CBS (LC 214/2025, art. 12, § 2º, V)
  assert.equal(calculo.valores.deducoesBaseIbsCbs.icms, '33.60');
  assert.equal(calculo.valores.deducoesBaseIbsCbs.pis, '0.00');
  assert.equal(calculo.valores.deducoesBaseIbsCbs.cofins, '0.00');
  assert.equal(calculo.valores.ibsCbs.vBC, '246.40');

  // Assert — Arredondamento monetário comercial half-up (246.40 * 0.10% = 0.2464 -> 0.25 | 246.40 * 0.90% = 2.2176 -> 2.22)
  assert.equal(calculo.valores.ibsCbs.vIBSUF, '0.25');
  assert.equal(calculo.valores.ibsCbs.vIBSMun, '0.00');
  assert.equal(calculo.valores.ibsCbs.vIBS, '0.25');
  assert.equal(calculo.valores.ibsCbs.vCBS, '2.22');

  // Assert — Exceção de 2026 nas Notas Técnicas: vTotDFe = vTPrest (não soma IBS/CBS em 2026)
  assert.equal(calculo.vigencia.fase, 'TRANSICAO_2026');
  assert.equal(calculo.valores.vTotDFe, '280.00');

  // Assert — Payload enviado ao provedor fiscal (Focus NFe v2) reflete a base líquida
  assert.equal(focusPayload.icmsFields.icms_base_calculo, '280.00');
  assert.equal(focusPayload.icmsFields.icms_valor, '33.60');
  assert.equal(focusPayload.ibsCbsFields.ibs_cbs_base_calculo, '246.40');
  assert.equal(focusPayload.ibsCbsFields.ibs_uf_valor, '0.25');
  assert.equal(focusPayload.ibsCbsFields.ibs_mun_valor, '0.00');
  assert.equal(focusPayload.ibsCbsFields.ibs_valor_total, '0.25');
  assert.equal(focusPayload.ibsCbsFields.cbs_valor, '2.22');
  assert.equal(focusPayload.ibsCbsFields.valor_total_dfe, '280.00');

  // Assert — Não presume PIS/COFINS pelo CRT=3; explicita pendência cadastral/fiscal
  assert.equal(calculo.baseDefinitivaConfirmada, false);
  assert.equal(calculo.pendenciasFiscais.length, 1);
  assert.equal(calculo.pendenciasFiscais[0].codigo, 'PIS_COFINS_NAO_PARAMETRIZADO');
});

test('2. Composição da base IBS/CBS com PIS/COFINS incidentes (Cumulativo e Não Cumulativo sobre base sem ICMS)', () => {
  // 2A. Regime Cumulativo (PIS 0,65% + COFINS 3,00% sobre 246,40 — Tema 69 STF / Lei 14.592/2023)
  const calcCumulativo = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'INCIDENTE',
      pis_cst: '01',
      aliquota_pis: '0.65',
      cofins_cst: '01',
      aliquota_cofins: '3.00',
      excluir_icms_base_pis_cofins: true,
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(calcCumulativo.baseDefinitivaConfirmada, true);
  assert.equal(calcCumulativo.pendenciasFiscais.length, 0);
  assert.equal(calcCumulativo.valores.pisCofins.vBC, '246.40');
  assert.equal(calcCumulativo.valores.pisCofins.vPIS, '1.60'); // 246.40 * 0.65% = 1.6016 -> 1.60
  assert.equal(calcCumulativo.valores.pisCofins.vCOFINS, '7.39'); // 246.40 * 3.00% = 7.392 -> 7.39
  assert.equal(calcCumulativo.valores.deducoesBaseIbsCbs.totalExcluido, '42.59'); // 33.60 + 1.60 + 7.39
  assert.equal(calcCumulativo.valores.ibsCbs.vBC, '237.41'); // 280.00 - 42.59
  assert.equal(calcCumulativo.valores.ibsCbs.vIBSUF, '0.24'); // 237.41 * 0.10% = 0.23741 -> 0.24
  assert.equal(calcCumulativo.valores.ibsCbs.vCBS, '2.14'); // 237.41 * 0.90% = 2.13669 -> 2.14
  assert.equal(calcCumulativo.valores.vTotDFe, '280.00');

  // 2B. Regime Não Cumulativo (PIS 1,65% + COFINS 7,60% sobre 246,40)
  const calcNaoCumulativo = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'INCIDENTE',
      pis_cst: '01',
      aliquota_pis: '1.65',
      cofins_cst: '01',
      aliquota_cofins: '7.60',
      excluir_icms_base_pis_cofins: true,
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(calcNaoCumulativo.baseDefinitivaConfirmada, true);
  assert.equal(calcNaoCumulativo.pendenciasFiscais.length, 0);
  assert.equal(calcNaoCumulativo.valores.pisCofins.vBC, '246.40');
  assert.equal(calcNaoCumulativo.valores.pisCofins.vPIS, '4.07'); // 246.40 * 1.65% = 4.0656 -> 4.07
  assert.equal(calcNaoCumulativo.valores.pisCofins.vCOFINS, '18.73'); // 246.40 * 7.60% = 18.7264 -> 18.73
  assert.equal(calcNaoCumulativo.valores.deducoesBaseIbsCbs.totalExcluido, '56.40'); // 33.60 + 4.07 + 18.73
  assert.equal(calcNaoCumulativo.valores.ibsCbs.vBC, '223.60'); // 280.00 - 56.40
  assert.equal(calcNaoCumulativo.valores.ibsCbs.vIBSUF, '0.22'); // 223.60 * 0.10% = 0.2236 -> 0.22
  assert.equal(calcNaoCumulativo.valores.ibsCbs.vCBS, '2.01'); // 223.60 * 0.90% = 2.0124 -> 2.01
  assert.equal(calcNaoCumulativo.valores.vTotDFe, '280.00');
});

test('3. Não incidência confirmada de PIS/COFINS (CST 06) vs modo INCIDENTE incompleto', () => {
  // 3A. Operação com alíquota zero / não incidência confirmada (ex.: CST 06)
  const calcAliqZero = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'NAO_INCIDENTE',
      pis_cst: '06',
      cofins_cst: '06',
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(calcAliqZero.baseDefinitivaConfirmada, true);
  assert.equal(calcAliqZero.pendenciasFiscais.length, 0);
  assert.equal(calcAliqZero.valores.ibsCbs.vBC, '246.40');
  assert.equal(calcAliqZero.valores.ibsCbs.vIBSUF, '0.25');
  assert.equal(calcAliqZero.valores.ibsCbs.vCBS, '2.22');

  // 3B. Modo INCIDENTE marcado sem alíquotas nem valores -> não presume pelo CRT e aponta pendência
  const calcIncompleto = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'INCIDENTE',
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(calcIncompleto.baseDefinitivaConfirmada, false);
  assert.equal(calcIncompleto.pendenciasFiscais.length, 1);
  assert.equal(calcIncompleto.pendenciasFiscais[0].codigo, 'PIS_COFINS_ALIQUOTA_OU_VALOR_AUSENTE');
  assert.equal(calcIncompleto.valores.ibsCbs.vBC, '246.40');
});

test('4. Prevenção de dupla dedução (idempotência) e preservação de CST 40 / MS interno (17%)', () => {
  // 4A. Rascunho reprocessado já trazendo ibs_cbs_base_calculo, valor_icms, valor_pis e valor_cofins gravados
  const primeiroCalculo = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'INCIDENTE',
      aliquota_pis: '0.65',
      aliquota_cofins: '3.00',
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  const segundoCalculo = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'INCIDENTE',
      aliquota_pis: '0.65',
      aliquota_cofins: '3.00',
      base_icms: primeiroCalculo.valores.icms.vBC,
      valor_icms: primeiroCalculo.valores.icms.vICMS,
      ibs_cbs_base_calculo: primeiroCalculo.valores.ibsCbs.vBC,
      valor_pis: primeiroCalculo.valores.pisCofins.vPIS,
      valor_cofins: primeiroCalculo.valores.pisCofins.vCOFINS,
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(segundoCalculo.valores.ibsCbs.vBC, '237.41');
  assert.equal(segundoCalculo.valores.ibsCbs.vIBSUF, '0.24');
  assert.equal(segundoCalculo.valores.ibsCbs.vCBS, '2.14');

  // 4B. Operação isenta de ICMS (CST 40) e sem PIS/COFINS incidente -> não deduz ICMS inexistente
  const calcIsento = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      icms_situacao_tributaria: '40',
      aliquota_icms: '0.00',
      pis_cofins_modo: 'NAO_INCIDENTE',
      pis_cst: '06',
      cofins_cst: '06',
    },
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(calcIsento.valores.icms.vICMS, '0.00');
  assert.equal(calcIsento.valores.ibsCbs.vBC, '280.00');
  assert.equal(calcIsento.valores.ibsCbs.vIBSUF, '0.28');
  assert.equal(calcIsento.valores.ibsCbs.vCBS, '2.52');

  // 4C. Operação interna MS -> MS (ICMS 17% = 47.60 -> Base IBS/CBS = 232.40)
  const calcInternoMs = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      cfop: '5353',
      uf_fim: 'MS',
      aliquota_icms: '17.00',
      pis_cofins_modo: 'NAO_INCIDENTE',
      pis_cst: '06',
      cofins_cst: '06',
    },
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'MS',
    dataEmissao: '2026-11-10T15:32:46-04:00',
  });

  assert.equal(calcInternoMs.valores.icms.vICMS, '47.60');
  assert.equal(calcInternoMs.valores.ibsCbs.vBC, '232.40');
});

test('5. Tratamento por data de vigência (2026 vs 2027-2032 vs 2033)', () => {
  const vig2026 = resolverVigenciaReforma('2026-11-10');
  assert.equal(vig2026.somarIbsCbsNoTotalDfe, false);
  assert.equal(vig2026.excluirPisCofinsDaBaseIbsCbs, true);
  assert.equal(vig2026.excluirIcmsIssDaBaseIbsCbs, true);

  // Em 2027: PIS/COFINS extintos (EC 132/2023, art. 126, I), ICMS continua excluído e IBS/CBS somam ao vTotDFe
  const calc2027 = calcularTributosCte400({
    cte: {
      ...CTE_BASE_CENARIO_280,
      pis_cofins_modo: 'INCIDENTE',
      aliquota_pis: '1.65',
      aliquota_cofins: '7.60',
    },
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2027-02-15T10:00:00-04:00',
  });

  assert.equal(calc2027.vigencia.fase, 'TRANSICAO_2027_2032');
  assert.equal(calc2027.valores.pisCofins.status, 'EXTINTO_PELA_REFORMA');
  assert.equal(calc2027.valores.pisCofins.vPIS, '0.00');
  assert.equal(calc2027.valores.pisCofins.vCOFINS, '0.00');
  assert.equal(calc2027.valores.ibsCbs.vBC, '246.40'); // Apenas ICMS (33.60) excluído em 2027
  assert.equal(calc2027.valores.vTotDFe, '282.47'); // 280.00 + 0.25 + 2.22
  assert.equal(calc2027.baseDefinitivaConfirmada, true);

  // Em 2033: ICMS extinto (EC 132/2023, art. 129)
  const calc2033 = calcularTributosCte400({
    cte: CTE_BASE_CENARIO_280,
    regraFiscal: REGRA_MS_SP_2026,
    emitente: EMITENTE_CENARIO_MS,
    ufInicio: 'MS',
    ufFim: 'SP',
    dataEmissao: '2033-01-10T10:00:00-04:00',
  });

  assert.equal(calc2033.vigencia.fase, 'PLENO_2033');
  assert.equal(calc2033.valores.ibsCbs.vBC, '280.00');
  assert.equal(calc2033.valores.vTotDFe, '282.80');
});

test('6. Geração de novos XMLs de teste pré-assinatura e validação nos XSDs oficiais SEFAZ (PL_CTe_400_RTC)', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  fs.mkdirSync(fixturesDir, { recursive: true });

  // 6A. Novo documento de teste nº 24 — Cenário isolado (somente exclusão do ICMS: vBC = 246.40)
  const geradoIsolado = gerarXmlCte400PreAssinatura({
    cte: CTE_BASE_CENARIO_280,
    emitente: EMITENTE_CENARIO_MS,
    regraFiscal: REGRA_MS_SP_2026,
    dhEmi: '2026-11-10T16:10:00-04:00',
    cCT: '20636353',
  });

  // Confirma que a correção ocorre ANTES da assinatura digital
  assert.ok(!geradoIsolado.xmlPreAssinatura.includes('<Signature'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<nCT>24</nCT>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<tpAmb>2</tpAmb>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<ICMS00><CST>00</CST><vBC>280.00</vBC><pICMS>12.00</pICMS><vICMS>33.60</vICMS></ICMS00>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<gIBSCBS><vBC>246.40</vBC>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<vIBSUF>0.25</vIBSUF>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<vIBSMun>0.00</vIBSMun>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<vIBS>0.25</vIBS>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<vCBS>2.22</vCBS>'));
  assert.ok(geradoIsolado.xmlPreAssinatura.includes('<vTotDFe>280.00</vTotDFe>'));

  const xmlAssinadoIsolado = assinarXmlCte400TesteOffline(geradoIsolado.xmlPreAssinatura);
  // Garante que a assinatura não alterou nenhum byte de <infCte>
  assert.ok(xmlAssinadoIsolado.includes(geradoIsolado.infCteXml));

  fs.writeFileSync(
    path.join(fixturesDir, 'cte400_homolog_ms_sp_n24_pre_assinatura.xml'),
    geradoIsolado.xmlPreAssinatura,
    'utf8'
  );
  fs.writeFileSync(
    path.join(fixturesDir, 'cte400_homolog_ms_sp_n24_xsd_validado.xml'),
    xmlAssinadoIsolado,
    'utf8'
  );

  const validacaoIsolado = validarXmlCte400NoXsdOficial({
    xmlCteAssinado: xmlAssinadoIsolado,
    rodoXml: geradoIsolado.rodoXml,
  });
  assert.equal(
    validacaoIsolado.valido,
    true,
    `Falha no XSD oficial (cenário isolado): ${JSON.stringify(validacaoIsolado.erros)}`
  );
  assert.equal(validacaoIsolado.erros.length, 0);

  // 6B. Novo documento de teste nº 25 — Com PIS/COFINS cumulativos incidentes (vBC = 237.41)
  const geradoComPisCofins = gerarXmlCte400PreAssinatura({
    cte: {
      ...CTE_BASE_CENARIO_280,
      numero: 25,
      pis_cofins_modo: 'INCIDENTE',
      pis_cst: '01',
      aliquota_pis: '0.65',
      cofins_cst: '01',
      aliquota_cofins: '3.00',
    },
    emitente: EMITENTE_CENARIO_MS,
    regraFiscal: REGRA_MS_SP_2026,
    dhEmi: '2026-11-10T16:15:00-04:00',
    cCT: '20636354',
  });

  assert.ok(geradoComPisCofins.xmlPreAssinatura.includes('<gIBSCBS><vBC>237.41</vBC>'));
  assert.ok(geradoComPisCofins.xmlPreAssinatura.includes('<vIBSUF>0.24</vIBSUF>'));
  assert.ok(geradoComPisCofins.xmlPreAssinatura.includes('<vCBS>2.14</vCBS>'));
  assert.ok(geradoComPisCofins.xmlPreAssinatura.includes('<vTotDFe>280.00</vTotDFe>'));

  const xmlAssinadoPisCofins = assinarXmlCte400TesteOffline(geradoComPisCofins.xmlPreAssinatura);
  fs.writeFileSync(
    path.join(fixturesDir, 'cte400_homolog_ms_sp_n25_com_pis_cofins_xsd_validado.xml'),
    xmlAssinadoPisCofins,
    'utf8'
  );

  const validacaoPisCofins = validarXmlCte400NoXsdOficial({
    xmlCteAssinado: xmlAssinadoPisCofins,
    rodoXml: geradoComPisCofins.rodoXml,
  });
  assert.equal(
    validacaoPisCofins.valido,
    true,
    `Falha no XSD oficial (cenário PIS/COFINS): ${JSON.stringify(validacaoPisCofins.erros)}`
  );
  assert.equal(validacaoPisCofins.erros.length, 0);

  // 6C. Prova contrária do validador XSD: um cClassTrib inválido (3 dígitos em vez de 6) DEVE falhar no XSD oficial
  const xmlInvalidoXsd = xmlAssinadoIsolado.replace(
    '<cClassTrib>000001</cClassTrib>',
    '<cClassTrib>001</cClassTrib>'
  );
  const validacaoContraProva = validarXmlCte400NoXsdOficial({
    xmlCteAssinado: xmlInvalidoXsd,
    rodoXml: geradoIsolado.rodoXml,
  });
  assert.equal(validacaoContraProva.valido, false);
  assert.ok(validacaoContraProva.erros.length > 0);
});

test('7. Proteção de integridade: bloqueia reemissão/alteração de CT-e já AUTORIZADO', async () => {
  const originalQuery = db.query;
  let queriesExecutadas = 0;

  db.query = async (sql) => {
    queriesExecutadas += 1;
    if (String(sql).includes('FROM dash_ctes')) {
      return {
        rows: [
          {
            id: 23,
            numero: 23,
            serie: '1',
            status: 'AUTORIZADO',
            chave_cte: '50261103272053000150570010000000231206363527',
          },
        ],
      };
    }
    throw new Error('Nenhuma outra query ou transmissão deveria ser executada para CT-e AUTORIZADO.');
  };

  try {
    await assert.rejects(
      () => TransporteService.emitirCte(1, 23),
      /já autorizado pela SEFAZ.*preservados/i
    );
    assert.equal(queriesExecutadas, 1);
  } finally {
    db.query = originalQuery;
  }
});
