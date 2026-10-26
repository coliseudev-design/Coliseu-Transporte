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

/**
 * Mapeia o tipo de veículo retornado pela API para o tipo de rodado do CT-e/MDF-e.
 * Referência: Manual de Orientação do Contribuinte — campo tpRod.
 */
function mapearTipoRodado(tipoVeiculo) {
    const t = String(tipoVeiculo || '').toLowerCase();

    if (t.includes('caminhão') || t.includes('caminhao')) return '03'; // Cavalo Mecânico
    if (t.includes('caminhonete') || t.includes('caminhonete')) return '04'; // Van
    if (t.includes('caminhão') || t.includes('caminhao')) return '01'; // Truck
    if (t.includes('utilitário') || t.includes('utilitario')) return '05'; // Utilitário
    if (t.includes('automóvel') || t.includes('automóvel') || t.includes('automoveis')) return '06';
    if (t.includes('moto')) return '07';
    if (t.includes('trator')) return '08';
    if (t.includes('reboque') || t.includes('semirreboque')) return '09';
    return '01'; // Padrão: Truck
}

/**
 * Mapeia o tipo de veículo para o tipo de carroceria (tpCar).
 */
function mapearTipoCarroceria(tipoVeiculo) {
    const t = String(tipoVeiculo || '').toLowerCase();

    if (t.includes('sider') || t.includes('porta container') || t.includes('portacontainer')) return '03'; // Sider
    if (t.includes('tanque')) return '04'; // Tanque
    if (t.includes('bau') || t.includes('baú')) return '01'; // Fechada/Baú
    if (t.includes('carroceria aberta') || t.includes('carga seca') || t.includes('carga aberta')) return '02'; // Aberta
    if (t.includes('frigorific')) return '05'; // Frigorificada
    return '01';
}

/**
 * Normaliza a placa para o padrão MERCOSUL (ABC1D23) ou antigo (ABC1234).
 */
function normalizarPlaca(placa) {
    const limpo = String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (limpo.length === 7) {
        // Se os 5 primeiros são letras → MERCOSUL, senão formato antigo
        return /^[A-Z]{3}\d/.test(limpo)
            ? `${limpo.slice(0, 3)}-${limpo.slice(3)}`
            : `${limpo.slice(0, 3)}-${limpo.slice(3)}`;
    }
    return limpo;
}

/**
 * Consulta a placa e devolve os dados normalizados para o cadastro.
 * @param {string} placa
 * @returns {Promise<{ encontrado: boolean, dados?: object, motivo?: string }>}
 */
async function consultarPlaca(placa) {
    const limpa = normalizarPlaca(placa);

    if (!limpa || limpa.length !== 7) {
        return { encontrado: false, motivo: 'Placa deve ter 7 caracteres (ABC1234 ou ABC1D23).' };
    }

    // Cache
    const emCache = CACHE.get(limpa);
    if (emCache && emCache.expiraEm > Date.now()) {
        return emCache.dados;
    }

    const urls = [
        `https://brasilapi.com.br/api/consulta/placa/${encodeURIComponent(limpa)}`,
        `https://cdn.apiblatt.com.br/consulta/placa/${encodeURIComponent(limpa)}`
    ];

    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { Accept: 'application/json' }
            });

            const d = res.data;
            if (!d || (d.marca === undefined && d.modelo === undefined)) continue;

            const resultado = {
                encontrado: true,
                dados: {
                    placa: limpa,
                    marca: d.marca || '',
                    modelo: d.modelo || '',
                    cor: d.cor || '',
                    ano_modelo: d.ano_modelo || '',
                    ano_fabricacao: d.ano_fabricacao || '',
                    tipo_veiculo: d.tipo_veiculo || '',
                    tipo_rodado: mapearTipoRodado(d.tipo_veiculo),
                    tipo_carroceria: mapearTipoCarroceria(d.tipo_veiculo),
                    chassi: d.chassi || '',
                    numero_serie: d.numero_serie || '',
                    capacidade_kg: d.capacidade_kg ? Number(String(d.capacidade_kg).replace(',', '.')) : null,
                    eixos: d.eixos || d.quantidade_eixos || null,
                    municipio: d.municipio || '',
                    uf: d.uf || '',
                    fonte: 'BrasilAPI'
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
    normalizarPlaca,
    mapearTipoRodado,
    mapearTipoCarroceria
};
