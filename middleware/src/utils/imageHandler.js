'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let UPLOADS_DIR = path.join(__dirname, '../../public/uploads/arts');

try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
} catch (err) {
    console.warn('[ImageHandler] Warning creating primary uploads dir, attempting /tmp fallback:', err.message);
    try {
        UPLOADS_DIR = path.join('/tmp', 'nexus_uploads_arts');
        if (!fs.existsSync(UPLOADS_DIR)) {
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
    } catch (e) {
        console.error('[ImageHandler] Failed to create fallback uploads dir:', e.message);
    }
}

/**
 * Saves a base64 image string to disk and returns its public HTTP URL
 */
function saveBase64Image(base64Str) {
    if (!base64Str || typeof base64Str !== 'string') return null;
    const trimmed = base64Str.trim();
    
    // Check if it's a data URI
    const matches = trimmed.match(/^data:image\/([a-zA-Z0-9+\-]+);base64,(.+)$/s);
    if (!matches) {
        return null;
    }

    try {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1] || 'png';
        const buffer = Buffer.from(matches[2], 'base64');
        
        // Save to BOTH primary public disk directory AND /tmp fallback
        const primaryDir = path.join(__dirname, '../../public/uploads/arts');
        const tmpDir = path.join('/tmp', 'coliseu_uploads_arts');
        const legacyTmpDir = path.join('/tmp', 'nexus_uploads_arts');

        try { if (!fs.existsSync(primaryDir)) fs.mkdirSync(primaryDir, { recursive: true }); } catch (_) {}
        try { if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
        try { if (!fs.existsSync(legacyTmpDir)) fs.mkdirSync(legacyTmpDir, { recursive: true }); } catch (_) {}

        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const filename = `${hash}.${ext}`;

        const primaryPath = path.join(primaryDir, filename);
        const tmpPath = path.join(tmpDir, filename);
        const legacyTmpPath = path.join(legacyTmpDir, filename);

        try { if (!fs.existsSync(primaryPath)) fs.writeFileSync(primaryPath, buffer); } catch (_) {}
        try { if (!fs.existsSync(tmpPath)) fs.writeFileSync(tmpPath, buffer); } catch (_) {}
        try { if (!fs.existsSync(legacyTmpPath)) fs.writeFileSync(legacyTmpPath, buffer); } catch (_) {}

        const baseUrl = process.env.PUBLIC_API_URL || 'https://transporte.coliseusistemas.com.br';
        return `${baseUrl}/api/uploads/arts/${filename}`;
    } catch (err) {
        console.error('Error saving base64 image to disk:', err.message);
        return null;
    }
}

/**
 * Ensures any URL (relative, base64, localhost) becomes a valid public HTTP URL
 */
function resolvePublicImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let trimmed = url.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'false') return '';

    // If base64, save to file and return public URL
    if (trimmed.startsWith('data:image/')) {
        const savedUrl = saveBase64Image(trimmed);
        if (savedUrl) return savedUrl;
    }

    const baseUrl = process.env.PUBLIC_API_URL || 'https://transporte.coliseusistemas.com.br';

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        if (trimmed.includes('localhost')) {
            return trimmed.replace(/^http:\/\/localhost:\d+/, baseUrl);
        }
        return trimmed;
    }

    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${baseUrl}${cleanPath}`;
}

/**
 * Sanitizes HTML content for email delivery:
 * 1. Converts all base64 <img> tags to static file URLs.
 * 2. Resolves relative image paths to absolute public URLs.
 * 3. Removes broken or empty <img> tags.
 */
function sanitizeEmailHtml(html) {
    if (!html) return '';
    const baseUrl = process.env.PUBLIC_API_URL || 'https://transporte.coliseusistemas.com.br';

    // 1. Preservar imagens base64 no HTML (NÃO converter para file URL).
    // A conversão para CID inline é feita no momento do envio pelo EmailService.processHtmlImages.
    // Converter aqui gerava URLs de arquivo que davam 404 em produção, quebrando preview e e-mail.
    let cleaned = html;

    // 2. Replace relative /uploads/... paths
    cleaned = cleaned.replace(/src=["'](\/)?((api\/)?uploads\/[^"']+)["']/gi, (match, slash, path) => {
        const normalizedPath = path.startsWith('api/') ? path : `api/${path}`;
        return `src="${baseUrl}/${normalizedPath}"`;
    });

    // 3. Replace localhost in img src
    cleaned = cleaned.replace(/src=["']http:\/\/localhost:\d+(\/[^"']*)?["']/gi, (match, path) => {
        return `src="${baseUrl}${path || ''}"`;
    });

    // 4. Resolve relative/local image paths (e.g. logo.png, ./logo.png, certificado_digital_icon.png)
    cleaned = cleaned.replace(/src=["'](logo\.[a-z0-9]+|\.\/logo\.[a-z0-9]+)["']/gi, () => {
        return `src="${baseUrl}/logobranco.jpg"`;
    });
    cleaned = cleaned.replace(/src=["'](\/)?(assets\/)?certificado_digital_icon\.(png|svg|jpg)["']/gi, () => {
        return `src="${baseUrl}/assets/certificado_digital_icon.png"`;
    });
    cleaned = cleaned.replace(/src=["'](\/)?(assets\/)?(?:cobranca_alerta|alerta_cobranca|documento_relogio)\.(png|svg|jpg|jpeg)["']/gi, () => {
        return `src="${baseUrl}/assets/cobranca_alerta.png"`;
    });
    // Se o alt text contiver "Documento, relógio e alerta", garante a imagem oficial de alerta
    cleaned = cleaned.replace(/<img([^>]*?)alt=["'][^"']*(?:Documento|rel[oó]gio|alerta em vermelho)[^"']*["']([^>]*?)src=["'][^"']*["']([^>]*?)>/gi, (match, p1, p2, p3) => {
        return `<img${p1}alt="Documento, relógio e alerta em vermelho"${p2}src="${baseUrl}/assets/cobranca_alerta.png" style="width:110px;max-width:110px;height:auto;"${p3}>`;
    });
    cleaned = cleaned.replace(/<img([^>]*?)src=["'][^"']*["']([^>]*?)alt=["'][^"']*(?:Documento|rel[oó]gio|alerta em vermelho)[^"']*["']([^>]*?)>/gi, (match, p1, p2, p3) => {
        return `<img${p1}src="${baseUrl}/assets/cobranca_alerta.png" style="width:110px;max-width:110px;height:auto;"${p2}alt="Documento, relógio e alerta em vermelho"${p3}>`;
    });

    // 5. Remove broken, empty, null, undefined or orphan CID image tags
    cleaned = cleaned.replace(/<img[^>]*src=["']\s*["'][^>]*\/?>/gi, '');
    cleaned = cleaned.replace(/<img[^>]*src=["']null["'][^>]*\/?>/gi, '');
    cleaned = cleaned.replace(/<img[^>]*src=["']undefined["'][^>]*\/?>/gi, '');
    cleaned = cleaned.replace(/<img[^>]*src=["']#["'][^>]*\/?>/gi, '');
    cleaned = cleaned.replace(/<img[^>]*src=["']about:blank["'][^>]*\/?>/gi, '');

    // 6. NÃO remover imagens com src relativo — podem ser legítimas no template.
    // Apenas as regras acima (src vazio, null, undefined, #, about:blank) já cobrem os casos inválidos.

    // 7. Remove <img> tags pointing to non-existent /uploads/ files on server disk
    cleaned = cleaned.replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (imgTag, srcUrl) => {
        if (srcUrl.includes('/uploads/')) {
            const pathPart = srcUrl.includes('/api/uploads/')
                ? srcUrl.substring(srcUrl.indexOf('/api/uploads/')).replace('/api/', '/')
                : srcUrl.substring(srcUrl.indexOf('/uploads/'));
            const diskPath = path.join(__dirname, '../../public', pathPart);
            const tmpPath = path.join('/tmp', pathPart.replace('/uploads/', 'nexus_uploads_'));
            if (!fs.existsSync(diskPath) && !fs.existsSync(tmpPath)) {
                return ''; // Purge broken 404 image tag
            }
        }
        return imgTag;
    });

    return cleaned;
}

/**
 * Checks if a given image URL points to a valid resource
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'false') return false;

    // Base64 images are valid data URIs
    if (trimmed.startsWith('data:image/')) return true;

    const resolved = resolvePublicImageUrl(trimmed);
    if (!resolved) return false;

    // If local /uploads/ file, check if file exists on disk
    if (resolved.includes('/uploads/')) {
        const pathPart = resolved.includes('/api/uploads/')
            ? resolved.substring(resolved.indexOf('/api/uploads/')).replace('/api/', '/')
            : resolved.substring(resolved.indexOf('/uploads/'));
        const diskPath = path.join(__dirname, '../../public', pathPart);
        const tmpPath = path.join('/tmp', pathPart.replace('/uploads/', 'nexus_uploads_'));
        if (!fs.existsSync(diskPath) && !fs.existsSync(tmpPath)) {
            return false;
        }
    }
    return true;
}

module.exports = {
    saveBase64Image,
    resolvePublicImageUrl,
    sanitizeEmailHtml,
    isValidImageUrl
};
