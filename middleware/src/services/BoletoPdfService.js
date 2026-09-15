const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

// Cache da logo Coliseu
let LOGO_PATH = '';
const candidatePaths = [
    path.resolve(__dirname, '../../../frontend/public/logo-nexus.png'),
    path.resolve(__dirname, '../../frontend/public/logo-nexus.png'),
    '/app/frontend/public/logo-nexus.png',
    '/app/public/logo-nexus.png'
];
for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
        LOGO_PATH = p;
        break;
    }
}

// Febraban ITF patterns
const ITF_PATTERNS = [
    '00110', // 0
    '10001', // 1
    '01001', // 2
    '11000', // 3
    '00101', // 4
    '10100', // 5
    '01100', // 6
    '00011', // 7
    '10010', // 8
    '01010'  // 9
];

/**
 * Desenha um código de barras ITF (Interleaved 2 of 5) diretamente no documento PDFKit.
 */
function drawItfBarcode(doc, digits, startX, startY, targetWidth = 360, height = 40) {
    const clean = String(digits || '').replace(/\D/g, '');
    if (clean.length % 2 !== 0 || clean.length === 0) return;

    // Calcula largura total em unidades
    let totalUnits = 4; // Start: 1+1+1+1
    for (let i = 0; i < clean.length; i += 2) {
        const d1 = parseInt(clean[i], 10);
        const d2 = parseInt(clean[i+1], 10);
        const p1 = ITF_PATTERNS[d1] || '00110';
        const p2 = ITF_PATTERNS[d2] || '00110';
        for (let j = 0; j < 5; j++) {
            totalUnits += (p1[j] === '1' ? 3 : 1);
            totalUnits += (p2[j] === '1' ? 3 : 1);
        }
    }
    totalUnits += 5; // Stop: 3+1+1

    const unitWidth = targetWidth / totalUnits;
    let currX = startX;

    doc.save();
    doc.fillColor('#0f172a');

    // Start pattern: bar(1), space(1), bar(1), space(1)
    doc.rect(currX, startY, unitWidth * 1, height).fill();
    currX += unitWidth * 2; // bar + space
    doc.rect(currX, startY, unitWidth * 1, height).fill();
    currX += unitWidth * 2; // bar + space

    for (let i = 0; i < clean.length; i += 2) {
        const d1 = parseInt(clean[i], 10);
        const d2 = parseInt(clean[i+1], 10);
        const p1 = ITF_PATTERNS[d1] || '00110';
        const p2 = ITF_PATTERNS[d2] || '00110';
        for (let j = 0; j < 5; j++) {
            const barW = (p1[j] === '1' ? 3 : 1) * unitWidth;
            doc.rect(currX, startY, barW, height).fill();
            currX += barW;
            const spcW = (p2[j] === '1' ? 3 : 1) * unitWidth;
            currX += spcW;
        }
    }

    // Stop pattern: bar(3), space(1), bar(1)
    doc.rect(currX, startY, unitWidth * 3, height).fill();
    currX += unitWidth * 4; // bar + space
    doc.rect(currX, startY, unitWidth * 1, height).fill();

    doc.restore();
}

function formatarDataBr(val) {
    if (!val) return '—';
    if (val instanceof Date) {
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${d}/${m}/${y}`;
    }
    const str = String(val).trim();
    if (!str || str === 'null' || str === 'undefined' || str === '—') return '—';
    const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) return `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
    const matchBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (matchBr) return `${matchBr[1]}/${matchBr[2]}/${matchBr[3]}`;
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        return `${d}/${m}/${y}`;
    }
    return str;
}

function formatLinhaDigitavel(str) {
    if (!str) return '';
    const clean = str.replace(/\D/g, '');
    if (clean.length === 47) {
        return `${clean.substring(0, 5)}.${clean.substring(5, 10)} ${clean.substring(10, 15)}.${clean.substring(15, 21)} ${clean.substring(21, 26)}.${clean.substring(26, 32)} ${clean.substring(32, 33)} ${clean.substring(33)}`;
    }
    return str;
}

