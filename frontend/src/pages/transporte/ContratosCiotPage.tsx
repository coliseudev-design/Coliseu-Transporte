import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  FileText, Plus, Route, Truck, AlertTriangle, CheckCircle2,
  Copy, Download, BadgeCheck, Info
} from 'lucide-react';

interface Contrato {
  id: number;
  contratante_nome: string;
  contratante_documento: string;
  transportador_nome: string;
  transportador_documento: string;
  transportador_rntrc: string;
  tipo_transporte: string;
  tipo_operacao: string;
  uf_inicio: string;
  uf_fim: string;
  valor_frete: number;
  valor_adiantamento: number;
  valor_pedagio: number;
  valor_combustivel: number;
  forma_quitacao: string;
  piso_minimo_antt: number;
  piso_minimo_aprovado: boolean;
  ciot_status: string;
  ciot_codigo: string;
}

const VAZIO = {
  contratante_nome: '', contratante_documento: '',
  transportador_nome: '', transportador_documento: '', transportador_rntrc: '',
  tipo_transporte: '2', tipo_operacao: 'Carga Lotacao',
  uf_inicio: '', uf_fim: '',
  valor_frete: '', valor_adiantamento: '', valor_pedagio: '', valor_combustivel: '',
  forma_quitacao: 'PIX'
};

