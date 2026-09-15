import { useState } from 'react'
import PeriodFilter from '../../components/PeriodFilter'
import { Brain, LineChart, Target, Zap } from 'lucide-react'
import clsx from 'clsx'

// Import das guias (A serem criadas)
import TabPerformance from './TabPerformance'
import TabRankings from './TabRankings'
import TabEstrategia from './TabEstrategia'

export default function InteligenciaDashboard() {
  const [activeTab, setActiveTab] = useState<'performance' | 'rankings' | 'estrategia'>('performance')

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain size={28} className="text-brand-500" />
            <h2 className="font-heading text-2xl font-bold tracking-tight text-text-primary">
              Inteligência de Vendas
            </h2>
          </div>
          <p className="text-text-secondary text-base">
            Análise aprofundada, projeções e performance comercial
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 w-full lg:w-auto min-w-0">
          <PeriodFilter />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-divider">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('performance')}
            className={clsx(
              activeTab === 'performance'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border',
              'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors'
            )}
          >
            <Zap size={16} />
            Performance e Ticket Médio
          </button>
          
          <button
            onClick={() => setActiveTab('rankings')}
            className={clsx(
              activeTab === 'rankings'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border',
              'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors'
            )}
          >
            <Target size={16} />
            Rankings Operacionais
          </button>
          
          <button
            onClick={() => setActiveTab('estrategia')}
            className={clsx(
              activeTab === 'estrategia'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border',
              'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors'
            )}
          >
            <LineChart size={16} />
            Estratégia e Previsões
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {activeTab === 'performance' && <TabPerformance />}
        {activeTab === 'rankings' && <TabRankings />}
        {activeTab === 'estrategia' && <TabEstrategia />}
      </div>
    </div>
  )
}
