'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { logAIUsage } = require('../utils/ai_helper');
// Helper to get integration config
async function getConfigs(tenantId) {
    const { rows } = await db.query(
        'SELECT * FROM dash_integracoes_config WHERE tenant_id = $1',
        [tenantId]
    );
    return rows[0] || {};
}

// Helper to log interaction
async function logInteraction(tenantId, oportunidadeId, tipo, descricao, criadoPor) {
    await db.query(
        `INSERT INTO dash_oportunidades_interacoes (tenant_id, oportunidade_id, tipo, descricao, criado_por)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, oportunidadeId, tipo, descricao, criadoPor || 'Sistema']
    );
}

// GET /api/crm/oportunidades
router.get('/oportunidades', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { rows } = await db.query(
            `SELECT id, titulo, empresa_nome, contato_principal, telefone, email, 
                    COALESCE(valor_estimated, 0) AS valor_estimado, prioridade, origem, estagio, motivo_perda, 
                    tags, status, created_at, updated_at
             FROM dash_oportunidades
             WHERE tenant_id = $1
             ORDER BY created_at DESC`,
            [tenantId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/crm/oportunidades
router.post('/oportunidades', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const { titulo, empresa_nome, contato_principal, telefone, email, valor_estimado, prioridade, origem, tags, status } = req.body;

        if (!titulo) {
            return res.status(400).json({ error: 'O título é obrigatório.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_oportunidades (tenant_id, titulo, empresa_nome, contato_principal, telefone, email, valor_estimated, prioridade, origem, estagio, tags, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Novos Leads', $10, $11)
             RETURNING *`,
            [tenantId, titulo, empresa_nome, contato_principal, telefone, email, valor_estimado || 0, prioridade || 'Média', origem, tags || null, status || 'Aguardando Contato']
        );

        const opportunity = rows[0];

        // Regista na timeline
        await logInteraction(tenantId, opportunity.id, 'NOTA', 'Oportunidade criada no estágio "Novos Leads".', req.user?.id);

        // Mock WhatsApp Automacao - Novo Lead
        const configs = await getConfigs(tenantId);
        const templateSearch = await db.query(
            `SELECT * FROM dash_templates WHERE tenant_id = $1 AND TRIM(LOWER(nome)) = 'automacao - novo lead'`,
            [tenantId]
        );

        let whatsappStatus = 'Não enviado (sem template)';
        if (templateSearch.rowCount > 0 && configs.whatsapp_instancia_id && configs.whatsapp_token) {
            whatsappStatus = 'Mock WhatsApp de Boas-Vindas enviado!';
            await logInteraction(tenantId, opportunity.id, 'WHATSAPP', `Mensagem automática de boas-vindas enviada.`, 'WhatsApp API');
        }

        res.status(201).json({ data: opportunity, whatsappStatus });
    } catch (err) {
        next(err);
    }
});

