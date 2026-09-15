import { Link } from 'react-router-dom'
import {
  Trophy, DollarSign, Megaphone, Users, FileText, BarChart3,
  ChevronRight, Globe, Instagram
} from 'lucide-react'

// Definição dos 6 cards de atalhos rápidos do Dashboard conforme especificado no prompt
const QUICK_SHORTCUTS = [
  {
    title: 'Kanban de Vendas',
    description: 'Acompanhe suas oportunidades e negociações em andamento.',
    icon: Trophy,
    color: '#F97316',
    route: '/crm',
  },
  {
    title: 'Financeiro & Lançamentos',
    description: 'Visualize receitas, despesas e lançamentos financeiros.',
    icon: DollarSign,
    color: '#16A34A',
    route: '/fluxo-caixa',
  },
  {
    title: 'Marketing em Massa',
    description: 'Crie e gerencie campanhas e comunicações em massa.',
    icon: Megaphone,
    color: '#9333EA',
    route: '/marketing',
  },
  {
    title: 'Clientes & Parceiros',
    description: 'Gerencie seus clientes, parceiros e contatos.',
    icon: Users,
    color: '#2563EB',
    route: '/clientes',
  },
  {
    title: 'Gestão de Contratos',
    description: 'Crie, acompanhe e gerencie contratos e documentos.',
    icon: FileText,
    color: '#F59E0B',
    route: '/contratos',
  },
  {
    title: 'Dashboard BI',
    description: 'Acesse indicadores, gráficos e análises estratégicas.',
    icon: BarChart3,
    color: '#0D9488',
    route: '/bi',
  },
]

// 3 Atalhos da Esquerda (Kanban, Financeiro, Marketing)
const LEFT_CARDS = [
  {
    title: 'Kanban de Vendas',
    description: 'Acompanhe suas oportunidades e negociações em andamento.',
    icon: Trophy,
    color: '#F97316',
    route: '/crm',
  },
  {
    title: 'Financeiro & Lançamentos',
    description: 'Visualize receitas, despesas e lançamentos financeiros.',
    icon: DollarSign,
    color: '#16A34A',
    route: '/fluxo-caixa',
  },
  {
    title: 'Marketing em Massa',
    description: 'Crie e gerencie campanhas e comunicações em massa.',
    icon: Megaphone,
    color: '#9333EA',
    route: '/marketing',
  },
]

// 3 Atalhos da Direita (Clientes, Contratos, Dashboard BI)
const RIGHT_CARDS = [
  {
    title: 'Clientes & Parceiros',
    description: 'Gerencie seus clientes, parceiros e contatos.',
    icon: Users,
    color: '#2563EB',
    route: '/clientes',
  },
  {
    title: 'Gestão de Contratos',
    description: 'Crie, acompanhe e gerencie contratos e documentos.',
    icon: FileText,
    color: '#F59E0B',
    route: '/contratos',
  },
  {
    title: 'Dashboard BI',
    description: 'Acesse indicadores, gráficos e análises estratégicas.',
    icon: BarChart3,
    color: '#0D9488',
    route: '/bi',
  },
]

export default function DashboardBI() {
  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* SEÇÃO PRINCIPAL EM 3 COLUNAS: ESQUERDA (3 CARDS) | CENTRO (LOGO + SLOGAN) | DIREITA (3 CARDS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* COLUNA DA ESQUERDA (3 ATALHOS RÁPIDOS) */}
        <div className="lg:col-span-3 flex flex-col gap-4 justify-between">
          {LEFT_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <Link
                key={card.title}
                to={card.route}
                className="group relative bg-white border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-200 transform hover:-translate-y-1 overflow-hidden flex-1 flex flex-col justify-between"
                style={{ borderRadius: '16px' }}
              >
                {/* BARRA COLORIDA NO TOPO DE CADA CARD (4px DE ALTURA) */}
                <div className="h-1 w-full" style={{ backgroundColor: card.color }} />
                
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                        style={{ backgroundColor: `${card.color}1A`, color: card.color }}
                      >
                        <Icon size={20} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">
                        {card.title}
                      </h3>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                  <p className="text-[11px] font-normal text-[#6B7280] leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* COLUNA CENTRAL (CARD DA LOGO COLISEU TRANSPORTE + SLOGAN) */}
        <div className="lg:col-span-6 bg-white rounded-3xl p-6 md:p-8 border border-slate-200/90 shadow-2xs flex flex-col items-center justify-center text-center space-y-5">
          
          {/* LOGO VERTICAL COLISEU TRANSPORTE */}
          <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center justify-center">
            <img
              src="/assets/nexus-logo-vertical.png"
              alt="Coliseu Transporte - O elo entre sua empresa e seus resultados"
              className="w-72 md:w-88 h-auto object-contain hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* SLOGAN & FRASES */}
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
              Gerencie tudo. Cresça mais rápido.
            </h2>
            <p className="text-xs text-slate-500 font-medium max-w-md">
              Plataforma corporativa de alta performance para inteligência operacional, financeira e comercial.
            </p>
          </div>

          {/* BOTOES DE LINKS DA COLISEU */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <a
              href="https://www.coliseusistemas.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-2xs hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Globe size={15} />
              <span>www.coliseusistemas.com.br</span>
            </a>
            <a
              href="https://www.instagram.com/coliseusistemas/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-95 text-white font-extrabold text-xs shadow-2xs hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Instagram size={15} />
              <span>Instagram Coliseu</span>
            </a>
          </div>

        </div>

        {/* COLUNA DA DIREITA (3 ATALHOS RÁPIDOS) */}
        <div className="lg:col-span-3 flex flex-col gap-4 justify-between">
          {RIGHT_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <Link
                key={card.title}
                to={card.route}
                className="group relative bg-white border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-200 transform hover:-translate-y-1 overflow-hidden flex-1 flex flex-col justify-between"
                style={{ borderRadius: '16px' }}
              >
                {/* BARRA COLORIDA NO TOPO DE CADA CARD (4px DE ALTURA) */}
                <div className="h-1 w-full" style={{ backgroundColor: card.color }} />
                
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                        style={{ backgroundColor: `${card.color}1A`, color: card.color }}
                      >
                        <Icon size={20} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">
                        {card.title}
                      </h3>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                  <p className="text-[11px] font-normal text-[#6B7280] leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

      </div>

    </div>
  )
}
