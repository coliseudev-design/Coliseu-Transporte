import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  X, FileText, Truck, CheckCircle2, AlertTriangle, XCircle, Clock,
  Download, Eye, Send, Ban, FilePen, UserPlus, PlusCircle,
  MapPin, Package, Copy, Loader2, ShieldCheck, Info, RefreshCw, Mail, CheckSquare, Trash2
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
    CARTA_CORRECAO: 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400',
    INCLUSAO_CONDUTOR: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400',
    INCLUSAO_DFE: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400'
};

const PRESETS_CCE_CTE = [
  { id: 'compl|xObs', label: 'Observações Gerais do CT-e (compl / xObs)', grupo: 'compl', campo: 'xObs' },
  { id: 'ide|CFOP', label: 'CFOP da Prestação (ide / CFOP)', grupo: 'ide', campo: 'CFOP' },
  { id: 'ide|natOp', label: 'Natureza da Operação (ide / natOp)', grupo: 'ide', campo: 'natOp' },
  { id: 'infCarga|proPred', label: 'Produto Predominante (infCarga / proPred)', grupo: 'infCarga', campo: 'proPred' },
  { id: 'infCarga|xOutCat', label: 'Outras Características da Carga (infCarga / xOutCat)', grupo: 'infCarga', campo: 'xOutCat' },
  { id: 'enderReme|xLgr', label: 'Logradouro do Remetente (enderReme / xLgr)', grupo: 'enderReme', campo: 'xLgr' },
  { id: 'enderDest|xLgr', label: 'Logradouro do Destinatário (enderDest / xLgr)', grupo: 'enderDest', campo: 'xLgr' },
  { id: 'enderDest|nro', label: 'Número do Endereço Destinatário (enderDest / nro)', grupo: 'enderDest', campo: 'nro' },
  { id: 'enderDest|xBairro', label: 'Bairro do Destinatário (enderDest / xBairro)', grupo: 'enderDest', campo: 'xBairro' },
  { id: 'CUSTOM', label: 'Outro Grupo / Campo XML do CT-e (Personalizado)', grupo: '', campo: '' }
];

interface ItemCorrecaoCce {
  preset: string;
  grupo_corrigido: string;
  campo_corrigido: string;
  valor_corrigido: string;
  numero_item_alterado: string;
}

