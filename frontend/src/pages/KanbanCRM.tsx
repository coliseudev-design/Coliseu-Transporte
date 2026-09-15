import { useState, useMemo } from 'react'
import { useApiQuery } from '../hooks/useApi'
import axios from 'axios'
import {
  Plus, CheckSquare, MessageSquare, Mail, Sparkles, FileText,
  AlertTriangle, Eye, Calendar, User, Phone, Briefcase, MapPin, X, Info
} from 'lucide-react'
import { formatBRL } from '../utils/format'

interface Opportunity {
  id: number;
  titulo: string;
  empresa_nome: string;
  contato_principal: string;
  telefone: string;
  email: string;
  valor_estimado: number;
  prioridade: string;
  origem: string;
  estagio: string;
  motivo_perda?: string;
  tags?: string | null;
  status?: string | null;
  created_at: string;
}

interface Activity {
  id: number;
  tipo: string;
  descricao: string;
  data_hora: string;
  concluida: boolean;
}

interface Interaction {
  id: number;
  tipo: string;
  descricao: string;
  criado_por: string;
  created_at: string;
}

interface Template {
  id: number;
  nome: string;
  categoria: string;
  conteudo: string;
}

const STAGES = [
  'Novos Leads',
  'Contato Inicial',
  'Proposta Enviada',
  'Em Negociação',
  'Ganho',
  'Perdidos/Frios'
];

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const ORIGINS = ['Indicação', 'Site', 'Prospecção'];

const getPriorityColor = (p: string) => {
  switch (p) {
    case 'Urgente': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'Alta': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'Média': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    default: return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400';
  }
};

const getStageSideColor = (s: string) => {
  switch (s) {
    case 'Novos Leads': return 'border-l-blue-500';
    case 'Contato Inicial': return 'border-l-cyan-500';
    case 'Proposta Enviada': return 'border-l-purple-500';
    case 'Em Negociação': return 'border-l-warning';
    case 'Ganho': return 'border-l-success';
    case 'Perdidos/Frios': return 'border-l-danger';
    default: return 'border-l-slate-300';
  }
};

