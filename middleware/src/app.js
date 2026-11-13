'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config/env');
const { requireWebJwt, requireInternalAuth, requireSyncOrWebAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { defaultLimit, authIpLimit, authLimit } = require('./middleware/rateLimiter');

// Rotas Nativas — Coliseu Transporte & Sincronizador ERP Coliseu
const authRouter = require('./routes/auth');
const healthRouter = require('./routes/health');
const syncRouter = require('./routes/sync');
const clientesRouter = require('./routes/clientes');
const usuariosRouter = require('./routes/usuarios');
const gruposAcessoRouter = require('./routes/gruposAcesso');
const configuracoesRouter = require('./routes/configuracoes');
const cadastrosRouter = require('./routes/cadastros');
const { router: filiaisRouter } = require('./routes/filiais');
const transporteRouter = require('./routes/transporte');
const TransporteService = require('./services/transporteService');

const app = express();

// Produção Coolify opera com 2 saltos de proxy (Traefik -> Nginx Frontend -> Express Middleware)
const trustProxyHops = Number.isFinite(Number(process.env.TRUST_PROXY_HOPS))
    ? Number(process.env.TRUST_PROXY_HOPS)
    : 2;
app.set('trust proxy', trustProxyHops);

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:"],
            frameAncestors: ["'self'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginResourcePolicy: false
}));

app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(), payment=()');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

const publicDir = path.join(__dirname, '../public');
const publicUploadsDir = path.join(publicDir, 'uploads');
const publicAssetsDir = path.join(publicDir, 'assets');

for (const dir of [publicUploadsDir, publicAssetsDir]) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (_) {}
}

app.use('/api/uploads', express.static(publicUploadsDir));
app.use('/uploads', express.static(publicUploadsDir));
app.use('/assets', express.static(publicAssetsDir));
app.use('/api/assets', express.static(publicAssetsDir));
app.use(express.static(publicDir));

app.use(cors({
    origin: config.security.allowedOrigins.length > 0
        ? config.security.allowedOrigins
        : '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Key', 'X-Tenant-Id'],
}));

const saveRawBody = (req, _res, buf) => {
    if (buf && buf.length && buf.length <= 2 * 1024 * 1024) {
        req.rawBody = Buffer.from(buf);
    }
};

// Rotas específicas de sincronização ERP e upload de XML/PFX/Logo que exigem payloads maiores (até 50MB)
const largeJsonParser = express.json({ limit: '50mb' });
app.use(
    [
        '/internal/sync',
        '/api/sync',
        '/api/configuracoes',
        '/api/transporte/certificados',
        '/api/transporte/emitentes',
        '/api/transporte/cargas/importar-xml',
        '/api/transporte/roteiro'
    ],
    largeJsonParser
);

// Limite padrão seguro (2MB) para todas as demais rotas públicas e autenticadas
app.use(express.json({ limit: '2mb', verify: saveRawBody }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Sanitizador global Defense-in-Depth para respostas HTTP 5xx (impede vazamento de SQLSTATE/infra no JSON)
const INTERNAL_LEAK_REGEX =
    /inconsistent types deduced|syntax error at or near|relation .* does not exist|column .* does not exist|violates .* constraint|could not determine data type|ECONNREFUSED|ENOTFOUND|password authentication failed|postgres:\/\/|postgresql:\/\/|SQLSTATE/i;
app.use((_req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = (body) => {
        if (
            res.statusCode >= 500 &&
            body &&
            typeof body === 'object' &&
            typeof body.error === 'string' &&
            INTERNAL_LEAK_REGEX.test(body.error)
        ) {
            return origJson({
                ...body,
                error: 'Erro interno ao processar a solicitação.',
            });
        }
        return origJson(body);
    };
    return next();
});

// Rate limit duplo (por IP e por IP+conta) nos endpoints de autenticação
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/alterar-senha'], authIpLimit, authLimit);
app.use('/api/auth', authRouter);
app.use('/health', healthRouter);

// Webhook público exclusivo da Focus NFe (retornos de autorização/rejeição de CT-e e MDF-e da SEFAZ)
const handleFocusWebhook = async (req, res) => {
    try {
        const resultado = await TransporteService.processarWebhook(req.body, req.headers);
        if (resultado?.unauthorized) {
            return res.status(401).json({ error: 'Não autorizado', code: 'INVALID_WEBHOOK_SECRET' });
        }
        return res.status(200).json({ received: true, ...resultado });
    } catch (err) {
        console.error('[Webhook Focus] Erro ao processar:', err.message);
        return res.status(200).json({ received: true, error: 'Erro ao processar webhook' });
    }
};
app.post(['/api/webhooks/focus', '/api/v1/webhooks/focus'], handleFocusWebhook);

// Rotas de sincronização do ERP Coliseu protegidas por autenticação híbrida (JWT Web/Device OU X-Internal-Key + X-Tenant-Id)
app.use('/api/sync', requireSyncOrWebAuth, syncRouter);

// Rotas do sistema Web (autenticação JWT obrigatória)
app.use('/api', requireWebJwt);
app.use('/api', defaultLimit);

app.use('/api/clientes', clientesRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/grupos-acesso', gruposAcessoRouter);
app.use('/api/configuracoes', configuracoesRouter);
app.use('/api/cadastros', cadastrosRouter);
app.use('/api/filiais', filiaisRouter);
app.use('/api/transporte', transporteRouter);

app.use('/internal', requireInternalAuth);
app.use('/internal/sync', syncRouter);

app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
});

app.use(errorHandler);

module.exports = app;
