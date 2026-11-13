-- Migration 026: Neutralizada no módulo Coliseu Transporte.
-- Motivo de Segurança/LGPD: evita injetar clientes/boletos de demonstração Asaas do módulo Nexus
-- nas tabelas compartilhadas dos tenants do Coliseu Transporte durante o boot.
SELECT 1;
