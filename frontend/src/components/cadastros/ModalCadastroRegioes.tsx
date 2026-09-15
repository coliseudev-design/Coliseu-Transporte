import { useState, useEffect } from 'react'
import { X, Save, Plus, Trash2, Search, Network, MapPin } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

export interface RegiaoItem {
  id: number
  codigo: number
  cidade: string
  distrito: string
  uf: string
  localizacao: string
  cod_ibge: string
  pais_codigo: number
  pais_nome: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function ModalCadastroRegioes({ isOpen, onClose }: Props) {
  const [items, setItems] = useState<RegiaoItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isConsulting, setIsConsulting] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  const [form, setForm] = useState<Partial<RegiaoItem>>({
    codigo: 9939,
    cidade: 'ABDON BATISTA',
    distrito: 'ABDON BATISTA',
    uf: 'SANTA CATARINA',
    localizacao: '',
    cod_ibge: '4200051',
    pais_codigo: 1058,
    pais_nome: 'BRASIL'
  })

  const fetchItems = async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/cadastros/regioes')
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

  const selectRecord = (item: RegiaoItem) => {
    setSelectedId(item.id)
    setForm(item)
  }

  const handleNew = () => {
    const nextCod = items.reduce((max, i) => Math.max(max, i.codigo || 0), 0) + 1
    setSelectedId(null)
    setForm({
      codigo: nextCod,
      cidade: '',
      distrito: '',
      uf: 'SANTA CATARINA',
      localizacao: '',
      cod_ibge: '',
      pais_codigo: 1058,
      pais_nome: 'BRASIL'
    })
    setIsConsulting(false)
  }

  const handleSave = async () => {
    if (!form.cidade) {
      alert('Preencha a cidade da região.')
      return
    }

    try {
      if (selectedId) {
        await api.put(`/cadastros/regioes/${selectedId}`, form)
      } else {
        await api.post('/cadastros/regioes', form)
      }
      fetchItems()
      alert('Região salva com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar região.')
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('Deseja realmente eliminar esta região?')) return

    try {
      await api.delete(`/cadastros/regioes/${selectedId}`)
      setSelectedId(null)
      fetchItems()
      alert('Região eliminada.')
    } catch (err) {
      console.error(err)
      alert('Erro ao eliminar região.')
    }
  }

  if (!isOpen) return null

  const filteredItems = items.filter(i => 
    i.cidade?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    i.uf?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    String(i.codigo).includes(searchFilter)
  )

  const ufsList = [
    'ACRE', 'ALAGOAS', 'AMAPÁ', 'AMAZONAS', 'BAHIA', 'CEARÁ', 'DISTRITO FEDERAL',
    'ESPÍRITO SANTO', 'GOIÁS', 'MARANHÃO', 'MATO GROSSO', 'MATO GROSSO DO SUL',
    'MINAS GERAIS', 'PARÁ', 'PARAIBA', 'PARANÁ', 'PERNAMBUCO', 'PIAUÍ', 'RIO DE JANEIRO',
    'RIO GRANDE DO NORTE', 'RIO GRANDE DO SUL', 'RONDÔNIA', 'RORAIMA', 'SANTA CATARINA',
    'SÃO PAULO', 'SERGIPE', 'TOCANTINS'
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* TITULO DA JANELA ESTILO ERP COLISEU */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-sky-400" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-tight font-heading leading-tight">
                Cadastro de Regiões
              </h3>
              <p className="text-[10px] text-slate-400">
                Cadastro de Regiões que serão associadas ao cliente, para a classificação futura.
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
          <span className="px-3 py-1 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 text-xs font-black rounded-t-md border-t-2 border-sky-600 shadow-2xs">
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
                  placeholder="Filtrar por cidade, UF ou código..."
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
                      <th className="p-2">Cidade</th>
                      <th className="p-2">Distrito</th>
                      <th className="p-2 w-28">UF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {filteredItems.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => { selectRecord(item); setIsConsulting(false); }}
                        className={clsx(
                          "hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer transition-colors",
                          selectedId === item.id && "bg-sky-100/70 dark:bg-sky-900/50 font-bold"
                        )}
                      >
                        <td className="p-2 font-mono">{item.codigo}</td>
                        <td className="p-2">{item.cidade}</td>
                        <td className="p-2">{item.distrito}</td>
                        <td className="p-2 font-bold">{item.uf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs">
              
              <div className="flex items-center justify-between gap-3">
                <div className="w-36">
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Código:
                  </label>
                  <input
                    type="number"
                    value={form.codigo ?? 9939}
                    onChange={(e) => setForm({ ...form, codigo: parseInt(e.target.value) || 1 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-slate-100 dark:bg-slate-800 border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex-1 text-right pt-4">
                  <button
                    type="button"
                    onClick={() => setIsConsulting(true)}
                    className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-end gap-1 cursor-pointer"
                  >
                    <Search size={13} /> Clique aqui para Selecionar a Cidade
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Cidade:
                  </label>
                  <input
                    type="text"
                    value={form.cidade || ''}
                    onChange={(e) => setForm({ ...form, cidade: e.target.value.toUpperCase() })}
                    placeholder="ABDON BATISTA"
                    className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Distrito:
                  </label>
                  <input
                    type="text"
                    value={form.distrito || ''}
                    onChange={(e) => setForm({ ...form, distrito: e.target.value.toUpperCase() })}
                    placeholder="ABDON BATISTA"
                    className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    UF:
                  </label>
                  <select
                    value={form.uf || 'SANTA CATARINA'}
                    onChange={(e) => setForm({ ...form, uf: e.target.value })}
                    className="input !py-1 !px-2.5 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                  >
                    {ufsList.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Localização:
                  </label>
                  <input
                    type="text"
                    value={form.localizacao || ''}
                    onChange={(e) => setForm({ ...form, localizacao: e.target.value.toUpperCase() })}
                    placeholder="CENTRO / ZONA RURAL"
                    className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    Cod. IBGE:
                  </label>
                  <input
                    type="text"
                    value={form.cod_ibge || ''}
                    onChange={(e) => setForm({ ...form, cod_ibge: e.target.value })}
                    placeholder="4200051"
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    País (Cód):
                  </label>
                  <input
                    type="number"
                    value={form.pais_codigo ?? 1058}
                    onChange={(e) => setForm({ ...form, pais_codigo: parseInt(e.target.value) || 1058 })}
                    className="input !py-1 !px-2 text-xs font-mono font-bold w-full bg-slate-100 dark:bg-slate-800 border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                    País (Nome):
                  </label>
                  <input
                    type="text"
                    value={form.pais_nome || 'BRASIL'}
                    onChange={(e) => setForm({ ...form, pais_nome: e.target.value.toUpperCase() })}
                    className="input !py-1 !px-2 text-xs font-bold uppercase w-full bg-slate-100 dark:bg-slate-800 border-slate-300 rounded-lg"
                  />
                </div>
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
