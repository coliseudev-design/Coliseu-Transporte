'use strict';

const db = require('../db/postgres');
const logger = require('../config/logger');
const { sendWhatsAppMessage, getUniqueDelay, formatName, formatFirstName, humanizeMessageText } = require('./whatsapp');
const EmailService = require('../services/emailService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let intervalId = null;
let whatsappSendsThisRun = 0;
let isChecking = false;

/**
 * Helper to process template variables replacement
 */
function compileText(content, variables) {
    if (!content) return '';
    let rendered = content;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        rendered = rendered.replace(regex, value || '');
    }
    return rendered;
}

/**
 * Runs the main scheduler check
 */
async function checkAutomations(targetSubcategoria = null, targetTenantId = null) {
    if (isChecking) {
        logger.info('[Scheduler] Execução anterior do agendador ainda em andamento. Pulando esta rodada.');
        return;
    }
    isChecking = true;
    whatsappSendsThisRun = 0;
    try {
        // 1. Get all active automations
        let sql = `SELECT a.*, 
                          t.conteudo, t.imagem_url, t.nome AS template_nome, t.subcategoria,
                          te.conteudo AS email_conteudo, te.nome AS email_template_nome
             FROM dash_automacoes a
             LEFT JOIN dash_templates t ON t.id = a.template_id AND t.tenant_id = a.tenant_id
             LEFT JOIN dash_templates te ON te.id = a.template_email_id AND te.tenant_id = a.tenant_id
             WHERE a.ativo = true`;
        let params = [];
        if (targetSubcategoria) {
            params.push(targetSubcategoria);
            sql += ` AND (t.subcategoria = $${params.length} OR te.subcategoria = $${params.length})`;
        }
        if (targetTenantId) {
            params.push(targetTenantId);
            sql += ` AND a.tenant_id = $${params.length}`;
        }
        const { rows: automations } = await db.query(sql, params);

        if (automations.length === 0) {
            return;
        }

        logger.info(`[Scheduler] Processando ${automations.length} automações ativas.`);

        for (const aut of automations) {
            try {
                if (aut.gatilho === 'compra_faturada' || aut.gatilho === 'pedido_onboarding') {
                    // Mapear vendas faturadas que atendem ao tempo e ainda não receberam esta mensagem
                    const { rows: pendingSales } = await db.query(
                        `SELECT v.id AS venda_id, v.tenant_id, v.cliente_id_firebird, v.data_venda, v.valor_total, v.numero_pedido,
                                c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email
                         FROM dash_vendas v
                         JOIN dash_clientes c ON c.id_firebird = v.cliente_id_firebird AND c.tenant_id = v.tenant_id
                         WHERE v.tenant_id = $1 AND v.status = 'FATURADO'
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND v.data_venda >= NOW() - INTERVAL '7 days'
                           AND NOW() >= v.data_venda + ($2 * INTERVAL '1 second')
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $3 AND l.venda_id = v.id
                           )`,
                        [aut.tenant_id, aut.tempo_segundos, aut.id]
                    );

                    for (const sale of pendingSales) {
                        await triggerDispatch(aut, {
                            cliente_id: sale.cliente_id,
                            venda_id: sale.venda_id,
                            financeiro_id: null,
                            destinatario_nome: sale.cliente_nome,
                            destinatario_telefone: sale.cliente_telefone,
                            destinatario_email: sale.cliente_email,
                            variables: {
                                gestor_cliente: sale.cliente_nome,
                                nome_cliente: sale.cliente_nome,
                                valor_total: parseFloat(sale.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                                numero_documento: sale.numero_pedido || `PED-${sale.venda_id}`,
                                sistema_atual: 'Solução Sistemas',
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }

                else if (aut.gatilho === 'lead_criado') {
                    // Gatilho 01 de Marketing (Prospecção Fria) - Delay 10 minutos (600 segundos) e tags condicionais
                    const { rows: pendingLeads } = await db.query(
                        `SELECT o.id AS oportunidade_id, o.tenant_id, o.titulo, o.empresa_nome, o.contato_principal, o.telefone, o.email, o.tags, o.estagio, o.created_at
                         FROM dash_oportunidades o
                         WHERE o.tenant_id = $1
                           AND (o.estagio = 'Novos Leads' OR o.estagio = 'Novo' OR o.estagio = 'Aguardando Contato')
                           AND o.created_at >= NOW() - INTERVAL '7 days'
                           AND NOW() >= o.created_at + ($2 * INTERVAL '1 second')
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $3 AND l.oportunidade_id = o.id
                           )`,
                        [aut.tenant_id, aut.tempo_segundos, aut.id]
                    );

                    for (const op of pendingLeads) {
                        const tags = (op.tags || '').toLowerCase();
                        const hasNichoB = tags.includes('frigorifico') || tags.includes('industria') || tags.includes('piscicultura');
                        const hasNichoA = tags.includes('varejo') || tags.includes('comercio') || tags.includes('distribuidora');
                        
                        let shouldSend = false;
                        if (hasNichoB && aut.template_nome === 'VARIANT_MKT_B') {
                            shouldSend = true;
                        } else if (hasNichoA && aut.template_nome === 'VARIANT_MKT_A') {
                            shouldSend = true;
                        }

                        if (shouldSend) {
                            await triggerDispatch(aut, {
                                cliente_id: null,
                                venda_id: null,
                                oportunidade_id: op.oportunidade_id,
                                financeiro_id: null,
                                destinatario_nome: op.contato_principal || op.empresa_nome || op.titulo,
                                destinatario_telefone: op.telefone,
                                destinatario_email: op.email,
                                variables: {
                                    gestor_cliente: op.contato_principal || 'Gestor',
                                    seu_nome: 'Kleber Silveira',
                                    razao_social_cliente: op.empresa_nome || op.titulo,
                                    sistema_atual: 'Solução Sistemas',
                                    regime_tributario: 'Simples Nacional',
                                    horario: '14:00'
                                }
                            });
                        }
                    }
                }

                else if (aut.gatilho === 'lead_inativo') {
                    // Gatilho 02 de Marketing (Follow-up) - 72h (3 dias) após etapa "Proposta Enviada" e status "Sem Resposta"
                    const { rows: pendingFollowups } = await db.query(
                        `SELECT o.id AS oportunidade_id, o.tenant_id, o.titulo, o.empresa_nome, o.contato_principal, o.telefone, o.email, o.tags, o.estagio, o.updated_at
                         FROM dash_oportunidades o
                         WHERE o.tenant_id = $1
                           AND o.estagio = 'Proposta Enviada'
                           AND o.status = 'Sem Resposta'
                           AND o.updated_at >= NOW() - INTERVAL '14 days'
                           AND o.updated_at <= NOW() - INTERVAL '3 days'
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $2 AND l.oportunidade_id = o.id
                           )`,
                        [aut.tenant_id, aut.id]
                    );

                    for (const op of pendingFollowups) {
                        await triggerDispatch(aut, {
                            cliente_id: null,
                            venda_id: null,
                            oportunidade_id: op.oportunidade_id,
                            financeiro_id: null,
                            destinatario_nome: op.contato_principal || op.empresa_nome || op.titulo,
                            destinatario_telefone: op.telefone,
                            destinatario_email: op.email,
                            variables: {
                                gestor_cliente: op.contato_principal || 'Gestor',
                                seu_nome: 'Kleber Silveira',
                                razao_social_cliente: op.empresa_nome || op.titulo,
                                sistema_atual: 'Solução Sistemas',
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }

                else if (aut.gatilho === 'lembrete_preventivo' || aut.gatilho === 'titulo_vencido' || aut.gatilho === 'encargos_d3' || aut.gatilho === 'suspensao_d12') {
                    // Regras da aba de cobrança
                    let daysDiff = aut.dias_vencimento;
                    
                    const { rows: pendingFinance } = await db.query(
                        `SELECT f.id AS financeiro_id, f.tenant_id, f.valor, f.data_vencimento, f.alerta_bloqueio,
                                c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email
                         FROM dash_financeiro f
                         LEFT JOIN dash_clientes c ON c.id_firebird = f.cliente_id_firebird AND c.tenant_id = f.tenant_id
                         WHERE f.tenant_id = $1 AND f.tipo = 'RECEBER' AND f.status_pagamento = 'ABERTO'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''
                           AND CURRENT_DATE = (f.data_vencimento::date + ($2 * INTERVAL '1 day'))::date
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $3 AND l.financeiro_id = f.id
                           )`,
                        [aut.tenant_id, daysDiff, aut.id]
                    );

                    for (const fin of pendingFinance) {
                        let finalVal = parseFloat(fin.valor || 0);
                        
                        // Cálculo de juros/multas contratuais para encargos_d3 (multa 2% + 1% ao mês pro rata para 3 dias de atraso)
                        if (aut.gatilho === 'encargos_d3') {
                            const fine = finalVal * 0.02; // 2% multa moratória
                            const interest = (finalVal * 0.01 / 30) * 3; // 1% ao mês pro rata die (3 dias)
                            finalVal = finalVal + fine + interest;
                        }

                        // Ignorar se já emitiu alerta de bloqueio e gatilho é suspensao_d12
                        if (aut.gatilho === 'suspensao_d12' && fin.alerta_bloqueio) {
                            continue;
                        }

                        await triggerDispatch(aut, {
                            cliente_id: fin.cliente_id,
                            venda_id: null,
                            financeiro_id: fin.financeiro_id,
                            destinatario_nome: fin.cliente_nome,
                            destinatario_telefone: fin.cliente_telefone,
                            destinatario_email: fin.cliente_email,
                            variables: {
                                gestor_cliente: fin.cliente_nome,
                                nome_servico: 'Licenciamento Coliseu ERP',
                                valor_mensalidade: finalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                chave_pix: 'pix-copia-e-cola-coliseu-sistemas-producao-2026',
                                link_boleto_pdf: 'https://transporte.coliseusistemas.com.br/boletos/segunda-via',
                                data_vencimento: new Date(fin.data_vencimento).toLocaleDateString('pt-BR'),
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });

                        // Marcar bloqueio técnico ativado no financeiro
                        if (aut.gatilho === 'suspensao_d12') {
                            await db.query(
                                'UPDATE dash_financeiro SET alerta_bloqueio = true WHERE id = $1',
                                [fin.financeiro_id]
                            );
                        }
                    }
                }

                else if (aut.gatilho === 'auditoria_terminais') {
                    // Auditoria de novos terminais conectados excedendo o limite contratado
                    const { rows: pendingAudits } = await db.query(
                        `SELECT c.id AS cliente_id, c.tenant_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
                                c.terminais_ativos, c.terminais_contratados
                         FROM dash_clientes c
                         WHERE c.tenant_id = $1
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND c.terminais_ativos > c.terminais_contratados
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $2 AND l.cliente_id = c.id
                           )`,
                        [aut.tenant_id, aut.id]
                    );

                    for (const clientRow of pendingAudits) {
                        const activeTerms = clientRow.terminais_ativos || 1;
                        const contrTerms = clientRow.terminais_contratados || 1;
                        const extras = activeTerms - contrTerms;
                        const priceExtra = 50.00; // R$ 50,00 por máquina adicional
                        const subExtra = extras * priceExtra;
                        const finalRecorrência = 300.00 + subExtra; // Base 300 + subtotal

                        await triggerDispatch(aut, {
                            cliente_id: clientRow.cliente_id,
                            venda_id: null,
                            financeiro_id: null,
                            destinatario_nome: clientRow.cliente_nome,
                            destinatario_telefone: clientRow.cliente_telefone,
                            destinatario_email: clientRow.cliente_email,
                            variables: {
                                gestor_cliente: clientRow.cliente_nome,
                                razao_social_cliente: clientRow.cliente_nome,
                                qtd_terminais: String(activeTerms),
                                qtd_terminais_adicionais: String(extras),
                                valor_maquina_extra: priceExtra.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                subtotal_maquinas: subExtra.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                valor_mensalidade: finalRecorrência.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            }
                        });

                        // Criar uma tarefa interna de faturamento ou um título adicional de cobrança (Simulado/Mocked)
                        await db.query(
                            `INSERT INTO dash_financeiro (tenant_id, id_firebird, tipo, tipo_documento, descricao, cliente_id_firebird, data_vencimento, valor, status_pagamento)
                             VALUES ($1, (SELECT COALESCE(MAX(id_firebird), 0) + 1 FROM dash_financeiro), 'RECEBER', 'TAXA ADICIONAL', $2, (SELECT id_firebird FROM dash_clientes WHERE id = $3 LIMIT 1), NOW() + INTERVAL '10 days', $4, 'ABERTO')`,
                            [aut.tenant_id, `Aditivo de expansão de licença: ${extras} terminais extras conectados`, clientRow.cliente_id, subExtra]
                        );
                    }
                }

                else if (aut.gatilho === 'pos_venda_suporte') {
                    // Contagem de 20 dias pós-migração
                    const { rows: pendingSupports } = await db.query(
                        `SELECT c.id AS cliente_id, c.tenant_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email, c.data_cadastro
                         FROM dash_clientes c
                         WHERE c.tenant_id = $1
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND c.data_cadastro::date = (CURRENT_DATE - INTERVAL '20 days')::date
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $2 AND l.cliente_id = c.id
                           )`,
                        [aut.tenant_id, aut.id]
                    );

                    for (const cli of pendingSupports) {
                        await triggerDispatch(aut, {
                            cliente_id: cli.cliente_id,
                            venda_id: null,
                            financeiro_id: null,
                            destinatario_nome: cli.cliente_nome,
                            destinatario_telefone: cli.cliente_telefone,
                            destinatario_email: cli.cliente_email,
                            variables: {
                                gestor_cliente: cli.cliente_nome,
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }

                else if (aut.gatilho === 'nps_periodico') {
                    // Recorrência cíclica a cada 90 dias ativos
                    const { rows: pendingNps } = await db.query(
                        `SELECT c.id AS cliente_id, c.tenant_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email, c.data_cadastro
                         FROM dash_clientes c
                         WHERE c.tenant_id = $1
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND c.data_cadastro <= CURRENT_DATE - INTERVAL '90 days'
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $2 AND l.cliente_id = c.id
                                 AND l.enviado_em >= NOW() - INTERVAL '90 days'
                           )`,
                        [aut.tenant_id, aut.id]
                    );

                    for (const cli of pendingNps) {
                        await triggerDispatch(aut, {
                            cliente_id: cli.cliente_id,
                            venda_id: null,
                            financeiro_id: null,
                            destinatario_nome: cli.cliente_nome,
                            destinatario_telefone: cli.cliente_telefone,
                            destinatario_email: cli.cliente_email,
                            variables: {
                                gestor_cliente: cli.cliente_nome,
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }

                else if (aut.gatilho === 'tempo_em_tempo') {
                    // Envio de tempos em tempos (Marketing periódico)
                    const { rows: pendingClients } = await db.query(
                        `SELECT c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email
                         FROM dash_clientes c
                         WHERE c.tenant_id = $1 
                           AND c.ativo = true 
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $2 AND l.cliente_id = c.id
                                 AND l.enviado_em >= NOW() - ($3 * INTERVAL '1 second')
                           )
                         LIMIT 10`,
                        [aut.tenant_id, aut.id, aut.tempo_segundos]
                    );

                    for (const cli of pendingClients) {
                        await triggerDispatch(aut, {
                            cliente_id: cli.cliente_id,
                            venda_id: null,
                            financeiro_id: null,
                            destinatario_nome: cli.cliente_nome,
                            destinatario_telefone: cli.cliente_telefone,
                            destinatario_email: cli.cliente_email,
                            variables: {
                                nome_cliente: cli.cliente_nome,
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }

                else if (aut.gatilho === 'aniversario') {
                    const today = new Date();
                    const todayMonth = today.getMonth() + 1;
                    const todayDay = today.getDate();

                    const { rows: activeClients } = await db.query(
                        `SELECT c.id, c.id_firebird, c.nome, c.telefone, c.email
                         FROM dash_clientes c
                         WHERE c.tenant_id = $1 
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $2 AND l.cliente_id = c.id
                                 AND l.enviado_em::date = CURRENT_DATE
                           )`,
                        [aut.tenant_id, aut.id]
                    );

                    for (const c of activeClients) {
                        const code = parseInt(c.id_firebird || c.id, 10) || 1;
                        let mVal = (code % 12) + 1;
                        let dVal = (code % 28) + 1;

                        if (c.data_nascimento) {
                            const parts = c.data_nascimento.split(/[-/]/);
                            if (parts.length >= 2) {
                                const d = parseInt(parts[0], 10);
                                const m = parseInt(parts[1], 10);
                                if (!isNaN(d) && !isNaN(m)) {
                                    dVal = d;
                                    mVal = m;
                                }
                            }
                        }

                        if (mVal === todayMonth && dVal === todayDay) {
                            await triggerDispatch(aut, {
                                cliente_id: c.id,
                                venda_id: null,
                                financeiro_id: null,
                                destinatario_nome: c.nome,
                                destinatario_telefone: c.telefone,
                                destinatario_email: c.email,
                                variables: {
                                    gestor_cliente: c.nome,
                                    nome_cliente: c.nome,
                                    data_atual: new Date().toLocaleDateString('pt-BR')
                                }
                            });
                        }
                    }
                }

                else if (aut.gatilho === 'pos_compra') {
                    const { rows: pendingSales } = await db.query(
                        `SELECT v.id AS venda_id, v.tenant_id, v.cliente_id_firebird, v.data_venda, v.valor_total, v.numero_pedido,
                                c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email
                         FROM dash_vendas v
                         JOIN dash_clientes c ON c.id_firebird = v.cliente_id_firebird AND c.tenant_id = v.tenant_id
                         WHERE v.tenant_id = $1 AND v.status = 'FATURADO'
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND v.data_venda::date = (CURRENT_DATE - ($2 * INTERVAL '1 second'))::date
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $3 AND l.venda_id = v.id
                           )`,
                        [aut.tenant_id, aut.tempo_segundos, aut.id]
                    );

                    for (const sale of pendingSales) {
                        await triggerDispatch(aut, {
                            cliente_id: sale.cliente_id,
                            venda_id: sale.venda_id,
                            financeiro_id: null,
                            destinatario_nome: sale.cliente_nome,
                            destinatario_telefone: sale.cliente_telefone,
                            destinatario_email: sale.cliente_email,
                            variables: {
                                gestor_cliente: sale.cliente_nome,
                                nome_cliente: sale.cliente_nome,
                                valor_total: parseFloat(sale.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                                numero_documento: sale.numero_pedido || `PED-${sale.venda_id}`,
                                sistema_atual: 'Solução Sistemas',
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }

                else if (aut.gatilho === 'compra_marca') {
                    let brand = '';
                    if (aut.meta) {
                        if (typeof aut.meta === 'object') {
                            brand = aut.meta.marca || '';
                        } else if (typeof aut.meta === 'string') {
                            try {
                                const parsed = JSON.parse(aut.meta);
                                brand = parsed.marca || '';
                            } catch (e) {
                                brand = aut.meta;
                            }
                        }
                    }

                    const { rows: pendingSales } = await db.query(
                        `SELECT DISTINCT v.id AS venda_id, v.tenant_id, v.cliente_id_firebird, v.data_venda, v.valor_total, v.numero_pedido,
                                c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email
                         FROM dash_vendas v
                         JOIN dash_clientes c ON c.id_firebird = v.cliente_id_firebird AND c.tenant_id = v.tenant_id
                         INNER JOIN dash_vendas_itens vi ON vi.venda_id_firebird = v.id_firebird AND vi.tenant_id = v.tenant_id
                         WHERE v.tenant_id = $1 AND v.status = 'FATURADO'
                           AND c.ativo = true
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%INATIVO%'
                           AND COALESCE(c.classificacao, '') NOT ILIKE '%FORNECEDOR%'
                           AND COALESCE(c.tipo_cliente, '') NOT ILIKE '%FORNECEDOR%'
                           AND c.nome NOT ILIKE '%FORNECEDOR%'
                           AND vi.marca ILIKE $2
                           AND NOT EXISTS (
                               SELECT 1 FROM dash_automacoes_logs l
                               WHERE l.automacao_id = $3 AND l.venda_id = v.id
                           )`,
                        [aut.tenant_id, `%${brand}%`, aut.id]
                    );

                    for (const sale of pendingSales) {
                        await triggerDispatch(aut, {
                            cliente_id: sale.cliente_id,
                            venda_id: sale.venda_id,
                            financeiro_id: null,
                            destinatario_nome: sale.cliente_nome,
                            destinatario_telefone: sale.cliente_telefone,
                            destinatario_email: sale.cliente_email,
                            variables: {
                                gestor_cliente: sale.cliente_nome,
                                nome_cliente: sale.cliente_nome,
                                valor_total: parseFloat(sale.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                                numero_documento: sale.numero_pedido || `PED-${sale.venda_id}`,
                                sistema_atual: 'Solução Sistemas',
                                data_atual: new Date().toLocaleDateString('pt-BR')
                            }
                        });
                    }
                }
            } catch (autErr) {
                logger.error(`[Scheduler] Erro ao processar regra de automação ID ${aut.id}:`, autErr.message);
            }
        }
    } catch (err) {
        logger.error('[Scheduler] Erro no loop de verificação de automações:', err.message);
    } finally {
        isChecking = false;
    }
}

/**
 * Triggers dispatching of WhatsApp/Email message and logs it
 */
async function triggerDispatch(aut, data) {
    const { cliente_id, venda_id, financeiro_id, oportunidade_id, destinatario_nome, destinatario_telefone, destinatario_email, variables } = data;
    
    try {
        // Format name variables if they exist
        const formattedVariables = { ...variables };
        for (const key of Object.keys(formattedVariables)) {
            if (typeof formattedVariables[key] === 'string') {
                if (key === 'nome_cliente' || key === 'razao_social_cliente') {
                    formattedVariables[key] = formatName(formattedVariables[key]);
                } else if (key === 'gestor_cliente' || key === 'primeiro_nome') {
                    formattedVariables[key] = formatFirstName(formattedVariables[key]);
                }
            }
        }

        const channel = (aut.canal || 'whatsapp').toLowerCase();
        let status = 'Sucesso';
        let erro = null;

        // 1. DISPARO POR WHATSAPP (se canal for 'whatsapp' ou 'ambos')
        if (channel === 'whatsapp' || channel === 'ambos') {
            if (aut.conteudo && destinatario_telefone) {
                try {
                    const textMsg = compileText(aut.conteudo, formattedVariables);
                    logger.info(`[Scheduler] Disparando WhatsApp da automação '${aut.template_nome || aut.gatilho}' para ${destinatario_nome} (${destinatario_telefone})`);
                    
                    const configsRes = await db.query('SELECT * FROM dash_integracoes_config WHERE tenant_id = $1', [aut.tenant_id]);
                    const configs = configsRes.rows[0] || {};

                    const finalMsg = humanizeMessageText(textMsg);
                    const result = await sendWhatsAppMessage(configs, destinatario_telefone, finalMsg, aut.imagem_url);
                    if (!result.success) {
                        status = 'Falha';
                        erro = result.error || 'Erro no envio de WhatsApp';
                    }

                    whatsappSendsThisRun++;
                    if (whatsappSendsThisRun % 40 === 0) {
                        logger.info(`[Scheduler] Bloco de 40 mensagens atingido no agendador. Pausando por 90s...`);
                        await sleep(90000);
                    } else {
                        const currentDelay = getUniqueDelay();
                        await sleep(currentDelay);
                    }
                } catch (waErr) {
                    status = 'Falha';
                    erro = waErr.message;
                }
            }
        }

        // 2. DISPARO POR E-MAIL (se canal for 'email' ou 'ambos')
        if (channel === 'email' || channel === 'ambos') {
            const emailBodyTemplate = aut.email_conteudo || aut.conteudo;
            if (emailBodyTemplate && destinatario_email && destinatario_email.includes('@')) {
                try {
                    const emailBody = compileText(emailBodyTemplate, formattedVariables);
                    const emailSubject = aut.email_template_nome 
                        ? `Mensagem Coliseu: ${aut.email_template_nome}` 
                        : (aut.gatilho === 'aniversario' ? 'Feliz Aniversário! - Coliseu Sistemas' : 'Mensagem Especial - Coliseu Sistemas');

                    logger.info(`[Scheduler] Disparando E-mail da automação '${aut.email_template_nome || aut.template_nome || aut.gatilho}' para ${destinatario_nome} (${destinatario_email})`);

                    const emailConfig = await EmailService.getConfig(aut.tenant_id);
                    await EmailService.sendSingle(emailConfig, {
                        para: destinatario_email,
                        assunto: emailSubject,
                        html: emailBody.replace(/\n/g, '<br/>'),
                        nomeCliente: destinatario_nome
                    });
                } catch (emErr) {
                    logger.warn(`[Scheduler] Falha ao enviar e-mail para ${destinatario_email}:`, emErr.message);
                    if (channel === 'email') {
                        status = 'Falha';
                        erro = (erro ? `${erro}; ` : '') + `E-mail: ${emErr.message}`;
                    }
                }
            } else if (channel === 'email' && (!destinatario_email || !destinatario_email.includes('@'))) {
                status = 'Falha';
                erro = 'Destinatário não possui e-mail válido cadastrado.';
            }
        }

        // Registrar no log de automações
        await db.query(
            `INSERT INTO dash_automacoes_logs (tenant_id, automacao_id, cliente_id, venda_id, financeiro_id, oportunidade_id, status, erro)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [aut.tenant_id, aut.id, cliente_id, venda_id, financeiro_id, oportunidade_id || null, status, erro]
        );

        logger.info(`[Scheduler] Disparo concluído com status: ${status}.`);
    } catch (dispatchErr) {
        logger.error('[Scheduler] Erro ao gravar log de envio da automação:', dispatchErr.message);
    }
}

let coraIntervalId = null;

/**
 * Sincroniza faturas e quitações do Banco Cora para todos os tenants ativos
 */
async function syncCoraAllTenants() {
    try {
        const CoraService = require('../services/CoraService');
        const { rows: tenants } = await db.query(
            `SELECT tenant_id FROM dash_integracoes_config WHERE cora_ativo = true AND cora_cert_pem IS NOT NULL`
        ).catch(() => ({ rows: [] }));

        for (const t of tenants) {
            try {
                await CoraService.sincronizarFaturasCora(t.tenant_id);
            } catch (tErr) {
                logger.warn(`[Scheduler] Falha ao sincronizar faturas Cora para tenant ${t.tenant_id}:`, tErr.message);
            }
        }
    } catch (e) {
        logger.warn('[Scheduler] Erro ao buscar tenants ativos do Banco Cora:', e.message);
    }
}

/**
 * Starts the scheduler loop
 */
function start() {
    if (intervalId) return;
    
    logger.info('[Scheduler] Iniciando o serviço de disparos automáticos de WhatsApp...');
    // Roda a cada 30 segundos
    intervalId = setInterval(checkAutomations, 30000);

    // Sincronização periódica do Banco Cora a cada 2 minutos
    coraIntervalId = setInterval(syncCoraAllTenants, 120000);
    setTimeout(syncCoraAllTenants, 15000); // Executa primeiro sync 15s após boot
}

/**
 * Stops the scheduler loop
 */
function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('[Scheduler] Serviço de disparos automáticos de WhatsApp parado.');
    }
    if (coraIntervalId) {
        clearInterval(coraIntervalId);
        coraIntervalId = null;
        logger.info('[Scheduler] Serviço de sincronização periódica Cora parado.');
    }
}

module.exports = {
    start,
    stop,
    checkAutomations,
    syncCoraAllTenants
};
