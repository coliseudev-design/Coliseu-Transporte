import { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  label: string
  value: string | number
  icon?: LucideIcon
  iconColor?: string
  hint?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  loading?: boolean
  compactValue?: string | number
}

export default function KPICard({
  label, value, icon: Icon, iconColor = 'text-brand-500',
  hint, trend, trendValue, loading, compactValue,
}: Props) {
  return (
    <div className="card h-full flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] sm:text-xs font-bold text-text-secondary uppercase tracking-tight sm:tracking-normal flex-1 truncate" title={label}>{label}</div>
        {Icon && (
          <div className={clsx('w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-bg-tertiary flex items-center justify-center flex-shrink-0', iconColor)}>
            <Icon size={14} className="sm:w-4 sm:h-4" />
          </div>
        )}
      </div>
      <div className="mt-2 sm:mt-3">
        {loading ? (
          <div className="h-6 sm:h-8 w-24 bg-bg-tertiary animate-pulse rounded" />
        ) : (
          <div className="flex items-baseline gap-2 truncate">
            <div 
              className="text-lg sm:text-2xl font-bold tracking-tight text-text-primary truncate" 
              title={value.toString()}
            >
              {value}
            </div>
            {compactValue && (
              <div className="text-xs font-medium text-text-tertiary hidden sm:block">
                ({compactValue})
              </div>
            )}
          </div>
        )}
        <div className="mt-1 min-h-[16px] sm:min-h-[18px] text-[10px] sm:text-xs text-text-secondary flex items-center gap-1 truncate">
          {(hint || trendValue) ? (
            <>
              {trend === 'up' && <span className="text-success">▲</span>}
              {trend === 'down' && <span className="text-danger">▼</span>}
              {trendValue && <span>{trendValue}</span>}
              {hint && <span className="truncate" title={hint}>{hint}</span>}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
