import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import TabelaResponsiva from '../../components/TabelaResponsiva';
import DocumentoDrawer from '../../components/DocumentoDrawer';
import {
  FileText, Send, CheckCircle2, AlertTriangle, XCircle,
  Clock, Download, ExternalLink, RefreshCw, Eye, MoreHorizontal
} from 'lucide-react';

interface Cte {
  id: number;
  ref: string;
  chave_cte: string;
  numero: number;
  serie: string;
  status: string;
  status_sefaz: string;
  mensagem_sefaz: string;
  uf_inicio: string;
  municipio_inicio: string;
  uf_fim: string;
  municipio_fim: string;
  valor_total: number;
  peso_bruto: number;
  caminho_xml: string;
  caminho_dacte: string;
  data_emissao: string;
}

export default function CtesPage() {
  const [loadingEmit, setLoadingEmit] = useState<number | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ctes'],
    queryFn: async () => {
      const res = await api.get('/transporte/ctes');
      return res.data;
    }
  });

  const ctes: Cte[] = data?.data || [];

  const handleEmitir = async (id: number) => {
    setLoadingEmit(id);
    try {
      await api.post(`/transporte/ctes/${id}/emitir`);
      alert('CT-e enviado para autorização na SEFAZ com sucesso! A Focus NFe processará assincronamente.');
      refetch();
    } catch (err: any) {
      alert('Erro ao emitir CT-e: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingEmit(null);
    }
  };

  const handleConsultarFocus = async (id: number) => {
    setLoadingEmit(id);
    try {
      await api.post(`/transporte/ctes/${id}/consultar-focus`);
      refetch();
    } catch (err: any) {
      alert('Erro ao consultar Focus NFe: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingEmit(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Conhecimentos de Transporte (CT-e 4.00)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestão de emissão de CT-e Rodoviário integrado via Focus NFe e SEFAZ.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar Status
        </button>
      </div>

      {/* Tabela de CT-es */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando conhecimentos...</div>
        ) : ctes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Nenhum CT-e emitido ou em rascunho. Vá para a <strong>Central de Cargas</strong> para criar o primeiro a partir das notas fiscais.
          </div>
        ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
            <TabelaResponsiva<Cte>
              dados={ctes}
              chaveDe={c => c.id}
              aoClicar={c => setDrawerId(c.id)}
              colunas={[
                {
                  chave: 'doc',
                  rotulo: 'Documento / Ref',
                  render: c => (
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {c.numero ? `CT-e nº ${c.numero}` : 'Rascunho'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">
                        {c.chave_cte || c.ref}
                      </p>
                    </div>
                  )
                },
                {
                  chave: 'rota',
                  rotulo: 'Rota (Início ➔ Fim)',
                  render: c => (
                    <span className="font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {c.municipio_inicio}/{c.uf_inicio} ➔ {c.municipio_fim}/{c.uf_fim}
                    </span>
                  )
                },
                {
                  chave: 'frete',
                  rotulo: 'Frete (R$)',
                  alinhamento: 'right',
                  render: c => (
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )
                },
                {
                  chave: 'peso',
                  rotulo: 'Peso',
                  alinhamento: 'right',
                  ocultarNoCelular: true,
                  render: c => (
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {Number(c.peso_bruto || 0).toLocaleString('pt-BR')} kg
                    </span>
                  )
                },
                {
                  chave: 'status',
                  rotulo: 'Status SEFAZ',
                  render: c => (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      c.status === 'AUTORIZADO'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : c.status === 'PROCESSANDO'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        : c.status === 'REJEITADO'
                        ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {c.status === 'AUTORIZADO' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {c.status === 'PROCESSANDO' && <Clock className="w-3.5 h-3.5 animate-spin" />}
                      {c.status === 'REJEITADO' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {c.status}
                    </span>
                  )
                },
                {
                  chave: 'acoes',
                  rotulo: 'Ações',
                  alinhamento: 'right',
                  render: c => (
                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                      {(c.status === 'RASCUNHO' || c.status === 'REJEITADO') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEmitir(c.id); }}
                          disabled={loadingEmit === c.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">{loadingEmit === c.id ? 'Transmitindo...' : 'Transmitir'}</span>
                        </button>
                      )}
                      {c.status !== 'RASCUNHO' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConsultarFocus(c.id); }}
                          disabled={loadingEmit === c.id}
                          title="Sincronizar status com a SEFAZ / Focus NFe"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingEmit === c.id ? 'animate-spin' : ''}`} />
                          <span className="hidden xl:inline">SEFAZ</span>
                        </button>
                      )}
                      {c.caminho_dacte && (
                        <a
                          href={c.caminho_dacte}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">DACTE</span>
                        </a>
                      )}
                      {c.caminho_xml && (
                        <a
                          href={c.caminho_xml}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">XML</span>
                        </a>
                      )}
                    </div>
                  )
                }
              ]}
            />
          </div>
        )}
      </div>

      {/* Drawer de detalhes do CT-e */}
      <DocumentoDrawer
        tipo="CTE"
        documentoId={drawerId}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}
