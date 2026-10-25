import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { BrainCircuit, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Info, Eye } from 'lucide-react';

interface Campo {
  id: number;
  documento: string;
  chave_campo: string;
  rotulo: string;
  tipo: string;
  opcoes: any;
  condicao_json: any;
  caminho_focus: string;
  obrigatorio: boolean;
  ordem: number;
  escopo: string;
  escopo_valores: any;
  ativo: boolean;
}

const VAZIO = {
  documento: 'CTE', chave_campo: '', rotulo: '', tipo: 'texto',
  opcoes: [] as any[], condicao_json: {} as any, caminho_focus: '',
  obrigatorio: false, ordem: 100, escopo: 'GLOBAL', escopo_valores: [] as any[], ativo: true
};

export default function CamposDinamicosPage() {
  const [documento, setDocumento] = useState('CTE');
  const [editando, setEditando] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [condicaoTexto, setCondicaoTexto] = useState('');
  const [opcoesTexto, setOpcoesTexto] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['campos-dinamicos', documento],
    queryFn: async () => (await api.get('/transporte/campos', { params: { documento } })).data
  });

  const campos: Campo[] = data?.data || [];

  const abrirEdicao = (c: Campo) => {
    setCondicaoTexto(c.condicao_json && Object.keys(c.condicao_json).length ? JSON.stringify(c.condicao_json) : '');
    setOpcoesTexto(Array.isArray(c.opcoes) && c.opcoes.length ? JSON.stringify(c.opcoes) : '');
    setEditando({
      documento: c.documento, chave_campo: c.chave_campo, rotulo: c.rotulo, tipo: c.tipo,
      opcoes: c.opcoes || [], condicao_json: c.condicao_json || {}, caminho_focus: c.caminho_focus || '',
      obrigatorio: c.obrigatorio, ordem: c.ordem, escopo: c.escopo, escopo_valores: c.escopo_valores || [], ativo: c.ativo
    });
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      let condicao = {};
      let opcoes: any[] = [];
      try {
        if (condicaoTexto.trim()) condicao = JSON.parse(condicaoTexto);
      } catch {
        alert('JSON inválido na condição de exibição.');
        setSalvando(false);
        return;
      }
      try {
        if (opcoesTexto.trim()) opcoes = JSON.parse(opcoesTexto);
      } catch {
        alert('JSON inválido nas opções.');
        setSalvando(false);
        return;
      }

      await api.post('/transporte/campos', { ...editando, condicao_json: condicao, opcoes });
      setEditando(null);
      refetch();
      alert('Campo dinâmico salvo!');
    } catch (err: any) {
      alert('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSalvando(false);
    }
  };

  const handleAlternarAtivo = async (campo: Campo) => {
    try {
      await api.patch(`/transporte/campos/${campo.id}`, { ativo: !campo.ativo });
      refetch();
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleExcluir = async (id: number) => {
    if (!confirm('Remover este campo do formulário?')) return;
    try {
      await api.delete(`/transporte/campos/${id}`);
      refetch();
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <BrainCircuit className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Campos Dinâmicos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Defina os campos dos formulários de CT-e e MDF-e. Adicionar ou esconder um campo é só um INSERT — sem deploy.
          </p>
        </div>
        <button
          onClick={() => {
            setCondicaoTexto('');
            setOpcoesTexto('');
            setEditando({ ...VAZIO, documento });
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Campo
        </button>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50">
        <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 dark:text-sky-200 space-y-1">
          <p className="font-semibold">Como funciona</p>
          <p className="text-sky-800/80 dark:text-sky-300/80">
            <strong>Condição</strong> (JSON) decide quando o campo aparece — ex.:
            <code className="px-1 py-0.5 mx-1 rounded bg-sky-100 dark:bg-sky-900/60 font-mono">{'{"campo":"modal","operador":"eq","valor":"1"}'}</code>
            mostra o campo apenas quando o modal for Rodoviário. <strong>Caminho Focus</strong> define onde o valor
            é gravado no XML da Focus (ex.: <code className="px-1 py-0.5 mx-1 rounded bg-sky-100 dark:bg-sky-900/60 font-mono">modal_rodoviario.rntrc</code>).
          </p>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
        {['CTE', 'MDFE'].map(d => (
          <button
            key={d}
            onClick={() => setDocumento(d)}
            className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
              documento === d
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {d === 'CTE' ? 'CT-e' : 'MDF-e'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando campos...</div>
      ) : campos.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <BrainCircuit className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum campo cadastrado para {documento}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Crie o primeiro campo para personalizar o formulário de emissão sem precisar alterar o código.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Ordem</th>
                  <th className="px-5 py-3.5">Rótulo</th>
                  <th className="px-5 py-3.5">Chave</th>
                  <th className="px-5 py-3.5">Tipo</th>
                  <th className="px-5 py-3.5">Caminho Focus</th>
                  <th className="px-5 py-3.5">Condição</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {campos.map(c => (
                  <tr key={c.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-700/30 ${!c.ativo ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5 text-xs text-slate-400 tabular-nums">{c.ordem}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-white">{c.rotulo}</p>
                      {c.obrigatorio && <span className="text-[10px] text-red-500 font-bold">OBRIGATÓRIO</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">{c.chave_campo}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{c.tipo}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{c.caminho_focus || '—'}</td>
                    <td className="px-5 py-3.5">
                      {c.condicao_json && Object.keys(c.condicao_json).length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-violet-600 dark:text-violet-400">
                          <Eye className="w-3 h-3" />
                          condicional
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">sempre visível</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1">
                      <button
                        onClick={() => handleAlternarAtivo(c)}
                        title={c.ativo ? 'Desativar' : 'Ativar'}
                        className="inline-flex p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300"
                      >
                        {c.ativo ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => abrirEdicao(c)}
                        className="inline-flex p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExcluir(c.id)}
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
              <BrainCircuit className="w-5 h-5 text-brand-600" />
              Campo Dinâmico
            </h2>

            <form onSubmit={handleSalvar} className="space-y-4 mt-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Documento *</label>
                  <select
                    value={editando.documento}
                    onChange={e => setEditando({ ...editando, documento: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="CTE">CT-e</option>
                    <option value="MDFE">MDF-e</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Tipo *</label>
                  <select
                    value={editando.tipo}
                    onChange={e => setEditando({ ...editando, tipo: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="texto">Texto</option>
                    <option value="numero">Número</option>
                    <option value="moeda">Moeda</option>
                    <option value="data">Data</option>
                    <option value="select">Seleção</option>
                    <option value="checkbox">Caixa de seleção</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Ordem</label>
                  <input
                    type="number"
                    value={editando.ordem}
                    onChange={e => setEditando({ ...editando, ordem: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Rótulo (exibido na tela) *</label>
                  <input
                    type="text" required
                    value={editando.rotulo}
                    onChange={e => setEditando({ ...editando, rotulo: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Chave técnica *</label>
                  <input
                    type="text" required placeholder="ex: seguro_numero_apolice"
                    value={editando.chave_campo}
                    onChange={e => setEditando({ ...editando, chave_campo: e.target.value.replace(/\s/g, '_') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Caminho na Focus NFe</label>
                <input
                  type="text" placeholder="ex: modal_rodoviario.rntrc"
                  value={editando.caminho_focus}
                  onChange={e => setEditando({ ...editando, caminho_focus: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Condição de exibição (JSON)</label>
                <textarea
                  rows={3}
                  placeholder='{"campo":"modal","operador":"eq","valor":"1"}'
                  value={condicaoTexto}
                  onChange={e => setCondicaoTexto(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Opções (JSON, para tipo "select")</label>
                <textarea
                  rows={3}
                  placeholder='[{"valor":"1","rotulo":"Rodoviário"}]'
                  value={opcoesTexto}
                  onChange={e => setOpcoesTexto(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                />
              </div>

              <div className="flex gap-5">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={editando.obrigatorio}
                    onChange={e => setEditando({ ...editando, obrigatorio: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Obrigatório
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={editando.ativo}
                    onChange={e => setEditando({ ...editando, ativo: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Ativo
                </label>
              </div>

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
                  {salvando ? 'Salvando...' : 'Salvar Campo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
