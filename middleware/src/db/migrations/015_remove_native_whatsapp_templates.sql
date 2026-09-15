-- Migration 015: Deletar todos os templates WhatsApp nativos (auto-seed).
-- Templates agora são gerenciados exclusivamente pelo usuário via interface.
-- Esta migration remove os templates pré-instalados que eram re-criados a cada restart.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT DISTINCT tenant_id FROM dash_usuarios LOOP
        -- Desvincular templates de automações antes de deletar
        UPDATE dash_automacoes SET template_id = NULL 
        WHERE tenant_id = t.tenant_id 
          AND template_id IN (
            SELECT id FROM dash_templates 
            WHERE tenant_id = t.tenant_id 
              AND categoria = 'Mensagem WhatsApp'
          );

        -- Deletar todos os templates WhatsApp nativos
        DELETE FROM dash_templates 
        WHERE tenant_id = t.tenant_id 
          AND categoria = 'Mensagem WhatsApp';
    END LOOP;
END $$;
