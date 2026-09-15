import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { User, ShieldAlert, ShoppingCart, Calendar, Heart, Search, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function Radar360Dashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();
  const [customerId, setCustomerId] = useState<number>(456); // Mock inicial para demonstração
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<{id: number, nome: string, cnpj: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useBiPeriodQuery(
    ['bi', 'radar360', customerId],
    () => BIService.getRadar360(customerId, filter),
    filter
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (searchInput.length >= 3) {
        setIsSearching(true);
        try {
          const results = await BIService.searchCustomers(searchInput);
          setSearchResults(results);
          setShowDropdown(true);
        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }, 400);

    return () => clearTimeout(searchTimer);
  }, [searchInput]);

  const handleSelectCustomer = (customer: {id: number, nome: string}) => {
    setCustomerId(customer.id);
    setSearchInput(customer.nome);
    setShowDropdown(false);
  };

  const handleSearch = () => {
    if (searchInput && !isNaN(Number(searchInput))) {
      setCustomerId(Number(searchInput));
    }
  };

  // Mock fallback
  const mockRadar = {
    customer_dna: {
      id: 456, nome: "Loja Premium ABC", cnpj: "12.345.678/0001-90",
      cidade: "São Paulo", estado: "SP", telefone: "(11) 3456-7890", email: "contato@lojapremium.com.br",
      data_cadastro: "2020-05-15", status: "ATIVO", tipo_cliente: "VAREJO", segmento: "PREMIUM"
    },
    customer_metrics: {
      faturamento_total: 250000.00, faturamento_anual: 125000.00, quantidade_pedidos: 156,
      ticket_medio: 1602.56, ultima_compra: "2026-01-18", dias_sem_comprar: 3,
      frequencia_dias: 15.4, margem_media_pct: 27.8, risco_churn_pct: 5.2
    },
    customer_habits: {
      produto_favorito: { id: 789, descricao: "Produto Premium XYZ", quantidade_comprada: 45, valor_total: 45000.00, margem_pct: 30.5 },
      marca_favorita: { marca: "Brand Premium", quantidade_comprada: 78, valor_total: 78000.00, percentual_compras: 31.2 },
      categoria_favorita: { categoria: "Eletrônicos", quantidade_comprada: 92, valor_total: 92000.00, percentual_compras: 36.8 },
      melhor_dia_semana: "SEGUNDA", melhor_horario: "09:00-12:00",
      sazonalidade: []
    },
    customer_orders_history: [
      { id: 12345, numero_nota: "NF-001234", data_emissao: "2026-01-18", vendedor_nome: "João Silva", valor_total: 5420.50, quantidade_itens: 12, margem_pct: 28.5, status: "FATURADO" }
    ],
    risk_assessment: {
      risco_churn_pct: 5.2, motivo_risco: "Frequência de compra reduzida em 40% nos últimos 3 meses", recomendacao: "Contato comercial urgente para reativação", score_saude: 8.5, status_saude: "SAUDÁVEL" as const
    }
  };

  // Formatter and fallback
  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // Safely map API response to the expected structure
  const radar = data ? {
    customer_dna: {
      id: data.dna?.cliente_id || mockRadar.customer_dna.id,
      nome: data.dna?.nome || mockRadar.customer_dna.nome,
      cnpj: data.dna?.documento || mockRadar.customer_dna.cnpj,
      cidade: data.dna?.cidade || mockRadar.customer_dna.cidade,
      estado: data.dna?.estado || mockRadar.customer_dna.estado,
      telefone: mockRadar.customer_dna.telefone,
      email: mockRadar.customer_dna.email,
      data_cadastro: data.dna?.data_cadastro ? new Date(data.dna.data_cadastro).toLocaleDateString('pt-BR') : mockRadar.customer_dna.data_cadastro,
      status: data.dna?.status || mockRadar.customer_dna.status,
      tipo_cliente: mockRadar.customer_dna.tipo_cliente,
      segmento: mockRadar.customer_dna.segmento
    },
    customer_metrics: {
      faturamento_total: data.dna?.ltv || 0,
      faturamento_anual: mockRadar.customer_metrics.faturamento_anual,
      quantidade_pedidos: data.behavior?.frequencia_dias || 0, // Using behavior frequencia_dias just as a placeholder since bi.js didn't return total orders
      ticket_medio: data.behavior?.ticket_medio_historico || 0,
      ultima_compra: data.risk_assessment?.ultima_compra ? new Date(data.risk_assessment.ultima_compra).toLocaleDateString('pt-BR') : 'N/A',
      dias_sem_comprar: data.risk_assessment?.dias_sem_comprar || 0,
      frequencia_dias: data.behavior?.frequencia_dias || 0,
      margem_media_pct: mockRadar.customer_metrics.margem_media_pct,
      risco_churn_pct: data.risk_assessment?.risco_churn_pct || 0
    },
    customer_habits: {
      produto_favorito: { descricao: data.behavior?.produto_favorito || "Pendente", quantidade_comprada: 0 },
      marca_favorita: { marca: data.behavior?.marca_favorita || "Pendente", percentual_compras: 0 },
      categoria_favorita: mockRadar.customer_habits.categoria_favorita,
      melhor_dia_semana: mockRadar.customer_habits.melhor_dia_semana,
      melhor_horario: mockRadar.customer_habits.melhor_horario,
      sazonalidade: []
    },
    customer_orders_history: data.order_history || [],
    risk_assessment: {
      risco_churn_pct: data.risk_assessment?.risco_churn_pct || 0,
      motivo_risco: "Baseado no LTV e dias sem comprar",
      recomendacao: "Acompanhar",
      score_saude: 10 - ((data.risk_assessment?.risco_churn_pct || 0) / 10),
      status_saude: data.risk_assessment?.tendencia === 'ESTAVEL' || data.risk_assessment?.tendencia === 'CRESCIMENTO' ? "SAUDÁVEL" : "EM RISCO"
    }
  } : mockRadar;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Busca de Cliente */}
      <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Visão 360 do Cliente</h3>
          <p className="text-sm text-text-secondary">Pesquise um cliente para ver seu DNA e hábitos</p>
        </div>
        <div className="flex gap-2 relative" ref={dropdownRef}>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Nome, CNPJ ou ID..." 
              className="bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary w-64"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
            />
            {isSearching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" />
            )}
            
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full max-w-[400px] min-w-[250px] bg-bg-primary border border-border-primary shadow-xl rounded-lg overflow-hidden z-50">
                <ul className="max-h-60 overflow-y-auto">
                  {searchResults.map((c) => (
                    <li 
                      key={c.id} 
                      onClick={() => handleSelectCustomer(c)}
                      className="px-4 py-2 hover:bg-bg-secondary cursor-pointer border-b border-border-primary/50 last:border-0"
                    >
                      <div className="text-sm font-bold text-text-primary truncate">{c.nome}</div>
                      <div className="text-xs text-text-muted">{c.cnpj} | ID: {c.id}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button onClick={handleSearch} className="bg-brand-500 text-white p-2 rounded-lg hover:bg-brand-600 transition-colors">
            <Search size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-text-secondary">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
          Buscando DNA do Cliente...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* DNA (Perfil Base) */}
            <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-brand-500/10 text-brand-500 rounded-full flex items-center justify-center mb-4">
                <User size={40} />
              </div>
              <h2 className="text-xl font-bold text-text-primary">{radar.customer_dna.nome}</h2>
              <p className="text-sm text-text-secondary mb-4">{radar.customer_dna.cnpj}</p>
              
              <div className="w-full space-y-2 text-sm text-left">
                <div className="flex justify-between py-1 border-b border-border-primary">
                  <span className="text-text-secondary">Localidade</span>
                  <span className="font-medium text-text-primary">{radar.customer_dna.cidade}/{radar.customer_dna.estado}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-primary">
                  <span className="text-text-secondary">Segmento</span>
                  <span className="font-medium text-text-primary">{radar.customer_dna.segmento}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-primary">
                  <span className="text-text-secondary">Desde</span>
                  <span className="font-medium text-text-primary">{radar.customer_dna.data_cadastro}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-text-secondary">Status</span>
                  <span className="font-medium text-green-500">{radar.customer_dna.status}</span>
                </div>
              </div>
            </div>

            {/* Métricas e Risco */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-text-secondary mb-4 flex items-center">
                  <ShoppingCart size={16} className="mr-2" /> Visão Financeira
                </h3>
                <div className="text-3xl font-bold text-text-primary mb-1">{formatCurrency(radar.customer_metrics.faturamento_total)}</div>
                <div className="text-sm text-text-secondary mb-4">Faturamento Vitalício</div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-bg-secondary p-2 rounded">
                    <div className="text-text-secondary text-xs">Ticket Médio</div>
                    <div className="font-semibold text-text-primary">{formatCurrency(radar.customer_metrics.ticket_medio)}</div>
                  </div>
                  <div className="bg-bg-secondary p-2 rounded">
                    <div className="text-text-secondary text-xs">Pedidos</div>
                    <div className="font-semibold text-text-primary">{radar.customer_metrics.quantidade_pedidos}</div>
                  </div>
                </div>
              </div>

              <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm flex flex-col">
                <h3 className="text-sm font-semibold text-text-secondary mb-4 flex items-center">
                  <ShieldAlert size={16} className="mr-2" /> Risco de Churn (Evasão)
                </h3>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-3xl font-bold text-green-500">{radar.risk_assessment.risco_churn_pct}%</div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Status: {radar.risk_assessment.status_saude}</div>
                    <div className="text-xs text-text-secondary">Score Saúde: {radar.risk_assessment.score_saude}/10</div>
                  </div>
                </div>

                <div className="bg-bg-secondary p-2 rounded mt-auto text-sm">
                  <div className="text-text-secondary text-xs">Última Compra</div>
                  <div className="font-semibold text-text-primary">{radar.customer_metrics.ultima_compra} ({radar.customer_metrics.dias_sem_comprar} dias atrás)</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hábitos de Compra */}
            <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm">
              <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center">
                <Heart size={18} className="text-brand-500 mr-2" /> Hábitos de Compra
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-border-primary">
                  <div>
                    <span className="block text-xs text-text-secondary uppercase">Produto Favorito</span>
                    <span className="font-medium text-text-primary">{radar.customer_habits.produto_favorito.descricao}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-bold text-text-primary">{radar.customer_habits.produto_favorito.quantidade_comprada}x</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border-primary">
                  <div>
                    <span className="block text-xs text-text-secondary uppercase">Marca Favorita</span>
                    <span className="font-medium text-text-primary">{radar.customer_habits.marca_favorita.marca}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-bold text-text-primary">{radar.customer_habits.marca_favorita.percentual_compras}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="block text-xs text-text-secondary uppercase">Melhor Dia/Hora</span>
                    <span className="font-medium text-text-primary">{radar.customer_habits.melhor_dia_semana} às {radar.customer_habits.melhor_horario}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Histórico Pedidos */}
            <div className="bg-bg-primary border border-border-primary rounded-xl shadow-sm flex flex-col">
              <div className="p-4 border-b border-border-primary flex items-center">
                <Calendar size={18} className="text-brand-500 mr-2" />
                <h3 className="text-base font-semibold text-text-primary">Histórico de Pedidos</h3>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {radar.customer_orders_history.map(order => (
                    <div key={order.id} className="flex justify-between items-center p-3 bg-bg-secondary/50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-text-primary">{order.numero_nota}</div>
                        <div className="text-xs text-text-secondary">{order.data_emissao} • {order.quantidade_itens} itens</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-text-primary">{formatCurrency(order.valor_total)}</div>
                        <div className={`text-xs font-medium ${order.status === 'FATURADO' ? 'text-green-500' : 'text-yellow-500'}`}>{order.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {isError && !isLoading && (
        <div className="bg-orange-500/10 border border-orange-500/20 text-orange-500 p-3 rounded-lg text-sm mt-4">
          Aviso: Os dados não puderam ser carregados devido a uma falha de conexão com o banco de dados/API.
        </div>
      )}
    </div>
  );
}
