import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Building2, Plus, Pencil, KeyRound, ShieldCheck,
  AlertTriangle, CheckCircle2, Trash2, MapPin
} from 'lucide-react';

interface Emitente {
  id: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  rntrc: string;
  focus_ambiente: 'homologacao' | 'producao';
  uf: string;
  municipio: string;
  inscricao_estadual?: string;
  ativo: boolean;
}

const VAZIO = {
  id: 0,
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  rntrc: '',
  uf: '',
  municipio: '',
  codigo_municipio: '',
  focus_token: '',
  focus_ambiente: 'homologacao' as 'homologacao' | 'producao'
};

export default function EmitentesPage() {
  const [editando, setEditando] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['emitentes'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });

  const emitentes: Emitente[] = data?.data || [];

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      await api.post('/transporte/emitentes', editando);
      setEditando(null);
      refetch();
      alert('Transportadora (emitente) salva com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Building2 className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Transportadoras (Emitentes Fiscais)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cada CNPJ emissor tem seu próprio token da Focus NFe e ambiente de autorização.
          </p>
        </div>
        <button
          onClick={() => setEditando({ ...VAZIO })}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Nova Transportadora
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando emitentes...</div>
      ) : emitentes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Building2 className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma transportadora cadastrada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Cadastre o CNPJ que emitirá os CT-e e MDF-e. Informe o token da Focus NFe da empresa e
            escolha o ambiente (homologação ou produção).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {emitentes.map(em => (
            <div key={em.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate">{em.razao_social}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{em.cnpj}</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  em.focus_ambiente === 'producao'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                }`}>
                  {em.focus_ambiente}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-400">
                    {em.municipio || '—'}{em.uf ? `/${em.uf}` : ''}
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-400 font-mono">RNTRC {em.rntrc || '—'}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-400">IE {em.inscricao_estadual || '—'}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-end">
                <button
                  onClick={() => setEditando({
                    ...VAZIO,
                    id: em.id,
                    cnpj: em.cnpj,
                    razao_social: em.razao_social,
                    nome_fantasia: em.nome_fantasia || '',
                    inscricao_estadual: em.inscricao_estadual || '',
                    rntrc: em.rntrc || '',
                    uf: em.uf || '',
                    municipio: em.municipio || '',
                    focus_ambiente: em.focus_ambiente
                  })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      {editando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 my-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand-600" />
              {editando.id ? 'Editar Transportadora' : 'Nova Transportadora'}
            </h2>

            <form onSubmit={handleSalvar} className="space-y-4 mt-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CNPJ *</label>
                  <input
                    type="text" required placeholder="00.000.000/0000-00"
                    value={editando.cnpj}
                    onChange={e => setEditando({ ...editando, cnpj: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Razão Social *</label>
                  <input
                    type="text" required
                    value={editando.razao_social}
                    onChange={e => setEditando({ ...editando, razao_social: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Nome Fantasia</label>
                  <input
                    type="text"
                    value={editando.nome_fantasia}
                    onChange={e => setEditando({ ...editando, nome_fantasia: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Inscrição Estadual</label>
                  <input
                    type="text"
                    value={editando.inscricao_estadual}
                    onChange={e => setEditando({ ...editando, inscricao_estadual: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">RNTRC</label>
                  <input
                    type="text" placeholder="Obrigatório para MDF-e rodoviário"
                    value={editando.rntrc}
                    onChange={e => setEditando({ ...editando, rntrc: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Ambiente Focus NFe *</label>
                  <select
                    value={editando.focus_ambiente}
                    onChange={e => setEditando({ ...editando, focus_ambiente: e.target.value as 'homologacao' | 'producao' })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="homologacao">Homologação (testes)</option>
                    <option value="producao">Produção (SEFAZ real)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Token da Focus NFe</label>
                  <input
                    type="password" placeholder={editando.id ? 'Deixe vazio para manter o atual' : 'Token da empresa na Focus'}
                    value={editando.focus_token}
                    onChange={e => setEditando({ ...editando, focus_token: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Município</label>
                  <input
                    type="text"
                    value={editando.municipio}
                    onChange={e => setEditando({ ...editando, municipio: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF</label>
                  <input
                    type="text" maxLength={2}
                    value={editando.uf}
                    onChange={e => setEditando({ ...editando, uf: e.target.value.toUpperCase() })}
                    className="w-24 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Código IBGE do Município</label>
                  <input
                    type="text" placeholder="Ex: 5107875 (Cuiabá/MT)"
                    value={editando.codigo_municipio}
                    onChange={e => setEditando({ ...editando, codigo_municipio: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    O código IBGE é obrigatório na emissão do CT-e (município de envio).
                  </p>
                </div>
              </div>

              {editando.focus_ambiente === 'producao' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Em <strong>produção</strong>, os documentos transmissions são autorizados de verdade pela SEFAZ
                    e não podem ser cancelados após 7 dias. Valide em homologação antes.
                  </p>
                </div>
              )}

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
                  {salvando ? 'Salvando...' : 'Salvar Transportadora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
