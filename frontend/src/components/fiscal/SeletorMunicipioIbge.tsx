import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MapPin, Search, ChevronDown, Check, X } from 'lucide-react';

export interface MunicipioIbgeOption {
  cidade: string;
  uf: string;
  codigo_ibge: string;
  origem?: string;
}

interface SeletorMunicipioIbgeProps {
  municipios: MunicipioIbgeOption[];
  value: string;
  nomeFallback?: string;
  ufFallback?: string;
  ufPreferencial?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (mun: MunicipioIbgeOption) => void;
}

const UFS_BRASIL = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
];

function normalizarBusca(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export default function SeletorMunicipioIbge({
  municipios,
  value,
  nomeFallback = '',
  ufFallback = '',
  ufPreferencial = '',
  placeholder = 'Buscar município ou código IBGE...',
  disabled = false,
  onChange
}: SeletorMunicipioIbgeProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ufFiltro, setUfFiltro] = useState(ufPreferencial ? ufPreferencial.toUpperCase() : '');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ufPreferencial) {
      setUfFiltro(ufPreferencial.toUpperCase());
    }
  }, [ufPreferencial]);

  useEffect(() => {
    if (!aberto) return;
    const onClickFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, [aberto]);

  useEffect(() => {
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setBusca('');
    }
  }, [aberto]);

  const selecionado = useMemo(() => {
    const cleanVal = String(value || '').replace(/\D/g, '');
    if (cleanVal) {
      const achado = municipios.find(m => m.codigo_ibge === cleanVal);
      if (achado) return achado;
    }
    if (nomeFallback) {
      const alvo = normalizarBusca(nomeFallback);
      const ufAlvo = String(ufFallback || '').toUpperCase().trim();
      const porNome = municipios.find(
        m => normalizarBusca(m.cidade) === alvo && (!ufAlvo || m.uf === ufAlvo)
      );
      if (porNome) return porNome;
      return {
        cidade: nomeFallback,
        uf: ufAlvo,
        codigo_ibge: cleanVal
      };
    }
    return null;
  }, [municipios, value, nomeFallback, ufFallback]);

  const filtrados = useMemo(() => {
    if (!aberto) return [];
    const q = normalizarBusca(busca);
    const qDigits = busca.replace(/\D/g, '');
    const out: MunicipioIbgeOption[] = [];
    for (let i = 0; i < municipios.length; i++) {
      const m = municipios[i];
      if (ufFiltro && m.uf !== ufFiltro) continue;
      if (q) {
        const matchCidade = normalizarBusca(m.cidade).includes(q);
        const matchCod = qDigits.length >= 2 && m.codigo_ibge.includes(qDigits);
        if (!matchCidade && !matchCod) continue;
      }
      out.push(m);
      if (out.length >= 80) break;
    }
    return out;
  }, [aberto, municipios, ufFiltro, busca]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAberto(v => !v)}
        className="w-full px-3 py-2 text-left text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 flex items-center justify-between gap-2 transition-colors cursor-pointer"
      >
        {selecionado ? (
          <span className="flex items-center gap-2 min-w-0 truncate">
            <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
            <span className="font-semibold truncate">
              {selecionado.cidade}
              {selecionado.uf ? ` / ${selecionado.uf}` : ''}
            </span>
            {selecionado.codigo_ibge && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 shrink-0">
                {selecionado.codigo_ibge}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500 truncate">{placeholder}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {aberto && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[290px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-slate-950/50">
            <div className="flex items-center gap-1.5">
              <select
                value={ufFiltro}
                onChange={e => setUfFiltro(e.target.value)}
                aria-label="Filtrar por UF"
                className="px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Brasil (27 UFs)</option>
                {UFS_BRASIL.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>

              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  type="text"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Cidade ou IBGE (7 dígitos)..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
            {filtrados.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Nenhum município encontrado para "{busca}" {ufFiltro ? `em ${ufFiltro}` : ''}.
              </div>
            ) : (
              filtrados.map(m => {
                const ativo = m.codigo_ibge === String(value || '').replace(/\D/g, '');
                return (
                  <button
                    key={`${m.codigo_ibge}-${m.cidade}`}
                    type="button"
                    onClick={() => {
                      onChange(m);
                      setAberto(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                      ativo ? 'bg-sky-50/80 dark:bg-slate-800 font-bold text-brand-700 dark:text-sky-300' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">
                      {m.cidade} <strong className="text-slate-500 dark:text-slate-400">/ {m.uf}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {m.codigo_ibge}
                      {ativo && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
            <span>Base Oficial IBGE ({municipios.length.toLocaleString('pt-BR')} municípios)</span>
            {filtrados.length >= 80 && <span>Digite p/ refinar resultados</span>}
          </div>
        </div>
      )}
    </div>
  );
}
