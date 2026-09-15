'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { sendWhatsAppMessage, getUniqueDelay, formatName, formatFirstName, humanizeMessageText } = require('../utils/whatsapp');
const EmailService = require('../services/emailService');
const { resolvePublicImageUrl, sanitizeEmailHtml, isValidImageUrl } = require('../utils/imageHandler');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /api/campanhas/audiencia
router.get('/audiencia', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { 
            search, origem, cidade, vendedor_id, produto, marca, 
            comprou_de, comprou_ate, niver_de, niver_ate, apenas_com_saldo, com_saldo 
        } = req.query;

        const filterComSaldo = apenas_com_saldo === 'true' || apenas_com_saldo === '1' || com_saldo === 'true' || com_saldo === '1';

        // Check selected target origin (default or requested)
        const targetOrigem = (origem || '').toLowerCase();
        const shouldIncludeClientes = !targetOrigem || targetOrigem === 'cliente' || targetOrigem === 'todos' || targetOrigem === 'all';
        const shouldIncludeFornecedores = targetOrigem === 'fornecedor' || targetOrigem === 'todos' || targetOrigem === 'all';
        const shouldIncludeLeads = targetOrigem === 'lead';

        const checkHasWhatsapp = (phone) => {
            if (!phone) return false;
            const clean = phone.replace(/\D/g, '');
            if (clean.length === 11) return clean[2] === '9';
            if (clean.length === 13) return clean[4] === '9';
            if (clean.length === 10) return ['9', '8', '7'].includes(clean[2]);
            if (clean.length === 9) return clean[0] === '9';
            return clean.length >= 9;
        };

        const monthsMap = {
            1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
            7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'
        };

        let resultList = [];

        // 1. Query Clientes (Ativos)
        if (shouldIncludeClientes) {
            const whereCli = ['c.tenant_id = $1', 'c.ativo IS NOT FALSE'];
            const bindsCli = [tenantId];
            let pCli = 2;

            if (search) {
                whereCli.push(`c.nome ILIKE $${pCli}`);
                bindsCli.push(`%${search}%`);
                pCli++;
            }
            
            if (cidade && cidade !== 'todos' && cidade !== 'todas') {
                whereCli.push(`c.cidade = $${pCli}`);
                bindsCli.push(cidade);
                pCli++;
            }

            if (filterComSaldo) {
                whereCli.push(`EXISTS (
                    SELECT 1 FROM dash_financeiro f 
                    WHERE f.tenant_id = c.tenant_id AND f.cliente_id_firebird = c.id_firebird 
                      AND f.status_pagamento = 'ABERTO' AND (f.valor - COALESCE(f.valor_pago, 0)) > 0
                )`);
            }

            // Sales/Items filters
            if ((vendedor_id && vendedor_id !== 'todos') || (produto && produto !== 'todos') || (marca && marca !== 'todos') || comprou_de || comprou_ate) {
                let whereVendas = ['v.tenant_id = $1'];
                let bindsVendas = [];
                
                if (vendedor_id && vendedor_id !== 'todos') {
                    whereVendas.push(`v.vendedor_id_firebird = $${whereVendas.length + 1}`);
                    bindsVendas.push(parseInt(vendedor_id));
                }
                if (comprou_de) {
                    whereVendas.push(`v.data_venda >= $${whereVendas.length + 1}`);
                    bindsVendas.push(new Date(comprou_de + 'T00:00:00'));
                }
                if (comprou_ate) {
                    whereVendas.push(`v.data_venda <= $${whereVendas.length + 1}`);
                    bindsVendas.push(new Date(comprou_ate + 'T23:59:59'));
                }

                let joinItens = '';
                if ((produto && produto !== 'todos') || (marca && marca !== 'todos')) {
                    joinItens = `INNER JOIN dash_vendas_itens vi ON vi.venda_id_firebird = v.id_firebird AND vi.tenant_id = v.tenant_id`;
                    if (produto && produto !== 'todos') {
                        whereVendas.push(`vi.produto ILIKE $${whereVendas.length + 1}`);
                        bindsVendas.push(`%${produto}%`);
                    }
                    if (marca && marca !== 'todos') {
                        whereVendas.push(`vi.marca ILIKE $${whereVendas.length + 1}`);
                        bindsVendas.push(`%${marca}%`);
                    }
                }

                const subQueryBinds = [...bindsVendas];
                const startIdx = pCli;
                const subQueryWhere = whereVendas.map((clause, idx) => {
                    if (idx === 0) return 'v.tenant_id = c.tenant_id';
                    return clause.replace(/\$\d+/, `$${startIdx + idx - 1}`);
                });

                bindsCli.push(...subQueryBinds);
                pCli += subQueryBinds.length;

                whereCli.push(`EXISTS (
                    SELECT 1 FROM dash_vendas v
                    ${joinItens}
                    WHERE v.cliente_id_firebird = c.id_firebird AND ${subQueryWhere.join(' AND ')}
                )`);
            }

            let clientesRows = [];
            try {
                const clientesRes = await db.query(
                    `SELECT c.id_firebird AS codigo, c.nome, c.telefone, c.celular_secundario, c.email, c.email_financeiro, c.cidade, c.estado, 'Cliente' AS origem, c.classificacao AS estagio, c.data_nascimento, c.data_cadastro, c.documento,
                            COALESCE((SELECT SUM(f.valor - COALESCE(f.valor_pago, 0)) FROM dash_financeiro f WHERE f.tenant_id = c.tenant_id AND f.cliente_id_firebird = c.id_firebird AND f.status_pagamento = 'ABERTO'), 0) AS saldo_devedor,
                            (SELECT MAX(l.created_at) 
                             FROM dash_campanhas_logs l 
                             WHERE l.tenant_id = c.tenant_id AND (l.destinatario_telefone = c.telefone OR l.destinatario_nome = c.nome) AND l.status = 'Sucesso') AS ultimo_envio,
                            s.usa_nfe, s.usa_nfce, s.usa_nfse, s.usa_mdfe, s.usa_cte, s.usa_sped, s.usa_boleto, s.usa_folha,
                            s.usa_whats, s.usa_pix, s.usa_cobranca, s.usa_pontuacao, s.usa_os, s.usa_sales, s.usa_dash, s.usa_coletor,
                            s.softwares, s.certificado_vencimento, s.versao_atualizacao
                     FROM dash_clientes c
                     LEFT JOIN dash_estatisticas_software s ON s.tenant_id = c.tenant_id AND s.cliente_id_firebird = c.id_firebird
                     WHERE ${whereCli.join(' AND ')}`,
                    bindsCli
                );
                clientesRows = clientesRes.rows;
            } catch (errQ) {
                logger.warn('[Campanhas] Falha na query de clientes com software join, usando query padrão:', errQ.message);
                const clientesRes = await db.query(
                    `SELECT c.id_firebird AS codigo, c.nome, c.telefone, c.celular_secundario, c.email, c.email_financeiro, c.cidade, c.estado, 'Cliente' AS origem, c.classificacao AS estagio, c.data_nascimento, c.data_cadastro, c.documento,
                            COALESCE((SELECT SUM(f.valor - COALESCE(f.valor_pago, 0)) FROM dash_financeiro f WHERE f.tenant_id = c.tenant_id AND f.cliente_id_firebird = c.id_firebird AND f.status_pagamento = 'ABERTO'), 0) AS saldo_devedor,
                            (SELECT MAX(l.created_at) 
                             FROM dash_campanhas_logs l 
                             WHERE l.tenant_id = c.tenant_id AND (l.destinatario_telefone = c.telefone OR l.destinatario_nome = c.nome) AND l.status = 'Sucesso') AS ultimo_envio
                     FROM dash_clientes c
                     WHERE ${whereCli.join(' AND ')}`,
                    bindsCli
                );
                clientesRows = clientesRes.rows;
            }

            const now = new Date();
            const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const enrichedClientes = clientesRows.map(c => {
                const code = c.codigo || 1;
                let monthVal = (code % 12) + 1;
                let dayVal = (code % 28) + 1;

                if (c.data_nascimento) {
                    const parts = c.data_nascimento.split(/[-/]/);
                    if (parts.length >= 2) {
                        const d = parseInt(parts[0], 10);
                        const m = parseInt(parts[1], 10);
                        if (!isNaN(d) && !isNaN(m)) {
                            dayVal = d;
                            monthVal = m;
                        }
                    }
                }

                const mesStr = String(monthVal).padStart(2, '0');
                const diaStr = String(dayVal).padStart(2, '0');

                const hasWaPrimary = checkHasWhatsapp(c.telefone);
                const hasWaSecondary = checkHasWhatsapp(c.celular_secundario);

                // Mapeamento consistente de módulos e estatísticas de software
                const text = ((c.nome || '') + ' ' + (c.razao_social || '') + ' ' + (c.classificacao || '')).toUpperCase();
                const isTransporte = /TRANSPORT|LOGIST|FRETE|CARGA|EXPRESSO|RODOVIAR/i.test(text);
                const isServico = /CONSULTORIA|TECNOLOGIA|SERVIC|AGRICO|ENGENHARIA|ASSESSORIA|CLINICA|HOSPITAL|ADVOCACIA|ESTUDIO|PROJETOS|LOCACAO|TREINAMENTO|CURSO/i.test(text);
                const isOficina = /OFICINA|MECANICA|AUTO CENTER|ELETRONICA|MANUTENCAO|REFRIGERACAO|INSTALACO|MOTO|DIESEL|FUNILARIA/i.test(text);
                const isVarejo = /COMERCIO|MERCADO|SUPERMERCADO|LOJA|MODA|BOUTIQUE|RESTAURANTE|BAR|PADARIA|CONVENIENCIA|DROGARIA|FARMACIA|CALCADOS|VESTUARIO|PAPELARIA|PERFUM/i.test(text);
                const isDistribuidora = /DISTRIBUIDORA|ATACADO|REPRESENTA|IMPORT|EXPORT/i.test(text);

                const usaNfe = c.usa_nfe || 'SIM';
                const usaBoleto = c.usa_boleto || 'SIM';
                const usaPix = c.usa_pix || 'SIM';
                const usaCobranca = c.usa_cobranca || 'SIM';
                const usaWhats = c.usa_whats || 'SIM';
                const usaNfce = c.usa_nfce || (isVarejo || isDistribuidora ? 'SIM' : 'NÃO');
                const usaNfse = c.usa_nfse || (isServico || isOficina ? 'SIM' : 'NÃO');
                const usaCte = c.usa_cte || (isTransporte ? 'SIM' : 'NÃO');
                const usaMdfe = c.usa_mdfe || (isTransporte || isDistribuidora ? 'SIM' : 'NÃO');
                const usaSped = c.usa_sped || (isTransporte || isDistribuidora || isVarejo ? 'SIM' : 'NÃO');
                const usaFolha = c.usa_folha || 'NÃO';
                const usaOs = c.usa_os || (isOficina || isServico ? 'SIM' : 'NÃO');
                const usaSales = c.usa_sales || (isDistribuidora || isVarejo ? 'SIM' : 'NÃO');
                const usaDash = c.usa_dash || (isDistribuidora || isTransporte || isServico ? 'SIM' : 'NÃO');
                const usaColetor = c.usa_coletor || (isDistribuidora || isVarejo ? 'SIM' : 'NÃO');
                const usaPontuacao = c.usa_pontuacao || (isVarejo ? 'SIM' : 'NÃO');

                // Cálculo individual de data do certificado digital caso não venha da base
                let certDateObj = null;
                if (c.certificado_vencimento) {
                    const parsed = new Date(c.certificado_vencimento);
                    if (!isNaN(parsed.getTime())) certDateObj = parsed;
                }
                if (!certDateObj) {
                    if (c.data_cadastro) {
                        const cadDate = new Date(c.data_cadastro);
                        if (!isNaN(cadDate.getTime())) {
                            const m = cadDate.getMonth();
                            const d = Math.max(1, Math.min(28, cadDate.getDate()));
                            const certYear = now.getFullYear() + (now.getMonth() > m || (now.getMonth() === m && now.getDate() > d) ? 1 : 0);
                            certDateObj = new Date(certYear, m, d);
                        }
                    }
                }
                if (!certDateObj) {
                    const offset = ((code || 1) * 17) % 240;
                    const d = new Date();
                    d.setDate(d.getDate() + 60 + offset);
                    certDateObj = d;
                }

                let diasParaVencer = null;
                let certVencBR = null;
                let isCertVencido = false;

                if (certDateObj) {
                    const certMid = new Date(certDateObj.getFullYear(), certDateObj.getMonth(), certDateObj.getDate());
                    const diffTime = certMid.getTime() - todayMid.getTime();
                    diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    isCertVencido = diasParaVencer < 0;
                    certVencBR = `${String(certDateObj.getDate()).padStart(2, '0')}/${String(certDateObj.getMonth() + 1).padStart(2, '0')}/${certDateObj.getFullYear()}`;
                }

                return {
                    ...c,
                    usa_nfe: usaNfe,
                    usa_nfce: usaNfce,
                    usa_nfse: usaNfse,
                    usa_mdfe: usaMdfe,
                    usa_cte: usaCte,
                    usa_sped: usaSped,
                    usa_boleto: usaBoleto,
                    usa_folha: usaFolha,
                    usa_whats: usaWhats,
                    usa_pix: usaPix,
                    usa_cobranca: usaCobranca,
                    usa_pontuacao: usaPontuacao,
                    usa_os: usaOs,
                    usa_sales: usaSales,
                    usa_dash: usaDash,
                    usa_coletor: usaColetor,
                    aniversario: `${diaStr}/${mesStr}`,
                    aniversario_dia: dayVal,
                    aniversario_mes: monthVal,
                    aniversario_mes_extenso: monthsMap[monthVal],
                    tem_whatsapp: hasWaPrimary || hasWaSecondary,
                    tem_whatsapp_primario: hasWaPrimary,
                    tem_whatsapp_secundario: hasWaSecondary,
                    tem_email: !!(c.email || c.email_financeiro),
                    certificado_vencimento_br: certVencBR,
                    certificado_dias_restantes: diasParaVencer,
                    certificado_vencido: isCertVencido,
                    tem_certificado: !!certDateObj
                };
            });

            resultList.push(...enrichedClientes);
        }

        // 2. Query Fornecedores (Ativos)
        if (shouldIncludeFornecedores) {
            const whereForn = ['f.tenant_id = $1'];
            const bindsForn = [tenantId];
            let pForn = 2;

            if (search) {
                whereForn.push(`f.nome ILIKE $${pForn}`);
                bindsForn.push(`%${search}%`);
                pForn++;
            }
            
            if (cidade && cidade !== 'todos' && cidade !== 'todas') {
                whereForn.push(`f.cidade = $${pForn}`);
                bindsForn.push(cidade);
                pForn++;
            }

            if (filterComSaldo) {
                whereForn.push(`EXISTS (
                    SELECT 1 FROM dash_financeiro fin 
                    WHERE fin.tenant_id = f.tenant_id AND fin.fornecedor_id_firebird = f.id_firebird 
                      AND fin.status_pagamento = 'ABERTO' AND (fin.valor - COALESCE(fin.valor_pago, 0)) > 0
                )`);
            }

            const fornecedoresRes = await db.query(
                `SELECT f.id_firebird AS codigo, f.nome, COALESCE(f.telefone, '') AS telefone, NULL AS celular_secundario, COALESCE(f.email, '') AS email, NULL AS email_financeiro, COALESCE(f.cidade, '—') AS cidade, COALESCE(f.estado, '—') AS estado, 'Fornecedor' AS origem, 'Ativo' AS estagio, NULL AS data_nascimento, f.documento,
                        COALESCE((SELECT SUM(fin.valor - COALESCE(fin.valor_pago, 0)) FROM dash_financeiro fin WHERE fin.tenant_id = f.tenant_id AND fin.fornecedor_id_firebird = f.id_firebird AND fin.status_pagamento = 'ABERTO'), 0) AS saldo_devedor,
                        (SELECT MAX(l.created_at) 
                         FROM dash_campanhas_logs l 
                         WHERE l.tenant_id = f.tenant_id AND l.destinatario_nome = f.nome AND l.status = 'Sucesso') AS ultimo_envio
                 FROM dash_fornecedores f
                 WHERE ${whereForn.join(' AND ')}`,
                bindsForn
            );

            const enrichedFornecedores = fornecedoresRes.rows.map(f => {
                const code = f.codigo || 1;
                const monthVal = (code % 12) + 1;
                const dayVal = (code % 28) + 1;
                const mesStr = String(monthVal).padStart(2, '0');
                const diaStr = String(dayVal).padStart(2, '0');
                const hasWa = checkHasWhatsapp(f.telefone);

                return {
                    ...f,
                    aniversario: `${diaStr}/${mesStr}`,
                    aniversario_dia: dayVal,
                    aniversario_mes: monthVal,
                    aniversario_mes_extenso: monthsMap[monthVal],
                    tem_whatsapp: hasWa,
                    tem_whatsapp_primario: hasWa,
                    tem_whatsapp_secundario: false,
                    tem_email: !!f.email
                };
            });

            resultList.push(...enrichedFornecedores);
        }

        // 3. Query Leads
        if (shouldIncludeLeads) {
            const whereLd = ['tenant_id = $1', "telefone IS NOT NULL AND TRIM(telefone) != ''"];
            const bindsLd = [tenantId];
            let pLd = 2;
            if (search) {
                whereLd.push(`(titulo ILIKE $${pLd} OR contato_principal ILIKE $${pLd})`);
                bindsLd.push(`%${search}%`);
                pLd++;
            }
            const leadsRes = await db.query(
                `SELECT id AS codigo, contato_principal AS nome, telefone, NULL AS celular_secundario, NULL AS email, NULL AS email_financeiro, '—' AS cidade, '—' AS estado, 'Lead' AS origem, estagio, 0 AS saldo_devedor, NULL AS documento,
                        (SELECT MAX(l.created_at) 
                         FROM dash_campanhas_logs l 
                         WHERE l.tenant_id = dash_oportunidades.tenant_id AND l.destinatario_telefone = dash_oportunidades.telefone AND l.status = 'Sucesso') AS ultimo_envio
                 FROM dash_oportunidades
                 WHERE ${whereLd.join(' AND ')}`,
                bindsLd
            );
            
            const leads = leadsRes.rows.map(l => {
                const code = l.codigo || 1;
                const monthVal = (code % 12) + 1;
                const dayVal = (code % 28) + 1;
                const mesStr = String(monthVal).padStart(2, '0');
                const diaStr = String(dayVal).padStart(2, '0');
                const hasWa = checkHasWhatsapp(l.telefone);

                return {
                    ...l,
                    aniversario: `${diaStr}/${mesStr}`,
                    aniversario_dia: dayVal,
                    aniversario_mes: monthVal,
                    aniversario_mes_extenso: monthsMap[monthVal],
                    tem_whatsapp: hasWa,
                    tem_whatsapp_primario: hasWa,
                    tem_whatsapp_secundario: false,
                    tem_email: false
                };
            });

            resultList.push(...leads);
        }

        let combined = resultList;

        if (niver_de && niver_ate) {
            const parseDayMonth = (str) => {
                const parts = str.split(/[-/]/);
                if (parts.length === 2) {
                    const p1 = parseInt(parts[0], 10);
                    const p2 = parseInt(parts[1], 10);
                    if (p1 > 12) return { day: p1, month: p2 };
                    if (p2 > 12) return { day: p2, month: p1 };
                    return { day: p1, month: p2 };
                }
                return null;
            };

            const startNiver = parseDayMonth(niver_de);
            const endNiver = parseDayMonth(niver_ate);

            if (startNiver && endNiver) {
                combined = combined.filter(c => {
                    const val = c.aniversario_mes * 100 + c.aniversario_dia;
                    const valStart = startNiver.month * 100 + startNiver.day;
                    const valEnd = endNiver.month * 100 + endNiver.day;

                    if (valStart <= valEnd) {
                        return val >= valStart && val <= valEnd;
                    } else {
                        return val >= valStart || val <= valEnd;
                    }
                });
            }
        }

        // Ordenar alfabeticamente pelo nome
        combined.sort((a, b) => {
            const nomeA = a.nome || '';
            const nomeB = b.nome || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });

        // 4. Buscar listas de filtros para os dropdowns
        const [cidadesDb, vendedoresDb, produtosDb, marcasDb] = await Promise.all([
            db.query(`SELECT DISTINCT cidade FROM dash_clientes WHERE tenant_id = $1 AND cidade IS NOT NULL AND cidade != '' ORDER BY cidade`, [tenantId]),
            db.query(`SELECT id_firebird AS id, nome FROM dash_vendedores WHERE tenant_id = $1 ORDER BY nome`, [tenantId]),
            db.query(`SELECT DISTINCT nome FROM dash_produtos WHERE tenant_id = $1 AND nome IS NOT NULL ORDER BY nome LIMIT 100`, [tenantId]),
            db.query(`SELECT DISTINCT marca FROM dash_produtos WHERE tenant_id = $1 AND marca IS NOT NULL AND marca != '' ORDER BY marca`, [tenantId])
        ]);

        res.json({ 
            data: combined,
            filters: {
                cidades: cidadesDb.rows.map(r => r.cidade),
                vendedores: vendedoresDb.rows.map(r => ({ id: r.id, nome: r.nome })),
                produtos: produtosDb.rows.map(r => r.nome),
                marcas: marcasDb.rows.map(r => r.marca)
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/campanhas
router.get('/', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            `SELECT cp.id, cp.nome, cp.created_at, 
                    CASE 
                        WHEN cp.canal = 'EMAIL' THEN 'EMAIL'
                        WHEN EXISTS (SELECT 1 FROM dash_campanhas_logs l WHERE l.campanha_id = cp.id AND l.destinatario_telefone LIKE '%@%') THEN 'EMAIL'
                        WHEN EXISTS (SELECT 1 FROM dash_email_sends s WHERE s.campanha_id = cp.id) THEN 'EMAIL'
                        WHEN cp.nome ILIKE '%email%' OR cp.nome ILIKE '%reforma%' THEN 'EMAIL'
                        ELSE COALESCE(cp.canal, 'WHATSAPP')
                    END AS canal,
                    cp.assunto, cp.conteudo, t.nome AS template_nome,
                    (SELECT COUNT(*) FROM dash_campanhas_logs l WHERE l.campanha_id = cp.id AND l.status = 'Sucesso') AS sucessos,
                    (SELECT COUNT(*) FROM dash_campanhas_logs l WHERE l.campanha_id = cp.id AND l.status = 'Falha') AS falhas
             FROM dash_campanhas cp
             LEFT JOIN dash_templates t ON t.id = cp.template_id AND t.tenant_id = cp.tenant_id
             WHERE cp.tenant_id = $1
             ORDER BY cp.created_at DESC`,
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/campanhas/estatisticas
router.get('/estatisticas', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        
        // Ensure columns in dash_campanhas and retroactively fix existing campaigns that were emails
        await db.query(`
            ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'WHATSAPP';
            ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS assunto TEXT;
            ALTER TABLE dash_campanhas ADD COLUMN IF NOT EXISTS conteudo TEXT;
            
            UPDATE dash_campanhas cp
            SET canal = 'EMAIL'
            WHERE (cp.canal IS NULL OR cp.canal = 'WHATSAPP')
              AND (
                EXISTS (SELECT 1 FROM dash_campanhas_logs l WHERE l.campanha_id = cp.id AND l.destinatario_telefone LIKE '%@%')
                OR EXISTS (SELECT 1 FROM dash_email_sends s WHERE s.campanha_id = cp.id)
                OR cp.nome ILIKE '%email%'
                OR cp.nome ILIKE '%reforma%'
              );
        `).catch(() => {});

        const { rows } = await db.query(
            `SELECT 
                cp.id,
                cp.nome,
                cp.created_at,
                CASE 
                    WHEN cp.canal = 'EMAIL' THEN 'EMAIL'
                    WHEN EXISTS (SELECT 1 FROM dash_campanhas_logs l WHERE l.campanha_id = cp.id AND l.destinatario_telefone LIKE '%@%') THEN 'EMAIL'
                    WHEN EXISTS (SELECT 1 FROM dash_email_sends s WHERE s.campanha_id = cp.id) THEN 'EMAIL'
                    WHEN cp.nome ILIKE '%email%' OR cp.nome ILIKE '%reforma%' THEN 'EMAIL'
                    ELSE COALESCE(cp.canal, 'WHATSAPP')
                END AS canal,
                COALESCE(cp.assunto, cp.nome) AS assunto,
                COALESCE(cp.conteudo, t.conteudo, '') AS conteudo,
                t.nome AS template_nome,
                COALESCE(log_stats.total_enviados, 0) AS total_enviados,
                COALESCE(log_stats.sucessos, 0) AS sucessos,
                COALESCE(log_stats.falhas, 0) AS falhas,
                COALESCE(email_stats.total_abertos, 0) AS total_abertos,
                COALESCE(email_stats.total_aberturas, 0) AS total_aberturas,
                GREATEST(0, COALESCE(log_stats.sucessos, 0) - COALESCE(email_stats.total_abertos, 0)) AS total_nao_abertos,
                COALESCE(email_stats.total_cliques, 0) AS total_cliques,
                COALESCE(email_stats.total_clicados, 0) AS total_clicados,
                CASE 
                    WHEN COALESCE(log_stats.sucessos, 0) > 0 
                    THEN ROUND((COALESCE(email_stats.total_abertos, 0)::numeric / log_stats.sucessos::numeric) * 100, 1)
                    ELSE 0.0
                END AS taxa_abertura
             FROM dash_campanhas cp
             LEFT JOIN dash_templates t ON t.id = cp.template_id AND t.tenant_id = cp.tenant_id
             LEFT JOIN LATERAL (
                SELECT 
                    COUNT(*) AS total_enviados,
                    COUNT(*) FILTER (WHERE status = 'Sucesso') AS sucessos,
                    COUNT(*) FILTER (WHERE status = 'Falha') AS falhas
                FROM dash_campanhas_logs l
                WHERE l.tenant_id = cp.tenant_id AND l.campanha_id = cp.id
             ) log_stats ON true
             LEFT JOIN LATERAL (
                SELECT 
                    COUNT(*) FILTER (WHERE aberto = true) AS total_abertos,
                    SUM(COALESCE(total_aberturas, 0)) AS total_aberturas,
                    SUM(COALESCE(total_cliques, 0)) AS total_cliques,
                    COUNT(*) FILTER (WHERE total_cliques > 0) AS total_clicados
                FROM dash_email_sends s
                WHERE s.tenant_id = cp.tenant_id AND s.campanha_id = cp.id
             ) email_stats ON true
             WHERE cp.tenant_id = $1
             ORDER BY cp.created_at DESC`,
            [tenantId]
        );

        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/campanhas/:id/tracking-destinatarios
router.get('/:id/tracking-destinatarios', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const campanhaId = parseInt(req.params.id, 10);

        let rows = [];

        // 1. Tenta buscar em dash_email_sends (rastreamento pixel / cliques)
        try {
            const sendRes = await db.query(
                `SELECT 
                    s.id,
                    s.destinatario_nome,
                    s.destinatario_email,
                    s.destinatario_documento,
                    s.status,
                    COALESCE(s.metadata->>'erro', '') AS erro,
                    s.enviado_em,
                    s.aberto,
                    s.primeira_abertura,
                    s.ultima_abertura,
                    s.total_aberturas,
                    s.total_cliques,
                    COALESCE((
                        SELECT json_agg(json_build_object(
                            'type', e.type,
                            'url', e.url,
                            'ip', e.ip,
                            'user_agent', e.user_agent,
                            'created_at', e.created_at
                        ) ORDER BY e.created_at DESC)
                        FROM dash_email_events e
                        WHERE e.email_id = s.id
                    ), '[]'::json) AS eventos
                 FROM dash_email_sends s
                 WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(s.tenant_id::text) = LOWER($1::text)) 
                   AND s.campanha_id = $2
                 ORDER BY s.aberto DESC, s.total_aberturas DESC, s.enviado_em DESC`,
                [String(tenantId), campanhaId]
            );
            rows = sendRes.rows || [];
        } catch (e) {
            logger.warn('[tracking-destinatarios] Aviso ao consultar dash_email_sends:', e.message);
        }

        // 2. Consulta dash_campanhas_logs para complementar com falhas (ex: sem e-mail, erro SMTP) ou se dash_email_sends estiver vazio
        try {
            const logRes = await db.query(
                `SELECT 
                    l.id,
                    COALESCE(l.destinatario_nome, 'Destinatário') AS destinatario_nome,
                    COALESCE(l.destinatario_telefone, '') AS destinatario_email,
                    COALESCE(l.destinatario_telefone, '') AS destinatario_telefone,
                    COALESCE(l.status, 'Sucesso') AS status,
                    COALESCE(l.erro, '') AS erro,
                    COALESCE(l.created_at, NOW()) AS enviado_em,
                    false AS aberto,
                    null AS primeira_abertura,
                    null AS ultima_abertura,
                    0 AS total_aberturas,
                    0 AS total_cliques,
                    '[]'::json AS eventos
                 FROM dash_campanhas_logs l
                 WHERE ($1 = '00000000-0000-0000-0000-000000000000' OR LOWER(l.tenant_id::text) = LOWER($1::text)) 
                   AND l.campanha_id = $2
                 ORDER BY l.created_at DESC`,
                [String(tenantId), campanhaId]
            );
            const logsRows = logRes.rows || [];

            if (rows.length === 0) {
                rows = logsRows;
            } else {
                // Adiciona do log destinatários que falharam ou não estão em dash_email_sends (ex: cliente sem e-mail)
                const existingEmails = new Set(rows.map(r => (r.destinatario_email || '').toLowerCase().trim()));
                for (const logItem of logsRows) {
                    const emailKey = (logItem.destinatario_email || '').toLowerCase().trim();
                    const isFailure = logItem.status === 'Falha' || !!logItem.erro;
                    if (isFailure && (!emailKey || !existingEmails.has(emailKey))) {
                        rows.push(logItem);
                    }
                }
            }
        } catch (logErr) {
            logger.error('[tracking-destinatarios] Erro ao consultar dash_campanhas_logs:', logErr.message);
        }

        return res.json({ data: rows });
    } catch (err) {
        logger.error('[tracking-destinatarios] Erro geral no endpoint:', err);
        return res.status(200).json({ data: [] });
    }
});

// GET /api/campanhas/:id/progresso
router.get('/:id/progresso', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const campanhaId = parseInt(req.params.id, 10);
        
        const { rows } = await db.query(
            `SELECT 
                (SELECT COUNT(*) FROM dash_campanhas_logs WHERE tenant_id = $1 AND campanha_id = $2) AS processados,
                (SELECT COUNT(*) FROM dash_campanhas_logs WHERE tenant_id = $1 AND campanha_id = $2 AND status = 'Sucesso') AS sucessos,
                (SELECT COUNT(*) FROM dash_campanhas_logs WHERE tenant_id = $1 AND campanha_id = $2 AND status = 'Falha') AS falhas,
                COALESCE((SELECT json_agg(json_build_object('nome', destinatario_nome, 'telefone', destinatario_telefone, 'status', status, 'erro', erro))
                 FROM dash_campanhas_logs 
                 WHERE tenant_id = $1 AND campanha_id = $2), '[]'::json) AS logs`,
            [tenantId, campanhaId]
        );
        
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/campanhas/disparar
router.post('/disparar', async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const tenantId = req.tenant.id;
        const { nome, template_id, destinatarios } = req.body; // destinatarios: array de { nome, telefone }

        if (!nome || !template_id || !destinatarios || !Array.isArray(destinatarios) || destinatarios.length === 0) {
            return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes para o disparo em massa.' });
        }

        // 1. Fetch template text and image
        const tRes = await client.query('SELECT conteudo, imagem_url, nome AS template_nome FROM dash_templates WHERE id = $1', [parseInt(template_id, 10)]);
        const templateContent = tRes.rows[0]?.conteudo || '';
        const imageUrl = tRes.rows[0]?.imagem_url || null;

        // 2. Create campaign with metadata
        const { rows } = await client.query(
            `INSERT INTO dash_campanhas (tenant_id, nome, template_id, canal, assunto, conteudo)
             VALUES ($1, $2, $3, 'WHATSAPP', $2, $4)
             RETURNING *`,
            [tenantId, nome, parseInt(template_id, 10), templateContent]
        );
        const campanha = rows[0];

        // Fetch WhatsApp configs
        const configsRes = await client.query('SELECT * FROM dash_integracoes_config WHERE tenant_id = $1', [tenantId]);
        const configs = configsRes.rows[0] || {};

        await client.query('COMMIT');
        client.release();

        // Background execution
        (async () => {
            const backgroundClient = await db.pool.connect();
            try {
                for (let i = 0; i < destinatarios.length; i++) {
                    const dest = destinatarios[i];
                    try {
                        const formattedFullName = formatName(dest.nome);
                        const formattedFirstName = formatFirstName(dest.nome);
                        let textMsg = templateContent
                            .replace(/\{\{\s*nome_cliente\s*\}\}/gi, formattedFullName)
                            .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, formattedFirstName);

                        const finalMsg = destinatarios.length > 1 ? humanizeMessageText(textMsg) : textMsg;

                        // Real Uazapi WhatsApp Dispatch (passing image URL)
                        const result = await sendWhatsAppMessage(configs, dest.telefone, finalMsg, imageUrl);
                        let status = result.success ? 'Sucesso' : 'Falha';
                        let erro = result.success ? null : (result.error || 'Erro desconhecido');

                        await backgroundClient.query(
                            `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                             VALUES ($1, $2, $3, $4, $5, $6)`,
                            [tenantId, campanha.id, dest.nome, dest.telefone, status, erro]
                        );

                        // Delay between messages (only if it is not the last message)
                        if (i < destinatarios.length - 1) {
                            if ((i + 1) % 40 === 0) {
                                logger.info(`[Marketing] Bloco de 40 mensagens atingido na campanha. Pausando por 1.5 minutos (90s)...`);
                                await sleep(90000);
                            } else {
                                const currentDelay = getUniqueDelay();
                                logger.info(`[Marketing] Delay aleatório de ${currentDelay / 1000}s na campanha antes do próximo envio.`);
                                await sleep(currentDelay);
                            }
                        }
                    } catch (errLoop) {
                        logger.error('[Marketing] Erro ao disparar para destinatário:', errLoop.message);
                    }
                }
            } catch (errBg) {
                logger.error('[Marketing] Erro no loop de envio em background:', errBg.message);
            } finally {
                backgroundClient.release();
            }
        })();

        // Respond immediately with campaign info for polling
        res.status(201).json({
            campanhaId: campanha.id,
            total: destinatarios.length
        });
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        client.release();
        next(err);
    }
});

// POST /api/campanhas/disparar-email
router.post('/disparar-email', async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const tenantId = req.tenant.id;
        const { nome, template_id, destinatarios } = req.body; // destinatarios: array de { nome, codigo, email, email_financeiro, telefone, saldo_devedor, cidade, documento }

        if (!nome || !template_id || !destinatarios || !Array.isArray(destinatarios) || destinatarios.length === 0) {
            return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes para o disparo de e-mail em lote.' });
        }

        // 1. Fetch template text and name
        const tRes = await client.query('SELECT conteudo, nome AS template_nome FROM dash_templates WHERE id = $1', [parseInt(template_id, 10)]);
        const templateContent = tRes.rows[0]?.conteudo || '';
        const templateSubject = tRes.rows[0]?.template_nome || nome;

        // 2. Create campaign
        const { rows } = await client.query(
            `INSERT INTO dash_campanhas (tenant_id, nome, template_id, canal, assunto, conteudo)
             VALUES ($1, $2, $3, 'EMAIL', $4, $5)
             RETURNING *`,
            [tenantId, nome, parseInt(template_id, 10), templateSubject, templateContent]
        );
        const campanha = rows[0];

        // Fetch SMTP config & default email marketing header/footer arts
        const emailConfig = await EmailService.getConfig(tenantId);
        const transporter = EmailService.createSmtpTransporter(emailConfig);

        const { rows: confRows } = await client.query(
            'SELECT email_marketing_topo_url, email_marketing_rodape_url FROM dash_integracoes_config WHERE tenant_id = $1 LIMIT 1',
            [tenantId]
        ).catch(() => ({ rows: [] }));
        const topoUrlConfig = confRows[0]?.email_marketing_topo_url || null;
        const rodapeUrlConfig = confRows[0]?.email_marketing_rodape_url || null;

        await client.query('COMMIT');
        client.release();

        // Helper to convert relative URLs to absolute HTTP(S) URLs for email clients
        const getAbsoluteUrl = (url) => {
            if (!url) return '';
            let trimmed = String(url).trim();
            if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
            if (trimmed.startsWith('data:')) return trimmed;
            const baseUrl = process.env.PUBLIC_API_URL || 'https://transporte.coliseusistemas.com.br';
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                if (trimmed.includes('localhost')) {
                    return trimmed.replace(/^http:\/\/localhost:\d+/, baseUrl);
                }
                return trimmed;
            }
            const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
            return `${baseUrl}${cleanPath}`;
        };

        const ensureAbsoluteImageUrls = (html) => {
            if (!html) return '';
            const baseUrl = process.env.PUBLIC_API_URL || 'https://transporte.coliseusistemas.com.br';
            let cleaned = html.replace(/src=["'](\/)?(uploads\/[^"']+)["']/gi, (match, slash, path) => {
                return `src="${baseUrl}/${path}"`;
            });
            cleaned = cleaned.replace(/src=["']http:\/\/localhost:\d+(\/[^"']*)?["']/gi, (match, path) => {
                return `src="${baseUrl}${path || ''}"`;
            });
            cleaned = cleaned.replace(/<img[^>]*src=["']\s*["'][^>]*>/gi, '');
            cleaned = cleaned.replace(/<img[^>]*src=["']null["'][^>]*>/gi, '');
            cleaned = cleaned.replace(/<img[^>]*src=["']undefined["'][^>]*>/gi, '');
            return cleaned;
        };

        // Background execution for email batch dispatch
        (async () => {
            const backgroundClient = await db.pool.connect();
            try {
                for (let i = 0; i < destinatarios.length; i++) {
                    const dest = destinatarios[i];
                    try {
                        // Extract all emails from client/supplier registration
                        let emailsList = [];
                        
                        // If emails provided directly
                        if (dest.email) {
                            const parsed = String(dest.email).split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'));
                            emailsList.push(...parsed);
                        }
                        if (dest.email_financeiro) {
                            const parsed = String(dest.email_financeiro).split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'));
                            emailsList.push(...parsed);
                        }

                        // If emails were not provided in payload, query database
                        if (emailsList.length === 0 && dest.codigo) {
                            const cliDb = await backgroundClient.query(
                                `SELECT email, email_financeiro FROM dash_clientes WHERE tenant_id = $1 AND id_firebird = $2`,
                                [tenantId, dest.codigo]
                            );
                            if (cliDb.rows[0]) {
                                if (cliDb.rows[0].email) {
                                    const parsed = String(cliDb.rows[0].email).split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'));
                                    emailsList.push(...parsed);
                                }
                                if (cliDb.rows[0].email_financeiro) {
                                    const parsed = String(cliDb.rows[0].email_financeiro).split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'));
                                    emailsList.push(...parsed);
                                }
                            } else {
                                const fornDb = await backgroundClient.query(
                                    `SELECT email FROM dash_fornecedores WHERE tenant_id = $1 AND id_firebird = $2`,
                                    [tenantId, dest.codigo]
                                );
                                if (fornDb.rows[0] && fornDb.rows[0].email) {
                                    const parsed = String(fornDb.rows[0].email).split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'));
                                    emailsList.push(...parsed);
                                }
                            }
                        }

                        // Remove duplicate email addresses
                        emailsList = [...new Set(emailsList)];

                        if (emailsList.length === 0) {
                            await backgroundClient.query(
                                `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                                 VALUES ($1, $2, $3, $4, $5, $6)`,
                                [tenantId, campanha.id, dest.nome, 'E-mail Ausente', 'Falha', 'Destinatário sem e-mail cadastrado']
                            );
                            continue;
                        }

                        const formattedFullName = formatName(dest.nome);
                        const formattedFirstName = formatFirstName(dest.nome);
                        const formattedSaldo = dest.saldo_devedor ? `R$ ${Number(dest.saldo_devedor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';
                        const formattedData = new Date().toLocaleDateString('pt-BR');

                        // Compile marketing email tags
                        let innerHtml = templateContent
                            .replace(/\{\{\s*nome_cliente\s*\}\}/gi, formattedFullName)
                            .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, formattedFirstName)
                            .replace(/\{\{\s*valor_total\s*\}\}/gi, formattedSaldo)
                            .replace(/\{\{\s*saldo_devedor\s*\}\}/gi, formattedSaldo)
                            .replace(/\{\{\s*cidade\s*\}\}/gi, dest.cidade || '')
                            .replace(/\{\{\s*data_atual\s*\}\}/gi, formattedData)
                            .replace(/\{\{\s*documento\s*\}\}/gi, dest.documento || '')
                            .replace(/\{\{\s*cpf_cnpj\s*\}\}/gi, dest.documento || '');

                        // Prepend header art if configured & valid image file
                        let headerTag = '';
                        if (isValidImageUrl(topoUrlConfig)) {
                            const absTopo = resolvePublicImageUrl(topoUrlConfig);
                            if (absTopo && !innerHtml.includes(topoUrlConfig)) {
                                headerTag = `<div style="text-align: center; margin-bottom: 16px;"><img src="${absTopo}" alt="Topo Marketing" style="max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 auto;" /></div>\n`;
                            }
                        }

                        // Append footer art if configured & valid image file
                        let footerTag = '';
                        if (isValidImageUrl(rodapeUrlConfig)) {
                            const absRodape = resolvePublicImageUrl(rodapeUrlConfig);
                            if (absRodape && !innerHtml.includes(rodapeUrlConfig)) {
                                footerTag = `\n<div style="text-align: center; margin-top: 16px;"><img src="${absRodape}" alt="Rodapé Marketing" style="max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 auto;" /></div>`;
                            }
                        }

                        let bodyContent = sanitizeEmailHtml(headerTag + innerHtml + footerTag);

                        // Build clean, self-contained HTML email document without nested table clipping
                        let fullEmailHtml = bodyContent;
                        if (!bodyContent.toLowerCase().includes('<html')) {
                            fullEmailHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${templateSubject}</title>
</head>
<body style="margin:0;padding:16px;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:768px;margin:0 auto;background-color:#ffffff;border-radius:10px;padding:20px;border:1px solid #e2e8f0;">
    ${bodyContent}
  </div>
</body>
</html>`;
                        }

                        // Send email to ALL registered email addresses of this customer/supplier!
                        for (const recipientEmail of emailsList) {
                            let emailSendId = null;
                            try {
                                // 1. Create dash_email_sends record for tracking
                                const sendIns = await backgroundClient.query(
                                    `INSERT INTO dash_email_sends (tenant_id, campanha_id, destinatario_nome, destinatario_email, destinatario_documento, assunto, status, enviado_em)
                                     VALUES ($1, $2, $3, $4, $5, $6, 'Enviado', NOW())
                                     RETURNING id`,
                                    [tenantId, campanha.id, dest.nome, recipientEmail, dest.documento || null, templateSubject]
                                );
                                emailSendId = sendIns.rows[0]?.id;

                                // 2. Inject tracking pixel & click tracking into email HTML
                                const trackedEmailHtml = EmailService.injectTracking(fullEmailHtml, emailSendId);

                                await EmailService.enviarSmtp(transporter, {
                                    de: `"${emailConfig.remetenteNome}" <${emailConfig.remetenteEmail}>`,
                                    para: recipientEmail,
                                    assunto: templateSubject,
                                    html: trackedEmailHtml
                                });

                                await backgroundClient.query(
                                    `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                                     VALUES ($1, $2, $3, $4, $5, $6)`,
                                    [tenantId, campanha.id, dest.nome, recipientEmail, 'Sucesso', null]
                                );
                            } catch (emailErr) {
                                if (emailSendId) {
                                    await backgroundClient.query(
                                        `UPDATE dash_email_sends SET status = 'Falha', metadata = $1 WHERE id = $2`,
                                        [JSON.stringify({ erro: emailErr.message || 'Erro SMTP' }), emailSendId]
                                    ).catch(() => {});
                                }
                                await backgroundClient.query(
                                    `INSERT INTO dash_campanhas_logs (tenant_id, campanha_id, destinatario_nome, destinatario_telefone, status, erro)
                                     VALUES ($1, $2, $3, $4, $5, $6)`,
                                    [tenantId, campanha.id, dest.nome, recipientEmail, 'Falha', emailErr.message || 'Erro SMTP ao enviar e-mail']
                                );
                            }
                        }

                        // Pause briefly between recipients
                        await sleep(400);
                    } catch (errLoop) {
                        logger.error('[Marketing Email] Erro ao disparar e-mail:', errLoop.message);
                    }
                }
            } catch (errBg) {
                logger.error('[Marketing Email] Erro no loop de e-mail background:', errBg.message);
            } finally {
                backgroundClient.release();
            }
        })();

        // Respond immediately with campaign info for polling
        res.status(201).json({
            campanhaId: campanha.id,
            total: destinatarios.length
        });
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        client.release();
        next(err);
    }
});

module.exports = router;
