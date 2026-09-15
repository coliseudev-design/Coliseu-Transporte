import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BiPeriodFilter } from '../../types/bi.types';
import { Sparkles, Lightbulb, TrendingUp, AlertTriangle, ArrowRight, BrainCircuit } from 'lucide-react';

export default function AIInsightsDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  // Placeholder para requisição futura
  // const { data, isLoading } = useBiPeriodQuery(...)

  const isLoading = false;

  const mockInsights = [
    { 
      type: 'opportunity', 
      title: 'Aumento de Demanda Previsto', 
      description: 'Padrões históricos indicam que a categoria "Eletrodomésticos" terá um pico de 25% nas próximas duas semanas. Recomendamos reforçar o estoque.',
      action: 'Ver Análise de Estoque',
      icon: TrendingUp,
      color: 'text-brand-500',
      bgColor: 'bg-brand-500/10',
      borderColor: 'border-brand-500/20'
    },
    { 
      type: 'risk', 
      title: 'Risco de Churn Elevado', 
      description: 'Identificamos 12 clientes VIPs que não compram há mais de 45 dias (acima do seu ciclo médio de recompra).',
      action: 'Acessar Radar 360',
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20'
    },
    { 
      type: 'optimization', 
      title: 'Otimização de Preços', 
      description: 'O produto "Smartphone XYZ" está com giro 40% abaixo da meta, mas possui margem elástica. Uma redução de 5% no preço pode impulsionar o volume de vendas.',
      action: 'Ajustar Precificação',
      icon: Lightbulb,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20'
    }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Gerando Insights Inteligentes...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Cabeçalho IA */}
      <div className="bg-gradient-to-r from-brand-900 to-bg-primary border border-border-primary rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
          <BrainCircuit size={200} />
        </div>
        <div className="relative z-10">
          <h2 className="text-xl font-bold text-text-primary flex items-center mb-2">
            <Sparkles size={24} className="text-brand-500 mr-2" />
            Coliseu AI Assistant
          </h2>
          <p className="text-text-secondary max-w-2xl">
            Analisamos milhões de pontos de dados do seu faturamento, estoque e comportamento de clientes no período de <span className="font-semibold text-text-primary">{filter.periodoLabel}</span> para trazer recomendações acionáveis.
          </p>
        </div>
        <div className="relative z-10 flex-shrink-0">
          <button className="btn-primary">
            Gerar Novo Relatório
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Lista de Insights */}
        {mockInsights.map((insight, index) => {
          const Icon = insight.icon;
          return (
            <div key={index} className={`bg-bg-primary border ${insight.borderColor} rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row gap-4 items-start`}>
              <div className={`p-3 rounded-xl ${insight.bgColor} ${insight.color} flex-shrink-0`}>
                <Icon size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-primary mb-2">{insight.title}</h3>
                <p className="text-text-secondary leading-relaxed mb-4">
                  {insight.description}
                </p>
                <button className={`inline-flex items-center text-sm font-medium ${insight.color} hover:opacity-80 transition-opacity`}>
                  {insight.action} <ArrowRight size={16} className="ml-1" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Métricas do Modelo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-bg-secondary/50 border border-border-primary rounded-lg p-4 text-center">
          <div className="text-sm text-text-secondary mb-1">Precisão do Modelo</div>
          <div className="text-xl font-bold text-text-primary">94.8%</div>
        </div>
        <div className="bg-bg-secondary/50 border border-border-primary rounded-lg p-4 text-center">
          <div className="text-sm text-text-secondary mb-1">Padrões Identificados</div>
          <div className="text-xl font-bold text-text-primary">1.204</div>
        </div>
        <div className="bg-bg-secondary/50 border border-border-primary rounded-lg p-4 text-center">
          <div className="text-sm text-text-secondary mb-1">Última Análise</div>
          <div className="text-xl font-bold text-text-primary">Há 5 minutos</div>
        </div>
      </div>

    </div>
  );
}
