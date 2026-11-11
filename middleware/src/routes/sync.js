'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../config/logger');
const { requireInternalAuth, requireAdmin, isValidUuid } = require('../middleware/auth');
const { invalidateTenant } = require('../config/cache');
const TransporteService = require('../services/transporteService');

const IBGE_UF_BY_CODE = {
    '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
    '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
    '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
    '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
};

function digitsOnlySync(val) {
    return String(val ?? '').replace(/\D/g, '');
}

function normalizarDataIsoSync(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().slice(0, 10);
    }
    const str = String(val).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    return str || null;
}

function parseJsonSafeSync(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(String(val));
    } catch (_) {
        return fallback;
    }
}

/**
 * Normaliza linhas vindas do ERP / Firebird (Worker Configurator) para dash_cargas,
 * aceitando variações de colunas do Firebird e enriquecendo via XML da NF-e quando enviado.
 */
function normalizarCargaErpRow(row) {
    let parsedXml = null;
    const rawXmlCandidate =
        row.xml || row.xml_nfe || row.nfe_xml || row.arquivo_xml || row.conteudo_xml || row.xml_completo;

    if (rawXmlCandidate && typeof rawXmlCandidate === 'string' && rawXmlCandidate.trim()) {
        const trimmed = rawXmlCandidate.trim();
        const xmlTexto = trimmed.includes('<')
            ? trimmed
            : (() => {
                try {
                    return Buffer.from(trimmed, 'base64').toString('utf8');
                } catch (_) {
                    return '';
                }
            })();
        if (xmlTexto && xmlTexto.includes('infNFe')) {
            try {
                parsedXml = TransporteService.parseNfeXml(xmlTexto);
            } catch (_) {
                parsedXml = null;
            }
        }
    }

    const chaveDigits = digitsOnlySync(
        row.chave_acesso ||
        row.chave_nfe ||
        row.chavenfe ||
        row.chave ||
        row.chnfe ||
        row.chave_dfe ||
        row.nfe_chave ||
        parsedXml?.chave_acesso ||
        ''
    );
    if (chaveDigits.length === 44) {
        row.chave_acesso = chaveDigits;
    } else if (row.chave_acesso) {
        row.chave_acesso = String(row.chave_acesso).trim();
    }

    if (row.id_firebird === undefined || row.id_firebird === null || row.id_firebird === '') {
        const candId =
            row.id_nota ?? row.id_nfe ?? row.cod_nota ?? row.id_pedido ?? row.id_saida ?? row.codigo ?? row.id;
        if (candId !== undefined && candId !== null && candId !== '') {
            const parsedId = parseInt(String(candId), 10);
            if (!Number.isNaN(parsedId)) row.id_firebird = parsedId;
        }
    }

    const tipoDocRaw = String(row.tipo_documento || row.modelo_doc || row.modelo || 'NFE').trim().toUpperCase();
    row.tipo_documento = tipoDocRaw === '57' || tipoDocRaw === 'CTE' ? 'CTE' : 'NFE';

    const chave44 = row.chave_acesso && String(row.chave_acesso).length === 44 ? String(row.chave_acesso) : '';

    if (!row.numero) {
        const candNumero =
            row.numero_nota ?? row.numero_nfe ?? row.num_nota ?? row.nnf ?? row.num_doc ?? row.ndoc ?? parsedXml?.numero;
        if (candNumero !== undefined && candNumero !== null && String(candNumero).trim() !== '') {
            row.numero = String(candNumero).trim().slice(0, 20);
        } else if (chave44) {
            row.numero = String(parseInt(chave44.slice(25, 34), 10));
        }
    }

    if (!row.serie) {
        const candSerie = row.serie_nota ?? row.serie_nfe ?? parsedXml?.serie;
        if (candSerie !== undefined && candSerie !== null && String(candSerie).trim() !== '') {
            row.serie = String(candSerie).trim().slice(0, 5);
        } else if (chave44) {
            row.serie = String(parseInt(chave44.slice(22, 25), 10));
        }
    }

    const dataNorm = normalizarDataIsoSync(
        row.data_emissao || row.dt_emissao || row.data_nota || row.dhemi || row.demi || row.emissao || row.data || parsedXml?.data_emissao
    );
    if (dataNorm) {
        row.data_emissao = dataNorm;
    }

    const remDoc = digitsOnlySync(
        row.remetente_documento ||
        row.remetente_cnpj ||
        row.remetente_cpf ||
        row.cnpj_remetente ||
        row.cpf_remetente ||
        row.emitente_documento ||
        row.emitente_cnpj ||
        row.cnpj_emitente ||
        parsedXml?.remetente?.documento ||
        (chave44 ? chave44.slice(6, 20) : '')
    );
    if (remDoc) row.remetente_documento = remDoc.slice(0, 20);

    const remNome =
        row.remetente_nome ||
        row.nome_remetente ||
        row.razao_remetente ||
        row.emitente_nome ||
        row.emitente_razao ||
        row.razao_emitente ||
        parsedXml?.remetente?.razao_social;
    if (remNome) row.remetente_nome = String(remNome).trim().slice(0, 200);

    const remMun =
        row.remetente_municipio ||
        row.municipio_remetente ||
        row.cidade_remetente ||
        row.emitente_municipio ||
        row.emitente_cidade ||
        row.cidade_origem ||
        row.mun_origem ||
        parsedXml?.remetente?.municipio;
    if (remMun) row.remetente_municipio = String(remMun).trim().slice(0, 100);

    const remUf =
        row.remetente_uf ||
        row.uf_remetente ||
        row.emitente_uf ||
        row.uf_origem ||
        parsedXml?.remetente?.uf ||
        (chave44 ? IBGE_UF_BY_CODE[chave44.slice(0, 2)] : '');
    if (remUf) row.remetente_uf = String(remUf).trim().toUpperCase().slice(0, 2);

    const destDoc = digitsOnlySync(
        row.destinatario_documento ||
        row.destinatario_cnpj ||
        row.destinatario_cpf ||
        row.cnpj_destinatario ||
        row.cpf_destinatario ||
        row.cliente_documento ||
        row.cliente_cnpj ||
        row.cliente_cpf ||
        row.cpf_cnpj ||
        row.cnpj_cpf ||
        parsedXml?.destinatario?.documento ||
        ''
    );
    if (destDoc) row.destinatario_documento = destDoc.slice(0, 20);

    const destNome =
        row.destinatario_nome ||
        row.nome_destinatario ||
        row.razao_destinatario ||
        row.cliente_nome ||
        row.nome_cliente ||
        row.razao_cliente ||
        parsedXml?.destinatario?.razao_social;
    if (destNome) row.destinatario_nome = String(destNome).trim().slice(0, 200);

    const destMun =
        row.destinatario_municipio ||
        row.municipio_destinatario ||
        row.cidade_destinatario ||
        row.cliente_cidade ||
        row.cidade_destino ||
        row.mun_destino ||
        parsedXml?.destinatario?.municipio;
    if (destMun) row.destinatario_municipio = String(destMun).trim().slice(0, 100);

    const destUf =
        row.destinatario_uf ||
        row.uf_destinatario ||
        row.cliente_uf ||
        row.uf_destino ||
        parsedXml?.destinatario?.uf;
    if (destUf) row.destinatario_uf = String(destUf).trim().toUpperCase().slice(0, 2);

    const vTotal =
        row.valor_total ?? row.vnf ?? row.valor_nota ?? row.valor_nfe ?? row.vlr_total ?? row.valor ?? parsedXml?.valor_total;
    if (vTotal !== undefined && vTotal !== null && vTotal !== '') {
        row.valor_total = parseFloat(vTotal) || 0;
    }

    const vProd = row.valor_produtos ?? row.vprod ?? row.vlr_produtos ?? parsedXml?.valor_produtos ?? row.valor_total;
    if (vProd !== undefined && vProd !== null && vProd !== '') {
        row.valor_produtos = parseFloat(vProd) || 0;
    }

    const pBruto =
        row.peso_bruto ?? row.pesob ?? row.peso_kg ?? row.peso_total ?? row.peso ?? parsedXml?.peso_bruto;
    if (pBruto !== undefined && pBruto !== null && pBruto !== '') {
        row.peso_bruto = parseFloat(pBruto) || 0;
    }

    const pLiquido = row.peso_liquido ?? row.pesol ?? parsedXml?.peso_liquido;
    if (pLiquido !== undefined && pLiquido !== null && pLiquido !== '') {
        row.peso_liquido = parseFloat(pLiquido) || 0;
    }

    const vM3 = row.volume_m3 ?? row.cubagem ?? row.m3;
    if (vM3 !== undefined && vM3 !== null && vM3 !== '') {
        row.volume_m3 = parseFloat(vM3) || 0;
    }

    const vols = row.volumes ?? row.qvol ?? row.qtd_volumes ?? row.quantidade_volumes ?? parsedXml?.volumes;
    if (vols !== undefined && vols !== null && vols !== '') {
        row.volumes = Math.max(1, parseInt(String(vols), 10) || 1);
    }

    const esp = row.especie || row.esp || parsedXml?.especie;
    if (esp) row.especie = String(esp).trim().slice(0, 60);

    const prodPred =
        row.produto_predominante || row.xprod || row.descricao_produto || row.produto || parsedXml?.produto_predominante;
    if (prodPred) row.produto_predominante = String(prodPred).trim().slice(0, 200);

    const sitRaw = String(row.status || row.situacao || row.situacao_nfe || '').trim().toUpperCase();
    const canceladaFlag = String(row.cancelada ?? '').trim().toUpperCase();
    if (
        ['CANCELADA', 'CANCELADO', 'DENEGADA', 'DENEGADO', 'INUTILIZADA', 'C'].includes(sitRaw) ||
        ['S', 'SIM', '1', 'TRUE'].includes(canceladaFlag)
    ) {
        row.status = 'CANCELADA';
    } else {
        row.status = 'PENDENTE';
    }

    const dadosExistentes = parseJsonSafeSync(row.dados_nfe, {});
    const remCodIbge = digitsOnlySync(
        row.remetente_codigo_municipio ||
        row.cod_ibge_remetente ||
        row.cmun_emit ||
        row.codigo_municipio_origem ||
        dadosExistentes?.remetente?.codigo_municipio ||
        parsedXml?.remetente?.codigo_municipio
    );
    const destCodIbge = digitsOnlySync(
        row.destinatario_codigo_municipio ||
        row.cod_ibge_destinatario ||
        row.cmun_dest ||
        row.codigo_municipio_destino ||
        dadosExistentes?.destinatario?.codigo_municipio ||
        parsedXml?.destinatario?.codigo_municipio
    );

    const remetenteJson = {
        ...(parsedXml?.remetente || {}),
        ...(dadosExistentes?.remetente || {}),
        ...(row.remetente_documento ? { documento: row.remetente_documento } : {}),
        ...(row.remetente_nome ? { razao_social: row.remetente_nome } : {}),
        ...(row.remetente_ie || row.ie_remetente ? { inscricao_estadual: String(row.remetente_ie || row.ie_remetente).trim() } : {}),
        ...(row.remetente_endereco || row.logradouro_remetente ? { logradouro: String(row.remetente_endereco || row.logradouro_remetente).trim() } : {}),
        ...(row.remetente_numero ? { numero: String(row.remetente_numero).trim() } : {}),
        ...(row.remetente_bairro ? { bairro: String(row.remetente_bairro).trim() } : {}),
        ...(row.remetente_cep ? { cep: digitsOnlySync(row.remetente_cep) } : {}),
        ...(remCodIbge ? { codigo_municipio: remCodIbge } : {}),
        ...(row.remetente_municipio ? { municipio: row.remetente_municipio } : {}),
        ...(row.remetente_uf ? { uf: row.remetente_uf } : {})
    };

    const destinatarioJson = {
        ...(parsedXml?.destinatario || {}),
        ...(dadosExistentes?.destinatario || {}),
        ...(row.destinatario_documento ? { documento: row.destinatario_documento } : {}),
        ...(row.destinatario_nome ? { razao_social: row.destinatario_nome } : {}),
        ...(row.destinatario_ie || row.ie_destinatario ? { inscricao_estadual: String(row.destinatario_ie || row.ie_destinatario).trim() } : {}),
        ...(row.destinatario_endereco || row.logradouro_destinatario || row.cliente_endereco
            ? { logradouro: String(row.destinatario_endereco || row.logradouro_destinatario || row.cliente_endereco).trim() }
            : {}),
        ...(row.destinatario_numero ? { numero: String(row.destinatario_numero).trim() } : {}),
        ...(row.destinatario_bairro ? { bairro: String(row.destinatario_bairro).trim() } : {}),
        ...(row.destinatario_cep || row.cliente_cep ? { cep: digitsOnlySync(row.destinatario_cep || row.cliente_cep) } : {}),
        ...(destCodIbge ? { codigo_municipio: destCodIbge } : {}),
        ...(row.destinatario_municipio ? { municipio: row.destinatario_municipio } : {}),
        ...(row.destinatario_uf ? { uf: row.destinatario_uf } : {}),
        ...(row.destinatario_telefone || row.cliente_telefone ? { telefone: digitsOnlySync(row.destinatario_telefone || row.cliente_telefone) } : {}),
        ...(row.destinatario_email || row.cliente_email ? { email: String(row.destinatario_email || row.cliente_email).trim() } : {})
    };

    const itensLista = Array.isArray(row.itens)
        ? row.itens
        : Array.isArray(dadosExistentes?.itens)
        ? dadosExistentes.itens
        : Array.isArray(parsedXml?.itens)
        ? parsedXml.itens
        : [];

    row.dados_nfe = {
        ...dadosExistentes,
        origem: dadosExistentes.origem || 'WORKER_ERP',
        ...(row.cfop ? { cfop: digitsOnlySync(row.cfop) } : {}),
        ...(row.natureza_operacao || row.natureza || parsedXml?.natureza
            ? { natureza: String(row.natureza_operacao || row.natureza || parsedXml?.natureza).trim() }
            : {}),
        ...(parsedXml?.protocolo || row.protocolo ? { protocolo: String(row.protocolo || parsedXml?.protocolo).trim() } : {}),
        ...(Object.keys(remetenteJson).length > 0 ? { remetente: remetenteJson } : {}),
        ...(Object.keys(destinatarioJson).length > 0 ? { destinatario: destinatarioJson } : {}),
        ...(itensLista.length > 0 ? { itens: itensLista } : {})
    };

    return row;
}

