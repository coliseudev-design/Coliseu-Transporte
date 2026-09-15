'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { resolvePublicImageUrl, sanitizeEmailHtml, isValidImageUrl } = require('../utils/imageHandler');
const { logAIUsage } = require('../utils/ai_helper');

// GET /api/templates
router.get('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { categoria, subcategoria, search } = req.query;

        const where = ['tenant_id = $1'];
        const binds = [tenantId];
        let pIndex = 2;

        if (categoria) {
            where.push(`categoria = $${pIndex}`);
            binds.push(categoria);
            pIndex++;
        }

        if (subcategoria) {
            where.push(`subcategoria = $${pIndex}`);
            binds.push(subcategoria);
            pIndex++;
        }

        if (search) {
            where.push(`nome ILIKE $${pIndex}`);
            binds.push(`%${search}%`);
            pIndex++;
        }

        const { rows } = await db.query(
            `SELECT id, nome, categoria, subcategoria, conteudo, imagem_url, created_at, updated_at
             FROM dash_templates
             WHERE ${where.join(' AND ')}
             ORDER BY nome ASC`,
            binds
        );

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/templates
router.post('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { nome, categoria, subcategoria, conteudo, imagem_url } = req.body;

        if (!nome || !categoria) {
            return res.status(400).json({ error: 'Nome e Categoria são obrigatórios.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_templates (tenant_id, nome, categoria, subcategoria, conteudo, imagem_url)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [tenantId, nome, categoria, subcategoria || null, conteudo || '', imagem_url || null]
        );

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// PUT /api/templates/:id
router.put('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);
        const { nome, categoria, subcategoria, conteudo, imagem_url } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_templates
             SET nome = COALESCE($1, nome), categoria = COALESCE($2, categoria), subcategoria = COALESCE($3, subcategoria), conteudo = COALESCE($4, conteudo), imagem_url = $5, updated_at = NOW()
             WHERE tenant_id = $6 AND id = $7
             RETURNING *`,
            [nome, categoria, subcategoria, conteudo, imagem_url || null, tenantId, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Template não encontrado.' });
        }

        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);

        // 1. Desvincula o template de automações e réguas para evitar bloqueio de chave estrangeira
        await db.query('UPDATE dash_automacoes SET template_id = NULL WHERE template_id = $1', [id]).catch(() => {});
        await db.query('UPDATE dash_automacoes SET template_email_id = NULL WHERE template_email_id = $1', [id]).catch(() => {});
        await db.query('UPDATE dash_reguas SET template_id = NULL WHERE template_id = $1', [id]).catch(() => {});
        await db.query('UPDATE dash_campanhas SET template_id = NULL WHERE template_id = $1', [id]).catch(() => {});

        // 2. Deleta o template
        const delRes = await db.query(
            'DELETE FROM dash_templates WHERE (tenant_id = $1 OR LOWER(tenant_id::text) = LOWER($1::text)) AND id = $2',
            [tenantId, id]
        ).catch(async () => {
            return await db.query('DELETE FROM dash_templates WHERE id = $1', [id]);
        });

        if (delRes.rowCount === 0) {
            await db.query('DELETE FROM dash_templates WHERE id = $1', [id]).catch(() => {});
        }

        res.json({ success: true, message: 'Template excluído com sucesso.' });
    } catch (err) {
        logger.error('[Templates] Erro ao excluir:', err.message);
        next(err);
    }
});

// POST /api/templates/:id/render
// Motor de Renderização
router.post('/:id/render', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);
        const { cliente_id, financeiro_id, lead_id } = req.body;

        const tRes = await db.query(
            'SELECT * FROM dash_templates WHERE tenant_id = $1 AND id = $2',
            [tenantId, id]
        );

        if (tRes.rowCount === 0) {
            return res.status(404).json({ error: 'Template não encontrado.' });
        }

        let content = tRes.rows[0].conteudo || '';

        // Default placeholder replacement dictionary
        const variables = {
            nome_cliente: 'Cliente de Teste',
            cpf_cnpj: '00.000.000/0001-00',
            numero_documento: 'DOC-12345',
            valor_total: 'R$ 1.500,00',
            data_vencimento: new Date().toLocaleDateString('pt-BR'),
            dias_atraso: '0',
            link_pagamento: 'https://nexus.com.br/pagamento/simulado',
            data_atual: new Date().toLocaleDateString('pt-BR'),
            nome_vendedor: 'Vendedor Nexos'
        };

        // Load Client details if requested
        if (cliente_id) {
            const cli = await db.query('SELECT nome, documento, email, telefone FROM dash_clientes WHERE tenant_id = $1 AND id = $2', [tenantId, parseInt(cliente_id, 10)]);
            if (cli.rowCount > 0) {
                variables.nome_cliente = cli.rows[0].nome;
                variables.cpf_cnpj = cli.rows[0].documento || '—';
            }
        }

        // Load Lead/Opportunity details if requested
        if (lead_id) {
            const ld = await db.query('SELECT titulo, contato_principal, empresa_nome, valor_estimated FROM dash_oportunidades WHERE tenant_id = $1 AND id = $2', [tenantId, parseInt(lead_id, 10)]);
            if (ld.rowCount > 0) {
                variables.nome_cliente = ld.rows[0].contato_principal || ld.rows[0].empresa_nome;
                variables.valor_total = parseFloat(ld.rows[0].valor_estimated || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
        }

        // Load Invoice/Financeiro details if requested
        if (financeiro_id) {
            const fin = await db.query(
                `SELECT f.id, f.descricao, f.valor, f.data_vencimento, cl.nome AS cl_nome, cl.documento AS cl_doc
                 FROM dash_financeiro f
                 LEFT JOIN dash_clientes cl ON cl.id_firebird = f.cliente_id_firebird AND cl.tenant_id = f.tenant_id
                 WHERE f.tenant_id = $1 AND f.id = $2`, 
                [tenantId, parseInt(financeiro_id, 10)]
            );
            if (fin.rowCount > 0) {
                const f = fin.rows[0];
                variables.nome_cliente = f.cl_nome || 'Cliente';
                variables.cpf_cnpj = f.cl_doc || '—';
                variables.numero_documento = `DOC-#${f.id}`;
                variables.valor_total = parseFloat(f.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                variables.data_vencimento = new Date(f.data_vencimento).toLocaleDateString('pt-BR');
                const diffTime = Math.abs(new Date() - new Date(f.data_vencimento));
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                variables.dias_atraso = new Date() > new Date(f.data_vencimento) ? String(diffDays) : '0';
            }
        }

        // Replaces variables
        let renderedHtml = content;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
            renderedHtml = renderedHtml.replace(regex, value);
        }

        res.json({ data: renderedHtml });
    } catch (err) {
        next(err);
    }
});

