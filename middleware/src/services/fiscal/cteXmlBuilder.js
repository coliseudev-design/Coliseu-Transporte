'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { calcularTributosCte400, parseDecimalScaled, formatCents } = require('./cteTaxCalculator');

const UF_IBGE_MAP = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
};

function digitsOnly(val) {
  return String(val || '').replace(/\D/g, '');
}

function escapeXml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

function formatDecimal4(val) {
  const scaled4 = parseDecimalScaled(val, 4);
  const abs = scaled4 < 0n ? -scaled4 : scaled4;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, '0');
  return `${scaled4 < 0n ? '-' : ''}${intPart.toString()}.${fracPart}`;
}

/**
 * Calcula o dígito verificador Módulo 11 (pesos 2..9) da chave de acesso de 43 dígitos da SEFAZ.
 */
function calcularDigitoVerificadorChave(chave43) {
  const limpo = digitsOnly(chave43);
  if (limpo.length !== 43) {
    throw new Error(`Chave base para cálculo de cDV deve ter 43 dígitos (recebido: ${limpo.length}).`);
  }
  let peso = 2;
  let soma = 0;
  for (let i = limpo.length - 1; i >= 0; i--) {
    soma += Number(limpo[i]) * peso;
    peso = peso >= 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv === 0 || dv === 1 || dv >= 10 ? '0' : String(dv);
}

/**
 * Gera a chave de acesso oficial de 44 dígitos do CT-e.
 */
function calcularChaveAcessoCte({
  cUF = '50',
  dhEmi = '2026-11-10T15:32:46-04:00',
  cnpjEmitente = '03272053000150',
  mod = '57',
  serie = '1',
  nCT = '24',
  tpEmis = '1',
  cCT = '20636352',
}) {
  const ufCod = digitsOnly(cUF).padStart(2, '0').slice(0, 2);
  const matchData = String(dhEmi).match(/^(\d{4})-(\d{2})/);
  const aamm = matchData ? `${matchData[1].slice(2, 4)}${matchData[2]}` : '2611';
  const cnpj = digitsOnly(cnpjEmitente).padStart(14, '0').slice(0, 14);
  const modelo = digitsOnly(mod).padStart(2, '0').slice(0, 2);
  const seriePad = digitsOnly(serie).padStart(3, '0').slice(-3);
  const nCtPad = digitsOnly(nCT).padStart(9, '0').slice(-9);
  const tpEmisPad = digitsOnly(tpEmis).slice(0, 1) || '1';
  const cCtPad = digitsOnly(cCT).padStart(8, '0').slice(-8);

  const chave43 = `${ufCod}${aamm}${cnpj}${modelo}${seriePad}${nCtPad}${tpEmisPad}${cCtPad}`;
  const cDV = calcularDigitoVerificadorChave(chave43);
  return {
    chave: `${chave43}${cDV}`,
    cUF: ufCod,
    cCT: cCtPad,
    cDV,
  };
}

function montarBlocoIcmsXml(icms) {
  if (icms.isSimples) {
    return `<ICMS><ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN></ICMS>`;
  }
  if (['40', '41', '51'].includes(icms.cst)) {
    return `<ICMS><ICMS45><CST>${icms.cst}</CST></ICMS45></ICMS>`;
  }
  if (icms.cst === '20') {
    return (
      `<ICMS><ICMS20>` +
      `<CST>20</CST>` +
      `<pRedBC>${icms.pRedBC}</pRedBC>` +
      `<vBC>${icms.vBC}</vBC>` +
      `<pICMS>${icms.pICMS}</pICMS>` +
      `<vICMS>${icms.vICMS}</vICMS>` +
      `</ICMS20></ICMS>`
    );
  }
  if (icms.cst === '90') {
    return (
      `<ICMS><ICMS90>` +
      `<CST>90</CST>` +
      `<vBC>${icms.vBC}</vBC>` +
      `<pICMS>${icms.pICMS}</pICMS>` +
      `<vICMS>${icms.vICMS}</vICMS>` +
      `</ICMS90></ICMS>`
    );
  }
  return (
    `<ICMS><ICMS00>` +
    `<CST>00</CST>` +
    `<vBC>${icms.vBC}</vBC>` +
    `<pICMS>${icms.pICMS}</pICMS>` +
    `<vICMS>${icms.vICMS}</vICMS>` +
    `</ICMS00></ICMS>`
  );
}

function montarBlocoIbsCbsXml(ibsCbs) {
  if (!ibsCbs.possuiGrupoCalculo) {
    return (
      `<IBSCBS>` +
      `<CST>${ibsCbs.CST}</CST>` +
      `<cClassTrib>${ibsCbs.cClassTrib}</cClassTrib>` +
      `</IBSCBS>`
    );
  }

  const gRedUf = ibsCbs.aplicaReducao
    ? `<gRed><pRedAliq>${ibsCbs.pRedAliq}</pRedAliq><pAliqEfet>${ibsCbs.pAliqEfetIBSUF}</pAliqEfet></gRed>`
    : '';
  const gRedMun = ibsCbs.aplicaReducao
    ? `<gRed><pRedAliq>${ibsCbs.pRedAliq}</pRedAliq><pAliqEfet>${ibsCbs.pAliqEfetIBSMun}</pAliqEfet></gRed>`
    : '';
  const gRedCbs = ibsCbs.aplicaReducao
    ? `<gRed><pRedAliq>${ibsCbs.pRedAliq}</pRedAliq><pAliqEfet>${ibsCbs.pAliqEfetCBS}</pAliqEfet></gRed>`
    : '';

  return (
    `<IBSCBS>` +
    `<CST>${ibsCbs.CST}</CST>` +
    `<cClassTrib>${ibsCbs.cClassTrib}</cClassTrib>` +
    `<gIBSCBS>` +
    `<vBC>${ibsCbs.vBC}</vBC>` +
    `<gIBSUF>` +
    `<pIBSUF>${ibsCbs.pIBSUF4}</pIBSUF>` +
    `${gRedUf}` +
    `<vIBSUF>${ibsCbs.vIBSUF}</vIBSUF>` +
    `</gIBSUF>` +
    `<gIBSMun>` +
    `<pIBSMun>${ibsCbs.pIBSMun4}</pIBSMun>` +
    `${gRedMun}` +
    `<vIBSMun>${ibsCbs.vIBSMun}</vIBSMun>` +
    `</gIBSMun>` +
    `<vIBS>${ibsCbs.vIBS}</vIBS>` +
    `<gCBS>` +
    `<pCBS>${ibsCbs.pCBS4}</pCBS>` +
    `${gRedCbs}` +
    `<vCBS>${ibsCbs.vCBS}</vCBS>` +
    `</gCBS>` +
    `</gIBSCBS>` +
    `</IBSCBS>`
  );
}

function montarParticipanteXml(tagGrupo, tagEnder, dados = {}, tpAmb = '2') {
  const doc = digitsOnly(dados.documento || dados.cnpj || dados.cpf);
  const tagDoc = doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc.padStart(14, '0').slice(0, 14)}</CNPJ>`;
  const ieLimpa = String(dados.inscricao_estadual || dados.ie || '').trim().toUpperCase();
  const ieXml =
    ieLimpa === 'ISENTO'
      ? `<IE>ISENTO</IE>`
      : digitsOnly(ieLimpa)
      ? `<IE>${digitsOnly(ieLimpa)}</IE>`
      : '';

  const xNome =
    String(tpAmb) === '2'
      ? 'CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : escapeXml(dados.razao_social || dados.nome || 'PARTICIPANTE');

  const foneLimpo = digitsOnly(dados.telefone || dados.fone);
  const foneXml = foneLimpo.length >= 7 && foneLimpo.length <= 12 ? `<fone>${foneLimpo}</fone>` : '';
  const cepLimpo = digitsOnly(dados.cep).padStart(8, '0').slice(0, 8);

  return (
    `<${tagGrupo}>` +
    `${tagDoc}` +
    `${ieXml}` +
    `<xNome>${xNome.slice(0, 60)}</xNome>` +
    `${foneXml}` +
    `<${tagEnder}>` +
    `<xLgr>${escapeXml(dados.logradouro || 'RUA PRINCIPAL').slice(0, 255)}</xLgr>` +
    `<nro>${escapeXml(dados.numero || 'SN').slice(0, 60)}</nro>` +
    `<xBairro>${escapeXml(dados.bairro || 'CENTRO').slice(0, 60)}</xBairro>` +
    `<cMun>${digitsOnly(dados.codigo_municipio || '5003702').padStart(7, '0').slice(0, 7)}</cMun>` +
    `<xMun>${escapeXml(dados.municipio || 'Dourados').slice(0, 60)}</xMun>` +
    `<CEP>${cepLimpo}</CEP>` +
    `<UF>${escapeXml(dados.uf || 'MS').toUpperCase().slice(0, 2)}</UF>` +
    `<cPais>1058</cPais>` +
    `<xPais>BRASIL</xPais>` +
    `</${tagEnder}>` +
    `</${tagGrupo}>`
  );
}

/**
 * Gera o XML pré-assinatura do CT-e 4.00 (Modelo 57, Modal Rodoviário), aplicando
 * `calcularTributosCte400` ANTES de qualquer assinatura digital.
 */
function gerarXmlCte400PreAssinatura({
  cte = {},
  emitente = {},
  regraFiscal = null,
  calculo = null,
  dhEmi = '2026-11-10T15:32:46-04:00',
  cCT = '20636352',
} = {}) {
  const ufInicio = String(cte.uf_inicio || emitente.uf || 'MS').toUpperCase();
  const ufFim = String(cte.uf_fim || 'SP').toUpperCase();

  const calc =
    calculo ||
    calcularTributosCte400({
      cte,
      regraFiscal,
      emitente,
      ufInicio,
      ufFim,
      dataEmissao: dhEmi,
    });

  const tpAmb = String(cte.tpAmb || (emitente.focus_ambiente === 'producao' ? '1' : '2'));
  const ufEmit = String(emitente.uf || ufInicio || 'MS').toUpperCase();
  const cUfEmit = UF_IBGE_MAP[ufEmit] || '50';
  const cnpjEmit = digitsOnly(emitente.cnpj || '03272053000150').padStart(14, '0').slice(0, 14);
  const serie = String(parseInt(cte.serie || '1', 10) || 1);
  const nCT = String(parseInt(cte.numero || '24', 10) || 24);

  const infoChave = calcularChaveAcessoCte({
    cUF: cUfEmit,
    dhEmi,
    cnpjEmitente: cnpjEmit,
    mod: '57',
    serie,
    nCT,
    tpEmis: '1',
    cCT,
  });

  const cMunEnv = digitsOnly(emitente.codigo_municipio || cte.codigo_municipio_inicio || '5003702')
    .padStart(7, '0')
    .slice(0, 7);
  const xMunEnv = escapeXml(emitente.municipio || cte.municipio_inicio || 'Dourados').slice(0, 60);
  const cMunIni = digitsOnly(cte.codigo_municipio_inicio || cMunEnv).padStart(7, '0').slice(0, 7);
  const xMunIni = escapeXml(cte.municipio_inicio || xMunEnv).slice(0, 60);
  const cMunFim = digitsOnly(cte.codigo_municipio_fim || '3550308').padStart(7, '0').slice(0, 7);
  const xMunFim = escapeXml(cte.municipio_fim || 'Sao Paulo').slice(0, 60);

  const remDados = cte.remetente_dados || {};
  const destDados = cte.destinatario_dados || {};
  const tomaPapel = String(cte.tomador ?? '0');
  const tomadorRef = tomaPapel === '3' ? destDados : remDados;
  const indIEToma =
    digitsOnly(tomadorRef.inscricao_estadual || tomadorRef.ie).length > 0
      ? '1'
      : String(tomadorRef.inscricao_estadual || '').toUpperCase() === 'ISENTO'
      ? '2'
      : '9';

  const foneEmit = digitsOnly(emitente.telefone);
  const foneEmitXml = foneEmit.length >= 7 && foneEmit.length <= 12 ? `<fone>${foneEmit}</fone>` : '';
  const crtEmit = ['1', '2', '3', '4'].includes(String(emitente.regime_tributario))
    ? String(emitente.regime_tributario)
    : '3';

  const vRecStr = cte.valor_receber
    ? formatCents(parseDecimalScaled(cte.valor_receber, 2))
    : calc.valores.vTPrest;

  const compsRaw = Array.isArray(cte.componentes_valor) && cte.componentes_valor.length > 0
    ? cte.componentes_valor
    : [{ nome: 'FRETE VALOR', valor: calc.valores.vTPrest }];

  const compsXml = compsRaw
    .map((c) => {
      const nome = escapeXml(c.nome || c.descricao || 'FRETE VALOR').slice(0, 15);
      const vComp = formatCents(parseDecimalScaled(c.valor ?? calc.valores.vTPrest, 2));
      return `<Comp><xNome>${nome}</xNome><vComp>${vComp}</vComp></Comp>`;
    })
    .join('');

  const vCargaStr = formatCents(parseDecimalScaled(cte.valor_carga || '3400.00', 2));
  const qCargaStr = formatDecimal4(cte.peso_bruto || '320.0000');
  const proPred = escapeXml(cte.produto_predominante || 'MERCADORIAS DIVERSAS').slice(0, 60);
  const xOutCatXml = cte.outras_caracteristicas_carga
    ? `<xOutCat>${escapeXml(cte.outras_caracteristicas_carga).slice(0, 30)}</xOutCat>`
    : '';

  const dEmiDoc = String(dhEmi).slice(0, 10);
  const docs = Array.isArray(cte.documentos_json) ? cte.documentos_json : [];
  const docChaveNfe = docs.find((d) => digitsOnly(d?.chave || d?.chave_nfe).length === 44);
  const infDocXml = docChaveNfe
    ? `<infDoc><infNFe><chave>${digitsOnly(docChaveNfe.chave || docChaveNfe.chave_nfe)}</chave></infNFe></infDoc>`
    : `<infDoc><infOutros><tpDoc>00</tpDoc><nDoc>${escapeXml(docs[0]?.numero || '102').slice(0, 20)}</nDoc><dEmi>${dEmiDoc}</dEmi><vDocFisc>${vCargaStr}</vDocFisc></infOutros></infDoc>`;

  const rntrc = digitsOnly(cte.rntrc || emitente.rntrc || '04755410').padStart(8, '0').slice(0, 8);
  const xObsXml = cte.observacoes
    ? `<compl><xObs>${escapeXml(cte.observacoes).slice(0, 2000)}</xObs></compl>`
    : '';

  const infCteXml =
    `<infCte versao="4.00" Id="CTe${infoChave.chave}">` +
    `<ide>` +
    `<cUF>${infoChave.cUF}</cUF>` +
    `<cCT>${infoChave.cCT}</cCT>` +
    `<CFOP>${digitsOnly(cte.cfop || '6353').slice(0, 4)}</CFOP>` +
    `<natOp>${escapeXml(cte.natureza_operacao || 'PRESTACAO DE SERVICO DE TRANSPORTE INTERESTADUAL').slice(0, 60)}</natOp>` +
    `<mod>57</mod>` +
    `<serie>${serie}</serie>` +
    `<nCT>${nCT}</nCT>` +
    `<dhEmi>${escapeXml(dhEmi)}</dhEmi>` +
    `<tpImp>${String(cte.formato_dacte || 'retrato').toLowerCase() === 'paisagem' ? '2' : '1'}</tpImp>` +
    `<tpEmis>1</tpEmis>` +
    `<cDV>${infoChave.cDV}</cDV>` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<tpCTe>0</tpCTe>` +
    `<procEmi>0</procEmi>` +
    `<verProc>ColiseuTMS-4.00</verProc>` +
    `<cMunEnv>${cMunEnv}</cMunEnv>` +
    `<xMunEnv>${xMunEnv}</xMunEnv>` +
    `<UFEnv>${ufEmit}</UFEnv>` +
    `<modal>01</modal>` +
    `<tpServ>${digitsOnly(cte.tipo_servico || '0').slice(0, 1) || '0'}</tpServ>` +
    `<cMunIni>${cMunIni}</cMunIni>` +
    `<xMunIni>${xMunIni}</xMunIni>` +
    `<UFIni>${ufInicio}</UFIni>` +
    `<cMunFim>${cMunFim}</cMunFim>` +
    `<xMunFim>${xMunFim}</xMunFim>` +
    `<UFFim>${ufFim}</UFFim>` +
    `<retira>${cte.retirar_mercadoria === false ? '1' : '0'}</retira>` +
    `<indIEToma>${indIEToma}</indIEToma>` +
    `<toma3><toma>${['0', '1', '2', '3'].includes(tomaPapel) ? tomaPapel : '0'}</toma></toma3>` +
    `</ide>` +
    `${xObsXml}` +
    `<emit>` +
    `<CNPJ>${cnpjEmit}</CNPJ>` +
    `<IE>${digitsOnly(emitente.inscricao_estadual || '283100630')}</IE>` +
    `<xNome>${escapeXml(emitente.razao_social || 'PANTANAL COMERCIO DE ALIMENTOS LTDA').slice(0, 60)}</xNome>` +
    `${emitente.nome_fantasia ? `<xFant>${escapeXml(emitente.nome_fantasia).slice(0, 60)}</xFant>` : ''}` +
    `<enderEmit>` +
    `<xLgr>${escapeXml(emitente.logradouro || 'RUA ARGENTINA').slice(0, 255)}</xLgr>` +
    `<nro>${escapeXml(emitente.numero || '715').slice(0, 60)}</nro>` +
    `<xBairro>${escapeXml(emitente.bairro || 'PARQUE DAS NACOES').slice(0, 60)}</xBairro>` +
    `<cMun>${cMunEnv}</cMun>` +
    `<xMun>${xMunEnv}</xMun>` +
    `<CEP>${digitsOnly(emitente.cep || '79841270').padStart(8, '0').slice(0, 8)}</CEP>` +
    `<UF>${ufEmit}</UF>` +
    `${foneEmitXml}` +
    `</enderEmit>` +
    `<CRT>${crtEmit}</CRT>` +
    `</emit>` +
    `${montarParticipanteXml('rem', 'enderReme', remDados, tpAmb)}` +
    `${montarParticipanteXml('dest', 'enderDest', destDados, tpAmb)}` +
    `<vPrest>` +
    `<vTPrest>${calc.valores.vTPrest}</vTPrest>` +
    `<vRec>${vRecStr}</vRec>` +
    `${compsXml}` +
    `</vPrest>` +
    `<imp>` +
    `${montarBlocoIcmsXml(calc.valores.icms)}` +
    `${montarBlocoIbsCbsXml(calc.valores.ibsCbs)}` +
    `<vTotDFe>${calc.valores.vTotDFe}</vTotDFe>` +
    `</imp>` +
    `<infCTeNorm>` +
    `<infCarga>` +
    `<vCarga>${vCargaStr}</vCarga>` +
    `<proPred>${proPred}</proPred>` +
    `${xOutCatXml}` +
    `<infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>${qCargaStr}</qCarga></infQ>` +
    `</infCarga>` +
    `${infDocXml}` +
    `<infModal versaoModal="4.00"><rodo><RNTRC>${rntrc}</RNTRC></rodo></infModal>` +
    `</infCTeNorm>` +
    `</infCte>`;

  const xmlPreAssinatura = `<?xml version="1.0" encoding="UTF-8"?><CTe xmlns="http://www.portalfiscal.inf.br/cte">${infCteXml}</CTe>`;

  return {
    chave: infoChave.chave,
    idInfCte: `CTe${infoChave.chave}`,
    calculo: calc,
    infCteXml,
    rodoXml: `<?xml version="1.0" encoding="UTF-8"?><rodo xmlns="http://www.portalfiscal.inf.br/cte"><RNTRC>${rntrc}</RNTRC></rodo>`,
    xmlPreAssinatura,
  };
}

