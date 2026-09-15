import { useState, useEffect, useCallback } from 'react'
import { X, FileText, CheckCircle2, AlertCircle, Loader2, ChevronDown, DollarSign, Calendar, Check } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

interface Portador { id: number; descricao: string }
interface Especie  { id: number; descricao: string }
interface PlanoContas { id: number; nome: string; tipo: string }
interface ClienteOption { id: string; nome: string }

interface Props {
  tipo: 'RECEBER' | 'PAGAR'
  initialCliente?: { id: string; nome: string }
  initialTituloData?: any
  onClose: () => void
  onSuccess: () => void
}

const today = () => new Date().toISOString().split('T')[0]

const formatDateStr = (d: any) => {
  if (!d) return ''
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return ''
    return dt.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

export default function ModalLancamentoIndividual({ tipo, initialCliente, initialTituloData, onClose, onSuccess }: Props) {
  const [portadores, setPortadores] = useState<Portador[]>([])
  const [especies, setEspecies] = useState<Especie[]>([])
  const [planos, setPlanos] = useState<PlanoContas[]>([])
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [clientSearch, setClientSearch] = useState(
    initialTituloData?.cliente || initialCliente?.nome || ''
  )
  const [clientDropOpen, setClientDropOpen] = useState(false)

  const [centrosCusto, setCentrosCusto] = useState<{ id?: any; nome: string }[]>([
    { nome: 'COLISEU RECEITAS' },
    { nome: 'COLISEU DESPESAS' },
    { nome: 'SILENUS RECEITA' },
    { nome: 'SILENUS DESPESA' },
    { nome: 'EM CARTORIO' },
    { nome: 'TROCA DE DUPLICATA' },
  ])

  const [form, setForm] = useState({
    cliente_id:      initialTituloData?.cliente_id_firebird || initialCliente?.id || '',
    cliente_nome:    initialTituloData?.cliente || initialCliente?.nome || '',
    descricao:       initialTituloData?.descricao || '',
    data_emissao:    formatDateStr(initialTituloData?.data_emissao) || today(),
    data_vencimento: formatDateStr(initialTituloData?.data_vencimento) || '',
    dias_carencia:   '',
    ndoc:            initialTituloData?.nosso_numero || initialTituloData?.numero_documento || (initialTituloData?.id_firebird ? String(initialTituloData.id_firebird) : ''),
    num_parcela:     initialTituloData?.numero_parcela || '01/01',
    moeda:           'REAL, R$',
    especie_id:      initialTituloData?.especie_id || '',
    portador_id:     initialTituloData?.portador_id || '',
    antecipacao:     '',
    juros:           '',
    multa:           '',
    valor:           initialTituloData?.valor || 0,
    historico:       initialTituloData?.descricao || '',
    rec_pag:         tipo === 'RECEBER' ? 'RECEBER/DÉBITO' : 'PAGAR/CRÉDITO',
    tipo_titulo:     'TITULO COMUM',
    centro_custo:    initialTituloData?.centro_custo || 'COLISEU RECEITAS',
    setor:           'GERAL',
    plano_contas_id: '',
    situacao:        initialTituloData?.status_pagamento || 'ABERTO',
    observacoes:     '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get('/financeiro/portadores').then(r => setPortadores(r.data?.data || []))
    api.get('/financeiro/especies').then(r => setEspecies(r.data?.data || []))
    api.get('/financeiro/plano-contas').then(r => setPlanos(r.data?.data || []))
    api.get('/clientes/lista?limit=20').then(r => {
      const data = r.data?.data || r.data || []
      setClientes(data.map((c: any) => ({ id: String(c.id), nome: c.nome || c.razao_social || '' })))
    }).catch(() => {})

    api.get('/cadastros/centro-custos').then(r => {
      const data = r.data?.data || r.data || []
      if (Array.isArray(data) && data.length > 0) {
        setCentrosCusto(
          data
            .map((d: any) => ({ id: d.id, nome: (d.descricao || d.nome || '').toUpperCase() }))
            .filter((item: any) => item.nome)
        )
      }
    }).catch(() => {})

    // Auto-preencher portador, espécie, centro de custo e plano de contas padrão das configurações
    api.get('/configuracoes/integracoes').then(r => {
      const cfg = r.data?.data
      if (!cfg) return
      setForm(f => ({
        ...f,
        portador_id: String(cfg.portador_padrao_id || f.portador_id || ''),
        especie_id:  String(cfg.especie_padrao_id  || f.especie_id || ''),
        centro_custo: cfg.padrao_centro_custo || f.centro_custo || 'COLISEU RECEITAS',
        plano_contas_id: String(cfg.padrao_plano_contas_id || f.plano_contas_id || ''),
      }))
    }).catch(() => {})
  }, [])

  const searchClientes = useCallback(async (q: string) => {
    try {
      const url = q && q.length >= 2
        ? `/clientes/lista?search=${encodeURIComponent(q)}&limit=20`
        : `/clientes/lista?limit=20`
      const r = await api.get(url)
      const data = r.data?.data || r.data || []
      setClientes(data.map((c: any) => ({ id: String(c.id), nome: c.nome || c.razao_social || '' })))
    } catch { setClientes([]) }
  }, [])

  useEffect(() => { searchClientes(clientSearch) }, [clientSearch, searchClientes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.valor || form.valor <= 0) { setError('Informe o valor do título.'); return }
    if (!form.data_vencimento)          { setError('Informe a data de vencimento.'); return }
    if (!form.cliente_nome && !form.cliente_id) { setError('Informe o cliente/fornecedor.'); return }

    setSaving(true); setError('')
    try {
      await api.post('/financeiro/titulos', {
        tipo,
        cliente_id:       form.cliente_id || null,
        cliente_nome:     form.cliente_nome,
        descricao:        form.descricao || form.cliente_nome,
        data_emissao:     form.data_emissao,
        data_vencimento:  form.data_vencimento,
        especie_id:       Number(form.especie_id) || null,
        especie_nome:     especies.find(e => String(e.id) === form.especie_id)?.descricao || 'BOLETO BANCARIO',
        portador_id:      Number(form.portador_id) || null,
        portador_nome:    portadores.find(p => String(p.id) === form.portador_id)?.descricao || 'CARTEIRA',
        plano_contas_id:  Number(form.plano_contas_id) || null,
        plano_contas_nome: planos.find(p => String(p.id) === form.plano_contas_id)?.nome || 'VENDA DENTRO DO ESTADO',
        centro_custo:     form.centro_custo,
        setor:            form.setor,
        observacoes:      form.historico || form.observacoes,
        origem:           'individual',
        parcelas: [{
          num_parcela:     form.num_parcela || '01/01',
          valor:           form.valor,
          data_vencimento: form.data_vencimento,
          ndoc:            form.ndoc,
          especie_id:      Number(form.especie_id) || null,
          especie_nome:    especies.find(e => String(e.id) === form.especie_id)?.descricao || 'BOLETO BANCARIO',
          juros_perc:      parseFloat(form.juros) || null,
          multa_perc:      parseFloat(form.multa) || null,
          tipo_titulo:     form.tipo_titulo,
          rec_pag:         form.rec_pag,
          moeda:           form.moeda,
          situacao:        form.situacao,
        }]
      })
      setSuccess(true)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao lançar título.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-1 sm:p-2 animate-fade-in font-sans text-slate-900">
      {/* CONTAINER JANELA ESTILO ERP COLISEU (LARGURA MAX-W-2XL IGUAL MODAL DETALHES) */}
      <form onSubmit={handleSubmit}
        className="bg-[#e9ecef] dark:bg-slate-900 border-2 border-[#808c9c] rounded shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[96vh] text-[11px]">
        
        {/* SUB-BARRA TÍTULO DA JANELA */}
        <div className="bg-[#d5dbe3] dark:bg-slate-800 px-2 py-0.5 border-b border-[#a6b1c0] flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Novo Lançamento de Título</span>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 hover:bg-red-500 hover:text-white rounded text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* CABEÇALHO PRINCIPAL DO LANÇAMENTO DE TÍTULOS */}
        <div className="px-3 py-1 bg-white dark:bg-slate-850 border-b border-[#a6b1c0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-emerald-100 border border-emerald-400 text-emerald-700 flex items-center justify-center shrink-0">
              <DollarSign size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none">
                Lançamento de Título — {tipo === 'RECEBER' ? 'A Receber' : 'A Pagar'}
              </h2>
            </div>
          </div>
        </div>

        {/* CORPO DO FORMULÁRIO DENSE / COMPACTO SEM ROLAGEM EXCESSIVA */}
        <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
          {error && (
            <div className="p-2 bg-rose-50 border border-rose-300 text-rose-700 rounded text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-2 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>Título lançado com sucesso! Sincronizando com ERP...</span>
            </div>
          )}

          {/* CAMPOS PRINCIPAIS DE LANÇAMENTO */}
          <div className="bg-white dark:bg-slate-800 p-2 rounded border border-[#b8c2d0] space-y-1 shadow-2xs">
            
            {/* LINHA 1: Cliente/Fornecedor */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">
                {tipo === 'RECEBER' ? 'Cliente *:' : 'Fornecedor *:'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Digite o nome ou selecione..."
                  value={clientSearch || form.cliente_nome}
                  onChange={e => { setClientSearch(e.target.value); setForm(f => ({...f, cliente_nome: e.target.value, cliente_id: ''})); setClientDropOpen(true) }}
                  onFocus={() => setClientDropOpen(true)}
                  className="w-full bg-[#fffde7] dark:bg-amber-950/40 border border-[#a0a0a0] px-1.5 py-0.5 font-bold text-slate-900 dark:text-amber-200 text-[11px] h-6 pr-6"
                />
                <ChevronDown size={12} className="absolute right-1.5 top-1.5 text-slate-400 pointer-events-none" />
              </div>
              {clientDropOpen && clientes.length > 0 && (
                <div className="absolute z-30 mt-0.5 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded shadow-lg max-h-36 overflow-y-auto">
                  {clientes.map(c => (
                    <button key={c.id} type="button"
                      className="w-full text-left px-2 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-[11px] font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 last:border-0"
                      onClick={() => { setForm(f => ({...f, cliente_id: c.id, cliente_nome: c.nome})); setClientSearch(c.nome); setClientDropOpen(false) }}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* LINHA 2: Descrição */}
            <div>
              <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase">Descrição / Histórico *:</label>
              <input
                type="text"
                placeholder="Ex: PAGAMENTO FATURA 001"
                value={form.descricao}
                onChange={e => setForm(f => ({...f, descricao: e.target.value.toUpperCase()}))}
                className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-slate-800 dark:text-slate-200 text-xs h-6.5 font-bold uppercase"
              />
            </div>

            {/* LINHA 3: Emissão | Vencimento | Dias Car. */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-4">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Emissão *:</label>
                <input
                  type="date"
                  required
                  value={form.data_emissao}
                  onChange={e => setForm(f => ({...f, data_emissao: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold"
                />
              </div>

              <div className="col-span-5">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Vencimento *:</label>
                <input
                  type="date"
                  required
                  value={form.data_vencimento}
                  onChange={e => setForm(f => ({...f, data_vencimento: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Dias Car.:</label>
                <input
                  type="text"
                  placeholder="0"
                  value={form.dias_carencia}
                  onChange={e => setForm(f => ({...f, dias_carencia: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center"
                />
              </div>
            </div>

            {/* LINHA 4: Nº Doc. | Parcela | Moeda | Portador */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Nº Doc.:</label>
                <input
                  type="text"
                  placeholder="0001"
                  value={form.ndoc}
                  onChange={e => setForm(f => ({...f, ndoc: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono font-bold"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Parcela:</label>
                <input
                  type="text"
                  placeholder="01/01"
                  value={form.num_parcela}
                  onChange={e => setForm(f => ({...f, num_parcela: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Moeda:</label>
                <select
                  value={form.moeda}
                  onChange={e => setForm(f => ({...f, moeda: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-6 font-semibold"
                >
                  <option value="REAL, R$">REAL, R$</option>
                  <option value="DOLAR, US$">DÓLAR, US$</option>
                </select>
              </div>

              <div className="col-span-3">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Portador:</label>
                <select
                  value={form.portador_id}
                  onChange={e => setForm(f => ({...f, portador_id: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-6 font-bold text-indigo-700 dark:text-indigo-300"
                >
                  <option value="">CARTEIRA</option>
                  {portadores.map(p => (
                    <option key={p.id} value={p.id}>{p.descricao}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* LINHA 5: Espécie | Antec. | Juros | Multa | Valor */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-4">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Espécie:</label>
                <select
                  value={form.especie_id}
                  onChange={e => setForm(f => ({...f, especie_id: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-6 font-bold"
                >
                  <option value="">BOLETO BANCARIO</option>
                  {especies.map(e => (
                    <option key={e.id} value={e.id}>{e.descricao}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Antec. (%):</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.antecipacao}
                  onChange={e => setForm(f => ({...f, antecipacao: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Juros (%):</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.juros}
                  onChange={e => setForm(f => ({...f, juros: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Multa (%):</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.multa}
                  onChange={e => setForm(f => ({...f, multa: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-900 dark:text-white">Valor *:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.valor || ''}
                  onChange={e => setForm(f => ({...f, valor: parseFloat(e.target.value) || 0}))}
                  className="w-full bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-500 px-1.5 py-0.5 font-black text-right text-emerald-800 dark:text-emerald-200 font-mono text-[12px] h-6"
                />
              </div>
            </div>

            {/* LINHA 6: Rec/Pag | Tipo */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-6">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Rec/Pag:</label>
                <select
                  value={form.rec_pag}
                  onChange={e => setForm(f => ({...f, rec_pag: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-6 font-bold"
                >
                  <option value="RECEBER/DÉBITO">RECEBER / DÉBITO</option>
                  <option value="PAGAR/CRÉDITO">PAGAR / CRÉDITO</option>
                </select>
              </div>

              <div className="col-span-6">
                <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Tipo:</label>
                <select
                  value={form.tipo_titulo}
                  onChange={e => setForm(f => ({...f, tipo_titulo: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-6 font-bold"
                >
                  <option value="TITULO COMUM">TITULO COMUM</option>
                  <option value="DUPLICATA">DUPLICATA</option>
                  <option value="NOTA PROMISSORIA">NOTA PROMISSORIA</option>
                  <option value="CHEQUE">CHEQUE</option>
                </select>
              </div>
            </div>

          </div>

          {/* SEÇÃO INFORMAÇÕES */}
          <fieldset className="border border-[#a6b1c0] rounded p-1.5 bg-white dark:bg-slate-800 space-y-1">
            <legend className="px-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">Informações</legend>
            
            <div className="space-y-1">
              <div>
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Centro Custo:</label>
                <select
                  value={form.centro_custo}
                  onChange={e => setForm(f => ({...f, centro_custo: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold text-slate-900 dark:text-slate-100"
                >
                  {centrosCusto.map((cc, idx) => (
                    <option key={idx} value={cc.nome}>{cc.nome}</option>
                  ))}
                  {form.centro_custo && !centrosCusto.some(c => c.nome === form.centro_custo) && (
                    <option value={form.centro_custo}>{form.centro_custo}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Setor / Departamento:</label>
                <select
                  value={form.setor}
                  onChange={e => setForm(f => ({...f, setor: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="GERAL">GERAL</option>
                  <option value="VENDAS">VENDAS</option>
                  <option value="ADMINISTRATIVO">ADMINISTRATIVO</option>
                  <option value="MANUTENÇÃO">MANUTENÇÃO</option>
                  <option value="FINANCEIRO">FINANCEIRO</option>
                </select>
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Plano Contas:</label>
                <select
                  value={form.plano_contas_id}
                  onChange={e => setForm(f => ({...f, plano_contas_id: e.target.value}))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="">VENDA DENTRO DO ESTADO</option>
                  {planos.map(p => (
                    <option key={p.id} value={p.id}>[{p.tipo}] {p.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>
        </div>

        {/* RODAPÉ COMPACTO ESTILO ERP */}
        <div className="bg-[#d5dbe3] dark:bg-slate-800 px-2 py-1 border-t border-[#a6b1c0] flex items-center justify-end gap-1.5 shrink-0">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-0.5 bg-[#008a45] hover:bg-[#007038] text-white rounded font-extrabold text-[11px] flex items-center gap-1 cursor-pointer h-6 shadow-2xs disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span>Lançar Título</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-0.5 bg-[#c82333] hover:bg-[#bd2130] text-white rounded font-bold text-[11px] flex items-center gap-1 cursor-pointer h-6 shadow-2xs"
          >
            <X size={13} />
            <span>Cancelar</span>
          </button>
        </div>
      </form>
    </div>
  )
}
