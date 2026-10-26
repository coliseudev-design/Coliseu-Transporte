import React from 'react'
import clsx from 'clsx'

interface Coluna<T> {
  chave: string
  rotulo: string
  render: (item: T) => React.ReactNode
  /** Esconde a coluna em telas estreitas (celular) */
  ocultarNoCelular?: boolean
  /** Esconde a coluna em tablets */
  ocultarNoTablet?: boolean
  alinhamento?: 'left' | 'right' | 'center'
  largura?: string
}

interface Props<T> {
  dados: T[]
  colunas: Coluna<T>[]
  chaveDe: (item: T) => string | number
  aoClicar?: (item: T) => void
  selecionado?: (item: T) => boolean
  vazio?: React.ReactNode
  className?: string
}

/**
 * Tabela que vira cards empilhados em telas estreitas.
 *
 * Evita scroll horizontal forçado — cada linha da tabela ganha um card
 * com rótulo/valor em resoluções pequenas, mantendo a leitura viável
 * em notebook, tablet e celular.
 */
export default function TabelaResponsiva<T>({
  dados,
  colunas,
  chaveDe,
  aoClicar,
  selecionado,
  vazio,
  className
}: Props<T>) {
  const alinhamento = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  if (dados.length === 0 && vazio) {
    return <>{vazio}</>
  }

  return (
    <div className={className}>
      {/* ═══ TABELA (telas médias e grandes) ═══ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c.chave}
                  className={clsx(
                    'px-4 py-3.5 whitespace-nowrap',
                    i > 0 && 'border-l border-slate-200/70 dark:border-slate-700/50',
                    c.ocultarNoTablet && 'hidden lg:table-cell',
                    alinhamento(c.alinhamento)
                  )}
                  style={c.largura ? { width: c.largura } : undefined}
                >
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
            {dados.map(item => (
              <tr
                key={chaveDe(item)}
                onClick={() => aoClicar?.(item)}
                className={clsx(
                  'transition-colors',
                  aoClicar && 'cursor-pointer',
                  selecionado?.(item)
                    ? 'bg-brand-500/10'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-700/30'
                )}
              >
                {colunas.map((c, i) => (
                  <td
                    key={c.chave}
                    className={clsx(
                      'px-4 py-3 align-middle',
                      i > 0 && 'border-l border-slate-200/70 dark:border-slate-700/50',
                      c.ocultarNoTablet && 'hidden lg:table-cell',
                      alinhamento(c.alinhamento)
                    )}
                  >
                    {c.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ CARDS (celular) ═══ */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700/60">
        {dados.map(item => (
          <button
            key={chaveDe(item)}
            onClick={() => aoClicar?.(item)}
            className={clsx(
              'w-full text-left p-4 transition-colors',
              aoClicar && 'cursor-pointer active:bg-slate-50',
              selecionado?.(item) && 'bg-brand-500/10'
            )}
          >
            <div className="space-y-2">
              {colunas
                .filter(c => !c.ocultarNoCelular)
                .map(c => (
                  <div key={c.chave} className="flex items-start justify-between gap-3">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 pt-0.5">
                      {c.rotulo}
                    </span>
                    <span className={clsx(
                      'text-xs min-w-0 text-right',
                      c.alinhamento === 'right' ? 'text-right' : 'text-right'
                    )}>
                      {c.render(item)}
                    </span>
                  </div>
                ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
