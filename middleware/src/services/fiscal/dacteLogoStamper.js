'use strict';

const zlib = require('zlib');
const {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
} = require('pdf-lib');
const logger = require('../../config/logger');

const STAMP_KEYWORD = 'coliseu-logo-stamped';

/**
 * Multiplica duas matrizes afins 2D de PDF [a, b, c, d, e, f].
 * Em PDF: CTM_nova = M_operador * CTM_atual.
 */
function multiplyPdfMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/**
 * Extrai e descomprime o conteúdo textual dos streams de desenho (Contents) de uma página PDF.
 */
function extrairConteudoStreamPagina(pdfDoc, page) {
  const contentsRef = page.node.get(PDFName.of('Contents'));
  if (!contentsRef) return '';

  const resolved = pdfDoc.context.lookup(contentsRef);
  const streams = [];

  if (resolved instanceof PDFRawStream) {
    streams.push(resolved);
  } else if (resolved instanceof PDFArray) {
    for (let i = 0; i < resolved.size(); i += 1) {
      const item = pdfDoc.context.lookup(resolved.get(i));
      if (item instanceof PDFRawStream) {
        streams.push(item);
      }
    }
  }

  const chunks = [];
  for (const stream of streams) {
    const rawBytes = Buffer.from(stream.contents);
    const filterObj = stream.dict.get(PDFName.of('Filter'));
    const filterStr = filterObj ? filterObj.toString() : '';

    if (filterStr.includes('FlateDecode')) {
      try {
        chunks.push(zlib.inflateSync(rawBytes).toString('latin1'));
        continue;
      } catch (_) {
        try {
          chunks.push(zlib.inflateRawSync(rawBytes).toString('latin1'));
          continue;
        } catch (__) {
          // fallback para leitura crua se o stream não estiver comprimido de fato
        }
      }
    }
    chunks.push(rawBytes.toString('latin1'));
  }

  return chunks.join('\n');
}

/**
 * Coleta os nomes (/Im0, /X1, etc.) de todos os XObjects do tipo /Image registrados nos recursos da página.
 */
function listarNomesXObjectImagem(pdfDoc, page) {
  const imageNames = new Set();
  const resources = pdfDoc.context.lookup(page.node.get(PDFName.of('Resources')));
  if (!(resources instanceof PDFDict)) return imageNames;

  const xObjectDict = pdfDoc.context.lookup(resources.get(PDFName.of('XObject')));
  if (!(xObjectDict instanceof PDFDict)) return imageNames;

  for (const [keyName, valRef] of xObjectDict.entries()) {
    const xObj = pdfDoc.context.lookup(valRef);
    if (xObj && xObj.dict instanceof PDFDict) {
      const subtype = xObj.dict.get(PDFName.of('Subtype'));
      if (subtype && subtype.toString() === '/Image') {
        imageNames.add(keyName.toString());
      }
    }
  }
  return imageNames;
}

/**
 * Analisa o stream de desenho da página 1 para identificar:
 * 1. Posições (x, y) onde imagens XObject já foram desenhadas (evita duplicar logo nativa da Focus NFe).
 * 2. Posições iniciais de texto no canto superior esquerdo (evita sobrepor texto caso um layout não reserve espaço).
 */