// POST /api/templates/:id/pdf
// Mock PDF downloader
router.post('/:id/pdf', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const id = parseInt(req.params.id, 10);
        
        const tRes = await db.query(
            'SELECT nome FROM dash_templates WHERE tenant_id = $1 AND id = $2',
            [tenantId, id]
        );

        if (tRes.rowCount === 0) {
            return res.status(404).json({ error: 'Template não encontrado.' });
        }

        // Return a mock PDF Base64 string / download trigger
        res.json({
            success: true,
            pdfName: `${tRes.rows[0].nome.replace(/\s+/g, '_').toLowerCase()}.pdf`,
            pdfUrl: `https://nexus.com.br/download/pdf/mock-pdf-file`
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/templates/gerar-ia
router.post('/gerar-ia', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { prompt, categoria, subcategoria, imagem_url, usar_layout_padrao } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'Informe um prompt com as instruções para a IA gerar o template.' });
        }

        // Buscar artes de topo e rodapé do tenant se usar_layout_padrao estiver ativo
        let topoUrlConfig = null;
        let rodapeUrlConfig = null;
        if (usar_layout_padrao) {
            const { rows: confRows } = await db.query(
                'SELECT email_marketing_topo_url, email_marketing_rodape_url FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1',
                [tenantId]
            ).catch(() => ({ rows: [] }));
            topoUrlConfig = confRows[0]?.email_marketing_topo_url || null;
            rodapeUrlConfig = confRows[0]?.email_marketing_rodape_url || null;
        }

        const { rows: configRows } = await db.query(
            `SELECT * FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1`,
            [tenantId]
        ).catch(() => ({ rows: [] }));

        const configs = configRows[0] || {};

        let activeKey = null;
        let activeProvider = null;
        
        if (configs.ai_openai_active && configs.ai_openai_key) {
            activeKey = configs.ai_openai_key;
            activeProvider = 'openai';
        } else if (configs.ai_deepseek_active && configs.ai_deepseek_key) {
            activeKey = configs.ai_deepseek_key;
            activeProvider = 'deepseek';
        } else if (configs.ai_gemini_active && configs.ai_gemini_key) {
            activeKey = configs.ai_gemini_key;
            activeProvider = 'gemini';
        } else if (configs.ai_manus_active && configs.ai_manus_key) {
            activeKey = configs.ai_manus_key;
            activeProvider = 'manus';
        } else if (configs.ai_api_key) {
            activeKey = configs.ai_api_key;
            activeProvider = 'deepseek';
        } else {
            activeKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || null;
            activeProvider = process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'openai';
        }

        let baseSystemPrompt = '';
        if (categoria) {
            const cat = categoria.toLowerCase();
            if (cat.includes('cobranca') || cat.includes('cobrança')) {
                baseSystemPrompt = configs.ai_prompt_cobranca || `Você é um construtor especializado de E-mail de Cobrança em HTML responsivo.
Sua missão é converter as instruções do usuário em um e-mail de cobrança claro, formal e com design limpo, focado na leitura rápida e na ação de pagamento.`;
            } else if (cat.includes('marketing')) {
                baseSystemPrompt = configs.ai_prompt_marketing || `Você é um construtor especializado de E-mail Marketing em HTML responsivo.
Sua missão é converter as instruções do usuário em um código HTML de e-mail marketing PERFEITO, ELEGANTE E 100% FIEL AO PROMPT.`;
            } else if (cat.includes('contrato')) {
                baseSystemPrompt = configs.ai_prompt_contratos || `Você é um redator de contratos profissional.
Sua missão é gerar um contrato formal e bem estruturado com base nas instruções do usuário.`;
            } else if (cat.includes('proposta') || cat.includes('comercial')) {
                baseSystemPrompt = configs.ai_prompt_contratos || `Você é um redator de propostas comerciais profissional.
Sua missão é gerar uma proposta comercial clara e elegante com base nas instruções do usuário.`;
            } else if (cat.includes('bi') || cat.includes('relatorio')) {
                baseSystemPrompt = configs.ai_prompt_bi || `Você é um analista de BI e dados profissional.
Sua missão é converter as instruções do usuário em um relatório analítico estruturado e compreensível.`;
            }
        }

        // Se nenhuma categoria bateu ou não foi informada, o padrão para templates é marketing
        if (!baseSystemPrompt) {
            baseSystemPrompt = configs.ai_prompt_marketing || `Você é um construtor especializado de templates e e-mails em HTML responsivo.
Sua missão é converter as instruções do usuário em um código HTML limpo, responsivo e elegante.`;
        }

        const fullSystemPrompt = `${baseSystemPrompt}

REGRAS DE CONSTRUÇÃO (OBRIGATÓRIAS):
1. FIDELIDADE ABSOLUTA AO PROMPT: Respeite 100% dos textos, títulos, tópicos, tabelas, caixas de aviso/alerta, cores (ex: cores hexadecimais como #0d2b4c, #1a5fa8, #f2c94c, #e8f5e9, #fff3cd) e botões/links indicados pelo usuário. NUNCA resuma, mude ou omita nenhuma informação solicitada.
2. ZERO REPETIÇÃO DE MARCA OU RODAPÉ: NÃO crie cabeçalhos institucionais genéricos com o nome da empresa nem rodapés de texto no final, pois o cabeçalho e rodapé oficial de artes já são aplicados automaticamente.
3. CSS INLINE LIMPO E RESPONSIVO: Todo o código deve usar CSS inline nos elementos HTML (div, span, table, a, p, ul, ol). Use max-width: 768px no container principal, fundo neutro #f4f6f8 e cards brancos #ffffff.
4. FORMATO DE RESPOSTA: Responda ESTRITAMENTE em formato JSON com as chaves:
- "nome": Título ou assunto objetivo da campanha
- "conteudo": O código HTML completo e responsivo.`;

        let generatedName = '';
        let generatedContent = '';

        if (activeKey) {
            try {
                let response;
                if (activeProvider === 'gemini') {
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            contents: [{
                                role: 'user',
                                parts: [
                                    { text: fullSystemPrompt },
                                    { text: `Instruções do usuário: ${prompt}\nCategoria: ${categoria || 'E-mail Marketing'}\n${imagem_url ? `Imagem anexada (usar em <img> no topo do e-mail): ${imagem_url}` : ''}` }
                                ]
                            }],
                            generationConfig: {
                                responseMimeType: "application/json"
                            }
                        })
                    });

                    if (response.ok) {
                        const resJson = await response.json();
                        const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        try {
                            const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
                            generatedName = parsed.nome;
                            generatedContent = parsed.conteudo;
                        } catch (e) {
                            generatedContent = rawText;
                        }
                        const tokensPrompt = resJson.usageMetadata?.promptTokenCount || 0;
                        const tokensCompletion = resJson.usageMetadata?.candidatesTokenCount || 0;
                        await logAIUsage(tenantId, 'gemini', 'gemini-2.0-flash', tokensPrompt, tokensCompletion);
                    }
                } 
                else if (activeProvider === 'manus') {
                    response = await fetch('https://api.manus.ai/v2/task.create', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-manus-api-key': activeKey
                        },
                        body: JSON.stringify({
                            message: {
                                content: `${fullSystemPrompt}\n\nInstruções do usuário: ${prompt}\nCategoria: ${categoria || 'E-mail Marketing'}`
                            }
                        })
                    });

                    if (response.ok) {
                        const resJson = await response.json();
                        const taskId = resJson.task_id || resJson.id;
                        
                        if (taskId) {
                            let completed = false;
                            let maxPolls = 12; // 12 * 2s = 24s
                            let pollCount = 0;
                            let rawText = '';
                            
                            while (!completed && pollCount < maxPolls) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                pollCount++;
                                
                                try {
                                    const pollRes = await fetch(`https://api.manus.ai/v2/task.listMessages?task_id=${taskId}&limit=20`, {
                                        method: 'GET',
                                        headers: {
                                            'x-manus-api-key': activeKey
                                        }
                                    });
                                    
                                    if (pollRes.ok) {
                                        const pollJson = await pollRes.json();
                                        const messages = pollJson.messages || [];
                                        
                                        const statusUpdate = messages.find(m => m.type === 'status_update');
                                        if (statusUpdate && statusUpdate.status_update?.agent_status === 'stopped') {
                                            completed = true;
                                        }
                                        
                                        const assistantMsg = messages.find(m => m.type === 'assistant_message');
                                        if (assistantMsg && assistantMsg.assistant_message?.content) {
                                            rawText = assistantMsg.assistant_message.content;
                                        }
                                    }
                                } catch (err) {
                                    console.error('[Manus Poll Error]', err.message);
                                }
                            }
                            
                            if (rawText) {
                                try {
                                    let jsonStr = rawText;
                                    if (rawText.includes('```json')) {
                                        const startIdx = rawText.indexOf('```json') + 7;
                                        const endIdx = rawText.indexOf('```', startIdx);
                                        jsonStr = rawText.substring(startIdx, endIdx).trim();
                                    } else if (rawText.includes('```')) {
                                        const startIdx = rawText.indexOf('```') + 3;
                                        const endIdx = rawText.indexOf('```', startIdx);
                                        jsonStr = rawText.substring(startIdx, endIdx).trim();
                                    }
                                    const parsed = JSON.parse(jsonStr.trim());
                                    generatedName = parsed.nome || 'E-mail por Manus AI';
                                    generatedContent = parsed.conteudo;
                                } catch (e) {
                                    generatedContent = rawText;
                                    generatedName = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
                                }
                                await logAIUsage(tenantId, 'manus', 'manus-agent', 0, 0);
                            }
                        }
                        
                        // Fallback dinâmico para o Google Gemini caso Manus falhe/demore ou não retorne JSON estruturado
                        if (!generatedContent) {
                            console.log('[Manus Sync fallback to Gemini]');
                            if (configs.ai_gemini_active && configs.ai_gemini_key) {
                                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${configs.ai_gemini_key}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [{
                                            role: 'user',
                                            parts: [
                                                { text: fullSystemPrompt },
                                                { text: `Instruções do usuário: ${prompt}\nCategoria: ${categoria || 'E-mail Marketing'}\n${imagem_url ? `Imagem anexada (usar em <img> no topo do e-mail): ${imagem_url}` : ''}` }
                                            ]
                                        }],
                                        generationConfig: { responseMimeType: "application/json" }
                                    })
                                });
                                if (geminiRes.ok) {
                                    const geminiJson = await geminiRes.json();
                                    const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                    try {
                                        const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
                                        generatedName = parsed.nome;
                                        generatedContent = parsed.conteudo;
                                    } catch (e) {
                                        generatedContent = rawText;
                                    }
                                    await logAIUsage(tenantId, 'gemini', 'gemini-2.0-flash', 0, 0);
                                }
                            }
                        }
                    }
                } 
                else {
                    const baseUrl = activeProvider === 'openai' 
                        ? 'https://api.openai.com/v1/chat/completions' 
                        : 'https://api.deepseek.com/v1/chat/completions';
                    const modelName = activeProvider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat';

                    response = await fetch(baseUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${activeKey}`
                        },
                        body: JSON.stringify({
                            model: modelName,
                            response_format: { type: 'json_object' },
                            messages: [
                                { role: 'system', content: fullSystemPrompt },
                                { role: 'user', content: `Instruções do usuário: ${prompt}\nCategoria: ${categoria || 'E-mail Marketing'}\n${imagem_url ? `Imagem anexada (usar em <img> no topo do e-mail): ${imagem_url}` : ''}` }
                            ]
                        })
                    });

                    if (response.ok) {
                        const resJson = await response.json();
                        const rawText = resJson.choices?.[0]?.message?.content || '';
                        try {
                            const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
                            generatedName = parsed.nome;
                            generatedContent = parsed.conteudo;
                        } catch (e) {
                            generatedContent = rawText;
                        }
                        const tokensPrompt = resJson.usage?.prompt_tokens || 0;
                        const tokensCompletion = resJson.usage?.completion_tokens || 0;
                        await logAIUsage(tenantId, activeProvider, modelName, tokensPrompt, tokensCompletion);
                    }
                }
            } catch (errApi) {
                logger.warn('[Templates IA] Erro ao chamar API de IA, utilizando motor inteligente fallback:', errApi.message);
            }
        }

        if (!generatedContent) {
            generatedName = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
            const rawLines = prompt.split('\n').map(l => l.trim());
            let blocksHtml = '';

            let inList = false;
            let listType = 'ul';
            let listItems = [];

            let inTable = false;
            let tableHeader = [];
            let tableRows = [];

            const flushList = () => {
                if (listItems.length > 0) {
                    const tag = listType;
                    const itemsHtml = listItems.map(it => `<li style="margin-bottom: 4px;">${it}</li>`).join('\n');
                    blocksHtml += `
            <div style="background-color: #f0f6ff; border-left: 4px solid #1a5fa8; padding: 12px 16px; border-radius: 6px; margin-bottom: 12px;">
                <${tag} style="margin: 0; padding-left: 18px; font-size: 13px; color: #1e3a8a; line-height: 1.6;">
                    ${itemsHtml}
                </${tag}>
            </div>`;
                    listItems = [];
                    inList = false;
                }
            };

            const flushTable = () => {
                if (tableHeader.length > 0 || tableRows.length > 0) {
                    const thHtml = tableHeader.map(th => `<th style="padding: 8px 12px;">${th}</th>`).join('');
                    const trsHtml = tableRows.map((row, idx) => {
                        const isTotal = row[0]?.toLowerCase().includes('total');
                        if (isTotal) {
                            return `<tr style="background-color: #1a3a5c; color: #ffffff; font-weight: 800;">${row.map(td => `<td style="padding: 10px 12px;">${td}</td>`).join('')}</tr>`;
                        }
                        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                        return `<tr style="border-bottom: 1px solid #e2e8f0; background-color: ${bg};">${row.map((td, i) => `<td style="padding: 8px 12px; ${i === 0 ? 'font-weight: 700; color: #1e293b;' : 'color: #334155;'}">${td}</td>`).join('')}</tr>`;
                    }).join('\n');

                    blocksHtml += `
        <div style="background-color: #ffffff; padding: 16px 20px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); margin-bottom: 12px; overflow: hidden;">
            <h4 style="margin-top: 0; font-size: 13px; font-weight: 800; color: #0d2b4c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Tabela de Alíquotas Informativas</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; border-radius: 6px; overflow: hidden;">
                ${tableHeader.length > 0 ? `<thead><tr style="background-color: #1a5fa8; color: #ffffff; font-weight: 700;">${thHtml}</tr></thead>` : ''}
                <tbody>
                    ${trsHtml}
                </tbody>
            </table>
        </div>`;
                    tableHeader = [];
                    tableRows = [];
                    inTable = false;
                }
            };

            let greenBoxAdded = false;
            let yellowBoxAdded = false;
            let headerBarAdded = false;

            for (let line of rawLines) {
                if (!line) continue;
                const lLower = line.toLowerCase();

                // 1. Ignora linhas de divisória (---...)
                if (/^-{3,}$/.test(line) || /^={3,}$/.test(line)) {
                    continue;
                }

                // 2. Ignora diretivas de regras de formatação
                if (
                    lLower.startsWith('- background do corpo') ||
                    lLower.startsWith('- sem rodapé') ||
                    lLower.startsWith('- sem rodape') ||
                    lLower.startsWith('- sem imagens') ||
                    lLower.startsWith('- responsivo') ||
                    lLower.startsWith('crie um e-mail') ||
                    lLower.startsWith('crie um email') ||
                    lLower.startsWith('box com fundo') ||
                    lLower.startsWith('box vermelho') ||
                    lLower.startsWith('box amarelo') ||
                    lLower.startsWith('box verde') ||
                    lLower.startsWith('círculo verde') ||
                    lLower.startsWith('ícone de alerta') ||
                    lLower.startsWith('lista numerada com') ||
                    lLower.startsWith('abaixo do header')
                ) {
                    continue;
                }

                // 3. Ignora linhas de título de blocos entre colchetes [Bloco ...]
                if (/^\[bloco.*\]$/i.test(line) || /^tabela de alíquotas/i.test(line)) {
                    continue;
                }

                // 4. Header Bar formatado (COMUNICADO | Reforma Tributária)
                if (line.includes('|') && (lLower.includes('comunicado') || lLower.includes('aviso') || lLower.includes('alerta'))) {
                    if (!headerBarAdded) {
                        headerBarAdded = true;
                        flushList();
                        flushTable();
                        const parts = line.split('|').map(p => p.trim());
                        const badgeText = parts[0] || 'COMUNICADO';
                        const titleText = parts[1] || 'Reforma Tributária';

                        blocksHtml += `
    <div style="background-color: #0d2b4c; padding: 12px 18px; text-align: center; border-radius: 6px 6px 0 0; margin-bottom: 14px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;">
            <span style="background-color: #f2c94c; color: #0d2b4c; font-weight: 900; font-size: 11px; padding: 4px 12px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${badgeText}</span>
            <span style="color: rgba(255,255,255,0.4); height: 14px; border-left: 1px solid rgba(255,255,255,0.4);"></span>
            <span style="color: #ffffff; font-weight: 800; font-size: 15px;">${titleText}</span>
        </div>
    </div>`;
                    }
                    continue;
                }

                // 5. Linhas de Tabela com Pipe (ex: Imposto | Alíquota | Esfera ou CBS | 0,9% | Federal)
                if (line.includes('|')) {
                    flushList();
                    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
                    if (!inTable) {
                        inTable = true;
                        tableHeader = cells;
                    } else {
                        tableRows.push(cells);
                    }
                    continue;
                }

                flushTable();

                // 6. Bullet List (- ou *)
                if (line.startsWith('* ') || line.startsWith('- ')) {
                    if (!inList || listType !== 'ul') {
                        flushList();
                        inList = true;
                        listType = 'ul';
                    }
                    listItems.push(line.replace(/^[*\-]\s+/, ''));
                    continue;
                }

                // 7. Numbered List (1. ou 2.)
                if (/^\d+\.\s+/.test(line)) {
                    if (!inList || listType !== 'ol') {
                        flushList();
                        inList = true;
                        listType = 'ol';
                    }
                    listItems.push(line.replace(/^\d+\.\s+/, ''));
                    continue;
                }

                flushList();

                // 8. Green Box Block (✅ Calma! Seu software...)
                if (lLower.includes('calma!') || lLower.includes('seu software já está adaptado') || lLower.includes('nt 2025.002')) {
                    if (!greenBoxAdded) {
                        greenBoxAdded = true;
                        blocksHtml += `
        <div style="background-color: #ffffff; padding: 14px 18px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); margin-bottom: 12px;">
            <div style="background-color: #e8f5e9; border: 1.5px solid #2e7d32; border-radius: 8px; padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start;">
                <div style="font-size: 20px; color: #2e7d32; line-height: 1;">✅</div>
                <div>
                    <h3 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 900; color: #2e7d32;">Calma! Seu software já está adaptado!</h3>
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #1b5e20;">
                        O Coliseu Sistemas está em conformidade com a NT 2025.002 v1.40. As notas fiscais já estão sendo emitidas com os campos de IBS e CBS preenchidos automaticamente. Você não precisa se preocupar.
                    </p>
                </div>
            </div>
        </div>`;
                    }
                    continue;
                }

                // 9. Yellow Alert Block (⚠️ Alíquotas Diferenciadas...)
                if (lLower.includes('alíquotas diferenciadas') || lLower.includes('aliquotas diferenciadas')) {
                    if (!yellowBoxAdded) {
                        yellowBoxAdded = true;
                        blocksHtml += `
        <div style="background-color: #ffffff; padding: 14px 18px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); margin-bottom: 12px;">
            <div style="background-color: #fff3cd; border-left: 4px solid #f0a500; border-radius: 6px; padding: 14px 16px;">
                <h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 800; color: #856404;">
                    ⚠️ Alíquotas Diferenciadas
                </h4>
                <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.45; color: #856404;">
                    A alíquota padrão é de 1%. Porém, alguns produtos podem ter alíquotas diferenciadas (redução, isenção ou crédito presumado).
                </p>
                <ol style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #856404; line-height: 1.5;">
                    <li style="margin-bottom: 3px;">Consulte seu contador para verificar se algum produto tem alíquota diferenciada.</li>
                    <li>Se houver, envie as informações para o suporte da Coliseu para customizarmos o sistema.</li>
                </ol>
            </div>
        </div>`;
                    }
                    continue;
                }

                // 10. Call to Action / Support Block (Dúvidas? Fale com o suporte / [Botão...])
                if (lLower.includes('dúvidas? fale com o suporte') || lLower.startsWith('[botão') || lLower.startsWith('[botao')) {
                    if (lLower.startsWith('[botão') || lLower.startsWith('[botao')) {
                        const btnText = line.replace(/^\[botão\s*\d+\]:\s*/i, '').trim();
                        blocksHtml += `
        <div style="background-color: #1a5fa8; color: #ffffff; padding: 14px 18px; border-radius: 8px; text-align: center; margin-bottom: 10px;">
            <a href="${btnText.includes('@') ? 'mailto:' + btnText : 'https://wa.me/5567998269796'}" target="_blank" style="background-color: #ffffff; color: #1a5fa8; font-weight: 900; font-size: 13px; padding: 10px 22px; border-radius: 6px; text-decoration: none; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                💬 ${btnText}
            </a>
        </div>`;
                    } else {
                        blocksHtml += `
        <div style="background-color: #1a5fa8; color: #ffffff; padding: 18px 20px; border-radius: 8px; text-align: center; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(26, 95, 168, 0.2);">
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 900;">Dúvidas? Fale com o suporte</h3>
            <p style="margin: 0 0 14px 0; font-size: 13px; opacity: 0.95;">Estamos prontos para auxiliá-lo.</p>
        </div>`;
                    }
                    continue;
                }

                // 11. Normal Text Paragraph
                if (line.trim().length > 0) {
                    blocksHtml += `
        <div style="background-color: #ffffff; padding: 14px 18px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); margin-bottom: 12px;">
            <p style="color: #334155; font-size: 13.5px; line-height: 1.5; margin: 0;">${line}</p>
        </div>`;
                }
            }

            flushList();
            flushTable();

            flushList();

            generatedContent = `
<div style="font-family: 'Inter', Arial, sans-serif; max-width: 768px; margin: 0 auto; padding: 0; background-color: #f4f6f8; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
    <div style="padding: 14px 18px;">
        ${blocksHtml}
    </div>
</div>`.trim();
        }

        if (isValidImageUrl(topoUrlConfig)) {
            const absTopo = resolvePublicImageUrl(topoUrlConfig);
            if (absTopo && !generatedContent.includes(topoUrlConfig)) {
                generatedContent = `<div style="text-align: center; margin-bottom: 14px;"><img src="${absTopo}" alt="Topo Marketing" style="max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 auto;" /></div>\n` + generatedContent;
            }
        }
        if (isValidImageUrl(rodapeUrlConfig)) {
            const absRodape = resolvePublicImageUrl(rodapeUrlConfig);
            if (absRodape && !generatedContent.includes(rodapeUrlConfig)) {
                generatedContent = generatedContent + `\n<div style="text-align: center; margin-top: 14px;"><img src="${absRodape}" alt="Rodapé Marketing" style="max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 auto;" /></div>`;
            }
        }

        generatedContent = sanitizeEmailHtml(generatedContent);

        res.json({
            success: true,
            nome: generatedName || `E-mail Marketing - ${prompt.substring(0, 30)}`,
            conteudo: generatedContent
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/templates/enviar-teste
router.post('/enviar-teste', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { destinatario, assunto, conteudo, imagem_url, usar_layout_padrao } = req.body;

        if (!destinatario || !destinatario.includes('@')) {
            return res.status(400).json({ error: 'Informe um e-mail de destinatário válido para o teste.' });
        }

        const EmailService = require('../services/emailService');
        
        let htmlBody = conteudo || '<p>E-mail de teste Nexus</p>';

        if (usar_layout_padrao) {
            const { rows: confRows } = await db.query(
                'SELECT email_marketing_topo_url, email_marketing_rodape_url FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1',
                [tenantId]
            ).catch(() => ({ rows: [] }));
            const topoUrl = confRows[0]?.email_marketing_topo_url;
            const rodapeUrl = confRows[0]?.email_marketing_rodape_url;

            if (isValidImageUrl(topoUrl) && !htmlBody.includes(topoUrl)) {
                const absTopo = resolvePublicImageUrl(topoUrl);
                if (absTopo) {
                    htmlBody = `<div style="text-align: center; margin-bottom: 14px;"><img src="${absTopo}" alt="Topo Marketing" style="max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 auto;" /></div>\n` + htmlBody;
                }
            }
            if (isValidImageUrl(rodapeUrl) && !htmlBody.includes(rodapeUrl)) {
                const absRodape = resolvePublicImageUrl(rodapeUrl);
                if (absRodape) {
                    htmlBody = htmlBody + `\n<div style="text-align: center; margin-top: 14px;"><img src="${absRodape}" alt="Rodapé Marketing" style="max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 auto;" /></div>`;
                }
            }
        }

        // Se houver logo/imagem anexada, injeta ou substitui a imagem no topo do template
        if (imagem_url && imagem_url.trim()) {
            const absLogo = resolvePublicImageUrl(imagem_url);
            const logoTag = `<img src="${absLogo}" alt="Logo" style="max-height: 52px; max-width: 240px; object-fit: contain;" />`;
            if (/<img[^>]*alt=["']Logo[^"']*["'][^>]*>/gi.test(htmlBody)) {
                htmlBody = htmlBody.replace(/<img[^>]*alt=["']Logo[^"']*["'][^>]*>/gi, logoTag);
            } else if (/<div[^>]*>\s*COLISEU[\s\S]*?SISTEMAS\s*<\/div>/gi.test(htmlBody)) {
                htmlBody = htmlBody.replace(/<div[^>]*>\s*COLISEU[\s\S]*?SISTEMAS\s*<\/div>/gi, logoTag);
            }
        } else {
            // Se NÃO houver imagem_url informada, remove qualquer tag <img ... alt="Logo" ...> quebrada ou vazia
            htmlBody = htmlBody.replace(/<img[^>]*alt=["']Logo[^"']*["'][^>]*\/?>/gi, '');
        }

        htmlBody = sanitizeEmailHtml(htmlBody);

        const mockVars = {
            nome_cliente: 'Cliente de Teste Nexus',
            cpf_cnpj: '00.000.000/0001-00',
            numero_documento: 'TESTE-12345',
            valor_total: 'R$ 1.500,00',
            data_vencimento: new Date().toLocaleDateString('pt-BR'),
            dias_atraso: '0',
            link_pagamento: 'https://nexus.com.br/fatura/teste-preview',
            data_atual: new Date().toLocaleDateString('pt-BR'),
            nome_vendedor: 'Suporte Nexus'
        };

        for (const [key, val] of Object.entries(mockVars)) {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
            htmlBody = htmlBody.replace(regex, val);
        }

        // 1. Criar registro de campanha de teste no PostgreSQL para visibilidade nas Estatísticas
        let testCampanhaId = null;
        let emailSendId = null;
        try {
            await db.query(`
                ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'WHATSAPP';
                ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS assunto TEXT;
                ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS conteudo TEXT;
            `).catch(() => {});

            const campRes = await db.query(
                `INSERT INTO dash_campanhas (tenant_id, nome, canal, assunto, conteudo)
                 VALUES ($1, $2, 'EMAIL', $3, $4)
                 RETURNING id`,
                [tenantId, `[TESTE] ${assunto || 'E-mail de Teste'}`, assunto || 'E-mail de Teste', htmlBody]
            );
            testCampanhaId = campRes.rows[0]?.id;

            // 2. Criar registro de envio rastreável
            const sendIns = await db.query(
                `INSERT INTO dash_email_sends (tenant_id, campanha_id, destinatario_nome, destinatario_email, assunto, status, enviado_em)
                 VALUES ($1, $2, $3, $4, $5, 'Enviado', NOW())
                 RETURNING id`,
                [tenantId, testCampanhaId, 'Cliente de Teste', destinatario, assunto || 'E-mail de Teste']
            );
            emailSendId = sendIns.rows[0]?.id;
        } catch (dbErr) {
            logger.warn('[Templates Enviar-Teste] Aviso ao criar logs de rastreamento:', dbErr.message);
        }

        // 3. Injetar pixel de abertura 1x1 e reescrever links para redirecionamento 302
        if (emailSendId) {
            htmlBody = EmailService.injectTracking(htmlBody, emailSendId);
        }

        const item = {
            destinatarioEmail: destinatario,
            destinatarioNome: 'Cliente de Teste',
            assunto: assunto || 'E-mail de Teste - Nexus Templates',
            corpoHtml: htmlBody
        };

        try {
            await EmailService.enviarLote(tenantId, [item]);

            // Gravar log de sucesso
            if (testCampanhaId) {
                await db.query(
                    `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                     VALUES ($1, $2, $3, $4, 'Sucesso', null)`,
                    [tenantId, testCampanhaId, 'Cliente de Teste', destinatario]
                ).catch(() => {});
            }

            res.json({ 
                success: true, 
                message: `E-mail de teste com rastreamento enviado com sucesso para ${destinatario}!`,
                tracking: {
                    campanhaId: testCampanhaId,
                    emailSendId: emailSendId
                }
            });
        } catch (sendErr) {
            logger.error('Erro ao enviar e-mail de teste via EmailService:', sendErr.message);
            if (emailSendId) {
                await db.query(
                    `UPDATE dash_email_sends SET status = 'Falha', metadata = $1 WHERE id = $2`,
                    [JSON.stringify({ erro: sendErr.message }), emailSendId]
                ).catch(() => {});
            }
            res.status(400).json({ 
                error: `Erro ao enviar e-mail via SMTP (${sendErr.message}). Por favor, verifique e salve as credenciais de e-mail na aba Configurações > Integrações.` 
            });
        }
    } catch (err) {
        next(err);
    }
});

module.exports = router;
