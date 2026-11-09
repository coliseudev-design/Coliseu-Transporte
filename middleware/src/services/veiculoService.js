'use strict';

const axios = require('axios');
const logger = require('../config/logger');

/**
 * Consulta de veículos pela placa usando a API pública BrasilAPI.
 * Documentação: https://brasilapi.com.br/docs/veiculos
 *
 * A API é gratuita e não exige chave. Se estiver indisponível ou a placa não
 * existir, retornamos um objeto vazio — o cadastro manual continua possível.
 */

const TIMEOUT_MS = 8000;
const CACHE = new Map(); // placa → { dados, expiraEm }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const PLACA_ANTIGA_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const PLACA_MERCOSUL_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/**
 * Mapeia o tipo de veículo retornado pela API para o tipo de rodado do CT-e/MDF-e (domínio SEFAZ 01..06).
 * Referência: Manual de Orientação do Contribuinte — campo tpRod.
 */
function mapearTipoRodado(tipoVeiculo) {
    const t = String(tipoVeiculo || '').trim().toLowerCase();
    if (!t) return '01';

    if (t.includes('trator') || t.includes('cavalo')) return '03'; // 03 - Cavalo Mecânico (Caminhão Trator)
    if (t.includes('toco') || t.includes('semi-pesado') || t.includes('semipesado')) return '02'; // 02 - Toco
    if (t.includes('truck') || t.includes('caminhão') || t.includes('caminhao')) return '01'; // 01 - Truck
    if (t.includes('van') || t.includes('furgão') || t.includes('furgao') || t.includes('microonibus') || t.includes('micro-ônibus')) return '04'; // 04 - VAN
    if (t.includes('caminhonete') || t.includes('camioneta') || t.includes('utilitário') || t.includes('utilitario')) return '05'; // 05 - Utilitário
    if (t.includes('automóvel') || t.includes('automovel') || t.includes('moto') || t.includes('reboque') || t.includes('semirreboque')) return '06'; // 06 - Outros
    return '01'; // Padrão: Truck
}

/**
 * Mapeia o tipo de veículo para o tipo de carroceria (tpCar).
 */
function mapearTipoCarroceria(tipoVeiculo) {
    const t = String(tipoVeiculo || '').toLowerCase();

    if (t.includes('sider')) return '03'; // Sider
    if (t.includes('porta container') || t.includes('portacontainer')) return '04'; // Porta Container
    if (t.includes('bau') || t.includes('baú') || t.includes('fechad') || t.includes('frigorific')) return '02'; // Fechada/Baú
    if (t.includes('carroceria aberta') || t.includes('carga seca') || t.includes('carga aberta') || t.includes('grade baixa')) return '01'; // Aberta
    return '00'; // Não aplicável / Preenchimento manual
}

/**
 * Normaliza a placa para 7 caracteres alfanuméricos maiúsculos sem hífen (padrão SEFAZ/Mercosul: ABC1234 ou ABC1D23).
 */
function normalizarPlaca(placa) {
    return String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Valida placas brasileiras tanto no padrão antigo (ABC-1234 / ABC1234) quanto Mercosul (ABC1D23).
 */
function validarPlaca(placa) {
    const limpa = normalizarPlaca(placa);
    if (PLACA_ANTIGA_REGEX.test(limpa)) {
        return {
            valida: true,
            limpa,
            padrao: 'ANTIGA',
            formatada: `${limpa.slice(0, 3)}-${limpa.slice(3)}`
        };
    }
    if (PLACA_MERCOSUL_REGEX.test(limpa)) {
        return {
            valida: true,
            limpa,
            padrao: 'MERCOSUL',
            formatada: limpa
        };
    }
    return {
        valida: false,
        limpa,
        padrao: null,
        formatada: limpa
    };
}

/**
 * Formata a placa para exibição amigável (ABC-1234 no padrão antigo ou ABC1D23 no Mercosul).
 */
function formatarPlacaExibicao(placa) {
    const limpa = normalizarPlaca(placa);
    if (limpa.length !== 7) return limpa;
    return PLACA_ANTIGA_REGEX.test(limpa)
        ? `${limpa.slice(0, 3)}-${limpa.slice(3)}`
        : limpa;
}

/**
 * Consulta a placa e devolve os dados normalizados para o cadastro.
 * @param {string} placa
 * @returns {Promise<{ encontrado: boolean, dados?: object, motivo?: string }>}
 */
async function consultarPlaca(placa) {
    const limpa = normalizarPlaca(placa);

    if (!limpa || limpa.length !== 7 || !PLACA_REGEX.test(limpa)) {
        return { encontrado: false, motivo: 'Placa inválida. Informe 7 caracteres no padrão ABC1234 ou ABC1D23.' };
    }

    // Cache
    const emCache = CACHE.get(limpa);
    if (emCache && emCache.expiraEm > Date.now()) {
        return emCache.dados;
    }

    const urls = [
        `https://brasilapi.com.br/api/fipe/placa/v1/${encodeURIComponent(limpa)}`,
        `https://brasilapi.com.br/api/consulta/placa/${encodeURIComponent(limpa)}`,
        `https://cdn.apiblatt.com.br/consulta/placa/${encodeURIComponent(limpa)}`
    ];

    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { Accept: 'application/json' }
            });

            const raw = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!raw || (raw.marca === undefined && raw.modelo === undefined)) continue;

            const tipoVeiculo = raw.tipo_veiculo || raw.especie || raw.segmento || '';
            const resultado = {
                encontrado: true,
                dados: {
                    placa: limpa,
                    placa_formatada: formatarPlacaExibicao(limpa),
                    marca: raw.marca || '',
                    modelo: raw.modelo || '',
                    cor: raw.cor || '',
                    ano_modelo: raw.ano_modelo || raw.anoModelo || '',
                    ano_fabricacao: raw.ano_fabricacao || raw.ano || '',
                    tipo_veiculo: tipoVeiculo,
                    tipo_rodado: mapearTipoRodado(tipoVeiculo),
                    tipo_carroceria: mapearTipoCarroceria(tipoVeiculo),
                    chassi: raw.chassi || '',
                    numero_serie: raw.numero_serie || '',
                    capacidade_kg: raw.capacidade_kg ? Number(String(raw.capacidade_kg).replace(',', '.')) : null,
                    eixos: raw.eixos || raw.quantidade_eixos || null,
                    municipio: raw.municipio || '',
                    uf: raw.uf || '',
                    fonte: new URL(url).hostname
                }
            };

            CACHE.set(limpa, { dados: resultado, expiraEm: Date.now() + CACHE_TTL_MS });
            return resultado;
        } catch (err) {
            logger.warn(`[VeiculoService] Falha ao consultar placa ${limpa} em ${new URL(url).host}: ${err.message}`);
        }
    }

    return {
        encontrado: false,
        motivo: 'Placa não encontrada nas bases de consulta. Preencha os dados manualmente.'
    };
}

module.exports = {
    consultarPlaca,
    validarPlaca,
    normalizarPlaca,
    formatarPlacaExibicao,
    mapearTipoRodado,
    mapearTipoCarroceria
};