// GET /api/crm/oportunidades/:id/detalhes
router.get('/oportunidades/:id/detalhes', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);

        const opRes = await db.query(
            'SELECT * FROM dash_oportunidades WHERE tenant_id = $1 AND id = $2',
            [tenantId, oportunidadeId]
        );

        if (opRes.rowCount === 0) {
            return res.status(404).json({ error: 'Oportunidade não encontrada.' });
        }

        const interacoes = await db.query(
            `SELECT id, tipo, descricao, criado_por, created_at
             FROM dash_oportunidades_interacoes
             WHERE tenant_id = $1 AND oportunidade_id = $2
             ORDER BY created_at DESC`,
            [tenantId, oportunidadeId]
        );

        const atividades = await db.query(
            `SELECT id, tipo, descricao, data_hora, concluida, created_at
             FROM dash_oportunidades_atividades
             WHERE tenant_id = $1 AND oportunidade_id = $2
             ORDER BY data_hora ASC`,
            [tenantId, oportunidadeId]
        );

        res.json({
            oportunidade: opRes.rows[0],
            interacoes: interacoes.rows,
            atividades: atividades.rows
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/crm/oportunidades/:id
router.put('/oportunidades/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);
        const { titulo, empresa_nome, contato_principal, telefone, email, valor_estimado, prioridade, origem, estagio, motivo_perda, tags, status } = req.body;

        const currentOp = await db.query(
            'SELECT * FROM dash_oportunidades WHERE tenant_id = $1 AND id = $2',
            [tenantId, oportunidadeId]
        );

        if (currentOp.rowCount === 0) {
            return res.status(404).json({ error: 'Oportunidade não encontrada.' });
        }

        const oldOp = currentOp.rows[0];

        // Validar motivo de perda se mudar para perdido
        if (estagio === 'Perdidos/Frios' && !motivo_perda) {
            return res.status(400).json({ error: 'O motivo da perda é obrigatório para registrar a perda da oportunidade.' });
        }

        const { rows } = await db.query(
            `UPDATE dash_oportunidades
             SET titulo = $1, empresa_nome = $2, contato_principal = $3, telefone = $4, email = $5,
                 valor_estimated = $6, prioridade = $7, origem = $8, estagio = $9, motivo_perda = $10,
                 tags = $11, status = $12, updated_at = NOW()
             WHERE tenant_id = $13 AND id = $14
             RETURNING *`,
            [
                titulo || oldOp.titulo,
                empresa_nome,
                contato_principal,
                telefone,
                email,
                valor_estimado || 0,
                prioridade || 'Média',
                origem,
                estagio || oldOp.estagio,
                motivo_perda,
                tags !== undefined ? tags : oldOp.tags,
                status || oldOp.status || 'Aguardando Contato',
                tenantId,
                oportunidadeId
            ]
        );

        const updated = rows[0];

        if (oldOp.estagio !== updated.estagio) {
            let desc = `Estágio alterado de "${oldOp.estagio}" para "${updated.estagio}".`;
            if (updated.estagio === 'Perdidos/Frios') {
                desc += ` Motivo: ${motivo_perda}`;
            }
            await logInteraction(tenantId, oportunidadeId, 'MUDANCA_ESTAGIO', desc, req.user?.id);
        }

        res.json({ data: updated });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/crm/oportunidades/:id
router.delete('/oportunidades/:id', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);

        const resDel = await db.query(
            'DELETE FROM dash_oportunidades WHERE tenant_id = $1 AND id = $2',
            [tenantId, oportunidadeId]
        );

        if (resDel.rowCount === 0) {
            return res.status(404).json({ error: 'Oportunidade não encontrada.' });
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// POST /api/crm/oportunidades/:id/atividades
router.post('/oportunidades/:id/atividades', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);
        const { tipo, descricao, data_hora } = req.body;

        if (!tipo || !data_hora) {
            return res.status(400).json({ error: 'Tipo e Data/Hora agendada são obrigatórios.' });
        }

        const { rows } = await db.query(
            `INSERT INTO dash_oportunidades_atividades (tenant_id, oportunidade_id, tipo, descricao, data_hora)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [tenantId, oportunidadeId, tipo, descricao, data_hora]
        );

        await logInteraction(tenantId, oportunidadeId, 'NOTA', `Atividade "${tipo}" agendada para ${new Date(data_hora).toLocaleString('pt-BR')}.`, req.user?.id);

        res.status(201).json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/crm/atividades/:id/concluir
router.patch('/atividades/:id/concluir', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const atividadeId = parseInt(req.params.id, 10);
        const { concluida } = req.body;

        const { rows } = await db.query(
            `UPDATE dash_oportunidades_atividades
             SET concluida = $1
             WHERE tenant_id = $2 AND id = $3
             RETURNING *`,
            [concluida !== false, tenantId, atividadeId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Atividade não encontrada.' });
        }

        const act = rows[0];
        const statusStr = act.concluida ? 'concluída' : 'marcada como pendente';
        await logInteraction(tenantId, act.oportunidade_id, 'NOTA', `Atividade "${act.tipo}" ${statusStr}.`, req.user?.id);

        res.json({ data: act });
    } catch (err) {
        next(err);
    }
});

// POST /api/crm/oportunidades/:id/comunicar
router.post('/oportunidades/:id/comunicar', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);
        const { canal, assunto, corpo, template_id } = req.body;

        if (!canal || !corpo) {
            return res.status(400).json({ error: 'Canal (WhatsApp/Email) e Corpo da mensagem são obrigatórios.' });
        }

        // Registrar na timeline
        const details = template_id ? `via Template (ID: ${template_id})` : 'mensagem personalizada';
        const logText = canal === 'email' 
            ? `E-mail enviado: "${assunto || '(Sem Assunto)'}" - ${details}`
            : `Mensagem de WhatsApp enviada: ${details}`;

        await logInteraction(tenantId, oportunidadeId, canal.toUpperCase(), logText + ` | Conteúdo: ${corpo}`, req.user?.id);

        res.json({ success: true, message: `Comunicação registrada via ${canal.toUpperCase()}` });
    } catch (err) {
        next(err);
    }
});

// POST /api/crm/oportunidades/:id/gerar-proposta-ia
router.post('/oportunidades/:id/gerar-proposta-ia', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);

        const opRes = await db.query(
            'SELECT * FROM dash_oportunidades WHERE tenant_id = $1 AND id = $2',
            [tenantId, oportunidadeId]
        );

        if (opRes.rowCount === 0) {
            return res.status(404).json({ error: 'Oportunidade não encontrada.' });
        }

        const op = opRes.rows[0];
        const configs = await getConfigs(tenantId);

        let proposalText = '';

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
        }

        const systemPrompt = configs.ai_prompt_contratos || configs.ai_system_prompt || 'Você é um assistente de vendas da Coliseu Sistemas. Gere uma proposta comercial muito refinada, estruturada em seções.';

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
                                    { text: systemPrompt },
                                    { text: `Aqui estão os dados coletados do novo cliente para preenchimento dos documentos:\n- Razão Social do Cliente: "${op.empresa_nome || op.contato_principal || ''}"\n- CNPJ/CPF do Cliente: ""\n- Endereço Completo do Cliente: ""\n- Gestor/Representante: "${op.contato_principal || ''}"\n- CPF do Gestor: ""\n- Sistema Antigo para Migração: "${op.origem || ''}"\n- Regime Tributário: "Simples Nacional"\n- Número Total de Terminais contratados: "3"\n- Preço da Implantação/Migração (R$): "1500.00"\n- Preço da Recorrência Mensal Calculada (R$): "${op.valor_estimated || '300.00'}"\n- Módulos Selecionados pelo Comercial: [Fiscal, Financeiro, Apps, Servidor Cloud]` }
                                ]
                            }]
                        })
                    });
                    if (response.status === 200) {
                        const resJson = await response.json();
                        proposalText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
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
                                content: `${systemPrompt}\n\nGere a proposta para este cliente:\n- Razão Social: "${op.empresa_nome || op.contato_principal || ''}"\n- Sistema Antigo: "${op.origem || ''}"\n- Recorrência: "${op.valor_estimated || '300.00'}"`
                            }
                        })
                    });
                    if (response.status === 200 || response.status === 201) {
                        const resJson = await response.json();
                        proposalText = `Proposta comercial sendo processada pela Manus AI. ID do Agente/Task: ${resJson.task_id || resJson.id || 'criada'}`;
                        await logAIUsage(tenantId, 'manus', 'manus-agent', 0, 0);
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
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: `Aqui estão os dados coletados do novo cliente para preenchimento dos documentos:
- Razão Social do Cliente: "${op.empresa_nome || op.contato_principal || ''}"
- CNPJ/CPF do Cliente: ""
- Endereço Completo do Cliente: ""
- Gestor/Representante: "${op.contato_principal || ''}"
- CPF do Gestor: ""
- Sistema Antigo para Migração: "${op.origem || ''}"
- Regime Tributário: "Simples Nacional"
- Número Total de Terminais contratados: "3"
- Preço da Implantação/Migração (R$): "1500.00"
- Preço da Recorrência Mensal Calculada (R$): "${op.valor_estimated || '300.00'}"
- Módulos Selecionados pelo Comercial: [Fiscal, Financeiro, Apps, Servidor Cloud]` }
                            ]
                        })
                    });
                    if (response.status === 200) {
                        const resJson = await response.json();
                        proposalText = resJson.choices?.[0]?.message?.content;
                        const tokensPrompt = resJson.usage?.prompt_tokens || 0;
                        const tokensCompletion = resJson.usage?.completion_tokens || 0;
                        await logAIUsage(tenantId, activeProvider, modelName, tokensPrompt, tokensCompletion);
                    }
                }

                if (!proposalText && response) {
                    throw new Error(`Falha na API: ${response.statusText}`);
                }
            } catch (errApi) {
                logger.warn('[CRM IA] Falha ao consultar AI real. Usando fallback mock.', errApi.message);
            }
        }

        // Fallback / Mock se não tiver API key ou falhar
        if (!proposalText) {
            proposalText = `
# PROPOSTA COMERCIAL - COLISEU ERP

EMPRESA: ${op.empresa_nome || op.contato_principal || '—'}
SISTEMA ATUAL: ${op.origem || 'SOLUÇÃO SISTEMAS'}
REGIME TRIBUTÁRIO: Simples Nacional
MÁQUINAS/TERMINAIS: 3 Terminais
DATA DE EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}
VALIDADE DA PROPOSTA: 15 Dias

1. APRESENTAÇÃO INSTITUCIONAL
O Sistema Coliseu é uma solução completa de gestão empresarial e automação comercial, presente no mercado há mais de 25 anos. Somos uma das principais empresas do ramo em Mato Grosso do Sul e oferecemos soluções e ferramentas diferenciadas para melhorar os resultados, controle operacional e lucratividade de nossos parceiros comerciais.

2. DIAGNÓSTICO OPERACIONAL DA EMPRESA
A partir do mapeamento dos processos da sua empresa, identificamos a necessidade de uma migração segura de dados oriundos do sistema ${op.origem || 'SOLUÇÃO SISTEMAS'} sem causar paralisações na rotina. Almeja-se a automação integral dos setores de Vendas, Estoque, Compras, Frente de Caixa (PDV), Financeiro Avançado e Emissão de Documentos Fiscais de acordo com as regras vigentes do Simples Nacional.

3. COMPOSIÇÃO DOS MÓDULOS CONTRATADOS (PLANO PERSONALIZADO)
A solução implantada contemplará os seguintes módulos ativos:
• Cadastros Avançados (Clientes, Fornecedores, Produtos, Lotes)
• Gestão Fiscal Completa (Emissão ágil de NF-e, NFC-e, NFS-e)
• Módulos Especiais de Transporte (MDF-e, CT-e) se aplicável
• Gestão de Estoque Inteligente e Compras Integradas
• Módulo de Expedição e Logística Interna
• Financeiro Avançado (Contas a Pagar/Receber, Fluxo de Caixa, Integração Bancária)
• Backup Seguro em Cloud Automático
• Licenças do Coliseu Dash (Acesso a indicadores via smartphone)
• Licenças do Coliseu Coletor (Para uso em dispositivos móveis/inventário)
• Suporte Técnico via Chat e Telefone ilimitados
• Atualizações Regulares da Plataforma

4. QUADRO DE INVESTIMENTOS E PRECIFICAÇÃO
O modelo financeiro da Coliseu Sistemas baseia-se em uma Taxa de Implantação Única unida a uma Mensalidade de Licenciamento dimensionada pela infraestrutura necessária:

A) VALOR DE IMPLANTAÇÃO E MIGRAÇÃO:
• Migração Completa de Banco de Dados do ${op.origem || 'SOLUÇÃO SISTEMAS'} para o Coliseu ERP: R$ 1.500,00
(Inclusos: parametrização fiscal para o Simples Nacional, treinamentos especializados para todas as equipes da empresa e suporte assistido na virada de sistema).

B) VALOR DA RECORRÊNCIA MENSAL:
• Mensalidade Base do Sistema (Acesso Inicial): R$ 300,00
• Adicional por Terminais de Operação: (2 máquinas x R$ 50,00): R$ 100,00
• TOTAL DA MENSALIDADE: R$ ${parseFloat(op.valor_estimated || 400).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

5. FORMAS E CONDIÇÕES DE PAGAMENTO
• Implantação/Migração: Parcelamento em até 2X (Entrada + 15 dias no Boleto Bancário).
• Mensalidade de Licenciamento: Vencimento mensal fixado via boleto bancário ou PIX.

6. CRONOGRAMA DE ENTREGA (OPÇÃO ADICIONAL PARA GRANDES IMPLEMENTAÇÕES / APP)
Para projetos industriais complexos ou que demandem o ecossistema FishControl, adota-se o cronograma padrão de 90 dias dividido em:
• MÊS 01: Core Coliseu, Análise técnica estrutural, Parametrização Fiscal e Financeiro.
• MÊS 02: Implantação de Apps Moveis, Integração Direta de Bancos de Dados e customizações.
• MÊS 03: Testes em campo real, treinamento intensivo de equipes e lançamento oficial estável.

Agradecemos imensamente a oportunidade e a confiança em nosso trabalho.
Coliseu Sistemas LTDA.

---

# CONTRATO DE PRESTAÇÃO DE SERVIÇOS E LICENÇA DE USO

CONTRATANTE: ${op.empresa_nome || op.contato_principal || '—'}, estabelecida na cidade de Campo Grande/MS, no endereço: Rua dos Clientes, 123, inscrita no CNPJ/CPF sob nº 00.000.000/0001-00, neste ato representada por ${op.contato_principal || '—'}, inscrito no CPF sob nº 000.000.000-00.

CONTRATADA: COLISEU SISTEMAS LTDA, com sede em Campo Grande, na Rua Pedro Celestino, nº 668, Bairro Centro, CEP: 79002-370, no Estado de Mato Grosso do Sul, inscrita no CNPJ sob nº 29.639.089/0001-12, neste ato representada por KLEBER SILVEIRA DIAGONE, brasileiro, empresário, casado, inscrito no CPF sob nº 930.920.911-91, RG nº 1088727 SSP/MS, residente e domiciliado na comarca de Campo Grande/MS.

As partes acima identificadas têm, entre si, justo e acertado o presente instrumento contratual, que se regerá estritamente pelas cláusulas e condições descritas a seguir.

CLÁUSULA I – DO OBJETO E DA PROPRIEDADE INTELECTUAL
§ 1º - O objeto do presente instrumento consiste na concessão de licença de uso temporária, não exclusiva e intransferível dos softwares da COLISEU SISTEMAS LTDA, compreendendo os módulos ativos selecionados em proposta comercial e/ou a disponibilização, configuração e sustentação de infraestrutura de computação em nuvem (Servidor Cloud) dedicado ao banco de dados e aplicação Coliseu ERP.
§ 2º - A propriedade intelectual e os direitos autorais sobre os softwares, ferramentas, códigos-fonte e aplicativos móveis fornecidos permanecem sendo propriedade jurídica total e exclusiva da CONTRATADA. É terminantemente vedada à CONTRATANTE qualquer reprodução, engenharia reversa, revenda ou cessão do software a terceiros sem expressa anuência por escrito da CONTRATADA.
§ 3º - O Banco de Dados gerado pela utilização rotineira do sistema é de total e irrestrita propriedade da CONTRATANTE, competindo a esta o direito de extração de suas tabelas e informações brutas a qualquer tempo.

CLÁUSULA II – DAS OBRIGAÇÕES DA CONTRATADA
§ 1º - A CONTRATADA compromete-se a efetuar a implantação, parametrização inicial e prestar treinamento operacional dos módulos contratados no prazo acordado entre as partes, estendendo o acompanhamento de treinamento por 30 (trinta) dias corridos após a instalação.
§ 2º - Disponibilizar suporte técnico para resolução de falhas inerentes ao software, configurações de terminais e esclarecimento de dúvidas operacionais. O atendimento dar-se-á em regime de horário comercial: de segunda a sexta-feira das 08:00 às 11:00 e das 13:00 às 18:00, e aos sábados das 08:00 às 12:00, restando indisponível aos domingos e feriados.
§ 3º - No tocante ao fornecimento do Servidor Cloud, a CONTRATADA assume a responsabilidade integral pela execução diária e automatizada de backups de segurança dos dados depositados no servidor virtualizado, gerando mecanismos robustos de integridade e restrição de acessos cibernéticos maliciosos.

CLÁUSULA III – DAS OBRIGAÇÕES DA CONTRATANTE E REQUISITOS DE HARDWARE
§ 1º - Compete à CONTRATANTE honrar pontualmente com o pagamento dos valores de implantação e das mensalidades recorrentes estipuladas.
§ 2º - Fornecer toda a infraestrutura física de informática e links de conectividade em banda larga compatíveis com as exigências técnicas de estabilidade. Os requisitos mínimos obrigatórios por máquina terminal incluem: Sistema Operacional Windows 10 ou superior, processador Intel i3 de primeira geração (ou superior), memória RAM de no mínimo 8GB, placa gráfica integrada e espaço em disco disponível de pelo menos 50GB.
§ 3º - Toda despesa oriunda de manutenção, substituição ou aquisição de periféricos (como impressoras térmicas, leitores, coletores e celulares) corre sob responsabilidade exclusiva da CONTRATANTE.
§ 4º - Eventuais solicitações de ativação de novas funcionalidades e módulos não listados na contratação original deverão ser formalizadas via Termo Aditivo, gerando taxas de implantação variáveis entre 10% e 25% calculadas com base no valor do salário-mínimo nacional vigente à época.

CLÁUSULA IV – DOS PREÇOS, DA REVISÃO FINANCEIRA E DA INADIMPLÊNCIA
§ 1º - Pelos serviços objeto deste instrumento, a CONTRATANTE pagará à CONTRATADA a quantia de R$ 1.500,00 a título de setup inicial de migração e a importância recorrente mensal de R$ ${parseFloat(op.valor_estimated || 400).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, correspondente à licença e aos terminais autorizados em proposta.
§ 2º - Estando em dia com as obrigações financeiras, a CONTRATANTE terá pleno direito a receber as atualizações periódicas e melhorias funcionais desenvolvidas pela CONTRATADA.
§ 3º - O atraso em qualquer parcela ou mensalidade sujeitará a CONTRATANTE à aplicação automática de multa moratória irreduzível de 2% (dois por cento) sobre o montante devido, acrescida de juros de mora à razão de 1% (um por cento) ao mês calculados pro rata die.
§ 4º - O atraso superior a 15 (quinze) dias corridos confere à CONTRATADA a prerrogativa legal e contratual de suspender de forma integral e remota o funcionamento dos softwares licenciados, a emissão de cupons/notas fiscais e os atendimentos de suporte até a integral purgação da mora.

CLÁUSULA V – DA CONFIDENCIALIDADE E DA LEI GERAL DE PROTEÇÃO DE DADOS (LGPD)
§ 1º - Ambas as partes obrigam-se mutuamente a resguardar sigilo absoluto sobre segredos comerciais, carteiras de clientes e dados técnicos acessados em decorrência da execução deste contrato.
§ 2º - A CONTRATADA compromete-se a tratar dados pessoais coletados e alocados nos servidores ou softwares estritamente sob as balizas da Lei nº 13.709/2018 (LGPD), mantendo salvaguardas administrativas e tecnológicas necessárias contra violações de privacidade. Os dados de terceiros coletados serão mantidos unicamente pelo prazo assinalado para a execução técnica dos serviços, procedendo-se a eliminação permanente e segura ao término da relação jurídica, observados os prazos legais de guarda documental fiscal.

CLÁUSULA VI – DA RESCISÃO E DA VIGÊNCIA
§ 1º - O presente contrato é firmado por tempo indeterminado. Qualquer das partes poderá rescindi-lo motivadamente ou sem ônus por conveniência mediante o envio de Notificação Formal por escrito com antecedência prévia mínima e obrigatória de 30 (trinta) dias.
§ 2º - A infração de qualquer cláusula confere à parte prejudicada o direito de pleitear a rescisão contratual imediata, sem prejuízo da apuração e cobrança administrativa ou judicial de perdas e danos.

CLÁUSULA VII – DO FORO
§ 1º - Para dirimir quaisquer litígios ou controvérsias interpretativas oriundas deste instrumento, as partes elegem por comum acordo o foro da comarca de Campo Grande, Estado de Mato Grosso do Sul, com expressa renúncia a qualquer outro, por mais privilegiado que se apresente.

E, por estarem plenamente ajustadas e de acordo com todas as regras expressas, as partes firmam o presente instrumento em duas vias de igual teor e forma jurídica.

Campo Grande/MS, ${new Date().getDate()} de ${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][new Date().getMonth()]} de ${new Date().getFullYear()}.

________________________________________
CONTRATANTE (${op.empresa_nome || op.contato_principal || '—'})

________________________________________
CONTRATADA (COLISEU SISTEMAS LTDA)
            `.trim();
        }

        await logInteraction(tenantId, oportunidadeId, 'NOTA', 'Gerou proposta comercial refinada usando Inteligência Artificial.', 'Coliseu AI');

        res.json({ proposta: proposalText });
    } catch (err) {
        next(err);
    }
});

// POST /api/crm/oportunidades/:id/converter
router.post('/oportunidades/:id/converter', async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const oportunidadeId = parseInt(req.params.id, 10);
        const { documento } = req.body;

        if (!documento) {
            return res.status(400).json({ error: 'O CPF/CNPJ é obrigatório para converter o lead em cliente.' });
        }

        const opRes = await db.query(
            'SELECT * FROM dash_oportunidades WHERE tenant_id = $1 AND id = $2',
            [tenantId, oportunidadeId]
        );

        if (opRes.rowCount === 0) {
            return res.status(404).json({ error: 'Oportunidade não encontrada.' });
        }

        const op = opRes.rows[0];

        // 1. Criar ou obter Cliente
        let clientRows;
        const checkClient = await db.query(
            'SELECT id FROM dash_clientes WHERE tenant_id = $1 AND documento = $2',
            [tenantId, documento]
        );

        if (checkClient.rowCount > 0) {
            clientRows = checkClient.rows;
        } else {
            // Cria um cliente local (id_firebird null)
            const insertClient = await db.query(
                `INSERT INTO dash_clientes (tenant_id, id_firebird, nome, documento, email, telefone, cidade, estado, classificacao, ativo)
                 VALUES ($1, NULL, $2, $3, $4, $5, '—', '—', 'Ativo', true)
                 RETURNING *`,
                [tenantId, op.empresa_nome || op.contato_principal || op.titulo, documento, op.email, op.telefone]
            );
            clientRows = insertClient.rows;
        }

        const client = clientRows[0];

        // 2. Criar um Contrato Financeiro
        const { rows: contractRows } = await db.query(
            `INSERT INTO dash_contratos (tenant_id, cliente_id, descricao, valor_total, data_inicio, status, mensalidade_valor, mensalidade_parcelas)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, 'Em Aberto', $5, 12)
             RETURNING *`,
            [tenantId, client.id, `Contrato originado do Lead: ${op.titulo}`, op.valor_estimated || 0, op.valor_estimated || 0]
        );

        const contract = contractRows[0];

        // 3. Atualizar oportunidade para 'Ganho'
        await db.query(
            `UPDATE dash_oportunidades
             SET estagio = 'Ganho', updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2`,
            [tenantId, oportunidadeId]
        );

        await logInteraction(tenantId, oportunidadeId, 'CONVERSAO', `Oportunidade ganha e convertida em Cliente (ID: ${client.id}) e Contrato (ID: ${contract.id}).`, req.user?.id);

        // 4. WhatsApp automatic notification mock
        const configs = await getConfigs(tenantId);
        const templateSearch = await db.query(
            `SELECT * FROM dash_templates WHERE tenant_id = $1 AND TRIM(LOWER(nome)) = 'fechado/ganho'`,
            [tenantId]
        );

        let whatsappStatus = 'Mensagem automática não enviada (sem template Fechado/Ganho)';
        if (templateSearch.rowCount > 0 && configs.whatsapp_instancia_id && configs.whatsapp_token) {
            whatsappStatus = 'Mock WhatsApp de conversão "Fechado/Ganho" enviado!';
            await logInteraction(tenantId, oportunidadeId, 'WHATSAPP', `Mensagem automática de conversão enviada.`, 'WhatsApp API');
        }

        res.json({
            success: true,
            cliente: client,
            contrato: contract,
            whatsappStatus
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
