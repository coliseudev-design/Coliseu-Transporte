import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Building2, ShieldCheck, KeyRound, Save, AlertCircle,
  CheckCircle2, MapPin, Phone, Mail, FileText
} from 'lucide-react';

interface EmitenteForm {
  id?: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  rntrc: string;
  focus_token: string;
  focus_ambiente: 'homologacao' | 'producao';
  uf: string;
  municipio: string;
  codigo_municipio: string;
}

export default function DadosEmpresaPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<EmitenteForm>({
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    inscricao_estadual: '',
    rntrc: '',
    focus_token: '',
    focus_ambiente: 'homologacao',
    uf: 'MS',
    municipio: 'Dourados',
    codigo_municipio: '5003702'
  });

  const { data, isLoading } = useQuery({
    queryKey: ['empresa-emitente'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });

  const emitentes = data?.data || [];

  useEffect(() => {
    if (emitentes.length > 0) {
      const em = emitentes[0];
      setForm({
        id: em.id,
        cnpj: em.cnpj || '',
        razao_social: em.razao_social || '',
        nome_fantasia: em.nome_fantasia || '',
        inscricao_estadual: em.inscricao_estadual || '',
        rntrc: em.rntrc || '',
        focus_token: '', // Mantém vazio para não expor
        focus_ambiente: em.focus_ambiente || 'homologacao',
        uf: em.uf || 'MS',
        municipio: em.municipio || 'Dourados',
        codigo_municipio: em.codigo_municipio || '5003702'
      });
    }
  }, [emitentes.length]);

  const salvar = useMutation({
    mutationFn: async (payload: EmitenteForm) => api.post('/transporte/emitentes', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-emitente'] });
      qc.invalidateQueries({ queryKey: ['emitentes-cargas'] });
      alert('Dados da empresa emitente atualizados com sucesso!');
    },
    onError: (err: any) => {
      alert('Erro ao salvar dados: ' + (err.response?.data?.error || err.message));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    salvar.mutate(form);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <Building2 className="w-7 h-7 text-brand-600 dark:text-brand-500" />
          Dados da Empresa (Emitente Fiscal)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configurações fiscais da transportadora/empresa emitente do CT-e e MDF-e junto à SEFAZ e Focus NFe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 space-y-6 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              CNPJ da Empresa *
            </label>
            <input
              type="text"
              required
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={e => setForm({ ...form, cnpj: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              Inscrição Estadual (IE) *
            </label>
            <input
              type="text"
              required
              placeholder="Inscrição Estadual da SEFAZ"
              value={form.inscricao_estadual}
              onChange={e => setForm({ ...form, inscricao_estadual: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              Razão Social Completa *
            </label>
            <input
              type="text"
              required
              placeholder="Nome empresarial registrado na Receita Federal"
              value={form.razao_social}
              onChange={e => setForm({ ...form, razao_social: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              Nome Fantasia
            </label>
            <input
              type="text"
              placeholder="Nome comercial da empresa"
              value={form.nome_fantasia}
              onChange={e => setForm({ ...form, nome_fantasia: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              RNTRC (Registro Nacional de Transportadores)
            </label>
            <input
              type="text"
              placeholder="Obrigatório para MDF-e rodoviário comercial"
              value={form.rntrc}
              onChange={e => setForm({ ...form, rntrc: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Localização do Emitente (Base Fiscal)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Município *
              </label>
              <input
                type="text"
                required
                value={form.municipio}
                onChange={e => setForm({ ...form, municipio: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                UF *
              </label>
              <input
                type="text"
                required
                maxLength={2}
                value={form.uf}
                onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                className="w-24 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Código IBGE do Município *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 5003702 (Dourados/MS)"
                value={form.codigo_municipio}
                onChange={e => setForm({ ...form, codigo_municipio: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Credenciais da API Focus NFe
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Ambiente de Emissão *
              </label>
              <select
                value={form.focus_ambiente}
                onChange={e => setForm({ ...form, focus_ambiente: e.target.value as any })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
              >
                <option value="homologacao">🟡 Homologação (Ambiente de Testes da SEFAZ)</option>
                <option value="producao">🟢 Produção (Autorização Fiscal Real com Validade Jurídica)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Token de Acesso Focus NFe
              </label>
              <input
                type="password"
                placeholder="Deixe em branco para manter o token atual"
                value={form.focus_token}
                onChange={e => setForm({ ...form, focus_token: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                O token fornecido no painel da Focus NFe correspondente a este CNPJ.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <button
            type="submit"
            disabled={salvar.isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-all"
          >
            <Save className="w-4 h-4" />
            {salvar.isPending ? 'Salvando...' : 'Salvar Dados Fiscais da Empresa'}
          </button>
        </div>
      </form>
    </div>
  );
}