/**
 * Aplica exclusivamente para validação estrutural offline contra `cte_v4.00.xsd`
 * (que exige o elemento `<ds:Signature>` ao final de `<CTe>`) uma assinatura XMLDSig
 * RSA-SHA1 gerada em memória com chave efêmera de teste, SEM alterar nenhum byte de `<infCte>`
 * e SEM utilizar certificado de produção ou transmitir documentos.
 */
function assinarXmlCte400TesteOffline(xmlPreAssinatura) {
  const idMatch = xmlPreAssinatura.match(/<infCte\s+versao="4\.00"\s+Id="(CTe\d{44})">/);
  if (!idMatch) {
    throw new Error('Atributo Id de <infCte> não encontrado no XML pré-assinatura.');
  }
  const idAttr = idMatch[1];

  const infCteMatch = xmlPreAssinatura.match(/(<infCte\s+versao="4\.00"[\s\S]*<\/infCte>)/);
  if (!infCteMatch) {
    throw new Error('Elemento <infCte> não encontrado no XML pré-assinatura.');
  }

  // Canonicalização C14N do elemento <infCte> herdando xmlns="http://www.portalfiscal.inf.br/cte"
  const infCteC14n = infCteMatch[1].replace(
    '<infCte versao="4.00"',
    '<infCte xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"'
  );
  const digestValue = crypto.createHash('sha1').update(infCteC14n, 'utf8').digest('base64');

  const signedInfoInner =
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${idAttr}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>`;

  const signedInfoC14n = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfoInner}</SignedInfo>`;

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const signer = crypto.createSign('RSA-SHA1');
  signer.update(signedInfoC14n, 'utf8');
  const signatureValue = signer.sign(privateKey, 'base64');

  // SPKI DER em base64 para preencher <X509Certificate> (xs:base64Binary) no ambiente de teste offline
  const spkiDerBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  const signatureXml =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="#${idAttr}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>` +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${spkiDerBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  return xmlPreAssinatura.replace('</CTe>', `${signatureXml}</CTe>`);
}

