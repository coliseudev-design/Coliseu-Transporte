import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import {
  Hash,
  Lock,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  X
} from 'lucide-react';

interface PainelSequenciaFiscalProps {
  tipo: 'CTE' | 'MDFE';
  emitente: any | null;
  docId?: number | null;
  numeroRascunhoAtual?: number | string | null;
  isTenantAdminMeta?: boolean;
  onSequenciaAtualizada?: (dados: { serie: string; proximoNumero: number }) => void;
}

function padFiscalNumber(n: number): string {
  const safe = Math.max(0, Math.floor(Number(n) || 0));
  return String(safe).padStart(6, '0');
}

export default function PainelSequenciaFiscal({
  tipo,
  emitente,
  docId = null,
  numeroRascunhoAtual = null,
  isTenantAdminMeta,
  onSequenciaAtualizada
}: PainelSequenciaFiscalProps) {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);

  const roleLower = String(user?.role || '').toLowerCase();
  const grupoLower = String(user?.grupo_nome || '').toLowerCase();
  const isAdmin =
    Boolean(isTenantAdminMeta) ||
    roleLower === 'admin' ||
    roleLower === 'master' ||
    grupoLower === 'master';

  const emitenteId = emitente?.id ? Number(emitente.id) : null;
  const labelDoc = tipo === 'CTE' ? 'CT-e' : 'MDF-e';

  const serieBaseEmitente = String(
    (tipo === 'CTE' ? emitente?.serie_cte : emitente?.serie_mdfe) || '1'
  ).replace(/\D/g, '') || '1';

  const [aberto, setAberto] = useState(false);
  const [serieInput, setSerieInput] = useState(serieBaseEmitente);
  const [proximoInput, setProximoInput] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setSerieInput(serieBaseEmitente);
  }, [emitenteId, serieBaseEmitente]);

  const serieConsulta = String(Number(serieInput.replace(/\D/g, '') || serieBaseEmitente) || 1);

  const { data: seqResp, isFetching: consultandoSerie } = useQuery({
    queryKey: ['sequencia-fiscal', emitenteId, tipo, serieConsulta],
    enabled: Boolean(emitenteId),
    queryFn: async () => {
      const params =
        tipo === 'CTE' ? { serie_cte: serieConsulta } : { serie_mdfe: serieConsulta };
      return (await api.get(`/transporte/emitentes/${emitenteId}/sequencia`, { params })).data;
    }
  });

  const resumo = seqResp?.data;

  const serieAtiva =
    tipo === 'CTE'
      ? String(resumo?.serie_cte || serieBaseEmitente)
      : String(resumo?.serie_mdfe || serieBaseEmitente);

  const ultimoEfetivo =
    tipo === 'CTE'
      ? Number(resumo?.ultimo_numero_efetivo_cte ?? emitente?.ultimo_numero_efetivo_cte ?? emitente?.ultimo_numero_cte ?? 0)
      : Number(resumo?.ultimo_numero_efetivo_mdfe ?? emitente?.ultimo_numero_efetivo_mdfe ?? emitente?.ultimo_numero_mdfe ?? 0);

  const maiorSefaz =
    tipo === 'CTE'
      ? Number(resumo?.maior_numero_cte_sefaz ?? emitente?.maior_numero_cte_sefaz ?? 0)
      : Number(resumo?.maior_numero_mdfe_sefaz ?? emitente?.maior_numero_mdfe_sefaz ?? 0);

  const proximoCalculado =
    tipo === 'CTE'
      ? Number(resumo?.proximo_numero_cte ?? emitente?.proximo_numero_cte ?? ultimoEfetivo + 1)
      : Number(resumo?.proximo_numero_mdfe ?? emitente?.proximo_numero_mdfe ?? ultimoEfetivo + 1);

  const numRascunhoInt = numeroRascunhoAtual ? parseInt(String(numeroRascunhoAtual), 10) || 0 : 0;
  const proximoExibido = numRascunhoInt > 0 ? numRascunhoInt : Math.max(1, proximoCalculado);

  useEffect(() => {
    if (aberto) {
      setProximoInput(String(Math.max(1, proximoCalculado)));
    }
  }, [aberto, serieConsulta, proximoCalculado]);

  if (!emitenteId) return null;

  const proximoDigitadoInt = parseInt(proximoInput.replace(/\D/g, ''), 10) || 0;
  const bloqueadoPorSefaz = proximoDigitadoInt > 0 && proximoDigitadoInt <= maiorSefaz;

  const handleAplicarSequencia = async () => {
    setFeedback(null);
    if (proximoDigitadoInt < 1) {
      setFeedback({ ok: false, msg: `Informe um Próximo Número válido (a partir de 1).` });
      return;
    }
    if (bloqueadoPorSefaz) {
      setFeedback({
        ok: false,
        msg: `O nº ${proximoDigitadoInt} já foi utilizado na SEFAZ na Série ${serieConsulta} (maior nº: ${maiorSefaz}). Informe a partir de ${maiorSefaz + 1}.`
      });
      return;
    }

    setSalvando(true);
    try {
      const res = await api.patch(`/transporte/emitentes/${emitenteId}/sequencia`, {
        tipo,
        serie: serieConsulta,
        proximo_numero: proximoDigitadoInt,
        doc_id: docId || undefined
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['sequencia-fiscal'] }),
        qc.invalidateQueries({ queryKey: ['emitentes'] }),
        qc.invalidateQueries({ queryKey: ['emitentes-mdfe'] }),
        qc.invalidateQueries({ queryKey: ['empresa-emitente'] })
      ]);

      onSequenciaAtualizada?.({
        serie: serieConsulta,
        proximoNumero: proximoDigitadoInt
      });

      setFeedback({
        ok: true,
        msg:
          res.data?.mensagem ||
          `Sequência do ${labelDoc} atualizada para Série ${serieConsulta} · Próximo nº ${proximoDigitadoInt}!`
      });
      setAberto(false);
    } catch (err: any) {
      setFeedback({
        ok: false,
        msg: err.response?.data?.error || err.message || `Falha ao atualizar sequência de ${labelDoc}.`
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-slate-900 dark:border-l-emerald-500 bg-slate-50/90 dark:bg-slate-900/70 p-3.5 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            <Hash className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Sequência Fiscal {labelDoc}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold">
              Série <strong>{serieAtiva}</strong>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              Último: <strong>#{padFiscalNumber(ultimoEfetivo)}</strong>
            </span>

            <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />

            <span className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold shadow-sm">
              Próximo {labelDoc}: #{padFiscalNumber(proximoExibido)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setAberto(v => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
            >
              {aberto ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  Fechar Ajuste
                </>
              ) : (
                <>
                  <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  Ajustar Sequência / Série
                </>
              )}
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Apenas usuários Administradores (Master) podem alterar a Série ou o número inicial da sequência fiscal."
            >
              <Lock className="w-3 h-3 shrink-0" />
              Sequência automática protegida (Master)
            </span>
          )}
        </div>
      </div>

      {aberto && isAdmin && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Série Padrão {labelDoc}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={serieInput}
                onChange={e => setSerieInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="1"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Definir Próximo Nº do {labelDoc} nesta Série
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={proximoInput}
                  onChange={e => setProximoInput(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border font-mono text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    bloqueadoPorSefaz
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-brand-500'
                  }`}
                  placeholder="Ex: 1850"
                />
                {consultandoSerie && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-3 top-2.5" />
                )}
              </div>
            </div>

            <div className="sm:col-span-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAplicarSequencia}
                disabled={salvando || bloqueadoPorSefaz || proximoDigitadoInt < 1}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                {salvando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Salvar Nova Sequência
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {bloqueadoPorSefaz ? (
              <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Número já utilizado na SEFAZ na Série {serieConsulta} (maior autorizado/cancelado: #{maiorSefaz}). Informe a partir de #{maiorSefaz + 1}.
              </span>
            ) : proximoDigitadoInt >= 1 ? (
              <span className="text-slate-600 dark:text-slate-300">
                Sequência contínua da empresa: os próximos {labelDoc}s sairão como{' '}
                <strong className="font-mono text-slate-900 dark:text-white">
                  {proximoDigitadoInt}, {proximoDigitadoInt + 1}, {proximoDigitadoInt + 2}...
                </strong>{' '}
                (último anterior gravado como <strong className="font-mono">{proximoDigitadoInt - 1}</strong>).
              </span>
            ) : null}

            {maiorSefaz > 0 && (
              <span className="font-mono text-slate-500 dark:text-slate-400">
                Maior nº SEFAZ na Série {serieConsulta}: #{maiorSefaz}
              </span>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-start justify-between gap-2 p-2.5 rounded-lg text-xs font-medium ${
            feedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/60'
          }`}
        >
          <div className="flex items-start gap-2">
            {feedback.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
