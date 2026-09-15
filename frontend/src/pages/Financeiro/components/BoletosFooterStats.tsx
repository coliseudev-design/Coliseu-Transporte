import React, { memo } from 'react';
import { Eye, X } from 'lucide-react';
import { BoletoItem } from './BoletosTable';

interface BoletosFooterStatsProps {
  boletosRaw: BoletoItem[];
  selectedBoletoIds: (string | number)[];
  selectedBoletoRow: BoletoItem | null;
  onOpenDetail: (item: BoletoItem) => void;
  onCancelarBoleto: (item: BoletoItem) => void;
  onCancelarLote: () => void;
  onReenviarQuitacoes?: () => void;
}

export const BoletosFooterStats = memo(function BoletosFooterStats({
  boletosRaw,
  selectedBoletoIds,
  selectedBoletoRow,
  onOpenDetail,
  onCancelarBoleto,
  onCancelarLote,
  onReenviarQuitacoes
}: BoletosFooterStatsProps) {
  const activeTarget = (() => {
    if (selectedBoletoIds.length === 1) {
      const selId = selectedBoletoIds[0];
      const found = boletosRaw.find(b => b.id === selId || String(b.asaas_payment_id) === String(selId) || String(b.nosso_numero) === String(selId) || String(b.id) === String(selId));
      if (found) return found;
    }
    return selectedBoletoRow || boletosRaw[0] || null;
  })();

  const isPaid = activeTarget && ((activeTarget.status_pagamento || '').trim() === 'PAGO' || (activeTarget.valor_pago || 0) >= activeTarget.valor);
  const isCancelled = activeTarget && (activeTarget.status_pagamento || '').trim() === 'CANCELADO';

  const totalEmitidos = boletosRaw.length;
  const totalPixDireto = boletosRaw.filter(b => {
    const cat = String(b.categoria_pagamento || '').toUpperCase();
    const esp = String(b.especie || '').toUpperCase();
    const bType = String(b.billing_type || '').toUpperCase();
    const hasAsaasNossoNo = Boolean(b.asaas_nosso_numero && b.asaas_nosso_numero !== '—' && String(b.asaas_nosso_numero).trim() !== '');
    const isExplicitPixDirect = cat === 'PIX_DIRETO' || esp === 'PIX_DIRETO';
    const isExplicitBoletoPix = cat === 'BOLETO_PAGO_PIX' || esp === 'BOLETO_PAGO_PIX';
    const isPix = isExplicitPixDirect || isExplicitBoletoPix || esp.includes('PIX') || bType.includes('PIX');
    return isExplicitPixDirect || (isPix && !isExplicitBoletoPix && !hasAsaasNossoNo);
  }).length;

  const totalBoletoPix = boletosRaw.filter(b => {
    const cat = String(b.categoria_pagamento || '').toUpperCase();
    const esp = String(b.especie || '').toUpperCase();
    const bType = String(b.billing_type || '').toUpperCase();
    const hasAsaasNossoNo = Boolean(b.asaas_nosso_numero && b.asaas_nosso_numero !== '—' && String(b.asaas_nosso_numero).trim() !== '');
    const isExplicitPixDirect = cat === 'PIX_DIRETO' || esp === 'PIX_DIRETO';
    const isExplicitBoletoPix = cat === 'BOLETO_PAGO_PIX' || esp === 'BOLETO_PAGO_PIX';
    const isPix = isExplicitPixDirect || isExplicitBoletoPix || esp.includes('PIX') || bType.includes('PIX');
    const isPixDirect = isExplicitPixDirect || (isPix && !isExplicitBoletoPix && !hasAsaasNossoNo);
    return isPix && !isPixDirect;
  }).length;

  const totalVinculados = boletosRaw.filter(b => b.tem_vinculo).length;
  const totalSemVinculo = boletosRaw.filter(b => !b.tem_vinculo).length;

  return (
    <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2.5 rounded-t-2xl">
      
      {/* LADO ESQUERDO: BOTÕES DE AÇÃO */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 p-1 rounded-xl border border-indigo-200/80">
          <button
            type="button"
            onClick={() => {
              if (activeTarget) onOpenDetail(activeTarget);
            }}
            title="Ver detalhamento completo, vincular e reenviar boleto selecionado"
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Eye size={14} /> Detalhes / Reenviar Boleto
          </button>

          {activeTarget && !isPaid && !isCancelled && (
            <button
              type="button"
              onClick={() => onCancelarBoleto(activeTarget)}
              title="Cancelar emissão do boleto selecionado"
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <X size={14} /> Cancelar Emissão
            </button>
          )}
        </div>

        {selectedBoletoIds.length > 0 && (
          <button
            type="button"
            onClick={onCancelarLote}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0 animate-pulse ml-1"
          >
            <X size={14} /> Cancelar em Lote ({selectedBoletoIds.length})
          </button>
        )}
      </div>

      {/* LADO DIREITO: ESTATÍSTICAS DOS BOLETOS */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200" title="Total de cobranças carregadas">
          📄 Total: <strong>{totalEmitidos}</strong>
        </span>
        <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 rounded-lg text-emerald-800 dark:text-emerald-200" title="Pix recebidos direto na conta por chave (sem boleto)">
          📲 Pix Direto: <strong>{totalPixDireto}</strong>
        </span>
        <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-700 rounded-lg text-purple-900 dark:text-purple-200" title="Boletos emitidos (Nosso Nº) pagos via Pix pelo cliente">
          ⚡ Boletos (Pix): <strong>{totalBoletoPix}</strong>
        </span>
        <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-300 dark:border-indigo-800 rounded-lg text-indigo-800 dark:text-indigo-200">
          ✓ Vinculados: <strong>{totalVinculados}</strong>
        </span>
        <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-200">
          ✕ Sem Vínculo: <strong>{totalSemVinculo}</strong>
        </span>
      </div>
    </div>
  );
});
