import { create } from 'zustand'
import axios from 'axios'
import api from '../services/api'

export interface User {
  id?: number
  email: string
  nome: string
  role?: string
  permissions?: string[] | null
  layout_version?: string
  grupo_id?: number | null
  grupo_nome?: string
  permissoes_menus?: Record<string, { acesso?: boolean; submenus?: Record<string, boolean> }> | null
  permissoes_acoes?: Record<string, boolean> | null
  precisa_alterar_senha?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  login: (email: string, senha?: string) => Promise<boolean>
  register: (nome: string, email: string, senha: string, companyKey: string) => Promise<boolean>
  logout: () => Promise<void>
  clearPrecisaAlterarSenha: () => void
  init: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  init: () => {
    const token = localStorage.getItem('coliseu_token') || localStorage.getItem('nexus_token')
    const userStr = localStorage.getItem('coliseu_user') || localStorage.getItem('nexus_user')
    if (token && userStr) {
      try {
        set({ token, user: JSON.parse(userStr) })
      } catch { /* ignore */ }
    }
  },
  login: async (email, senha) => {
    set({ loading: true, error: null })
    try {
      // Login via Backend Interno do Dashboard
      const { data } = await api.post('/auth/login', { 
          email, 
          password: senha
      })
      
      // O Identity devolve pelo menos o token
      const token = data.token
      // Se não devolver user object, criamos um mock pra manter a UI feliz. Normalmente devolve user ou profile.
      const user = data.user || data.profile || { email, nome: data.companyName || email }
      user.layout_version = data.user?.layout_version || data.profile?.layout_version || 'v1.0';

      localStorage.setItem('coliseu_token', token)
      localStorage.setItem('coliseu_user', JSON.stringify(user))
      
      set({ user, token, loading: false })
      return true
    } catch (e: unknown) {
      let msg = 'Email ou senha incorretos, ou módulo não contratado'
      if (axios.isAxiosError(e) && e.response?.data) {
        msg = e.response.data.error || e.response.data.message || msg
      }
      set({ error: msg, loading: false })
      return false
    }
  },
  register: async (nome, email, senha, companyKey) => {
    set({ loading: true, error: null })
    try {
      await api.post('/auth/register', { nome, email, password: senha, companyKey })
      // Se sucesso no cadastro, faz o login logo em seguida
      return await get().login(email, senha)
    } catch (e: unknown) {
      let msg = 'Erro ao cadastrar'
      if (axios.isAxiosError(e) && e.response?.data) {
        msg = e.response.data.error || e.response.data.message || msg
      }
      set({ error: msg, loading: false })
      return false
    }
  },
  clearPrecisaAlterarSenha: () => {
    const currentUser = get().user
    if (currentUser) {
      const updatedUser = { ...currentUser, precisa_alterar_senha: false }
      localStorage.setItem('coliseu_user', JSON.stringify(updatedUser))
      set({ user: updatedUser })
    }
  },
  logout: async () => {
    localStorage.removeItem('coliseu_token')
    localStorage.removeItem('coliseu_user')
    localStorage.removeItem('nexus_token')
    localStorage.removeItem('nexus_user')
    set({ user: null, token: null })
    try {
      // Rotas internas que precisem de limpeza (se houver)
      await api.post('/auth/logout').catch(() => {})
    } catch { /* ignore */ }
  },
}))