class BoletoPdfService {
    /**
     * Gera um Buffer de PDF fiel ao layout oficial Coliseu / Febraban Cora.
     * @param {Object} dados - { empresa, cliente, titulo, cora }
     * @returns {Promise<Buffer>}
     */
    static async gerarBoletoPdf(dados) {
        const { cliente = {}, titulo = {}, cora = {} } = dados;

        // Dados do Beneficiário oficial Coliseu
        const razaoSocial = 'COLISEU TECNOLOGIA E CONSULTORIA LTDA';
        const nomeFantasia = 'Coliseu Sistemas';
        const cnpj = '47.147.790/0001-04';
        const endereco = 'Rua Pedro Celestino, 668, Centro';
        const cidade = 'Campo Grande';
        const estado = 'MS';
        const cep = '79002370';
        const telefone = '(67) 3423-2227 | (67) 3253-6236';
        const whatsapp = '(67) 99856-4972';
        const email = 'financeiro@coliseusistemas.com.br';
        const site = 'https://coliseusistemas.com.br/';

        // Dados do Pagador (Cliente) com endereço completo garantido
        const clienteNome = (cliente.nome || titulo.cliente_nome || 'Cliente').toUpperCase();
        const clienteDoc = cliente.documento || titulo.cliente_documento || '—';
        const clienteEndereco = (cliente.endereco_completo || cliente.endereco || titulo.cliente_endereco || '—').toUpperCase();

        const valorNum = parseFloat(titulo.valor || 0);
        const valorFormatado = valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const vencimentoFormatado = formatarDataBr(titulo.data_vencimento);
        const emissaoFormatada = formatarDataBr(titulo.data_emissao) !== '—' ? formatarDataBr(titulo.data_emissao) : new Date().toLocaleDateString('pt-BR');

        const rawLinhaDigitavel = cora.linhaDigitavel || titulo.asaas_linha_digitavel || titulo.linha_digitavel || '';
        const linhaDigitavel = formatLinhaDigitavel(rawLinhaDigitavel) || rawLinhaDigitavel;
        const rawBarCode = cora.barCode || titulo.asaas_bar_code || titulo.bar_code || '';
        const barCodeDigits = rawBarCode.replace(/\D/g, '') || rawLinhaDigitavel.replace(/\D/g, '');
        const numeroDocumento = String(titulo.id_firebird || titulo.id || '');
        const descricao = titulo.descricao || 'Cobrança Referente ao Sistema Coliseu';
        const multaPercentual = titulo.multa_percentual || 2.0;
        const jurosPercentual = titulo.juros_percentual || 1.0;
        const multaValor = ((valorNum * multaPercentual) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const pdfUrl = cora.pdfUrl || '';

        const pixCopiaECola = (cora.pixCopiaECola && String(cora.pixCopiaECola).trim() !== '') ? String(cora.pixCopiaECola).trim() : null;

        // Gera QR Code Pix em Buffer PNG se houver Pix EMV
        let qrCodeBuffer = null;
        if (pixCopiaECola) {
            try {
                qrCodeBuffer = await QRCode.toBuffer(pixCopiaECola, {
                    width: 250,
                    margin: 1,
                    color: {
                        dark: '#0f172a',
                        light: '#ffffff'
                    }
                });
            } catch (qrErr) {
                logger.warn('[BoletoPdfService] Falha ao gerar buffer do QR Code:', qrErr.message);
            }
        }

        return new Promise((resolve, reject) => {
            try {
                // A4 em pontos: 595.28 x 841.89
                const doc = new PDFDocument({
                    size: 'A4',
                    margins: { top: 22, bottom: 22, left: 30, right: 30 },
                    autoFirstPage: true,
                    info: {
                        Title: `Boleto Bancário - ${razaoSocial}`,
                        Author: nomeFantasia,
                        Subject: `Boleto N° ${numeroDocumento}`
                    }
                });

                const buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));
                doc.on('error', reject);

                const pageWidth = 595.28;
                const margin = 30;
                const contentWidth = pageWidth - (margin * 2); // 535.28

                let curY = 22;

                // 1. Saudação do cabeçalho
                doc.font('Helvetica-Bold').fontSize(11).fillColor('#334155');
                doc.text('Aqui está seu boleto.', margin, curY);
                curY += 15;

                // 2. Beneficiário (Logo Coliseu + Dados da empresa)
                if (LOGO_PATH && fs.existsSync(LOGO_PATH)) {
                    try {
                        doc.image(LOGO_PATH, margin, curY + 2, { width: 130, height: 42, fit: [130, 42] });
                    } catch (_) {
                        doc.font('Helvetica-Bold').fontSize(16).fillColor('#0284c7').text('COLISEU', margin, curY);
                    }
                } else {
                    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0284c7').text('COLISEU', margin, curY);
                }

                const infoLeft = margin + 140;
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(razaoSocial, infoLeft, curY);
                curY += 12;

                doc.font('Helvetica').fontSize(8).fillColor('#334155');
                doc.text(`CNPJ: ${cnpj}`, infoLeft, curY); curY += 10;
                doc.text(`${endereco}`, infoLeft, curY); curY += 10;
                doc.text(`${cidade} - ${estado} | CEP: ${cep}`, infoLeft, curY); curY += 10;
                doc.text(`Telefones: ${telefone} | WhatsApp: ${whatsapp}`, infoLeft, curY); curY += 10;
                doc.text(`E-mail: ${email} | Site: ${site}`, infoLeft, curY); curY += 14;

                // 3. Resumo em Cards (Vencimento, Valor, Multa/Juros)
                const cardY = curY;
                const cardGap = 8;
                const cardW1 = 145;
                const cardW2 = 145;
                const cardW3 = contentWidth - cardW1 - cardW2 - (cardGap * 2);
                const cardH = 40;

                // Card 1: Vencimento
                doc.roundedRect(margin, cardY, cardW1, cardH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text('VENCIMENTO', margin + 10, cardY + 6);
                doc.font('Helvetica-Bold').fontSize(13).fillColor('#0284c7').text(vencimentoFormatado, margin + 10, cardY + 18);

                // Card 2: Valor
                const card2X = margin + cardW1 + cardGap;
                doc.roundedRect(card2X, cardY, cardW2, cardH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text('VALOR', card2X + 10, cardY + 6);
                doc.font('Helvetica-Bold').fontSize(13).fillColor('#0284c7').text(`R$ ${valorFormatado}`, card2X + 10, cardY + 18);

                // Card 3: Após o Vencimento
                const card3X = card2X + cardW2 + cardGap;
                doc.roundedRect(card3X, cardY, cardW3, cardH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text('APÓS O VENCIMENTO', card3X + 10, cardY + 5);
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#0284c7');
                doc.text(`R$ ${multaValor} de multa (${multaPercentual}%)`, card3X + 10, cardY + 16);
                doc.text(`${jurosPercentual}% de juros ao mês`, card3X + 10, cardY + 26);

                curY = cardY + cardH + 12;

                // 4. Seção "Como realizar o pagamento:"
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text('Como realizar o pagamento:', margin, curY);
                curY += 12;

                const methodsStartY = curY;
                const qrBoxSize = 92;
                const qrX = margin + contentWidth - qrBoxSize - 8;
                const leftMethodsW = qrX - margin - 12;

                let leftY = methodsStartY;

                // 4.1 Pix Copia e Cola
                if (pixCopiaECola) {
                    doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text('Código Pix copia e cola', margin, leftY);
                    leftY += 10;

                    // Box azul do código Pix
                    const pixBoxH = 32;
                    doc.roundedRect(margin, leftY, leftMethodsW, pixBoxH, 4).fillAndStroke('#f0f9ff', '#bae6fd');
                    doc.font('Courier-Bold').fontSize(6.5).fillColor('#0284c7');
                    doc.text(pixCopiaECola, margin + 6, leftY + 4, {
                        width: leftMethodsW - 12,
                        ellipsis: false
                    });
                    leftY += pixBoxH + 6;
                }

                // 4.2 Linha digitável
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text('Linha digitável', margin, leftY);
                leftY += 10;
                doc.font('Courier-Bold').fontSize(9).fillColor('#0284c7').text(linhaDigitavel, margin, leftY);
                leftY += 12;

                // 4.3 Código de Barras Superior
                if (barCodeDigits) {
                    drawItfBarcode(doc, barCodeDigits, margin, leftY, leftMethodsW - 15, 24);
                    leftY += 28;
                }

                // 4.4 Coluna da Direita (QR Code Pix)
                if (qrCodeBuffer) {
                    doc.font('Helvetica-Bold').fontSize(7).fillColor('#475569');
                    doc.text('Pague o boleto com Pix', qrX, methodsStartY, { width: qrBoxSize + 8, align: 'center' });
                    doc.font('Helvetica').fontSize(6.5);
                    doc.text('usando o QR Code abaixo', qrX, methodsStartY + 8, { width: qrBoxSize + 8, align: 'center' });

                    const qrImgY = methodsStartY + 18;
                    doc.roundedRect(qrX + 4, qrImgY, qrBoxSize, qrBoxSize, 4).fillAndStroke('#ffffff', '#cbd5e1');
                    doc.image(qrCodeBuffer, qrX + 6, qrImgY + 2, { width: qrBoxSize - 4, height: qrBoxSize - 4 });
                }

                curY = Math.max(leftY, methodsStartY + qrBoxSize + 22) + 4;

                // 5. Linha de Corte (Dashed)
                doc.save();
                doc.strokeColor('#94a3b8').lineWidth(0.8).dash(3, { space: 3 });
                doc.moveTo(margin, curY).lineTo(margin + contentWidth - 115, curY).stroke();
                doc.restore();

                doc.font('Helvetica-Oblique').fontSize(7).fillColor('#94a3b8');
                doc.text('--- corte na linha pontilhada ---', margin + contentWidth - 110, curY - 4);
                curY += 10;

                // 6. Ficha de Compensação Oficial (Padrão Febraban Cora 403)
                // Cabeçalho da Ficha: Logo Cora + 403 + Linha digitável
                const slipHeaderY = curY;

                // Logo Cora (Quadrado Coral com círculo branco)
                doc.roundedRect(margin, slipHeaderY, 15, 15, 3).fill('#FE3E6D');
                doc.circle(margin + 7.5, slipHeaderY + 7.5, 3).fill('#ffffff');

                doc.font('Helvetica-Bold').fontSize(13).fillColor('#FE3E6D').text('cora', margin + 19, slipHeaderY + 1);

                // Divisória e código do banco
                doc.rect(margin + 54, slipHeaderY - 1, 1.5, 17).fill('#0f172a');
                doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('403', margin + 61, slipHeaderY + 2);
                doc.rect(margin + 88, slipHeaderY - 1, 1.5, 17).fill('#0f172a');

                // Linha digitável à direita
                doc.font('Courier-Bold').fontSize(10).fillColor('#0f172a');
                doc.text(linhaDigitavel, margin + 95, slipHeaderY + 3, { width: contentWidth - 95, align: 'right' });

                curY += 18;

                // Linha grossa abaixo do cabeçalho da ficha
                doc.rect(margin, curY, contentWidth, 1.6).fill('#0f172a');
                curY += 2.5;

                // Tabela Febraban de Grade
                const colW_Right = 155;
                const colW_Left = contentWidth - colW_Right;

                // Helper para desenhar célula com label e valor
                const drawCell = (x, y, w, h, label, val, opts = {}) => {
                    if (opts.bg) {
                        doc.rect(x, y, w, h).fill(opts.bg);
                    }
                    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor('#334155').stroke();

                    if (label) {
                        doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#64748b').text(label.toUpperCase(), x + 4, y + 2, { width: w - 8 });
                    }
                    if (val !== undefined && val !== null && val !== '') {
                        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
                           .fontSize(opts.fontSize || 7.5)
                           .fillColor(opts.color || '#0f172a')
                           .text(String(val), x + 4, y + (label ? 9 : 2.5), {
                               width: w - 8,
                               align: opts.align || 'left',
                               ellipsis: opts.ellipsis !== false
                           });
                    }
                };

                // Linha 1: Local de Pagamento | Data de Vencimento
                const r1H = 20;
                drawCell(margin, curY, colW_Left, r1H, 'Local de Pagamento', 'Pagável em qualquer banco ou casa lotérica');
                drawCell(margin + colW_Left, curY, colW_Right, r1H, 'Data de Vencimento', vencimentoFormatado, { bold: true, align: 'right', fontSize: 9, color: '#0284c7', bg: '#f8fafc' });
                curY += r1H;

                // Linha 2: Beneficiário | CPF/CNPJ do Beneficiário
                const r2H = 20;
                drawCell(margin, curY, colW_Left, r2H, 'Beneficiário', razaoSocial, { bold: true, fontSize: 7.5 });
                drawCell(margin + colW_Left, curY, colW_Right, r2H, 'CPF/CNPJ do Beneficiário', cnpj, { align: 'right' });
                curY += r2H;

                // Linha 3: Data Doc | Nº Doc | Espécie Doc. | Aceite | Data Processamento | Agência/Cód Beneficiário
                const r3H = 20;
                const c3_1 = 75;
                const c3_2 = 80;
                const c3_3 = 60;
                const c3_4 = 45;
                const c3_5 = colW_Left - (c3_1 + c3_2 + c3_3 + c3_4);

                let cX = margin;
                drawCell(cX, curY, c3_1, r3H, 'Data do Documento', emissaoFormatada); cX += c3_1;
                drawCell(cX, curY, c3_2, r3H, 'N° do Documento', numeroDocumento); cX += c3_2;
                drawCell(cX, curY, c3_3, r3H, 'Espécie Doc.', 'DM'); cX += c3_3;
                drawCell(cX, curY, c3_4, r3H, 'Aceite', 'N'); cX += c3_4;
                drawCell(cX, curY, c3_5, r3H, 'Data Processamento', emissaoFormatada);
                drawCell(margin + colW_Left, curY, colW_Right, r3H, 'Agência / Código Beneficiário', '0001 / 7264541-2', { align: 'right', bold: true });
                curY += r3H;

                // Linha 4: Uso do Banco | Carteira | Espécie | Quantidade | (=) Valor do Documento
                const r4H = 20;
                const c4_w = colW_Left / 4;

                cX = margin;
                drawCell(cX, curY, c4_w, r4H, 'Uso do Banco', ''); cX += c4_w;
                drawCell(cX, curY, c4_w, r4H, 'Carteira', '1'); cX += c4_w;
                drawCell(cX, curY, c4_w, r4H, 'Espécie', 'REAL'); cX += c4_w;
                drawCell(cX, curY, c4_w, r4H, 'Quantidade', '');
                drawCell(margin + colW_Left, curY, colW_Right, r4H, '(=) Valor do Documento', `R$ ${valorFormatado}`, { bold: true, align: 'right', fontSize: 9.5, bg: '#f8fafc' });
                curY += r4H;

                // Linha 5: Instruções (Esquerda) e Coluna de Valores (Direita - 5 sub-linhas)
                const subH = 14;
                const r5H = subH * 5; // 70 pt

                // Instruções
                doc.rect(margin, curY, colW_Left, r5H).lineWidth(0.5).strokeColor('#334155').stroke();
                doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#64748b').text('INSTRUÇÕES (TEXTO DE RESPONSABILIDADE DO BENEFICIÁRIO)', margin + 4, curY + 2.5);

                const instrY = curY + 11;
                doc.font('Helvetica').fontSize(7.2).fillColor('#0f172a');
                doc.text('Nao receber com cheque.', margin + 4, instrY);
                doc.text(`Após o vencimento aplicar multa de R$ ${multaValor} e juros de ${jurosPercentual}% ao mês.`, margin + 4, instrY + 10);
                doc.font('Helvetica-Bold').fontSize(7.2).text(`Boleto N° ${numeroDocumento} - ${descricao}`, margin + 4, instrY + 20);
                if (pdfUrl) {
                    doc.font('Helvetica').fontSize(6.2).fillColor('#64748b').text(`Fatura disponível em: ${pdfUrl}`, margin + 4, instrY + 32, { width: colW_Left - 8, ellipsis: true });
                }

                // 5 Sub-linhas de Valores
                let rValY = curY;
                drawCell(margin + colW_Left, rValY, colW_Right, subH, '(-) Desconto / Abatimentos', ''); rValY += subH;
                drawCell(margin + colW_Left, rValY, colW_Right, subH, '(-) Outras deduções', ''); rValY += subH;
                drawCell(margin + colW_Left, rValY, colW_Right, subH, '(+) Mora / Multa', ''); rValY += subH;
                drawCell(margin + colW_Left, rValY, colW_Right, subH, '(+) Outros acréscimos', ''); rValY += subH;
                drawCell(margin + colW_Left, rValY, colW_Right, subH, '(=) Valor cobrado', '');
                curY += r5H;

                // Linha 6: PAGADOR COM DADOS COMPLETOS (SOLICITAÇÃO EXPLÍCITA DO USUÁRIO)
                const r6H = 34;
                doc.rect(margin, curY, contentWidth, r6H).lineWidth(0.5).strokeColor('#334155').stroke();
                doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#64748b').text('PAGADOR', margin + 4, curY + 2.5);

                doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a');
                doc.text(`${clienteNome}, CNPJ/CPF: ${clienteDoc}`, margin + 4, curY + 10);

                doc.font('Helvetica').fontSize(7.5).fillColor('#475569');
                doc.text(clienteEndereco, margin + 4, curY + 20, { width: contentWidth - 8 });
                curY += r6H + 8;

                // 7. Código de Barras Inferior e Rodapé Febraban
                if (barCodeDigits) {
                    drawItfBarcode(doc, barCodeDigits, margin, curY, contentWidth * 0.72, 38);
                }

                doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#475569');
                doc.text('AUTENTICAÇÃO MECÂNICA • FICHA DE COMPENSAÇÃO', margin + (contentWidth * 0.73), curY + 24, {
                    width: contentWidth * 0.27,
                    align: 'right'
                });

                doc.end();
            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = BoletoPdfService;
