'use strict';

const winston = require('winston');

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        process.env.NODE_ENV !== 'production' ? colorize() : winston.format.uncolorize(),
        logFormat
    ),
    defaultMeta: { service: 'dashboard-middleware' },
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
