// Formatação BR
const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 })

export const formatBRL = (v: unknown) => {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return BRL.format(n)
}

export const formatBRLCompact = (v: unknown) => {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { 
    notation: "compact", 
    compactDisplay: "short", 
    style: 'currency', 
    currency: 'BRL',
    maximumFractionDigits: 1
  }).format(n)
}

export const formatNum = (v: unknown) => NUM.format(Number(v ?? 0))

export const formatPct = (v: unknown, asDecimal = false) => {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return '0%'
  return asDecimal ? PCT.format(n) : `${n.toFixed(2).replace('.', ',')}%`
}

export const formatDate = (v: unknown) => {
  if (!v) return '—'
  try {
    const s = String(v).trim()
    const parts = s.split(/[T ]/)
    const datePart = parts[0]

    if (datePart.includes('-')) {
      const [y, m, d] = datePart.split('-')
      if (y && m && d) return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
    } else if (datePart.includes('/')) {
      const [d, m, y] = datePart.split('/')
      if (d && m && y) return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
    }

    const dt = new Date(s.replace(' ', 'T'))
    if (!isNaN(dt.getTime())) {
      const iso = dt.toISOString().split('T')[0]
      const [y, m, d] = iso.split('-')
      return `${d}/${m}/${y}`
    }
    return String(v)
  } catch {
    return String(v)
  }
}

export const formatDateTime = (v: unknown) => {
  if (!v) return '—'
  try {
    const d = new Date(String(v).replace(' ', 'T'))
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return String(v)
  }
}

// Formatar apenas hora
export const formatHour = (h: number) => String(h).padStart(2, '0') + 'h'
