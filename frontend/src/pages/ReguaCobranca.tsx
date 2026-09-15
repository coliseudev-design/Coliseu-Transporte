import { useState, useEffect } from 'react'
import { useApiQuery } from '../hooks/useApi'
import axios from 'axios'
import DataTable from '../components/DataTable'
import {
  HelpCircle, Settings, FileText, Check, Plus, Trash2, ArrowUp, ArrowDown,
  RefreshCw, Play, Pause, AlertTriangle, Layers, Calendar, ChevronRight, X
} from 'lucide-react'
import { formatBRL, formatDate } from '../utils/format'

interface Regua {
  id: number;
  nome: string;
  descricao: string;
  padrao: boolean;
}

interface Etapa {
  id?: number;
  dias_relativos: number;
  tipo_acao: string;
  canais: string;
  template_whatsapp_id?: number | null;
  template_email_id?: number | null;
  acao_pos_contato?: string;
  condicao_disparo?: string;
  ordem?: number;
}

interface Titulo {
  id: number;
  descricao: string;
  data_vencimento: string;
  valor: number;
  status_pagamento: string;
  regua_id: number | null;
  regua_pausada: boolean;
  cliente_nome: string;
  cliente_documento: string;
  cliente_telefone: string;
  dias_atraso: number;
  regua_nome: string | null;
}

interface Template {
  id: number;
  nome: string;
  categoria: string;
  subcategoria?: string | null;
}

