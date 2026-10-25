import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  X, FileText, Truck, CheckCircle2, AlertTriangle, XCircle, Clock,
  Download, Eye, Send, Ban, FilePen, UserPlus, PlusCircle,
  MapPin, Package, Copy, Loader2, ShieldCheck, Info
} from 'lucide-react';

interface DrawerProps {
  tipo: 'CTE' | 'MDFE';
  documentoId: number | null;
  onClose: () => void;
  onVerRoteiro?: (mdfeId: number) => void;
}

interface Evento {
  tipo: string;
  status: string;
  titulo: string;
  descricao: string;
  data: string;
}

const ICONE_EVENTO: Record<string, any> = {
    CRIACAO: FileText,
    ENVIO: Send,
    AUTORIZACAO: CheckCircle2,
    REJEICAO: XCircle,
    RESPOSTA: Info,
    CANCELAMENTO: Ban,
    ENCERRAMENTO: CheckCircle2,
    CARTA_CORRECAO: FilePen,
    INCLUSAO_CONDUTOR: UserPlus,
    INCLUSAO_DFE: PlusCircle
};

const COR_EVENTO: Record<string, string> = {
    CRIACAO: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    ENVIO: 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400',
    AUTORIZACAO: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
    REJEICAO: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400',
    RESPOSTA: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
    CANCELAMENTO: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    ENCERRAMENTO: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
    CARTA_CORRECAO: 'bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400',
    INCLUSAO_CONDUTOR: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400',
    INCLUSAO_DFE: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400'
};

