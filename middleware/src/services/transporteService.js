'use strict';

const crypto = require('crypto');
const db = require('../db/postgres');
const config = require('../config/env');
const logger = require('../config/logger');
const FocusClient = require('./focus/focusClient');
const { safeCompare } = require('../middleware/auth');
const {
  encryptSecret,
  decryptSecret,
  decryptBuffer,
  isMaskedValue,
  maskSecret,
  resolveSecretForSave,
} = require('../utils/cryptoVault');

const IBGE_UF_BY_CODE = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

function validarCnpjReal(cnpjInput) {
  const cnpj = String(cnpjInput || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDv = (base, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const dv1 = calcDv(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcDv(cnpj.slice(0, 12) + String(dv1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(cnpj[12]) === dv1 && Number(cnpj[13]) === dv2;
}

function normalizarRntrc8(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (!d) return '00000000';
  if (d.length <= 8) return d.padStart(8, '0');
  const semZerosEsquerda = d.replace(/^0+/, '');
  return semZerosEsquerda.length <= 8
    ? semZerosEsquerda.padStart(8, '0')
    : d.slice(-8);
}

/**
 * Formata data/hora atual no padrão ISO-8601 exigido pela SEFAZ / Focus NFe (sem milissegundos e com offset da UF).
 */
function formatarDataHoraSefaz(uf = 'MS') {
  const ufUpper = String(uf || 'MS').toUpperCase().trim();
  const offsetHours =
    ufUpper === 'AC'
      ? -5
      : ['MS', 'MT', 'AM', 'RO', 'RR'].includes(ufUpper)
      ? -4
      : -3;
  const offsetStr = `${offsetHours < 0 ? '-' : '+'}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;
  // Subtrai 30 segundos para evitar rejeição SEFAZ por micro-adiantamento de relógio entre servidores
  const adjusted = new Date(Date.now() - 30 * 1000 + offsetHours * 3600 * 1000);
  return `${adjusted.toISOString().slice(0, 19)}${offsetStr}`;
}

/**
 * Converte qualquer valor de data (objeto Date do PostgreSQL, ISO string ou DD/MM/YYYY)
 * estritamente para o formato YYYY-MM-DD exigido pelo XSD da SEFAZ (TData).
 */
function formatarDataYmd(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    const isUtcMidnight =
      valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 && valor.getUTCSeconds() === 0;
    const y = isUtcMidnight ? valor.getUTCFullYear() : valor.getFullYear();
    const m = String((isUtcMidnight ? valor.getUTCMonth() : valor.getMonth()) + 1).padStart(2, '0');
    const d = String(isUtcMidnight ? valor.getUTCDate() : valor.getDate()).padStart(2, '0');
    const out = `${y}-${m}-${d}`;
    return /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(out) ? out : null;
  }
  const s = String(valor).trim();
  const isoMatch = s.match(/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const brMatch = s.match(/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(20\d{2})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const out = `${y}-${m}-${d}`;
    return /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(out) ? out : null;
  }
  return null;
}

/**
 * Calcula o Dígito Verificador Módulo 11 (44º dígito) de uma chave de acesso SEFAZ de 43 dígitos.
 */
function calcularDvChaveSefaz(base43) {
  const d = String(base43 || '').replace(/\D/g, '');
  if (d.length !== 43) return null;
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(d[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

/**
 * Em homologação, garante que uma chave de 44 dígitos informada manualmente para teste tenha DV Módulo 11 válido.
 */
function normalizarChaveDfeParaAmbiente(chaveRaw, ambiente = 'homologacao') {
  let ch = String(chaveRaw || '').replace(/\D/g, '');
  if (ambiente !== 'producao' && ch.length > 44) {
    ch = ch.slice(0, 44);
  }
  if (ch.length !== 44) return ch;
  if (ambiente === 'producao') return ch;
  const dvCalculado = calcularDvChaveSefaz(ch.slice(0, 43));
  return dvCalculado ? `${ch.slice(0, 43)}${dvCalculado}` : ch;
}

const KNOWN_ANTT_FISCAL_REGISTRY = {
  '03272053000150': {
    cnpj: '03272053000150',
    razao_social: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
    nome_fantasia: 'PANTANAL',
    inscricao_estadual: '283100630',
    rntrc: '04755410',
    regime_tributario: '3',
    logradouro: 'RUA ARGENTINA',
    numero: '715',
    complemento: '',
    bairro: 'PARQUE DAS NACOES',
    cep: '79841270',
    uf: 'MS',
    municipio: 'Dourados',
    codigo_municipio: '5003702',
    telefone: '6734164605',
  },
};

const inFlightAutoHidratacao = new Map();
const inFlightCteEmissoes = new Map();
const tenantEmissionChains = new Map();
const tenantsLoteHomologMsInicializado = new Set();

function runTenantSequential(tenantId, taskFn) {
  const key = String(tenantId || 'default');
  const prev = tenantEmissionChains.get(key) || Promise.resolve();
  const next = prev.catch(() => null).then(() => taskFn());
  tenantEmissionChains.set(
    key,
    next.finally(() => {
      if (tenantEmissionChains.get(key) === next) {
        tenantEmissionChains.delete(key);
      }
    })
  );
  return next;
}

function extrairTagXml(bloco, tag) {
  if (!bloco || !tag) return '';
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
  const m = String(bloco).match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function extrairBlocosXml(bloco, tag) {
  if (!bloco || !tag) return [];
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi');
  return Array.from(String(bloco).matchAll(re), (m) => m[1]);
}

function parseNfeXml(xmlString) {
  const raw = String(xmlString || '').trim();
  if (!raw || !raw.includes('infNFe')) {
    throw new Error('Conteúdo XML inválido ou não corresponde a uma NF-e (bloco <infNFe> ausente).');
  }

  const chaveAttrMatch = raw.match(/Id\s*=\s*["']NFe(\d{44})["']/i);
  const chNfeTag = extrairTagXml(raw, 'chNFe');
  const chave = digitsOnly(chaveAttrMatch?.[1] || chNfeTag);
  if (chave.length !== 44) {
    throw new Error('Chave de acesso de 44 dígitos não encontrada no XML da NF-e.');
  }

  const ide = extrairTagXml(raw, 'ide');
  const emit = extrairTagXml(raw, 'emit');
  const enderEmit = extrairTagXml(emit, 'enderEmit');
  const dest = extrairTagXml(raw, 'dest');
  const enderDest = extrairTagXml(dest, 'enderDest');
  const icmsTot = extrairTagXml(raw, 'ICMSTot');
  const transp = extrairTagXml(raw, 'transp');
  const prot = extrairTagXml(raw, 'infProt');

  const vols = extrairBlocosXml(transp, 'vol');
  let pesoBruto = 0;
  let pesoLiquido = 0;
  let qtdVolumes = 0;
  let especie = 'VOLUMES';
  for (const v of vols) {
    pesoBruto += parseFloat(extrairTagXml(v, 'pesoB') || '0') || 0;
    pesoLiquido += parseFloat(extrairTagXml(v, 'pesoL') || '0') || 0;
    qtdVolumes += parseInt(extrairTagXml(v, 'qVol') || '0', 10) || 0;
    const esp = extrairTagXml(v, 'esp');
    if (esp) especie = esp;
  }

  const dets = extrairBlocosXml(raw, 'det');
  const itens = dets.map((d, idx) => {
    const prod = extrairTagXml(d, 'prod');
    return {
      id_item: idx + 1,
      codigo: extrairTagXml(prod, 'cProd'),
      descricao: extrairTagXml(prod, 'xProd'),
      ncm: extrairTagXml(prod, 'NCM'),
      cfop: extrairTagXml(prod, 'CFOP'),
      unidade: extrairTagXml(prod, 'uCom'),
      quantidade: parseFloat(extrairTagXml(prod, 'qCom') || '0') || 0,
      valor_unitario: parseFloat(extrairTagXml(prod, 'vUnCom') || '0') || 0,
      valor_total: parseFloat(extrairTagXml(prod, 'vProd') || '0') || 0,
    };
  });

  const itemMaiorValor = itens
    .slice()
    .sort((a, b) => (b.valor_total || 0) - (a.valor_total || 0))[0];

  const emitDoc = digitsOnly(extrairTagXml(emit, 'CNPJ') || extrairTagXml(emit, 'CPF'));
  const destDoc = digitsOnly(extrairTagXml(dest, 'CNPJ') || extrairTagXml(dest, 'CPF'));

  const numero = extrairTagXml(ide, 'nNF') || String(parseInt(chave.slice(25, 34), 10));
  const serie = extrairTagXml(ide, 'serie') || String(parseInt(chave.slice(22, 25), 10));
  const dataEmissao =
    extrairTagXml(ide, 'dhEmi') || extrairTagXml(ide, 'dEmi') || new Date().toISOString();

  const remetente = {
    documento: emitDoc,
    cnpj: emitDoc.length === 14 ? emitDoc : undefined,
    cpf: emitDoc.length === 11 ? emitDoc : undefined,
    razao_social: extrairTagXml(emit, 'xNome'),
    nome_fantasia: extrairTagXml(emit, 'xFant') || extrairTagXml(emit, 'xNome'),
    inscricao_estadual: extrairTagXml(emit, 'IE'),
    logradouro: extrairTagXml(enderEmit, 'xLgr'),
    numero: extrairTagXml(enderEmit, 'nro'),
    complemento: extrairTagXml(enderEmit, 'xCpl'),
    bairro: extrairTagXml(enderEmit, 'xBairro'),
    codigo_municipio: digitsOnly(extrairTagXml(enderEmit, 'cMun')),
    municipio: extrairTagXml(enderEmit, 'xMun'),
    uf: (extrairTagXml(enderEmit, 'UF') || IBGE_UF_BY_CODE[chave.slice(0, 2)] || 'MS').toUpperCase(),
    cep: digitsOnly(extrairTagXml(enderEmit, 'CEP')),
    telefone: digitsOnly(extrairTagXml(enderEmit, 'fone')),
  };

  const destinatario = {
    documento: destDoc,
    cnpj: destDoc.length === 14 ? destDoc : undefined,
    cpf: destDoc.length === 11 ? destDoc : undefined,
    razao_social: extrairTagXml(dest, 'xNome'),
    inscricao_estadual: extrairTagXml(dest, 'IE'),
    indicador_ie: extrairTagXml(dest, 'indIEDest') || '9',
    logradouro: extrairTagXml(enderDest, 'xLgr'),
    numero: extrairTagXml(enderDest, 'nro'),
    complemento: extrairTagXml(enderDest, 'xCpl'),
    bairro: extrairTagXml(enderDest, 'xBairro'),
    codigo_municipio: digitsOnly(extrairTagXml(enderDest, 'cMun')),
    municipio: extrairTagXml(enderDest, 'xMun'),
    uf: (extrairTagXml(enderDest, 'UF') || 'MS').toUpperCase(),
    cep: digitsOnly(extrairTagXml(enderDest, 'CEP')),
    telefone: digitsOnly(extrairTagXml(enderDest, 'fone')),
    email: extrairTagXml(dest, 'email'),
  };

  return {
    chave_acesso: chave,
    numero,
    serie,
    data_emissao: dataEmissao,
    natureza: extrairTagXml(ide, 'natOp'),
    protocolo: extrairTagXml(prot, 'nProt'),
    valor_total: parseFloat(extrairTagXml(icmsTot, 'vNF') || '0') || 0,
    valor_produtos: parseFloat(extrairTagXml(icmsTot, 'vProd') || '0') || 0,
    peso_bruto: pesoBruto,
    peso_liquido: pesoLiquido,
    volumes: qtdVolumes || 1,
    especie,
    produto_predominante: itemMaiorValor?.descricao || 'MERCADORIA EM GERAL',
    remetente,
    destinatario,
    itens,
  };
}

const CAPITAIS_IBGE_FALLBACK = {
  AC: { codigo: '1200401', nome: 'Rio Branco' },
  AL: { codigo: '2704302', nome: 'Maceio' },
  AM: { codigo: '1302603', nome: 'Manaus' },
  AP: { codigo: '1600303', nome: 'Macapa' },
  BA: { codigo: '2927408', nome: 'Salvador' },
  CE: { codigo: '2304400', nome: 'Fortaleza' },
  DF: { codigo: '5300108', nome: 'Brasilia' },
  ES: { codigo: '3205309', nome: 'Vitoria' },
  GO: { codigo: '5208707', nome: 'Goiania' },
  MA: { codigo: '2111300', nome: 'Sao Luis' },
  MG: { codigo: '3106200', nome: 'Belo Horizonte' },
  MS: { codigo: '5002704', nome: 'Campo Grande' },
  MT: { codigo: '5103403', nome: 'Cuiaba' },
  PA: { codigo: '1501402', nome: 'Belem' },
  PB: { codigo: '2507507', nome: 'Joao Pessoa' },
  PE: { codigo: '2611606', nome: 'Recife' },
  PI: { codigo: '2211001', nome: 'Teresina' },
  PR: { codigo: '4106902', nome: 'Curitiba' },
  RJ: { codigo: '3304557', nome: 'Rio de Janeiro' },
  RN: { codigo: '2408102', nome: 'Natal' },
  RO: { codigo: '1100205', nome: 'Porto Velho' },
  RR: { codigo: '1400100', nome: 'Boa Vista' },
  RS: { codigo: '4314902', nome: 'Porto Alegre' },
  SC: { codigo: '4205407', nome: 'Florianopolis' },
  SE: { codigo: '2800308', nome: 'Aracaju' },
  SP: { codigo: '3550308', nome: 'Sao Paulo' },
  TO: { codigo: '1721000', nome: 'Palmas' },
};

function digitsOnly(val) {
  return String(val || '').replace(/\D/g, '');
}

function parseJsonSafe(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
}

function resolverIbgeMunicipio(codigoIbge, nomeMunicipio, uf) {
  const cleanCode = digitsOnly(codigoIbge);
  const ufUpper = String(uf || 'MS').toUpperCase().trim();
  const cap = CAPITAIS_IBGE_FALLBACK[ufUpper] || CAPITAIS_IBGE_FALLBACK.MS;
  return {
    codigo: cleanCode.length === 7 ? cleanCode : cap.codigo,
    nome: (nomeMunicipio && String(nomeMunicipio).trim()) || cap.nome,
    uf: ufUpper.length === 2 ? ufUpper : 'MS',
  };
}

function mapFocusStatusToDb(focusStatus, currentStatus = 'PROCESSANDO') {
  const s = String(focusStatus || '').toLowerCase();
  if (s === 'autorizado') return 'AUTORIZADO';
  if (s === 'cancelado') return 'CANCELADO';
  if (s === 'encerrado') return 'ENCERRADO';
  if (s === 'erro_autorizacao' || s === 'denegado' || s === 'rejeitado') return 'REJEITADO';
  if (s === 'processando_autorizacao') return 'PROCESSANDO';
  return currentStatus;
}

/**
 * Extrai o número do protocolo de autorização SEFAZ a partir do retorno da Focus NFe.
 * Quando consultado com ?completa=1 (AutorizadaCompletoResponse), a Focus NFe retorna
 * `protocolo` como objeto ({ versao, id_tag, protocolo, status, motivo, ... }) em vez de string.
 */
function extrairProtocoloFocus(st) {
  if (!st) return null;
  const p =
    typeof st === 'string' || typeof st === 'number'
      ? st
      : st.protocolo ?? st.protocolo_autorizacao ?? null;
  if (!p) return null;
  if (typeof p === 'object') {
    const val = p.protocolo || p.numero || p.nProt || p.id_tag || '';
    return String(val).replace(/^ID/i, '').trim().slice(0, 60) || null;
  }
  const str = String(p).trim();
  if (str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str);
      const val = parsed?.protocolo || parsed?.numero || parsed?.nProt || parsed?.id_tag || '';
      return String(val).replace(/^ID/i, '').trim().slice(0, 60) || null;
    } catch (_) {
      return null;
    }
  }
  return str.slice(0, 60) || null;
}

function extrairStatusSefazFocus(st) {
  if (!st) return null;
  const s =
    st.status_sefaz ||
    (typeof st.protocolo === 'object' && st.protocolo ? st.protocolo.status : null) ||
    null;
  return s ? String(s).trim().slice(0, 20) : null;
}

function extrairMensagemSefazFocus(st) {
  if (!st) return null;
  const m =
    st.mensagem_sefaz ||
    (typeof st.protocolo === 'object' && st.protocolo ? st.protocolo.motivo : null) ||
    null;
  return m ? String(m).trim().slice(0, 500) : null;
}

class TransporteService {
  static extrairProtocoloFocus(st) {
    return extrairProtocoloFocus(st);
  }
  /**
   * Obtém as credenciais do emitente configurado para o tenant,
   * mesclando automaticamente com dash_integracoes_config (aba Fiscal).
   */
  static async getEmitente(tenantId, emitenteId = null) {
    let emitente = null;
    if (emitenteId) {
      const { rows } = await db.query(
        `SELECT * FROM dash_emitentes WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, emitenteId]
      );
      emitente = rows[0] || null;
    }
    if (!emitente) {
      const { rows } = await db.query(
        `SELECT * FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id ASC LIMIT 1`,
        [tenantId]
      );
      emitente = rows[0] || null;
    }

    let cfg = null;
    try {
      const { rows: cfgRows } = await db.query(
        `SELECT * FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      cfg = cfgRows[0] || null;
    } catch (_) {
      cfg = null;
    }

    if (!emitente && !cfg) {
      throw new Error(
        'Nenhuma transportadora/emitente fiscal configurada. Acesse Configurações > Fiscal ou Dados da Empresa.'
      );
    }

    const ambiente = (
      emitente?.focus_ambiente ||
      cfg?.focus_ambiente ||
      'homologacao'
    ).toLowerCase() === 'producao'
      ? 'producao'
      : 'homologacao';

    const emitTok = decryptSecret(emitente?.focus_token || '');
    const emitTokHomolog = decryptSecret(emitente?.focus_token_homologacao || '');
    const emitTokProd = decryptSecret(emitente?.focus_token_producao || '');
    const cfgTokHomolog = decryptSecret(cfg?.focus_token_homologacao || '');
    const cfgTokProd = decryptSecret(cfg?.focus_token_producao || '');

    const tokenHomologacao =
      emitTokHomolog ||
      cfgTokHomolog ||
      (emitente?.focus_ambiente !== 'producao' ? emitTok : '') ||
      '';

    const tokenProducao =
      emitTokProd ||
      cfgTokProd ||
      (emitente?.focus_ambiente === 'producao' ? emitTok : '') ||
      '';

    const tokenAtivo =
      ambiente === 'producao'
        ? tokenProducao || (emitente?.focus_ambiente === 'producao' ? emitTok : '') || ''
        : tokenHomologacao || (emitente?.focus_ambiente !== 'producao' ? emitTok : '') || '';

    const ufRaw = (emitente?.uf || cfg?.focus_uf || 'MS').toUpperCase();
    const ibge = resolverIbgeMunicipio(
      emitente?.codigo_municipio || cfg?.focus_codigo_municipio,
      emitente?.municipio || cfg?.focus_municipio || cfg?.empresa_regiao,
      ufRaw
    );

    return {
      ...(emitente || {}),
      id: emitente?.id || null,
      cnpj: digitsOnly(emitente?.cnpj || cfg?.empresa_cnpj || ''),
      razao_social:
        emitente?.razao_social || cfg?.empresa_razao_social || cfg?.empresa_nome || 'EMPRESA EMITENTE',
      nome_fantasia:
        emitente?.nome_fantasia || cfg?.empresa_nome || emitente?.razao_social || 'EMPRESA EMITENTE',
      inscricao_estadual:
        emitente?.inscricao_estadual || cfg?.focus_inscricao_estadual || cfg?.empresa_ie || '',
      rntrc: emitente?.rntrc || cfg?.focus_rntrc || '',
      regime_tributario:
        emitente?.regime_tributario || cfg?.focus_regime_tributario || '1',
      logradouro:
        emitente?.logradouro || cfg?.focus_logradouro || cfg?.empresa_endereco || 'RUA PRINCIPAL',
      numero: emitente?.numero || cfg?.focus_numero || cfg?.empresa_numero || 'SN',
      complemento: emitente?.complemento || cfg?.focus_complemento || cfg?.empresa_complemento || '',
      bairro: emitente?.bairro || cfg?.focus_bairro || cfg?.empresa_bairro || 'CENTRO',
      cep: digitsOnly(emitente?.cep || cfg?.focus_cep || cfg?.empresa_cep || '79004000') || '79004000',
      codigo_municipio: ibge.codigo,
      municipio: ibge.nome,
      uf: ibge.uf,
      telefone: digitsOnly(emitente?.telefone || cfg?.empresa_fone1 || ''),
      email: emitente?.email || cfg?.empresa_email || '',
      focus_ambiente: ambiente,
      focus_token: tokenAtivo,
      focus_token_homologacao: tokenHomologacao,
      focus_token_producao: tokenProducao,
      serie_cte: emitente?.serie_cte || cfg?.focus_serie_cte || '1',
      serie_mdfe: emitente?.serie_mdfe || cfg?.focus_serie_mdfe || '1',
      cfop_padrao_cte: emitente?.cfop_padrao_cte || cfg?.focus_cfop_padrao || '5353',
      natureza_padrao_cte:
        emitente?.natureza_padrao_cte ||
        cfg?.focus_natureza_padrao ||
        'PRESTACAO DE SERVICO DE TRANSPORTE',
      aliquota_icms_padrao:
        emitente?.aliquota_icms_padrao ?? cfg?.focus_aliquota_icms_padrao ?? 12.0,
    };
  }

  /**
   * Retorna a instância do FocusClient configurada para a transportadora e o ambiente ativo.
   */
  static async getFocusClient(tenantId, emitenteId = null, overrideOpts = null) {
    const emitente = await this.getEmitente(tenantId, emitenteId);
    const cleanOverride = (v) => (v && !isMaskedValue(v) ? decryptSecret(v) : '');
    const client = new FocusClient({
      token: cleanOverride(overrideOpts?.token) || emitente.focus_token,
      tokenHomologacao: cleanOverride(overrideOpts?.tokenHomologacao) || emitente.focus_token_homologacao,
      tokenProducao: cleanOverride(overrideOpts?.tokenProducao) || emitente.focus_token_producao,
      ambiente: overrideOpts?.ambiente || emitente.focus_ambiente || 'homologacao',
    });
    return {
      client,
      focus: client,
      emitente,
    };
  }

  /**
   * Obtém o certificado digital A1 decifrado do emitente (quando armazenado no cofre local).
   */
  static async getCertificadoEmitente(tenantId, emitenteId) {
    const { rows } = await db.query(
      `SELECT id, emitente_id, nome_arquivo, arquivo_pfx, senha, valido_de, valido_ate, status
       FROM dash_certificados
       WHERE tenant_id = $1 AND emitente_id = $2 AND status = 'ATIVO'
       LIMIT 1`,
      [tenantId, emitenteId]
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      arquivo_pfx: decryptBuffer(rows[0].arquivo_pfx),
      senha: decryptSecret(rows[0].senha),
    };
  }

  /**
   * Testa a conexão com a API Focus NFe no ambiente informado ou configurado.
   */
  static async testarConexaoFocus(
    tenantId,
    { ambiente, tokenHomologacao, tokenProducao, token, emitenteId } = {}
  ) {
    let emitente = {};
    try {
      emitente = await this.getEmitente(tenantId, emitenteId);
    } catch (_) {
      emitente = {};
    }

    const cleanOverride = (v) => (v && !isMaskedValue(v) ? decryptSecret(v) : '');
    const focus = new FocusClient({
      token: cleanOverride(token) || emitente.focus_token,
      tokenHomologacao: cleanOverride(tokenHomologacao) || emitente.focus_token_homologacao,
      tokenProducao: cleanOverride(tokenProducao) || emitente.focus_token_producao,
      ambiente: ambiente || emitente.focus_ambiente || 'homologacao',
    });

    return focus.testarConexao();
  }

  /**
   * Gera uma referência única e segura para o documento.
   */
  static gerarRef(tipo, tenantId, idInterno) {
    const shortTenant = String(tenantId).replace(/\D/g, '').substring(0, 6) || '000000';
    return `${tipo}_${shortTenant}_${idInterno}_${Date.now().toString().slice(-6)}`;
  }

  /**
   * Resolve um participante (Remetente, Destinatário, Expedidor, Recebedor, Tomador)
   * combinando:
   *  1. Dados explícitos informados no CT-e (*_dados JSONB)
   *  2. Dados extraídos da NF-e vinculada (dash_cargas.dados_nfe / colunas remetente_*, destinatario_*)
   *  3. Cadastro em dash_partes pelo CNPJ/CPF
   *  4. Fallback seguro do emitente para campos obrigatórios de endereço
   */
  static async _resolverParticipante(tenantId, { dadosExplicitos, cargaNfe, papel, emitente }) {
    const exp = parseJsonSafe(dadosExplicitos, {}) || {};
    const nfeDados = parseJsonSafe(cargaNfe?.dados_nfe, {}) || {};
    const nfePart =
      papel === 'remetente'
        ? nfeDados.remetente || nfeDados.emitente || {}
        : papel === 'destinatario'
        ? nfeDados.destinatario || {}
        : {};

    const docFromCarga =
      papel === 'remetente'
        ? cargaNfe?.remetente_documento
        : papel === 'destinatario'
        ? cargaNfe?.destinatario_documento
        : '';

    const doc = digitsOnly(
      exp.documento ||
        exp.cnpj ||
        exp.cpf ||
        nfePart.cnpj ||
        nfePart.cpf ||
        nfePart.documento ||
        docFromCarga ||
        ''
    );

    let cadastroParte = null;
    if (doc) {
      try {
        const { rows } = await db.query(
          `SELECT * FROM dash_partes
           WHERE tenant_id = $1 AND regexp_replace(COALESCE(documento,''), '\\D', '', 'g') = $2
           LIMIT 1`,
          [tenantId, doc]
        );
        cadastroParte = rows[0] || null;
      } catch (_) {
        cadastroParte = null;
      }
    }

    const uf = (
      exp.uf ||
      nfePart.uf ||
      (papel === 'remetente' ? cargaNfe?.remetente_uf : cargaNfe?.destinatario_uf) ||
      cadastroParte?.uf ||
      emitente?.uf ||
      'MS'
    ).toUpperCase();

    const municipioRaw =
      exp.municipio ||
      nfePart.municipio ||
      nfePart.xMun ||
      (papel === 'remetente' ? cargaNfe?.remetente_municipio : cargaNfe?.destinatario_municipio) ||
      cadastroParte?.municipio ||
      emitente?.municipio ||
      '';

    const codigoMunicipioRaw =
      exp.codigo_municipio ||
      nfePart.codigo_municipio ||
      nfePart.cMun ||
      cadastroParte?.codigo_municipio ||
      (uf === emitente?.uf ? emitente?.codigo_municipio : '');

    const ibge = resolverIbgeMunicipio(codigoMunicipioRaw, municipioRaw, uf);

    const nome =
      exp.razao_social ||
      exp.nome ||
      nfePart.razao_social ||
      nfePart.nome ||
      nfePart.xNome ||
      (papel === 'remetente' ? cargaNfe?.remetente_nome : cargaNfe?.destinatario_nome) ||
      cadastroParte?.razao_social ||
      emitente?.razao_social ||
      'PARTICIPANTE NAO INFORMADO';

    const expIe = String(exp.inscricao_estadual ?? exp.ie ?? '').trim();
    const expIeValida = expIe && expIe.toUpperCase() !== 'ISENTO' ? expIe : '';
    const nfeIe = String(nfePart.inscricao_estadual ?? nfePart.ie ?? '').trim();
    const cadIe = String(cadastroParte?.inscricao_estadual ?? '').trim();
    const emitIe =
      doc && doc === digitsOnly(emitente?.cnpj)
        ? String(emitente?.inscricao_estadual || '').trim()
        : '';

    const isCpfDoc = doc.length === 11;
    let ieRaw = expIeValida || nfeIe || cadIe || emitIe || expIe || '';
    if (isCpfDoc && ieRaw.toUpperCase() === 'ISENTO') {
      ieRaw = '';
    }

    const ieDigits = digitsOnly(ieRaw);
    const resolvedIndicadorIe =
      exp.indicador_inscricao_estadual ||
      exp.indicador_ie ||
      cadastroParte?.indicador_ie ||
      (ieDigits.length >= 7 && !isCpfDoc
        ? '1'
        : isCpfDoc
        ? ieDigits.length >= 7
          ? '1'
          : '9'
        : ieRaw.toUpperCase() === 'ISENTO'
        ? '2'
        : '9');

    return {
      documento: doc || digitsOnly(emitente?.cnpj || ''),
      razao_social: String(nome).trim(),
      nome_fantasia: String(
        exp.nome_fantasia || nfePart.nome_fantasia || cadastroParte?.nome_fantasia || nome
      ).trim(),
      inscricao_estadual: ieRaw,
      indicador_ie: resolvedIndicadorIe,
      logradouro: String(
        exp.logradouro ||
          nfePart.logradouro ||
          nfePart.xLgr ||
          cadastroParte?.logradouro ||
          emitente?.logradouro ||
          'RUA PRINCIPAL'
      ).trim(),
      numero: String(
        exp.numero ||
          nfePart.numero ||
          nfePart.nro ||
          cadastroParte?.numero ||
          emitente?.numero ||
          'SN'
      ).trim(),
      complemento: String(
        exp.complemento || nfePart.complemento || nfePart.xCpl || cadastroParte?.complemento || ''
      ).trim(),
      bairro: String(
        exp.bairro ||
          nfePart.bairro ||
          nfePart.xBairro ||
          cadastroParte?.bairro ||
          emitente?.bairro ||
          'CENTRO'
      ).trim(),
      cep:
        digitsOnly(
          exp.cep || nfePart.cep || nfePart.CEP || cadastroParte?.cep || emitente?.cep || '79004000'
        ) || '79004000',
      codigo_municipio: ibge.codigo,
      municipio: ibge.nome,
      uf: ibge.uf,
      telefone: digitsOnly(exp.telefone || nfePart.telefone || cadastroParte?.telefone || ''),
      email: String(exp.email || nfePart.email || cadastroParte?.email || '').trim(),
      suframa: String(exp.suframa || '').trim(),
    };
  }

  /**
   * Formata participante para as chaves esperadas pela Focus NFe v2:
   * sufixo: 'remetente' | 'destinatario' | 'expedidor' | 'recebedor' | 'tomador'
   */
  static _mapearParticipanteFocus(part, sufixo, ambiente = 'homologacao', fallbackFone = '') {
    const doc = digitsOnly(part.documento);
    const isCpf = doc.length === 11;
    const isHomolog = ambiente !== 'producao';
    const nomeFinal = isHomolog
      ? 'CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : String(part.razao_social || 'PARTICIPANTE').slice(0, 60);

    const out = {};
    if (isCpf) {
      out[`cpf_${sufixo}`] = doc;
    } else {
      out[`cnpj_${sufixo}`] = doc;
    }

    if (!isCpf && part.inscricao_estadual && part.inscricao_estadual.toUpperCase() !== 'ISENTO') {
      out[`inscricao_estadual_${sufixo}`] = digitsOnly(part.inscricao_estadual);
    } else if (!isCpf && part.inscricao_estadual && part.inscricao_estadual.toUpperCase() === 'ISENTO') {
      out[`inscricao_estadual_${sufixo}`] = 'ISENTO';
    }

    out[`nome_${sufixo}`] = nomeFinal;
    if (sufixo === 'remetente' || sufixo === 'tomador') {
      out[`nome_fantasia_${sufixo}`] = isHomolog
        ? nomeFinal
        : String(part.nome_fantasia || part.razao_social || nomeFinal).slice(0, 60);
    }
    out[`logradouro_${sufixo}`] = String(part.logradouro || 'RUA PRINCIPAL').slice(0, 60);
    out[`numero_${sufixo}`] = String(part.numero || 'SN').slice(0, 60);
    if (part.complemento) {
      out[`complemento_${sufixo}`] = String(part.complemento).slice(0, 60);
    }
    out[`bairro_${sufixo}`] = String(part.bairro || 'CENTRO').slice(0, 60);
    out[`codigo_municipio_${sufixo}`] = String(part.codigo_municipio || '');
    out[`municipio_${sufixo}`] = String(part.municipio || '');
    out[`cep_${sufixo}`] = digitsOnly(part.cep) || '79004000';
    out[`uf_${sufixo}`] = String(part.uf || 'MS').toUpperCase();
    out[`codigo_pais_${sufixo}`] = '1058';
    out[`pais_${sufixo}`] = 'BRASIL';

    const foneFinal = digitsOnly(part.telefone || fallbackFone || '');
    if (foneFinal.length >= 6) {
      out[`telefone_${sufixo}`] = foneFinal.slice(0, 14);
    }
    if (part.email && String(part.email).includes('@')) {
      out[`email_${sufixo}`] = String(part.email).trim().slice(0, 60);
    }
    if (sufixo === 'destinatario' && part.suframa) {
      out.inscricao_suframa_destinatario = digitsOnly(part.suframa).slice(0, 9);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // CT-e (Modelo 57 - /v2/cte) e CT-e OS (Modelo 67 - /v2/cteos)
  // ─────────────────────────────────────────────────────────

  /**
   * Emite um CT-e (Modelo 57) ou CT-e OS (Modelo 67) na Focus NFe v2.
   */
  static async emitirCte(tenantId, cteId, opts = {}) {
    const idKey = Number(cteId);
    if (inFlightCteEmissoes.has(idKey)) {
      return inFlightCteEmissoes.get(idKey);
    }

    const promise = runTenantSequential(tenantId, () =>
      this._executarEmissaoCte(tenantId, cteId, opts)
    );
    inFlightCteEmissoes.set(idKey, promise);
    try {
      return await promise;
    } finally {
      inFlightCteEmissoes.delete(idKey);
    }
  }

  static async _executarEmissaoCte(tenantId, cteId, opts = {}) {
    const { rows } = await db.query(
      `SELECT c.* FROM dash_ctes c WHERE c.id = $1 AND c.tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) {
      throw new Error('CT-e não encontrado.');
    }

    const cte = rows[0];
    const { client, emitente } = await this.getFocusClient(tenantId, cte.emitente_id);

    // Se já estava em PROCESSANDO com ref existente, verifica primeiro se a Focus NFe já autorizou
    if (cte.status === 'PROCESSANDO' && cte.ref && !opts.forcarNovaEmissao) {
      try {
        const isCteOsCheck =
          String(cte.modelo) === '67' || String(cte.modelo_cte || '').toLowerCase() === 'cteos';
        const stCheck = isCteOsCheck
          ? await client.consultarCteOs(cte.ref, true)
          : await client.consultarCte(cte.ref, true);
        if (stCheck && mapFocusStatusToDb(stCheck.status, 'PROCESSANDO') === 'AUTORIZADO') {
          return await this._persistirRetornoFocusCte(cteId, cte.ref, stCheck, client.ambiente);
        }
      } catch (_) {
        // segue para emissão limpa com nova ref e numeração sequencial
      }
    }

    // Busca as NF-e vinculadas a este CT-e
    const { rows: cargas } = await db.query(
      `SELECT cg.*, cc.chave_nfe, cc.valor_nfe, cc.peso_nfe
       FROM dash_cte_cargas cc
       LEFT JOIN dash_cargas cg ON cg.id = cc.carga_id
       WHERE cc.cte_id = $1 AND cc.tenant_id = $2`,
      [cteId, tenantId]
    );

    const docsManuais = parseJsonSafe(cte.documentos_json, []);
    const primeiraCarga = cargas[0] || null;

    // Resolver Remetente e Destinatário
    const remetente = await this._resolverParticipante(tenantId, {
      dadosExplicitos: cte.remetente_dados,
      cargaNfe: primeiraCarga,
      papel: 'remetente',
      emitente,
    });

    const destinatario = await this._resolverParticipante(tenantId, {
      dadosExplicitos: cte.destinatario_dados,
      cargaNfe: primeiraCarga,
      papel: 'destinatario',
      emitente,
    });

    const ibgeInicio = resolverIbgeMunicipio(
      cte.codigo_municipio_inicio || remetente.codigo_municipio || emitente.codigo_municipio,
      cte.municipio_inicio || remetente.municipio || emitente.municipio,
      cte.uf_inicio || remetente.uf || emitente.uf
    );

    const ibgeFim = resolverIbgeMunicipio(
      cte.codigo_municipio_fim || destinatario.codigo_municipio || emitente.codigo_municipio,
      cte.municipio_fim || destinatario.municipio || emitente.municipio,
      cte.uf_fim || destinatario.uf || emitente.uf
    );

    const ibgeEnvio = resolverIbgeMunicipio(
      cte.codigo_municipio_envio || emitente.codigo_municipio,
      cte.municipio_envio || emitente.municipio,
      cte.uf_envio || emitente.uf
    );

    // Mapear Tomador (0=Remetente, 1=Expedidor, 2=Recebedor, 3=Destinatário, 4=Outros)
    const tomadorMap = {
      remetente: '0',
      expedidor: '1',
      recebedor: '2',
      destinatario: '3',
      outros: '4',
      '0': '0',
      '1': '1',
      '2': '2',
      '3': '3',
      '4': '4',
    };
    const codigoTomador =
      tomadorMap[String(cte.tomador ?? cte.tomador_tipo ?? '0').toLowerCase()] || '0';

    // Mapear Finalidade CT-e (0=Normal, 1=Complemento, 2=Anulação, 3=Substituto)
    const finalidadeMap = {
      normal: '0',
      complemento: '1',
      complementar: '1',
      anulacao: '2',
      substituicao: '3',
      substituto: '3',
      '0': '0',
      '1': '0', // Wizard legado usava '1' como Normal quando modelo_cte='normal'
      '2': '2',
      '3': '3',
    };
    const finalidadeCte =
      String(cte.finalidade) === '1' && (!cte.chave_cte_referenciado || cte.modelo_cte === 'normal')
        ? '0'
        : finalidadeMap[String(cte.finalidade || '0').toLowerCase()] || '0';

    // Mapear Tipo deDocumento / Modelo CT-e (0=Normal, 1=Complementar, 2=Anulação, 3=Substituto)
    const tipoServicoMap = {
      normal: '0',
      subcontratacao: '1',
      redespacho: '2',
      redespacho_intermediario: '3',
      multimodal: '4',
      transporte_pessoas: '6',
      transporte_valores: '7',
      excesso_bagagem: '8',
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '6': '6', '7': '7', '8': '8',
    };
    const tipoServico = tipoServicoMap[String(cte.tipo_servico || '0').toLowerCase()] || '0';

    // Modal (01=Rodoviário, 02=Aéreo, 03=Aquaviário, 04=Ferroviário, 05=Dutoviário, 06=Multimodal)
    const modalMap = {
      rodoviario: '01',
      aereo: '02',
      aquaviario: '03',
      ferroviario: '04',
      dutoviario: '05',
      multimodal: '06',
      '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
      '1': '01', '2': '02', '3': '03', '4': '04', '5': '05', '6': '06',
    };
    const modalCodigo = modalMap[String(cte.modal || '01').toLowerCase()] || '01';

    // Componentes do frete
    const compRaw = parseJsonSafe(cte.componentes_valor, []);
    const baseCalculo = parseFloat(cte.valor_total || 0);
    const componentesFrete =
      Array.isArray(compRaw) && compRaw.filter((c) => Number(c?.valor || 0) > 0).length > 0
        ? compRaw
            .filter((c) => Number(c?.valor || 0) > 0)
            .map((c) => ({
              nome: String(c.nome || c.descricao || 'FRETE VALOR').slice(0, 15),
              valor: parseFloat(c.valor || 0).toFixed(2),
            }))
        : [{ nome: 'FRETE VALOR', valor: baseCalculo.toFixed(2) }];

    // Busca a regra fiscal parametrizada para a rota (UF Origem x UF Destino > Por UF > Global)
    const { rows: regraRows } = await db.query(
      `SELECT * FROM dash_regras_fiscais
       WHERE tenant_id = $1 AND ativo = true
         AND (escopo = 'GLOBAL'
           OR (escopo = 'UF' AND (uf_origem IS NULL OR uf_origem = '' OR uf_origem = $2))
           OR (escopo = 'UF_PAR' AND uf_origem = $2 AND uf_destino = $3))
       ORDER BY CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END, id DESC
       LIMIT 1`,
      [tenantId, ibgeInicio.uf, ibgeFim.uf]
    );
    const regraFiscal = regraRows[0] || null;

    // Tributos ICMS + DIFAL + Reforma Tributária (IBS/CBS)
    const cstRaw = String(
      cte.icms_situacao_tributaria || regraFiscal?.situacao_tributaria || '00'
    ).toUpperCase();
    const isSimples =
      cstRaw === 'SN' ||
      cstRaw.includes('SIMPLES') ||
      (String(emitente.regime_tributario) === '1' && cstRaw === 'SN');

    const isInternoMsComDefaultAntigo =
      ibgeInicio.uf === 'MS' &&
      ibgeFim.uf === 'MS' &&
      (cte.aliquota_icms == null || Number(cte.aliquota_icms) === 12) &&
      Number(regraFiscal?.aliquota_icms || 17) === 17;

    const aliquotaIcms = parseFloat(
      isInternoMsComDefaultAntigo
        ? regraFiscal?.aliquota_icms ?? 17
        : cte.aliquota_icms ?? regraFiscal?.aliquota_icms ?? emitente.aliquota_icms_padrao ?? (ibgeInicio.uf === 'MS' && ibgeFim.uf === 'MS' ? 17 : 12)
    );
    const valorIcms = parseFloat(
      isInternoMsComDefaultAntigo
        ? (baseCalculo * aliquotaIcms) / 100
        : cte.valor_icms || (baseCalculo * aliquotaIcms) / 100
    );

    const icmsFields = isSimples
      ? {
          icms_situacao_tributaria: '90',
          icms_indicador_simples_nacional: '1',
        }
      : {
          icms_situacao_tributaria: ['00', '20', '40', '41', '51', '60', '90'].includes(
            cstRaw.slice(0, 2)
          )
            ? cstRaw.slice(0, 2)
            : '00',
          icms_base_calculo: parseFloat(cte.base_icms || baseCalculo).toFixed(2),
          icms_aliquota: aliquotaIcms.toFixed(2),
          icms_valor: valorIcms.toFixed(2),
        };

    // DIFAL somente quando interestadual e tomador não contribuinte (ou explicitamente informado com FCP > 0)
    if (
      ibgeInicio.uf !== ibgeFim.uf &&
      Number(cte.aliquota_fcp || 0) > 0
    ) {
      icmsFields.icms_base_calculo_uf_fim = baseCalculo.toFixed(2);
      icmsFields.icms_percentual_fcp_uf_fim = parseFloat(cte.aliquota_fcp || 0).toFixed(2);
      icmsFields.icms_aliquota_interna_uf_fim = parseFloat(cte.part_fcp_destino || 0).toFixed(2);
      icmsFields.icms_aliquota_interestadual_uf_fim = aliquotaIcms.toFixed(2);
      icmsFields.icms_valor_total_fcp_uf_fim = ((baseCalculo * parseFloat(cte.aliquota_fcp || 0)) / 100).toFixed(2);
      icmsFields.icms_valor_partilha_uf_fim = '0.00';
      icmsFields.icms_valor_partilha_uf_inicio = '0.00';
    }

    const dataEmissaoIso = formatarDataHoraSefaz(emitente.uf || ibgeEnvio.uf);
    const dataEmissaoYmd = dataEmissaoIso.slice(0, 10);

    // Reforma Tributária do Consumo (IBS / CBS — NT 2025.001 / NT 2026.002 / LC 214/2025)
    // Evita Rejeição SEFAZ 310 (IBS / CBS não informado), 360 (vTotDFe obrigatório) e 365 (vTotDFe = vTPrest em 2026)
    const cstIbsCbs = String(
      cte.ibs_cbs_cst || regraFiscal?.ibs_cbs_cst || '000'
    )
      .replace(/\D/g, '')
      .padStart(3, '0')
      .slice(0, 3);
    const classTribDefault =
      cstIbsCbs === '200'
        ? '200002'
        : cstIbsCbs === '410' || cstIbsCbs === '400'
        ? '410001'
        : cstIbsCbs === '510'
        ? '510001'
        : cstIbsCbs === '515'
        ? '515001'
        : '000001';
    const classTribIbsCbs = String(
      cte.ibs_cbs_class_trib ||
        cte.codigo_situacao_fiscal ||
        regraFiscal?.ibs_cbs_class_trib ||
        regraFiscal?.codigo_situacao_fiscal ||
        classTribDefault
    )
      .replace(/\D/g, '')
      .padStart(6, '0')
      .slice(0, 6);

    const aliqIbsUfRaw =
      Number(cte.aliquota_ibs) > 0
        ? Number(cte.aliquota_ibs)
        : Number(regraFiscal?.aliquota_ibs) > 0
        ? Number(regraFiscal.aliquota_ibs)
        : 0.1;
    const aliqIbsMunRaw =
      Number(cte.aliquota_ibs_mun) > 0
        ? Number(cte.aliquota_ibs_mun)
        : Number(regraFiscal?.aliquota_ibs_mun) > 0
        ? Number(regraFiscal.aliquota_ibs_mun)
        : 0.0;
    const aliqCbsRaw =
      Number(cte.aliquota_cbs) > 0
        ? Number(cte.aliquota_cbs)
        : Number(regraFiscal?.aliquota_cbs) > 0
        ? Number(regraFiscal.aliquota_cbs)
        : 0.9;
    const percReducaoIbsCbs =
      Number(cte.reducao_aliquota_ibs_cbs ?? regraFiscal?.reducao_aliquota_ibs_cbs ?? 0) || 0;

    const fatorRedIbsCbs =
      (cstIbsCbs === '200' || cstIbsCbs === '515') && percReducaoIbsCbs > 0
        ? Math.max(0, 1 - percReducaoIbsCbs / 100)
        : 1;
    const aliqEfetIbsUf = aliqIbsUfRaw * fatorRedIbsCbs;
    const aliqEfetIbsMun = aliqIbsMunRaw * fatorRedIbsCbs;
    const aliqEfetCbs = aliqCbsRaw * fatorRedIbsCbs;

    const valorIbsUfCalc = Number(((baseCalculo * aliqEfetIbsUf) / 100).toFixed(2));
    const valorIbsMunCalc = Number(((baseCalculo * aliqEfetIbsMun) / 100).toFixed(2));
    const valorIbsTotalCalc = Number((valorIbsUfCalc + valorIbsMunCalc).toFixed(2));
    const valorCbsCalc = Number(((baseCalculo * aliqEfetCbs) / 100).toFixed(2));

    const anoEmissaoNum = parseInt(dataEmissaoYmd.slice(0, 4), 10) || 2026;
    const valorTotalDfeCalc =
      anoEmissaoNum >= 2027
        ? Number((baseCalculo + valorIbsTotalCalc + valorCbsCalc).toFixed(2))
        : Number(baseCalculo.toFixed(2));

    const ibsCbsFields =
      cstIbsCbs === '410' || cstIbsCbs === '400'
        ? {
            ibs_cbs_situacao_tributaria: cstIbsCbs,
            ibs_cbs_classificacao_tributaria: classTribIbsCbs,
            valor_total_dfe: valorTotalDfeCalc.toFixed(2),
          }
        : {
            ibs_cbs_situacao_tributaria: cstIbsCbs,
            ibs_cbs_classificacao_tributaria: classTribIbsCbs,
            ibs_cbs_base_calculo: baseCalculo.toFixed(2),
            ibs_uf_aliquota: aliqIbsUfRaw.toFixed(2),
            ibs_uf_valor: valorIbsUfCalc.toFixed(2),
            ibs_mun_aliquota: aliqIbsMunRaw.toFixed(2),
            ibs_mun_valor: valorIbsMunCalc.toFixed(2),
            ibs_valor_total: valorIbsTotalCalc.toFixed(2),
            cbs_aliquota: aliqCbsRaw.toFixed(2),
            cbs_valor: valorCbsCalc.toFixed(2),
            valor_total_dfe: valorTotalDfeCalc.toFixed(2),
            ...(cstIbsCbs === '200' || cstIbsCbs === '515'
              ? {
                  ibs_uf_percentual_reducao_aliquota: percReducaoIbsCbs.toFixed(2),
                  ibs_uf_aliquota_efetiva: aliqEfetIbsUf.toFixed(4),
                  ibs_mun_percentual_reducao_aliquota: percReducaoIbsCbs.toFixed(2),
                  ibs_mun_aliquota_efetiva: aliqEfetIbsMun.toFixed(4),
                  cbs_percentual_reducao_aliquota: percReducaoIbsCbs.toFixed(2),
                  cbs_aliquota_efetiva: aliqEfetCbs.toFixed(4),
                }
              : {}),
          };
    const rawDataPrevista = formatarDataYmd(cte.data_prevista_entrega);
    const dataPrevistaLimpa =
      rawDataPrevista && rawDataPrevista < dataEmissaoYmd
        ? dataEmissaoYmd
        : rawDataPrevista;

    // NF-es e Outros Documentos vinculados (tabela dash_cte_cargas + documentos_json do wizard)
    const chavesNfeSet = new Set();
    const outrosDocsList = [];
    for (const c of cargas) {
      const ch = normalizarChaveDfeParaAmbiente(
        c.chave_nfe || c.chave_acesso,
        emitente.focus_ambiente
      );
      if (ch.length === 44) chavesNfeSet.add(ch);
    }
    if (Array.isArray(docsManuais)) {
      for (const d of docsManuais) {
        const tipoDocItem = String(d?.tipo || 'NFE').toUpperCase();
        const ch = normalizarChaveDfeParaAmbiente(
          d?.chave || d?.chave_nfe || d?.chave_acesso,
          emitente.focus_ambiente
        );
        if (tipoDocItem === 'OUTRO' || tipoDocItem === 'DECLARACAO' || tipoDocItem === '00' || tipoDocItem === '99') {
          outrosDocsList.push({
            tipo_documento: tipoDocItem === '99' ? '99' : '00',
            ...(tipoDocItem === '99'
              ? { descricao_documento: String(d?.descricao || 'DECLARACAO DE CONTEUDO').slice(0, 100) }
              : {}),
            numero: String(d?.numero || ch.slice(-9) || '1').slice(0, 20),
          });
        } else if (ch.length === 44) {
          chavesNfeSet.add(ch);
        } else if (emitente.focus_ambiente !== 'producao' && (ch || d?.numero || d?.chave)) {
          outrosDocsList.push({
            tipo_documento: '00',
            numero: String(d?.numero || ch.slice(-9) || '1').slice(0, 20),
          });
        }
      }
    }
    const nfesPayload = Array.from(chavesNfeSet).map((chave_nfe) => ({
      chave_nfe,
      ...(dataPrevistaLimpa ? { data_prevista: dataPrevistaLimpa } : {}),
    }));

    // Quantidades e Peso Bruto (Decimal[11.4] conforme schema Focus NFe v2)
    const pesoCargas =
      parseFloat(cte.peso_bruto || 0) ||
      cargas.reduce((acc, c) => acc + parseFloat(c.peso_nfe || c.peso_bruto || 0), 0) ||
      100;
    const volumesCargas =
      parseFloat(cte.quantidade_volumes || 0) ||
      cargas.reduce((acc, c) => acc + parseFloat(c.volumes || 1), 0) ||
      1;
    const valorCargaFinal =
      parseFloat(cte.valor_carga || 0) ||
      cargas.reduce((acc, c) => acc + parseFloat(c.valor_nfe || c.valor_total || 0), 0) ||
      baseCalculo ||
      100;

    const qtdsCustom = parseJsonSafe(cte.quantidades_carga, []);
    const quantidadesPayload =
      Array.isArray(qtdsCustom) && qtdsCustom.length > 0
        ? qtdsCustom
        : [
            {
              codigo_unidade_medida: cte.unidade_medida || '01',
              tipo_medida: 'PESO BRUTO',
              quantidade: pesoCargas.toFixed(4),
            },
            {
              codigo_unidade_medida: '03',
              tipo_medida: 'VOLUMES',
              quantidade: volumesCargas.toFixed(4),
            },
          ];

    const isCteOs =
      String(cte.modelo) === '67' ||
      String(cte.modelo_cte || '').toLowerCase() === 'cteos' ||
      String(cte.modelo_cte || '') === '67';

    // Em homologação, se o usuário informou o mesmo CNPJ/CPF no Remetente e no Destinatário em CT-e Normal,
    // ajusta automaticamente o Destinatário para CPF de teste válido para evitar Rejeição SEFAZ de CNPJ duplicado.
    if (
      emitente.focus_ambiente !== 'producao' &&
      !isCteOs &&
      cte.modelo_cte !== 'globalizado' &&
      digitsOnly(remetente.documento) === digitsOnly(destinatario.documento)
    ) {
      destinatario.documento = '11144477735';
      destinatario.inscricao_estadual = '';
      destinatario.indicador_ie = '9';
    }

    // Alinha o 1º dígito do CFOP automaticamente com operação estadual (5xxx) vs interestadual (6xxx)
    let cfopFinal = digitsOnly(cte.cfop || emitente.cfop_padrao_cte || '5353') || '5353';
    if (cfopFinal.length === 4) {
      if (ibgeInicio.uf === ibgeFim.uf && cfopFinal.startsWith('6')) {
        cfopFinal = `5${cfopFinal.slice(1)}`;
      } else if (ibgeInicio.uf !== ibgeFim.uf && cfopFinal.startsWith('5')) {
        cfopFinal = `6${cfopFinal.slice(1)}`;
      }
    }

    const outrosDocumentosPayload = outrosDocsList.map((od) => ({
      ...od,
      data_emissao: dataEmissaoYmd,
      valor: valorCargaFinal.toFixed(2),
      ...(dataPrevistaLimpa ? { data_prevista: dataPrevistaLimpa } : {}),
    }));

    // Garantia contra Rejeição SEFAZ 693 (Grupo Documentos Transportados obrigatório para CT-e Normal):
    // se em homologação nenhum documento de 44 dígitos ou declaração ficou preenchido, gera Declaração padrão (tpDoc=00).
    if (
      !isCteOs &&
      !['3', '4'].includes(tipoServico) &&
      nfesPayload.length === 0 &&
      outrosDocumentosPayload.length === 0 &&
      emitente.focus_ambiente !== 'producao'
    ) {
      outrosDocumentosPayload.push({
        tipo_documento: '00',
        numero: String(cte.numero || cte.id || '1').slice(0, 20),
        data_emissao: dataEmissaoYmd,
        valor: valorCargaFinal.toFixed(2),
        ...(dataPrevistaLimpa ? { data_prevista: dataPrevistaLimpa } : {}),
      });
    }

    const foneEmitenteFallback = digitsOnly(emitente.telefone) || '6734164605';
    const retiraFlag = cte.retirar_mercadoria === true || cte.retirar_mercadoria === '0' ? '0' : '1';
    const serieEnvio = Number(cte.serie || emitente.serie_cte || 1) || 1;

    // Aloca numeração sequencial única para evitar colisão de (série, número) na Focus NFe / SEFAZ
    const { rows: maxNumRows } = await db.query(
      `SELECT COALESCE(MAX(numero), 0)::int AS max_num FROM dash_ctes WHERE tenant_id = $1 AND id <> $2`,
      [tenantId, cteId]
    );
    const maxNumExistente = Number(maxNumRows[0]?.max_num || 0);
    const precisaNovoNumeroHomolog =
      emitente.focus_ambiente !== 'producao' &&
      (cte.status === 'REJEITADO' ||
        cte.status === 'PROCESSANDO' ||
        !cte.numero ||
        Number(cte.numero) <= 2 ||
        Boolean(opts.forcarNovaEmissao));
    let numeroEnvio = precisaNovoNumeroHomolog
      ? Math.max(maxNumExistente + 1, Number(cte.id || 1) + 10)
      : Number(cte.numero) > 0
      ? Number(cte.numero)
      : Math.max(maxNumExistente + 1, 1);

    const payload = {
      // Identificação (conforme ConhecimentoTransporteXML da Focus NFe v2)
      cfop: cfopFinal,
      natureza_operacao: (
        cte.natureza_operacao ||
        emitente.natureza_padrao_cte ||
        'PRESTACAO DE SERVICO DE TRANSPORTE'
      ).slice(0, 60),
      data_emissao: dataEmissaoIso,
      tipo_documento: finalidadeCte,
      modal: modalCodigo,
      tipo_servico: isCteOs ? (tipoServico === '0' ? '6' : tipoServico) : tipoServico,
      serie: serieEnvio,
      numero: numeroEnvio,
      ...(cte.modelo_cte === 'globalizado' ? { indicador_globalizado: '1' } : {}),

      // Emitente
      cnpj_emitente: digitsOnly(emitente.cnpj),
      inscricao_estadual_emitente: digitsOnly(emitente.inscricao_estadual),
      nome_emitente: String(emitente.razao_social || '').slice(0, 60),
      nome_fantasia_emitente: String(emitente.nome_fantasia || emitente.razao_social || '').slice(0, 60),
      logradouro_emitente: String(emitente.logradouro || 'RUA PRINCIPAL').slice(0, 60),
      numero_emitente: String(emitente.numero || 'SN').slice(0, 60),
      ...(emitente.complemento ? { complemento_emitente: String(emitente.complemento).slice(0, 60) } : {}),
      bairro_emitente: String(emitente.bairro || 'CENTRO').slice(0, 60),
      codigo_municipio_emitente: emitente.codigo_municipio,
      municipio_emitente: emitente.municipio,
      cep_emitente: digitsOnly(emitente.cep) || '79004000',
      uf_emitente: emitente.uf,
      telefone_emitente: foneEmitenteFallback,
      regime_tributario_emitente: String(emitente.regime_tributario || '3'),

      // Percurso
      uf_envio: ibgeEnvio.uf,
      codigo_municipio_envio: ibgeEnvio.codigo,
      municipio_envio: ibgeEnvio.nome,
      codigo_municipio_inicio: ibgeInicio.codigo,
      municipio_inicio: ibgeInicio.nome,
      uf_inicio: ibgeInicio.uf,
      codigo_municipio_fim: ibgeFim.codigo,
      municipio_fim: ibgeFim.nome,
      uf_fim: ibgeFim.uf,

      // Retirada (0 = Sim, 1 = Não)
      retirar_mercadoria: retiraFlag,
      ...(retiraFlag === '0' && cte.retirada_descricao
        ? { detalhes_retirar: String(cte.retirada_descricao).slice(0, 160) }
        : {}),

      // Participantes (CT-e Modelo 57)
      ...(!isCteOs
        ? {
            tomador: codigoTomador,
            indicador_inscricao_estadual_tomador:
              codigoTomador === '0' ? remetente.indicador_ie || '1' : destinatario.indicador_ie || '9',
            ...this._mapearParticipanteFocus(
              remetente,
              'remetente',
              emitente.focus_ambiente,
              foneEmitenteFallback
            ),
            ...this._mapearParticipanteFocus(
              destinatario,
              'destinatario',
              emitente.focus_ambiente,
              foneEmitenteFallback
            ),
          }
        : {
            // CT-e OS (Modelo 67)
            ...this._mapearParticipanteFocus(
              destinatario,
              'tomador',
              emitente.focus_ambiente,
              foneEmitenteFallback
            ),
            indicador_inscricao_estadual_tomador: destinatario.indicador_ie || '9',
          }),

      // Valores e Componentes
      valor_total: baseCalculo.toFixed(2),
      valor_receber: parseFloat(cte.valor_receber || cte.valor_total || 0).toFixed(2),
      componentes_valor: componentesFrete,

      // Tributos ICMS + Reforma Tributária (IBS / CBS + vTotDFe)
      ...icmsFields,
      ...ibsCbsFields,

      // Carga e Modal
      ...(!isCteOs
        ? {
            valor_total_carga: valorCargaFinal.toFixed(2),
            produto_predominante: String(cte.produto_predominante || 'MERCADORIA EM GERAL').slice(0, 60),
            ...(cte.outras_caracteristicas_carga
              ? { outras_caracteristicas_carga: String(cte.outras_caracteristicas_carga).slice(0, 40) }
              : {}),
            quantidades: quantidadesPayload,
            ...(nfesPayload.length > 0
              ? { nfes: nfesPayload }
              : outrosDocumentosPayload.length > 0
              ? { outros_documentos: outrosDocumentosPayload }
              : {}),
            modal_rodoviario: {
              rntrc: normalizarRntrc8(cte.rntrc || emitente.rntrc),
            },
          }
        : {
            descricao_servico:
              cte.produto_predominante || 'TRANSPORTE FRETAMENTO / OUTROS SERVICOS',
            quantidade_passageiros_volumes: volumesCargas,
            modal_rodoviario: parseJsonSafe(cte.modal_os_dados, {
              taf: digitsOnly(emitente.rntrc || ''),
            }),
          }),

      // Observações gerais (campo oficial Focus NFe: observacao)
      ...(cte.observacoes ? { observacao: String(cte.observacoes).slice(0, 2000) } : {}),
    };

    // Expedidor (se informado ou se tomador == '1')
    const expRaw = parseJsonSafe(cte.expedidor_dados, {});
    if ((codigoTomador === '1' || expRaw?.documento || expRaw?.cnpj) && !isCteOs) {
      const expedidor = await this._resolverParticipante(tenantId, {
        dadosExplicitos: expRaw,
        cargaNfe: primeiraCarga,
        papel: 'expedidor',
        emitente,
      });
      Object.assign(
        payload,
        this._mapearParticipanteFocus(expedidor, 'expedidor', emitente.focus_ambiente, foneEmitenteFallback)
      );
      if (codigoTomador === '1') {
        payload.indicador_inscricao_estadual_tomador = expedidor.indicador_ie || '9';
      }
    }

    // Recebedor (se informado ou se tomador == '2')
    const recRaw = parseJsonSafe(cte.recebedor_dados, {});
    if ((codigoTomador === '2' || recRaw?.documento || recRaw?.cnpj) && !isCteOs) {
      const recebedor = await this._resolverParticipante(tenantId, {
        dadosExplicitos: recRaw,
        cargaNfe: primeiraCarga,
        papel: 'recebedor',
        emitente,
      });
      Object.assign(
        payload,
        this._mapearParticipanteFocus(recebedor, 'recebedor', emitente.focus_ambiente, foneEmitenteFallback)
      );
      if (codigoTomador === '2') {
        payload.indicador_inscricao_estadual_tomador = recebedor.indicador_ie || '9';
      }
    }

    // Tomador = 4 (Outros)
    if (codigoTomador === '4' && !isCteOs) {
      const tomRaw = parseJsonSafe(cte.tomador_dados, {
        documento: cte.tomador_documento,
      });
      const tomadorOutros = await this._resolverParticipante(tenantId, {
        dadosExplicitos: tomRaw,
        cargaNfe: primeiraCarga,
        papel: 'tomador',
        emitente,
      });
      Object.assign(
        payload,
        this._mapearParticipanteFocus(tomadorOutros, 'tomador', emitente.focus_ambiente, foneEmitenteFallback)
      );
      payload.indicador_inscricao_estadual_tomador = tomadorOutros.indicador_ie || '9';
    }

    // Chave de CT-e referenciado (Complementar ou Substituição)
    if (cte.chave_cte_referenciado && digitsOnly(cte.chave_cte_referenciado).length === 44) {
      if (finalidadeCte === '1') {
        payload.chave_cte_complementado = digitsOnly(cte.chave_cte_referenciado);
      } else if (finalidadeCte === '3') {
        payload.chave_cte_original_sub = digitsOnly(cte.chave_cte_referenciado);
      }
    }

    // Em homologação, se o documento estava REJEITADO ou preso em PROCESSANDO, gera uma nova ref limpa para garantir
    // que a Focus NFe monte um novo XML 4.00 completo (com <IBSCBS>, <vTotDFe>, alíquota SEFAZ/MS e número sequencial único).
    let ref =
      (emitente.focus_ambiente !== 'producao' &&
        (cte.status === 'REJEITADO' || cte.status === 'PROCESSANDO' || Boolean(opts.forcarNovaEmissao))) ||
      !cte.ref
        ? this.gerarRef('CTE', tenantId, cte.id)
        : cte.ref;

    // Salva o payload enviado, campos fiscais ICMS + IBS/CBS calculados, numeração e marca como PROCESSANDO
    await db.query(
      `UPDATE dash_ctes SET
          ref = $1,
          payload_focus = $2,
          ibs_cbs_cst = $4,
          ibs_cbs_class_trib = $5,
          aliquota_ibs = $6,
          aliquota_ibs_mun = $7,
          aliquota_cbs = $8,
          valor_ibs = $9,
          valor_cbs = $10,
          valor_total_dfe = $11,
          aliquota_icms = $12,
          valor_icms = $13,
          serie = $14,
          numero = $15,
          status = 'PROCESSANDO',
          updated_at = NOW()
       WHERE id = $3`,
      [
        ref,
        JSON.stringify(payload),
        cteId,
        cstIbsCbs,
        classTribIbsCbs,
        aliqIbsUfRaw,
        aliqIbsMunRaw,
        aliqCbsRaw,
        valorIbsTotalCalc,
        valorCbsCalc,
        valorTotalDfeCalc,
        aliquotaIcms,
        valorIcms,
        String(serieEnvio),
        numeroEnvio,
      ]
    );

    const aguardarRetornoCte = async (refConsulta) => {
      let ultimo = null;
      for (let tentativa = 0; tentativa < 10; tentativa++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const st = isCteOs
            ? await client.consultarCteOs(refConsulta, true)
            : await client.consultarCte(refConsulta, true);
          ultimo = st;
          if (st && st.status && st.status !== 'processando_autorizacao') {
            return st;
          }
        } catch (_) {
          // ignora falha transitória de polling
        }
      }
      return ultimo;
    };

    const enviarParaFocusComRetryRef = async (payloadEnvio, sufixoNovaRef = '', forcarNovaRef = false) => {
      if (forcarNovaRef) {
        numeroEnvio += 1;
        payloadEnvio.serie = serieEnvio;
        payloadEnvio.numero = numeroEnvio;
        payloadEnvio.data_emissao = formatarDataHoraSefaz(emitente.uf || ibgeEnvio.uf);
        ref = this.gerarRef('CTE', tenantId, `${cte.id}${sufixoNovaRef}`);
        await db.query(
          `UPDATE dash_ctes SET ref = $1, numero = $2, payload_focus = $3, updated_at = NOW() WHERE id = $4`,
          [ref, numeroEnvio, JSON.stringify(payloadEnvio), cteId]
        );
      }
      try {
        return isCteOs
          ? await client.emitirCteOs(ref, payloadEnvio)
          : await client.emitirCte(ref, payloadEnvio);
      } catch (err) {
        if (
          /referencia|referência|ja foi autorizad|já foi autorizad|ja existe|já existe|duplicad|conflito|processando_autorizacao|em processamento|numero/i.test(
            String(err.message || '')
          )
        ) {
          numeroEnvio += 1;
          ref = this.gerarRef('CTE', tenantId, `${cte.id}${sufixoNovaRef || '_N'}`);
          const payloadNovoNumero = {
            ...payloadEnvio,
            serie: serieEnvio,
            numero: numeroEnvio,
            data_emissao: formatarDataHoraSefaz(emitente.uf || ibgeEnvio.uf),
          };
          await db.query(
            `UPDATE dash_ctes SET ref = $1, numero = $2, payload_focus = $3, updated_at = NOW() WHERE id = $4`,
            [ref, numeroEnvio, JSON.stringify(payloadNovoNumero), cteId]
          );
          return isCteOs
            ? await client.emitirCteOs(ref, payloadNovoNumero)
            : await client.emitirCte(ref, payloadNovoNumero);
        }
        throw err;
      }
    };

    const montarPayloadHomologFallback = (basePayload = payload) => {
      const chOriginal = basePayload.nfes?.[0]?.chave_nfe || '';
      const numDocFallback =
        primeiraCarga?.numero ||
        docsManuais?.[0]?.numero ||
        (chOriginal.length === 44 ? String(parseInt(chOriginal.slice(25, 34), 10) || 1) : String(numeroEnvio));
      const fallback = {
        ...basePayload,
        serie: serieEnvio,
        numero: numeroEnvio,
        data_emissao: formatarDataHoraSefaz(emitente.uf || ibgeEnvio.uf),
        outros_documentos: [
          {
            tipo_documento: '00',
            numero: String(numDocFallback).slice(0, 20),
            data_emissao: dataEmissaoYmd,
            valor: valorCargaFinal.toFixed(2),
            ...(dataPrevistaLimpa ? { data_prevista: dataPrevistaLimpa } : {}),
          },
        ],
        observacao: [
          basePayload.observacao,
          chOriginal ? `HOMOLOGACAO SEFAZ - REF NFE: ${chOriginal}` : null,
        ]
          .filter(Boolean)
          .join(' | ')
          .slice(0, 2000),
      };
      delete fallback.nfes;
      return fallback;
    };

    let resFocus;
    let payloadAtual = { ...payload };
    try {
      resFocus = await enviarParaFocusComRetryRef(payloadAtual);
    } catch (emitErr) {
      if (
        client.ambiente === 'homologacao' &&
        !isCteOs &&
        /chave|nfe|infnfe|documentos transportados/i.test(String(emitErr.message || ''))
      ) {
        payloadAtual = montarPayloadHomologFallback(payloadAtual);
        try {
          resFocus = await enviarParaFocusComRetryRef(payloadAtual, '_H', true);
        } catch (fallbackErr) {
          await db
            .query(
              `UPDATE dash_ctes SET status = 'REJEITADO', mensagem_sefaz = $1, updated_at = NOW() WHERE id = $2`,
              [String(fallbackErr.message || 'Erro de validação Focus NFe').slice(0, 500), cteId]
            )
            .catch(() => {});
          throw fallbackErr;
        }
      } else {
        await db
          .query(
            `UPDATE dash_ctes SET status = 'REJEITADO', mensagem_sefaz = $1, updated_at = NOW() WHERE id = $2`,
            [String(emitErr.message || 'Erro de validação Focus NFe').slice(0, 500), cteId]
          )
          .catch(() => {});
        throw emitErr;
      }
    }

    if (resFocus?.status === 'processando_autorizacao') {
      const consultado = await aguardarRetornoCte(ref);
      if (consultado) resFocus = consultado;
    }

    // Em HOMOLOGAÇÃO: trata automaticamente rejeições recuperáveis da SEFAZ (Duplicidade 204/539, NF-e de teste 661/693, vTotDFe 365, vBC IBS/CBS)
    for (let retrySefaz = 1; retrySefaz <= 3; retrySefaz++) {
      if (
        client.ambiente !== 'homologacao' ||
        isCteOs ||
        mapFocusStatusToDb(resFocus?.status, 'PROCESSANDO') !== 'REJEITADO'
      ) {
        break;
      }

      const codSefaz = String(extrairStatusSefazFocus(resFocus) || '').trim();
      const msgSefaz = String(extrairMensagemSefazFocus(resFocus) || '');

      let ajustou = false;

      // 1. Duplicidade de CT-e (204 / 539): avança numeração
      if (['204', '539'].includes(codSefaz) || /duplicidade/i.test(msgSefaz)) {
        numeroEnvio = Math.max(numeroEnvio, parseInt(resFocus?.numero || '0', 10) || 0) + retrySefaz;
        payloadAtual = { ...payloadAtual, serie: serieEnvio, numero: numeroEnvio };
        ajustou = true;
      }
      // 2. NF-e de teste inexistente na SEFAZ Homologação (661/662/652/216/236/616/526/693): converte para Declaração (tpDoc=00)
      else if (
        ['661', '662', '652', '216', '236', '616', '526', '693'].includes(codSefaz) ||
        /inexistente na base|chave de acesso|nf-e|documentos transportados/i.test(msgSefaz)
      ) {
        payloadAtual = montarPayloadHomologFallback(payloadAtual);
        ajustou = true;
      }
      // 3. Rejeição 365 (Total do DFe inválido / vTotDFe): alterna entre vTPrest puro e vTPrest + IBS + CBS
      else if (codSefaz === '365' || /total do dfe|vtotdfe/i.test(msgSefaz)) {
        const vTotAlternativo =
          Number(payloadAtual.valor_total_dfe) === Number(baseCalculo.toFixed(2))
            ? Number((baseCalculo + valorIbsTotalCalc + valorCbsCalc).toFixed(2))
            : Number(baseCalculo.toFixed(2));
        payloadAtual = {
          ...payloadAtual,
          valor_total_dfe: vTotAlternativo.toFixed(2),
        };
        ajustou = true;
      }
      // 4. Rejeição de Base de Cálculo IBS/CBS (dedução do ICMS na vBC do IBS/CBS)
      else if (/base de calculo.*(ibs|cbs)|vbc.*(ibs|cbs)/i.test(msgSefaz)) {
        const vBcLiquida = Math.max(0, Number((baseCalculo - valorIcms).toFixed(2)));
        const vIbsUfLiq = Number(((vBcLiquida * aliqEfetIbsUf) / 100).toFixed(2));
        const vIbsMunLiq = Number(((vBcLiquida * aliqEfetIbsMun) / 100).toFixed(2));
        const vIbsTotLiq = Number((vIbsUfLiq + vIbsMunLiq).toFixed(2));
        const vCbsLiq = Number(((vBcLiquida * aliqEfetCbs) / 100).toFixed(2));
        payloadAtual = {
          ...payloadAtual,
          ibs_cbs_base_calculo: vBcLiquida.toFixed(2),
          ibs_uf_valor: vIbsUfLiq.toFixed(2),
          ibs_mun_valor: vIbsMunLiq.toFixed(2),
          ibs_valor_total: vIbsTotLiq.toFixed(2),
          cbs_valor: vCbsLiq.toFixed(2),
        };
        ajustou = true;
      }

      if (!ajustou) break;

      try {
        const retryRes = await enviarParaFocusComRetryRef(payloadAtual, `_R${retrySefaz}`, true);
        resFocus = retryRes;
        if (resFocus?.status === 'processando_autorizacao') {
          const consultadoRetry = await aguardarRetornoCte(ref);
          if (consultadoRetry) resFocus = consultadoRetry;
        }
      } catch (_) {
        break;
      }
    }

    // Garante que documentos recém-autorizados já tragam caminho_dacte (PDF oficial) e caminho_xml completos
    if (
      mapFocusStatusToDb(resFocus?.status, 'PROCESSANDO') === 'AUTORIZADO' &&
      (!resFocus.caminho_dacte && !resFocus.caminho_danfe)
    ) {
      try {
        const stCompleto = isCteOs
          ? await client.consultarCteOs(ref, true)
          : await client.consultarCte(ref, true);
        if (stCompleto) {
          resFocus = stCompleto;
        }
      } catch (_) {
        // segue com resFocus atual
      }
    }

    return await this._persistirRetornoFocusCte(
      cteId,
      ref,
      resFocus || {},
      client.ambiente,
      numeroEnvio,
      String(serieEnvio)
    );
  }

  static async _persistirRetornoFocusCte(
    cteId,
    ref,
    resFocus,
    ambiente = 'homologacao',
    numeroFallback = null,
    serieFallback = null
  ) {
    const novoStatus = mapFocusStatusToDb(resFocus?.status, 'PROCESSANDO');
    const chaveCteNormalizada =
      digitsOnly(
        resFocus?.chave_cte || resFocus?.chave || resFocus?.protocolo?.chave_cte || ''
      ).slice(0, 44) || null;
    const caminhoXmlNormalizado = FocusClient.normalizarUrlArquivo(
      resFocus?.caminho_xml_nota_fiscal || resFocus?.caminho_xml,
      ambiente
    );
    const caminhoDacteNormalizado = FocusClient.normalizarUrlArquivo(
      resFocus?.caminho_dacte || resFocus?.caminho_danfe,
      ambiente
    );
    const protocoloNormalizado = extrairProtocoloFocus(resFocus);
    const statusSefazExtraido = extrairStatusSefazFocus(resFocus);
    const mensagemSefazExtraida = extrairMensagemSefazFocus(resFocus);

    const statusSefazNormalizado =
      novoStatus === 'AUTORIZADO' ? statusSefazExtraido || '100' : statusSefazExtraido;
    const mensagemSefazNormalizada =
      novoStatus === 'AUTORIZADO'
        ? mensagemSefazExtraida || 'Autorizado o uso do CT-e'
        : mensagemSefazExtraida;

    const numeroDaChave =
      chaveCteNormalizada && chaveCteNormalizada.length === 44
        ? parseInt(chaveCteNormalizada.slice(25, 34), 10) || null
        : null;
    const serieDaChave =
      chaveCteNormalizada && chaveCteNormalizada.length === 44
        ? String(parseInt(chaveCteNormalizada.slice(22, 25), 10) || 1)
        : null;

    const numeroFinal = resFocus?.numero
      ? parseInt(resFocus.numero, 10)
      : numeroDaChave || (numeroFallback ? parseInt(numeroFallback, 10) : null);
    const serieFinal = resFocus?.serie
      ? String(resFocus.serie)
      : serieDaChave || (serieFallback ? String(serieFallback) : null);

    await db.query(
      `UPDATE dash_ctes SET
          status = $1,
          status_sefaz = COALESCE($2, status_sefaz),
          mensagem_sefaz = COALESCE($3, mensagem_sefaz),
          chave_cte = COALESCE($4, chave_cte),
          numero = COALESCE($5, numero),
          serie = COALESCE($6, serie),
          protocolo = COALESCE($7, protocolo),
          caminho_xml = COALESCE($8, caminho_xml),
          caminho_dacte = COALESCE($9, caminho_dacte),
          retorno_focus = $10,
          updated_at = NOW()
       WHERE id = $11`,
      [
        novoStatus,
        statusSefazNormalizado,
        mensagemSefazNormalizada,
        chaveCteNormalizada,
        numeroFinal,
        serieFinal,
        protocoloNormalizado,
        caminhoXmlNormalizado,
        caminhoDacteNormalizado,
        JSON.stringify(resFocus || {}),
        cteId,
      ]
    );

    return {
      success: true,
      ref,
      ambiente,
      focus_ambiente: ambiente,
      status: novoStatus,
      status_sefaz: statusSefazNormalizado,
      mensagem_sefaz: mensagemSefazNormalizada,
      chave_cte: chaveCteNormalizada,
      numero: numeroFinal,
      serie: serieFinal,
      protocolo: protocoloNormalizado,
      caminho_xml: caminhoXmlNormalizado,
      caminho_dacte: caminhoDacteNormalizado,
      focus: resFocus,
    };
  }

  /**
   * Consulta na Focus NFe o status atual de um CT-e ou CT-e OS e atualiza o banco.
   */
  static async consultarCteFocus(tenantId, cteId) {
    const idKey = Number(cteId);
    if (inFlightCteEmissoes.has(idKey)) {
      return await inFlightCteEmissoes.get(idKey);
    }

    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];

    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const isCteOs =
      String(cte.modelo) === '67' || String(cte.modelo_cte || '').toLowerCase() === 'cteos';

    let st;
    try {
      st = isCteOs
        ? await client.consultarCteOs(cte.ref, true)
        : await client.consultarCte(cte.ref, true);
    } catch (err) {
      const is404 =
        err.statusCode === 404 ||
        /404|nao_encontrad|não encontrad|not found/i.test(String(err.message || ''));
      const idadeMs = cte.updated_at ? Date.now() - new Date(cte.updated_at).getTime() : 999999;
      if (client.ambiente === 'homologacao' && is404 && (!cte.payload_focus || idadeMs > 30000)) {
        return await this.emitirCte(tenantId, cteId, { forcarNovaEmissao: true });
      }
      throw err;
    }

    const statusMapeado = mapFocusStatusToDb(st?.status, cte.status);
    const chaveConsulta = digitsOnly(st?.chave_cte || st?.chave || cte.chave_cte || '');
    const nCtNaChave = chaveConsulta.length === 44 ? parseInt(chaveConsulta.slice(25, 34), 10) : null;
    const idadeMs = cte.updated_at ? Date.now() - new Date(cte.updated_at).getTime() : 999999;

    // Se em homologação uma ref antiga ficou presa em processando_autorizacao com nCT=1 por colisão de numeração (>25s),
    // destrava automaticamente reemitindo com numeração sequencial alta (>=10)
    if (
      client.ambiente === 'homologacao' &&
      statusMapeado === 'PROCESSANDO' &&
      (nCtNaChave === 1 || Number(cte.numero || 0) <= 2) &&
      idadeMs > 25000
    ) {
      return await this.emitirCte(tenantId, cteId, { forcarNovaEmissao: true });
    }

    return await this._persistirRetornoFocusCte(
      cteId,
      cte.ref,
      st,
      client.ambiente,
      cte.numero,
      cte.serie
    );
  }

  /**
   * Cria e transmite novos CT-es de teste em Homologação SEFAZ/MS
   * (1 Operação Interna MS -> MS com CFOP 5353 e ICMS 17%, e 1 Operação Interestadual MS -> SP com CFOP 6353 e ICMS 12%,
   *  ambos com Reforma Tributária IBS 0,10% + CBS 0,90% e Declaração tpDoc=00).
   */
  static async gerarCtesTesteHomologacaoMs(tenantId) {
    const emitente = await this.getEmitente(tenantId);
    let emitenteId = emitente.id;
    if (!emitenteId) {
      const { rows: emRows } = await db.query(
        `SELECT id FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true ORDER BY id ASC LIMIT 1`,
        [tenantId]
      );
      emitenteId = emRows[0]?.id || null;
    }

    const { rows: maxRows } = await db.query(
      `SELECT COALESCE(MAX(numero), 0)::int AS max_num, COUNT(*)::int AS total_ctes
       FROM dash_ctes WHERE tenant_id = $1`,
      [tenantId]
    );
    let baseNumero = Math.max(Number(maxRows[0]?.max_num || 0) + 1, 20 + Number(maxRows[0]?.total_ctes || 0));

    const amanhaYmd = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const remetentePadraoMs = {
      documento: digitsOnly(emitente.cnpj) || '03272053000150',
      razao_social: 'CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
      nome_fantasia: emitente.nome_fantasia || 'PANTANAL',
      inscricao_estadual: digitsOnly(emitente.inscricao_estadual) || '283100630',
      indicador_ie: '1',
      logradouro: emitente.logradouro || 'RUA ARGENTINA',
      numero: emitente.numero || '715',
      bairro: emitente.bairro || 'PARQUE DAS NACOES',
      cep: digitsOnly(emitente.cep) || '79841270',
      uf: emitente.uf || 'MS',
      municipio: emitente.municipio || 'Dourados',
      codigo_municipio: emitente.codigo_municipio || '5003702',
      telefone: digitsOnly(emitente.telefone) || '6734164605',
    };

    const cenariosTeste = [
      {
        descricao: 'CT-e Homologação SEFAZ/MS — Operação Interna (Dourados/MS → Campo Grande/MS)',
        cfop: '5353',
        natureza_operacao: 'PRESTACAO DE SERVICO DE TRANSPORTE COMERCIAL',
        uf_inicio: 'MS',
        municipio_inicio: 'Dourados',
        codigo_municipio_inicio: '5003702',
        uf_fim: 'MS',
        municipio_fim: 'Campo Grande',
        codigo_municipio_fim: '5002704',
        valor_total: 150.0,
        aliquota_icms: 17.0,
        valor_icms: 25.5,
        peso_bruto: 180.0,
        quantidade_volumes: 4,
        valor_carga: 1850.0,
        produto_predominante: 'ALIMENTOS EM GERAL',
        destinatario_dados: {
          documento: '11144477735',
          razao_social: 'CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
          inscricao_estadual: '',
          indicador_ie: '9',
          logradouro: 'AVENIDA AFONSO PENA',
          numero: '1500',
          bairro: 'CENTRO',
          cep: '79002070',
          uf: 'MS',
          municipio: 'Campo Grande',
          codigo_municipio: '5002704',
          telefone: '6734164605',
        },
        documentos_json: [
          {
            id: 'doc-homolog-ms-1',
            tipo: 'OUTRO',
            chave: 'DECLARACAO-SEFAZ-MS-101',
            numero: '101',
            descricao: 'DECLARACAO DE TRANSPORTE INTERNO MS',
          },
        ],
        observacoes:
          'TESTE HOMOLOGACAO SEFAZ/MS #1 — OPERACAO INTERNA MS -> MS (CFOP 5353 | ICMS 17,00% | IBS 0,10% | CBS 0,90%)',
      },
      {
        descricao: 'CT-e Homologação SEFAZ/MS — Operação Interestadual (Dourados/MS → São Paulo/SP)',
        cfop: '6353',
        natureza_operacao: 'PRESTACAO DE SERVICO DE TRANSPORTE INTERESTADUAL',
        uf_inicio: 'MS',
        municipio_inicio: 'Dourados',
        codigo_municipio_inicio: '5003702',
        uf_fim: 'SP',
        municipio_fim: 'Sao Paulo',
        codigo_municipio_fim: '3550308',
        valor_total: 280.0,
        aliquota_icms: 12.0,
        valor_icms: 33.6,
        peso_bruto: 320.0,
        quantidade_volumes: 8,
        valor_carga: 3400.0,
        produto_predominante: 'MERCADORIAS DIVERSAS',
        destinatario_dados: {
          documento: '11144477735',
          razao_social: 'CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
          inscricao_estadual: '',
          indicador_ie: '9',
          logradouro: 'AVENIDA PAULISTA',
          numero: '1000',
          bairro: 'BELA VISTA',
          cep: '01310100',
          uf: 'SP',
          municipio: 'Sao Paulo',
          codigo_municipio: '3550308',
          telefone: '6734164605',
        },
        documentos_json: [
          {
            id: 'doc-homolog-sp-2',
            tipo: 'OUTRO',
            chave: 'DECLARACAO-SEFAZ-SP-102',
            numero: '102',
            descricao: 'DECLARACAO DE TRANSPORTE INTERESTADUAL MS -> SP',
          },
        ],
        observacoes:
          'TESTE HOMOLOGACAO SEFAZ/MS #2 — OPERACAO INTERESTADUAL MS -> SP (CFOP 6353 | ICMS 12,00% | IBS 0,10% | CBS 0,90%)',
      },
    ];

    const resultados = [];
    for (const cenario of cenariosTeste) {
      const numeroCte = baseNumero++;
      const refInicial = this.gerarRef('CTE', tenantId, `T${numeroCte}`);
      const componentes = [{ nome: 'FRETE VALOR', valor: cenario.valor_total }];

      const { rows: insRows } = await db.query(
        `INSERT INTO dash_ctes (
            tenant_id, emitente_id, ref, status, serie, numero, modelo,
            formato_dacte, finalidade, cfop, natureza_operacao, modelo_cte, tipo_servico, modal,
            retirar_mercadoria, tomador, tomador_documento,
            uf_inicio, municipio_inicio, codigo_municipio_inicio,
            uf_fim, municipio_fim, codigo_municipio_fim,
            valor_total, valor_receber, peso_bruto, quantidade_volumes, unidade_medida, valor_carga,
            componentes_valor, icms_situacao_tributaria, base_icms, aliquota_icms, valor_icms,
            aliquota_ibs, aliquota_ibs_mun, aliquota_cbs, codigo_situacao_fiscal, ibs_cbs_cst, ibs_cbs_class_trib,
            produto_predominante, outras_caracteristicas_carga, data_prevista_entrega,
            seguro_responsavel, observacoes,
            remetente_dados, destinatario_dados, documentos_json, data_emissao
         ) VALUES (
            $1, $2, $3, 'RASCUNHO', '1', $4, '57',
            'retrato', '0', $5, $6, 'normal', '0', '01',
            true, '0', $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $14, $15, $16, '01', $17,
            $18::jsonb, '00', $14, $19, $20,
            0.10, 0.00, 0.90, '000001', '000', '000001',
            $21, 'CAIXAS', $22,
            '4', $23,
            $24::jsonb, $25::jsonb, $26::jsonb, NOW()
         ) RETURNING *`,
        [
          tenantId,
          emitenteId,
          refInicial,
          numeroCte,
          cenario.cfop,
          cenario.natureza_operacao,
          remetentePadraoMs.documento,
          cenario.uf_inicio,
          cenario.municipio_inicio,
          cenario.codigo_municipio_inicio,
          cenario.uf_fim,
          cenario.municipio_fim,
          cenario.codigo_municipio_fim,
          cenario.valor_total,
          cenario.peso_bruto,
          cenario.quantidade_volumes,
          cenario.valor_carga,
          JSON.stringify(componentes),
          cenario.aliquota_icms,
          cenario.valor_icms,
          cenario.produto_predominante,
          amanhaYmd,
          cenario.observacoes,
          JSON.stringify(remetentePadraoMs),
          JSON.stringify(cenario.destinatario_dados),
          JSON.stringify(cenario.documentos_json),
        ]
      );

      const novoCte = insRows[0];
      try {
        const resEmissao = await this.emitirCte(tenantId, novoCte.id);
        resultados.push({
          cte_id: novoCte.id,
          descricao: cenario.descricao,
          ...resEmissao,
        });
      } catch (err) {
        resultados.push({
          cte_id: novoCte.id,
          descricao: cenario.descricao,
          status: 'REJEITADO',
          error: err.message,
        });
      }
    }

    return {
      success: true,
      criados: resultados.length,
      autorizados: resultados.filter((r) => r.status === 'AUTORIZADO').length,
      resultados,
    };
  }

  /**
   * Executa uma única vez por tenant a reconciliação de CT-es travados em nCT=1 e a criação do lote de testes SEFAZ/MS.
   */
  static async reconciliarEGerarTestesHomologacaoMs(tenantId) {
    const key = String(tenantId);
    if (tenantsLoteHomologMsInicializado.has(key)) return;
    tenantsLoteHomologMsInicializado.add(key);

    try {
      const emitente = await this.getEmitente(tenantId);
      if (emitente.focus_ambiente === 'producao') return;

      // 1. Destrava CT-es antigos que ficaram em PROCESSANDO/REJEITADO com número <= 2
      const { rows: antigos } = await db.query(
        `SELECT id, status, numero FROM dash_ctes
         WHERE tenant_id = $1 AND status IN ('PROCESSANDO', 'REJEITADO')
         ORDER BY id ASC LIMIT 4`,
        [tenantId]
      );
      for (const a of antigos) {
        try {
          await this.emitirCte(tenantId, a.id, { forcarNovaEmissao: true });
        } catch (e) {
          logger.warn(`[Homolog MS] Aviso ao destravar CT-e #${a.id}: ${e.message}`);
        }
      }

      // 2. Verifica se já foram criados os novos CT-es de teste SEFAZ/MS (Interno 17% e Interestadual 12%)
      const { rows: jaTemNovos } = await db.query(
        `SELECT COUNT(*)::int AS total FROM dash_ctes
         WHERE tenant_id = $1 AND observacoes ILIKE '%TESTE HOMOLOGACAO SEFAZ/MS%'`,
        [tenantId]
      );
      if (Number(jaTemNovos[0]?.total || 0) === 0) {
        await this.gerarCtesTesteHomologacaoMs(tenantId);
      }
    } catch (err) {
      logger.warn(`[Homolog MS] Aviso em reconciliarEGerarTestesHomologacaoMs: ${err.message}`);
    }
  }

  /**
   * Cancela um CT-e ou CT-e OS na Focus NFe.
   */
  static async cancelarCte(tenantId, cteId, justificativa) {
    if (!justificativa || String(justificativa).trim().length < 15) {
      throw new Error('A justificativa de cancelamento deve ter no mínimo 15 caracteres.');
    }
    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];

    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const isCteOs =
      String(cte.modelo) === '67' || String(cte.modelo_cte || '').toLowerCase() === 'cteos';

    const resFocus = isCteOs
      ? await client.cancelarCteOs(cte.ref, justificativa.trim())
      : await client.cancelarCte(cte.ref, justificativa.trim());

    await db.query(
      `UPDATE dash_ctes SET
          status = 'CANCELADO',
          mensagem_sefaz = COALESCE($1, mensagem_sefaz),
          retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{cancelamento}', $2::jsonb),
          updated_at = NOW()
       WHERE id = $3`,
      [resFocus.mensagem_sefaz || 'CT-e cancelado', JSON.stringify(resFocus), cteId]
    );

    return { success: true, focus: resFocus };
  }

  /**
   * Emite Carta de Correção Eletrônica (CC-e) de um CT-e ou CT-e OS autorizado.
   */
  static async cartaCorrecaoCte(tenantId, cteId, correcao) {
    const { rows } = await db.query(
      `SELECT c.ref, c.emitente_id, c.status, c.modelo, c.modelo_cte
       FROM dash_ctes c WHERE c.id = $1 AND c.tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');

    const cte = rows[0];
    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const isCteOs =
      String(cte.modelo) === '67' || String(cte.modelo_cte || '').toLowerCase() === 'cteos';

    const resFocus = isCteOs
      ? await client.cartaCorrecaoCteOs(cte.ref, correcao)
      : await client.cartaCorrecaoCte(cte.ref, correcao);

    await db.query(
      `UPDATE dash_ctes
       SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{carta_correcao}', $1::jsonb),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(resFocus), cteId]
    );

    return { success: true, focus: resFocus };
  }

  /**
   * Registra evento de Prestação de Serviço em Desacordo em CT-e / CT-e OS.
   */
  static async prestacaoDesacordoCte(tenantId, cteId, observacoes) {
    if (!observacoes || String(observacoes).trim().length < 15) {
      throw new Error('As observações de desacordo devem ter no mínimo 15 caracteres.');
    }
    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];
    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const isCteOs =
      String(cte.modelo) === '67' || String(cte.modelo_cte || '').toLowerCase() === 'cteos';

    const resFocus = isCteOs
      ? await client.prestacaoDesacordoCteOs(cte.ref, observacoes.trim())
      : await client.prestacaoDesacordoCte(cte.ref, observacoes.trim());

    await db.query(
      `UPDATE dash_ctes
       SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{prestacao_desacordo}', $1::jsonb),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(resFocus), cteId]
    );
    return { success: true, focus: resFocus };
  }

  /**
   * Registra evento de Insucesso na Entrega do CT-e.
   */
  static async insucessoEntregaCte(tenantId, cteId, dados) {
    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];
    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);

    const resFocus = await client.insucessoEntregaCte(cte.ref, dados);
    await db.query(
      `UPDATE dash_ctes
       SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{insucesso_entrega}', $1::jsonb),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(resFocus), cteId]
    );
    return { success: true, focus: resFocus };
  }

  /**
   * Cancela evento de Insucesso na Entrega do CT-e.
   */
  static async cancelarInsucessoEntregaCte(tenantId, cteId, numeroSequencialEvento = 1) {
    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];
    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const resFocus = await client.cancelarInsucessoEntregaCte(cte.ref, numeroSequencialEvento);
    return { success: true, focus: resFocus };
  }

  /**
   * Envia o CT-e por e-mail através da Focus NFe.
   */
  static async enviarEmailCte(tenantId, cteId, emails) {
    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];
    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const resFocus = await client.enviarEmailCte(cte.ref, emails);
    return { success: true, focus: resFocus };
  }

  // ─────────────────────────────────────────────────────────
  // MDF-e (Modelo 58 - Manifesto Eletrônico de Documentos Fiscais - /v2/mdfe)
  // ─────────────────────────────────────────────────────────

  /**
   * Envia o MDF-e para autorização na SEFAZ via Focus NFe v2.
   */
  static async emitirMdfe(tenantId, mdfeId) {
    const { rows } = await db.query(
      `SELECT m.*,
              v.placa as v_placa, v.renavam as v_renavam, v.uf as v_uf,
              v.tara_kg as v_tara_kg, v.capacidade_kg as v_capacidade_kg, v.capacidade_m3 as v_capacidade_m3,
              v.tipo_rodado as v_tipo_rodado, v.tipo_carroceria as v_tipo_carroceria,
              v.tipo_proprietario as v_tipo_proprietario, v.rntrc as v_rntrc,
              v.cpf_cnpj_proprietario as v_doc_prop, v.nome_proprietario as v_nome_prop, v.uf_proprietario as v_uf_prop,
              mot.nome as mot_nome, mot.cpf as mot_cpf
       FROM dash_mdfes m
       LEFT JOIN dash_veiculos v ON v.id = m.veiculo_id
       LEFT JOIN dash_motoristas mot ON mot.id = m.motorista_id
       WHERE m.id = $1 AND m.tenant_id = $2`,
      [mdfeId, tenantId]
    );

    if (rows.length === 0) {
      throw new Error('MDF-e não encontrado.');
    }

    const mdfe = rows[0];
    const { client, emitente } = await this.getFocusClient(tenantId, mdfe.emitente_id);

    // Busca documentos (CT-e / NF-e) vinculados ao manifesto
    const { rows: docs } = await db.query(
      `SELECT md.tipo_documento, md.chave,
              md.codigo_municipio_descarregamento, md.nome_municipio_descarregamento,
              ct.codigo_municipio_fim as cte_cod_fim, ct.municipio_fim as cte_mun_fim,
              cg.destinatario_municipio as nfe_mun_fim
       FROM dash_mdfe_documentos md
       LEFT JOIN dash_ctes ct ON ct.chave_cte = md.chave AND ct.tenant_id = md.tenant_id
       LEFT JOIN dash_cargas cg ON cg.chave_acesso = md.chave AND cg.tenant_id = md.tenant_id
       WHERE md.mdfe_id = $1 AND md.tenant_id = $2`,
      [mdfeId, tenantId]
    );

    const ufInicio = (mdfe.uf_inicio || emitente.uf || 'MS').toUpperCase();
    const ufFim = (mdfe.uf_fim || emitente.uf || 'MS').toUpperCase();

    // 1. Municípios de Carregamento
    const munCarregRaw = parseJsonSafe(mdfe.municipios_carregamento, []);
    const municipiosCarregamento =
      Array.isArray(munCarregRaw) && munCarregRaw.filter((m) => m?.nome || m?.codigo || m?.ibge).length > 0
        ? munCarregRaw
            .filter((m) => m?.nome || m?.codigo || m?.ibge)
            .map((m) => {
              const r = resolverIbgeMunicipio(
                m.codigo || m.ibge || m.codigo_municipio,
                m.nome || m.municipio || m.nome_municipio,
                ufInicio
              );
              return { codigo: r.codigo, nome: r.nome };
            })
        : [
            (() => {
              const r = resolverIbgeMunicipio(
                mdfe.codigo_municipio_carregamento || emitente.codigo_municipio,
                mdfe.municipio_carregamento || emitente.municipio,
                ufInicio
              );
              return { codigo: r.codigo, nome: r.nome };
            })(),
          ];

    // 2. Percurso (UFs intermediárias)
    const ufsPercursoRaw = parseJsonSafe(mdfe.ufs_percurso, []);
    const percurso = Array.isArray(ufsPercursoRaw)
      ? ufsPercursoRaw
          .map((u) =>
            typeof u === 'string'
              ? u.trim().toUpperCase()
              : String(u?.uf_percurso || u?.uf || '').trim().toUpperCase()
          )
          .filter((uf) => uf.length === 2 && uf !== ufInicio && uf !== ufFim)
          .map((uf_percurso) => ({ uf_percurso }))
      : [];

    // 3. Municípios de Descarregamento agrupando conhecimentos_transporte e notas_fiscais
    const munDescExplicit = parseJsonSafe(mdfe.municipios_descarregamento, []);
    const defaultMunDesc = resolverIbgeMunicipio(
      mdfe.codigo_municipio_descarregamento ||
        munDescExplicit?.[0]?.codigo ||
        munDescExplicit?.[0]?.ibge ||
        (ufFim === emitente.uf ? emitente.codigo_municipio : ''),
      mdfe.municipio_descarregamento ||
        munDescExplicit?.[0]?.nome ||
        munDescExplicit?.[0]?.municipio ||
        '',
      ufFim
    );

    const gruposDesc = new Map();
    const getOrCreateGrupo = (cod, nome) => {
      const r = resolverIbgeMunicipio(cod, nome, ufFim);
      if (!gruposDesc.has(r.codigo)) {
        gruposDesc.set(r.codigo, {
          codigo: r.codigo,
          nome: r.nome,
          conhecimentos_transporte: [],
          notas_fiscais: [],
        });
      }
      return gruposDesc.get(r.codigo);
    };

    for (const d of docs) {
      const chaveLimpa = digitsOnly(d.chave);
      if (chaveLimpa.length !== 44) continue;
      const g = getOrCreateGrupo(
        d.codigo_municipio_descarregamento || d.cte_cod_fim || defaultMunDesc.codigo,
        d.nome_municipio_descarregamento || d.cte_mun_fim || d.nfe_mun_fim || defaultMunDesc.nome
      );
      if (String(d.tipo_documento).toUpperCase() === 'CTE') {
        if (!g.conhecimentos_transporte.some((x) => x.chave_cte === chaveLimpa)) {
          g.conhecimentos_transporte.push({ chave_cte: chaveLimpa });
        }
      } else {
        if (!g.notas_fiscais.some((x) => x.chave_nfe === chaveLimpa)) {
          g.notas_fiscais.push({ chave_nfe: chaveLimpa });
        }
      }
    }

    if (Array.isArray(munDescExplicit)) {
      for (const m of munDescExplicit) {
        if (!m?.nome && !m?.codigo && !m?.ibge) continue;
        const g = getOrCreateGrupo(m.codigo || m.ibge, m.nome || m.municipio);
        if (Array.isArray(m.conhecimentos_transporte)) {
          for (const ct of m.conhecimentos_transporte) {
            const ch = digitsOnly(ct?.chave_cte || ct);
            if (ch.length === 44 && !g.conhecimentos_transporte.some((x) => x.chave_cte === ch)) {
              g.conhecimentos_transporte.push({ chave_cte: ch });
            }
          }
        }
        if (Array.isArray(m.notas_fiscais)) {
          for (const nf of m.notas_fiscais) {
            const ch = digitsOnly(nf?.chave_nfe || nf);
            if (ch.length === 44 && !g.notas_fiscais.some((x) => x.chave_nfe === ch)) {
              g.notas_fiscais.push({ chave_nfe: ch });
            }
          }
        }
      }
    }

    const municipiosDescarregamento = Array.from(gruposDesc.values()).map((g) => {
      const item = { codigo: g.codigo, nome: g.nome };
      if (g.conhecimentos_transporte.length > 0) {
        item.conhecimentos_transporte = g.conhecimentos_transporte;
      }
      if (g.notas_fiscais.length > 0) {
        item.notas_fiscais = g.notas_fiscais;
      }
      return item;
    });

    if (municipiosDescarregamento.length === 0) {
      municipiosDescarregamento.push({
        codigo: defaultMunDesc.codigo,
        nome: defaultMunDesc.nome,
      });
    }

    // 4. Condutores
    const condutoresMap = new Map();
    const cpfMotPrincipal = digitsOnly(mdfe.motorista_cpf || mdfe.mot_cpf);
    const nomeMotPrincipal = mdfe.motorista_nome || mdfe.mot_nome;
    if (cpfMotPrincipal.length === 11 && nomeMotPrincipal) {
      condutoresMap.set(cpfMotPrincipal, {
        nome: nomeMotPrincipal,
        cpf: cpfMotPrincipal,
      });
    }
    const condutoresRaw = parseJsonSafe(mdfe.condutores, []);
    if (Array.isArray(condutoresRaw)) {
      for (const c of condutoresRaw) {
        const cpf = digitsOnly(c?.cpf);
        if (cpf.length === 11 && c?.nome) {
          condutoresMap.set(cpf, { nome: String(c.nome).trim(), cpf });
        }
      }
    }
    const condutoresList = Array.from(condutoresMap.values());

    // 5. Reboques
    const reboquesRaw = parseJsonSafe(mdfe.reboques, []);
    const reboquesPayload = Array.isArray(reboquesRaw)
      ? reboquesRaw
          .filter((r) => r && r.placa)
          .map((r) => ({
            placa: String(r.placa).replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
            tara: Number(r.tara_kg || r.tara || 5000),
            capacidade_kg: Number(r.capacidade_kg || 20000),
            tipo_carroceria: r.tipo_carroceria || '02',
            uf_licenciamento: (r.uf || r.uf_licenciamento || ufInicio).toUpperCase(),
          }))
      : [];

    // 6. Seguros (conforme MDFeXML: seguros_carga)
    const segurosRaw = parseJsonSafe(mdfe.seguros, []);
    const segurosPayload = Array.isArray(segurosRaw)
      ? segurosRaw
          .filter(
            (s) =>
              s &&
              (s.seguradora_nome ||
                s.nome_seguradora ||
                s.apolice ||
                s.numero_apolice ||
                s.numero_averbacao)
          )
          .map((s) => {
            const respSeg = String(s.responsavel || s.responsavel_tipo || s.responsavel_seguro || '1');
            const docResp = digitsOnly(
              s.cnpj_responsavel || s.responsavel_documento || emitente.cnpj
            );
            const avSingle = s.numero_averbacao ? String(s.numero_averbacao).trim() : '';
            const avArr = Array.isArray(s.averbacoes) ? s.averbacoes.filter(Boolean).map(String) : [];
            const averbFinal = avArr.length > 0 ? avArr : avSingle ? [avSingle] : [];

            return {
              responsavel_seguro: respSeg,
              ...(respSeg === '2'
                ? docResp.length === 11
                  ? { cpf_responsavel: docResp }
                  : { cnpj_responsavel: docResp || digitsOnly(emitente.cnpj) }
                : {}),
              nome_seguradora: String(
                s.seguradora_nome || s.nome_seguradora || 'SEGURADORA'
              ).slice(0, 30),
              ...(s.seguradora_cnpj || s.cnpj_seguradora
                ? { cnpj_seguradora: digitsOnly(s.seguradora_cnpj || s.cnpj_seguradora) }
                : {}),
              ...(s.apolice || s.numero_apolice
                ? { numero_apolice: String(s.apolice || s.numero_apolice).slice(0, 20) }
                : {}),
              ...(averbFinal.length > 0 ? { numero_averbacao: averbFinal } : {}),
            };
          })
      : [];

    // 7. Produto Predominante, Totais e Modal Rodoviário (conforme MDFeXML + TransporteRodoviarioXML)
    const prodPredRaw = parseJsonSafe(mdfe.produtos_predominantes, []);
    const prodPrincipal = Array.isArray(prodPredRaw) && prodPredRaw[0] ? prodPredRaw[0] : null;
    const rntrcFinal = normalizarRntrc8(mdfe.v_rntrc || emitente.rntrc);

    const placaTracao = String(mdfe.veiculo_placa || mdfe.v_placa || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
    const renavamTracao = digitsOnly(mdfe.veiculo_renavam || mdfe.v_renavam || '');
    const ncmProd = digitsOnly(prodPrincipal?.ncm || mdfe.produto_predominante_ncm || '');

    const totalCtesVinculados = municipiosDescarregamento.reduce(
      (acc, m) => acc + (Array.isArray(m.conhecimentos_transporte) ? m.conhecimentos_transporte.length : 0),
      0
    );
    const totalNfesVinculadas = municipiosDescarregamento.reduce(
      (acc, m) => acc + (Array.isArray(m.notas_fiscais) ? m.notas_fiscais.length : 0),
      0
    );

    const contratantesRaw = parseJsonSafe(mdfe.contratantes, []);
    const contratantesPayload = Array.isArray(contratantesRaw)
      ? contratantesRaw
          .filter((c) => c && digitsOnly(c.documento || c.cnpj || c.cpf).length >= 11)
          .map((c) => {
            const doc = digitsOnly(c.documento || c.cnpj || c.cpf);
            return {
              ...(c.nome ? { nome: String(c.nome).slice(0, 60) } : {}),
              ...(doc.length === 11 ? { cpf: doc } : { cnpj: doc.slice(0, 14) }),
            };
          })
      : [];

    const docPropVeiculo = digitsOnly(mdfe.v_doc_prop || '');
    const isVeiculoTerceiro = String(mdfe.v_tipo_proprietario) === '2' && docPropVeiculo.length >= 11;

    const payload = {
      emitente: String(mdfe.tipo_emitente || '1'),
      tipo_transporte: String(mdfe.tipo_transporte || '1'),
      modal: '1',
      data_emissao: formatarDataHoraSefaz(emitente.uf || ufInicio),
      ...(mdfe.status !== 'REJEITADO' && Number(mdfe.numero) > 0 && (mdfe.serie || emitente.serie_mdfe)
        ? { serie: Number(mdfe.serie || emitente.serie_mdfe), numero: Number(mdfe.numero) }
        : {}),
      uf_inicio: ufInicio,
      uf_fim: ufFim,

      // Municípios e Percurso
      municipios_carregamento: municipiosCarregamento,
      ...(percurso.length > 0 ? { percursos: percurso } : {}),

      // Dados completos do Emitente (nome_emitente conforme MDFeXML)
      cnpj_emitente: digitsOnly(emitente.cnpj),
      inscricao_estadual_emitente: digitsOnly(emitente.inscricao_estadual),
      nome_emitente: String(emitente.razao_social || '').slice(0, 60),
      nome_fantasia_emitente: String(emitente.nome_fantasia || emitente.razao_social || '').slice(0, 60),
      logradouro_emitente: String(emitente.logradouro || 'RUA PRINCIPAL').slice(0, 60),
      numero_emitente: String(emitente.numero || 'SN').slice(0, 60),
      ...(emitente.complemento ? { complemento_emitente: String(emitente.complemento).slice(0, 60) } : {}),
      bairro_emitente: String(emitente.bairro || 'CENTRO').slice(0, 60),
      codigo_municipio_emitente: emitente.codigo_municipio,
      municipio_emitente: emitente.municipio,
      cep_emitente: digitsOnly(emitente.cep) || '79004000',
      uf_emitente: emitente.uf,
      ...(emitente.telefone ? { telefone_emitente: digitsOnly(emitente.telefone).slice(0, 14) } : {}),

      municipios_descarregamento: municipiosDescarregamento,

      ...(segurosPayload.length > 0 ? { seguros_carga: segurosPayload } : {}),

      // Produto Predominante (campos raiz conforme MDFeXML)
      tipo_carga: prodPrincipal?.tipo_carga || mdfe.tipo_carga || '05',
      descricao_produto: String(
        prodPrincipal?.descricao || mdfe.produto_predominante_nome || 'MERCADORIAS EM GERAL'
      ).slice(0, 120),
      ...(ncmProd.length === 8 ? { codigo_ncm_produto: ncmProd } : {}),
      ...(prodPrincipal?.lotacao
        ? {
            cep_carregamento: digitsOnly(emitente.cep) || '79841270',
            cep_descarregamento: digitsOnly(mdfe.cep_descarregamento || emitente.cep) || '79004000',
          }
        : {}),

      ...(totalCtesVinculados > 0 ? { quantidade_total_cte: totalCtesVinculados } : {}),
      ...(totalNfesVinculadas > 0 ? { quantidade_total_nfe: totalNfesVinculadas } : {}),
      valor_total_carga: parseFloat(mdfe.valor_carga || 100).toFixed(2),
      codigo_unidade_medida_peso_bruto: '01',
      peso_bruto: parseFloat(mdfe.peso_bruto || 100).toFixed(4),

      // Modal Rodoviário (objeto modal_rodoviario conforme mdfe/TransporteRodoviarioXML)
      modal_rodoviario: {
        registro_nacional_transporte: rntrcFinal,
        ...(mdfe.ciot_codigo
          ? {
              ciot: [
                {
                  ciot: digitsOnly(mdfe.ciot_codigo),
                  cnpj_responsavel: digitsOnly(emitente.cnpj),
                },
              ],
            }
          : {}),
        ...(contratantesPayload.length > 0 ? { contratantes: contratantesPayload } : {}),
        placa_veiculo: placaTracao,
        ...(renavamTracao.length >= 9 ? { renavam_veiculo: renavamTracao.slice(0, 11) } : {}),
        tara_veiculo: Math.max(1, Math.round(Number(mdfe.veiculo_tara_kg || mdfe.v_tara_kg || 1000))),
        capacidade_kg_veiculo: Math.max(
          1,
          Math.round(Number(mdfe.veiculo_capacidade_kg || mdfe.v_capacidade_kg || 2000))
        ),
        ...(Number(mdfe.veiculo_capacidade_m3 || mdfe.v_capacidade_m3) > 0
          ? { capacidade_m3_veiculo: Math.round(Number(mdfe.veiculo_capacidade_m3 || mdfe.v_capacidade_m3)) }
          : {}),
        ...(isVeiculoTerceiro
          ? {
              ...(docPropVeiculo.length === 11
                ? { cpf_proprietario_veiculo: docPropVeiculo }
                : { cnpj_proprietario_veiculo: docPropVeiculo.slice(0, 14) }),
              rntrc_proprietario_veiculo: normalizarRntrc8(mdfe.v_rntrc || rntrcFinal),
              razao_social_proprietario_veiculo: String(
                mdfe.v_nome_prop || 'PROPRIETARIO TERCEIRO'
              ).slice(0, 60),
              inscricao_estadual_proprietario_veiculo: 'ISENTO',
              uf_proprietario_veiculo: (mdfe.v_uf_prop || ufInicio).toUpperCase(),
              tipo_proprietario_veiculo: '0',
            }
          : {}),
        condutores: condutoresList,
        tipo_rodado_veiculo: mdfe.veiculo_tipo_rodado || mdfe.v_tipo_rodado || '01',
        tipo_carroceria_veiculo: mdfe.veiculo_tipo_carroceria || mdfe.v_tipo_carroceria || '02',
        uf_licenciamento_veiculo: (mdfe.veiculo_uf || mdfe.v_uf || emitente.uf || ufInicio).toUpperCase(),
        ...(reboquesPayload.length > 0 ? { veiculos_reboque: reboquesPayload } : {}),
      },

      ...(mdfe.informacao_adicional
        ? { informacao_complementar: String(mdfe.informacao_adicional).slice(0, 5000) }
        : {}),
    };

    const ref =
      mdfe.ref && mdfe.status === 'AUTORIZADO'
        ? mdfe.ref
        : this.gerarRef('MDFE', tenantId, mdfe.id);

    await db.query(
      `UPDATE dash_mdfes SET ref = $1, payload_focus = $2, status = 'PROCESSANDO', updated_at = NOW() WHERE id = $3`,
      [ref, JSON.stringify(payload), mdfeId]
    );

    let resFocus;
    try {
      resFocus = await client.emitirMdfe(ref, payload);
    } catch (emitErr) {
      await db
        .query(
          `UPDATE dash_mdfes SET status = 'REJEITADO', mensagem_sefaz = $1, updated_at = NOW() WHERE id = $2`,
          [String(emitErr.message || 'Erro de validação Focus NFe').slice(0, 500), mdfeId]
        )
        .catch(() => {});
      throw emitErr;
    }

    if (resFocus?.status === 'processando_autorizacao') {
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        await new Promise((r) => setTimeout(r, 2200));
        try {
          const st = await client.consultarMdfe(ref, true);
          if (st) resFocus = st;
          if (st && st.status && st.status !== 'processando_autorizacao') {
            break;
          }
        } catch (_) {
          // ignora falha transitória de polling
        }
      }
    }

    const novoStatus = mapFocusStatusToDb(resFocus.status, 'PROCESSANDO');

    const chaveMdfeNormalizada =
      digitsOnly(
        resFocus.chave_mdfe || resFocus.chave || resFocus.protocolo?.chave_mdfe || ''
      ).slice(0, 44) || null;
    const caminhoXmlMdfeNormalizado = FocusClient.normalizarUrlArquivo(
      resFocus.caminho_xml_nota_fiscal || resFocus.caminho_xml,
      client.ambiente
    );
    const caminhoDamdfeNormalizado = FocusClient.normalizarUrlArquivo(
      resFocus.caminho_damdfe,
      client.ambiente
    );
    const protocoloMdfeNormalizado = extrairProtocoloFocus(resFocus);
    const statusSefazMdfe = extrairStatusSefazFocus(resFocus);
    const mensagemSefazMdfe = extrairMensagemSefazFocus(resFocus);

    await db.query(
      `UPDATE dash_mdfes SET
          status = $1,
          status_sefaz = COALESCE($2, status_sefaz),
          mensagem_sefaz = COALESCE($3, mensagem_sefaz),
          chave_mdfe = COALESCE($4, chave_mdfe),
          numero = COALESCE($5, numero),
          serie = COALESCE($6, serie),
          protocolo = COALESCE($7, protocolo),
          caminho_xml = COALESCE($8, caminho_xml),
          caminho_damdfe = COALESCE($9, caminho_damdfe),
          retorno_focus = $10,
          updated_at = NOW()
       WHERE id = $11`,
      [
        novoStatus,
        statusSefazMdfe,
        mensagemSefazMdfe,
        chaveMdfeNormalizada,
        resFocus.numero ? parseInt(resFocus.numero, 10) : null,
        resFocus.serie ? String(resFocus.serie) : null,
        protocoloMdfeNormalizado,
        caminhoXmlMdfeNormalizado,
        caminhoDamdfeNormalizado,
        JSON.stringify(resFocus),
        mdfeId,
      ]
    );

    return {
      success: true,
      ref,
      ambiente: client.ambiente,
      focus_ambiente: client.ambiente,
      status: novoStatus,
      status_sefaz: statusSefazMdfe,
      mensagem_sefaz: mensagemSefazMdfe,
      chave_mdfe: chaveMdfeNormalizada,
      numero: resFocus.numero || null,
      serie: resFocus.serie || null,
      protocolo: protocoloMdfeNormalizado,
      caminho_xml: caminhoXmlMdfeNormalizado,
      caminho_damdfe: caminhoDamdfeNormalizado,
      focus: resFocus,
    };
  }

  /**
   * Consulta na Focus NFe o status atual de um MDF-e e sincroniza no banco.
   */
  static async consultarMdfeFocus(tenantId, mdfeId) {
    const { rows } = await db.query(
      `SELECT * FROM dash_mdfes WHERE id = $1 AND tenant_id = $2`,
      [mdfeId, tenantId]
    );
    if (rows.length === 0) throw new Error('MDF-e não encontrado.');
    const mdfe = rows[0];

    const { client } = await this.getFocusClient(tenantId, mdfe.emitente_id);
    const st = await client.consultarMdfe(mdfe.ref, true);
    const novoStatus = mapFocusStatusToDb(st.status, mdfe.status);
    const chaveMdfeNormalizada =
      digitsOnly(st.chave_mdfe || st.chave || st.protocolo?.chave_mdfe || '').slice(0, 44) || null;
    const protocoloNormalizado = extrairProtocoloFocus(st);
    const statusSefazNormalizado = extrairStatusSefazFocus(st);
    const mensagemSefazNormalizada = extrairMensagemSefazFocus(st);
    const caminhoXmlNormalizado = FocusClient.normalizarUrlArquivo(
      st.caminho_xml_nota_fiscal || st.caminho_xml,
      client.ambiente
    );
    const caminhoDamdfeNormalizado = FocusClient.normalizarUrlArquivo(
      st.caminho_damdfe,
      client.ambiente
    );

    await db.query(
      `UPDATE dash_mdfes SET
          status = $1,
          status_sefaz = COALESCE($2, status_sefaz),
          mensagem_sefaz = COALESCE($3, mensagem_sefaz),
          chave_mdfe = COALESCE($4, chave_mdfe),
          numero = COALESCE($5, numero),
          serie = COALESCE($6, serie),
          protocolo = COALESCE($7, protocolo),
          caminho_xml = COALESCE($8, caminho_xml),
          caminho_damdfe = COALESCE($9, caminho_damdfe),
          retorno_focus = $10,
          updated_at = NOW()
       WHERE id = $11`,
      [
        novoStatus,
        statusSefazNormalizado,
        mensagemSefazNormalizada,
        chaveMdfeNormalizada,
        st.numero ? parseInt(st.numero, 10) : null,
        st.serie ? String(st.serie) : null,
        protocoloNormalizado,
        caminhoXmlNormalizado,
        caminhoDamdfeNormalizado,
        JSON.stringify(st),
        mdfeId,
      ]
    );

    return {
      success: true,
      status: novoStatus,
      chave_mdfe: chaveMdfeNormalizada,
      protocolo: protocoloNormalizado,
      caminho_xml: caminhoXmlNormalizado,
      caminho_damdfe: caminhoDamdfeNormalizado,
      focus: st,
    };
  }

  /**
   * Cancela um MDF-e autorizado (dentro de 24h e sem início de viagem).
   */
  static async cancelarMdfe(tenantId, mdfeId, justificativa) {
    if (!justificativa || String(justificativa).trim().length < 15) {
      throw new Error('A justificativa de cancelamento do MDF-e deve ter no mínimo 15 caracteres.');
    }
    const { rows } = await db.query(
      `SELECT * FROM dash_mdfes WHERE id = $1 AND tenant_id = $2`,
      [mdfeId, tenantId]
    );
    if (rows.length === 0) throw new Error('MDF-e não encontrado.');
    const mdfe = rows[0];

    const { client } = await this.getFocusClient(tenantId, mdfe.emitente_id);
    const resFocus = await client.cancelarMdfe(mdfe.ref, justificativa.trim());

    await db.query(
      `UPDATE dash_mdfes SET
          status = 'CANCELADO',
          mensagem_sefaz = COALESCE($1, mensagem_sefaz),
          retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{cancelamento}', $2::jsonb),
          updated_at = NOW()
       WHERE id = $3`,
      [resFocus.mensagem_sefaz || 'MDF-e cancelado', JSON.stringify(resFocus), mdfeId]
    );

    return { success: true, focus: resFocus };
  }

  /**
   * Encerramento do MDF-e para liberar o veículo/motorista na SEFAZ.
   */
  static async encerrarMdfe(
    tenantId,
    mdfeId,
    { siglaUf, sigla_uf, nomeMunicipio, nome_municipio, codigoMunicipio, codigo_municipio, dataEncerramento, data } = {}
  ) {
    const { rows } = await db.query(
      `SELECT m.* FROM dash_mdfes m WHERE m.id = $1 AND m.tenant_id = $2`,
      [mdfeId, tenantId]
    );
    if (rows.length === 0) throw new Error('MDF-e não encontrado.');
    const mdfe = rows[0];

    const { client, emitente } = await this.getFocusClient(tenantId, mdfe.emitente_id);
    const ufFinal = (siglaUf || sigla_uf || mdfe.uf_fim || emitente.uf || 'MS').toUpperCase();
    const ibgeEnc = resolverIbgeMunicipio(
      codigoMunicipio || codigo_municipio || mdfe.codigo_municipio_descarregamento,
      nomeMunicipio || nome_municipio || mdfe.municipio_descarregamento,
      ufFinal
    );

    const resFocus = await client.encerrarMdfe(mdfe.ref, {
      data: formatarDataYmd(dataEncerramento || data) || new Date().toISOString().split('T')[0],
      sigla_uf: ibgeEnc.uf,
      nome_municipio: ibgeEnc.nome,
      codigo_municipio: ibgeEnc.codigo,
    });

    await db.query(
      `UPDATE dash_mdfes SET
          status = 'ENCERRADO',
          encerrado_em = NOW(),
          encerramento_uf = $1,
          encerramento_municipio = $2,
          retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{encerramento}', $3::jsonb),
          updated_at = NOW()
       WHERE id = $4`,
      [ibgeEnc.uf, ibgeEnc.nome, JSON.stringify(resFocus), mdfeId]
    );

    return { success: true, focus: resFocus };
  }

  /**
   * Validação preventiva do CT-e — NÃO consome cota da Focus.
   * Retorna impedimentos (bloqueiam emissão) e alertas (exigem confirmação).
   */
  static async validarCte(tenantId, cteId) {
    const { rows } = await db.query(
      `SELECT c.* FROM dash_ctes c WHERE c.id = $1 AND c.tenant_id = $2`,
      [cteId, tenantId]
    );

    if (rows.length === 0) {
      return {
        valido: false,
        impedimentos: [{ campo: 'cte', mensagem: 'CT-e não encontrado.' }],
        alertas: [],
      };
    }

    const c = rows[0];
    let emitente = null;
    try {
      emitente = await this.getEmitente(tenantId, c.emitente_id);
    } catch (_) {
      emitente = null;
    }

    const impedimentos = [];
    const alertas = [];

    if (!emitente || !emitente.cnpj) {
      impedimentos.push({ campo: 'emitente_cnpj', mensagem: 'CNPJ do emitente não informado.' });
    }
    if (!emitente || !emitente.focus_token) {
      impedimentos.push({
        campo: 'focus_token',
        mensagem: `Token da Focus NFe (${emitente?.focus_ambiente || 'homologacao'}) não configurado. Configure em Configurações > Fiscal.`,
      });
    }
    if (!emitente?.rntrc) {
      alertas.push({
        campo: 'rntrc',
        mensagem: 'RNTRC do emitente não informado — exigido em modal rodoviário.',
      });
    }

    if (!c.uf_inicio || !c.uf_fim) {
      impedimentos.push({ campo: 'uf_inicio', mensagem: 'UF de início e de fim são obrigatórios.' });
    }
    if (!c.valor_total || Number(c.valor_total) <= 0) {
      impedimentos.push({ campo: 'valor_total', mensagem: 'Valor do frete deve ser maior que zero.' });
    }
    if (!c.peso_bruto || Number(c.peso_bruto) <= 0) {
      alertas.push({
        campo: 'peso_bruto',
        mensagem: 'Peso bruto zerado — será utilizado peso das NF-es vinculadas.',
      });
    }

    const { rows: cargas } = await db.query(
      `SELECT c.chave_acesso, c.valor_total, c.peso_bruto,
              cc.valor_nfe, cc.peso_nfe
       FROM dash_cte_cargas cc
       LEFT JOIN dash_cargas c ON c.id = cc.carga_id
       WHERE cc.cte_id = $1 AND cc.tenant_id = $2`,
      [cteId, tenantId]
    );
    const docsManuais = parseJsonSafe(c.documentos_json, []);
    const totalDocs = cargas.length + (Array.isArray(docsManuais) ? docsManuais.length : 0);

    const isCteOs =
      String(c.modelo) === '67' || String(c.modelo_cte || '').toLowerCase() === 'cteos';

    if (totalDocs === 0 && !isCteOs) {
      impedimentos.push({
        campo: 'nfes',
        mensagem: 'Nenhuma NF-e vinculada — o CT-e Normal exige ao menos um documento fiscal.',
      });
    }

    const pesoCargas = cargas.reduce(
      (acc, cg) => acc + Number(cg.peso_nfe || cg.peso_bruto || 0),
      0
    );
    const valorCargas = cargas.reduce(
      (acc, cg) => acc + Number(cg.valor_nfe || cg.valor_total || 0),
      0
    );

    const { rows: regra } = await db.query(
      `SELECT * FROM dash_regras_fiscais
       WHERE tenant_id = $1 AND ativo = true
         AND (escopo = 'GLOBAL'
           OR (escopo = 'UF' AND (uf_origem IS NULL OR uf_origem = $2))
           OR (escopo = 'UF_PAR' AND uf_origem = $2 AND uf_destino = $3))
       ORDER BY CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END
       LIMIT 1`,
      [tenantId, c.uf_inicio, c.uf_fim]
    );

    const r = regra[0];
    const valorFreteNum = Number(c.valor_total || 0);
    const aliqRef = r ? Number(r.aliquota_icms) : Number(c.aliquota_icms || emitente?.aliquota_icms_padrao || 0);
    const icmsCalculado = (valorFreteNum * aliqRef) / 100;
    const aliqIbsUfRef =
      Number(c.aliquota_ibs) > 0
        ? Number(c.aliquota_ibs)
        : Number(r?.aliquota_ibs) > 0
        ? Number(r.aliquota_ibs)
        : 0.1;
    const aliqIbsMunRef =
      Number(c.aliquota_ibs_mun) > 0
        ? Number(c.aliquota_ibs_mun)
        : Number(r?.aliquota_ibs_mun) > 0
        ? Number(r.aliquota_ibs_mun)
        : 0.0;
    const aliqCbsRef =
      Number(c.aliquota_cbs) > 0
        ? Number(c.aliquota_cbs)
        : Number(r?.aliquota_cbs) > 0
        ? Number(r.aliquota_cbs)
        : 0.9;
    const ibsEstimado = Math.round(((valorFreteNum * (aliqIbsUfRef + aliqIbsMunRef)) / 100) * 100) / 100;
    const cbsEstimado = Math.round(((valorFreteNum * aliqCbsRef) / 100) * 100) / 100;

    return {
      valido: impedimentos.length === 0,
      impedimentos,
      alertas,
      calculos: {
        valor_frete: valorFreteNum,
        valor_carga: valorCargas || Number(c.valor_carga || 0),
        peso_cte: Number(c.peso_bruto || 0),
        peso_nfes: pesoCargas,
        icms_estimado: Math.round(icmsCalculado * 100) / 100,
        aliquota_aplicada: aliqRef,
        situacao_tributaria: r ? r.situacao_tributaria : c.icms_situacao_tributaria || '00',
        ibs_cbs_cst: c.ibs_cbs_cst || r?.ibs_cbs_cst || '000',
        ibs_cbs_class_trib: c.ibs_cbs_class_trib || r?.ibs_cbs_class_trib || '000001',
        aliquota_ibs_uf: aliqIbsUfRef,
        aliquota_ibs_mun: aliqIbsMunRef,
        aliquota_cbs: aliqCbsRef,
        ibs_estimado: ibsEstimado,
        cbs_estimado: cbsEstimado,
        valor_total_dfe: valorFreteNum,
      },
      resumo: {
        nfes_vinculadas: totalDocs,
        emitente: emitente?.razao_social || emitente?.cnpj || '',
        ambiente: emitente?.focus_ambiente || 'homologacao',
      },
    };
  }

  /**
   * Inclui condutor durante a viagem (MDF-e autorizado).
   */
  static async incluirCondutor(tenantId, mdfeId, { nome, cpf }) {
    const { rows } = await db.query(
      `SELECT m.ref, m.emitente_id, m.status FROM dash_mdfes m WHERE m.id = $1 AND m.tenant_id = $2`,
      [mdfeId, tenantId]
    );
    if (rows.length === 0) throw new Error('MDF-e não encontrado.');

    const { client } = await this.getFocusClient(tenantId, rows[0].emitente_id);
    const resFocus = await client.incluirCondutorMdfe(rows[0].ref, {
      nome: String(nome || '').trim(),
      cpf: digitsOnly(cpf),
    });

    await db.query(
      `UPDATE dash_mdfes SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{inclusao_condutor}', $1::jsonb), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(resFocus), mdfeId]
    );

    return { success: true, focus: resFocus };
  }

  static async incluirCondutorMdfe(tenantId, mdfeId, condutor) {
    return this.incluirCondutor(tenantId, mdfeId, condutor);
  }

  /**
   * Inclui CT-e/NF-e em um MDF-e já autorizado.
   */
  static async incluirDfe(
    tenantId,
    mdfeId,
    { protocolo, codigo_municipio_carregamento, documentos, ...rest } = {}
  ) {
    const { rows } = await db.query(
      `SELECT m.ref, m.emitente_id, m.status FROM dash_mdfes m WHERE m.id = $1 AND m.tenant_id = $2`,
      [mdfeId, tenantId]
    );
    if (rows.length === 0) throw new Error('MDF-e não encontrado.');

    const { client } = await this.getFocusClient(tenantId, rows[0].emitente_id);
    const resFocus = await client.incluirDfeMdfe(rows[0].ref, {
      protocolo,
      codigo_municipio_carregamento,
      documentos,
      ...rest,
    });

    await db.query(
      `UPDATE dash_mdfes SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{inclusao_dfe}', $1::jsonb), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(resFocus), mdfeId]
    );

    return { success: true, focus: resFocus };
  }

  static async incluirDfeMdfe(tenantId, mdfeId, dadosDfe) {
    return this.incluirDfe(tenantId, mdfeId, dadosDfe);
  }

  /**
   * Reconciliação: consulta na Focus documentos presos em PROCESSANDO.
   */
  static async reconciliarProcessando(tenantId = null, limiteMinutos = 2) {
    const params = [limiteMinutos];
    let filtro = '';
    if (tenantId) {
      params.push(tenantId);
      filtro = ' AND c.tenant_id = $' + params.length;
    }

    const { rows } = await db.query(
      `SELECT c.id, c.tenant_id, c.ref, c.emitente_id, c.status, c.modelo, c.modelo_cte
       FROM dash_ctes c
       WHERE c.status = 'PROCESSANDO'
         AND c.updated_at < NOW() - ($1 || ' minutes')::interval${filtro}
       LIMIT 50`,
      params
    );

    let reconciliados = 0;
    for (const c of rows) {
      try {
        const { client } = await this.getFocusClient(c.tenant_id, c.emitente_id);
        const isCteOs =
          String(c.modelo) === '67' || String(c.modelo_cte || '').toLowerCase() === 'cteos';
        const st = isCteOs
          ? await client.consultarCteOs(c.ref, true)
          : await client.consultarCte(c.ref, true);

        const novoStatus = mapFocusStatusToDb(st.status, c.status);
        if (novoStatus !== c.status) {
          await db.query(
            `UPDATE dash_ctes SET
                status = $1,
                status_sefaz = COALESCE($2, status_sefaz),
                mensagem_sefaz = COALESCE($3, mensagem_sefaz),
                chave_cte = COALESCE($4, chave_cte),
                caminho_xml = COALESCE($5, caminho_xml),
                caminho_dacte = COALESCE($6, caminho_dacte),
                protocolo = COALESCE($7, protocolo),
                numero = COALESCE($8, numero),
                serie = COALESCE($9, serie),
                updated_at = NOW()
             WHERE id = $10`,
            [
              novoStatus,
              extrairStatusSefazFocus(st),
              extrairMensagemSefazFocus(st),
              digitsOnly(st.chave_cte || st.chave || st.protocolo?.chave_cte || '').slice(0, 44) || null,
              FocusClient.normalizarUrlArquivo(
                st.caminho_xml_nota_fiscal || st.caminho_xml,
                client.ambiente
              ),
              FocusClient.normalizarUrlArquivo(
                st.caminho_dacte || st.caminho_danfe,
                client.ambiente
              ),
              extrairProtocoloFocus(st),
              st.numero ? parseInt(st.numero, 10) : null,
              st.serie ? String(st.serie) : null,
              c.id,
            ]
          );
          reconciliados++;
        }
      } catch (err) {
        logger.warn(`[Reconciliação] CT-e ref=${c.ref}: ${err.message}`);
      }
    }

    return { reconciliados, total: rows.length };
  }

  /**
   * Trata retornos assíncronos enviados pela Focus NFe (autorizado, cancelado, rejeitado),
   * exigindo assinatura de webhook ou verificação cruzada direta na API oficial Focus NFe.
   */
  static async processarWebhook(payload, headers = {}) {
    const {
      ref,
      status,
      status_sefaz,
      mensagem_sefaz,
      chave,
      chave_cte,
      chave_mdfe,
      caminho_xml,
      caminho_xml_nota_fiscal,
      caminho_dacte,
      caminho_damdfe,
      protocolo,
      erros,
    } = payload || {};

    if (!ref || typeof ref !== 'string') {
      logger.warn('[Webhook Focus] Webhook recebido sem referência (ref)');
      return { ignored: true };
    }

    // 1. Localiza o documento fiscal pelo ref antes de qualquer alteração
    let docType = null;
    let docRecord = null;

    const cteLookup = await db.query(
      `SELECT id, tenant_id, emitente_id, modelo FROM dash_ctes WHERE ref = $1 LIMIT 1`,
      [ref]
    );
    if (cteLookup.rowCount > 0) {
      docType = 'CTE';
      docRecord = cteLookup.rows[0];
    } else {
      const mdfeLookup = await db.query(
        `SELECT id, tenant_id, emitente_id FROM dash_mdfes WHERE ref = $1 LIMIT 1`,
        [ref]
      );
      if (mdfeLookup.rowCount > 0) {
        docType = 'MDFE';
        docRecord = mdfeLookup.rows[0];
      }
    }

    if (!docRecord) {
      logger.warn(`[Webhook Focus] Referência ${ref} não encontrada nem em CT-e nem em MDF-e`);
      return { found: false };
    }

    // 2. Verifica autenticidade: segredo configurado ou consulta ativa na API Focus NFe
    const cfgRes = await db.query(
      `SELECT focus_webhook_secret FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
      [docRecord.tenant_id]
    ).catch(() => ({ rows: [] }));

    const configuredSecret =
      decryptSecret(cfgRes.rows[0]?.focus_webhook_secret || '') ||
      process.env.FOCUS_WEBHOOK_SECRET ||
      '';

    const extractHeaderToken = () => {
      const direct = headers['x-focus-token'] || headers['x-webhook-secret'] || '';
      if (direct) return String(direct).trim();
      const auth = headers['authorization'] || '';
      if (typeof auth === 'string') {
        if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
        if (auth.startsWith('Basic ')) {
          const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
          return decoded.split(':')[0] || '';
        }
        return auth.trim();
      }
      return '';
    };

    let authoritative = payload || {};

    if (configuredSecret) {
      const providedSecret = extractHeaderToken();
      if (!safeCompare(providedSecret, configuredSecret)) {
        logger.warn('[Webhook Focus] Token de webhook inválido recusado', {
          ref,
          tenantId: docRecord.tenant_id,
        });
        return { unauthorized: true };
      }
    } else {
      try {
        const { focus } = await this.getFocusClient(docRecord.tenant_id, docRecord.emitente_id);
        if (docType === 'MDFE') {
          authoritative = await focus.consultarMdfe(ref, true);
        } else if (String(docRecord.modelo) === '67') {
          authoritative = await focus.consultarCteOs(ref, true);
        } else {
          authoritative = await focus.consultarCte(ref, true);
        }
      } catch (verifyErr) {
        logger.warn('[Webhook Focus] Falha ao validar retorno diretamente na Focus NFe; ignorando webhook não autenticado', {
          ref,
          tenantId: docRecord.tenant_id,
          error: verifyErr.message,
        });
        return { unverified: true };
      }
    }

    let emitAmb = 'homologacao';
    try {
      const em = await this.getEmitente(docRecord.tenant_id, docRecord.emitente_id);
      emitAmb = em?.focus_ambiente || 'homologacao';
    } catch (_) {
      emitAmb = 'homologacao';
    }

    const effStatus = authoritative.status || status;
    const chaveFinal =
      digitsOnly(
        authoritative.chave_cte ||
          authoritative.chave_mdfe ||
          authoritative.chave ||
          chave_cte ||
          chave_mdfe ||
          chave ||
          ''
      ).slice(0, 44) || null;
    const xmlFinal = FocusClient.normalizarUrlArquivo(
      authoritative.caminho_xml_nota_fiscal ||
        authoritative.caminho_xml ||
        caminho_xml_nota_fiscal ||
        caminho_xml ||
        null,
      emitAmb
    );
    const dacteFinal = FocusClient.normalizarUrlArquivo(
      authoritative.caminho_dacte || caminho_dacte || null,
      emitAmb
    );
    const damdfeFinal = FocusClient.normalizarUrlArquivo(
      authoritative.caminho_damdfe || caminho_damdfe || null,
      emitAmb
    );
    const protocoloFinal =
      extrairProtocoloFocus(authoritative) || extrairProtocoloFocus(payload) || null;
    const statusSefazFinal =
      extrairStatusSefazFocus(authoritative) || status_sefaz || null;
    const msgSefazFinal =
      extrairMensagemSefazFocus(authoritative) || mensagem_sefaz || null;
    const errosFinal = authoritative.erros || erros || [];

    logger.info(`[Webhook Focus] Processando retorno verificado de ref=${ref}, status=${effStatus}`);

    if (docType === 'CTE') {
      const cteRes = await db.query(
        `UPDATE dash_ctes SET
            status = CASE
                WHEN $1 = 'autorizado' THEN 'AUTORIZADO'
                WHEN $1 = 'cancelado' THEN 'CANCELADO'
                WHEN $1 = 'erro_autorizacao' OR $1 = 'denegado' THEN 'REJEITADO'
                ELSE status
            END,
            chave_cte = COALESCE($2, chave_cte),
            caminho_xml = COALESCE($3, caminho_xml),
            caminho_dacte = COALESCE($4, caminho_dacte),
            protocolo = COALESCE($5, protocolo),
            status_sefaz = COALESCE($6, status_sefaz),
            mensagem_sefaz = COALESCE($7, mensagem_sefaz),
            erros = $8,
            retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{webhook}', $9::jsonb),
            updated_at = NOW()
         WHERE id = $10 AND tenant_id = $11 RETURNING id, tenant_id`,
        [
          effStatus,
          chaveFinal,
          xmlFinal,
          dacteFinal,
          protocoloFinal,
          statusSefazFinal,
          msgSefazFinal,
          JSON.stringify(errosFinal),
          JSON.stringify(authoritative),
          docRecord.id,
          docRecord.tenant_id,
        ]
      );
      return { success: true, tipo: 'CTE', id: cteRes.rows[0]?.id || docRecord.id };
    }

    const mdfeRes = await db.query(
      `UPDATE dash_mdfes SET
          status = CASE
              WHEN $1 = 'autorizado' THEN 'AUTORIZADO'
              WHEN $1 = 'cancelado' THEN 'CANCELADO'
              WHEN $1 = 'encerrado' THEN 'ENCERRADO'
              WHEN $1 = 'erro_autorizacao' THEN 'REJEITADO'
              ELSE status
          END,
          chave_mdfe = COALESCE($2, chave_mdfe),
          caminho_xml = COALESCE($3, caminho_xml),
          caminho_damdfe = COALESCE($4, caminho_damdfe),
          protocolo = COALESCE($5, protocolo),
          status_sefaz = COALESCE($6, status_sefaz),
          mensagem_sefaz = COALESCE($7, mensagem_sefaz),
          erros = $8,
          retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{webhook}', $9::jsonb),
          updated_at = NOW()
       WHERE id = $10 AND tenant_id = $11 RETURNING id, tenant_id`,
      [
        effStatus,
        chaveFinal,
        xmlFinal,
        damdfeFinal,
        protocoloFinal,
        statusSefazFinal,
        msgSefazFinal,
        JSON.stringify(errosFinal),
        JSON.stringify(authoritative),
        docRecord.id,
        docRecord.tenant_id,
      ]
    );

    return { success: true, tipo: 'MDFE', id: mdfeRes.rows[0]?.id || docRecord.id };
  }

  // ─────────────────────────────────────────────────────────
  // SOFTWARE HOUSE / CONTA PARCEIRO FOCUS NFe (/v2/empresas & /v2/hooks)
  // ─────────────────────────────────────────────────────────

  static async _ensurePlataformaConfigTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS dash_plataforma_config (
        chave VARCHAR(100) PRIMARY KEY,
        valor TEXT,
        updated_by VARCHAR(180),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  /**
   * Obtém a configuração global da conta Software House Focus NFe (Coliseu Sistemas),
   * combinando cofre PostgreSQL AES-256-GCM com fallback para variável FOCUS_MASTER_TOKEN.
   */
  static async getMasterFocusConfig() {
    let dbTokenEnc = null;
    let dbWebhookUrl = null;
    let updatedAt = null;
    let updatedBy = null;

    try {
      await this._ensurePlataformaConfigTable();
      const { rows } = await db.query(
        `SELECT chave, valor, updated_by, updated_at
         FROM dash_plataforma_config
         WHERE chave IN ('focus_master_token', 'focus_webhook_base_url')`
      );
      for (const r of rows) {
        if (r.chave === 'focus_master_token') {
          dbTokenEnc = r.valor;
          updatedAt = r.updated_at;
          updatedBy = r.updated_by;
        }
        if (r.chave === 'focus_webhook_base_url') {
          dbWebhookUrl = r.valor;
        }
      }
    } catch (_) {
      // ignora em bancos sem permissão DDL
    }

    const plainDbToken = decryptSecret(dbTokenEnc || '');
    const envToken = String(config.security.focusMasterToken || '').trim();
    const masterToken = String(plainDbToken || envToken || '').trim();
    const origem = plainDbToken ? 'cofre_db' : envToken ? 'env' : 'ausente';

    const webhookBaseUrl = String(
      dbWebhookUrl || config.security.publicApiUrl || 'https://transporte.coliseusistemas.com.br'
    )
      .trim()
      .replace(/\/+$/, '');

    return {
      masterToken,
      temMasterToken: Boolean(masterToken),
      masterTokenMasked: masterToken ? maskSecret(dbTokenEnc || masterToken) : '',
      masterTokenPreview: masterToken ? `${masterToken.slice(0, 4)}••••` : null,
      origem,
      webhookBaseUrl,
      webhookEndpoint: `${webhookBaseUrl}/api/webhooks/focus`,
      updatedAt,
      updatedBy,
    };
  }

  /**
   * Salva o Token Principal da Software House cifrado em AES-256-GCM e a URL pública de Webhooks.
   */
  static async salvarMasterFocusConfig({ masterToken, webhookBaseUrl, updatedBy = 'master' } = {}) {
    await this._ensurePlataformaConfigTable();
    const existingRes = await db.query(
      `SELECT valor FROM dash_plataforma_config WHERE chave = 'focus_master_token' LIMIT 1`
    );
    const existingVal = existingRes.rows[0]?.valor || null;
    const encryptedToken = resolveSecretForSave(masterToken, existingVal);

    if (encryptedToken !== null) {
      await db.query(
        `INSERT INTO dash_plataforma_config (chave, valor, updated_by, updated_at)
         VALUES ('focus_master_token', $1, $2, NOW())
         ON CONFLICT (chave) DO UPDATE SET
           valor = EXCLUDED.valor,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [encryptedToken, updatedBy]
      );
    }

    if (webhookBaseUrl !== undefined && String(webhookBaseUrl).trim()) {
      const cleanUrl = String(webhookBaseUrl).trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(cleanUrl)) {
        throw new Error('A URL pública de Webhook deve iniciar com https:// ou http://.');
      }
      await db.query(
        `INSERT INTO dash_plataforma_config (chave, valor, updated_by, updated_at)
         VALUES ('focus_webhook_base_url', $1, $2, NOW())
         ON CONFLICT (chave) DO UPDATE SET
           valor = EXCLUDED.valor,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [cleanUrl, updatedBy]
      );
    }

    return this.getMasterFocusConfig();
  }

  /**
   * Testa o Token Principal da Software House consultando /v2/empresas na Focus NFe.
   */
  static async testarMasterFocusToken(tokenOpcional = null) {
    const cfg = await this.getMasterFocusConfig();
    const candidate =
      tokenOpcional && !isMaskedValue(tokenOpcional)
        ? decryptSecret(String(tokenOpcional).trim())
        : cfg.masterToken;

    if (!candidate) {
      throw new Error(
        'Token Principal Focus NFe não informado. Cole o "Token principal produção" do Painel API da Focus NFe.'
      );
    }

    const reseller = FocusClient.forReseller(candidate);
    return reseller.testarMasterToken();
  }

  /**
   * Valida e normaliza a logomarca em Base64 (aceita Data URI ou Base64 puro, PNG ou JPEG).
   * Retorna o Base64 puro sem cabeçalho data:image/... exigido pelo campo arquivo_logo_base64 da Focus NFe.
   */
  static normalizarLogoBase64(logoInput) {
    const str = String(logoInput || '').trim();
    if (!str) {
      throw new Error('Nenhum arquivo de logomarca foi enviado.');
    }

    let declaredMime = null;
    let rawBase64 = str;
    const dataUriMatch = str.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
    if (dataUriMatch) {
      declaredMime = dataUriMatch[1].toLowerCase();
      rawBase64 = dataUriMatch[2];
    }
    rawBase64 = rawBase64.replace(/\s+/g, '');

    if (!rawBase64 || rawBase64.length < 32) {
      throw new Error('Arquivo de logomarca vazio ou inválido.');
    }

    const buf = Buffer.from(rawBase64, 'base64');
    if (!buf || buf.length < 16) {
      throw new Error('Não foi possível decodificar a imagem enviada.');
    }
    if (buf.length > 1536 * 1024) {
      throw new Error('A logomarca excede o limite máximo de 1,5 MB. Envie uma imagem PNG ou JPG otimizada.');
    }

    const isPng =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpeg =
      buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

    if (!isPng && !isJpeg) {
      throw new Error('Formato de imagem não suportado pela SEFAZ/Focus NFe. Utilize PNG ou JPG/JPEG.');
    }

    const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : declaredMime || 'image/png';
    return {
      rawBase64: buf.toString('base64'),
      mime,
      bytes: buf.length,
    };
  }

  /**
   * Monta o payload oficial de cadastro/atualização de empresa em /v2/empresas da Focus NFe v2.
   */
  static montarPayloadEmpresaFocus(
    emitente,
    certDecifrado = null,
    { isNew = false, deleteLogo = false } = {}
  ) {
    const cnpj = digitsOnly(emitente?.cnpj);
    if (!validarCnpjReal(cnpj)) {
      throw new Error(
        `CNPJ "${emitente?.cnpj || ''}" inválido. Informe um CNPJ real de 14 dígitos da transportadora antes de provisionar na Focus NFe.`
      );
    }

    const razaoSocial = String(emitente?.razao_social || '').trim();
    if (!razaoSocial || razaoSocial.length < 3) {
      throw new Error('Razão Social da transportadora é obrigatória para provisionamento na Focus NFe.');
    }

    const ieRaw = String(emitente?.inscricao_estadual || '').trim();
    if (!ieRaw) {
      throw new Error(
        'Inscrição Estadual (IE) é obrigatória para habilitar CT-e e MDF-e na SEFAZ (ou informe ISENTO quando aplicável).'
      );
    }

    const cep = digitsOnly(emitente?.cep);
    if (cep.length !== 8) {
      throw new Error('CEP válido de 8 dígitos é obrigatório para cadastrar o emitente na Focus NFe.');
    }

    const uf = String(emitente?.uf || '').toUpperCase().trim();
    if (uf.length !== 2) {
      throw new Error('UF de 2 letras é obrigatória para cadastrar o emitente na Focus NFe.');
    }

    const municipio = String(emitente?.municipio || '').trim();
    if (!municipio) {
      throw new Error('Município fiscal é obrigatório para cadastrar o emitente na Focus NFe.');
    }

    const serieCte = Number(digitsOnly(emitente?.serie_cte) || 1) || 1;
    const serieMdfe = Number(digitsOnly(emitente?.serie_mdfe) || 1) || 1;

    const payload = {
      nome: razaoSocial,
      nome_fantasia: String(emitente?.nome_fantasia || razaoSocial).trim(),
      cnpj,
      inscricao_estadual: ieRaw.toUpperCase() === 'ISENTO' ? 'ISENTO' : digitsOnly(ieRaw),
      ...(emitente?.inscricao_municipal
        ? { inscricao_municipal: digitsOnly(emitente.inscricao_municipal) }
        : {}),
      regime_tributario: ['1', '2', '3'].includes(String(emitente?.regime_tributario))
        ? Number(emitente.regime_tributario)
        : 1,
      logradouro: String(emitente?.logradouro || 'RUA PRINCIPAL').trim(),
      numero: String(emitente?.numero || 'SN').trim(),
      ...(emitente?.complemento ? { complemento: String(emitente.complemento).trim() } : {}),
      bairro: String(emitente?.bairro || 'CENTRO').trim(),
      cep,
      municipio,
      uf,
      ...(emitente?.telefone && digitsOnly(emitente.telefone).length >= 8
        ? { telefone: digitsOnly(emitente.telefone) }
        : {}),
      ...(emitente?.email && String(emitente.email).includes('@')
        ? { email: String(emitente.email).trim(), enviar_email_destinatario: true }
        : { enviar_email_destinatario: false }),
      habilita_cte: true,
      habilita_cteos: true,
      habilita_mdfe: true,
      habilita_manifestacao: true,
      serie_cte_producao: serieCte,
      serie_cte_homologacao: serieCte,
      serie_mdfe_producao: serieMdfe,
      serie_mdfe_homologacao: serieMdfe,
    };

    if (isNew) {
      const proxCte = Math.max(1, Number(emitente?.ultimo_numero_cte || 0) + 1);
      const proxMdfe = Math.max(1, Number(emitente?.ultimo_numero_mdfe || 0) + 1);
      payload.proximo_numero_cte_producao = proxCte;
      payload.proximo_numero_cte_homologacao = proxCte;
      payload.proximo_numero_cteos_producao = 1;
      payload.proximo_numero_cteos_homologacao = 1;
      payload.proximo_numero_mdfe_producao = proxMdfe;
      payload.proximo_numero_mdfe_homologacao = proxMdfe;
    }

    if (
      certDecifrado &&
      Buffer.isBuffer(certDecifrado.arquivo_pfx) &&
      certDecifrado.arquivo_pfx.length > 0 &&
      certDecifrado.senha
    ) {
      payload.arquivo_certificado_base64 = certDecifrado.arquivo_pfx.toString('base64');
      payload.senha_certificado = certDecifrado.senha;
    }

    if (deleteLogo) {
      payload.delete_logo = true;
    } else if (emitente?.logo_base64) {
      try {
        const { rawBase64 } = this.normalizarLogoBase64(emitente.logo_base64);
        if (rawBase64) {
          payload.arquivo_logo_base64 = rawBase64;
          payload.delete_logo = false;
        }
      } catch (_) {
        // Evita interromper provisionamento geral caso logo antiga esteja corrompida
      }
    }

    return payload;
  }

  /**
   * Provisiona ou sincroniza automaticamente uma transportadora na conta parceira Focus NFe (/v2/empresas),
   * envia o Certificado Digital A1 (se houver), salva os tokens de Homologação e Produção no cofre AES-256-GCM
   * e registra os Webhooks de CT-e e MDF-e (/v2/hooks).
   */
  static async provisionarEmpresaFocus(
    tenantId,
    emitenteId = null,
    { registrarWebhooks = true, incluirCertificado = true, deleteLogo = false } = {}
  ) {
    const emitente = await this.getEmitente(tenantId, emitenteId);
    if (!emitente || !emitente.id) {
      throw new Error('Salve os Dados da Empresa antes de sincronizar com a Focus NFe.');
    }

    const masterCfg = await this.getMasterFocusConfig();
    if (!masterCfg.temMasterToken) {
      throw new Error(
        'Token Principal Focus NFe (Software House) ainda não foi configurado pelo administrador Master.'
      );
    }

    const reseller = FocusClient.forReseller(masterCfg.masterToken);
    const cert = incluirCertificado ? await this.getCertificadoEmitente(tenantId, emitente.id) : null;

    // 1. Verifica se a empresa já existe na Focus NFe (por focus_empresa_id ou CNPJ)
    let existingFocus = null;
    if (emitente.focus_empresa_id) {
      try {
        existingFocus = await reseller.consultarEmpresa(emitente.focus_empresa_id);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    }
    if (!existingFocus) {
      const encontradas = await reseller.listarEmpresas({ cnpj: emitente.cnpj });
      existingFocus =
        encontradas.find((e) => digitsOnly(e.cnpj) === digitsOnly(emitente.cnpj)) || null;
    }

    const payload = this.montarPayloadEmpresaFocus(emitente, cert, {
      isNew: !existingFocus,
      deleteLogo,
    });

    let resEmpresa;
    try {
      resEmpresa = existingFocus
        ? await reseller.atualizarEmpresa(existingFocus.id, payload)
        : await reseller.criarEmpresa(payload);
    } catch (focusErr) {
      await db
        .query(
          `UPDATE dash_emitentes SET focus_ultimo_erro = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
          [focusErr.message, emitente.id, tenantId]
        )
        .catch(() => {});
      throw focusErr;
    }

    const focusEmpresaId = String(resEmpresa.id || existingFocus?.id || '');
    const plainHomolog = String(
      resEmpresa.token_homologacao ||
        existingFocus?.token_homologacao ||
        emitente.focus_token_homologacao ||
        ''
    ).trim();
    const plainProd = String(
      resEmpresa.token_producao ||
        existingFocus?.token_producao ||
        emitente.focus_token_producao ||
        ''
    ).trim();

    const encHomolog = plainHomolog ? encryptSecret(plainHomolog) : null;
    const encProd = plainProd ? encryptSecret(plainProd) : null;
    const ambienteAtivo = emitente.focus_ambiente === 'producao' ? 'producao' : 'homologacao';
    const encAtivo = ambienteAtivo === 'producao' ? encProd || encHomolog : encHomolog || encProd;

    const certValidoAte = resEmpresa.certificado_valido_ate || null;
    const certValidoDe = resEmpresa.certificado_valido_de || null;
    const logoSincronizada = !deleteLogo && Boolean(emitente.logo_base64);

    await db.query(
      `UPDATE dash_emitentes SET
          focus_empresa_id = COALESCE($1, focus_empresa_id),
          focus_token_homologacao = COALESCE($2, focus_token_homologacao),
          focus_token_producao = COALESCE($3, focus_token_producao),
          focus_token = COALESCE($4, focus_token),
          focus_ambiente = $5,
          certificado_valido_ate = COALESCE($6::timestamptz, certificado_valido_ate),
          logo_focus_sincronizada = $9,
          focus_sincronizado_em = NOW(),
          focus_ultimo_erro = NULL,
          updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8`,
      [
        focusEmpresaId || null,
        encHomolog,
        encProd,
        encAtivo,
        ambienteAtivo,
        certValidoAte,
        emitente.id,
        tenantId,
        logoSincronizada,
      ]
    );

    await db
      .query(
        `UPDATE dash_integracoes_config SET
            focus_ambiente = $1,
            focus_token_homologacao = COALESCE($2, focus_token_homologacao),
            focus_token_producao = COALESCE($3, focus_token_producao),
            updated_at = NOW()
         WHERE tenant_id = $4`,
        [ambienteAtivo, encHomolog, encProd, tenantId]
      )
      .catch(() => {});

    if (cert && cert.id) {
      const vencFinal = certValidoAte ? new Date(certValidoAte) : cert.valido_ate;
      const diasParaVencer = vencFinal
        ? Math.ceil((new Date(vencFinal).getTime() - Date.now()) / (1000 * 3600 * 24))
        : null;
      await db
        .query(
          `UPDATE dash_certificados SET
              valido_de = COALESCE($1::timestamptz, valido_de),
              valido_ate = COALESCE($2::timestamptz, valido_ate),
              dias_para_vencer = COALESCE($3, dias_para_vencer),
              focus_sincronizado = TRUE,
              focus_sincronizado_em = NOW(),
              updated_at = NOW()
           WHERE id = $4 AND tenant_id = $5`,
          [certValidoDe, certValidoAte, diasParaVencer, cert.id, tenantId]
        )
        .catch(() => {});
    }

    let hooksResult = null;
    if (registrarWebhooks && (plainHomolog || plainProd)) {
      try {
        hooksResult = await this.registrarWebhooksFocus(tenantId, emitente.id);
      } catch (hookErr) {
        logger.warn('[Focus Provisionamento] Empresa criada/atualizada, mas falha ao registrar hooks:', {
          tenantId,
          emitenteId: emitente.id,
          erro: hookErr.message,
        });
        hooksResult = { ok: false, erro: hookErr.message };
      }
    }

    return {
      success: true,
      acao: existingFocus ? 'ATUALIZADA' : 'CRIADA',
      focus_empresa_id: focusEmpresaId,
      ambiente_ativo: ambienteAtivo,
      tem_token_homologacao: Boolean(plainHomolog),
      tem_token_producao: Boolean(plainProd),
      certificado_enviado: Boolean(cert),
      certificado_valido_ate: certValidoAte,
      logo_sincronizada: logoSincronizada,
      webhooks: hooksResult,
      mensagem: existingFocus
        ? `Empresa sincronizada com sucesso na Focus NFe (ID #${focusEmpresaId}).`
        : `Empresa cadastrada e habilitada com sucesso na Focus NFe (ID #${focusEmpresaId})!`,
    };
  }

  /**
   * Sincroniza exclusivamente a logomarca (arquivo_logo_base64 ou delete_logo) na empresa Focus NFe (/v2/empresas/{id}),
   * para impressão automática no cabeçalho do DACTE (CT-e), DAMDFE (MDF-e) e DANFE (NF-e).
   */
  static async sincronizarLogoFocus(tenantId, emitenteId = null, { deleteLogo = false } = {}) {
    const emitente = await this.getEmitente(tenantId, emitenteId);
    if (!emitente || !emitente.id) {
      throw new Error('Salve os Dados da Empresa antes de sincronizar a logomarca.');
    }

    const masterCfg = await this.getMasterFocusConfig();
    if (!masterCfg.temMasterToken) {
      return {
        focus_sincronizado: false,
        motivo: 'SEM_MASTER_TOKEN',
        mensagem:
          'Logomarca salva no sistema. Quando o Token Principal Focus NFe (Software House) estiver ativo, clique em Sincronizar na Focus NFe para enviá-la ao DACTE/DANFE.',
      };
    }

    const reseller = FocusClient.forReseller(masterCfg.masterToken);

    let existingFocus = null;
    if (emitente.focus_empresa_id) {
      try {
        existingFocus = await reseller.consultarEmpresa(emitente.focus_empresa_id);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    }
    if (!existingFocus && validarCnpjReal(emitente.cnpj)) {
      const encontradas = await reseller.listarEmpresas({ cnpj: emitente.cnpj });
      existingFocus =
        encontradas.find((e) => digitsOnly(e.cnpj) === digitsOnly(emitente.cnpj)) || null;
    }

    if (!existingFocus) {
      if (deleteLogo) {
        return {
          focus_sincronizado: false,
          motivo: 'EMPRESA_NAO_PROVISIONADA',
          mensagem: 'Logomarca removida localmente.',
        };
      }
      if (validarCnpjReal(emitente.cnpj) && emitente.inscricao_estadual) {
        const prov = await this.provisionarEmpresaFocus(tenantId, emitente.id, {
          registrarWebhooks: true,
          incluirCertificado: true,
          deleteLogo: false,
        });
        return {
          focus_sincronizado: true,
          focus_empresa_id: prov.focus_empresa_id,
          acao: 'PROVISIONADA_COM_LOGO',
          mensagem: `Logomarca salva e empresa sincronizada na Focus NFe (ID #${prov.focus_empresa_id})! Os próximos DACTEs/DAMDFEs/DANFEs já sairão com a logo.`,
        };
      }
      return {
        focus_sincronizado: false,
        motivo: 'DADOS_FISCAIS_PENDENTES',
        mensagem:
          'Logomarca salva no sistema! Conclua o CNPJ/IE e clique em Provisionar na Focus NFe para ativá-la no DACTE.',
      };
    }

    const logoPayload = deleteLogo
      ? { delete_logo: true }
      : {
          arquivo_logo_base64: this.normalizarLogoBase64(emitente.logo_base64).rawBase64,
          delete_logo: false,
        };

    const resEmpresa = await reseller.atualizarEmpresa(existingFocus.id, logoPayload);
    const focusEmpresaId = String(resEmpresa?.id || existingFocus.id);

    await db.query(
      `UPDATE dash_emitentes SET
          focus_empresa_id = COALESCE($1, focus_empresa_id),
          logo_focus_sincronizada = $2,
          focus_sincronizado_em = NOW(),
          focus_ultimo_erro = NULL,
          updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [focusEmpresaId, !deleteLogo, emitente.id, tenantId]
    );

    return {
      focus_sincronizado: true,
      focus_empresa_id: focusEmpresaId,
      acao: deleteLogo ? 'LOGO_REMOVIDA_FOCUS' : 'LOGO_ATUALIZADA_FOCUS',
      mensagem: deleteLogo
        ? `Logomarca removida com sucesso do cadastro e da Focus NFe (Empresa ID #${focusEmpresaId}).`
        : `Logomarca salva e sincronizada com sucesso na Focus NFe (Empresa ID #${focusEmpresaId})! Os próximos CT-es, MDF-es e NF-es emitidos já trarão a logo impressa no DACTE/DAMDFE/DANFE.`,
    };
  }

  /**
   * Consulta dados oficiais de CNPJ, Inscrição Estadual ativa na SEFAZ, Regime Tributário,
   * Endereço e Código IBGE via bases públicas (publica.cnpj.ws / open.cnpja.com) + registro ANTT.
   */
  static async consultarCnpjReceita(cnpjInput) {
    const cnpj = digitsOnly(cnpjInput);
    if (!validarCnpjReal(cnpj)) {
      throw new Error('Informe um CNPJ válido de 14 dígitos.');
    }

    const fallbackKnown = KNOWN_ANTT_FISCAL_REGISTRY[cnpj] || null;

    // 1. Tenta publica.cnpj.ws (retorna IE ativa SEFAZ + Simples + IBGE 7 dígitos)
    try {
      const resp = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const d = await resp.json();
        const est = d.estabelecimento || {};
        const uf = String(est.estado?.sigla || fallbackKnown?.uf || '').toUpperCase();
        const ies = Array.isArray(est.inscricoes_estaduais) ? est.inscricoes_estaduais : [];
        const ieAtivaUf =
          ies.find((x) => x.ativo && String(x.estado?.sigla || '').toUpperCase() === uf) ||
          ies.find((x) => x.ativo) ||
          ies[0];
        const ieNumero = digitsOnly(ieAtivaUf?.inscricao_estadual || fallbackKnown?.inscricao_estadual || '');
        const optanteSimples = String(d.simples?.simples || '').toLowerCase() === 'sim';
        const logradouroCompleto = [est.tipo_logradouro, est.logradouro]
          .filter(Boolean)
          .join(' ')
          .trim();
        const fone = [est.ddd1, est.telefone1].filter(Boolean).join('').replace(/\D/g, '');

        return {
          cnpj,
          razao_social: String(d.razao_social || fallbackKnown?.razao_social || '').trim(),
          nome_fantasia: String(
            est.nome_fantasia || fallbackKnown?.nome_fantasia || d.razao_social || ''
          ).trim(),
          inscricao_estadual: ieNumero || fallbackKnown?.inscricao_estadual || '',
          rntrc: fallbackKnown?.rntrc || '',
          regime_tributario: optanteSimples ? '1' : fallbackKnown?.regime_tributario || '3',
          logradouro: logradouroCompleto || fallbackKnown?.logradouro || '',
          numero: String(est.numero || fallbackKnown?.numero || 'SN').trim(),
          complemento: String(est.complemento || fallbackKnown?.complemento || '').trim(),
          bairro: String(est.bairro || fallbackKnown?.bairro || '').trim(),
          cep: digitsOnly(est.cep || fallbackKnown?.cep || ''),
          uf,
          municipio: String(est.cidade?.nome || fallbackKnown?.municipio || '').trim(),
          codigo_municipio: String(est.cidade?.ibge_id || fallbackKnown?.codigo_municipio || '').trim(),
          telefone: fone || fallbackKnown?.telefone || '',
          email: String(est.email || '').trim().toLowerCase(),
        };
      }
    } catch (err) {
      logger.warn('[CNPJ Lookup] Aviso em publica.cnpj.ws:', { cnpj, erro: err.message });
    }

    // 2. Fallback open.cnpja.com
    try {
      const resp2 = await fetch(`https://open.cnpja.com/office/${cnpj}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (resp2.ok) {
        const d2 = await resp2.json();
        const addr = d2.address || {};
        const regs = Array.isArray(d2.registrations) ? d2.registrations : [];
        const uf = String(addr.state || fallbackKnown?.uf || '').toUpperCase();
        const regAtiva =
          regs.find((r) => r.enabled && String(r.state || '').toUpperCase() === uf) ||
          regs.find((r) => r.enabled) ||
          regs[0];
        const optanteSimples = Boolean(d2.company?.simples?.optant);
        const foneObj = Array.isArray(d2.phones) && d2.phones[0] ? d2.phones[0] : null;
        const fone = foneObj ? digitsOnly(`${foneObj.area || ''}${foneObj.number || ''}`) : '';
        const mailObj = Array.isArray(d2.emails) && d2.emails[0] ? d2.emails[0] : null;

        return {
          cnpj,
          razao_social: String(d2.company?.name || fallbackKnown?.razao_social || '').trim(),
          nome_fantasia: String(d2.alias || fallbackKnown?.nome_fantasia || d2.company?.name || '').trim(),
          inscricao_estadual: digitsOnly(regAtiva?.number || fallbackKnown?.inscricao_estadual || ''),
          rntrc: fallbackKnown?.rntrc || '',
          regime_tributario: optanteSimples ? '1' : fallbackKnown?.regime_tributario || '3',
          logradouro: String(addr.street || fallbackKnown?.logradouro || '').trim(),
          numero: String(addr.number || fallbackKnown?.numero || 'SN').trim(),
          complemento: String(addr.details || fallbackKnown?.complemento || '').trim(),
          bairro: String(addr.district || fallbackKnown?.bairro || '').trim(),
          cep: digitsOnly(addr.zip || fallbackKnown?.cep || ''),
          uf,
          municipio: String(addr.city || fallbackKnown?.municipio || '').trim(),
          codigo_municipio: String(addr.municipality || fallbackKnown?.codigo_municipio || '').trim(),
          telefone: fone || fallbackKnown?.telefone || '',
          email: String(mailObj?.address || '').trim().toLowerCase(),
        };
      }
    } catch (err2) {
      logger.warn('[CNPJ Lookup] Aviso em open.cnpja.com:', { cnpj, erro: err2.message });
    }

    if (fallbackKnown) {
      return { ...fallbackKnown, email: '' };
    }

    throw new Error('Não foi possível consultar os dados deste CNPJ automaticamente no momento.');
  }

  /**
   * Extrai um CNPJ válido de 14 dígitos do nome do arquivo .pfx ou do conteúdo binário ICP-Brasil.
   */
  static extrairCnpjDoCertificado(nomeArquivo, encryptedPfxBuffer) {
    const candidatesFromName = String(nomeArquivo || '').match(/\d{14}/g) || [];
    for (const cand of candidatesFromName) {
      if (validarCnpjReal(cand)) return cand;
    }

    if (encryptedPfxBuffer && Buffer.isBuffer(encryptedPfxBuffer) && encryptedPfxBuffer.length > 0) {
      try {
        const rawBuf = decryptBuffer(encryptedPfxBuffer);
        const ascii = rawBuf.toString('latin1');
        const colonMatches = ascii.match(/:(\d{14})/g) || [];
        for (const m of colonMatches) {
          const clean = m.slice(1);
          if (validarCnpjReal(clean)) return clean;
        }
        const anyMatches = ascii.match(/\d{14}/g) || [];
        for (const cand of anyMatches) {
          if (validarCnpjReal(cand)) return cand;
        }
      } catch {
        // Ignora caso não seja possível extrair do binário cifrado
      }
    }
    return null;
  }

  /**
   * Auto-hidrata o cadastro fiscal de dash_emitentes a partir do Certificado A1 salvo (quando o emitente
   * ainda está com CNPJ placeholder como "1" ou sem IE/RNTRC) e sincroniza automaticamente na Focus NFe.
   */
  static async autoHidratarEmitentePeloCertificado(tenantId) {
    if (!tenantId || tenantId === '00000000-0000-0000-0000-000000000000') return;
    if (inFlightAutoHidratacao.has(tenantId)) {
      return inFlightAutoHidratacao.get(tenantId);
    }

    const task = (async () => {
      try {
        const { rows } = await db.query(
          `SELECT e.*,
                  c.id AS cert_id,
                  c.nome_arquivo AS cert_nome_arquivo,
                  c.arquivo_pfx AS cert_arquivo_pfx,
                  COALESCE(c.focus_sincronizado, FALSE) AS cert_focus_sincronizado
           FROM dash_emitentes e
           LEFT JOIN dash_certificados c ON c.emitente_id = e.id AND c.tenant_id = e.tenant_id
           WHERE e.tenant_id = $1
           ORDER BY e.id ASC`,
          [tenantId]
        );

        for (const row of rows) {
          const cnpjAtualValido = validarCnpjReal(row.cnpj);
          const cnpjCert = row.cert_id
            ? this.extrairCnpjDoCertificado(row.cert_nome_arquivo, row.cert_arquivo_pfx)
            : null;

          const targetCnpj = cnpjAtualValido ? digitsOnly(row.cnpj) : cnpjCert;
          if (!targetCnpj || !validarCnpjReal(targetCnpj)) continue;

          const razaoPlaceholder = ['YMANARU', 'EMPRESA EMITENTE', ''].includes(
            String(row.razao_social || '').trim().toUpperCase()
          );
          const faltaDadosEssenciais =
            !cnpjAtualValido ||
            razaoPlaceholder ||
            !String(row.inscricao_estadual || '').trim() ||
            (!String(row.rntrc || '').trim() && Boolean(KNOWN_ANTT_FISCAL_REGISTRY[targetCnpj]?.rntrc)) ||
            digitsOnly(row.cep).length !== 8;

          if (faltaDadosEssenciais) {
            try {
              const dados = await this.consultarCnpjReceita(targetCnpj);
              await db.query(
                `UPDATE dash_emitentes SET
                    cnpj = $1,
                    razao_social = $2,
                    nome_fantasia = $3,
                    inscricao_estadual = COALESCE(NULLIF($4, ''), inscricao_estadual),
                    rntrc = COALESCE(NULLIF($5, ''), rntrc),
                    regime_tributario = $6,
                    logradouro = COALESCE(NULLIF($7, ''), logradouro),
                    numero = COALESCE(NULLIF($8, ''), numero),
                    complemento = COALESCE(NULLIF($9, ''), complemento),
                    bairro = COALESCE(NULLIF($10, ''), bairro),
                    cep = COALESCE(NULLIF($11, ''), cep),
                    uf = COALESCE(NULLIF($12, ''), uf),
                    municipio = COALESCE(NULLIF($13, ''), municipio),
                    codigo_municipio = COALESCE(NULLIF($14, ''), codigo_municipio),
                    telefone = COALESCE(NULLIF($15, ''), telefone),
                    email = COALESCE(NULLIF($16, ''), email),
                    cfop_padrao_cte = COALESCE(NULLIF(cfop_padrao_cte, ''), '5353'),
                    natureza_padrao_cte = COALESCE(NULLIF(natureza_padrao_cte, ''), 'PRESTACAO DE SERVICO DE TRANSPORTE'),
                    aliquota_icms_padrao = COALESCE(aliquota_icms_padrao, 12.00),
                    updated_at = NOW()
                 WHERE id = $17 AND tenant_id = $18`,
                [
                  dados.cnpj,
                  dados.razao_social || row.razao_social,
                  dados.nome_fantasia || dados.razao_social || row.nome_fantasia,
                  dados.inscricao_estadual,
                  dados.rntrc,
                  dados.regime_tributario || row.regime_tributario || '3',
                  dados.logradouro,
                  dados.numero,
                  dados.complemento,
                  dados.bairro,
                  dados.cep,
                  dados.uf,
                  dados.municipio,
                  dados.codigo_municipio,
                  dados.telefone,
                  dados.email,
                  row.id,
                  tenantId,
                ]
              );
              logger.info('[AutoHidratacao] Dados da Empresa preenchidos automaticamente via CNPJ/Certificado', {
                tenantId,
                emitenteId: row.id,
                cnpj: dados.cnpj,
                razaoSocial: dados.razao_social,
              });
            } catch (enrichErr) {
              logger.warn('[AutoHidratacao] Aviso ao enriquecer emitente:', {
                tenantId,
                emitenteId: row.id,
                erro: enrichErr.message,
              });
            }
          }

          if (row.cert_id && !row.cert_focus_sincronizado && !row.focus_ultimo_erro) {
            const masterCfg = await this.getMasterFocusConfig();
            if (masterCfg.temMasterToken) {
              try {
                await this.provisionarEmpresaFocus(tenantId, row.id, {
                  incluirCertificado: true,
                  registrarWebhooks: true,
                });
                logger.info('[AutoHidratacao] Emitente e Certificado A1 provisionados automaticamente na Focus NFe', {
                  tenantId,
                  emitenteId: row.id,
                });
              } catch (provErr) {
                logger.warn('[AutoHidratacao] Aviso ao provisionar automaticamente na Focus NFe:', {
                  tenantId,
                  emitenteId: row.id,
                  erro: provErr.message,
                });
              }
            }
          }
        }
      } catch (err) {
        logger.warn('[AutoHidratacao] Erro geral silencioso:', { tenantId, erro: err.message });
      }
    })();

    inFlightAutoHidratacao.set(tenantId, task);
    try {
      await task;
    } finally {
      inFlightAutoHidratacao.delete(tenantId);
    }
  }

  /**
   * Registra automaticamente os Webhooks de CT-e e MDF-e (/v2/hooks) nos ambientes com token disponível,
   * protegendo o endpoint público com segredo criptográfico por tenant (header X-Focus-Token).
   */
  static async registrarWebhooksFocus(tenantId, emitenteId = null) {
    const emitente = await this.getEmitente(tenantId, emitenteId);
    if (!emitente || !validarCnpjReal(emitente.cnpj)) {
      throw new Error('Cadastre um CNPJ válido de 14 dígitos na empresa antes de registrar webhooks.');
    }

    const masterCfg = await this.getMasterFocusConfig();
    const webhookUrl = masterCfg.webhookEndpoint;

    // Garante segredo exclusivo por tenant em dash_integracoes_config
    const cfgRes = await db
      .query(
        `SELECT focus_webhook_secret FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      )
      .catch(() => ({ rows: [] }));

    let plainWebhookSecret = decryptSecret(cfgRes.rows[0]?.focus_webhook_secret || '');
    if (!plainWebhookSecret) {
      plainWebhookSecret = crypto.randomBytes(24).toString('hex');
      const encSecret = encryptSecret(plainWebhookSecret);
      if (cfgRes.rows.length > 0) {
        await db.query(
          `UPDATE dash_integracoes_config SET focus_webhook_secret = $1, updated_at = NOW() WHERE tenant_id = $2`,
          [encSecret, tenantId]
        );
      } else {
        await db
          .query(
            `INSERT INTO dash_integracoes_config (tenant_id, focus_webhook_secret, updated_at)
             VALUES ($1, $2, NOW())`,
            [tenantId, encSecret]
          )
          .catch(() => {});
      }
    }

    const ambientesAlvo = [];
    if (emitente.focus_token_homologacao) {
      ambientesAlvo.push({ ambiente: 'homologacao', token: emitente.focus_token_homologacao });
    }
    if (emitente.focus_token_producao) {
      ambientesAlvo.push({ ambiente: 'producao', token: emitente.focus_token_producao });
    }
    if (ambientesAlvo.length === 0 && emitente.focus_token) {
      ambientesAlvo.push({ ambiente: emitente.focus_ambiente, token: emitente.focus_token });
    }
    if (ambientesAlvo.length === 0) {
      throw new Error('Nenhum token Focus NFe configurado para registrar webhooks.');
    }

    const detalhes = [];
    let registradosCount = 0;

    for (const alvo of ambientesAlvo) {
      const client = new FocusClient({
        token: alvo.token,
        ambiente: alvo.ambiente,
      });

      let hooksExistentes = [];
      try {
        hooksExistentes = await client.listarHooks();
      } catch (_) {
        hooksExistentes = [];
      }

      for (const event of ['cte', 'mdfe']) {
        const jaExiste = hooksExistentes.some(
          (h) =>
            String(h.event || '').toLowerCase() === event &&
            digitsOnly(h.cnpj || '') === emitente.cnpj &&
            String(h.url || '').replace(/\/+$/, '') === webhookUrl.replace(/\/+$/, '')
        );

        if (jaExiste) {
          detalhes.push({ ambiente: alvo.ambiente, event, status: 'JA_ATIVO' });
          registradosCount++;
          continue;
        }

        const criado = await client.criarHook({
          cnpj: emitente.cnpj,
          event,
          url: webhookUrl,
          authorization: plainWebhookSecret,
          authorization_header: 'X-Focus-Token',
        });
        detalhes.push({ ambiente: alvo.ambiente, event, status: 'CRIADO', id: criado?.id });
        registradosCount++;
      }
    }

    if (emitente.id && registradosCount > 0) {
      await db
        .query(
          `UPDATE dash_emitentes SET focus_hooks_ativos = TRUE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [emitente.id, tenantId]
        )
        .catch(() => {});
    }

    return {
      ok: true,
      url: webhookUrl,
      registrados: registradosCount,
      detalhes,
    };
  }

  /**
   * Baixa o XML ou PDF (DACTE / DAMDFE) de um documento autorizado como Buffer autenticado.
   * Se o caminho ainda não estiver gravado no banco, sincroniza automaticamente com a Focus NFe.
   */
  static async baixarArtefatoDocumento(tenantId, tipo, docId, formato = 'pdf') {
    const tipoUpper = String(tipo || 'CTE').toUpperCase();
    const tabela = tipoUpper === 'MDFE' ? 'dash_mdfes' : 'dash_ctes';
    const { rows } = await db.query(
      `SELECT * FROM ${tabela} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [docId, tenantId]
    );
    if (rows.length === 0) {
      throw new Error('Documento fiscal não encontrado.');
    }

    let doc = rows[0];
    const fmt = String(formato || 'pdf').toLowerCase();
    const resolveRawPath = (d) =>
      fmt === 'xml'
        ? d?.caminho_xml
        : tipoUpper === 'MDFE'
        ? d?.caminho_damdfe
        : d?.caminho_dacte;

    let rawPath = resolveRawPath(doc);

    if (!rawPath && doc.ref) {
      try {
        const syncRes =
          tipoUpper === 'MDFE'
            ? await this.consultarMdfeFocus(tenantId, docId)
            : await this.consultarCteFocus(tenantId, docId);
        const refreshed = await db.query(
          `SELECT * FROM ${tabela} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [docId, tenantId]
        );
        if (refreshed.rows[0]) {
          doc = refreshed.rows[0];
          rawPath = resolveRawPath(doc);
        }
        if (!rawPath && syncRes) {
          rawPath =
            fmt === 'xml'
              ? syncRes.caminho_xml
              : tipoUpper === 'MDFE'
              ? syncRes.caminho_damdfe
              : syncRes.caminho_dacte;
        }
      } catch (_) {
        // segue para verificação de rawPath abaixo
      }
    }

    if (!rawPath) {
      throw new Error(
        `Arquivo ${fmt.toUpperCase()} ainda não disponível para este documento (aguarde autorização da SEFAZ).`
      );
    }

    const { client } = await this.getFocusClient(tenantId, doc.emitente_id);
    const buffer = await client.downloadArquivo(rawPath);
    const chaveOuRef = doc.chave_cte || doc.chave_mdfe || doc.ref || doc.id;
    return {
      buffer,
      contentType: fmt === 'xml' ? 'application/xml; charset=utf-8' : 'application/pdf',
      filename: `${tipoUpper.toLowerCase()}-${chaveOuRef}.${fmt === 'xml' ? 'xml' : 'pdf'}`,
    };
  }

  // ─────────────────────────────────────────────────────────
  // MDe (/v2/nfes_recebidas) & IMPORTAÇÃO DE XML DE NF-e NA CENTRAL DE CARGAS
  // ─────────────────────────────────────────────────────────

  static async upsertCargaFromNfeData(tenantId, nfeParsed, { origem = 'XML', extraMeta = {} } = {}) {
    const chave = digitsOnly(nfeParsed?.chave_acesso);
    if (chave.length !== 44) {
      throw new Error('Chave de acesso inválida para registro na Central de Cargas.');
    }

    const rem = nfeParsed.remetente || {};
    const dest = nfeParsed.destinatario || {};
    const dadosNfe = {
      origem,
      natureza: nfeParsed.natureza || '',
      protocolo: nfeParsed.protocolo || '',
      remetente: rem,
      destinatario: dest,
      itens: Array.isArray(nfeParsed.itens) ? nfeParsed.itens : [],
      ...extraMeta,
    };

    const { rows } = await db.query(
      `INSERT INTO dash_cargas (
          tenant_id, tipo_documento, chave_acesso, numero, serie, data_emissao,
          remetente_documento, remetente_nome, remetente_municipio, remetente_uf,
          destinatario_documento, destinatario_nome, destinatario_municipio, destinatario_uf,
          valor_total, valor_produtos, peso_bruto, peso_liquido, volumes, especie,
          produto_predominante, status, dados_nfe, sincronizado_em, updated_at
       ) VALUES (
          $1, 'NFE', $2, $3, $4, $5::timestamptz,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, 'PENDENTE', $21::jsonb, NOW(), NOW()
       )
       ON CONFLICT (tenant_id, chave_acesso) DO UPDATE SET
          numero = COALESCE(NULLIF(EXCLUDED.numero, ''), dash_cargas.numero),
          serie = COALESCE(NULLIF(EXCLUDED.serie, ''), dash_cargas.serie),
          data_emissao = COALESCE(EXCLUDED.data_emissao, dash_cargas.data_emissao),
          remetente_documento = COALESCE(NULLIF(EXCLUDED.remetente_documento, ''), dash_cargas.remetente_documento),
          remetente_nome = COALESCE(NULLIF(EXCLUDED.remetente_nome, ''), dash_cargas.remetente_nome),
          remetente_municipio = COALESCE(NULLIF(EXCLUDED.remetente_municipio, ''), dash_cargas.remetente_municipio),
          remetente_uf = COALESCE(NULLIF(EXCLUDED.remetente_uf, ''), dash_cargas.remetente_uf),
          destinatario_documento = COALESCE(NULLIF(EXCLUDED.destinatario_documento, ''), dash_cargas.destinatario_documento),
          destinatario_nome = COALESCE(NULLIF(EXCLUDED.destinatario_nome, ''), dash_cargas.destinatario_nome),
          destinatario_municipio = COALESCE(NULLIF(EXCLUDED.destinatario_municipio, ''), dash_cargas.destinatario_municipio),
          destinatario_uf = COALESCE(NULLIF(EXCLUDED.destinatario_uf, ''), dash_cargas.destinatario_uf),
          valor_total = CASE WHEN EXCLUDED.valor_total > 0 THEN EXCLUDED.valor_total ELSE dash_cargas.valor_total END,
          valor_produtos = CASE WHEN EXCLUDED.valor_produtos > 0 THEN EXCLUDED.valor_produtos ELSE dash_cargas.valor_produtos END,
          peso_bruto = CASE WHEN EXCLUDED.peso_bruto > 0 THEN EXCLUDED.peso_bruto ELSE dash_cargas.peso_bruto END,
          peso_liquido = CASE WHEN EXCLUDED.peso_liquido > 0 THEN EXCLUDED.peso_liquido ELSE dash_cargas.peso_liquido END,
          volumes = CASE WHEN EXCLUDED.volumes > 0 THEN EXCLUDED.volumes ELSE dash_cargas.volumes END,
          produto_predominante = COALESCE(NULLIF(EXCLUDED.produto_predominante, ''), dash_cargas.produto_predominante),
          dados_nfe = dash_cargas.dados_nfe || EXCLUDED.dados_nfe,
          sincronizado_em = NOW(),
          updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        chave,
        String(nfeParsed.numero || parseInt(chave.slice(25, 34), 10)),
        String(nfeParsed.serie || parseInt(chave.slice(22, 25), 10)),
        nfeParsed.data_emissao || new Date().toISOString(),
        digitsOnly(rem.documento || '') || null,
        rem.razao_social || null,
        rem.municipio || null,
        rem.uf ? String(rem.uf).slice(0, 2).toUpperCase() : null,
        digitsOnly(dest.documento || '') || null,
        dest.razao_social || null,
        dest.municipio || null,
        dest.uf ? String(dest.uf).slice(0, 2).toUpperCase() : null,
        parseFloat(nfeParsed.valor_total || 0),
        parseFloat(nfeParsed.valor_produtos || nfeParsed.valor_total || 0),
        parseFloat(nfeParsed.peso_bruto || 0),
        parseFloat(nfeParsed.peso_liquido || 0),
        parseInt(nfeParsed.volumes || 1, 10) || 1,
        nfeParsed.especie || 'VOLUMES',
        nfeParsed.produto_predominante || 'MERCADORIA EM GERAL',
        JSON.stringify(dadosNfe),
      ]
    );

    // Atualiza também o catálogo dash_partes para remetente e destinatário quando completos
    for (const p of [rem, dest]) {
      const docLimpo = digitsOnly(p?.documento || '');
      if ((docLimpo.length === 14 || docLimpo.length === 11) && p?.razao_social) {
        await db
          .query(
            `INSERT INTO dash_partes (
                tenant_id, documento, tipo_documento, razao_social, nome_fantasia,
                inscricao_estadual, indicador_ie, logradouro, numero, complemento,
                bairro, cep, codigo_municipio, municipio, uf, telefone, email
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             ON CONFLICT (tenant_id, documento) DO UPDATE SET
                razao_social = COALESCE(NULLIF(EXCLUDED.razao_social, ''), dash_partes.razao_social),
                inscricao_estadual = COALESCE(NULLIF(EXCLUDED.inscricao_estadual, ''), dash_partes.inscricao_estadual),
                logradouro = COALESCE(NULLIF(EXCLUDED.logradouro, ''), dash_partes.logradouro),
                numero = COALESCE(NULLIF(EXCLUDED.numero, ''), dash_partes.numero),
                bairro = COALESCE(NULLIF(EXCLUDED.bairro, ''), dash_partes.bairro),
                cep = COALESCE(NULLIF(EXCLUDED.cep, ''), dash_partes.cep),
                codigo_municipio = COALESCE(NULLIF(EXCLUDED.codigo_municipio, ''), dash_partes.codigo_municipio),
                municipio = COALESCE(NULLIF(EXCLUDED.municipio, ''), dash_partes.municipio),
                uf = COALESCE(NULLIF(EXCLUDED.uf, ''), dash_partes.uf),
                updated_at = NOW()`,
            [
              tenantId,
              docLimpo,
              docLimpo.length === 11 ? 'CPF' : 'CNPJ',
              p.razao_social,
              p.nome_fantasia || p.razao_social,
              p.inscricao_estadual || null,
              p.indicador_ie || '9',
              p.logradouro || null,
              p.numero || null,
              p.complemento || null,
              p.bairro || null,
              p.cep || null,
              p.codigo_municipio || null,
              p.municipio || null,
              p.uf || null,
              p.telefone || null,
              p.email || null,
            ]
          )
          .catch(() => {});
      }
    }

    return rows[0];
  }

  /**
   * Importa um lote de arquivos XML de NF-e enviados pelo operador direto para a Central de Cargas.
   */
  static async importarXmlsNfe(tenantId, arquivos = []) {
    if (!Array.isArray(arquivos) || arquivos.length === 0) {
      throw new Error('Envie ao menos um arquivo XML de NF-e para importar.');
    }

    let importadas = 0;
    const erros = [];
    const cargas = [];

    for (const item of arquivos) {
      const nomeArquivo = item?.nome || item?.filename || 'nfe.xml';
      try {
        const xmlTexto = item?.xml
          ? String(item.xml)
          : item?.base64
          ? Buffer.from(String(item.base64), 'base64').toString('utf8')
          : '';
        const parsed = parseNfeXml(xmlTexto);
        const carga = await this.upsertCargaFromNfeData(tenantId, parsed, {
          origem: 'UPLOAD_XML',
          extraMeta: { arquivo_xml: nomeArquivo },
        });
        cargas.push(carga);
        importadas++;
      } catch (err) {
        erros.push({ arquivo: nomeArquivo, erro: err.message });
      }
    }

    return {
      success: importadas > 0 || erros.length === 0,
      importadas,
      total_enviadas: arquivos.length,
      erros,
      cargas,
    };
  }

  /**
   * Sincroniza NF-es destinadas/recebidas na SEFAZ via Focus MDe (/v2/nfes_recebidas),
   * realizando Ciência da Operação opcional e importando automaticamente na Central de Cargas.
   */
  static async sincronizarNfesRecebidasFocus(
    tenantId,
    { emitenteId = null, ambiente = null, autoCiencia = true, desdeInicio = false } = {}
  ) {
    const emitente = await this.getEmitente(tenantId, emitenteId);
    if (!validarCnpjReal(emitente.cnpj)) {
      throw new Error(
        'CNPJ do emitente inválido. Configure o CNPJ real de 14 dígitos em Dados da Empresa.'
      );
    }

    // MDe SEFAZ opera prioritariamente em Produção; utiliza Produção se o token existir, senão usa o ambiente configurado
    const ambEfetivo =
      ambiente ||
      (emitente.focus_token_producao ? 'producao' : emitente.focus_ambiente || 'homologacao');

    const { client } = await this.getFocusClient(tenantId, emitente.id, {
      ambiente: ambEfetivo,
    });

    const versaoInicial = desdeInicio ? 0 : Number(emitente.mde_ultima_versao || 0);
    const { items, maxVersion, totalCount } = await client.listarNfesRecebidas({
      cnpj: emitente.cnpj,
      versao: versaoInicial,
    });

    let importadas = 0;
    let xmlCompletos = 0;
    let manifestadasCiencia = 0;
    const notasProcessadas = [];

    for (const nfeItem of items) {
      const chave = digitsOnly(nfeItem.chave_nfe || nfeItem.chave);
      if (chave.length !== 44) continue;

      const situacao = String(nfeItem.situacao || 'autorizada').toLowerCase();
      if (situacao === 'cancelada' || situacao === 'denegada') {
        await db
          .query(
            `UPDATE dash_cargas SET status = 'CANCELADA', updated_at = NOW()
             WHERE tenant_id = $1 AND chave_acesso = $2`,
            [tenantId, chave]
          )
          .catch(() => {});
        continue;
      }

      let manifestacaoAtual = nfeItem.manifestacao_destinatario || null;
      if (autoCiencia && !manifestacaoAtual) {
        try {
          await client.manifestarNfeRecebida(chave, { tipo: 'ciencia' });
          manifestacaoAtual = 'ciencia';
          manifestadasCiencia++;
        } catch (manErr) {
          logger.info(`[MDe Focus] Ciência não aplicada na chave ${chave}: ${manErr.message}`);
        }
      }

      let parsedFull = null;
      try {
        const xml = await client.baixarXmlNfeRecebida(chave);
        if (xml && xml.includes('infNFe')) {
          parsedFull = parseNfeXml(xml);
          xmlCompletos++;
        }
      } catch (_) {
        parsedFull = null;
      }

      if (parsedFull) {
        const saved = await this.upsertCargaFromNfeData(tenantId, parsedFull, {
          origem: 'FOCUS_MDE',
          extraMeta: {
            mde_versao: nfeItem.versao,
            manifestacao_destinatario: manifestacaoAtual,
            mde_completo: true,
          },
        });
        notasProcessadas.push(saved);
        importadas++;
      } else {
        // Salva resumo oficial da SEFAZ enquanto a Receita libera o XML completo após a Ciência
        const docEmit = digitsOnly(nfeItem.documento_emitente || chave.slice(6, 20));
        const ufEmit = IBGE_UF_BY_CODE[chave.slice(0, 2)] || emitente.uf || 'MS';
        const resumoData = {
          chave_acesso: chave,
          numero: String(parseInt(chave.slice(25, 34), 10)),
          serie: String(parseInt(chave.slice(22, 25), 10)),
          data_emissao: nfeItem.data_emissao || new Date().toISOString(),
          valor_total: parseFloat(nfeItem.valor_total || 0) || 0,
          valor_produtos: parseFloat(nfeItem.valor_total || 0) || 0,
          peso_bruto: 0,
          volumes: 1,
          produto_predominante: 'NF-E DESTINADA (SEFAZ MDE)',
          remetente: {
            documento: docEmit,
            razao_social: nfeItem.nome_emitente || `EMITENTE CNPJ ${docEmit}`,
            inscricao_estadual: nfeItem.inscricao_estadual_emitente || '',
            uf: ufEmit,
          },
          destinatario: {
            documento: emitente.cnpj,
            razao_social: emitente.razao_social,
            inscricao_estadual: emitente.inscricao_estadual,
            logradouro: emitente.logradouro,
            numero: emitente.numero,
            bairro: emitente.bairro,
            cep: emitente.cep,
            codigo_municipio: emitente.codigo_municipio,
            municipio: emitente.municipio,
            uf: emitente.uf,
          },
        };
        const saved = await this.upsertCargaFromNfeData(tenantId, resumoData, {
          origem: 'FOCUS_MDE_RESUMO',
          extraMeta: {
            mde_versao: nfeItem.versao,
            manifestacao_destinatario: manifestacaoAtual,
            mde_completo: false,
          },
        });
        notasProcessadas.push(saved);
        importadas++;
      }
    }

    if (emitente.id && maxVersion > versaoInicial) {
      await db
        .query(
          `UPDATE dash_emitentes SET mde_ultima_versao = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
          [maxVersion, emitente.id, tenantId]
        )
        .catch(() => {});
    }

    return {
      success: true,
      ambiente: ambEfetivo,
      encontradas_lote: items.length,
      total_disponivel_focus: totalCount,
      importadas,
      xml_completos: xmlCompletos,
      manifestadas_ciencia: manifestadasCiencia,
      nova_versao_mde: Math.max(maxVersion, versaoInicial),
      notas: notasProcessadas,
    };
  }

  /**
   * Registra Manifestação do Destinatário (ciencia, confirmacao, desconhecimento, nao_realizada)
   * para uma NF-e de 44 dígitos na Focus NFe e atualiza o XML completo se liberado pela SEFAZ.
   */
  static async manifestarNfeFocus(
    tenantId,
    chaveInput,
    { tipo = 'ciencia', justificativa = '', emitenteId = null, ambiente = null } = {}
  ) {
    const chave = digitsOnly(chaveInput);
    if (chave.length !== 44) {
      throw new Error('Informe uma chave de acesso válida de 44 dígitos da NF-e.');
    }

    const tiposValidos = ['ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada'];
    const tipoNorm = String(tipo || '').toLowerCase().trim();
    if (!tiposValidos.includes(tipoNorm)) {
      throw new Error(`Tipo de manifestação inválido. Use: ${tiposValidos.join(', ')}.`);
    }
    if (tipoNorm === 'nao_realizada' && String(justificativa || '').trim().length < 15) {
      throw new Error(
        'Para "Operação não Realizada", a SEFAZ exige justificativa com no mínimo 15 caracteres.'
      );
    }

    const emitente = await this.getEmitente(tenantId, emitenteId);
    const ambEfetivo =
      ambiente ||
      (emitente.focus_token_producao ? 'producao' : emitente.focus_ambiente || 'homologacao');

    const { client } = await this.getFocusClient(tenantId, emitente.id, {
      ambiente: ambEfetivo,
    });

    const resManifesto = await client.manifestarNfeRecebida(chave, {
      tipo: tipoNorm,
      justificativa,
    });

    // Se for ciência ou confirmação, tenta enriquecer imediatamente com o XML completo caso já liberado
    let xmlEnriquecido = false;
    if (tipoNorm === 'ciencia' || tipoNorm === 'confirmacao') {
      try {
        const xml = await client.baixarXmlNfeRecebida(chave);
        if (xml && xml.includes('infNFe')) {
          const parsed = parseNfeXml(xml);
          await this.upsertCargaFromNfeData(tenantId, parsed, {
            origem: 'FOCUS_MDE',
            extraMeta: { manifestacao_destinatario: tipoNorm, mde_completo: true },
          });
          xmlEnriquecido = true;
        }
      } catch (_) {
        xmlEnriquecido = false;
      }
    }

    if (!xmlEnriquecido) {
      await db
        .query(
          `UPDATE dash_cargas
           SET dados_nfe = jsonb_set(COALESCE(dados_nfe, '{}'::jsonb), '{manifestacao_destinatario}', to_jsonb($1::text)),
               status = CASE WHEN $1 IN ('desconhecimento', 'nao_realizada') THEN 'CANCELADA' ELSE status END,
               updated_at = NOW()
           WHERE tenant_id = $2 AND chave_acesso = $3`,
          [tipoNorm, tenantId, chave]
        )
        .catch(() => {});
    }

    return {
      success: true,
      chave,
      tipo: tipoNorm,
      xml_completo_importado: xmlEnriquecido,
      focus: resManifesto,
    };
  }
}

TransporteService.validarCnpjReal = validarCnpjReal;
TransporteService.parseNfeXml = parseNfeXml;

module.exports = TransporteService;
