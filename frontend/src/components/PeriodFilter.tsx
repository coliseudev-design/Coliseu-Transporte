import { usePeriodStore, PERIOD_OPTIONS, type PeriodKey } from '../store/periodStore'
import { Calendar } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'

interface Props {
  excludePeriods?: PeriodKey[]
}

export default function PeriodFilter({ excludePeriods = [] }: Props) {
  const period = usePeriodStore((s) => s.period)
  const startDate = usePeriodStore((s) => s.startDate)
  const endDate = usePeriodStore((s) => s.endDate)
  const setPeriod = usePeriodStore((s) => s.setPeriod)
  const setCustomRange = usePeriodStore((s) => s.setCustomRange)
  const [showCustom, setShowCustom] = useState(false)

  const handleClick = (p: PeriodKey) => {
    if (p === 'custom') {
      setShowCustom(true)
      setPeriod('custom')
      if (!startDate || !endDate) {
        const today = new Date().toISOString().slice(0, 10)
        const monthAgo = new Date()
        monthAgo.setDate(monthAgo.getDate() - 30)
        setCustomRange(monthAgo.toISOString().slice(0, 10), today)
      }
    } else {
      setShowCustom(false)
      setPeriod(p)
    }
  }

  return (
    <div className="w-full sm:w-auto sm:inline-block max-w-full min-w-0 sm:bg-bg-primary sm:rounded-xl sm:border sm:border-border sm:shadow-card sm:p-2 sm:px-3">
      <div 
        className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2 sm:overflow-visible sm:flex-wrap pb-2 sm:pb-0 w-full" 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <style dangerouslySetInnerHTML={{__html: `::-webkit-scrollbar { display: none; }`}} />
        <Calendar size={16} className="text-text-secondary ml-1 hidden sm:block flex-shrink-0" />
        {PERIOD_OPTIONS.filter(opt => !excludePeriods.includes(opt.key)).map((opt) => (
          <button
            key={opt.key}
            onClick={() => handleClick(opt.key)}
            className={clsx(
              'px-2 py-2 sm:py-1.5 rounded-lg text-[10.5px] sm:text-xs font-medium transition-all duration-300 whitespace-nowrap flex items-center justify-center flex-shrink-0',
              period === opt.key
                ? 'bg-brand-500 text-white shadow-md scale-105'
                : 'bg-bg-primary border border-border text-text-secondary hover:bg-bg-secondary active:bg-bg-tertiary shadow-sm',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {showCustom && period === 'custom' && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label className="text-xs text-text-secondary">De:</label>
          <input
            type="date"
            className="input !py-1 !px-2 !text-xs !w-auto"
            value={startDate || ''}
            onChange={(e) => setCustomRange(e.target.value, endDate || e.target.value)}
          />
          <label className="text-xs text-text-secondary">Até:</label>
          <input
            type="date"
            className="input !py-1 !px-2 !text-xs !w-auto"
            value={endDate || ''}
            onChange={(e) => setCustomRange(startDate || e.target.value, e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
