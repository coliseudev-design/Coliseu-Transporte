import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import GerenciadorRegioesModal from '../transporte/GerenciadorRegioesModal';
import {
  Search, MapPin, RefreshCw, Layers, CheckSquare, Square,
  AlertTriangle, CheckCircle2, Loader2, Calendar, FileText, X
} from 'lucide-react';

export interface CargaErpItem {
  id: number;
  chave_acesso: string;
  numero: string;
  serie: string;
  modelo_documento?: string;
  data_emissao?: string;
  remetente_documento?: string;
  remetente_nome?: string;
  remetente_municipio?: string;
  remetente_uf?: string;
  remetente_codigo_ibge?: string;
  destinatario_documento?: string;
  destinatario_nome?: string;
  destinatario_municipio?: string;
  destinatario_uf?: string;
  destinatario_codigo_ibge?: string;
  destinatario_bairro?: string;
  destinatario_cep?: string;
  valor_total: number;
  peso_bruto: number;
  volumes?: number;
  produto_predominante?: string;
  produto_ncm?: string;
  regiao_nome?: string;
  status: string;
  dados_nfe?: any;
}

interface ResumoFacetas {
  total_filtrado: number;
  valor_total_filtrado: number;
  peso_total_filtrado: number;
  regioes: Array<{ nome: string; cor?: string; qtd: number; valor_total: number; peso_total: number }>;
  cidades: Array<{
    municipio: string;
    uf: string;
    codigo_ibge?: string;
    regiao?: string;
    qtd: number;
    valor_total: number;
    peso_total: number;
  }>;
  ufs: Array<{ uf: string; qtd: number }>;
}

interface Props {
  modo: 'MDFE' | 'CTE';
  selectedIds: number[];
  onSelectionChange: (ids: number[], notasSelecionadas: CargaErpItem[]) => void;
  emitenteId?: string | number;
  onLoteCtesGerado?: (dados: { total_ctes: number; total_nfes: number; data: any[] }) => void;
}

