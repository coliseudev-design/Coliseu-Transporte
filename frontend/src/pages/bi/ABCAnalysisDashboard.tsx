import { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { 
  DollarSign, Box, BarChart2, AlertTriangle, 
  RefreshCcw, Sparkles, Layers, List, Search, Filter
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatBRL, formatNum } from '../../utils/format';
import clsx from 'clsx';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-primary border border-border shadow-card-hover p-3 rounded-lg z-50">
        <p className="text-text-primary font-bold mb-2 text-sm">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs font-medium mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
            <span className="text-text-secondary">{entry.name}:</span>
            <span className="font-bold text-text-primary">
              {entry.name.includes('Estoque') ? formatBRL(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function InventoryManagementDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  const { data, isLoading, isError } = useBiPeriodQuery(
    ['bi', 'abc'],
    BIService.getABCAnalysis,
    filter
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('');
  const [abcFilter, setAbcFilter] = useState('');
  const [comEstoque, setComEstoque] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  // Mocks explicitly matching the layout
  const barChartData = data?.barChartData || [];
  const distGrupo = data?.distGrupo || [];
  const distMarca = data?.distMarca || [];
  const tableData = data?.tableData || [];
  const kpis = data?.kpis || {
    valor_estoque_custo: 0,
    valor_estoque_venda: 0,
    total_volume: 0,
    skus_com_saldo: 0,
    ruptura_pct: 0,
    curva_a_count: 0,
    curva_b_count: 0,
    curva_c_count: 0
  };

  const marcasDisponiveis = useMemo(() => {
    const marcas = new Set(tableData.map((item: any) => item.marca).filter(Boolean));
    return Array.from(marcas).sort();
  }, [tableData]);

  const gruposDisponiveis = useMemo(() => {
    const grupos = new Set(tableData.map((item: any) => item.grupo).filter(Boolean));
    return Array.from(grupos).sort();
  }, [tableData]);

  const filteredData = useMemo(() => {
    return tableData.filter((item: any) => {
      const matchSearch = item.desc?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.cod?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchMarca = marcaFilter ? item.marca === marcaFilter : true;
      const matchGrupo = grupoFilter ? item.grupo === grupoFilter : true;
      const matchAbc = abcFilter ? item.abc === abcFilter : true;
      const matchEstoque = comEstoque ? item.estoque > 0 : true;

      return matchSearch && matchMarca && matchGrupo && matchAbc && matchEstoque;
    });
  }, [tableData, searchTerm, marcaFilter, grupoFilter, abcFilter, comEstoque]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, marcaFilter, grupoFilter, abcFilter, comEstoque]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Gestão de Inventário...
      </div>
    );
  }


  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            Gestão de Inventário
          </h2>
          <p className="text-sm text-text-secondary mt-1">Controle de estoque, curva ABC e saúde do mix de produtos</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors border border-purple-500/20">
            <Sparkles size={14} /> Analisar com IA
          </button>
          <span className="text-xs font-extrabold text-text-muted uppercase tracking-wider">COMPENSADOS DOURADOS</span>
        </div>
      </div>
      
      {/* FILTROS SUPERIORES */}
      <div className="flex justify-end gap-3 mb-2">
        <select className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none">
          <option>Status: Todos</option>
        </select>
        <select className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none">
          <option>Marca: Todas (292)</option>
        </select>
      </div>

      {/* KPIs (2 ROWS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between hover:border-success/50 transition-colors">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-success/10 rounded-lg"><DollarSign size={14} className="text-success" /></div> VALOR EM ESTOQUE (CUSTO)
          </div>
          <div className="text-2xl font-extrabold text-text-primary mt-2">{formatBRL(kpis.valor_estoque_custo)}</div>
        </div>

        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/50 transition-colors">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg"><DollarSign size={14} className="text-blue-500" /></div> VALOR EM ESTOQUE (VENDA)
          </div>
          <div className="text-2xl font-extrabold text-text-primary mt-2">{formatBRL(kpis.valor_estoque_venda)}</div>
        </div>

        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-blue-400/10 rounded-lg"><Box size={14} className="text-blue-400" /></div> TOTAL ITENS (VOLUME)
          </div>
          <div className="text-2xl font-extrabold text-text-primary mt-2">{formatNum(kpis.total_volume)}</div>
        </div>

        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-purple-500/10 rounded-lg"><RefreshCcw size={14} className="text-purple-500" /></div> GIRO (TURNOVER)
          </div>
          <div className="text-2xl font-extrabold text-text-primary mt-2">-</div>
          <div className="text-[10px] text-text-muted mt-1">Renovação anual do Inventário</div>
        </div>

        <div className="bg-bg-primary border border-danger shadow-card rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-2 right-2"><AlertTriangle size={16} className="text-warning opacity-50" /></div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-danger uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-danger/10 rounded-lg"><AlertTriangle size={14} className="text-danger" /></div> RUPTURA (ZERADO)
          </div>
          <div className="text-2xl font-extrabold text-danger mt-2">4544</div>
          <div className="text-[10px] font-bold text-danger mt-1">Produtos sem estoque — AÇÃO URGENTE</div>
        </div>

        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-warning/10 rounded-lg"><AlertTriangle size={14} className="text-warning" /></div> ESTOQUE CRÍTICO
          </div>
          <div className="text-2xl font-extrabold text-text-primary mt-2">0</div>
          <div className="text-[10px] text-text-muted mt-1">Abaixo do mínimo</div>
        </div>

        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <div className="p-1.5 bg-pink-500/10 rounded-lg"><Box size={14} className="text-pink-500" /></div> OBSOLETO (90D)
          </div>
          <div className="text-2xl font-extrabold text-text-primary mt-2">-</div>
          <div className="text-[10px] text-text-muted mt-1">Sem vendas há 3 meses</div>
        </div>
      </div>

      {/* EFICIÊNCIA DE CAPITAL (Gráfico de Barras) */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <div className="mb-6">
          <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
            <Layers size={16} className="text-blue-400"/> Eficiência de Capital (Top 15 Marcas com Maior Estoque)
          </h3>
          <p className="text-[10px] text-text-muted mt-1 font-medium">
            Altura da Barra: <span className="text-text-secondary">Valor em Estoque</span> | <span className="text-success font-bold">Cor Verde:</span> Giro Rápido | <span className="text-danger font-bold">Cor Vermelha:</span> Giro Lento (Cash Trap)
          </p>
        </div>
        
        <div className="h-[250px] w-full bg-bg-secondary/30 rounded-lg p-4 border border-divider">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
              <YAxis tickFormatter={(v) => `R$ ${v/1000}K`} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="estoque" name="Estoque" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={120}>
                {barChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="#EF4444" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* LISTAGEM DE MARCAS - ESTOQUE POR MARCA */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
          <Layers size={16} className="text-blue-400"/> Listagem de Marcas — Estoque por Marca
        </h3>
        <p className="text-[10px] text-text-muted mt-1 mb-4 font-medium">Quantidade de itens e valor de estoque de cada marca</p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                <th className="pb-3 px-2">MARCA</th>
                <th className="pb-3 px-2">QTD ITENS</th>
                <th className="pb-3 px-2 text-right">VALOR DE ESTOQUE (R$)</th>
                <th className="pb-3 px-2 text-right">% DO TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/30 text-xs">
              <tr className="hover:bg-bg-secondary/50 transition-colors">
                <td className="py-3 px-2 font-bold text-text-primary">N/D</td>
                <td className="py-3 px-2 text-text-secondary">2493</td>
                <td className="py-3 px-2 text-right font-mono font-bold text-success">{formatBRL(670331015.95)}</td>
                <td className="py-3 px-2 text-right font-bold text-blue-500">100.0%</td>
              </tr>
              <tr className="hover:bg-bg-secondary/50 transition-colors bg-blue-500/5">
                <td className="py-3 px-2 font-bold text-blue-500">TOTAL (1 marcas)</td>
                <td className="py-3 px-2 font-bold text-text-primary">2493</td>
                <td className="py-3 px-2 text-right font-mono font-bold text-success">{formatBRL(670331015.95)}</td>
                <td className="py-3 px-2 text-right font-bold text-blue-500">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DISTRIBUIÇÃO GRUPO E MARCA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Grupo */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
          <h3 className="font-bold text-text-primary text-sm mb-6">Distribuição por Grupo (Top 10)</h3>
          <div className="space-y-3">
            {distGrupo.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 text-[10px] font-bold text-text-secondary text-right truncate">{item.name}</div>
                <div className="flex-1 bg-bg-secondary h-4 rounded-sm overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-sm" style={{ width: `${item.value}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Marca */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative">
          <h3 className="font-bold text-text-primary text-sm mb-6">Distribuição por Marca (Top 10)</h3>
          <div className="space-y-3">
            {distMarca.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 text-[10px] font-bold text-text-secondary text-right truncate">{item.name}</div>
                <div className="flex-1 bg-bg-secondary h-4 rounded-sm overflow-hidden group relative">
                  <div className="bg-success h-full rounded-sm hover:brightness-110 cursor-pointer" style={{ width: `${item.value}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DETAILED TABLE SECTION */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
        {/* Table Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar produto ou código..." 
              className="w-full bg-bg-secondary border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
            />
          </div>
          <select 
            value={marcaFilter}
            onChange={(e) => setMarcaFilter(e.target.value)}
            className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs outline-none"
          >
            <option value="">Todas Marcas ({marcasDisponiveis.length})</option>
            {marcasDisponiveis.map((m: any) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select 
            value={grupoFilter}
            onChange={(e) => setGrupoFilter(e.target.value)}
            className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs outline-none"
          >
            <option value="">Todos Grupos ({gruposDisponiveis.length})</option>
            {gruposDisponiveis.map((g: any) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select 
            value={abcFilter}
            onChange={(e) => setAbcFilter(e.target.value)}
            className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs outline-none"
          >
            <option value="">Classe ABC: Todas</option>
            <option value="A">Curva A</option>
            <option value="B">Curva B</option>
            <option value="C">Curva C</option>
          </select>
          <button 
            onClick={() => setComEstoque(!comEstoque)}
            className={clsx(
              "border px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors",
              comEstoque 
                ? "bg-success/10 text-success border-success/30" 
                : "bg-bg-secondary text-text-muted border-border"
            )}
          >
            <span className={clsx("w-2 h-2 rounded-full", comEstoque ? "bg-success" : "bg-text-muted")}></span> 
            Com Estoque
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] font-medium text-text-muted mb-4 px-2 border-b border-divider pb-4">
          <Filter size={12} />
          <div className="flex items-center gap-1 bg-brand-500/20 text-brand-500 px-2 py-0.5 rounded-full border border-brand-500/30">Todos</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger"></span> Crítico</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning"></span> Atenção</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success"></span> Ideal</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Sem Giro</div>
          <div className="ml-auto">{filteredData.length} itens encontrados</div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="text-[9px] text-text-muted uppercase font-bold tracking-wider">
                <th className="pb-3 px-2">CÓDIGO</th>
                <th className="pb-3 px-2">DESCRIÇÃO</th>
                <th className="pb-3 px-2">EMB.</th>
                <th className="pb-3 px-2">MARCA</th>
                <th className="pb-3 px-2">GRUPO</th>
                <th className="pb-3 px-2 text-center">ABC</th>
                <th className="pb-3 px-2">STATUS</th>
                <th className="pb-3 px-2 text-right">ESTOQUE</th>
                <th className="pb-3 px-2 text-right">CUSTO</th>
                <th className="pb-3 px-2 text-right">PREÇO</th>
                <th className="pb-3 px-2 text-center">DIAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/30 text-xs">
              {paginatedData.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-bg-secondary/30 transition-colors">
                  <td className="py-3 px-2 font-mono font-bold text-blue-500">{row.cod}</td>
                  <td className="py-3 px-2 font-bold text-text-primary truncate max-w-[250px]">{row.desc}</td>
                  <td className="py-3 px-2 text-text-secondary">{row.emb}</td>
                  <td className="py-3 px-2 text-text-secondary">{row.marca}</td>
                  <td className="py-3 px-2 text-text-secondary">{row.grupo}</td>
                  <td className="py-3 px-2 text-center font-black">{row.abc}</td>
                  <td className="py-3 px-2">
                    <span className={clsx(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      row.status === 'Crítico' ? "bg-danger/10 text-danger" : 
                      row.status === 'Atenção' ? "bg-warning/10 text-warning" : 
                      row.status === 'Ideal' ? "bg-success/10 text-success" : 
                      "bg-purple-500/10 text-purple-500"
                    )}>{row.status}</span>
                  </td>
                  <td className="py-3 px-2 text-right font-mono font-bold flex justify-end items-center gap-1">
                    {row.alert && <AlertTriangle size={12} className="text-danger" />}
                    <span className={row.alert ? "text-danger" : "text-text-primary"}>{row.estoque.toFixed(2)}</span>
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-text-muted">{formatBRL(row.custo)}</td>
                  <td className="py-3 px-2 text-right font-mono text-text-primary font-bold">{formatBRL(row.preco)}</td>
                  <td className="py-3 px-2 text-center font-bold text-success">{row.dias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex justify-center items-center gap-2 mt-4 pt-4 border-t border-divider">
           <button 
             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
             disabled={currentPage === 1}
             className="w-6 h-6 rounded flex items-center justify-center bg-bg-secondary text-text-muted hover:bg-border disabled:opacity-50"
           >
             &lt;
           </button>
           
           <button className="h-6 px-3 rounded flex items-center justify-center bg-blue-500/20 text-blue-500 font-bold border border-blue-500/30">
             {currentPage}
           </button>
           
           <button 
             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
             disabled={currentPage === totalPages}
             className="w-6 h-6 rounded flex items-center justify-center bg-bg-secondary text-text-muted hover:bg-border disabled:opacity-50"
           >
             &gt;
           </button>
           <span className="text-[10px] text-text-muted ml-2">Pág. {currentPage} de {totalPages} ({filteredData.length} itens)</span>
        </div>
      </div>

      {isError && (
        <div className="bg-danger/10 border border-danger/20 text-danger p-3 rounded-lg text-sm mt-4">
          Aviso: Os dados não puderam ser carregados devido a uma falha de conexão com o banco de dados/API.
        </div>
      )}
    </div>
  );
}
