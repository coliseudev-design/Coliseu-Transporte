'use strict';

const logger = require('./logger');

// Store: { [key: string]: { data: any, expiresAt: number } }
const cacheMap = new Map();

/**
 * Obtém os dados do cache se ainda não estiverem expirados.
 * @param {string} key 
 */
function getCache(key) {
    const entry = cacheMap.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
        cacheMap.delete(key);
        return null;
    }
    
    return entry.data;
}

/**
 * Salva os dados no cache.
 * @param {string} key 
 * @param {any} data 
 * @param {number} ttlSeconds Padrão: 5 minutos
 */
function setCache(key, data, ttlSeconds = 300) {
    cacheMap.set(key, {
        data,
        expiresAt: Date.now() + (ttlSeconds * 1000)
    });
}

/**
 * Invalida todo o cache de um tenant específico.
 * Chamado automaticamente pelo worker após sincronização.
 * @param {string} tenantId 
 */
function invalidateTenant(tenantId) {
    let count = 0;
    for (const key of cacheMap.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
            cacheMap.delete(key);
            count++;
        }
    }
    if (count > 0) {
        logger.info(`[Cache] Invalidou ${count} chaves para o tenant ${tenantId}`);
    }
}

module.exports = {
    getCache,
    setCache,
    invalidateTenant
};
