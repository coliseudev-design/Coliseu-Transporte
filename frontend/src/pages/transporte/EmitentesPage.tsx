import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Building2, Plus, Pencil, KeyRound, ShieldCheck,
  AlertTriangle, CheckCircle2, MapPin, Wifi, Loader2
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
  codigo_municipio?: string;
  inscricao_estadual?: string;
  regime_tributario?: number;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  serie_cte?: string;
  serie_mdfe?: string;
  cfop_padrao_cte?: string;
  natureza_padrao_cte?: string;
  aliquota_icms_padrao?: number;
  tem_token_homologacao?: boolean;
  tem_token_producao?: boolean;
  token_homologacao_preview?: string;
  token_producao_preview?: string;
  ativo: boolean;
}

const VAZIO = {
  id: 0,
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  regime_tributario: '3',
  rntrc: '',
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
  aliquota_icms_padrao: '12.00',
  focus_token: '',
  focus_token_homologacao: '',
  focus_token_producao: '',
  focus_ambiente: 'homologacao' as 'homologacao' | 'producao',
  tem_token_homologacao: false,
  tem_token_producao: false,
  token_homologacao_preview: '',
  token_producao_preview: ''
};

export default function EmitentesPage() {
  const [editando, setEditando] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testingAmb, setTestingAmb] = useState<'homologacao' | 'producao' | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['emitentes'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });

  const emitentes: Emitente[] = data?.data || [];

  const handleTestar = async (ambiente: 'homologacao' | 'producao') => {
    if (!editando) return;
    setTestingAmb(ambiente);
    setTestMsg(null);
    try {
      const tokenDigitado = ambiente === 'producao' ? editando.focus_token_producao : editando.focus_token_homologacao;
      const res = await api.post('/transporte/focus/testar', {
        emitente_id: editando.id || undefined,
        ambiente,
        token: tokenDigitado || undefined
      });
      const d = res.data?.data;
      setTestMsg({
        ok: Boolean(d?.conectado),
        msg: d?.mensagem || (d?.conectado ? `Conexão Focus NFe (${ambiente}) validada!` : 'Falha na conexão Focus NFe')
      });
    } catch (err: any) {
      setTestMsg({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao testar token Focus NFe'
      });
    } finally {
      setTestingAmb(null);
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      await api.post('/transporte/emitentes', editando);
      setEditando(null);
      setTestMsg(null);
      refetch();
      alert('Transportadora (emitente fiscal) salva com sucesso!');
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
            Cada CNPJ emissor possui seus próprios tokens de Homologação e Produção na Focus NFe.
          </p>
        </div>
        <button
          onClick={() => { setTestMsg(null); setEditando({ ...VAZIO }); }}
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
            Cadastre o CNPJ que emitirá os CT-e e MDF-e. Informe os tokens de Homologação e Produção da Focus NFe.
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
                    {em.municipio || '—'}{em.uf ? `/${em.uf}` : ''} (IBGE {em.codigo_municipio || '—'})
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
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${em.tem_token_homologacao ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-slate-100 text-slate-500'}`}>
                    HML: {em.tem_token_homologacao ? 'OK' : '—'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${em.tem_token_producao ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                    PRD: {em.tem_token_producao ? 'OK' : '—'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-end">
                <button
                  onClick={() => {
                    setTestMsg(null);
                    setEditando({
                      ...VAZIO,
                      id: em.id,
                      cnpj: em.cnpj,
                      razao_social: em.razao_social,
                      nome_fantasia: em.nome_fantasia || '',
                      inscricao_estadual: em.inscricao_estadual || '',
                      regime_tributario: String(em.regime_tributario || '3'),
                      rntrc: em.rntrc || '',
                      uf: em.uf || 'MS',
                      municipio: em.municipio || '',
                      codigo_municipio: em.codigo_municipio || '',
                      logradouro: em.logradouro || '',
                      numero: em.numero || '',
                      complemento: em.complemento || '',
                      bairro: em.bairro || '',
                      cep: em.cep || '',
                      telefone: em.telefone || '',
                      email: em.email || '',
                      serie_cte: em.serie_cte || '1',
                      serie_mdfe: em.serie_mdfe || '1',
                      cfop_padrao_cte: em.cfop_padrao_cte || '5353',
                      natureza_padrao_cte: em.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
                      aliquota_icms_padrao: String(em.aliquota_icms_padrao ?? '12.00'),
                      focus_ambiente: em.focus_ambiente,
                      tem_token_homologacao: Boolean(em.tem_token_homologacao),
                      tem_token_producao: Boolean(em.tem_token_producao),
                      token_homologacao_preview: em.token_homologacao_preview || '',
                      token_producao_preview: em.token_producao_preview || ''
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar / Configurar Tokens
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      {editando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand-600" />
              {editando.id ? 'Editar Transportadora e Tokens Focus NFe' : 'Nova Transportadora'}
            </h2>

            <form onSubmit={handleSalvar} className="space-y-5 mt-5 text-sm">
              {/* Credenciais Focus NFe */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-brand-600" />
                  Credenciais Focus NFe (Homologação e Produção)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Ambiente Ativo *</label>
                    <select
                      value={editando.focus_ambiente}
                      onChange={e => setEditando({ ...editando, focus_ambiente: e.target.value as 'homologacao' | 'producao' })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    >
                      <option value="homologacao">Homologação (testes)</option>
                      <option value="producao">Produção (SEFAZ real)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Token Homologação</label>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        placeholder={editando.tem_token_homologacao ? `Salvo (${editando.token_homologacao_preview})` : 'Token Homologação'}
                        value={editando.focus_token_homologacao}
                        onChange={e => setEditando({ ...editando, focus_token_homologacao: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleTestar('homologacao')}
                        disabled={testingAmb !== null}
                        className="px-2.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0"
                        title="Testar Homologação"
                      >
                        {testingAmb === 'homologacao' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Token Produção</label>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        placeholder={editando.tem_token_producao ? `Salvo (${editando.token_producao_preview})` : 'Token Produção'}
                        value={editando.focus_token_producao}
                        onChange={e => setEditando({ ...editando, focus_token_producao: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleTestar('producao')}
                        disabled={testingAmb !== null}
                        className="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0"
                        title="Testar Produção"
                      >
                        {testingAmb === 'producao' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {testMsg && (
                  <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${testMsg.ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200'}`}>
                    {testMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{testMsg.msg}</span>
                  </div>
                )}
              </div>

              {/* Dados Cadastrais */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CNPJ *</label>
                  <input
                    type="text" required placeholder="00.000.000/0000-00"
                    value={editando.cnpj}
                    onChange={e => setEditando({ ...editando, cnpj: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Inscrição Estadual *</label>
                  <input
                    type="text" required
                    value={editando.inscricao_estadual}
                    onChange={e => setEditando({ ...editando, inscricao_estadual: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">RNTRC *</label>
                  <input
                    type="text" required placeholder="8 dígitos"
                    value={editando.rntrc}
                    onChange={e => setEditando({ ...editando, rntrc: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Razão Social *</label>
                  <input
                    type="text" required
                    value={editando.razao_social}
                    onChange={e => setEditando({ ...editando, razao_social: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
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

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Logradouro *</label>
                  <input
                    type="text" required
                    value={editando.logradouro}
                    onChange={e => setEditando({ ...editando, logradouro: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Número *</label>
                  <input
                    type="text" required
                    value={editando.numero}
                    onChange={e => setEditando({ ...editando, numero: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Bairro *</label>
                  <input
                    type="text" required
                    value={editando.bairro}
                    onChange={e => setEditando({ ...editando, bairro: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CEP *</label>
                  <input
                    type="text" required
                    value={editando.cep}
                    onChange={e => setEditando({ ...editando, cep: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Município *</label>
                  <input
                    type="text" required
                    value={editando.municipio}
                    onChange={e => setEditando({ ...editando, municipio: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF *</label>
                  <input
                    type="text" required maxLength={2}
                    value={editando.uf}
                    onChange={e => setEditando({ ...editando, uf: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Código IBGE (7 dígitos) *</label>
                  <input
                    type="text" required placeholder="5003702"
                    value={editando.codigo_municipio}
                    onChange={e => setEditando({ ...editando, codigo_municipio: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Regime Tributário (CRT)</label>
                  <select
                    value={editando.regime_tributario}
                    onChange={e => setEditando({ ...editando, regime_tributario: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="1">1 — Simples Nacional</option>
                    <option value="2">2 — Simples (Excesso)</option>
                    <option value="3">3 — Regime Normal</option>
                  </select>
                </div>
              </div>

              {editando.focus_ambiente === 'producao' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Em <strong>produção</strong>, os documentos transmitidos são autorizados com validade jurídica na SEFAZ.
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
