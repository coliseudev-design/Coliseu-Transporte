import { ReactNode } from 'react'
import clsx from 'clsx'

export interface Column<T> {
  key: keyof T | string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (row: T, idx: number) => ReactNode
  className?: string
  width?: string
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  empty?: string
  rowKey?: (row: T, idx: number) => string | number
}

export default function DataTable<T>({
  columns, data, loading, empty = 'Sem registros', rowKey,
}: Props<T>) {
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-bg-secondary/90 backdrop-blur-md sticky top-0 z-10 border-b border-border/80">
            <tr>
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  style={c.width ? { width: c.width } : undefined}
                  className={clsx(
                    'px-3 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    !c.align && 'text-left',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-divider last:border-0">
                  {columns.map((c) => (
                    <td key={String(c.key)} className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <div className="h-3 sm:h-4 bg-bg-tertiary animate-pulse rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 sm:py-12 text-center text-text-muted text-sm">
                  {empty}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={rowKey ? rowKey(row, idx) : idx}
                  className={clsx(
                    'border-b border-divider last:border-0 hover:bg-bg-secondary/50 transition-colors',
                    idx % 2 === 0 ? 'bg-bg-primary' : 'bg-bg-secondary/20'
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={String(c.key)}
                      className={clsx(
                        'px-3 sm:px-4 py-2.5 sm:py-3 text-text-primary',
                        c.align === 'right' && 'text-right mono whitespace-nowrap',
                        c.align === 'center' && 'text-center',
                        c.className,
                      )}
                    >
                      {c.render ? c.render(row, idx) : ((row as any)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
