import { useState } from 'react'
import { X, Lock, Key, CheckCircle2, AlertCircle, ShieldAlert, Eye, EyeOff } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

interface ModalAlterarSenhaProps {
  isOpen: boolean
  isForced?: boolean
  onClose: () => void
}

export default function ModalAlterarSenha({
  isOpen,
  isForced = false,
  onClose
}: ModalAlterarSenhaProps) {
  const clearPrecisaAlterarSenha = useAuthStore((s) => s.clearPrecisaAlterarSenha)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  const [showSenhaAtual, setShowSenhaAtual] = useState(false)
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const cleanNova = novaSenha.trim()
    const cleanConfirmar = confirmarSenha.trim()

    if (!cleanNova) {
      setError('Por favor, informe a nova senha.')
      return
    }

    if (cleanNova === '123456') {
      setError('A nova senha não pode ser "123456". Escolha uma senha mais segura.')
      return
    }

    if (cleanNova.length < 6) {
      setError('A nova senha deve possuir no mínimo 6 caracteres.')
      return
    }

    if (cleanNova !== cleanConfirmar) {
      setError('A nova senha e a confirmação não coincidem.')
      return
    }

    setLoading(true)

    try {
      const res = await api.post('/auth/alterar-senha', {
        senhaAtual: isForced ? '123456' : senhaAtual,
        novaSenha: cleanNova
      })

      if (res.data?.success) {
        setSuccess('Senha alterada com sucesso!')
        clearPrecisaAlterarSenha()
        setTimeout(() => {
          setSenhaAtual('')
          setNovaSenha('')
          setConfirmarSenha('')
          setSuccess(null)
          onClose()
        }, 1200)
      } else {
        setError(res.data?.error || 'Não foi possível alterar a senha.')
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao comunicar com o servidor.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100 animate-scale-up">
        
        {/* CABEÇALHO */}
        <div className="px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Key size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {isForced ? 'Troca de Senha Obrigatória' : 'Alterar Senha de Acesso'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isForced ? 'Senha temporária detectada' : 'Atualize suas credenciais de segurança'}
              </p>
            </div>
          </div>

          {!isForced && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* CORPO DO MODAL */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-left">
          
          {/* BANNER SE FORÇADO POR SENHA PADRÃO 123456 */}
          {isForced && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 text-amber-200 text-xs leading-relaxed">
              <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-amber-300 mb-0.5">Segurança da Conta</span>
                Você entrou utilizando a senha padrão <strong className="font-mono bg-amber-950/60 px-1 py-0.5 rounded text-amber-300">123456</strong>. É necessário definir uma nova senha segura para prosseguir.
              </div>
            </div>
          )}

          {/* MENSAGEM DE ERRO */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-3 flex items-start gap-2.5">
              <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* MENSAGEM DE SUCESSO */}
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl p-3 flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* CAMPO SENHA ATUAL (Apenas se não for forçado) */}
          {!isForced && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Senha Atual (opcional)
              </label>
              <div className="relative">
                <input
                  type={showSenhaAtual ? 'text' : 'password'}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  placeholder="Digite sua senha atual"
                  className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowSenhaAtual(!showSenhaAtual)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showSenhaAtual ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}

          {/* CAMPO NOVA SENHA */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nova Senha <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showNovaSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite a nova senha (não use 123456)"
                required
                minLength={6}
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNovaSenha(!showNovaSenha)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showNovaSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <span className="text-[10.5px] text-slate-400 mt-1 block">
              Mínimo de 6 caracteres. Diferente de 123456.
            </span>
          </div>

          {/* CAMPO CONFIRMAR NOVA SENHA */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Confirmar Nova Senha <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmarSenha ? 'text' : 'password'}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a nova senha"
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmarSenha(!showConfirmarSenha)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showConfirmarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="pt-3 flex items-center justify-end gap-2.5">
            {!isForced && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(success)}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Confirmar e Salvar Senha</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  )
}
