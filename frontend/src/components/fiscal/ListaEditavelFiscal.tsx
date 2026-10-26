import React from 'react';
import clsx from 'clsx';
import { Plus, Trash2, X } from 'lucide-react';

interface ListaEditavelProps<T> {
    titulo: string;
    itens: T[];
    onChange: (itens: T[]) => void;
    renderItem: (item: T, indice: number, atualizar: (item: T) => void, remover: () => void) => React.ReactNode;
    novoItem: () => T;
    rotuloBotao?: string;
    vazio?: string;
    className?: string;
}

/**
 * Lista editável genérica para os blocos de composição do documento fiscal
 * (componentes do frete, contratantes, seguros, produtos predominantes).
 */
export default function ListaEditavelFiscal<T extends { id?: string | number }>({
    titulo,
    itens,
    onChange,
    renderItem,
    novoItem,
    rotuloBotao = 'Adicionar',
    vazio = 'Nenhum item adicionado.',
    className
}: ListaEditavelProps<T>) {
    const adicionar = () => {
        onChange([...itens, novoItem()]);
    };

    const atualizar = (indice: number, item: T) => {
        const novos = [...itens];
        novos[indice] = item;
        onChange(novos);
    };

    const remover = (indice: number) => {
        onChange(itens.filter((_, i) => i !== indice));
    };

    return (
        <div className={clsx('border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-800', className)}>
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{titulo}</span>
                <button
                    type="button"
                    onClick={adicionar}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {rotuloBotao}
                </button>
            </div>

            {itens.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">{vazio}</p>
            ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {itens.map((item, i) => (
                        <div key={item.id ?? i} className="p-3">
                            {renderItem(item, i, (novo) => atualizar(i, novo), () => remover(i))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Botão de remover usado dentro dos itens da lista. */
export function BotaoRemover({ onClick, titulo = 'Remover item' }: { onClick: () => void; titulo?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={titulo}
            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shrink-0"
        >
            <Trash2 className="w-3.5 h-3.5" />
        </button>
    );
}

/** Botão de remover compacto (ícone X). */
export function BotaoRemoverCompacto({ onClick, titulo = 'Remover' }: { onClick: () => void; titulo?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={titulo}
            className="p-1 text-slate-400 hover:text-red-600 transition-colors shrink-0"
        >
            <X className="w-4 h-4" />
        </button>
    );
}
