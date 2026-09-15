import { useState, useMemo, useEffect, useCallback } from 'react'
import { useApiQuery } from '../hooks/useApi'
import api from '../services/api'
import KPICard from '../components/KPICard'
import DataTable from '../components/DataTable'
import {
  FileText, Users, DollarSign, Award, Plus, Check, ArrowRight, ArrowLeft, Trash2, X, AlertCircle, RefreshCw, Send, MessageSquare, Search
} from 'lucide-react'
import { formatBRL, formatDate } from '../utils/format'

interface Contract {
  id: number;
  cliente_nome: string;
  cliente_documento: string;
  cliente_telefone: string;
  descricao: string;
  valor_total: number;
  data_inicio: string;
  status: string;
  setup_valor: number;
  setup_parcelas: number;
  mensalidade_valor: number;
  mensalidade_parcelas: number;
  indice_reajuste: string;
  clicksign_envelope_id?: string;
  created_at: string;
}

interface Client {
  id: number;
  nome: string;
  documento: string;
}

interface Product {
  id: number;
  id_firebird: number | null;
  nome: string;
  preco: number;
}

interface BasketItem {
  produto_id: number;
  nome: string;
  quantidade: number;
  valor_unitario: number;
}

interface SimulatedInstallment {
  numero: number;
  valor: number;
  data_vencimento: string;
  tipo_parcela: string;
}

