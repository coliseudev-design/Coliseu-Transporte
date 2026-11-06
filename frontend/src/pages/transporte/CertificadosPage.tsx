import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  ShieldCheck, Upload, Trash2, AlertTriangle, Calendar,
  CheckCircle2, FileKey2, Building2, Loader2, CloudUpload
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
  focus_sincronizado?: boolean;
  focus_sincronizado_em?: string | null;
}

interface Emitente {
  id: number;
  razao_social: string;
  cnpj: string;
  software_house_disponivel?: boolean;
}

export default function CertificadosPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [emitenteId, setEmitenteId] = useState('');
  const [senha, setSenha] = useState('');
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [erro, setErro] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sincronizandoId, setSincronizandoId] = useState<number | null>(null);

  const { data: emitentesData } = useQuery({
    queryKey: ['emitentes-certificados'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitentes: Emitente[] = emitentesData?.data || [];

  useEffect(() => {
    if (!emitenteId && emitentes.length === 1 && emitentes[0]?.id) {
      setEmitenteId(String(emitentes[0].id));
    }
  }, [emitentes, emitenteId]);

  const { data, isLoading } = useQuery({
    queryKey: ['certificados'],
    queryFn: async () => (await api.get('/transporte/certificados')).data
  });
  const certificados: Certificado[] = data?.data || [];

  const salvar = useMutation({
    mutationFn: async (payload: any) => api.post('/transporte/certificados', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['certificados'] });
      qc.invalidateQueries({ queryKey: ['empresa-emitente'] });
      setArquivo(null);
      setSenha('');
      if (fileRef.current) fileRef.current.value = '';

      const sync = res.data?.focus_sync;
      if (sync?.success) {
        setFeedback({
          ok: true,
          msg: `Certificado A1 cifrado em AES-256-GCM e instalado automaticamente na Focus NFe (${sync.mensagem || 'OK'})!`
        });
      } else if (sync && sync.erro) {
        setFeedback({
          ok: false,
          msg: `Certificado salvo no cofre local, mas a Focus NFe retornou aviso na sincronização automática: ${sync.erro}`
        });
      } else {
        setFeedback({
          ok: true,
          msg: 'Certificado digital A1 cifrado em AES-256-GCM e salvo com sucesso!'
        });
      }
    },
    onError: (e: any) => setErro(e.response?.data?.error || e.message || 'Erro ao salvar.')
  });

  const excluir = useMutation({
    mutationFn: async (id: number) => api.delete(`/transporte/certificados/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificados'] });
      setFeedback({ ok: true, msg: 'Certificado removido do cofre local.' });
    }
  });

  const handleSincronizarFocus = async (certId: number) => {
    setSincronizandoId(certId);
    setFeedback(null);
    setErro('');
    try {
      const res = await api.post(`/transporte/certificados/${certId}/sincronizar-focus`);
      qc.invalidateQueries({ queryKey: ['certificados'] });
      qc.invalidateQueries({ queryKey: ['empresa-emitente'] });
      setFeedback({
        ok: true,
        msg: res.data?.mensagem || 'Certificado Digital A1 sincronizado e validado na Focus NFe com sucesso!'
      });
    } catch (e: any) {
      setFeedback({
        ok: false,
        msg: e.response?.data?.error || e.message || 'Falha ao enviar certificado para a Focus NFe.'
      });
    } finally {
      setSincronizandoId(null);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro('');
    setFeedback(null);

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
            Certificados Digitais A1
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Certificados A1 (.pfx / .p12) cifrados em AES-256-GCM e enviados automaticamente para assinatura SEFAZ na Focus NFe.
          </p>
        </div>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2.5 p-4 rounded-2xl text-xs font-medium ${
          feedback.ok
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60'
            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60'
        }`}>
          {feedback.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Formulário de upload */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-brand-500" />
          Cadastrar e instalar Certificado A1
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
              Arquivo do certificado (.pfx / .p12) *
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
              arquivo_base64: arquivo?.base64,
              sincronizar_focus: true
            })}
            disabled={salvar.isPending || !emitenteId || !senha || !arquivo}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-all"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {salvar.isPending ? 'Cifrando e enviando à Focus NFe...' : 'Salvar e Instalar na Focus NFe'}
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
            Faça o upload do Certificado Digital A1 (.pfx) acima para assinar e autorizar CT-e, CT-e OS e MDF-e automaticamente pela Focus NFe.
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      c.focus_sincronizado
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {c.focus_sincronizado ? 'Focus NFe Ativo' : 'Cofre Local'}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${n.cor}`}>
                      <Icon className="w-3 h-3" />
                      {n.rotulo}
                    </span>
                  </div>
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
                  {c.focus_sincronizado_em && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sincronizado Focus NFe:</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {new Date(c.focus_sincronizado_em).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleSincronizarFocus(c.id)}
                    disabled={sincronizandoId === c.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  >
                    {sincronizandoId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                    {sincronizandoId === c.id ? 'Enviando...' : 'Sincronizar com Focus NFe'}
                  </button>

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
