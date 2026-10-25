'use strict';

const db = require('../db/postgres');
const logger = require('../config/logger');
const FocusClient = require('./focus/focusClient');

class TransporteService {
    /**
     * Obtém as credenciais do emitente configurado para o tenant.
     */
    static async getEmitente(tenantId, emitenteId = null) {
        let sql = `SELECT * FROM dash_emitentes WHERE tenant_id = $1 AND ativo = true`;
        const params = [tenantId];

        if (emitenteId) {
            sql += ` AND id = $2`;
            params.push(emitenteId);
        } else {
            sql += ` ORDER BY id ASC LIMIT 1`;
        }

        const { rows } = await db.query(sql, params);
        if (rows.length === 0) {
            throw new Error('Nenhuma transportadora/emitente fiscal configurada para este cliente');
        }
        return rows[0];
    }

    /**
     * Retorna a instância do FocusClient configurada para a transportadora.
     */
    static async getFocusClient(tenantId, emitenteId = null) {
        const emitente = await this.getEmitente(tenantId, emitenteId);
        if (!emitente.focus_token) {
            throw new Error(`Emitente ${emitente.razao_social} não possui token da Focus NFe configurado`);
        }
        return {
            client: new FocusClient({
                token: emitente.focus_token,
                ambiente: emitente.focus_ambiente || 'homologacao'
            }),
            emitente
        };
    }

    /**
     * Gera uma referência única e segura para o documento.
     */
    static gerarRef(tipo, tenantId, idInterno) {
        const shortTenant = String(tenantId).replace(/\D/g, '').substring(0, 6) || '000000';
        return `${tipo}_${shortTenant}_${idInterno}_${Date.now().toString().slice(-6)}`;
    }

    // ─────────────────────────────────────────────────────────
    // CT-e (Conhecimento de Transporte)
    // ─────────────────────────────────────────────────────────

    /**
     * Emite um CT-e a partir de dados montados no formulário ou em lote das NF-e.
     */
    static async emitirCte(tenantId, cteId) {
        const { rows } = await db.query(
            `SELECT c.*, e.cnpj as emitente_cnpj
             FROM dash_ctes c
             JOIN dash_emitentes e ON e.id = c.emitente_id
             WHERE c.id = $1 AND c.tenant_id = $2`,
            [cteId, tenantId]
        );

        if (rows.length === 0) {
            throw new Error('CT-e não encontrado');
        }

        const cte = rows[0];
        const { client, emitente } = await this.getFocusClient(tenantId, cte.emitente_id);

        // Busca as NF-e vinculadas a este CT-e
        const { rows: cargas } = await db.query(
            `SELECT chave_nfe FROM dash_cte_cargas WHERE cte_id = $1 AND tenant_id = $2`,
            [cteId, tenantId]
        );

        const nfesPayload = cargas.map(c => ({ chave_nfe: c.chave_nfe }));

        // Monta o payload final consolidando o JSON configurado e as NF-e
        const payload = {
            natureza_operacao: cte.natureza_operacao || 'PRESTACAO DE SERVICO DE TRANSPORTE',
            tipo_documento: '1',
            modal: cte.modal || '1',
            tipo_servico: cte.tipo_servico || '0',
            data_emissao: new Date().toISOString(),
            cnpj_emitente: emitente.cnpj,
            uf_envio: emitente.uf,
            codigo_municipio_envio: emitente.codigo_municipio,
            municipio_envio: emitente.municipio,
            codigo_municipio_inicio: cte.codigo_municipio_inicio,
            municipio_inicio: cte.municipio_inicio,
            uf_inicio: cte.uf_inicio,
            codigo_municipio_fim: cte.codigo_municipio_fim,
            municipio_fim: cte.municipio_fim,
            uf_fim: cte.uf_fim,
            retirar_mercadoria: '1',
            indicador_inscricao_estadual_tomador: '9',
            tomador: cte.tomador || '0',
            valor_total: parseFloat(cte.valor_total || 0).toFixed(2),
            valor_receber: parseFloat(cte.valor_receber || cte.valor_total || 0).toFixed(2),
            componentes_valor: [
                { nome: 'FRETE_PESO', valor: parseFloat(cte.valor_total || 0).toFixed(2) }
            ],
            valor_total_carga: parseFloat(cte.valor_carga || 0).toFixed(2),
            produto_predominante: 'MERCADORIA EM GERAL',
            quantidades: [
                {
                    codigo_unidade_medida: '01',
                    tipo_medida: 'PESO BRUTO',
                    quantidade: parseFloat(cte.peso_bruto || 1).toFixed(3)
                }
            ],
            nfes: nfesPayload,
            modal_rodoviario: {
                rntrc: emitente.rntrc || '00000000'
            },
            // Sobrescreve com quaisquer campos específicos que o operador tenha personalizado
            ...(cte.payload_focus || {})
        };

        // Salva o payload e marca como PROCESSANDO
        await db.query(
            `UPDATE dash_ctes SET
                payload_focus = $1,
                status = 'PROCESSANDO',
                updated_at = NOW()
             WHERE id = $2`,
            [payload, cteId]
        );

        // Dispara para a API da Focus NFe
        const resFocus = await client.emitirCte(cte.ref, payload);

        await db.query(
            `UPDATE dash_ctes SET retorno_focus = $1 WHERE id = $2`,
            [resFocus, cteId]
        );

        return { success: true, ref: cte.ref, focus: resFocus };
    }

