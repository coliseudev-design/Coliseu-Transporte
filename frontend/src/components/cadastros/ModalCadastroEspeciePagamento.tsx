import { useState, useEffect } from 'react'
import { X, Save, Plus, Trash2, Search, CreditCard } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

export interface EspeciePagamentoItem {
  id: number
  codigo: number
  descricao: string
  tipo: string
  numero_dias: number
  doc_pre_impresso: string
  permite_acesso_app: boolean
  disponivel_negociacao: boolean
  permite_credito_negociacao: boolean
  incluir_comissao_aberto: boolean
  pix_online: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSwitchToForma?: () => void
}

export default function ModalCadastroEspeciePagamento({ isOpen, onClose, onSwitchToForma }: Props) {
  const [items, setItems] = useState<EspeciePagamentoItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isConsulting, setIsConsulting] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  const [form, setForm] = useState<Partial<EspeciePagamentoItem>>({
    codigo: 6,
    descricao: 'CARTAO CREDITO',
    tipo: 'DEPOSITO A PRAZO (CARTÃO CRÉDITO)',
    numero_dias: 30,
    doc_pre_impresso: '',
    permite_acesso_app: false,
    disponivel_negociacao: true,
    permite_credito_negociacao: false,
    incluir_comissao_aberto: false,
    pix_online: false
  })

  const tiposEspecieOptions = [
    'CAIXA DIRETO (DINHEIRO)',
    'CAIXA A VISTA (CHEQUE A VISTA)',
    'CAIXA A PRAZO (CHEQUE PRE-DATADO)',
    'TITULO EM ABERTO (DUPLICATA, PROMISSORIA)',
    'DEPOSITO A VISTA (CARTÃO DEBITO)',
    'DEPOSITO A PRAZO (CARTÃO CRÉDITO)',
    'DEPOSITO INSTANTÂNEO (PIX)',
    'TITULO CREDITO'
  ]

  const fetchItems = async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/cadastros/especies-pagamento')
      const list = Array.isArray(data) ? data : []
      setItems(list)
      if (list.length > 0 && !selectedId) {
        selectRecord(list[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchItems()
    }
  }, [isOpen])

  const selectRecord = (item: EspeciePagamentoItem) => {
    setSelectedId(item.id)
    setForm(item)
  }

  const handleNew = () => {
    const nextCod = items.reduce((max, i) => Math.max(max, i.codigo || 0), 0) + 1
    setSelectedId(null)
    setForm({
      codigo: nextCod,
      descricao: '',
      tipo: 'DEPOSITO A PRAZO (CARTÃO CRÉDITO)',
      numero_dias: 0,
      doc_pre_impresso: '',
      permite_acesso_app: false,
      disponivel_negociacao: true,
      permite_credito_negociacao: false,
      incluir_comissao_aberto: false,
      pix_online: false
    })
    setIsConsulting(false)
  }

  const handleSave = async () => {
    if (!form.descricao) {
      alert('Preencha a descrição da espécie de pagamento.')
      return
    }

    try {
      if (selectedId) {
        await api.put(`/cadastros/especies-pagamento/${selectedId}`, form)
      } else {
        await api.post('/cadastros/especies-pagamento', form)
      }
      fetchItems()
      alert('Espécie de Pagamento salva com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar espécie de pagamento.')
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('Deseja realmente eliminar esta espécie de pagamento?')) return

    try {
      await api.delete(`/cadastros/especies-pagamento/${selectedId}`)
      setSelectedId(null)
      fetchItems()
      alert('Espécie de pagamento eliminada.')
    } catch (err) {
      console.error(err)
      alert('Erro ao eliminar espécie de pagamento.')
    }
  }

  if (!isOpen) return null

  const filteredItems = items.filter(i => 
    i.descricao?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    String(i.codigo).includes(searchFilter)
  )

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* TITULO DA JANELA ESTILO ERP COLISEU */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-purple-400" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-tight font-heading leading-tight">
                Cadastro de Espécies de Pagamento
              </h3>
              <p className="text-[10px] text-slate-400">
                A Espécie de pagamento tem influência sobre qualquer lançamento financeiro...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* ABAS SUPERIORES */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          {onSwitchToForma && (
            <button
              type="button"
              onClick={onSwitchToForma}
              className="px-3 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 text-xs font-bold rounded-t-md transition-colors cursor-pointer"
            >
              📂 Formas de Pagamento
            </button>
          )}

          <button
            type="button"
            className="px-3 py-1 bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 text-xs font-black rounded-t-md border-t-2 border-purple-600 shadow-2xs cursor-pointer"
          >
            💳 Cadastro Espécie
          </button>
        </div>

        {/* CONTEÚDO */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">

          {isConsulting ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="Filtrar por código ou descrição..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="input !py-1 text-xs w-full bg-slate-50 dark:bg-slate-800 border-slate-300"
                />
                <button
                  onClick={() => setIsConsulting(false)}
                  className="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-xs font-bold rounded-lg"
                >
                  Voltar
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 w-16">Código</th>
                      <th className="p-2">Descrição</th>
                      <th className="p-2">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {filteredItems.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => { selectRecord(item); setIsConsulting(false); }}
                        className={clsx(
                          "hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer transition-colors",
                          selectedId === item.id && "bg-purple-100/70 dark:bg-purple-900/50 font-bold"
                        )}
                      >
                        <td className="p-2 font-mono">{item.codigo}</td>
                        <td className="p-2">{item.descricao}</td>
                        <td className="p-2 text-[11px] text-slate-600 dark:text-slate-400">{item.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Código:
                  </label>
                  <input
                    type="number"
                    value={form.codigo ?? 6}
                    onChange={(e) => setForm({ ...form, codigo: parseInt(e.target.value) || 1 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-slate-100 dark:bg-slate-800 border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Descrição:
                  </label>
                  <input
                    type="text"
                    value={form.descricao || ''}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value.toUpperCase() })}
                    placeholder="EX: CARTAO CREDITO"
                    className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                  Tipo:
                </label>
                <select
                  value={form.tipo || 'DEPOSITO A PRAZO (CARTÃO CRÉDITO)'}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="input !py-1 !px-2.5 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                >
                  {tiposEspecieOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Número de Dias:
                  </label>
                  <input
                    type="number"
                    value={form.numero_dias ?? 30}
                    onChange={(e) => setForm({ ...form, numero_dias: parseInt(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Doc. Pré-Impresso:
                  </label>
                  <input
                    type="text"
                    value={form.doc_pre_impresso || ''}
                    onChange={(e) => setForm({ ...form, doc_pre_impresso: e.target.value })}
                    placeholder="Documento pré-impresso..."
                    className="input !py-1 !px-2.5 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* OPÇÕES CHECKBOX CONFORME COLISEU LEGADO */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 font-medium">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.permite_acesso_app}
                    onChange={(e) => setForm({ ...form, permite_acesso_app: e.target.checked })}
                    className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Permite Acesso pelo App
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.disponivel_negociacao}
                    onChange={(e) => setForm({ ...form, disponivel_negociacao: e.target.checked })}
                    className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Disponível para Negociação
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.permite_credito_negociacao}
                    onChange={(e) => setForm({ ...form, permite_credito_negociacao: e.target.checked })}
                    className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Permite Crédito na Negociação
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.incluir_comissao_aberto}
                    onChange={(e) => setForm({ ...form, incluir_comissao_aberto: e.target.checked })}
                    className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Incluir na Comissão em Aberto
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.pix_online}
                    onChange={(e) => setForm({ ...form, pix_online: e.target.checked })}
                    className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    PIX Online
                  </span>
                </label>
              </div>

            </div>
          )}

        </div>

        {/* BARRA DE AÇÕES INFERIOR ESTILO COLISEU */}
        <div className="bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-800 p-2.5 flex flex-wrap items-center justify-between gap-1.5 text-xs">
          
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleNew}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
            >
              <Plus size={13} /> Novo - F3
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
            >
              <Save size={13} /> Salvar - F5
            </button>

            {selectedId ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
              >
                <Trash2 size={13} /> Eliminar
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
              >
                <X size={13} /> Cancelar
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsConsulting(!isConsulting)}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
            >
              <Search size={13} /> {isConsulting ? 'Formulário' : 'Consultar - F9'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
            >
              <X size={13} /> Fechar - ESC
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