export default function Contratos() {
  const { data: contractsRes, refetch, isLoading } = useApiQuery<{ data: Contract[] }>('/contratos')
  const { data: clientsRes } = useApiQuery<{ data: Client[] }>('/clientes/lista?limit=50')
  const { data: productsRes } = useApiQuery<{ data: Product[] }>('/produtos/lista?limit=200')

  const contracts = contractsRes?.data || [];
  const clients = clientsRes?.data || [];
  const products = productsRes?.data || [];

  // KPIs
  const kpis = useMemo(() => {
    const totalFaturado = contracts.reduce((sum, c) => sum + Number(c.valor_total || 0), 0);
    const assinados = contracts.filter(c => c.status === 'Finalizado').length;
    const ticketMedio = contracts.length > 0 ? totalFaturado / contracts.length : 0;
    return { totalFaturado, assinados, ticketMedio };
  }, [contracts]);

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [savingContract, setSavingContract] = useState(false)
  const [saveError, setSaveError] = useState('')
  
  // Client search state in wizard
  const [clientSearch, setClientSearch] = useState('')
  const [searchedClients, setSearchedClients] = useState<Client[]>([])

  const searchClients = useCallback(async (q: string) => {
    try {
      const url = q && q.length >= 2 
        ? `/clientes/lista?search=${encodeURIComponent(q)}&limit=30`
        : `/clientes/lista?limit=30`
      const r = await api.get(url)
      const data = r.data?.data || r.data || []
      setSearchedClients(data)
    } catch { setSearchedClients([]) }
  }, [])

  useEffect(() => { searchClients(clientSearch) }, [clientSearch, searchClients])

  // Wizard Form values
  const [selectedClientId, setSelectedClientId] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [descricao, setDescricao] = useState('')
  const [indiceReajuste, setIndiceReajuste] = useState('Fixo')
  
  // Step 2: Basket
  const [basket, setBasket] = useState<BasketItem[]>([])
  const [selectedProdId, setSelectedProdId] = useState('')
  const [prodQty, setProdQty] = useState(1)
  const [prodPrice, setProdPrice] = useState(0)

  // Step 3: Finance values & simulation
  const [setupValor, setSetupValor] = useState(0)
  const [setupParcelas, setSetupParcelas] = useState(1)
  const [mensalidadeValor, setMensalidadeValor] = useState(0)
  const [mensalidadeParcelas, setMensalidadeParcelas] = useState(12)
  const [simulatedInstallments, setSimulatedInstallments] = useState<SimulatedInstallment[]>([])

  // Selection change prefill price
  const handleProductSelect = (id: string) => {
    setSelectedProdId(id);
    const p = products.find(prod => String(prod.id_firebird || prod.id) === id);
    if (p) setProdPrice(Number(p.preco || 0));
  };

  const addToBasket = () => {
    const p = products.find(prod => String(prod.id_firebird || prod.id) === selectedProdId);
    if (!p) return;
    
    // Check if already in basket
    const exists = basket.find(item => item.produto_id === p.id);
    if (exists) {
      setBasket(basket.map(item => item.produto_id === p.id ? {
        ...item,
        quantidade: item.quantidade + prodQty
      } : item));
    } else {
      setBasket([...basket, {
        produto_id: p.id,
        nome: p.nome,
        quantidade: prodQty,
        valor_unitario: prodPrice
      }]);
    }

    // Reset picker
    setSelectedProdId('');
    setProdQty(1);
    setProdPrice(0);
  };

  const removeFromBasket = (id: number) => {
    setBasket(basket.filter(item => item.produto_id !== id));
  };

  const handleSimulate = async () => {
    try {
      const res = await api.post('/contratos/simular-parcelas', {
        data_inicio: startDate,
        setup_valor: setupValor,
        setup_parcelas: setupParcelas,
        mensalidade_valor: mensalidadeValor,
        mensalidade_parcelas: mensalidadeParcelas
      });
      setSimulatedInstallments(res.data.data);
    } catch (err: any) {
      alert(`❌ Falha ao simular: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleSaveContract = async () => {
    if (!selectedClientId) {
      alert('❌ Selecione um cliente no Passo 1.');
      setStep(1);
      return;
    }
    setSavingContract(true);
    setSaveError('');
    try {
      await api.post('/contratos', {
        cliente_id: parseInt(selectedClientId, 10),
        data_inicio: startDate,
        descricao,
        setup_valor: setupValor,
        setup_parcelas: setupParcelas,
        mensalidade_valor: mensalidadeValor,
        mensalidade_parcelas: mensalidadeParcelas,
        indice_reajuste: indiceReajuste,
        itens: basket
      });
      alert('✅ Contrato criado com sucesso e faturas geradas na tesouraria!');
      setIsWizardOpen(false);
      resetWizard();
      refetch();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao emitir contrato.';
      setSaveError(msg);
      alert(`❌ Falha ao emitir contrato: ${msg}`);
    } finally {
      setSavingContract(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedClientId('');
    setClientSearch('');
    setSaveError('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setDescricao('');
    setIndiceReajuste('Fixo');
    setBasket([]);
    setSetupValor(0);
    setSetupParcelas(1);
    setMensalidadeValor(0);
    setMensalidadeParcelas(12);
    setSimulatedInstallments([]);
  };

  // Actions
  const handleTriggerClickSign = async (id: number) => {
    try {
      const res = await api.post(`/contratos/${id}/clicksign`);
      alert(res.data.message || 'Contrato enviado para o ClickSign com sucesso!');
      refetch();
    } catch (err: any) {
      alert(`❌ Falha ao enviar para ClickSign: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleTriggerWhatsApp = async (id: number) => {
    try {
      const res = await api.post(`/contratos/${id}/whatsapp`);
      alert(res.data.message || 'Aviso enviado!');
    } catch (err: any) {
      alert(`❌ Falha ao enviar WhatsApp: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleEstornar = async (id: number) => {
    if (!confirm('Deseja estornar este contrato? Todas as parcelas financeiras vinculadas em aberto serão deletadas.')) return;
    try {
      const res = await api.delete(`/contratos/${id}`);
      alert(res.data.message || 'Contrato estornado com sucesso.');
      refetch();
    } catch (err: any) {
      alert(`❌ Falha ao estornar contrato: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Top Title Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Faturamento e Gestão de Contratos</h2>
          <p className="text-xs text-text-secondary">Emissão de contratos recorrentes e setup, integrações e ClickSign</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { resetWizard(); setIsWizardOpen(true); }}>
          <Plus size={16} /> Emitir Contrato
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <KPICard
          label="Total Contratos Faturados"
          value={formatBRL(kpis.totalFaturado)}
          icon={DollarSign}
          iconColor="text-success"
          loading={isLoading}
        />
        <KPICard
          label="Contratos Assinados (Finalizados)"
          value={kpis.assinados.toLocaleString('pt-BR')}
          icon={Check}
          iconColor="text-brand-500"
          loading={isLoading}
        />
        <KPICard
          label="Ticket Médio"
          value={formatBRL(kpis.ticketMedio)}
          icon={Award}
          iconColor="text-warning"
          loading={isLoading}
        />
      </div>

      {/* Listing Contracts Table */}
      <DataTable
        loading={isLoading}
        data={contracts}
        empty="Nenhum contrato localizado no período."
        columns={[
          { key: 'id', label: 'Contrato', render: (r: Contract) => <span className="font-semibold text-text-primary"># {r.id}</span> },
          { key: 'cliente_nome', label: 'Cliente', render: (r: Contract) => (
            <div>
              <div className="font-bold text-text-primary">{r.cliente_nome}</div>
              <div className="text-[10px] text-text-secondary font-mono">{r.cliente_documento || '—'}</div>
            </div>
          ) },
          { key: 'data_inicio', label: 'Início', render: (r: Contract) => formatDate(r.data_inicio) },
          { key: 'valor_total', label: 'Valor do Contrato', align: 'right', render: (r: Contract) => <span className="font-bold text-text-primary">{formatBRL(r.valor_total)}</span> },
          { key: 'status', label: 'Assinatura', render: (r: Contract) => (
            <span className={
              r.status === 'Finalizado' ? 'badge-success' :
              r.status === 'Enviado' ? 'badge-info' : 'badge-warning'
            }>
              {r.status}
            </span>
          ) },
          { key: 'actions', label: 'Ações Operacionais', align: 'center', render: (r: Contract) => (
            <div className="flex gap-3 justify-center">
              {r.status === 'Em Aberto' && (
                <button
                  onClick={() => handleTriggerClickSign(r.id)}
                  className="text-xs font-bold text-brand-500 hover:underline flex items-center gap-0.5"
                  title="Enviar ClickSign"
                >
                  <Send size={12} /> Assinar
                </button>
              )}
              <button
                onClick={() => handleTriggerWhatsApp(r.id)}
                className="text-xs font-bold text-success hover:underline flex items-center gap-0.5"
                title="Aviso WhatsApp"
              >
                <MessageSquare size={12} /> WhatsApp
              </button>
              <button
                onClick={() => handleEstornar(r.id)}
                className="text-xs font-bold text-danger hover:underline"
                title="Estornar"
              >
                Estornar
              </button>
            </div>
          ) }
        ]}
      />

      {/* 4-Step Modular Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl p-6 bg-bg-primary max-h-[90vh] overflow-y-auto flex flex-col animate-scale-up">
            
            {/* Wizard Header */}
            <div className="flex justify-between items-center mb-4 border-b border-divider pb-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Passo {step} de 4</span>
                <h3 className="font-bold text-text-primary text-base">
                  {step === 1 && 'Seleção de Cliente e Parâmetros'}
                  {step === 2 && 'Carrinho de Produtos / Serviços'}
                  {step === 3 && 'Condições e Simulação Financeira'}
                  {step === 4 && 'Revisão e Confirmação'}
                </h3>
              </div>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setIsWizardOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Step Progress Line */}
            <div className="flex items-center gap-2 mb-6">
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                    s <= step ? 'bg-brand-500' : 'bg-bg-tertiary'
                  }`}
                />
              ))}
            </div>

            {/* Wizard Content Panel */}
            <div className="flex-1 overflow-y-auto mb-6 min-h-[250px]">
              
              {/* STEP 1: Client details */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Selecione o Cliente *</label>
                    <div className="relative mb-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        className="input pl-8 py-2 text-xs"
                        placeholder="🔍 Digite o nome, razão social ou CNPJ/CPF do cliente..."
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                      />
                    </div>
                    <select
                      className="input font-medium text-xs py-2"
                      required
                      value={selectedClientId}
                      onChange={(e) => {
                        setSelectedClientId(e.target.value)
                        const listToSearch = searchedClients.length > 0 ? searchedClients : clients
                        const sel = listToSearch.find(c => String(c.id) === e.target.value)
                        if (sel) setClientSearch(sel.nome)
                      }}
                    >
                      <option value="">-- Escolha um cliente ({ (searchedClients.length > 0 ? searchedClients : clients).length } localizado(s)) --</option>
                      {(searchedClients.length > 0 ? searchedClients : clients).map(cli => (
                        <option key={cli.id} value={cli.id}>
                          {cli.nome} ({cli.documento || 'Sem Documento'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Data de Início do Contrato *</label>
                      <input
                        type="date"
                        className="input"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Índice de Reajuste Anual</label>
                      <select
                        className="input"
                        value={indiceReajuste}
                        onChange={(e) => setIndiceReajuste(e.target.value)}
                      >
                        <option value="Fixo">Fixo (Sem Reajuste)</option>
                        <option value="Salário Mínimo">Salário Mínimo Proporcional</option>
                        <option value="IPCA">IPCA (Inflação Oficial)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Descrição Interna / Objeto do Contrato</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ex: Prestação de serviços de licença SaaS e suporte"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Products Basket */}
              {step === 2 && (
                <div className="space-y-4">
                  
                  {/* Item picker */}
                  <div className="grid grid-cols-3 gap-2 items-end p-3 bg-bg-secondary/40 border border-divider rounded-xl">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Produto/Serviço</label>
                      <select
                        className="input"
                        value={selectedProdId}
                        onChange={(e) => handleProductSelect(e.target.value)}
                      >
                        <option value="">Escolha um item...</option>
                        {products.map(prod => (
                          <option key={prod.id} value={String(prod.id_firebird || prod.id)}>
                            {prod.nome} ({formatBRL(prod.preco)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Preço Unitário</label>
                      <input
                        type="number"
                        className="input"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="space-y-1 w-20">
                        <label className="text-[10px] font-bold text-text-secondary uppercase">Qtd</label>
                        <input
                          type="number"
                          className="input"
                          min={1}
                          value={prodQty}
                          onChange={(e) => setProdQty(parseInt(e.target.value, 10) || 1)}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-primary py-2.5 flex-1"
                        onClick={addToBasket}
                        disabled={!selectedProdId}
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Basket list */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">Itens no Carrinho</span>
                    {basket.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-6 border border-dashed border-divider rounded-xl">O carrinho está vazio.</p>
                    ) : (
                      <div className="border border-divider rounded-xl overflow-hidden divide-y divide-divider bg-bg-primary">
                        {basket.map(item => (
                          <div key={item.produto_id} className="flex justify-between items-center p-3 text-xs">
                            <div>
                              <strong className="text-text-primary">{item.nome}</strong>
                              <p className="text-[10px] text-text-secondary">{item.quantidade} x {formatBRL(item.valor_unitario)}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-text-primary">{formatBRL(item.quantidade * item.valor_unitario)}</span>
                              <button className="text-danger hover:text-danger-700" onClick={() => removeFromBasket(item.produto_id)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: Setup & Monthly parameters with simulation */}
              {step === 3 && (
                <div className="space-y-4">
                  
                  {/* Setup parameters */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-bg-secondary/40 border border-divider rounded-xl">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Valor da Implantação / Setup (R$)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="R$ 0.00"
                        value={setupValor || ''}
                        onChange={(e) => setSetupValor(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Parcelas do Setup</label>
                      <input
                        type="number"
                        className="input"
                        min={1}
                        value={setupParcelas}
                        onChange={(e) => setSetupParcelas(parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                  </div>

                  {/* Monthly parameters */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-bg-secondary/40 border border-divider rounded-xl">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Mensalidade Recorrente (R$)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="R$ 0.00"
                        value={mensalidadeValor || ''}
                        onChange={(e) => setMensalidadeValor(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Quantidade de Mensalidades</label>
                      <input
                        type="number"
                        className="input"
                        min={1}
                        value={mensalidadeParcelas}
                        onChange={(e) => setMensalidadeParcelas(parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary w-full py-2.5 flex items-center justify-center gap-1.5"
                    onClick={handleSimulate}
                  >
                    <RefreshCw size={14} /> Simular Parcelas do Contrato
                  </button>

                  {/* Simulated list */}
                  {simulatedInstallments.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">Grade de Parcelas Simuladas</span>
                      <div className="max-h-[180px] overflow-y-auto border border-divider rounded-xl divide-y divide-divider bg-bg-primary">
                        {simulatedInstallments.map((inst, i) => (
                          <div key={i} className="flex justify-between items-center p-2.5 text-xs font-mono">
                            <div className="flex gap-2 items-center">
                              <span className="badge bg-slate-100 text-slate-600 text-[9px] uppercase font-bold">{inst.tipo_parcela}</span>
                              <span className="font-semibold text-text-primary">Parcela #{inst.numero}</span>
                            </div>
                            <span className="text-text-secondary">Vence em {new Date(inst.data_vencimento).toLocaleDateString('pt-BR')}</span>
                            <strong className="text-text-primary">{formatBRL(inst.valor)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* STEP 4: Review and confirmation */}
              {step === 4 && (
                <div className="space-y-4 text-xs leading-relaxed">
                  <div className="p-4 bg-bg-secondary/40 border border-divider rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest block">Parâmetros do Contrato</span>
                    <div>
                      <strong className="text-text-secondary">Cliente Selecionado:</strong>{' '}
                      <span className="font-semibold text-text-primary">
                        {(searchedClients.length > 0 ? searchedClients : clients).find(c => String(c.id) === selectedClientId)?.nome || '—'}
                      </span>
                    </div>
                    <div>
                      <strong className="text-text-secondary">Data de Início:</strong>{' '}
                      <span className="font-semibold text-text-primary">{startDate}</span>
                    </div>
                    <div>
                      <strong className="text-text-secondary">Índice Reajuste:</strong>{' '}
                      <span className="font-semibold text-text-primary">{indiceReajuste}</span>
                    </div>
                    <div>
                      <strong className="text-text-secondary">Descrição Objeto:</strong>{' '}
                      <span className="font-semibold text-text-primary">{descricao || '—'}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-bg-secondary/40 border border-divider rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest block">Resumo do Financeiro</span>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Total Setup (Implantação):</span>
                      <strong className="text-text-primary">{formatBRL(setupValor)} ({setupParcelas}x)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Total Mensalidades ({mensalidadeParcelas} meses):</span>
                      <strong className="text-text-primary">{formatBRL(mensalidadeValor * mensalidadeParcelas)} ({formatBRL(mensalidadeValor)}/mês)</strong>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-divider text-sm font-extrabold text-text-primary">
                      <span>Valor Total do Contrato:</span>
                      <span>{formatBRL(setupValor + (mensalidadeValor * mensalidadeParcelas))}</span>
                    </div>
                  </div>

                  {saveError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                      ❌ {saveError}
                    </div>
                  )}

                  <div className="p-3 bg-warning/10 border border-warning/20 text-warning-700 dark:text-warning-400 rounded-xl flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] leading-tight">
                      Ao confirmar, o sistema criará o contrato no banco e gerará as faturas a receber correspondentes na tesouraria automaticamente.
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* Wizard Navigation Footer */}
            <div className="flex justify-between items-center border-t border-divider pt-3 mt-auto">
              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5"
                onClick={() => setStep(step - 1)}
                disabled={step === 1 || savingContract}
              >
                <ArrowLeft size={14} /> Voltar
              </button>
              
              {step < 4 ? (
                <button
                  type="button"
                  className="btn-primary flex items-center gap-1.5"
                  onClick={() => {
                    if (step === 1 && !selectedClientId) {
                      alert('Selecione um cliente.');
                      return;
                    }
                    if (step === 2 && basket.length === 0) {
                      alert('Adicione pelo menos 1 item no carrinho.');
                      return;
                    }
                    setStep(step + 1);
                  }}
                >
                  Avançar <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={savingContract}
                  className="btn-primary bg-success hover:bg-success-600 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  onClick={handleSaveContract}
                >
                  <Check size={14} /> {savingContract ? 'Criando Contrato...' : 'Confirmar & Salvar'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
