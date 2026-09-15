'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');
const { requireWebJwt, requireInternalAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { defaultLimit } = require('./middleware/rateLimiter');

// Import Rotas
const authRouter = require('./routes/auth');
const healthRouter = require('./routes/health');
const syncRouter = require('./routes/sync');
const vendasRouter = require('./routes/vendas');
const produtosRouter = require('./routes/produtos');
const clientesRouter = require('./routes/clientes');
const financeiroRouter = require('./routes/financeiro');
const estatisticasRouter = require('./routes/estatisticas');
const rankingRouter = require('./routes/ranking');
const usuariosRouter = require('./routes/usuarios');
const configuracoesRouter = require('./routes/configuracoes');
const biRouter = require('./routes/bi');
const { router: filiaisRouter } = require('./routes/filiais');

const crmRouter = require('./routes/crm');
const contratosRouter = require('./routes/contratos');
const cobrancaRouter = require('./routes/cobranca');
const templatesRouter = require('./routes/templates');
const campanhasRouter = require('./routes/campanhas');
const automacoesRouter = require('./routes/automacoes');
const webhooksRouter = require('./routes/webhooks');
const asaasRouter = require('./routes/asaas');
const coraRouter = require('./routes/cora');
const emailRouter = require('./routes/email');
const { router: trackingRouter } = require('./routes/tracking');

const path = require('path');
const fs = require('fs');

const app = express();

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false
}));

// Serve static uploaded files/arts from both public directory and /tmp fallback
const publicDir = path.join(__dirname, '../public');
const publicUploadsDir = path.join(publicDir, 'uploads');
const publicAssetsDir = path.join(publicDir, 'assets');
const tmpUploadsArtsDir = path.join('/tmp', 'coliseu_uploads_arts');
const legacyTmpUploadsArtsDir = path.join('/tmp', 'nexus_uploads_arts');

try {
    if (!fs.existsSync(publicUploadsDir)) {
        fs.mkdirSync(publicUploadsDir, { recursive: true });
    }
} catch (err) {
    console.warn('[App] Warning creating public uploads dir:', err.message);
}

try {
    if (!fs.existsSync(publicAssetsDir)) {
        fs.mkdirSync(publicAssetsDir, { recursive: true });
    }
} catch (_) {}

try {
    if (!fs.existsSync(tmpUploadsArtsDir)) {
        fs.mkdirSync(tmpUploadsArtsDir, { recursive: true });
    }
    if (!fs.existsSync(legacyTmpUploadsArtsDir)) {
        fs.mkdirSync(legacyTmpUploadsArtsDir, { recursive: true });
    }
} catch (_) {}

app.use('/api/uploads/arts', express.static(path.join(publicUploadsDir, 'arts')));
app.use('/api/uploads/arts', express.static(tmpUploadsArtsDir));
app.use('/api/uploads/arts', express.static(legacyTmpUploadsArtsDir));
app.use('/api/uploads', express.static(publicUploadsDir));
app.use('/uploads/arts', express.static(path.join(publicUploadsDir, 'arts')));
app.use('/uploads/arts', express.static(tmpUploadsArtsDir));
app.use('/uploads/arts', express.static(legacyTmpUploadsArtsDir));
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

// Payload maximo via sync interno será alto (batches de milhares de linhas)
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', authRouter); // Pública (limitada pelo rateLimiter adiante, mas no momento tá sem)
app.use('/health', healthRouter);
app.use('/api/v1/webhooks', webhooksRouter); // Pública para receber webhooks do WhatsApp
app.use('/api/webhooks/asaas', asaasRouter); // Pública para receber webhooks do Banco Asaas
app.use('/api/webhooks/cora', coraRouter); // Pública para receber webhooks do Banco Cora
app.use(['/api/cora/webhook', '/api/cora/webhook-receive', '/cora/webhook', '/cora/webhook-receive'], coraRouter); // Pública para endpoints alternativos Cora

// Habilita rotas de sincronização para o Worker C#/Python e Frontend Web sem exigir JWT de usuário web
app.use('/api/sync', syncRouter);

// Rotas públicas de rastreamento de e-mails (abertura por pixel e clique por redirect)
app.use('/api/track', trackingRouter);
app.use('/track', trackingRouter);

// Rotas públicas para visualização de boletos pelos clientes e em abas externas
app.use(['/api/cora/boleto', '/cora/boleto'], (req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    req.url = '/boleto' + req.url;
    return coraRouter(req, res, next);
});
app.use(['/api/asaas/bank-slip', '/asaas/bank-slip'], (req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    req.url = '/bank-slip' + req.url;
    return asaasRouter(req, res, next);
});

// Rotas do sistema (Frontend Web com autenticação JWT)
app.use('/api', requireWebJwt);
app.use('/api', (req, res, next) => {
    if (req.tenant && req.tenant.id === 'c06a45f5-fd16-4f8c-92b6-af73c00ca278') {
        req.tenant.id = 'ed1d3a98-4c4d-48db-99c0-8751926eb8e5';
    }
    next();
});

app.use('/api', defaultLimit);

app.use('/api/vendas', vendasRouter);
app.use('/api/produtos', produtosRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/financeiro', financeiroRouter);
app.use('/api/estatisticas', estatisticasRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/comissoes', rankingRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/grupos-acesso', require('./routes/gruposAcesso'));
app.use('/api/configuracoes', configuracoesRouter);
app.use('/api/cadastros', require('./routes/cadastros'));
app.use('/api/filiais', filiaisRouter);
app.use('/api/bi', biRouter);

app.use('/api/crm', crmRouter);
app.use('/api/contratos', contratosRouter);
app.use('/api/cobranca', cobrancaRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/campanhas', campanhasRouter);
app.use('/api/automacoes', automacoesRouter);
app.use('/api/asaas', asaasRouter);
app.use('/api/cora', coraRouter);
app.use('/api/email', emailRouter);

app.use('/internal', requireInternalAuth);
app.use('/internal/sync', syncRouter); // Mantém /internal/sync para o C# Worker

app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
});

app.use(errorHandler);

module.exports = app;
