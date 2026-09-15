'use strict';

const logger = require('../config/logger');

/**
 * Middleware centralizado de tratamento de erros do Express.
 * 
 * @param {Error} err 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    const status = err.status || 500;
    const body = {
        error: "Erro Interno no Servidor",
        code: "INTERNAL_ERROR"
    };

    // Erros conhecidos
    if (err.type === 'entity.parse.failed') {
        body.error = "Payload JSON inválido";
        body.code = "INVALID_JSON";
    } else if (err.type === 'entity.too.large') {
        body.error = "request entity too large";
        body.code = "PAYLOAD_TOO_LARGE";
    }

    if (process.env.NODE_ENV !== 'production' && status === 500) {
        body.details = err.message;
        body.stack = err.stack;
    }

    logger.error(`[Error] ${status} - ${err.message}`, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        stack: err.stack
    });

    res.status(status).json(body);
}

module.exports = {
    errorHandler
};
