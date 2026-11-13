'use strict';

const db = require('../db/postgres');
const logger = require('../config/logger');
const { decryptSecret } = require('../utils/cryptoVault');
const { calcularPisoMinimoAntt } = require('../utils/anttPisoMinimo');
const { resolverIbgeMunicipioSync: resolverIbgeMunicipio } = require('../utils/ibgeMunicipios');

const PROVEDORES_CIOT_SUPORTADOS = [
  'HOMOLOGACAO_LOCAL',
  'MANUAL',
  'EFRETE',
  'PAMCARD',
  'TARGET',
  'ANTT_A1',
];

const CNPJ_PADRAO_IPEF = {
  EFRETE: '13670685000115',
  PAMCARD: '04088208000165',
  TARGET: '07839076000183',
};

function digitsOnly(val) {
  return String(val || '').replace(/\D/g, '');
}

/**
 * Gera 4 dígitos verificadores determinísticos (Módulo 11 duplo) para protocolo ANTT/Homologação.
 */
function calcularDigitoVerificadorCiot4(ciot12) {
  const base = digitsOnly(ciot12).padStart(12, '0').slice(0, 12);
  let soma1 = 0;
  let soma2 = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(base[i]);
    soma1 += d * ((i % 9) + 2);
    soma2 += d * (((11 - i) % 9) + 2);
  }
  const v1 = ((soma1 * 10) % 11) % 10;
  const v2 = ((soma2 * 10) % 11) % 10;
  const v3 = (v1 * 3 + v2 * 7 + Number(base[11])) % 10;
  const v4 = (v1 * 7 + v2 * 3 + Number(base[0])) % 10;
  return `${v1}${v2}${v3}${v4}`;
}

/**
 * Normaliza e valida um código CIOT informado pelo usuário ou retornado por IPEF/ANTT.
 * Aceita:
 *  - "202611120001"        -> { codigo: "202611120001", verificador: "XXXX", formatado: "202611120001/XXXX" }
 *  - "202611120001/4829"   -> { codigo: "202611120001", verificador: "4829", formatado: "202611120001/4829" }
 *  - "2026111200014829"    -> { codigo: "202611120001", verificador: "4829", formatado: "202611120001/4829" }
 */
function normalizarProtocoloCiot(input, verificadorExplicito = '') {
  const raw = String(input || '').trim();
  const verifDigits = digitsOnly(verificadorExplicito);

  if (raw.includes('/') || raw.includes('-')) {
    const partes = raw.split(/[/-]/).map((p) => digitsOnly(p)).filter(Boolean);
    if (partes.length >= 2 && partes[0].length === 12 && partes[1].length >= 1 && partes[1].length <= 6) {
      const ver = partes[1].padStart(4, '0').slice(0, 4);
      return {
        valido: true,
        codigo: partes[0],
        verificador: ver,
        formatado: `${partes[0]}/${ver}`,
      };
    }
  }

  const todosDigitos = digitsOnly(raw);
  if (todosDigitos.length === 12) {
    const ver = verifDigits.length >= 1 ? verifDigits.padStart(4, '0').slice(0, 4) : null;
    return {
      valido: true,
      codigo: todosDigitos,
      verificador: ver,
      formatado: ver ? `${todosDigitos}/${ver}` : todosDigitos,
    };
  }

  if (todosDigitos.length === 16) {
    const cod12 = todosDigitos.slice(0, 12);
    const ver4 = todosDigitos.slice(12, 16);
    return {
      valido: true,
      codigo: cod12,
      verificador: ver4,
      formatado: `${cod12}/${ver4}`,
    };
  }

  return {
    valido: false,
    erro:
      'O código CIOT da ANTT deve conter exatamente 12 dígitos numéricos (ex.: 202611120001) ou 12 dígitos + 4 verificadores (ex.: 202611120001/4829).',
  };
}

/**
 * Gera código CIOT de 12 dígitos exclusivo para ambiente de Homologação.
 */
function gerarCodigoCiotHomologacao(contratoId) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String((Number(contratoId || 0) * 100 + (Date.now() % 100)) % 1000000).padStart(6, '0');
  const codigo = `${yy}${mm}${dd}${seq}`;
  const verificador = calcularDigitoVerificadorCiot4(codigo);
  return {
    codigo,
    verificador,
    formatado: `${codigo}/${verificador}`,
  };
}

/**
 * Monta o payload estruturado padrão ANTT / PEO (compatível com auditoria e envio IPEF).
 */
function montarPayloadPadraoAntt(contrato, emitente = {}) {
  const cnpjIpef =
    digitsOnly(contrato.cnpj_ipef || emitente.ciot_cnpj_ipef) ||
    CNPJ_PADRAO_IPEF[String(contrato.ciot_provedor || '').toUpperCase()] ||
    null;

  const freteBruto = Number(contrato.valor_frete || 0);
  const adiantamento = Number(contrato.valor_adiantamento || 0);
  const pedagio = Number(contrato.valor_pedagio || 0);
  const combustivel = Number(contrato.valor_combustivel || 0);
  const descontos =
    Number(contrato.valor_inss || 0) +
    Number(contrato.valor_irrf || 0) +
    Number(contrato.valor_sest_senat || 0) +
    Number(contrato.valor_outros_descontos || 0);
  const saldoQuitacao = Math.max(0, Math.round((freteBruto - adiantamento - descontos) * 100) / 100);

  return {
    ciot: {
      versao: '2.00',
      provedor: contrato.ciot_provedor || emitente.ciot_provedor || 'HOMOLOGACAO_LOCAL',
      ambiente: emitente.ciot_ambiente || emitente.focus_ambiente || 'homologacao',
      codigo: contrato.ciot_codigo || null,
      verificador: contrato.ciot_verificador || null,
      tipo_operacao: contrato.tipo_operacao || 'Carga Lotacao',
      tipo_transporte: String(contrato.tipo_transporte || '2'),
      contratante: {
        documento: digitsOnly(contrato.contratante_documento),
        nome: contrato.contratante_nome,
      },
      transportador: {
        documento: digitsOnly(contrato.transportador_documento),
        nome: contrato.transportador_nome,
        rntrc: digitsOnly(contrato.transportador_rntrc) || null,
      },
      motorista: {
        cpf: digitsOnly(contrato.motorista_cpf || contrato.transportador_documento),
        nome: contrato.motorista_nome || contrato.transportador_nome,
      },
      veiculo: {
        placa: contrato.veiculo_placa || null,
        quantidade_eixos: Number(contrato.quantidade_eixos || 2),
      },
      percurso: {
        uf_origem: contrato.uf_inicio,
        municipio_origem: contrato.municipio_inicio || null,
        codigo_ibge_origem: contrato.codigo_ibge_inicio || null,
        uf_destino: contrato.uf_fim,
        municipio_destino: contrato.municipio_fim || null,
        codigo_ibge_destino: contrato.codigo_ibge_fim || null,
        distancia_km: Number(contrato.distancia_km || 0),
      },
      carga: {
        categoria_antt: contrato.categoria_carga_antt || 'GERAL',
        peso_kg: Number(contrato.peso_carga_kg || 0),
        valor_mercadoria: Number(contrato.valor_carga || 0),
        ncm: contrato.ncm_carga || null,
        chaves_nfe: Array.isArray(contrato.chaves_nfe) ? contrato.chaves_nfe : [],
      },
      valores: {
        frete_bruto: freteBruto.toFixed(2),
        adiantamento: adiantamento.toFixed(2),
        saldo_quitacao: saldoQuitacao.toFixed(2),
        pedagio: pedagio.toFixed(2),
        combustivel: combustivel.toFixed(2),
        impostos_retencoes: {
          inss: Number(contrato.valor_inss || 0).toFixed(2),
          irrf: Number(contrato.valor_irrf || 0).toFixed(2),
          sest_senat: Number(contrato.valor_sest_senat || 0).toFixed(2),
          outros_descontos: Number(contrato.valor_outros_descontos || 0).toFixed(2),
        },
        piso_minimo_antt: Number(contrato.piso_minimo_antt || 0).toFixed(2),
        piso_aprovado: Boolean(contrato.piso_minimo_aprovado),
        piso_isento: Boolean(contrato.piso_isento),
        piso_isencao_motivo: contrato.piso_isencao_motivo || null,
      },
      quitacao: {
        forma: contrato.forma_quitacao || 'PIX',
        chave_pix: contrato.chave_pix || null,
        banco_codigo: contrato.banco_codigo || null,
        banco_agencia: contrato.banco_agencia || null,
        banco_conta: contrato.banco_conta || null,
        cnpj_instituicao_pagamento: cnpjIpef,
        data_saida: contrato.data_saida || null,
        data_prevista_entrega: contrato.data_prevista_entrega || null,
      },
    },
    _meta: {
      gerado_em: new Date().toISOString(),
      origem: 'ColiseuTransporte',
    },
  };
}

