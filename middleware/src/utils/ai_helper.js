const db = require('../db/postgres');
const logger = require('../config/logger');


// Model pricing rates per 1M tokens in USD
const RATES = {
    'openai': {
        prompt: 0.150,      // $0.15 per 1M tokens
        completion: 0.600  // $0.60 per 1M tokens
    },
    'deepseek': {
        prompt: 0.140,      // $0.14 per 1M tokens
        completion: 0.280  // $0.28 per 1M tokens
    },
    'gemini': {
        prompt: 0.075,      // $0.075 per 1M tokens
        completion: 0.300  // $0.30 per 1M tokens
    },
    'manus': {
        prompt: 0.500,      // Proxied $0.50 flat charge per Manus agent task run
        completion: 0.500
    }
};

async function logAIUsage(tenantId, provider, model, tokensPrompt = 0, tokensCompletion = 0) {
    try {
        // Ensure table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS dash_ai_usage_logs (
                id SERIAL PRIMARY KEY,
                tenant_id UUID NOT NULL,
                provider VARCHAR(100) NOT NULL,
                model VARCHAR(100) NOT NULL,
                tokens_prompt INT DEFAULT 0,
                tokens_completion INT DEFAULT 0,
                cost NUMERIC(10, 6) DEFAULT 0.000000,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `).catch(() => {});

        const providerRates = RATES[provider] || { prompt: 0.15, completion: 0.60 };
        
        let totalCost = 0;
        if (provider === 'manus') {
            totalCost = 0.50; // $0.50 per task
        } else {
            const promptCost = (tokensPrompt / 1000000) * providerRates.prompt;
            const completionCost = (tokensCompletion / 1000000) * providerRates.completion;
            totalCost = promptCost + completionCost;
        }

        await db.query(
            `INSERT INTO dash_ai_usage_logs (tenant_id, provider, model, tokens_prompt, tokens_completion, cost)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, provider, model, tokensPrompt, tokensCompletion, totalCost]
        );
    } catch (err) {
        logger.error('[AI Usage Log] Failed to log AI usage:', err.message);
    }
}

module.exports = {
    logAIUsage
};