    // ─────────────────────────────────────────────────────────
    // MDF-e (Manifesto Eletrônico de Carga)
    // ─────────────────────────────────────────────────────────

    /**
     * Envia o MDF-e para autorização na SEFAZ.
     */
    static async emitirMdfe(tenantId, mdfeId) {
        const { rows } = await db.query(
            `SELECT m.*, e.cnpj as emitente_cnpj, v.placa as v_placa, v.renavam as v_renavam, v.uf as v_uf,
                    mot.nome as mot_nome, mot.cpf as mot_cpf
             FROM dash_mdfes m
             JOIN dash_emitentes e ON e.id = m.emitente_id
             LEFT JOIN dash_veiculos v ON v.id = m.veiculo_id
             LEFT JOIN dash_motoristas mot ON mot.id = m.motorista_id
             WHERE m.id = $1 AND m.tenant_id = $2`,
            [mdfeId, tenantId]
        );

        if (rows.length === 0) {
            throw new Error('MDF-e não encontrado');
        }

        const mdfe = rows[0];
        const { client, emitente } = await this.getFocusClient(tenantId, mdfe.emitente_id);

        // Busca documentos (CT-e / NF-e) vinculados ao manifesto
        const { rows: docs } = await db.query(
            `SELECT tipo_documento, chave, codigo_municipio_descarregamento, nome_municipio_descarregamento
             FROM dash_mdfe_documentos
             WHERE mdfe_id = $1 AND tenant_id = $2`,
            [mdfeId, tenantId]
        );

        const ctesPayload = docs.filter(d => d.tipo_documento === 'CTE').map(d => ({ chave_cte: d.chave }));
        const nfesPayload = docs.filter(d => d.tipo_documento === 'NFE').map(d => ({ chave_nfe: d.chave }));

        const payload = {
            data_emissao: new Date().toISOString(),
            cnpj_emitente: emitente.cnpj,
            tipo_emitente: mdfe.tipo_emitente || '1',
            tipo_transporte: mdfe.tipo_transporte || '1',
            modal: '1',
            uf_inicio: mdfe.uf_inicio,
            uf_fim: mdfe.uf_fim,
            municipios_carregamento: [
                { codigo: emitente.codigo_municipio, nome: emitente.municipio }
            ],
            veiculo_tracao: {
                placa: mdfe.veiculo_placa || mdfe.v_placa,
                renavam: mdfe.v_renavam || null,
                uf: mdfe.v_uf || emitente.uf,
                condutor: [{
                    nome: mdfe.motorista_nome || mdfe.mot_nome,
                    cpf: (mdfe.motorista_cpf || mdfe.mot_cpf || '').replace(/\D/g, '')
                }]
            },
            valor_total_carga: parseFloat(mdfe.valor_carga || 0).toFixed(2),
            codigo_unidade_medida_peso_bruto: '01', // KG
            peso_bruto: parseFloat(mdfe.peso_bruto || 1).toFixed(3),
            conhecimentos_transporte: ctesPayload,
            notas_fiscais: nfesPayload,
            ...(mdfe.payload_focus || {})
        };

        await db.query(
            `UPDATE dash_mdfes SET payload_focus = $1, status = 'PROCESSANDO', updated_at = NOW() WHERE id = $2`,
            [payload, mdfeId]
        );

        const resFocus = await client.emitirMdfe(mdfe.ref, payload);

        await db.query(
            `UPDATE dash_mdfes SET retorno_focus = $1 WHERE id = $2`,
            [resFocus, mdfeId]
        );

        return { success: true, ref: mdfe.ref, focus: resFocus };
    }