export default function KanbanCRM() {
  const { data: opsRes, refetch } = useApiQuery<{ data: Opportunity[] }>('/crm/oportunidades')
  const { data: templatesRes } = useApiQuery<{ data: Template[] }>('/templates?categoria=Mensagem WhatsApp')
  const ops = opsRes?.data || [];
  const whatsappTemplates = templatesRes?.data || [];

  // Local state for modals and overlays
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'activities'>('details')
  
  // Detail views state
  const [detailData, setDetailData] = useState<{
    oportunidade: Opportunity | null;
    interacoes: Interaction[];
    atividades: Activity[];
  } | null>(null)
  
  // Form states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newOp, setNewOp] = useState({
    titulo: '',
    empresa_nome: '',
    contato_principal: '',
    telefone: '',
    email: '',
    valor_estimado: 0,
    prioridade: 'Média',
    origem: 'Indicação',
    tags: '',
    status: 'Aguardando Contato'
  })

  // WhatsApp & Email modal
  const [communicationModal, setCommunicationModal] = useState<{
    type: 'whatsapp' | 'email' | null;
    op: Opportunity | null;
  }>({ type: null, op: null })
  const [commSubject, setCommSubject] = useState('')
  const [commBody, setCommBody] = useState('')

  // Conversion / Loss Modals
  const [conversionModalOp, setConversionModalOp] = useState<Opportunity | null>(null)
  const [conversionCpfCnpj, setConversionCpfCnpj] = useState('')
  const [lossModalOp, setLossModalOp] = useState<Opportunity | null>(null)
  const [lossReason, setLossReason] = useState('')

  // AI Proposal
  const [proposalModalText, setProposalModalText] = useState<string | null>(null)
  const [generatingProposal, setGeneratingProposal] = useState(false)

  // Scheduling activities state
  const [newActType, setNewActType] = useState('Ligação')
  const [newActDesc, setNewActDesc] = useState('')
  const [newActDate, setNewActDate] = useState('')

  // Fetch opportunity detail view
  const openDetailPanel = async (id: number) => {
    setSelectedOpId(id);
    setActiveTab('details');
    try {
      const res = await axios.get(`/api/crm/oportunidades/${id}/detalhes`);
      setDetailData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshDetails = async (id: number) => {
    try {
      const res = await axios.get(`/api/crm/oportunidades/${id}/detalhes`);
      setDetailData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('opportunityId', id.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    const idStr = e.dataTransfer.getData('opportunityId');
    if (!idStr) return;
    const opId = parseInt(idStr, 10);
    const op = ops.find(o => o.id === opId);
    if (!op || op.estagio === targetStage) return;

    if (targetStage === 'Ganho') {
      setConversionModalOp(op);
      setConversionCpfCnpj('');
    } else if (targetStage === 'Perdidos/Frios') {
      setLossModalOp(op);
      setLossReason('');
    } else {
      try {
        await axios.put(`/api/crm/oportunidades/${opId}`, { estagio: targetStage });
        refetch();
        if (selectedOpId === opId) openDetailPanel(opId);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Group columns
  const columnsData = useMemo(() => {
    const groups: Record<string, { list: Opportunity[]; totalValue: number }> = {};
    STAGES.forEach(s => {
      groups[s] = { list: [], totalValue: 0 };
    });
    ops.forEach(op => {
      if (groups[op.estagio]) {
        groups[op.estagio].list.push(op);
        groups[op.estagio].totalValue += Number(op.valor_estimado || 0);
      }
    });
    return groups;
  }, [ops]);

  // Create lead
  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/crm/oportunidades', newOp);
      setIsCreateOpen(false);
      setNewOp({
        titulo: '',
        empresa_nome: '',
        contato_principal: '',
        telefone: '',
        email: '',
        valor_estimado: 0,
        prioridade: 'Média',
        origem: 'Indicação',
        tags: '',
        status: 'Aguardando Contato'
      });
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  // Schedule activity
  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpId) return;
    try {
      await axios.post(`/api/crm/oportunidades/${selectedOpId}/atividades`, {
        tipo: newActType,
        descricao: newActDesc,
        data_hora: newActDate
      });
      setNewActDesc('');
      setNewActDate('');
      handleRefreshDetails(selectedOpId);
    } catch (err) {
      console.error(err);
    }
  };

  // Conclude activity
  const handleToggleActivity = async (actId: number, concluded: boolean) => {
    if (!selectedOpId) return;
    try {
      await axios.patch(`/api/crm/atividades/${actId}/concluir`, { concluida: !concluded });
      handleRefreshDetails(selectedOpId);
    } catch (err) {
      console.error(err);
    }
  };

  // AI Proposal
  const handleGenerateAIProposal = async () => {
    if (!selectedOpId) return;
    setGeneratingProposal(true);
    try {
      const res = await axios.post(`/api/crm/oportunidades/${selectedOpId}/gerar-proposta-ia`);
      setProposalModalText(res.data.proposta);
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingProposal(false);
    }
  };

  // Convert opportunity to client
  const handleConfirmConversion = async () => {
    if (!conversionModalOp) return;
    try {
      await axios.post(`/api/crm/oportunidades/${conversionModalOp.id}/converter`, {
        documento: conversionCpfCnpj
      });
      setConversionModalOp(null);
      refetch();
      if (selectedOpId === conversionModalOp.id) openDetailPanel(conversionModalOp.id);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro na conversão.');
    }
  };

  // Register loss
  const handleConfirmLoss = async () => {
    if (!lossModalOp || !lossReason) return;
    try {
      await axios.put(`/api/crm/oportunidades/${lossModalOp.id}`, {
        estagio: 'Perdidos/Frios',
        motivo_perda: lossReason
      });
      setLossModalOp(null);
      refetch();
      if (selectedOpId === lossModalOp.id) openDetailPanel(lossModalOp.id);
    } catch (err) {
      console.error(err);
    }
  };

  // WhatsApp template selector prefill
  const handleSelectTemplate = (template: Template) => {
    let replaced = template.conteudo;
    if (communicationModal.op) {
      const op = communicationModal.op;
      replaced = replaced
        .replace(/\{\{\s*nome_cliente\s*\}\}/gi, op.contato_principal)
        .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, op.contato_principal.split(' ')[0] || op.contato_principal)
        .replace(/\{\{\s*valor_total\s*\}\}/gi, formatBRL(op.valor_estimado));
    }
    setCommBody(replaced);
  };

  // Send Omnichannel
  const handleSendCommunication = async () => {
    if (!communicationModal.op) return;
    try {
      await axios.post(`/api/crm/oportunidades/${communicationModal.op.id}/comunicar`, {
        canal: communicationModal.type,
        assunto: commSubject,
        corpo: commBody
      });
      setCommunicationModal({ type: null, op: null });
      setCommSubject('');
      setCommBody('');
      handleRefreshDetails(communicationModal.op.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Top action block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">CRM e Vendas (Kanban)</h2>
          <p className="text-xs text-text-secondary">Arraste e solte cartões para avançar o funil de prospecção</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} /> Nova Oportunidade
        </button>
      </div>

      {/* Kanban Grid */}
      <div className="flex gap-4 overflow-x-auto pb-4 select-none table-scroll">
        {STAGES.map((stage) => {
          const col = columnsData[stage] || { list: [], totalValue: 0 };
          return (
            <div
              key={stage}
              className="flex-shrink-0 w-80 bg-bg-secondary/40 border border-divider rounded-xl p-3 flex flex-col min-h-[500px]"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Header col */}
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-text-primary text-sm tracking-tight">{stage}</span>
                <span className="badge-neutral bg-bg-tertiary px-2 py-0.5 rounded text-[10px] font-bold">
                  {col.list.length}
                </span>
              </div>
              
              <div className="text-[11px] text-text-muted font-semibold tracking-wide border-b border-divider pb-2 mb-3">
                Total acumulado: {formatBRL(col.totalValue)}
              </div>

              {/* Cards list */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-1">
                {col.list.length === 0 ? (
                  <div className="h-24 border border-dashed border-divider rounded-lg flex items-center justify-center text-xs text-text-muted">
                    Solte aqui
                  </div>
                ) : (
                  col.list.map((op) => (
                    <div
                      key={op.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, op.id)}
                      onClick={() => openDetailPanel(op.id)}
                      className={`card border-l-4 ${getStageSideColor(op.estagio)} !p-4 cursor-pointer hover:border-brand-500`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="font-semibold text-text-primary text-xs truncate leading-tight w-[70%]">
                          {op.titulo}
                        </span>
                        <span className={`badge ${getPriorityColor(op.prioridade)} text-[9px] px-1.5 py-0.5 rounded`}>
                          {op.prioridade}
                        </span>
                      </div>
                      
                      {op.empresa_nome && (
                        <div className="text-[10px] text-text-secondary font-medium truncate mb-1">
                          🏢 {op.empresa_nome}
                        </div>
                      )}
                      
                      <div className="text-[10px] text-text-secondary font-medium truncate mb-2">
                        👤 {op.contato_principal}
                      </div>

                      {op.status && (
                        <div className="text-[8.5px] bg-bg-secondary text-text-secondary border border-divider px-1.5 py-0.5 rounded-sm font-semibold uppercase tracking-wider mb-2 inline-block">
                          📌 {op.status}
                        </div>
                      )}

                      {op.tags && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {op.tags.split(',').map((tag, idx) => {
                            const trimmed = tag.trim();
                            if (!trimmed) return null;
                            return (
                              <span key={idx} className="bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[8.5px] px-1.5 py-0.5 rounded-sm font-semibold uppercase">
                                {trimmed}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-divider/60">
                        <span className="text-xs font-bold text-text-primary">
                          {formatBRL(op.valor_estimado)}
                        </span>
                        <button className="text-text-muted hover:text-brand-500 p-0.5">
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Slide-out details panel */}
      {selectedOpId && detailData && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex justify-end backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl bg-bg-primary h-full shadow-2xl flex flex-col animate-slide-in">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-divider flex items-center justify-between bg-bg-secondary/40">
              <div>
                <span className="text-xs uppercase tracking-widest text-text-secondary font-bold">Painel de Negócios</span>
                <h3 className="font-extrabold text-text-primary text-base leading-tight mt-1">
                  {detailData.oportunidade?.titulo}
                </h3>
              </div>
              <button className="p-1 text-text-secondary hover:bg-bg-tertiary rounded-lg" onClick={() => setSelectedOpId(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Tab switch */}
            <div className="flex border-b border-divider">
              <button
                className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
                  activeTab === 'details' ? 'border-brand-500 text-brand-500' : 'border-transparent text-text-secondary'
                }`}
                onClick={() => setActiveTab('details')}
              >
                Detalhes
              </button>
              <button
                className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
                  activeTab === 'activities' ? 'border-brand-500 text-brand-500' : 'border-transparent text-text-secondary'
                }`}
                onClick={() => setActiveTab('activities')}
              >
                Atividades Agendadas
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {activeTab === 'details' ? (
                <>
                  {/* Stats list */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-bg-secondary/50 rounded-xl border border-divider">
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider flex items-center gap-1"><User size={10} /> Contato</span>
                      <p className="text-xs font-semibold text-text-primary">{detailData.oportunidade?.contato_principal}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider flex items-center gap-1"><Briefcase size={10} /> Empresa</span>
                      <p className="text-xs font-semibold text-text-primary">{detailData.oportunidade?.empresa_nome || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider flex items-center gap-1"><Phone size={10} /> Telefone</span>
                      <p className="text-xs font-semibold text-text-primary font-mono">{detailData.oportunidade?.telefone || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider flex items-center gap-1"><Mail size={10} /> E-mail</span>
                      <p className="text-xs font-semibold text-text-primary font-mono truncate">{detailData.oportunidade?.email || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Estágio Atual</span>
                      <p className="text-xs font-bold text-brand-500">{detailData.oportunidade?.estagio}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Valor Proposto</span>
                      <p className="text-xs font-bold text-text-primary">{formatBRL(detailData.oportunidade?.valor_estimado)}</p>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Comunicação Omnichannel</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="btn-secondary text-xs flex items-center justify-center gap-1.5 py-2.5"
                        onClick={() => setCommunicationModal({ type: 'whatsapp', op: detailData.oportunidade })}
                      >
                        <MessageSquare size={14} className="text-success" /> Enviar WhatsApp
                      </button>
                      <button
                        className="btn-secondary text-xs flex items-center justify-center gap-1.5 py-2.5"
                        onClick={() => setCommunicationModal({ type: 'email', op: detailData.oportunidade })}
                      >
                        <Mail size={14} className="text-brand-500" /> Enviar E-mail
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="btn-secondary text-xs flex items-center justify-center gap-1.5 py-2.5 text-warning bg-warning/5 border-warning/30 hover:bg-warning/10"
                        onClick={handleGenerateAIProposal}
                      >
                        <Sparkles size={14} /> Proposta com IA
                      </button>
                      <a
                        href="/api/templates/mock-pdf-file"
                        target="_blank"
                        className="btn-secondary text-xs flex items-center justify-center gap-1.5 py-2.5"
                      >
                        <FileText size={14} /> Gerar PDF
                      </a>
                    </div>
                  </div>

                  {/* Timeline section */}
                  <div className="space-y-4">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Histórico de Ocorrências (Timeline)</span>
                    <div className="relative border-l-2 border-divider pl-4 space-y-4 ml-1">
                      {detailData.interacoes.map((log) => (
                        <div key={log.id} className="relative">
                          <span className="absolute -left-[21px] top-1 bg-brand-500 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800"></span>
                          <div className="text-[10px] text-text-secondary font-semibold font-mono">
                            {new Date(log.created_at).toLocaleString('pt-BR')} — por {log.criado_por}
                          </div>
                          <span className="badge-info text-[9px] font-bold px-1 rounded-sm mt-0.5 inline-block">
                            {log.tipo}
                          </span>
                          <p className="text-xs text-text-primary font-medium mt-1 leading-snug">
                            {log.descricao}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Schedule Activity Form */}
                  <form className="p-4 bg-bg-secondary/40 border border-divider rounded-xl space-y-3" onSubmit={handleCreateActivity}>
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Agendar Atividade</span>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="input" value={newActType} onChange={(e) => setNewActType(e.target.value)}>
                        <option>Ligação</option>
                        <option>Reunião</option>
                        <option>E-mail</option>
                        <option>Tarefa</option>
                      </select>
                      <input
                        type="datetime-local"
                        className="input"
                        required
                        value={newActDate}
                        onChange={(e) => setNewActDate(e.target.value)}
                      />
                    </div>
                    <input
                      type="text"
                      className="input"
                      placeholder="Descrição resumida da atividade..."
                      required
                      value={newActDesc}
                      onChange={(e) => setNewActDesc(e.target.value)}
                    />
                    <button className="btn-primary w-full py-2" type="submit">
                      Agendar
                    </button>
                  </form>

                  {/* Activities List */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Atividades Planejadas</span>
                    {detailData.atividades.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-4">Sem atividades pendentes agendadas.</p>
                    ) : (
                      detailData.atividades.map((act) => (
                        <div key={act.id} className="flex items-start justify-between p-3 rounded-lg border border-divider bg-bg-primary">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 accent-brand-500"
                              checked={act.concluida}
                              onChange={() => handleToggleActivity(act.id, act.concluida)}
                            />
                            <div>
                              <span className={`text-xs font-semibold ${
                                act.concluida ? "line-through text-text-muted" : "text-text-primary"
                              }`}>
                                {act.tipo}: {act.descricao}
                              </span>
                              <p className="text-[10px] text-text-secondary font-mono flex items-center gap-1 mt-0.5">
                                <Calendar size={10} /> {new Date(act.data_hora).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Opportunity Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-lg p-6 bg-bg-primary animate-scale-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-text-primary text-base">Nova Oportunidade (Lead)</h3>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setIsCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateOpportunity} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Título Oportunidade *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: SaaS Premium"
                    required
                    value={newOp.titulo}
                    onChange={(e) => setNewOp({ ...newOp, titulo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Empresa</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: Alfa LTDA"
                    value={newOp.empresa_nome}
                    onChange={(e) => setNewOp({ ...newOp, empresa_nome: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Contato *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: Carlos"
                    required
                    value={newOp.contato_principal}
                    onChange={(e) => setNewOp({ ...newOp, contato_principal: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Telefone</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: (67) 9999-9999"
                    value={newOp.telefone}
                    onChange={(e) => setNewOp({ ...newOp, telefone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">E-mail</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="Ex: email@alfa.com"
                    value={newOp.email}
                    onChange={(e) => setNewOp({ ...newOp, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Valor Estimado (R$)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="R$ 0.00"
                    value={newOp.valor_estimado || ''}
                    onChange={(e) => setNewOp({ ...newOp, valor_estimado: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Prioridade</label>
                  <select
                    className="input"
                    value={newOp.prioridade}
                    onChange={(e) => setNewOp({ ...newOp, prioridade: e.target.value })}
                  >
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Origem</label>
                  <select
                    className="input"
                    value={newOp.origem}
                    onChange={(e) => setNewOp({ ...newOp, origem: e.target.value })}
                  >
                    {ORIGINS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: Frigorifico, Varejo"
                    value={newOp.tags || ''}
                    onChange={(e) => setNewOp({ ...newOp, tags: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Status Inicial</label>
                  <select
                    className="input"
                    value={newOp.status}
                    onChange={(e) => setNewOp({ ...newOp, status: e.target.value })}
                  >
                    <option value="Novo">Novo</option>
                    <option value="Aguardando Contato">Aguardando Contato</option>
                    <option value="Sem Resposta">Sem Resposta</option>
                    <option value="Contato Realizado">Contato Realizado</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setIsCreateOpen(false)}>
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

      {/* Convert Opportunity to Client Modal */}
      {conversionModalOp && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg-primary animate-scale-up">
            <h3 className="font-bold text-text-primary text-base mb-2 flex items-center gap-2 text-success">
              <Sparkles size={18} /> Conversão: Fechado (Ganho)
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              Ao confirmar a conversão de <strong>{conversionModalOp.titulo}</strong>, geraremos automaticamente o cadastro do cliente e um contrato financeiro.
            </p>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">CPF/CNPJ do Cliente *</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="00.000.000/0001-00"
                  required
                  value={conversionCpfCnpj}
                  onChange={(e) => setConversionCpfCnpj(e.target.value)}
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn-secondary" onClick={() => setConversionModalOp(null)}>
                  Voltar
                </button>
                <button className="btn-primary bg-success hover:bg-success-600" onClick={handleConfirmConversion}>
                  Confirmar Conversão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loss Reason Modal */}
      {lossModalOp && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg-primary animate-scale-up">
            <h3 className="font-bold text-text-primary text-base mb-2 flex items-center gap-2 text-danger">
              <AlertTriangle size={18} /> Registrar Perda de Lead
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              Por favor, informe obrigatoriamente o motivo da perda ou arquivamento do lead.
            </p>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Motivo da Perda *</label>
                <textarea
                  className="input h-24"
                  placeholder="Ex: Preço elevado, sem fit de negócios, concorrente..."
                  required
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <button className="btn-secondary" onClick={() => setLossModalOp(null)}>
                  Voltar
                </button>
                <button className="btn-primary bg-danger hover:bg-danger-600" onClick={handleConfirmLoss}>
                  Confirmar Perda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Omnichannel Communication Modal (WhatsApp / Email) */}
      {communicationModal.type && communicationModal.op && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl p-6 bg-bg-primary flex gap-4 animate-scale-up">
            
            {/* Template select sidebar */}
            {communicationModal.type === 'whatsapp' && (
              <div className="w-1/3 border-r border-divider pr-4 space-y-2">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Templates WhatsApp</span>
                <div className="space-y-1.5 overflow-y-auto max-h-[300px]">
                  {whatsappTemplates.length === 0 ? (
                    <p className="text-[10px] text-text-muted">Sem templates cadastrados.</p>
                  ) : (
                    whatsappTemplates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t)}
                        className="w-full text-left p-2 rounded hover:bg-bg-secondary border border-divider text-xs font-semibold truncate block"
                      >
                        {t.nome}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Message edit block */}
            <div className="flex-1 space-y-4">
              <div className="flex justify-between items-center border-b border-divider pb-2">
                <h3 className="font-bold text-text-primary text-base flex items-center gap-1.5">
                  {communicationModal.type === 'whatsapp' ? <MessageSquare className="text-success" size={16} /> : <Mail className="text-brand-500" size={16} />} 
                  Enviar {communicationModal.type === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
                </h3>
                <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setCommunicationModal({ type: null, op: null })}>
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-xs text-text-secondary bg-bg-secondary/40 p-2.5 rounded border border-divider">
                  <div className="flex items-center gap-1"><Info size={12} /> Destinatário:</div>
                  <strong className="text-text-primary">{communicationModal.op.contato_principal}</strong>
                  {communicationModal.type === 'whatsapp' ? ` (${communicationModal.op.telefone || 'sem telefone'})` : ` (${communicationModal.op.email || 'sem e-mail'})`}
                </div>

                {communicationModal.type === 'email' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Assunto</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Assunto do e-mail..."
                      value={commSubject}
                      onChange={(e) => setCommSubject(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Mensagem</label>
                  <textarea
                    className="input h-32"
                    placeholder="Escreva a mensagem..."
                    value={commBody}
                    onChange={(e) => setCommBody(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button className="btn-secondary" onClick={() => setCommunicationModal({ type: null, op: null })}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={handleSendCommunication}>
                  Enviar Mensagem
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* AI Proposal result Modal */}
      {proposalModalText && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl p-6 bg-bg-primary animate-scale-up">
            <div className="flex justify-between items-center mb-4 border-b border-divider pb-2">
              <h3 className="font-bold text-text-primary text-base flex items-center gap-2 text-warning">
                <Sparkles size={18} /> Proposta Comercial AI Refinada
              </h3>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setProposalModalText(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="bg-bg-secondary/40 p-4 rounded-xl border border-divider max-h-[350px] overflow-y-auto font-mono text-xs whitespace-pre-wrap text-text-primary leading-relaxed">
              {proposalModalText}
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-2">
              <button className="btn-secondary text-xs" onClick={() => {
                navigator.clipboard.writeText(proposalModalText);
                alert('Copiado para a área de transferência!');
              }}>
                Copiar Texto
              </button>
              <button className="btn-primary text-xs" onClick={() => setProposalModalText(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global AI Processing spinner overlay */}
      {generatingProposal && (
        <div className="fixed inset-0 bg-slate-900/40 z-[60] flex flex-col items-center justify-center backdrop-blur-xs">
          <div className="p-5 bg-bg-primary border border-divider shadow-card rounded-xl text-center space-y-3">
            <div className="animate-spin h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-xs text-text-primary font-bold">Coliseu AI está gerando a proposta...</p>
          </div>
        </div>
      )}

    </div>
  )
}
