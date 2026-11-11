import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  MapPin, Plus, Trash2, Save, X, Search, CheckCircle2,
  AlertTriangle, Loader2, Edit3, Layers
} from 'lucide-react';

export interface CidadeRegiao {
  municipio: string;
  uf: string;
  codigo_ibge?: string;
}

export interface RegiaoEntregaCustom {
  id: number;
  nome: string;
  cor: string;
  uf_padrao: string;
  cidades: CidadeRegiao[];
  descricao?: string;
  ativo: boolean;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onAtualizado?: () => void;
}

const CORES_ROTAS = [
  { hex: '#0284c7', nome: 'Azul Rota' },
  { hex: '#059669', nome: 'Verde Frota' },
  { hex: '#d97706', nome: 'Âmbar Expresso' },
  { hex: '#0d9488', nome: 'Teal Regional' },
  { hex: '#2563eb', nome: 'Azul Royal' },
  { hex: '#e11d48', nome: 'Vermelho Urgente' }
];

const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export default function GerenciadorRegioesModal({ aberto, onFechar, onAtualizado }: Props) {
  const qc = useQueryClient();
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [ufPadrao, setUfPadrao] = useState('MS');
  const [cor, setCor] = useState('#0284c7');
  const [descricao, setDescricao] = useState('');
  const [cidadesSelecionadas, setCidadesSelecionadas] = useState<CidadeRegiao[]>([]);
  const [buscaCidade, setBuscaCidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const { data: regData, isLoading, refetch } = useQuery({
    queryKey: ['regioes-entrega'],
    queryFn: async () => (await api.get('/transporte/regioes-entrega')).data,
    enabled: aberto
  });

  const { data: munData } = useQuery({
    queryKey: ['municipios-busca-regiao', ufPadrao, buscaCidade],
    queryFn: async () =>
      (
        await api.get('/transporte/municipios', {
          params: { uf: ufPadrao, search: buscaCidade || undefined }
        })
      ).data,
    enabled: aberto
  });

  const regioesCustom: RegiaoEntregaCustom[] = regData?.data?.regioes_customizadas || [];
  const regioesErp: Array<{ nome: string; qtd_cidades: number; cidades: string[] }> =
    regData?.data?.regioes_erp || [];
  const cidadesCargas: Array<{
    municipio: string;
    uf: string;
    codigo_ibge?: string;
    regiao_atual?: string;
    pendentes: number;
    total: number;
  }> = regData?.data?.cidades_cargas || [];
  const municipiosIbge: Array<{ cidade: string; uf: string; codigo_ibge: string }> =
    munData?.data || [];

  const limparFormulario = () => {
    setEditandoId(null);
    setNome('');
    setUfPadrao('MS');
    setCor('#0284c7');
    setDescricao('');
    setCidadesSelecionadas([]);
    setBuscaCidade('');
    setErro(null);
  };

  const carregarParaEdicao = (reg: RegiaoEntregaCustom) => {
    setEditandoId(reg.id);
    setNome(reg.nome);
    setUfPadrao(reg.uf_padrao || 'MS');
    setCor(reg.cor || '#0284c7');
    setDescricao(reg.descricao || '');
    setCidadesSelecionadas(Array.isArray(reg.cidades) ? reg.cidades : []);
    setErro(null);
    setSucesso(null);
  };

  const clonarRegiaoErp = (regErp: { nome: string; cidades: string[] }) => {
    setEditandoId(null);
    setNome(regErp.nome);
    setUfPadrao('MS');
    setCor('#059669');
    setDescricao('Importada do cadastro de regiões do ERP');
    setCidadesSelecionadas(
      (regErp.cidades || []).map((c) => ({
        municipio: c,
        uf: 'MS'
      }))
    );
    setErro(null);
    setSucesso(null);
  };

  const jaSelecionada = (mun: string, uf: string) =>
    cidadesSelecionadas.some(
      (c) =>
        c.municipio.trim().toUpperCase() === mun.trim().toUpperCase() &&
        (c.uf || ufPadrao).toUpperCase() === (uf || ufPadrao).toUpperCase()
    );

  const alternarCidade = (cid: CidadeRegiao) => {
    if (jaSelecionada(cid.municipio, cid.uf)) {
      setCidadesSelecionadas((prev) =>
        prev.filter(
          (c) =>
            !(
              c.municipio.trim().toUpperCase() === cid.municipio.trim().toUpperCase() &&
              (c.uf || ufPadrao).toUpperCase() === (cid.uf || ufPadrao).toUpperCase()
            )
        )
      );
    } else {
      setCidadesSelecionadas((prev) => [
        ...prev,
        {
          municipio: cid.municipio.trim(),
          uf: (cid.uf || ufPadrao).toUpperCase(),
          codigo_ibge: cid.codigo_ibge
        }
      ]);
    }
  };

  const sugestoesCidades = useMemo(() => {
    const termo = buscaCidade.trim().toUpperCase();
    return municipiosIbge
      .filter((m) => !jaSelecionada(m.cidade, m.uf))
      .filter((m) => !termo || m.cidade.toUpperCase().includes(termo) || String(m.codigo_ibge || '').includes(termo))
      .slice(0, 24);
  }, [municipiosIbge, buscaCidade, cidadesSelecionadas, ufPadrao]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErro('Informe o nome da Região ou Rota de Entrega.');
      return;
    }
    if (cidadesSelecionadas.length === 0) {
      setErro('Adicione ao menos 1 município à região de entrega.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const body = {
        nome: nome.trim(),
        cor,
        uf_padrao: ufPadrao,
        descricao: descricao.trim() || undefined,
        cidades: cidadesSelecionadas
      };
      if (editandoId) {
        await api.put(`/transporte/regioes-entrega/${editandoId}`, body);
      } else {
        await api.post('/transporte/regioes-entrega', body);
      }
      await refetch();
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['seletor-cargas-erp'] });
      onAtualizado?.();
      setSucesso(
        `Região "${nome.trim()}" salva e aplicada automaticamente às NF-es desses municípios!`
      );
      limparFormulario();
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message || 'Erro ao salvar região.');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: number, nomeReg: string) => {
    if (!window.confirm(`Deseja remover a região "${nomeReg}"? As NF-es não serão apagadas.`)) {
      return;
    }
    try {
      await api.delete(`/transporte/regioes-entrega/${id}`);
      await refetch();
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['seletor-cargas-erp'] });
      onAtualizado?.();
      if (editandoId === id) limparFormulario();
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message || 'Erro ao remover região.');
    }
  };

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-regioes"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <h2 id="titulo-modal-regioes" className="text-sm font-bold tracking-tight">
                Regiões e Rotas de Entrega (Filtro Inteligente de NF-es para MDF-e e CT-e)
              </h2>
              <p className="text-[11px] text-slate-300">
                Agrupe municípios em rotas operacionais (ex.: Grande Dourados, Rota Sul, Fronteira) para selecionar NF-es em 1 clique.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar gerenciador de regiões"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna Esquerda: Regiões Cadastradas + Regiões do ERP */}
          <div className="lg:col-span-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Rotas / Regiões Configuradas ({regioesCustom.length})
                </h3>
                {editandoId && (
                  <button
                    type="button"
                    onClick={limparFormulario}
                    className="text-[11px] font-semibold text-sky-600 hover:underline"
                  >
                    + Nova Região
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
                  Carregando regiões...
                </div>
              ) : regioesCustom.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                  Nenhuma rota personalizada criada ainda. Use o painel ao lado para agrupar municípios (ex.: Dourados, Maracaju, Itaporã).
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {regioesCustom.map((reg) => (
                    <div
                      key={reg.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        editandoId === reg.id
                          ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: reg.cor || '#0284c7' }}
                          />
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {reg.nome}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => carregarParaEdicao(reg)}
                            title="Editar região"
                            aria-label={`Editar região ${reg.nome}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExcluir(reg.id, reg.nome)}
                            title="Remover região"
                            aria-label={`Remover região ${reg.nome}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(reg.cidades || []).map((c, idx) => (
                          <span
                            key={`${c.municipio}-${idx}`}
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            {c.municipio}/{c.uf}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {regioesErp.length > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                  Regiões Vindas do ERP ({regioesErp.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                  Detectadas automaticamente do cadastro do ERP. Já aparecem no filtro de notas; clique em Personalizar se quiser ajustar cidades.
                </p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {regioesErp.map((re) => (
                    <div
                      key={re.nome}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                          {re.nome}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {re.qtd_cidades} município(s) no ERP
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => clonarRegiaoErp(re)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                      >
                        Personalizar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coluna Direita: Editor de Região */}
          <form onSubmit={handleSalvar} className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                {editandoId ? 'Editar Região / Rota de Entrega' : 'Criar Nova Região / Rota de Entrega'}
              </h3>

              {erro && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}

              {sucesso && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{sucesso}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Região / Rota *
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Grande Dourados, Rota Sul Fronteira..."
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    UF Base
                  </label>
                  <select
                    value={ufPadrao}
                    onChange={(e) => setUfPadrao(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {UFS_BRASIL.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cor da Etiqueta
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {CORES_ROTAS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setCor(c.hex)}
                        title={c.nome}
                        aria-label={c.nome}
                        className={`w-6 h-6 rounded-full transition-transform ${
                          cor === c.hex ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : ''
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Cidades com NF-es emitidas no ERP para marcação rápida */}
              {cidadesCargas.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Cidades com NF-es sincronizadas do ERP (Clique para incluir/remover)
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {cidadesCargas.map((cid) => {
                      const ativa = jaSelecionada(cid.municipio, cid.uf);
                      return (
                        <button
                          key={`${cid.municipio}-${cid.uf}`}
                          type="button"
                          onClick={() =>
                            alternarCidade({
                              municipio: cid.municipio,
                              uf: cid.uf,
                              codigo_ibge: cid.codigo_ibge
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            ativa
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                          }`}
                        >
                          <span>
                            {cid.municipio}/{cid.uf}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] ${
                              ativa
                                ? 'bg-white/20 text-white'
                                : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {cid.pendentes} pend.
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Busca IBGE de qualquer município */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Buscar e adicionar outros municípios ({ufPadrao} / IBGE)
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={buscaCidade}
                    onChange={(e) => setBuscaCidade(e.target.value)}
                    placeholder={`Digite o nome da cidade em ${ufPadrao} ou código IBGE...`}
                    className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                {sugestoesCidades.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {sugestoesCidades.map((m) => (
                      <button
                        key={`${m.cidade}-${m.uf}`}
                        type="button"
                        onClick={() =>
                          alternarCidade({
                            municipio: m.cidade,
                            uf: m.uf,
                            codigo_ibge: m.codigo_ibge
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-950/60 text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <Plus className="w-3 h-3 text-sky-600" />
                        {m.cidade}/{m.uf}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cidades selecionadas na região */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Municípios nesta Região ({cidadesSelecionadas.length})
                  </span>
                  {cidadesSelecionadas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCidadesSelecionadas([])}
                      className="text-[11px] text-slate-500 hover:text-red-600"
                    >
                      Limpar cidades
                    </button>
                  )}
                </div>
                <div className="min-h-[52px] p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5">
                  {cidadesSelecionadas.length === 0 ? (
                    <span className="text-xs text-slate-400">
                      Clique nas cidades acima para compor a região de entrega.
                    </span>
                  ) : (
                    cidadesSelecionadas.map((c) => (
                      <span
                        key={`${c.municipio}-${c.uf}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800"
                      >
                        {c.municipio}/{c.uf}
                        <button
                          type="button"
                          onClick={() => alternarCidade(c)}
                          aria-label={`Remover ${c.municipio}`}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {editandoId && (
                  <button
                    type="button"
                    onClick={limparFormulario}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  >
                    Cancelar Edição
                  </button>
                )}
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
                >
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editandoId ? 'Atualizar Região' : 'Salvar Região de Entrega'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
