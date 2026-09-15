-- Migration 011: Adicionar subcategoria nos templates e tabelas de automação de disparos

ALTER TABLE dash_templates ADD COLUMN IF NOT EXISTS subcategoria VARCHAR(50) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS dash_automacoes (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    template_id INTEGER UNIQUE NOT NULL REFERENCES dash_templates(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT FALSE,
    gatilho VARCHAR(50) NOT NULL, -- 'compra_faturada', 'titulo_vencido', 'tempo_em_tempo'
    tempo_segundos INTEGER DEFAULT 0, -- tempo de espera após a compra ou intervalo periódico
    dias_vencimento INTEGER DEFAULT 0, -- dias em relação ao vencimento (-1 = 1 dia antes, 1 = 1 dia depois...)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dash_automacoes_logs (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    automacao_id INTEGER NOT NULL REFERENCES dash_automacoes(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES dash_clientes(id) ON DELETE SET NULL,
    venda_id INTEGER REFERENCES dash_vendas(id) ON DELETE SET NULL,
    financeiro_id INTEGER REFERENCES dash_financeiro(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL, -- 'Sucesso', 'Falha'
    erro TEXT,
    enviado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automacoes_logs_venda ON dash_automacoes_logs(tenant_id, automacao_id, venda_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_logs_fin ON dash_automacoes_logs(tenant_id, automacao_id, financeiro_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_logs_cli ON dash_automacoes_logs(tenant_id, automacao_id, cliente_id);
