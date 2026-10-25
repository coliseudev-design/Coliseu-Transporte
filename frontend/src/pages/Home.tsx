import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  Truck, FileText, Package, ArrowUpRight, Layers,
  ShieldCheck, Navigation, Route, Clock, CircleDot
} from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  const { data: cargasData, isLoading: loadingCargas } = useQuery({
    queryKey: ['cargas-dashboard'],
    queryFn: async () => (await api.get('/transporte/cargas', { params: { limit: 6 } })).data
  });

  const { data: ctesData } = useQuery({
    queryKey: ['ctes-dashboard'],
    queryFn: async () => (await api.get('/transporte/ctes', { params: { limit: 6 } })).data
  });

  const { data: mdfesData } = useQuery({
    queryKey: ['mdfes-dashboard'],
    queryFn: async () => (await api.get('/transporte/mdfes', { params: { limit: 6 } })).data
  });

  const cargas = cargasData?.data || [];
  const totalCargas = cargasData?.total ?? cargas.length;
  const ctes = ctesData?.data || [];
  const mdfes = mdfesData?.data || [];

  const emRota = mdfes.filter((m: any) => m.status === 'AUTORIZADO' || m.status === 'PROCESSANDO').length;
  const ctesAutorizados = ctes.filter((c: any) => c.status === 'AUTORIZADO').length;
  const pendentes = cargas.filter((c: any) => c.status === 'PENDENTE').length;

  const kpis = [
    {
      label: 'Cargas Aguardando Despacho',
      value: pendentes,
      sufixo: totalCargas > pendentes ? `de ${totalCargas} NF-e` : 'NF-e do ERP',
      icon: Package,
      cor: 'amber',
      rota: '/transporte/cargas'
    },
    {
      label: 'CT-e Autorizados',
      value: ctesAutorizados,
      sufixo: `${ctes.length}-knowledge(s) no total`,
      icon: FileText,
      cor: 'blue',
      rota: '/transporte/ctes'
    },
    {
      label: 'Viagens em Rota',
      value: emRota,
      sufixo: 'MDF-e autorizado ou transmitindo',
      icon: Truck,
      cor: 'emerald',
      rota: '/transporte/mdfes'
    },
    {
      label: 'Frota & Condutores',
      value: '—',
      sufixo: 'Veículos próprios e TAC',
      icon: Layers,
      cor: 'purple',
      rota: '/transporte/frota'
    }
  ];

  const cores: Record<string, { bg: string; text: string }> = {
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-600 dark:text-amber-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-600 dark:text-blue-400' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-600 dark:text-emerald-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/50', text: 'text-purple-600 dark:text-purple-400' }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Hero — Identidade Coliseu Transporte */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#0B2545] to-slate-900 text-white p-8 sm:p-10 shadow-xl border border-slate-800">
        <div className="absolute -right-16 -bottom-16 opacity-[0.07] pointer-events-none">
          <Truck className="w-[28rem] h-[28rem] text-white" />
        </div>
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 text-xs font-semibold mb-4 border border-sky-400/25 backdrop-blur-md">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            Emissão Fiscal Homologada · SEFAZ + Focus NFe
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Coliseu Transporte
          </h1>
          <p className="text-slate-300 text-sm sm:text-base mt-2 leading-relaxed">
            Central logística integrada ao ERP Coliseu. Emissão de CT-e Rodoviário e Manifestos
            de Carga (MDF-e), controle de percurso, rateio de frete e gestão de frotas em um só lugar.
          </p>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => navigate('/transporte/cargas')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-600/25 transition-all hover:scale-[1.02]"
            >
              <Package className="w-4 h-4" />
              Emitir CT-e das Cargas
            </button>
            <button
              onClick={() => navigate('/transporte/mdfes')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all backdrop-blur-md"
            >
              <Truck className="w-4 h-4" />
              Novo MDF-e
            </button>
            <button
              onClick={() => navigate('/transporte/contratos')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all backdrop-blur-md"
            >
              <Route className="w-4 h-4" />
              Contratos &amp; CIOT
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const c = cores[kpi.cor];
          return (
            <div
              key={kpi.label}
              onClick={() => navigate(kpi.rota)}
              className="cursor-pointer bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight">
                  {kpi.label}
                </span>
                <div className={`p-2 rounded-xl shrink-0 ${c.bg} ${c.text}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white mt-3 tabular-nums">
                {kpi.value}
              </p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                {kpi.sufixo}
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              </p>
            </div>
          );
        })}
      </div>

      {/* Listas: Cargas + CT-e + MDF-e */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* NF-e do ERP */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-500" />
              NF-e Sincronizadas (ERP)
            </h2>
            <button onClick={() => navigate('/transporte/cargas')} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              Ver todas
            </button>
          </header>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {loadingCargas ? (
              <p className="px-5 py-8 text-center text-xs text-slate-400">Carregando…</p>
            ) : cargas.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-400">
                Nenhuma nota sincronizada. O Worker do ERP envia as NF-e faturadas.
              </p>
            ) : (
              cargas.map((c: any) => (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      NF-e {c.numero || 'S/N'} · {c.destinatario_nome || 'Consumidor'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {c.remetente_municipio}/{c.remetente_uf} → {c.destinatario_municipio}/{c.destinatario_uf}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      c.status === 'PENDENTE'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* CT-e */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-500" />
              CT-e Recentes
            </h2>
            <button onClick={() => navigate('/transporte/ctes')} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              Ver todos
            </button>
          </header>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {ctes.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-400">
                Nenhum CT-e ainda. Selecione NF-e na Central de Cargas.
              </p>
            ) : (
              ctes.map((cte: any) => (
                <div key={cte.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {cte.numero ? `CT-e nº ${cte.numero}` : 'Rascunho de CT-e'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {cte.municipio_inicio}/{cte.uf_inicio} → {cte.municipio_fim}/{cte.uf_fim}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      R$ {Number(cte.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      cte.status === 'AUTORIZADO'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : cte.status === 'REJEITADO'
                        ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                        : 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    }`}>
                      {cte.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* MDF-e */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-500" />
              Viagens &amp; MDF-e
            </h2>
            <button onClick={() => navigate('/transporte/mdfes')} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              Ver todos
            </button>
          </header>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {mdfes.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-400">
                Nenhum manifesto. Agrupe CT-e em uma viagem.
              </p>
            ) : (
              mdfes.map((m: any) => (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {m.veiculo_placa} · {m.uf_inicio} → {m.uf_fim}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {m.motorista_nome} · {m.qtd_cte} CT-e(s)
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {Number(m.peso_bruto || 0).toLocaleString('pt-BR')} kg
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      m.status === 'AUTORIZADO'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : m.status === 'ENCERRADO'
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        : 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Atalhos operacionais */}
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-slate-400" />
          Operações do dia
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Selecionar NF-e e gerar CT-e', icon: Package, rota: '/transporte/cargas' },
            { label: 'Transmitir CT-e à SEFAZ', icon: FileText, rota: '/transporte/ctes' },
            { label: 'Montar manifesto de viagem', icon: Navigation, rota: '/transporte/mdfes' },
            { label: 'Encerrar viagem e liberar placa', icon: Clock, rota: '/transporte/mdfes' }
          ].map((acao) => {
            const Icon = acao.icon;
            return (
              <button
                key={acao.label}
                onClick={() => navigate(acao.rota)}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-800 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-all text-left group"
              >
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/50 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-tight">
                  {acao.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
