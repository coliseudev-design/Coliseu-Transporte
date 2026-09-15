import { useState, useEffect, useMemo } from "react"
import { 
  X, Mail, CheckCircle2, RefreshCw, Send, Paperclip, 
  FileText, Check, AlertTriangle, SendHorizonal, Eye, Code, 
  Sparkles 
} from "lucide-react"
import api from "../../services/api"
import clsx from "clsx"
import { formatBRL, formatDate } from "../../utils/format"
import { useAuthStore } from "../../store/authStore"

export interface ItemLoteEmail {
  id: number
  id_firebird?: string | number | null
  cliente: string
  cliente_id_firebird?: number
  cpf_cnpj?: string
  email?: string
  valor: number
  data_vencimento: string
  nosso_numero?: string
  bank_slip_url?: string
  asaas_payment_id?: string
  invoice_url?: string
  descricao?: string
}

export interface EmailTemplateItem {
  id: number | string
  nome: string
  categoria?: string
  subcategoria?: string | null
  conteudo: string
}

interface ModalEnvioLoteEmailProps {
  isOpen: boolean
  titulos: ItemLoteEmail[]
  templates?: EmailTemplateItem[]
  onClose: () => void
  onCompleted: () => void
}

interface ItemEstadoEmail extends ItemLoteEmail {
  selected: boolean
  emailInput: string
  isEmailValid: boolean
  anexarBoleto: boolean
  hasBoleto: boolean
  status: "pending" | "sending" | "success" | "error"
  errorMsg?: string
}

