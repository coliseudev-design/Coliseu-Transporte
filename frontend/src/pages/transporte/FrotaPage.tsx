import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Truck, User, Plus, ShieldCheck, AlertCircle } from 'lucide-react';

interface Veiculo {
  id: number;
  placa: string;
  renavam: string;
  tipo_rodado: string;
  tipo_carroceria: string;
  capacidade_kg: number;
  tara_kg: number;
  rntrc: string;
  tipo_proprietario: string;
}

interface Motorista {
  id: number;
  cpf: string;
  nome: string;
  cnh: string;
  cnh_categoria: string;
  telefone: string;
}

export default function FrotaPage() {
  const [tab, setTab] = useState<'veiculos' | 'motoristas'>('veiculos');

  const { data: veiculosData, isLoading: loadingV } = useQuery({
    queryKey: ['veiculos'],
    queryFn: async () => (await api.get('/transporte/veiculos')).data
  });

  const { data: motoristasData, isLoading: loadingM } = useQuery({
    queryKey: ['motoristas'],
    queryFn: async () => (await api.get('/transporte/motoristas')).data
  });

  const veiculos: Veiculo[] = veiculosData?.data || [];
  const motoristas: Motorista[] = motoristasData?.data || [];

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Truck className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Gestão de Frota & Condutores
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cadastro de veículos próprios e terceiros (TAC), RNTRC e condutores autorizados.
          </p>
        </div>

        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
          <button
            onClick={() => setTab('veiculos')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'veiculos'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Veículos ({veiculos.length})
          </button>
          <button
            onClick={() => setTab('motoristas')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'motoristas'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Motoristas ({motoristas.length})
          </button>
        </div>
      </div>

      {/* Lista de Veículos */}
      {tab === 'veiculos' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm">
          {loadingV ? (
            <div className="p-12 text-center text-slate-400 text-sm">Carregando frota...</div>
          ) : veiculos.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Nenhum veículo cadastrado na frota.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Placa</th>
                    <th className="px-6 py-4">RENAVAM</th>
                    <th className="px-6 py-4">Capacidade (KG)</th>
                    <th className="px-6 py-4">RNTRC</th>
                    <th className="px-6 py-4">Proprietário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {veiculos.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white">{v.placa}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">{v.renavam || '—'}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{Number(v.capacidade_kg || 0).toLocaleString('pt-BR')} kg</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">{v.rntrc || '—'}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {v.tipo_proprietario === '1' ? 'Próprio' : 'Terceiro / TAC'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Lista de Motoristas */}
      {tab === 'motoristas' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm">
          {loadingM ? (
            <div className="p-12 text-center text-slate-400 text-sm">Carregando motoristas...</div>
          ) : motoristas.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Nenhum motorista cadastrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Nome do Condutor</th>
                    <th className="px-6 py-4">CPF</th>
                    <th className="px-6 py-4">CNH / Categoria</th>
                    <th className="px-6 py-4">Telefone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {motoristas.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{m.nome}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">{m.cpf}</td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono">{m.cnh || '—'} ({m.cnh_categoria || 'D'})</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{m.telefone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
