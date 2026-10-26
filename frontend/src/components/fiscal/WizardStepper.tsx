import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';

interface WizardStepperProps {
    steps: { id: string; label: string; icone?: React.ComponentType<{ className?: string }> }[];
    atual: number;
    visitados: Set<string>;
    errosPorPasso: Record<string, string[]>;
    onIrPara: (indice: number) => void;
}

/**
 * Stepper horizontal do wizard fiscal.
 * Mostra progresso,visited state, e bloqueia o avanço quando há erros.
 */
export default function WizardStepper({ steps, atual, visitados, errosPorPasso, onIrPara }: WizardStepperProps) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 px-4 py-3.5 overflow-x-auto">
            <ol className="flex items-center gap-1 min-w-max">
                {steps.map((step, i) => {
                    const Icon = step.icone;
                    const ehAtual = i === atual;
                    const concluido = i < atual && visitados.has(step.id);
                    const visitou = visitados.has(step.id);
                    const erros = errosPorPasso[step.id] || [];
                    const temErro = erros.length > 0;

                    return (
                        <li key={step.id} className="flex items-center">
                            {i > 0 && (
                                <div className={clsx(
                                    'w-8 h-px mx-1 transition-colors',
                                    concluido ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'
                                )} />
                            )}
                            <button
                                type="button"
                                onClick={() => (visitou || concluido) && onIrPara(i)}
                                disabled={!visitou && !concluido}
                                className={clsx(
                                    'group flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer',
                                    ehAtual && 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm',
                                    !ehAtual && concluido && 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
                                    !ehAtual && !concluido && visitou && 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700',
                                    !ehAtual && !visitou && 'text-slate-400 dark:text-slate-500 cursor-default'
                                )}
                            >
                                <span className={clsx(
                                    'w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 transition-colors',
                                    ehAtual && 'bg-white/20 dark:bg-slate-900/10',
                                    concluido && 'bg-emerald-500 text-white',
                                    !ehAtual && !concluido && visitou && 'bg-slate-100 dark:bg-slate-700',
                                    !ehAtual && !visitou && 'bg-slate-100 dark:bg-slate-800'
                                )}>
                                    {concluido ? <Check className="w-3.5 h-3.5" /> : (Icon ? <Icon className="w-3.5 h-3.5" /> : i + 1)}
                                </span>
                                <span className="text-xs font-bold whitespace-nowrap">{step.label}</span>
                                {temErro && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title={erros.join(' · ')} />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
