'use strict';

/**
 * Motor de Cálculo Tributário do CT-e 4.00 (ICMS + PIS/COFINS + Reforma Tributária IBS/CBS)
 *
 * Fundamentação legal e normativa:
 * - Emenda Constitucional nº 132/2023 (arts. 125, 126, I e 129 — transição 2026–2032);
 * - Lei Complementar nº 214/2025, art. 12, caput, § 1º e § 2º, incisos I, II e V:
 *     Não integram a base de cálculo do IBS e da CBS:
 *     (I) os valores do IBS e da CBS;
 *     (II) os descontos incondicionais;
 *     (V) o montante do ICMS, do ISS e das contribuições PIS/Pasep e COFINS
 *         efetivamente incidentes sobre a operação (enquanto vigentes na transição);
 * - Tema 69 do STF (RE 574.706) / Lei nº 14.592/2023: exclusão do ICMS destacado
 *   da base de cálculo do PIS/Pasep e da COFINS incidentes sobre a receita;
 * - Notas Técnicas ENCAT/SEFAZ do CT-e 4.00 RTC (NT 2025.001 / NT 2026.002 — PL_CTe_400_RTC):
 *     Exceção de vigência em 2026: os valores de IBS (0,10%) e CBS (0,90%) são informativos/
 *     compensáveis e NÃO somam ao <vTotDFe> em 2026 (<vTotDFe> = <vTPrest>).
 *     A partir de 2027-01-01: PIS/COFINS são extintos e IBS/CBS passam a compor <vTotDFe>.
 *
 * Aritmética decimal exata baseada em BigInt (escala fixa) com arredondamento monetário
 * comercial half-up em 2 casas decimais (centavos), eliminando imprecisões IEEE-754.
 */

const RATE_SCALE = 1_000_000n; // 6 casas decimais para percentuais (ex.: 0.10% => 100_000n)
const CENTS_RATE_DENOM = 100_000_000n; // 100 (percentual) * 1_000_000 (RATE_SCALE)
const HALF_DENOM = 50_000_000n; // Arredondamento half-up

const CST_PIS_COFINS_TRIBUTADOS = new Set(['01', '02']);
const CST_PIS_COFINS_NAO_INCIDENTES = new Set(['04', '06', '07', '08', '09']);
const CST_ICMS_TRIBUTADOS = new Set(['00', '20', '90']);
const CST_ICMS_DESONERADOS_OU_DIFERIDOS = new Set(['40', '41', '51']);

/**
 * Converte string/number decimal em inteiro escalado por 10^decimals via BigInt,
 * aplicando arredondamento half-up caso haja dígitos além de `decimals`.
 */
