import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

export interface Filial {
  id: number
  empresa_erp: number
  depto_id: number
  centro_custo: number | null
  nome: string
  documento: string | null
  is_default: boolean
}

interface BranchContextType {
  filiais: Filial[]
  selectedBranch: number | 'todas'
  setSelectedBranch: (id: number | 'todas') => void
  isLoading: boolean
}

const BranchContext = createContext<BranchContextType>({
  filiais: [],
  selectedBranch: 'todas',
  setSelectedBranch: () => {},
  isLoading: false,
})

export function BranchProvider({ children }: { children: ReactNode }) {
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Restaurar seleção do localStorage
  const [selectedBranch, setSelectedBranchState] = useState<number | 'todas'>(() => {
    const stored = localStorage.getItem('coliseu:branch') || localStorage.getItem('nexus:branch')
    if (stored === 'todas' || stored === null) return 'todas'
    const num = parseInt(stored, 10)
    return isNaN(num) ? 'todas' : num
  })

  const token = useAuthStore(state => state.token)

  const setSelectedBranch = useCallback((id: number | 'todas') => {
    setSelectedBranchState(id)
    localStorage.setItem('coliseu:branch', String(id))
  }, [])

  useEffect(() => {
    const fetchFiliais = async () => {
      if (!token) {
        setFiliais([])
        return
      }

      setIsLoading(true)
      try {
        const { data } = await api.get('/filiais')
        
        // O backend retorna um array diretamente: res.json(rows)
        const filiaisList: Filial[] = Array.isArray(data) ? data : (data.filiais || [])
        setFiliais(filiaisList)

        if (filiaisList.length > 0) {
          const defaultBranch = filiaisList.find(f => f.is_default)?.depto_id || filiaisList[0].depto_id
          // Se selectedBranch for 'todas' ou se a filial salva não existir na lista, selecionar a padrão
          const currentValid = selectedBranch !== 'todas' && typeof selectedBranch === 'number' && filiaisList.some(f => Number(f.depto_id) === selectedBranch)
          if (!currentValid) {
            setSelectedBranch(defaultBranch)
          }
        }
      } catch (err) {
        setFiliais([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchFiliais()
  }, [token, setSelectedBranch, selectedBranch])

  return (
    <BranchContext.Provider value={{ filiais, selectedBranch, setSelectedBranch, isLoading }}>
      {children}
    </BranchContext.Provider>
  )
}

/** Hook de acesso ao contexto de filiais */
export function useBranch() {
  return useContext(BranchContext)
}

/**
 * Retorna o valor de depto_id para injetar nas queries da API.
 * Se 'todas', retorna undefined (sem filtro).
 */
export function useBranchParam(): { depto_id?: number; centro_custo?: number } {
  const { selectedBranch, filiais } = useBranch()
  if (selectedBranch === 'todas') return {}
  
  const filial = filiais.find(f => f.depto_id === selectedBranch)
  return { 
    depto_id: selectedBranch,
    ...(filial?.centro_custo ? { centro_custo: filial.centro_custo } : {})
  }
}
