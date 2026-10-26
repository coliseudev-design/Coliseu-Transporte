import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  Truck, FileText, Package, ArrowUpRight, Layers,
  ShieldCheck, Navigation, Route as RouteIcon, Clock,
  MapPin, CheckCircle2, ChevronRight, Activity, Zap
} from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  const { data: cargasData, isLoading: loadingCargas } = useQuery({
    queryKey: ['cargas-dashboard'],
    queryFn: async () => (await api.get('/transporte/cargas', { params: { limit: 8 } })).data
  });

  const { data: ctesData } = useQuery({
    queryKey: ['ctes-dashboard'],
    queryFn: async () => (await api.get('/transporte/ctes', { params: { limit: 8 } })).data
  });

  const { data: mdfesData } = useQuery({
    queryKey: ['mdfes-dashboard'],
    queryFn: async () => (await api.get('/transporte/mdfes', { params: { limit: 8 } })).data
  });

  const cargas = cargasData?.data || [];
  const totalCargas = cargasData?.total ?? cargas.length;
  const ctes = ctesData?.data || [];
  const mdfes = mdfesData?.data || [];

  const emRota = mdfes.filter((m: any) => m.status === 'AUTORIZADO' || m.status === 'PROCESSANDO').length;
  const ctesAutorizados = ctes.filter((c: any) => c.status === 'AUTORIZADO').length;
  const pendentes = cargas.filter((c: any) => c.status === 'PENDENTE').length;

  // Valor total das cargas pendentes
  const valorPendente = cargas.filter((c: any) => c.status === 'PENDENTE').reduce((acc: number, c: any) => acc + Number(c.valor_total || 0), 0);

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto">
      {/* Topo Operacional com Ações Rápidas */}
      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Central de Despacho & Transporte
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Gerencie o fluxo completo: selecione as notas fiscais do ERP, emita o MDF-e direto para carga própria ou gere o CT-e com cálculo de frete.
          </p>
        </div>

        {/* Ações em Destaque */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => navigate('/transporte/cargas')}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 shadow-md shadow-brand-500/25 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            Despachar Cargas ({pendentes})
          </button>
          <button
            onClick={() => navigate('/transporte/roteiro')}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            <Navigation className="w-4 h-4 text-sky-600" />
            Roteiro no Mapa
          </button>
        </div>
      </div>

      {/* 3 Métricas Estratégicas com Visual Limpo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Cargas no ERP */}
        <div
          onClick={() => navigate('/transporte/cargas')}
          className="cursor-pointer bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-brand-500/50 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Cargas Aguardando Despacho</span>
            <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
              {pendentes}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              de {totalCargas} notas no ERP
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">Volume acumulado</span>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">
              R$ {valorPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Card 2: Viagens em Rota (MDF-e) */}
        <div
          onClick={() => navigate('/transporte/mdfes')}
          className="cursor-pointer bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-emerald-500/50 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Viagens em Trânsito (MDF-e)</span>
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
              {emRota}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              veículo(s) em rota
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">Total manifestos</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {mdfes.length} gerados
            </span>
          </div>
        </div>

        {/* Card 3: Conhecimentos Autorizados */}
        <div
          onClick={() => navigate('/transporte/ctes')}
          className="cursor-pointer bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-blue-500/50 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Conhecimentos (CT-e)</span>
            <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
              {ctesAutorizados}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              autorizados SEFAZ
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">Total emitidos</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {ctes.length} CT-e
            </span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Viagens Ativas vs Últimas Cargas do ERP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Viagens e Manifestos de Carga */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Manifestos de Viagem (MDF-e)
                </h2>
                <p className="text-xs text-slate-400">Acompanhe as rotas ativas e encerre viagens</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/transporte/mdfes')}
              className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              Ver todos <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {mdfes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center">
              <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-2 stroke-[1.5]" />
              Nenhuma viagem gerada ainda.
              <button
                onClick={() => navigate('/transporte/cargas')}
                className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors"
              >
                Emitir MDF-e pelas Cargas
              </button>
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto pr-1 max-h-[420px]">
              {mdfes.map((m: any) => (
                <div
                  key={m.id}
                  className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {m.numero ? `MDF-e ${m.numero}` : m.ref}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === 'AUTORIZADO'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : m.status === 'ENCERRADO'
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}>
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {m.uf_inicio} ➔ {m.uf_fim} · {m.veiculo_placa}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {m.motorista_nome} · {Number(m.peso_bruto || 0).toLocaleString('pt-BR')} kg
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => navigate('/transporte/roteiro')}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1"
                      title="Ver Rota no Mapa"
                    >
                      <MapPin className="w-3.5 h-3.5 text-sky-600" />
                      Mapa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas Cargas Sincronizadas do ERP */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Cargas do ERP Coliseu
                </h2>
                <p className="text-xs text-slate-400">Notas fiscais faturadas prontas para entrega</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/transporte/cargas')}
              className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              Ver todas <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {cargas.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-2 stroke-[1.5]" />
              Nenhuma nota sincronizada no momento.
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto pr-1 max-h-[420px]">
              {cargas.map((c: any) => (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        NF-e {c.numero}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === 'PENDENTE'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {c.destinatario_nome || 'Consumidor'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      Destino: {c.destinatario_municipio}/{c.destinatario_uf}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                      R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      {Number(c.peso_bruto || 0).toLocaleString('pt-BR')} kg
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