    /**
     * Validação preventiva do CT-e — NÃO consome cota da Focus.
     * Retorna impedimentos (bloqueiam emissão) e alertas (exigem confirmação).
     */
    static async validarCte(tenantId, cteId) {
        const { rows } = await db.query(
            `SELECT c.*, e.cnpj AS emitente_cnpj, e.rntrc AS emitente_rntrc,
                    e.inscricao_estadual_emitente, e.codigo_municipio AS emitente_municipio_ibge,
                    e.municipio AS emitente_municipio, e.uf AS emitente_uf,
                    e.focus_token, e.focus_ambiente, e.focus_empresa_id
             FROM dash_ctes c
             JOIN dash_emitentes e ON e.id = c.emitente_id
             WHERE c.id = $1 AND c.tenant_id = $2`,
            [cteId, tenantId]
        );

        if (rows.length === 0) {
            return { valido: false, impedimentos: [{ campo: 'cte', mensagem: 'CT-e não encontrado.' }], alertas: [] };
        }

        const c = rows[0];
        const impedimentos = [];
        const alertas = [];

        // ── Emitente ──
        if (!c.emitente_cnpj) {
            impedimentos.push({ campo: 'emitente_cnpj', mensagem: 'CNPJ do emitente não informado.' });
        }
        if (!c.focus_token) {
            impedimentos.push({ campo: 'focus_token', mensagem: 'Token da Focus NFe não configurado para esta transportadora.' });
        }
        if (!c.emitente_rntrc) {
            alertas.push({ campo: 'rntrc', mensagem: 'RNTRC do emitente não informado — exigido em MDF-e rodoviário.' });
        }

        // ── Percurso ──
        if (!c.uf_inicio || !c.uf_fim) {
            impedimentos.push({ campo: 'uf_inicio', mensagem: 'UF de início e de fim são obrigatórios.' });
        }
        if (!c.codigo_municipio_inicio) {
            impedimentos.push({ campo: 'codigo_municipio_inicio', mensagem: 'Código IBGE do município de início é obrigatório.' });
        }
        if (!c.codigo_municipio_fim) {
            impedimentos.push({ campo: 'codigo_municipio_fim', mensagem: 'Código IBGE do município de fim é obrigatório.' });
        }

        // ── Valores ──
        if (!c.valor_total || Number(c.valor_total) <= 0) {
            impedimentos.push({ campo: 'valor_total', mensagem: 'Valor do frete deve ser maior que zero.' });
        }
        if (!c.peso_bruto || Number(c.peso_bruto) <= 0) {
            alertas.push({ campo: 'peso_bruto', mensagem: 'Peso bruto zerado — a SEFAZ pode rejeitar por divergência de ponderação.' });
        }

        // ── NF-e vinculadas ──
        const { rows: cargas } = await db.query(
            `SELECT c.chave_acesso, c.valor_total, c.peso_bruto,
                    cc.valor_nfe, cc.peso_nfe
             FROM dash_cte_cargas cc
             JOIN dash_cargas c ON c.id = cc.carga_id
             WHERE cc.cte_id = $1 AND cc.tenant_id = $2`,
            [cteId, tenantId]
        );

        if (cargas.length === 0) {
            impedimentos.push({ campo: 'nfes', mensagem: 'Nenhuma NF-e vinculada — o CT-e exige ao menos um documento fiscal.' });
        }

        // Divergência de ponderação (regra clássica de rejeição SEFAZ)
        const pesoCargas = cargas.reduce((acc, c) => acc + Number(c.peso_nfe || c.peso_bruto || 0), 0);
        if (pesoCargas > 0 && c.peso_bruto > 0) {
            const dif = Math.abs(pesoCargas - Number(c.peso_bruto));
            const limite = Math.max(0.5, pesoCargas * 0.001); // 0,1% ou 500g
            if (dif > limite) {
                alertas.push({
                    campo: 'peso_bruto',
                    mensagem: `Peso do CT-e (${Number(c.peso_bruto).toFixed(3)} kg) diverge das NF-e (${pesoCargas.toFixed(3)} kg). A SEFAZ pode rejeitar por divergência de ponderação.`
                });
            }
        }

        // Valor da carga vs. valor do frete (frete não pode ser superior ao valor da carga)
        const valorCargas = cargas.reduce((acc, c) => acc + Number(c.valor_nfe || c.valor_total || 0), 0);
        if (valorCargas > 0 && c.valor_total > valorCargas) {
            alertas.push({
                campo: 'valor_total',
                mensagem: `Frete (R$ ${Number(c.valor_total).toFixed(2)}) maior que o valor da carga (R$ ${valorCargas.toFixed(2)}).`
            });
        }

        // ── Regras fiscais aplicáveis (ICMS) ──
        const { rows: regra } = await db.query(
            `SELECT * FROM dash_regras_fiscais
             WHERE tenant_id = $1 AND ativo = true
               AND (escopo = 'GLOBAL'
                 OR (escopo = 'UF' AND (uf_origem IS NULL OR uf_origem = $2))
                 OR (escopo = 'UF_PAR' AND uf_origem = $2 AND uf_destino = $3))
             ORDER BY CASE escopo WHEN 'UF_PAR' THEN 1 WHEN 'UF' THEN 2 ELSE 3 END
             LIMIT 1`,
            [tenantId, c.uf_inicio, c.uf_fim]
        );

        const r = regra[0];
        let icmsCalculado = 0;
        if (r && Number(r.aliquota_icms) > 0) {
            const base = Number(c.valor_total || 0);
            icmsCalculado = (base * Number(r.aliquota_icms)) / 100;
            if (c.aliquota_icms && Number(c.aliquota_icms) !== Number(r.aliquota_icms)) {
                alertas.push({
                    campo: 'aliquota_icms',
                    mensagem: `Alíquota do formulário (${c.aliquota_icms}%) difere da regra fiscal ${c.uf_inicio}→${c.uf_fim} (${r.aliquota_icms}%).`
                });
            }
        } else {
            alertas.push({ campo: 'aliquota_icms', mensagem: 'Nenhuma regra de ICMS configurada para esta rota — o valor será calculado manualmente.' });
        }

        return {
            valido: impedimentos.length === 0,
            impedimentos,
            alertas,
            calculos: {
                valor_frete: Number(c.valor_total || 0),
                valor_carga: valorCargas,
                peso_cte: Number(c.peso_bruto || 0),
                peso_nfes: pesoCargas,
                icms_estimado: Math.round(icmsCalculado * 100) / 100,
                aliquota_aplicada: r ? Number(r.aliquota_icms) : null,
                situacao_tributaria: r ? r.situacao_tributaria : null
            },
            resumo: {
                nfes_vinculadas: cargas.length,
                emitente: c.emitente_nome || c.emitente_cnpj,
                ambiente: c.focus_ambiente || 'homologacao'
            }
        };
    }

