'use strict';

const IBGE_UF_BY_CODE = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

const UF_BY_NOME_ESTADO = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAPA: 'AP',
  AMAZONAS: 'AM',
  BAHIA: 'BA',
  CEARA: 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  PARA: 'PA',
  PARAIBA: 'PB',
  PARANA: 'PR',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  SERGIPE: 'SE',
  TOCANTINS: 'TO',
};

const CAPITAIS_IBGE = {
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

// Base oficial IBGE: 100% dos 79 municípios de MS + capitais + polos logísticos nacionais
const MUNICIPIOS_BASE = [
  // Mato Grosso do Sul (79 municípios)
  ['5000203', 'Agua Clara', 'MS'],
  ['5000252', 'Alcinopolis', 'MS'],
  ['5000609', 'Amambai', 'MS'],
  ['5000708', 'Anastacio', 'MS'],
  ['5000807', 'Anaurilandia', 'MS'],
  ['5000856', 'Angelica', 'MS'],
  ['5000906', 'Antonio Joao', 'MS'],
  ['5001003', 'Aparecida do Taboado', 'MS'],
  ['5001102', 'Aquidauana', 'MS'],
  ['5001243', 'Aral Moreira', 'MS'],
  ['5001508', 'Bandeirantes', 'MS'],
  ['5001904', 'Bataguassu', 'MS'],
  ['5002001', 'Bataypora', 'MS'],
  ['5002100', 'Bela Vista', 'MS'],
  ['5002159', 'Bodoquena', 'MS'],
  ['5002209', 'Bonito', 'MS'],
  ['5002308', 'Brasilandia', 'MS'],
  ['5002407', 'Caarapo', 'MS'],
  ['5002605', 'Camapua', 'MS'],
  ['5002704', 'Campo Grande', 'MS'],
  ['5002803', 'Caracol', 'MS'],
  ['5002902', 'Cassilandia', 'MS'],
  ['5002951', 'Chapadao do Sul', 'MS'],
  ['5003108', 'Corguinho', 'MS'],
  ['5003157', 'Coronel Sapucaia', 'MS'],
  ['5003207', 'Corumba', 'MS'],
  ['5003256', 'Costa Rica', 'MS'],
  ['5003306', 'Coxim', 'MS'],
  ['5003454', 'Deodapolis', 'MS'],
  ['5003488', 'Dois Irmaos do Buriti', 'MS'],
  ['5003504', 'Douradina', 'MS'],
  ['5003702', 'Dourados', 'MS'],
  ['5003751', 'Eldorado', 'MS'],
  ['5003801', 'Fatima do Sul', 'MS'],
  ['5003900', 'Figueirao', 'MS'],
  ['5004007', 'Gloria de Dourados', 'MS'],
  ['5004106', 'Guia Lopes da Laguna', 'MS'],
  ['5004304', 'Iguatemi', 'MS'],
  ['5004403', 'Inocencia', 'MS'],
  ['5004502', 'Itapora', 'MS'],
  ['5004601', 'Itaquirai', 'MS'],
  ['5004700', 'Ivinhema', 'MS'],
  ['5004809', 'Japora', 'MS'],
  ['5004908', 'Jaraguari', 'MS'],
  ['5005004', 'Jardim', 'MS'],
  ['5005103', 'Jatei', 'MS'],
  ['5005152', 'Juti', 'MS'],
  ['5005202', 'Ladario', 'MS'],
  ['5005251', 'Laguna Carapa', 'MS'],
  ['5005400', 'Maracaju', 'MS'],
  ['5005608', 'Miranda', 'MS'],
  ['5005681', 'Mundo Novo', 'MS'],
  ['5005707', 'Navirai', 'MS'],
  ['5005806', 'Nioaque', 'MS'],
  ['5006002', 'Nova Alvorada do Sul', 'MS'],
  ['5006200', 'Nova Andradina', 'MS'],
  ['5006259', 'Novo Horizonte do Sul', 'MS'],
  ['5006275', 'Paraiso das Aguas', 'MS'],
  ['5006309', 'Paranaiba', 'MS'],
  ['5006358', 'Paranhos', 'MS'],
  ['5006408', 'Pedro Gomes', 'MS'],
  ['5006606', 'Ponta Pora', 'MS'],
  ['5006903', 'Porto Murtinho', 'MS'],
  ['5007109', 'Ribas do Rio Pardo', 'MS'],
  ['5007208', 'Rio Brilhante', 'MS'],
  ['5007307', 'Rio Negro', 'MS'],
  ['5007406', 'Rio Verde de Mato Grosso', 'MS'],
  ['5007505', 'Rochedo', 'MS'],
  ['5007554', 'Santa Rita do Pardo', 'MS'],
  ['5007695', 'Sao Gabriel do Oeste', 'MS'],
  ['5007703', 'Sete Quedas', 'MS'],
  ['5007802', 'Selviria', 'MS'],
  ['5007901', 'Sidrolandia', 'MS'],
  ['5007935', 'Sonora', 'MS'],
  ['5007950', 'Tacuru', 'MS'],
  ['5007976', 'Taquarussu', 'MS'],
  ['5008008', 'Terenos', 'MS'],
  ['5008305', 'Tres Lagoas', 'MS'],
  ['5008404', 'Vicentina', 'MS'],

  // Polos Logísticos PR / SP / MT / GO / SC / RS / MG
  ['4104808', 'Cascavel', 'PR'],
  ['4113700', 'Londrina', 'PR'],
  ['4115200', 'Maringa', 'PR'],
  ['4108304', 'Foz do Iguacu', 'PR'],
  ['4127700', 'Toledo', 'PR'],
  ['4128104', 'Umuarama', 'PR'],
  ['4108809', 'Guaira', 'PR'],
  ['4119905', 'Ponta Grossa', 'PR'],
  ['4118204', 'Paranagua', 'PR'],
  ['4106902', 'Curitiba', 'PR'],

  ['3550308', 'Sao Paulo', 'SP'],
  ['3509502', 'Campinas', 'SP'],
  ['3543402', 'Ribeirao Preto', 'SP'],
  ['3541406', 'Presidente Prudente', 'SP'],
  ['3549805', 'Sao Jose do Rio Preto', 'SP'],
  ['3506003', 'Bauru', 'SP'],
  ['3502804', 'Aracatuba', 'SP'],
  ['3548500', 'Santos', 'SP'],
  ['3518800', 'Guarulhos', 'SP'],
  ['3552205', 'Sorocaba', 'SP'],
  ['3525904', 'Jundiai', 'SP'],
  ['3505708', 'Barueri', 'SP'],
  ['3534401', 'Osasco', 'SP'],
  ['3501608', 'Americana', 'SP'],
  ['3538709', 'Piracicaba', 'SP'],

  ['5103403', 'Cuiaba', 'MT'],
  ['5107602', 'Rondonopolis', 'MT'],
  ['5107909', 'Sinop', 'MT'],
  ['5107925', 'Sorriso', 'MT'],
  ['5105259', 'Lucas do Rio Verde', 'MT'],
  ['5108402', 'Varzea Grande', 'MT'],
  ['5107040', 'Primavera do Leste', 'MT'],
  ['5101803', 'Barra do Garcas', 'MT'],
  ['5107958', 'Tangara da Serra', 'MT'],

  ['5208707', 'Goiania', 'GO'],
  ['5201108', 'Anapolis', 'GO'],
  ['5218805', 'Rio Verde', 'GO'],
  ['5211909', 'Jatai', 'GO'],
  ['5201405', 'Aparecida de Goiania', 'GO'],
  ['5211503', 'Itumbiara', 'GO'],
  ['5213103', 'Mineiros', 'GO'],

  ['4205407', 'Florianopolis', 'SC'],
  ['4209102', 'Joinville', 'SC'],
  ['4208203', 'Itajai', 'SC'],
  ['4204202', 'Chapeco', 'SC'],
  ['4202404', 'Blumenau', 'SC'],
  ['4204608', 'Criciuma', 'SC'],

  ['4314902', 'Porto Alegre', 'RS'],
  ['4305108', 'Caxias do Sul', 'RS'],
  ['4304606', 'Canoas', 'RS'],
  ['4314100', 'Passo Fundo', 'RS'],
  ['4314407', 'Pelotas', 'RS'],
  ['4322400', 'Uruguaiana', 'RS'],

  ['3106200', 'Belo Horizonte', 'MG'],
  ['3170206', 'Uberlandia', 'MG'],
  ['3170107', 'Uberaba', 'MG'],
  ['3118601', 'Contagem', 'MG'],
  ['3136702', 'Juiz de Fora', 'MG'],
  ['3106705', 'Betim', 'MG'],
];

for (const [uf, cap] of Object.entries(CAPITAIS_IBGE)) {
  if (!MUNICIPIOS_BASE.some(([cod]) => cod === cap.codigo)) {
    MUNICIPIOS_BASE.push([cap.codigo, cap.nome, uf]);
  }
}

function digitsOnly(val) {
  return String(val || '').replace(/\D/g, '');
}

function normalizarTextoBusca(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarUf(valor) {
  if (!valor) return '';
  const raw = String(valor).trim();
  const dig = digitsOnly(raw);
  if (dig.length === 2 && IBGE_UF_BY_CODE[dig]) {
    return IBGE_UF_BY_CODE[dig];
  }
  const limpo = normalizarTextoBusca(raw);
  if (limpo.length === 2 && CAPITAIS_IBGE[limpo]) {
    return limpo;
  }
  return UF_BY_NOME_ESTADO[limpo] || '';
}

const INDEX_POR_CHAVE_UF_CIDADE = new Map();
const INDEX_POR_CODIGO_IBGE = new Map();
const INDEX_POR_CIDADE_UNICA = new Map();

function registrarMunicipioCache(codigo, nome, uf) {
  const cod = digitsOnly(codigo);
  const ufNorm = normalizarUf(uf);
  const nomeLimpo = String(nome || '').trim();
  if (cod.length !== 7 || !ufNorm || !nomeLimpo) return;

  const chaveCidade = normalizarTextoBusca(nomeLimpo);
  const registro = { codigo: cod, nome: nomeLimpo, uf: ufNorm };
  INDEX_POR_CODIGO_IBGE.set(cod, registro);
  INDEX_POR_CHAVE_UF_CIDADE.set(`${ufNorm}:${chaveCidade}`, registro);
  if (!INDEX_POR_CIDADE_UNICA.has(chaveCidade)) {
    INDEX_POR_CIDADE_UNICA.set(chaveCidade, registro);
  }
}

for (const [cod, nome, uf] of MUNICIPIOS_BASE) {
  registrarMunicipioCache(cod, nome, uf);
}

/**
 * Extrai metadados estruturais de uma chave de acesso SEFAZ de 44 dígitos.
 */
function extrairMetadadosChave44(chaveRaw) {
  const ch = digitsOnly(chaveRaw);
  if (ch.length !== 44) return null;
  const ufCodigo = ch.slice(0, 2);
  const aamm = ch.slice(2, 6);
  const cnpjEmitente = ch.slice(6, 20);
  const modelo = ch.slice(20, 22);
  const serie = String(parseInt(ch.slice(22, 25), 10) || 1);
  const numero = String(parseInt(ch.slice(25, 34), 10) || 0);
  return {
    chave: ch,
    uf_codigo: ufCodigo,
    uf_emitente: IBGE_UF_BY_CODE[ufCodigo] || '',
    aamm,
    cnpj_emitente: cnpjEmitente,
    modelo,
    serie,
    numero,
  };
}

/**
 * Resolve código IBGE de 7 dígitos de forma síncrona (dicionário oficial + cache aquecido do banco).
 */
function resolverIbgeMunicipioSync(codigoIbge, nomeMunicipio, uf) {
  const cleanCode = digitsOnly(codigoIbge);
  const ufNorm = normalizarUf(uf) || (cleanCode.length === 7 ? IBGE_UF_BY_CODE[cleanCode.slice(0, 2)] : '') || 'MS';

  if (cleanCode.length === 7) {
    const conhecido = INDEX_POR_CODIGO_IBGE.get(cleanCode);
    const ufDoCodigo = IBGE_UF_BY_CODE[cleanCode.slice(0, 2)] || ufNorm;
    return {
      codigo: cleanCode,
      nome: (nomeMunicipio && String(nomeMunicipio).trim()) || conhecido?.nome || CAPITAIS_IBGE[ufDoCodigo]?.nome || 'Campo Grande',
      uf: ufDoCodigo,
      exato: true,
    };
  }

  const chaveCidade = normalizarTextoBusca(nomeMunicipio);
  if (chaveCidade) {
    const porUfCidade = INDEX_POR_CHAVE_UF_CIDADE.get(`${ufNorm}:${chaveCidade}`);
    if (porUfCidade) {
      return {
        codigo: porUfCidade.codigo,
        nome: String(nomeMunicipio).trim() || porUfCidade.nome,
        uf: porUfCidade.uf,
        exato: true,
      };
    }

    if (!normalizarUf(uf)) {
      const porCidadeUnica = INDEX_POR_CIDADE_UNICA.get(chaveCidade);
      if (porCidadeUnica) {
        return {
          codigo: porCidadeUnica.codigo,
          nome: String(nomeMunicipio).trim() || porCidadeUnica.nome,
          uf: porCidadeUnica.uf,
          exato: true,
        };
      }
    }
  }

  const cap = CAPITAIS_IBGE[ufNorm] || CAPITAIS_IBGE.MS;
  return {
    codigo: cap.codigo,
    nome: (nomeMunicipio && String(nomeMunicipio).trim()) || cap.nome,
    uf: ufNorm,
    exato: false,
  };
}

/**
 * Resolve código IBGE consultando primeiro o dicionário em memória e, se não encontrar,
 * consulta `dash_coordenadas_municipios` e `dash_regioes` no PostgreSQL (cacheando o resultado).
 */
async function resolverIbgeMunicipioAsync(dbOrClient, codigoIbge, nomeMunicipio, uf) {
  const syncRes = resolverIbgeMunicipioSync(codigoIbge, nomeMunicipio, uf);
  if (syncRes.exato || !dbOrClient || typeof dbOrClient.query !== 'function' || !nomeMunicipio) {
    return syncRes;
  }

  const ufNorm = normalizarUf(uf);
  const nomeTrim = String(nomeMunicipio).trim();

  try {
    const { rows } = await dbOrClient.query(
      `SELECT codigo_ibge, nome, uf
       FROM (
         SELECT codigo_ibge, nome, uf FROM dash_coordenadas_municipios
         WHERE codigo_ibge IS NOT NULL AND LENGTH(REGEXP_REPLACE(codigo_ibge, '\\D', '', 'g')) = 7
         UNION ALL
         SELECT cod_ibge AS codigo_ibge, cidade AS nome, uf FROM dash_regioes
         WHERE cod_ibge IS NOT NULL AND LENGTH(REGEXP_REPLACE(cod_ibge, '\\D', '', 'g')) = 7
       ) base
       WHERE UPPER(TRANSLATE(TRIM(base.nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
             = $1
       LIMIT 5`,
      [normalizarTextoBusca(nomeTrim)]
    );

    for (const r of rows || []) {
      const rUf = normalizarUf(r.uf) || IBGE_UF_BY_CODE[digitsOnly(r.codigo_ibge).slice(0, 2)] || ufNorm;
      registrarMunicipioCache(r.codigo_ibge, r.nome, rUf);
      if (!ufNorm || rUf === ufNorm) {
        return {
          codigo: digitsOnly(r.codigo_ibge),
          nome: nomeTrim || r.nome,
          uf: rUf || 'MS',
          exato: true,
        };
      }
    }
  } catch (_) {
    // Tabela auxiliar pode não existir em testes unitários isolados
  }

  return syncRes;
}

function listarMunicipiosDicionario(ufFiltro = '', busca = '') {
  const ufNorm = normalizarUf(ufFiltro);
  const q = normalizarTextoBusca(busca);
  const lista = Array.from(INDEX_POR_CODIGO_IBGE.values()).filter((m) => {
    if (ufNorm && m.uf !== ufNorm) return false;
    if (q && !normalizarTextoBusca(m.nome).includes(q) && !m.codigo.includes(q)) return false;
    return true;
  });
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

module.exports = {
  IBGE_UF_BY_CODE,
  CAPITAIS_IBGE,
  normalizarTextoBusca,
  normalizarUf,
  extrairMetadadosChave44,
  registrarMunicipioCache,
  resolverIbgeMunicipioSync,
  resolverIbgeMunicipioAsync,
  listarMunicipiosDicionario,
};
