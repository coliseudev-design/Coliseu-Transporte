import { List, FileText, X } from 'lucide-react'

interface Props {
  onClose: () => void
  onProgramar: () => void
  onLancarIndividual: () => void
}

export default function ModalEscolhaLancamento({ onClose, onProgramar, onLancarIndividual }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-primary border border-divider rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-divider bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-white/90" />
            <span className="text-sm font-bold text-white uppercase tracking-wide">Lançamento de Título</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3">
          <p className="text-xs text-text-secondary text-center mb-4">Selecione o tipo de lançamento:</p>

          {/* Programação de Contas */}
          <button
            onClick={onProgramar}
            className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <List size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-indigo-800">Programação de Contas</p>
              <p className="text-[11px] text-indigo-600 mt-0.5">Gera várias parcelas automaticamente com vencimentos mensais. Ideal para contratos e parcelamentos.</p>
            </div>
          </button>

          {/* Lançamento Individual */}
          <button
            onClick={onLancarIndividual}
            className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <FileText size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-emerald-800">Lançamento Individual</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Lança um único título com todos os detalhes: juros, multa, portador, plano de contas e envio ao ERP.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
