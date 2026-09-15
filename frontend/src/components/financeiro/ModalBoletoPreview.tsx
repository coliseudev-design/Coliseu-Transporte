import { useState } from 'react'
import { X, ExternalLink, Mail, MessageCircle, Copy, Check, FileText, CreditCard } from 'lucide-react'
import { formatBRL, formatDate } from '../../utils/format'
import api from '../../services/api'

interface BoletoData {
  titleId: number
  descricao: string
  valor: number
  vencimento: string
  nossoNumero?: string
  bankSlipUrl?: string
  linhaDigitavel?: string
  barCode?: string
  clienteEmail?: string
  clienteTelefone?: string
  clienteNome?: string
}

interface ModalBoletoPreviewProps {
  boleto: BoletoData | null
  onClose: () => void
}

export default function ModalBoletoPreview({ boleto, onClose }: ModalBoletoPreviewProps) {
  const [copied, setCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Edit Modals
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailDestino, setEmailDestino] = useState('')
  const [showWhatsModal, setShowWhatsModal] = useState(false)
  const [whatsDestino, setWhatsDestino] = useState('')

  if (!boleto) return null

  const handleCopyLinha = () => {
    if (!boleto.linhaDigitavel && !boleto.barCode) return
    const textToCopy = boleto.linhaDigitavel || boleto.barCode || ''
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenEmailModal = () => {
    setEmailDestino(boleto.clienteEmail || '')
    setShowEmailModal(true)
  }

  const handleConfirmSendEmail = async () => {
    if (!emailDestino.trim()) {
      alert('Por favor, informe um endereço de e-mail válido.')
      return
    }
    setSendingEmail(true)
    try {
      await api.post('/email/enviar-lote-cobranca', {
        clientes: [{
          cliente_id: boleto.titleId,
          nome: boleto.clienteNome || 'Cliente',
          email: emailDestino.trim(),
          titulo_id: boleto.titleId,
          descricao: boleto.descricao,
          valor: boleto.valor,
          vencimento: boleto.vencimento,
          linkPagamento: boleto.bankSlipUrl,
          linhaDigitavel: boleto.linhaDigitavel
        }]
      })
      setEmailSuccess(true)
      setShowEmailModal(false)
      setTimeout(() => setEmailSuccess(false), 4000)
    } catch (err: any) {
      alert(`❌ Falha ao enviar e-mail: ${err.response?.data?.error || err.message}`)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleOpenWhatsModal = () => {
    setWhatsDestino(boleto.clienteTelefone || '')
    setShowWhatsModal(true)
  }

  const handleConfirmSendWhats = () => {
    let rawPhone = whatsDestino.replace(/\D/g, '')
    if (rawPhone.length >= 10 && !rawPhone.startsWith('55') && rawPhone.length <= 11) {
      rawPhone = `55${rawPhone}`
    }
    const msg = `Olá ${boleto.clienteNome || ''}!\n\nSegue o boleto referente ao título "${boleto.descricao}" no valor de ${formatBRL(boleto.valor)} com vencimento em ${formatDate(boleto.vencimento)}.\n\n📄 *Link do Boleto*: ${boleto.bankSlipUrl || ''}\n${boleto.linhaDigitavel ? `🔢 *Linha Digitável*: ${boleto.linhaDigitavel}` : ''}`
    const waUrl = rawPhone
      ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')
    setShowWhatsModal(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-bg-primary border border-divider rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-divider bg-gradient-to-r from-brand-600 to-indigo-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
              <CreditCard size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Boleto Emitido com Sucesso</h3>
              <p className="text-[10px] text-white/80">Nosso N°: {boleto.nossoNumero || boleto.titleId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/20 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {emailSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-semibold flex items-center gap-2">
              <Check size={14} /> E-mail enviado com sucesso com o link do boleto!
            </div>
          )}

          {/* Card Detalhes do Título */}
          <div className="bg-bg-secondary border border-divider rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between items-center pb-2 border-b border-divider/60">
              <span className="text-text-muted text-[10px] uppercase font-bold">Título</span>
              <span className="font-bold text-text-primary">{boleto.descricao}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-[10px] uppercase font-bold">Valor</span>
              <span className="font-mono font-bold text-emerald-600 text-sm">{formatBRL(boleto.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-[10px] uppercase font-bold">Vencimento</span>
              <span className="font-mono font-medium text-text-secondary">{formatDate(boleto.vencimento)}</span>
            </div>
          </div>

          {/* Linha Digitável */}
          {boleto.linhaDigitavel && (
            <div>
              <label className="text-[10px] font-bold text-text-secondary uppercase block mb-1">Linha Digitável / Código de Barras</label>
              <div className="flex items-center gap-2 bg-bg-secondary border border-divider rounded-lg p-2.5">
                <span className="font-mono text-[11px] font-bold text-text-primary break-all flex-1 select-all">
                  {boleto.linhaDigitavel}
                </span>
                <button
                  onClick={handleCopyLinha}
                  className="px-2.5 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {boleto.bankSlipUrl && (
              <a
                href={boleto.bankSlipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-1 sm:col-span-2 w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer"
              >
                <ExternalLink size={14} /> Visualizar / Imprimir Boleto (PDF)
              </a>
            )}

            <button
              onClick={handleOpenEmailModal}
              disabled={sendingEmail}
              className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer"
            >
              <Mail size={13} /> {sendingEmail ? 'Enviando...' : 'Enviar por E-mail'}
            </button>

            <button
              onClick={handleOpenWhatsModal}
              className="py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer"
            >
              <MessageCircle size={13} /> Enviar por WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* MODAL EDITAR & ENVIAR POR E-MAIL */}
      {showEmailModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-4 space-y-4 text-xs text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 text-sm">
                <Mail size={16} className="text-blue-600" />
                <span>Enviar Boleto por E-mail</span>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Endereço de E-mail do Destinatário:
              </label>
              <input
                type="email"
                value={emailDestino}
                onChange={(e) => setEmailDestino(e.target.value)}
                placeholder="exemplo@cliente.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-500">
                O e-mail do cadastro foi pré-preenchido. Você pode editá-lo para enviar a 2ª via a qualquer outro endereço.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendEmail}
                disabled={sendingEmail || !emailDestino.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail size={14} />
                <span>{sendingEmail ? 'Enviando...' : 'Enviar E-mail'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR & ENVIAR POR WHATSAPP */}
      {showWhatsModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-4 space-y-4 text-xs text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 text-sm">
                <MessageCircle size={16} className="text-emerald-600" />
                <span>Enviar Boleto por WhatsApp</span>
              </div>
              <button onClick={() => setShowWhatsModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Número de Celular / WhatsApp:
              </label>
              <input
                type="text"
                value={whatsDestino}
                onChange={(e) => setWhatsDestino(e.target.value)}
                placeholder="(67) 99999-9999"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-500">
                O telefone do cadastro foi pré-preenchido. Você pode editá-lo ou alterar o número com DDD antes de abrir a conversa.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowWhatsModal(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendWhats}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <MessageCircle size={14} />
                <span>Abrir no WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
