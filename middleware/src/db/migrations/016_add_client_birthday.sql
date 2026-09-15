-- Migration 016: Add column data_nascimento for custom birthdays in dash_clientes

ALTER TABLE dash_clientes ADD COLUMN IF NOT EXISTS data_nascimento VARCHAR(10) DEFAULT NULL;