function dataIsoDiasAtras(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

export default function SeletorNotasErp({
  modo,
  selectedIds,
  onSelectionChange,
  emitenteId,
  onLoteCtesGerado
}: Props) {
  const qc = useQueryClient();
  const [regiao, setRegiao] = useState('TODAS');
  const [ufDestino, setUfDestino] = useState('TODAS');
  const [cidadesMarcadas, setCidadesMarcadas] = useState<string[]>([]);
  const [statusFiltro, setStatusFiltro] = useState<'PENDENTE' | 'TODAS'>('PENDENTE');
  const [periodoPreset, setPeriodoPreset] = useState<'HOJE' | '7D' | '30D' | 'TODAS'>('30D');
  const [dataInicio, setDataInicio] = useState<string>(() => dataIsoDiasAtras(30));
  const [dataFim, setDataFim] = useState<string>('');
  const [search, setSearch] = useState('');
  const [modalRegioesAberto, setModalRegioesAberto] = useState(false);
  const [consolidando, setConsolidando] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // Estado para geração em lote de CT-es (quando múltiplos destinatários são selecionados no modo CTE)
  const [valorFreteTotalLote, setValorFreteTotalLote] = useState('');
  const [ratearProporcional, setRatearProporcional] = useState(true);
  const [gerandoLoteCte, setGerandoLoteCte] = useState(false);

  // Cache persistente de objetos CargaErpItem selecionados mesmo ao alternar filtros de região
  const cacheSelecionadasRef = useRef<Map<number, CargaErpItem>>(new Map());

  const aplicarPresetPeriodo = (p: 'HOJE' | '7D' | '30D' | 'TODAS') => {
    setPeriodoPreset(p);
    if (p === 'HOJE') {
      const hoje = new Date().toISOString().slice(0, 10);
      setDataInicio(hoje);
      setDataFim(hoje);
    } else if (p === '7D') {
      setDataInicio(dataIsoDiasAtras(7));
      setDataFim('');
    } else if (p === '30D') {
      setDataInicio(dataIsoDiasAtras(30));
      setDataFim('');
    } else {
      setDataInicio('');
      setDataFim('');
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      'seletor-cargas-erp',
      modo,
      regiao,
      ufDestino,
      cidadesMarcadas.join(','),
      statusFiltro,
      dataInicio,
      dataFim,
      search
    ],
    queryFn: async () => {
      const res = await api.get('/transporte/cargas', {
        params: {
          modo,
          apenas_nfe55: 'true',
          status: statusFiltro,
          regiao: regiao !== 'TODAS' ? regiao : undefined,
          uf_destino: ufDestino !== 'TODAS' ? ufDestino : undefined,
          municipios: cidadesMarcadas.length > 0 ? cidadesMarcadas.join(',') : undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          search: search.trim() || undefined,
          incluir_resumo: 'true',
          limit: 600
        }
      });
      return res.data;
    }
  });

  const notasListadas: CargaErpItem[] = data?.data || [];
  const resumo: ResumoFacetas | null = data?.resumo || null;

  // Mantém o cache sincronizado com os itens carregados da API
  useEffect(() => {
    for (const item of notasListadas) {
      cacheSelecionadasRef.current.set(item.id, item);
    }
  }, [notasListadas]);

  const notasSelecionadasObjetos = useMemo(() => {
    const lista: CargaErpItem[] = [];
    for (const id of selectedIds) {
      const cached = cacheSelecionadasRef.current.get(id);
      if (cached) lista.push(cached);
    }
    return lista;
  }, [selectedIds, notasListadas]);

  const emitirMudancaSelecao = (novosIds: number[]) => {
    const unicos = Array.from(new Set(novosIds));
    const objetos: CargaErpItem[] = [];
    for (const id of unicos) {
      const item = cacheSelecionadasRef.current.get(id);
      if (item) objetos.push(item);
    }
    onSelectionChange(unicos, objetos);
  };

  const alternarNota = (nota: CargaErpItem) => {
    cacheSelecionadasRef.current.set(nota.id, nota);
    if (selectedIds.includes(nota.id)) {
      emitirMudancaSelecao(selectedIds.filter((x) => x !== nota.id));
    } else {
      emitirMudancaSelecao([...selectedIds, nota.id]);
    }
  };

  const selecionarTodasFiltradas = () => {
    for (const n of notasListadas) {
      cacheSelecionadasRef.current.set(n.id, n);
    }
    const idsFiltrados = notasListadas.map((n) => n.id);
    const todasJaMarcadas =
      idsFiltrados.length > 0 && idsFiltrados.every((id) => selectedIds.includes(id));
    if (todasJaMarcadas) {
      emitirMudancaSelecao(selectedIds.filter((id) => !idsFiltrados.includes(id)));
    } else {
      emitirMudancaSelecao([...selectedIds, ...idsFiltrados]);
    }
  };

  const limparSelecao = () => {
    emitirMudancaSelecao([]);
  };

  const alternarCidadeFiltro = (mun: string) => {
    setCidadesMarcadas((prev) =>
      prev.includes(mun) ? prev.filter((c) => c !== mun) : [...prev, mun]
    );
  };

  const handleConsolidarErp = async () => {
    setConsolidando(true);
    setBanner(null);
    try {
      const res = await api.post('/transporte/cargas/consolidar-erp');
      const d = res.data?.data || {};
      await refetch();
      qc.invalidateQueries({ queryKey: ['cargas'] });
      setBanner({
        ok: true,
        msg: `Consolidação ERP concluída: ${d.nfe55_pendentes ?? d.pendentes ?? 0} NF-e(s) mod. 55 disponíveis para vínculo (${d.inseridas_de_vendas || 0} resgatadas de Vendas, ${d.enriquecidas || 0} enriquecidas com cliente/IBGE/região).`
      });
    } catch (err: any) {
      setBanner({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Falha ao consolidar notas do ERP.'
      });
    } finally {
      setConsolidando(false);
    }
  };

  // Inteligência sobre as notas selecionadas (UFs, Cidades <infMunDescarga>, Destinatários p/ CT-e)
  const analiseSelecao = useMemo(() => {
    let valorTotal = 0;
    let pesoTotal = 0;
    const ufsMap = new Map<string, number>();
    const cidadesMap = new Map<string, { municipio: string; uf: string; codigo_ibge?: string; qtd: number }>();
    const destinatariosMap = new Map<string, { nome: string; doc: string; municipio: string; qtd: number }>();

    for (const n of notasSelecionadasObjetos) {
      valorTotal += Number(n.valor_total || 0);
      pesoTotal += Number(n.peso_bruto || 0);
      const uf = String(n.destinatario_uf || 'MS').toUpperCase().trim();
      if (uf) ufsMap.set(uf, (ufsMap.get(uf) || 0) + 1);

      const mun = String(n.destinatario_municipio || 'Não informado').trim();
      const chaveCid = `${mun.toUpperCase()}|${uf}`;
      if (!cidadesMap.has(chaveCid)) {
        cidadesMap.set(chaveCid, {
          municipio: mun,
          uf,
          codigo_ibge: n.destinatario_codigo_ibge,
          qtd: 0
        });
      }
      cidadesMap.get(chaveCid)!.qtd += 1;

      const docLimpo = String(n.destinatario_documento || '').replace(/\D/g, '');
      const chaveDest =
        docLimpo.length >= 11
          ? `DOC:${docLimpo}`
          : `NOME:${String(n.destinatario_nome || 'CLIENTE').toUpperCase().trim()}|${mun.toUpperCase()}`;
      if (!destinatariosMap.has(chaveDest)) {
        destinatariosMap.set(chaveDest, {
          nome: n.destinatario_nome || 'Destinatário',
          doc: docLimpo,
          municipio: `${mun}/${uf}`,
          qtd: 0
        });
      }
      destinatariosMap.get(chaveDest)!.qtd += 1;
    }

    return {
      valorTotal,
      pesoTotal,
      ufs: Array.from(ufsMap.entries()).map(([uf, qtd]) => ({ uf, qtd })),
      cidades: Array.from(cidadesMap.values()),
      destinatarios: Array.from(destinatariosMap.values())
    };
  }, [notasSelecionadasObjetos]);

  const manterApenasUf = (ufAlvo: string) => {
    const filtrados = notasSelecionadasObjetos
      .filter((n) => String(n.destinatario_uf || 'MS').toUpperCase().trim() === ufAlvo)
      .map((n) => n.id);
    emitirMudancaSelecao(filtrados);
  };

  const handleGerarCtesLote = async () => {
    if (selectedIds.length === 0) return;
    setGerandoLoteCte(true);
    setBanner(null);
    try {
      const valorNum = parseFloat(String(valorFreteTotalLote || '0').replace(',', '.')) || 0;
      const res = await api.post('/transporte/ctes/lote', {
        cargas_ids: selectedIds,
        emitente_id: emitenteId ? Number(emitenteId) : undefined,
        ratear_frete_proporcional: ratearProporcional && valorNum > 0,
        valor_frete_total_lote: ratearProporcional ? valorNum : undefined,
        valor_frete_padrao: !ratearProporcional ? valorNum : undefined
      });
      await refetch();
      qc.invalidateQueries({ queryKey: ['ctes'] });
      qc.invalidateQueries({ queryKey: ['cargas'] });
      onLoteCtesGerado?.(res.data);
      setBanner({
        ok: true,
        msg: `${res.data?.total_ctes || 0} rascunho(s) de CT-e gerado(s) com sucesso (1 por destinatário) consolidando ${res.data?.total_nfes || 0} NF-e(s)!`
      });
    } catch (err: any) {
      setBanner({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao gerar CT-es em lote.'
      });
    } finally {
      setGerandoLoteCte(false);
    }
  };

  const cidadesDisponiveis = useMemo(() => {
    const todas = resumo?.cidades || [];
    if (regiao === 'TODAS' && ufDestino === 'TODAS') return todas.slice(0, 24);
    return todas
      .filter((c) => {
        if (ufDestino !== 'TODAS' && c.uf !== ufDestino) return false;
        if (
          regiao !== 'TODAS' &&
          regiao !== 'SEM_REGIAO' &&
          c.regiao &&
          c.regiao.toUpperCase() !== regiao.toUpperCase()
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 30);
  }, [resumo?.cidades, regiao, ufDestino]);

  const todasVisiveisMarcadas =
    notasListadas.length > 0 && notasListadas.every((n) => selectedIds.includes(n.id));

  return (
    <div className="space-y-3.5">
      {/* 1. Pílulas Rápidas de Região / Rota + Botões de Gestão */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Filtrar Notas do ERP por Região / Rota de Entrega
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleConsolidarErp}
              disabled={consolidando}
              title="Varre Vendas, Clientes, Itens e Regiões sincronizados pelo Worker para consolidar 100% das NF-es"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-sky-400 transition-colors"
            >
              {consolidando ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
              )}
              Consolidar Notas ERP
            </button>

            <button
              type="button"
              onClick={() => setModalRegioesAberto(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              Configurar Regiões
            </button>
          </div>
        </div>

        {/* Chips de Regiões */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setRegiao('TODAS');
              setCidadesMarcadas([]);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              regiao === 'TODAS'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400'
            }`}
          >
            Todas as Regiões
          </button>

          {(resumo?.regioes || []).map((r) => {
            const label = r.nome === 'SEM_REGIAO' ? 'Sem Região Definida' : r.nome;
            const ativa = regiao === r.nome;
            return (
              <button
                key={r.nome}
                type="button"
                onClick={() => {
                  setRegiao(ativa ? 'TODAS' : r.nome);
                  setCidadesMarcadas([]);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  ativa
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-400'
                }`}
              >
                {r.cor && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ativa ? '#ffffff' : r.cor }}
                  />
                )}
                <span>{label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    ativa
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r.qtd}
                </span>
              </button>
            );
          })}
        </div>

        {/* Linha de Busca, UF, Período e Status */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-1">
          <div className="md:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar Nº NF-e, cliente, CNPJ, cidade ou chave 44 dígitos..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={ufDestino}
              onChange={(e) => setUfDestino(e.target.value)}
              aria-label="Filtrar por UF de destino"
              className="w-full px-2.5 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold"
            >
              <option value="TODAS">Todas UFs</option>
              {(resumo?.ufs || []).map((u) => (
                <option key={u.uf} value={u.uf}>
                  UF: {u.uf} ({u.qtd})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
            {(
              [
                { id: 'HOJE', rotulo: 'Hoje' },
                { id: '7D', rotulo: '7d' },
                { id: '30D', rotulo: '30d' },
                { id: 'TODAS', rotulo: 'Tudo' }
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => aplicarPresetPeriodo(p.id)}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  periodoPreset === p.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          <div className="md:col-span-2">
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as 'PENDENTE' | 'TODAS')}
              aria-label="Status das notas"
              className="w-full px-2.5 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold"
            >
              <option value="PENDENTE">Disponíveis (Pendentes)</option>
              <option value="TODAS">Todas do ERP</option>
            </select>
          </div>
        </div>

        {/* Datas customizadas compactas + Chips de Cidades */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setPeriodoPreset('TODAS');
                setDataInicio(e.target.value);
              }}
              aria-label="Data inicial"
              className="px-2 py-1 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            />
            <span className="text-[11px] text-slate-400">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setPeriodoPreset('TODAS');
                setDataFim(e.target.value);
              }}
              aria-label="Data final"
              className="px-2 py-1 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            />
          </div>

          {(regiao !== 'TODAS' || ufDestino !== 'TODAS' || cidadesMarcadas.length > 0 || search) && (
            <button
              type="button"
              onClick={() => {
                setRegiao('TODAS');
                setUfDestino('TODAS');
                setCidadesMarcadas([]);
                setSearch('');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-600"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>

        {/* Sub-filtro rápido por Cidade de Destino */}
        {cidadesDisponiveis.length > 0 && (
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Municípios de Destino ({cidadesDisponiveis.length}):
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {cidadesDisponiveis.map((c) => {
                const marcada = cidadesMarcadas.includes(c.municipio);
                return (
                  <button
                    key={`${c.municipio}-${c.uf}`}
                    type="button"
                    onClick={() => alternarCidadeFiltro(c.municipio)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                      marcada
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    <span>
                      {c.municipio}/{c.uf}
                    </span>
                    <span className="opacity-75 text-[10px]">({c.qtd})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {banner && (
        <div
          className={`flex items-center justify-between gap-2 p-3 rounded-xl text-xs font-medium border ${
            banner.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{banner.msg}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} aria-label="Fechar aviso">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Barra de Seleção em Lote + KPIs em Tempo Real */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selecionarTodasFiltradas}
            disabled={notasListadas.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {todasVisiveisMarcadas ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {todasVisiveisMarcadas
              ? `Desmarcar visíveis (${notasListadas.length})`
              : `Selecionar todas filtradas (${notasListadas.length})`}
          </button>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={limparSelecao}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/20 transition-colors"
            >
              Limpar seleção
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span>
            Marcadas: <strong className="text-emerald-400">{selectedIds.length} NF-e(s)</strong>
          </span>
          <span>
            Municípios: <strong className="text-sky-300">{analiseSelecao.cidades.length}</strong>
          </span>
          <span>
            Peso Total:{' '}
            <strong className="font-mono">
              {analiseSelecao.pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
            </strong>
          </span>
          <span>
            Valor Carga:{' '}
            <strong className="font-mono text-emerald-300">
              R${' '}
              {analiseSelecao.valorTotal.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </strong>
          </span>
        </div>
      </div>

      {/* 3. Alertas Fiscais Inteligentes (MDF-e multi-municípios / multi-UF ou CT-e múltiplos destinatários) */}
      {modo === 'MDFE' && selectedIds.length > 0 && (
        <div className="space-y-2">
          {analiseSelecao.ufs.length > 1 ? (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs space-y-2">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Atenção SEFAZ: você marcou NF-es de {analiseSelecao.ufs.length} UFs de destino diferentes (
                    {analiseSelecao.ufs.map((u) => `${u.uf}: ${u.qtd}`).join(', ')}).
                  </p>
                  <p className="text-[11px] mt-0.5">
                    A legislação do MDF-e exige 1 Manifesto separado por UF de descarregamento. Clique abaixo para manter apenas uma UF neste MDF-e:
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {analiseSelecao.ufs.map((u) => (
                  <button
                    key={u.uf}
                    type="button"
                    onClick={() => manterApenasUf(u.uf)}
                    className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Manter apenas {u.uf} ({u.qtd} NF-es)
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Agrupamento automático SEFAZ (<code>&lt;infMunDescarga&gt;</code>):{' '}
                  <strong>{analiseSelecao.cidades.length} município(s)</strong> em{' '}
                  <strong>{analiseSelecao.ufs[0]?.uf || 'MS'}</strong> —{' '}
                  {analiseSelecao.cidades
                    .slice(0, 5)
                    .map((c) => `${c.municipio} (${c.qtd})`)
                    .join(' · ')}
                  {analiseSelecao.cidades.length > 5 ? ` +${analiseSelecao.cidades.length - 5}` : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {modo === 'CTE' && selectedIds.length > 0 && (
        <div>
          {analiseSelecao.destinatarios.length === 1 ? (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Destinatário único:</strong> {analiseSelecao.destinatarios[0].nome} (
                {analiseSelecao.destinatarios[0].municipio}) — todas as {selectedIds.length} NF-e(s) serão vinculadas neste mesmo CT-e!
              </span>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 space-y-3 text-xs">
              <div className="flex items-start gap-2 text-sky-900 dark:text-sky-100">
                <FileText className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Seleção por Região com {analiseSelecao.destinatarios.length} destinatários distintos ({selectedIds.length} NF-es)
                  </p>
                  <p className="text-[11px] text-sky-800 dark:text-sky-200 mt-0.5">
                    Na SEFAZ, cada CT-e Normal possui 1 Destinatário. Você pode gerar automaticamente{' '}
                    <strong>{analiseSelecao.destinatarios.length} CT-es em lote</strong> (agrupando as NF-es de cada cliente) agora mesmo:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 pl-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-sky-800 dark:text-sky-300 mb-1">
                    {ratearProporcional ? 'Frete Total da Rota R$ (Rateio)' : 'Frete por CT-e R$'}
                  </label>
                  <input
                    type="text"
                    value={valorFreteTotalLote}
                    onChange={(e) => setValorFreteTotalLote(e.target.value)}
                    placeholder="Ex: 850,00"
                    className="w-36 px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 font-mono"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-sky-900 dark:text-sky-200 pb-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ratearProporcional}
                    onChange={(e) => setRatearProporcional(e.target.checked)}
                    className="rounded border-sky-400 text-sky-600"
                  />
                  Ratear proporcional ao valor das NF-es
                </label>
                <button
                  type="button"
                  onClick={handleGerarCtesLote}
                  disabled={gerandoLoteCte}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs disabled:opacity-50"
                >
                  {gerandoLoteCte ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  Gerar {analiseSelecao.destinatarios.length} CT-es em Lote (1 por Cliente)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Tabela de Notas Fiscais do ERP */}
      <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-[10px] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 w-8"></th>
              <th className="px-3 py-2.5 font-bold">NF-e / Emissão</th>
              <th className="px-3 py-2.5 font-bold">Destinatário</th>
              <th className="px-3 py-2.5 font-bold">Município / Região</th>
              <th className="px-3 py-2.5 font-bold text-right">Peso</th>
              <th className="px-3 py-2.5 font-bold text-right">Valor</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Buscando notas fiscais emitidas no ERP...
                </td>
              </tr>
            ) : notasListadas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma NF-e modelo 55 encontrada para este filtro. Clique em{' '}
                  <strong>Consolidar Notas ERP</strong> ou amplie o período para <strong>Tudo</strong>.
                </td>
              </tr>
            ) : (
              notasListadas.map((nf) => {
                const checked = selectedIds.includes(nf.id);
                return (
                  <tr
                    key={nf.id}
                    onClick={() => alternarNota(nf)}
                    className={`cursor-pointer transition-colors ${
                      checked
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => alternarNota(nf)}
                        aria-label={`Selecionar NF-e ${nf.numero}`}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-bold text-slate-900 dark:text-white">
                        Nº {nf.numero || 'S/N'} · Série {nf.serie || '1'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {nf.data_emissao
                          ? new Date(nf.data_emissao).toLocaleDateString('pt-BR')
                          : '—'}{' '}
                        · …{String(nf.chave_acesso || '').slice(-10)}
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {nf.destinatario_nome || 'Consumidor / Destinatário'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {nf.destinatario_documento || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {nf.destinatario_municipio || '—'} / {nf.destinatario_uf || 'MS'}
                      </div>
                      {nf.regiao_nome && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300">
                          {nf.regiao_nome}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {Number(nf.peso_bruto || 0).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2
                      })}{' '}
                      kg
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      R$ {Number(nf.valor_total || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          nf.status === 'PENDENTE'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {nf.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <GerenciadorRegioesModal
        aberto={modalRegioesAberto}
        onFechar={() => setModalRegioesAberto(false)}
        onAtualizado={() => refetch()}
      />
    </div>
  );
}
