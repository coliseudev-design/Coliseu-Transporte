import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Users, Plus, Pencil, Search, MapPin, Building2 } from 'lucide-react';

interface Parte {
  id: number;
  documento: string;
  tipo_documento: 'CNPJ' | 'CPF';
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  indicador_ie: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  codigo_municipio: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
  ativo: boolean;
}

const VAZIO: Partial<Parte> = {
  documento: '', tipo_documento: 'CNPJ', razao_social: '', nome_fantasia: '',
  inscricao_estadual: '', indicador_ie: '9', logradouro: '', numero: '',
  complemento: '', bairro: '', cep: '', codigo_municipio: '', municipio: '',
  uf: '', telefone: '', email: ''
};

export default function PartesPage() {
  const [search, setSearch] = useState('');
  const [editando, setEditando] = useState<Partial<Parte> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['partes', search],
    queryFn: async () => (await api.get('/transporte/partes', { params: { search } })).data
  });

  const partes: Parte[] = data?.data || [];

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      await api.post('/transporte/partes', editando);
      setEditando(null);
      refetch();
      alert('Parte cadastrada com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSalvando(false);
    }
  };

  const rotuloIE = (v: string) =>
    v === '1' ? 'Contribuinte' : v === '2' ? 'Isento' : 'Não Contribuinte';

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Clientes &amp; Destinatários
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Partes do transporte (remetente, destinatário, tomador, expedidor, recebedor) com dados fiscais completos.
          </p>
        </div>
        <button
          onClick={() => setEditando({ ...VAZIO })}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Nova Parte
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome, razão social ou documento..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
        />
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando partes...</div>
      ) : partes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Users className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma parte cadastrada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Cadastre remetentes e destinatários com inscrição estadual e município (com código IBGE)
            para que o CT-e seja aceito pela SEFAZ sem rejeição.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Razão Social</th>
                  <th className="px-5 py-3.5">Documento</th>
                  <th className="px-5 py-3.5">IE</th>
                  <th className="px-5 py-3.5">Município</th>
                  <th className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {partes.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-white truncate max-w-xs">{p.razao_social}</p>
                      {p.nome_fantasia && <p className="text-xs text-slate-400 truncate max-w-xs">{p.nome_fantasia}</p>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">{p.documento}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {rotuloIE(p.indicador_ie)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {p.municipio || '—'}{p.uf ? `/${p.uf}` : ''}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setEditando({ ...p })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-medium"
                      >
                        <Pencil className="w-3.5 h-3.5" />
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
              <Building2 className="w-5 h-5 text-brand-600" />
              {editando.id ? 'Editar Parte' : 'Nova Parte'}
            </h2>

            <form onSubmit={handleSalvar} className="space-y-4 mt-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Tipo *</label>
                  <select
                    value={editando.tipo_documento}
                    onChange={e => setEditando({ ...editando, tipo_documento: e.target.value as any })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="CNPJ">CNPJ</option>
                    <option value="CPF">CPF</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Documento *</label>
                  <input
                    type="text" required placeholder="Somente números"
                    value={editando.documento}
                    onChange={e => setEditando({ ...editando, documento: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
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
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Inscrição Estadual</label>
                  <input
                    type="text"
                    value={editando.inscricao_estadual}
                    onChange={e => setEditando({ ...editando, inscricao_estadual: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Indicador de IE</label>
                  <select
                    value={editando.indicador_ie}
                    onChange={e => setEditando({ ...editando, indicador_ie: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="9">9 — Não Contribuinte</option>
                    <option value="1">1 — Contribuinte ICMS</option>
                    <option value="2">2 — Isento de Inscrição</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Logradouro</label>
                  <input
                    type="text"
                    value={editando.logradouro}
                    onChange={e => setEditando({ ...editando, logradouro: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Número</label>
                  <input
                    type="text"
                    value={editando.numero}
                    onChange={e => setEditando({ ...editando, numero: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Complemento</label>
                  <input
                    type="text"
                    value={editando.complemento}
                    onChange={e => setEditando({ ...editando, complemento: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Bairro</label>
                  <input
                    type="text"
                    value={editando.bairro}
                    onChange={e => setEditando({ ...editando, bairro: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CEP</label>
                  <input
                    type="text"
                    value={editando.cep}
                    onChange={e => setEditando({ ...editando, cep: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Código IBGE</label>
                  <input
                    type="text" placeholder="5107875"
                    value={editando.codigo_municipio}
                    onChange={e => setEditando({ ...editando, codigo_municipio: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Município</label>
                  <input
                    type="text"
                    value={editando.municipio}
                    onChange={e => setEditando({ ...editando, municipio: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF</label>
                  <input
                    type="text" maxLength={2}
                    value={editando.uf}
                    onChange={e => setEditando({ ...editando, uf: e.target.value.toUpperCase() })}
                    className="w-24 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Telefone</label>
                  <input
                    type="text"
                    value={editando.telefone}
                    onChange={e => setEditando({ ...editando, telefone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">E-mail</label>
                  <input
                    type="email"
                    value={editando.email}
                    onChange={e => setEditando({ ...editando, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
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
                  {salvando ? 'Salvando...' : 'Salvar Parte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