function normalizarVeiculoErpRow(row) {
    const placaLimpa = String(row.placa || row.placa_veiculo || row.veiculo_placa || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8);
    if (placaLimpa) row.placa = placaLimpa;
    if (!row.id_firebird && (row.id_veiculo || row.cod_veiculo || row.codigo || row.id)) {
        const parsed = parseInt(String(row.id_veiculo || row.cod_veiculo || row.codigo || row.id), 10);
        if (!Number.isNaN(parsed)) row.id_firebird = parsed;
    }
    if (row.tara_kg === undefined && row.tara !== undefined) row.tara_kg = parseInt(String(row.tara), 10) || 0;
    if (row.capacidade_kg === undefined && row.capacidade !== undefined) row.capacidade_kg = parseInt(String(row.capacidade), 10) || 0;
    if (row.capacidade_m3 === undefined && row.cubagem !== undefined) row.capacidade_m3 = parseFloat(row.cubagem) || 0;
    if (!row.cpf_cnpj_proprietario && (row.doc_proprietario || row.cnpj_proprietario || row.cpf_proprietario)) {
        row.cpf_cnpj_proprietario = digitsOnlySync(row.doc_proprietario || row.cnpj_proprietario || row.cpf_proprietario).slice(0, 20);
    }
    if (row.uf) row.uf = String(row.uf).trim().toUpperCase().slice(0, 2);
    if (row.uf_proprietario) row.uf_proprietario = String(row.uf_proprietario).trim().toUpperCase().slice(0, 2);
    if (row.rntrc) row.rntrc = digitsOnlySync(row.rntrc).slice(0, 20);
    if (row.renavam) row.renavam = digitsOnlySync(row.renavam).slice(0, 20);
    return row;
}

function normalizarMotoristaErpRow(row) {
    const cpfLimpo = digitsOnlySync(row.cpf || row.cpf_motorista || row.documento || row.cpf_cnpj || '');
    if (cpfLimpo) row.cpf = cpfLimpo.slice(0, 14);
    if (!row.id_firebird && (row.id_motorista || row.cod_motorista || row.codigo || row.id)) {
        const parsed = parseInt(String(row.id_motorista || row.cod_motorista || row.codigo || row.id), 10);
        if (!Number.isNaN(parsed)) row.id_firebird = parsed;
    }
    if (!row.nome && (row.nome_motorista || row.motorista)) {
        row.nome = String(row.nome_motorista || row.motorista).trim().slice(0, 200);
    }
    if (!row.cnh && (row.numero_cnh || row.registro_cnh)) {
        row.cnh = digitsOnlySync(row.numero_cnh || row.registro_cnh).slice(0, 20);
    }
    if (!row.cnh_categoria && (row.categoria_cnh || row.cat_cnh)) {
        row.cnh_categoria = String(row.categoria_cnh || row.cat_cnh).trim().toUpperCase().slice(0, 5);
    }
    if (!row.cnh_validade && (row.validade_cnh || row.venc_cnh)) {
        row.cnh_validade = normalizarDataIsoSync(row.validade_cnh || row.venc_cnh);
    }
    if (!row.telefone && (row.celular || row.fone || row.whatsapp)) {
        row.telefone = digitsOnlySync(row.celular || row.fone || row.whatsapp).slice(0, 30);
    }
    return row;
}

const MASTER_TENANT_ID = '00000000-0000-0000-0000-000000000000';

function resolveAuthenticatedTenant(req) {
    const authTenantId = req.tenant?.id;
    if (!authTenantId || !isValidUuid(authTenantId)) return null;

    const isMasterUser =
        authTenantId === MASTER_TENANT_ID &&
        String(req.user?.role || '').toLowerCase() === 'master';

    // Permite que super-admin Master filtre por um tenant específico via query/header se válido
    if (isMasterUser) {
        const requested = req.query?.tenant_id || req.headers['x-tenant-id'];
        if (requested && isValidUuid(String(requested).trim()) && String(requested).trim() !== MASTER_TENANT_ID) {
            return { tenantId: String(requested).trim(), allowAllTenants: false, isMasterUser: true };
        }
        return { tenantId: MASTER_TENANT_ID, allowAllTenants: true, isMasterUser: true };
    }

    if (authTenantId === MASTER_TENANT_ID) {
        return null;
    }

    return { tenantId: authTenantId, allowAllTenants: false, isMasterUser: false };
}

