import { useState, useMemo } from 'react'
import { useApiQuery } from '../hooks/useApi'
import axios from 'axios'
import { 
  Package, Search, Plus, Edit2, Trash2, X, CheckCircle, AlertCircle, ArrowUpDown, ChevronUp, ChevronDown,
  Tag, Barcode, DollarSign, Percent, Layers, Warehouse, MessageSquare, CheckCircle2, Info, FileText,
  ShieldCheck, RefreshCw, Box, Award, Building, Scale, Printer
} from 'lucide-react'
import { formatBRL, formatNum } from '../utils/format'
import clsx from 'clsx'

interface ProdutoKPIs {
  kpis: {
    total_produtos: number;
    valor_total_estoque: number;
    baixo_estoque: number;
    produto_mais_caro: string;
    produto_mais_barato: string;
  }
}

interface Categoria {
  categoria: string;
  qtd: number;
}

interface ProdutoItem {
  id: number;
  id_firebird: number | null;
  codigo: string;
  nome: string;
  abreviacao?: string;
  categoria: string;
  marca?: string;
  referencia?: string;
  codigo_fabrica?: string;
  departamento?: string;
  unidade?: string;
  peso?: number;
  comissao_percent?: number;
  desconto_max_percent?: number;
  estoque: number;
  estoque_minimo: number;
  estoque_maximo?: number;
  preco: number;
  custo: number;
  preco_minimo?: number;
  margem_lucro_min?: number;
  margem_lucro_max?: number;
  apresentacao?: string;
  codigo_barras?: string;
  modelo_barras?: string;
  observacoes?: string;
  valor_total_estoque: number;
  tipo?: string;
  tipo_cobranca?: string;
  categoria_contabil?: string;
}

interface ProdutosList {
  total: number;
  data: ProdutoItem[];
}

const TYPES = ['PRODUTO', 'SERVIÇO', 'PRODUÇÃO', 'MATÉRIA PRIMA', 'SOFTWARE'];
const CHARGING_TYPES = ['Avulso/Setup', 'Recorrente / Mensalidade', 'Por Licença', 'Por Uso'];
const UNIDADES = ['UN', 'PACOTE', 'CX', 'KG', 'M', 'L', 'SERVIÇO', 'HORA'];
const MODELOS_BARRAS = ['EAN13', 'EAN8', 'DUN14', 'CODE128'];

