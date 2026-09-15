import { useState, useEffect } from 'react'
import { X, Save, Building2, Check, Shield, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

export interface CedenteItem {
  id?: number
  nome: string
  provedor_banco: string
  ambiente: string
  api_token: string
  client_id?: string
  client_secret?: string
  convenio?: string
  agencia?: string
  conta?: string
  portador_nome_erp: string
  juros_am: number
  multa_pct: number
  desconto_pct: number
  ativo: boolean
  is_default: boolean
}

interface Props {
  isOpen: boolean
  initialData?: CedenteItem | null
  portadoresList: { id: number; nome: string }[]
  onClose: () => void
  onSaved: () => void
}

export default function ModalCadastroCedente({ isOpen, initialData, portadoresList, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<CedenteItem>({
    nome: '',
    provedor_banco: 'asaas',
    ambiente: 'Produção',
    api_token: '',
    client_id: '',
    client_secret: '',
    convenio: '',
    agencia: '',
    conta: '',
    portador_nome_erp: 'ASAAS',
    juros_am: 1.0,
    multa_pct: 2.0,
    desconto_pct: 0.0,
    ativo: true,
    is_default: false
  })

  useEffect(() => {
    if (initialData) {
      setForm({ ...initialData })
    } else {
      setForm({
        nome: '',
        provedor_banco: 'asaas',
        ambiente: 'Produção',
        api_token: '',
        client_id: '',
        client_secret: '',
        convenio: '',
        agencia: '',
        conta: '',
        portador_nome_erp: 'ASAAS',
        juros_am: 1.0,
        multa_pct: 2.0,
        desconto_pct: 0.0,
        ativo: true,
        is_default: false
      })
    }
  }, [initialData, isOpen])

  const handleSave = async () => {
    if (!form.nome) {
      alert('Informe o nome do cedente / conta bancária.')
      return
    }

    setLoading(true)
    try {
      if (form.id) {
        await api.put(`/configuracoes/cedentes/${form.id}`, form)
      } else {
        await api.post('/configuracoes/cedentes', form)
      }
      alert('Cedente salvo com sucesso!')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar cedente bancário.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const bancosOptions = [
    { value: 'asaas', label: 'Banco Asaas (API Direct)' },
    { value: 'sicredi', label: 'Banco Sicredi' },
    { value: 'cora', label: 'Banco Cora' },
    { value: 'itau', label: 'Banco Itaú' },
    { value: 'sicoob', label: 'Banco Sicoob' },
    { value: 'bradesco', label: 'Banco Bradesco' },
    { value: 'santander', label: 'Banco Santander' },
    { value: 'outro', label: 'Outro Banco / Gateway' }
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* CABEÇALHO */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-emerald-400" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight font-heading leading-tight">
                {form.id ? 'Editar API de Cobrança / Cedente' : 'Cadastrar Nova API de Cobrança / Banco'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Configure as credenciais do banco e vincule ao portador do ERP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* FORMULÁRIO */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Nome do Cedente / Conta:
              </label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="EX: Banco Asaas Principal"
                className="input !py-1 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Provedor / Banco:
              </label>
              <select
                value={form.provedor_banco}
                onChange={(e) => setForm({ ...form, provedor_banco: e.target.value })}
                className="input !py-1 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
              >
                {bancosOptions.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Ambiente de Operação:
              </label>
              <select
                value={form.ambiente}
                onChange={(e) => setForm({ ...form, ambiente: e.target.value })}
                className="input !py-1 text-xs font-bold w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
              >
                <option value="Produção">Produção (api real)</option>
                <option value="Homologação / Sandbox">Homologação / Sandbox</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Portador Vinculado no ERP:
              </label>
              <select
                value={form.portador_nome_erp}
                onChange={(e) => setForm({ ...form, portador_nome_erp: e.target.value })}
                className="input !py-1 text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
              >
                {portadoresList.map(p => (
                  <option key={p.id} value={p.nome}>{p.nome}</option>
                ))}
                {portadoresList.length === 0 && (
                  <>
                    <option value="ASAAS">ASAAS</option>
                    <option value="SICREDI">SICREDI</option>
                    <option value="CORA">CORA</option>
                    <option value="ITAU">ITAU</option>
                    <option value="SICOOB">SICOOB</option>
                    <option value="CARTEIRA">CARTEIRA</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* CHAVE API / ACCESS TOKEN */}
          <div>
            <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
              Chave API / Access Token:
            </label>
            <input
              type="text"
              value={form.api_token}
              onChange={(e) => setForm({ ...form, api_token: e.target.value })}
              placeholder="$aact_YTU5YTE0MT..."
              className="input !py-1 text-xs font-mono w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Client ID / Licença / Convênio:
              </label>
              <input
                type="text"
                value={form.client_id || ''}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                placeholder="Identificador do convênio..."
                className="input !py-1 text-xs font-mono w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Client Secret:
              </label>
              <input
                type="password"
                value={form.client_secret || ''}
                onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                placeholder="••••••••••••"
                className="input !py-1 text-xs font-mono w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* TAXAS DE JUROS E MULTA */}
          <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Juros A.M. (%):
              </label>
              <input
                type="number"
                step="0.01"
                value={form.juros_am}
                onChange={(e) => setForm({ ...form, juros_am: parseFloat(e.target.value) || 0 })}
                className="input !py-1 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Multa (%):
              </label>
              <input
                type="number"
                step="0.01"
                value={form.multa_pct}
                onChange={(e) => setForm({ ...form, multa_pct: parseFloat(e.target.value) || 0 })}
                className="input !py-1 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                Desconto (%):
              </label>
              <input
                type="number"
                step="0.01"
                value={form.desconto_pct}
                onChange={(e) => setForm({ ...form, desconto_pct: parseFloat(e.target.value) || 0 })}
                className="input !py-1 text-xs font-mono text-right w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* STATUS E PADRÃO */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Ativo para Emissão de Boletos
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Definir como Banco / Cedente Padrão do ERP
              </span>
            </label>
          </div>

        </div>

        {/* RODAPÉ */}
        <div className="bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-800 p-3 flex justify-end gap-2 text-xs">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Save size={14} /> Salvar Cedente
          </button>
        </div>

      </div>
    </div>
  )
}