/**
 * Valida um documento XML contra um arquivo XSD oficial da SEFAZ (`PL_CTe_400_RTC`)
 * utilizando `System.Xml.Schema.XmlSchemaSet` no Windows ou `xmllint` em ambientes POSIX.
 */
function validarXmlContraXsdArquivo(xmlContent, xsdPath) {
  const absXsd = path.resolve(xsdPath);
  if (!fs.existsSync(absXsd)) {
    throw new Error(`Arquivo XSD oficial não encontrado em: ${absXsd}`);
  }

  const tmpXml = path.join(
    os.tmpdir(),
    `cte_xsd_val_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.xml`
  );
  fs.writeFileSync(tmpXml, xmlContent, 'utf8');

  try {
    if (process.platform === 'win32') {
      const tmpPs1 = `${tmpXml}.ps1`;
      const psScriptClean = [
        'param([string]$XmlFile, [string]$XsdFile)',
        '$ErrorActionPreference = "Stop"',
        '$errors = New-Object System.Collections.Generic.List[string]',
        '$settings = New-Object System.Xml.XmlReaderSettings',
        '$settings.ValidationType = [System.Xml.ValidationType]::Schema',
        '$resolver = New-Object System.Xml.XmlUrlResolver',
        '$settings.Schemas.XmlResolver = $resolver',
        '[void]$settings.Schemas.Add([NullString]::Value, $XsdFile)',
        '$settings.Schemas.Compile()',
        '$handler = [System.Xml.Schema.ValidationEventHandler]{ param($s, $e) $errors.Add("[$($e.Severity)] Linha $($e.Exception.LineNumber): $($e.Message)") }',
        '$settings.add_ValidationEventHandler($handler)',
        '$reader = [System.Xml.XmlReader]::Create($XmlFile, $settings)',
        'try { while ($reader.Read()) {} } finally { $reader.Close() }',
        '$result = @{ valid = ($errors.Count -eq 0); errors = @($errors) } | ConvertTo-Json -Compress -Depth 4',
        'Write-Output $result',
      ].join('\r\n');

      fs.writeFileSync(tmpPs1, psScriptClean, 'utf8');
      try {
        const stdout = execFileSync(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs1, '-XmlFile', tmpXml, '-XsdFile', absXsd],
          { encoding: 'utf8', timeout: 20000 }
        ).trim();
        const parsed = JSON.parse(stdout);
        return {
          valido: Boolean(parsed.valid),
          erros: Array.isArray(parsed.errors) ? parsed.errors : parsed.errors ? [parsed.errors] : [],
          xsdPath: absXsd,
        };
      } finally {
        if (fs.existsSync(tmpPs1)) fs.unlinkSync(tmpPs1);
      }
    }

    // Fallback POSIX (xmllint)
    try {
      execFileSync('xmllint', ['--noout', '--schema', absXsd, tmpXml], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { valido: true, erros: [], xsdPath: absXsd };
    } catch (err) {
      const stderr = String(err.stderr || err.message || '').trim();
      return { valido: false, erros: [stderr], xsdPath: absXsd };
    }
  } finally {
    if (fs.existsSync(tmpXml)) fs.unlinkSync(tmpXml);
  }
}

