-- Migration 033: Atualizar referências de imagens de cobrança nos templates salvos para usar o asset oficial cobranca_alerta.png
UPDATE dash_templates
SET conteudo = REGEXP_REPLACE(
    conteudo,
    '<img([^>]*?)alt=["'][^"']*(?:Documento|relógio|alerta em vermelho)[^"']*["']([^>]*?)src=["'][^"']*["']([^>]*?)>',
    '<img\1alt="Documento, relógio e alerta em vermelho"\2src="https://transporte.coliseusistemas.com.br/assets/cobranca_alerta.png" style="width:110px;max-width:110px;height:auto;"\3>',
    'gi'
)
WHERE conteudo ~* 'alt=["'][^"']*(?:Documento|relógio|alerta em vermelho)';

UPDATE dash_templates
SET conteudo = REGEXP_REPLACE(
    conteudo,
    '<img([^>]*?)src=["'][^"']*["']([^>]*?)alt=["'][^"']*(?:Documento|relógio|alerta em vermelho)[^"']*["']([^>]*?)>',
    '<img\1src="https://transporte.coliseusistemas.com.br/assets/cobranca_alerta.png" style="width:110px;max-width:110px;height:auto;"\2alt="Documento, relógio e alerta em vermelho"\3>',
    'gi'
)
WHERE conteudo ~* 'alt=["'][^"']*(?:Documento|relógio|alerta em vermelho)';
