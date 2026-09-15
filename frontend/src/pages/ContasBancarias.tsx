import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Building2, Plus, Edit2, Trash2, ShieldCheck, Wallet, Check, X, Search, RefreshCw, DollarSign, Layers, Building } from 'lucide-react'
import { formatBRL } from '../utils/format'
import clsx from 'clsx'

export interface ContaBancaria {
  id: number
  apelido: string
  banco: string
  agencia: string
  conta: string
  tipo: string
  saldo_inicial: number
  saldo_atual: number
  ativo?: boolean
}

const LISTA_BANCOS = [
  'Asaas (Conta Digital / Boleto / PIX)',
  'Banco do Brasil S.A.',
  'Itaú Unibanco S.A.',
  'Banco Bradesco S.A.',
  'Banco Santander Brasil',
  'Caixa Econômica Federal',
  'Sicoob (Sistema de Cooperativas de Crédito)',
  'Sicredi (Sistema de Crédito Cooperativo)',
  'Nu Pagamentos S.A. (Nubank)',
  'Banco Inter S.A.',
  'BTG Pactual S.A.',
  'C6 Bank S.A.',
  'Outra Instituição Financial / Cooperativa'
]

export default function ContasBancarias() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingConta, setEditingConta] = useState<ContaBancaria | null>(null)
  const [search, setSearch] = useState('')

  // Form states
  const [apelido, setApelido] = useState('')
  const [banco, setBanco] = useState(LISTA_BANCOS[0])
  const [agencia, setAgencia] = useState('')
  const [conta, setConta] = useState('')
  const [tipo, setTipo] = useState('Corrente')
  const [saldoInicial, setSaldoInicial] = useState('0')
  const [saving, setSaving] = useState(false)

  const { data: accountsList, isLoading } = useQuery<ContaBancaria[]>({
    queryKey: ['contas-bancarias-page'],
    queryFn: async () => {
      const res = await api.get('/financeiro/contas-bancarias')
      return res.data?.data || []
    }
  })

  const openCreateModal = () => {
    setEditingConta(null)
    setApelido('')
    setBanco(LISTA_BANCOS[0])
    setAgencia('')
    setConta('')
    setTipo('Corrente')
    setSaldoInicial('0')
    setModalOpen(true)
  }

  const openEditModal = (c: ContaBancaria) => {
    setEditingConta(c)
    setApelido(c.apelido)
    setBanco(c.banco || LISTA_BANCOS[0])
    setAgencia(c.agencia || '')
    setConta(c.conta || '')
    setTipo(c.tipo || 'Corrente')
    setSaldoInicial(String(c.saldo_inicial || 0))
    setModalOpen(true)
  }

  const saveConta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apelido.trim()) {
      alert('Por favor, informe o apelido/identificação da conta bancária.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        apelido: apelido.trim(),
        banco,
        agencia: agencia.trim(),
        conta: conta.trim(),
        tipo,
        saldo_inicial: parseFloat(saldoInicial.replace(',', '.')) || 0
      }

      if (editingConta) {
        await api.put(`/financeiro/contas-bancarias/${editingConta.id}`, payload)
      } else {
        await api.post('/financeiro/contas-bancarias', payload)
      }

      queryClient.invalidateQueries({ queryKey: ['contas-bancarias-page'] })
      queryClient.invalidateQueries({ queryKey: ['contas-bancarias'] })
      setModalOpen(false)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao salvar conta bancária.')
    } finally {
      setSaving(false)
    }
  }

  const deleteConta = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/financeiro/contas-bancarias/${id}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contas-bancarias-page'] })
      queryClient.invalidateQueries({ queryKey: ['contas-bancarias'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao remover conta bancária.')
    }
  })

  const filteredContas = (accountsList || []).filter(c => 
    c.apelido.toLowerCase().includes(search.toLowerCase()) ||
    c.banco.toLowerCase().includes(search.toLowerCase()) ||
    (c.conta && c.conta.includes(search))
  )

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      
      {/* CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold text-text-primary flex items-center gap-2">
            <Building2 className="text-indigo-600 dark:text-indigo-400" size={24} />
            Cadastro & Consulta de Bancos / Contas Bancárias
          </h2>
          <p className="text-text-secondary text-sm">
            Gerencie contas digitais, bancos conveniados e saldos operacionais para integração e liquidação.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn-primary flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl shadow-sm hover:shadow-md transition-all font-semibold cursor-pointer text-sm"
        >
          <Plus size={18} />
          <span>+ Novo Banco / Conta Bancária</span>
        </button>
      </div>

      {/* BARRA DE PESQUISA */}
      <div className="card p-4 bg-bg-primary border border-border flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
            placeholder="Buscar por Apelido, Banco ou Número da Conta..."
            className="input !pl-9 !py-2 text-xs rounded-xl w-full uppercase"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="text-xs text-text-secondary font-medium">
          Total: <strong>{filteredContas.length}</strong> conta(s) registrada(s)
        </div>
      </div>

      {/* GRID DE CARTÕES DE BANCOS & CONTAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-text-secondary text-sm">
            <RefreshCw size={20} className="animate-spin inline-block mr-2 text-indigo-600" />
            Carregando cadastro de contas bancárias...
          </div>
        ) : filteredContas.length > 0 ? (
          filteredContas.map((c) => {
            const isAsaas = (c.banco || '').toLowerCase().includes('asaas') || (c.apelido || '').toLowerCase().includes('asaas')

            return (
              <div
                key={c.id}
                className={clsx(
                  'bg-bg-primary border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-indigo-500/60 transition-all',
                  isAsaas ? 'border-indigo-500/60 bg-gradient-to-br from-indigo-950/20 to-slate-900' : 'border-border'
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm',
                        isAsaas ? 'bg-indigo-600' : 'bg-slate-700'
                      )}>
                        {isAsaas ? <ShieldCheck size={20} /> : <Building size={20} />}
                      </div>

                      <div>
                        <h3 className="font-extrabold text-text-primary text-sm flex items-center gap-1.5">
                          {c.apelido}
                          {isAsaas && (
                            <span className="text-[9.5px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold border border-indigo-300 dark:border-indigo-800">
                              ⚡ Conta API Integrada
                            </span>
                          )}
                        </h3>
                        <span className="text-xs text-text-secondary font-medium block">
                          {c.banco}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(c)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
                        title="Editar Conta"
                      >
                        <Edit2 size={16} />
                      </button>
                      {!isAsaas && (
                        <button
                          onClick={() => {
                            if (confirm(`Deseja remover a conta bancária "${c.apelido}"?`)) {
                              deleteConta.mutate(c.id)
                            }
                          }}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                          title="Excluir Conta"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-bg-secondary/60 rounded-xl border border-divider space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Agência:</span>
                      <span className="font-mono font-bold text-text-primary">{c.agencia || '0001'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Conta:</span>
                      <span className="font-mono font-bold text-text-primary">{c.conta || 'ASAAS-API'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Tipo de Conta:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">{c.tipo || 'Corrente'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-divider flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Saldo Inicial Cadastrado:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                    {formatBRL(c.saldo_inicial || 0)}
                  </span>
                </div>

              </div>
            )
          })
        ) : (
          <div className="col-span-full py-12 text-center text-text-secondary text-sm">
            Nenhuma conta bancária cadastrada. Clique em "+ Novo Banco" para adicionar.
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO DE CONTA BANCÁRIA */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col text-slate-100">
            
            <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-indigo-900 to-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 size={20} className="text-indigo-400" />
                <h3 className="text-sm font-extrabold text-white">
                  {editingConta ? `Editar: ${editingConta.apelido}` : 'Novo Cadastro de Banco / Conta Bancária'}
                </h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveConta} className="p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10.5px] font-bold uppercase text-slate-400 block mb-1">Apelido / Identificação da Conta *</label>
                <input
                  type="text"
                  value={apelido}
                  onChange={e => setApelido(e.target.value)}
                  placeholder="Ex: Asaas Principal, Itaú Cobrança, Bradesco..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-[10.5px] font-bold uppercase text-slate-400 block mb-1">Instituição Financeira / Banco *</label>
                <select
                  value={banco}
                  onChange={e => setBanco(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {LISTA_BANCOS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-bold uppercase text-slate-400 block mb-1">Agência</label>
                  <input
                    type="text"
                    value={agencia}
                    onChange={e => setAgencia(e.target.value)}
                    placeholder="0001"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-bold uppercase text-slate-400 block mb-1">Número da Conta</label>
                  <input
                    type="text"
                    value={conta}
                    onChange={e => setConta(e.target.value)}
                    placeholder="12345-6"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-bold uppercase text-slate-400 block mb-1">Tipo de Conta</label>
                  <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Corrente">Conta Corrente</option>
                    <option value="Digital">Conta Digital</option>
                    <option value="Poupança">Conta Poupança</option>
                    <option value="Investimento">Conta Investimento</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10.5px] font-bold uppercase text-slate-400 block mb-1">Saldo Inicial (R$)</label>
                  <input
                    type="text"
                    value={saldoInicial}
                    onChange={e => setSaldoInicial(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all cursor-pointer text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-extrabold shadow-md flex items-center gap-1.5 transition-all cursor-pointer text-xs"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {saving ? 'Salvando...' : 'Salvar Banco'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
