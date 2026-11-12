'use strict';

/**
 * Calculadora Oficial do Piso Mínimo do Transporte Rodoviário de Cargas
 * Base legal: Lei nº 13.703/2018 e Resolução ANTT nº 5.867/2020 (Anexo II — Tabelas A e B atualizadas).
 *
 * Fórmula oficial ANTT:
 *   Piso = (Distância_km × CCD) + CC
 *   (+ 0,92 × CCD × Distância_km quando houver retorno vazio contratado previsto em lei)
 *
 * Onde:
 *   - CCD: Coeficiente de Custo de Deslocamento (R$/km) por categoria de carga e nº de eixos
 *   - CC:  Coeficiente de Custo de Carga e Descarga (R$) por categoria de carga e nº de eixos
 */

const EIXOS_VALIDOS = [2, 3, 4, 5, 6, 7, 9];

const CATEGORIAS_CARGA_ANTT = {
  GERAL: {
    codigo: 'GERAL',
    nome: 'Carga Geral',
    lotacao: {
      2: { ccd: 3.6003, cc: 308.05 },
      3: { ccd: 4.5582, cc: 376.48 },
      4: { ccd: 5.2219, cc: 413.68 },
      5: { ccd: 5.9325, cc: 447.82 },
      6: { ccd: 6.6908, cc: 486.95 },
      7: { ccd: 7.2584, cc: 547.12 },
      9: { ccd: 8.1965, cc: 593.84 },
    },
    alto_desempenho: {
      2: { ccd: 3.1920, cc: 189.40 },
      3: { ccd: 4.0610, cc: 234.15 },
      4: { ccd: 4.6890, cc: 261.80 },
      5: { ccd: 5.3420, cc: 288.50 },
      6: { ccd: 6.0380, cc: 315.90 },
      7: { ccd: 6.5910, cc: 358.20 },
      9: { ccd: 7.4620, cc: 392.10 },
    },
  },
  GRANEL_SOLIDO: {
    codigo: 'GRANEL_SOLIDO',
    nome: 'Granel Sólido',
    lotacao: {
      2: { ccd: 3.6380, cc: 311.90 },
      3: { ccd: 4.6010, cc: 381.10 },
      4: { ccd: 5.2840, cc: 419.50 },
      5: { ccd: 5.9980, cc: 454.30 },
      6: { ccd: 6.7620, cc: 493.80 },
      7: { ccd: 7.3410, cc: 554.90 },
      9: { ccd: 8.2890, cc: 602.40 },
    },
    alto_desempenho: {
      2: { ccd: 3.2250, cc: 192.10 },
      3: { ccd: 4.1020, cc: 237.60 },
      4: { ccd: 4.7410, cc: 265.40 },
      5: { ccd: 5.4010, cc: 292.80 },
      6: { ccd: 6.1050, cc: 320.40 },
      7: { ccd: 6.6620, cc: 363.10 },
      9: { ccd: 7.5480, cc: 398.00 },
    },
  },
  GRANEL_LIQUIDO: {
    codigo: 'GRANEL_LIQUIDO',
    nome: 'Granel Líquido',
    lotacao: {
      2: { ccd: 3.7420, cc: 325.40 },
      3: { ccd: 4.7390, cc: 397.80 },
      4: { ccd: 5.4510, cc: 438.90 },
      5: { ccd: 6.1820, cc: 474.60 },
      6: { ccd: 6.9690, cc: 516.20 },
      7: { ccd: 7.5680, cc: 579.80 },
      9: { ccd: 8.5410, cc: 629.50 },
    },
  },
  FRIGORIFICADA: {
    codigo: 'FRIGORIFICADA',
    nome: 'Frigorificada ou Aquecida',
    lotacao: {
      2: { ccd: 4.2190, cc: 358.20 },
      3: { ccd: 5.3120, cc: 439.40 },
      4: { ccd: 6.1180, cc: 486.70 },
      5: { ccd: 6.9420, cc: 528.90 },
      6: { ccd: 7.8350, cc: 576.40 },
      7: { ccd: 8.5140, cc: 645.80 },
      9: { ccd: 9.6180, cc: 704.10 },
    },
  },
  CONTEINERIZADA: {
    codigo: 'CONTEINERIZADA',
    nome: 'Conteinerizada',
    lotacao: {
      3: { ccd: 4.5120, cc: 369.80 },
      4: { ccd: 5.1840, cc: 407.20 },
      5: { ccd: 5.8890, cc: 441.50 },
      6: { ccd: 6.6420, cc: 480.10 },
      7: { ccd: 7.2110, cc: 539.60 },
      9: { ccd: 8.1420, cc: 586.30 },
    },
  },
  NEOGRANEL: {
    codigo: 'NEOGRANEL',
    nome: 'Neogranel',
    lotacao: {
      2: { ccd: 3.5890, cc: 306.40 },
      3: { ccd: 4.5410, cc: 374.90 },
      4: { ccd: 5.2050, cc: 411.80 },
      5: { ccd: 5.9140, cc: 446.10 },
      6: { ccd: 6.6710, cc: 485.00 },
      7: { ccd: 7.2390, cc: 545.20 },
      9: { ccd: 8.1740, cc: 591.70 },
    },
  },
  PERIGOSA_GERAL: {
    codigo: 'PERIGOSA_GERAL',
    nome: 'Carga Perigosa (Geral)',
    lotacao: {
      2: { ccd: 4.3820, cc: 398.10 },
      3: { ccd: 5.3940, cc: 472.60 },
      4: { ccd: 6.1120, cc: 516.40 },
      5: { ccd: 6.8680, cc: 556.80 },
      6: { ccd: 7.6740, cc: 601.90 },
      7: { ccd: 8.2920, cc: 668.40 },
      9: { ccd: 9.2860, cc: 721.50 },
    },
  },
};

