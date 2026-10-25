import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  ShieldCheck, Upload, Trash2, AlertTriangle, Calendar,
  CheckCircle2, FileKey2, Building2, Loader2
} from 'lucide-react';

interface Certificado {
  id: number;
  emitente_id: number;
  emitente_nome: string;
  cnpj: string;
  nome_arquivo: string;
  valido_de: string;
  valido_ate: string;
  dias_para_vencer: number;
  status: string;
}

interface Emitente {
  id: number;
  razao_social: string;
  cnpj: string;
}

export default function CertificadosPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [emitenteId, setEmitenteId] = useState('');
  const [senha, setSenha] = useState('');
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [erro, setErro] = useState('');

  const { data: emitentesData } = useQuery({
    queryKey: ['emitentes-certificados'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitentes: Emitente[] = emitentesData?.data || [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['certificados'],
    queryFn: async () => (await api.get('/transporte/certificados')).data
  });
  const certificados: Certificado[] = data?.data || [];

  const salvar = useMutation({
    mutationFn: async (payload: any) => api.post('/transporte/certificados', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificados'] });
      setArquivo(null);
      setSenha('');
      setEmitenteId('');
      if (fileRef.current) fileRef.current.value = '';
      alert('Certificado digital cadastrado com sucesso!');
    },
    onError: (e: any) => setErro(e.response?.data?.error || e.message || 'Erro ao salvar.')
  });

  const excluir = useMutation({
    mutationFn: async (id: number) => api.delete(`/transporte/certificados/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificados'] });
      alert('Certificado removido.');
    }
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro('');

    if (!/\.(pfx|p12)$/i.test(file.name)) {
      setErro('O arquivo deve ser .pfx ou .p12 (certificado A1).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErro('Arquivo muito grande (máximo 10 MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] || '';
      setArquivo({ nome: file.name, base64 });
    };
    reader.onerror = () => setErro('Falha ao ler o arquivo.');
    reader.readAsDataURL(file);
  };

  const nivelVencimento = (dias: number) => {
    if (dias < 0) return { rotulo: 'Vencido', cor: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300', icone: AlertTriangle };
    if (dias <= 30) return { rotulo: `${dias} dias`, cor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300', icone: AlertTriangle };
    if (dias <= 60) return { rotulo: `${dias} dias`, cor: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300', icone: Calendar };
    return { rotulo: `${dias} dias`, cor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300', icone: CheckCircle2 };
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <FileKey2 className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Certificados Digitais
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Certificados A1 (arquivo .pfx / .p12) vinculados a cada transportadora emissora.
          </p>
        </div>
      </div>

      {/* Formulário de upload */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-brand-500" />
          Cadastrar certificado
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
              Transportadora (emitente) *
            </label>
            <select
              value={emitenteId}
              onChange={e => setEmitenteId(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              <option value="">Selecione...</option>
              {emitentes.map(em => (
                <option key={em.id} value={em.id}>{em.razao_social} — {em.cnpj}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
              Senha do certificado *
            </label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="Senha do arquivo .pfx"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
              Arquivo do certificado *
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pfx,.p12"
              onChange={handleFile}
              className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-700 file:text-xs file:font-semibold file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200"
            />
          </div>
        </div>

        {arquivo && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Arquivo carregado: {arquivo.nome}
          </p>
        )}
        {erro && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {erro}
          </p>
        )}

        <div className="flex justify-end mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <button
            onClick={() => salvar.mutate({
              emitente_id: Number(emitenteId),
              nome_arquivo: arquivo?.nome,
              senha,
              arquivo_base64: arquivo?.base64
            })}
            disabled={salvar.isPending || !emitenteId || !senha || !arquivo}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-all"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {salvar.isPending ? 'Salvando...' : 'Cadastrar Certificado'}
          </button>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando certificados...</div>
      ) : certificados.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <FileKey2 className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum certificado cadastrado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Sem certificado A1, a Focus NFe usa o certificado configurado no painel da própria Focus.
            Cadastre aqui para ter o controle de vencimento no seu painel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {certificados.map(c => {
            const n = nivelVencimento(Number(c.dias_para_vencer || 0));
            const Icon = n.icone;
            return (
              <div key={c.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      {c.emitente_nome}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{c.cnpj}</p>
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${n.cor}`}>
                    <Icon className="w-3 h-3" />
                    {n.rotulo}
                  </span>
                </div>

                <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Arquivo:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[60%]">{c.nome_arquivo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Válido até:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {c.valido_ate ? new Date(c.valido_ate).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      if (confirm('Remover este certificado?')) excluir.mutate(c.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 dark:bg-red-950/50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
