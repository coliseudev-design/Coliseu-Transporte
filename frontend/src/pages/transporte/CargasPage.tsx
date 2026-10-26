import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  Package, Truck, FileText, ChevronRight,
  Search, List, LayoutGrid, Calendar, User, Printer, Copy, X, MapPin
} from 'lucide-react';

interface CargaItem {
  id_item?: number;
  id_produto?: number;
  codigo?: string;
  descricao?: string;
  unidade?: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
  cfop?: string;
}

interface Carga {
  id: number;
  chave_acesso: string;
  numero: string;
  serie: string;
  data_emissao: string;
  remetente_nome: string;
  remetente_municipio: string;
  remetente_uf: string;
  destinatario_nome: string;
  destinatario_municipio: string;
  destinatario_uf: string;
  valor_total: number;
  peso_bruto: number;
  volumes?: number;
  produto_predominante?: string;
  dados_nfe?: {
    itens?: CargaItem[];
    protocolo?: string;
    natureza?: string;
  };
  status: string;
}

// Lista Oficial das 27 Unidades Federativas do Brasil (bloqueia digitação inválida como JJ)
const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export default function CargasPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cliente, setCliente] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('TODAS');
  const [viewMode, setViewMode] = useState<'lista' | 'cards'>('lista');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedItemsIds, setExpandedItemsIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal de DANFE
  const [danfeUrl, setDanfeUrl] = useState<string | null>(null);
  const [danfeChave, setDanfeChave] = useState('');
  const [danfeNumero, setDanfeNumero] = useState('');

  // Formulário de rateio/emissão rápida de CT-e
  const [valorFrete, setValorFrete] = useState('');
  const [naturezaOperacao, setNaturezaOperacao] = useState('PRESTACAO DE SERVICO DE TRANSPORTE');
  const [tomador, setTomador] = useState('0'); // 0=Remetente, 3=Destinatário
  const [emitenteId, setEmitenteId] = useState('');
  const [municipioInicio, setMunicipioInicio] = useState('');
  const [municipioFim, setMunicipioFim] = useState('');
  const [codigoMunInicio, setCodigoMunInicio] = useState('');
  const [codigoMunFim, setCodigoMunFim] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cargas', search, cliente, dataInicio, dataFim, statusFiltro],
    queryFn: async () => {
      const res = await api.get('/transporte/cargas', {
        params: {
          search: search || undefined,
          cliente: cliente || undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          status: statusFiltro && statusFiltro !== 'TODAS' ? statusFiltro : undefined,
          limit: 500
        }
      });
      return res.data;
    }
  });

  // Quadro de Sincronismo do Worker (Clientes, Produtos, Notas Fiscais, Vendas/Itens)
  const { data: syncStatusData } = useQuery({
    queryKey: ['transporte-sync-status'],
    queryFn: async () => (await api.get('/sync/status')).data,
    refetchInterval: 30000
  });
  const syncItems: Array<{ tabela: string; ultima: string | null; status: string; registros: number }> = syncStatusData?.status || [];
  const getSyncInfo = (tbl: string) => syncItems.find(s => s.tabela === tbl);
  const hbInfo = getSyncInfo('__heartbeat__');

  // Emitentes (transportadoras) cadastrados
  const { data: emitentesData } = useQuery({
    queryKey: ['emitentes-cargas'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitentes = emitentesData?.data || [];

  // Cidades e Regiões cadastradas no ERP (com código IBGE)
  const { data: municipiosData } = useQuery({
    queryKey: ['municipios-transporte'],
    queryFn: async () => (await api.get('/transporte/municipios')).data
  });
  const municipiosList: Array<{ cidade: string; uf: string; codigo_ibge: string }> = municipiosData?.data || [];

  // Veículos e Motoristas para o MDF-e direto
  const { data: veiculosData } = useQuery({
    queryKey: ['veiculos-mdfe'],
    queryFn: async () => (await api.get('/transporte/veiculos')).data
  });
  const veiculos = veiculosData?.data || [];

  const { data: motoristasData } = useQuery({
    queryKey: ['motoristas-mdfe'],
    queryFn: async () => (await api.get('/transporte/motoristas')).data
  });
  const motoristas = motoristasData?.data || [];

  // Modal de MDF-e Direto (Carga Própria / Varejo)
  const [modalMdfeDiretoOpen, setModalMdfeDiretoOpen] = useState(false);
  const [mdfeVeiculoId, setMdfeVeiculoId] = useState('');
  const [mdfeMotoristaId, setMdfeMotoristaId] = useState('');
  const [mdfeUfInicio, setMdfeUfInicio] = useState('MS');
  const [mdfeUfFim, setMdfeUfFim] = useState('MS');
  const [submittingMdfe, setSubmittingMdfe] = useState(false);

  // Cargas carregadas e seleção atual
  const cargas: Carga[] = data?.data || [];
  const selecionadas = cargas.filter(c => selectedIds.includes(c.id));

  // Totais e Inteligência de Rota das cargas selecionadas
  const totalValorCarga = selecionadas.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
  const totalPeso = selecionadas.reduce((acc, c) => acc + Number(c.peso_bruto || 0), 0);

  // Pré-preenche emitente, municípios e código IBGE do ERP automaticamente a partir das notas selecionadas
  useEffect(() => {
    if (selecionadas.length === 0) return;
    const c = selecionadas[0];
    const munOrigem = c.remetente_municipio || 'Dourados';
    const munDestino = c.destinatario_municipio || 'Dourados';
    setMunicipioInicio(munOrigem);
    setMunicipioFim(munDestino);

    // Puxa o emitente padrão
    if (!emitenteId && emitentes.length > 0) {
      setEmitenteId(String(emitentes[0].id));
    }

    // Busca código IBGE de origem na lista de regiões do ERP
    const regOrigem = municipiosList.find(m => m.cidade.trim().toUpperCase() === munOrigem.trim().toUpperCase());
    if (regOrigem?.codigo_ibge) {
      setCodigoMunInicio(regOrigem.codigo_ibge);
    } else if (emitentes[0]?.codigo_municipio) {
      setCodigoMunInicio(emitentes[0].codigo_municipio);
    }

    // Busca código IBGE de destino na lista de regiões do ERP
    const regDestino = municipiosList.find(m => m.cidade.trim().toUpperCase() === munDestino.trim().toUpperCase());
    if (regDestino?.codigo_ibge) {
      setCodigoMunFim(regDestino.codigo_ibge);
    }

    // UFs do MDF-e direto
    setMdfeUfInicio(c.remetente_uf || 'MS');
    setMdfeUfFim(c.destinatario_uf || 'MS');
  }, [selectedIds.length, emitentes.length, municipiosList.length]);

  // Estados e Cidades envolvidos no lote selecionado
  const analiseLote = useMemo(() => {
    const ufsOrigem = Array.from(new Set(selecionadas.map(c => (c.remetente_uf || '').toUpperCase()).filter(Boolean)));
    const ufsDestino = Array.from(new Set(selecionadas.map(c => (c.destinatario_uf || '').toUpperCase()).filter(Boolean)));

    // Agrupa cidades de destino com peso e quantidade de notas
    const cidadesMap: Record<string, { cidade: string; uf: string; qtd: number; valor: number; peso: number }> = {};
    selecionadas.forEach(c => {
      const key = `${c.destinatario_municipio || 'Não Informado'}/${c.destinatario_uf || 'MS'}`;
      if (!cidadesMap[key]) {
        cidadesMap[key] = {
          cidade: c.destinatario_municipio || 'Não Informado',
          uf: c.destinatario_uf || 'MS',
          qtd: 0,
          valor: 0,
          peso: 0
        };
      }
      cidadesMap[key].qtd += 1;
      cidadesMap[key].valor += Number(c.valor_total || 0);
      cidadesMap[key].peso += Number(c.peso_bruto || 0);
    });

    const cidadesList = Object.values(cidadesMap);
    return { ufsOrigem, ufsDestino, cidadesList };
  }, [selecionadas]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleExpandItems = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setExpandedItemsIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === cargas.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(cargas.map(c => c.id));
    }
  };

  const handleVisualizarDanfe = async (carga: Carga) => {
    if (!carga.chave_acesso || carga.chave_acesso.length < 44) {
      alert('Chave XML da NF-e inválida ou ausente para gerar o DANFE.');
      return;
    }
    try {
      const res = await api.get(`/transporte/cargas/${carga.id}/danfe`);
      if (res.data?.danfe_url) {
        window.open(res.data.danfe_url, '_blank', 'noopener,noreferrer');
      } else {
        window.open(`https://meudanfe.com.br/danfe?chave=${carga.chave_acesso}`, '_blank');
      }
    } catch {
      // Fallback direto por chave oficial
      window.open(`https://meudanfe.com.br/danfe?chave=${carga.chave_acesso}`, '_blank');
    }
  };

  const handleCopiarChave = (e: React.MouseEvent, chave: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(chave);
    alert('Chave XML copiada para a área de transferência!');
  };

  const handleCriarMdfeDireto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selecionadas.length === 0) return;
    setSubmittingMdfe(true);
    try {
      const v = veiculos.find((ve: any) => String(ve.id) === mdfeVeiculoId);
      const mot = motoristas.find((mo: any) => String(mo.id) === mdfeMotoristaId);

      await api.post('/transporte/mdfes', {
        emitente_id: emitenteId ? Number(emitenteId) : undefined,
        cargas_ids: selectedIds,
        tipo_emitente: '2', // 2 = Carga Própria (Varejo/Comércio sem CT-e!)
        uf_inicio: mdfeUfInicio,
        uf_fim: mdfeUfFim,
        veiculo_id: v?.id || null,
        veiculo_placa: v?.placa || 'ABC1D23',
        motorista_id: mot?.id || null,
        motorista_cpf: mot?.cpf || '00000000000',
        motorista_nome: mot?.nome || 'Motorista do Varejo',
        valor_carga: totalValorCarga,
        peso_bruto: totalPeso
      });

      setSelectedIds([]);
      setModalMdfeDiretoOpen(false);
      refetch();
      alert('MDF-e de Carga Própria gerado com sucesso! Acesse a aba Manifestos (MDF-e) para transmitir na SEFAZ.');
    } catch (err: any) {
      alert('Erro ao gerar MDF-e direto: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingMdfe(false);
    }
  };

  const handleCriarCte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selecionadas.length === 0) return;
    setSubmitting(true);
    try {
      const primeiraCarga = selecionadas[0];
      await api.post('/transporte/ctes', {
        emitente_id: emitenteId ? Number(emitenteId) : undefined,
        cargas_ids: selectedIds,
        natureza_operacao: naturezaOperacao,
        tomador,
        uf_inicio: primeiraCarga.remetente_uf,
        municipio_inicio: municipioInicio || primeiraCarga.remetente_municipio,
        codigo_municipio_inicio: codigoMunInicio,
        uf_fim: primeiraCarga.destinatario_uf,
        municipio_fim: municipioFim || primeiraCarga.destinatario_municipio,
        codigo_municipio_fim: codigoMunFim,
        valor_total: parseFloat(valorFrete || '0'),
        peso_bruto: totalPeso,
        valor_carga: totalValorCarga
      });

      setSelectedIds([]);
      setModalOpen(false);
      refetch();
      alert('CT-e gerado com sucesso! Acesse a aba Conhecimentos (CT-e) para emitir na SEFAZ.');
    } catch (err: any) {
      alert('Erro ao gerar CT-e: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Top Header Compacto */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <Package className="w-6 h-6 text-brand-600 dark:text-brand-500" />
              Central de Cargas & NF-e
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Notas fiscais do ERP Coliseu prontas para despacho em CT-e ou MDF-e
            </p>
          </div>

          {/* Status inline do Worker */}
          <div className="hidden lg:flex items-center gap-4 pl-5 border-l border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-[10px] font-medium text-slate-400 uppercase block leading-none">ERP</span>
              <span className={`text-xs font-bold mt-0.5 inline-flex items-center gap-1.5 ${
                hbInfo?.status === 'OK' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hbInfo?.status === 'OK' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {hbInfo?.status === 'OK' ? 'Online' : 'Aguardando'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-medium text-slate-400 uppercase block leading-none">Notas Sync</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                {(getSyncInfo('dash_cargas')?.registros || cargas.length || 0).toLocaleString('pt-BR')}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-medium text-slate-400 uppercase block leading-none">Clientes Sync</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                {(getSyncInfo('dash_clientes')?.registros || 0).toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Atalhos sempre visíveis — o operador nunca fica sem caminho */}
          <button
            onClick={() => { selectAll(); navigate('/transporte/cte/novo'); }}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Seleciona todas as notas visíveis e abre a emissão"
          >
            <FileText className="w-3.5 h-3.5" />
            Emitir CT-e
          </button>
          <button
            onClick={() => { selectAll(); setModalMdfeDiretoOpen(true); }}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            title="Para varejo/comércio que transporta mercadorias próprias e emite MDF-e direto sem CT-e"
          >
            <Truck className="w-3.5 h-3.5" />
            MDF-e Direto
          </button>
          {selectedIds.length > 0 && (
            <>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all"
              >
                <FileText className="w-4 h-4" />
                Gerar CT-e ({selectedIds.length})
              </button>
              <button
                onClick={() => setModalMdfeDiretoOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all"
              >
                <Truck className="w-4 h-4" />
                Emitir MDF-e ({selectedIds.length})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por chave XML da NF-e, número, remetente ou destinatário..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="relative">
            <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por cliente / destinatário..."
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              className="w-full lg:w-64 pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
            />
          </div>

          <select
            value={statusFiltro}
            onChange={e => setStatusFiltro(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="TODAS">Todos os Status</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="EM_CTE">Em CT-e</option>
            <option value="EM_MDFE">Em MDF-e</option>
            <option value="DESPACHADA">Despachadas</option>
          </select>

          <button
            onClick={() => { setSearch(''); setCliente(''); setDataInicio(''); setDataFim(''); setStatusFiltro('TODAS'); }}
            className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Limpar Filtros
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('lista')}
              className={`p-2 rounded-xl transition-colors ${viewMode === 'lista' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
              title="Visualizar em Lista (tabela)"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-xl transition-colors ${viewMode === 'cards' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
              title="Visualizar em Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            <button
              onClick={selectAll}
              className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              {selectedIds.length === cargas.length && cargas.length > 0 ? 'Desmarcar Todas' : 'Selecionar Todas'}
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Cargas */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          Carregando notas fiscais do ERP...
        </div>
      ) : cargas.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Package className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhuma nota fiscal encontrada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Tente ajustar os filtros de período, cliente ou busca. O Worker continuará sincronizando novas notas automaticamente.
          </p>
        </div>
      ) : viewMode === 'lista' ? (
        /* MODO LISTA (TABELA OPERACIONAL DENSIDADE PRO - PADRÃO) */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-[11px] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-700/60 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === cargas.length && cargas.length > 0}
                      onChange={selectAll}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">NF-e / Série</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Chave XML</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Data Emissão</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Origem</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Destinatário (Cliente)</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Destino (Cidade/UF)</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Peso</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Valor da NF</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60">Status</th>
                  <th className="px-4 py-3.5 border-l border-slate-200 dark:border-slate-700/60 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                {cargas.map(carga => {
                  const isSelected = selectedIds.includes(carga.id);
                  const itens = carga.dados_nfe?.itens || [];
                  const isExpanded = expandedItemsIds.includes(carga.id);
                  return (
                    <React.Fragment key={carga.id}>
                      <tr
                        onClick={() => toggleSelect(carga.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-brand-50/60 dark:bg-brand-950/30'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-700/30'
                        }`}
                      >
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(carga.id)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap border-l border-slate-200 dark:border-slate-700/60">
                          NF-e {carga.numero || 'S/N'}
                          {carga.serie && <span className="text-[10px] text-slate-400 font-normal ml-1">(Série {carga.serie})</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-[200px] border-l border-slate-200 dark:border-slate-700/60">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate" title={carga.chave_acesso}>
                              {carga.chave_acesso || '—'}
                            </span>
                            {carga.chave_acesso && (
                              <button
                                onClick={e => handleCopiarChave(e, carga.chave_acesso)}
                                title="Copiar Chave"
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap border-l border-slate-200 dark:border-slate-700/60">
                          {carga.data_emissao ? new Date(carga.data_emissao).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap border-l border-slate-200 dark:border-slate-700/60">
                          {carga.remetente_municipio || '—'}/{carga.remetente_uf || ''}
                        </td>
                        <td className="px-4 py-3 text-slate-900 dark:text-white font-medium max-w-[200px] truncate border-l border-slate-200 dark:border-slate-700/60" title={carga.destinatario_nome}>
                          {carga.destinatario_nome || 'Consumidor'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap border-l border-slate-200 dark:border-slate-700/60">
                          {carga.destinatario_municipio || '—'}/{carga.destinatario_uf || ''}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap text-right border-l border-slate-200 dark:border-slate-700/60">
                          {Number(carga.peso_bruto || 0).toLocaleString('pt-BR')} kg
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap text-right border-l border-slate-200 dark:border-slate-700/60">
                          R$ {Number(carga.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap border-l border-slate-200 dark:border-slate-700/60">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            carga.status === 'PENDENTE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          }`}>
                            {carga.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5 border-l border-slate-200 dark:border-slate-700/60" onClick={e => e.stopPropagation()}>
                          {itens.length > 0 && (
                            <button
                              onClick={e => toggleExpandItems(e, carga.id)}
                              title="Ver itens da nota"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-[11px] font-medium transition-colors"
                            >
                              <Package className="w-3 h-3" />
                              {itens.length} itens
                            </button>
                          )}
                          <button
                            onClick={() => handleVisualizarDanfe(carga)}
                            title="Visualizar / Imprimir DANFE oficial"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 text-[11px] font-semibold transition-colors"
                          >
                            <Printer className="w-3 h-3" />
                            DANFE
                          </button>
                        </td>
                      </tr>

                      {/* Linha expansível com itens da nota fiscal */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                          <td colSpan={11} className="px-6 py-3 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-brand-600" />
                              Itens da NF-e {carga.numero}: {itens.length} produto(s) sincronizado(s)
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                              {itens.map((it, idx) => (
                                <div key={idx} className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex justify-between items-center text-[11px]">
                                  <div className="truncate mr-2">
                                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{it.descricao}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">Qtd: {Number(it.quantidade || 0)} {it.unidade || 'UN'}</p>
                                  </div>
                                  <span className="font-semibold text-slate-900 dark:text-white shrink-0 tabular-nums">
                                    R$ {Number(it.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* MODO CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cargas.map(carga => {
            const isSelected = selectedIds.includes(carga.id);
            const itens = carga.dados_nfe?.itens || [];
            const isExpanded = expandedItemsIds.includes(carga.id);
            return (
              <div
                key={carga.id}
                onClick={() => toggleSelect(carga.id)}
                className={`cursor-pointer bg-white dark:bg-slate-800 p-5 rounded-2xl border transition-all duration-200 relative ${
                  isSelected
                    ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                    : 'border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                    <FileText className="w-3.5 h-3.5" />
                    NF-e {carga.numero || 'S/N'} {carga.serie ? `(Série ${carga.serie})` : ''}
                  </span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    carga.status === 'PENDENTE'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  }`}>
                    {carga.status}
                  </span>
                </div>

                {/* Chave de Acesso XML 44 dígitos */}
                {carga.chave_acesso && (
                  <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Chave XML NF-e</span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all select-all truncate block">
                        {carga.chave_acesso}
                      </span>
                    </div>
                    <button
                      onClick={e => handleCopiarChave(e, carga.chave_acesso)}
                      title="Copiar chave"
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Origem</span>
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{carga.remetente_nome || 'Consumidor'}</p>
                    <p className="text-xs text-slate-500">{carga.remetente_municipio}/{carga.remetente_uf}</p>
                  </div>

                  <div className="pt-1">
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Destino</span>
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{carga.destinatario_nome || 'Consumidor'}</p>
                    <p className="text-xs text-slate-500">{carga.destinatario_municipio}/{carga.destinatario_uf}</p>
                  </div>
                </div>

                {/* Itens da Nota Fiscal */}
                {itens.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={e => toggleExpandItems(e, carga.id)}
                      className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      {itens.length} item(ns) na NF-e {carga.produto_predominante ? `• ${carga.produto_predominante}` : ''}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1">
                        {itens.map((it, idx) => (
                          <div key={idx} className="text-[11px] flex justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-700/40 last:border-0">
                            <span className="text-slate-700 dark:text-slate-300 truncate">
                              {Number(it.quantidade || 0)} {it.unidade || 'UN'} - {it.descricao}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              R$ {Number(it.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">{Number(carga.peso_bruto || 0).toLocaleString('pt-BR')} kg</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      R$ {Number(carga.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleVisualizarDanfe(carga); }}
                      title="Visualizar DANFE"
                      className="p-1.5 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação de CT-e em Lote - Amplo com Conferência das Notas */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 my-8 max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-700/60 shrink-0">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-1.5 border border-blue-200 dark:border-blue-800/40">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Conhecimento de Transporte Eletrônico (CT-e 4.00)
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Conferência e Emissão de CT-e
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Confira as notas fiscais selecionadas do lote antes de transmitir para a SEFAZ.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo Analítico do Lote de CT-e */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 my-4 shrink-0">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Notas no Conhecimento</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                  {selecionadas.length} NF-e selecionada(s)
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Valor Total da Carga</span>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                  R$ {totalValorCarga.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peso Total Consolidado</span>
                <p className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums">
                  {totalPeso.toLocaleString('pt-BR')} kg
                </p>
              </div>
            </div>

            {/* Tabela de Conferência das Notas Fiscais no CT-e */}
            <div className="border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden mb-4 shrink-0">
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700">
                <span>Notas Fiscais Vinculadas a este CT-e ({selecionadas.length})</span>
                <span className="text-[11px] text-slate-400 font-normal">Clique no X para retirar alguma nota antes de emitir</span>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {selecionadas.map(c => (
                  <div key={c.id} className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        NF-e nº {c.numero} (Série {c.serie}) · {c.destinatario_nome}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 truncate">
                        {c.destinatario_municipio}/{c.destinatario_uf} · Chave: {c.chave_acesso}
                      </p>
                    </div>
                    <div className="text-right shrink-0 pr-2">
                      <p className="font-bold text-slate-900 dark:text-white">
                        R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {Number(c.peso_bruto || 0).toLocaleString('pt-BR')} kg
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelect(c.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                      title="Remover deste CT-e"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleCriarCte} className="text-sm">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* COLUNA ESQUERDA — Configuração da emissão */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Transportadora Emitente (CNPJ) <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={emitenteId}
                        onChange={e => {
                          setEmitenteId(e.target.value);
                          const em = emitentes.find((x: any) => String(x.id) === e.target.value);
                          if (em?.codigo_municipio) setCodigoMunInicio(em.codigo_municipio);
                        }}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">Selecione a transportadora...</option>
                        {emitentes.map((em: any) => (
                          <option key={em.id} value={em.id}>
                            {em.razao_social} — {em.cnpj}
                          </option>
                        ))}
                      </select>
                      {emitentes.length === 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                          Nenhuma transportadora cadastrada. Configure em Configurações → Dados da Empresa.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Valor do Frete (R$) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number" step="0.01" required placeholder="0,00"
                        value={valorFrete}
                        onChange={e => setValorFrete(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Tomador do Serviço
                      </label>
                      <select
                        value={tomador}
                        onChange={e => setTomador(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="0">Remetente</option>
                        <option value="1">Expedidor</option>
                        <option value="2">Recebedor</option>
                        <option value="3">Destinatário</option>
                        <option value="4">Outros</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Cidade de Início <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={codigoMunInicio}
                        onChange={e => {
                          setCodigoMunInicio(e.target.value);
                          const m = municipiosList.find(x => x.codigo_ibge === e.target.value);
                          if (m) setMunicipioInicio(m.cidade);
                        }}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                      >
                        <option value="">Selecione...</option>
                        {municipiosList.map((m: any, idx: number) => (
                          <option key={idx} value={m.codigo_ibge}>
                            {m.cidade} / {m.uf} ({m.codigo_ibge})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        IBGE {codigoMunInicio || '—'} · {municipioInicio || '—'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Cidade de Fim <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={codigoMunFim}
                        onChange={e => {
                          setCodigoMunFim(e.target.value);
                          const m = municipiosList.find(x => x.codigo_ibge === e.target.value);
                          if (m) setMunicipioFim(m.cidade);
                        }}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                      >
                        <option value="">Selecione...</option>
                        {municipiosList.map((m: any, idx: number) => (
                          <option key={idx} value={m.codigo_ibge}>
                            {m.cidade} / {m.uf} ({m.codigo_ibge})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        IBGE {codigoMunFim || '—'} · {municipioFim || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <button
                        type="button"
                        onClick={() => navigate('/transporte/cte/novo')}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        Abrir Wizard Completo (6 abas)
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {submitting ? 'Gerando...' : 'Gerar Rascunho do CT-e'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA — Conferência das notas */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-700">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Notas Vinculadas ({selecionadas.length})
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        clique no X para retirar do conhecimento
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-64 overflow-y-auto">
                      {selecionadas.length === 0 ? (
                        <p className="px-4 py-8 text-center text-xs text-slate-400">
                          Nenhuma nota selecionada.
                        </p>
                      ) : (
                        selecionadas.map(c => (
                          <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                NF-e {c.numero} · {c.destinatario_nome || 'Consumidor'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">
                                {c.destinatario_municipio}/{c.destinatario_uf}
                              </p>
                            </div>
                            <div className="text-right shrink-0 pr-1">
                              <p className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                                R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-[10px] text-slate-400 tabular-nums">
                                {Number(c.peso_bruto || 0).toLocaleString('pt-BR')} kg
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSelect(c.id)}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Cidades do lote */}
                  <div className="border border-slate-200/80 dark:border-slate-700 rounded-2xl p-4">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Destinos do Lote ({analiseLote.cidadesList.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {analiseLote.cidadesList.map((cid, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                        >
                          {cid.cidade}/{cid.uf}
                          <span className="text-slate-400">({cid.qtd})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Amplo de Criação de MDF-e Direto (Carga Própria / Varejo) */}
      {modalMdfeDiretoOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-5xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 my-8 max-h-[92vh] flex flex-col">

            {/* Cabeçalho do Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-700/60 shrink-0">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1.5 border border-emerald-200 dark:border-emerald-800/40">
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  MDF-e de Carga Própria (Tipo 2 - Varejo / Comércio)
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Despacho de Viagem e Manifesto de Carga
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Emita o manifesto fiscal para transporte de mercadorias próprias diretamente na SEFAZ sem necessidade de emissão de CT-e.
                </p>
              </div>
              <button
                onClick={() => setModalMdfeDiretoOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriarMdfeDireto} className="flex-1 overflow-y-auto py-5 space-y-6 pr-1">

              {/* 1. Visão Geral da Rota e Cidades Envolvidas */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Notas Selecionadas</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {selecionadas.length} NF-e
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Valor Total das Mercadorias</span>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                    R$ {totalValorCarga.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peso Total Consolidado</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {totalPeso.toLocaleString('pt-BR')} kg
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Destinos Atendidos</span>
                  <p className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {analiseLote.cidadesList.length} cidade(s)
                  </p>
                </div>
              </div>

              {/* 2. Cidades de Entrega Envolvidas na Viagem */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-500" />
                  Cidades e Destinos Detectados no Lote:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analiseLote.cidadesList.map((cid, i) => (
                    <span key={i} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700">
                      <span className="font-bold text-slate-900 dark:text-white">{cid.cidade}/{cid.uf}</span>
                      <span className="text-[11px] text-slate-400">({cid.qtd} nota(s) · {cid.peso.toLocaleString('pt-BR')} kg)</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 3. Dados do Emitente e Seleção dos Estados (Dropdown das 27 UFs do Brasil) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    Empresa Emitente (Filial) *
                  </label>
                  <select
                    required
                    value={emitenteId}
                    onChange={e => setEmitenteId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                  >
                    <option value="">Selecione a empresa...</option>
                    {emitentes.map((em: any) => (
                      <option key={em.id} value={em.id}>
                        {em.razao_social} — {em.cnpj}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    UF Início (Carregamento) *
                  </label>
                  <select
                    required
                    value={mdfeUfInicio}
                    onChange={e => setMdfeUfInicio(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold uppercase focus:ring-2 focus:ring-brand-500 text-xs"
                  >
                    {UFS_BRASIL.map(uf => (
                      <option key={uf} value={uf}>
                        {uf} {analiseLote.ufsOrigem.includes(uf) ? '★ (Origem das Notas)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    UF Fim (Descarregamento Final) *
                  </label>
                  <select
                    required
                    value={mdfeUfFim}
                    onChange={e => setMdfeUfFim(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold uppercase focus:ring-2 focus:ring-brand-500 text-xs"
                  >
                    {UFS_BRASIL.map(uf => (
                      <option key={uf} value={uf}>
                        {uf} {analiseLote.ufsDestino.includes(uf) ? '★ (Destino das Notas)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Seleção de Veículo e Condutor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    Veículo de Tração (Frota) *
                  </label>
                  <select
                    required
                    value={mdfeVeiculoId}
                    onChange={e => setMdfeVeiculoId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                  >
                    <option value="">Selecione o veículo da frota...</option>
                    {veiculos.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        Placa: {v.placa} — Cap: {Number(v.capacidade_kg || 0).toLocaleString('pt-BR')} kg ({v.tipo_proprietario === '1' ? 'Próprio' : 'Terceiro/TAC'})
                      </option>
                    ))}
                  </select>
                  {veiculos.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Nenhum veículo cadastrado na frota. Cadastre em Frota & Condutores.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    Condutor / Motorista Autorizado *
                  </label>
                  <select
                    required
                    value={mdfeMotoristaId}
                    onChange={e => setMdfeMotoristaId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                  >
                    <option value="">Selecione o condutor da viagem...</option>
                    {motoristas.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.nome} — CPF: {m.cpf} (CNH: {m.cnh_categoria || 'D'})
                      </option>
                    ))}
                  </select>
                  {motoristas.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Nenhum motorista cadastrado. Cadastre em Frota & Condutores.
                    </p>
                  )}
                </div>
              </div>

              {/* 5. Tabela Completa de Conferência das NF-es Vinculadas */}
              <div className="border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700">
                  <span>Notas Fiscais Vinculadas ao Manifesto ({selecionadas.length})</span>
                  <span className="text-[11px] text-slate-400 font-normal">Clique no X para remover alguma nota do lote</span>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {selecionadas.map(c => (
                    <div key={c.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          NF-e nº {c.numero} (Série {c.serie}) · {c.destinatario_nome}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                          {c.destinatario_municipio}/{c.destinatario_uf} · Chave: {c.chave_acesso}
                        </p>
                      </div>
                      <div className="text-right shrink-0 pr-2">
                        <p className="font-bold text-slate-900 dark:text-white">
                          R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {Number(c.peso_bruto || 0).toLocaleString('pt-BR')} kg
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSelect(c.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        title="Remover deste manifesto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalMdfeDiretoOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingMdfe || selecionadas.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md shadow-emerald-600/20"
                >
                  <Truck className="w-4 h-4" />
                  {submittingMdfe ? 'Transmitindo à SEFAZ...' : 'Gerar e Emitir MDF-e de Carga Própria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barra Flutuante Fixa de Totalizador quando houver notas selecionadas */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-brand-600 font-bold text-sm">
                {selectedIds.length} selecionada(s)
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Peso Total</span>
                <span className="font-semibold text-white">{totalPeso.toLocaleString('pt-BR')} kg</span>
              </div>
              <div className="h-8 w-px bg-slate-700" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Valor Total NF-e</span>
                <span className="font-bold text-emerald-400">R$ {totalValorCarga.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds([])}
                className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all"
                title="Emitir CT-e para cobrar frete"
              >
                <FileText className="w-3.5 h-3.5" />
                CT-e
              </button>
              <button
                onClick={() => setModalMdfeDiretoOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all"
                title="Emitir MDF-e direto sem CT-e (para varejo / carga própria)"
              >
                <Truck className="w-3.5 h-3.5" />
                MDF-e Direto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
