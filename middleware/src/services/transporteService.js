'use strict';

const db = require('../db/postgres');
const logger = require('../config/logger');
const FocusClient = require('./focus/focusClient');

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

class TransporteService {
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

    const tokenHomologacao =
      emitente?.focus_token_homologacao ||
      cfg?.focus_token_homologacao ||
      (emitente?.focus_ambiente !== 'producao' ? emitente?.focus_token : '') ||
      '';

    const tokenProducao =
      emitente?.focus_token_producao ||
      cfg?.focus_token_producao ||
      (emitente?.focus_ambiente === 'producao' ? emitente?.focus_token : '') ||
      '';

    const tokenAtivo =
      ambiente === 'producao'
        ? tokenProducao || emitente?.focus_token || tokenHomologacao || ''
        : tokenHomologacao || emitente?.focus_token || tokenProducao || '';

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
    const client = new FocusClient({
      token: overrideOpts?.token || emitente.focus_token,
      tokenHomologacao: overrideOpts?.tokenHomologacao || emitente.focus_token_homologacao,
      tokenProducao: overrideOpts?.tokenProducao || emitente.focus_token_producao,
      ambiente: overrideOpts?.ambiente || emitente.focus_ambiente || 'homologacao',
    });
    return {
      client,
      focus: client,
      emitente,
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

    const focus = new FocusClient({
      token: token || emitente.focus_token,
      tokenHomologacao: tokenHomologacao || emitente.focus_token_homologacao,
      tokenProducao: tokenProducao || emitente.focus_token_producao,
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

    const ieRaw = String(
      exp.inscricao_estadual ??
        exp.ie ??
        nfePart.inscricao_estadual ??
        nfePart.ie ??
        cadastroParte?.inscricao_estadual ??
        (papel === 'remetente' && doc === digitsOnly(emitente?.cnpj)
          ? emitente?.inscricao_estadual
          : '') ??
        ''
    ).trim();

    return {
      documento: doc || digitsOnly(emitente?.cnpj || ''),
      razao_social: String(nome).trim(),
      nome_fantasia: String(
        exp.nome_fantasia || nfePart.nome_fantasia || cadastroParte?.nome_fantasia || nome
      ).trim(),
      inscricao_estadual: ieRaw,
      indicador_ie:
        exp.indicador_inscricao_estadual ||
        exp.indicador_ie ||
        cadastroParte?.indicador_ie ||
        (ieRaw && ieRaw.toUpperCase() !== 'ISENTO'
          ? '1'
          : ieRaw.toUpperCase() === 'ISENTO'
          ? '2'
          : '9'),
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
  static _mapearParticipanteFocus(part, sufixo, ambiente = 'homologacao') {
    const doc = digitsOnly(part.documento);
    const isCpf = doc.length === 11;
    const isHomolog = ambiente !== 'producao';
    // Regra SEFAZ CT-e em homologação: razão social de participantes pode exigir literal de homologação ou aceita o nome real (Focus NFe ajusta automaticamente, mas enviamos limpo)
    const nomeFinal = isHomolog
      ? 'CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : part.razao_social;

    const out = {};
    if (isCpf) {
      out[`cpf_${sufixo}`] = doc;
    } else {
      out[`cnpj_${sufixo}`] = doc;
    }

    if (part.inscricao_estadual && part.inscricao_estadual.toUpperCase() !== 'ISENTO') {
      out[`inscricao_estadual_${sufixo}`] = digitsOnly(part.inscricao_estadual);
    } else if (part.inscricao_estadual && part.inscricao_estadual.toUpperCase() === 'ISENTO') {
      out[`inscricao_estadual_${sufixo}`] = 'ISENTO';
    }

    out[`nome_${sufixo}`] = nomeFinal;
    if (sufixo === 'remetente' || sufixo === 'tomador') {
      out[`nome_fantasia_${sufixo}`] = isHomolog
        ? nomeFinal
        : part.nome_fantasia || part.razao_social;
    }
    out[`logradouro_${sufixo}`] = part.logradouro || 'RUA PRINCIPAL';
    out[`numero_${sufixo}`] = part.numero || 'SN';
    if (part.complemento) {
      out[`complemento_${sufixo}`] = part.complemento;
    }
    out[`bairro_${sufixo}`] = part.bairro || 'CENTRO';
    out[`codigo_municipio_${sufixo}`] = part.codigo_municipio;
    out[`municipio_${sufixo}`] = part.municipio;
    out[`cep_${sufixo}`] = digitsOnly(part.cep) || '79004000';
    out[`uf_${sufixo}`] = part.uf;
    out[`codigo_pais_${sufixo}`] = '1058';
    out[`pais_${sufixo}`] = 'BRASIL';

    if (part.telefone && part.telefone.length >= 8) {
      out[`telefone_${sufixo}`] = part.telefone;
    }
    if (part.email) {
      out[`email_${sufixo}`] = part.email;
    }
    if (sufixo === 'destinatario') {
      out.indicador_inscricao_estadual_destinatario = part.indicador_ie || '9';
      if (part.suframa) {
        out.suframa_destinatario = part.suframa;
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // CT-e (Modelo 57 - /v2/cte) e CT-e OS (Modelo 67 - /v2/cteos)
  // ─────────────────────────────────────────────────────────

  /**
   * Emite um CT-e (Modelo 57) ou CT-e OS (Modelo 67) na Focus NFe v2.
   */
  static async emitirCte(tenantId, cteId) {
    const { rows } = await db.query(
      `SELECT c.* FROM dash_ctes c WHERE c.id = $1 AND c.tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) {
      throw new Error('CT-e não encontrado.');
    }

    const cte = rows[0];
    const { client, emitente } = await this.getFocusClient(tenantId, cte.emitente_id);

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

    // Tributos ICMS + DIFAL + Reforma Tributária (IBS/CBS)
    const cstRaw = String(cte.icms_situacao_tributaria || '00').toUpperCase();
    const isSimples =
      cstRaw === 'SN' ||
      cstRaw.includes('SIMPLES') ||
      (String(emitente.regime_tributario) === '1' && cstRaw === 'SN');

    const aliquotaIcms = parseFloat(cte.aliquota_icms ?? emitente.aliquota_icms_padrao ?? 0);
    const valorIcms = parseFloat(cte.valor_icms || (baseCalculo * aliquotaIcms) / 100);
    const aliquotaIbs = parseFloat(cte.aliquota_ibs || 0);
    const aliquotaCbs = parseFloat(cte.aliquota_cbs || 0);

    const icmsFields = isSimples
      ? {
          icms_situacao_tributaria: 'SN',
          icms_simples_nacional: '1',
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

    if (Number(cte.aliquota_fcp || 0) > 0 || Number(cte.part_fcp_destino || 0) > 0) {
      icmsFields.icms_uf_fim_base_calculo = baseCalculo.toFixed(2);
      icmsFields.icms_uf_fim_aliquota_fcp = parseFloat(cte.aliquota_fcp || 0).toFixed(2);
      icmsFields.icms_uf_fim_aliquota_interna = parseFloat(cte.part_fcp_destino || 0).toFixed(2);
      icmsFields.icms_uf_fim_aliquota_interestadual = aliquotaIcms.toFixed(2);
    }

    // NF-es vinculadas (tabela dash_cte_cargas + documentos_json do wizard)
    const chavesNfeSet = new Set();
    for (const c of cargas) {
      const ch = digitsOnly(c.chave_nfe || c.chave_acesso);
      if (ch.length === 44) chavesNfeSet.add(ch);
    }
    if (Array.isArray(docsManuais)) {
      for (const d of docsManuais) {
        const ch = digitsOnly(d?.chave || d?.chave_nfe || d?.chave_acesso);
        if (ch.length === 44) chavesNfeSet.add(ch);
      }
    }
    const nfesPayload = Array.from(chavesNfeSet).map((chave_nfe) => ({ chave_nfe }));

    // Quantidades e Peso Bruto
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
              quantidade: pesoCargas.toFixed(3),
            },
            {
              codigo_unidade_medida: '03',
              tipo_medida: 'VOLUMES',
              quantidade: volumesCargas.toFixed(3),
            },
          ];

    const isCteOs =
      String(cte.modelo) === '67' ||
      String(cte.modelo_cte || '').toLowerCase() === 'cteos' ||
      String(cte.modelo_cte || '') === '67';

    const payload = {
      // Identificação
      natureza_operacao: (
        cte.natureza_operacao ||
        emitente.natureza_padrao_cte ||
        'PRESTACAO DE SERVICO DE TRANSPORTE'
      ).slice(0, 60),
      cfop: digitsOnly(cte.cfop || emitente.cfop_padrao_cte || '5353') || '5353',
      tipo_documento: finalidadeCte,
      modal: modalCodigo,
      tipo_servico: isCteOs ? (tipoServico === '0' ? '6' : tipoServico) : tipoServico,
      finalidade_cte: finalidadeCte,
      forma_emissao: '1',
      data_emissao: new Date().toISOString(),
      ...(cte.serie || emitente.serie_cte ? { serie: String(cte.serie || emitente.serie_cte) } : {}),
      ...(cte.numero ? { numero: Number(cte.numero) } : {}),
      ...(cte.modelo_cte === 'globalizado' ? { indicador_globalizado: '1' } : {}),

      // Emitente
      cnpj_emitente: digitsOnly(emitente.cnpj),
      inscricao_estadual_emitente: digitsOnly(emitente.inscricao_estadual),
      nome_emitente: emitente.razao_social,
      nome_fantasia_emitente: emitente.nome_fantasia || emitente.razao_social,
      logradouro_emitente: emitente.logradouro || 'RUA PRINCIPAL',
      numero_emitente: emitente.numero || 'SN',
      ...(emitente.complemento ? { complemento_emitente: emitente.complemento } : {}),
      bairro_emitente: emitente.bairro || 'CENTRO',
      codigo_municipio_emitente: emitente.codigo_municipio,
      municipio_emitente: emitente.municipio,
      cep_emitente: digitsOnly(emitente.cep) || '79004000',
      uf_emitente: emitente.uf,
      ...(emitente.telefone ? { telefone_emitente: digitsOnly(emitente.telefone) } : {}),
      regime_tributario_emitente: String(emitente.regime_tributario || '1'),

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

      // Retirada
      retirar_mercadoria:
        cte.retirar_mercadoria === false || cte.retirar_mercadoria === '0' ? '0' : '1',
      ...(cte.retirada_descricao ? { detalhes_retirada: cte.retirada_descricao } : {}),

      // Participantes (CT-e Modelo 57)
      ...(!isCteOs
        ? {
            tomador: codigoTomador,
            indicador_inscricao_estadual_tomador:
              codigoTomador === '0' ? remetente.indicador_ie || '9' : destinatario.indicador_ie || '9',
            ...this._mapearParticipanteFocus(remetente, 'remetente', emitente.focus_ambiente),
            ...this._mapearParticipanteFocus(destinatario, 'destinatario', emitente.focus_ambiente),
          }
        : {
            // CT-e OS (Modelo 67)
            ...this._mapearParticipanteFocus(destinatario, 'tomador', emitente.focus_ambiente),
            indicador_inscricao_estadual_tomador: destinatario.indicador_ie || '9',
          }),

      // Valores e Componentes
      valor_total: baseCalculo.toFixed(2),
      valor_receber: parseFloat(cte.valor_receber || cte.valor_total || 0).toFixed(2),
      componentes_valor: componentesFrete,

      // Tributos
      ...icmsFields,
      ...(aliquotaIbs > 0
        ? {
            ibs_aliquota: aliquotaIbs.toFixed(4),
            ibs_valor: ((baseCalculo * aliquotaIbs) / 100).toFixed(2),
          }
        : {}),
      ...(aliquotaCbs > 0
        ? {
            cbs_aliquota: aliquotaCbs.toFixed(4),
            cbs_valor: ((baseCalculo * aliquotaCbs) / 100).toFixed(2),
          }
        : {}),

      // Carga e Modal
      ...(!isCteOs
        ? {
            valor_total_carga: valorCargaFinal.toFixed(2),
            produto_predominante: cte.produto_predominante || 'MERCADORIA EM GERAL',
            ...(cte.outras_caracteristicas_carga
              ? { outras_caracteristicas_carga: cte.outras_caracteristicas_carga }
              : {}),
            quantidades: quantidadesPayload,
            ...(nfesPayload.length > 0 ? { nfes: nfesPayload } : {}),
            modal_rodoviario: {
              rntrc: digitsOnly(emitente.rntrc || '00000000').padStart(8, '0').slice(0, 8),
              ...(cte.data_prevista_entrega
                ? { data_prevista_entrega: String(cte.data_prevista_entrega).slice(0, 10) }
                : {}),
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

      // Seguro da carga
      ...(cte.seguro_nome
        ? {
            seguros_carga: [
              {
                responsavel_seguro: cte.seguro_responsavel || '4',
                nome_seguradora: cte.seguro_nome,
                ...(cte.seguro_apolice ? { numero_apolice: cte.seguro_apolice } : {}),
                ...(cte.seguro_averbacao ? { numero_averbacao: cte.seguro_averbacao } : {}),
              },
            ],
          }
        : {}),

      // Observações
      ...(cte.observacoes ? { observacoes: cte.observacoes } : {}),

      // Customizações avançadas em payload_focus
      ...(parseJsonSafe(cte.payload_focus, {}) || {}),
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
        this._mapearParticipanteFocus(expedidor, 'expedidor', emitente.focus_ambiente)
      );
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
        this._mapearParticipanteFocus(recebedor, 'recebedor', emitente.focus_ambiente)
      );
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
        this._mapearParticipanteFocus(tomadorOutros, 'tomador', emitente.focus_ambiente)
      );
    }

    // Chave de CT-e referenciado (Complementar ou Substituição)
    if (cte.chave_cte_referenciado && digitsOnly(cte.chave_cte_referenciado).length === 44) {
      if (finalidadeCte === '1') {
        payload.chave_cte_complementado = digitsOnly(cte.chave_cte_referenciado);
      } else if (finalidadeCte === '3') {
        payload.chave_cte_substituido = digitsOnly(cte.chave_cte_referenciado);
      }
    }

    const ref = cte.ref || this.gerarRef('CTE', tenantId, cte.id);

    // Salva o payload enviado e marca como PROCESSANDO
    await db.query(
      `UPDATE dash_ctes SET
          ref = COALESCE(ref, $1),
          payload_focus = $2,
          status = 'PROCESSANDO',
          updated_at = NOW()
       WHERE id = $3`,
      [ref, JSON.stringify(payload), cteId]
    );

    const resFocus = isCteOs
      ? await client.emitirCteOs(ref, payload)
      : await client.emitirCte(ref, payload);

    const novoStatus = mapFocusStatusToDb(resFocus.status, 'PROCESSANDO');

    await db.query(
      `UPDATE dash_ctes SET
          status = $1,
          status_sefaz = COALESCE($2, status_sefaz),
          mensagem_sefaz = COALESCE($3, mensagem_sefaz),
          chave_cte = COALESCE($4, chave_cte),
          protocolo = COALESCE($5, protocolo),
          caminho_xml = COALESCE($6, caminho_xml),
          caminho_dacte = COALESCE($7, caminho_dacte),
          retorno_focus = $8,
          updated_at = NOW()
       WHERE id = $9`,
      [
        novoStatus,
        resFocus.status_sefaz || null,
        resFocus.mensagem_sefaz || null,
        resFocus.chave_cte || resFocus.chave || null,
        resFocus.protocolo || null,
        resFocus.caminho_xml_nota_fiscal || resFocus.caminho_xml || null,
        resFocus.caminho_dacte || resFocus.caminho_danfe || null,
        JSON.stringify(resFocus),
        cteId,
      ]
    );

    return { success: true, ref, status: novoStatus, focus: resFocus };
  }

  /**
   * Consulta na Focus NFe o status atual de um CT-e ou CT-e OS e atualiza o banco.
   */
  static async consultarCteFocus(tenantId, cteId) {
    const { rows } = await db.query(
      `SELECT * FROM dash_ctes WHERE id = $1 AND tenant_id = $2`,
      [cteId, tenantId]
    );
    if (rows.length === 0) throw new Error('CT-e não encontrado.');
    const cte = rows[0];

    const { client } = await this.getFocusClient(tenantId, cte.emitente_id);
    const isCteOs =
      String(cte.modelo) === '67' || String(cte.modelo_cte || '').toLowerCase() === 'cteos';

    const st = isCteOs
      ? await client.consultarCteOs(cte.ref, true)
      : await client.consultarCte(cte.ref, true);

    const novoStatus = mapFocusStatusToDb(st.status, cte.status);

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
        st.status_sefaz || null,
        st.mensagem_sefaz || null,
        st.chave_cte || st.chave || null,
        st.numero ? parseInt(st.numero, 10) : null,
        st.serie ? String(st.serie) : null,
        st.protocolo || null,
        st.caminho_xml_nota_fiscal || st.caminho_xml || null,
        st.caminho_dacte || st.caminho_danfe || null,
        JSON.stringify(st),
        cteId,
      ]
    );

    return { success: true, status: novoStatus, focus: st };
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

    // 6. Seguros
    const segurosRaw = parseJsonSafe(mdfe.seguros, []);
    const segurosPayload = Array.isArray(segurosRaw)
      ? segurosRaw
          .filter((s) => s && (s.seguradora_nome || s.nome_seguradora || s.apolice || s.numero_apolice))
          .map((s) => {
            const docResp = digitsOnly(s.responsavel_documento || emitente.cnpj);
            return {
              responsavel_seguro: s.responsavel_tipo || s.responsavel_seguro || '1',
              ...(docResp.length === 11
                ? { cpf_responsavel: docResp }
                : { cnpj_responsavel: docResp || digitsOnly(emitente.cnpj) }),
              nome_seguradora: s.seguradora_nome || s.nome_seguradora || 'SEGURADORA',
              ...(s.seguradora_cnpj || s.cnpj_seguradora
                ? { cnpj_seguradora: digitsOnly(s.seguradora_cnpj || s.cnpj_seguradora) }
                : {}),
              ...(s.apolice || s.numero_apolice
                ? { numero_apolice: s.apolice || s.numero_apolice }
                : {}),
              ...(Array.isArray(s.averbacoes) && s.averbacoes.filter(Boolean).length > 0
                ? {
                    averbacoes: s.averbacoes
                      .filter(Boolean)
                      .map((av) => ({ numero_averbacao: String(av) })),
                  }
                : {}),
            };
          })
      : [];

    // 7. Produto Predominante
    const prodPredRaw = parseJsonSafe(mdfe.produtos_predominantes, []);
    const prodPrincipal = Array.isArray(prodPredRaw) && prodPredRaw[0] ? prodPredRaw[0] : null;
    const rntrcFinal = digitsOnly(mdfe.v_rntrc || emitente.rntrc || '00000000')
      .padStart(8, '0')
      .slice(0, 8);

    const placaTracao = String(mdfe.veiculo_placa || mdfe.v_placa || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();

    const payload = {
      data_emissao: new Date().toISOString(),
      tipo_emitente: String(mdfe.tipo_emitente || '1'),
      tipo_transporte: String(mdfe.tipo_transporte || '1'),
      modal: '1',
      ...(mdfe.serie || emitente.serie_mdfe ? { serie: String(mdfe.serie || emitente.serie_mdfe) } : {}),
      ...(mdfe.numero ? { numero: Number(mdfe.numero) } : {}),
      uf_inicio: ufInicio,
      uf_fim: ufFim,

      // Dados completos do Emitente
      cnpj_emitente: digitsOnly(emitente.cnpj),
      inscricao_estadual_emitente: digitsOnly(emitente.inscricao_estadual),
      razao_social_emitente: emitente.razao_social,
      nome_fantasia_emitente: emitente.nome_fantasia || emitente.razao_social,
      logradouro_emitente: emitente.logradouro || 'RUA PRINCIPAL',
      numero_emitente: emitente.numero || 'SN',
      ...(emitente.complemento ? { complemento_emitente: emitente.complemento } : {}),
      bairro_emitente: emitente.bairro || 'CENTRO',
      codigo_municipio_emitente: emitente.codigo_municipio,
      municipio_emitente: emitente.municipio,
      uf_emitente: emitente.uf,
      cep_emitente: digitsOnly(emitente.cep) || '79004000',

      // Municípios e Percurso
      municipios_carregamento: municipiosCarregamento,
      ...(percurso.length > 0 ? { percurso } : {}),
      municipios_descarregamento: municipiosDescarregamento,

      // Modal Rodoviário e Veículo de Tração
      rntrc: rntrcFinal,
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
      veiculo_tracao: {
        placa: placaTracao,
        ...(mdfe.veiculo_renavam || mdfe.v_renavam
          ? { renavam: digitsOnly(mdfe.veiculo_renavam || mdfe.v_renavam) }
          : {}),
        tara: Number(mdfe.veiculo_tara_kg || mdfe.v_tara_kg || 5000),
        capacidade_kg: Number(mdfe.veiculo_capacidade_kg || mdfe.v_capacidade_kg || 15000),
        capacidade_m3: Number(mdfe.veiculo_capacidade_m3 || mdfe.v_capacidade_m3 || 50),
        tipo_rodado: mdfe.veiculo_tipo_rodado || mdfe.v_tipo_rodado || '01',
        tipo_carroceria: mdfe.veiculo_tipo_carroceria || mdfe.v_tipo_carroceria || '02',
        uf: (mdfe.veiculo_uf || mdfe.v_uf || emitente.uf || ufInicio).toUpperCase(),
        uf_licenciamento: (mdfe.veiculo_uf || mdfe.v_uf || emitente.uf || ufInicio).toUpperCase(),
        condutor: condutoresList,
        condutores: condutoresList,
        ...(mdfe.v_tipo_proprietario === '2' && mdfe.v_doc_prop
          ? {
              proprietario: {
                ...(digitsOnly(mdfe.v_doc_prop).length === 11
                  ? { cpf: digitsOnly(mdfe.v_doc_prop) }
                  : { cnpj: digitsOnly(mdfe.v_doc_prop) }),
                razao_social: mdfe.v_nome_prop || 'PROPRIETARIO TERCEIRO',
                rntrc: digitsOnly(mdfe.v_rntrc || rntrcFinal).padStart(8, '0').slice(0, 8),
                uf: (mdfe.v_uf_prop || ufInicio).toUpperCase(),
                tipo_proprietario: '0',
              },
            }
          : {}),
      },
      ...(reboquesPayload.length > 0 ? { veiculos_reboque: reboquesPayload } : {}),
      ...(segurosPayload.length > 0 ? { seguros: segurosPayload } : {}),

      // Produto Predominante
      produto_predominante: {
        tipo_carga: prodPrincipal?.tipo_carga || mdfe.tipo_carga || '05',
        produto_predominante:
          prodPrincipal?.descricao || mdfe.produto_predominante_nome || 'MERCADORIAS EM GERAL',
        ...(prodPrincipal?.ncm || mdfe.produto_predominante_ncm
          ? { ncm: digitsOnly(prodPrincipal?.ncm || mdfe.produto_predominante_ncm) }
          : {}),
        cep_carregamento:
          digitsOnly(prodPrincipal?.cep_carregamento || mdfe.cep_carregamento || emitente.cep) ||
          '79004000',
        cep_descarregamento:
          digitsOnly(prodPrincipal?.cep_descarregamento || mdfe.cep_descarregamento || emitente.cep) ||
          '79004000',
      },

      valor_total_carga: parseFloat(mdfe.valor_carga || 100).toFixed(2),
      codigo_unidade_medida_peso_bruto: '01',
      peso_bruto: parseFloat(mdfe.peso_bruto || 100).toFixed(3),
      ...(mdfe.informacao_adicional
        ? { informacoes_complementares: mdfe.informacao_adicional }
        : {}),
      ...(parseJsonSafe(mdfe.payload_focus, {}) || {}),
    };

    const ref = mdfe.ref || this.gerarRef('MDFE', tenantId, mdfe.id);

    await db.query(
      `UPDATE dash_mdfes SET ref = COALESCE(ref, $1), payload_focus = $2, status = 'PROCESSANDO', updated_at = NOW() WHERE id = $3`,
      [ref, JSON.stringify(payload), mdfeId]
    );

    const resFocus = await client.emitirMdfe(ref, payload);
    const novoStatus = mapFocusStatusToDb(resFocus.status, 'PROCESSANDO');

    await db.query(
      `UPDATE dash_mdfes SET
          status = $1,
          status_sefaz = COALESCE($2, status_sefaz),
          mensagem_sefaz = COALESCE($3, mensagem_sefaz),
          chave_mdfe = COALESCE($4, chave_mdfe),
          protocolo = COALESCE($5, protocolo),
          caminho_xml = COALESCE($6, caminho_xml),
          caminho_damdfe = COALESCE($7, caminho_damdfe),
          retorno_focus = $8,
          updated_at = NOW()
       WHERE id = $9`,
      [
        novoStatus,
        resFocus.status_sefaz || null,
        resFocus.mensagem_sefaz || null,
        resFocus.chave_mdfe || resFocus.chave || null,
        resFocus.protocolo || null,
        resFocus.caminho_xml_nota_fiscal || resFocus.caminho_xml || null,
        resFocus.caminho_damdfe || null,
        JSON.stringify(resFocus),
        mdfeId,
      ]
    );

    return { success: true, ref, status: novoStatus, focus: resFocus };
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
        st.status_sefaz || null,
        st.mensagem_sefaz || null,
        st.chave_mdfe || st.chave || null,
        st.numero ? parseInt(st.numero, 10) : null,
        st.serie ? String(st.serie) : null,
        st.protocolo || null,
        st.caminho_xml_nota_fiscal || st.caminho_xml || null,
        st.caminho_damdfe || null,
        JSON.stringify(st),
        mdfeId,
      ]
    );

    return { success: true, status: novoStatus, focus: st };
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
      data: dataEncerramento || data || new Date().toISOString().split('T')[0],
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
    const aliqRef = r ? Number(r.aliquota_icms) : Number(c.aliquota_icms || emitente?.aliquota_icms_padrao || 0);
    const icmsCalculado = (Number(c.valor_total || 0) * aliqRef) / 100;

    return {
      valido: impedimentos.length === 0,
      impedimentos,
      alertas,
      calculos: {
        valor_frete: Number(c.valor_total || 0),
        valor_carga: valorCargas || Number(c.valor_carga || 0),
        peso_cte: Number(c.peso_bruto || 0),
        peso_nfes: pesoCargas,
        icms_estimado: Math.round(icmsCalculado * 100) / 100,
        aliquota_aplicada: aliqRef,
        situacao_tributaria: r ? r.situacao_tributaria : c.icms_situacao_tributaria || '00',
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
            `UPDATE dash_ctes SET status = $1, status_sefaz = $2, mensagem_sefaz = $3,
                    chave_cte = COALESCE($4, chave_cte), caminho_xml = COALESCE($5, caminho_xml),
                    caminho_dacte = COALESCE($6, caminho_dacte), updated_at = NOW()
             WHERE id = $7`,
            [
              novoStatus,
              st.status_sefaz,
              st.mensagem_sefaz,
              st.chave_cte || st.chave,
              st.caminho_xml_nota_fiscal || st.caminho_xml,
              st.caminho_dacte || st.caminho_danfe,
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
   * Trata retornos assíncronos enviados pela Focus NFe (autorizado, cancelado, rejeitado).
   */
  static async processarWebhook(payload) {
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

    if (!ref) {
      logger.warn('[Webhook Focus] Webhook recebido sem referência (ref)');
      return { ignored: true };
    }

    logger.info(`[Webhook Focus] Processando retorno de ref=${ref}, status=${status}`);

    const chaveFinal = chave_cte || chave_mdfe || chave || null;
    const xmlFinal = caminho_xml_nota_fiscal || caminho_xml || null;

    // 1. Tenta atualizar CT-e
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
       WHERE ref = $10 RETURNING id, tenant_id`,
      [
        status,
        chaveFinal,
        xmlFinal,
        caminho_dacte || null,
        protocolo || null,
        status_sefaz || null,
        mensagem_sefaz || null,
        JSON.stringify(erros || []),
        JSON.stringify(payload),
        ref,
      ]
    );

    if (cteRes.rows.length > 0) {
      return { success: true, tipo: 'CTE', id: cteRes.rows[0].id };
    }

    // 2. Se não for CT-e, tenta atualizar MDF-e
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
       WHERE ref = $10 RETURNING id, tenant_id`,
      [
        status,
        chaveFinal,
        xmlFinal,
        caminho_damdfe || null,
        protocolo || null,
        status_sefaz || null,
        mensagem_sefaz || null,
        JSON.stringify(erros || []),
        JSON.stringify(payload),
        ref,
      ]
    );

    if (mdfeRes.rows.length > 0) {
      return { success: true, tipo: 'MDFE', id: mdfeRes.rows[0].id };
    }

    logger.warn(`[Webhook Focus] Referência ${ref} não encontrada nem em CT-e nem em MDF-e`);
    return { found: false };
  }
}

module.exports = TransporteService;