export default function DocumentoDrawer({ tipo, documentoId, onClose, onVerRoteiro }: DrawerProps) {
  const qc = useQueryClient();
  const [aba, setAba] = useState<'resumo' | 'eventos' | 'json'>('resumo');
  const [modalCancelar, setModalCancelar] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [modalCarga, setModalCarga] = useState(false);
  const [modalCondutor, setModalCondutor] = useState(false);
  const [modalDfe, setModalDfe] = useState(false);
  const [condutor, setCondutor] = useState({ nome: '', cpf: '' });
  const [dfe, setDfe] = useState({
    protocolo: '',
    codigo_municipio_carregamento: '',
    nome_municipio_carregamento: '',
    uf_carregamento: '',
    codigo_municipio_descarregamento: '',
    nome_municipio_descarregamento: '',
    uf_descarregamento: '',
    chave: ''
  });
  const [correcoesCce, setCorrecoesCce] = useState<ItemCorrecaoCce[]>([
    {
      preset: 'compl|xObs',
      grupo_corrigido: 'compl',
      campo_corrigido: 'xObs',
      valor_corrigido: '',
      numero_item_alterado: ''
    }
  ]);
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
      const res = await fn();
      const d = res?.data || {};
      await refetch();
      qc.invalidateQueries({ queryKey: ['ctes'] });
      qc.invalidateQueries({ queryKey: ['mdfes'] });
      qc.invalidateQueries({ queryKey: ['documentos-emitidos'] });
      qc.invalidateQueries({ queryKey: ['ciot-consulta'] });
      qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });
      setModalCancelar(false);
      setModalCarga(false);
      setModalCondutor(false);
      setModalDfe(false);
      setModalCorrecao(false);
      setJustificativa('');
      setCorrecoesCce([
        {
          preset: 'compl|xObs',
          grupo_corrigido: 'compl',
          campo_corrigido: 'xObs',
          valor_corrigido: '',
          numero_item_alterado: ''
        }
      ]);
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['cargas-dashboard'] });
      if (d.status === 'REJEITADO') {
        const msgRej = `SEFAZ [${d.status_sefaz || 'REJEITADO'}]: ${d.mensagem_sefaz || 'Documento rejeitado pela SEFAZ.'}`;
        setErro(msgRej);
        alert(msgRej);
      } else if (d.status === 'AUTORIZADO') {
        alert(
          `${tipo} AUTORIZADO pela SEFAZ!\n` +
            `• Ambiente: ${(d.ambiente || d.focus_ambiente) === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO (Testes)'}\n` +
            `• Número/Série: ${d.numero || '—'} / ${d.serie || '1'}\n` +
            `• Protocolo SEFAZ: ${d.protocolo || '—'}`
        );
      } else {
        alert(msg);
      }
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
      ENCERRADO: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
      RASCUNHO: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
    };
    return cores[status] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  };

  const handleBaixarArquivo = async (formato: 'pdf' | 'xml', fallbackUrl?: string) => {
    if (!doc?.id) return;
    try {
      const res = await api.get(`/transporte/documentos/${tipo}/${doc.id}/download/${formato}`, {
        params: { _t: Date.now() },
        responseType: 'blob'
      });
      const mime = formato === 'xml' ? 'application/xml' : 'application/pdf';
      const blob = new Blob([res.data], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      if (formato === 'pdf') {
        window.open(blobUrl, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${tipo.toLowerCase()}-${doc.chave_cte || doc.chave_mdfe || doc.id}.xml`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      if (fallbackUrl) {
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      }
    }
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
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    String(doc.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  {String(doc.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
                    ? 'Produção SEFAZ'
                    : 'Homologação SEFAZ (Sem Valor Fiscal)'}
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                          { label: 'Valor do Frete', value: `R$ ${Number(doc.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                          { label: 'Valor da Carga', value: `R$ ${Number(doc.valor_carga || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                          { label: 'Peso Bruto', value: `${Number(doc.peso_bruto || 0).toLocaleString('pt-BR')} kg` },
                          { label: 'ICMS', value: `R$ ${Number(doc.valor_icms || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                          {
                            label: 'IBS + CBS (Reforma)',
                            value: `R$ ${(Number(doc.valor_ibs || 0) + Number(doc.valor_cbs || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          },
                          {
                            label: 'CST / cClassTrib',
                            value: `${doc.ibs_cbs_cst || '000'} · ${doc.ibs_cbs_class_trib || doc.codigo_situacao_fiscal || '000001'}`
                          }
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
                        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/50">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                            <div>
                              <p className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wider">
                                CIOT vinculado (ANTT)
                              </p>
                              <p className="text-xs font-mono font-bold text-teal-900 dark:text-teal-200">
                                {doc.ciot_codigo}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] text-teal-700 dark:text-teal-300 font-medium">
                            {doc.status === 'ENCERRADO'
                              ? 'Encerrado c/ MDF-e'
                              : 'Encerra junto ao MDF-e'}
                          </span>
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
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Arquivos Fiscais Oficiais (SEFAZ / Focus NFe)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {((tipo === 'CTE' ? doc.caminho_dacte : doc.caminho_damdfe) || doc.status === 'AUTORIZADO' || doc.status === 'ENCERRADO') && (
                        <button
                          type="button"
                          onClick={() => handleBaixarArquivo('pdf', tipo === 'CTE' ? doc.caminho_dacte : doc.caminho_damdfe)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-sm transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {tipo === 'CTE' ? 'Imprimir DACTE Oficial (PDF)' : 'Imprimir DAMDFE Oficial (PDF)'}
                        </button>
                      )}
                      {(doc.caminho_xml || doc.status === 'AUTORIZADO' || doc.status === 'ENCERRADO') && (
                        <button
                          type="button"
                          onClick={() => handleBaixarArquivo('xml', doc.caminho_xml)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar XML Autorizado
                        </button>
                      )}
                      {doc.status !== 'AUTORIZADO' && doc.status !== 'ENCERRADO' && !doc.caminho_xml && !(tipo === 'CTE' ? doc.caminho_dacte : doc.caminho_damdfe) && (
                        <span className="text-xs text-slate-400 italic">
                          O DACTE/DAMDFE (PDF) e o XML oficial ficam disponíveis imediatamente após a autorização pela SEFAZ.
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
                {doc.status !== 'RASCUNHO' && (
                  <button
                    onClick={() => acao(
                      () => api.post(`/transporte/${tipo === 'CTE' ? 'ctes' : 'mdfes'}/${doc.id}/consultar-focus`),
                      'Status sincronizado com a Focus NFe / SEFAZ!'
                    )}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${enviando ? 'animate-spin' : ''}`} />
                    Consultar SEFAZ
                  </button>
                )}

                {(tipo === 'CTE' && (doc.status === 'RASCUNHO' || doc.status === 'REJEITADO')) && (
                  <button
                    onClick={() => acao(() => api.post(`/transporte/ctes/${doc.id}/emitir`), 'CT-e enviado à SEFAZ!')}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Transmitir à SEFAZ
                  </button>
                )}

                {(doc.status === 'RASCUNHO' || doc.status === 'REJEITADO') && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Deseja excluir este ${tipo} (${doc.status}) e liberar as NF-es vinculadas na Central de Cargas?`)) {
                        return;
                      }
                      setEnviando(true);
                      try {
                        await api.delete(`/transporte/${tipo === 'CTE' ? 'ctes' : 'mdfes'}/${doc.id}`);
                        qc.invalidateQueries({ queryKey: ['cargas'] });
                        qc.invalidateQueries({ queryKey: ['cargas-dashboard'] });
                        qc.invalidateQueries({ queryKey: ['ctes'] });
                        qc.invalidateQueries({ queryKey: ['mdfes'] });
                        qc.invalidateQueries({ queryKey: ['documentos-emitidos'] });
                        alert(`${tipo} excluído e NF-es liberadas com sucesso!`);
                        onClose();
                      } catch (e: any) {
                        alert(e.response?.data?.error || e.message || 'Erro ao excluir rascunho/rejeitado.');
                      } finally {
                        setEnviando(false);
                      }
                    }}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir e Liberar NF-es
                  </button>
                )}

                {tipo === 'CTE' && doc.status === 'AUTORIZADO' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBaixarArquivo('pdf', doc.caminho_dacte)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Imprimir DACTE (PDF)
                    </button>
                    <button
                      onClick={() => setModalCorrecao(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <FilePen className="w-3.5 h-3.5" />
                      Carta de Correção
                    </button>
                    <button
                      onClick={() => {
                        const email = window.prompt('Informe o(s) e-mail(s) separado(s) por vírgula para envio do XML e DACTE:');
                        if (email && email.trim()) {
                          acao(
                            () => api.post(`/transporte/ctes/${doc.id}/enviar-email`, { emails: email.split(',').map(s => s.trim()).filter(Boolean) }),
                            'E-mail fiscal enviado com sucesso!'
                          );
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Enviar E-mail
                    </button>
                    <button
                      onClick={() => setModalCancelar(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  </>
                )}

                {tipo === 'MDFE' && (doc.status === 'RASCUNHO' || doc.status === 'REJEITADO') && (
                  <button
                    onClick={() => acao(() => api.post(`/transporte/mdfes/${doc.id}/emitir`), 'MDF-e enviado à SEFAZ!')}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Transmitir MDF-e
                  </button>
                )}

                {tipo === 'MDFE' && doc.status === 'ENCERRADO' && (
                  <button
                    type="button"
                    onClick={() => handleBaixarArquivo('pdf', doc.caminho_damdfe)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Imprimir DAMDFE (PDF)
                  </button>
                )}

                {tipo === 'MDFE' && doc.status === 'AUTORIZADO' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBaixarArquivo('pdf', doc.caminho_damdfe)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Imprimir DAMDFE (PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const munPadrao = doc.municipio_descarregamento || '';
                        const nomeMunicipio = window.prompt(
                          `Confirme o município de encerramento (${doc.uf_fim || 'UF'}):`,
                          munPadrao
                        );
                        if (nomeMunicipio && nomeMunicipio.trim()) {
                          acao(
                            () =>
                              api.post(`/transporte/mdfes/${doc.id}/encerrar`, {
                                siglaUf: doc.uf_fim,
                                codigoMunicipio: doc.codigo_municipio_descarregamento,
                                nomeMunicipio: nomeMunicipio.trim()
                              }),
                            'MDF-e encerrado com sucesso na SEFAZ! Placa e condutor liberados.'
                          );
                        }
                      }}
                      disabled={enviando}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Encerrar MDF-e
                    </button>
                    <button
                      onClick={() => setModalCondutor(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Incluir condutor
                    </button>
                    <button
                      onClick={() => {
                        setDfe({
                          protocolo: doc.protocolo || '',
                          codigo_municipio_carregamento: doc.codigo_municipio_carregamento || '',
                          nome_municipio_carregamento: doc.municipio_carregamento || '',
                          uf_carregamento: doc.uf_inicio || '',
                          codigo_municipio_descarregamento: doc.codigo_municipio_descarregamento || '',
                          nome_municipio_descarregamento: doc.municipio_descarregamento || '',
                          uf_descarregamento: doc.uf_fim || '',
                          chave: ''
                        });
                        setModalDfe(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Incluir DF-e
                    </button>
                    <button
                      onClick={() => onVerRoteiro?.(doc.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Roteiro
                    </button>
                    <button
                      onClick={() => setModalCancelar(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancelar MDF-e
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

      {/* Modal Carta de Correção Estruturada SEFAZ CT-e */}
      {modalCorrecao && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FilePen className="w-5 h-5 text-teal-500" />
              Carta de Correção Eletrônica (CC-e — CT-e 4.00)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Selecione o grupo/campo oficial do XML a retificar. Pelo Ajuste SINIEF 09/07, <strong>não é permitido</strong> alterar valores de frete/impostos, alíquota ICMS, CNPJ/CPF de partes ou data de emissão.
            </p>

            <div className="space-y-3 mt-4">
              {correcoesCce.map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Item #{idx + 1} da CC-e
                    </span>
                    {correcoesCce.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCorrecoesCce(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Campo do CT-e a Corrigir
                    </label>
                    <select
                      value={item.preset}
                      onChange={e => {
                        const val = e.target.value;
                        const found = PRESETS_CCE_CTE.find(p => p.id === val);
                        setCorrecoesCce(prev =>
                          prev.map((row, i) =>
                            i === idx
                              ? {
                                  ...row,
                                  preset: val,
                                  grupo_corrigido: found && val !== 'CUSTOM' ? found.grupo : row.grupo_corrigido,
                                  campo_corrigido: found && val !== 'CUSTOM' ? found.campo : row.campo_corrigido
                                }
                              : row
                          )
                        );
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                    >
                      {PRESETS_CCE_CTE.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {item.preset === 'CUSTOM' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Grupo XML (ex: compl)"
                        value={item.grupo_corrigido}
                        onChange={e =>
                          setCorrecoesCce(prev =>
                            prev.map((row, i) => (i === idx ? { ...row, grupo_corrigido: e.target.value } : row))
                          )
                        }
                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        placeholder="Campo XML (ex: xObs)"
                        value={item.campo_corrigido}
                        onChange={e =>
                          setCorrecoesCce(prev =>
                            prev.map((row, i) => (i === idx ? { ...row, campo_corrigido: e.target.value } : row))
                          )
                        }
                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white"
                      />
                      <input
                        type="number"
                        min={1}
                        placeholder="Nº Item (opcional)"
                        value={item.numero_item_alterado}
                        onChange={e =>
                          setCorrecoesCce(prev =>
                            prev.map((row, i) => (i === idx ? { ...row, numero_item_alterado: e.target.value } : row))
                          )
                        }
                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Novo Valor Corrigido ({item.grupo_corrigido || 'grupo'} / {item.campo_corrigido || 'campo'}) *
                    </label>
                    <textarea
                      rows={item.campo_corrigido === 'xObs' ? 3 : 2}
                      placeholder="Informe o novo conteúdo exato para este campo..."
                      value={item.valor_corrigido}
                      onChange={e =>
                        setCorrecoesCce(prev =>
                          prev.map((row, i) => (i === idx ? { ...row, valor_corrigido: e.target.value } : row))
                        )
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setCorrecoesCce(prev => [
                    ...prev,
                    {
                      preset: 'compl|xObs',
                      grupo_corrigido: 'compl',
                      campo_corrigido: 'xObs',
                      valor_corrigido: '',
                      numero_item_alterado: ''
                    }
                  ])
                }
                className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Adicionar outro campo nesta CC-e
              </button>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button onClick={() => setModalCorrecao(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">
                Voltar
              </button>
              <button
                onClick={() =>
                  acao(
                    () =>
                      api.post(`/transporte/ctes/${doc.id}/carta-correcao`, {
                        correcoes: correcoesCce.map(c => ({
                          grupo_corrigido: c.grupo_corrigido.trim(),
                          campo_corrigido: c.campo_corrigido.trim(),
                          valor_corrigido: c.valor_corrigido.trim(),
                          ...(c.numero_item_alterado ? { numero_item_alterado: Number(c.numero_item_alterado) } : {})
                        }))
                      }),
                    'Carta de Correção Eletrônica autorizada na SEFAZ!'
                  )
                }
                disabled={
                  enviando ||
                  correcoesCce.some(
                    c => !c.grupo_corrigido.trim() || !c.campo_corrigido.trim() || !c.valor_corrigido.trim()
                  )
                }
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              >
                {enviando ? 'Transmitindo CC-e...' : 'Emitir CC-e na SEFAZ'}
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

      {/* Modal Incluir DF-e em Trânsito (MDF-e 3.00) */}
      {modalDfe && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-teal-500" />
              Incluir DF-e (NF-e ou CT-e) em Trânsito no MDF-e
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Informe os municípios de carregamento e descarregamento separadamente e a chave de 44 dígitos (o sistema identifica automaticamente NF-e mod. 55 ou CT-e mod. 57).
            </p>

            <div className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Protocolo de Autorização do MDF-e
                </label>
                <input
                  type="text"
                  placeholder="Protocolo SEFAZ (15 dígitos)"
                  value={dfe.protocolo}
                  onChange={e => setDfe({ ...dfe, protocolo: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <p className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                  1. Local de Carregamento
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                  <input
                    type="text"
                    placeholder="Município de Carregamento"
                    value={dfe.nome_municipio_carregamento}
                    onChange={e => setDfe({ ...dfe, nome_municipio_carregamento: e.target.value })}
                    className="sm:col-span-3 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="UF"
                    value={dfe.uf_carregamento}
                    onChange={e => setDfe({ ...dfe, uf_carregamento: e.target.value.toUpperCase() })}
                    className="sm:col-span-1 px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase text-center"
                  />
                  <input
                    type="text"
                    placeholder="IBGE (7 díg.)"
                    value={dfe.codigo_municipio_carregamento}
                    onChange={e => setDfe({ ...dfe, codigo_municipio_carregamento: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                    className="sm:col-span-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <p className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                  2. Local de Descarregamento (Destino da Carga)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                  <input
                    type="text"
                    placeholder="Município de Descarga"
                    value={dfe.nome_municipio_descarregamento}
                    onChange={e => setDfe({ ...dfe, nome_municipio_descarregamento: e.target.value })}
                    className="sm:col-span-3 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="UF"
                    value={dfe.uf_descarregamento}
                    onChange={e => setDfe({ ...dfe, uf_descarregamento: e.target.value.toUpperCase() })}
                    className="sm:col-span-1 px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase text-center"
                  />
                  <input
                    type="text"
                    placeholder="IBGE (7 díg.)"
                    value={dfe.codigo_municipio_descarregamento}
                    onChange={e => setDfe({ ...dfe, codigo_municipio_descarregamento: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                    className="sm:col-span-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chave de Acesso de 44 dígitos (NF-e ou CT-e) *
                </label>
                <input
                  type="text"
                  placeholder="44 dígitos numéricos da chave SEFAZ"
                  value={dfe.chave}
                  onChange={e => setDfe({ ...dfe, chave: e.target.value.replace(/\D/g, '').slice(0, 44) })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
                {dfe.chave.length === 44 && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                    Modelo detectado: {dfe.chave.slice(20, 22) === '57' || dfe.chave.slice(20, 22) === '67' ? 'CT-e (Modelo 57/67)' : 'NF-e (Modelo 55)'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button onClick={() => setModalDfe(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">
                Voltar
              </button>
              <button
                onClick={() => {
                  const chaveLimpa = dfe.chave.replace(/\D/g, '');
                  const modelo = chaveLimpa.slice(20, 22);
                  const ehCte = modelo === '57' || modelo === '67';
                  acao(
                    () =>
                      api.post(`/transporte/mdfes/${doc.id}/incluir-dfe`, {
                        protocolo: dfe.protocolo || undefined,
                        codigo_municipio_carregamento: dfe.codigo_municipio_carregamento || undefined,
                        nome_municipio_carregamento: dfe.nome_municipio_carregamento || undefined,
                        uf_carregamento: dfe.uf_carregamento || undefined,
                        documentos: [
                          {
                            ...(ehCte ? { chave_cte: chaveLimpa } : { chave_nfe: chaveLimpa }),
                            codigo_municipio_descarregamento: dfe.codigo_municipio_descarregamento || undefined,
                            nome_municipio_descarregamento: dfe.nome_municipio_descarregamento || undefined,
                            uf_descarregamento: dfe.uf_descarregamento || undefined
                          }
                        ]
                      }),
                    'Documento fiscal incluído com sucesso no MDF-e em trânsito!'
                  );
                }}
                disabled={
                  enviando ||
                  dfe.chave.replace(/\D/g, '').length !== 44 ||
                  (!dfe.codigo_municipio_carregamento && !dfe.nome_municipio_carregamento) ||
                  (!dfe.codigo_municipio_descarregamento && !dfe.nome_municipio_descarregamento)
                }
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              >
                {enviando ? 'Transmitindo Evento SEFAZ...' : 'Incluir DF-e na SEFAZ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
