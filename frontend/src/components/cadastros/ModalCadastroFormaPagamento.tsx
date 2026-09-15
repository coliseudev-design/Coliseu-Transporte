import { useState, useEffect } from 'react'
import { X, Save, Plus, Trash2, Search, DollarSign } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

export interface FormaPagamentoItem {
  id: number
  codigo: number
  descricao: string
  num_parcelas: number
  dias_entrada: number
  dias_entre_parcelas: number
  considerar_mesmo_dia: boolean
  antecipacao_percentual: number
  juros_depois: number
  multa: number
  desconto_maximo: number
  juros_parc_entrada: number
  juros_parc_saida: number
  juros_itens: string
  calcular_juros_titulos_pagar: boolean
  tipo: string
  permite_acesso_app: boolean
  formula: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSwitchToEspecie?: () => void
}

export default function ModalCadastroFormaPagamento({ isOpen, onClose, onSwitchToEspecie }: Props) {
  const [items, setItems] = useState<FormaPagamentoItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isConsulting, setIsConsulting] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  const [form, setForm] = useState<Partial<FormaPagamentoItem>>({
    codigo: 4,
    descricao: '2 X / 30/60 DIAS',
    num_parcelas: 2,
    dias_entrada: 30,
    dias_entre_parcelas: 30,
    considerar_mesmo_dia: true,
    antecipacao_percentual: 0.00,
    juros_depois: 0.00,
    multa: 0.00,
    desconto_maximo: 0.00,
    juros_parc_entrada: 0.00,
    juros_parc_saida: 0.00,
    juros_itens: 'NÃO',
    calcular_juros_titulos_pagar: false,
    tipo: 'A PRAZO C/PARC',
    permite_acesso_app: true,
    formula: ''
  })

  const fetchItems = async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/cadastros/formas-pagamento')
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

  const selectRecord = (item: FormaPagamentoItem) => {
    setSelectedId(item.id)
    setForm(item)
  }

  const handleNew = () => {
    const nextCod = items.reduce((max, i) => Math.max(max, i.codigo || 0), 0) + 1
    setSelectedId(null)
    setForm({
      codigo: nextCod,
      descricao: '',
      num_parcelas: 1,
      dias_entrada: 0,
      dias_entre_parcelas: 30,
      considerar_mesmo_dia: true,
      antecipacao_percentual: 0,
      juros_depois: 0,
      multa: 0,
      desconto_maximo: 0,
      juros_parc_entrada: 0,
      juros_parc_saida: 0,
      juros_itens: 'NÃO',
      calcular_juros_titulos_pagar: false,
      tipo: 'A PRAZO C/PARC',
      permite_acesso_app: true,
      formula: ''
    })
    setIsConsulting(false)
  }

  const handleSave = async () => {
    if (!form.descricao) {
      alert('Preencha a descrição da forma de pagamento.')
      return
    }

    try {
      if (selectedId) {
        await api.put(`/cadastros/formas-pagamento/${selectedId}`, form)
      } else {
        await api.post('/cadastros/formas-pagamento', form)
      }
      fetchItems()
      alert('Forma de Pagamento salva com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar forma de pagamento.')
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('Deseja realmente eliminar esta forma de pagamento?')) return

    try {
      await api.delete(`/cadastros/formas-pagamento/${selectedId}`)
      setSelectedId(null)
      fetchItems()
      alert('Forma de pagamento eliminada.')
    } catch (err) {
      console.error(err)
      alert('Erro ao eliminar forma de pagamento.')
    }
  }

  if (!isOpen) return null

  const filteredItems = items.filter(i => 
    i.descricao?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    String(i.codigo).includes(searchFilter)
  )

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* TITULO DA JANELA ESTILO ERP COLISEU */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-400" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-tight font-heading leading-tight">
                Cadastro de Formas de Pagamento
              </h3>
              <p className="text-[10px] text-slate-400">
                Define a forma como é feito o parcelamento, essas informações são importantes para o calculo das parcelas do...
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
          <button
            type="button"
            className="px-3 py-1 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 text-xs font-black rounded-t-md border-t-2 border-indigo-600 shadow-2xs cursor-pointer"
          >
            📂 Cadastro
          </button>

          {onSwitchToEspecie && (
            <button
              type="button"
              onClick={onSwitchToEspecie}
              className="px-3 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 text-xs font-bold rounded-t-md transition-colors cursor-pointer"
            >
              💳 Espécies de Pagamento
            </button>
          )}
        </div>

        {/* CONTEÚDO */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">

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

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 w-16">Código</th>
                      <th className="p-2">Descrição</th>
                      <th className="p-2 w-20 text-center">Parcelas</th>
                      <th className="p-2 w-24 text-center">Dias Entr.</th>
                      <th className="p-2 w-32">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {filteredItems.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => { selectRecord(item); setIsConsulting(false); }}
                        className={clsx(
                          "hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors",
                          selectedId === item.id && "bg-indigo-100/70 dark:bg-indigo-900/50 font-bold"
                        )}
                      >
                        <td className="p-2 font-mono">{item.codigo}</td>
                        <td className="p-2">{item.descricao}</td>
                        <td className="p-2 text-center font-bold">{item.num_parcelas}</td>
                        <td className="p-2 text-center">{item.dias_entrada}</td>
                        <td className="p-2">{item.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs">
              
              {/* LINHA 1: CÓDIGO E DESCRIÇÃO */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Código:
                  </label>
                  <input
                    type="number"
                    value={form.codigo ?? 4}
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
                    placeholder="EX: 2 X / 30/60 DIAS"
                    className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* LINHA 2: PARCELAS E DIAS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Nº Parcelas:
                  </label>
                  <input
                    type="number"
                    value={form.num_parcelas ?? 2}
                    onChange={(e) => setForm({ ...form, num_parcelas: parseInt(e.target.value) || 1 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Dias P/ Entrada:
                  </label>
                  <input
                    type="number"
                    value={form.dias_entrada ?? 30}
                    onChange={(e) => setForm({ ...form, dias_entrada: parseInt(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Dias entre Parcelas:
                  </label>
                  <input
                    type="number"
                    value={form.dias_entre_parcelas ?? 30}
                    onChange={(e) => setForm({ ...form, dias_entre_parcelas: parseInt(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* CHECKBOX: CONSIDERAR MESMO DIA */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.considerar_mesmo_dia}
                    onChange={(e) => setForm({ ...form, considerar_mesmo_dia: e.target.checked })}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Considerar mesmo dia para Intervalo de 30 dias
                  </span>
                </label>
              </div>

              {/* GRID DE TAXAS E PERCENTUAIS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Antecip. % (Título):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.antecipacao_percentual ?? 0}
                    onChange={(e) => setForm({ ...form, antecipacao_percentual: parseFloat(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Juros Depois (Título):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.juros_depois ?? 0}
                    onChange={(e) => setForm({ ...form, juros_depois: parseFloat(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Multa (Título):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.multa ?? 0}
                    onChange={(e) => setForm({ ...form, multa: parseFloat(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Desconto Máximo:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.desconto_maximo ?? 0}
                    onChange={(e) => setForm({ ...form, desconto_maximo: parseFloat(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Juros Parc. Entrada:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.juros_parc_entrada ?? 0}
                    onChange={(e) => setForm({ ...form, juros_parc_entrada: parseFloat(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Juros Parc. Saída:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.juros_parc_saida ?? 0}
                    onChange={(e) => setForm({ ...form, juros_parc_saida: parseFloat(e.target.value) || 0 })}
                    className="input !py-1 !px-2 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Juros nos itens:
                  </label>
                  <select
                    value={form.juros_itens || 'NÃO'}
                    onChange={(e) => setForm({ ...form, juros_itens: e.target.value })}
                    className="input !py-1 !px-2 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                  >
                    <option value="NÃO">NÃO</option>
                    <option value="SIM">SIM</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Tipo:
                  </label>
                  <select
                    value={form.tipo || 'A PRAZO C/PARC'}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="input !py-1 !px-2 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                  >
                    <option value="A PRAZO C/PARC">A PRAZO C/PARC</option>
                    <option value="À VISTA">À VISTA</option>
                    <option value="A PRAZO S/PARC">A PRAZO S/PARC</option>
                    <option value="OUTROS">OUTROS</option>
                  </select>
                </div>
              </div>

              {/* OPÇÕES ADICIONAIS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.calcular_juros_titulos_pagar}
                    onChange={(e) => setForm({ ...form, calcular_juros_titulos_pagar: e.target.checked })}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Calcular Juros nos Títulos a Pagar
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.permite_acesso_app}
                    onChange={(e) => setForm({ ...form, permite_acesso_app: e.target.checked })}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Permite Acesso pelo App
                  </span>
                </label>
              </div>

              {/* FÓRMULA */}
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                  Fórmula:
                </label>
                <input
                  type="text"
                  value={form.formula || ''}
                  onChange={(e) => setForm({ ...form, formula: e.target.value })}
                  placeholder="Fórmula de cálculo especial..."
                  className="input !py-1 !px-2 text-xs font-mono w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                />
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

            {selectedId && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
              >
                <Trash2 size={13} /> Eliminar
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
