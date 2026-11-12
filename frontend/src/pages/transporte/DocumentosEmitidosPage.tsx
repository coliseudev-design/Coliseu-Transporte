import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import TabelaResponsiva from '../../components/TabelaResponsiva';
import DocumentoDrawer from '../../components/DocumentoDrawer';
import {
  FileText, Truck, Search, Calendar, Download, Eye,
  RefreshCw, X, FileStack, ArrowUpRight, Send, CheckCircle2, AlertTriangle, Loader2,
  CheckSquare, Ban, Mail
} from 'lucide-react';

interface Documento {
  tipo_documento: 'CTE' | 'MDFE';
  id: number;
  ref: string;
  numero: number;
  serie: string;
  modelo: string;
  status: string;
  status_sefaz: string;
  mensagem_sefaz: string;
  chave: string;
  natureza_operacao: string;
  tipo_servico: string;
  modal: string;
  uf_inicio: string;
  uf_fim: string;
  municipio_inicio: string;
  municipio_fim: string;
  valor_total: number;
  valor_carga: number;
  peso_bruto: number;
  valor_icms: number;
  aliquota_icms: number;
  caminho_xml: string;
  caminho_pdf: string;
  protocolo: string;
  data_emissao: string;
  emitente_nome: string;
  focus_ambiente?: string;
  qtd_documentos: number;
}

