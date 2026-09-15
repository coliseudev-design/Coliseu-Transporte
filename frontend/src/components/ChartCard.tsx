import { ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  action?: ReactNode
  loading?: boolean
  empty?: boolean
  emptyText?: string
}

export default function ChartCard({
  title, subtitle, children, className, action, loading, empty, emptyText = 'Sem dados no período',
}: Props) {
  return (
    <div className={clsx('card', className)}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : empty ? (
        <div className="h-64 flex flex-col items-center justify-center text-text-muted">
          <div className="text-4xl mb-2 opacity-30">📊</div>
          <div className="text-sm">{emptyText}</div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
