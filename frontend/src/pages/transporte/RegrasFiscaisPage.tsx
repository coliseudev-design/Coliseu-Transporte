import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Settings, Plus, Pencil, Trash2, Scale, Percent, Info } from 'lucide-react';

interface Regra {
  id: number;
  escopo: string;
  uf_origem: string;
  uf_destino: string;
  tipo_servico: string;
  situacao_tributaria: string;
  cfop: string;
  aliquota_icms: number;
  percentual_fcp: number;
  criterio_rateio: string;
  valor_minimo: number;
  valor_maximo: number;
  percentual_adicional: number;
  is_final_consumer: boolean;
  ativo: boolean;
}

const VAZIO = {
  escopo: 'GLOBAL', uf_origem: '', uf_destino: '', tipo_servico: '0',
  situacao_tributaria: '00', cfop: '5353', aliquota_icms: '12.00',
  percentual_fcp: '0.00', criterio_rateio: 'PESO',
  valor_minimo: '', valor_maximo: '', percentual_adicional: '0',
  is_final_consumer: false, ativo: true
};

export default function RegrasFiscaisPage() {
  const [editando, setEditando] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['regras-fiscais'],
    queryFn: async () => (await api.get('/transporte/regras')).data
  });

  const regras: Regra[] = data?.data || [];

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      await api.post('/transporte/regras', editando);
      setEditando(null);
      refetch();
      alert('Regra fiscal salva com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: number) => {
    if (!confirm('Excluir esta regra fiscal?')) return;
    try {
      await api.delete(`/transporte/regras/${id}`);
      refetch();
    } catch (err: any) {
      alert('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    }
  };

  const rotuloEscopo = (e: string) =>
    e === 'GLOBAL' ? 'Global' : e === 'UF' ? 'Por UF (mesma origem/destino)' : 'UF Origem × Destino';

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Regras Fiscais por UF
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Alíquotas de ICMS, FCP, partilha e critério de rateio do frete. Parametrizável sem deploy.
          </p>
        </div>
        <button
          onClick={() => setEditando({ ...VAZIO })}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Nova Regra
        </button>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:amber-800/50">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 dark:text-amber-200">
          A regra mais específica sempre prevalece: <strong>UF Origem × Destino</strong> tem prioridade sobre
          <strong> Por UF</strong>, que tem prioridade sobre <strong>Global</strong>. Alterar alíquotas aqui
          evita qualquer alteração de código.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando regras...</div>
      ) : regras.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Scale className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma regra configurada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Crie regras por rota (UF origem × destino) para calcular ICMS, FCP e rateio automaticamente
            na emissão do CT-e.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Escopo</th>
                  <th className="px-5 py-3.5">Rota</th>
                  <th className="px-5 py-3.5">CST / CFOP</th>
                  <th className="px-5 py-3.5">ICMS</th>
                  <th className="px-5 py-3.5">FCP</th>
                  <th className="px-5 py-3.5">Rateio</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {regras.map(r => (
                  <tr key={r.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-700/30 ${!r.ativo ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{rotuloEscopo(r.escopo)}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {r.escopo === 'GLOBAL' ? 'Todas' : `${r.uf_origem || '—'} → ${r.uf_destino || '—'}`}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {r.situacao_tributaria} / {r.cfop || '—'}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {Number(r.aliquota_icms || 0).toLocaleString('pt-BR')}%
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                      {Number(r.percentual_fcp || 0).toLocaleString('pt-BR')}%
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {r.criterio_rateio}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1">
                      <button
                        onClick={() => setEditando({
                          escopo: r.escopo, uf_origem: r.uf_origem || '', uf_destino: r.uf_destino || '',
                          tipo_servico: r.tipo_servico || '0', situacao_tributaria: r.situacao_tributaria,
                          cfop: r.cfop || '', aliquota_icms: String(r.aliquota_icms ?? ''),
                          percentual_fcp: String(r.percentual_fcp ?? ''), criterio_rateio: r.criterio_rateio,
                          valor_minimo: r.valor_minimo ? String(r.valor_minimo) : '',
                          valor_maximo: r.valor_maximo ? String(r.valor_maximo) : '',
                          percentual_adicional: String(r.percentual_adicional ?? 0),
                          is_final_consumer: r.is_final_consumer, ativo: r.ativo
                        })}
                        className="inline-flex p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExcluir(r.id)}
                        className="inline-flex p-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 hover:bg-red-100 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 my-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-brand-600" />
              Regra Fiscal
            </h2>

            <form onSubmit={handleSalvar} className="space-y-4 mt-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Escopo *</label>
                  <select
                    value={editando.escopo}
                    onChange={e => setEditando({ ...editando, escopo: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="GLOBAL">Global (todas as rotas)</option>
                    <option value="UF">Por UF</option>
                    <option value="UF_PAR">UF Origem × Destino</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF Origem</label>
                  <input
                    type="text" maxLength={2}
                    value={editando.uf_origem}
                    onChange={e => setEditando({ ...editando, uf_origem: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF Destino</label>
                  <input
                    type="text" maxLength={2}
                    value={editando.uf_destino}
                    onChange={e => setEditando({ ...editando, uf_destino: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CST *</label>
                  <input
                    type="text" required maxLength={2}
                    value={editando.situacao_tributaria}
                    onChange={e => setEditando({ ...editando, situacao_tributaria: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CFOP</label>
                  <input
                    type="text" placeholder="5353"
                    value={editando.cfop}
                    onChange={e => setEditando({ ...editando, cfop: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Alíquota ICMS (%)</label>
                  <input
                    type="number" step="0.0001"
                    value={editando.aliquota_icms}
                    onChange={e => setEditando({ ...editando, aliquota_icms: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">FCP (%)</label>
                  <input
                    type="number" step="0.0001"
                    value={editando.percentual_fcp}
                    onChange={e => setEditando({ ...editando, percentual_fcp: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Critério de Rateio</label>
                  <select
                    value={editando.criterio_rateio}
                    onChange={e => setEditando({ ...editando, criterio_rateio: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="PESO">Por Peso</option>
                    <option value="VALOR">Por Valor da Carga</option>
                    <option value="VOLUME">Por Volume</option>
                    <option value="FIXO">Valor Fixo</option>
                    <option value="COMBINADO">Combinado</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Frete Mínimo</label>
                  <input
                    type="number" step="0.01"
                    value={editando.valor_minimo}
                    onChange={e => setEditando({ ...editando, valor_minimo: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Frete Máximo</label>
                  <input
                    type="number" step="0.01"
                    value={editando.valor_maximo}
                    onChange={e => setEditando({ ...editando, valor_maximo: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Adicional (%)</label>
                  <input
                    type="number" step="0.01"
                    value={editando.percentual_adicional}
                    onChange={e => setEditando({ ...editando, percentual_adicional: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={editando.is_final_consumer}
                  onChange={e => setEditando({ ...editando, is_final_consumer: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Destinatário é consumidor final (aplica DIFAL e partilha do FCP)
              </label>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button" onClick={() => setEditando(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={salvando}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm"
                >
                  {salvando ? 'Salvando...' : 'Salvar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