function escapeXml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calcula automaticamente as retenções legais de frete para Transportador Autônomo de Cargas (TAC — Pessoa Física):
 * - Base INSS e SEST/SENAT: 20% do valor bruto do frete (IN RFB nº 2.110/2022)
 *   • INSS segurado TAC: 11% sobre a base de 20% (= 2,20% do bruto, limitado ao teto previdenciário)
 *   • SEST/SENAT: 2,5% sobre a base de 20% (= 0,50% do bruto)
 * - Base IRRF Transporte de Cargas: 10% do valor bruto (Lei nº 12.794/2013), deduzidos INSS, SEST/SENAT e dependentes.
 */
function calcularRetencoesTac({
  valorFrete = 0,
  tipoTransporte = '2',
  documentoTransportador = '',
  dependentes = 0,
} = {}) {
  const bruto = Math.max(0, Number(valorFrete || 0));
  const docLimpo = digitsOnly(documentoTransportador);
  const isTacPf =
    String(tipoTransporte) === '2' && (docLimpo.length === 0 || docLimpo.length === 11);

  if (!isTacPf || bruto <= 0) {
    return {
      aplicavel: false,
      valor_bruto: Math.round(bruto * 100) / 100,
      base_inss_sest: 0,
      valor_inss: 0,
      valor_sest_senat: 0,
      base_irrf: 0,
      valor_irrf: 0,
      total_retencoes: 0,
      valor_liquido: Math.round(bruto * 100) / 100,
    };
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const base20 = round2(bruto * 0.2);
  const TETO_RETENCAO_INSS = 897.32;
  const valorInss = Math.min(TETO_RETENCAO_INSS, round2(base20 * 0.11));
  const valorSestSenat = round2(base20 * 0.025);

  const deducaoDependentes = Math.max(0, parseInt(dependentes, 10) || 0) * 189.59;
  const baseIrrf = Math.max(0, round2(bruto * 0.1 - valorInss - valorSestSenat - deducaoDependentes));

  let irrf = 0;
  if (baseIrrf > 4664.68) {
    irrf = baseIrrf * 0.275 - 896.0;
  } else if (baseIrrf > 3751.05) {
    irrf = baseIrrf * 0.225 - 662.77;
  } else if (baseIrrf > 2826.65) {
    irrf = baseIrrf * 0.15 - 381.44;
  } else if (baseIrrf > 2259.2) {
    irrf = baseIrrf * 0.075 - 169.44;
  }
  const valorIrrf = Math.max(0, round2(irrf));
  const totalRetencoes = round2(valorInss + valorSestSenat + valorIrrf);
  const valorLiquido = Math.max(0, round2(bruto - totalRetencoes));

  return {
    aplicavel: true,
    valor_bruto: round2(bruto),
    base_inss_sest: base20,
    valor_inss: valorInss,
    valor_sest_senat: valorSestSenat,
    base_irrf: baseIrrf,
    valor_irrf: valorIrrf,
    total_retencoes: totalRetencoes,
    valor_liquido: valorLiquido,
  };
}

/**
 * Autentica sessão SOAP na e-Frete (LogonService.asmx -> Login) para obter o <Token> obrigatório nas chamadas PEF.
 */
async function autenticarSessaoEfrete(credenciais) {
  const isProd = String(credenciais.ambiente || 'homologacao').toLowerCase() === 'producao';
  const logonEndpoint = isProd
    ? 'https://www.efrete.com.br/Services/LogonService.asmx'
    : 'https://dev.efrete.com.br/Services/LogonService.asmx';

  if (!credenciais.integrador || !credenciais.usuario || !credenciais.senha) {
    throw new Error(
      'Credenciais da IPEF e-Frete incompletas. Configure Token do Integrador, Usuário e Senha em Dados da Empresa.'
    );
  }

  // Se o operador já informou um token de sessão pré-autenticado explícito, permite reutilizar
  if (credenciais.sessionToken) {
    return String(credenciais.sessionToken).trim();
  }

  const logonEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Login xmlns="http://schemas.ipc.adm.br/efrete/logon">
      <request xmlns="http://schemas.ipc.adm.br/efrete/logon/objects">
        <Integrador xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(credenciais.integrador)}</Integrador>
        <Versao xmlns="http://schemas.ipc.adm.br/efrete/objects">1</Versao>
        <Usuario>${escapeXml(credenciais.usuario)}</Usuario>
        <Senha>${escapeXml(credenciais.senha)}</Senha>
      </request>
    </Login>
  </soap:Body>
</soap:Envelope>`;

  const resp = await fetch(logonEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://schemas.ipc.adm.br/efrete/logon/Login"',
    },
    body: logonEnvelope,
  });

  const xmlLogon = await resp.text();
  const matchToken = xmlLogon.match(/<Token[^>]*>([^<]+)<\/Token>/i);
  if (!matchToken || !String(matchToken[1]).trim()) {
    const matchErro = xmlLogon.match(/<Mensagem[^>]*>([^<]+)<\/Mensagem>/i);
    throw new Error(
      `Falha na autenticação e-Frete LogonService (${resp.status}): ${
        matchErro ? matchErro[1] : 'Credenciais recusadas ou Token de sessão não retornado pela IPEF.'
      }`
    );
  }

  return String(matchToken[1]).trim();
}

/**
 * Conector SOAP oficial e-Frete PEO (Sandbox & Produção) com autenticação prévia LogonService.asmx.
 */
async function emitirViaEfrete(contrato, emitente, credenciais) {
  const isProd = String(credenciais.ambiente || 'homologacao').toLowerCase() === 'producao';
  const endpoint = isProd
    ? 'https://www.efrete.com.br/Services/PefService.asmx'
    : 'https://dev.efrete.com.br/Services/PefService.asmx';

  const sessionToken = await autenticarSessaoEfrete(credenciais);

  const ibgeOrig = resolverIbgeMunicipio(
    contrato.codigo_ibge_inicio,
    contrato.municipio_inicio,
    contrato.uf_inicio || emitente?.uf || 'SP'
  );
  const ibgeDest = resolverIbgeMunicipio(
    contrato.codigo_ibge_fim,
    contrato.municipio_fim,
    contrato.uf_fim || contrato.uf_inicio || emitente?.uf || 'SP'
  );

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AdicionarOperacaoTransporte xmlns="http://schemas.ipc.adm.br/efrete/pef">
      <request xmlns="http://schemas.ipc.adm.br/efrete/pef/AdicionarOperacaoTransporte">
        <Token xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(sessionToken)}</Token>
        <Integrador xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(credenciais.integrador)}</Integrador>
        <Versao xmlns="http://schemas.ipc.adm.br/efrete/objects">7</Versao>
        <TipoViagem>${contrato.tipo_transporte === '2' ? 'Padrao' : 'TAC_Agregado'}</TipoViagem>
        <EmissaoGratuita>${contrato.tipo_transporte === '1' ? 'true' : 'false'}</EmissaoGratuita>
        <CodigoMunicipioOrigem>${escapeXml(ibgeOrig.codigo)}</CodigoMunicipioOrigem>
        <CodigoMunicipioDestino>${escapeXml(ibgeDest.codigo)}</CodigoMunicipioDestino>
        <Contratado>
          <CpfOuCnpj>${escapeXml(digitsOnly(contrato.transportador_documento))}</CpfOuCnpj>
          <RNTRC>${escapeXml(digitsOnly(contrato.transportador_rntrc))}</RNTRC>
        </Contratado>
        <Motorista>
          <CpfOuCnpj>${escapeXml(digitsOnly(contrato.motorista_cpf || contrato.transportador_documento))}</CpfOuCnpj>
        </Motorista>
        <Veiculos>
          <Placa>${escapeXml(String(contrato.veiculo_placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase())}</Placa>
        </Veiculos>
        <Viagens>
          <Valores>
            <TotalOperacao>${Number(contrato.valor_frete || 0).toFixed(2)}</TotalOperacao>
            <TotalViagem>${Number(contrato.valor_frete || 0).toFixed(2)}</TotalViagem>
            <TotalDeAdiantamento>${Number(contrato.valor_adiantamento || 0).toFixed(2)}</TotalDeAdiantamento>
            <Pedagio>${Number(contrato.valor_pedagio || 0).toFixed(2)}</Pedagio>
            <Combustivel>${Number(contrato.valor_combustivel || 0).toFixed(2)}</Combustivel>
          </Valores>
        </Viagens>
      </request>
    </AdicionarOperacaoTransporte>
  </soap:Body>
</soap:Envelope>`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://schemas.ipc.adm.br/efrete/pef/AdicionarOperacaoTransporte"',
    },
    body: soapEnvelope,
  });

  const xmlResp = await resp.text();
  const matchCiot = xmlResp.match(/<CodigoIdentificacaoOperacao>([^<]+)<\/CodigoIdentificacaoOperacao>/i);
  if (!matchCiot) {
    const matchErro = xmlResp.match(/<Mensagem>([^<]+)<\/Mensagem>/i);
    throw new Error(
      `Retorno e-Frete (${resp.status}): ${matchErro ? matchErro[1] : 'Não foi possível obter o Código CIOT da operadora.'}`
    );
  }

  const parsed = normalizarProtocoloCiot(matchCiot[1]);
  if (!parsed.valido) {
    throw new Error(`Código retornado pela e-Frete em formato inesperado: ${matchCiot[1]}`);
  }
  return {
    codigo: parsed.codigo,
    verificador: parsed.verificador,
    provedor: 'EFRETE',
    cnpj_ipef: CNPJ_PADRAO_IPEF.EFRETE,
    raw_retorno: xmlResp.slice(0, 4000),
  };
}