export default function ContratosCiotPage() {
  const [editando, setEditando] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [payloadCiot, setPayloadCiot] = useState<{ id: number; payload: any } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contratos-transporte'],
    queryFn: async () => (await api.get('/transporte/contratos')).data
  });

  const contratos: Contrato[] = data?.data || [];

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      await api.post('/transporte/contratos', editando);
      setEditando(null);
      refetch();
      alert('Contrato de transporte salvo com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSalvando(false);
    }
  };

  const handleGerarCiot = async (id: number) => {
    try {
      const res = await api.post(`/transporte/contratos/${id}/gerar-ciot`);
      setPayloadCiot({ id, payload: res.data.payload });
    } catch (err: any) {
      alert('Erro ao gerar CIOT: ' + (err.response?.data?.error || err.message));
    }
  };

  const copiarPayload = () => {
    if (!payloadCiot) return;
    navigator.clipboard.writeText(JSON.stringify(payloadCiot.payload, null, 2));
    alert('Payload do CIOT copiado para a área de transferência.');
  };

  const baixarPayload = () => {
    if (!payloadCiot) return;
    const blob = new Blob([JSON.stringify(payloadCiot.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ciot-contrato-${payloadCiot.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rotuloTipo = (t: string) => (t === '1' ? 'ETC' : t === '2' ? 'TAC' : t === '3' ? 'CTC' : t);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Route className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Contratos de Transporte &amp; CIOT
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Fonte de verdade da operação de frete. Gera o payload para registro do CIOT (ANTT / Instituição de Pagamento).
          </p>
        </div>
        <button
          onClick={() => setEditando({ ...VAZIO })}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Contrato
        </button>
      </div>

      {/* Aviso sobre a responsabilidade do CIOT */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50">
        <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 dark:text-sky-200 space-y-1">
          <p className="font-semibold">O ColiseuTransporte não emite o CIOT — a emissão é da ANTT ou da Instituição de Pagamento do cliente.</p>
          <p className="text-sky-800/80 dark:text-sky-300/80">
            O sistema valida o <strong>piso mínimo de frete</strong> da ANTT (quando aplicável) e gera o payload
            JSON pronto para transmissão. Para <strong>TAC</strong>, o registro é obrigatório via Instituição de
            Pagamento; para <strong>ETC</strong>, pode ser feito direto pela API da ANTT.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando contratos...</div>
      ) : contratos.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Route className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum contrato cadastrado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Cadastre a operação de frete (contratante, transportador, valores e percurso) para
            acompanhar o CIOT e validar o piso mínimo da ANTT.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {contratos.map(c => (
            <div key={c.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate">{c.transportador_nome}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Contratante: {c.contratante_nome}
                  </p>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                  {rotuloTipo(c.tipo_transporte)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-mono font-bold text-slate-900 dark:text-white">{c.uf_inicio}</span>
                <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700 relative">
                  <Truck className="w-3.5 h-3.5 absolute left-1/2 -translate-x-1/2 -top-1.5 text-slate-400 bg-white dark:bg-slate-800 px-0.5" />
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{c.uf_fim}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 block">Frete</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    R$ {Number(c.valor_frete || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Adiantamento</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    R$ {Number(c.valor_adiantamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Pedágio</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    R$ {Number(c.valor_pedagio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Quitação</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{c.forma_quitacao}</span>
                </div>
              </div>

              {c.piso_minimo_antt !== null && c.piso_minimo_antt !== undefined && (
                <div className={`flex items-start gap-2 p-2.5 rounded-xl text-xs ${
                  c.piso_minimo_aprovado
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200'
                }`}>
                  {c.piso_minimo_aprovado
                    ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold">Piso mínimo ANTT: R$ {Number(c.piso_minimo_antt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="opacity-90">
                      {c.piso_minimo_aprovado
                        ? 'Frete acima do piso — o CIOT pode ser gerado.'
                        : 'Frete abaixo do piso — o CIOT não poderá ser gerado pela ANTT.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  c.ciot_status === 'TRANSMITIDO'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : c.ciot_status === 'GERADO'
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  CIOT: {c.ciot_codigo || c.ciot_status}
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleGerarCiot(c.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
                  >
                    <BadgeCheck className="w-3.5 h-3.5" />
                    Gerar Payload CIOT
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro */}
      {editando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 my-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-600" />
              Novo Contrato de Transporte
            </h2>

            <form onSubmit={handleSalvar} className="space-y-4 mt-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Contratante (Nome) *</label>
                  <input
                    type="text" required
                    value={editando.contratante_nome}
                    onChange={e => setEditando({ ...editando, contratante_nome: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CNPJ/CPF do Contratante *</label>
                  <input
                    type="text" required
                    value={editando.contratante_documento}
                    onChange={e => setEditando({ ...editando, contratante_documento: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Transportador (Nome) *</label>
                  <input
                    type="text" required
                    value={editando.transportador_nome}
                    onChange={e => setEditando({ ...editando, transportador_nome: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CNPJ/CPF do Transportador *</label>
                  <input
                    type="text" required
                    value={editando.transportador_documento}
                    onChange={e => setEditando({ ...editando, transportador_documento: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">RNTRC do Transportador</label>
                  <input
                    type="text"
                    value={editando.transportador_rntrc}
                    onChange={e => setEditando({ ...editando, transportador_rntrc: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Tipo de Transporte</label>
                  <select
                    value={editando.tipo_transporte}
                    onChange={e => setEditando({ ...editando, tipo_transporte: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="1">1 — ETC (Equipado com Veículo de Carga)</option>
                    <option value="2">2 — TAC (Transportador Autônomo)</option>
                    <option value="3">3 — CTC (Cooperativa de Transporte)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF de Origem *</label>
                  <input
                    type="text" required maxLength={2}
                    value={editando.uf_inicio}
                    onChange={e => setEditando({ ...editando, uf_inicio: e.target.value.toUpperCase() })}
                    className="w-24 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">UF de Destino *</label>
                  <input
                    type="text" required maxLength={2}
                    value={editando.uf_fim}
                    onChange={e => setEditando({ ...editando, uf_fim: e.target.value.toUpperCase() })}
                    className="w-24 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Frete (R$) *</label>
                  <input
                    type="number" step="0.01" required
                    value={editando.valor_frete}
                    onChange={e => setEditando({ ...editando, valor_frete: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Adiantamento</label>
                  <input
                    type="number" step="0.01"
                    value={editando.valor_adiantamento}
                    onChange={e => setEditando({ ...editando, valor_adiantamento: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Pedágio</label>
                  <input
                    type="number" step="0.01"
                    value={editando.valor_pedagio}
                    onChange={e => setEditando({ ...editando, valor_pedagio: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Combustível</label>
                  <input
                    type="number" step="0.01"
                    value={editando.valor_combustivel}
                    onChange={e => setEditando({ ...editando, valor_combustivel: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Forma de Quitação</label>
                <select
                  value={editando.forma_quitacao}
                  onChange={e => setEditando({ ...editando, forma_quitacao: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="PIX">PIX</option>
                  <option value="DEPOSITO">Depósito Bancário</option>
                  <option value="CARTAO_FRETE">Cartão Frete</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button" onClick={() => setEditando(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={salvando}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm"
                >
                  {salvando ? 'Salvando...' : 'Salvar Contrato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal do Payload CIOT */}
      {payloadCiot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-brand-600" />
              Payload do CIOT (ANTT / Instituição de Pagamento)
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Transmitir via Instituição de Pagamento do cliente ou pela API da ANTT (caso ETC).
            </p>

            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-[11px] overflow-auto max-h-96 font-mono leading-relaxed">
              {JSON.stringify(payloadCiot.payload, null, 2)}
            </pre>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={copiarPayload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar JSON
              </button>
              <button
                onClick={baixarPayload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar
              </button>
              <button
                onClick={() => setPayloadCiot(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
