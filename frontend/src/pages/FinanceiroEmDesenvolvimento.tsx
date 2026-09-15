import React from 'react'
import { Wallet } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import Titulos from './Titulos'

export default function FinanceiroEmDesenvolvimento() {
  const layoutVersion = useAuthStore((s) => s.user?.layout_version || 'v1.0')

  if (layoutVersion === 'v2.0' || layoutVersion === 'v3.0') {
    return (
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="font-heading text-xl font-semibold text-text-primary">Financeiro</h2>
            <p className="text-text-secondary text-sm">Gestão de contas a pagar e a receber.</p>
          </div>
        </div>
        <Titulos />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold text-text-primary">Financeiro</h2>
          <p className="text-text-secondary text-sm">Gestão completa e relatórios financeiros.</p>
        </div>
      </div>
      
      <div className="bg-bg-primary rounded-2xl shadow-sm border border-border p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-brand-500" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Módulo em Desenvolvimento</h3>
        <p className="text-text-secondary max-w-sm">
          A nova visão consolidada do Financeiro está sendo construída. Em breve você terá acesso a todas as funcionalidades avançadas aqui.
        </p>
      </div>
    </div>
  )
}