/**
 * Conector SOAP oficial e-Frete PEO — EncerrarOperacaoTransporte (Sandbox & Produção).
 */
async function encerrarViaEfrete(contrato, credenciais) {
  const isProd = String(credenciais.ambiente || 'homologacao').toLowerCase() === 'producao';
  const endpoint = isProd
    ? 'https://www.efrete.com.br/Services/PefService.asmx'
    : 'https://dev.efrete.com.br/Services/PefService.asmx';

  const sessionToken = await autenticarSessaoEfrete(credenciais);

  const codigoFormatado = contrato.ciot_verificador
    ? `${digitsOnly(contrato.ciot_codigo)}/${digitsOnly(contrato.ciot_verificador)}`
    : digitsOnly(contrato.ciot_codigo);

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <EncerrarOperacaoTransporte xmlns="http://schemas.ipc.adm.br/efrete/pef">
      <request xmlns="http://schemas.ipc.adm.br/efrete/pef/EncerrarOperacaoTransporte">
        <Token xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(sessionToken)}</Token>
        <Integrador xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(credenciais.integrador)}</Integrador>
        <Versao xmlns="http://schemas.ipc.adm.br/efrete/objects">2</Versao>
        <CodigoIdentificacaoOperacao>${escapeXml(codigoFormatado)}</CodigoIdentificacaoOperacao>
        <PesoCarga>${Number(contrato.peso_carga_kg || 0).toFixed(2)}</PesoCarga>
        <Frete>
          <ValorBruto>${Number(contrato.valor_frete || 0).toFixed(2)}</ValorBruto>
        </Frete>
      </request>
    </EncerrarOperacaoTransporte>
  </soap:Body>
</soap:Envelope>`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://schemas.ipc.adm.br/efrete/pef/EncerrarOperacaoTransporte"',
    },
    body: soapEnvelope,
  });

  const xmlResp = await resp.text();
  const matchProt =
    xmlResp.match(/<ProtocoloEncerramento>([^<]+)<\/ProtocoloEncerramento>/i) ||
    xmlResp.match(/<Protocolo>([^<]+)<\/Protocolo>/i);
  if (!matchProt) {
    const matchErro = xmlResp.match(/<Mensagem>([^<]+)<\/Mensagem>/i);
    throw new Error(
      `Retorno e-Frete Encerramento (${resp.status}): ${matchErro ? matchErro[1] : 'Operadora não retornou ProtocoloEncerramento.'}`
    );
  }
  return {
    protocolo: String(matchProt[1]).trim().slice(0, 40),
    raw_retorno: xmlResp.slice(0, 4000),
  };
}

/**
 * Conector SOAP oficial e-Frete PEO — CancelarOperacaoTransporte (Sandbox & Produção).
 */
async function cancelarViaEfrete(contrato, motivo, credenciais) {
  const isProd = String(credenciais.ambiente || 'homologacao').toLowerCase() === 'producao';
  const endpoint = isProd
    ? 'https://www.efrete.com.br/Services/PefService.asmx'
    : 'https://dev.efrete.com.br/Services/PefService.asmx';

  const sessionToken = await autenticarSessaoEfrete(credenciais);

  const codigoFormatado = contrato.ciot_verificador
    ? `${digitsOnly(contrato.ciot_codigo)}/${digitsOnly(contrato.ciot_verificador)}`
    : digitsOnly(contrato.ciot_codigo);

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CancelarOperacaoTransporte xmlns="http://schemas.ipc.adm.br/efrete/pef">
      <request xmlns="http://schemas.ipc.adm.br/efrete/pef/CancelarOperacaoTransporte">
        <Token xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(sessionToken)}</Token>
        <Integrador xmlns="http://schemas.ipc.adm.br/efrete/objects">${escapeXml(credenciais.integrador)}</Integrador>
        <Versao xmlns="http://schemas.ipc.adm.br/efrete/objects">2</Versao>
        <CodigoIdentificacaoOperacao>${escapeXml(codigoFormatado)}</CodigoIdentificacaoOperacao>
        <Motivo>${escapeXml(String(motivo || '').slice(0, 250))}</Motivo>
      </request>
    </CancelarOperacaoTransporte>
  </soap:Body>
</soap:Envelope>`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://schemas.ipc.adm.br/efrete/pef/CancelarOperacaoTransporte"',
    },
    body: soapEnvelope,
  });

  const xmlResp = await resp.text();
  const matchProt =
    xmlResp.match(/<ProtocoloCancelamento>([^<]+)<\/ProtocoloCancelamento>/i) ||
    xmlResp.match(/<Protocolo>([^<]+)<\/Protocolo>/i);
  if (!matchProt) {
    const matchErro = xmlResp.match(/<Mensagem>([^<]+)<\/Mensagem>/i);
    throw new Error(
      `Retorno e-Frete Cancelamento (${resp.status}): ${matchErro ? matchErro[1] : 'Operadora não retornou ProtocoloCancelamento.'}`
    );
  }
  return {
    protocolo: String(matchProt[1]).trim().slice(0, 40),
    raw_retorno: xmlResp.slice(0, 4000),
  };
}

