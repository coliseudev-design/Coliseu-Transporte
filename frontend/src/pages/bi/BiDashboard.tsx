import { Outlet, useLocation } from 'react-router-dom';
import PeriodFilter from '../../components/PeriodFilter';
import { usePeriodStore } from '../../store/periodStore';
import { BiPeriodFilter } from '../../types/bi.types';
import { useBranchParam } from '../../contexts/BranchContext';

export default function BiDashboard() {
  const periodState = usePeriodStore();
  const location = useLocation();
  const branchParam = useBranchParam();

  // Compatibilidade com as páginas filhas que ainda esperam `filter` no contexto
  // Caso a página já utilize `useBranchPeriodQuery` diretamente, este context não fará efeito negativo.
  const filter: BiPeriodFilter & { depto_id?: number } = {
    period: periodState.period,
    startDate: periodState.startDate || '',
    endDate: periodState.endDate || '',
    ...branchParam
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Filtros Globais do BI */}
      <div className="bg-bg-primary border border-border-primary rounded-lg p-4 flex items-center justify-between shadow-sm flex-wrap gap-4">
        <h2 className="text-xl font-bold text-text-primary">Business Intelligence</h2>
        
        <div className="flex items-center">
          {!['/bi/abc', '/bi/customer-analytics', '/bi/goals', '/bi/heatmap', '/bi/comparative'].some(p => location.pathname.includes(p)) && (
            <PeriodFilter />
          )}
        </div>
      </div>

      {/* Conteúdo Dinâmico das Abas/Dashboards */}
      <div className="flex-1 overflow-auto">
        <Outlet context={{ filter }} />
      </div>
    </div>
  );
}
