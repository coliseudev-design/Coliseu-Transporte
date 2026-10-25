import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import DocumentoDrawer from '../../components/DocumentoDrawer';
import {
  FileText, Truck, Search, Calendar, Download, Eye,
  RefreshCw, X, FileStack, ArrowUpRight
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
  qtd_documentos: number;
}

export default function DocumentosEmitidosPage() {
  const [tipo, setTipo] = useState<'TODOS' | 'CTE' | 'MDFE'>('TODOS');
  const [status, setStatus] = useState('TODAS');
  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [drawer, setDrawer] = useState<{ tipo: 'CTE' | 'MDFE'; id: number } | null>(null);

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
    }
  });

  const documentos: Documento[] = data?.data || [];

  const statusBadge = (s: string) => {
    const cores: Record<string, string> = {
      AUTORIZADO: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      PROCESSANDO: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
      REJEITADO: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300',
      CANCELADO: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
      ENCERRADO: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
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

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Tipo</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Documento</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Chave de Acesso</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Emissão</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Emitente</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Rota</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Valor</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Status</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                {documentos.map(doc => (
                  <tr
                    key={`${doc.tipo_documento}-${doc.id}`}
                    onClick={() => setDrawer({ tipo: doc.tipo_documento, id: doc.id })}
                    className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        doc.tipo_documento === 'CTE'
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}>
                        {doc.tipo_documento === 'CTE'
                          ? <FileText className="w-3 h-3" />
                          : <Truck className="w-3 h-3" />}
                        {doc.tipo_documento === 'CTE' ? 'CT-e' : 'MDF-e'}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60">
                      <p className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        Nº {doc.numero || '—'}
                        {doc.serie && <span className="text-[10px] text-slate-400 font-normal ml-1">SÉRIE {doc.serie}</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {doc.qtd_documentos} doc. vinculado(s)
                      </p>
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 font-mono text-[10px] text-slate-500 dark:text-slate-400 max-w-[180px] truncate">
                      {doc.chave || doc.ref}
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-slate-900 dark:text-white max-w-[160px] truncate" title={doc.emitente_nome}>
                      {doc.emitente_nome || '—'}
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {doc.uf_inicio} → {doc.uf_fim}
                      {doc.municipio_inicio && (
                        <span className="block text-[10px] text-slate-400">
                          {doc.municipio_inicio}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-right font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      R$ {Number(doc.valor_total || doc.valor_carga || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(doc.status)}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-right whitespace-nowrap space-x-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setDrawer({ tipo: doc.tipo_documento, id: doc.id })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 text-[11px] font-semibold transition-colors"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        Detalhes
                      </button>
                      {doc.caminho_pdf && (
                        <a
                          href={doc.caminho_pdf}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-[11px] font-medium transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          PDF
                        </a>
                      )}
                      {doc.caminho_xml && (
                        <a
                          href={doc.caminho_xml}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-[11px] font-medium transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          XML
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer de detalhes (compartilhado com as telas específicas) */}
      <DocumentoDrawer
        tipo={drawer?.tipo || 'CTE'}
        documentoId={drawer?.id || null}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
