import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { BarChart3, TrendingUp, FileText, Truck, Download, Calendar } from 'lucide-react';

interface Resumo {
  total_ctes: number;
  ctes_autorizados: number;
  ctes_rejeitados: number;
  total_mdfes: number;
  mdfes_autorizados: number;
  mdfes_encerrados: number;
  valor_frete_total: number;
  valor_carga_total: number;
  peso_total_kg: number;
  por_status: { status: string; total: number }[];
  por_mes: { mes: string; total: number; valor: number }[];
}

export default function RelatoriosPage() {
  const [tipo, setTipo] = useState<'resumo' | 'cte' | 'mdfe'>('resumo');

  const { data: resumo, isLoading } = useQuery({
    queryKey: ['relatorio-fiscal', 'resumo'],
    queryFn: async () => (await api.get('/transporte/relatorios', { params: { tipo: 'resumo' } })).data
  });

  const { data: ctes } = useQuery({
    queryKey: ['relatorio-fiscal', 'cte'],
    queryFn: async () => (await api.get('/transporte/relatorios', { params: { tipo: 'cte' } })).data,
    enabled: tipo === 'cte'
  });

  const { data: mdfes } = useQuery({
    queryKey: ['relatorio-fiscal', 'mdfe'],
    queryFn: async () => (await api.get('/transporte/relatorios', { params: { tipo: 'mdfe' } })).data,
    enabled: tipo === 'mdfe'
  });

  const r: Resumo = resumo?.data || {
    total_ctes: 0, ctes_autorizados: 0, ctes_rejeitados: 0,
    total_mdfes: 0, mdfes_autorizados: 0, mdfes_encerrados: 0,
    valor_frete_total: 0, valor_carga_total: 0, peso_total_kg: 0,
    por_status: [], por_mes: []
  };

  const maxMes = Math.max(...r.por_mes.map(m => Number(m.total || 0)), 1);

  const exportarCsv = async () => {
    try {
      const res = await api.get('/transporte/relatorios', { params: { tipo, formato: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-fiscal-${tipo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Não foi possível exportar o CSV.');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Desempenho Fiscal
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Indicadores de emissão, volumes transports e receita de fretes.
          </p>
        </div>
        <button
          onClick={exportarCsv}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
        {([
          { id: 'resumo', label: 'Resumo', icon: TrendingUp },
          { id: 'cte', label: 'Detalhado CT-e', icon: FileText },
          { id: 'mdfe', label: 'Detalhado MDF-e', icon: Truck }
        ] as const).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setTipo(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tipo === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {tipo === 'resumo' && (
        <>
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Carregando indicadores...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'CT-e Emitidos', value: r.total_ctes, sub: `${r.ctes_autorizados} autorizados`, cor: 'text-sky-600' },
                  { label: 'CT-e Rejeitados', value: r.ctes_rejeitados, sub: 'pela SEFAZ', cor: 'text-red-500' },
                  { label: 'MDF-e', value: r.total_mdfes, sub: `${r.mdfes_encerrados} encerrados`, cor: 'text-emerald-600' },
                  { label: 'Receita de Frete', value: `R$ ${Number(r.valor_frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, sub: `${Number(r.peso_total_kg || 0).toLocaleString('pt-BR')} kg`, cor: 'text-violet-600' }
                ].map(k => (
                  <div key={k.label} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{k.label}</p>
                    <p className={`text-2xl font-black mt-2 tabular-nums ${k.cor} dark:text-slate-100`}>{k.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-500" />
                    Emissões por mês
                  </h2>
                  {r.por_mes.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-10">Sem dados no período.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {r.por_mes.map(m => (
                        <div key={m.mes}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-600 dark:text-slate-400">{m.mes}</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{m.total}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all"
                              style={{ width: `${Math.min(100, (Number(m.total) / maxMes) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-5">Status dos documentos</h2>
                  {r.por_status.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-10">Sem documentos emitidos ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {r.por_status.map(s => (
                        <div key={s.status} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{s.status}</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{s.total}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tipo === 'cte' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">CT-e</th>
                  <th className="px-5 py-3.5">Rota</th>
                  <th className="px-5 py-3.5">Frete</th>
                  <th className="px-5 py-3.5">Peso</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {(ctes?.data || []).map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{c.numero ? `Nº ${c.numero}` : 'Rascunho'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{c.municipio_inicio}/{c.uf_inicio} → {c.municipio_fim}/{c.uf_fim}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{Number(c.peso_bruto || 0).toLocaleString('pt-BR')} kg</td>
                    <td className="px-5 py-3.5"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{c.status}</span></td>
                  </tr>
                ))}
                {(ctes?.data || []).length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-xs text-slate-400">Nenhum CT-e emitido.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tipo === 'mdfe' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">MDF-e</th>
                  <th className="px-5 py-3.5">Veículo</th>
                  <th className="px-5 py-3.5">Rota</th>
                  <th className="px-5 py-3.5">Peso</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {(mdfes?.data || []).map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{m.numero ? `Nº ${m.numero}` : 'Rascunho'}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">{m.veiculo_placa}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{m.uf_inicio} → {m.uf_fim}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{Number(m.peso_bruto || 0).toLocaleString('pt-BR')} kg</td>
                    <td className="px-5 py-3.5"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{m.status}</span></td>
                  </tr>
                ))}
                {(mdfes?.data || []).length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-xs text-slate-400">Nenhum MDF-e emitido.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
