import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { 
  Wallet, ArrowUpRight, ArrowDownRight, DollarSign, CreditCard, 
  AlertTriangle, TrendingUp, TrendingDown, BarChart3, Clock, Search, ChevronDown
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatBRL, formatBRLCompact } from '../../utils/format';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-primary border border-border shadow-card-hover p-3 rounded-lg z-50 min-w-[150px]">
        <p className="text-text-primary font-bold mb-2 text-sm">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex justify-between items-center gap-4 text-xs font-medium mb-1">
            <span style={{ color: entry.color }}>{entry.name}:</span>
            <span className="font-bold text-text-primary">
              {formatBRL(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function FinancialIntelligenceDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  const { data, isLoading } = useBiPeriodQuery(
    ['bi', 'financial'],
    BIService.getFinancialIntelligence,
    filter
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Inteligência Financeira...
      </div>
    );
  }

  // Mocks matching the reference image layout
  const projecaoData = [
    { periodo: 'Próx. 7 dias', entradas: 2584.30, saidas: 0, saldo: 2584.30 },
    { periodo: 'Próx. 15 dias', entradas: 8668.97, saidas: 0, saldo: 8668.97 },
    { periodo: 'Próx. 30 dias', entradas: 12244.47, saidas: 0, saldo: 12244.47 },
    { periodo: 'Próx. 60 dias', entradas: 15138.24, saidas: 0, saldo: 15138.24 },
    { periodo: 'Próx. 90 dias', entradas: 17680.64, saidas: 0, saldo: 17680.64 },
  ];

  const evolucaoData = [
    { mes: 'Jun/25', recebido: 155000, pago: 0 },
    { mes: 'Jul/25', recebido: 195000, pago: 0 },
    { mes: 'Ago/25', recebido: 250000, pago: 0 },
    { mes: 'Set/25', recebido: 210000, pago: 0 },
    { mes: 'Out/25', recebido: 180000, pago: 0 },
    { mes: 'Nov/25', recebido: 220000, pago: 0 },
    { mes: 'Dez/25', recebido: 130000, pago: 0 },
    { mes: 'Jan/26', recebido: 215000, pago: 0 },
    { mes: 'Fev/26', recebido: 223756.19, pago: 0 },
    { mes: 'Mar/26', recebido: 110000, pago: 0 },
    { mes: 'Abr/26', recebido: 0, pago: 0 },
    { mes: 'Mai/26', recebido: 0, pago: 0 },
  ];

  const topReceitas = [
    { nome: 'VENDAS', valor: 197500, pct: 100 },
    { nome: 'COMPRA MERCADORIAS', valor: 18700, pct: 9.4 },
  ];

  const agingReceber = [
    { label: 'Vencido', valor: data?.receber_vencido || 0, red: true },
    { label: '0-15 dias', valor: Math.max(0, (data?.contas_receber || 0) - (data?.receber_vencido || 0)) },
    { label: '16-30 dias', valor: 0 },
    { label: '31-60 dias', valor: 0 },
    { label: '60+ dias', valor: 0 },
  ];

  const agingPagar = [
    { label: 'Vencido', valor: data?.pagar_vencido || 0, red: true },
    { label: '0-15 dias', valor: Math.max(0, (data?.contas_pagar || 0) - (data?.pagar_vencido || 0)) },
    { label: '16-30 dias', valor: 0 },
    { label: '31-60 dias', valor: 0 },
    { label: '60+ dias', valor: 0 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      
      {/* FILTROS HEADER */}
      <div className="flex flex-col md:flex-row gap-4 mb-2 items-end justify-between xl:justify-start">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted font-bold uppercase mb-1">Mês</span>
            <div className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm min-w-[200px] flex items-center justify-between cursor-pointer">
              <span className="text-text-primary">Mês Atual</span>
              <ChevronDown size={16} className="text-text-muted" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted font-bold uppercase mb-1">Ano</span>
            <div className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm min-w-[120px] flex items-center justify-between cursor-pointer">
              <span className="text-text-primary">2026</span>
              <ChevronDown size={16} className="text-text-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* TOP KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {/* Saldo Real */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-text-muted mb-2 text-[10px] font-bold uppercase tracking-wider">
            <Wallet size={14} className="text-success"/> Saldo Real
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary mb-1 tracking-tight">{formatBRL(data?.saldo_atual || 0)}</div>
            <div className="text-[10px] text-success font-bold flex items-center gap-1">
              <ArrowUpRight size={12}/> Recebido: {formatBRLCompact(data?.recebimentos_realizados || 0)}
            </div>
          </div>
        </div>

        {/* Total Recebido */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-text-muted mb-2 text-[10px] font-bold uppercase tracking-wider">
            <ArrowUpRight size={14} className="text-blue-500"/> Total Recebido
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary mb-1 tracking-tight">{formatBRL(data?.recebimentos_realizados || 0)}</div>
            <div className="text-[10px] text-text-muted font-medium">No período selecionado</div>
          </div>
        </div>

        {/* Total Pago */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-text-muted mb-2 text-[10px] font-bold uppercase tracking-wider">
            <ArrowDownRight size={14} className="text-warning"/> Total Pago
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary mb-1 tracking-tight">{formatBRL(data?.pagamentos_realizados || 0)}</div>
            <div className="text-[10px] text-text-muted font-medium">No período selecionado</div>
          </div>
        </div>

        {/* A Receber */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-text-muted mb-2 text-[10px] font-bold uppercase tracking-wider">
            <DollarSign size={14} className="text-brand-500"/> A Receber
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary mb-1 tracking-tight">{formatBRL(data?.contas_receber || 0)}</div>
            <div className="text-[10px] text-danger font-bold flex items-center gap-1">
              <ArrowDownRight size={12}/> Títulos em aberto
            </div>
          </div>
        </div>

        {/* A Pagar */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-text-muted mb-2 text-[10px] font-bold uppercase tracking-wider">
            <CreditCard size={14} className="text-danger"/> A Pagar
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary mb-1 tracking-tight">{formatBRL(data?.contas_pagar || 0)}</div>
            <div className="text-[10px] text-danger font-bold flex items-center gap-1">
              <ArrowDownRight size={12}/> Títulos em aberto
            </div>
          </div>
        </div>
      </div>

      {/* INADIMPLÊNCIA & PROJEÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inadimplência */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-8">
            <AlertTriangle size={16} className="text-warning"/> Inadimplência
          </h3>
          
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* Custom SVG Donut Gauge */}
            <div className="relative w-40 h-40 mb-10">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-bg-tertiary)" strokeWidth="12" />
                {/* Value Ring (inadimplencia) */}
                <circle 
                  cx="50" cy="50" r="40" fill="none" stroke="#EF4444" strokeWidth="12" 
                  strokeDasharray={`${(data?.inadimplencia_pct || 0) * 2.51} ${100 * 2.51}`} 
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-danger tracking-tighter">{data?.inadimplencia_pct || 0}%</span>
              </div>
            </div>

            <div className="w-full space-y-3">
              <div className="flex justify-between items-center bg-bg-secondary/30 p-3 rounded-lg border border-danger/20">
                <div>
                  <div className="text-xs font-bold text-danger">Receber Vencido</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-danger">{formatBRL(data?.receber_vencido || 0)}</div>
                  <div className="text-[10px] text-text-muted">Títulos vencidos</div>
                </div>
              </div>
              <div className="flex justify-between items-center bg-bg-secondary/30 p-3 rounded-lg border border-warning/20">
                <div>
                  <div className="text-xs font-bold text-warning">Pagar Vencido</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-warning">{formatBRL(data?.pagar_vencido || 0)}</div>
                  <div className="text-[10px] text-text-muted">Títulos vencidos</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Projeção de Fluxo de Caixa */}
        <div className="lg:col-span-2 bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-6">
            <TrendingUp size={16} className="text-blue-500"/> Projeção de Fluxo de Caixa
          </h3>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <th className="pb-3 px-2">PERÍODO</th>
                  <th className="pb-3 px-2 text-right">ENTRADAS PREVISTAS</th>
                  <th className="pb-3 px-2 text-right">SAÍDAS PREVISTAS</th>
                  <th className="pb-3 px-2 text-right">SALDO PROJETADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/30 text-xs">
                {projecaoData.map((row, i) => (
                  <tr key={i} className="hover:bg-bg-secondary/50 transition-colors">
                    <td className="py-4 px-2 font-bold text-text-primary flex items-center gap-2">
                      <Clock size={14} className="text-text-muted" /> {row.periodo}
                    </td>
                    <td className="py-4 px-2 text-right font-mono font-bold text-success">{formatBRL(row.entradas)}</td>
                    <td className="py-4 px-2 text-right font-mono font-bold text-danger">{formatBRL(row.saidas)}</td>
                    <td className="py-4 px-2 text-right">
                      <div className="inline-flex items-center gap-1 font-mono font-bold text-success bg-success/10 px-2 py-1 rounded">
                        <ArrowUpRight size={12} /> {formatBRL(row.saldo)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* EVOLUÇÃO MENSAL */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-6">
          <BarChart3 size={16} className="text-brand-500"/> Evolução Mensal (Recebido vs Pago)
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evolucaoData} margin={{ top: 20, right: 20, bottom: 0, left: -10 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="square" />
              <Bar dataKey="recebido" name="Recebido" fill="#10B981" radius={[2, 2, 0, 0]} maxBarSize={30} />
              <Bar dataKey="pago" name="Pago" fill="#EF4444" radius={[2, 2, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TOP DESPESAS & RECEITAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Despesas */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
          <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-8">
            <TrendingDown size={16} className="text-danger"/> Top 10 Despesas (Categoria)
          </h3>
          <div className="flex items-center justify-center h-32 text-xs text-text-muted italic">
            Sem dados de despesa no período
          </div>
        </div>
        
        {/* Top Receitas */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
          <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-6">
            <TrendingUp size={16} className="text-success"/> Top 10 Receitas (Categoria)
          </h3>
          <div className="space-y-4">
            {topReceitas.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-1 text-xs font-bold">
                  <div className="flex gap-2">
                    <span className="text-text-muted">{i+1}</span>
                    <span className="text-text-primary uppercase tracking-wider">{item.nome}</span>
                  </div>
                  <span className="text-success font-mono">{formatBRLCompact(item.valor)}</span>
                </div>
                <div className="w-full bg-bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div className="bg-success h-full" style={{ width: `${item.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAPA DE VENCIMENTOS (AGING) */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-6">
          <Clock size={16} className="text-warning"/> Mapa de Vencimentos (Aging)
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Contas a Receber Aging */}
          <div>
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-blue-500 flex items-center gap-2 mb-3">
              <DollarSign size={14} /> CONTAS A RECEBER
            </h4>
            <div className="flex flex-col gap-1">
              {agingReceber.map((row, i) => (
                <div key={i} className={`flex justify-between items-center p-2.5 rounded transition-colors text-xs font-bold ${row.red ? "border-b-2 border-danger/80 bg-danger/5" : "hover:bg-bg-secondary/50 border-b border-divider"}`}>
                  <span className={`flex items-center gap-1 ${row.red ? "text-danger" : "text-text-primary"}`}>
                    {row.red && <AlertTriangle size={12} />} {row.label}
                  </span>
                  <span className={`font-mono ${row.red ? "text-danger" : "text-blue-500"}`}>
                    {formatBRL(row.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Contas a Pagar Aging */}
          <div>
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-warning flex items-center gap-2 mb-3">
              <CreditCard size={14} /> CONTAS A PAGAR
            </h4>
            <div className="flex flex-col gap-1">
              {agingPagar.map((row, i) => (
                <div key={i} className={`flex justify-between items-center p-2.5 rounded transition-colors text-xs font-bold ${row.red ? "border-b-2 border-danger/80 bg-danger/5" : "hover:bg-bg-secondary/50 border-b border-divider"}`}>
                  <span className={`flex items-center gap-1 ${row.red ? "text-danger" : "text-text-primary"}`}>
                    {row.red && <AlertTriangle size={12} />} {row.label}
                  </span>
                  <span className={`font-mono ${row.red ? "text-danger" : "text-warning"}`}>
                    {formatBRL(row.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
