import React, { useState } from 'react'
import { useApiQuery } from '../../hooks/useApi'
import { ScrollText, Search, Filter, RefreshCw, Clock, User, AlertCircle, FileText, Send, Trash2, Edit3, XCircle, CheckCircle2, Layers } from 'lucide-react'
import clsx from 'clsx'

interface LogItem {
  id: number
  tenant_id: string
  titulo_id: number | null
  financeiro_id: number | null
  tipo_evento: string
  usuario: string
  nosso_numero: string | null
  numero_documento: string | null
  descricao: string
  detalhes: any
  data_evento: string
}

export default function SystemLogsSection() {
  const [search, setSearch] = useState('')
  const [tipoEvento, setTipoEvento] = useState('TODOS')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [selectedLogJson, setSelectedLogJson] = useState<LogItem | null>(null)

  const { data: logsRes, isLoading, refetch } = useApiQuery<{
    data: LogItem[]
    total: number
    page: number
    totalPages: number
  }>('/financeiro/logs', {
    search,
    tipo_evento: tipoEvento,
    startDate,
    endDate,
    page,
    limit: 50
  })

  const logs = logsRes?.data || []
  const total = logsRes?.total || 0
  const totalPages = logsRes?.totalPages || 1

  const getEventBadge = (tipo: string) => {
    const t = (tipo || '').toUpperCase()
    if (t.includes('ELIMINACAO') || t.includes('EXCLUSAO') || t.includes('DELET')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 flex items-center gap-1 w-fit">
          <Trash2 size={11} /> {tipo}
        </span>
      )
    }
    if (t.includes('ALTERACAO') || t.includes('EDIT')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 flex items-center gap-1 w-fit">
          <Edit3 size={11} /> {tipo}
        </span>
      )
    }
    if (t.includes('CANCEL')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 flex items-center gap-1 w-fit">
          <XCircle size={11} /> {tipo}
        </span>
      )
    }
    if (t.includes('EMAIL') || t.includes('BOLETO') || t.includes('ENVIO')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 flex items-center gap-1 w-fit">
          <Send size={11} /> {tipo}
        </span>
      )
    }
    if (t.includes('VINCULO')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 flex items-center gap-1 w-fit">
          <Layers size={11} /> {tipo}
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 flex items-center gap-1 w-fit">
        <CheckCircle2 size={11} /> {tipo}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-md border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/40">
            <ScrollText size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-base tracking-tight">Central de Logs e Auditoria do Sistema</h3>
            <p className="text-xs text-slate-400">
              Histórico unificado de eliminações, alterações, envios de boletos/e-mails, cancelamentos e movimentações.
            </p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
        >
          <RefreshCw size={13} className={clsx(isLoading && "animate-spin")} />
          Atualizar Logs
        </button>
      </div>

      {/* Bar de Filtros */}
      <div className="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por usuário, título, boleto ou texto..."
            className="input pl-8 py-1 text-xs font-semibold w-full"
          />
        </div>

        <div>
          <select
            value={tipoEvento}
            onChange={(e) => { setTipoEvento(e.target.value); setPage(1); }}
            className="input py-1 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300"
          >
            <option value="TODOS">Todos os Eventos / Ações</option>
            <option value="ELIMINACAO_TITULO">Eliminações de Títulos</option>
            <option value="ALTERACAO_TITULO">Alterações e Edições</option>
            <option value="CANCELAMENTO_BOLETO">Cancelamentos de Boleto</option>
            <option value="ENVIO_EMAIL">Envios por E-mail</option>
            <option value="ENVIO_BOLETO">Envios por WhatsApp/Boleto</option>
            <option value="VINCULO_MANUAL">Vínculos Manuais</option>
            <option value="EMISSAO_ASAAS">Emissões Asaas</option>
          </select>
        </div>

        <div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="input py-1 text-xs font-medium w-full"
            placeholder="Data Inicial"
          />
        </div>

        <div>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="input py-1 text-xs font-medium w-full"
            placeholder="Data Final"
          />
        </div>
      </div>

      {/* Tabela de Logs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Usuário</th>
                <th className="p-3">Evento / Operação</th>
                <th className="p-3">Título / Nosso Nº</th>
                <th className="p-3">Descrição Detalhada</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                    Carregando histórico de logs do sistema...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                    Nenhum registro de log encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                logs.map((log: LogItem) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400" />
                        {new Date(log.data_evento).toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="p-3 font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-indigo-600" />
                        {log.usuario || 'Operador'}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {getEventBadge(log.tipo_evento)}
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {log.nosso_numero ? `#${log.nosso_numero}` : log.titulo_id ? `#${log.titulo_id}` : '—'}
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200 max-w-md">
                      <p className="line-clamp-2 leading-relaxed text-[11px]">{log.descricao}</p>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {log.detalhes ? (
                        <button
                          onClick={() => setSelectedLogJson(log)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-bold text-[10px] border border-slate-300 dark:border-slate-600 cursor-pointer transition-all"
                        >
                          Ver JSON
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-500">
            Exibindo {logs.length} de {total} registros (Página {page} de {totalPages})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Modal Visualizador de JSON do Log */}
      {selectedLogJson && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                Detalhes da Operação (JSON) — Log #{selectedLogJson.id}
              </h4>
              <button
                onClick={() => setSelectedLogJson(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-80 border border-slate-800">
              {JSON.stringify(selectedLogJson.detalhes, null, 2)}
            </pre>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLogJson(null)}
                className="btn-secondary !py-1 !px-4 text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