export default function DocumentoDrawer({ tipo, documentoId, onClose, onVerRoteiro }: DrawerProps) {
  const qc = useQueryClient();
  const [aba, setAba] = useState<'resumo' | 'eventos' | 'json'>('resumo');
  const [modalCancelar, setModalCancelar] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [modalCarga, setModalCarga] = useState(false);
  const [modalCondutor, setModalCondutor] = useState(false);
  const [modalDfe, setModalDfe] = useState(false);
  const [condutor, setCondutor] = useState({ nome: '', cpf: '' });
  const [dfe, setDfe] = useState({ protocolo: '', codigo_municipio_carregamento: '', chave: '' });
  const [corrigenda, setCorrigenda] = useState('');
  const [modalCorrecao, setModalCorrecao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['timeline', tipo, documentoId],
    queryFn: async () => {
      const res = await api.get(`/transporte/timeline/${tipo}/${documentoId}`);
      return res.data;
    },
    enabled: !!documentoId
  });

  // Fecha com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (documentoId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documentoId, onClose]);

  const doc = data?.data?.documento;
  const eventos: Evento[] = data?.data?.eventos || [];

  const acao = async (fn: () => Promise<any>, msg: string) => {
    setEnviando(true);
    setErro('');
    try {
      await fn();
      await refetch();
      qc.invalidateQueries({ queryKey: ['ctes'] });
      qc.invalidateQueries({ queryKey: ['mdfes'] });
      setModalCancelar(false);
      setModalCarga(false);
      setModalCondutor(false);
      setModalDfe(false);
      setModalCorrecao(false);
      setJustificativa('');
      setCorrigenda('');
      alert(msg);
    } catch (e: any) {
      const msgErro = e.response?.data?.error || e.message || 'Erro inesperado';
      setErro(msgErro);
      alert(msgErro);
    } finally {
      setEnviando(false);
    }
  };

  const statusBadge = (status: string) => {
    const cores: Record<string, string> = {
      AUTORIZADO: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      PROCESSANDO: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
      REJEITADO: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300',
      CANCELADO: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
      ENCERRADO: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
      RASCUNHO: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
    };
    return cores[status] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity ${
          documentoId ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white dark:bg-slate-900 z-50 shadow-2xl border-l border-slate-200 dark:border-slate-700 transform transition-transform duration-300 flex flex-col ${
          documentoId ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : !doc ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Documento não encontrado
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <header className="px-6 py-5 border-b border-slate-200 dark:border-slate-700/70 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {tipo === 'CTE'
                      ? <FileText className="w-4 h-4 text-sky-500" />
                      : <Truck className="w-4 h-4 text-emerald-500" />}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {tipo === 'CTE' ? 'Conhecimento de Transporte' : 'Manifesto de Carga'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                    {tipo === 'CTE'
                      ? (doc.numero ? `CT-e nº ${doc.numero}` : 'CT-e (rascunho)')
                      : (doc.numero ? `MDF-e nº ${doc.numero}` : 'MDF-e (rascunho)')}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">
                    {tipo === 'CTE' ? (doc.chave_cte || doc.ref) : (doc.chave_mdfe || doc.ref)}
                  </p>
                </div>

                <button
                  onClick={onClose}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                >
                  <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusBadge(doc.status)}`}>
                  {doc.status}
                </span>
                {doc.status_sefaz && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-mono">
                    SEFAZ {doc.status_sefaz}
                  </span>
                )}
                {tipo === 'CTE' && doc.municipio_inicio && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {doc.municipio_inicio}/{doc.uf_inicio} → {doc.municipio_fim}/{doc.uf_fim}
                  </span>
                )}
                {tipo === 'MDFE' && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" />
                    {doc.veiculo_placa} · {doc.motorista_nome}
                  </span>
                )}
              </div>

              {doc.mensagem_sefaz && (
                <div className={`mt-3 flex items-start gap-2 p-3 rounded-xl text-xs ${
                  doc.status === 'REJEITADO'
                    ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200'
                    : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {doc.status === 'REJEITADO'
                    ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{doc.status_sefaz} — {doc.mensagem_sefaz}</span>
                </div>
              )}
            </header>

            {/* Abas */}
            <nav className="flex gap-1 px-6 py-3 border-b border-slate-200 dark:border-slate-700/70 shrink-0">
              {([
                { id: 'resumo', label: 'Resumo' },
                { id: 'eventos', label: `Timeline (${eventos.length})` },
                { id: 'json', label: 'JSON' }
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setAba(t.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    aba === t.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {aba === 'resumo' && (
                <div className="space-y-5">
                  {tipo === 'CTE' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Valor do Frete', value: `R$ ${Number(doc.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                          { label: 'Valor da Carga', value: `R$ ${Number(doc.valor_carga || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                          { label: 'Peso Bruto', value: `${Number(doc.peso_bruto || 0).toLocaleString('pt-BR')} kg` },
                          { label: 'ICMS', value: `R$ ${Number(doc.valor_icms || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
                        ].map(k => (
                          <div key={k.label} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{k.label}</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{k.value}</p>
                          </div>
                        ))}
                      </div>

                      {doc.natureza_operacao && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Natureza da Operação</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{doc.natureza_operacao}</p>
                        </div>
                      )}

                      {doc.protocolo && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Protocolo de Autorização</p>
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg">
                              {doc.protocolo}
                            </code>
                            <button
                              onClick={() => { navigator.clipboard.writeText(doc.protocolo); alert('Protocolo copiado.'); }}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {tipo === 'MDFE' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Veículo', value: doc.veiculo_placa },
                          { label: 'Condutor', value: doc.motorista_nome },
                          { label: 'CT-es no manifesto', value: doc.qtd_cte },
                          { label: 'Peso Bruto', value: `${Number(doc.peso_bruto || 0).toLocaleString('pt-BR')} kg` }
                        ].map(k => (
                          <div key={k.label} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{k.label}</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">{k.value}</p>
                          </div>
                        ))}
                      </div>

                      {doc.ciot_codigo && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/50">
                          <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0" />
                          <div>
                            <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">CIOT vinculado</p>
                            <p className="text-xs font-mono text-violet-900 dark:text-violet-200">{doc.ciot_codigo}</p>
                          </div>
                        </div>
                      )}

                      {onVerRoteiro && (
                        <button
                          onClick={() => onVerRoteiro(doc.id)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm shadow-sm transition-colors"
                        >
                          <MapPin className="w-4 h-4" />
                          Gerar / abrir roteiro de entrega com mapa
                        </button>
                      )}
                    </>
                  )}

                  {/* Artefatos */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Arquivos</p>
                    <div className="flex flex-wrap gap-2">
                      {(tipo === 'CTE' ? doc.caminho_xml : doc.caminho_xml) && (
                        <a
                          href={doc.caminho_xml}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-medium text-slate-700 dark:text-slate-200"
                        >
                          <Download className="w-3.5 h-3.5" />
                          XML
                        </a>
                      )}
                      {(tipo === 'CTE' ? doc.caminho_dacte : doc.caminho_damdfe) && (
                        <a
                          href={tipo === 'CTE' ? doc.caminho_dacte : doc.caminho_damdfe}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-medium text-slate-700 dark:text-slate-200"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {tipo === 'CTE' ? 'DACTE (PDF)' : 'DAMDFE (PDF)'}
                        </a>
                      )}
                      {!doc.caminho_xml && !(tipo === 'CTE' ? doc.caminho_dacte : doc.caminho_damdfe) && (
                        <span className="text-xs text-slate-400 italic">
                          Arquivos disponíveis após a autorização pela SEFAZ.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {aba === 'eventos' && (
                <div className="relative pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
                  {eventos.map((ev, i) => {
                    const Icon = ICONE_EVENTO[ev.tipo] || Info;
                    const cor = COR_EVENTO[ev.tipo] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
                    return (
                      <div key={i} className="relative pb-6 last:pb-0">
                        <div className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 ${cor}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{ev.titulo}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ev.descricao}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {ev.data ? new Date(ev.data).toLocaleString('pt-BR') : '—'}
                        </p>
                      </div>
                    );
                  })}
                  {eventos.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">Sem eventos registrados.</p>
                  )}
                </div>
              )}

              {aba === 'json' && (
                <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-[11px] overflow-auto max-h-full font-mono leading-relaxed">
                  {JSON.stringify(doc.payload_focus || doc.retorno_focus || doc, null, 2)}
                </pre>
              )}
            </div>

            {/* Ações */}
            <footer className="px-6 py-4 border-t border-slate-200 dark:border-slate-700/70 shrink-0 bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex flex-wrap gap-2">
                {tipo === 'CTE' && doc.status === 'RASCUNHO' && (
                  <button
                    onClick={() => acao(() => api.post(`/transporte/ctes/${doc.id}/emitir`), 'CT-e enviado à SEFAZ!')}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Transmitir à SEFAZ
                  </button>
                )}

                {tipo === 'CTE' && doc.status === 'AUTORIZADO' && (
                  <>
                    <button
                      onClick={() => setModalCorrecao(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <FilePen className="w-3.5 h-3.5" />
                      Carta de Correção
                    </button>
                    <button
                      onClick={() => setModalCancelar(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  </>
                )}

                {tipo === 'MDFE' && doc.status === 'RASCUNHO' && (
                  <button
                    onClick={() => acao(() => api.post(`/transporte/mdfes/${doc.id}/emitir`), 'MDF-e enviado à SEFAZ!')}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Transmitir MDF-e
                  </button>
                )}

                {tipo === 'MDFE' && doc.status === 'AUTORIZADO' && (
                  <>
                    <button
                      onClick={() => setModalCondutor(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Incluir condutor
                    </button>
                    <button
                      onClick={() => setModalDfe(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Incluir DF-e
                    </button>
                    <button
                      onClick={() => onVerRoteiro?.(doc.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Roteiro
                    </button>
                  </>
                )}
              </div>
            </footer>
          </>
        )}
      </aside>

      {/* Modal Cancelamento */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Cancelar documento
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              A SEFAZ só aceita cancelamento de documento autorizado há até 7 dias.
            </p>
            <textarea
              rows={4}
              placeholder="Justificativa do cancelamento (mínimo 15 caracteres)"
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              className="w-full mt-4 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
            />
            <p className="text-[11px] text-slate-400 mt-1">{justificativa.trim().length}/15 caracteres</p>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button onClick={() => setModalCancelar(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">
                Voltar
              </button>
              <button
                onClick={() => acao(
                    () => api.post(`/transporte/${tipo === 'CTE' ? 'ctes' : 'mdfes'}/${doc.id}/cancelar`, { justificativa }),
                    'Documento cancelado!'
                )}
                disabled={enviando || justificativa.trim().length < 15}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {enviando ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Carta de Correção */}
      {modalCorrecao && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FilePen className="w-5 h-5 text-violet-500" />
              Carta de Correção Eletrônica
            </h3>
            <textarea
              rows={5}
              placeholder="Descreva a correção (mínimo 15 caracteres)"
              value={corrigenda}
              onChange={e => setCorrigenda(e.target.value)}
              className="w-full mt-4 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button onClick={() => setModalCorrecao(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">
                Voltar
              </button>
              <button
                onClick={() => acao(
                    () => api.post(`/transporte/ctes/${doc.id}/carta-correcao`, { correcao: corrigenda }),
                    'Carta de Correção registrada!'
                )}
                disabled={enviando || corrigenda.trim().length < 15}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : 'Emitir CC-e'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Condutor */}
      {modalCondutor && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-cyan-500" />
              Incluir condutor em trânsito
            </h3>
            <div className="space-y-3 mt-4">
              <input
                type="text" placeholder="Nome completo do condutor"
                value={condutor.nome}
                onChange={e => setCondutor({ ...condutor, nome: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
              />
              <input
                type="text" placeholder="CPF (somente números)"
                value={condutor.cpf}
                onChange={e => setCondutor({ ...condutor, cpf: e.target.value.replace(/\D/g, '') })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button onClick={() => setModalCondutor(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">
                Voltar
              </button>
              <button
                onClick={() => acao(
                    () => api.post(`/transporte/mdfes/${doc.id}/incluir-condutor`, condutor),
                    'Condutor incluído no MDF-e!'
                )}
                disabled={enviando || !condutor.nome || condutor.cpf.length < 11}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
              >
                {enviando ? 'Incluindo...' : 'Incluir condutor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Incluir DF-e */}
      {modalDfe && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-indigo-500" />
              Incluir documento no manifesto
            </h3>
            <div className="space-y-3 mt-4">
              <input
                type="text" placeholder="Protocolo de autorização do MDF-e"
                value={dfe.protocolo}
                onChange={e => setDfe({ ...dfe, protocolo: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
              />
              <input
                type="text" placeholder="Código IBGE do município de carregamento"
                value={dfe.codigo_municipio_carregamento}
                onChange={e => setDfe({ ...dfe, codigo_municipio_carregamento: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
              />
              <input
                type="text" placeholder="Chave da NF-e (44 dígitos) ou do CT-e"
                value={dfe.chave}
                onChange={e => setDfe({ ...dfe, chave: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button onClick={() => setModalDfe(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">
                Voltar
              </button>
              <button
                onClick={() => acao(
                    () => api.post(`/transporte/mdfes/${doc.id}/incluir-dfe`, {
                        protocolo: dfe.protocolo,
                        codigo_municipio_carregamento: dfe.codigo_municipio_carregamento,
                        documentos: [{
                            chave_nfe: dfe.chave,
                            codigo_municipio_descarregamento: dfe.codigo_municipio_carregamento
                        }]
                    }),
                    'Documento incluído no MDF-e!'
                )}
                disabled={enviando || !dfe.protocolo || !dfe.chave}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {enviando ? 'Incluindo...' : 'Incluir documento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
