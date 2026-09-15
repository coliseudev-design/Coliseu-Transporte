'use strict';

/**
 * Converte um qualificador de período do frontend em datas start/end para SQL.
 * Suporta: today, yesterday, last7, thisMonth, lastMonth, last12m, custom
 * e também os legados: hoje, 7d, 30d, 1m, 3m, 6m, 1y, ytd, all
 */
function toBrazilTZString(dateObj) {
    if (!dateObj) return null;
    const pad = (n) => n.toString().padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}-03:00`;
}

function getPeriodRange(period, startDate, endDate, anchorDate) {
    const now = anchorDate ? new Date(anchorDate) : new Date();
    let start = new Date(now);
    let end = new Date(now);

    switch (period) {
        // Valores enviados pelo frontend React
        case 'today':
        case 'hoje':
            start.setUTCHours(0, 0, 0, 0);
            end.setUTCHours(23, 59, 59, 999);
            break;
        case 'yesterday':
            start.setUTCDate(start.getUTCDate() - 1);
            start.setUTCHours(0, 0, 0, 0);
            end.setUTCDate(end.getUTCDate() - 1);
            end.setUTCHours(23, 59, 59, 999);
            break;
        case 'last7':
        case '7d':
            start.setDate(start.getDate() - 7);
            break;
        case 'thisMonth':
        case '1m':
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            break;
        case 'lastMonth':
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
            break;
        case 'last12m':
        case '1y':
            start.setFullYear(start.getFullYear() - 1);
            break;
        case 'custom':
            if (startDate && endDate) {
                const [sy, sm, sd] = startDate.split('T')[0].split('-');
                start = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd), 0, 0, 0, 0);
                
                const [ey, em, ed] = endDate.split('T')[0].split('-');
                end = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed), 23, 59, 59, 999);
            } else {
                // fallback
                start.setDate(start.getDate() - 30);
            }
            break;
        case '15d':
            start.setDate(start.getDate() - 15);
            break;
        case '30d':
            start.setDate(start.getDate() - 30);
            break;
        case '3m':
            start.setMonth(start.getMonth() - 3);
            break;
        case '6m':
            start.setMonth(start.getMonth() - 6);
            break;
        case 'ytd':
            start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
            break;
        case 'all':
            start = new Date(1970, 0, 1);
            break;
        default:
            // fallback: último ano para cobrir bases de teste antigas
            start.setFullYear(start.getFullYear() - 1);
            break;
    }

    return { 
        start: toBrazilTZString(start), 
        end: toBrazilTZString(end) 
    };
}

function toSafeSqlString(dateObj) {
    if (!dateObj) return null;
    if (typeof dateObj === 'string') return dateObj;
    if (!(dateObj instanceof Date)) {
        dateObj = new Date(dateObj);
    }
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toISOString();
}

function parseDateString(dateStr, fallbackTime = '') {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    let cleanStr = dateStr;
    if (typeof cleanStr === 'string' && !cleanStr.includes('T') && !cleanStr.includes(' ')) {
        cleanStr = cleanStr + (fallbackTime || 'T00:00:00Z');
    }
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) return null;
    return d;
}

module.exports = {
    getPeriodRange,
    toSafeSqlString,
    parseDateString
};

