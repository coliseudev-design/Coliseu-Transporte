import { useEffect, useRef } from 'react'
import { setSafeElementHtml } from '../utils/sanitizeHtml'

interface SafeHtmlProps {
  html: string
  className?: string
}

export default function SafeHtml({ html, className }: SafeHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSafeElementHtml(containerRef.current, html)
  }, [html])

  return <div ref={containerRef} className={className} />
}