function inspecionarGeometriaCabecalho(contentStr, imageNames) {
  const drawnImages = [];
  const textPositions = [];

  if (!contentStr) {
    return { drawnImages, textPositions };
  }

  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [];
  let inText = false;
  let textMatrix = [1, 0, 0, 1, 0, 0];

  const tokenRegex =
    /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\/[A-Za-z0-9._+-]+|[+-]?(?:\d+\.?\d*|\.\d+)|[A-Za-z*'"]+/g;
  const operands = [];
  let match;

  while ((match = tokenRegex.exec(contentStr)) !== null) {
    const tok = match[0];
    const firstChar = tok[0];

    if (
      firstChar === '/' ||
      firstChar === '(' ||
      firstChar === '<' ||
      firstChar === '+' ||
      firstChar === '-' ||
      firstChar === '.' ||
      (firstChar >= '0' && firstChar <= '9')
    ) {
      operands.push(tok);
      if (operands.length > 32) operands.shift();
      continue;
    }

    if (tok === 'q') {
      ctmStack.push(ctm.slice());
    } else if (tok === 'Q') {
      if (ctmStack.length > 0) ctm = ctmStack.pop();
    } else if (tok === 'cm' && operands.length >= 6) {
      const nums = operands.slice(-6).map(Number);
      if (nums.every((n) => Number.isFinite(n))) {
        ctm = multiplyPdfMatrix(nums, ctm);
      }
    } else if (tok === 'Do' && operands.length >= 1) {
      const nameTok = operands[operands.length - 1];
      if (imageNames.has(nameTok)) {
        drawnImages.push({
          name: nameTok,
          x: ctm[4],
          y: ctm[5],
          width: Math.hypot(ctm[0], ctm[1]),
          height: Math.hypot(ctm[2], ctm[3]),
        });
      }
    } else if (tok === 'BT') {
      inText = true;
      textMatrix = [1, 0, 0, 1, 0, 0];
    } else if (tok === 'ET') {
      inText = false;
    } else if (inText && tok === 'Tm' && operands.length >= 6) {
      const nums = operands.slice(-6).map(Number);
      if (nums.every((n) => Number.isFinite(n))) {
        textMatrix = nums;
      }
    } else if (inText && (tok === 'Td' || tok === 'TD') && operands.length >= 2) {
      const tx = Number(operands[operands.length - 2]);
      const ty = Number(operands[operands.length - 1]);
      if (Number.isFinite(tx) && Number.isFinite(ty)) {
        textMatrix = multiplyPdfMatrix([1, 0, 0, 1, tx, ty], textMatrix);
      }
    } else if (inText && (tok === 'Tj' || tok === 'TJ' || tok === "'" || tok === '"')) {
      const pagePos = multiplyPdfMatrix(textMatrix, ctm);
      textPositions.push({ x: pagePos[4], y: pagePos[5] });
    }

    operands.length = 0;
  }

  return { drawnImages, textPositions };
}

/**
 * Decodifica Base64 (com ou sem prefixo Data URI) e identifica formato PNG ou JPEG.
 */
function decodificarLogo(logoInput) {
  const str = String(logoInput || '').trim();
  if (!str) return null;

  const dataUriMatch = str.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([\s\S]+)$/i);
  const rawBase64 = (dataUriMatch ? dataUriMatch[1] : str).replace(/\s+/g, '');
  if (rawBase64.length < 32) return null;

  const bytes = Buffer.from(rawBase64, 'base64');
  if (bytes.length < 16) return null;

  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (!isPng && !isJpeg) return null;
  return { bytes, format: isPng ? 'png' : 'jpg' };
}

/**
 * Estampa a logomarca da transportadora no quadro IDENTIFICAÇÃO DO EMITENTE do DACTE (CT-e) ou DAMDFE (MDF-e)
 * caso o PDF estático retornado pela Focus NFe não contenha imagem de logo no cabeçalho (ex.: documentos emitidos
 * antes da configuração da logo ou ambientes em que o provedor omite a imagem).
 *
 * Coordenadas oficiais aferidas no leiaute DACTE Focus NFe (A4 595.28 x 841.89 pt):
 * - Quadro IDENTIFICAÇÃO DO EMITENTE: x = [20.12 .. 259.18 pt], y_topo = 81.07 pt, y_base = 153.85 pt (altura = 72.78 pt)
 * - Início do texto da Razão Social/Endereço: x = 115.98 pt
 * - Área livre reservada à logomarca: x = [26.05 .. 110.05 pt] (centro exato x = 68.05 pt), altura útil = 63.50 pt (centro y = pageHeight - 117.46 pt)
 *
 * @param {Buffer} pdfBuffer Buffer original do PDF baixado da Focus NFe
 * @param {string} logoBase64 Base64 ou Data URI (PNG/JPEG) da logomarca do emitente
 * @param {object} [options]
 * @param {string} [options.tipoDocumento='CTE'] 'CTE' ou 'MDFE'
 * @returns {Promise<{ buffer: Buffer, stamped: boolean, reason: string, coords?: object }>}
 */
