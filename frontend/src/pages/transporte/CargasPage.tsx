import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Package, Truck, ArrowRight, CheckCircle2, Clock,
  Search, Filter, AlertCircle, FileText, ChevronRight
} from 'lucide-react';

interface Carga {
  id: number;
  chave_acesso: string;
  numero: string;
  serie: string;
  data_emissao: string;
  remetente_nome: string;
  remetente_municipio: string;
  remetente_uf: string;
  destinatario_nome: string;
  destinatario_municipio: string;
  destinatario_uf: string;
  valor_total: number;
  peso_bruto: number;
  status: string;
}

export default function CargasPage() {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Formulário de rateio/emissão rápida de CT-e
  const [valorFrete, setValorFrete] = useState('');
  const [naturezaOperacao, setNaturezaOperacao] = useState('PRESTACAO DE SERVICO DE TRANSPORTE');
  const [tomador, setTomador] = useState('0'); // 0=Remetente, 3=Destinatário

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cargas', search],
    queryFn: async () => {
      const res = await api.get('/transporte/cargas', { params: { search } });
      return res.data;
    }
  });

  const cargas: Carga[] = data?.data || [];

  // Totais das cargas selecionadas
  const selecionadas = cargas.filter(c => selectedIds.includes(c.id));
  const totalValorCarga = selecionadas.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
  const totalPeso = selecionadas.reduce((acc, c) => acc + Number(c.peso_bruto || 0), 0);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === cargas.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(cargas.map(c => c.id));
    }
  };

  const handleCriarCte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selecionadas.length === 0) return;
    setSubmitting(true);
    try {
      const primeiraCarga = selecionadas[0];
      await api.post('/transporte/ctes', {
        emitente_id: 1, // Pega o emitente padrão
        cargas_ids: selectedIds,
        natureza_operacao: naturezaOperacao,
        tomador,
        uf_inicio: primeiraCarga.remetente_uf,
        municipio_inicio: primeiraCarga.remetente_municipio,
        codigo_municipio_inicio: '5107875', // Default Cuiabá/MT ou dinâmico
        uf_fim: primeiraCarga.destinatario_uf,
        municipio_fim: primeiraCarga.destinatario_municipio,
        codigo_municipio_fim: '3550308', // Default SP ou dinâmico
        valor_total: parseFloat(valorFrete || '0'),
        peso_bruto: totalPeso,
        valor_carga: totalValorCarga
      });

      setSelectedIds([]);
      setModalOpen(false);
      refetch();
      alert('CT-e gerado com sucesso! Acesse a aba Conhecimentos (CT-e) para emitir na SEFAZ.');
    } catch (err: any) {
      alert('Erro ao gerar CT-e: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Package className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Central de Cargas & NF-e (ERP Coliseu)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Notas fiscais sincronizadas do Firebird aguardando despacho e agrupamento em CT-e/MDF-e.
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm shadow-brand-500/30 transition-all"
          >
            <Truck className="w-4 h-4" />
            Gerar CT-e com {selectedIds.length} carga(s)
          </button>
        )}
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por chave da NF-e, número, remetente ou destinatário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
          />
        </div>
        <button
          onClick={selectAll}
          className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
        >
          {selectedIds.length === cargas.length && cargas.length > 0 ? 'Desmarcar Todas' : 'Selecionar Todas'}
        </button>
      </div>

      {/* Lista de Cargas em Cards Modernos */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          Carregando notas fiscais do ERP...
        </div>
      ) : cargas.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Package className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma carga aguardando emissão</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Assim que o Worker sincronizar as notas do ERP Firebird, elas aparecerão listadas aqui para emissão rápida.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cargas.map(carga => {
            const isSelected = selectedIds.includes(carga.id);
            return (
              <div
                key={carga.id}
                onClick={() => toggleSelect(carga.id)}
                className={`cursor-pointer bg-white dark:bg-slate-800 p-5 rounded-2xl border transition-all duration-200 relative ${
                  isSelected
                    ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                    : 'border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                    <FileText className="w-3.5 h-3.5" />
                    NF-e {carga.numero || 'S/N'}
                  </span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    carga.status === 'PENDENTE'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  }`}>
                    {carga.status}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Origem</span>
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{carga.remetente_nome || 'Consumidor'}</p>
                    <p className="text-xs text-slate-500">{carga.remetente_municipio}/{carga.remetente_uf}</p>
                  </div>

                  <div className="pt-1">
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Destino</span>
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{carga.destinatario_nome || 'Consumidor'}</p>
                    <p className="text-xs text-slate-500">{carga.destinatario_municipio}/{carga.destinatario_uf}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500">{Number(carga.peso_bruto || 0).toLocaleString('pt-BR')} kg</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    R$ {Number(carga.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação de CT-e em Lote */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-brand-600" />
              Emitir Conhecimento de Transporte (CT-e)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Agrupando {selecionadas.length} nota(s) fiscal(is) selecionada(s).
            </p>

            <div className="my-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Valor Total da Carga:</span>
                <span className="font-semibold text-slate-900 dark:text-white">R$ {totalValorCarga.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Peso Total Consolidado:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{totalPeso.toLocaleString('pt-BR')} kg</span>
              </div>
            </div>

            <form onSubmit={handleCriarCte} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                  Valor do Frete da Prestação (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 850.00"
                  value={valorFrete}
                  onChange={e => setValorFrete(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                  Quem paga o frete? (Tomador do Serviço)
                </label>
                <select
                  value={tomador}
                  onChange={e => setTomador(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                >
                  <option value="0">Remetente (Quem envia a mercadoria)</option>
                  <option value="3">Destinatário (Quem recebe a mercadoria)</option>
                  <option value="1">Expedidor</option>
                  <option value="2">Recebedor</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {submitting ? 'Gerando...' : 'Confirmar e Criar Rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
