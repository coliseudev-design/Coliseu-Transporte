import { useState } from 'react'
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { UserPlus, KeyRound } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [companyKey, setCompanyKey] = useState(() => searchParams.get('serial') || searchParams.get('companyKey') || '')
  const [moduleKey, setModuleKey] = useState(() => searchParams.get('chave') || searchParams.get('moduleKey') || '')

  // Se já logado, redireciona
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await register(nome, email, senha, companyKey.trim(), moduleKey.trim())
    if (ok) navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="/assets/logo-coliseu-transporte.svg"
              alt="Coliseu Transporte"
              className="h-14 sm:h-16 w-auto object-contain"
            />
          </div>
          <h1 className="font-heading text-xl sm:text-2xl font-semibold text-white">Criar Conta</h1>
          <p className="text-white/60 text-sm mt-1">
            Cadastre-se para acessar o Coliseu Transporte
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-bg-primary backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Nome Completo</label>
            <input
              type="text"
              className="input text-base w-full p-2 border rounded"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: João da Silva"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Email</label>
            <input
              type="email"
              className="input text-base w-full p-2 border rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: joao@empresa.com.br"
              required
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Serial da Empresa (UUID)
            </label>
            <input
              type="text"
              className="input text-base w-full p-2 border rounded font-mono text-sm"
              value={companyKey}
              onChange={(e) => setCompanyKey(e.target.value)}
              placeholder="ex: 4b722801-99ad-4b3f-8b56-..."
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Serial exibido abaixo do nome da empresa no Painel de Licenças.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5 flex items-center gap-1.5">
              <KeyRound size={14} className="text-blue-600" />
              Chave do Módulo Coliseu Transporte
            </label>
            <input
              type="text"
              className="input text-base w-full p-2 border rounded font-mono text-sm uppercase"
              value={moduleKey}
              onChange={(e) => setModuleKey(e.target.value.toUpperCase())}
              placeholder="ex: COL-R43U-T93G-BGDP"
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Chave exclusiva do módulo Coliseu Transporte (respeita o limite de dispositivos contratados).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Senha</label>
            <input
              type="password"
              className="input text-base w-full p-2 border rounded"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Crie uma senha segura"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full justify-center py-3 text-base flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5" disabled={loading}>
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Cadastrando...
              </>
            ) : (
              <>
                <UserPlus size={18} />
                Finalizar Cadastro
              </>
            )}
          </button>
          
          <div className="text-center pt-2">
            <Link to="/login" className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
              Já tem uma conta? Entrar
            </Link>
          </div>
        </form>

        <p className="text-center text-xs text-white/50 mt-4">
          © 2026 Coliseu Transporte · v2.0 API Integrada
        </p>
      </div>
    </div>
  )
}
