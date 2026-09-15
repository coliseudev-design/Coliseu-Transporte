import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertTriangle, CreditCard, Mail, MessageCircle, Copy, Check, ExternalLink, Loader2, User, DollarSign, Calendar, ShieldCheck, Building } from 'lucide-react'
import { formatBRL, formatDate } from '../../utils/format'
import api from '../../services/api'

export interface TitleToEmit {
  id: number
  descricao: string
  valor: number
  data_vencimento: string
  cliente_id?: number
  cliente_nome?: string
  cliente_documento?: string
  cliente_email?: string
  cliente_telefone?: string
  nosso_numero?: string
  asaas_payment_id?: string
  bank_slip_url?: string
}

interface ModalConfirmacaoEmissaoBoletoProps {
  isOpen: boolean
  title: TitleToEmit | null
  onClose: () => void
  onSuccess?: (issuedData: any) => void
}

export default function ModalConfirmacaoEmissaoBoleto({
  isOpen,
  title,
  onClose,
  onSuccess
}: ModalConfirmacaoEmissaoBoletoProps) {
  const [step, setStep] = useState<'validacao' | 'emitindo' | 'sucesso'>('validacao')
  const [selectedBank, setSelectedBank] = useState<'asaas' | 'cora'>('asaas')
  const [loadingCheck, setLoadingCheck] = useState(false)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Dados retornados após emissão
  const [issuedData, setIssuedData] = useState<{
    banco?: string
    paymentId?: string
    nossoNumero?: string
    bankSlipUrl?: string
    linhaDigitavel?: string
    barCode?: string
  } | null>(null)

  // Reseta o modal ao abrir
  useEffect(() => {
    if (isOpen) {
      setStep('validacao')
      setErrorMsg(null)
      setIssuedData(null)
      setLoadingCheck(true)
      const timer = setTimeout(() => {
        setLoadingCheck(false)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [isOpen, title])

  if (!isOpen || !title) return null

  const cleanDoc = (title.cliente_documento || '').replace(/\D/g, '')
  const hasValidDoc = cleanDoc.length === 11 || cleanDoc.length === 14
  const hasEmail = Boolean(title.cliente_email && title.cliente_email.includes('@'))
  const hasPhone = Boolean(title.cliente_telefone && title.cliente_telefone.replace(/\D/g, '').length >= 8)

  // Executa a emissão real no Asaas ou Cora após confirmação do usuário
  const handleConfirmarEmissao = async () => {
    setStep('emitindo')
    setErrorMsg(null)

    try {
      let result: any = null

      if (selectedBank === 'cora') {
        const res = await api.post('/cora/emitir-boleto', { titleId: title.id })
        const d = res.data
        result = {
          banco: 'Banco Cora',
          paymentId: d.id || d.paymentId,
          nossoNumero: d.nossoNumero || String(title.id),
          bankSlipUrl: d.bankSlipUrl || d.pdf_url,
          linhaDigitavel: d.linhaDigitavel,
          barCode: d.barCode
        }
      } else {
        const res = await api.post('/asaas/emitir-boleto', { titleId: title.id })
        const d = res.data
        result = {
          banco: 'Banco Asaas',
          paymentId: d.paymentId,
          nossoNumero: d.nossoNumero || d.paymentId || String(title.id),
          bankSlipUrl: d.bankSlipUrl,
          linhaDigitavel: d.linhaDigitavel,
          barCode: d.barCode
        }
      }

      setIssuedData(result)
      setStep('sucesso')
      if (onSuccess) onSuccess(result)

    } catch (err: any) {
      console.error(err)
      const msg = err.response?.data?.error || err.message || `Falha na emissão do boleto no ${selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}.`
      setErrorMsg(msg)
      setStep('validacao')
    }
  }

  const handleCopyLinha = () => {
    if (!issuedData?.linhaDigitavel && !issuedData?.barCode) return
    const textToCopy = issuedData.linhaDigitavel || issuedData.barCode || ''
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEnviarWhatsApp = () => {
    const cleanPhone = (title.cliente_telefone || '').replace(/\D/g, '')
    const msg = `Olá ${title.cliente_nome || ''}!\n\nSegue o boleto referente à mensalidade "${title.descricao}" no valor de ${formatBRL(title.valor)} com vencimento em ${formatDate(title.data_vencimento)}.\n\n📄 *Link do Boleto*: ${issuedData?.bankSlipUrl || ''}\n${issuedData?.linhaDigitavel ? `🔢 *Linha Digitável*: ${issuedData.linhaDigitavel}` : ''}`
    const waUrl = cleanPhone
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-slate-100">
        
        {/* HEADER */}
        <div className={`px-5 py-4 border-b border-slate-800 bg-gradient-to-r ${selectedBank === 'cora' ? 'from-pink-700 to-rose-900' : 'from-emerald-700 to-indigo-800'} flex items-center justify-between transition-colors duration-300`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
              <CreditCard size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                {step === 'sucesso' ? `✅ Boleto Registrado no ${issuedData?.banco || (selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas')}` : '📋 Validação de Emissão de Boleto'}
              </h3>
              <p className="text-[11px] text-white/80">
                {step === 'sucesso' ? `Nosso N°: ${issuedData?.nossoNumero}` : 'Selecione o banco e confirme os dados antes de transmitir'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/20 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="p-5 space-y-4 text-xs">

          {/* MENSAGEM DE ERRO (CASO OCORRA) */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-200 text-xs font-semibold flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 text-rose-400 mt-0.5" />
              <div>
                <strong className="block text-rose-300">Falha ao emitir boleto:</strong>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {/* PASSO 1: VALIDAÇÃO DOS DADOS DO CLIENTE & MENSALIDADE */}
          {step === 'validacao' && (
            <>
              {loadingCheck ? (
                <div className="py-8 text-center space-y-2">
                  <Loader2 size={28} className="animate-spin text-emerald-400 mx-auto" />
                  <p className="text-slate-400 font-semibold text-xs">Consultando e validando dados do título...</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* SELETOR DE BANCO EMISSOR */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                      <Building size={12} className="text-indigo-400" />
                      Selecione o Banco Emissor do Boleto:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBank('asaas')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                          selectedBank === 'asaas'
                            ? 'bg-indigo-950/80 border-indigo-500 ring-2 ring-indigo-500/40 text-white shadow-md'
                            : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[11px] flex items-center gap-1.5">
                            🏦 Banco Asaas
                          </span>
                          {selectedBank === 'asaas' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Conta Principal (Produção)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedBank('cora')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                          selectedBank === 'cora'
                            ? 'bg-pink-950/80 border-pink-500 ring-2 ring-pink-500/40 text-white shadow-md'
                            : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[11px] flex items-center gap-1.5">
                            🏦 Banco Cora
                          </span>
                          {selectedBank === 'cora' && (
                            <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Ag 0001 • CC 7264541-2
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* CARD DE DETALHES DA MENSALIDADE */}
                  <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-700/60">
                      <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                        <CreditCard size={12} className="text-emerald-400" /> Descrição da Mensalidade / Título
                      </span>
                      <span className="font-bold text-white text-xs">{title.descricao}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Valor a Cobrar</span>
                        <span className="font-mono font-extrabold text-emerald-400 text-sm">{formatBRL(title.valor)}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Data de Vencimento</span>
                        <span className="font-mono font-bold text-slate-200 text-xs">{formatDate(title.data_vencimento)}</span>
                      </div>
                    </div>
                  </div>

                  {/* PAINEL DE VALIDAÇÕES DO CLIENTE (CHECKLIST) */}
                  <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
                    <h4 className="text-[11px] font-extrabold uppercase text-slate-300 tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-700/60">
                      <ShieldCheck size={14} className="text-indigo-400" />
                      Validação Cadastral do Cliente
                    </h4>

                    {/* CLIENTE & DOCUMENTO */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-200 block text-[11px]">{title.cliente_nome || 'Cliente não identificado'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            CPF/CNPJ: {title.cliente_documento || 'Não informado'}
                          </span>
                        </div>
                      </div>
                      {hasValidDoc ? (
                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full font-bold text-[10px] flex items-center gap-1">
                          <CheckCircle size={10} /> Documento OK
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-800 rounded-full font-bold text-[10px] flex items-center gap-1">
                          <AlertTriangle size={10} /> Documento Ausente
                        </span>
                      )}
                    </div>

                    {/* E-MAIL */}
                    <div className="flex items-center justify-between py-1 border-t border-slate-700/40">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-slate-400 shrink-0" />
                        <span className="text-slate-300 font-medium text-[11px]">
                          E-mail: {title.cliente_email || 'Não cadastrado'}
                        </span>
                      </div>
                      {hasEmail ? (
                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full font-bold text-[10px] flex items-center gap-1">
                          <CheckCircle size={10} /> E-mail Válido
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded-full font-bold text-[10px] flex items-center gap-1">
                          <AlertTriangle size={10} /> E-mail Ausente
                        </span>
                      )}
                    </div>

                    {/* WHATSAPP / TELEFONE */}
                    <div className="flex items-center justify-between py-1 border-t border-slate-700/40">
                      <div className="flex items-center gap-2">
                        <MessageCircle size={14} className="text-slate-400 shrink-0" />
                        <span className="text-slate-300 font-medium text-[11px]">
                          Celular/Whats: {title.cliente_telefone || 'Não cadastrado'}
                        </span>
                      </div>
                      {hasPhone ? (
                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full font-bold text-[10px] flex items-center gap-1">
                          <CheckCircle size={10} /> WhatsApp OK
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded-full font-bold text-[10px] flex items-center gap-1">
                          <AlertTriangle size={10} /> Ausente
                        </span>
                      )}
                    </div>
                  </div>

                  {!hasValidDoc && (
                    <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-200 text-[11px] flex items-center gap-2">
                      <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                      <span>O banco emissor ({selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}) exige CPF/CNPJ válido no cadastro do cliente para registro do boleto.</span>
                    </div>
                  )}

                  {selectedBank === 'cora' && title.valor < 5.0 && (
                    <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-200 text-[11px] flex items-center gap-2">
                      <AlertTriangle size={14} className="shrink-0 text-rose-400" />
                      <span>
                        <strong>Aviso do Banco Cora:</strong> O valor mínimo exigido pela Cora por boleto é de <strong>R$ 5,00</strong> (valor deste título: {formatBRL(title.valor)}). Para emitir valores abaixo de R$ 5,00, selecione o <strong>Banco Asaas</strong> acima.
                      </span>
                    </div>
                  )}

                  {/* BOTÕES DE AÇÃO DO PASSO 1 */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmarEmissao}
                      disabled={selectedBank === 'cora' && title.valor < 5.0}
                      className={`px-4 py-2 font-extrabold rounded-xl shadow-md flex items-center gap-1.5 transition-all text-xs ${
                        selectedBank === 'cora' && title.valor < 5.0
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                      }`}
                    >
                      <CreditCard size={14} /> Confirmar e Emitir Boleto Agora
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* PASSO 2: EMISSÃO EM ANDAMENTO */}
          {step === 'emitindo' && (
            <div className="py-12 text-center space-y-3">
              <Loader2 size={36} className={`animate-spin ${selectedBank === 'cora' ? 'text-pink-400' : 'text-emerald-400'} mx-auto`} />
              <h4 className="text-sm font-extrabold text-white">
                Gerando Cobrança no {selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}...
              </h4>
              <p className="text-slate-400 text-xs max-w-xs mx-auto">
                Registrando título, calculando código de barras e gerando boleto PDF.
              </p>
            </div>
          )}

          {/* PASSO 3: SUCESSO E EXIBIÇÃO DO BOLETO */}
          {step === 'sucesso' && issuedData && (
            <div className="space-y-3.5">
              <div className="p-3 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <span>Boleto bancário emitido e registrado com sucesso no {issuedData.banco || (selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas')}!</span>
              </div>

              {/* LINHA DIGITÁVEL */}
              {issuedData.linhaDigitavel && (
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">
                    Linha Digitável / Código de Barras
                  </label>
                  <div className="flex items-center gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="font-mono text-[11px] font-bold text-emerald-400 break-all select-all flex-1">
                      {issuedData.linhaDigitavel}
                    </span>
                    <button
                      onClick={handleCopyLinha}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {/* BOTÃO PRINCIPAL DE ABRIR PDF */}
              {issuedData.bankSlipUrl && (
                <a
                  href={issuedData.bankSlipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white rounded-xl font-extrabold flex items-center justify-center gap-2 text-xs shadow-lg transition-all cursor-pointer"
                >
                  <ExternalLink size={15} /> 📥 Visualizar / Imprimir Boleto PDF
                </a>
              )}

              {/* BOTÕES DE DISPARO WHATSAPP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleEnviarWhatsApp}
                  className="py-2 px-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer"
                >
                  <MessageCircle size={14} /> Enviar via WhatsApp
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold flex items-center justify-center gap-1 text-xs transition-all cursor-pointer"
                >
                  Concluir e Fechar
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
