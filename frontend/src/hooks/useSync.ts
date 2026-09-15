import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import { useQueryClient } from '@tanstack/react-query'

interface SyncStatusItem {
  tabela: string
  ultima: string
  status: string
  registros: number
}

export function useSyncStatus() {
  const [statusItems, setStatusItems] = useState<SyncStatusItem[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const queryClient = useQueryClient()

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get<{ status: SyncStatusItem[] }>('/sync/status')
      setStatusItems(data.status || [])
      setLastCheck(new Date())
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Frontend: polling a cada 60s (emula Web Worker)
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  // Escuta eventos do Web Worker
  useEffect(() => {
    function handle(e: MessageEvent) {
      if (e.data?.type === 'SYNC_COMPLETE') fetchStatus()
    }
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('coliseu-sync')
      bc.addEventListener('message', handle as any)
      return () => bc.close()
    }
  }, [fetchStatus])

  const triggerSync = useCallback(async () => {
    setIsSyncing(true)
    try {
      await api.post('/sync/start')
      await fetchStatus()
      await queryClient.invalidateQueries()
    } finally {
      setTimeout(() => setIsSyncing(false), 800)
    }
  }, [fetchStatus, queryClient])

  // Última sync (ignorando metadados internos)
  const lastSync = statusItems
    .filter((i) => !i.tabela.startsWith('__'))
    .map((i) => i.ultima)
    .filter(Boolean)
    .sort()
    .pop()

  const heartbeat = statusItems.find((i) => i.tabela === '__heartbeat__')
  const agentStatus = heartbeat?.status === 'OK' ? 'ONLINE' : (heartbeat?.status === 'FIREBIRD_OFFLINE' ? 'DB OFFLINE' : 'OFFLINE')
  const agentLastPing = heartbeat?.ultima

  const status =
    statusItems.length === 0
      ? 'unknown'
      : statusItems.every((i) => i.status === 'OK')
      ? 'ok'
      : 'warn'

  return { statusItems, status, lastSync, lastCheck, isSyncing, triggerSync, refresh: fetchStatus, agentStatus, agentLastPing }
}
