import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Settings, Plus, Pencil, Trash2, Scale, Percent, Info, Calculator } from 'lucide-react';

interface TabelaFrete {
  id?: number;
  nome: string;
  uf_origem: string;
  uf_destino: string;
  regiao_nome: string;
  cliente_documento: string;
  taxa_fixa: string;
  valor_por_kg: string;
  frete_minimo: string;
  percentual_ad_valorem: string;
  percentual_gris: string;
  pedagio_por_100kg: string;
  ativo: boolean;
}

const TABELA_VAZIA: TabelaFrete = {
  nome: '',
  uf_origem: 'MS',
  uf_destino: '',
  regiao_nome: '',
  cliente_documento: '',
  taxa_fixa: '0.00',
  valor_por_kg: '0.45',
  frete_minimo: '80.00',
  percentual_ad_valorem: '0.30',
  percentual_gris: '0.15',
  pedagio_por_100kg: '4.50',
  ativo: true
};

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
  ibs_cbs_cst?: string;
  ibs_cbs_class_trib?: string;
  aliquota_ibs?: number;
  aliquota_ibs_mun?: number;
  aliquota_cbs?: number;
  reducao_aliquota_ibs_cbs?: number;
  diferimento_ibs_cbs?: number;
  codigo_situacao_fiscal?: string;
  vigente_de?: string;
  vigente_ate?: string;
}

interface FormRegra {
  id?: number;
  escopo: string;
  uf_origem: string;
  uf_destino: string;
  tipo_servico: string;
  situacao_tributaria: string;
  cfop: string;
  aliquota_icms: string;
  percentual_fcp: string;
  criterio_rateio: string;
  valor_minimo: string;
  valor_maximo: string;
  percentual_adicional: string;
  is_final_consumer: boolean;
  ativo: boolean;
  ibs_cbs_cst: string;
  ibs_cbs_class_trib: string;
  aliquota_ibs: string;
  aliquota_ibs_mun: string;
  aliquota_cbs: string;
  reducao_aliquota_ibs_cbs: string;
  vigente_de: string;
  vigente_ate: string;
}

const VAZIO: FormRegra = {
  escopo: 'UF_PAR', uf_origem: 'MS', uf_destino: 'MS', tipo_servico: '0',
  situacao_tributaria: '00', cfop: '5353', aliquota_icms: '17.00',
  percentual_fcp: '0.00', criterio_rateio: 'PESO',
  valor_minimo: '', valor_maximo: '', percentual_adicional: '0',
  is_final_consumer: false, ativo: true,
  ibs_cbs_cst: '000', ibs_cbs_class_trib: '000001',
  aliquota_ibs: '0.10', aliquota_ibs_mun: '0.00', aliquota_cbs: '0.90',
  reducao_aliquota_ibs_cbs: '0.00', vigente_de: '2026-01-01', vigente_ate: ''
};

