'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');
const { requireWebJwt, requireInternalAuth, requireSyncOrWebAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { defaultLimit, authLimit } = require('./middleware/rateLimiter');

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
const transporteRouter = require('./routes/transporte');
const TransporteService = require('./services/transporteService');

const path = require('path');
const fs = require('fs');

const app = express();
app.set('trust proxy', 1);

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

// Preserva rawBody (até 2MB) para validação HMAC de webhooks sem duplicar batches gigantes em RAM
const saveRawBody = (req, _res, buf) => {
    if (buf && buf.length && buf.length <= 2 * 1024 * 1024) {
        req.rawBody = Buffer.from(buf);
    }
};

// Rotas específicas de sincronização/upload que exigem payloads maiores (até 50MB)
const largeJsonParser = express.json({ limit: '50mb' });
app.use(
    [
        '/internal/sync',
        '/api/sync',
        '/api/configuracoes',
        '/api/transporte/certificados',
        '/api/transporte/emitentes',
        '/api/transporte/cargas/importar-xml',
        '/api/templates',
        '/api/campanhas'
    ],
    largeJsonParser
);

// Limite padrão seguro (2MB) para todas as demais rotas públicas e autenticadas
app.use(express.json({ limit: '2mb', verify: saveRawBody }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Rate limit estrito contra força bruta nos endpoints de autenticação
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/alterar-senha'], authLimit);
app.use('/api/auth', authRouter);
app.use('/health', healthRouter);

// Webhooks públicos estritamente isolados (sem expor rotas administrativas dos routers financeiros)
app.use('/api/v1/webhooks', webhooksRouter);
app.post(['/api/webhooks/asaas', '/api/webhooks/asaas/webhook'], asaasRouter.handleAsaasWebhookHttp);
app.post(
    [
        '/api/webhooks/cora',
        '/api/webhooks/cora/webhook',
        '/api/webhooks/cora/webhook-receive',
        '/api/cora/webhook',
        '/api/cora/webhook-receive',
        '/cora/webhook',
        '/cora/webhook-receive'
    ],
    coraRouter.handleCoraWebhookHttp
);

// Webhook público da Focus NFe (retornos de autorização/rejeição de CT-e e MDF-e da SEFAZ)
app.post('/api/webhooks/focus', async (req, res) => {
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
});

// Rotas de sincronização protegidas por autenticação híbrida (JWT Web/Device OU X-Internal-Key + X-Tenant-Id)
app.use('/api/sync', requireSyncOrWebAuth, syncRouter);

// Rotas públicas de rastreamento de e-mails (abertura por pixel e clique validado)
app.use('/api/track', trackingRouter);
app.use('/track', trackingRouter);

// Se houver JWT no header Authorization, popula req.tenant; caso contrário segue público exigindo token não enumerável
const optionalWebJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return requireWebJwt(req, res, next);
    }
    return next();
};

// Rotas públicas isoladas apenas para visualização GET de boletos
app.get(['/api/cora/boleto/:id', '/cora/boleto/:id'], optionalWebJwt, (req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    return coraRouter.handleBoletoGet(req, res, next);
});
app.get(['/api/asaas/bank-slip/:paymentId', '/asaas/bank-slip/:paymentId'], optionalWebJwt, (req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    return asaasRouter.handleBankSlipGet(req, res, next);
});

// Rotas do sistema (Frontend Web com autenticação JWT obrigatória)
app.use('/api', requireWebJwt);
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
app.use('/api/transporte', transporteRouter); // Módulo Fiscal de CT-e, MDF-e, Cargas e Frota

app.use('/internal', requireInternalAuth);
app.use('/internal/sync', syncRouter); // Mantém /internal/sync para o C# Worker

app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
});

app.use(errorHandler);

module.exports = app;
