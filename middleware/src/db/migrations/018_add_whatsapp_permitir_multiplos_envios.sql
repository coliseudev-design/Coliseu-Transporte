-- Migration 018: Add column to allow multiple whatsapp marketing sends per day to the same contact in dash_integracoes_config

ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS whatsapp_permitir_multiplos_envios_dia BOOLEAN DEFAULT FALSE;
