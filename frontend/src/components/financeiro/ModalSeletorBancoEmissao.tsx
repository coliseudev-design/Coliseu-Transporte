import { useState } from 'react'
import { X, Building2, Check, Shield, ArrowRight } from 'lucide-react'
import { CedenteItem } from '../configuracoes/ModalCadastroCedente'
import clsx from 'clsx'

interface Props {
  isOpen: boolean
  cedentes: CedenteItem[]
  onSelect: (selectedCedente: CedenteItem) => void
  onClose: () => void
}

export default function ModalSeletorBancoEmissao({ isOpen, cedentes, onSelect, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(
    cedentes.find(c => c.is_default)?.id || cedentes[0]?.id || null
  )

  if (!isOpen) return null

  const activeCedentes = cedentes.filter(c => c.ativo)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        
        {/* CABEÇALHO */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-emerald-400" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight font-heading leading-tight">
                Selecione o Banco / Cedente para Emissão
              </h3>
              <p className="text-[11px] text-slate-400">
                Você possui {activeCedentes.length} APIs de cobrança ativas. Escolha por qual banco emitir o boleto:
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* LISTA DE BANCOS */}
        <div className="p-4 space-y-2.5 overflow-y-auto max-h-80 text-xs">
          {activeCedentes.map(cedente => {
            const isSelected = selectedId === cedente.id

            return (
              <div
                key={cedente.id}
                onClick={() => setSelectedId(cedente.id!)}
                className={clsx(
                  "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                  isSelected
                    ? "bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-indigo-300"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs uppercase shrink-0",
                    cedente.provedor_banco === 'asaas' ? "bg-emerald-500 text-white" :
                    cedente.provedor_banco === 'sicredi' ? "bg-emerald-700 text-white" :
                    cedente.provedor_banco === 'cora' ? "bg-pink-600 text-white" :
                    cedente.provedor_banco === 'itau' ? "bg-amber-600 text-white" : "bg-indigo-600 text-white"
                  )}>
                    {cedente.provedor_banco.substring(0, 3)}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">
                      {cedente.nome}
                      {cedente.is_default && (
                        <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase rounded">
                          Padrão
                        </span>
                      )}
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                      Portador ERP: <strong className="text-indigo-600 dark:text-indigo-400 uppercase font-black">{cedente.portador_nome_erp}</strong> • {cedente.ambiente}
                    </span>
                  </div>
                </div>

                <div className={clsx(
                  "w-5 h-5 rounded-full flex items-center justify-center border transition-all",
                  isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 dark:border-slate-700"
                )}>
                  {isSelected && <Check size={12} />}
                </div>
              </div>
            )
          })}
        </div>

        {/* RODAPÉ */}
        <div className="bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-800 p-3 flex items-center justify-end gap-2 text-xs">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              const item = activeCedentes.find(c => c.id === selectedId) || activeCedentes[0]
              if (item) onSelect(item)
            }}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            Confirmar e Emitir <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  )
}