function parseDecimalScaled(value, decimals) {
  if (value === null || value === undefined || value === '') return 0n;
  if (typeof value === 'bigint') {
    return value * 10n ** BigInt(decimals);
  }

  let raw = String(value).trim();
  if (!raw) return 0n;

  // Normaliza formato pt-BR ("1.234,56") apenas se houver vírgula decimal
  if (raw.includes(',')) {
    if (raw.includes('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else {
      raw = raw.replace(',', '.');
    }
  }

  // Suporta notação científica eventual convertendo via Number.toFixed seguro
  if (/e/i.test(raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return 0n;
    raw = num.toFixed(decimals + 4);
  }

  const match = raw.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!match) {
    const fallback = Number(raw);
    if (!Number.isFinite(fallback)) return 0n;
    return parseDecimalScaled(fallback.toFixed(decimals + 4), decimals);
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const intStr = match[2] || '0';
  const fracStr = match[3] || '';

  const targetFrac = fracStr.slice(0, decimals).padEnd(decimals, '0');
  const nextDigit = fracStr.length > decimals ? Number(fracStr[decimals]) : 0;

  let scaled = BigInt(intStr) * 10n ** BigInt(decimals) + BigInt(targetFrac || '0');
  if (nextDigit >= 5) {
    scaled += 1n;
  }
  return sign * scaled;
}

function parseMoneyToCents(value) {
  return parseDecimalScaled(value, 2);
}

function parseRateToScaled6(value) {
  return parseDecimalScaled(value, 6);
}

function divRoundHalfUp(numerator, denominator) {
  if (denominator === 0n) throw new Error('Divisão por zero no cálculo fiscal.');
  if (numerator === 0n) return 0n;
  const sign = (numerator < 0n) !== (denominator < 0n) ? -1n : 1n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = (absNum * 2n + absDen) / (absDen * 2n);
  return sign * quotient;
}

/**
 * Multiplica um valor em centavos (BigInt) por uma alíquota percentual (ex.: "0.10" = 0,10%)
 * e retorna o resultado arredondado comercialmente (half-up) em centavos (BigInt).
 */
function mulCentsByPercent(cents, rateValue) {
  if (cents <= 0n) return 0n;
  const rateScaled6 = typeof rateValue === 'bigint' ? rateValue : parseRateToScaled6(rateValue);
  if (rateScaled6 <= 0n) return 0n;
  return (cents * rateScaled6 + HALF_DENOM) / CENTS_RATE_DENOM;
}

function formatScaled(scaled, decimals) {
  const sign = scaled < 0n ? '-' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  if (decimals === 0) return `${sign}${abs.toString()}`;
  const factor = 10n ** BigInt(decimals);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(decimals, '0');
  return `${sign}${intPart.toString()}.${fracPart}`;
}

function formatCents(cents) {
  return formatScaled(cents, 2);
}

function centsToNumber(cents) {
  return Number(formatCents(cents));
}

function formatRate(rateScaled6, decimals = 2) {
  const factor = 10n ** BigInt(6 - decimals);
  const rounded = divRoundHalfUp(rateScaled6, factor);
  return formatScaled(rounded, decimals);
}

function hasExplicitValue(val) {
  return val !== undefined && val !== null && String(val).trim() !== '';
}

/**
 * Determina o regime de vigência da Reforma Tributária a partir da data de emissão do DF-e.
 */
function resolverVigenciaReforma(dataEmissao) {
  let ymd = '';
  if (dataEmissao instanceof Date && !Number.isNaN(dataEmissao.getTime())) {
    ymd = dataEmissao.toISOString().slice(0, 10);
  } else if (typeof dataEmissao === 'string' && dataEmissao.trim()) {
    const match = dataEmissao.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      ymd = `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  if (!ymd) {
    ymd = new Date().toISOString().slice(0, 10);
  }

  const ano = parseInt(ymd.slice(0, 4), 10);

  if (ano < 2026) {
    return {
      dataReferencia: ymd,
      ano,
      fase: 'PRE_REFORMA',
      ibsCbsVigente: false,
      excluirIcmsIssDaBaseIbsCbs: true,
      excluirPisCofinsDaBaseIbsCbs: true,
      somarIbsCbsNoTotalDfe: false,
    };
  }

  if (ano === 2026) {
    // Ano-teste 2026 (LC 214/2025, art. 12, § 2º, V + arts. 343–348 + NT 2025.001 / NT 2026.002):
    // - ICMS, ISS, PIS e COFINS incidentes NÃO integram a base do IBS/CBS;
    // - Exceção das NTs para 2026: IBS e CBS NÃO são somados ao vTotDFe (vTotDFe = vTPrest).
    return {
      dataReferencia: ymd,
      ano,
      fase: 'TRANSICAO_2026',
      ibsCbsVigente: true,
      excluirIcmsIssDaBaseIbsCbs: true,
      excluirPisCofinsDaBaseIbsCbs: true,
      somarIbsCbsNoTotalDfe: false,
    };
  }

  if (ano >= 2027 && ano <= 2032) {
    // 2027 a 2032 (EC 132/2023, arts. 126, I e 129; LC 214/2025, art. 12, § 2º, V):
    // - PIS e COFINS extintos em 2027-01-01 (substituídos pela CBS);
    // - ICMS e ISS permanecem em transição e continuam excluídos da base do IBS/CBS;
    // - IBS e CBS passam a compor o vTotDFe por fora.
    return {
      dataReferencia: ymd,
      ano,
      fase: 'TRANSICAO_2027_2032',
      ibsCbsVigente: true,
      excluirIcmsIssDaBaseIbsCbs: true,
      excluirPisCofinsDaBaseIbsCbs: false,
      somarIbsCbsNoTotalDfe: true,
    };
  }

  // 2033 em diante: extinção integral de ICMS e ISS (EC 132/2023, art. 129)
  return {
    dataReferencia: ymd,
    ano,
    fase: 'PLENO_2033',
    ibsCbsVigente: true,
    excluirIcmsIssDaBaseIbsCbs: false,
    excluirPisCofinsDaBaseIbsCbs: false,
    somarIbsCbsNoTotalDfe: true,
  };
}

/**
 * Apura o ICMS da prestação preservando as regras estaduais (ex.: MS interno 17% / interestadual 12%)
 * e identifica o montante de ICMS efetivamente incidente sobre a operação.
 */
function apurarIcmsPrestacao({ cte = {}, regraFiscal = null, emitente = {}, ufInicio = '', ufFim = '', vTPrestCents }) {
  const cstRaw = String(
    cte.icms_situacao_tributaria || regraFiscal?.situacao_tributaria || '00'
  )
    .trim()
    .toUpperCase();

  const crt = String(emitente?.regime_tributario || cte?.crt || '3').trim();
  const isSimples =
    cstRaw === 'SN' ||
    cstRaw.includes('SIMPLES') ||
    ((crt === '1' || crt === '4') && cstRaw === 'SN');

  if (isSimples) {
    return {
      isSimples: true,
      cst: '90',
      indSN: '1',
      baseIcmsCents: 0n,
      aliquotaIcmsScaled6: 0n,
      reducaoBaseIcmsScaled6: 0n,
      valorIcmsCents: 0n,
      icmsIncidenteNaOperacao: false,
    };
  }

  const cstCodigo = ['00', '20', '40', '41', '51', '60', '90'].includes(cstRaw.slice(0, 2))
    ? cstRaw.slice(0, 2)
    : '00';

  if (CST_ICMS_DESONERADOS_OU_DIFERIDOS.has(cstCodigo)) {
    return {
      isSimples: false,
      cst: cstCodigo,
      indSN: null,
      baseIcmsCents: 0n,
      aliquotaIcmsScaled6: 0n,
      reducaoBaseIcmsScaled6: 0n,
      valorIcmsCents: 0n,
      icmsIncidenteNaOperacao: false,
    };
  }

  if (cstCodigo === '60') {
    // CST 60: ICMS cobrado por substituição tributária. Só exclui da base IBS/CBS se
    // houver retenção efetivamente incidente sobre esta prestação informada explicitamente.
    const vStRetCents = hasExplicitValue(cte.valor_icms_st_retido)
      ? parseMoneyToCents(cte.valor_icms_st_retido)
      : 0n;
    const stIncidente = Boolean(cte.icms_st_incidente_operacao) && vStRetCents > 0n;
    return {
      isSimples: false,
      cst: '60',
      indSN: null,
      baseIcmsCents: hasExplicitValue(cte.base_icms_st_retido)
        ? parseMoneyToCents(cte.base_icms_st_retido)
        : 0n,
      aliquotaIcmsScaled6: hasExplicitValue(cte.aliquota_icms)
        ? parseRateToScaled6(cte.aliquota_icms)
        : 0n,
      reducaoBaseIcmsScaled6: 0n,
      valorIcmsCents: stIncidente ? vStRetCents : 0n,
      icmsIncidenteNaOperacao: stIncidente,
    };
  }

  // Regra de proteção histórica SEFAZ/MS: rascunhos internos MS->MS criados com default 12%
  const ufIniNorm = String(ufInicio || cte.uf_inicio || '').toUpperCase();
  const ufFimNorm = String(ufFim || cte.uf_fim || '').toUpperCase();
  const isInternoMsComDefaultAntigo =
    ufIniNorm === 'MS' &&
    ufFimNorm === 'MS' &&
    (!hasExplicitValue(cte.aliquota_icms) || parseRateToScaled6(cte.aliquota_icms) === 12_000_000n) &&
    hasExplicitValue(regraFiscal?.aliquota_icms) &&
    parseRateToScaled6(regraFiscal.aliquota_icms) === 17_000_000n;

  let aliquotaIcmsRaw;
  if (isInternoMsComDefaultAntigo) {
    aliquotaIcmsRaw = regraFiscal.aliquota_icms;
  } else if (hasExplicitValue(cte.aliquota_icms)) {
    aliquotaIcmsRaw = cte.aliquota_icms;
  } else if (hasExplicitValue(regraFiscal?.aliquota_icms)) {
    aliquotaIcmsRaw = regraFiscal.aliquota_icms;
  } else if (hasExplicitValue(emitente?.aliquota_icms_padrao)) {
    aliquotaIcmsRaw = emitente.aliquota_icms_padrao;
  } else {
    aliquotaIcmsRaw = ufIniNorm === 'MS' && ufFimNorm === 'MS' ? 17 : 12;
  }

  const aliquotaIcmsScaled6 = parseRateToScaled6(aliquotaIcmsRaw);
  const reducaoBaseIcmsScaled6 =
    cstCodigo === '20' && hasExplicitValue(cte.reducao_base_icms ?? regraFiscal?.reducao_base_icms)
      ? parseRateToScaled6(cte.reducao_base_icms ?? regraFiscal?.reducao_base_icms)
      : 0n;

  let baseIcmsCents = vTPrestCents;
  if (cstCodigo === '20' && reducaoBaseIcmsScaled6 > 0n) {
    const fatorBaseScaled6 =
      reducaoBaseIcmsScaled6 >= 100n * RATE_SCALE ? 0n : 100n * RATE_SCALE - reducaoBaseIcmsScaled6;
    baseIcmsCents = mulCentsByPercent(vTPrestCents, fatorBaseScaled6);
  } else if (hasExplicitValue(cte.base_icms)) {
    const baseInformada = parseMoneyToCents(cte.base_icms);
    if (baseInformada > 0n && baseInformada <= vTPrestCents) {
      baseIcmsCents = baseInformada;
    }
  }

  const valorIcmsCalculadoCents = mulCentsByPercent(baseIcmsCents, aliquotaIcmsScaled6);
  let valorIcmsCents = valorIcmsCalculadoCents;

  if (!isInternoMsComDefaultAntigo && hasExplicitValue(cte.valor_icms) && Boolean(cte.manter_valor_icms_informado)) {
    const informado = parseMoneyToCents(cte.valor_icms);
    if (informado >= 0n && informado <= baseIcmsCents) {
      valorIcmsCents = informado;
    }
  }

  const icmsIncidenteNaOperacao = CST_ICMS_TRIBUTADOS.has(cstCodigo) && valorIcmsCents > 0n;

  return {
    isSimples: false,
    cst: cstCodigo,
    indSN: null,
    baseIcmsCents,
    aliquotaIcmsScaled6,
    reducaoBaseIcmsScaled6,
    valorIcmsCents,
    icmsIncidenteNaOperacao,
  };
}

/**
 * Apura PIS/Pasep e COFINS incidentes sobre a prestação sem presumir alíquotas apenas pelo CRT
 * e sem tratar a ausência de tags no XML do CT-e 57 como ausência de incidência.
 */
function apurarPisCofinsPrestacao({
  cte = {},
  regraFiscal = null,
  emitente = {},
  vigencia,
  vTPrestLiquidoDescontoCents,
  deducaoIcmsCents,
}) {
  const pendencias = [];

  if (!vigencia.excluirPisCofinsDaBaseIbsCbs) {
    // A partir de 2027-01-01, PIS e COFINS estão extintos (EC 132/2023, art. 126, I).
    return {
      status: 'EXTINTO_PELA_REFORMA',
      incidente: false,
      pisCst: null,
      cofinsCst: null,
      basePisCofinsCents: 0n,
      aliquotaPisScaled6: 0n,
      aliquotaCofinsScaled6: 0n,
      valorPisCents: 0n,
      valorCofinsCents: 0n,
      excluirIcmsBasePisCofins: true,
      pendencias,
    };
  }

  const crt = String(emitente?.regime_tributario || cte?.crt || '3').trim();

  const modoBruto = String(
    cte.pis_cofins_modo ??
      regraFiscal?.pis_cofins_modo ??
      emitente?.pis_cofins_modo ??
      ''
  )
    .trim()
    .toUpperCase();

  const pisCst = String(
    cte.pis_cst ?? regraFiscal?.pis_cst ?? emitente?.pis_cst ?? ''
  )
    .trim()
    .padStart(2, '0')
    .slice(-2);
  const hasPisCst = hasExplicitValue(cte.pis_cst ?? regraFiscal?.pis_cst ?? emitente?.pis_cst);

  const cofinsCst = String(
    cte.cofins_cst ?? regraFiscal?.cofins_cst ?? emitente?.cofins_cst ?? ''
  )
    .trim()
    .padStart(2, '0')
    .slice(-2);
  const hasCofinsCst = hasExplicitValue(
    cte.cofins_cst ?? regraFiscal?.cofins_cst ?? emitente?.cofins_cst
  );

  const rawAliqPis = cte.aliquota_pis ?? regraFiscal?.aliquota_pis ?? emitente?.aliquota_pis;
  const rawAliqCofins =
    cte.aliquota_cofins ?? regraFiscal?.aliquota_cofins ?? emitente?.aliquota_cofins;
  const hasAliqPis = hasExplicitValue(rawAliqPis);
  const hasAliqCofins = hasExplicitValue(rawAliqCofins);

  const hasValorPisExplicito = hasExplicitValue(cte.valor_pis);
  const hasValorCofinsExplicito = hasExplicitValue(cte.valor_cofins);

  const excluirIcmsCfg =
    cte.excluir_icms_base_pis_cofins ??
    regraFiscal?.excluir_icms_base_pis_cofins ??
    emitente?.excluir_icms_base_pis_cofins;
  const excluirIcmsBasePisCofins = excluirIcmsCfg === undefined || excluirIcmsCfg === null
    ? true
    : Boolean(excluirIcmsCfg);

  // Determina o modo efetivo sem JAMAIS presumir alíquotas apenas pelo CRT
  let modoEfetivo = modoBruto;
  if (!modoEfetivo || modoEfetivo === 'NAO_APURADO') {
    if (
      hasPisCst &&
      hasCofinsCst &&
      CST_PIS_COFINS_NAO_INCIDENTES.has(pisCst) &&
      CST_PIS_COFINS_NAO_INCIDENTES.has(cofinsCst)
    ) {
      modoEfetivo = 'NAO_INCIDENTE';
    } else if (
      (hasValorPisExplicito && hasValorCofinsExplicito) ||
      (hasAliqPis &&
        hasAliqCofins &&
        (!hasPisCst || CST_PIS_COFINS_TRIBUTADOS.has(pisCst) || parseRateToScaled6(rawAliqPis) > 0n))
    ) {
      modoEfetivo = 'INCIDENTE';
    } else {
      modoEfetivo = 'NAO_APURADO';
    }
  }

  if (modoEfetivo === 'NAO_INCIDENTE') {
    return {
      status: 'NAO_INCIDENTE_CONFIRMADO',
      incidente: false,
      pisCst: hasPisCst ? pisCst : null,
      cofinsCst: hasCofinsCst ? cofinsCst : null,
      basePisCofinsCents: 0n,
      aliquotaPisScaled6: 0n,
      aliquotaCofinsScaled6: 0n,
      valorPisCents: 0n,
      valorCofinsCents: 0n,
      excluirIcmsBasePisCofins,
      pendencias,
    };
  }

  if (modoEfetivo === 'INCIDENTE') {
    if ((!hasAliqPis && !hasValorPisExplicito) || (!hasAliqCofins && !hasValorCofinsExplicito)) {
      pendencias.push({
        codigo: 'PIS_COFINS_ALIQUOTA_OU_VALOR_AUSENTE',
        severidade: 'FISCAL_PENDENTE',
        campos_faltantes: [
          ...(!hasAliqPis && !hasValorPisExplicito ? ['aliquota_pis_ou_valor_pis'] : []),
          ...(!hasAliqCofins && !hasValorCofinsExplicito ? ['aliquota_cofins_ou_valor_cofins'] : []),
        ],
        mensagem:
          'Operação marcada com incidência de PIS/COFINS, porém sem alíquotas ou valores informados para ambos os tributos. Não foram presumidas alíquotas pelo CRT.',
      });
      return {
        status: 'PENDENTE_PARAMETRIZACAO',
        incidente: false,
        pisCst: hasPisCst ? pisCst : null,
        cofinsCst: hasCofinsCst ? cofinsCst : null,
        basePisCofinsCents: 0n,
        aliquotaPisScaled6: 0n,
        aliquotaCofinsScaled6: 0n,
        valorPisCents: 0n,
        valorCofinsCents: 0n,
        excluirIcmsBasePisCofins,
        pendencias,
      };
    }

    // Tema 69 STF / Lei 14.592/2023: exclui o ICMS destacado na operação da base de PIS/COFINS
    const baseCalculadaPisCofinsCents = excluirIcmsBasePisCofins
      ? vTPrestLiquidoDescontoCents > deducaoIcmsCents
        ? vTPrestLiquidoDescontoCents - deducaoIcmsCents
        : 0n
      : vTPrestLiquidoDescontoCents;

    const basePisCofinsCents = hasExplicitValue(cte.base_pis_cofins)
      ? parseMoneyToCents(cte.base_pis_cofins)
      : baseCalculadaPisCofinsCents;

    const aliquotaPisScaled6 = hasAliqPis ? parseRateToScaled6(rawAliqPis) : 0n;
    const aliquotaCofinsScaled6 = hasAliqCofins ? parseRateToScaled6(rawAliqCofins) : 0n;

    // Se valor explícito foi informado sem alíquota (ou com flag explícita), usa o valor monetário direto sem recalcular
    const usarValorPisDireto =
      hasValorPisExplicito && (!hasAliqPis || Boolean(cte.usar_valores_pis_cofins_explicitos));
    const usarValorCofinsDireto =
      hasValorCofinsExplicito && (!hasAliqCofins || Boolean(cte.usar_valores_pis_cofins_explicitos));

    const valorPisCents = usarValorPisDireto
      ? parseMoneyToCents(cte.valor_pis)
      : mulCentsByPercent(basePisCofinsCents, aliquotaPisScaled6);

    const valorCofinsCents = usarValorCofinsDireto
      ? parseMoneyToCents(cte.valor_cofins)
      : mulCentsByPercent(basePisCofinsCents, aliquotaCofinsScaled6);

    return {
      status: 'APURADO',
      incidente: valorPisCents > 0n || valorCofinsCents > 0n,
      pisCst: hasPisCst ? pisCst : '01',
      cofinsCst: hasCofinsCst ? cofinsCst : '01',
      basePisCofinsCents,
      aliquotaPisScaled6,
      aliquotaCofinsScaled6,
      valorPisCents: valorPisCents > 0n ? valorPisCents : 0n,
      valorCofinsCents: valorCofinsCents > 0n ? valorCofinsCents : 0n,
      excluirIcmsBasePisCofins,
      pendencias,
    };
  }

  // Modo NAO_APURADO: não há parametrização cadastral/fiscal suficiente para confirmar PIS/COFINS
  pendencias.push({
    codigo: 'PIS_COFINS_NAO_PARAMETRIZADO',
    severidade: 'FISCAL_PENDENTE',
    campos_faltantes: ['pis_cofins_modo', 'pis_cst', 'aliquota_pis', 'cofins_cst', 'aliquota_cofins'],
    mensagem:
      `Apuração de PIS/COFINS não parametrizada no cadastro do emitente/regra fiscal/CT-e (CRT=${crt}). ` +
      `No leiaute do CT-e modelo 57 (TCTe) não existem tags <vPIS>/<vCOFINS> no XML, portanto a ausência desses campos no XML não significa ausência de incidência. ` +
      `Como o CRT=${crt} não permite presumir regime cumulativo (0,65%/3,00%), não cumulativo (1,65%/7,60%) ou alíquota zero/suspensão, ` +
      `a base do IBS/CBS foi calculada deduzindo apenas os tributos confirmados na operação, restando pendência cadastral/fiscal de PIS/COFINS (art. 12, § 2º, V, da LC 214/2025) para confirmar a base definitiva.`,
  });

  return {
    status: 'NAO_APURADO',
    incidente: false,
    pisCst: null,
    cofinsCst: null,
    basePisCofinsCents: 0n,
    aliquotaPisScaled6: 0n,
    aliquotaCofinsScaled6: 0n,
    valorPisCents: 0n,
    valorCofinsCents: 0n,
    excluirIcmsBasePisCofins,
    pendencias,
  };
}

/**
 * Calcula integralmente os tributos do CT-e 4.00 (ICMS, PIS/COFINS, ISS eventual e IBS/CBS)
 * ANTES da assinatura digital e da montagem do XML/payload fiscal.
 *
 * Função pura e idempotente: calcula sempre a partir do valor bruto da prestação (`valor_total` / `vTPrest`),
 * evitando qualquer dupla dedução caso o rascunho seja revalidado ou reprocessado.
 */
function calcularTributosCte400({
  cte = {},
  regraFiscal = null,
  emitente = {},
  ufInicio = '',
  ufFim = '',
  dataEmissao = null,
} = {}) {
  const vigencia = resolverVigenciaReforma(dataEmissao || cte.data_emissao);

  // 1. Valor Total Bruto da Prestação (vTPrest) e eventuais descontos incondicionais
  const vTPrestCents = parseMoneyToCents(cte.valor_total || 0);
  const descontoIncondicionalCents = hasExplicitValue(cte.desconto_incondicional)
    ? parseMoneyToCents(cte.desconto_incondicional)
    : 0n;
  const vTPrestLiquidoDescontoCents =
    vTPrestCents > descontoIncondicionalCents ? vTPrestCents - descontoIncondicionalCents : 0n;

  // 2. Apuração do ICMS (preservando os cálculos estaduais vigentes)
  const icms = apurarIcmsPrestacao({
    cte,
    regraFiscal,
    emitente,
    ufInicio,
    ufFim,
    vTPrestCents,
  });

  // 3. Exclusão do ICMS e eventual ISS efetivamente incidentes (LC 214/2025, art. 12, § 2º, V)
  const deducaoIcmsCents =
    vigencia.excluirIcmsIssDaBaseIbsCbs && icms.icmsIncidenteNaOperacao ? icms.valorIcmsCents : 0n;

  const issIncidenteCents =
    vigencia.excluirIcmsIssDaBaseIbsCbs &&
    !icms.icmsIncidenteNaOperacao &&
    Boolean(cte.iss_incidente) &&
    hasExplicitValue(cte.valor_iss)
      ? parseMoneyToCents(cte.valor_iss)
      : 0n;
  const deducaoIssCents = issIncidenteCents > 0n ? issIncidenteCents : 0n;

  // 4. Apuração de PIS/COFINS e exclusão quando efetivamente incidentes em 2026
  const pisCofins = apurarPisCofinsPrestacao({
    cte,
    regraFiscal,
    emitente,
    vigencia,
    vTPrestLiquidoDescontoCents,
    deducaoIcmsCents,
  });

  const deducaoPisCents =
    vigencia.excluirPisCofinsDaBaseIbsCbs && pisCofins.incidente ? pisCofins.valorPisCents : 0n;
  const deducaoCofinsCents =
    vigencia.excluirPisCofinsDaBaseIbsCbs && pisCofins.incidente ? pisCofins.valorCofinsCents : 0n;

  // 5. Base de cálculo líquida do IBS/CBS (sem jamais descontar o mesmo tributo duas vezes)
  const totalDeducoesLegaisCents =
    descontoIncondicionalCents +
    deducaoIcmsCents +
    deducaoIssCents +
    deducaoPisCents +
    deducaoCofinsCents;

  const baseIbsCbsCents =
    vTPrestCents > totalDeducoesLegaisCents ? vTPrestCents - totalDeducoesLegaisCents : 0n;

  // 6. Classificação e alíquotas do IBS/CBS
  const cstIbsCbs = String(cte.ibs_cbs_cst || regraFiscal?.ibs_cbs_cst || '000')
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

  const aliqIbsUfRaw = hasExplicitValue(cte.aliquota_ibs) && parseRateToScaled6(cte.aliquota_ibs) > 0n
    ? cte.aliquota_ibs
    : hasExplicitValue(regraFiscal?.aliquota_ibs) && parseRateToScaled6(regraFiscal.aliquota_ibs) > 0n
    ? regraFiscal.aliquota_ibs
    : hasExplicitValue(cte.aliquota_ibs) && cstIbsCbs !== '000'
    ? cte.aliquota_ibs
    : '0.10';

  const aliqIbsMunRaw = hasExplicitValue(cte.aliquota_ibs_mun)
    ? cte.aliquota_ibs_mun
    : hasExplicitValue(regraFiscal?.aliquota_ibs_mun)
    ? regraFiscal.aliquota_ibs_mun
    : '0.00';

  const aliqCbsRaw = hasExplicitValue(cte.aliquota_cbs) && parseRateToScaled6(cte.aliquota_cbs) > 0n
    ? cte.aliquota_cbs
    : hasExplicitValue(regraFiscal?.aliquota_cbs) && parseRateToScaled6(regraFiscal.aliquota_cbs) > 0n
    ? regraFiscal.aliquota_cbs
    : hasExplicitValue(cte.aliquota_cbs) && cstIbsCbs !== '000'
    ? cte.aliquota_cbs
    : '0.90';

  const aliqIbsUfScaled6 = parseRateToScaled6(aliqIbsUfRaw);
  const aliqIbsMunScaled6 = parseRateToScaled6(aliqIbsMunRaw);
  const aliqCbsScaled6 = parseRateToScaled6(aliqCbsRaw);

  const percReducaoRaw =
    cte.reducao_aliquota_ibs_cbs ?? regraFiscal?.reducao_aliquota_ibs_cbs ?? 0;
  const percReducaoScaled6 = parseRateToScaled6(percReducaoRaw);
  const aplicaReducao =
    (cstIbsCbs === '200' || cstIbsCbs === '515') && percReducaoScaled6 > 0n;

  // Alíquota efetiva em 4 casas decimais (TDec_0302_04RTC => 100n unidades em RATE_SCALE 10^6)
  const calcularAliqEfetivaScaled6 = (aliqScaled6) => {
    if (!aplicaReducao) return aliqScaled6;
    if (percReducaoScaled6 >= 100n * RATE_SCALE) return 0n;
    const fator = 100n * RATE_SCALE - percReducaoScaled6;
    const efetScaled4 = divRoundHalfUp(aliqScaled6 * fator, 100n * RATE_SCALE * 100n);
    return efetScaled4 * 100n;
  };

  const aliqEfetIbsUfScaled6 = calcularAliqEfetivaScaled6(aliqIbsUfScaled6);
  const aliqEfetIbsMunScaled6 = calcularAliqEfetivaScaled6(aliqIbsMunScaled6);
  const aliqEfetCbsScaled6 = calcularAliqEfetivaScaled6(aliqCbsScaled6);

  const semGrupoCalculoIbsCbs = cstIbsCbs === '400' || cstIbsCbs === '410';

  const valorIbsUfCents = semGrupoCalculoIbsCbs
    ? 0n
    : mulCentsByPercent(baseIbsCbsCents, aliqEfetIbsUfScaled6);
  const valorIbsMunCents = semGrupoCalculoIbsCbs
    ? 0n
    : mulCentsByPercent(baseIbsCbsCents, aliqEfetIbsMunScaled6);
  const valorIbsTotalCents = valorIbsUfCents + valorIbsMunCents;
  const valorCbsCents = semGrupoCalculoIbsCbs
    ? 0n
    : mulCentsByPercent(baseIbsCbsCents, aliqEfetCbsScaled6);

  // 7. Valor Total do DF-e (<vTotDFe>) conforme data de vigência:
  // Em 2026: vTotDFe = vTPrest (NÃO soma IBS/CBS). A partir de 2027: vTotDFe = vTPrest + vIBS + vCBS.
  const valorTotalDfeCents =
    vigencia.somarIbsCbsNoTotalDfe && !semGrupoCalculoIbsCbs
      ? vTPrestCents + valorIbsTotalCents + valorCbsCents
      : vTPrestCents;

  const pendenciasFiscais = [...pisCofins.pendencias];

  return {
    vigencia,
    baseDefinitivaConfirmada: pendenciasFiscais.length === 0,
    pendenciasFiscais,
    valores: {
      vTPrest: formatCents(vTPrestCents),
      descontoIncondicional: formatCents(descontoIncondicionalCents),
      icms: {
        isSimples: icms.isSimples,
        cst: icms.cst,
        indSN: icms.indSN,
        vBC: formatCents(icms.baseIcmsCents),
        pICMS: formatRate(icms.aliquotaIcmsScaled6, 2),
        pRedBC: formatRate(icms.reducaoBaseIcmsScaled6, 2),
        vICMS: formatCents(icms.valorIcmsCents),
        incidenteNaOperacao: icms.icmsIncidenteNaOperacao,
      },
      pisCofins: {
        status: pisCofins.status,
        incidente: pisCofins.incidente,
        pisCst: pisCofins.pisCst,
        cofinsCst: pisCofins.cofinsCst,
        vBC: formatCents(pisCofins.basePisCofinsCents),
        pPIS: formatRate(pisCofins.aliquotaPisScaled6, 4),
        vPIS: formatCents(pisCofins.valorPisCents),
        pCOFINS: formatRate(pisCofins.aliquotaCofinsScaled6, 4),
        vCOFINS: formatCents(pisCofins.valorCofinsCents),
        excluirIcmsBasePisCofins: pisCofins.excluirIcmsBasePisCofins,
      },
      deducoesBaseIbsCbs: {
        descontoIncondicional: formatCents(descontoIncondicionalCents),
        icms: formatCents(deducaoIcmsCents),
        iss: formatCents(deducaoIssCents),
        pis: formatCents(deducaoPisCents),
        cofins: formatCents(deducaoCofinsCents),
        totalExcluido: formatCents(totalDeducoesLegaisCents),
      },
      ibsCbs: {
        CST: cstIbsCbs,
        cClassTrib: classTribIbsCbs,
        possuiGrupoCalculo: !semGrupoCalculoIbsCbs,
        vBC: semGrupoCalculoIbsCbs ? '0.00' : formatCents(baseIbsCbsCents),
        pIBSUF: formatRate(aliqIbsUfScaled6, 2),
        pIBSUF4: formatRate(aliqIbsUfScaled6, 4),
        pAliqEfetIBSUF: formatRate(aliqEfetIbsUfScaled6, 4),
        vIBSUF: formatCents(valorIbsUfCents),
        pIBSMun: formatRate(aliqIbsMunScaled6, 2),
        pIBSMun4: formatRate(aliqIbsMunScaled6, 4),
        pAliqEfetIBSMun: formatRate(aliqEfetIbsMunScaled6, 4),
        vIBSMun: formatCents(valorIbsMunCents),
        vIBS: formatCents(valorIbsTotalCents),
        pCBS: formatRate(aliqCbsScaled6, 2),
        pCBS4: formatRate(aliqCbsScaled6, 4),
        pAliqEfetCBS: formatRate(aliqEfetCbsScaled6, 4),
        vCBS: formatCents(valorCbsCents),
        pRedAliq: formatRate(percReducaoScaled6, 2),
        aplicaReducao,
      },
      vTotDFe: formatCents(valorTotalDfeCents),
    },
    numeros: {
      vTPrest: centsToNumber(vTPrestCents),
      baseIcms: centsToNumber(icms.baseIcmsCents),
      aliquotaIcms: Number(formatRate(icms.aliquotaIcmsScaled6, 4)),
      valorIcms: centsToNumber(icms.valorIcmsCents),
      basePisCofins: centsToNumber(pisCofins.basePisCofinsCents),
      aliquotaPis: Number(formatRate(pisCofins.aliquotaPisScaled6, 4)),
      valorPis: centsToNumber(pisCofins.valorPisCents),
      aliquotaCofins: Number(formatRate(pisCofins.aliquotaCofinsScaled6, 4)),
      valorCofins: centsToNumber(pisCofins.valorCofinsCents),
      baseIbsCbs: semGrupoCalculoIbsCbs ? 0 : centsToNumber(baseIbsCbsCents),
      aliquotaIbsUf: Number(formatRate(aliqIbsUfScaled6, 4)),
      valorIbsUf: centsToNumber(valorIbsUfCents),
      aliquotaIbsMun: Number(formatRate(aliqIbsMunScaled6, 4)),
      valorIbsMun: centsToNumber(valorIbsMunCents),
      valorIbsTotal: centsToNumber(valorIbsTotalCents),
      aliquotaCbs: Number(formatRate(aliqCbsScaled6, 4)),
      valorCbs: centsToNumber(valorCbsCents),
      percReducaoIbsCbs: Number(formatRate(percReducaoScaled6, 2)),
      valorTotalDfe: centsToNumber(valorTotalDfeCents),
    },
  };
}

/**
 * Converte o resultado de `calcularTributosCte400` nos objetos exatos esperados pelo
 * provedor Focus NFe v2 (`icmsFields` e `ibsCbsFields`) ANTES da assinatura digital.
 */
function montarCamposFocusImpostosCte400(calculo, { cte = {}, ufInicio = '', ufFim = '' } = {}) {
  const { valores } = calculo;
  const { icms, ibsCbs } = valores;

  let icmsFields;
  if (icms.isSimples) {
    icmsFields = {
      icms_situacao_tributaria: '90',
      icms_indicador_simples_nacional: '1',
    };
  } else if (CST_ICMS_DESONERADOS_OU_DIFERIDOS.has(icms.cst)) {
    icmsFields = {
      icms_situacao_tributaria: icms.cst,
    };
  } else {
    icmsFields = {
      icms_situacao_tributaria: icms.cst,
      icms_base_calculo: icms.vBC,
      icms_aliquota: icms.pICMS,
      icms_valor: icms.vICMS,
      ...(icms.cst === '20' && parseRateToScaled6(icms.pRedBC) > 0n
        ? { icms_reducao_base_calculo: icms.pRedBC }
        : {}),
    };
  }

  // DIFAL (ICMSUFFim) apenas quando interestadual e explicitamente informado FCP/partilha
  const aliqFcpScaled6 = parseRateToScaled6(cte.aliquota_fcp || 0);
  if (
    ufInicio &&
    ufFim &&
    String(ufInicio).toUpperCase() !== String(ufFim).toUpperCase() &&
    aliqFcpScaled6 > 0n
  ) {
    const vTPrestCents = parseMoneyToCents(valores.vTPrest);
    const vFcpCents = mulCentsByPercent(vTPrestCents, aliqFcpScaled6);
    icmsFields.icms_base_calculo_uf_fim = valores.vTPrest;
    icmsFields.icms_percentual_fcp_uf_fim = formatRate(aliqFcpScaled6, 2);
    icmsFields.icms_aliquota_interna_uf_fim = formatRate(
      parseRateToScaled6(cte.part_fcp_destino || 0),
      2
    );
    icmsFields.icms_aliquota_interestadual_uf_fim = icms.pICMS;
    icmsFields.icms_valor_total_fcp_uf_fim = formatCents(vFcpCents);
    icmsFields.icms_valor_partilha_uf_fim = '0.00';
    icmsFields.icms_valor_partilha_uf_inicio = '0.00';
  }

  const ibsCbsFields = !ibsCbs.possuiGrupoCalculo
    ? {
        ibs_cbs_situacao_tributaria: ibsCbs.CST,
        ibs_cbs_classificacao_tributaria: ibsCbs.cClassTrib,
        valor_total_dfe: valores.vTotDFe,
      }
    : {
        ibs_cbs_situacao_tributaria: ibsCbs.CST,
        ibs_cbs_classificacao_tributaria: ibsCbs.cClassTrib,
        ibs_cbs_base_calculo: ibsCbs.vBC,
        ibs_uf_aliquota: ibsCbs.pIBSUF,
        ibs_uf_valor: ibsCbs.vIBSUF,
        ibs_mun_aliquota: ibsCbs.pIBSMun,
        ibs_mun_valor: ibsCbs.vIBSMun,
        ibs_valor_total: ibsCbs.vIBS,
        cbs_aliquota: ibsCbs.pCBS,
        cbs_valor: ibsCbs.vCBS,
        valor_total_dfe: valores.vTotDFe,
        ...(ibsCbs.aplicaReducao
          ? {
              ibs_uf_percentual_reducao_aliquota: ibsCbs.pRedAliq,
              ibs_uf_aliquota_efetiva: ibsCbs.pAliqEfetIBSUF,
              ibs_mun_percentual_reducao_aliquota: ibsCbs.pRedAliq,
              ibs_mun_aliquota_efetiva: ibsCbs.pAliqEfetIBSMun,
              cbs_percentual_reducao_aliquota: ibsCbs.pRedAliq,
              cbs_aliquota_efetiva: ibsCbs.pAliqEfetCBS,
            }
          : {}),
      };

  return { icmsFields, ibsCbsFields };
}

module.exports = {
  parseDecimalScaled,
  parseMoneyToCents,
  parseRateToScaled6,
  mulCentsByPercent,
  formatCents,
  formatRate,
  centsToNumber,
  resolverVigenciaReforma,
  apurarIcmsPrestacao,
  apurarPisCofinsPrestacao,
  calcularTributosCte400,
  montarCamposFocusImpostosCte400,
};
