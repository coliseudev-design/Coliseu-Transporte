'use strict';

/**
 * Validação de Chave de Acesso de documento fiscal eletrônico (NF-e, CT-e, MDF-e).
 *
 * Layout oficial (44 dígitos):
 *   cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(8) tpEmis(1)
 *   cMun(4) NF(3) tpAmb(1) cFin(1) indPres(1) indIntermed(1) cDV(1)
 *
 * O 44º dígito é o DV, calculado por módulo 11 com pesos cíclicos 2..9.
 *
 * ⚠ Observação importante: o ERP Coliseu sincroniza chaves com **45 dígitos**,
 * porque o campo nNF (número da nota) é gravado com 9 posições — prefixado com
 * zero à esquerda — em vez das 8 do layout oficial. Verificado nas chaves reais
 * do ERP: o dígito verificador confere normalmente após remover esse zero.
 * Nesses casos sinalizamos `formato_irregular` para que a origem seja
 * corrigida, sem bloquear a operação.
 */

/**
 * Calcula o dígito verificador de uma chave sem o DV.
 * @param {string} chaveSemDV - 43 dígitos
 * @returns {number} dígito 0-9 (ou -1 se a chave não for numérica)
 */
function calcularDigitoVerificador(chaveSemDV) {
    let peso = 2;
    let soma = 0;

    // Da direita para a esquerda, pesos cíclicos 2..9
    for (let i = chaveSemDV.length - 1; i >= 0; i--) {
        const digito = parseInt(chaveSemDV.charAt(i), 10);
        if (Number.isNaN(digito)) return -1;
        soma += digito * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }

    const resto = soma % 11;
    return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

/**
 * Normaliza a chave para o layout oficial de 44 dígitos.
 *
 * O ERP Coliseu grava o nNF com 9 posições (prefixado com zero à esquerda).
 * A posição do dígito excedente é a 26 (1-based), imediatamente antes do
 * nNF propriamente dito.
 *
 * @returns {{ normalizada: string, irregular: boolean }}
 */
function normalizarChave(limpa) {
    if (limpa.length === 45) {
        return { normalizada: limpa.substring(0, 25) + limpa.substring(26), irregular: true };
    }
    return { normalizada: limpa, irregular: false };
}

/**
 * Verifica se a chave de acesso é estruturalmente válida.
 * @param {string} chave
 * @returns {{ valido: boolean, motivo?: string, formato_irregular?: boolean, aviso?: string }}
 */
function validarChaveAcesso(chave) {
    if (!chave || typeof chave !== 'string') {
        return { valido: false, motivo: 'Chave de acesso não informada.' };
    }

    const limpa = chave.replace(/\D/g, '');

    if (![44, 45].includes(limpa.length)) {
        return {
            valido: false,
            motivo: `Chave de acesso deve ter 44 dígitos (recebidos: ${limpa.length}).`
        };
    }

    const { normalizada, irregular } = normalizarChave(limpa);

    // [1-2] cUF — UF do emitente
    const uf = parseInt(normalizada.substring(0, 2), 10);
    if (uf === 0 || uf > 53) {
        return { valido: false, motivo: 'Código da UF do emitente inválido na chave de acesso.' };
    }

    // [3-6] AAMM — período de emissão
    const mes = parseInt(normalizada.substring(4, 6), 10);
    if (mes < 1 || mes > 12) {
        return { valido: false, motivo: 'Período de emissão (AAMM) inválido na chave de acesso.' };
    }

    // [7-20] CNPJ do emitente
    if (!/^\d{14}$/.test(normalizada.substring(6, 20))) {
        return { valido: false, motivo: 'CNPJ do emitente inválido na chave de acesso.' };
    }

    // [21-22] mod — modelo do documento
    const modelo = parseInt(normalizada.substring(20, 22), 10);
    if (![55, 57, 58, 65].includes(modelo)) {
        return {
            valido: false,
            motivo: `Modelo de documento inválido (${modelo}). Esperado 55 (NF-e), 57 (CT-e), 58 (MDF-e) ou 65 (NFC-e).`
        };
    }

    // [23-25] série
    // [26-33] nNF (8 posições no layout oficial)
    // [34] tpEmis — tipo de emissão
    const tipoEmissao = parseInt(normalizada.substring(33, 34), 10);
    if (tipoEmissao < 1 || tipoEmissao > 9) {
        return { valido: false, motivo: 'Tipo de emissão inválido na chave de acesso.' };
    }

    // [35-38] cMun — município de ocorrência
    // [39-41] NF
    // [40] não é tpAmb; tpAmb fica em [41]
    const tpAmb = parseInt(normalizada.substring(40, 41), 10);
    if (tpAmb !== 1 && tpAmb !== 2) {
        return { valido: false, motivo: 'Ambiente de emissão inválido na chave de acesso.' };
    }

    // [44] cDV — módulo 11
    const semDv = normalizada.substring(0, 43);
    const dvInformado = parseInt(normalizada.charAt(43), 10);
    const dvCalculado = calcularDigitoVerificador(semDv);

    if (dvCalculado !== dvInformado) {
        return {
            valido: false,
            motivo: `Dígito verificador inválido (informado: ${dvInformado}, calculado: ${dvCalculado}).`
        };
    }

    return irregular
        ? {
            valido: true,
            formato_irregular: true,
            aviso: 'Chave com 45 dígitos (nNF extended do ERP). O dígito verificador confere, mas o formato oficial tem 44 dígitos.'
        }
        : { valido: true };
}

/**
 * Valida uma lista de chaves e sinaliza duplicadas.
 * @param {string[]} chaves
 */
function validarLoteChaves(chaves) {
    const contagem = {};
    for (const c of chaves) {
        const l = String(c || '').replace(/\D/g, '');
        contagem[l] = (contagem[l] || 0) + 1;
    }

    return chaves.map(chave => {
        const resultado = validarChaveAcesso(chave);
        const limpa = String(chave || '').replace(/\D/g, '');
        return {
            chave,
            ...resultado,
            duplicada: contagem[limpa] > 1
        };
    });
}

/**
 * Extrai o código IBGE do município da chave.
 */
function extrairCodigoMunicipio(chave) {
    const limpa = String(chave || '').replace(/\D/g, '');
    if (![44, 45].includes(limpa.length)) return null;
    const { normalizada } = normalizarChave(limpa);
    return normalizada.substring(34, 38);
}

/**
 * Extrai o CNPJ do emitente da chave.
 */
function extrairCnpjEmitente(chave) {
    const limpa = String(chave || '').replace(/\D/g, '');
    if (![44, 45].includes(limpa.length)) return null;
    const { normalizada } = normalizarChave(limpa);
    return normalizada.substring(6, 20);
}

/**
 * Extrai o número do documento (nNF) da chave.
 */
function extrairNumeroDocumento(chave) {
    const limpa = String(chave || '').replace(/\D/g, '');
    if (![44, 45].includes(limpa.length)) return null;
    const { normalizada } = normalizarChave(limpa);
    return normalizada.substring(25, 33);
}

module.exports = {
    calcularDigitoVerificador,
    normalizarChave,
    validarChaveAcesso,
    validarLoteChaves,
    extrairCodigoMunicipio,
    extrairCnpjEmitente,
    extrairNumeroDocumento
};