const TABELAS_MAP = {
    'dash_clientes': [
        'id_firebird', 'nome', 'razao_social', 'nome_fantasia', 'documento', 'email', 'email_financeiro',
        'telefone', 'celular_secundario', 'cidade', 'estado', 'classificacao', 'data_cadastro', 'ativo',
        'responsavel_nome', 'responsavel_rg', 'responsavel_cpf', 'regime_tributario', 'endereco_completo',
        'tipo_cliente', 'observacoes'
    ],
    'dash_produtos': [
        'id_firebird', 'codigo', 'nome', 'descricao', 'categoria', 'marca', 'preco', 'custo', 
        'estoque', 'estoque_minimo', 'estoque_maximo', 'ativo', 'referencia', 'codigo_fabrica',
        'abreviacao', 'departamento', 'unidade', 'peso', 'comissao_percent', 'desconto_max_percent',
        'apresentacao', 'codigo_barras', 'modelo_barras', 'preco_minimo', 'margem_lucro_min', 'margem_lucro_max', 'observacoes'
    ],
    'dash_vendedores': ['id_firebird', 'nome', 'email', 'ativo'],
    'dash_fornecedores': ['id_firebird', 'nome', 'documento', 'cidade', 'estado'],
    'dash_vendas': ['id_firebird', 'numero_pedido', 'data_venda', 'data_vencimento', 'cliente_id_firebird', 'vendedor_id_firebird', 'valor_total', 'valor_custo', 'valor_desconto', 'status', 'marca', 'categoria', 'especie', 'depto_id', 'cfop', 'numero_nota', 'chave_nfe', 'data_hora_proc', 'es', 'processo'],
    'dash_vendas_itens': ['id_firebird', 'venda_id_firebird', 'produto_id_firebird', 'quantidade', 'preco_unitario', 'custo_unitario', 'valor_total', 'desconto_item', 'vendedor', 'produto', 'marca', 'categoria', 'depto_id', 'cfop', 'numero_nota', 'chave_nfe'],
    'dash_produtos_depto': ['id_firebird', 'produto_id_firebird', 'depto_id', 'estoque', 'preco', 'custo', 'ativo'],
    'dash_comissoes': ['id_firebird', 'vendedor_id_firebird', 'venda_id_firebird', 'periodo', 'valor_vendas', 'percentual', 'valor_comissao', 'data_referencia'],
    'dash_financeiro': [
        'id_firebird', 'tipo', 'tipo_documento', 'descricao', 'cliente_id_firebird', 'fornecedor_id_firebird', 
        'caixa_id_firebird', 'data_emissao', 'data_vencimento', 'data_pagamento', 'valor', 'valor_pago', 
        'status_pagamento', 'depto_id', 'centro_custo', 'plano_contas_nome', 'historico', 'tipo_movimento', 'parcela', 'dias_carencia'
    ],
    'dash_compras': ['id_firebird', 'numero_pedido', 'fornecedor_id_firebird', 'data_pedido', 'data_entrega', 'valor_total', 'status'],
    'dash_devolucoes': ['id_firebird', 'venda_id_firebird', 'produto_id_firebird', 'data_devolucao', 'motivo', 'quantidade', 'valor'],
    'dash_caixas': ['id_firebird', 'descricao'],
    'dash_filiais': ['empresa_erp', 'depto_id', 'centro_custo', 'nome', 'documento', 'is_default'],
    // Tabelas ADM (WorkerADM)
    'adm_ocorrencias': ['id_firebird', 'numero', 'data_abertura', 'data_fechamento', 'status', 'tipo', 'descricao', 'cliente_id_firebird', 'responsavel', 'prioridade'],
    'adm_ocorrencias_itens': ['id_firebird', 'ocorrencia_id_firebird', 'descricao', 'quantidade', 'valor_unitario', 'valor_total'],
    'rel_ic_contas_plano_res': ['id_firebird', 'codigo', 'descricao', 'tipo', 'nivel', 'conta_pai_id_firebird', 'ativo'],
    'dash_estatisticas_software': ['cliente_id_firebird', 'versao_software', 'versao_atualizacao', 'servidor', 'certificado_vencimento', 'usa_nfe', 'usa_nfce', 'usa_nfse', 'usa_sped', 'usa_boleto', 'usa_folha', 'usa_whats', 'usa_pix', 'usa_cobranca', 'usa_pontuacao', 'usa_os', 'usa_cte', 'usa_mdfe', 'usa_sales', 'usa_dash', 'usa_coletor', 'softwares'],
    // Módulo Coliseu Transporte (Sincronizado pelo Worker do ERP — isolado dos demais módulos)
    'dash_cargas': ['id_firebird', 'tipo_documento', 'chave_acesso', 'numero', 'serie', 'data_emissao', 'remetente_documento', 'remetente_nome', 'remetente_municipio', 'remetente_uf', 'destinatario_documento', 'destinatario_nome', 'destinatario_municipio', 'destinatario_uf', 'valor_total', 'valor_produtos', 'peso_bruto', 'peso_liquido', 'volume_m3', 'volumes', 'especie', 'produto_predominante', 'status', 'dados_nfe'],
    'dash_veiculos': ['id_firebird', 'placa', 'renavam', 'chassi', 'uf', 'tipo_rodado', 'tipo_carroceria', 'tara_kg', 'capacidade_kg', 'capacidade_m3', 'tipo_proprietario', 'rntrc', 'cpf_cnpj_proprietario', 'nome_proprietario', 'uf_proprietario'],
    'dash_motoristas': ['id_firebird', 'cpf', 'nome', 'cnh', 'cnh_categoria', 'cnh_validade', 'telefone'],
};

/**
 * POST /api/sync/start
 * Acionado pelo frontend para solicitar o início manual de sincronização.
 */
router.post('/start', async (req, res) => {
    const { id: tenantId } = req.tenant || {};
    logger.info(`[Sync] Solicitação de início manual de sincronização para o tenant: ${tenantId}`);
    return res.status(200).json({
        success: true,
        message: 'Solicitação de sincronização recebida'
    });
});

/**
 * POST /internal/sync/heartbeat
 * Recebe batimento cardíaco do Worker .NET e registra em dash_sync_metadata.
 */
router.post('/heartbeat', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) return res.status(200).json({ ok: true });
    try {
        await db.query(`
            INSERT INTO dash_sync_metadata (tenant_id, tabela, ultima_sincronizacao, registros_sincronizados, status, erro_mensagem)
            VALUES ($1, '__heartbeat__', NOW(), 0, 'OK', NULL)
            ON CONFLICT (tenant_id, tabela) WHERE operacao IS NULL DO UPDATE SET
                ultima_sincronizacao = NOW(),
                status = 'OK',
                erro_mensagem = NULL
        `, [scope.tenantId]);
    } catch (_) { /* ignore if metadata table missing */ }
    return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * GET /api/sync/status
 * Retorna o status de sincronização por tabela (Quadro de Sincronismo do Transporte / ERP).
 */
router.get('/status', async (req, res) => {
    try {
        const scope = resolveAuthenticatedTenant(req);
        if (!scope) {
            return res.status(401).json({ error: 'Tenant não autenticado.' });
        }
        const { tenantId, allowAllTenants } = scope;

        const [rClientes, rProdutos, rCargas, rVendas, rVendasItens, rFinanceiro, rMeta] = await Promise.all([
            db.query(`SELECT COUNT(*)::int AS total, MAX(sincronizado_em) AS max_date FROM dash_clientes WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(`SELECT COUNT(*)::int AS total, MAX(sincronizado_em) AS max_date FROM dash_produtos WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(`SELECT COUNT(*)::int AS total, MAX(sincronizado_em) AS max_date FROM dash_cargas WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(`SELECT COUNT(*)::int AS total, MAX(sincronizado_em) AS max_date FROM dash_vendas WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(`SELECT COUNT(*)::int AS total, MAX(sincronizado_em) AS max_date FROM dash_vendas_itens WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(`SELECT COUNT(*)::int AS total, MAX(sincronizado_em) AS max_date FROM dash_financeiro WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [{ total: 0 }] })),
            db.query(`SELECT tabela, ultima_sincronizacao AS ultima, status, registros_sincronizados AS registros FROM dash_sync_metadata WHERE ($2::boolean = true OR LOWER(tenant_id::text) = LOWER($1::text))`, [String(tenantId), allowAllTenants]).catch(() => ({ rows: [] }))
        ]);

        const metaByTable = {};
        for (const m of (rMeta.rows || [])) {
            metaByTable[m.tabela] = m;
        }

        const statusItems = [
            { tabela: 'dash_clientes', ultima: metaByTable['dash_clientes']?.ultima || rClientes.rows[0]?.max_date || null, status: (rClientes.rows[0]?.total || 0) > 0 ? 'OK' : (metaByTable['dash_clientes']?.status || 'AGUARDANDO'), registros: rClientes.rows[0]?.total || 0 },
            { tabela: 'dash_produtos', ultima: metaByTable['dash_produtos']?.ultima || rProdutos.rows[0]?.max_date || null, status: (rProdutos.rows[0]?.total || 0) > 0 ? 'OK' : (metaByTable['dash_produtos']?.status || 'AGUARDANDO'), registros: rProdutos.rows[0]?.total || 0 },
            { tabela: 'dash_cargas', ultima: metaByTable['dash_cargas']?.ultima || rCargas.rows[0]?.max_date || null, status: (rCargas.rows[0]?.total || 0) > 0 ? 'OK' : (metaByTable['dash_cargas']?.status || 'AGUARDANDO'), registros: rCargas.rows[0]?.total || 0 },
            { tabela: 'dash_vendas', ultima: metaByTable['dash_vendas']?.ultima || rVendas.rows[0]?.max_date || null, status: (rVendas.rows[0]?.total || 0) > 0 ? 'OK' : (metaByTable['dash_vendas']?.status || 'AGUARDANDO'), registros: rVendas.rows[0]?.total || 0 },
            { tabela: 'dash_vendas_itens', ultima: metaByTable['dash_vendas_itens']?.ultima || rVendasItens.rows[0]?.max_date || null, status: (rVendasItens.rows[0]?.total || 0) > 0 ? 'OK' : (metaByTable['dash_vendas_itens']?.status || 'AGUARDANDO'), registros: rVendasItens.rows[0]?.total || 0 },
            { tabela: 'dash_financeiro', ultima: metaByTable['dash_financeiro']?.ultima || rFinanceiro.rows[0]?.max_date || null, status: (rFinanceiro.rows[0]?.total || 0) > 0 ? 'OK' : (metaByTable['dash_financeiro']?.status || 'AGUARDANDO'), registros: rFinanceiro.rows[0]?.total || 0 },
        ];

        const validDates = [
            metaByTable['__heartbeat__']?.ultima,
            ...statusItems.map(i => i.ultima)
        ].map(d => d ? new Date(d).getTime() : 0).filter(t => !isNaN(t) && t > 0);

        let heartbeatStatus = 'OFFLINE';
        let ultimaHeartbeat = null;
        if (validDates.length > 0) {
            const maxTime = Math.max(...validDates);
            ultimaHeartbeat = new Date(maxTime).toISOString();
            if (Date.now() - maxTime < 30 * 60 * 1000) {
                heartbeatStatus = 'OK';
            }
        }

        statusItems.push({
            tabela: '__heartbeat__',
            ultima: ultimaHeartbeat,
            status: heartbeatStatus,
            registros: 0
        });

        return res.json({ success: true, status: statusItems, timestamp: new Date().toISOString() });
    } catch (err) {
        logger.error('[Sync] Erro no endpoint GET /sync/status:', err.message);
        return res.json({ success: true, status: [] });
    }
});

/**
 * Aliases de rota para compatibilidade com o WorkerADM (.NET).
 * O Worker envia para nomes como /customers, /financials enquanto o handler
 * genérico abaixo usa os nomes reais de tabela (dash_clientes, dash_financeiro, etc.)
 */
const ALIAS_MAP = {
    'customers':              'dash_clientes',
    'catalog':                'dash_produtos',
    'financials':             'dash_financeiro',
    'sellers':                'dash_vendedores',
    'sales':                  'dash_vendas',
    'sales-items':            'dash_vendas_itens',
    'payment-species':        'dash_caixas',
    'adm-ocorrencias':        'adm_ocorrencias',
    'adm-ocorrencias-itens':  'adm_ocorrencias_itens',
    'contas-plano-res':       'rel_ic_contas_plano_res',
    'estatisticas-software': 'dash_estatisticas_software',
    'cargas':                 'dash_cargas',
    'notas':                  'dash_cargas',
    'nfes':                   'dash_cargas',
    'nfe':                    'dash_cargas',
    'notas-fiscais':          'dash_cargas',
    'notas_fiscais':          'dash_cargas',
    'transporte-cargas':      'dash_cargas',
    'veiculos':               'dash_veiculos',
    'frota':                  'dash_veiculos',
    'transporte-veiculos':    'dash_veiculos',
    'motoristas':             'dash_motoristas',
    'condutores':             'dash_motoristas',
    'transporte-motoristas':  'dash_motoristas',
};

