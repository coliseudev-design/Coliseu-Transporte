import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import TabelaResponsiva from '../../components/TabelaResponsiva';
import { CampoFiscal, GradeCampos, SelectFiscal, InputFiscal, TextareaFiscal, mascaras } from '../../components/fiscal/CampoFiscal';
import {
  BadgeCheck, Search, Plus, Copy, Download, Ban, Eye, Loader2,
  AlertTriangle, CheckCircle2, FileText, X, Info
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
  forma_quitacao: string;
  piso_minimo_antt: number;
  piso_minimo_aprovado: boolean;
  ciot_status: string;
  ciot_codigo: string;
  ciot_payload_antt: any;
  created_at: string;
}

const STATUS_CIOT: Record<string, { rotulo: string; cor: string }> = {
  PENDENTE: { rotulo: 'Pendente', cor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' },
  GERADO: { rotulo: 'Payload gerado', cor: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' },
  TRANSMITIDO: { rotulo: 'Registrado na ANTT', cor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' },
  CANCELADO: { rotulo: 'Cancelado', cor: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300' }
};

export default function CiotConsultaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('TODOS');
  const [modalCriar, setModalCriar] = useState(false);
  const [modalCancelar, setModalCancelar] = useState<Contrato | null>(null);
  const [motivo, setMotivo] = useState('');
  const [payload, setPayload] = useState<{ id: number; payload: any } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [form, setForm] = useState({
    contratante_nome: '', contratante_documento: '',
    transportador_nome: '', transportador_documento: '', transportador_rntrc: '',
    tipo_transporte: '2', tipo_operacao: 'Carga Lotacao',
    uf_inicio: '', uf_fim: '',
    valor_frete: '', valor_adiantamento: '', valor_pedagio: '', valor_combustivel: '',
    forma_quitacao: 'PIX'
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ciot-consulta', search, statusFiltro],
    queryFn: async () => {
      const res = await api.get('/transporte/contratos');
      return res.data;
    }
  });

  const contratos: Contrato[] = (data?.data || []).filter((c: Contrato) => {
    if (statusFiltro !== 'TODOS' && c.ciot_status !== statusFiltro) return false;
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      c.transportador_nome?.toLowerCase().includes(t) ||
      c.contratante_nome?.toLowerCase().includes(t) ||
      c.ciot_codigo?.toLowerCase().includes(t) ||
      c.transportador_rntrc?.toLowerCase().includes(t)
    );
  });

  const criarContrato = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await api.post('/transporte/contratos', form);
      setModalCriar(false);
      refetch();
      alert('Contrato de transporte criado! Agora gere o payload do CIOT.');
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message || 'Erro ao criar contrato.');
    } finally {
      setSalvando(false);
    }
  };

  const gerarPayload = async (id: number) => {
    try {
      const res = await api.post(`/transporte/contratos/${id}/gerar-ciot`);
      setPayload({ id, payload: res.data.payload });
      refetch();
    } catch (err: any) {
      alert('Erro ao gerar CIOT: ' + (err.response?.data?.error || err.message));
    }
  };

  const registrarCodigo = async (id: number, codigo: string) => {
    try {
      await api.patch(`/transporte/contratos/${id}/ciot`, { ciot_codigo: codigo });
      setPayload(null);
      refetch();
      alert('Código do CIOT registrado com sucesso!');
    } catch (err: any) {
      alert('Erro ao registrar: ' + (err.response?.data?.error || err.message));
    }
  };

  const cancelarCiot = async () => {
    if (!modalCancelar) return;
    setSalvando(true);
    try {
      await api.post(`/transporte/contratos/${modalCancelar.id}/ciot/cancelar`, { motivo });
      setModalCancelar(null);
      setMotivo('');
      refetch();
      alert('CIOT cancelado.');
    } catch (err: any) {
      alert('Erro ao cancelar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSalvando(false);
    }
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    alert('Copiado para a área de transferência.');
  };

  const baixar = () => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ciot-contrato-${payload.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <BadgeCheck className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            Consulta de CIOT
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Operações de transporte registradas na ANTT — consulte, gere payload ou cancele.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalCriar(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Operação (CIOT)
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por transportador, contratante, código do CIOT ou RNTRC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
          />
        </div>
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          className="px-3 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
        >
          <option value="TODOS">Todos os status</option>
          <option value="PENDENTE">Pendentes</option>
          <option value="GERADO">Payload gerado</option>
          <option value="TRANSMITIDO">Registrados</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando operações...</div>
      ) : contratos.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <BadgeCheck className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma operação encontrada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Crie uma nova operação de transporte para gerar o CIOT, ou ajuste os filtros de busca.
          </p>
          <button
            onClick={() => setModalCriar(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors"
          >
            Nova Operação (CIOT)
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Operação</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Transportador</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Contratante</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Rota</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Frete</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Piso Mín.</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">CIOT</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                {contratos.map(c => {
                  const st = STATUS_CIOT[c.ciot_status] || STATUS_CIOT.PENDENTE;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {c.tipo_operacao}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {c.tipo_transporte === '1' ? 'ETC' : c.tipo_transporte === '2' ? 'TAC' : 'CTC'}
                          {c.transportador_rntrc && ` · RNTRC ${c.transportador_rntrc}`}
                        </p>
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60">
                        <p className="font-medium text-slate-900 dark:text-white truncate max-w-[150px]">{c.transportador_nome}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{c.transportador_documento}</p>
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60">
                        <p className="text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{c.contratante_nome}</p>
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {c.uf_inicio} → {c.uf_fim}
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-right font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                        R$ {Number(c.valor_frete || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60">
                        {c.piso_minimo_antt ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.piso_minimo_aprovado
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                          }`}>
                            {c.piso_minimo_aprovado
                              ? <CheckCircle2 className="w-3 h-3" />
                              : <AlertTriangle className="w-3 h-3" />}
                            R$ {Number(c.piso_minimo_antt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>
                          {st.rotulo}
                        </span>
                        {c.ciot_codigo && (
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">{c.ciot_codigo}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200 dark:border-slate-700/60 text-right whitespace-nowrap space-x-1.5">
                        {c.ciot_status === 'CANCELADO' ? (
                          <span className="text-[11px] text-slate-400">Cancelado</span>
                        ) : (
                          <>
                            <button
                              onClick={() => gerarPayload(c.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 text-[11px] font-semibold transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              Consultar
                            </button>
                            {c.ciot_codigo && (
                              <button
                                onClick={() => { setModalCancelar(c); setMotivo(''); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-100 text-[11px] font-semibold transition-colors"
                              >
                                <Ban className="w-3 h-3" />
                                Cancelar
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de criação */}
      {modalCriar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BadgeCheck className="w-5 h-5 text-violet-600" />
                  Nova Operação de Transporte (CIOT)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Dados que alimentam o payload do CIOT enviado à ANTT ou à Instituição de Pagamento.
                </p>
              </div>
              <button onClick={() => setModalCriar(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {erro && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 dark:text-red-200">{erro}</p>
              </div>
            )}

            <form onSubmit={criarContrato} className="space-y-5 text-sm">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Contratante</p>
                <GradeCampos>
                  <CampoFiscal rotulo="Nome / Razão Social" obrigatorio>
                    <InputFiscal value={form.contratante_nome} onChange={v => setForm({ ...form, contratante_nome: v })} />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CNPJ / CPF" obrigatorio>
                    <InputFiscal
                      value={form.contratante_documento}
                      onChange={v => setForm({ ...form, contratante_documento: mascaras.cpfCnpj(v) })}
                      placeholder="00.000.000/0000-00"
                    />
                  </CampoFiscal>
                </GradeCampos>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Transportador</p>
                <GradeCampos>
                  <CampoFiscal rotulo="Nome / Razão Social" obrigatorio>
                    <InputFiscal value={form.transportador_nome} onChange={v => setForm({ ...form, transportador_nome: v })} />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CNPJ / CPF" obrigatorio>
                    <InputFiscal
                      value={form.transportador_documento}
                      onChange={v => setForm({ ...form, transportador_documento: mascaras.cpfCnpj(v) })}
                      placeholder="00.000.000/0000-00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="RNTRC" dica="Obrigatório para transporte remunerado">
                    <InputFiscal
                      value={form.transportador_rntrc}
                      onChange={v => setForm({ ...form, transportador_rntrc: v.replace(/\D/g, '') })}
                      placeholder="00000000"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Tipo de Transporte" obrigatorio>
                    <SelectFiscal
                      value={form.tipo_transporte}
                      onChange={v => setForm({ ...form, tipo_transporte: v })}
                      opcoes={[
                        { valor: '1', rotulo: '1 — ETC (Empresa de Transporte)' },
                        { valor: '2', rotulo: '2 — TAC (Transportador Autônomo)' },
                        { valor: '3', rotulo: '3 — CTC (Cooperativa)' }
                      ]}
                    />
                  </CampoFiscal>
                </GradeCampos>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Percurso e Valores</p>
                <GradeCampos>
                  <CampoFiscal rotulo="UF de Origem" obrigatorio>
                    <InputFiscal
                      value={form.uf_inicio}
                      onChange={v => setForm({ ...form, uf_inicio: v.toUpperCase() })}
                      placeholder="MS"
                      className="w-24"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="UF de Destino" obrigatorio>
                    <InputFiscal
                      value={form.uf_fim}
                      onChange={v => setForm({ ...form, uf_fim: v.toUpperCase() })}
                      placeholder="SP"
                      className="w-24"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Valor do Frete" obrigatorio>
                    <InputFiscal
                      type="number" step="0.01"
                      value={form.valor_frete}
                      onChange={v => setForm({ ...form, valor_frete: v })}
                      placeholder="0,00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Adiantamento">
                    <InputFiscal
                      type="number" step="0.01"
                      value={form.valor_adiantamento}
                      onChange={v => setForm({ ...form, valor_adiantamento: v })}
                      placeholder="0,00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Pedágio">
                    <InputFiscal
                      type="number" step="0.01"
                      value={form.valor_pedagio}
                      onChange={v => setForm({ ...form, valor_pedagio: v })}
                      placeholder="0,00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Combustível">
                    <InputFiscal
                      type="number" step="0.01"
                      value={form.valor_combustivel}
                      onChange={v => setForm({ ...form, valor_combustivel: v })}
                      placeholder="0,00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Forma de Quitação" colSpan={2}>
                    <SelectFiscal
                      value={form.forma_quitacao}
                      onChange={v => setForm({ ...form, forma_quitacao: v })}
                      opcoes={[
                        { valor: 'PIX', rotulo: 'PIX' },
                        { valor: 'DEPOSITO', rotulo: 'Depósito Bancário' },
                        { valor: 'CARTAO_FRETE', rotulo: 'Cartão Frete' }
                      ]}
                    />
                  </CampoFiscal>
                </GradeCampos>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button" onClick={() => setModalCriar(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={salvando}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 shadow-sm"
                >
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Criar Operação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de cancelamento */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Cancelar CIOT
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Operação: <strong>{modalCancelar.transportador_nome}</strong> · Código {modalCancelar.ciot_codigo}
            </p>
            <CampoFiscal rotulo="Motivo do cancelamento" obrigatorio className="mt-4">
              <TextareaFiscal
                value={motivo}
                onChange={v => setMotivo(v)}
                placeholder="Descreva o motivo (mínimo 10 caracteres)..."
                rows={4}
              />
            </CampoFiscal>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button
                onClick={() => setModalCancelar(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Voltar
              </button>
              <button
                onClick={cancelarCiot}
                disabled={salvando || motivo.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                Cancelar CIOT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do payload */}
      {payload && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-600" />
              Payload do CIOT
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Envie este JSON à Instituição de Pagamento do cliente ou à API da ANTT (caso ETC).
            </p>

            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-[11px] overflow-auto max-h-72 font-mono leading-relaxed">
              {JSON.stringify(payload.payload, null, 2)}
            </pre>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <CampoFiscal rotulo="Código do CIOT retornado" dica="Cole o código recebido da ANTT ou da Instituição de Pagamento">
                <InputFiscal
                  value={(payload.payload as any)?.ciot?.codigo || ''}
                  onChange={v => setPayload({ ...payload, payload: { ...payload.payload, codigoInformado: v } })}
                  placeholder="Ex: 12345678901234"
                />
              </CampoFiscal>
              <div className="flex items-end gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(payload.payload, null, 2));
                    alert('Payload copiado!');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </button>
                <button
                  onClick={baixar}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
              <button
                onClick={() => setPayload(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  const codigo = (payload.payload as any)?.codigoInformado;
                  if (!codigo) { alert('Informe o código do CIOT retornado.'); return; }
                  registrarCodigo(payload.id, codigo);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Registrar CIOT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
