import { useState, useEffect } from 'react'
import { X, Save, Plus, Trash2, Search, Layers } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

export interface CentroCustoItem {
  id: number
  codigo: number
  descricao: string
  tipo: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function ModalCadastroCentroCustos({ isOpen, onClose }: Props) {
  const [items, setItems] = useState<CentroCustoItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isConsulting, setIsConsulting] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  const [form, setForm] = useState<Partial<CentroCustoItem>>({
    codigo: 1,
    descricao: '',
    tipo: 'EMPRESA'
  })

  const fetchItems = async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/cadastros/centro-custos')
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

  const selectRecord = (item: CentroCustoItem) => {
    setSelectedId(item.id)
    setForm(item)
  }

  const handleNew = () => {
    const nextCod = items.reduce((max, i) => Math.max(max, i.codigo || 0), 0) + 1
    setSelectedId(null)
    setForm({
      codigo: nextCod,
      descricao: '',
      tipo: 'EMPRESA'
    })
    setIsConsulting(false)
  }

  const handleSave = async () => {
    if (!form.descricao) {
      alert('Preencha a descrição do centro de custos.')
      return
    }

    try {
      if (selectedId) {
        await api.put(`/cadastros/centro-custos/${selectedId}`, form)
      } else {
        await api.post('/cadastros/centro-custos', form)
      }
      fetchItems()
      alert('Centro de Custo salvo com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar centro de custo.')
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('Deseja realmente eliminar este centro de custos?')) return

    try {
      await api.delete(`/cadastros/centro-custos/${selectedId}`)
      setSelectedId(null)
      fetchItems()
      alert('Centro de custos eliminado.')
    } catch (err) {
      console.error(err)
      alert('Erro ao eliminar centro de custos.')
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
            <Layers size={16} className="text-emerald-400" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-tight font-heading leading-tight">
                Cadastro de Centro de Custos
              </h3>
              <p className="text-[10px] text-slate-400">
                São os grupos que originaram a transação (receita ou despesa) financeira.
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

        {/* ABA CADASTRO */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <span className="px-3 py-1 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 text-xs font-black rounded-t-md border-t-2 border-emerald-600 shadow-2xs">
            📂 Cadastro
          </span>
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
                      <th className="p-2 w-28">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {filteredItems.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => { selectRecord(item); setIsConsulting(false); }}
                        className={clsx(
                          "hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer transition-colors",
                          selectedId === item.id && "bg-emerald-100/70 dark:bg-emerald-900/50 font-bold"
                        )}
                      >
                        <td className="p-2 font-mono">{item.codigo}</td>
                        <td className="p-2">{item.descricao}</td>
                        <td className="p-2">{item.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Código:
                  </label>
                  <input
                    type="number"
                    value={form.codigo ?? 1}
                    onChange={(e) => setForm({ ...form, codigo: parseInt(e.target.value) || 1 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-slate-100 dark:bg-slate-800 border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Descrição:
                  </label>
                  <input
                    type="text"
                    value={form.descricao || ''}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value.toUpperCase() })}
                    placeholder="EX: BRANDAO AUTO PECAS"
                    className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                  Tipo:
                </label>
                <select
                  value={form.tipo || 'EMPRESA'}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="input !py-1 !px-2.5 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                >
                  <option value="EMPRESA">EMPRESA</option>
                  <option value="PROJETO">PROJETO</option>
                  <option value="DEPARTAMENTO">DEPARTAMENTO</option>
                  <option value="CENTRO DE CUSTO">CENTRO DE CUSTO</option>
                </select>
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
