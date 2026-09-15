import { useState, useEffect, useCallback } from 'react'
import { X, Eye, Plus, Trash2, ChevronDown, CheckCircle2, AlertCircle, Loader2, DollarSign } from 'lucide-react'
import api from '../../services/api'

interface Portador { id: number; descricao: string }
interface Especie  { id: number; descricao: string }
interface PlanoContas { id: number; nome: string; tipo: string }
interface Parcela  { num: number; vencimento: string; ndoc: string; valor: number; especie_id: number; especie_nome: string }
interface ClienteOption { id: string; nome: string }

interface Props {
  tipo: 'RECEBER' | 'PAGAR'
  initialCliente?: { id: string; nome: string }
  onClose: () => void
  onSuccess: () => void
}

const today = () => new Date().toISOString().split('T')[0]
const addMonths = (dateStr: string, n: number) => {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split('T')[0]
}
const setDay = (dateStr: string, day: number) => {
  const d = new Date(dateStr)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return d.toISOString().split('T')[0]
}
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ModalProgramacaoContas({ tipo, initialCliente, onClose, onSuccess }: Props) {
  const [portadores, setPortadores] = useState<Portador[]>([])
  const [especies,   setEspecies]   = useState<Especie[]>([])
  const [planos,     setPlanos]     = useState<PlanoContas[]>([])
  const [clientes,   setClientes]   = useState<ClienteOption[]>([])
  const [clientSearch, setClientSearch] = useState(initialCliente?.nome || '')
  const [clientDropOpen, setClientDropOpen] = useState(false)

  const [centrosCusto, setCentrosCusto] = useState<{ id?: any; nome: string }[]>([
    { nome: 'COLISEU RECEITAS' },
    { nome: 'COLISEU DESPESAS' },
    { nome: 'SILENUS RECEITA' },
    { nome: 'SILENUS DESPESA' },
  ])

  const [form, setForm] = useState({
    cliente_id:    initialCliente?.id || '',
    cliente_nome:  initialCliente?.nome || '',
    descricao:     '',
    data_emissao:  today(),
    emissao_igual_vencimento: false,
    especie_id:    '',
    portador_id:   '',
    centro_custo:  'COLISEU RECEITAS',
    plano_contas_id: '',
    valor_parcela: 0,
    num_parcelas:  1,
    dia_vencimento: new Date().getDate(),
    ndoc_inicial:  '',
    valor_desconto: 0,
    primeira_emissao: false,
    formatar_mes_ano: false,
    formatar_ndoc_mes_ano: false,
    ndoc_seq: false,
    observacoes:   '',
  })

  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [visualized, setVisualized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get('/financeiro/portadores').then(r => setPortadores(r.data?.data || []))
    api.get('/financeiro/especies').then(r => setEspecies(r.data?.data || []))
    api.get('/financeiro/plano-contas').then(r => setPlanos(r.data?.data || []))

    // Carregar centros de custos e filiais
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

    api.get('/filiais').then(r => {
      const data = r.data?.data || r.data || []
      if (Array.isArray(data) && data.length > 0) {
        setCentrosCusto(prev => {
          const names = new Set(prev.map(p => p.nome.toUpperCase()))
          const newItems = data
            .map((d: any) => ({ id: d.id, nome: (d.nome || '').toUpperCase() }))
            .filter(item => item.nome && !names.has(item.nome))
          return [...prev, ...newItems]
        })
      }
    }).catch(() => {})

    // Carregar os 25 primeiros clientes por padrão
    api.get('/clientes/lista?limit=25').then(r => {
      const data = r.data?.data || r.data || []
      setClientes(data.map((c: any) => ({ id: String(c.id), nome: c.nome || c.razao_social || '' })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    // Auto-preencher portador, espécie, centro de custo e plano de contas padrão das configurações
    api.get('/configuracoes/integracoes').then(r => {
      const cfg = r.data?.data
      if (!cfg) return
      setForm(f => ({
        ...f,
        portador_id:      String(cfg.portador_padrao_id || f.portador_id || ''),
        especie_id:       String(cfg.especie_padrao_id  || f.especie_id || ''),
        centro_custo:     cfg.padrao_centro_custo       || f.centro_custo || 'BRANDAO AUTO PECAS',
        plano_contas_id:  String(cfg.padrao_plano_contas_id || f.plano_contas_id || ''),
      }))
    }).catch(() => {})
  }, [])

  const searchClientes = useCallback(async (q: string) => {
    try {
      const url = q && q.length >= 2 
        ? `/clientes/lista?search=${encodeURIComponent(q)}&limit=25`
        : `/clientes/lista?limit=25`
      const r = await api.get(url)
      const data = r.data?.data || r.data || []
      setClientes(data.map((c: any) => ({ id: String(c.id), nome: c.nome || c.razao_social || '' })))
    } catch { setClientes([]) }
  }, [])

  useEffect(() => { searchClientes(clientSearch) }, [clientSearch, searchClientes])

  const gerarListaParcelas = (): Parcela[] => {
    const esp = especies.find(e => String(e.id) === form.especie_id)
    const list: Parcela[] = []
    const ndocBase = form.ndoc_inicial ? parseInt(form.ndoc_inicial) || 1 : 1

    for (let i = 0; i < form.num_parcelas; i++) {
      let venc: string
      if (i === 0 && form.primeira_emissao) {
        venc = form.data_emissao
      } else {
        const base = form.emissao_igual_vencimento ? form.data_emissao : form.data_emissao
        venc = addMonths(base, form.primeira_emissao ? i : i + 1)
        if (form.dia_vencimento) venc = setDay(venc, form.dia_vencimento)
      }

      let ndoc = ''
      if (form.ndoc_inicial) {
        if (form.formatar_ndoc_mes_ano) {
          const d = new Date(venc)
          ndoc = `${String(d.getMonth() + 1).padStart(2,'0')}/${d.getFullYear()}`
        } else if (form.ndoc_seq) {
          ndoc = String(ndocBase + i).padStart(String(ndocBase).length, '0')
        } else {
          ndoc = form.ndoc_inicial
        }
      }

      const valorParcela = i === form.num_parcelas - 1
        ? form.valor_parcela - form.valor_desconto
        : form.valor_parcela

      list.push({
        num: i + 1,
        vencimento: venc,
        ndoc,
        valor: valorParcela,
        especie_id: Number(form.especie_id),
        especie_nome: esp?.descricao || ''
      })
    }
    return list
  }

  const visualizar = () => {
    if (!form.valor_parcela || form.valor_parcela <= 0) { setError('Informe o valor da parcela.'); return }
    if (!form.num_parcelas || form.num_parcelas <= 0)   { setError('Informe o número de parcelas.'); return }
    setError('')
    const list = gerarListaParcelas()
    setParcelas(list)
    setVisualized(true)
  }

  const handleLancar = async () => {
    let listToSave = parcelas
    if (listToSave.length === 0) {
      if (!form.valor_parcela || form.valor_parcela <= 0) { setError('Informe o valor da parcela.'); return }
      if (!form.num_parcelas || form.num_parcelas <= 0)   { setError('Informe o número de parcelas.'); return }
      listToSave = gerarListaParcelas()
      setParcelas(listToSave)
    }

    if (!form.cliente_nome && !form.cliente_id) { setError('Informe o cliente/fornecedor.'); return }
    if (listToSave.length === 0) { setError('Nenhuma parcela gerada.'); return }

    setSaving(true); setError('')
    try {
      await api.post('/financeiro/titulos', {
        tipo,
        cliente_id:        form.cliente_id || null,
        cliente_nome:      form.cliente_nome,
        descricao:         form.descricao,
        data_emissao:      form.data_emissao,
        especie_id:        Number(form.especie_id) || null,
        especie_nome:      especies.find(e => String(e.id) === form.especie_id)?.descricao || '',
        portador_id:       Number(form.portador_id) || null,
        portador_nome:     portadores.find(p => String(p.id) === form.portador_id)?.descricao || '',
        centro_custo:      form.centro_custo || 'BRANDAO AUTO PECAS',
        centro_custo_nome: form.centro_custo || 'BRANDAO AUTO PECAS',
        plano_contas_id:   Number(form.plano_contas_id) || null,
        plano_contas_nome: planos.find(p => String(p.id) === form.plano_contas_id)?.nome || '',
        observacoes:       form.observacoes,
        origem:            'programacao',
        parcelas: listToSave.map(p => ({
          num_parcela:    p.num,
          valor:          p.valor,
          data_vencimento: p.vencimento,
          ndoc:           p.ndoc,
          especie_id:     p.especie_id,
          especie_nome:   p.especie_nome,
        }))
      })
      setSuccess(true)
      // Fechamento instantâneo solicitado pelo usuário
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao lançar títulos.')
    } finally {
      setSaving(false)
    }
  }

  const updateParcela = (i: number, field: keyof Parcela, val: string | number) => {
    setParcelas(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in p-1 sm:p-3 font-sans">
      {/* Container compacto estilo Coliseu ERP (Imagem 3) */}
      <div className="bg-[#ece9d8] dark:bg-slate-900 border-2 border-[#808c9c] rounded shadow-2xl w-full max-w-2xl max-h-[96vh] flex flex-col overflow-hidden text-[11px] text-slate-900 dark:text-slate-100">

        {/* Barra superior de janela Win32/Coliseu */}
        <div className="bg-[#d5dbe3] dark:bg-slate-800 px-2 py-0.5 border-b border-[#a6b1c0] flex items-center justify-between shrink-0 select-none">
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Programação de Contas</span>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 hover:bg-red-500 hover:text-white rounded text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>

        {/* Faixa Cabeçalho com ícone e título azul (conforme Imagem 3) */}
        <div className="px-3 py-1.5 bg-white dark:bg-slate-850 border-b border-[#a6b1c0] flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
            <DollarSign size={18} className="text-amber-700" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-[#003399] dark:text-blue-400 tracking-tight leading-none">
              Programação de Contas
            </h1>
          </div>
        </div>

        {/* Conteúdo compacto com scroll se necessário */}
        <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">

          {/* Alertas */}
          {error && (
            <div className="p-1.5 bg-rose-50 border border-rose-300 text-rose-700 rounded text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle size={13} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={13} className="shrink-0" />
              <span>Títulos programados com sucesso!</span>
            </div>
          )}

          {/* Grid de campos compacto (Idêntico ao Coliseu na Imagem 3) */}
          <div className="bg-white dark:bg-slate-800 p-2 rounded border border-[#b8c2d0] space-y-1 shadow-2xs">

            {/* Linha: Cliente / Fornecedor */}
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">
                {tipo === 'RECEBER' ? 'Cliente:' : 'Fornecedor:'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Selecione ou busque o cliente..."
                  value={clientSearch || form.cliente_nome}
                  onChange={e => {
                    const val = e.target.value.toUpperCase()
                    setClientSearch(val)
                    setForm(f => ({ ...f, cliente_nome: val, cliente_id: '' }))
                    setClientDropOpen(true)
                  }}
                  onFocus={() => setClientDropOpen(true)}
                  className="w-full bg-[#0066cc] text-white font-bold border border-[#004c99] px-2 py-0.5 text-[11px] h-6 pr-6 selection:bg-white selection:text-[#0066cc]"
                />
                <ChevronDown size={12} className="absolute right-1.5 top-1.5 text-white pointer-events-none" />
              </div>
              {clientDropOpen && clientes.length > 0 && (
                <div className="absolute z-30 mt-0.5 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded shadow-lg max-h-36 overflow-y-auto">
                  {clientes.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-2 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-[11px] font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 last:border-0"
                      onClick={() => {
                        setForm(f => ({ ...f, cliente_id: c.id, cliente_nome: c.nome.toUpperCase() }))
                        setClientSearch(c.nome.toUpperCase())
                        setClientDropOpen(false)
                      }}
                    >
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Linha: Descrição */}
            <div>
              <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">Descrição:</label>
              <input
                type="text"
                placeholder="Ex: MENSALIDADE ESCOLAR / SERVIÇO"
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value.toUpperCase() }))}
                className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-slate-900 dark:text-slate-100 text-[11px] h-6 font-semibold uppercase"
              />
            </div>

            {/* Linha: Data Emissão + Emissão igual ao Vencimento */}
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-6 flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Data Emissão:</label>
                <input
                  type="date"
                  value={form.data_emissao}
                  onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono font-bold"
                />
              </div>
              <div className="col-span-6 flex items-center">
                <label className="flex items-center gap-1.5 text-[10px] text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.emissao_igual_vencimento}
                    onChange={e => setForm(f => ({ ...f, emissao_igual_vencimento: e.target.checked }))}
                    className="cursor-pointer"
                  />
                  Emissão igual ao Vencimento
                </label>
              </div>
            </div>

            {/* Linha: Espécie e Portador */}
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-6 flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Espécie:</label>
                <select
                  value={form.especie_id}
                  onChange={e => setForm(f => ({ ...f, especie_id: e.target.value }))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold"
                >
                  <option value="">Selecione...</option>
                  {especies.map(e => (
                    <option key={e.id} value={e.id}>{e.descricao}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-6 flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Portador:</label>
                <select
                  value={form.portador_id}
                  onChange={e => setForm(f => ({ ...f, portador_id: e.target.value }))}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold"
                >
                  <option value="">Selecione...</option>
                  {portadores.map(p => (
                    <option key={p.id} value={p.id}>{p.descricao}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linha: Centro de Custo */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Centro de Custo:</label>
              <select
                value={form.centro_custo}
                onChange={e => setForm(f => ({ ...f, centro_custo: e.target.value }))}
                className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-bold uppercase"
              >
                {centrosCusto.map((cc, idx) => (
                  <option key={idx} value={cc.nome}>{cc.nome}</option>
                ))}
                {form.centro_custo && !centrosCusto.some(cc => cc.nome === form.centro_custo) && (
                  <option value={form.centro_custo}>{form.centro_custo}</option>
                )}
              </select>
            </div>

            {/* Linha: Plano de Contas */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Plano de Contas:</label>
              <select
                value={form.plano_contas_id}
                onChange={e => setForm(f => ({ ...f, plano_contas_id: e.target.value }))}
                className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold"
              >
                <option value="">Selecione...</option>
                {planos.map(p => (
                  <option key={p.id} value={p.id}>[{p.tipo}] {p.nome}</option>
                ))}
              </select>
            </div>

            {/* Linha: Valor Parcela | Nº Parcelas | Dia Vencimento */}
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5 flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Valor da Parcela:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={form.valor_parcela || ''}
                  onChange={e => {
                    setForm(f => ({ ...f, valor_parcela: parseFloat(e.target.value) || 0 }))
                    setVisualized(false)
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono font-bold text-right"
                />
              </div>

              <div className="col-span-4 flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Nº de Parcelas:</label>
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={form.num_parcelas}
                  onChange={e => {
                    setForm(f => ({ ...f, num_parcelas: parseInt(e.target.value) || 1 }))
                    setVisualized(false)
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center font-bold"
                />
              </div>

              <div className="col-span-3 flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Dia Venc.:</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.dia_vencimento}
                  onChange={e => {
                    setForm(f => ({ ...f, dia_vencimento: parseInt(e.target.value) || 1 }))
                    setVisualized(false)
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center font-bold"
                />
              </div>
            </div>

            {/* Linha: Nº Doc Inicial | Valor Desconto | 1ª Parcela na data de emissão */}
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Nº Doc. Inicial:</label>
                <input
                  type="text"
                  placeholder="001"
                  value={form.ndoc_inicial}
                  onChange={e => {
                    setForm(f => ({ ...f, ndoc_inicial: e.target.value.toUpperCase() }))
                    setVisualized(false)
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono font-bold"
                />
              </div>

              <div className="col-span-4 flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Valor Desconto:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={form.valor_desconto || ''}
                  onChange={e => {
                    setForm(f => ({ ...f, valor_desconto: parseFloat(e.target.value) || 0 }))
                    setVisualized(false)
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-right"
                />
              </div>

              <div className="col-span-4 flex items-center">
                <label className="flex items-center gap-1 text-[10px] text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.primeira_emissao}
                    onChange={e => {
                      setForm(f => ({ ...f, primeira_emissao: e.target.checked }))
                      setVisualized(false)
                    }}
                    className="cursor-pointer"
                  />
                  1ª Parcela na data de emissão
                </label>
              </div>
            </div>

            {/* Linha: Observações */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Observações:</label>
              <input
                type="text"
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value.toUpperCase() }))}
                className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 uppercase font-semibold"
              />
            </div>

            {/* Linha: Opções de formato e Botão Visualizar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-700 dark:text-slate-300 font-bold">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.formatar_mes_ano}
                    onChange={e => {
                      setForm(f => ({ ...f, formatar_mes_ano: e.target.checked }))
                      setVisualized(false)
                    }}
                  />
                  Formatar Parcela Mês/Ano
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.formatar_ndoc_mes_ano}
                    onChange={e => {
                      setForm(f => ({ ...f, formatar_ndoc_mes_ano: e.target.checked }))
                      setVisualized(false)
                    }}
                  />
                  Formatar N.Doc. Mês/Ano
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.ndoc_seq}
                    onChange={e => {
                      setForm(f => ({ ...f, ndoc_seq: e.target.checked }))
                      setVisualized(false)
                    }}
                  />
                  N.Doc. Seq.
                </label>
              </div>

              <button
                type="button"
                onClick={visualizar}
                className="px-3 py-1 bg-[#e0e5eb] hover:bg-[#cfd7e0] text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white border border-[#a0a0a0] rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Eye size={12} />
                Visualizar
              </button>
            </div>

          </div>

          {/* Grid / Tabela de Parcelas (Estilo Coliseu) */}
          <div className="border border-[#a0a0a0] bg-white dark:bg-slate-800 rounded overflow-hidden">
            <div className="overflow-x-auto max-h-44">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#e9ecef] dark:bg-slate-700 border-b border-[#a0a0a0] text-slate-800 dark:text-slate-200">
                    <th className="text-left px-2 py-1 font-bold border-r border-[#cbd5e1] w-20">Parcela</th>
                    <th className="text-left px-2 py-1 font-bold border-r border-[#cbd5e1] w-28">Vencimento</th>
                    <th className="text-left px-2 py-1 font-bold border-r border-[#cbd5e1] w-24">Nº Doc.</th>
                    <th className="text-right px-2 py-1 font-bold border-r border-[#cbd5e1] w-24">Valor</th>
                    <th className="text-left px-2 py-1 font-bold border-r border-[#cbd5e1]">Espécie</th>
                    <th className="px-1 py-1 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {parcelas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-slate-400 dark:text-slate-500 font-semibold italic">
                        Clique em "Visualizar" ou lance diretamente para gerar as parcelas automáticas.
                      </td>
                    </tr>
                  ) : (
                    parcelas.map((p, i) => (
                      <tr key={i} className="border-b border-[#e2e8f0] dark:border-slate-700 hover:bg-amber-50/40 dark:hover:bg-slate-750">
                        <td className="px-2 py-0.5 font-mono font-bold text-indigo-700 dark:text-indigo-400 border-r border-[#e2e8f0]">
                          {String(p.num).padStart(2, '0')}/{String(form.num_parcelas).padStart(2, '0')}
                        </td>
                        <td className="px-1 py-0.5 border-r border-[#e2e8f0]">
                          <input
                            type="date"
                            value={p.vencimento}
                            onChange={e => updateParcela(i, 'vencimento', e.target.value)}
                            className="bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0 text-[10.5px] font-mono w-full"
                          />
                        </td>
                        <td className="px-1 py-0.5 border-r border-[#e2e8f0]">
                          <input
                            type="text"
                            value={p.ndoc}
                            onChange={e => updateParcela(i, 'ndoc', e.target.value.toUpperCase())}
                            className="bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0 text-[10.5px] font-mono uppercase w-full"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-right border-r border-[#e2e8f0]">
                          <input
                            type="number"
                            step="0.01"
                            value={p.valor}
                            onChange={e => updateParcela(i, 'valor', parseFloat(e.target.value) || 0)}
                            className="bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0 text-[10.5px] font-mono text-right font-bold w-full"
                          />
                        </td>
                        <td className="px-2 py-0.5 border-r border-[#e2e8f0] text-slate-700 dark:text-slate-300 text-[10px]">
                          {p.especie_nome || 'A COMBINAR'}
                        </td>
                        <td className="px-1 py-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => setParcelas(prev => prev.filter((_, j) => j !== i))}
                            className="text-slate-400 hover:text-red-500 cursor-pointer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé da tabela */}
            {parcelas.length > 0 && (
              <div className="bg-[#f8f9fa] dark:bg-slate-750 border-t border-[#a0a0a0] px-2 py-1 flex items-center justify-between text-[10px] font-bold text-slate-700 dark:text-slate-300">
                <span>Total: {fmtBRL(parcelas.reduce((s, p) => s + p.valor, 0))} ({parcelas.length} parcelas)</span>
                <button
                  type="button"
                  onClick={() => {
                    const last = parcelas[parcelas.length - 1]
                    setParcelas(prev => [
                      ...prev,
                      {
                        num: prev.length + 1,
                        vencimento: addMonths(last.vencimento, 1),
                        ndoc: '',
                        valor: form.valor_parcela,
                        especie_id: last.especie_id,
                        especie_nome: last.especie_nome
                      }
                    ])
                  }}
                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 cursor-pointer"
                >
                  <Plus size={11} /> Adicionar Parcela
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Rodapé dos botões de ação (Lançar e Cancelar) */}
        <div className="px-3 py-2 bg-[#d5dbe3] dark:bg-slate-800 border-t border-[#a6b1c0] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLancar}
            disabled={saving}
            className="px-4 py-1 bg-[#0066cc] hover:bg-[#0052a3] text-white font-bold rounded text-[11px] flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {saving ? 'Lançando...' : 'Lançar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-slate-100 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white font-bold rounded text-[11px] border border-[#a0a0a0] shadow-xs cursor-pointer transition-colors"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  )
}