export default function ModalEnvioLoteEmail({
  isOpen,
  titulos,
  templates = [],
  onClose,
  onCompleted
}: ModalEnvioLoteEmailProps) {
  const { user } = useAuthStore()
  const [items, setItems] = useState<ItemEstadoEmail[]>([])
  const [loadedTemplates, setLoadedTemplates] = useState<EmailTemplateItem[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [previewMode, setPreviewMode] = useState<"preview" | "code">("preview")
  const [assuntoCustom, setAssuntoCustom] = useState<string>("Lembrete de Vencimento - Coliseu Sistemas")
  const [mensagemCustom, setMensagemCustom] = useState<string>(
    "Prezado(a) Cliente {{nomeCliente}},\n\n" +
    "Lembramos que o pagamento referente à Manutenção do Sistema Coliseu vence dia {{dataVencimento}}.\n" +
    "Caso ainda não tenha recebido o boleto, ele se encontra em anexo a este e-mail.\n\n" +
    "Em caso de dúvidas, estamos à disposição para ajudar.\n\n" +
    "Atenciosamente,\n" +
    "Dpto Financeiro\n" +
    "Coliseu Sistemas - Eliane Teixeira\n" +
    "(67) 3423-2227 / (67) 3253-6236 / (67) 99856-4972 Telefone e WhatsApp\n" +
    "Email: financeiro@coliseusistemas.com.br"
  )
  const [anexarBoletoGlobal, setAnexarBoletoGlobal] = useState<boolean>(true)
  const [isSending, setIsSending] = useState(false)
  const [sendingIndex, setSendingIndex] = useState(0)
  const [step, setStep] = useState<"config" | "sending" | "finished">("config")

  // Estados para Envio de E-mail de Teste
  const [showTestModal, setShowTestModal] = useState(false)
  const [testEmailInput, setTestEmailInput] = useState("")
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Carrega templates diretamente da API ao abrir para garantir os mais novos
  useEffect(() => {
    if (isOpen) {
      api.get("/templates")
        .then(res => {
          if (Array.isArray(res.data)) {
            setLoadedTemplates(res.data)
          }
        })
        .catch(err => console.warn("Erro ao carregar templates para o modal de e-mail:", err))
    }
  }, [isOpen])

  // Consolidação de todos os templates disponíveis para E-mail / HTML (somente cobrança)
  const availableTemplates = useMemo(() => {
    const map = new Map<string, EmailTemplateItem>()
    for (const t of templates) {
      map.set(String(t.id), t)
    }
    for (const t of loadedTemplates) {
      map.set(String(t.id), t)
    }
    const list = Array.from(map.values())
    return list.filter(t => {
      const cat = (t.categoria || "").toLowerCase()
      const subcat = ((t as any).subcategoria || "").toLowerCase()
      const nome = (t.nome || "").toLowerCase()
      // Somente templates de cobrança (categoria, subcategoria ou nome)
      return cat.includes("cobran") || subcat.includes("cobran") || nome.includes("cobran") 
        || cat.includes("financeiro") || nome.includes("atraso") || nome.includes("vencimento")
        || nome.includes("bloqueio") || nome.includes("inadimpl")
        || cat === "cob_email" || cat.startsWith("cob_")
    })
  }, [templates, loadedTemplates])

  // Inicialização dos itens
  useEffect(() => {
    if (isOpen && titulos) {
      const initialItems: ItemEstadoEmail[] = titulos.map(t => {
        const mail = (t.email || "").trim()
        const isMailValid = Boolean(mail && mail.includes("@") && mail.includes("."))
        return {
          ...t,
          selected: true,
          emailInput: mail,
          isEmailValid: isMailValid,
          anexarBoleto: true,
          hasBoleto: true,
          status: "pending"
        }
      })
      setItems(initialItems)
      setStep("config")
      setIsSending(false)
      setSendingIndex(0)
      setTestEmailInput(user?.email || "kleber@silenus.com.br")
      setTestResult(null)
    }
  }, [isOpen, titulos, user])

  // Atualização quando o template selecionado muda
  useEffect(() => {
    if (selectedTemplateId && availableTemplates.length > 0) {
      const t = availableTemplates.find(temp => String(temp.id) === selectedTemplateId)
      if (t) {
        setMensagemCustom(t.conteudo || "")
        if (t.nome && !t.nome.toLowerCase().includes("padrão") && !t.nome.toLowerCase().includes("default")) {
          setAssuntoCustom(t.nome)
        }
        const isHtml = /<!DOCTYPE|<html|<table|<div|<p|<style/i.test(t.conteudo || "")
        if (isHtml) {
          setPreviewMode("preview")
        }
      }
    }
  }, [selectedTemplateId, availableTemplates])

  // Métricas
  const selectedItems = items.filter(i => i.selected)
  const totalSelected = selectedItems.length
  const totalValidos = selectedItems.filter(i => i.isEmailValid).length
  const totalComBoletoAnexado = selectedItems.filter(i => i.anexarBoleto).length
  const totalSemEmail = selectedItems.filter(i => !i.isEmailValid).length
  const isCurrentMessageHtml = /<!DOCTYPE|<html|<table|<div|<p|<style/i.test(mensagemCustom)

  // Amostra para interpolação na prévia visual
  const sampleItem = selectedItems[0] || items[0]
  const interpolatedPreviewHtml = useMemo(() => {
    if (!mensagemCustom) return ""
    const sampleNome = sampleItem?.cliente || "EMPRESA EXEMPLO LTDA"
    const sampleValor = formatBRL(sampleItem?.valor || 399.07)
    const sampleVenc = sampleItem?.data_vencimento ? formatDate(sampleItem.data_vencimento) : "15/09/2026"
    const sampleNumero = sampleItem?.nosso_numero || sampleItem?.id_firebird || "118148"
    const sampleLink = sampleItem?.bank_slip_url || "#"

    let rendered = mensagemCustom
      .replace(/{{nomeCliente}}|{{nome_cliente}}|{{cliente_nome}}|{{cliente}}/gi, sampleNome)
      .replace(/{{valorCobranca}}|{{valor_cobranca}}|{{valor_total}}|{{valor}}/gi, sampleValor)
      .replace(/{{dataVencimento}}|{{data_vencimento}}|{{vencimento}}/gi, sampleVenc)
      .replace(/{{nossoNumero}}|{{nosso_numero}}|{{numero_documento}}/gi, String(sampleNumero))
      .replace(/{{linkPagamento}}|{{link_pagamento}}|{{link_boleto_pdf}}/gi, sampleLink)

    if (!isCurrentMessageHtml) {
      rendered = "<div style=\"font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; padding: 20px; background-color: #f8fafc; border-radius: 8px;\"><div style=\"background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0; white-space: pre-wrap;\">" + rendered + "</div></div>"
    }
    return rendered
  }, [mensagemCustom, sampleItem, isCurrentMessageHtml])

  // Atualizar e-mail de um item na tabela
  const handleEmailChange = (id: number, val: string) => {
    const trimmed = val.trim()
    const isMailValid = Boolean(trimmed && trimmed.includes("@") && trimmed.includes("."))
    setItems(prev => prev.map(item => item.id === id ? { ...item, emailInput: val, isEmailValid: isMailValid } : item))
  }

  const handleToggleSelect = (id: number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item))
  }

  const handleToggleSelectAll = (checked: boolean) => {
    setItems(prev => prev.map(item => ({ ...item, selected: checked })))
  }

  const handleToggleAnexo = (id: number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, anexarBoleto: !item.anexarBoleto } : item))
  }

  const handleToggleAnexoGlobal = (checked: boolean) => {
    setAnexarBoletoGlobal(checked)
    setItems(prev => prev.map(item => ({ ...item, anexarBoleto: checked })))
  }

  const handleStartSending = async () => {
    if (totalSelected === 0) {
      alert("Selecione pelo menos um título para enviar.")
      return
    }
    if (totalValidos < totalSelected) {
      if (!confirm("Existem " + totalSemEmail + " destinatários sem e-mail válido. Deseja prosseguir enviando apenas para os e-mails válidos?")) {
        return
      }
    }

    setStep("sending")
    setIsSending(true)

    const itemsToProcess = items.filter(i => i.selected && i.isEmailValid)

    let activeCampanhaId: number | null = null

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i]
      setSendingIndex(i + 1)
      
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: "sending" } : it))

      try {
        const payload = {
          ids: [item.id],
          campanha_id: activeCampanhaId,
          nome_campanha: `Cobrança Manual em Lote - ${new Date().toLocaleDateString('pt-BR')}`,
          titulos: [{
            id: item.id,
            cliente_id_firebird: item.cliente_id_firebird,
            cliente_email: item.emailInput,
            cliente_nome: item.cliente,
            nosso_numero: item.nosso_numero,
            bank_slip_url: item.bank_slip_url,
            asaas_payment_id: item.asaas_payment_id,
            anexar_boleto: item.anexarBoleto && item.hasBoleto,
            assunto: assuntoCustom,
            mensagem: mensagemCustom
          }]
        }

        const res = await api.post("/cobranca/disparar-email-lote", payload)

        if (res.data?.campanha_id && !activeCampanhaId) {
          activeCampanhaId = res.data.campanha_id
        }

        if (res.data?.success || res.data?.enviados > 0) {
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: "success" } : it))
        } else {
          const detail = res.data?.logs?.[0]?.error || res.data?.error || "Erro desconhecido no servidor"
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: "error", errorMsg: detail } : it))
        }
      } catch (err: any) {
        const errMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Falha na conexão SMTP"
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: "error", errorMsg: errMsg } : it))
      }
    }

    setIsSending(false)
    setStep("finished")
  }

  const handleSendTestEmail = async () => {
    if (!testEmailInput || !testEmailInput.includes("@")) {
      alert("Por favor, informe um e-mail de destino válido para o teste.")
      return
    }

    setIsSendingTest(true)
    setTestResult(null)

    try {
      const res = await api.post("/cobranca/testar-email-template", {
        destinatario: testEmailInput.trim(),
        assunto: assuntoCustom,
        mensagem: mensagemCustom,
        amostra: sampleItem ? {
          cliente: sampleItem.cliente,
          valor: sampleItem.valor,
          data_vencimento: sampleItem.data_vencimento,
          nosso_numero: sampleItem.nosso_numero,
          bank_slip_url: sampleItem.bank_slip_url
        } : null
      })

      setTestResult({
        success: true,
        message: res.data?.message || "E-mail de teste enviado com sucesso para " + testEmailInput + "!"
      })
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Falha ao enviar e-mail de teste"
      setTestResult({
        success: false,
        message: "Erro: " + msg
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* HEADER MODAL */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Mail size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Envio de Cobrança por E-mail em Lote</h2>
              <p className="text-[11px] text-slate-400 font-medium">
                Confira os destinatários, selecione templates HTML prontos e anexe os boletos bancários (PDF)
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            disabled={isSending}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-30 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* STATUS BAR / KPIs */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-5 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Total Selecionados: <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">{totalSelected}</strong>
            </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              E-mails Válidos: <strong className={clsx("font-extrabold px-2 py-0.5 rounded-md border", totalValidos === totalSelected ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-amber-600 bg-amber-50 border-amber-200")}>{totalValidos} de {totalSelected}</strong>
            </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Boletos Anexados (PDF): <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">📎 {totalComBoletoAnexado}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold cursor-pointer select-none text-[11px]">
              <input 
                type="checkbox"
                checked={anexarBoletoGlobal}
                onChange={(e) => handleToggleAnexoGlobal(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span>📎 Anexar Boleto Bancário (PDF) em todos os títulos selecionados</span>
            </label>
          </div>
        </div>

        {/* CORPO DO MODAL (GRID 2 COLUNAS) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* TABELA DE DESTINATÁRIOS (Esquerda - 7 cols) */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox"
                  checked={items.length > 0 && items.every(i => i.selected)}
                  onChange={(e) => handleToggleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  id="select-all"
                />
                <label htmlFor="select-all" className="font-extrabold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wide cursor-pointer">
                  LISTA DE DESTINATÁRIOS ({items.length})
                </label>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Você pode editar o e-mail diretamente na tabela antes de disparar
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider z-10 shadow-2xs">
                  <tr>
                    <th className="p-2.5 w-10 text-center">Sel.</th>
                    <th className="p-2.5">Cliente / Destinatário</th>
                    <th className="p-2.5 w-52">E-mail (Editável)</th>
                    <th className="p-2.5 text-center w-28">Anexo Boleto</th>
                    <th className="p-2.5 text-right w-24">Valor</th>
                    <th className="p-2.5 text-center w-20">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {items.map((item) => (
                    <tr 
                      key={item.id}
                      className={clsx(
                        "transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50",
                        !item.selected && "opacity-50 bg-slate-50/40 dark:bg-slate-900/40",
                        item.status === "success" && "bg-emerald-50/40 dark:bg-emerald-950/20",
                        item.status === "error" && "bg-rose-50/40 dark:bg-rose-950/20"
                      )}
                    >
                      <td className="p-2.5 text-center">
                        <input 
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="p-2.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{item.cliente}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Doc: #{item.id_firebird || item.id} {item.nosso_numero ? "| Nosso Nº: " + item.nosso_numero : ""}
                        </div>
                      </td>

                      <td className="p-2.5">
                        <div className="relative">
                          <input 
                            type="email"
                            value={item.emailInput}
                            onChange={(e) => handleEmailChange(item.id, e.target.value)}
                            placeholder="Digite o e-mail..."
                            className={clsx(
                              "w-full px-2.5 py-1 text-xs rounded-md border font-mono transition-all outline-none",
                              item.isEmailValid 
                                ? "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-800 dark:text-white" 
                                : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 focus:border-amber-500"
                            )}
                          />
                          {!item.isEmailValid && (
                            <span className="text-[9px] text-amber-600 font-semibold block mt-0.5">
                              ⚠️ E-mail ausente ou inválido
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAnexo(item.id)}
                          className={clsx(
                            "px-2.5 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs",
                            item.anexarBoleto 
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-200 border border-indigo-300 dark:border-indigo-800" 
                              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 hover:bg-slate-200 border border-slate-200 dark:border-slate-700"
                          )}
                          title={item.anexarBoleto ? "Boleto em PDF será anexado ao e-mail" : "Clique para anexar o boleto PDF"}
                        >
                          <Paperclip size={11} />
                          {item.anexarBoleto ? (item.bank_slip_url || item.asaas_payment_id ? "Anexado (PDF)" : "Anexar (PDF)") : "Sem Anexo"}
                        </button>
                      </td>

                      <td className="p-2.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatBRL(item.valor)}
                      </td>

                      <td className="p-2.5 text-center">
                        {item.status === "pending" && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold px-2 py-0.5 rounded-full">
                            Pendente
                          </span>
                        )}
                        {item.status === "sending" && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <RefreshCw size={10} className="animate-spin" /> Enviando
                          </span>
                        )}
                        {item.status === "success" && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                            <Check size={10} /> Enviado
                          </span>
                        )}
                        {item.status === "error" && (
                          <button
                            type="button"
                            onClick={() => alert("Detalhes do Erro no Envio:\n\n" + (item.errorMsg || "Erro desconhecido ao enviar via SMTP."))}
                            className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 cursor-pointer transition-colors"
                            title="Clique para ver o motivo do erro"
                          >
                            <AlertTriangle size={10} /> Erro (Ver)
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PAINEL DE MODELO & MENSAGEM (Direita - 5 cols) */}
          <div className="lg:col-span-5 flex flex-col h-full bg-slate-50/70 dark:bg-slate-900/60 p-4 space-y-3.5 overflow-y-auto">
            
            {/* TOPO DO PAINEL */}
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} className="text-indigo-600" />
                PERSONALIZAÇÃO DO E-MAIL
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTestModal(true)
                  setTestResult(null)
                }}
                className="px-2.5 py-1 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Dispara um e-mail de teste para verificar a formatação antes de enviar para todos"
              >
                <SendHorizonal size={12} />
                Enviar E-mail Teste
              </button>
            </div>

            {/* Template Selector com suporte a todos os templates HTML e Texto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sparkles size={12} className="text-amber-500" /> TEMPLATE DE MODELO
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {availableTemplates.length} modelos disponíveis
                </span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer"
              >
                <option value="">-- Modelo Padrão de Cobrança Coliseu Transporte (Texto) --</option>
                {availableTemplates.map(t => {
                  const isHtml = /<!DOCTYPE|<html|<table|<div|<p|<style/i.test(t.conteudo || "")
                  const badge = isHtml ? "✨ [HTML]" : "📄 [Texto]"
                  const catLabel = t.categoria ? " (" + t.categoria + ")" : ""
                  return (
                    <option key={t.id} value={t.id}>
                      {badge} {t.nome}{catLabel}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Assunto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ASSUNTO DO E-MAIL *
              </label>
              <input 
                type="text"
                value={assuntoCustom}
                onChange={(e) => setAssuntoCustom(e.target.value)}
                placeholder="Assunto da cobrança..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Alternador de Prévia Visual vs Editor de Código */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>CORPO DO E-MAIL</span>
                  {isCurrentMessageHtml && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800">
                      HTML Rico
                    </span>
                  )}
                </label>

                {/* Tabs Preview vs Code */}
                <div className="flex items-center bg-slate-200 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    className={clsx(
                      "px-2.5 py-0.8 rounded-md flex items-center gap-1 transition-all cursor-pointer",
                      previewMode === "preview" 
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-extrabold" 
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    <Eye size={12} /> Prévia Visual
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("code")}
                    className={clsx(
                      "px-2.5 py-0.8 rounded-md flex items-center gap-1 transition-all cursor-pointer",
                      previewMode === "code" 
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-extrabold" 
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    <Code size={12} /> Código / Texto
                  </button>
                </div>
              </div>

              {/* Conteúdo: Prévia Formatada ou Textarea */}
              <div className="flex-1 flex flex-col min-h-[220px] rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-inner">
                {previewMode === "preview" ? (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-800/90 px-3 py-1 text-[10px] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span>Exibindo com dados de: <strong>{sampleItem?.cliente || "Cliente Exemplo"}</strong></span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">● Prévia Real</span>
                    </div>
                    <iframe
                      title="Prévia do E-mail"
                      srcDoc={interpolatedPreviewHtml}
                      className="w-full flex-1 border-0 bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <textarea 
                    value={mensagemCustom}
                    onChange={(e) => setMensagemCustom(e.target.value)}
                    rows={10}
                    placeholder="Cole seu código HTML ou texto aqui..."
                    className="w-full flex-1 p-3 text-xs font-mono rounded-xl border-0 bg-white dark:bg-slate-900 focus:outline-none resize-none leading-relaxed text-slate-800 dark:text-slate-200"
                  />
                )}
              </div>

              <span className="text-[10px] text-slate-400 mt-1">
                Variáveis suportadas: <code className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1 rounded">&#123;&#123;nomeCliente&#125;&#125;</code>, <code className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1 rounded">&#123;&#123;valorCobranca&#125;&#125;</code>, <code className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1 rounded">&#123;&#123;dataVencimento&#125;&#125;</code>, <code className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1 rounded">&#123;&#123;nossoNumero&#125;&#125;</code>
              </span>
            </div>
          </div>
        </div>

        {/* FOOTER DO MODAL */}
        <div className="bg-slate-900 text-white px-5 py-3.5 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {step === "sending" && (
              <span className="flex items-center gap-2 text-indigo-300 font-bold">
                <RefreshCw size={14} className="animate-spin" /> Disparando {sendingIndex} de {totalValidos} e-mails...
              </span>
            )}
            {step === "finished" && (
              <span className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 size={14} /> Disparo em lote finalizado com sucesso!
              </span>
            )}
            {step === "config" && (
              <span>Pronto para envio para <strong>{totalValidos}</strong> clientes.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer disabled:opacity-30"
            >
              {step === "finished" ? "Fechar" : "Cancelar"}
            </button>

            {step === "config" && (
              <button
                type="button"
                onClick={handleStartSending}
                disabled={totalSelected === 0 || totalValidos === 0}
                className="px-5 py-2 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={14} /> Disparar para {totalValidos} Destinatários
              </button>
            )}

            {step === "finished" && (
              <button
                type="button"
                onClick={onCompleted}
                className="px-5 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 size={14} /> Concluir &amp; Atualizar Lista
              </button>
            )}
          </div>
        </div>

        {/* MODAL DE ENVIO DE E-MAIL DE TESTE */}
        {showTestModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                    <SendHorizonal size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Enviar E-mail de Teste</h3>
                    <p className="text-[10px] text-slate-400">Verifique a formatação do template na sua caixa de entrada</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    E-MAIL DE DESTINO PARA TESTE *
                  </label>
                  <input 
                    type="email"
                    value={testEmailInput}
                    onChange={(e) => setTestEmailInput(e.target.value)}
                    placeholder="seuemail@exemplo.com.br"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>

                {testResult && (
                  <div className={clsx(
                    "p-3 rounded-xl text-xs font-semibold flex items-start gap-2",
                    testResult.success 
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800" 
                      : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800"
                  )}>
                    {testResult.success ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  disabled={isSendingTest}
                  className="px-3.5 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest || !testEmailInput}
                  className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSendingTest ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Enviando...
                    </>
                  ) : (
                    <>
                      <SendHorizonal size={12} /> Disparar Teste
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