export default function ReguaCobranca() {
  useEffect(() => {
    document.title = "Motor & Régua de Cobrança - Coliseu Transporte"
  }, [])
  const [activeTab, setActiveTab] = useState<'config' | 'titles'>('config')

  // Queries
  const { data: reguasRes, refetch: refetchReguas } = useApiQuery<{ data: Regua[] }>('/cobranca/reguas')
  const { data: templatesRes } = useApiQuery<{ data: Template[] }>('/templates')
  const { data: titulosRes, refetch: refetchTitulos } = useApiQuery<{ data: Titulo[] }>('/cobranca/titulos')

  const reguas = reguasRes?.data || [];
  const templates = templatesRes?.data || [];
  const titulos = titulosRes?.data || [];

  const whatsappTemplates = templates.filter(t => t.categoria === 'Mensagem WhatsApp' && t.subcategoria === 'cobranca');
  const emailTemplates = templates.filter(t => t.categoria === 'E-mail de Cobrança' && t.subcategoria === 'cobranca');

  // Automation State
  const { data: automacoesRes, refetch: refetchAutomacoes } = useApiQuery<{ data: any[] }>('/automacoes')
  const automacoes = automacoesRes?.data || []
  const activeAutomations = automacoes.filter(a => a.template_subcategoria === 'cobranca')
  const isAutoDispatchActive = activeAutomations.length > 0 && activeAutomations.some(a => a.ativo)

  const handleToggleAutoDispatch = async () => {
    const templatesCobranca = whatsappTemplates
    if (templatesCobranca.length === 0) {
      alert('Por favor, crie um template de WhatsApp com a subcategoria "Cobrança" no menu de Acervos.')
      return
    }

    try {
      if (activeAutomations.length > 0) {
        for (const aut of activeAutomations) {
          await axios.put(`/api/automacoes/${aut.id}`, {
            ativo: !isAutoDispatchActive
          })
        }
      } else {
        // Cria regras de automação padrão para todos os templates de cobrança
        for (const temp of templatesCobranca) {
          await axios.post('/api/automacoes', {
            template_id: temp.id,
            ativo: true,
            gatilho: 'titulo_vencido',
            dias_vencimento: 1 // 1 dia após o vencimento
          })
        }
      }
      refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status do envio automático.')
    }
  }

  // Selected Regua Config
  const [selectedReguaId, setSelectedReguaId] = useState<number | null>(null)
  const { data: etapasRes, refetch: refetchEtapas } = useApiQuery<{ data: Etapa[] }>(
    selectedReguaId ? `/cobranca/reguas/${selectedReguaId}/etapas` : '',
    undefined,
    { enabled: !!selectedReguaId }
  )
  const etapas = etapasRes?.data || [];

  // Regua Create/Edit
  const [isReguaModalOpen, setIsReguaModalOpen] = useState(false)
  const [reguaForm, setReguaForm] = useState({ nome: '', descricao: '', padrao: false })
  const [editingReguaId, setEditingReguaId] = useState<number | null>(null)

  // Etapa Create/Edit
  const [isEtapaModalOpen, setIsEtapaModalOpen] = useState(false)
  const [etapaForm, setEtapaForm] = useState<Etapa>({
    dias_relativos: 0,
    tipo_acao: 'Lembrete',
    canais: 'whatsapp',
    template_whatsapp_id: null,
    template_email_id: null,
    acao_pos_contato: 'Nenhuma',
    condicao_disparo: ''
  })

  // Titles checkboxes & batch action
  const [selectedTitleIds, setSelectedTitleIds] = useState<number[]>([])
  const [batchAction, setBatchAction] = useState('')
  const [batchReguaId, setBatchReguaId] = useState('')

  // Engine processing log
  const [engineLogs, setEngineLogs] = useState<string[] | null>(null)
  const [processingEngine, setProcessingEngine] = useState(false)

  // 1. SAVE REGUA
  const handleSaveRegua = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingReguaId) {
        await axios.put(`/api/cobranca/reguas/${editingReguaId}`, reguaForm);
      } else {
        const res = await axios.post('/api/cobranca/reguas', reguaForm);
        setSelectedReguaId(res.data.data.id);
      }
      setIsReguaModalOpen(false);
      setReguaForm({ nome: '', descricao: '', padrao: false });
      setEditingReguaId(null);
      refetchReguas();
    } catch (err) {
      console.error(err);
    }
  };

  // 2. DELETE REGUA
  const handleDeleteRegua = async (id: number) => {
    if (!confirm('Deseja excluir esta régua de cobrança?')) return;
    try {
      await axios.delete(`/api/cobranca/reguas/${id}`);
      setSelectedReguaId(null);
      refetchReguas();
    } catch (err) {
      console.error(err);
    }
  };

  // 3. BULK SAVE ETAPAS (on add/edit/delete/reorder)
  const handleSaveEtapasList = async (updatedEtapas: Etapa[]) => {
    if (!selectedReguaId) return;
    try {
      await axios.post(`/api/cobranca/reguas/${selectedReguaId}/etapas`, { etapas: updatedEtapas });
      refetchEtapas();
    } catch (err) {
      console.error(err);
    }
  };

  // 4. ADD ETAPA
  const handleAddEtapaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = [...etapas, etapaForm];
    handleSaveEtapasList(updated);
    setIsEtapaModalOpen(false);
    setEtapaForm({
      dias_relativos: 0,
      tipo_acao: 'Lembrete',
      canais: 'whatsapp',
      template_whatsapp_id: null,
      template_email_id: null,
      acao_pos_contato: 'Nenhuma',
      condicao_disparo: ''
    });
  };

  // 5. DELETE ETAPA
  const handleDeleteEtapa = (index: number) => {
    const updated = etapas.filter((_, i) => i !== index);
    handleSaveEtapasList(updated);
  };

  // 6. REORDER ETAPAS (Simple push up/down)
  const handleMoveEtapa = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === etapas.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...etapas];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    handleSaveEtapasList(updated);
  };

  // 7. BATCH ACTION EXECUTION
  const handleExecuteBatchAction = async () => {
    if (selectedTitleIds.length === 0) {
      alert('Nenhum título selecionado.');
      return;
    }
    if (!batchAction) return;
    
    try {
      await axios.post('/api/cobranca/titulos/acao-lote', {
        ids: selectedTitleIds,
        acao: batchAction,
        regua_id: batchReguaId ? parseInt(batchReguaId, 10) : undefined
      });
      setSelectedTitleIds([]);
      setBatchAction('');
      setBatchReguaId('');
      refetchTitulos();
      alert('Ação de lote executada com sucesso!');
    } catch (err) {
      console.error(err);
    }
  };

  // 8. RUN DAILY COBRANÇA ENGINE MOCK/LIVE
  const handleRunCobrancaEngine = async () => {
    setProcessingEngine(true);
    setEngineLogs(null);
    try {
      const res = await axios.post('/api/cobranca/engine/process');
      setEngineLogs(res.data.logs);
      refetchTitulos();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao rodar motor.');
    } finally {
      setProcessingEngine(false);
    }
  };

  // Checklist select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTitleIds(titulos.map(t => t.id));
    } else {
      setSelectedTitleIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedTitleIds([...selectedTitleIds, id]);
    } else {
      setSelectedTitleIds(selectedTitleIds.filter(x => x !== id));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Motor & Régua de Cobrança</h2>
          <p className="text-xs text-text-secondary">Automatize disparos preventivos e pós-vencimento de parcelas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Automatic Cobrança toggle status */}
          <button
            onClick={handleToggleAutoDispatch}
            className={`py-1.5 px-3 text-[11px] font-bold rounded-sm flex items-center gap-1.5 transition-all border ${
              isAutoDispatchActive
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-150 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isAutoDispatchActive ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
            {isAutoDispatchActive ? 'Cobrança Automática: ATIVADA' : 'Começar o Envio Automático'}
          </button>

          <button
            className="btn-secondary text-xs flex items-center gap-1.5"
            onClick={handleRunCobrancaEngine}
            disabled={processingEngine}
          >
            <RefreshCw size={14} className={processingEngine ? 'animate-spin' : ''} /> 
            {processingEngine ? 'Processando...' : 'Rodar Motor de Cobrança'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-divider">
        <button
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'config' ? 'border-brand-500 text-brand-500' : 'border-transparent text-text-secondary'
          }`}
          onClick={() => setActiveTab('config')}
        >
          Configuração de Réguas
        </button>
        <button
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'titles' ? 'border-brand-500 text-brand-500' : 'border-transparent text-text-secondary'
          }`}
          onClick={() => { setActiveTab('titles'); refetchTitulos(); }}
        >
          Gestão de Títulos & Log
        </button>
      </div>

      {/* Content Area */}
      {activeTab === 'config' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* List of Réguas */}
          <div className="card p-5 space-y-4 lg:col-span-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Réguas Cadastradas</span>
              <button
                className="text-brand-500 hover:text-brand-700 flex items-center gap-0.5 text-xs font-bold"
                onClick={() => {
                  setEditingReguaId(null);
                  setReguaForm({ nome: '', descricao: '', padrao: false });
                  setIsReguaModalOpen(true);
                }}
              >
                <Plus size={14} /> Nova Régua
              </button>
            </div>

            <div className="space-y-2">
              {reguas.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-4">Nenhuma régua configurada.</p>
              ) : (
                reguas.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReguaId(r.id)}
                    className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all duration-300 ${
                      selectedReguaId === r.id
                        ? 'border-brand-500 bg-brand-500/5'
                        : 'border-divider hover:bg-bg-secondary/40'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-text-primary text-xs flex items-center gap-1.5">
                        {r.nome}
                        {r.padrao && <span className="bg-brand-500/10 text-brand-500 text-[8px] uppercase py-0.2 px-1 rounded">Padrão</span>}
                      </div>
                      <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-1">{r.descricao || 'Sem descrição'}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        className="text-text-muted hover:text-brand-500 p-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingReguaId(r.id);
                          setReguaForm({ nome: r.nome, descricao: r.descricao, padrao: r.padrao });
                          setIsReguaModalOpen(true);
                        }}
                      >
                        <Settings size={12} />
                      </button>
                      <button
                        className="text-text-muted hover:text-danger p-0.5"
                        onClick={(e) => { e.stopPropagation(); handleDeleteRegua(r.id); }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* List of stages for the selected régua */}
          <div className="card p-5 space-y-4 lg:col-span-2">
            {selectedReguaId ? (
              <>
                <div className="flex justify-between items-center border-b border-divider pb-3">
                  <div>
                    <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">
                      Etapas da Régua: {reguas.find(r => r.id === selectedReguaId)?.nome}
                    </h3>
                    <p className="text-[10px] text-text-secondary">Defina as ações em ordem cronológica de dias de atraso</p>
                  </div>
                  <button
                    className="btn-primary py-1.5 text-xs flex items-center gap-1"
                    onClick={() => setIsEtapaModalOpen(true)}
                  >
                    <Plus size={14} /> Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-3">
                  {etapas.length === 0 ? (
                    <div className="py-12 border border-dashed border-divider rounded-xl text-center text-xs text-text-muted">
                      Nenhuma etapa configurada para esta régua. Adicione a primeira etapa!
                    </div>
                  ) : (
                    etapas.map((et, idx) => (
                      <div key={idx} className="p-4 bg-bg-secondary/40 border border-divider rounded-xl flex items-center justify-between hover:border-border transition-all">
                        <div className="flex items-center gap-3">
                          <div className="font-mono text-xs font-bold text-brand-500 bg-brand-500/10 h-8 w-14 rounded flex items-center justify-center text-center">
                            {et.dias_relativos === 0 ? 'D0' : et.dias_relativos > 0 ? `+${et.dias_relativos}d` : `${et.dias_relativos}d`}
                          </div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs text-text-primary flex items-center gap-1.5">
                              {et.tipo_acao}
                              <span className="bg-slate-100 text-slate-600 text-[9px] uppercase px-1 rounded font-normal">{et.canais}</span>
                            </div>
                            <p className="text-[10px] text-text-secondary">
                              WhatsApp: {whatsappTemplates.find(t => t.id === et.template_whatsapp_id)?.nome || 'Nenhum'} | 
                              E-mail: {emailTemplates.find(t => t.id === et.template_email_id)?.nome || 'Nenhum'}
                            </p>
                          </div>
                        </div>

                        {/* Reorder and Delete controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            className="p-1 text-text-secondary hover:bg-bg-tertiary rounded"
                            onClick={() => handleMoveEtapa(idx, 'up')}
                            disabled={idx === 0}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            className="p-1 text-text-secondary hover:bg-bg-tertiary rounded"
                            onClick={() => handleMoveEtapa(idx, 'down')}
                            disabled={idx === etapas.length - 1}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            className="p-1 text-text-secondary hover:text-danger hover:bg-danger/10 rounded ml-2"
                            onClick={() => handleDeleteEtapa(idx)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="py-24 text-center text-xs text-text-muted flex flex-col justify-center items-center gap-3">
                <Layers size={36} className="opacity-40" />
                Selecione uma régua na lateral para gerenciar suas etapas cronológicas.
              </div>
            )}
          </div>

        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          
          {/* Batch Actions panel */}
          <div className="card !p-3 flex items-center gap-3 flex-wrap bg-bg-secondary/20">
            <span className="text-xs font-bold text-text-secondary uppercase">Ações em Lote:</span>
            
            <select
              className="input !w-auto !py-1.5"
              value={batchAction}
              onChange={(e) => setBatchAction(e.target.value)}
            >
              <option value="">Selecione a ação...</option>
              <option value="Mudar Régua">Vincular a Régua</option>
              <option value="Pausar Cobrança">Pausar Régua Automática</option>
              <option value="Retomar Cobrança">Retomar Régua Automática</option>
              <option value="Disparar Manualmente">Disparar Lembrete Manual</option>
            </select>

            {batchAction === 'Mudar Régua' && (
              <select
                className="input !w-auto !py-1.5"
                value={batchReguaId}
                onChange={(e) => setBatchReguaId(e.target.value)}
              >
                <option value="">Selecione a Régua...</option>
                {reguas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            )}

            <button
              onClick={handleExecuteBatchAction}
              disabled={!batchAction || selectedTitleIds.length === 0}
              className="btn-primary !py-1.5 text-xs"
            >
              Executar em Lote ({selectedTitleIds.length})
            </button>
          </div>

          {/* Listing table */}
          <div className="overflow-x-auto border border-divider rounded-xl bg-bg-primary">
            <table className="w-full text-xs text-left">
              <thead className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider text-[10px] border-b border-divider">
                <tr>
                  <th className="p-3 w-8 text-center">
                    <input
                      type="checkbox"
                      className="accent-brand-500 mt-0.5"
                      checked={selectedTitleIds.length === titulos.length && titulos.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="p-3">Título / Parcela</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">Régua Ativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {titulos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-text-muted">Nenhum título inadimplente ou a vencer.</td>
                  </tr>
                ) : (
                  titulos.map((t) => (
                    <tr key={t.id} className="hover:bg-bg-secondary/20">
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          className="accent-brand-500"
                          checked={selectedTitleIds.includes(t.id)}
                          onChange={(e) => handleSelectOne(t.id, e.target.checked)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-text-primary">{t.descricao}</div>
                        <div className="text-[10px] text-text-secondary font-mono mt-0.5">Ref ID: #{t.id}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-text-primary">{t.cliente_nome || '—'}</div>
                        <div className="text-[10px] text-text-secondary font-mono">{t.cliente_telefone || 'Sem telefone'}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono">{new Date(t.data_vencimento).toLocaleDateString('pt-BR')}</div>
                        {t.dias_atraso > 0 && <span className="text-danger font-bold text-[9px] mt-0.5 inline-block">({t.dias_atraso} dias de atraso)</span>}
                      </td>
                      <td className="p-3 text-right font-bold text-text-primary">{formatBRL(t.valor)}</td>
                      <td className="p-3 text-center">
                        <span className={
                          t.status_pagamento === 'PAGO' ? 'badge-success' :
                          t.dias_atraso > 0 ? 'badge-danger' : 'badge-warning'
                        }>
                          {t.status_pagamento === 'PAGO' ? 'PAGO' : t.dias_atraso > 0 ? 'ATRASADO' : 'ABERTO'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-text-primary">{t.regua_nome || 'Sem Régua'}</span>
                          {t.regua_pausada && (
                            <span className="bg-red-500/10 text-red-500 text-[8px] uppercase py-0.2 px-1 rounded flex items-center gap-0.5">
                              <Pause size={8} /> Pausada
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* Regua Create / Edit Modal */}
      {isReguaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg-primary animate-scale-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-text-primary text-base">
                {editingReguaId ? 'Configurar Régua' : 'Nova Régua de Cobrança'}
              </h3>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setIsReguaModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRegua} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome da Régua *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="Ex: Régua Clientes VIP"
                  value={reguaForm.nome}
                  onChange={(e) => setReguaForm({ ...reguaForm, nome: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Descrição Curta</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex: Para faturas maiores que R$ 1.000,00"
                  value={reguaForm.descricao}
                  onChange={(e) => setReguaForm({ ...reguaForm, descricao: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="reguaPadrao"
                  className="accent-brand-500"
                  checked={reguaForm.padrao}
                  onChange={(e) => setReguaForm({ ...reguaForm, padrao: e.target.checked })}
                />
                <label htmlFor="reguaPadrao" className="text-xs font-semibold text-text-primary cursor-pointer select-none">
                  Marcar como Régua Padrão / Default
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-divider">
                <button type="button" className="btn-secondary" onClick={() => setIsReguaModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Etapa Create / Edit Modal */}
      {isEtapaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-lg p-6 bg-bg-primary animate-scale-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-text-primary text-base">Nova Etapa Cronológica</h3>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setIsEtapaModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddEtapaSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Dias Relativos ao Vencimento *</label>
                  <input
                    type="number"
                    className="input font-mono"
                    required
                    placeholder="Ex: -3 (antes) ou 5 (depois)"
                    value={etapaForm.dias_relativos}
                    onChange={(e) => setEtapaForm({ ...etapaForm, dias_relativos: parseInt(e.target.value, 10) || 0 })}
                  />
                  <span className="text-[9px] text-text-muted block">Use valores negativos para preventivos e positivos para atrasos.</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Tipo de Ação</label>
                  <select
                    className="input"
                    value={etapaForm.tipo_acao}
                    onChange={(e) => setEtapaForm({ ...etapaForm, tipo_acao: e.target.value })}
                  >
                    <option>Lembrete</option>
                    <option>Cobrança</option>
                    <option>Negativação</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Canais Disponíveis</label>
                  <select
                    className="input"
                    value={etapaForm.canais}
                    onChange={(e) => setEtapaForm({ ...etapaForm, canais: e.target.value })}
                  >
                    <option value="whatsapp">Apenas WhatsApp</option>
                    <option value="email">Apenas E-mail</option>
                    <option value="whatsapp,email">WhatsApp e E-mail</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Ação Pós-Contato</label>
                  <select
                    className="input"
                    value={etapaForm.acao_pos_contato}
                    onChange={(e) => setEtapaForm({ ...etapaForm, acao_pos_contato: e.target.value })}
                  >
                    <option>Nenhuma</option>
                    <option>Pausar Régua</option>
                    <option>Mudar Status</option>
                    <option>Notificar Atendente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-divider pt-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Template WhatsApp (Acervo)</label>
                  <select
                    className="input"
                    value={etapaForm.template_whatsapp_id || ''}
                    onChange={(e) => setEtapaForm({ ...etapaForm, template_whatsapp_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                  >
                    <option value="">Nenhum template selecionado...</option>
                    {whatsappTemplates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Template E-mail (Acervo)</label>
                  <select
                    className="input"
                    value={etapaForm.template_email_id || ''}
                    onChange={(e) => setEtapaForm({ ...etapaForm, template_email_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                  >
                    <option value="">Nenhum template selecionado...</option>
                    {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-divider">
                <button type="button" className="btn-secondary" onClick={() => setIsEtapaModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Adicionar Etapa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Engine logs Dialog */}
      {engineLogs && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-lg p-6 bg-bg-primary animate-scale-up">
            <h3 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5 text-success">
              <Check size={18} /> Execução do Motor de Cobrança Concluída
            </h3>
            <p className="text-xs text-text-secondary mb-4">Relatório detalhado das ações executadas pelo job automático:</p>
            
            <div className="bg-bg-secondary p-3 rounded-lg border border-divider max-h-[300px] overflow-y-auto font-mono text-[10px] space-y-1 text-text-primary">
              {engineLogs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-text-muted">[{index + 1}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-divider mt-4">
              <button className="btn-primary text-xs" onClick={() => setEngineLogs(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