router.post('/adm-ocorrencias', requireInternalAuth, (req, res, next) => {
    req.params.tabela = 'adm_ocorrencias';
    next();
});
router.post('/adm-ocorrencias-itens', requireInternalAuth, (req, res, next) => {
    req.params.tabela = 'adm_ocorrencias_itens';
    next();
});
router.post('/contas-plano-res', requireInternalAuth, (req, res, next) => {
    req.params.tabela = 'rel_ic_contas_plano_res';
    next();
});

/**
 * GET /internal/sync/pending-inactivations
 * Retorna inativações pendentes para o Worker processar no ERP Firebird.
 */
router.get('/pending-inactivations', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant não identificado.' });

    try {
        const { rows } = await db.query(`
            SELECT id, entidade, id_firebird, tentativas, criado_em
            FROM pending_inactivations
            WHERE tenant_id = $1
              AND status IN ('PENDENTE', 'ERRO')
              AND tentativas < 5
            ORDER BY criado_em ASC
            LIMIT 50
        `, [tenantId]);

        if (rows.length > 0) {
            const ids = rows.map(r => r.id);
            await db.query(
                `UPDATE pending_inactivations SET status = 'PROCESSANDO' WHERE id = ANY($1) AND tenant_id = $2`,
                [ids, tenantId]
            );
        }

        return res.json({ inactivations: rows, count: rows.length });
    } catch (err) {
        logger.error('[Sync] Erro ao buscar pending_inactivations:', err.message);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

/**
 * POST /internal/sync/confirm-inactivation
 * O Worker confirma que inativou o item no ERP.
 * Body: { id: number, success: boolean, error?: string }
 */
router.post('/confirm-inactivation', async (req, res) => {
    const tenantId = req.tenant?.id;
    const { id, success, error } = req.body || {};

    if (!tenantId || !id) return res.status(400).json({ error: 'id é obrigatório.' });

    try {
        if (success) {
            await db.query(
                `UPDATE pending_inactivations SET status = 'CONCLUIDO', processado_em = NOW() WHERE id = $1 AND tenant_id = $2`,
                [id, tenantId]
            );
        } else {
            await db.query(
                `UPDATE pending_inactivations SET status = 'ERRO', tentativas = tentativas + 1, erro_mensagem = $1 WHERE id = $2 AND tenant_id = $3`,
                [error || 'Erro desconhecido', id, tenantId]
            );
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao confirmar inativação' });
    }
});

/**
 * GET /api/sync/pending-payments
 * Retorna pagamentos quitados no Asaas/Nexus pendentes para o Worker sincronizar no ERP Coliseu (Firebird).
 */
router.get('/pending-payments', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório para consumir fila de pagamentos.' });
    }
    const { tenantId } = scope;
    try {
        const { rows } = await db.query(`
            SELECT id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, tentativas, criado_em
            FROM pending_payments
            WHERE LOWER(tenant_id::text) = LOWER($1::text)
              AND (status IN ('PENDENTE', 'ERRO') OR (status = 'PROCESSANDO' AND (processado_em IS NULL OR processado_em < NOW() - INTERVAL '1 minute')))
              AND tentativas < 25
            ORDER BY 
              CASE WHEN data_pagamento >= '2026-01-01' THEN 0 ELSE 1 END ASC,
              data_pagamento DESC, 
              id DESC
            LIMIT 100
        `, [String(tenantId)]);

        if (rows.length > 0) {
            const ids = rows.map(r => r.id);
            await db.query(
                `UPDATE pending_payments SET status = 'PROCESSANDO', processado_em = NOW() WHERE id = ANY($1) AND LOWER(tenant_id::text) = LOWER($2::text)`,
                [ids, String(tenantId)]
            );
        }

        const normalizedPayments = rows.map(r => {
            let dataPgtoStr = new Date().toISOString().split('T')[0];
            if (r.data_pagamento) {
                try {
                    dataPgtoStr = new Date(r.data_pagamento).toISOString().split('T')[0];
                } catch (e) {
                    dataPgtoStr = String(r.data_pagamento).substring(0, 10);
                }
            }
            return {
                id: Number(r.id),
                titulo_id: r.titulo_id ? Number(r.titulo_id) : null,
                id_firebird: r.id_firebird ? Number(r.id_firebird) : null,
                nosso_numero: r.nosso_numero ? String(r.nosso_numero).trim().substring(0, 20) : null,
                numero_documento: r.numero_documento ? String(r.numero_documento).trim().substring(0, 20) : null,
                valor_pago: Number(parseFloat(r.valor_pago || 0).toFixed(2)),
                data_pagamento: dataPgtoStr,
                forma_pagamento: (r.forma_pagamento || 'BOLETO_ASAAS').substring(0, 20),
                tentativas: Number(r.tentativas || 0),
                criado_em: r.criado_em
            };
        });

        return res.json({ payments: normalizedPayments, count: normalizedPayments.length });
    } catch (err) {
        logger.error('[Sync] Erro ao buscar pending_payments:', err.message);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

/**
 * POST /api/sync/confirm-payment
 * O Worker do ERP Coliseu (Firebird) confirma que baixou o título na retaguarda.
 * Body: { id: number, success: boolean, error?: string }
 */
router.post('/confirm-payment', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    const { id, success, error } = req.body || {};

    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    if (!id) return res.status(400).json({ error: 'id é obrigatório.' });

    try {
        if (success) {
            await db.query(
                `UPDATE pending_payments SET status = 'CONCLUIDO', processado_em = NOW() WHERE id = $1 AND LOWER(tenant_id::text) = LOWER($2::text)`,
                [parseInt(id, 10), String(scope.tenantId)]
            );
        } else {
            await db.query(
                `UPDATE pending_payments SET status = 'ERRO', tentativas = tentativas + 1, erro_mensagem = $1 WHERE id = $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                [error || 'Erro desconhecido', parseInt(id, 10), String(scope.tenantId)]
            );
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao confirmar quitação de pagamento' });
    }
});

/**
 * POST /api/sync/resync-quitacoes
 * Reenfileira todas as quitações de títulos vinculados para o Worker do ERP Coliseu (Firebird).
 */
router.post('/resync-quitacoes', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Selecione uma empresa válida para reenfileirar quitações.' });
    }
    const { tenantId } = scope;
    const { hoje, id_firebird, nosso_numero, reset_errors } = req.body || {};
    try {
        if (reset_errors) {
            await db.query(`
                UPDATE pending_payments 
                SET status = 'PENDENTE', tentativas = 0, processado_em = NULL, erro_mensagem = NULL
                WHERE LOWER(tenant_id::text) = LOWER($1::text)
                  AND status IN ('ERRO', 'PROCESSANDO')
            `, [String(tenantId)]);
        }

        const params = [String(tenantId)];
        let filterExtra = '';
        if (id_firebird !== undefined && id_firebird !== null && id_firebird !== '') {
            const parsedFb = parseInt(id_firebird, 10);
            if (!isNaN(parsedFb)) {
                params.push(parsedFb);
                filterExtra += ` AND f.id_firebird = $${params.length}`;
            }
        }
        if (nosso_numero !== undefined && nosso_numero !== null && String(nosso_numero).trim() !== '') {
            params.push(String(nosso_numero).trim());
            filterExtra += ` AND f.nosso_numero = $${params.length}`;
        }
        if (hoje) {
            filterExtra += ` AND (
                DATE(f.data_pagamento) = CURRENT_DATE 
                OR DATE(f.data_vinculo) = CURRENT_DATE
                OR DATE(f.updated_at) = CURRENT_DATE
                OR f.data_pagamento >= CURRENT_DATE - INTERVAL '1 day'
            )`;
        }

        const queryResult = await db.query(`
            INSERT INTO pending_payments (tenant_id, titulo_id, id_firebird, nosso_numero, numero_documento, valor_pago, data_pagamento, forma_pagamento, status, tentativas, criado_em)
            SELECT 
                f.tenant_id,
                f.id AS titulo_id,
                f.id_firebird,
                f.nosso_numero,
                f.numero_documento,
                COALESCE(NULLIF(f.valor_pago, 0), f.valor) AS valor_pago,
                COALESCE(f.data_pagamento, NOW()) AS data_pagamento,
                COALESCE(f.especie_nome, 'BOLETO_ASAAS') AS forma_pagamento,
                'PENDENTE' AS status,
                0 AS tentativas,
                NOW() AS criado_em
            FROM dash_financeiro f
            WHERE LOWER(f.tenant_id::text) = LOWER($1::text)
              AND (
                UPPER(COALESCE(f.status_pagamento, '')) IN ('PAGO', 'QUITADO', 'RECEBIDO', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'BAIXADO', 'LIQUIDADO')
                OR (f.valor_pago IS NOT NULL AND f.valor_pago >= f.valor AND f.valor > 0)
              )
              ${filterExtra}
            ON CONFLICT (tenant_id, titulo_id) DO UPDATE
            SET valor_pago = EXCLUDED.valor_pago,
                data_pagamento = EXCLUDED.data_pagamento,
                forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, pending_payments.forma_pagamento),
                id_firebird = COALESCE(EXCLUDED.id_firebird, pending_payments.id_firebird),
                nosso_numero = COALESCE(EXCLUDED.nosso_numero, pending_payments.nosso_numero),
                numero_documento = COALESCE(EXCLUDED.numero_documento, pending_payments.numero_documento),
                status = 'PENDENTE',
                tentativas = 0,
                criado_em = NOW(),
                processado_em = NULL,
                erro_mensagem = NULL
            RETURNING id, titulo_id, id_firebird, nosso_numero, valor_pago, status;
        `, params);

        logger.info('[Sync] Quitações reenfileiradas com sucesso', { tenantId, count: queryResult.rows.length });
        return res.json({ success: true, count: queryResult.rows.length, rows: queryResult.rows });
    } catch (err) {
        logger.error('[Sync] Erro ao reenfileirar quitações:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/sync/quitacoes
 * Retorna todos os títulos quitados no período com data_pagamento e valor_pago para o ERP Coliseu.
 */
router.get('/quitacoes', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    const startDate = req.query.startDate || req.query.start_date || '';
    const endDate = req.query.endDate || req.query.end_date || '';

    try {
        let sql = `
            SELECT id, id_firebird, nosso_numero, numero_documento, valor, valor_pago, data_pagamento, status_pagamento, cliente_id_firebird
            FROM dash_financeiro
            WHERE LOWER(tenant_id::text) = LOWER($1::text)
              AND status_pagamento = 'PAGO'
              AND id_firebird IS NOT NULL
        `;
        const params = [String(tenantId)];

        if (startDate) {
            params.push(startDate);
            sql += ` AND data_pagamento >= $${params.length}::timestamptz`;
        }
        if (endDate) {
            params.push(endDate + ' 23:59:59');
            sql += ` AND data_pagamento <= $${params.length}::timestamptz`;
        }

        sql += ` ORDER BY data_pagamento DESC LIMIT 1000`;

        const { rows } = await db.query(sql, params);
        return res.json({ quitacoes: rows, count: rows.length });
    } catch (err) {
        logger.error('[Sync] Erro ao buscar quitações:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar quitações' });
    }
});

/**
 * GET /api/sync/pending-operations
 * Retorna operações pendentes do Nexus (Lançamentos de Títulos, Alterações/Boletos)
 * para o Worker sincronizar no ERP Coliseu (Firebird).
 */
router.get('/pending-operations', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    try {
        const { rows } = await db.query(`
            SELECT id, tabela, operacao, payload, status, created_at
            FROM dash_sync_metadata
            WHERE LOWER(tenant_id::text) = LOWER($1::text)
              AND status = 'PENDENTE'
              AND tabela IN ('LANCTO_FINANCEIRO', 'ALTERACAO_TITULO', 'CLIENTES')
            ORDER BY created_at ASC
            LIMIT 100
        `, [String(tenantId)]);

        return res.json({ operations: rows, count: rows.length });
    } catch (err) {
        logger.error('[Sync] Erro ao buscar pending-operations:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar operações pendentes' });
    }
});

/**
 * POST /api/sync/confirm-operation
 * O Worker confirma o processamento no ERP Firebird da operação do Nexus.
 * Body: { id: number, id_firebird?: number, success: boolean, error?: string }
 */
router.post('/confirm-operation', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    const id = req.body?.id || req.body?.sync_id || req.body?.id_operacao;
    const id_firebird = req.body?.id_firebird || req.body?.idFirebird || req.body?.codigo_firebird;
    const success = req.body?.success === true || String(req.body?.status || '').toUpperCase() === 'PROCESSADO' || String(req.body?.status || '').toUpperCase() === 'OK';
    const error = req.body?.error || req.body?.mensagem || req.body?.erro;

    if (!id) return res.status(400).json({ error: 'id ou sync_id é obrigatório.' });

    try {
        if (success) {
            const metaRes = await db.query(
                `UPDATE dash_sync_metadata
                 SET status = 'CONCLUIDO', erro_mensagem = NULL
                 WHERE id = $1 AND LOWER(tenant_id::text) = LOWER($2::text)
                 RETURNING tabela, payload`,
                [parseInt(id, 10), String(tenantId)]
            );

            if (id_firebird && metaRes.rows.length > 0) {
                const tabela = String(metaRes.rows[0].tabela || '').toUpperCase();
                const payload = metaRes.rows[0].payload || {};
                const nexusId = payload.id_nexus;
                const fbIdInt = parseInt(id_firebird, 10);

                if (nexusId && !isNaN(fbIdInt)) {
                    if (tabela === 'CLIENTES' || tabela === 'DASH_CLIENTES') {
                        await db.query(
                            `DELETE FROM dash_clientes WHERE id_firebird = $1 AND id != $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                            [fbIdInt, parseInt(nexusId, 10), String(tenantId)]
                        ).catch(() => {});

                        await db.query(
                            `UPDATE dash_clientes SET id_firebird = $1 WHERE id = $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                            [fbIdInt, parseInt(nexusId, 10), String(tenantId)]
                        ).catch((err) => {
                            logger.warn(`[Sync] Falha ao atualizar id_firebird em dash_clientes:`, err.message);
                        });
                    } else if (tabela === 'LANCTO_FINANCEIRO' || tabela === 'ALTERACAO_TITULO' || tabela === 'DASH_FINANCEIRO') {
                        await db.query(
                            `DELETE FROM dash_financeiro WHERE id_firebird = $1 AND id != $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                            [fbIdInt, parseInt(nexusId, 10), String(tenantId)]
                        ).catch(() => {});

                        await db.query(
                            `UPDATE dash_financeiro SET id_firebird = $1 WHERE id = $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                            [fbIdInt, parseInt(nexusId, 10), String(tenantId)]
                        ).catch((err) => {
                            logger.warn(`[Sync] Falha ao atualizar id_firebird em dash_financeiro:`, err.message);
                        });
                    }
                }
            }
        } else {
            await db.query(
                `UPDATE dash_sync_metadata SET status = 'ERRO', erro_mensagem = $1 WHERE id = $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
                [error || 'Erro ao aplicar no ERP', parseInt(id, 10), String(tenantId)]
            );
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao confirmar operação' });
    }
});

/**
 * GET /api/sync/boletos-emitidos
 * Retorna todos os boletos emitidos no Nexus/Asaas com Nosso Número, Linha Digitável e URL
 * para o Worker atualizar no ERP Coliseu (Firebird).
 */
router.get('/boletos-emitidos', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    try {
        const { rows } = await db.query(`
            SELECT id, id_firebird, nosso_numero, numero_documento, valor, data_vencimento, 
                   asaas_payment_id, asaas_bank_slip_url, asaas_linha_digitavel, asaas_bar_code, status_pagamento
            FROM dash_financeiro
            WHERE LOWER(tenant_id::text) = LOWER($1::text)
              AND nosso_numero IS NOT NULL
              AND TRIM(nosso_numero) != ''
              AND nosso_numero != '—'
            ORDER BY id DESC
            LIMIT 500
        `, [String(tenantId)]);

        return res.json({ boletos: rows, count: rows.length });
    } catch (err) {
        logger.error('[Sync] Erro ao buscar boletos emitidos:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar boletos emitidos' });
    }
});

/**
 * GET /api/sync/titulos-nexus
 * Retorna os títulos criados diretamente no Nexus (sem id_firebird) 
 * para o Worker cadastrar no ERP Coliseu (Firebird).
 */
router.get('/titulos-nexus', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    try {
        const { rows } = await db.query(`
            SELECT f.id AS id_nexus, f.tipo, f.descricao, f.valor, f.data_emissao, f.data_vencimento,
                   f.cliente_id_firebird, f.cliente_nome, f.cliente_documento, f.nosso_numero, f.numero_documento, f.status_pagamento
            FROM dash_financeiro f
            WHERE LOWER(f.tenant_id::text) = LOWER($1::text)
              AND (f.id_firebird IS NULL OR f.id_firebird <= 1)
            ORDER BY f.id ASC
            LIMIT 100
        `, [String(tenantId)]);

        return res.json({ titulos: rows, count: rows.length });
    } catch (err) {
        logger.error('[Sync] Erro ao buscar titulos do Nexus:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar títulos' });
    }
});