/**
 * Emissão REST padronizada para Pamcard / Target quando URL/Gateway homologado + Token estão configurados.
 * Nunca retorna falso-positivo sem protocolo de 12 dígitos válido.
 */
async function emitirViaRestIpef({ provedor, contrato, credenciais }) {
  const customUrl = String(credenciais.baseUrl || '').trim().replace(/\/+$/, '');
  if (!customUrl) {
    const err = new Error(
      `Para emissão automática direta na ${provedor} em Produção, configure o Endpoint homologado da Integradora em Dados da Empresa — ou utilize o modo "Portal IPEF (Manual)" informando os 12 dígitos emitidos no portal da ${provedor}.`
    );
    err.statusCode = 422;
    err.code = 'IPEF_PRODUCTION_ENDPOINT_REQUIRED';
    throw err;
  }

  const resp = await fetch(`${customUrl}/operacoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credenciais.integrador}`,
      ...(credenciais.usuario ? { 'X-Ipef-User': credenciais.usuario } : {}),
    },
    body: JSON.stringify(montarPayloadPadraoAntt(contrato, contrato)),
  });

  const bodyText = await resp.text();
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(bodyText);
  } catch (_) {
    parsedJson = null;
  }

  if (!resp.ok) {
    const errMsg = parsedJson?.mensagem || parsedJson?.message || parsedJson?.error || bodyText.slice(0, 200);
    throw new Error(`Retorno ${provedor} (${resp.status}): ${errMsg}`);
  }

  const rawCode =
    parsedJson?.ciot_codigo ||
    parsedJson?.ciot ||
    parsedJson?.codigo_ciot ||
    parsedJson?.numero_ciot ||
    '';
  const rawVerif = parsedJson?.ciot_verificador || parsedJson?.codigo_verificador || '';
  const norm = normalizarProtocoloCiot(rawCode, rawVerif);
  if (!norm.valido) {
    throw new Error(
      `A integradora ${provedor} não retornou um número CIOT válido de 12 dígitos (${norm.erro}).`
    );
  }

  return {
    codigo: norm.codigo,
    verificador: norm.verificador,
    provedor,
    cnpj_ipef: CNPJ_PADRAO_IPEF[provedor] || null,
    raw_retorno: bodyText.slice(0, 4000),
  };
}

/**
 * Conector REST padronizado para Pamcard / Target em Produção (quando token/endpoint da integradora está ativo).
 */
async function transmitirEventoRestIpef({ provedor, operacao, contrato, motivo = '', credenciais }) {
  const isProd = String(credenciais.ambiente || 'homologacao').toLowerCase() === 'producao';
  const baseUrls = {
    PAMCARD: isProd
      ? 'https://api.pamcard.com.br/ciot/v1'
      : 'https://sandbox.pamcard.com.br/ciot/v1',
    TARGET: isProd
      ? 'https://api.targetmeiosdepagamento.com.br/ciot/v1'
      : 'https://sandbox.targetmeiosdepagamento.com.br/ciot/v1',
  };
  const baseUrl = baseUrls[provedor];
  if (!baseUrl || !credenciais.integrador) {
    throw new Error(
      `Credenciais da operadora ${provedor} não configuradas para ${operacao} em Produção.`
    );
  }

  const codigoCiot = digitsOnly(contrato.ciot_codigo);
  const actionPath = operacao === 'ENCERRAR' ? 'encerrar' : 'cancelar';
  const resp = await fetch(`${baseUrl}/operacoes/${encodeURIComponent(codigoCiot)}/${actionPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credenciais.integrador}`,
      ...(credenciais.usuario ? { 'X-Ipef-User': credenciais.usuario } : {}),
    },
    body: JSON.stringify({
      ciot_codigo: codigoCiot,
      ciot_verificador: contrato.ciot_verificador || null,
      contratante_documento: digitsOnly(contrato.contratante_documento),
      valor_frete: Number(contrato.valor_frete || 0),
      peso_carga_kg: Number(contrato.peso_carga_kg || 0),
      ...(motivo ? { motivo: String(motivo).slice(0, 250) } : {}),
    }),
  });

  const bodyText = await resp.text();
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(bodyText);
  } catch (_) {
    parsedJson = null;
  }

  if (!resp.ok) {
    const errMsg = parsedJson?.mensagem || parsedJson?.message || parsedJson?.error || bodyText.slice(0, 200);
    throw new Error(`Retorno ${provedor} (${resp.status}): ${errMsg}`);
  }

  const prot =
    parsedJson?.protocolo ||
    parsedJson?.protocolo_encerramento ||
    parsedJson?.protocolo_cancelamento ||
    `${provedor}-${operacao.slice(0, 3)}-${codigoCiot.slice(-6)}`;
  return {
    protocolo: String(prot).trim().slice(0, 40),
    raw_retorno: bodyText.slice(0, 4000),
  };
}

/**
 * Sincroniza as parcelas de Contas a Pagar no módulo Financeiro (dash_financeiro) sem duplicidade.
 */