async function inspecionarEEstamparLogoPdf(pdfBuffer, logoBase64, options = {}) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 64) {
    return { buffer: pdfBuffer, stamped: false, reason: 'INVALID_PDF_BUFFER' };
  }
  if (pdfBuffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { buffer: pdfBuffer, stamped: false, reason: 'NOT_PDF_HEADER' };
  }

  const decodedLogo = decodificarLogo(logoBase64);
  if (!decodedLogo) {
    return { buffer: pdfBuffer, stamped: false, reason: 'NO_VALID_LOGO' };
  }

  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const existingKeywordsRaw = pdfDoc.getKeywords() || '';
    if (existingKeywordsRaw.includes(STAMP_KEYWORD)) {
      return { buffer: pdfBuffer, stamped: false, reason: 'ALREADY_STAMPED_KEYWORD' };
    }

    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      return { buffer: pdfBuffer, stamped: false, reason: 'EMPTY_PDF' };
    }

    const firstPage = pages[0];
    const { width: pageWidth, height: pageHeight } = firstPage.getSize();
    const tipoUpper = String(options.tipoDocumento || 'CTE').toUpperCase();

    const imageNames = listarNomesXObjectImagem(pdfDoc, firstPage);
    const contentStr = extrairConteudoStreamPagina(pdfDoc, firstPage);
    const { drawnImages, textPositions } = inspecionarGeometriaCabecalho(contentStr, imageNames);

    // 1. Se já existir qualquer imagem XObject renderizada no quadrante superior esquerdo (x < 135pt, topo 230pt),
    // significa que a própria Focus NFe já embutiu a logo nativamente neste PDF.
    const jaTemLogoNativa = drawnImages.some(
      (img) => img.x < Math.min(135, pageWidth * 0.25) && img.y > pageHeight - 230
    );
    if (jaTemLogoNativa) {
      return { buffer: pdfBuffer, stamped: false, reason: 'NATIVE_LOGO_ALREADY_PRESENT' };
    }

    // 2. Define a janela exata do quadro de logomarca conforme o modelo auxiliar (DACTE vs DAMDFE)
    let slotX = 26.05;
    let slotWidth = 84.0;
    let slotHeight = 63.5;
    let slotY = pageHeight - 149.21;

    if (tipoUpper === 'MDFE') {
      // No DAMDFE não há canhoto destacável no topo; o quadro do emitente inicia próximo a y_from_top = 22..95 pt.
      slotX = 24.5;
      slotWidth = 74.0;
      slotHeight = 56.0;
      slotY = pageHeight - 86.0;

      // Segurança anti-sobreposição: se o gerador do DAMDFE posicionou texto alinhado à margem esquerda (< 92pt), não carimba.
      const temTextoNaAreaLogo = textPositions.some(
        (tp) => tp.x >= 18 && tp.x < 92 && tp.y >= slotY - 2 && tp.y <= slotY + slotHeight + 2
      );
      if (temTextoNaAreaLogo) {
        return { buffer: pdfBuffer, stamped: false, reason: 'MDFE_HEADER_TEXT_LEFT_ALIGNED' };
      }
    } else {
      // No DACTE (CT-e), verifica se existe texto invadindo a área reservada [22..106 pt] dentro da faixa vertical [slotY..slotY+slotHeight]
      const temTextoInvadindoSlot = textPositions.some(
        (tp) => tp.x >= 22 && tp.x < 104 && tp.y >= slotY + 2 && tp.y <= slotY + slotHeight - 2
      );
      if (temTextoInvadindoSlot) {
        return { buffer: pdfBuffer, stamped: false, reason: 'DACTE_SLOT_OCCUPIED_BY_TEXT' };
      }
    }

    const embeddedImg =
      decodedLogo.format === 'png'
        ? await pdfDoc.embedPng(decodedLogo.bytes)
        : await pdfDoc.embedJpg(decodedLogo.bytes);

    const natural = embeddedImg.scale(1);
    const scale = Math.min(
      slotWidth / Math.max(1, natural.width),
      slotHeight / Math.max(1, natural.height)
    );
    const drawWidth = Number((natural.width * scale).toFixed(2));
    const drawHeight = Number((natural.height * scale).toFixed(2));
    const drawX = Number((slotX + (slotWidth - drawWidth) / 2).toFixed(2));
    const drawY = Number((slotY + (slotHeight - drawHeight) / 2).toFixed(2));

    firstPage.drawImage(embeddedImg, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });

    const kwList = existingKeywordsRaw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!kwList.includes(STAMP_KEYWORD)) {
      kwList.push(STAMP_KEYWORD);
    }
    pdfDoc.setKeywords(kwList);

    const outBytes = await pdfDoc.save();
    return {
      buffer: Buffer.from(outBytes),
      stamped: true,
      reason: 'STAMPED_EMITENTE_LOGO',
      coords: { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
    };
  } catch (err) {
    logger.warn('[DACTE Logo Stamper] Falha não-bloqueante ao aplicar logomarca no PDF:', {
      erro: err.message,
    });
    return { buffer: pdfBuffer, stamped: false, reason: `ERROR:${err.message}` };
  }
}

/**
 * Wrapper direto que retorna apenas o Buffer final (original ou com logomarca aplicada).
 */
async function estamparLogoNoDocumentoAuxiliarPdf(pdfBuffer, logoBase64, options = {}) {
  const res = await inspecionarEEstamparLogoPdf(pdfBuffer, logoBase64, options);
  return res.buffer;
}

module.exports = {
  STAMP_KEYWORD,
  decodificarLogo,
  inspecionarEEstamparLogoPdf,
  estamparLogoNoDocumentoAuxiliarPdf,
};
