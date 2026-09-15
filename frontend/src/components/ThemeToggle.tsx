import { Moon, Sun, Monitor } from 'lucide-react'
import { useThemeStore } from '../store/themeStore'
import { useState, useRef, useEffect } from 'react'

export default function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-text-secondary hover:bg-bg-secondary rounded-lg active:bg-bg-tertiary transition-colors"
        title="Alterar tema"
      >
        {theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-36 bg-bg-primary border border-border rounded-lg shadow-card-hover z-50 py-1 overflow-hidden">
          <button
            onClick={() => { setTheme('light'); setIsOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-bg-secondary ${theme === 'light' ? 'text-brand-500 font-medium' : 'text-text-secondary'}`}
          >
            <Sun size={14} /> Claro
          </button>
          <button
            onClick={() => { setTheme('dark'); setIsOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-bg-secondary ${theme === 'dark' ? 'text-brand-500 font-medium' : 'text-text-secondary'}`}
          >
            <Moon size={14} /> Escuro
          </button>
          <button
            onClick={() => { setTheme('system'); setIsOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-bg-secondary ${theme === 'system' ? 'text-brand-500 font-medium' : 'text-text-secondary'}`}
          >
            <Monitor size={14} /> Sistema
          </button>
        </div>
      )}
    </div>
  )
}