export default function RegrasFiscaisPage() {
  const [editando, setEditando] = useState<FormRegra | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aplicandoMs, setAplicandoMs] = useState(false);
  const [editandoTabela, setEditandoTabela] = useState<TabelaFrete | null>(null);
  const [salvandoTabela, setSalvandoTabela] = useState(false);

  const { data: tabelasResp, refetch: refetchTabelas } = useQuery({
    queryKey: ['tabelas-frete'],
    queryFn: async () => (await api.get('/transporte/tabelas-frete')).data
  });
  const tabelasFrete: any[] = tabelasResp?.data || [];

  const salvarTabelaFrete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoTabela) return;
    setSalvandoTabela(true);
    try {
      if (editandoTabela.id) {
        await api.put(`/transporte/tabelas-frete/${editandoTabela.id}`, editandoTabela);
      } else {
        await api.post('/transporte/tabelas-frete', editandoTabela);
      }
      setEditandoTabela(null);
      await refetchTabelas();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao salvar Tabela de Frete.');
    } finally {
      setSalvandoTabela(false);
    }
  };

  const excluirTabelaFrete = async (id: number) => {
    if (!confirm('Excluir esta Tabela de Frete?')) return;
    try {
      await api.delete(`/transporte/tabelas-frete/${id}`);
      await refetchTabelas();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir Tabela de Frete.');
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['regras-fiscais'],
    queryFn: async () => (await api.get('/transporte/regras')).data
  });

  const regras: Regra[] = data?.data || [];

  const handleAplicarLegislacaoMs = async () => {
    setAplicandoMs(true);
    try {
      const resp = await api.post('/transporte/regras/padrao-ms', { incluir_corredores: true });
      await refetch();
      alert(resp.data?.message || 'Regras fiscais SEFAZ/MS aplicadas com sucesso!');
    } catch (err: any) {
      alert('Erro ao aplicar legislação SEFAZ/MS: ' + (err.response?.data?.error || err.message));
    } finally {
      setAplicandoMs(false);
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      const payload = {
        ...editando,
        codigo_situacao_fiscal: editando.ibs_cbs_class_trib,
      };
      if (editando.id) {
        await api.patch(`/transporte/regras/${editando.id}`, payload);
      } else {
        await api.post('/transporte/regras', payload);
      }
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
            Alíquotas de ICMS, Reforma Tributária (IBS / CBS — LC 214/2025), FCP, partilha e critério de rateio do frete. Parametrizável sem deploy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleAplicarLegislacaoMs}
            disabled={aplicandoMs}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 shadow-sm transition-all disabled:opacity-50"
          >
            <Scale className="w-4 h-4 text-emerald-600" />
            {aplicandoMs ? 'Aplicando SEFAZ/MS...' : 'Aplicar Legislação SEFAZ/MS'}
          </button>
          <button
            onClick={() => setEditando({ ...VAZIO })}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Regra
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 dark:text-amber-200">
          <strong>Legislação SEFAZ/MS vigente:</strong> Operações internas no Mato Grosso do Sul (<strong>MS → MS</strong>) utilizam
          <strong> CFOP 5353</strong>, <strong>CST 00</strong> e <strong>ICMS 17,00%</strong> (Art. 41, III da Lei Estadual MS nº 1.810/1997, FCP 0,00%).
          Operações interestaduais iniciadas no MS (<strong>MS → Outra UF</strong>) utilizam <strong>CFOP 6353</strong> e
          <strong> ICMS 12,00%</strong> (Resolução SF nº 22/1989). Na Reforma Tributária 2026 (LC 214/2025): <strong>CST 000</strong>,
          <strong> cClassTrib 000001</strong>, <strong>IBS UF 0,10%</strong> e <strong>CBS 0,90%</strong>.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando regras...</div>
      ) : regras.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Scale className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma regra configurada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Crie regras por rota (UF origem × destino) para calcular ICMS, IBS/CBS, FCP e rateio automaticamente
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
                  <th className="px-5 py-3.5">IBS / CBS (Reforma)</th>
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
                    <td className="px-5 py-3.5 text-xs">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                        IBS {Number(r.aliquota_ibs ?? 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% + CBS {Number(r.aliquota_cbs ?? 0.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        CST {r.ibs_cbs_cst || '000'} · cClassTrib {r.ibs_cbs_class_trib || r.codigo_situacao_fiscal || '000001'}
                      </div>
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
                          id: r.id,
                          escopo: r.escopo, uf_origem: r.uf_origem || '', uf_destino: r.uf_destino || '',
                          tipo_servico: r.tipo_servico || '0', situacao_tributaria: r.situacao_tributaria,
                          cfop: r.cfop || '', aliquota_icms: String(r.aliquota_icms ?? ''),
                          percentual_fcp: String(r.percentual_fcp ?? ''), criterio_rateio: r.criterio_rateio,
                          valor_minimo: r.valor_minimo ? String(r.valor_minimo) : '',
                          valor_maximo: r.valor_maximo ? String(r.valor_maximo) : '',
                          percentual_adicional: String(r.percentual_adicional ?? 0),
                          is_final_consumer: r.is_final_consumer, ativo: r.ativo,
                          ibs_cbs_cst: r.ibs_cbs_cst || '000',
                          ibs_cbs_class_trib: r.ibs_cbs_class_trib || r.codigo_situacao_fiscal || '000001',
                          aliquota_ibs: String(r.aliquota_ibs ?? '0.10'),
                          aliquota_ibs_mun: String(r.aliquota_ibs_mun ?? '0.00'),
                          aliquota_cbs: String(r.aliquota_cbs ?? '0.90'),
                          reducao_aliquota_ibs_cbs: String(r.reducao_aliquota_ibs_cbs ?? '0.00'),
                          vigente_de: r.vigente_de ? String(r.vigente_de).slice(0, 10) : '2026-01-01',
                          vigente_ate: r.vigente_ate ? String(r.vigente_ate).slice(0, 10) : '',
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
              {editando.id ? `Editar Regra Fiscal #${editando.id}` : 'Nova Regra Fiscal'}
            </h2>

            <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/70">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Preenchimento Rápido — Legislação Vigente SEFAZ/MS
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditando({
                      ...editando,
                      escopo: 'UF_PAR',
                      uf_origem: 'MS',
                      uf_destino: 'MS',
                      situacao_tributaria: '00',
                      cfop: '5353',
                      aliquota_icms: '17.00',
                      percentual_fcp: '0.00',
                      ibs_cbs_cst: '000',
                      ibs_cbs_class_trib: '000001',
                      aliquota_ibs: '0.10',
                      aliquota_ibs_mun: '0.00',
                      aliquota_cbs: '0.90',
                      reducao_aliquota_ibs_cbs: '0.00',
                    })
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-all"
                >
                  MS Interno (MS → MS · CFOP 5353 · ICMS 17%)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditando({
                      ...editando,
                      escopo: 'UF',
                      uf_origem: 'MS',
                      uf_destino: '',
                      situacao_tributaria: '00',
                      cfop: '6353',
                      aliquota_icms: '12.00',
                      percentual_fcp: '0.00',
                      ibs_cbs_cst: '000',
                      ibs_cbs_class_trib: '000001',
                      aliquota_ibs: '0.10',
                      aliquota_ibs_mun: '0.00',
                      aliquota_cbs: '0.90',
                      reducao_aliquota_ibs_cbs: '0.00',
                    })
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all"
                >
                  MS Interestadual (MS → Outra UF · CFOP 6353 · ICMS 12%)
                </button>
              </div>
            </div>

            <form onSubmit={handleSalvar} className="space-y-4 mt-4 text-sm">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CST ICMS *</label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-emerald-600" />
                      Reforma Tributária do Consumo — IBS / CBS (LC 214/2025 · NT 2025.001 / 2026.002)
                    </h3>
                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80 mt-0.5">
                      Obrigatório na emissão de CT-e 4.00 (evita Rejeição SEFAZ 310 — IBS/CBS não informado).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditando({
                        ...editando,
                        ibs_cbs_cst: '000',
                        ibs_cbs_class_trib: '000001',
                        aliquota_ibs: '0.10',
                        aliquota_ibs_mun: '0.00',
                        aliquota_cbs: '0.90',
                        reducao_aliquota_ibs_cbs: '0.00',
                      })
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    Aplicar Padrão Transição 2026 (IBS 0,10% + CBS 0,90%)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                      CST IBS/CBS *
                    </label>
                    <select
                      value={editando.ibs_cbs_cst}
                      onChange={e => {
                        const cst = e.target.value;
                        const classSug =
                          cst === '200'
                            ? '200002'
                            : cst === '410'
                            ? '410001'
                            : cst === '510'
                            ? '510001'
                            : cst === '515'
                            ? '515001'
                            : '000001';
                        setEditando({
                          ...editando,
                          ibs_cbs_cst: cst,
                          ibs_cbs_class_trib: classSug,
                        });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-mono"
                    >
                      <option value="000">000 — Tributação integral</option>
                      <option value="200">200 — Alíquota reduzida</option>
                      <option value="410">410 — Imunidade e não incidência</option>
                      <option value="510">510 — Diferimento</option>
                      <option value="515">515 — Diferimento com redução de alíquota</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Classificação Tributária (cClassTrib) *
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      placeholder="000001"
                      value={editando.ibs_cbs_class_trib}
                      onChange={e => setEditando({ ...editando, ibs_cbs_class_trib: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Redução Alíquota IBS/CBS (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editando.reducao_aliquota_ibs_cbs}
                      onChange={e => setEditando({ ...editando, reducao_aliquota_ibs_cbs: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Alíquota IBS UF (%)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editando.aliquota_ibs}
                      onChange={e => setEditando({ ...editando, aliquota_ibs: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Alíquota IBS Municipal (%)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editando.aliquota_ibs_mun}
                      onChange={e => setEditando({ ...editando, aliquota_ibs_mun: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Alíquota CBS Federal (%)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editando.aliquota_cbs}
                      onChange={e => setEditando({ ...editando, aliquota_cbs: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                    />
                  </div>
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

      {/* ═══ SEÇÃO: TABELAS DE FRETE COMERCIAIS (AUTOMAÇÃO DO CT-E) ═══ */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-sky-600" />
              Tabelas de Frete Comerciais (Cálculo Automático no CT-e)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Parametrize Frete Peso (R$/kg + Taxa Fixa + Mínimo), Ad Valorem (%), GRIS (%) e Pedágio por fração de 100 kg para preencher o CT-e em 1 clique.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditandoTabela({ ...TABELA_VAZIA })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova Tabela de Frete
          </button>
        </div>

        {tabelasFrete.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
            Nenhuma Tabela de Frete cadastrada. Clique em "Nova Tabela de Frete" para automatizar o cálculo de componentes na emissão de CT-e.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/50 font-semibold text-slate-500 uppercase border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Tabela</th>
                  <th className="px-4 py-3">Rota / Cliente</th>
                  <th className="px-4 py-3">Frete Peso / Mín.</th>
                  <th className="px-4 py-3">Ad Valorem / GRIS</th>
                  <th className="px-4 py-3">Pedágio / 100kg</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {tabelasFrete.map(tb => (
                  <tr key={tb.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{tb.nome}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {(tb.uf_origem || 'Qualquer')} → {(tb.uf_destino || 'Qualquer')}
                      {tb.regiao_nome ? ` · ${tb.regiao_nome}` : ''}
                      {tb.cliente_documento ? ` · Doc ${tb.cliente_documento}` : ''}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      R$ {Number(tb.valor_por_kg || 0).toFixed(2)}/kg + R$ {Number(tb.taxa_fixa || 0).toFixed(2)} (Mín R$ {Number(tb.frete_minimo || 0).toFixed(2)})
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {Number(tb.percentual_ad_valorem || 0).toFixed(2)}% / {Number(tb.percentual_gris || 0).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      R$ {Number(tb.pedagio_por_100kg || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setEditandoTabela({
                          id: tb.id,
                          nome: tb.nome || '',
                          uf_origem: tb.uf_origem || '',
                          uf_destino: tb.uf_destino || '',
                          regiao_nome: tb.regiao_nome || '',
                          cliente_documento: tb.cliente_documento || '',
                          taxa_fixa: String(tb.taxa_fixa ?? '0'),
                          valor_por_kg: String(tb.valor_por_kg ?? '0'),
                          frete_minimo: String(tb.frete_minimo ?? '0'),
                          percentual_ad_valorem: String(tb.percentual_ad_valorem ?? '0'),
                          percentual_gris: String(tb.percentual_gris ?? '0'),
                          pedagio_por_100kg: String(tb.pedagio_por_100kg ?? '0'),
                          ativo: Boolean(tb.ativo)
                        })}
                        className="inline-flex p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => excluirTabelaFrete(tb.id)}
                        className="inline-flex p-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editandoTabela && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 my-8">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-sky-600" />
              {editandoTabela.id ? 'Editar Tabela de Frete' : 'Nova Tabela de Frete'}
            </h3>
            <form onSubmit={salvarTabelaFrete} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome da Tabela *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tabela Padrão Fracionado MS → SP"
                  value={editandoTabela.nome}
                  onChange={e => setEditandoTabela({ ...editandoTabela, nome: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">UF Origem</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="MS"
                    value={editandoTabela.uf_origem}
                    onChange={e => setEditandoTabela({ ...editandoTabela, uf_origem: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">UF Destino</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Opcional"
                    value={editandoTabela.uf_destino}
                    onChange={e => setEditandoTabela({ ...editandoTabela, uf_destino: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">CNPJ/CPF Tomador (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Exclusiva p/ cliente"
                    value={editandoTabela.cliente_documento}
                    onChange={e => setEditandoTabela({ ...editandoTabela, cliente_documento: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Valor por Kg (R$)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editandoTabela.valor_por_kg}
                    onChange={e => setEditandoTabela({ ...editandoTabela, valor_por_kg: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Taxa Fixa Despacho (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editandoTabela.taxa_fixa}
                    onChange={e => setEditandoTabela({ ...editandoTabela, taxa_fixa: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Frete Mínimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editandoTabela.frete_minimo}
                    onChange={e => setEditandoTabela({ ...editandoTabela, frete_minimo: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ad Valorem (%)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editandoTabela.percentual_ad_valorem}
                    onChange={e => setEditandoTabela({ ...editandoTabela, percentual_ad_valorem: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">GRIS (%)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editandoTabela.percentual_gris}
                    onChange={e => setEditandoTabela({ ...editandoTabela, percentual_gris: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pedágio / 100 kg (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editandoTabela.pedagio_por_100kg}
                    onChange={e => setEditandoTabela({ ...editandoTabela, pedagio_por_100kg: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditandoTabela(null)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoTabela}
                  className="px-5 py-2 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                >
                  {salvandoTabela ? 'Salvando...' : 'Salvar Tabela'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
