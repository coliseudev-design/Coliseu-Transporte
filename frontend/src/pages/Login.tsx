import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LogIn, TrendingUp, BarChart3, FileText, Truck, ShieldCheck, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)

  const [email, setEmail] = useState(() => localStorage.getItem('coliseu_remember_email') || localStorage.getItem('nexus_remember_email') || '')
  const [password, setPassword] = useState(() => localStorage.getItem('coliseu_remember_password') || localStorage.getItem('nexus_remember_password') || '')
  const [rememberMe, setRememberMe] = useState(() => (localStorage.getItem('coliseu_remember_me') || localStorage.getItem('nexus_remember_me')) !== 'false')
  const [showPassword, setShowPassword] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim()
    const cleanPass = password.trim()
    const ok = await login(cleanEmail, cleanPass)
    if (ok) {
      if (rememberMe) {
        localStorage.setItem('coliseu_remember_email', cleanEmail)
        localStorage.setItem('coliseu_remember_password', cleanPass)
        localStorage.setItem('coliseu_remember_me', 'true')
      } else {
        localStorage.removeItem('coliseu_remember_email')
        localStorage.removeItem('coliseu_remember_password')
        localStorage.setItem('coliseu_remember_me', 'false')
        localStorage.removeItem('nexus_remember_email')
        localStorage.removeItem('nexus_remember_password')
        localStorage.removeItem('nexus_remember_me')
      }
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex w-full">
      
      {/* Esquerda: Showcase / Criativo (Escondido no Mobile) */}
      {/* Esquerda: Showcase / Criativo (Escondido no Mobile) */}
      <div className="hidden lg:flex w-3/5 relative overflow-hidden flex-col justify-between p-12 bg-slate-950">
        {/* Imagem de Fundo com o Caminhão Coliseu Transporte */}
        <img 
          src="/caminhao-bg.jpg" 
          alt="Coliseu Transporte" 
          className="absolute inset-0 w-full h-full object-cover object-center scale-[1.02] transform transition-transform duration-1000" 
        />
        
        {/* Overlays escuros e gradientes para contraste e leitura impecável */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-900/30 to-slate-950/70" />
        
        {/* Efeitos de iluminação de fundo */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        
        {/* Topo da área criativa */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-white/10 p-2.5 rounded-xl backdrop-blur-md border border-white/20 shadow-lg">
              <img src="/nexus-simbolo.png" className="w-6 h-6 object-contain" alt="Coliseu Transporte" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-heading font-bold text-xl tracking-tight leading-none">Coliseu Transporte</span>
              <span className="text-sky-400 text-xs font-semibold tracking-wider uppercase mt-1">Gestão de MDF-e, CT-e & Transportadoras</span>
            </div>
          </div>
          
          <h1 className="text-4xl xl:text-5xl font-heading font-bold text-white leading-tight mb-5 max-w-2xl drop-shadow-md">
            Controle total de MDF-e, CT-e<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-200">
              e frotas em tempo real.
            </span>
          </h1>
          <p className="text-slate-200 text-lg max-w-xl leading-relaxed font-light drop-shadow">
            A plataforma definitiva para transportadoras e operadores logísticos. Emissão ágil de manifestos, autorização na SEFAZ, controle de fretes e rastreamento de cargas sincronizados diretamente com seu ERP.
          </p>
        </div>

        {/* Centro/Widgets de Demonstração */}
        <div className="relative z-10 mt-10 grid grid-cols-2 gap-5 max-w-2xl">
          {/* Card 1: MDF-e e CT-e */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-white/15 rounded-2xl p-5 transform transition-transform hover:-translate-y-1 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="bg-sky-500/25 p-2 rounded-lg border border-sky-400/20">
                  <FileText className="text-sky-400 w-5 h-5" />
                </div>
                <span className="text-slate-200 font-medium text-sm">CT-e & MDF-e</span>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                SEFAZ Online
              </span>
            </div>
            <div className="text-white font-bold text-2xl tracking-tight">1.428 <span className="text-sm font-normal text-slate-300">emitidos</span></div>
            <div className="text-sky-300 text-xs font-medium mt-2 flex items-center gap-1">
              +18.4% <span className="text-slate-400 font-normal">autorizados no mês</span>
            </div>
          </div>

          {/* Card 2: Frotas e Transportadoras */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-white/15 rounded-2xl p-5 transform transition-transform hover:-translate-y-1 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="bg-emerald-500/25 p-2 rounded-lg border border-emerald-400/20">
                  <Truck className="text-emerald-400 w-5 h-5" />
                </div>
                <span className="text-slate-200 font-medium text-sm">Frota & Cargas</span>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Em Rota
              </span>
            </div>
            <div className="text-white font-bold text-2xl tracking-tight">94 <span className="text-sm font-normal text-slate-300">veículos ativos</span></div>
            <div className="text-emerald-300 text-xs font-medium mt-2 flex items-center gap-1">
              100% <span className="text-slate-400 font-normal">monitoramento de entrega</span>
            </div>
          </div>
          
          {/* Card 3 (Span 2): Fretes Faturados */}
          <div className="col-span-2 bg-gradient-to-r from-slate-900/80 via-slate-900/70 to-slate-900/60 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex items-center justify-between transform transition-transform hover:-translate-y-1 shadow-2xl">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="bg-cyan-500/25 p-1.5 rounded-lg border border-cyan-400/20">
                  <TrendingUp className="text-cyan-400 w-4 h-4" />
                </div>
                <span className="text-slate-200 font-medium text-sm">Volume de Fretes Faturados</span>
              </div>
              <div className="text-white font-bold text-3xl tracking-tight">R$ 482.650,00</div>
              <div className="text-slate-400 text-xs mt-1">Total consolidado dos manifestos integrados</div>
            </div>
            <div className="hidden sm:flex items-end gap-1.5 h-12 pr-2">
               {/* Barras decorativas */}
               {[35, 60, 45, 80, 65, 90, 100].map((h, i) => (
                 <div key={i} className="w-3 bg-gradient-to-t from-sky-500 to-cyan-400 rounded-t-sm shadow-sm" style={{ height: `${h}%` }} />
               ))}
            </div>
          </div>
        </div>

        {/* Rodapé da área criativa */}
        <div className="relative z-10 mt-10 flex items-center justify-between text-slate-300 text-sm">
          <span>© 2026 Coliseu Sistemas • Gestão de Transportes</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-medium text-xs">SEFAZ & ERP Integrados</span>
          </div>
        </div>
      </div>

      {/* Direita: Formulário de Login */}
      <div className="w-full lg:w-2/5 bg-bg-primary flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 relative">
        
        {/* Mobile Header (Sempre visível em mobile, oculto em Desktop porque tem a barra lateral) */}
        <div className="lg:hidden absolute top-8 left-6 sm:left-12 flex items-center gap-2">
          <div className="bg-bg-primary shadow-sm border border-border p-2 rounded-xl">
            <img src="/nexus-simbolo.png" className="w-5 h-5 object-contain" alt="Coliseu Transporte" />
          </div>
          <span className="text-text-primary font-heading font-bold text-lg">Coliseu Transporte</span>
        </div>

        <div className="w-full max-w-sm mx-auto mt-16 lg:mt-0">
          <div className="mb-10 text-left">
            <img 
              src="/logo-nexus.png" 
              alt="Coliseu Transporte" 
              className="h-16 sm:h-20 w-auto object-contain mb-8"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h2 className="font-heading text-3xl font-bold text-text-primary tracking-tight">Bem-vindo de volta.</h2>
            <p className="text-text-secondary mt-2 text-base">
              Entre para acessar a gestão de transportes e documentos fiscais.
            </p>
          </div>

          <form onSubmit={handleSubmit} method="POST" className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">E-mail de Acesso</label>
              <input
                type="email"
                name="username"
                className="w-full px-4 py-3 rounded-lg border border-border focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-text-primary bg-bg-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kleber@silenus.com.br"
                required
                autoFocus
                autoComplete="username"
                inputMode="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className="w-full px-4 py-3 pr-11 rounded-lg border border-border focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all text-text-primary bg-bg-primary font-medium"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* LEMBRAR-ME / SALVAR SENHA */}
            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Salvar senha & dados de acesso</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg p-3.5 flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white rounded-lg font-medium shadow-sm shadow-brand-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4 cursor-pointer" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Avançar</span>
                  <LogIn className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 text-center text-sm text-text-secondary">
            Ainda não tem conta?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700 transition-colors">
              Criar acesso ✨
            </Link>
          </div>
        </div>
      </div>

    </div>
  )
}
