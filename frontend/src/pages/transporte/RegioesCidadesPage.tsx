import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import SeletorMunicipioIbge, { MunicipioIbgeOption } from '../../components/fiscal/SeletorMunicipioIbge';
import {
  MapPin,
  Search,
  Layers,
  Plus,
  Copy,
  Check,
  Trash2,
  Edit3,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  Route
} from 'lucide-react';

const UFS_BRASIL = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
];

const CORES_ROTAS = [
  { hex: '#0284c7', nome: 'Azul Rota' },
  { hex: '#059669', nome: 'Verde Frota' },
  { hex: '#d97706', nome: 'Âmbar Expresso' },
  { hex: '#0d9488', nome: 'Teal Regional' },
  { hex: '#2563eb', nome: 'Azul Royal' },
  { hex: '#e11d48', nome: 'Vermelho Urgente' }
];

interface MunicipioCatalogo extends MunicipioIbgeOption {
  id_regiao_local?: number;
  codigo_local?: number;
  distrito?: string;
  localizacao?: string;
}

interface CidadeRegiao {
  municipio: string;
  uf: string;
  codigo_ibge?: string;
}

interface RegiaoEntregaCustom {
  id: number;
  nome: string;
  cor: string;
  uf_padrao: string;
  cidades: CidadeRegiao[];
  descricao?: string;
  ativo: boolean;
}

const PAGE_SIZE = 50;