async function sincronizarFinanceiroCiot(runner, tenantId, contrato, usuario = 'Sistema CIOT') {
  if (contrato.gerar_financeiro === false) {
    return Array.isArray(contrato.financeiro_ids) ? contrato.financeiro_ids : [];
  }

  const idsExistentes = Array.isArray(contrato.financeiro_ids)
    ? contrato.financeiro_ids.filter((x) => Number.isFinite(Number(x)))
    : [];
  if (idsExistentes.length > 0) {
    return idsExistentes;
  }

  const freteBruto = Number(contrato.valor_frete || 0);
  if (freteBruto <= 0) return [];

  const adiantamento = Math.max(0, Number(contrato.valor_adiantamento || 0));
  const descontos =
    Number(contrato.valor_inss || 0) +
    Number(contrato.valor_irrf || 0) +
    Number(contrato.valor_sest_senat || 0) +
    Number(contrato.valor_outros_descontos || 0);
  const saldoLiquido = Math.max(0, Math.round((freteBruto - adiantamento - descontos) * 100) / 100);

  const hojeIso = new Date().toISOString().slice(0, 10);
  const dataSaida = contrato.data_saida
    ? String(contrato.data_saida).slice(0, 10)
    : hojeIso;
  const dataPrevEntrega = contrato.data_prevista_entrega
    ? String(contrato.data_prevista_entrega).slice(0, 10)
    : new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

  const parcelas = [];
  if (adiantamento > 0) {
    parcelas.push({
      numero: 1,
      tipo_parcela: 'ADIANTAMENTO_FRETE',
      descricao: `Adiantamento Frete CIOT ${contrato.ciot_codigo || `#${contrato.id}`} — ${contrato.transportador_nome} (${contrato.uf_inicio}→${contrato.uf_fim})`,
      valor: adiantamento,
      vencimento: dataSaida,
    });
  }
  if (saldoLiquido > 0) {
    parcelas.push({
      numero: parcelas.length + 1,
      tipo_parcela: 'SALDO_FRETE',
      descricao: `Saldo Quitação Frete CIOT ${contrato.ciot_codigo || `#${contrato.id}`} — ${contrato.transportador_nome} (${contrato.uf_inicio}→${contrato.uf_fim})`,
      valor: saldoLiquido,
      vencimento: dataPrevEntrega,
    });
  }

  const idsCriados = [];
  for (const p of parcelas) {
    try {
      const ins = await runner.query(
        `INSERT INTO dash_financeiro (
           tenant_id, tipo, descricao, cliente_nome, cliente_documento,
           data_emissao, data_vencimento, valor, valor_pago, status_pagamento,
           especie_nome, plano_contas_nome, numero_parcela, tipo_parcela, origem, moeda
         ) VALUES (
           $1, 'PAGAR', $2, $3, $4,
           $5, $6, $7, 0, 'PENDENTE',
           $8, 'Fretes e Carretos (CIOT)', $9, $10, 'TRANSPORTE_CIOT', 'BRL'
         ) RETURNING id`,
        [
          tenantId,
          p.descricao.slice(0, 255),
          String(contrato.transportador_nome || 'TRANSPORTADOR').slice(0, 200),
          digitsOnly(contrato.transportador_documento).slice(0, 20),
          hojeIso,
          p.vencimento,
          p.valor,
          contrato.forma_quitacao || 'PIX',
          p.numero,
          p.tipo_parcela,
        ]
      );
      if (ins.rows[0]?.id) {
        idsCriados.push(ins.rows[0].id);
        await runner
          .query(
            `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, descricao)
             VALUES ($1::UUID, $2, $3, 'CRIACAO_TITULO_CIOT', $4, $5)`,
            [
              String(tenantId),
              ins.rows[0].id,
              ins.rows[0].id,
              usuario,
              `${p.descricao} — R$ ${p.valor.toFixed(2)} (venc. ${p.vencimento})`,
            ]
          )
          .catch(() => null);
      }
    } catch (err) {
      logger.warn('[CIOT Financeiro] Não foi possível criar título PAGAR:', err.message);
    }
  }

  if (idsCriados.length > 0) {
    await runner.query(
      `UPDATE dash_contratos_transporte
       SET financeiro_ids = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(idsCriados), contrato.id, tenantId]
    );
  }

  return idsCriados;
}

/**
 * Estorna/Cancela títulos pendentes vinculados ao CIOT quando o CIOT é cancelado.
 */
async function estornarFinanceiroCiot(runner, tenantId, contrato, motivo = '', usuario = 'Sistema CIOT') {
  const ids = Array.isArray(contrato.financeiro_ids)
    ? contrato.financeiro_ids.map(Number).filter(Number.isFinite)
    : [];
  if (ids.length === 0) return 0;

  try {
    const upd = await runner.query(
      `UPDATE dash_financeiro
       SET status_pagamento = 'CANCELADO'
       WHERE tenant_id = $1
         AND id = ANY($2::int[])
         AND COALESCE(valor_pago, 0) = 0
         AND UPPER(COALESCE(status_pagamento, '')) NOT IN ('PAGO', 'QUITADO', 'BAIXADO')`,
      [tenantId, ids]
    );
    for (const idFin of ids) {
      await runner
        .query(
          `INSERT INTO dash_financeiro_logs (tenant_id, titulo_id, financeiro_id, tipo_evento, usuario, descricao)
           VALUES ($1::UUID, $2, $3, 'CANCELAMENTO_CIOT', $4, $5)`,
          [String(tenantId), idFin, idFin, usuario, `Título cancelado pelo cancelamento do CIOT: ${motivo}`]
        )
        .catch(() => null);
    }
    return upd.rowCount || 0;
  } catch (err) {
    logger.warn('[CIOT Financeiro] Aviso ao estornar títulos do CIOT:', err.message);
    return 0;
  }
}

/**
 * Emite ou registra o CIOT conforme o provedor configurado (Homologação, Manual ou API IPEF).
 */
async function emitirOuRegistrarCiot({
  runner = db,
  tenantId,
  contratoId,
  modoExplicito = null,
  codigoManual = null,
  verificadorManual = null,
  usuario = 'Operador',
}) {
  const { rows } = await runner.query(
    `SELECT c.*,
            e.focus_ambiente,
            e.ciot_provedor AS emit_ciot_provedor,
            e.ciot_ambiente AS emit_ciot_ambiente,
            e.ciot_integrador_token AS emit_ciot_token,
            e.ciot_usuario AS emit_ciot_usuario,
            e.ciot_senha AS emit_ciot_senha,
            e.ciot_cnpj_ipef AS emit_ciot_cnpj_ipef,
            e.ciot_api_url_producao AS emit_ciot_api_url_producao,
            e.ciot_api_url_homologacao AS emit_ciot_api_url_homologacao
     FROM dash_contratos_transporte c
     LEFT JOIN dash_emitentes e ON e.id = c.emitente_id AND e.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2
     LIMIT 1`,
    [contratoId, tenantId]
  );

  if (rows.length === 0) {
    const err = new Error('Operação de transporte (CIOT) não encontrada.');
    err.statusCode = 404;
    throw err;
  }

  const c = rows[0];
  if (c.ciot_status === 'CANCELADO') {
    const err = new Error('Esta operação de CIOT está cancelada. Crie uma nova operação.');
    err.statusCode = 409;
    throw err;
  }

  const ambienteEfetivo = String(
    c.emit_ciot_ambiente || c.focus_ambiente || 'homologacao'
  ).toLowerCase();

  // Recalcula e valida Piso Mínimo ANTT 5.867
  const pisoCheck = calcularPisoMinimoAntt({
    categoriaCarga: c.categoria_carga_antt,
    tipoOperacao: c.tipo_operacao,
    quantidadeEixos: c.quantidade_eixos,
    distanciaKm: c.distancia_km,
    ufInicio: c.uf_inicio,
    ufFim: c.uf_fim,
    municipioInicio: c.municipio_inicio,
    municipioFim: c.municipio_fim,
    altoDesempenho: c.alto_desempenho,
    retornoVazio: c.retorno_vazio,
    valorFrete: c.valor_frete,
    pisoIsento: c.piso_isento,
    pisoIsencaoMotivo: c.piso_isencao_motivo,
  });

  if (!pisoCheck.aprovado) {
    const motivoCurto =
      Boolean(c.piso_isento) && String(c.piso_isencao_motivo || '').trim().length < 15;
    const err = new Error(
      motivoCurto
        ? 'Para aplicar isenção/exceção ao Piso Mínimo da ANTT, informe o motivo legal detalhado (mínimo 15 caracteres).'
        : `Frete informado (R$ ${Number(c.valor_frete || 0).toFixed(2)}) está abaixo do Piso Mínimo Oficial da ANTT (R$ ${pisoCheck.piso.toFixed(2)} — ${pisoCheck.categoria_nome}, ${pisoCheck.eixos} eixos, ${pisoCheck.distancia_km} km). Ajuste o valor do frete ou marque Isenção Justificada.`
    );
    err.statusCode = 422;
    err.code = motivoCurto ? 'ISENCAO_MOTIVO_CURTO' : 'PISO_MINIMO_NAO_ATENDIDO';
    err.piso_detalhes = pisoCheck;
    throw err;
  }

  const provedorRaw = String(
    modoExplicito || (codigoManual ? 'MANUAL' : c.ciot_provedor || c.emit_ciot_provedor || 'HOMOLOGACAO_LOCAL')
  )
    .toUpperCase()
    .trim();
  const provedor = PROVEDORES_CIOT_SUPORTADOS.includes(provedorRaw)
    ? provedorRaw
    : 'HOMOLOGACAO_LOCAL';

  let ciotCodigo12 = null;
  let ciotVerificador4 = null;
  let cnpjIpefUsado = digitsOnly(c.cnpj_ipef || c.emit_ciot_cnpj_ipef) || null;
  let statusFinal = 'TRANSMITIDO';

  if (codigoManual) {
    const norm = normalizarProtocoloCiot(codigoManual, verificadorManual);
    if (!norm.valido) {
      const err = new Error(norm.erro);
      err.statusCode = 400;
      throw err;
    }
    ciotCodigo12 = norm.codigo;
    ciotVerificador4 = norm.verificador;
  } else if (provedor === 'HOMOLOGACAO_LOCAL') {
    if (ambienteEfetivo === 'producao') {
      const err = new Error(
        'O provedor CIOT da empresa ainda está configurado como "Simulador Local (Homologação)", que não gera protocolo válido na SEFAZ Produção (NT 2026.001). Informe os 12 dígitos emitidos na sua IPEF ("Informar Código CIOT") ou altere o provedor em Dados da Empresa.'
      );
      err.statusCode = 422;
      err.code = 'SIMULADOR_BLOQUEADO_EM_PRODUCAO';
      throw err;
    }
    const sim = gerarCodigoCiotHomologacao(c.id);
    ciotCodigo12 = sim.codigo;
    ciotVerificador4 = sim.verificador;
  } else if (provedor === 'MANUAL') {
    statusFinal = 'GERADO';
  } else if (provedor === 'EFRETE') {
    const credenciais = {
      ambiente: ambienteEfetivo,
      integrador: String(decryptSecret(c.emit_ciot_token) || '').trim(),
      usuario: String(c.emit_ciot_usuario || '').trim(),
      senha: String(decryptSecret(c.emit_ciot_senha) || '').trim(),
    };
    const ret = await emitirViaEfrete(c, c, credenciais);
    ciotCodigo12 = ret.codigo;
    ciotVerificador4 = ret.verificador;
    cnpjIpefUsado = cnpjIpefUsado || ret.cnpj_ipef;
  } else if (provedor === 'PAMCARD' || provedor === 'TARGET' || provedor === 'ANTT_A1') {
    const tok = String(decryptSecret(c.emit_ciot_token) || '').trim();
    if (!tok && ambienteEfetivo !== 'producao') {
      const sim = gerarCodigoCiotHomologacao(c.id);
      ciotCodigo12 = sim.codigo;
      ciotVerificador4 = sim.verificador;
      cnpjIpefUsado = cnpjIpefUsado || CNPJ_PADRAO_IPEF[provedor] || null;
    } else if (!tok) {
      const err = new Error(
        `Credenciais da integradora ${provedor} não configuradas para Produção. Configure o Token/Usuário em Dados da Empresa ou informe o código de 12 dígitos emitido no portal da ${provedor}.`
      );
      err.statusCode = 422;
      throw err;
    } else if (ambienteEfetivo !== 'producao' && !c.emit_ciot_api_url_homologacao) {
      const sim = gerarCodigoCiotHomologacao(c.id);
      ciotCodigo12 = sim.codigo;
      ciotVerificador4 = sim.verificador;
      cnpjIpefUsado = cnpjIpefUsado || CNPJ_PADRAO_IPEF[provedor] || null;
    } else {
      const ret = await emitirViaRestIpef({
        provedor,
        contrato: c,
        credenciais: {
          ambiente: ambienteEfetivo,
          integrador: tok,
          usuario: String(c.emit_ciot_usuario || '').trim(),
          baseUrl:
            ambienteEfetivo === 'producao'
              ? c.emit_ciot_api_url_producao
              : c.emit_ciot_api_url_homologacao,
        },
      });
      ciotCodigo12 = ret.codigo;
      ciotVerificador4 = ret.verificador;
      cnpjIpefUsado = cnpjIpefUsado || ret.cnpj_ipef;
    }
  }

  const contratoParaPayload = {
    ...c,
    ciot_provedor: provedor,
    ciot_codigo: ciotCodigo12 || c.ciot_codigo || null,
    ciot_verificador: ciotVerificador4 || c.ciot_verificador || null,
    cnpj_ipef: cnpjIpefUsado,
    piso_minimo_antt: pisoCheck.piso,
    piso_minimo_aprovado: pisoCheck.aprovado,
  };
  const payloadAntt = montarPayloadPadraoAntt(contratoParaPayload, c);

  const marcarTransmitido = statusFinal === 'TRANSMITIDO';
  const updRes = await runner.query(
    `UPDATE dash_contratos_transporte
     SET ciot_status = $1,
         ciot_codigo = COALESCE($2, ciot_codigo),
         ciot_verificador = COALESCE($3, ciot_verificador),
         ciot_provedor = $4,
         cnpj_ipef = COALESCE($5, cnpj_ipef),
         piso_minimo_antt = $6,
         piso_minimo_aprovado = $7,
         ciot_payload_antt = $8::jsonb,
         ciot_transmitido_em = CASE WHEN $11::boolean THEN COALESCE(ciot_transmitido_em, NOW()) ELSE ciot_transmitido_em END,
         ciot_erro = NULL,
         updated_at = NOW()
     WHERE id = $9 AND tenant_id = $10
     RETURNING *`,
    [
      statusFinal,
      ciotCodigo12,
      ciotVerificador4,
      provedor,
      cnpjIpefUsado,
      pisoCheck.piso,
      pisoCheck.aprovado,
      JSON.stringify(payloadAntt),
      c.id,
      tenantId,
      marcarTransmitido,
    ]
  );

  const contratoAtualizado = updRes.rows[0] || contratoParaPayload;
  let financeiroIds = Array.isArray(contratoAtualizado.financeiro_ids)
    ? contratoAtualizado.financeiro_ids
    : [];

  if (statusFinal === 'TRANSMITIDO' && contratoAtualizado.ciot_codigo) {
    financeiroIds = await sincronizarFinanceiroCiot(
      runner,
      tenantId,
      contratoAtualizado,
      usuario
    );
    contratoAtualizado.financeiro_ids = financeiroIds;
  }

  return {
    contrato: contratoAtualizado,
    payload: payloadAntt,
    piso_minimo: pisoCheck,
    financeiro_ids: financeiroIds,
  };
}

/**
 * Encerra uma operação de CIOT específica (transmitindo à IPEF quando em Produção ou registrando protocolo).
 */
async function encerrarCiotContrato({
  runner = db,
  tenantId,
  contratoId,
  protocoloEncerramento = null,
}) {
  const { rows } = await runner.query(
    `SELECT c.*,
            e.focus_ambiente,
            e.ciot_provedor AS emit_ciot_provedor,
            e.ciot_ambiente AS emit_ciot_ambiente,
            e.ciot_integrador_token AS emit_ciot_token,
            e.ciot_usuario AS emit_ciot_usuario,
            e.ciot_senha AS emit_ciot_senha
     FROM dash_contratos_transporte c
     LEFT JOIN dash_emitentes e ON e.id = c.emitente_id AND e.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2
     LIMIT 1`,
    [contratoId, tenantId]
  );
  if (rows.length === 0) {
    const err = new Error('Operação de CIOT não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  const c = rows[0];
  if (c.ciot_status === 'CANCELADO') {
    const err = new Error('Não é possível encerrar um CIOT cancelado.');
    err.statusCode = 409;
    throw err;
  }
  if (c.ciot_status === 'ENCERRADO') {
    return c;
  }

  let protFinal = String(protocoloEncerramento || '').trim();
  const ambienteEfetivo = String(c.emit_ciot_ambiente || c.focus_ambiente || 'homologacao').toLowerCase();
  const provedorEfetivo = String(c.ciot_provedor || c.emit_ciot_provedor || 'HOMOLOGACAO_LOCAL').toUpperCase();

  if (!protFinal && ambienteEfetivo === 'producao' && c.ciot_codigo) {
    const credenciais = {
      ambiente: ambienteEfetivo,
      integrador: String(decryptSecret(c.emit_ciot_token) || '').trim(),
      usuario: String(c.emit_ciot_usuario || '').trim(),
      senha: String(decryptSecret(c.emit_ciot_senha) || '').trim(),
    };
    if (provedorEfetivo === 'EFRETE') {
      const retSoap = await encerrarViaEfrete(c, credenciais);
      protFinal = retSoap.protocolo;
    } else if (provedorEfetivo === 'PAMCARD' || provedorEfetivo === 'TARGET') {
      const retRest = await transmitirEventoRestIpef({
        provedor: provedorEfetivo,
        operacao: 'ENCERRAR',
        contrato: c,
        credenciais,
      });
      protFinal = retRest.protocolo;
    }
  }

  if (!protFinal) {
    protFinal = `ENC-${c.ciot_codigo || c.id}-${String(Date.now()).slice(-6)}`;
  }

  const upd = await runner.query(
    `UPDATE dash_contratos_transporte
     SET ciot_status = 'ENCERRADO',
         ciot_protocolo_encerramento = $1,
         ciot_encerrado_em = NOW(),
         updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [protFinal.slice(0, 40), contratoId, tenantId]
  );
  return upd.rows[0];
}

/**
 * Cancela uma operação de CIOT (transmitindo o cancelamento à IPEF quando em Produção e estornando títulos abertos).
 */
async function cancelarCiotContrato({
  runner = db,
  tenantId,
  contratoId,
  motivo = '',
  protocoloCancelamento = null,
  usuario = 'Operador',
}) {
  const motivoLimpo = String(motivo || '').trim();
  if (motivoLimpo.length < 10) {
    const err = new Error('Informe o motivo do cancelamento do CIOT (mínimo 10 caracteres).');
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await runner.query(
    `SELECT c.*,
            e.focus_ambiente,
            e.ciot_provedor AS emit_ciot_provedor,
            e.ciot_ambiente AS emit_ciot_ambiente,
            e.ciot_integrador_token AS emit_ciot_token,
            e.ciot_usuario AS emit_ciot_usuario,
            e.ciot_senha AS emit_ciot_senha
     FROM dash_contratos_transporte c
     LEFT JOIN dash_emitentes e ON e.id = c.emitente_id AND e.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2
     LIMIT 1`,
    [contratoId, tenantId]
  );
  if (rows.length === 0) {
    const err = new Error('Operação de CIOT não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  const c = rows[0];
  if (c.ciot_status === 'CANCELADO') {
    return { contrato: c, titulos_estornados: 0 };
  }

  let protCanc = String(protocoloCancelamento || '').trim();
  const ambienteEfetivo = String(c.emit_ciot_ambiente || c.focus_ambiente || 'homologacao').toLowerCase();
  const provedorEfetivo = String(c.ciot_provedor || c.emit_ciot_provedor || 'HOMOLOGACAO_LOCAL').toUpperCase();

  if (!protCanc && ambienteEfetivo === 'producao' && c.ciot_codigo) {
    const credenciais = {
      ambiente: ambienteEfetivo,
      integrador: String(decryptSecret(c.emit_ciot_token) || '').trim(),
      usuario: String(c.emit_ciot_usuario || '').trim(),
      senha: String(decryptSecret(c.emit_ciot_senha) || '').trim(),
    };
    if (provedorEfetivo === 'EFRETE') {
      const retSoap = await cancelarViaEfrete(c, motivoLimpo, credenciais);
      protCanc = retSoap.protocolo;
    } else if (provedorEfetivo === 'PAMCARD' || provedorEfetivo === 'TARGET') {
      const retRest = await transmitirEventoRestIpef({
        provedor: provedorEfetivo,
        operacao: 'CANCELAR',
        contrato: c,
        motivo: motivoLimpo,
        credenciais,
      });
      protCanc = retRest.protocolo;
    }
  }

  if (!protCanc) {
    protCanc = `CANC-${c.ciot_codigo || c.id}-${String(Date.now()).slice(-6)}`;
  }

  const upd = await runner.query(
    `UPDATE dash_contratos_transporte
     SET ciot_status = 'CANCELADO',
         ciot_protocolo_cancelamento = $1,
         ciot_cancelado_motivo = $2,
         ciot_cancelado_em = NOW(),
         updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [protCanc.slice(0, 40), motivoLimpo.slice(0, 500), contratoId, tenantId]
  );

  const estornados = await estornarFinanceiroCiot(runner, tenantId, c, motivoLimpo, usuario);
  return {
    contrato: upd.rows[0],
    protocolo_cancelamento: protCanc,
    titulos_estornados: estornados,
  };
}

/**
 * Gera HTML limpo e pronto para impressão (A4) do Contrato de Prestação de Serviço de Transporte & RPA (TAC).
 */
function gerarHtmlContratoRpa(contrato, emitente = {}) {
  const esc = escapeXml;
  const fmtMoeda = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const bruto = Number(contrato.valor_frete || 0);
  const adiantamento = Number(contrato.valor_adiantamento || 0);
  const pedagio = Number(contrato.valor_pedagio || 0);
  const combustivel = Number(contrato.valor_combustivel || 0);
  const inss = Number(contrato.valor_inss || 0);
  const sestSenat = Number(contrato.valor_sest_senat || 0);
  const irrf = Number(contrato.valor_irrf || 0);
  const outrosDesc = Number(contrato.valor_outros_descontos || 0);
  const totalRet = inss + sestSenat + irrf + outrosDesc;
  const saldoQuitacao = Math.max(0, bruto - adiantamento - totalRet);
  const protocoloFormatado = contrato.ciot_codigo
    ? contrato.ciot_verificador
      ? `${contrato.ciot_codigo}/${contrato.ciot_verificador}`
      : contrato.ciot_codigo
    : 'PENDENTE DE TRANSMISSÃO';
  const dataEmissaoFmt = new Date(contrato.created_at || Date.now()).toLocaleDateString('pt-BR');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Contrato de Transporte &amp; RPA — CIOT ${esc(protocoloFormatado)}</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { margin: 24px; color: #0f172a; font-size: 12px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
    .title { font-size: 16px; font-weight: 800; text-transform: uppercase; }
    .badge { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; }
    .section { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
    .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .val { font-size: 12px; font-weight: 600; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #475569; }
    .right { text-align: right; }
    .highlight { background: #f0fdf4; font-weight: 800; font-size: 13px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 42px; text-align: center; }
    .sig-line { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; }
    .no-print { margin-bottom: 16px; }
    @media print { .no-print { display: none; } body { margin: 8mm; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 16px;background:#0284c7;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">
      Imprimir / Salvar PDF
    </button>
  </div>
  <div class="header">
    <div>
      <div class="title">Contrato de Prestação de Transporte Rodoviário de Cargas &amp; RPA</div>
      <div>Resolução ANTT nº 5.867/2020 e Resolução ANTT nº 5.862/2019 (PEO / CIOT)</div>
      <div style="margin-top:4px;color:#475569;">Emissão: <strong>${esc(dataEmissaoFmt)}</strong> | Contrato Interno Nº <strong>#${esc(contrato.id)}</strong></div>
    </div>
    <div class="badge">CIOT: ${esc(protocoloFormatado)}<br/><small>Status: ${esc(contrato.ciot_status || 'GERADO')}</small></div>
  </div>

  <div class="section">
    <div class="section-title">1. Identificação do Contratante</div>
    <div class="grid-2">
      <div><div class="label">Razão Social / Nome</div><div class="val">${esc(contrato.contratante_nome || emitente.razao_social || '-')}</div></div>
      <div><div class="label">CNPJ / CPF</div><div class="val">${esc(contrato.contratante_documento || emitente.cnpj || '-')}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">2. Transportador Contratado (TAC / ETC) &amp; Conjunto Veicular</div>
    <div class="grid">
      <div><div class="label">Transportador</div><div class="val">${esc(contrato.transportador_nome || '-')}</div></div>
      <div><div class="label">CPF / CNPJ</div><div class="val">${esc(contrato.transportador_documento || '-')}</div></div>
      <div><div class="label">RNTRC ANTT</div><div class="val">${esc(contrato.transportador_rntrc || 'ISENTO')}</div></div>
      <div><div class="label">Motorista Condutor</div><div class="val">${esc(contrato.motorista_nome || contrato.transportador_nome || '-')} (${esc(contrato.motorista_cpf || '-')})</div></div>
      <div><div class="label">Placa de Tração / Eixos</div><div class="val">${esc(contrato.veiculo_placa || '-')} • ${esc(contrato.quantidade_eixos || 2)} eixos</div></div>
      <div><div class="label">Dados de Quitação</div><div class="val">${esc(contrato.forma_quitacao || 'PIX')} ${contrato.chave_pix ? `(${esc(contrato.chave_pix)})` : ''}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">3. Percurso, Carga &amp; Conformidade do Piso Mínimo ANTT</div>
    <div class="grid">
      <div><div class="label">Origem</div><div class="val">${esc(contrato.municipio_inicio || '')} / ${esc(contrato.uf_inicio || '')}</div></div>
      <div><div class="label">Destino</div><div class="val">${esc(contrato.municipio_fim || '')} / ${esc(contrato.uf_fim || '')}</div></div>
      <div><div class="label">Distância Estimada</div><div class="val">${esc(contrato.distancia_km || 0)} km</div></div>
      <div><div class="label">Categoria ANTT / Peso</div><div class="val">${esc(contrato.categoria_carga_antt || 'GERAL')} • ${esc(contrato.peso_carga_kg || 0)} kg</div></div>
      <div><div class="label">Piso Mínimo Oficial ANTT</div><div class="val">${fmtMoeda(contrato.piso_minimo_antt)}</div></div>
      <div><div class="label">Vale-Pedágio Obrigatório</div><div class="val">${pedagio > 0 ? `${fmtMoeda(pedagio)} ${contrato.vale_pedagio_comprovante ? `(Comp. ${esc(contrato.vale_pedagio_comprovante)})` : ''}` : 'Não aplicável / Isento'}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">4. Demonstrativo Financeiro &amp; Retenções Legais (RPA — IN RFB 2.110/2022)</div>
    <table>
      <thead>
        <tr><th>Rubrica</th><th>Base Legal / Referência</th><th class="right">Valor (R$)</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>(+) Valor Bruto do Frete Contratado</strong></td><td>Prestação de transporte rodoviário</td><td class="right"><strong>${fmtMoeda(bruto)}</strong></td></tr>
        <tr><td>(i) Vale-Pedágio Fornecido Separadamente (Não integra base)</td><td>Lei nº 10.209/2001 / Res. ANTT 6.024</td><td class="right">${fmtMoeda(pedagio)}</td></tr>
        ${combustivel > 0 ? `<tr><td>(i) Vale-Combustível</td><td>Destaque contratual</td><td class="right">${fmtMoeda(combustivel)}</td></tr>` : ''}
        <tr><td>(-) Retenção INSS Autônomo (TAC)</td><td>11% sobre 20% do frete bruto (2,20%)</td><td class="right">- ${fmtMoeda(inss)}</td></tr>
        <tr><td>(-) Retenção SEST / SENAT</td><td>2,5% sobre 20% do frete bruto (0,50%)</td><td class="right">- ${fmtMoeda(sestSenat)}</td></tr>
        <tr><td>(-) Retenção IRRF Transporte de Cargas</td><td>Tabela progressiva sobre 10% do frete bruto</td><td class="right">- ${fmtMoeda(irrf)}</td></tr>
        ${outrosDesc > 0 ? `<tr><td>(-) Outros Descontos Contratuais</td><td>Avarias / Adiantamentos extras</td><td class="right">- ${fmtMoeda(outrosDesc)}</td></tr>` : ''}
        <tr><td>(-) Adiantamento de Viagem Concedido</td><td>Saída do veículo</td><td class="right">- ${fmtMoeda(adiantamento)}</td></tr>
        <tr class="highlight"><td><strong>(=) SALDO LÍQUIDO DE QUITAÇÃO A PAGAR NA ENTREGA</strong></td><td>Forma: ${esc(contrato.forma_quitacao || 'PIX')}</td><td class="right"><strong>${fmtMoeda(saldoQuitacao)}</strong></td></tr>
      </tbody>
    </table>
  </div>

  <p style="font-size:10.5px;color:#334155;margin-top:10px;">
    Declaro ter recebido/contratado os valores discriminados neste Contrato de Transporte e Recibo de Pagamento a Autônomo (RPA), em plena conformidade com o Piso Mínimo de Frete (Resolução ANTT nº 5.867/2020), comprometendo-me à entrega fiel das mercadorias descritas nos documentos fiscais vinculados e à devolução do comprovante de entrega assinado.
  </p>

  <div class="signatures">
    <div class="sig-line"><strong>${esc(contrato.contratante_nome || emitente.razao_social || 'CONTRATANTE')}</strong><br/>CNPJ/CPF: ${esc(contrato.contratante_documento || emitente.cnpj || '')}</div>
    <div class="sig-line"><strong>${esc(contrato.transportador_nome || 'TRANSPORTADOR CONTRATADO')}</strong><br/>CPF/CNPJ: ${esc(contrato.transportador_documento || '')} • RNTRC: ${esc(contrato.transportador_rntrc || '')}</div>
  </div>
</body>
</html>`;
}

/**
 * Encerra automaticamente o(s) contrato(s) de CIOT vinculados a um MDF-e encerrado na SEFAZ.
 */
async function encerrarCiotsPorMdfe(runner, tenantId, mdfe) {
  if (!mdfe?.id) return 0;
  try {
    const ciotCodLimpo = digitsOnly(mdfe.ciot_codigo);
    const protSefaz = mdfe.protocolo ? `MDFE-${mdfe.protocolo}` : `MDFE-${mdfe.id}-ENC`;
    const mdfeIdNum = Number(mdfe.id);
    const temCiotCod = Boolean(ciotCodLimpo);
    const upd = await runner.query(
      `UPDATE dash_contratos_transporte
       SET ciot_status = 'ENCERRADO',
           ciot_protocolo_encerramento = COALESCE(ciot_protocolo_encerramento, $1),
           ciot_encerrado_em = COALESCE(ciot_encerrado_em, NOW()),
           mdfe_id = COALESCE(mdfe_id, $2),
           updated_at = NOW()
       WHERE tenant_id = $3
         AND ciot_status = 'TRANSMITIDO'
         AND (
           mdfe_id = $4
           OR ($5::boolean = TRUE AND ciot_codigo = $6)
         )`,
      [
        String(protSefaz).slice(0, 40),
        mdfeIdNum,
        tenantId,
        mdfeIdNum,
        temCiotCod,
        ciotCodLimpo || null,
      ]
    );
    return upd.rowCount || 0;
  } catch (err) {
    logger.warn('[CIOT] Aviso ao encerrar CIOT vinculado ao MDF-e:', err.message);
    return 0;
  }
}

module.exports = {
  PROVEDORES_CIOT_SUPORTADOS,
  CNPJ_PADRAO_IPEF,
  calcularDigitoVerificadorCiot4,
  normalizarProtocoloCiot,
  gerarCodigoCiotHomologacao,
  calcularRetencoesTac,
  montarPayloadPadraoAntt,
  autenticarSessaoEfrete,
  emitirViaEfrete,
  sincronizarFinanceiroCiot,
  estornarFinanceiroCiot,
  emitirOuRegistrarCiot,
  encerrarCiotContrato,
  cancelarCiotContrato,
  encerrarCiotsPorMdfe,
  gerarHtmlContratoRpa,
};
