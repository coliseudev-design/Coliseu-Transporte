import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Building2, ShieldCheck, KeyRound, Save,
  CheckCircle2, MapPin, FileText, Wifi, Loader2, AlertTriangle
} from 'lucide-react';

interface EmitenteForm {
  id?: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  regime_tributario: string;
  rntrc: string;
  focus_token: string;
  focus_token_homologacao: string;
  focus_token_producao: string;
  focus_ambiente: 'homologacao' | 'producao';
  uf: string;
  municipio: string;
  codigo_municipio: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  telefone: string;
  email: string;
  serie_cte: string;
  serie_mdfe: string;
  cfop_padrao_cte: string;
  natureza_padrao_cte: string;
  aliquota_icms_padrao: string;
}

export default function DadosEmpresaPage() {
  const qc = useQueryClient();
  const [testingAmb, setTestingAmb] = useState<'homologacao' | 'producao' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [form, setForm] = useState<EmitenteForm>({
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    inscricao_estadual: '',
    regime_tributario: '3',
    rntrc: '',
    focus_token: '',
    focus_token_homologacao: '',
    focus_token_producao: '',
    focus_ambiente: 'homologacao',
    uf: 'MS',
    municipio: 'Dourados',
    codigo_municipio: '5003702',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    telefone: '',
    email: '',
    serie_cte: '1',
    serie_mdfe: '1',
    cfop_padrao_cte: '5353',
    natureza_padrao_cte: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    aliquota_icms_padrao: '12.00'
  });

  const { data } = useQuery({
    queryKey: ['empresa-emitente'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });

  const emitentes = data?.data || [];
  const emAtual = emitentes[0];

  useEffect(() => {
    if (emAtual) {
      setForm({
        id: emAtual.id,
        cnpj: emAtual.cnpj || '',
        razao_social: emAtual.razao_social || '',
        nome_fantasia: emAtual.nome_fantasia || '',
        inscricao_estadual: emAtual.inscricao_estadual || '',
        regime_tributario: String(emAtual.regime_tributario || '3'),
        rntrc: emAtual.rntrc || '',
        focus_token: '',
        focus_token_homologacao: '',
        focus_token_producao: '',
        focus_ambiente: emAtual.focus_ambiente || 'homologacao',
        uf: emAtual.uf || 'MS',
        municipio: emAtual.municipio || 'Dourados',
        codigo_municipio: emAtual.codigo_municipio || '5003702',
        logradouro: emAtual.logradouro || '',
        numero: emAtual.numero || '',
        complemento: emAtual.complemento || '',
        bairro: emAtual.bairro || '',
        cep: emAtual.cep || '',
        telefone: emAtual.telefone || '',
        email: emAtual.email || '',
        serie_cte: emAtual.serie_cte || '1',
        serie_mdfe: emAtual.serie_mdfe || '1',
        cfop_padrao_cte: emAtual.cfop_padrao_cte || '5353',
        natureza_padrao_cte: emAtual.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
        aliquota_icms_padrao: String(emAtual.aliquota_icms_padrao ?? '12.00')
      });
    }
  }, [emAtual?.id]);

  const salvar = useMutation({
    mutationFn: async (payload: EmitenteForm) => api.post('/transporte/emitentes', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-emitente'] });
      qc.invalidateQueries({ queryKey: ['emitentes'] });
      qc.invalidateQueries({ queryKey: ['emitentes-cargas'] });
      alert('Dados fiscais e credenciais Focus NFe atualizados com sucesso!');
    },
    onError: (err: any) => {
      alert('Erro ao salvar dados: ' + (err.response?.data?.error || err.message));
    }
  });

  const handleTestarFocus = async (ambiente: 'homologacao' | 'producao') => {
    setTestingAmb(ambiente);
    setTestResult(null);
    try {
      const tokenDigitado = ambiente === 'producao' ? form.focus_token_producao : form.focus_token_homologacao;
      const res = await api.post('/transporte/focus/testar', {
        emitente_id: form.id,
        ambiente,
        token: tokenDigitado || undefined
      });
      const d = res.data?.data;
      setTestResult({
        ok: Boolean(d?.conectado),
        msg: d?.mensagem || (d?.conectado ? `Conexão Focus NFe (${ambiente}) validada!` : 'Falha na autenticação Focus NFe')
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao testar conexão Focus NFe'
      });
    } finally {
      setTestingAmb(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    salvar.mutate(form);
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Building2 className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Dados da Empresa (Emitente Fiscal CT-e / MDF-e)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configurações fiscais da transportadora junto à SEFAZ e tokens de Homologação e Produção da Focus NFe.
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider self-start sm:self-auto ${
          form.focus_ambiente === 'producao'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        }`}>
          Ambiente Ativo: {form.focus_ambiente === 'producao' ? 'Produção (SEFAZ Real)' : 'Homologação (Testes)'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 space-y-7 text-sm">
        {/* 1. Credenciais Focus NFe (Homologação e Produção) */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-brand-600" />
              Credenciais e Ambiente Focus NFe v2 (CT-e / CT-e OS / MDF-e)
            </h3>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded font-semibold ${emAtual?.tem_token_homologacao ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                Homologação: {emAtual?.tem_token_homologacao ? `Configurado (${emAtual.token_homologacao_preview})` : 'Pendente'}
              </span>
              <span className={`px-2 py-0.5 rounded font-semibold ${emAtual?.tem_token_producao ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                Produção: {emAtual?.tem_token_producao ? `Configurado (${emAtual.token_producao_preview})` : 'Pendente'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Ambiente Ativo de Emissão *
              </label>
              <select
                value={form.focus_ambiente}
                onChange={e => setForm({ ...form, focus_ambiente: e.target.value as 'homologacao' | 'producao' })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-brand-500"
              >
                <option value="homologacao">Homologação (Testes SEFAZ)</option>
                <option value="producao">Produção (Validade Jurídica)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Token Focus NFe — Homologação
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={emAtual?.tem_token_homologacao ? `Salvo (${emAtual.token_homologacao_preview}) — digite p/ alterar` : 'Cole o token de Homologação'}
                  value={form.focus_token_homologacao}
                  onChange={e => setForm({ ...form, focus_token_homologacao: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => handleTestarFocus('homologacao')}
                  disabled={testingAmb !== null}
                  title="Testar conexão em Homologação"
                  className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 flex items-center gap-1 disabled:opacity-50"
                >
                  {testingAmb === 'homologacao' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  Testar
                </button>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Token Focus NFe — Produção
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={emAtual?.tem_token_producao ? `Salvo (${emAtual.token_producao_preview}) — digite p/ alterar` : 'Cole o token de Produção'}
                  value={form.focus_token_producao}
                  onChange={e => setForm({ ...form, focus_token_producao: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => handleTestarFocus('producao')}
                  disabled={testingAmb !== null}
                  title="Testar conexão em Produção"
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 flex items-center gap-1 disabled:opacity-50"
                >
                  {testingAmb === 'producao' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  Testar
                </button>
              </div>
            </div>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
              testResult.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/50'
                : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/50'
            }`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{testResult.msg}</span>
            </div>
          )}
        </div>

        {/* 2. Identificação da Transportadora */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
              placeholder="Inscrição Estadual SEFAZ"
              value={form.inscricao_estadual}
              onChange={e => setForm({ ...form, inscricao_estadual: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              RNTRC (ANTT) *
            </label>
            <input
              type="text"
              required
              placeholder="8 dígitos (ex: 12345678)"
              value={form.rntrc}
              onChange={e => setForm({ ...form, rntrc: e.target.value.replace(/\D/g, '') })}
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
              placeholder="Nome comercial"
              value={form.nome_fantasia}
              onChange={e => setForm({ ...form, nome_fantasia: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* 3. Endereço Fiscal do Emitente (Obrigatório no XML do CT-e e MDF-e) */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Endereço e Localização Fiscal do Emitente (Obrigatório para CT-e e MDF-e)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Logradouro (Rua / Av.) *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Av. Marcelino Pires"
                value={form.logradouro}
                onChange={e => setForm({ ...form, logradouro: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Número *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 1500 ou S/N"
                value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Bairro *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Centro"
                value={form.bairro}
                onChange={e => setForm({ ...form, bairro: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                CEP *
              </label>
              <input
                type="text"
                required
                placeholder="79800-000"
                value={form.cep}
                onChange={e => setForm({ ...form, cep: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Município *
              </label>
              <input
                type="text"
                required
                value={form.municipio}
                onChange={e => setForm({ ...form, municipio: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
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
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Código IBGE (7 dígitos) *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 5003702"
                value={form.codigo_municipio}
                onChange={e => setForm({ ...form, codigo_municipio: e.target.value.replace(/\D/g, '') })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Complemento
              </label>
              <input
                type="text"
                placeholder="Sala, Galpão..."
                value={form.complemento}
                onChange={e => setForm({ ...form, complemento: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Telefone Fiscal
              </label>
              <input
                type="text"
                placeholder="(67) 3411-0000"
                value={form.telefone}
                onChange={e => setForm({ ...form, telefone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                E-mail Fiscal (notificações XML/DACTE)
              </label>
              <input
                type="email"
                placeholder="fiscal@transportadora.com.br"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* 4. Parâmetros Fiscais Padrão */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Parâmetros Fiscais Padrão (Regime Tributário, Séries e ICMS)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Regime Tributário (CRT) *
              </label>
              <select
                value={form.regime_tributario}
                onChange={e => setForm({ ...form, regime_tributario: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="1">1 — Simples Nacional</option>
                <option value="2">2 — Simples Nacional (Excesso Sublimite)</option>
                <option value="3">3 — Regime Normal (Lucro Presumido / Real)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Série Padrão CT-e
              </label>
              <input
                type="text"
                value={form.serie_cte}
                onChange={e => setForm({ ...form, serie_cte: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Série Padrão MDF-e
              </label>
              <input
                type="text"
                value={form.serie_mdfe}
                onChange={e => setForm({ ...form, serie_mdfe: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                CFOP Padrão CT-e
              </label>
              <input
                type="text"
                value={form.cfop_padrao_cte}
                onChange={e => setForm({ ...form, cfop_padrao_cte: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Alíquota ICMS Padrão (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.aliquota_icms_padrao}
                onChange={e => setForm({ ...form, aliquota_icms_padrao: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Natureza da Operação Padrão
              </label>
              <input
                type="text"
                value={form.natureza_padrao_cte}
                onChange={e => setForm({ ...form, natureza_padrao_cte: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
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
            {salvar.isPending ? 'Salvando...' : 'Salvar Dados Fiscais e Tokens Focus NFe'}
          </button>
        </div>
      </form>
    </div>
  );
}