export default function Produtos() {
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [selectedProductRow, setSelectedProductRow] = useState<ProdutoItem | null>(null)
  const [deleteMsg, setDeleteMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  
  // Sorting state
  const [sortField, setSortField] = useState<'codigo' | 'nome' | 'tipo' | 'preco' | 'estoque'>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Queries
  const kpis = useApiQuery<ProdutoKPIs>('/produtos/kpis')
  const cats = useApiQuery<{ data: Categoria[] }>('/produtos/categorias')
  const lista = useApiQuery<ProdutosList>(
    '/produtos/lista',
    { search, categoria: categoria || undefined, limit: 1000 },
    { placeholderData: (prev) => prev },
  )

  const k = kpis.data?.kpis

  // Creation/Edit Modal states & Tab state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeModalTab, setActiveModalTab] = useState<'cadastro' | 'precos' | 'estoque' | 'obs'>('cadastro')
  const [editingProduct, setEditingProduct] = useState<ProdutoItem | null>(null)
  
  const initialFormData = {
    nome: '',
    codigo: '',
    abreviacao: '',
    categoria: 'GERAL',
    marca: 'COLISEU TRANSPORTE',
    referencia: '',
    codigo_fabrica: '',
    departamento: 'PEÇAS / GERAL',
    unidade: 'UN',
    peso: 0,
    comissao_percent: 0,
    desconto_max_percent: 0,
    preco: 0,
    custo: 0,
    preco_minimo: 0,
    margem_lucro_min: 30,
    margem_lucro_max: 50,
    estoque: 0,
    estoque_minimo: 0,
    estoque_maximo: 0,
    apresentacao: '',
    codigo_barras: '',
    modelo_barras: 'EAN13',
    observacoes: '',
    tipo: 'PRODUTO',
    tipo_cobranca: 'Avulso/Setup',
    categoria_contabil: 'Receita Operacional'
  }

  const [formData, setFormData] = useState(initialFormData)

  // Open creation
  const handleOpenCreate = () => {
    setEditingProduct(null)
    setFormData(initialFormData)
    setActiveModalTab('cadastro')
    setIsModalOpen(true)
  }

  // Open edit
  const handleOpenEdit = (p: ProdutoItem) => {
    setEditingProduct(p)
    const cost = p.custo || 0
    const price = p.preco || 0
    const calcMargin = cost > 0 && price > 0 ? parseFloat((((price - cost) / cost) * 100).toFixed(2)) : 0

    setFormData({
      nome: p.nome || '',
      codigo: p.codigo || '',
      abreviacao: p.abreviacao || '',
      categoria: p.categoria || 'GERAL',
      marca: p.marca || 'COLISEU TRANSPORTE',
      referencia: p.referencia || '',
      codigo_fabrica: p.codigo_fabrica || '',
      departamento: p.departamento || 'PEÇAS / GERAL',
      unidade: p.unidade || 'UN',
      peso: p.peso || 0,
      comissao_percent: p.comissao_percent || 0,
      desconto_max_percent: p.desconto_max_percent || 0,
      preco: price,
      custo: cost,
      preco_minimo: p.preco_minimo || price,
      margem_lucro_min: p.margem_lucro_min || calcMargin,
      margem_lucro_max: p.margem_lucro_max || (calcMargin > 0 ? parseFloat((calcMargin * 1.25).toFixed(2)) : 0),
      estoque: p.estoque || 0,
      estoque_minimo: p.estoque_minimo || 0,
      estoque_maximo: p.estoque_maximo || 0,
      apresentacao: p.apresentacao || '',
      codigo_barras: p.codigo_barras || '',
      modelo_barras: p.modelo_barras || 'EAN13',
      observacoes: p.observacoes || '',
      tipo: p.tipo || 'PRODUTO',
      tipo_cobranca: p.tipo_cobranca || 'Avulso/Setup',
      categoria_contabil: p.categoria_contabil || 'Receita Operacional'
    })
    setActiveModalTab('cadastro')
    setIsModalOpen(true)
  }

  // Save
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        const targetId = editingProduct.id_firebird || editingProduct.id;
        await axios.put(`/api/produtos/${targetId}`, formData);
      } else {
        await axios.post('/api/produtos', formData);
      }
      setIsModalOpen(false);
      lista.refetch();
      kpis.refetch();
      cats.refetch();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar produto.');
    }
  };

  // Delete / Inativar
  const handleDeleteProduct = async (p: ProdutoItem) => {
    if (!confirm(`Deseja realmente remover "${p.nome}" do catálogo?\n\nO item será inativado no Coliseu Transporte e no ERP Coliseu.`)) return;
    const targetId = p.id_firebird || p.id;
    setDeletingId(targetId);
    try {
      const { data } = await axios.delete(`/api/produtos/${targetId}`);
      const erpMsg = data.erp_queued
        ? '✅ Inativação enviada ao ERP.'
        : data.erp_note || '';
      setDeleteMsg({ text: `${data.message || 'Produto inativado.'} ${erpMsg}`.trim(), type: 'success' });
      setSelectedProductRow(null);
      lista.refetch();
      kpis.refetch();
      cats.refetch();
    } catch (err: any) {
      setDeleteMsg({ text: err?.response?.data?.error || 'Erro ao inativar produto.', type: 'error' });
    } finally {
      setDeletingId(null);
      setTimeout(() => setDeleteMsg(null), 5000);
    }
  };

  // Filtered & Sorted items
  const filteredProducts = useMemo(() => {
    let items = lista.data?.data || []
    if (tipoFilter !== 'todos') {
      items = items.filter(p => (p.tipo || '').toLowerCase().includes(tipoFilter.toLowerCase()))
    }
    return items.slice().sort((a, b) => {
      let valA: any = a[sortField] || ''
      let valB: any = b[sortField] || ''

      if (sortField === 'codigo') {
        valA = a.id_firebird || a.id
        valB = b.id_firebird || b.id
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [lista.data?.data, tipoFilter, sortField, sortDir])

  const handleSort = (field: 'codigo' | 'nome' | 'tipo' | 'preco' | 'estoque') => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  return (
    <div className="space-y-1.5">

      {/* BARRA SUPERIOR FIXA PADRONIZADA (STICKY TOP) */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-xl p-1.5 shadow-2xs text-xs flex flex-wrap items-center justify-between gap-2">
        
        {/* LADO ESQUERDO: TÍTULO BADGE E FILTROS */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge principal de identificação */}
          <div className="flex items-center gap-2 px-1 border-r border-slate-300 dark:border-slate-700 pr-3">
            <div className="p-1 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-lg shadow-sm flex items-center justify-center shrink-0">
              <Package size={15} />
            </div>
            <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight font-heading">
              Catálogo de Produtos
            </span>
          </div>

          {/* Filtro por Tipo */}
          <select 
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="input !w-auto shrink-0 !py-1 !px-2.5 font-bold text-slate-800 text-xs rounded-lg border-slate-300 bg-white cursor-pointer"
          >
            <option value="todos">Todos os Tipos</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Filtro por Categoria */}
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="input !w-auto shrink-0 !py-1 !px-2.5 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-lg cursor-pointer"
          >
            <option value="">Todas Categorias</option>
            {(cats.data?.data || []).map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria} ({c.qtd})
              </option>
            ))}
          </select>

          {/* Campo de Busca Unificado */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value.toUpperCase())}
              placeholder="Pesquise por código, nome ou referência..."
              className="input !pl-8 !py-1 font-semibold text-xs text-slate-800 rounded-lg border-slate-300 w-full bg-white uppercase"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[10px] font-bold"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* LADO DIREITO: RESUMO CONTADOR */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 pr-1">
          <span>{filteredProducts.length} itens encontrados</span>
        </div>
      </div>

      {/* Toast de feedback de inativação */}
      {deleteMsg && (
        <div className={clsx(
          "flex items-center gap-3 p-2.5 rounded-xl border text-xs font-bold shadow-xs animate-fade-in",
          deleteMsg.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-200'
        )}>
          {deleteMsg.type === 'success' ? <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" /> : <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />}
          <span className="flex-1">{deleteMsg.text}</span>
          <button onClick={() => setDeleteMsg(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* TABELA ESTRUTURADA EM COLUNAS PADRONIZADAS IGUAL CLIENTES E FINANCEIRO */}
      <div className="card !p-0 overflow-hidden border border-slate-300 dark:border-slate-800 shadow-sm rounded-xl">
        <div className="overflow-x-auto max-h-[calc(100vh-175px)] min-h-[380px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse">
            
            {/* CABEÇALHO PADRONIZADO COM DIVISORES VERTICAIS */}
            <thead className="bg-slate-200/90 dark:bg-slate-800/90 border-b-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 sticky top-0 z-20">
              <tr>
                <th className="px-2 py-1.5 text-center w-8 border-r border-slate-300 dark:border-slate-700 shrink-0">
                  <span className="sr-only">Seleção</span>
                </th>

                {/* CÓDIGO */}
                <th 
                  onClick={() => handleSort('codigo')}
                  className={clsx(
                    "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                    sortField === 'codigo' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  )}
                  title="Ordenar por Código"
                >
                  <div className="flex items-center gap-1">
                    <span>CÓDIGO</span>
                    {sortField === 'codigo' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                  </div>
                </th>

                {/* NOME DO PRODUTO / SERVIÇO */}
                <th 
                  onClick={() => handleSort('nome')}
                  className={clsx(
                    "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 min-w-[220px] shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                    sortField === 'nome' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  )}
                  title="Ordenar por Nome"
                >
                  <div className="flex items-center gap-1">
                    <span>NOME DO PRODUTO / SERVIÇO</span>
                    {sortField === 'nome' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                  </div>
                </th>

                {/* TIPO */}
                <th 
                  onClick={() => handleSort('tipo')}
                  className={clsx(
                    "px-2.5 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                    sortField === 'tipo' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  )}
                  title="Ordenar por Tipo"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>TIPO</span>
                    {sortField === 'tipo' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                  </div>
                </th>

                {/* MARCA */}
                <th className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">
                  <span>MARCA</span>
                </th>

                {/* VALOR PADRÃO */}
                <th 
                  onClick={() => handleSort('preco')}
                  className={clsx(
                    "px-2.5 py-1.5 text-right text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                    sortField === 'preco' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  )}
                  title="Ordenar por Preço"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>VALOR PADRÃO</span>
                    {sortField === 'preco' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                  </div>
                </th>

                {/* CUSTO UNITÁRIO */}
                <th className="px-2.5 py-1.5 text-right text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">
                  <span>CUSTO</span>
                </th>

                {/* ESTOQUE */}
                <th 
                  onClick={() => handleSort('estoque')}
                  className={clsx(
                    "px-2.5 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                    sortField === 'estoque' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  )}
                  title="Ordenar por Estoque"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>ESTOQUE</span>
                    {sortField === 'estoque' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                  </div>
                </th>

                {/* PLANO DRE / CATEGORIA */}
                <th className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap shrink-0">
                  <span>PLANO DRE / CATEGORIA</span>
                </th>
              </tr>
            </thead>

            {/* CORPO DA TABELA COM MESMA FONTE E ESTILO DE CLIENTES */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {lista.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-200 dark:border-slate-800">
                    <td colSpan={9} className="px-3 py-2">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
                    </td>
                  </tr>
                ))
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic font-semibold">
                    Nenhum produto ou serviço encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isSelected = selectedProductRow?.id === p.id;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedProductRow(p)}
                      className={clsx(
                        "transition-colors cursor-pointer select-none",
                        isSelected
                          ? "bg-indigo-50/80 dark:bg-indigo-950/60 font-semibold"
                          : "hover:bg-indigo-50/40 dark:hover:bg-slate-800/60"
                      )}
                    >
                      {/* Checkbox de seleção */}
                      <td className="px-2 py-1 text-center w-8 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        <input
                          type="radio"
                          name="selectedProduct"
                          checked={isSelected}
                          onChange={() => setSelectedProductRow(p)}
                          className="rounded-full border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                        />
                      </td>

                      {/* Código */}
                      <td className="px-2.5 py-1 font-mono font-extrabold text-[11px] border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[10.5px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60">
                          #{p.id_firebird || p.codigo || p.id}
                        </span>
                      </td>

                      {/* Nome Comercial / Descrição */}
                      <td className="px-2.5 py-1 text-[11.5px] font-extrabold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        <span className="truncate max-w-[320px] block text-slate-900 dark:text-slate-100" title={p.nome}>
                          {p.nome}
                        </span>
                      </td>

                      {/* Tipo (Badge) */}
                      <td className="px-2.5 py-1 text-center border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded border uppercase bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300">
                          {p.tipo || 'Serviço'}
                        </span>
                      </td>

                      {/* Marca */}
                      <td className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        {p.marca || 'Nexos'}
                      </td>

                      {/* Preço / Valor Padrão */}
                      <td className="px-2.5 py-1 text-right font-mono font-black text-[11.5px] text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        {formatBRL(p.preco)}
                      </td>

                      {/* Custo */}
                      <td className="px-2.5 py-1 text-right font-mono text-[11px] text-slate-500 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        {formatBRL(p.custo || 0)}
                      </td>

                      {/* Estoque */}
                      <td className="px-2.5 py-1 text-center font-mono font-bold text-[11px] border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-[10.5px]",
                          p.estoque <= 0 ? "text-amber-700 bg-amber-50 dark:bg-amber-950/60" : "text-slate-800 dark:text-slate-200"
                        )}>
                          {formatNum(p.estoque)}
                        </span>
                      </td>

                      {/* Plano DRE / Categoria */}
                      <td className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
                        {p.categoria_contabil || p.categoria || 'Receita Operacional'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BARRA FIXA STICKY NO RODAPÉ: BOTÕES DE AÇÕES À ESQUERDA, RESUMO À DIREITA */}
      <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2.5 rounded-t-2xl">
        
        {/* LADO ESQUERDO: BOTÕES DE AÇÃO */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 p-1 rounded-xl border border-indigo-200/80">
            <button
              onClick={() => {
                const target = selectedProductRow || filteredProducts[0];
                if (target) handleOpenEdit(target);
              }}
              title="Editar o item selecionado"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Edit2 size={13} /> Editar Item
            </button>

            <button
              onClick={() => {
                const target = selectedProductRow || filteredProducts[0];
                if (target) handleDeleteProduct(target);
              }}
              title="Inativar/Excluir o item selecionado"
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Trash2 size={13} /> Inativar / Excluir
            </button>
          </div>

          <button 
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer ml-1"
            onClick={handleOpenCreate}
          >
            <Plus size={14} /> + Cadastrar Produto / Serviço
          </button>
        </div>

        {/* LADO DIREITO: TOTALIZADORES COMPACTOS */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-extrabold text-slate-800 dark:text-slate-200">
            📦 Catálogo: <strong>{lista.data?.total || filteredProducts.length}</strong> itens
          </span>
        </div>
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO REESTRUTURADO & MODERNO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
          <div className="card w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-up">
            
            {/* CABEÇALHO DO MODAL COM ICONE E INFORMACÕES ERP */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-md">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight flex items-center gap-2">
                    <span>{editingProduct ? 'Editar Cadastro de Produto / Serviço' : 'Cadastrar Novo Produto / Serviço'}</span>
                    {editingProduct && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-mono text-xs font-extrabold rounded-md">
                        #{editingProduct.id_firebird || editingProduct.id || editingProduct.codigo}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Estrutura Completa ERP Firebird & Catálogo Coliseu Transporte</p>
                </div>
              </div>
              <button 
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer" 
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* BARRA DE NAVEGAÇÃO DE ABAS PILULARES */}
            <div className="px-6 py-2 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveModalTab('cadastro')}
                className={clsx(
                  "px-3.5 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 transition-all cursor-pointer",
                  activeModalTab === 'cadastro'
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                )}
              >
                <Box size={14} /> Dados Gerais & Cadastro
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('precos')}
                className={clsx(
                  "px-3.5 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 transition-all cursor-pointer",
                  activeModalTab === 'precos'
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                )}
              >
                <DollarSign size={14} /> Tabela de Preços & Margem
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('estoque')}
                className={clsx(
                  "px-3.5 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 transition-all cursor-pointer",
                  activeModalTab === 'estoque'
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                )}
              >
                <Warehouse size={14} /> Estoque & Código de Barras
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('obs')}
                className={clsx(
                  "px-3.5 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 transition-all cursor-pointer",
                  activeModalTab === 'obs'
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                )}
              >
                <MessageSquare size={14} /> Aplicação & Observações
              </button>
            </div>

            {/* CORPO DO FORMULÁRIO COM SCROLL INTERNO */}
            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">

              {/* ABA 1: DADOS GERAIS & CADASTRO */}
              {activeModalTab === 'cadastro' && (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* Descrição Principal */}
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag size={13} className="text-indigo-600 dark:text-indigo-400" />
                      Descrição / Nome do Produto *
                    </label>
                    <input
                      type="text"
                      className="input font-bold text-xs rounded-lg uppercase"
                      required
                      placeholder="Ex: 1A MOLA DIANT. 1111/1113/1114/1117/1118 69/90"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value.toUpperCase() })}
                    />
                  </div>

                  {/* Abreviação */}
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={13} className="text-indigo-600 dark:text-indigo-400" />
                      Abreviação / Descrição Curta
                    </label>
                    <input
                      type="text"
                      className="input text-xs rounded-lg uppercase"
                      placeholder="Ex: 1A MOLA DIANT. 1111/1113/1114/"
                      value={formData.abreviacao}
                      onChange={(e) => setFormData({ ...formData, abreviacao: e.target.value.toUpperCase() })}
                    />
                  </div>

                  {/* Categoria + Marca + Referência + Código Fabricante */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Layers size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Categoria / Grupo
                      </label>
                      <input
                        type="text"
                        className="input text-xs rounded-lg uppercase font-semibold"
                        placeholder="MERCEDES > PEÇAS"
                        value={formData.categoria}
                        onChange={(e) => setFormData({ ...formData, categoria: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Award size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Marca / Fabricante
                      </label>
                      <input
                        type="text"
                        className="input text-xs rounded-lg uppercase font-semibold"
                        placeholder="MERCEDES BENZ"
                        value={formData.marca}
                        onChange={(e) => setFormData({ ...formData, marca: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Tag size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Referência
                      </label>
                      <input
                        type="text"
                        className="input font-mono text-xs rounded-lg uppercase"
                        placeholder="MB41020.01"
                        value={formData.referencia}
                        onChange={(e) => setFormData({ ...formData, referencia: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Barcode size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Cód. Fabricante
                      </label>
                      <input
                        type="text"
                        className="input font-mono text-xs rounded-lg uppercase"
                        placeholder="MB40.1"
                        value={formData.codigo_fabrica}
                        onChange={(e) => setFormData({ ...formData, codigo_fabrica: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>

                  {/* Departamento + Unidade + Tipo + Código Único */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Building size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Departamento
                      </label>
                      <input
                        type="text"
                        className="input text-xs rounded-lg uppercase"
                        placeholder="AUTO PEÇAS"
                        value={formData.departamento}
                        onChange={(e) => setFormData({ ...formData, departamento: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Scale size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Unidade de Medida
                      </label>
                      <select
                        className="input text-xs font-extrabold rounded-lg uppercase"
                        value={formData.unidade}
                        onChange={(e) => setFormData({ ...formData, unidade: e.target.value })}
                      >
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Box size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Tipo de Item
                      </label>
                      <select
                        className="input text-xs font-extrabold rounded-lg"
                        value={formData.tipo}
                        onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                      >
                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Tag size={12} className="text-indigo-600 dark:text-indigo-400" />
                        Código ERP / Ref
                      </label>
                      <input
                        type="text"
                        className="input font-mono font-bold text-xs rounded-lg"
                        placeholder="Auto se vazio..."
                        value={formData.codigo}
                        onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                      />
                    </div>
                  </div>

                </div>
              )}

              {/* ABA 2: TABELA DE PREÇOS & MARGEM DE LUCRO */}
              {activeModalTab === 'precos' && (
                <div className="space-y-4 animate-fade-in">
                  
                  <div className="p-3.5 bg-gradient-to-r from-emerald-50/70 via-slate-50 to-indigo-50/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-indigo-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign size={15} className="text-emerald-600 dark:text-emerald-400" />
                        Formação de Preços & Margens de Lucro
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium">Os valores são recalculados automaticamente com base no Custo e Margem %</p>
                    </div>
                    {formData.custo > 0 && formData.preco > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-black shadow-xs">
                          Lucro Bruto: {formatBRL(formData.preco - formData.custo)}
                        </span>
                        <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-black shadow-xs">
                          Margem: {(((formData.preco - formData.custo) / formData.custo) * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* Preço de Custo */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign size={13} className="text-slate-500" />
                        Preço de Custo (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input font-mono font-bold text-xs rounded-lg"
                        placeholder="0,00"
                        value={formData.custo || ''}
                        onChange={(e) => {
                          const c = parseFloat(e.target.value) || 0
                          const m = formData.margem_lucro_min
                          const p = c > 0 && m > 0 ? parseFloat((c * (1 + m / 100)).toFixed(2)) : formData.preco
                          setFormData({ ...formData, custo: c, preco: p })
                        }}
                      />
                    </div>

                    {/* Margem Lucro Mínima (%) */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Percent size={13} className="text-indigo-600" />
                        Margem de Lucro Mínima (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input font-mono font-bold text-xs rounded-lg"
                        placeholder="31,95"
                        value={formData.margem_lucro_min || ''}
                        onChange={(e) => {
                          const m = parseFloat(e.target.value) || 0
                          const c = formData.custo
                          const p = c > 0 && m > 0 ? parseFloat((c * (1 + m / 100)).toFixed(2)) : formData.preco
                          setFormData({ ...formData, margem_lucro_min: m, preco: p })
                        }}
                      />
                    </div>

                    {/* Margem Lucro Máxima (%) */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Percent size={13} className="text-indigo-600" />
                        Margem de Lucro Máxima (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input font-mono text-xs rounded-lg"
                        placeholder="45,01"
                        value={formData.margem_lucro_max || ''}
                        onChange={(e) => setFormData({ ...formData, margem_lucro_max: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
                    {/* Preço de Venda / Tabela */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign size={13} className="text-indigo-600" />
                        Preço Tabela / Venda (R$) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        className="input font-mono font-black text-sm rounded-lg text-emerald-700 dark:text-emerald-400 border-indigo-300 dark:border-indigo-800"
                        placeholder="240,87"
                        value={formData.preco || ''}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0
                          const c = formData.custo
                          const m = c > 0 && p > 0 ? parseFloat((((p - c) / c) * 100).toFixed(2)) : formData.margem_lucro_min
                          setFormData({ ...formData, preco: p, margem_lucro_min: m })
                        }}
                      />
                    </div>

                    {/* Preço Mínimo */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign size={13} className="text-slate-500" />
                        Preço Mínimo Venda (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input font-mono font-semibold text-xs rounded-lg"
                        placeholder="219,19"
                        value={formData.preco_minimo || ''}
                        onChange={(e) => setFormData({ ...formData, preco_minimo: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    {/* Comissão % */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Percent size={13} className="text-slate-500" />
                        Comissão (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input font-mono text-xs rounded-lg"
                        placeholder="0,00"
                        value={formData.comissao_percent || ''}
                        onChange={(e) => setFormData({ ...formData, comissao_percent: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    {/* Desconto Máximo % */}
                    <div className="space-y-1">
                      <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Percent size={13} className="text-slate-500" />
                        Desconto Máx (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input font-mono text-xs rounded-lg"
                        placeholder="0,00"
                        value={formData.desconto_max_percent || ''}
                        onChange={(e) => setFormData({ ...formData, desconto_max_percent: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                </div>
              )}

              {/* ABA 3: ESTOQUE & CÓDIGO DE BARRAS */}
              {activeModalTab === 'estoque' && (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* Bloco de Estoques */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Warehouse size={15} className="text-indigo-600 dark:text-indigo-400" />
                      Controle de Estoque & Quantidades
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Estoque Real / Atual</label>
                        <input
                          type="number"
                          step="0.001"
                          className="input font-mono font-black text-xs rounded-lg"
                          value={formData.estoque || ''}
                          onChange={(e) => setFormData({ ...formData, estoque: parseFloat(e.target.value) || 0 })}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Estoque Mínimo</label>
                        <input
                          type="number"
                          step="0.001"
                          className="input font-mono text-xs rounded-lg"
                          placeholder="2"
                          value={formData.estoque_minimo || ''}
                          onChange={(e) => setFormData({ ...formData, estoque_minimo: parseFloat(e.target.value) || 0 })}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Estoque Máximo</label>
                        <input
                          type="number"
                          step="0.001"
                          className="input font-mono text-xs rounded-lg"
                          placeholder="10"
                          value={formData.estoque_maximo || ''}
                          onChange={(e) => setFormData({ ...formData, estoque_maximo: parseFloat(e.target.value) || 0 })}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Peso Líquido (KG)</label>
                        <input
                          type="number"
                          step="0.0001"
                          className="input font-mono text-xs rounded-lg"
                          placeholder="0,0000"
                          value={formData.peso || ''}
                          onChange={(e) => setFormData({ ...formData, peso: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloco de Código de Barras */}
                  <div className="p-3.5 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-50 dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 space-y-3 shadow-2xs">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Barcode size={16} className="text-indigo-600 dark:text-indigo-400" />
                      Código de Barras EAN13 & Etiquetas
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Número do Código de Barras</label>
                        <input
                          type="text"
                          className="input font-mono font-bold text-xs rounded-lg"
                          placeholder="Ex: 2000193000014"
                          value={formData.codigo_barras}
                          onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">Padrão / Modelo</label>
                        <select
                          className="input font-mono font-bold text-xs rounded-lg"
                          value={formData.modelo_barras}
                          onChange={(e) => setFormData({ ...formData, modelo_barras: e.target.value })}
                        >
                          {MODELOS_BARRAS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>

                      {/* Barcode Preview Indicator */}
                      <div className="flex flex-col items-center justify-center p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="flex items-center gap-0.5 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-widest font-extrabold">
                          <span>|||||</span>
                          <span>|</span>
                          <span>||||</span>
                          <span>|||</span>
                          <span>||</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400 pt-0.5">
                          {formData.codigo_barras || '2000193000014'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* ABA 4: APLICAÇÃO & OBSERVAÇÕES */}
              {activeModalTab === 'obs' && (
                <div className="space-y-4 animate-fade-in">
                  
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag size={13} className="text-indigo-600 dark:text-indigo-400" />
                      Apresentação / Aplicação do Produto
                    </label>
                    <input
                      type="text"
                      className="input text-xs rounded-lg uppercase"
                      placeholder="Ex: MB25.01 / COMPATÍVEL COM MERCEDES-BENZ 1111/1113"
                      value={formData.apresentacao}
                      onChange={(e) => setFormData({ ...formData, apresentacao: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10.5px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-indigo-600 dark:text-indigo-400" />
                      Observações Técnicas / Notas Internas
                    </label>
                    <textarea
                      rows={5}
                      className="input text-xs rounded-xl uppercase leading-relaxed"
                      placeholder="Insira detalhes adicionais do produto, lote, aplicação técnica..."
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value.toUpperCase() })}
                    />
                  </div>

                </div>
              )}

              {/* RODAPÉ DO MODAL COM BOTÕES DE SALVAR E CANCELAR */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
                <div className="text-[11px] text-slate-400 font-medium">
                  * Campos obrigatórios para salvar o produto
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    className="btn-secondary !py-2 !px-4 text-xs font-extrabold flex items-center gap-1 rounded-xl cursor-pointer" 
                    onClick={() => setIsModalOpen(false)}
                  >
                    <X size={14} /> Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <CheckCircle2 size={15} /> {editingProduct ? 'Salvar Edições' : 'Criar Produto'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}
