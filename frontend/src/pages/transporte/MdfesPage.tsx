import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import DocumentoDrawer from '../../components/DocumentoDrawer';
import {
  Truck, Send, CheckCircle2, Clock, CheckSquare,
  AlertCircle, Eye, Download, Plus, Navigation, MapPin, MoreHorizontal, RefreshCw, Loader2
} from 'lucide-react';

interface Mdfe {
  id: number;
  ref: string;
  chave_mdfe: string;
  numero: number;
  status: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  uf_inicio: string;
  uf_fim: string;
  municipio_carregamento?: string;
  municipio_descarregamento?: string;
  veiculo_placa: string;
  motorista_nome: string;
  qtd_cte: number;
  valor_carga: number;
  peso_bruto: number;
  caminho_damdfe: string;
  caminho_xml: string;
  data_emissao: string;
  focus_ambiente?: string;
}

export default function MdfesPage() {
  const navigate = useNavigate();
  const [loadingEmit, setLoadingEmit] = useState<number | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [modalEncerrar, setModalEncerrar] = useState<Mdfe | null>(null);
  const [municipioEncerramento, setMunicipioEncerramento] = useState('');
  const [ufEncerramento, setUfEncerramento] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [gerandoTestes, setGerandoTestes] = useState(false);
  const [resultadoTestes, setResultadoTestes] = useState<{
    criados: number;
    autorizados: number;
    encerrados?: number;
    resultados: any[];
  } | null>(null);

  const { data: emitentesResp } = useQuery({
    queryKey: ['empresa-emitente'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitenteAtivo = emitentesResp?.data?.[0];
  const exibirGeradorHomologacaoMs = Boolean(
    emitenteAtivo &&
    String(emitenteAtivo.focus_ambiente || 'homologacao').toLowerCase() !== 'producao' &&
    String(emitenteAtivo.uf || '').toUpperCase() === 'MS'
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mdfes'],
    queryFn: async () => {
      const res = await api.get('/transporte/mdfes');
      return res.data;
    },
    refetchInterval: (query) => {
      const rows = (query.state.data as any)?.data || [];
      return rows.some((r: Mdfe) => r.status === 'PROCESSANDO') ? 5000 : false;
    }
  });

  const mdfes: Mdfe[] = data?.data || [];

  const handleGerarMdfesTesteHomologacao = async () => {
    setGerandoTestes(true);
    setResultadoTestes(null);
    try {
      const res = await api.post('/transporte/mdfes/gerar-teste-homologacao');
      setResultadoTestes(res.data);
      await refetch();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao gerar e transmitir MDF-es de teste.');
    } finally {
      setGerandoTestes(false);
    }
  };

  const handleEmitir = async (id: number) => {
    setLoadingEmit(id);
    try {
      await api.post(`/transporte/mdfes/${id}/emitir`);
      alert('MDF-e transmitido para a SEFAZ! Processamento assíncrono em andamento.');
      refetch();
    } catch (err: any) {
      alert('Erro ao emitir MDF-e: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingEmit(null);
    }
  };

  const handleConsultarFocus = async (id: number) => {
    setLoadingEmit(id);
    try {
      await api.post(`/transporte/mdfes/${id}/consultar-focus`);
      refetch();
    } catch (err: any) {
      alert('Erro ao consultar MDF-e na Focus NFe: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingEmit(null);
    }
  };

  const handleBaixarArtefato = async (id: number, formato: 'pdf' | 'xml', fallbackUrl?: string) => {
    try {
      const res = await api.get(`/transporte/documentos/MDFE/${id}/download/${formato}`, {
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
        link.download = `mdfe-${id}.xml`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      if (fallbackUrl) window.open(fallbackUrl, '_blank');
    }
  };

  const handleEncerrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEncerrar) return;
    setEncerrando(true);
    try {
      await api.post(`/transporte/mdfes/${modalEncerrar.id}/encerrar`, {
        siglaUf: ufEncerramento || modalEncerrar.uf_fim,
        nomeMunicipio: municipioEncerramento || 'Destino'
      });
      alert('MDF-e encerrado com sucesso! Veículo e condutor liberados na SEFAZ.');
      setModalEncerrar(null);
      refetch();
    } catch (err: any) {
      alert('Erro ao encerrar MDF-e: ' + (err.response?.data?.error || err.message));
    } finally {
      setEncerrando(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Truck className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Manifestos Eletrônicos de Documentos Fiscais (MDF-e 3.00)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Agrupamento de CT-e/NF-e por rota, despacho de veículos e encerramento de viagens.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {exibirGeradorHomologacaoMs && (
            <button
              type="button"
              onClick={handleGerarMdfesTesteHomologacao}
              disabled={gerandoTestes}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors disabled:opacity-60"
              title="Emite 2 MDF-es 3.00 em homologação na SEFAZ/MS (Interno MS encerrado + Interestadual MS → SP autorizado)"
            >
              {gerandoTestes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {gerandoTestes ? 'Emitindo MDF-es SEFAZ/MS...' : 'Gerar MDF-es de Teste (Homologação)'}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate('/transporte/mdfe/novo')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Emitir MDF-e
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {resultadoTestes && (
        <div className="bg-teal-50/90 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/70 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-900 dark:text-teal-200">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
              <span>
                Lote MDF-e Homologação SEFAZ/MS processado: {resultadoTestes.criados} MDF-e(s) emitido(s) ({resultadoTestes.autorizados} autorizado(s)
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
            {(resultadoTestes.resultados || []).map((r: any, idx: number) => (
              <div
                key={r.mdfe_id || idx}
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
                  {r.mdfe_id && (
                    <button
                      type="button"
                      onClick={() => setDrawerId(r.mdfe_id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-[11px]"
                    >
                      Detalhes
                    </button>
                  )}
                  {(r.status === 'AUTORIZADO' || r.status === 'ENCERRADO') && r.mdfe_id && (
                    <button
                      type="button"
                      onClick={() => handleBaixarArtefato(r.mdfe_id, 'pdf', r.caminho_damdfe)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-[11px]"
                    >
                      DAMDFE (PDF)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid de Manifestos */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando manifestos...</div>
      ) : mdfes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Navigation className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum MDF-e emitido</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Após emitir os CT-es, você pode agrupá-los em uma viagem/MDF-e vinculando veículo e condutor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mdfes.map(mdfe => (
            <div key={mdfe.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono text-slate-400">MDF-e nº {mdfe.numero || mdfe.ref}</span>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                    {mdfe.uf_inicio} ➔ {mdfe.uf_fim}
                  </h3>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  mdfe.status === 'AUTORIZADO'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : mdfe.status === 'ENCERRADO'
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    : mdfe.status === 'PROCESSANDO'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}>
                  {mdfe.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 block">Veículo (Placa)</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono text-sm">{mdfe.veiculo_placa}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Condutor / Motorista</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">{mdfe.motorista_nome}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Carga Total</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">R$ {Number(mdfe.valor_carga || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Peso Bruto</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{Number(mdfe.peso_bruto || 0).toLocaleString('pt-BR')} kg</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex gap-2">
                  {(mdfe.caminho_damdfe || mdfe.status === 'AUTORIZADO' || mdfe.status === 'ENCERRADO') && (
                    <button
                      type="button"
                      onClick={() => handleBaixarArtefato(mdfe.id, 'pdf', mdfe.caminho_damdfe)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      DAMDFE
                    </button>
                  )}
                  {(mdfe.caminho_xml || mdfe.status === 'AUTORIZADO' || mdfe.status === 'ENCERRADO') && (
                    <button
                      type="button"
                      onClick={() => handleBaixarArtefato(mdfe.id, 'xml', mdfe.caminho_xml)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      XML
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  {(mdfe.status === 'RASCUNHO' || mdfe.status === 'REJEITADO') && (
                    <button
                      onClick={() => handleEmitir(mdfe.id)}
                      disabled={loadingEmit === mdfe.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {loadingEmit === mdfe.id ? 'Transmitindo...' : 'Transmitir MDF-e'}
                    </button>
                  )}
                  {mdfe.status !== 'RASCUNHO' && (
                    <button
                      onClick={() => handleConsultarFocus(mdfe.id)}
                      disabled={loadingEmit === mdfe.id}
                      title="Consultar status na SEFAZ / Focus NFe"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingEmit === mdfe.id ? 'animate-spin' : ''}`} />
                      SEFAZ
                    </button>
                  )}
                  {mdfe.status === 'AUTORIZADO' && (
                    <>
                      <button
                        onClick={() => navigate('/transporte/roteiro')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/50 hover:bg-sky-100 transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Roteiro
                      </button>
                      <button
                        onClick={() => {
                          setMunicipioEncerramento(mdfe.municipio_descarregamento || '');
                          setUfEncerramento(mdfe.uf_fim || '');
                          setModalEncerrar(mdfe);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 transition-colors"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Encerrar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDrawerId(mdfe.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    Detalhes
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Encerramento Rápido de MDF-e */}
      {modalEncerrar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-amber-600" />
              Encerrar MDF-e nº {modalEncerrar.numero || modalEncerrar.ref}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Confirme o local de encerramento para liberar a placa <strong>{modalEncerrar.veiculo_placa}</strong> e o motorista na SEFAZ para próximas viagens.
            </p>

            <form onSubmit={handleEncerrar} className="space-y-4 mt-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                  Município de Encerramento / Descarga
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: São Paulo"
                  value={municipioEncerramento}
                  onChange={e => setMunicipioEncerramento(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                  UF
                </label>
                <input
                  type="text"
                  maxLength={2}
                  required
                  placeholder="Ex: SP"
                  value={ufEncerramento || modalEncerrar.uf_fim}
                  onChange={e => setUfEncerramento(e.target.value.toUpperCase())}
                  className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalEncerrar(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={encerrando}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 shadow-sm"
                >
                  {encerrando ? 'Encerrando...' : 'Confirmar Encerramento SEFAZ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer de detalhes do MDF-e */}
      <DocumentoDrawer
        tipo="MDFE"
        documentoId={drawerId}
        onClose={() => setDrawerId(null)}
        onVerRoteiro={() => navigate('/transporte/roteiro')}
      />
    </div>
  );
}
