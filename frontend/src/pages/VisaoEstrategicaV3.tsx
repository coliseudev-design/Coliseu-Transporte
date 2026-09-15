import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import {
  TrendingUp, DollarSign, Users, Target,
  AlertCircle, FileText, Settings, Sparkles,
  Users2, Headphones, Search, Package, Network, BarChart3,
  KeyRound, ShieldAlert, Monitor, Phone, Mail, Info
} from 'lucide-react'
import { useApiQuery } from '../hooks/useApi'
import { useNavigate } from 'react-router-dom'
import { formatBRL, formatNum } from '../utils/format'

interface Opportunity {
  id: number;
  titulo: string;
  valor_estimado: number;
  estagio: string;
  created_at: string;
}

interface Contract {
  id: number;
  valor_total: number;
  created_at: string;
  status: string;
}

export default function VisaoEstrategicaV3() {
  const navigate = useNavigate()
  const [showActivationModal, setShowActivationModal] = useState(false)

  // Fetch opportunities and contracts to calculate real executive metrics
  const { data: opportunitiesRes, isLoading: loadingOps } = useApiQuery<{ data: Opportunity[] }>('/crm/oportunidades')
  const { data: contractsRes, isLoading: loadingContracts } = useApiQuery<{ data: Contract[] }>('/contratos')

  const ops = opportunitiesRes?.data || [];
  const contracts = contractsRes?.data || [];

  // Calculate CRM KPIs
  const crmStats = useMemo(() => {
    let totalLeads = ops.length;
    let leadsPipeline = ops.filter(o => !['Ganho', 'Perdidos/Frios'].includes(o.estagio));
    let leadsFinalizados = ops.filter(o => ['Ganho', 'Perdidos/Frios'].includes(o.estagio));
    let leadsGanhos = ops.filter(o => o.estagio === 'Ganho');

    const conversionRate = leadsFinalizados.length > 0 
      ? (leadsGanhos.length / leadsFinalizados.length) * 100 
      : 0;

    const receitaPipeline = leadsPipeline.reduce((sum, o) => sum + Number(o.valor_estimado || 0), 0);
    const receitaGanha = leadsGanhos.reduce((sum, o) => sum + Number(o.valor_estimado || 0), 0);

    return {
      totalLeadsInFunnel: leadsPipeline.length,
      conversionRate,
      receitaPipeline,
      receitaGanha,
      totalLeads
    };
  }, [ops]);

  // Last 6 months contract trend
  const closingTrend = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const result: { monthIndex: number; year: number; name: string; valor: number; count: number; }[] = [];

    // Initialize past 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        name: `${months[d.getMonth()]}/${String(d.getFullYear()).substring(2)}`,
        valor: 0,
        count: 0
      });
    }

    // Accumulate contracts into corresponding months
    contracts.forEach(c => {
      const cDate = new Date(c.created_at);
      const match = result.find(r => r.monthIndex === cDate.getMonth() && r.year === cDate.getFullYear());
      if (match) {
        match.valor += Number(c.valor_total || 0);
        match.count += 1;
      }
    });

    return result;
  }, [contracts]);

  const isLoading = loadingOps || loadingContracts;

  return (
    <div className="space-y-6">
      
      {/* 1. Barra de Ações Rápidas (Topo) baseada no Sistema Desktop */}
      <div className="bg-bg-primary border border-divider rounded-xl p-4 shadow-sm">
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest block mb-3">Painel Coliseu Gestão Empresarial</span>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          
          <button onClick={() => navigate('/clientes')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-brand-500 hover:bg-brand-500/5 transition-all duration-300 group">
            <Users2 className="text-brand-500 group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Cadastro</span>
          </button>

          <button onClick={() => navigate('/kanban-cobranca')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-danger hover:bg-danger/5 transition-all duration-300 group">
            <Headphones className="text-danger group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Atendimento</span>
          </button>

          <button onClick={() => navigate('/clientes')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-warning hover:bg-warning/5 transition-all duration-300 group">
            <Search className="text-warning group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Consultas</span>
          </button>

          <button onClick={() => navigate('/produtos')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-brand-500 hover:bg-brand-500/5 transition-all duration-300 group">
            <Package className="text-brand-500 group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Estoque</span>
          </button>

          <button onClick={() => navigate('/config-integracoes')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-success hover:bg-success/5 transition-all duration-300 group">
            <Network className="text-success group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Integração</span>
          </button>

          <button onClick={() => navigate('/fluxo-caixa')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-success hover:bg-success/5 transition-all duration-300 group">
            <DollarSign className="text-success group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Caixa</span>
          </button>

          <button onClick={() => navigate('/fluxo-caixa')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-brand-500 hover:bg-brand-500/5 transition-all duration-300 group">
            <BarChart3 className="text-brand-500 group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Financeiro</span>
          </button>

          <button onClick={() => navigate('/')} className="flex flex-col items-center justify-center p-3 rounded-xl bg-bg-secondary/40 border border-divider hover:border-warning hover:bg-warning/5 transition-all duration-300 group">
            <Monitor className="text-warning group-hover:scale-110 transition-transform duration-300" size={24} />
            <span className="text-xs font-bold text-text-primary mt-2">Gerência</span>
          </button>

        </div>
      </div>

      {/* 2. Banner de Alerta de Expiração */}
      <div className="bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
        <div className="flex items-center gap-3">
          <ShieldAlert size={24} />
          <div>
            <h4 className="font-bold text-sm">Licença Temporária do Sistema</h4>
            <p className="text-xs opacity-90">Seu sistema expira em 6 dias. Solicite uma nova chave de ativação para evitar bloqueios.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowActivationModal(true)} 
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
        >
          Solicitar Chave de Segurança
        </button>
      </div>

      {/* Main Grid: Info Cards + Quick Keys */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Welcome, Tips and Stats (9 columns) */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Welcome Panel */}
          <div className="card p-6 flex items-center justify-between bg-gradient-to-r from-bg-primary to-bg-secondary/20">
            <div>
              <h2 className="text-xl font-black text-text-primary">Boa tarde, SILENUS!</h2>
              <p className="text-xs text-text-secondary mt-1">Seja muito bem-vindo ao sistema de controle e faturamento Nexos Professional.</p>
            </div>
            <Sparkles className="text-brand-500 animate-spin" style={{ animationDuration: '6s' }} size={28} />
          </div>

          {/* Dicas de Utilização */}
          <div className="card p-5 border-l-4 border-l-brand-500">
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2 mb-3">
              <Info size={16} className="text-brand-500" /> Dicas de Utilização
            </h3>
            <ul className="space-y-2.5 text-xs text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 bg-brand-500 rounded-full mt-1.5 flex-shrink-0"></span>
                <span>Verifique o cadastro de espécies de pagamento e defina os tipos corretos para cada uma delas na guia de configurações.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 bg-brand-500 rounded-full mt-1.5 flex-shrink-0"></span>
                <span>Se houver cheque à vista, coloque o número de dias permitido após a emissão. Para cartões, coloque o número de dias para recebimento.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 bg-brand-500 rounded-full mt-1.5 flex-shrink-0"></span>
                <span>Seus clientes e recebíveis foram sincronizados com sucesso via Worker de integração do Firebird ERP.</span>
              </li>
            </ul>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Estatísticas de Acesso */}
            <div className="card p-5">
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">Estatísticas de Acesso</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-divider">
                  <span className="text-text-secondary">Nome do Usuário:</span>
                  <span className="font-semibold text-text-primary">SILENUS</span>
                </div>
                <div className="flex justify-between py-2 border-b border-divider">
                  <span className="text-text-secondary">Grupo de Acesso:</span>
                  <span className="font-semibold text-brand-500">SILENUS SUPORTE</span>
                </div>
                <div className="flex justify-between py-2 border-b border-divider">
                  <span className="text-text-secondary">Número de Acessos:</span>
                  <span className="font-mono font-bold text-text-primary">2.561</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-secondary">Último Acesso:</span>
                  <span className="font-mono text-text-primary">20/05/2026 14:12:52</span>
                </div>
              </div>
            </div>

            {/* Usuários Logados */}
            <div className="card p-5">
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">Usuários Logados</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-divider text-text-secondary uppercase text-[10px] font-bold">
                      <th className="pb-2">Nome</th>
                      <th className="pb-2 text-right">Login em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    <tr>
                      <td className="py-2 text-text-primary font-semibold">SILENUS</td>
                      <td className="py-2 text-right font-mono text-text-secondary">16:23:19</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-text-primary font-semibold">SILENUS SUPORTE</td>
                      <td className="py-2 text-right font-mono text-text-secondary">15:40:11</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>

        {/* Right Side: Quick Keys (3 columns) */}
        <div className="lg:col-span-3">
          <div className="card p-5 h-full flex flex-col justify-between border-l-4 border-l-warning bg-bg-primary">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="text-warning" size={18} />
                <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Teclas Rápidas</h3>
              </div>
              <p className="text-[11px] text-text-secondary mb-4">Teclas de atalho rápido para acesso aos módulos.</p>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded bg-bg-secondary/40 border border-divider text-xs">
                  <span className="text-text-primary font-semibold">CL - Cadastro de Clientes</span>
                  <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-divider text-[10px] font-mono shadow-sm">CL</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-bg-secondary/40 border border-divider text-xs">
                  <span className="text-text-primary font-semibold">CP - Cadastro de Produtos</span>
                  <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-divider text-[10px] font-mono shadow-sm">CP</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-bg-secondary/40 border border-divider text-xs">
                  <span className="text-text-primary font-semibold">AO - Orçamento/Vendas</span>
                  <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-divider text-[10px] font-mono shadow-sm">AO</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-bg-secondary/40 border border-divider text-xs">
                  <span className="text-text-primary font-semibold">XF - Frente de Caixa</span>
                  <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-divider text-[10px] font-mono shadow-sm">XF</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-bg-secondary/40 border border-divider text-xs">
                  <span className="text-text-primary font-semibold">F2 - Trocar Usuário</span>
                  <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-divider text-[10px] font-mono shadow-sm">F2</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-bg-secondary/40 border border-divider text-xs">
                  <span className="text-text-primary font-semibold">F10 - Trocar Empresa</span>
                  <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-divider text-[10px] font-mono shadow-sm">F10</kbd>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-divider mt-4 text-center">
              <span className="text-[10px] font-bold text-text-muted">COLISEU SISTEMAS</span>
            </div>
          </div>
        </div>

      </div>

      {/* Real KPIs & Chart Section */}
      <div className="space-y-6 pt-4 border-t border-divider mt-6">
        <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="text-brand-500" size={16} /> Estatísticas Financeiras & Contratos
        </h3>
        
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card border-l-4 border-l-brand-500 p-5">
            <p className="text-xs font-bold text-text-secondary uppercase">Leads no Funil</p>
            <h3 className="text-2xl font-extrabold mt-1">{isLoading ? '...' : formatNum(crmStats.totalLeadsInFunnel)}</h3>
          </div>
          <div className="card border-l-4 border-l-success p-5">
            <p className="text-xs font-bold text-text-secondary uppercase">Taxa de Conversão</p>
            <h3 className="text-2xl font-extrabold mt-1">{isLoading ? '...' : `${crmStats.conversionRate.toFixed(1)}%`}</h3>
          </div>
          <div className="card border-l-4 border-l-warning p-5">
            <p className="text-xs font-bold text-text-secondary uppercase">Receita em Pipeline</p>
            <h3 className="text-2xl font-extrabold mt-1">{isLoading ? '...' : formatBRL(crmStats.receitaPipeline)}</h3>
          </div>
          <div className="card border-l-4 border-l-success p-5">
            <p className="text-xs font-bold text-text-secondary uppercase">Receita Ganha</p>
            <h3 className="text-2xl font-extrabold mt-1">{isLoading ? '...' : formatBRL(crmStats.receitaGanha)}</h3>
          </div>
        </div>

        {/* Recharts Area Chart */}
        <div className="card p-5">
          <h4 className="font-bold text-text-primary text-xs uppercase tracking-wider mb-3">Fechamento de Contratos</h4>
          <div className="h-64">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-sm">
                Carregando tendências...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={closingTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-brand-500)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--color-brand-500)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(v) => `R$ ${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} 
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} 
                  />
                  <Tooltip 
                    formatter={(val) => [formatBRL(Number(val)), 'Volume Faturado']}
                    contentStyle={{ background: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
                  />
                  <Area type="monotone" dataKey="valor" stroke="var(--color-brand-500)" strokeWidth={2} fillOpacity={1} fill="url(#colorValor)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 6. Rodapé de Contatos */}
      <footer className="pt-6 border-t border-divider mt-8 text-center text-xs text-text-secondary space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <Phone size={14} className="text-brand-500" />
            <span>(67) 3422-2227</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Mail size={14} className="text-brand-500" />
            <span>contato@coliseusistemas.com.br</span>
          </div>
        </div>
        <div className="text-[10px] text-text-muted">
          © {new Date().getFullYear()} Coliseu Sistemas. Todos os direitos reservados.
        </div>
      </footer>

      {/* Activation Key Modal */}
      {showActivationModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-scale-up">
          <div className="card w-full max-w-md p-6 bg-bg-primary">
            <h3 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
              <KeyRound size={20} className="text-brand-500" /> Solicitar Chave de Segurança
            </h3>
            <p className="text-xs text-text-secondary mb-4 leading-relaxed">
              Entre em contato com o suporte da Coliseu Sistemas para validar sua licença ou gerar uma nova chave de liberação de faturamento.
            </p>
            <div className="space-y-2.5 p-3 bg-bg-secondary/40 rounded-xl border border-divider text-xs text-text-primary mb-4">
              <p><strong>Telefone:</strong> (67) 3422-2227</p>
              <p><strong>E-mail:</strong> contato@coliseusistemas.com.br</p>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setShowActivationModal(false)} className="btn-primary text-xs">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
