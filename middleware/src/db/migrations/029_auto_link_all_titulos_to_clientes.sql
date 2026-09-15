-- Migration 029: Auto link all titles (open and paid) to dash_clientes by Firebird ID, Document, or Name
DO $$
BEGIN
    -- 1. Link titles by Firebird Client ID match
    UPDATE dash_financeiro f
    SET
      cliente_id = c.id,
      cliente_nome = c.nome,
      cliente_documento = COALESCE(c.documento, f.cliente_documento)
    FROM dash_clientes c
    WHERE LOWER(f.tenant_id::text) = LOWER(c.tenant_id::text)
      AND f.cliente_id_firebird IS NOT NULL
      AND f.cliente_id_firebird > 1
      AND c.id_firebird = f.cliente_id_firebird
      AND (f.cliente_nome IS NULL OR f.cliente_nome = 'Cliente Asaas' OR f.cliente_nome = 'Cliente não identificado' OR f.cliente_id IS NULL);

    -- 2. Link titles by exact Document (CPF/CNPJ) match
    UPDATE dash_financeiro f
    SET
      cliente_id = c.id,
      cliente_id_firebird = COALESCE(c.id_firebird, f.cliente_id_firebird),
      cliente_nome = c.nome,
      cliente_documento = c.documento
    FROM dash_clientes c
    WHERE LOWER(f.tenant_id::text) = LOWER(c.tenant_id::text)
      AND (f.cliente_id IS NULL AND (f.cliente_id_firebird IS NULL OR f.cliente_id_firebird <= 1))
      AND c.documento IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(c.documento, '\D', '', 'g')) >= 11
      AND (
        (f.cliente_documento IS NOT NULL AND REGEXP_REPLACE(c.documento, '\D', '', 'g') = REGEXP_REPLACE(f.cliente_documento, '\D', '', 'g'))
        OR (f.cliente_nome IS NOT NULL AND LOWER(TRIM(c.nome)) = LOWER(TRIM(f.cliente_nome)))
        OR (f.descricao IS NOT NULL AND CHAR_LENGTH(f.descricao) > 3 AND LOWER(TRIM(c.nome)) = LOWER(TRIM(f.descricao)))
      );

    -- 3. Link titles by exact Client Name / Description match
    UPDATE dash_financeiro f
    SET
      cliente_id = c.id,
      cliente_id_firebird = COALESCE(c.id_firebird, f.cliente_id_firebird),
      cliente_nome = c.nome,
      cliente_documento = c.documento
    FROM dash_clientes c
    WHERE LOWER(f.tenant_id::text) = LOWER(c.tenant_id::text)
      AND (f.cliente_id IS NULL AND (f.cliente_id_firebird IS NULL OR f.cliente_id_firebird <= 1))
      AND (
        (f.cliente_nome IS NOT NULL AND LOWER(TRIM(c.nome)) = LOWER(TRIM(f.cliente_nome)))
        OR (f.descricao IS NOT NULL AND CHAR_LENGTH(f.descricao) > 3 AND LOWER(TRIM(c.nome)) = LOWER(TRIM(f.descricao)))
      );
END $$;
