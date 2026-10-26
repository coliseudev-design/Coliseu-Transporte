import React from 'react';
import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';

interface CampoFiscalProps {
    rotulo: string;
    obrigatorio?: boolean;
    erro?: string;
    dica?: string;
    children: React.ReactNode;
    className?: string;
    colSpan?: 1 | 2;
}

/** Rótulo + campo com indicação visual de obrigatoriedade e erro. */
export function CampoFiscal({ rotulo, obrigatorio, erro, dica, children, className, colSpan }: CampoFiscalProps) {
    return (
        <div className={clsx(colSpan === 2 && 'sm:col-span-2', className)}>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {rotulo}
                {obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {erro ? (
                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {erro}
                </p>
            ) : dica ? (
                <p className="text-[11px] text-slate-400 mt-1">{dica}</p>
            ) : null}
        </div>
    );
}

interface AbasFiscalProps {
    children: React.ReactNode;
    className?: string;
}

/** Container padrão dos campos dentro de uma aba do wizard. */
export function GradeCampos({ children, className }: AbasFiscalProps) {
    return (
        <div className={clsx('grid grid-cols-1 sm:grid-cols-2 gap-4', className)}>
            {children}
        </div>
    );
}

interface SelectFiscalProps {
    value: string;
    onChange: (valor: string) => void;
    opcoes: { valor: string; rotulo: string }[];
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    className?: string;
    invalido?: boolean;
}

/** Select com estilo consistente do sistema fiscal. */
export function SelectFiscal({ value, onChange, opcoes, placeholder, required, disabled, className, invalido }: SelectFiscalProps) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={clsx(
                'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border rounded-xl text-slate-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed',
                invalido ? 'border-red-400 dark:border-red-700' : 'border-slate-200 dark:border-slate-700',
                className
            )}
        >
            {placeholder && <option value="">{placeholder}</option>}
            {opcoes.map(o => (
                <option key={o.valor} value={o.valor}>{o.rotulo}</option>
            ))}
        </select>
    );
}

interface InputFiscalProps {
    type?: string;
    value: string | number;
    onChange?: (valor: string) => void;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    step?: string;
    min?: string;
    className?: string;
    invalido?: boolean;
    autoFocus?: boolean;
}

/** Input com estilo consistente do sistema fiscal. */
export function InputFiscal({
    type = 'text', value, onChange, placeholder, required, disabled,
    step, min, className, invalido, autoFocus
}: InputFiscalProps) {
    return (
        <input
            type={type}
            value={value}
            onChange={onChange ? (e => onChange(e.target.value)) : undefined}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            step={step}
            min={min}
            autoFocus={autoFocus}
            className={clsx(
                'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed',
                invalido ? 'border-red-400 dark:border-red-700' : 'border-slate-200 dark:border-slate-700',
                className
            )}
        />
    );
}

interface TextareaFiscalProps {
    value: string;
    onChange: (valor: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
}

/** Área de texto com estilo consistente. */
export function TextareaFiscal({ value, onChange, placeholder, rows = 3, className }: TextareaFiscalProps) {
    return (
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className={clsx(
                'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500',
                className
            )}
        />
    );
}

/** Máscaras de entrada frequently usadas em dados fiscais. */
export const mascaras = {
    cpfCnpj: (v: string) => {
        const d = v.replace(/\D/g, '').slice(0, 14);
        if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
        return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
    },
    placa: (v: string) => {
        const d = v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);
        return d.length <= 3 ? d : `${d.slice(0, 3)}-${d.slice(3)}`;
    },
    telefone: (v: string) => {
        const d = v.replace(/\D/g, '').slice(0, 11);
        if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    },
    moeda: (v: string) => {
        const d = v.replace(/\D/g, '').slice(0, 13);
        if (!d) return '';
        return (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    somenteDigitos: (v: string) => v.replace(/\D/g, '')
};