export default function DocumentosEmitidosPage() {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<'TODOS' | 'CTE' | 'MDFE'>('TODOS');
  const [status, setStatus] = useState('TODAS');
  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [drawer, setDrawer] = useState<{ tipo: 'CTE' | 'MDFE'; id: number } | null>(null);
  const [modalEncerrarDoc, setModalEncerrarDoc] = useState<Documento | null>(null);
  const [municipioEncerrar, setMunicipioEncerrar] = useState('');
  const [modalCancelarDoc, setModalCancelarDoc] = useState<Documento | null>(null);
  const [justificativaCancelar, setJustificativaCancelar] = useState('');
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [enviandoTomadorId, setEnviandoTomadorId] = useState<number | null>(null);

  const handleEnviarTomador = async (doc: Documento) => {
    setEnviandoTomadorId(doc.id);
    try {
      const res = await api.post(`/transporte/ctes/${doc.id}/enviar-tomador`);
      alert(res.data?.message || 'XML e DACTE enviados ao Tomador com sucesso!');
    } catch (e: any) {
      if (e?.response?.data?.requires_email) {
        const digitado = window.prompt(
          'Nenhum e-mail cadastrado para o Tomador deste CT-e. Digite o(s) e-mail(s) de destino (separados por vírgula):'
        );
        if (digitado && digitado.trim()) {
          try {
            const res2 = await api.post(`/transporte/ctes/${doc.id}/enviar-tomador`, {
              emails: digitado.trim()
            });
            alert(res2.data?.message || 'XML e DACTE enviados com sucesso!');
          } catch (e2: any) {
            alert(e2?.response?.data?.error || 'Erro ao enviar XML/DACTE por e-mail.');
          }
        }
      } else {
        alert(e?.response?.data?.error || 'Erro ao enviar XML/DACTE ao Tomador.');
      }
    } finally {
      setEnviandoTomadorId(null);
    }
  };
  const [gerandoTestes, setGerandoTestes] = useState(false);
  const [gerandoMdfesTeste, setGerandoMdfesTeste] = useState(false);
  const [resultadoTestes, setResultadoTestes] = useState<{
    tipoLote?: 'CTE' | 'MDFE';
    criados: number;
    autorizados: number;
    encerrados?: number;
    resultados: any[];
  } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['documentos-emitidos', tipo, status, search, dataInicio, dataFim],
    queryFn: async () => {
      const res = await api.get('/transporte/documentos', {
        params: {
          tipo,
          status: status !== 'TODAS' ? status : undefined,
          search: search || undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          limit: 500
        }
      });
      return res.data;
    },
    refetchInterval: (query) => {
      const rows = (query.state.data as any)?.data || [];
      return rows.some((r: Documento) => r.status === 'PROCESSANDO') ? 5000 : false;
    }
  });

  const documentos: Documento[] = data?.data || [];

  const handleGerarCtesTesteHomologacao = async () => {
    setGerandoTestes(true);
    setResultadoTestes(null);
    try {
      const res = await api.post('/transporte/ctes/gerar-teste-homologacao');
      setResultadoTestes({ ...res.data, tipoLote: 'CTE' });
      await refetch();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao gerar e transmitir novos CT-es de teste.');
    } finally {
      setGerandoTestes(false);
    }
  };

  const handleGerarMdfesTesteHomologacao = async () => {
    setGerandoMdfesTeste(true);
    setResultadoTestes(null);
    try {
      const res = await api.post('/transporte/mdfes/gerar-teste-homologacao');
      setResultadoTestes({ ...res.data, tipoLote: 'MDFE' });
      await refetch();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao gerar e transmitir MDF-es de teste.');
    } finally {
      setGerandoMdfesTeste(false);
    }
  };

  const statusBadge = (s: string) => {
    const cores: Record<string, string> = {
      AUTORIZADO: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      PROCESSANDO: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
      REJEITADO: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300',
      CANCELADO: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
      ENCERRADO: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
      RASCUNHO: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
    };
    return cores[s] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  };

  const limparFiltros = () => {
    setTipo('TODOS');
    setStatus('TODAS');
    setSearch('');
    setDataInicio('');
    setDataFim('');
  };

  const handleBaixarArquivo = async (
    tipoDoc: 'CTE' | 'MDFE',
    idDoc: number,
    formato: 'pdf' | 'xml',
    fallbackUrl?: string
  ) => {
    try {
      const res = await api.get(`/transporte/documentos/${tipoDoc}/${idDoc}/download/${formato}`, {
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
        link.download = `${tipoDoc.toLowerCase()}-${idDoc}.xml`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e: any) {
      if (fallbackUrl) {
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(
          e?.response?.data?.error ||
            `Arquivo ${formato.toUpperCase()} ainda não disponível para este documento.`
        );
      }
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileStack className="w-6 h-6 text-brand-600 dark:text-brand-500" />
            Documentos Emitidos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            CT-e e MDF-e consultados na mesma listagem, com protocolo, chave de acesso e artefatos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGerarCtesTesteHomologacao}
            disabled={gerandoTestes || gerandoMdfesTeste}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-60"
            title="Cria e transmite 2 novos CT-es de teste em homologação na SEFAZ/MS (Interno MS 17% e Interestadual 12% + IBS/CBS)"
          >
            {gerandoTestes ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {gerandoTestes
              ? 'Emitindo CT-es na SEFAZ/MS...'
              : 'Gerar Novos CT-es de Teste (SEFAZ/MS)'}
          </button>

          <button
            type="button"
            onClick={handleGerarMdfesTesteHomologacao}
            disabled={gerandoTestes || gerandoMdfesTeste}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors disabled:opacity-60"
            title="Cria e transmite 2 MDF-es 3.00 em homologação na SEFAZ/MS (Interno MS encerrado + Interestadual MS → SP autorizado)"
          >
            {gerandoMdfesTeste ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Truck className="w-3.5 h-3.5" />
            )}
            {gerandoMdfesTeste
              ? 'Emitindo MDF-es na SEFAZ/MS...'
              : 'Gerar MDF-es de Teste (SEFAZ/MS)'}
          </button>

          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {resultadoTestes && (
        <div className="bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Lote de Teste Homologação SEFAZ/MS processado: {resultadoTestes.criados}{' '}
                {resultadoTestes.tipoLote === 'MDFE' ? 'MDF-e(s)' : 'CT-e(s)'} emitido(s) ({resultadoTestes.autorizados} autorizado(s)
                {typeof resultadoTestes.encerrados === 'number' ? `, ${resultadoTestes.encerrados} encerrado(s)` : ''})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setResultadoTestes(null)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {(resultadoTestes.resultados || []).map((r: any, idx: number) => {
              const docId = r.mdfe_id || r.cte_id;
              const docTipo: 'CTE' | 'MDFE' = r.mdfe_id ? 'MDFE' : 'CTE';
              const pdfFallback = r.caminho_damdfe || r.caminho_dacte;
              return (
                <div
                  key={docId || idx}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      Nº {r.numero || '—'} — {r.descricao}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      Status: <strong className="text-slate-800 dark:text-slate-200">{r.status}</strong>
                      {r.placa ? ` · Placa ${r.placa}` : ''}
                      {r.status_sefaz ? ` (SEFAZ ${r.status_sefaz})` : ''}
                      {r.mensagem_sefaz ? ` — ${r.mensagem_sefaz}` : ''}
                      {r.error ? ` — ${r.error}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {docId && (
                      <button
                        type="button"
                        onClick={() => setDrawer({ tipo: docTipo, id: docId })}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-[11px]"
                      >
                        Detalhes
                      </button>
                    )}
                    {(r.status === 'AUTORIZADO' || r.status === 'ENCERRADO') && docId && (
                      <button
                        type="button"
                        onClick={() => handleBaixarArquivo(docTipo, docId, 'pdf', pdfFallback)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-[11px]"
                      >
                        {docTipo === 'MDFE' ? 'DAMDFE (PDF)' : 'DACTE (PDF)'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
        {/* Filtro por tipo de documento */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-16">Tipo</span>
          <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
            {([
              { id: 'TODOS', label: 'Todos', icon: FileStack },
              { id: 'CTE', label: 'CT-e', icon: FileText },
              { id: 'MDFE', label: 'MDF-e', icon: Truck }
            ] as const).map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    tipo === t.id
                      ? 'bg-white dark:bg-slate-800 text-brand-700 dark:text-brand-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por chave de acesso, número do documento, emitente ou série..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
            />
          </div>

          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-3 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="TODAS">Todos os status</option>
            <option value="AUTORIZADO">Autorizados</option>
            <option value="PROCESSANDO">Processando</option>
            <option value="REJEITADO">Rejeitados</option>
            <option value="RASCUNHO">Rascunhos</option>
            <option value="CANCELADO">Cancelados</option>
            <option value="ENCERRADO">Encerrados</option>
          </select>

          <button
            onClick={limparFiltros}
            className="px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>
      </div>

      {/* Listagem unificada */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando documentos emitidos...</div>
        ) : documentos.length === 0 ? (
          <div className="p-12 text-center">
            <FileStack className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum documento encontrado</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Ajuste os filtros ou emita um CT-e / MDF-e pela Central de Cargas.
            </p>
          </div>
        ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
            <TabelaResponsiva<Documento>
              dados={documentos}
              chaveDe={d => `${d.tipo_documento}-${d.id}`}
              aoClicar={d => setDrawer({ tipo: d.tipo_documento, id: d.id })}
              colunas={[
                {
                  chave: 'tipo',
                  rotulo: 'Tipo',
                  render: d => (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      d.tipo_documento === 'CTE'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}>
                      {d.tipo_documento === 'CTE'
                        ? <FileText className="w-3 h-3" />
                        : <Truck className="w-3 h-3" />}
                      {d.tipo_documento === 'CTE' ? 'CT-e' : 'MDF-e'}
                    </span>
                  )
                },
                {
                  chave: 'documento',
                  rotulo: 'Documento',
                  render: d => (
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        Nº {d.numero || '—'}
                        {d.serie && <span className="text-[10px] text-slate-400 font-normal ml-1">SÉRIE {d.serie}</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{d.qtd_documentos} doc. vinculado(s)</p>
                    </div>
                  )
                },
                {
                  chave: 'chave',
                  rotulo: 'Chave de Acesso',
                  ocultarNoCelular: true,
                  render: d => (
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 block max-w-[180px] truncate">
                      {d.chave || d.ref}
                    </span>
                  )
                },
                {
                  chave: 'emissao',
                  rotulo: 'Emissão',
                  ocultarNoCelular: true,
                  render: d => (
                    <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {d.data_emissao ? new Date(d.data_emissao).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  )
                },
                {
                  chave: 'emitente',
                  rotulo: 'Emitente',
                  render: d => (
                    <span className="text-slate-900 dark:text-white block truncate max-w-[170px]" title={d.emitente_nome}>
                      {d.emitente_nome || '—'}
                    </span>
                  )
                },
                {
                  chave: 'rota',
                  rotulo: 'Rota',
                  render: d => (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {d.uf_inicio} → {d.uf_fim}
                      </span>
                      {d.municipio_inicio && (
                        <span className="block text-[10px] text-slate-400">{d.municipio_inicio}</span>
                      )}
                    </div>
                  )
                },
                {
                  chave: 'valor',
                  rotulo: 'Valor',
                  alinhamento: 'right',
                  render: d => (
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      R$ {Number(d.valor_total || d.valor_carga || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )
                },
                {
                  chave: 'status',
                  rotulo: 'Status / Ambiente',
                  render: d => (
                    <div className="flex flex-col items-start gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusBadge(d.status)}`}>
                        {d.status}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          String(d.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {String(d.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
                          ? 'Produção'
                          : 'Homologação'}
                      </span>
                    </div>
                  )
                },
                {
                  chave: 'acoes',
                  rotulo: 'Ações',
                  alinhamento: 'right',
                  render: d => (
                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setDrawer({ tipo: d.tipo_documento, id: d.id })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 text-[11px] font-semibold transition-colors"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        <span className="hidden xl:inline">Detalhes</span>
                      </button>
                      {(d.caminho_pdf || d.status === 'AUTORIZADO' || d.status === 'ENCERRADO') && (
                        <button
                          type="button"
                          onClick={() => handleBaixarArquivo(d.tipo_documento, d.id, 'pdf', d.caminho_pdf)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-[11px] font-semibold transition-colors"
                          title={d.tipo_documento === 'CTE' ? 'Visualizar / Imprimir DACTE Oficial (PDF)' : 'Visualizar / Imprimir DAMDFE Oficial (PDF)'}
                        >
                          <Eye className="w-3 h-3" />
                          <span className="hidden xl:inline">
                            {d.tipo_documento === 'CTE' ? 'DACTE (PDF)' : 'DAMDFE (PDF)'}
                          </span>
                        </button>
                      )}
                      {(d.caminho_xml || d.status === 'AUTORIZADO' || d.status === 'ENCERRADO') && (
                        <button
                          type="button"
                          onClick={() => handleBaixarArquivo(d.tipo_documento, d.id, 'xml', d.caminho_xml)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-[11px] font-medium transition-colors"
                          title="Baixar XML Oficial Autorizado"
                        >
                          <Download className="w-3 h-3" />
                          <span className="hidden xl:inline">XML</span>
                        </button>
                      )}
                      {d.tipo_documento === 'CTE' && d.status === 'AUTORIZADO' && (
                        <button
                          type="button"
                          disabled={enviandoTomadorId === d.id}
                          onClick={() => handleEnviarTomador(d)}
                          title="Enviar XML + DACTE por e-mail ao Tomador"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        >
                          {enviandoTomadorId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Mail className="w-3 h-3" />
                          )}
                          <span className="hidden 2xl:inline">Tomador</span>
                        </button>
                      )}
                      {d.tipo_documento === 'MDFE' && d.status === 'AUTORIZADO' && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalEncerrarDoc(d);
                            setMunicipioEncerrar(d.municipio_fim || d.municipio_inicio || '');
                          }}
                          title="Encerrar MDF-e na SEFAZ (e encerrar CIOT vinculado)"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-[11px] font-semibold transition-colors"
                        >
                          <CheckSquare className="w-3 h-3" />
                          <span className="hidden 2xl:inline">Encerrar</span>
                        </button>
                      )}
                      {d.status === 'AUTORIZADO' && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalCancelarDoc(d);
                            setJustificativaCancelar('');
                          }}
                          title={`Cancelar ${d.tipo_documento === 'CTE' ? 'CT-e' : 'MDF-e'} na SEFAZ`}
                          aria-label={`Cancelar ${d.tipo_documento === 'CTE' ? 'CT-e' : 'MDF-e'}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-100 text-[11px] font-semibold transition-colors"
                        >
                          <Ban className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                }
              ]}
            />
          </div>
        )}
      </div>

      {/* Modal Rápido: Encerrar MDF-e na SEFAZ (+ CIOT vinculado) */}
      {modalEncerrarDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-amber-600" />
              Encerrar MDF-e Nº {modalEncerrarDoc.numero || modalEncerrarDoc.id}
            </h3>
            <p className="text-xs text-slate-500">
              Registra o evento oficial 110112 na SEFAZ liberando o veículo/condutor e encerra automaticamente o CIOT vinculado.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Município de Encerramento ({modalEncerrarDoc.uf_fim}) *
              </label>
              <input
                type="text"
                value={municipioEncerrar}
                onChange={e => setMunicipioEncerrar(e.target.value)}
                placeholder="Ex: Dourados ou São Paulo"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEncerrarDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={processandoAcao || !municipioEncerrar.trim()}
                onClick={async () => {
                  setProcessandoAcao(true);
                  try {
                    const res = await api.post(`/transporte/mdfes/${modalEncerrarDoc.id}/encerrar`, {
                      siglaUf: modalEncerrarDoc.uf_fim,
                      nomeMunicipio: municipioEncerrar.trim()
                    });
                    setModalEncerrarDoc(null);
                    await refetch();
                    qc.invalidateQueries({ queryKey: ['mdfes'] });
                    qc.invalidateQueries({ queryKey: ['ciot-consulta'] });
                    qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });
                    const ciotsEnc = Number(res.data?.ciots_encerrados || 0);
                    alert(
                      `MDF-e encerrado com sucesso na SEFAZ!${
                        ciotsEnc > 0 ? ` (${ciotsEnc} operação CIOT vinculada também encerrada automaticamente.)` : ''
                      }`
                    );
                  } catch (e: any) {
                    alert(e?.response?.data?.error || 'Erro ao encerrar MDF-e na SEFAZ.');
                  } finally {
                    setProcessandoAcao(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {processandoAcao ? 'Encerrando...' : 'Confirmar Encerramento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rápido: Cancelar CT-e ou MDF-e na SEFAZ */}
      {modalCancelarDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-600" />
              Cancelar {modalCancelarDoc.tipo_documento === 'CTE' ? 'CT-e' : 'MDF-e'} Nº{' '}
              {modalCancelarDoc.numero || modalCancelarDoc.id}
            </h3>
            <p className="text-xs text-slate-500">
              Informe a justificativa fiscal de cancelamento na SEFAZ (mínimo de 15 caracteres).
            </p>
            <textarea
              rows={3}
              value={justificativaCancelar}
              onChange={e => setJustificativaCancelar(e.target.value)}
              placeholder="Descreva o motivo do cancelamento (mínimo 15 caracteres)..."
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalCancelarDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={processandoAcao || justificativaCancelar.trim().length < 15}
                onClick={async () => {
                  setProcessandoAcao(true);
                  try {
                    const rota =
                      modalCancelarDoc.tipo_documento === 'CTE' ? 'ctes' : 'mdfes';
                    await api.post(`/transporte/${rota}/${modalCancelarDoc.id}/cancelar`, {
                      justificativa: justificativaCancelar.trim()
                    });
                    setModalCancelarDoc(null);
                    await refetch();
                    qc.invalidateQueries({ queryKey: ['ctes'] });
                    qc.invalidateQueries({ queryKey: ['mdfes'] });
                    alert('Documento cancelado com sucesso na SEFAZ!');
                  } catch (e: any) {
                    alert(e?.response?.data?.error || 'Erro ao cancelar documento na SEFAZ.');
                  } finally {
                    setProcessandoAcao(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {processandoAcao ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer de detalhes (compartilhado com as telas específicas) */}
      <DocumentoDrawer
        tipo={drawer?.tipo || 'CTE'}
        documentoId={drawer?.id || null}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