function normalizarBusca(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export default function RegioesCidadesPage() {
  const qc = useQueryClient();
  const [abaAtiva, setAbaAtiva] = useState<'ibge' | 'rotas'>('ibge');

  // Filtros Catálogo IBGE
  const [ufSelecionada, setUfSelecionada] = useState<string>('');
  const [buscaIbge, setBuscaIbge] = useState('');
  const [apenasPersonalizados, setApenasPersonalizados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [copiadoCodigo, setCopiadoCodigo] = useState<string | null>(null);

  // Modal Distrito / Localidade Extra (dash_regioes)
  const [modalLocalidadeOpen, setModalLocalidadeOpen] = useState(false);
  const [localidadeForm, setLocalidadeForm] = useState({
    id: null as number | null,
    codigo: '',
    cidade: '',
    uf: 'MS',
    cod_ibge: '',
    distrito: '',
    localizacao: ''
  });
  const [salvandoLocalidade, setSalvandoLocalidade] = useState(false);

  // Editor de Regiões / Rotas de Entrega (dash_transporte_regioes)
  const [editandoRotaId, setEditandoRotaId] = useState<number | null>(null);
  const [nomeRota, setNomeRota] = useState('');
  const [ufPadraoRota, setUfPadraoRota] = useState('MS');
  const [corRota, setCorRota] = useState('#0284c7');
  const [descricaoRota, setDescricaoRota] = useState('');
  const [cidadesRota, setCidadesRota] = useState<CidadeRegiao[]>([]);
  const [salvandoRota, setSalvandoRota] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // 1. Consulta Base Nacional Completa IBGE (5.571 municípios + distritos locais)
  const { data: munResp, isLoading: loadingMun } = useQuery({
    queryKey: ['catalogo-ibge-completo'],
    queryFn: async () => (await api.get('/transporte/municipios', { params: { limit: 6000 } })).data,
    staleTime: 5 * 60 * 1000
  });

  // 2. Consulta Regiões / Rotas de Entrega
  const { data: rotasResp, isLoading: loadingRotas } = useQuery({
    queryKey: ['regioes-entrega'],
    queryFn: async () => (await api.get('/transporte/regioes-entrega')).data
  });

  const todosMunicipios: MunicipioCatalogo[] = munResp?.data || [];
  const contagemPorUf: Record<string, number> = munResp?.por_uf || {};
  const totalBrasil: number = munResp?.total_brasil || todosMunicipios.length;

  const regioesCustom: RegiaoEntregaCustom[] = rotasResp?.data?.regioes_customizadas || [];
  const regioesErp: Array<{ nome: string; qtd_cidades: number; cidades: string[] }> =
    rotasResp?.data?.regioes_erp || [];

  // Mapa rápido codigo_ibge -> rotas vinculadas
  const rotasPorIbge = useMemo(() => {
    const map = new Map<string, Array<{ nome: string; cor: string }>>();
    for (const r of regioesCustom) {
      for (const c of r.cidades || []) {
        const key = c.codigo_ibge || `${normalizarBusca(c.municipio)}|${c.uf}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ nome: r.nome, cor: r.cor || '#0284c7' });
      }
    }
    return map;
  }, [regioesCustom]);

  const totalPersonalizados = useMemo(
    () => todosMunicipios.filter(m => m.origem === 'PERSONALIZADO' || m.id_regiao_local).length,
    [todosMunicipios]
  );

  const municipiosFiltrados = useMemo(() => {
    const q = normalizarBusca(buscaIbge);
    const qDigits = buscaIbge.replace(/\D/g, '');
    return todosMunicipios.filter(m => {
      if (ufSelecionada && m.uf !== ufSelecionada) return false;
      if (apenasPersonalizados && m.origem !== 'PERSONALIZADO' && !m.id_regiao_local) return false;
      if (q) {
        const matchNome = normalizarBusca(m.cidade).includes(q);
        const matchCod = qDigits.length >= 2 && String(m.codigo_ibge || '').includes(qDigits);
        const matchLoc = m.localizacao ? normalizarBusca(m.localizacao).includes(q) : false;
        if (!matchNome && !matchCod && !matchLoc) return false;
      }
      return true;
    });
  }, [todosMunicipios, ufSelecionada, buscaIbge, apenasPersonalizados]);

  const totalPaginas = Math.max(1, Math.ceil(municipiosFiltrados.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginaItens = useMemo(
    () => municipiosFiltrados.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE),
    [municipiosFiltrados, paginaSegura]
  );

  const copiarIbge = (cod: string) => {
    if (!cod) return;
    navigator.clipboard.writeText(cod);
    setCopiadoCodigo(cod);
    setTimeout(() => setCopiadoCodigo(null), 1600);
  };

  const invalidarTudo = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['catalogo-ibge-completo'] }),
      qc.invalidateQueries({ queryKey: ['municipios-wizard'] }),
      qc.invalidateQueries({ queryKey: ['municipios-mdfe'] }),
      qc.invalidateQueries({ queryKey: ['municipios-transporte'] }),
      qc.invalidateQueries({ queryKey: ['regioes-entrega'] })
    ]);
  };

  const abrirNovaLocalidade = () => {
    setLocalidadeForm({
      id: null,
      codigo: '',
      cidade: '',
      uf: ufSelecionada || 'MS',
      cod_ibge: '',
      distrito: '',
      localizacao: ''
    });
    setModalLocalidadeOpen(true);
  };

  const salvarLocalidadeExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localidadeForm.cidade || !localidadeForm.cod_ibge) {
      setFeedback({ ok: false, msg: 'Selecione o município oficial do IBGE antes de salvar o distrito/localidade.' });
      return;
    }
    setSalvandoLocalidade(true);
    setFeedback(null);
    try {
      const payload = {
        codigo: localidadeForm.codigo ? Number(localidadeForm.codigo) : undefined,
        cidade: localidadeForm.cidade,
        uf: localidadeForm.uf,
        cod_ibge: localidadeForm.cod_ibge,
        distrito: localidadeForm.distrito || localidadeForm.cidade,
        localizacao: localidadeForm.localizacao
      };
      if (localidadeForm.id) {
        await api.put(`/cadastros/regioes/${localidadeForm.id}`, payload);
      } else {
        await api.post('/cadastros/regioes', payload);
      }
      await invalidarTudo();
      setModalLocalidadeOpen(false);
      setFeedback({ ok: true, msg: 'Distrito / localidade vinculada ao código IBGE com sucesso!' });
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.response?.data?.error || 'Erro ao salvar localidade.' });
    } finally {
      setSalvandoLocalidade(false);
    }
  };

  const excluirLocalidadeExtra = async (idLocal: number) => {
    if (!confirm('Remover este distrito/localidade personalizada? (O município oficial do IBGE permanece intacto).')) return;
    try {
      await api.delete(`/cadastros/regioes/${idLocal}`);
      await invalidarTudo();
      setFeedback({ ok: true, msg: 'Localidade personalizada removida.' });
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.response?.data?.error || 'Erro ao remover localidade.' });
    }
  };

  const limparFormRota = () => {
    setEditandoRotaId(null);
    setNomeRota('');
    setUfPadraoRota('MS');
    setCorRota('#0284c7');
    setDescricaoRota('');
    setCidadesRota([]);
  };

  const carregarRotaParaEdicao = (r: RegiaoEntregaCustom) => {
    setEditandoRotaId(r.id);
    setNomeRota(r.nome);
    setUfPadraoRota(r.uf_padrao || 'MS');
    setCorRota(r.cor || '#0284c7');
    setDescricaoRota(r.descricao || '');
    setCidadesRota(Array.isArray(r.cidades) ? r.cidades : []);
    setAbaAtiva('rotas');
  };

  const enviarCidadeParaNovaRota = (m: MunicipioCatalogo) => {
    const baseNome = (m as any).municipio_base || m.cidade;
    const jaTem = cidadesRota.some(c => c.codigo_ibge === m.codigo_ibge);
    if (!jaTem) {
      setCidadesRota(prev => [
        ...prev,
        { municipio: baseNome, uf: m.uf, codigo_ibge: m.codigo_ibge }
      ]);
    }
    if (!ufPadraoRota) setUfPadraoRota(m.uf);
    setAbaAtiva('rotas');
  };

  const salvarRotaEntrega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeRota.trim()) {
      setFeedback({ ok: false, msg: 'Informe o nome da Região / Rota de Entrega.' });
      return;
    }
    if (cidadesRota.length === 0) {
      setFeedback({ ok: false, msg: 'Adicione ao menos 1 município do IBGE na rota.' });
      return;
    }
    setSalvandoRota(true);
    setFeedback(null);
    try {
      const body = {
        nome: nomeRota.trim(),
        uf_padrao: ufPadraoRota,
        cor: corRota,
        descricao: descricaoRota.trim() || undefined,
        cidades: cidadesRota,
        ativo: true
      };
      if (editandoRotaId) {
        await api.put(`/transporte/regioes-entrega/${editandoRotaId}`, body);
      } else {
        await api.post('/transporte/regioes-entrega', body);
      }
      await invalidarTudo();
      limparFormRota();
      setFeedback({ ok: true, msg: 'Região / Rota de Entrega salva com códigos IBGE validados!' });
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.response?.data?.error || 'Erro ao salvar rota de entrega.' });
    } finally {
      setSalvandoRota(false);
    }
  };

  const excluirRotaEntrega = async (id: number) => {
    if (!confirm('Deseja excluir esta Região / Rota de Entrega?')) return;
    try {
      await api.delete(`/transporte/regioes-entrega/${id}`);
      await invalidarTudo();
      if (editandoRotaId === id) limparFormRota();
      setFeedback({ ok: true, msg: 'Região de entrega removida.' });
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.response?.data?.error || 'Erro ao remover região.' });
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Cabeçalho Operacional */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-brand-600/10 dark:bg-sky-500/15 border border-brand-600/20 flex items-center justify-center shrink-0">
            <Route className="w-5 h-5 text-brand-600 dark:text-sky-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Cidades (IBGE Nacional) &amp; Regiões de Entrega
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                100% Brasil · Padrão SEFAZ
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Base oficial completa com todos os {totalBrasil.toLocaleString('pt-BR')} municípios brasileiros e códigos IBGE de 7 dígitos para emissão de CT-e 4.00, MDF-e 3.00 e CIOT.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 xl:pl-5 xl:border-l border-slate-200 dark:border-slate-700">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Municípios IBGE</span>
            <span className="text-sm font-black font-mono text-slate-900 dark:text-white tabular-nums">
              {totalBrasil.toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Estados (UFs)</span>
            <span className="text-sm font-black font-mono text-slate-900 dark:text-white tabular-nums">
              27
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Rotas Ativas</span>
            <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {regioesCustom.length}
            </span>
          </div>
          <button
            type="button"
            onClick={abrirNovaLocalidade}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-500 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Distrito / Localidade Extra
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between gap-3 p-3.5 rounded-xl text-xs font-medium ${
            feedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navegação de Abas */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbaAtiva('ibge')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === 'ibge'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Catálogo Oficial IBGE — Brasil ({totalBrasil.toLocaleString('pt-BR')} Cidades)
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('rotas')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === 'rotas'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          Regiões &amp; Rotas de Entrega ({regioesCustom.length})
          {cidadesRota.length > 0 && abaAtiva !== 'rotas' && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
              {cidadesRota.length} na fila
            </span>
          )}
        </button>
      </div>

      {/* ═══ ABA 1: CATÁLOGO OFICIAL IBGE (5.571 MUNICÍPIOS) ═══ */}
      {abaAtiva === 'ibge' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            {/* Faixa rápida das 27 UFs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setUfSelecionada('');
                  setPagina(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  ufSelecionada === ''
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Brasil ({totalBrasil.toLocaleString('pt-BR')})
              </button>
              {UFS_BRASIL.map(uf => {
                const ativa = ufSelecionada === uf;
                const qtd = contagemPorUf[uf] || 0;
                return (
                  <button
                    key={uf}
                    type="button"
                    onClick={() => {
                      setUfSelecionada(ativa ? '' : uf);
                      setPagina(1);
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                      ativa
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title={`${uf}: ${qtd} municípios oficiais IBGE`}
                  >
                    {uf} <span className="opacity-70 text-[10px]">({qtd})</span>
                  </button>
                );
              })}
            </div>

            {/* Busca instantânea */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={buscaIbge}
                  onChange={e => {
                    setBuscaIbge(e.target.value);
                    setPagina(1);
                  }}
                  placeholder="Pesquisar qualquer cidade do Brasil por nome ou código IBGE de 7 dígitos (ex: Dourados, São Paulo, 4200051)..."
                  className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {buscaIbge && (
                  <button
                    type="button"
                    onClick={() => {
                      setBuscaIbge('');
                      setPagina(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {totalPersonalizados > 0 && (
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={apenasPersonalizados}
                    onChange={e => {
                      setApenasPersonalizados(e.target.checked);
                      setPagina(1);
                    }}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Apenas distritos extras ({totalPersonalizados})
                </label>
              )}
            </div>
          </div>

          {/* Tabela Paginada de Municípios */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
            {loadingMun ? (
              <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando base nacional oficial do IBGE...
              </div>
            ) : paginaItens.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                Nenhum município encontrado com os filtros informados.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/70 dark:border-slate-700/70">
                      <tr>
                        <th className="px-4 py-3 w-36">Código IBGE</th>
                        <th className="px-4 py-3">Município Oficial / Distrito</th>
                        <th className="px-4 py-3 w-20">UF</th>
                        <th className="px-4 py-3">Rotas de Entrega</th>
                        <th className="px-4 py-3 w-40">Origem</th>
                        <th className="px-4 py-3 text-right w-44">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      {paginaItens.map((m, idx) => {
                        const rotasVinc = rotasPorIbge.get(m.codigo_ibge) || [];
                        return (
                          <tr
                            key={`${m.codigo_ibge}-${m.cidade}-${idx}`}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                              <button
                                type="button"
                                onClick={() => copiarIbge(m.codigo_ibge)}
                                title="Clique para copiar o código IBGE de 7 dígitos"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <span>{m.codigo_ibge || '—'}</span>
                                {copiadoCodigo === m.codigo_ibge ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-400" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {m.cidade}
                              </span>
                              {m.localizacao && (
                                <span className="ml-2 text-[11px] text-slate-500">
                                  · {m.localizacao}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                                {m.uf}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {rotasVinc.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {rotasVinc.map(r => (
                                    <span
                                      key={r.nome}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800"
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: r.cor }}
                                      />
                                      {r.nome}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {m.origem === 'PERSONALIZADO' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                                  Distrito Local
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  Oficial IBGE
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => enviarCidadeParaNovaRota(m)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-semibold transition-colors cursor-pointer"
                                  title="Incluir este município em uma Região / Rota de Entrega"
                                >
                                  <Plus className="w-3 h-3" />
                                  Incluir em Rota
                                </button>
                                {m.origem === 'PERSONALIZADO' && m.id_regiao_local && (
                                  <button
                                    type="button"
                                    onClick={() => excluirLocalidadeExtra(m.id_regiao_local!)}
                                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                    title="Remover distrito personalizado"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé de Paginação */}
                <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    Exibindo{' '}
                    <strong>
                      {((paginaSegura - 1) * PAGE_SIZE + 1).toLocaleString('pt-BR')}–
                      {Math.min(paginaSegura * PAGE_SIZE, municipiosFiltrados.length).toLocaleString('pt-BR')}
                    </strong>{' '}
                    de <strong>{municipiosFiltrados.length.toLocaleString('pt-BR')}</strong> municípios
                    {ufSelecionada ? ` em ${ufSelecionada}` : ' no Brasil'}
                  </span>

                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={paginaSegura <= 1}
                      onClick={() => setPagina(p => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 font-semibold cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Anterior
                    </button>
                    <span className="px-2.5 font-mono font-bold">
                      Pág. {paginaSegura} / {totalPaginas}
                    </span>
                    <button
                      type="button"
                      disabled={paginaSegura >= totalPaginas}
                      onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 font-semibold cursor-pointer"
                    >
                      Próxima
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ ABA 2: REGIÕES & ROTAS DE ENTREGA ═══ */}
      {abaAtiva === 'rotas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Formulário de Criação / Edição de Rota */}
          <form
            onSubmit={salvarRotaEntrega}
            className="lg:col-span-5 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-4 self-start"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-600" />
                {editandoRotaId ? 'Editar Região / Rota de Entrega' : 'Nova Região / Rota de Entrega'}
              </h2>
              {editandoRotaId && (
                <button
                  type="button"
                  onClick={limparFormRota}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Região / Rota *
                </label>
                <input
                  type="text"
                  required
                  value={nomeRota}
                  onChange={e => setNomeRota(e.target.value)}
                  placeholder="Ex: Rota Sul MS, Grande São Paulo..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  UF Base
                </label>
                <select
                  value={ufPadraoRota}
                  onChange={e => setUfPadraoRota(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {UFS_BRASIL.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Cor de Identificação na Central de Cargas
              </label>
              <div className="flex flex-wrap gap-2">
                {CORES_ROTAS.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setCorRota(c.hex)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                      corRota === c.hex
                        ? 'border-slate-900 dark:border-white ring-2 ring-slate-400/30 font-bold'
                        : 'border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.hex }} />
                    {c.nome}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Adicionar Município do Catálogo IBGE (5.571 cidades)
              </label>
              <SeletorMunicipioIbge
                municipios={todosMunicipios}
                value=""
                ufPreferencial={ufPadraoRota}
                placeholder="Pesquise e clique p/ incluir cidade na rota..."
                onChange={m => {
                  if (!cidadesRota.some(x => x.codigo_ibge === m.codigo_ibge)) {
                    setCidadesRota(prev => [
                      ...prev,
                      { municipio: m.cidade, uf: m.uf, codigo_ibge: m.codigo_ibge }
                    ]);
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Municípios na Rota ({cidadesRota.length})
                </span>
                {cidadesRota.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCidadesRota([])}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    Limpar lista
                  </button>
                )}
              </div>

              <div className="min-h-[84px] max-h-52 overflow-y-auto p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5 content-start">
                {cidadesRota.length === 0 ? (
                  <p className="text-xs text-slate-400 p-2">
                    Use a busca acima para incluir municípios do IBGE nesta rota.
                  </p>
                ) : (
                  cidadesRota.map((c, idx) => (
                    <span
                      key={`${c.codigo_ibge || c.municipio}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100"
                    >
                      <span>
                        {c.municipio}/{c.uf}
                      </span>
                      {c.codigo_ibge && (
                        <span className="font-mono text-[10px] text-slate-400">{c.codigo_ibge}</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setCidadesRota(prev => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Observação Logística (opcional)
              </label>
              <input
                type="text"
                value={descricaoRota}
                onChange={e => setDescricaoRota(e.target.value)}
                placeholder="Ex: Saídas terças e quintas..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={salvandoRota}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              {salvandoRota ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editandoRotaId ? 'Atualizar Região / Rota' : 'Salvar Nova Região / Rota'}
            </button>
          </form>

          {/* Listagem de Rotas Cadastradas */}
          <div className="lg:col-span-7 space-y-3">
            {loadingRotas ? (
              <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                Carregando regiões de entrega...
              </div>
            ) : regioesCustom.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
                <Layers className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Nenhuma Região / Rota personalizada criada ainda
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Agrupe municípios do IBGE em rotas logísticas (ex.: <em>Rota Sul</em>, <em>Interior SP</em>) para filtrar NF-es em 1 clique na Central de Cargas e emitir MDF-e por região.
                </p>
              </div>
            ) : (
              regioesCustom.map(reg => (
                <div
                  key={reg.id}
                  className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: reg.cor || '#0284c7' }}
                      />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {reg.nome}
                        </h3>
                        {reg.descricao && (
                          <p className="text-xs text-slate-500">{reg.descricao}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => carregarRotaParaEdicao(reg)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => excluirRotaEntrega(reg.id)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        title="Excluir rota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(reg.cidades || []).map((c, idx) => (
                      <span
                        key={`${c.codigo_ibge || c.municipio}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-300"
                      >
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {c.municipio}/{c.uf}
                        {c.codigo_ibge && (
                          <span className="font-mono text-[10px] text-slate-400">
                            ({c.codigo_ibge})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}

            {regioesErp.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Regiões sincronizadas de Clientes ERP ({regioesErp.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {regioesErp.map(re => (
                    <button
                      key={re.nome}
                      type="button"
                      onClick={() => {
                        setEditandoRotaId(null);
                        setNomeRota(re.nome);
                        setCidadesRota(
                          (re.cidades || []).map(cid => {
                            const achado = todosMunicipios.find(
                              m => normalizarBusca(m.cidade) === normalizarBusca(cid)
                            );
                            return {
                              municipio: achado?.cidade || cid,
                              uf: achado?.uf || 'MS',
                              codigo_ibge: achado?.codigo_ibge || ''
                            };
                          })
                        );
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-500 cursor-pointer"
                    >
                      + Importar "{re.nome}" ({re.qtd_cidades} cidades)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Cadastro de Distrito / Localidade Extra */}
      {modalLocalidadeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-brand-600" />
                Cadastrar Distrito / Localidade Extra
              </h3>
              <button
                type="button"
                onClick={() => setModalLocalidadeOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Todos os 5.571 municípios oficiais já estão cadastrados. Use esta opção apenas se precisar registrar um <strong>Distrito, Povoado ou Zona Rural</strong> vinculado ao código IBGE oficial do município-sede.
            </p>

            <form onSubmit={salvarLocalidadeExtra} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Município-Sede Oficial IBGE *
                </label>
                <SeletorMunicipioIbge
                  municipios={todosMunicipios}
                  value={localidadeForm.cod_ibge}
                  nomeFallback={localidadeForm.cidade}
                  ufFallback={localidadeForm.uf}
                  ufPreferencial={localidadeForm.uf}
                  onChange={m =>
                    setLocalidadeForm(prev => ({
                      ...prev,
                      cidade: m.cidade,
                      uf: m.uf,
                      cod_ibge: m.codigo_ibge
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do Distrito / Povoado *
                  </label>
                  <input
                    type="text"
                    required
                    value={localidadeForm.distrito}
                    onChange={e =>
                      setLocalidadeForm(prev => ({ ...prev, distrito: e.target.value.toUpperCase() }))
                    }
                    placeholder="Ex: ITAHUM, VILA VARGAS..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código IBGE Herdado (SEFAZ)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={localidadeForm.cod_ibge}
                    placeholder="Selecione o município acima"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Referência / Localização (opcional)
                </label>
                <input
                  type="text"
                  value={localidadeForm.localizacao}
                  onChange={e =>
                    setLocalidadeForm(prev => ({ ...prev, localizacao: e.target.value.toUpperCase() }))
                  }
                  placeholder="Ex: RODOVIA BR-163 KM 45 / ZONA RURAL"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white uppercase"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalLocalidadeOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoLocalidade || !localidadeForm.cod_ibge}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold cursor-pointer"
                >
                  {salvandoLocalidade ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar Distrito
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