// Coordenadas aproximadas (lat, lon) de capitais e polos logísticos (especialmente MS/Centro-Oeste/Sul/Sudeste)
const COORDENADAS_POLOS = {
  // Mato Grosso do Sul
  'DOURADOS|MS': [-22.2231, -54.8120],
  'CAMPO GRANDE|MS': [-20.4697, -54.6201],
  'MARACAJU|MS': [-21.6139, -55.1683],
  'PONTA PORA|MS': [-22.5361, -55.7256],
  'TRES LAGOAS|MS': [-20.7849, -51.7007],
  'NAVIRAI|MS': [-23.0650, -54.1906],
  'NOVA ANDRADINA|MS': [-22.2381, -53.3431],
  'CORUMBA|MS': [-19.0089, -57.6510],
  'COXIM|MS': [-18.5067, -54.7600],
  'PARANAIBA|MS': [-19.6772, -51.1908],
  'SIDROLANDIA|MS': [-20.9319, -54.9614],
  'RIO BRILHANTE|MS': [-21.8019, -54.5464],
  'CAARAPO|MS': [-22.6342, -54.8222],
  'AMAMBAI|MS': [-23.1042, -55.2258],
  'IVINHEMA|MS': [-22.3047, -53.8153],
  'BONITO|MS': [-21.1261, -56.4836],
  'AQUIDAUANA|MS': [-20.4711, -55.7872],
  'JARDIM|MS': [-21.4803, -56.1381],
  'CHAPADAO DO SUL|MS': [-18.7944, -52.6228],
  'SAO GABRIEL DO OESTE|MS': [-19.3953, -54.5656],
  'FATIMA DO SUL|MS': [-22.3742, -54.5139],
  'ITAPORA|MS': [-22.0789, -54.7894],
  // Capitais e Polos Nacionais
  'SAO PAULO|SP': [-23.5505, -46.6333],
  'CAMPINAS|SP': [-22.9099, -47.0626],
  'SANTOS|SP': [-23.9608, -46.3336],
  'RIBEIRAO PRETO|SP': [-21.1704, -47.8103],
  'PRESIDENTE PRUDENTE|SP': [-22.1256, -51.3889],
  'CURITIBA|PR': [-25.4284, -49.2733],
  'CASCAVEL|PR': [-24.9578, -53.4595],
  'MARINGA|PR': [-23.4205, -51.9331],
  'LONDRINA|PR': [-23.3045, -51.1696],
  'PARANAGUA|PR': [-25.5163, -48.5225],
  'FLORIANOPOLIS|SC': [-27.5954, -48.5480],
  'ITAJAI|SC': [-26.9078, -48.6619],
  'JOINVILLE|SC': [-26.3044, -48.8487],
  'PORTO ALEGRE|RS': [-30.0346, -51.2177],
  'RIO DE JANEIRO|RJ': [-22.9068, -43.1729],
  'BELO HORIZONTE|MG': [-19.9167, -43.9345],
  'UBERLANDIA|MG': [-18.9186, -48.2772],
  'GOIANIA|GO': [-16.6869, -49.2648],
  'BRASILIA|DF': [-15.7975, -47.8919],
  'CUIABA|MT': [-15.6014, -56.0979],
  'RONDONOPOLIS|MT': [-16.4706, -54.6356],
  'SINOP|MT': [-11.8608, -55.5094],
  'SALVADOR|BA': [-12.9777, -38.5016],
  'RECIFE|PE': [-8.0476, -34.8770],
  'FORTALEZA|CE': [-3.7319, -38.5267],
  'BELEM|PA': [-1.4558, -48.4902],
  'MANAUS|AM': [-3.1190, -60.0217],
  'PALMAS|TO': [-10.2491, -48.3243],
  'PORTO VELHO|RO': [-8.7612, -63.9004],
  'RIO BRANCO|AC': [-9.9754, -67.8249],
  'VITORIA|ES': [-20.3155, -40.3128],
};

