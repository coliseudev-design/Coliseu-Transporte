import React, { memo } from 'react';
import { Search, Loader2, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import clsx from 'clsx';

export interface BoletoItem {
  id: string | number;
  id_firebird?: number | string | null;
  tipo?: string;
  descricao?: string;
  cliente_boleto?: string | null;
  cliente_nexus?: string | null;
  cliente_coliseu?: string | null;
  cliente?: string | null;
  cliente_documento?: string | null;
  data_emissao?: string | null;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  valor: number;
  valor_pago?: number;
  status_pagamento?: string;
  nosso_numero?: string;
  asaas_nosso_numero?: string | null;
  numero_documento?: string | number | null;
  portador?: string;
  billing_type?: string;
  categoria_pagamento?: string;
  especie?: string;
  asaas_payment_id?: string;
  tem_vinculo?: boolean;
  vinculo_codigo?: string | number | null;
  [key: string]: any;
}

interface BoletosTableProps {
  items: BoletoItem[];
  isLoading: boolean;
  hasSearched: boolean;
  selectedIds: (string | number)[];
  selectedRowId: string | number | null;
  boletosTipoData: 'emissao' | 'vencimento' | 'quitacao';
  onSelectRow: (item: BoletoItem) => void;
  onToggleCheck: (id: any, checked: boolean) => void;
  onToggleCheckAll: (checked: boolean) => void;
  formatDate: (dtStr: string | null) => string;
  formatBRL: (val: number) => string;
}

export const BoletosTable = memo(function BoletosTable({
  items,
  isLoading,
  hasSearched,
  selectedIds,
  selectedRowId,
  boletosTipoData,
  onSelectRow,
  onToggleCheck,
  onToggleCheckAll,
  formatDate,
  formatBRL
}: BoletosTableProps) {
  const allSelectableIds = items.filter(b => {
    const isPaid = (b.status_pagamento || '').trim() === 'PAGO' || (b.valor_pago || 0) >= b.valor;
    const isCancelled = (b.status_pagamento || '').trim() === 'CANCELADO';
    return !isPaid && !isCancelled;
  }).map(b => b.id);

  const isAllChecked = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.includes(id));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm max-h-[62vh]">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider sticky top-0 z-20 shadow-xs select-none">
          <tr>
            <th className="p-2 text-center w-8 whitespace-nowrap">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                checked={isAllChecked}
                onChange={(e) => onToggleCheckAll(e.target.checked)}
              />
            </th>
            <th className="p-2 w-28 font-mono whitespace-nowrap">NOSSO Nº</th>
            <th className="p-2 w-24 text-center whitespace-nowrap">MÉTODO</th>
            <th className="p-2 min-w-[140px] whitespace-nowrap">CLIENTE BOLETO / PIX</th>
            <th className="p-2 min-w-[140px] whitespace-nowrap">CLIENTE COLISEU TRANSPORTE</th>
            <th className="p-2 w-28 text-center whitespace-nowrap">VÍNCULO COLISEU</th>
            <th className="p-2 w-24 text-center whitespace-nowrap">
              {boletosTipoData === 'quitacao' ? 'DATA PAGAMENTO' : 'EMISSÃO'}
            </th>
            <th className="p-2 w-24 text-center whitespace-nowrap">
              {boletosTipoData === 'quitacao' ? 'RECEBIMENTO' : 'VENCIMENTO'}
            </th>
            <th className="p-2 w-28 text-center whitespace-nowrap">DIAS P/ VENCER</th>
            <th className="p-2 w-28 text-right whitespace-nowrap">VALOR</th>
            <th className="p-2 w-24 text-center whitespace-nowrap">PORTADOR</th>
            <th className="p-2 w-28 text-center whitespace-nowrap">SITUAÇÃO</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {isLoading ? (
            <tr>
              <td colSpan={12} className="p-12 text-center text-indigo-600 font-extrabold text-sm whitespace-nowrap">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Loader2 className="animate-spin text-indigo-600" size={24} />
                  <span>Pesquisando boletos emitidos no sistema...</span>
                </div>
              </td>
            </tr>
          ) : !hasSearched ? (
            <tr>
              <td colSpan={12} className="p-12 text-center text-slate-500 font-bold text-xs whitespace-nowrap">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-full">
                    <Search size={20} />
                  </div>
                  <span>Selecione a data ou filtro desejado e clique em <strong className="text-indigo-600">[ 🔍 Buscar ]</strong> para carregar os boletos.</span>
                </div>
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={12} className="p-8 text-center text-slate-400 italic font-semibold whitespace-nowrap">
                Nenhum registro de boleto ou PIX encontrado para o filtro selecionado.
              </td>
            </tr>
          ) : (
            items.map((b) => {
              const isPaid = (b.status_pagamento || '').trim() === 'PAGO' || (b.valor_pago || 0) >= b.valor;
              const isCancelled = (b.status_pagamento || '').trim() === 'CANCELADO';
              const isChecked = selectedIds.includes(b.id);
              const isRowSelected = selectedRowId === b.id;

              const cat = String(b.categoria_pagamento || '').toUpperCase();
              const esp = String(b.especie || '').toUpperCase();
              const bType = String(b.billing_type || '').toUpperCase();
              const hasAsaasNossoNo = Boolean(b.asaas_nosso_numero && b.asaas_nosso_numero !== '—' && String(b.asaas_nosso_numero).trim() !== '');
              const isExplicitPixDirect = cat === 'PIX_DIRETO' || esp === 'PIX_DIRETO';
              const isExplicitBoletoPix = cat === 'BOLETO_PAGO_PIX' || esp === 'BOLETO_PAGO_PIX';
              const isPixItem = isExplicitPixDirect || isExplicitBoletoPix || esp.includes('PIX') || bType.includes('PIX');

              const isPixDirect = isExplicitPixDirect || (isPixItem && !isExplicitBoletoPix && !hasAsaasNossoNo);
              const isBoletoPaidPix = isPixItem && !isPixDirect;

              let rawBoletoName = (b.cliente_boleto || b.cliente || b.descricao || '').trim();
              if (!rawBoletoName || rawBoletoName === '-' || rawBoletoName === 'Cliente Asaas') {
                rawBoletoName = b.cliente_coliseu || b.cliente_nexus || b.cliente || b.descricao || 'Cliente Asaas';
              }

              const cleanClientBoleto = rawBoletoName
                .replace(/\s*—.*$/, '')
                .replace(/Boleto\s*N[º°]?.*$/i, '')
                .trim();

              const cleanClientNexus = b.tem_vinculo 
                ? (b.cliente_coliseu || b.cliente_nexus || b.cliente || 'Cliente Coliseu Transporte').replace(/\s*—.*$/, '').trim() 
                : '— (Sem Vínculo)';

              const portadorClean = (b.portador || 'ASAAS').replace(/\s*\(BANCO\)/i, '').trim();

              let diffDays = 0;
              if (b.data_vencimento) {
                const parts = b.data_vencimento.split('T')[0].split('-');
                const vencDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffTime = vencDate.getTime() - today.getTime();
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              }

              return (
                <tr
                  key={b.id}
                  onClick={() => onSelectRow(b)}
                  className={clsx(
                    "transition-all duration-150 cursor-pointer select-none text-xs",
                    (isRowSelected || isChecked)
                      ? "!bg-indigo-600 !text-white dark:!bg-indigo-700 dark:!text-white font-black border-l-4 border-l-amber-400 shadow-md ring-1 ring-indigo-500/50"
                      : isCancelled
                      ? "bg-red-50/80 dark:bg-red-950/40 border-l-4 border-l-red-500 hover:bg-red-100/80"
                      : isPaid && isPixDirect
                      ? "bg-cyan-50/60 dark:bg-cyan-950/20 border-l-2 border-l-cyan-400 hover:bg-cyan-50/80"
                      : isPaid && isBoletoPaidPix
                      ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-2 border-l-amber-400 hover:bg-amber-50/80"
                      : isPaid
                      ? "bg-emerald-50/20 dark:bg-emerald-950/20 hover:bg-emerald-50/40"
                      : "hover:bg-blue-50/40 dark:hover:bg-slate-800/60"
                  )}
                >
                  <td className="p-2 text-center w-8 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {!isPaid && !isCancelled ? (
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        checked={isChecked}
                        onChange={(e) => onToggleCheck(b.id, e.target.checked)}
                      />
                    ) : (
                      <span className={(isRowSelected || isChecked) ? "text-indigo-200 font-bold" : "text-slate-300 font-bold"}>—</span>
                    )}
                  </td>
                  <td className={clsx("p-2 font-mono font-bold whitespace-nowrap", (isRowSelected || isChecked) ? "!text-amber-300 font-black" : "text-slate-900 dark:text-slate-100")}>
                    {b.nosso_numero}
                  </td>
                  <td className="p-2 text-center whitespace-nowrap">
                    {isPixDirect ? (
                      <span className={clsx("px-2 py-0.5 rounded-full font-black text-[10px] inline-flex items-center gap-1 shadow-2xs", (isRowSelected || isChecked) ? "bg-emerald-500 text-white border border-emerald-300" : "bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border border-emerald-400 dark:border-emerald-700")} title="Pix recebido direto na conta via chave Pix (sem boleto gerado)">
                        📲 PIX DIRETO
                      </span>
                    ) : isBoletoPaidPix ? (
                      <span className={clsx("px-2 py-0.5 rounded-full font-black text-[10px] inline-flex items-center gap-1 shadow-2xs", (isRowSelected || isChecked) ? "bg-amber-500 text-slate-950 border border-amber-300 font-black" : "bg-amber-100 dark:bg-amber-950/90 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700")} title="Boleto emitido (com Nosso Nº) pago pelo cliente através do QR Code Pix do Boleto">
                        ⚡ BOLETO (PIX)
                      </span>
                    ) : (
                      <span className={clsx("px-2 py-0.5 rounded-full font-extrabold text-[10px] inline-flex items-center gap-1 shadow-2xs", (isRowSelected || isChecked) ? "bg-blue-400 text-slate-950 border border-blue-200 font-black" : "bg-blue-100 dark:bg-blue-950/90 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700")} title="Boleto bancário emitido">
                        📄 BOLETO
                      </span>
                    )}
                  </td>
                  <td className={clsx("p-2 font-bold whitespace-nowrap", (isRowSelected || isChecked) ? "!text-white font-black" : "text-slate-900 dark:text-slate-100")} title={cleanClientBoleto}>
                    <span className="truncate max-w-[200px] block">{cleanClientBoleto}</span>
                    {b.cliente_documento && b.cliente_documento !== '—' && (
                      <span className={clsx("text-[10px] font-mono font-medium block leading-tight", (isRowSelected || isChecked) ? "text-indigo-200" : "text-slate-500")}>{b.cliente_documento}</span>
                    )}
                  </td>
                  <td className={clsx("p-2 font-extrabold whitespace-nowrap", (isRowSelected || isChecked) ? "!text-amber-200 font-black" : "text-indigo-700 dark:text-indigo-300")} title={cleanClientNexus}>
                    <span className="truncate max-w-[180px] block">{cleanClientNexus}</span>
                  </td>
                  <td className="p-2 text-center whitespace-nowrap">
                    {b.tem_vinculo ? (
                      <span className={clsx("px-2.5 py-0.5 font-extrabold text-[11px] rounded-md shadow-2xs inline-flex items-center gap-1 whitespace-nowrap", (isRowSelected || isChecked) ? "bg-emerald-500 text-white border border-emerald-300" : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700")}>
                        ✓ Sim (#{b.vinculo_codigo || b.id})
                      </span>
                    ) : (
                      <span className={clsx("px-2.5 py-0.5 font-extrabold text-[11px] rounded-md shadow-2xs inline-flex items-center gap-1 whitespace-nowrap", (isRowSelected || isChecked) ? "bg-rose-500 text-white border border-rose-300" : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700")}>
                        ✕ Não
                      </span>
                    )}
                  </td>
                  <td className="p-2 font-mono text-center whitespace-nowrap">
                    {boletosTipoData === 'quitacao' ? (
                      <span className={(isRowSelected || isChecked) ? "!text-indigo-100 font-bold" : (b.data_pagamento ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-400')}>
                        {b.data_pagamento ? formatDate(b.data_pagamento) : '—'}
                      </span>
                    ) : (
                      <span className={(isRowSelected || isChecked) ? "!text-indigo-100 font-bold" : "text-slate-600 dark:text-slate-400"}>
                        {b.data_emissao ? formatDate(b.data_emissao) : '—'}
                      </span>
                    )}
                  </td>
                  <td className="p-2 font-mono font-bold text-center whitespace-nowrap">
                    {boletosTipoData === 'quitacao'
                      ? (
                        <span className={(isRowSelected || isChecked) ? "!text-indigo-100 font-black" : (b.data_pagamento ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400')}>
                          {b.data_pagamento ? formatDate(b.data_pagamento) : (b.data_vencimento ? formatDate(b.data_vencimento) : '—')}
                        </span>
                      )
                      : (
                        <span className={(isRowSelected || isChecked) ? "!text-indigo-100 font-black" : "text-slate-700 dark:text-slate-300"}>
                          {b.data_vencimento ? formatDate(b.data_vencimento) : '—'}
                        </span>
                      )
                    }
                  </td>
                  <td className="p-2 text-center font-mono font-bold whitespace-nowrap">
                    {!b.data_vencimento ? (
                      '—'
                    ) : diffDays < 0 ? (
                      <span className={clsx("px-2 py-0.5 rounded font-black text-[10.5px] whitespace-nowrap", (isRowSelected || isChecked) ? "bg-rose-900 text-rose-100 border border-rose-400" : "text-red-700 bg-red-100 dark:bg-red-950/90 border border-red-300 dark:border-red-800")}>
                        {diffDays} dias
                      </span>
                    ) : (
                      <span className={(isRowSelected || isChecked) ? "!text-white text-[11px] whitespace-nowrap font-black" : "text-slate-700 dark:text-slate-300 text-[11px] whitespace-nowrap"}>
                        {diffDays} dias
                      </span>
                    )}
                  </td>
                  <td className={clsx("p-2 text-right font-mono font-black whitespace-nowrap", (isRowSelected || isChecked) ? "!text-white" : "text-slate-900 dark:text-slate-100")}>
                    {formatBRL(b.valor)}
                  </td>
                  <td className="p-2 font-bold text-[10px] text-center uppercase whitespace-nowrap">
                    <span className={clsx("px-1.5 py-0.5 rounded whitespace-nowrap border", (isRowSelected || isChecked) ? "bg-indigo-800 text-white border-indigo-400" : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300")}>
                      {portadorClean}
                    </span>
                  </td>
                  <td className="p-2 text-center whitespace-nowrap">
                    {isCancelled ? (
                      <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-extrabold text-[10px] rounded-md border border-red-300 shadow-2xs whitespace-nowrap inline-block">
                        🚫 Cancelado
                      </span>
                    ) : isPaid ? (
                      <span className={clsx("px-2 py-0.5 font-extrabold text-[10px] rounded-md whitespace-nowrap inline-block", (isRowSelected || isChecked) ? "bg-emerald-500 text-white border border-emerald-300" : "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300")}>
                        ✓ Quitado
                      </span>
                    ) : (
                      <span className={clsx("px-2 py-0.5 font-extrabold text-[10px] rounded-md whitespace-nowrap inline-block", (isRowSelected || isChecked) ? "bg-amber-400 text-slate-950 border border-amber-300 font-black" : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300")}>
                        ⏱️ Em Aberto
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
});
