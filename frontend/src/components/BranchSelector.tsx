import { Building2, ChevronDown, Check } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useBranch } from '../contexts/BranchContext'
import { APP_VERSION } from '../version'

/**
 * Dropdown de seleção de Filial/Departamento.
 * Mostra "Todas as Filiais" como opção padrão.
 * Só renderiza se houver mais de 1 filial cadastrada.
 */
export default function BranchSelector() {
  const { filiais, selectedBranch, setSelectedBranch, isLoading } = useBranch()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Removemos a ocultação se tiver 1 filial para que o usuário saiba que a tela está ali
  if (isLoading) return null

  const selectedLabel =
    selectedBranch === 'todas'
      ? 'Todas as Filiais'
      : filiais.find((f) => f.depto_id === selectedBranch)?.nome || 'Filial'

  return (
    <div ref={ref} className="relative hidden sm:block shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex flex-col items-start px-3 py-1.5 rounded-xl border border-blue-900/25 dark:border-blue-800 bg-blue-900/5 dark:bg-blue-950/40 hover:bg-blue-900/10 text-blue-900 dark:text-blue-200 transition-all duration-200 shadow-xs cursor-pointer select-none"
        title="Selecionar Empresa / Filial"
      >
        <div className="flex items-center justify-between gap-1.5 w-full">
          <div className="flex items-center gap-1 text-[10px] uppercase font-black tracking-wider text-blue-900 dark:text-blue-400">
            <Building2 size={11} className="shrink-0" />
            <span>EMPRESA</span>
          </div>
          <span className="text-[9px] font-black text-blue-800 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded-md ml-1 tracking-tight tabular-nums border border-blue-200 dark:border-blue-800">
            {APP_VERSION}
          </span>
        </div>
        <div className="flex items-center gap-1 w-full text-[13px] font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
          <span className="max-w-[120px] xl:max-w-[150px] truncate leading-tight">{selectedLabel}</span>
          <ChevronDown
            size={13}
            className={`text-slate-400 transition-transform shrink-0 ml-0.5 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-bg-secondary border border-divider rounded-xl shadow-card-hover z-40 py-1 overflow-hidden">
            {/* Filiais individuais */}
            {filiais.map((filial) => (
              <button
                key={filial.depto_id}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-bg-secondary transition-colors"
                onClick={() => { setSelectedBranch(filial.depto_id); setOpen(false) }}
              >
                <div className="flex flex-col items-start min-w-0">
                  <span className="font-medium text-text-primary truncate max-w-[170px]">
                    {filial.nome}
                  </span>
                  {filial.documento && (
                    <span className="text-[10px] text-text-muted font-mono">{filial.documento}</span>
                  )}
                </div>
                {selectedBranch === filial.depto_id && (
                  <Check size={14} className="text-brand-500 shrink-0 ml-2" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