/**
 * Valida o XML completo do CT-e 4.00 contra `cte_v4.00.xsd` e o bloco modal `<rodo>`
 * contra `cteModalRodoviario_v4.00.xsd` do pacote oficial SEFAZ `PL_CTe_400_RTC`.
 */
function validarXmlCte400NoXsdOficial({ xmlCteAssinado, rodoXml, schemaDir } = {}) {
  const dir =
    schemaDir ||
    path.resolve(__dirname, '../../schemas/PL_CTe_400_RTC');

  const resCte = validarXmlContraXsdArquivo(xmlCteAssinado, path.join(dir, 'cte_v4.00.xsd'));
  const resRodo = rodoXml
    ? validarXmlContraXsdArquivo(rodoXml, path.join(dir, 'cteModalRodoviario_v4.00.xsd'))
    : { valido: true, erros: [] };

  return {
    valido: resCte.valido && resRodo.valido,
    cte: resCte,
    modalRodoviario: resRodo,
    erros: [...resCte.erros, ...resRodo.erros],
  };
}

module.exports = {
  calcularDigitoVerificadorChave,
  calcularChaveAcessoCte,
  gerarXmlCte400PreAssinatura,
  assinarXmlCte400TesteOffline,
  validarXmlContraXsdArquivo,
  validarXmlCte400NoXsdOficial,
};
