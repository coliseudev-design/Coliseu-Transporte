import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { BranchProvider } from './contexts/BranchContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s
      gcTime: 5 * 60_000,       // 5 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Forçar digitação em maiúsculas globalmente no sistema (exceto senhas, emails, etc.)
if (typeof window !== 'undefined') {
  window.addEventListener(
    'input',
    (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null
      if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
      const type = target.type ? target.type.toLowerCase() : 'text'
      if (['password', 'email', 'file', 'checkbox', 'radio', 'color', 'date', 'time', 'datetime-local', 'number'].includes(type)) return
      if (target.classList?.contains('normal-case')) return

      const val = target.value
      if (val && val !== val.toUpperCase()) {
        const start = target.selectionStart
        const end = target.selectionEnd

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          target instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
          'value'
        )?.set

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(target, val.toUpperCase())
        } else {
          target.value = val.toUpperCase()
        }

        if (start !== null && end !== null) {
          try {
            target.setSelectionRange(start, end)
          } catch {}
        }
      }
    },
    true
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <BranchProvider>
          <App />
        </BranchProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