    /**
     * Emite a Carta de Correção Eletrônica de um CT-e autorizado.
     */
    static async cartaCorrecaoCte(tenantId, cteId, correcao) {
        const { rows } = await db.query(
            `SELECT c.ref, c.emitente_id, c.status FROM dash_ctes WHERE c.id = $1 AND c.tenant_id = $2`,
            [cteId, tenantId]
        );
        if (rows.length === 0) throw new Error('CT-e não encontrado.');
        if (rows[0].status !== 'AUTORIZADO') {
            throw new Error('Somente CT-e com status AUTORIZADO pode receber Carta de Correção.');
        }

        const { client } = await this.getFocusClient(tenantId, rows[0].emitente_id);
        const resFocus = await client.cartaCorrecaoCte(rows[0].ref, correcao);

        await db.query(
            `UPDATE dash_ctes SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{carta_correcao}', $1::jsonb), updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(resFocus), cteId]
        );

        return { success: true, focus: resFocus };
    }

    /**
     * Inclui condutor durante a viagem (MDF-e autorizado).
     */
    static async incluirCondutor(tenantId, mdfeId, { nome, cpf }) {
        const { rows } = await db.query(
            `SELECT m.ref, m.emitente_id, m.status FROM dash_mdfes m WHERE m.id = $1 AND m.tenant_id = $2`,
            [mdfeId, tenantId]
        );
        if (rows.length === 0) throw new Error('MDF-e não encontrado.');
        if (rows[0].status !== 'AUTORIZADO') {
            throw new Error('Somente MDF-e AUTORIZADO aceita inclusão de condutor.');
        }

        const { client } = await this.getFocusClient(tenantId, rows[0].emitente_id);
        const resFocus = await client.incluirCondutorMdfe(rows[0].ref, { nome, cpf });

        await db.query(
            `UPDATE dash_mdfes SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{inclusao_condutor}', $1::jsonb), updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(resFocus), mdfeId]
        );

        return { success: true, focus: resFocus };
    }

