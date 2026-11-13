'use strict';

const logger = require('../config/logger');
const TransporteService = require('../services/transporteService');

/**
 * Worker exclusivo do Coliseu Transporte:
 * Reconcilia periodicamente CT-es e MDF-es que permaneceram em 'PROCESSANDO'
 * caso algum webhook da Focus NFe sofra oscilação de rede.
 * Não executa nenhuma rotina de WhatsApp/Cobranca/Cora/Asaas do Nexus.
 */
class TransporteWorker {
  constructor() {
    this.timer = null;
    this.running = false;
    this.intervalMs = Number(process.env.TRANSPORTE_RECONCILE_INTERVAL_MS || 60000);
  }

  start() {
    if (this.timer) return;
    logger.info(
      `[TransporteWorker] Reconciliação fiscal automática iniciada (intervalo: ${Math.round(this.intervalMs / 1000)}s)`
    );
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.warn(`[TransporteWorker] Erro no ciclo de reconciliação: ${err.message}`);
      });
    }, this.intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const res = await TransporteService.reconciliarProcessando(null, 1);
      if (res && (res.reconciliados > 0 || res.mdfes_reconciliados > 0)) {
        logger.info(
          `[TransporteWorker] Documentos reconciliados na SEFAZ/Focus: CT-es=${res.reconciliados || 0}, MDF-es=${res.mdfes_reconciliados || 0}`
        );
      }
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[TransporteWorker] Reconciliação fiscal automática encerrada.');
    }
  }
}

module.exports = new TransporteWorker();