/**
 * POST /api/sync/confirm-titulo-link
 * Vincula o id_firebird gerado no ERP Coliseu a um título lançado originalmente no Nexus.
 * Body: { id_nexus: number, id_firebird: number }
 */
router.post('/confirm-titulo-link', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    const { id_nexus, id_firebird } = req.body || {};

    if (!id_nexus || !id_firebird) {
        return res.status(400).json({ error: 'id_nexus e id_firebird são obrigatórios.' });
    }

    try {
        await db.query(
            `UPDATE dash_financeiro 
             SET id_firebird = $1 
             WHERE id = $2 AND LOWER(tenant_id::text) = LOWER($3::text)`,
            [parseInt(id_firebird, 10), parseInt(id_nexus, 10), String(tenantId)]
        );
        return res.json({ success: true, message: `Título Nexus #${id_nexus} vinculado ao Firebird #${id_firebird}` });
    } catch (err) {
        logger.error('[Sync] Erro ao vincular título Nexus ao Firebird:', err.message);
        return res.status(500).json({ error: 'Erro ao vincular título' });
    }
});

/**
 * GET /api/sync/sync-cora
 * Dispara sincronização de boletos quitados no Banco Cora para a fila pending_payments.
 */
router.get('/sync-cora', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Tenant específico obrigatório.' });
    }
    const { tenantId } = scope;
    try {
        const CoraService = require('../services/CoraService');
        const result = await CoraService.sincronizarFaturasCora(tenantId);
        return res.json({ success: true, tenantId, ...result });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/sync/pending-payment-check
 * Consulta o status de quitações na fila pending_payments (parametrizado e isolado por tenant).
 */
router.get('/pending-payment-check', async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope) {
        return res.status(401).json({ error: 'Tenant não autenticado.' });
    }
    const { id_firebird, nosso_numero, id, status, limit, hoje } = req.query;
    try {
        const params = [String(scope.tenantId), scope.allowAllTenants];
        let cond = `($2::boolean = true OR LOWER(p.tenant_id::text) = LOWER($1::text))`;

        if (id_firebird !== undefined && id_firebird !== '') {
            const parsed = parseInt(id_firebird, 10);
            if (!isNaN(parsed)) {
                params.push(parsed);
                cond += ` AND p.id_firebird = $${params.length}`;
            }
        }
        if (nosso_numero !== undefined && String(nosso_numero).trim() !== '') {
            params.push(String(nosso_numero).trim());
            cond += ` AND p.nosso_numero = $${params.length}`;
        }
        if (id !== undefined && id !== '') {
            const parsedId = parseInt(id, 10);
            if (!isNaN(parsedId)) {
                params.push(parsedId);
                cond += ` AND p.id = $${params.length}`;
            }
        }
        if (status !== undefined && String(status).trim() !== '') {
            params.push(String(status).trim().toUpperCase());
            cond += ` AND p.status = $${params.length}`;
        }
        if (hoje) {
            cond += ` AND (DATE(p.processado_em) = CURRENT_DATE OR DATE(p.data_pagamento) = CURRENT_DATE OR p.processado_em >= NOW() - INTERVAL '24 hours')`;
        }

        const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
        params.push(lim);

        const { rows } = await db.query(`
            SELECT 
                p.id, 
                p.titulo_id, 
                p.id_firebird, 
                p.nosso_numero, 
                p.numero_documento, 
                p.valor_pago, 
                p.data_pagamento, 
                p.forma_pagamento,
                p.status, 
                p.processado_em,
                f.cliente_nome,
                f.descricao,
                f.tipo
            FROM pending_payments p
            LEFT JOIN dash_financeiro f ON f.id = p.titulo_id AND f.tenant_id = p.tenant_id
            WHERE ${cond} 
            ORDER BY p.processado_em DESC NULLS LAST, p.id DESC 
            LIMIT $${params.length}
        `, params);
        return res.json({ count: rows.length, rows });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/sync/financeiro-check
 * Diagnóstico de títulos no dash_financeiro (parametrizado e isolado por tenant).
 */
router.get('/financeiro-check', requireAdmin, async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope) {
        return res.status(401).json({ error: 'Tenant não autenticado.' });
    }
    const { id_firebird, cliente_id, cliente_id_firebird, search, limit } = req.query;
    try {
        const params = [String(scope.tenantId), scope.allowAllTenants];
        let cond = `($2::boolean = true OR LOWER(f.tenant_id::text) = LOWER($1::text))`;

        if (id_firebird !== undefined && id_firebird !== '') {
            const parsed = parseInt(id_firebird, 10);
            if (!isNaN(parsed)) {
                params.push(parsed);
                cond += ` AND f.id_firebird = $${params.length}`;
            }
        }
        if (cliente_id !== undefined && cliente_id !== '') {
            const parsed = parseInt(cliente_id, 10);
            if (!isNaN(parsed)) {
                params.push(parsed);
                cond += ` AND f.cliente_id = $${params.length}`;
            }
        }
        if (cliente_id_firebird !== undefined && cliente_id_firebird !== '') {
            const parsed = parseInt(cliente_id_firebird, 10);
            if (!isNaN(parsed)) {
                params.push(parsed);
                cond += ` AND (f.cliente_id_firebird = $${params.length} OR f.fornecedor_id_firebird = $${params.length})`;
            }
        }
        if (search !== undefined && String(search).trim() !== '') {
            params.push(`%${String(search).trim()}%`);
            cond += ` AND (f.cliente_nome ILIKE $${params.length} OR f.descricao ILIKE $${params.length})`;
        }

        const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
        params.push(lim);

        const { rows } = await db.query(`
            SELECT f.id, f.id_firebird, f.cliente_id, f.cliente_id_firebird, f.fornecedor_id_firebird, f.cliente_nome, f.descricao, f.valor, f.valor_pago, f.status_pagamento, f.data_vencimento, f.data_emissao,
                   c.id AS dash_cliente_id, c.id_firebird AS dash_cliente_id_firebird, c.nome AS dash_cliente_nome
            FROM dash_financeiro f
            LEFT JOIN dash_clientes c ON c.id = f.cliente_id AND c.tenant_id = f.tenant_id
            WHERE ${cond}
            ORDER BY f.id DESC
            LIMIT $${params.length}
        `, params);

        return res.json({ count: rows.length, rows });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.get('/clientes-diag', requireAdmin, async (req, res) => {
    const scope = resolveAuthenticatedTenant(req);
    if (!scope || scope.allowAllTenants) {
        return res.status(400).json({ error: 'Informe um tenant válido autenticado.' });
    }
    const tenantId = scope.tenantId;
    const fornecCond = "(c.tipo_cliente ILIKE '%FORNECEDOR%' OR c.classificacao ILIKE '%FORNECEDOR%' OR c.classe ILIKE '%FORNECEDOR%' OR c.nome ILIKE 'BANCO %' OR c.nome ILIKE '%BRADESCO%' OR c.nome ILIKE '%SANTANDER%' OR c.nome ILIKE '%ENERGISA%' OR c.nome ILIKE '%SANESUL%')";
    const base = 'LOWER(c.tenant_id::text) = LOWER($1::text) AND c.ativo = true';
    const [all, cli, forn] = await Promise.all([
        db.query('SELECT COUNT(*)::int as t FROM dash_clientes c WHERE ' + base, [tenantId]).catch((e) => ({ rows: [{ t: 'ERR:' + e.message }] })),
        db.query('SELECT COUNT(*)::int as t FROM dash_clientes c WHERE ' + base + ' AND NOT ' + fornecCond, [tenantId]).catch((e) => ({ rows: [{ t: 'ERR:' + e.message }] })),
        db.query('SELECT COUNT(*)::int as t FROM dash_clientes c WHERE ' + base + ' AND ' + fornecCond, [tenantId]).catch((e) => ({ rows: [{ t: 'ERR:' + e.message }] })),
    ]);
    return res.json({ tenant_id: tenantId, total_all: all.rows[0]?.t, total_clientes: cli.rows[0]?.t, total_fornecedores: forn.rows[0]?.t });
});

/**
 * Endpoint primário de ingestão (Usado pelo Worker .NET).
 * Payload: { tabela: "dash_clientes", rows: [...] }
 * Header obriga: X-Internal-Key e X-Tenant-Id
 */
router.post('/:tabela', async (req, res) => {
    // Resolve alias (ex: 'cargas'/'notas' -> 'dash_cargas', 'customers' -> 'dash_clientes')
    const rawTabela = String(req.params.tabela || '').trim().toLowerCase();
    const tabela = ALIAS_MAP[rawTabela] || rawTabela;

    const body = req.body || [];
    // Suporta: array direto, { rows: [] }, { customers: [] }, { financials: [] } etc.
    let rows;
    if (Array.isArray(body)) {
        rows = body;
    } else if (Array.isArray(body.rows)) {
        rows = body.rows;
    } else {
        // Tenta pegar o primeiro array encontrado no body (ex: body.customers, body.financials)
        const firstArrayKey = Object.keys(body).find(k => Array.isArray(body[k]));
        rows = firstArrayKey ? body[firstArrayKey] : [];
    }

    if (!TABELAS_MAP[tabela]) {
        return res.status(400).json({ error: `Tabela inválida ou não suportada: ${rawTabela} (resolvido: ${tabela})` });
    }

    if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Payload rows deve ser um array' });
    }

    const { id: tenantId } = req.tenant;
    const allowedColumns = TABELAS_MAP[tabela];
    let inserted = 0;
    const errors = [];

    const getConflictKey = (tbl) => {
        if (tbl === 'dash_filiais') return 'depto_id';
        if (tbl === 'dash_estatisticas_software') return 'cliente_id_firebird';
        if (tbl === 'dash_cargas') return 'chave_acesso';
        if (tbl === 'dash_veiculos') return 'placa';
        if (tbl === 'dash_motoristas') return 'cpf';
        return 'id_firebird';
    };

    // Pegamos um client único para aproveitar mesma conexão para o loop/batch
    const client = await db.pool.connect();

    try {
        if (tabela === 'dash_vendas') {
            await client.query(`ALTER TABLE dash_vendas ADD COLUMN IF NOT EXISTS chave_nfe VARCHAR(44)`).catch(() => {});
        } else if (tabela === 'dash_vendas_itens') {
            await client.query(`
                ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS desconto_item NUMERIC(15,2) DEFAULT 0;
                ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS cfop VARCHAR(10);
                ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS numero_nota VARCHAR(30);
                ALTER TABLE dash_vendas_itens ADD COLUMN IF NOT EXISTS chave_nfe VARCHAR(44);
            `).catch(() => {});
        } else if (tabela === 'dash_cargas') {
            await client.query(`
                CREATE TABLE IF NOT EXISTS dash_cargas (
                    id SERIAL PRIMARY KEY,
                    tenant_id UUID NOT NULL,
                    id_firebird INTEGER,
                    tipo_documento VARCHAR(10) DEFAULT 'NFE',
                    chave_acesso VARCHAR(44) NOT NULL,
                    numero VARCHAR(20),
                    serie VARCHAR(5),
                    data_emissao DATE,
                    remetente_documento VARCHAR(20),
                    remetente_nome VARCHAR(200),
                    remetente_municipio VARCHAR(100),
                    remetente_uf VARCHAR(2),
                    destinatario_documento VARCHAR(20),
                    destinatario_nome VARCHAR(200),
                    destinatario_municipio VARCHAR(100),
                    destinatario_uf VARCHAR(2),
                    valor_total NUMERIC(15,2) DEFAULT 0,
                    valor_produtos NUMERIC(15,2) DEFAULT 0,
                    peso_bruto NUMERIC(15,4) DEFAULT 0,
                    peso_liquido NUMERIC(15,4) DEFAULT 0,
                    volume_m3 NUMERIC(15,4) DEFAULT 0,
                    volumes INTEGER DEFAULT 1,
                    especie VARCHAR(60) DEFAULT 'VOLUMES',
                    produto_predominante VARCHAR(200),
                    status VARCHAR(30) DEFAULT 'PENDENTE',
                    cte_id INTEGER,
                    mdfe_id INTEGER,
                    dados_nfe JSONB,
                    sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(tenant_id, chave_acesso)
                );
            `).catch(() => {});
        }

        await client.query('BEGIN');

        for (const rawRow of rows) {
            let row = {};
            try {
                // Normalize keys to lowercase to handle Firebird UPPERCASE aliases
                for (const key in rawRow) {
                    row[key.toLowerCase()] = rawRow[key];
                }

                // Normalização prévia de chaves primárias e aliases para tabelas com nomes específicos do Firebird
                if (tabela === 'dash_estatisticas_software' && !row.cliente_id_firebird) {
                    row.cliente_id_firebird = row.id_firebird || row.cod_cliente || row.cliente_id || row.id_cliente || row.codcliente || row.id;
                } else if (tabela === 'dash_cargas') {
                    normalizarCargaErpRow(row);
                    if (!row.chave_acesso || String(row.chave_acesso).replace(/\D/g, '').length !== 44) {
                        errors.push('Row sem chave_acesso de 44 dígitos válida: NF-e ignorada');
                        continue;
                    }
                } else if (tabela === 'dash_veiculos') {
                    normalizarVeiculoErpRow(row);
                } else if (tabela === 'dash_motoristas') {
                    normalizarMotoristaErpRow(row);
                }

                // Guarda: valida chave primária obrigatória
                const conflictKeyCheck = getConflictKey(tabela);
                const pkVal = row[conflictKeyCheck];
                if (pkVal === null || pkVal === undefined || pkVal === '') {
                    errors.push(`Row sem ${conflictKeyCheck}: dados inválidos ignorados`);
                    continue;
                }

                if (tabela === 'dash_estatisticas_software') {
                    if (!row.certificado_vencimento) {
                        row.certificado_vencimento = row.venc_certificado || row.vencimento_certificado || row.data_certificado || row.cert_venc;
                    }
                    if (!row.versao_software) {
                        row.versao_software = row.versao || row.sistema || row.software;
                    }
                    if (!row.versao_atualizacao) {
                        row.versao_atualizacao = row.build || row.versao_build || row.atualizacao;
                    }
                    const modKeys = [
                        'usa_nfe', 'usa_nfce', 'usa_nfse', 'usa_mdfe', 'usa_cte', 'usa_sped',
                        'usa_boleto', 'usa_folha', 'usa_whats', 'usa_pix', 'usa_cobranca',
                        'usa_pontuacao', 'usa_os', 'usa_sales', 'usa_dash', 'usa_coletor'
                    ];
                    for (const mk of modKeys) {
                        if (row[mk] !== undefined && row[mk] !== null) {
                            const valStr = String(row[mk]).trim().toUpperCase();
                            row[mk] = (valStr === '1' || valStr === 'S' || valStr === 'SIM' || valStr === 'TRUE') ? 'SIM' : 'NÃO';
                        }
                    }
                }

                if (tabela === 'dash_vendas') {
                    const status = row['status'] ? String(row['status']).trim().toUpperCase() : '';
                    const dataHoraProc = row['data_hora_proc'];
                    const dataVencimento = row['data_vencimento'];
                    
                    const isFaturado = ['FATURADO', 'FINALIZADO', 'PROCESSADO'].includes(status);
                    const faturamentoDate = (dataHoraProc && dataHoraProc !== '') ? dataHoraProc : (dataVencimento && dataVencimento !== '' ? dataVencimento : row['data_venda']);
                    const hasFaturamentoDate = faturamentoDate !== undefined && faturamentoDate !== null && faturamentoDate !== '';
                    
                    if (status === 'CANCELADO' || !isFaturado || !hasFaturamentoDate) {
                        // Deleta a venda e seus itens associados se não for válida ou for cancelada
                        await client.query(`SAVEPOINT delete_save`);
                        try {
                            await client.query(
                                `DELETE FROM dash_vendas_itens WHERE tenant_id = $1 AND venda_id_firebird = $2`,
                                [tenantId, pkVal]
                            );
                            await client.query(
                                `DELETE FROM dash_vendas WHERE tenant_id = $1 AND id_firebird = $2`,
                                [tenantId, pkVal]
                            );
                            await client.query(`RELEASE SAVEPOINT delete_save`);
                        } catch (delErr) {
                            await client.query(`ROLLBACK TO SAVEPOINT delete_save`);
                            logger.error('[Sync] Falha ao deletar venda invalida/cancelada', { error: delErr.message, tenantId, vendaId: pkVal });
                        }
                        // Não insere/atualiza este registro
                        continue;
                    }
                    
                    // Alinhamento de Faturamento: usa data_hora_proc ou data_vencimento como data_venda principal
                    row['data_venda'] = faturamentoDate;

                    // Ajustar valor_total no Postgres para ser bruto (total + desconto)
                    // para manter a consistência com as consultas do dashboard que subtraem valor_desconto.
                    if (row['valor_total'] !== undefined && row['valor_total'] !== null) {
                        let total = parseFloat(row['valor_total']) || 0;
                        let desc = parseFloat(row['valor_desconto']) || 0;
                        let custo = parseFloat(row['valor_custo']) || 0;

                        const isDevolucao = parseInt(row['es']) === 2 || parseInt(row['processo']) === 2;
                        if (isDevolucao) {
                            total = -Math.abs(total);
                            desc = Math.abs(desc); // Treat return discount as positive per user request
                            custo = -Math.abs(custo);
                        }

                        row['valor_total'] = total + desc;
                        row['valor_desconto'] = desc;
                        row['valor_custo'] = custo;
                    }
                }

                if (tabela === 'dash_vendas_itens') {
                    const parentVendaId = row['venda_id_firebird'];
                    const saleCheck = await client.query(
                        `SELECT id_firebird FROM dash_vendas WHERE tenant_id = $1 AND id_firebird = $2`,
                        [tenantId, parentVendaId]
                    );
                    if (saleCheck.rowCount === 0) {
                        // Descarte de itens de vendas sem cabeçalho faturado correspondente
                        continue;
                    }
                }

                if (tabela === 'dash_clientes') {
                    if (!row.id_firebird && (row.id || row.id_cliente || row.codigo || row.cod_cliente)) {
                        row.id_firebird = row.id || row.id_cliente || row.codigo || row.cod_cliente;
                    }
                    if (!row.nome && (row.razao_social || row.razaosocial || row.cliente)) {
                        row.nome = row.razao_social || row.razaosocial || row.cliente;
                    }
                    if (!row.razao_social) {
                        row.razao_social = row.nome;
                    }
                    // NOME_FANTASIA: A VIEW Firebird exporta como "fantasia" (alias de c.NOME_FANTASIA)
                    if (!row.nome_fantasia) {
                        row.nome_fantasia = row.fantasia || row.nomefantasia || row.nome_comercial || row.fantasia_cliente || row.apelido;
                    }
                    // Não fallback para row.nome aqui — se não tem fantasia, deixa null em vez de duplicar razão social
                    if (!row.documento) {
                        row.documento = row.cnpj || row.cpf || row.cpf_cnpj || row.cnpj_cpf || row.cgc || row.doc;
                    }
                    // EMAIL: A VIEW Firebird exporta como "email" (alias de c.EMAIL = Email Principal)
                    // Múltiplos emails separados por ; devem ser preservados integralmente
                    if (!row.email) {
                        row.email = row.e_mail || row.email_principal || row.emailprincipal || row.email_cli || row.email_comercial || row.email_contato;
                    }
                    // EMAIL_FINANCEIRO: A VIEW Firebird exporta como "email2" (alias de c.EMAILF)
                    if (!row.email_financeiro) {
                        row.email_financeiro = row.email2 || row.emailf || row.emailfinanceiro || row.email_fatura || row.email_financ || row.email_cobranca || row.email_finan || row.email_financeiro_cobranca;
                    }
                    // Se não há email principal mas tem financeiro, usa financeiro como principal
                    if (!row.email && row.email_financeiro) {
                        row.email = row.email_financeiro;
                    }
                    if (!row.telefone) {
                        row.telefone = row.fone || row.fone_comercial || row.tel || row.telefone1 || row.fone1 || row.telefone_principal || row.fone_res;
                    }
                    if (!row.celular_secundario) {
                        row.celular = row.celular || row.whats || row.whatsapp || row.fone2 || row.telefone2 || row.cel;
                        row.celular_secundario = row.celular;
                    }
                    // ENDERECO_COMPLETO: A VIEW Firebird exporta endereco, numero, bairro, complemento, cep separados
                    if (!row.endereco_completo) {
                        const parts = [
                            row.endereco || row.logradouro || row.end || row.rua,
                            row.numero ? `Nº ${row.numero}` : null,
                            row.bairro,
                            row.complemento,
                            row.cep ? `CEP ${row.cep}` : null
                        ].filter(p => p && String(p).trim());
                        if (parts.length > 0) {
                            row.endereco_completo = parts.join(', ');
                        }
                    }
                    if (!row.cidade) {
                        row.cidade = row.municipio || row.cid;
                    }
                    if (!row.estado) {
                        row.estado = row.uf;
                    }
                    if (!row.responsavel_nome) {
                        row.responsavel_nome = row.responsavel || row.contato || row.contato_nome;
                    }
                    if (!row.responsavel_rg) {
                        row.responsavel_rg = row.responsavelrg || row.rg;
                    }
                    if (!row.responsavel_cpf) {
                        row.responsavel_cpf = row.responsavelcpf || row.cpf || row.cpf_responsavel;
                    }
                    if (!row.regime_tributario) {
                        row.regime_tributario = row.regime || row.regime_trib;
                    }

                    // Anti-duplicação: Se o cliente veio do Firebird com id_firebird e CPF/CNPJ,
                    // e no Nexus já existe um cliente com mesmo CPF/CNPJ sem id_firebird, vincula-o!
                    if (row.id_firebird && row.documento) {
                        const docDigits = String(row.documento).replace(/\D/g, '');
                        if (docDigits.length >= 11) {
                            await client.query(`
                                UPDATE dash_clientes 
                                SET id_firebird = $1 
                                WHERE tenant_id = $2 
                                  AND id_firebird IS NULL 
                                  AND REGEXP_REPLACE(COALESCE(documento, ''), '\\D', '', 'g') = $3
                            `, [parseInt(row.id_firebird, 10), tenantId, docDigits]).catch(() => {});
                        }
                    }
                }

                if (tabela === 'dash_financeiro') {
                    if (row.status && !row.status_pagamento) {
                        row.status_pagamento = row.status;
                    }
                    const st = String(row.status_pagamento || '').trim().toUpperCase();
                    if (['CANCELADO', 'CANCELADA', 'CANCEL', 'CAN', 'ESTORNADO', 'ESTORNADA', 'EXCLUIDO', 'EXCLUIDA', 'ANULADO', 'ANULADA', 'INATIVO', 'C'].includes(st) || st.includes('CANCEL') || st.includes('ESTORN')) {
                        row.status_pagamento = 'CANCELADO';
                    }

                    // Anti-duplicação de títulos originados no Nexus:
                    // Se o título chegou do Firebird com id_firebird, verifica se já existe na base.
                    // Se NÃO existe id_firebird cadastrado, verifica se há algum título criado localmente no Nexus
                    // com mesmo valor, vencimento e cliente para vincular e NÃO criar duplicata!
                    if (row.id_firebird) {
                        const checkExists = await client.query(
                            `SELECT id FROM dash_financeiro WHERE tenant_id = $1 AND id_firebird = $2 LIMIT 1`,
                            [tenantId, parseInt(row.id_firebird, 10)]
                        );
                        if (checkExists.rowCount === 0) {
                            const valNum = parseFloat(row.valor) || 0;
                            const dtVenc = row.data_vencimento ? String(row.data_vencimento).substring(0, 10) : null;
                            const cliFb = parseInt(row.cliente_id_firebird, 10) || null;

                            if (cliFb && dtVenc && valNum > 0) {
                                const matchRes = await client.query(`
                                    SELECT id FROM dash_financeiro 
                                    WHERE tenant_id = $1 
                                      AND id_firebird IS NULL 
                                      AND (cliente_id_firebird = $2 OR cliente_id IN (SELECT id FROM dash_clientes WHERE tenant_id = $1 AND id_firebird = $2))
                                      AND ABS(valor - $3) < 0.01 
                                      AND data_vencimento = $4
                                    ORDER BY id DESC LIMIT 1
                                `, [tenantId, cliFb, valNum, dtVenc]).catch(() => ({ rowCount: 0, rows: [] }));

                                if (matchRes.rowCount > 0) {
                                    const nexusId = matchRes.rows[0].id;
                                    await client.query(
                                        `UPDATE dash_financeiro SET id_firebird = $1 WHERE id = $2 AND tenant_id = $3`,
                                        [parseInt(row.id_firebird, 10), nexusId, tenantId]
                                    ).catch(() => {});

                                    await client.query(`
                                        UPDATE dash_sync_metadata 
                                        SET status = 'CONCLUIDO' 
                                        WHERE tenant_id = $1 
                                          AND tabela = 'LANCTO_FINANCEIRO' 
                                          AND status = 'PENDENTE' 
                                          AND (payload->>'id_nexus')::int = $2
                                    `, [tenantId, nexusId]).catch(() => {});
                                }
                            }
                        }
                    }
                }

                // Filtra apenas colunas mapeadas e presentes
                const usedCols = allowedColumns.filter(c => Object.prototype.hasOwnProperty.call(row, c) && row[c] !== undefined);
                if (usedCols.length === 0) continue;

                // Adiciona o tenantId nas colunas a inserir
                const insertCols = ['tenant_id', ...usedCols];
                const insertValues = [tenantId, ...usedCols.map(c => {
                    let val = row[c];
                    if (val === '') return null;
                    if (c === 'ativo') return val == 1 || String(val).toLowerCase() === 'true';
                    if (c === 'dados_nfe' && val && typeof val === 'object') return JSON.stringify(val);
                    
                    // Force client textual fields to uppercase
                    const textFields = [
                        'nome', 'nome_fantasia', 'razao_social', 'cidade', 'estado', 'classificacao', 'responsavel_nome', 
                        'regime_tributario', 'endereco_completo', 'tipo_cliente', 'observacoes'
                    ];
                    if (tabela === 'dash_clientes' && textFields.includes(c) && typeof val === 'string') {
                        return val.toUpperCase();
                    }
                    
                    return val;
                })];
                
                // Geração posicional para o Pg (ex: $1, $2, $3)
                const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');

                const conflictKey = getConflictKey(tabela);

                // Regra de conflito: Atualiza todos os campos menos conflictKey e tenant_id
                let updateSet = '';
                if (tabela === 'dash_vendas') {
                    updateSet = usedCols
                        .filter(c => c !== conflictKey)
                        .map(c => {
                            if (c === 'data_vencimento') {
                                return `data_vencimento = COALESCE(EXCLUDED.data_vencimento, dash_vendas.data_vencimento)`;
                            }
                            if (c === 'data_venda') {
                                return `data_venda = COALESCE(EXCLUDED.data_vencimento, dash_vendas.data_vencimento, EXCLUDED.data_venda, dash_vendas.data_venda)`;
                            }
                            return `${c} = EXCLUDED.${c}`;
                        })
                        .join(', ');
                } else if (tabela === 'dash_financeiro') {
                    updateSet = usedCols
                        .filter(c => c !== conflictKey)
                        .map(c => {
                            if (c === 'status_pagamento') {
                                return `status_pagamento = CASE 
                                    WHEN dash_financeiro.status_pagamento IN ('PAGO', 'CONCLUIDO', 'QUITADO') AND EXCLUDED.status_pagamento NOT IN ('PAGO', 'CONCLUIDO', 'QUITADO') THEN dash_financeiro.status_pagamento 
                                    ELSE EXCLUDED.status_pagamento 
                                END`;
                            }
                            return `${c} = EXCLUDED.${c}`;
                        })
                        .join(', ');
                } else if (tabela === 'dash_clientes') {
                    updateSet = usedCols
                        .filter(c => c !== conflictKey)
                        .map(c => {
                            if (['email', 'email_financeiro', 'telefone', 'celular_secundario', 'observacoes'].includes(c)) {
                                return `${c} = COALESCE(EXCLUDED.${c}, dash_clientes.${c})`;
                            }
                            return `${c} = EXCLUDED.${c}`;
                        })
                        .join(', ');
                } else if (tabela === 'dash_cargas') {
                    updateSet = usedCols
                        .filter(c => c !== conflictKey)
                        .map(c => {
                            if (c === 'status') {
                                return `status = CASE
                                    WHEN EXCLUDED.status = 'CANCELADA' THEN 'CANCELADA'
                                    WHEN dash_cargas.status IN ('EM_CTE', 'EM_MDFE', 'DESPACHADA', 'CANCELADA') THEN dash_cargas.status
                                    ELSE COALESCE(EXCLUDED.status, dash_cargas.status, 'PENDENTE')
                                END`;
                            }
                            if (c === 'dados_nfe') {
                                return `dados_nfe = COALESCE(dash_cargas.dados_nfe, '{}'::jsonb) || COALESCE(EXCLUDED.dados_nfe, '{}'::jsonb)`;
                            }
                            if ([
                                'remetente_documento', 'remetente_nome', 'remetente_municipio', 'remetente_uf',
                                'destinatario_documento', 'destinatario_nome', 'destinatario_municipio', 'destinatario_uf',
                                'produto_predominante', 'especie'
                            ].includes(c)) {
                                return `${c} = COALESCE(EXCLUDED.${c}, dash_cargas.${c})`;
                            }
                            return `${c} = EXCLUDED.${c}`;
                        })
                        .join(', ');
                } else {
                    updateSet = usedCols
                        .filter(c => c !== conflictKey)
                        .map(c => `${c} = EXCLUDED.${c}`)
                        .join(', ');
                }

                let sql = `
                    INSERT INTO ${tabela} (${insertCols.join(', ')}, sincronizado_em)
                    VALUES (${placeholders}, NOW())
                `;

                if (updateSet.length > 0) {
                    sql += ` ON CONFLICT (tenant_id, ${conflictKey}) DO UPDATE SET ${updateSet}, sincronizado_em = NOW()`;
                } else {
                    sql += ` ON CONFLICT (tenant_id, ${conflictKey}) DO NOTHING`;
                }

                await client.query(`SAVEPOINT row_save`);
                try {
                    await client.query(sql, insertValues);
                    if (tabela === 'dash_cargas') {
                        const partesSync = [
                            row.dados_nfe?.remetente,
                            row.dados_nfe?.destinatario
                        ].filter(p => p && p.documento && p.razao_social);
                        for (const p of partesSync) {
                            await client.query(`SAVEPOINT parte_save`);
                            await client.query(
                                `INSERT INTO dash_partes (
                                    tenant_id, tipo_pessoa, documento, razao_social, inscricao_estadual,
                                    logradouro, numero, bairro, codigo_municipio, municipio, uf, cep, telefone, email
                                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                                ON CONFLICT (tenant_id, documento) DO UPDATE SET
                                    razao_social = COALESCE(EXCLUDED.razao_social, dash_partes.razao_social),
                                    inscricao_estadual = COALESCE(NULLIF(EXCLUDED.inscricao_estadual, ''), dash_partes.inscricao_estadual),
                                    logradouro = COALESCE(NULLIF(EXCLUDED.logradouro, ''), dash_partes.logradouro),
                                    numero = COALESCE(NULLIF(EXCLUDED.numero, ''), dash_partes.numero),
                                    bairro = COALESCE(NULLIF(EXCLUDED.bairro, ''), dash_partes.bairro),
                                    codigo_municipio = COALESCE(NULLIF(EXCLUDED.codigo_municipio, ''), dash_partes.codigo_municipio),
                                    municipio = COALESCE(NULLIF(EXCLUDED.municipio, ''), dash_partes.municipio),
                                    uf = COALESCE(NULLIF(EXCLUDED.uf, ''), dash_partes.uf),
                                    cep = COALESCE(NULLIF(EXCLUDED.cep, ''), dash_partes.cep),
                                    updated_at = NOW()`,
                                [
                                    tenantId,
                                    String(p.documento).length === 11 ? 'PF' : 'PJ',
                                    String(p.documento).slice(0, 14),
                                    String(p.razao_social).slice(0, 200),
                                    p.inscricao_estadual || null,
                                    p.logradouro || null,
                                    p.numero || null,
                                    p.bairro || null,
                                    p.codigo_municipio || null,
                                    p.municipio || null,
                                    p.uf || null,
                                    p.cep || null,
                                    p.telefone || null,
                                    p.email || null
                                ]
                            )
                                .then(() => client.query(`RELEASE SAVEPOINT parte_save`))
                                .catch(() => client.query(`ROLLBACK TO SAVEPOINT parte_save`));
                        }
                    }
                    await client.query(`RELEASE SAVEPOINT row_save`);
                    inserted++;
                } catch (rowErr) {
                    await client.query(`ROLLBACK TO SAVEPOINT row_save`);
                    throw rowErr; // re-lança para o catch externo da linha
                }
            } catch (err) {
                const conflictKey = getConflictKey(tabela);
                const idVal = row[conflictKey] || rawRow[conflictKey] || rawRow[conflictKey.toUpperCase()] || rawRow.ID_FIREBIRD || 'Unknown';
                errors.push(`Row ID ${idVal}: ${err.message}`);
                logger.error('[Sync] Falha em linha', { error: err.message, tenantId, rowId: idVal });
            }
        }

        // Registrar no metadata_sync (usando partial index WHERE operacao IS NULL para não conflitar com a fila de operações)
        await client.query(`
            INSERT INTO dash_sync_metadata (tenant_id, tabela, ultima_sincronizacao, registros_sincronizados, status, erro_mensagem)
            VALUES ($1, $2, NOW(), $3, $4, $5)
            ON CONFLICT (tenant_id, tabela) WHERE operacao IS NULL DO UPDATE SET 
                ultima_sincronizacao = NOW(),
                registros_sincronizados = $3,
                status = $4,
                erro_mensagem = $5
        `, [
            tenantId, 
            tabela, 
            inserted, 
            errors.length > 0 ? 'PARCIAL' : 'OK', 
            errors.length > 0 ? errors.slice(0, 3).join(' | ') : null
        ]);

        await client.query('COMMIT');

        // Pós-Processamento: Atualizar Cache e Materialized Views
        if (['dash_vendas', 'dash_vendas_itens', 'dash_financeiro'].includes(tabela)) {
            invalidateTenant(tenantId);
            
            // Tenta dar refresh na visão de forma assíncrona para não prender o Worker
            const viewName = tabela === 'dash_financeiro' ? 'mv_dash_financeiro_diario' : 'mv_dash_vendas_diario';
            db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`)
                .then(() => logger.info(`[Sync] Visão materializada ${viewName} atualizada com sucesso.`))
                .catch(err => {
                    // Se falhar por não ter índice único ainda ou tabela vazia, ignora graciosamente
                    if (err.code !== '42P01') {
                        logger.error(`[Sync] Erro ao atualizar visão ${viewName}:`, err.message);
                    }
                });
        }

    } catch (globalErr) {
        await client.query('ROLLBACK');
        logger.error('[Sync] Rollback batch sync', { error: globalErr.message, tenantId });
        return res.status(500).json({ error: 'Falha letal ao sincronizar batch', details: globalErr.message });
    } finally {
        client.release();
    }

    return res.status(200).json({
        tabela,
        recebidos: rows.length,
        aplicados: inserted,
        erros: errors.length,
        detalhes: errors.slice(0, 5)
    });
});

router.normalizarCargaErpRow = normalizarCargaErpRow;
router.normalizarVeiculoErpRow = normalizarVeiculoErpRow;
router.normalizarMotoristaErpRow = normalizarMotoristaErpRow;
router.ALIAS_MAP = ALIAS_MAP;
router.TABELAS_MAP = TABELAS_MAP;

module.exports = router;
