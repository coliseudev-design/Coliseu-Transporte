import React, { useState, useRef } from 'react'
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, RefreshCw, File, ShieldCheck } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

interface ModalAnexarContratoProps {
  isOpen: boolean
  clienteId: number | string
  clienteNome: string
  onClose: () => void
  onSuccess: () => void
}

export default function ModalAnexarContrato({
  isOpen,
  clienteId,
  clienteNome,
  onClose,
  onSuccess
}: ModalAnexarContratoProps) {
  const [titulo, setTitulo] = useState('')
  const [plataforma, setPlataforma] = useState('DocuSign')
  const [observacoes, setObservacoes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileBase64, setFileBase64] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!isOpen) return null

  const handleFileChange = (selectedFile: File) => {
    setErrorMsg('')
    if (selectedFile.size > 25 * 1024 * 1024) {
      setErrorMsg('O arquivo selecionado é muito grande. O tamanho máximo permitido é 25MB.')
      return
    }

    setFile(selectedFile)
    if (!titulo) {
      // Auto-preenche título inicial com base no nome do arquivo limpo
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      setTitulo(nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1))
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        setFileBase64(e.target.result as string)
      }
    }
    reader.readAsDataURL(selectedFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !fileBase64) {
      setErrorMsg('Selecione um arquivo de contrato (PDF ou documento) para anexar.')
      return
    }
    if (!titulo.trim()) {
      setErrorMsg('Informe um título ou identificação para o contrato.')
      return
    }

    setIsUploading(true)
    setErrorMsg('')

    try {
      await api.post(`/clientes/${clienteId}/contratos-anexos`, {
        titulo: titulo.trim(),
        plataforma_origem: plataforma,
        nome_arquivo: file.name,
        tipo_arquivo: file.type || 'application/pdf',
        tamanho_bytes: file.size,
        arquivo_data: fileBase64,
        observacoes: observacoes.trim() || null
      })

      alert('✅ Contrato externo anexado com sucesso!')
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.response?.data?.error || err.message || 'Erro ao anexar contrato.')
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-300">
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Anexar Contrato Externo</h3>
              <p className="text-xs text-indigo-200/80 font-medium line-clamp-1">
                Cliente: {clienteNome}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* DROPZONE */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2",
              isDragging
                ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
                : file 
                  ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20" 
                  : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            )}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              className="hidden"
            />

            {file ? (
              <div className="flex items-center gap-3 text-left">
                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <File size={24} />
                </div>
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{file.name}</div>
                  <div className="text-slate-400 text-[11px]">{formatFileSize(file.size)} • Clique para trocar de arquivo</div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                  <UploadCloud size={26} />
                </div>
                <div className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                  Clique ou arraste o arquivo do contrato aqui
                </div>
                <div className="text-slate-400 text-[11px]">
                  Formatos suportados: PDF, DOCX, DOC, Imagens (Máx. 25MB)
                </div>
              </>
            )}
          </div>

          {/* TÍTULO / IDENTIFICAÇÃO DO CONTRATO */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Título / Identificação do Contrato *
            </label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Contrato de Prestação de Serviços 2024 - Assinado"
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 font-medium outline-none text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* PLATAFORMA DE ORIGEM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Plataforma de Origem
              </label>
              <select
                value={plataforma}
                onChange={(e) => setPlataforma(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 font-medium outline-none text-slate-800 dark:text-slate-200"
              >
                <option value="DocuSign">DocuSign</option>
                <option value="Clicksign">Clicksign</option>
                <option value="Autentique">Autentique</option>
                <option value="Adobe Sign">Adobe Sign</option>
                <option value="Assinatura Física / Digitalizada">Assinatura Física / Digitalizada</option>
                <option value="Zapsign">Zapsign</option>
                <option value="Outra Plataforma Externa">Outra Plataforma Externa</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Observações / Detalhes
              </label>
              <input
                type="text"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Vigência de 12 meses, reajuste IGPM..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 font-medium outline-none text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="px-5 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Salvando Anexo...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Anexar Contrato
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  )
}