const CAPITAL_PADRAO_POR_UF = {
  AC: 'RIO BRANCO|AC',
  AL: 'RECIFE|PE',
  AM: 'MANAUS|AM',
  AP: 'BELEM|PA',
  BA: 'SALVADOR|BA',
  CE: 'FORTALEZA|CE',
  DF: 'BRASILIA|DF',
  ES: 'VITORIA|ES',
  GO: 'GOIANIA|GO',
  MA: 'FORTALEZA|CE',
  MG: 'BELO HORIZONTE|MG',
  MS: 'CAMPO GRANDE|MS',
  MT: 'CUIABA|MT',
  PA: 'BELEM|PA',
  PB: 'RECIFE|PE',
  PE: 'RECIFE|PE',
  PI: 'FORTALEZA|CE',
  PR: 'CURITIBA|PR',
  RJ: 'RIO DE JANEIRO|RJ',
  RN: 'FORTALEZA|CE',
  RO: 'PORTO VELHO|RO',
  RR: 'MANAUS|AM',
  RS: 'PORTO ALEGRE|RS',
  SC: 'FLORIANOPOLIS|SC',
  SE: 'SALVADOR|BA',
  SP: 'SAO PAULO|SP',
  TO: 'PALMAS|TO',
};

function removerAcentos(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function normalizarEixosAntt(qtd) {
  const n = parseInt(qtd, 10);
  if (!Number.isFinite(n) || n <= 2) return 2;
  if (EIXOS_VALIDOS.includes(n)) return n;
  if (n === 8) return 7;
  if (n > 9) return 9;
  return 3;
}

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function resolverCoordenada({ municipio, uf }) {
  const ufUp = removerAcentos(uf).slice(0, 2);
  const munUp = removerAcentos(municipio);
  if (munUp && ufUp) {
    const k = `${munUp}|${ufUp}`;
    if (COORDENADAS_POLOS[k]) return COORDENADAS_POLOS[k];
  }
  const capKey = CAPITAL_PADRAO_POR_UF[ufUp];
  return capKey ? COORDENADAS_POLOS[capKey] : null;
}

/**
 * Estima a quilometragem rodoviária (fator médio viário 1,24 sobre distância geodésica).
 */
function estimarDistanciaRodoviariaKm({
  ufInicio = '',
  ufFim = '',
  municipioInicio = '',
  municipioFim = '',
} = {}) {
  const ufIni = removerAcentos(ufInicio).slice(0, 2);
  const ufDest = removerAcentos(ufFim).slice(0, 2);
  const munIni = removerAcentos(municipioInicio);
  const munDest = removerAcentos(municipioFim);

  if (munIni && munDest && munIni === munDest && ufIni === ufDest) {
    return 25;
  }

  const c1 = resolverCoordenada({ municipio: munIni, uf: ufIni });
  const c2 = resolverCoordenada({ municipio: munDest, uf: ufDest });

  if (c1 && c2) {
    const reta = haversineKm(c1, c2);
    if (reta < 5) return 25;
    return Math.max(25, Math.round(reta * 1.24));
  }

  if (ufIni && ufDest && ufIni === ufDest) {
    return 180;
  }
  return 650;
}

/**
 * Calcula o Piso Mínimo de Frete ANTT (Res. 5.867) e valida a operação.
 */
function calcularPisoMinimoAntt({
  categoriaCarga = 'GERAL',
  tipoOperacao = 'Carga Lotacao',
  quantidadeEixos = 2,
  distanciaKm = 0,
  ufInicio = 'MS',
  ufFim = 'MS',
  municipioInicio = '',
  municipioFim = '',
  altoDesempenho = false,
  retornoVazio = false,
  valorFrete = 0,
  pisoIsento = false,
  pisoIsencaoMotivo = '',
} = {}) {
  const catKey = CATEGORIAS_CARGA_ANTT[String(categoriaCarga || '').toUpperCase()]
    ? String(categoriaCarga).toUpperCase()
    : 'GERAL';
  const cat = CATEGORIAS_CARGA_ANTT[catKey];
  const eixos = normalizarEixosAntt(quantidadeEixos);

  const distInformada = Number(distanciaKm);
  const usouEstimativa = !(Number.isFinite(distInformada) && distInformada > 0);
  const kmFinal = usouEstimativa
    ? estimarDistanciaRodoviariaKm({ ufInicio, ufFim, municipioInicio, municipioFim })
    : Math.round(distInformada * 100) / 100;

  const isAltoDesempenho =
    Boolean(altoDesempenho) || removerAcentos(tipoOperacao).includes('ALTO DESEMPENHO');
  const tabelaEscolhida =
    isAltoDesempenho && cat.alto_desempenho ? cat.alto_desempenho : cat.lotacao;

  const coef =
    tabelaEscolhida[eixos] ||
    tabelaEscolhida[3] ||
    cat.lotacao[eixos] ||
    cat.lotacao[2] || { ccd: 3.6003, cc: 308.05 };

  const parcelaDeslocamento = kmFinal * coef.ccd;
  const parcelaRetornoVazio = retornoVazio ? 0.92 * coef.ccd * kmFinal : 0;
  const pisoCalculado = Math.round((parcelaDeslocamento + coef.cc + parcelaRetornoVazio) * 100) / 100;

  const freteNum = Number(valorFrete || 0);
  const motivoIsencaoLimpo = String(pisoIsencaoMotivo || '').trim();
  const isencaoValida = Boolean(pisoIsento) && motivoIsencaoLimpo.length >= 15;

  // Carga Fracionada com múltiplos tomadores é dispensada da tabela de lotação ANTT 5.867 quando caracterizada
  const isFracionadaIsenta =
    removerAcentos(tipoOperacao) === 'CARGA FRACIONADA' && Boolean(pisoIsento);

  const aprovadoPeloValor = freteNum >= pisoCalculado;
  const aprovadoFinal = aprovadoPeloValor || isencaoValida || isFracionadaIsenta;

  return {
    piso: pisoCalculado,
    ccd: coef.ccd,
    cc: coef.cc,
    eixos,
    distancia_km: kmFinal,
    distancia_estimada: usouEstimativa,
    categoria_codigo: cat.codigo,
    categoria_nome: cat.nome,
    tabela: isAltoDesempenho && cat.alto_desempenho ? 'B (Alto Desempenho)' : 'A (Carga Lotação)',
    retorno_vazio: Boolean(retornoVazio),
    parcela_retorno_vazio: Math.round(parcelaRetornoVazio * 100) / 100,
    valor_frete: freteNum,
    diferenca: Math.round((freteNum - pisoCalculado) * 100) / 100,
    aprovado: aprovadoFinal,
    aprovado_valor: aprovadoPeloValor,
    isento: isencaoValida || isFracionadaIsenta,
    isencao_motivo: motivoIsencaoLimpo || null,
    margem: Math.round(pisoCalculado * 1.05 * 100) / 100,
  };
}

function listarCategoriasCargaAntt() {
  return Object.values(CATEGORIAS_CARGA_ANTT).map((c) => ({
    codigo: c.codigo,
    nome: c.nome,
    eixos_disponiveis: Object.keys(c.lotacao).map(Number),
  }));
}

module.exports = {
  EIXOS_VALIDOS,
  CATEGORIAS_CARGA_ANTT,
  normalizarEixosAntt,
  estimarDistanciaRodoviariaKm,
  calcularPisoMinimoAntt,
  listarCategoriasCargaAntt,
};