    /**
     * Inclui CT-e/NF-e em um MDF-e já autorizado.
     */
    static async incluirDfe(tenantId, mdfeId, { protocolo, codigo_municipio_carregamento, documentos }) {
        const { rows } = await db.query(
            `SELECT m.ref, m.emitente_id, m.status FROM dash_mdfes m WHERE m.id = $1 AND m.tenant_id = $2`,
            [mdfeId, tenantId]
        );
        if (rows.length === 0) throw new Error('MDF-e não encontrado.');
        if (rows[0].status !== 'AUTORIZADO') {
            throw new Error('Somente MDF-e AUTORIZADO aceita inclusão de DF-e.');
        }

        const { client } = await this.getFocusClient(tenantId, rows[0].emitente_id);
        const resFocus = await client.incluirDfeMdfe(rows[0].ref, {
            protocolo,
            codigo_municipio_carregamento,
            documentos
        });

        await db.query(
            `UPDATE dash_mdfes SET retorno_focus = jsonb_set(COALESCE(retorno_focus,'{}'::jsonb), '{inclusao_dfe}', $1::jsonb), updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(resFocus), mdfeId]
        );

        return { success: true, focus: resFocus };
    }

    /**
     * Reconciliação: consulta na Focus documentos presos em PROCESSANDO.
     * Executado por job periódico — o webhook é a fonte primária de status.
     */
    static async reconciliarProcessando(tenantId = null, limiteMinutos = 10) {
        const params = [limiteMinutos];
        let filtro = '';
        if (tenantId) {
            params.push(tenantId);
            filtro = ' AND c.tenant_id = $' + params.length;
        }

        const { rows } = await db.query(
            `SELECT c.id, c.tenant_id, c.ref, c.emitente_id, c.status
             FROM dash_ctes c
             WHERE c.status = 'PROCESSANDO'
               AND c.updated_at < NOW() - ($1 || ' minutes')::interval${filtro}
             LIMIT 50`,
            params
        );

        let reconciliados = 0;
        for (const c of rows) {
            try {
                const { client } = await this.getFocusClient(c.tenant_id, c.emitente_id);
                const st = await client.consultarCte(c.ref, true);

                let novoStatus = c.status;
                if (st.status === 'autorizado') novoStatus = 'AUTORIZADO';
                else if (st.status === 'cancelado') novoStatus = 'CANCELADO';
                else if (st.status === 'erro_autorizacao') novoStatus = 'REJEITADO';

                if (novoStatus !== c.status) {
                    await db.query(
                        `UPDATE dash_ctes SET status = $1, status_sefaz = $2, mensagem_sefaz = $3,
                                chave_cte = COALESCE($4, chave_cte), caminho_xml = COALESCE($5, caminho_xml),
                                caminho_dacte = COALESCE($6, caminho_dacte), updated_at = NOW()
                         WHERE id = $7`,
                        [novoStatus, st.status_sefaz, st.mensagem_sefaz, st.chave, st.caminho_xml, st.caminho_dacte, c.id]
                    );
                    reconciliados++;
                }
            } catch (err) {
                logger.warn(`[Reconciliação] CT-e ref=${c.ref}: ${err.message}`);
            }
        }

        return { reconciliados, total: rows.length };
    }

    /**
     * Encerramento do MDF-e para liberar o veículo/motorista na SEFAZ.
     */
    static async encerrarMdfe(tenantId, mdfeId, { siglaUf, nomeMunicipio, dataEncerramento }) {
        const { rows } = await db.query(
            `SELECT m.*, e.focus_token, e.focus_ambiente
             FROM dash_mdfes m
             JOIN dash_emitentes e ON e.id = m.emitente_id
             WHERE m.id = $1 AND m.tenant_id = $2`,
            [mdfeId, tenantId]
        );

        if (rows.length === 0) throw new Error('MDF-e não encontrado');
        const mdfe = rows[0];

        const client = new FocusClient({
            token: mdfe.focus_token,
            ambiente: mdfe.focus_ambiente
        });

        const resFocus = await client.encerrarMdfe(mdfe.ref, {
            data: dataEncerramento || new Date().toISOString().split('T')[0],
            sigla_uf: siglaUf || mdfe.uf_fim,
            nome_municipio: nomeMunicipio || 'Destino'
        });

        await db.query(
            `UPDATE dash_mdfes SET
                status = 'ENCERRADO',
                encerrado_em = NOW(),
                encerramento_uf = $1,
                encerramento_municipio = $2,
                retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{encerramento}', $3::jsonb)
             WHERE id = $4`,
            [siglaUf || mdfe.uf_fim, nomeMunicipio || 'Destino', JSON.stringify(resFocus), mdfeId]
        );

        return { success: true, focus: resFocus };
    }

    // ─────────────────────────────────────────────────────────
    // Webhooks da Focus NFe
    // ─────────────────────────────────────────────────────────

    /**
     * Trata retornos assíncronos enviados pela Focus NFe (autorizado, cancelado, rejeitado).
     */
    static async processarWebhook(payload) {
        const { ref, status, status_sefaz, mensagem_sefaz, chave, caminho_xml, caminho_dacte, caminho_damdfe, protocolo, erros } = payload;

        if (!ref) {
            logger.warn('[Webhook Focus] Webhook recebido sem referência (ref)');
            return { ignored: true };
        }

        logger.info(`[Webhook Focus] Processando retorno de ref=${ref}, status=${status}`);

        // 1. Tenta atualizar CT-e
        const cteRes = await db.query(
            `UPDATE dash_ctes SET
                status = CASE
                    WHEN $1 = 'autorizado' THEN 'AUTORIZADO'
                    WHEN $1 = 'cancelado' THEN 'CANCELADO'
                    WHEN $1 = 'erro_autorizacao' THEN 'REJEITADO'
                    ELSE status
                END,
                chave_cte = COALESCE($2, chave_cte),
                caminho_xml = COALESCE($3, caminho_xml),
                caminho_dacte = COALESCE($4, caminho_dacte),
                protocolo = COALESCE($5, protocolo),
                status_sefaz = $6,
                mensagem_sefaz = $7,
                erros = $8,
                retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{webhook}', $9::jsonb),
                updated_at = NOW()
             WHERE ref = $10 RETURNING id, tenant_id`,
            [status, chave, caminho_xml, caminho_dacte, protocolo, status_sefaz, mensagem_sefaz, JSON.stringify(erros || []), JSON.stringify(payload), ref]
        );

        if (cteRes.rows.length > 0) {
            return { success: true, tipo: 'CTE', id: cteRes.rows[0].id };
        }

        // 2. Se não for CT-e, tenta atualizar MDF-e
        const mdfeRes = await db.query(
            `UPDATE dash_mdfes SET
                status = CASE
                    WHEN $1 = 'autorizado' THEN 'AUTORIZADO'
                    WHEN $1 = 'cancelado' THEN 'CANCELADO'
                    WHEN $1 = 'erro_autorizacao' THEN 'REJEITADO'
                    ELSE status
                END,
                chave_mdfe = COALESCE($2, chave_mdfe),
                caminho_xml = COALESCE($3, caminho_xml),
                caminho_damdfe = COALESCE($4, caminho_damdfe),
                protocolo = COALESCE($5, protocolo),
                status_sefaz = $6,
                mensagem_sefaz = $7,
                erros = $8,
                retorno_focus = jsonb_set(COALESCE(retorno_focus, '{}'::jsonb), '{webhook}', $9::jsonb),
                updated_at = NOW()
             WHERE ref = $10 RETURNING id, tenant_id`,
            [status, chave, caminho_xml, caminho_damdfe, protocolo, status_sefaz, mensagem_sefaz, JSON.stringify(erros || []), JSON.stringify(payload), ref]
        );

        if (mdfeRes.rows.length > 0) {
            return { success: true, tipo: 'MDFE', id: mdfeRes.rows[0].id };
        }

        logger.warn(`[Webhook Focus] Referência ${ref} não encontrada nem em CT-e nem em MDF-e`);
        return { found: false };
    }
}

module.exports = TransporteService;
