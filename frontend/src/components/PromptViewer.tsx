import { Copy, Sparkles, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface PromptViewerProps {
  title: string;
  description: string;
  prompt: string;
}

export function PromptViewer({ title, description, prompt }: PromptViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-bg-primary border border-brand-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)] rounded-xl overflow-hidden flex flex-col mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gradient-to-r from-brand-500/10 to-cyan-500/10 p-5 border-b border-brand-500/20 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-brand-500 text-lg flex items-center gap-2">
            <Sparkles size={20} className="text-brand-500" /> {title}
          </h3>
          <p className="text-sm text-text-secondary mt-1">{description}</p>
        </div>
        <button 
          onClick={handleCopy}
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors shadow-lg"
        >
          {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
          {copied ? 'Copiado!' : 'Copiar Prompt para IA'}
        </button>
      </div>
      <div className="p-6 bg-[#0f111a]">
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
          {prompt}
        </pre>
      </div>
    </div>
  );
}
