'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const {
  inspecionarEEstamparLogoPdf,
  estamparLogoNoDocumentoAuxiliarPdf,
} = require('../src/services/fiscal/dacteLogoStamper');

/**
 * Gera um PNG válido em memória (RGBA) sem dependências externas, ex.: 200x200 verde YAMANARI.
 */
function criarPngSolidoBuffer(width = 200, height = 200, [r, g, b, a] = [46, 168, 54, 255]) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (typeStr, dataBuf) => {
    const typeBuf = Buffer.from(typeStr, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(dataBuf.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, dataBuf])), 0);
    return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // filter None
    for (let x = 0; x < width; x += 1) {
      const px = rowOffset + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function criarDacteSimuladoFocusPdf({ comLogoNativa = false } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 Retrato
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  // Quadro IDENTIFICAÇÃO DO EMITENTE igual ao DACTE da Focus NFe (x=20.12..259.18, y=688.04..760.82)
  page.drawRectangle({
    x: 20.12,
    y: 688.04,
    width: 239.06,
    height: 72.78,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  // Texto deslocado para a metade direita (x >= 116pt), deixando o slot esquerdo livre
  page.drawText('IDENTIFICACAO DO EMITENTE', {
    x: 125,
    y: 748,
    size: 7,
    font,
  });
  page.drawText('PANTANAL COMERCIO DE ALIMENTOS', {
    x: 116,
    y: 736,
    size: 7,
    font,
  });

  // Simula QR Code como imagem XObject no canto superior direito (x=505, y=692) — não deve ser confundido com logo!
  const qrPng = criarPngSolidoBuffer(40, 40, [0, 0, 0, 255]);
  const qrImg = await doc.embedPng(qrPng);
  page.drawImage(qrImg, { x: 505, y: 692, width: 62, height: 62 });

  if (comLogoNativa) {
    const nativeLogo = await doc.embedPng(criarPngSolidoBuffer(120, 120, [20, 120, 40, 255]));
    page.drawImage(nativeLogo, { x: 34, y: 695, width: 58, height: 58 });
  }

  return Buffer.from(await doc.save());
}

test('1. Carimba logomarca 200x200 centrada no quadro IDENTIFICAÇÃO DO EMITENTE quando DACTE vem sem logo (ex.: CT-e Nº 23)', async () => {
  const dacteSemLogo = await criarDacteSimuladoFocusPdf({ comLogoNativa: false });
  const logoBase64 = `data:image/png;base64,${criarPngSolidoBuffer(200, 200).toString('base64')}`;

  const result = await inspecionarEEstamparLogoPdf(dacteSemLogo, logoBase64, {
    tipoDocumento: 'CTE',
  });

  assert.equal(result.stamped, true);
  assert.equal(result.reason, 'STAMPED_EMITENTE_LOGO');
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > dacteSemLogo.length);

  // Verifica centralização exata na área livre [20.12 .. 115.98 pt] sem invadir o texto em x=116
  assert.equal(result.coords.width, 63.5);
  assert.equal(result.coords.height, 63.5);
  assert.ok(result.coords.x >= 35 && result.coords.x <= 37, `x esperado ~36.3, obtido ${result.coords.x}`);
  assert.ok(result.coords.x + result.coords.width <= 105, 'A logo não pode ultrapassar x=105pt');
  assert.ok(result.coords.y >= 691 && result.coords.y <= 694, `y esperado ~692.68, obtido ${result.coords.y}`);
});

test('2. Idempotência: não duplica logomarca se o PDF já foi carimbado ou se a Focus NFe já embutiu logo nativa', async () => {
  const logoBase64 = criarPngSolidoBuffer(200, 200).toString('base64');

  // Caso A: PDF já carimbado pelo próprio middleware
  const dacteSemLogo = await criarDacteSimuladoFocusPdf({ comLogoNativa: false });
  const primeiraPassada = await inspecionarEEstamparLogoPdf(dacteSemLogo, logoBase64, {
    tipoDocumento: 'CTE',
  });
  assert.equal(primeiraPassada.stamped, true);

  const segundaPassada = await inspecionarEEstamparLogoPdf(primeiraPassada.buffer, logoBase64, {
    tipoDocumento: 'CTE',
  });
  assert.equal(segundaPassada.stamped, false);
  assert.equal(segundaPassada.reason, 'ALREADY_STAMPED_KEYWORD');

  // Caso B: PDF novo gerado pela Focus NFe já contendo XObject /Image no canto superior esquerdo
  const dacteComLogoNativa = await criarDacteSimuladoFocusPdf({ comLogoNativa: true });
  const inspecaoNativa = await inspecionarEEstamparLogoPdf(dacteComLogoNativa, logoBase64, {
    tipoDocumento: 'CTE',
  });
  assert.equal(inspecaoNativa.stamped, false);
  assert.equal(inspecaoNativa.reason, 'NATIVE_LOGO_ALREADY_PRESENT');
});

test('3. Proteção anti-sobreposição: não carimba DAMDFE se o texto da empresa estiver alinhado à margem esquerda', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('PANTANAL COMERCIO DE ALIMENTOS LTDA', {
    x: 26,
    y: 785,
    size: 9,
    font,
  });
  const damdfeFlushLeft = Buffer.from(await doc.save());
  const logoBase64 = criarPngSolidoBuffer(180, 180).toString('base64');

  const res = await inspecionarEEstamparLogoPdf(damdfeFlushLeft, logoBase64, {
    tipoDocumento: 'MDFE',
  });
  assert.equal(res.stamped, false);
  assert.equal(res.reason, 'MDFE_HEADER_TEXT_LEFT_ALIGNED');
});

test('4. Integração: TransporteService.baixarArtefatoDocumento aplica logo retroativamente e sincronizarLogoFocus envia arquivo_logo_base64 limpo', async () => {
  const db = require('../src/db/postgres');
  const FocusClient = require('../src/services/focus/focusClient');
  const TransporteService = require('../src/services/transporteService');

  const origQuery = db.query;
  const origDownload = FocusClient.prototype.downloadArquivo;
  const origForReseller = FocusClient.forReseller;

  const logoPngB64 = criarPngSolidoBuffer(200, 200).toString('base64');
  const dacteOriginal = await criarDacteSimuladoFocusPdf({ comLogoNativa: false });
  const focusPutCalls = [];

  try {
    db.query = async (sql) => {
      const s = String(sql).toLowerCase();
      if (s.includes('from dash_ctes')) {
        return {
          rows: [
            {
              id: 23,
              tenant_id: 'tenant-1',
              emitente_id: 1,
              numero: 23,
              serie: '1',
              chave_cte: '50261103272053000150570010000000231206363527',
              caminho_dacte: '/arquivos_development/50261103272053000150570010000000231206363527.pdf',
              status: 'AUTORIZADO',
            },
          ],
        };
      }
      if (s.includes('from dash_emitentes')) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 'tenant-1',
              cnpj: '03272053000150',
              razao_social: 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
              nome_fantasia: 'PANTANAL',
              inscricao_estadual: '283100630',
              cep: '79841270',
              uf: 'MS',
              municipio: 'DOURADOS',
              logradouro: 'RUA ARGENTINA',
              numero: '715',
              bairro: 'PARQUE DAS NACOES',
              focus_empresa_id: '285854',
              focus_ambiente: 'homologacao',
              focus_token_homologacao: 'tok_homolog_123',
              logo_base64: logoPngB64,
              logo_mime: 'image/png',
            },
          ],
        };
      }
      if (s.includes('from dash_plataforma_config')) {
        return {
          rows: [{ chave: 'focus_master_token', valor: 'master_tok_test' }],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    FocusClient.prototype.downloadArquivo = async () => dacteOriginal;
    FocusClient.forReseller = () => ({
      consultarEmpresa: async () => ({ id: 285854, cnpj: '03272053000150' }),
      atualizarEmpresa: async (id, payload) => {
        focusPutCalls.push({ id, payload });
        return { id, caminho_logo: '/logos/285854.png' };
      },
    });

    const syncRes = await TransporteService.sincronizarLogoFocus('tenant-1', 1, {
      deleteLogo: false,
    });
    assert.equal(syncRes.focus_sincronizado, true);
    assert.equal(focusPutCalls.length, 1);
    assert.equal(focusPutCalls[0].payload.arquivo_logo_base64, logoPngB64);
    assert.equal('delete_logo' in focusPutCalls[0].payload, false);

    const art = await TransporteService.baixarArtefatoDocumento('tenant-1', 'CTE', 23, 'pdf');
    assert.equal(art.contentType, 'application/pdf');
    assert.ok(art.buffer.length > dacteOriginal.length);

    // Confirma que o PDF retornado pelo download já vem marcado como carimbado
    const recheck = await inspecionarEEstamparLogoPdf(art.buffer, logoPngB64, {
      tipoDocumento: 'CTE',
    });
    assert.equal(recheck.stamped, false);
    assert.equal(recheck.reason, 'ALREADY_STAMPED_KEYWORD');
  } finally {
    db.query = origQuery;
    FocusClient.prototype.downloadArquivo = origDownload;
    FocusClient.forReseller = origForReseller;
  }
});
