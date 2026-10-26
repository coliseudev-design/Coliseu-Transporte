import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  MapPin, Navigation, Truck, Package, CheckCircle2, Clock,
  Route as RouteIcon, Phone, User, AlertTriangle, ChevronRight,
  Play, Flag, ArrowLeft, Loader2, Maximize2
} from 'lucide-react';

interface Ponto {
  id: number;
  ordem_entrega: number;
  tipo_ponto: string;
  documento_tipo: string;
  documento_chave: string;
  cliente_nome: string;
  documento_cliente: string;
  endereco_completo: string;
  municipio: string;
  uf: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
  peso_kg: number;
  valor_produtos: number;
  status_entrega: 'PENDENTE' | 'ENTREGUE' | 'RECUSADO' | 'REENTREGA';
  entregue_em: string;
  recebedor_nome: string;
  recebedor_documento?: string;
  observacao: string;
}

interface Roteiro {
  id: number;
  mdfe_id: number;
  titulo: string;
  status: string;
  distancia_total_km: number;
  tempo_estimado_minutos: number;
  total_paradas: number;
  peso_total_kg: number;
  valor_total_carga: number;
  veiculo_placa: string;
  motorista_nome: string;
  motorista_cpf: string;
  uf_inicio: string;
  uf_fim: string;
  mdfe_numero: number;
  mdfe_status: string;
}

interface Mdfe {
  id: number;
  numero: number;
  ref: string;
  status: string;
  veiculo_placa: string;
  motorista_nome: string;
  uf_inicio: string;
  uf_fim: string;
  qtd_cte: number;
  valor_carga: number;
  peso_bruto: number;
}

const STATUS_ENTREGA: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: 'Pendente', cor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' },
  ENTREGUE: { label: 'Entregue', cor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' },
  RECUSADO: { label: 'Recusado', cor: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300' },
  REENTREGA: { label: 'Reentrega', cor: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300' }
};

export default function RoteiroEntregaPage() {
  const qc = useQueryClient();
  const [mdfeSelecionado, setMdfeSelecionado] = useState<number | null>(null);
  const [pontoSelecionado, setPontoSelecionado] = useState<Ponto | null>(null);
  const [modalEntrega, setModalEntrega] = useState<Ponto | null>(null);
  const [recebedorNome, setRecebedorNome] = useState('');
  const [recebedorDoc, setRecebedorDoc] = useState('');
  const [observacao, setObservacao] = useState('');
  const [statusEntrega, setStatusEntrega] = useState('ENTREGUE');
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapaInstancia = useRef<any>(null);
  const marcadores = useRef<any[]>([]);
  const polyline = useRef<any>(null);

  // MDF-e disponíveis para roteirização
  const { data: mdfesData, isLoading: loadingMdfes } = useQuery({
    queryKey: ['mdfes-roteiro'],
    queryFn: async () => (await api.get('/transporte/mdfes')).data
  });
  const mdfes: Mdfe[] = mdfesData?.data || [];

  // Roteiro do MDF-e selecionado
  const { data: roteiroData, isLoading: loadingRoteiro } = useQuery({
    queryKey: ['roteiro', mdfeSelecionado],
    queryFn: async () => {
      const res = await api.get(`/transporte/roteiro/${mdfeSelecionado}`);
      return res.data;
    },
    enabled: !!mdfeSelecionado
  });

  const roteiro: Roteiro | undefined = roteiroData?.data?.roteiro;
  const pontos: Ponto[] = roteiroData?.data?.pontos || [];
  const metricas = roteiroData?.data?.metricas;

  // Mutação para registrar entrega
  const registrarEntrega = useMutation({
    mutationFn: async (payload: { id: number; status_entrega: string; recebedor_nome: string; recebedor_documento: string; observacao: string }) => {
      return api.patch(`/transporte/roteiro/pontos/${payload.id}`, {
        status_entrega: payload.status_entrega,
        recebedor_nome: payload.recebedor_nome,
        recebedor_documento: payload.recebedor_documento,
        observacao: payload.observacao
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roteiro', mdfeSelecionado] });
      setModalEntrega(null);
      setRecebedorNome('');
      setRecebedorDoc('');
      setObservacao('');
    }
  });

  // ── Carregamento do mapa (Leaflet via CDN) ──
  useEffect(() => {
    if (!mapaRef.current || !window.L) return;

    if (!mapaInstancia.current) {
      mapaInstancia.current = window.L.map(mapaRef.current, {
        zoomControl: true,
        attributionControl: true
      });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(mapaInstancia.current);
    }
  }, [roteiroData]);

  // Desenha marcadores e polyline quando os pontos mudam
  useEffect(() => {
    const mapa = mapaInstancia.current;
    if (!mapa || !window.L) return;

    marcadores.current.forEach(m => mapa.removeLayer(m));
    marcadores.current = [];
    if (polyline.current) {
      mapa.removeLayer(polyline.current);
      polyline.current = null;
    }

    const comCoordenada = pontos.filter(p => p.latitude && p.longitude);

    if (comCoordenada.length === 0) return;

    // Polyline da rota
    const latlngs: [number, number][] = comCoordenada.map(
      p => [Number(p.latitude), Number(p.longitude)]
    );
    polyline.current = window.L.polyline(latlngs, {
      color: '#0EA5E9',
      weight: 4,
      opacity: 0.8,
      dashArray: '10 8',
      lineCap: 'round'
    }).addTo(mapa);

    // Marcadores numerados
    comCoordenada.forEach((p, idx) => {
      const entregue = p.status_entrega === 'ENTREGUE';
      const icone = window.L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 32px; height: 32px; border-radius: 9999px;
          background: ${entregue ? '#10B981' : '#0EA5E9'};
          color: white; display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 13px; font-family: system-ui, sans-serif;
          border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        ">${p.ordem_entrega}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = window.L.marker([Number(p.latitude), Number(p.longitude)], { icon: icone })
        .addTo(mapa)
        .bindPopup(`
          <div style="font-family: system-ui, sans-serif; min-width: 200px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${p.cliente_nome}</div>
            <div style="font-size: 12px; color: #64748B;">${p.municipio}/${p.uf}</div>
            ${p.endereco_completo ? `<div style="font-size: 12px; margin-top: 4px;">${p.endereco_completo}</div>` : ''}
            <div style="font-size: 12px; margin-top: 6px; font-weight: 600;">${Number(p.peso_kg || 0).toLocaleString('pt-BR')} kg · R$ ${Number(p.valor_produtos || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        `);

      marker.on('click', () => setPontoSelecionado(p));
      marcadores.current.push(marker);
    });

    // Ajusta o zoom para caber todas as paradas
    if (latlngs.length > 1) {
      mapa.fitBounds(latlngs, { padding: [50, 50] });
    } else if (latlngs.length === 1) {
      mapa.setView(latlngs[0], 12);
    }
  }, [pontos, roteiroData]);

  const entregasConcluidas = useMemo(
    () => pontos.filter(p => p.status_entrega === 'ENTREGUE').length,
    [pontos]
  );

  const abrirModalEntrega = (ponto: Ponto) => {
    setModalEntrega(ponto);
    setStatusEntrega(ponto.status_entrega === 'ENTREGUE' ? 'ENTREGUE' : 'ENTREGUE');
    setRecebedorNome(ponto.recebedor_nome || '');
    setRecebedorDoc(ponto.recebedor_documento || '');
    setObservacao(ponto.observacao || '');
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <RouteIcon className="w-7 h-7 text-sky-600" />
          Roteiro de Entrega
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Gere o roteiro a partir de um MDF-e autorizado: paradas na ordem, endereços, mapa e baixa de entrega.
        </p>
      </div>

      {/* Seleção do MDF-e */}
      {!mdfeSelecionado ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <ChevronRight className="w-4 h-4" />
            Selecione o MDF-e da viagem
          </div>

          {loadingMdfes ? (
            <div className="p-12 text-center text-slate-400 text-sm">Carregando manifestos...</div>
          ) : mdfes.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
              <Truck className="w-12 h-12 mx-auto text-slate-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum MDF-e disponível</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Emita um MDF-e com CT-es vinculados para gerar o roteiro da viagem.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mdfes.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMdfeSelecionado(m.id)}
                  disabled={!['AUTORIZADO', 'ENCERRADO'].includes(m.status)}
                  className="text-left bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm hover:border-sky-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-xs font-mono text-slate-400">MDF-e {m.numero || m.ref}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      m.status === 'AUTORIZADO'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : m.status === 'ENCERRADO'
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                    {m.uf_inicio} <ChevronRight className="w-4 h-4 text-slate-400" /> {m.uf_fim}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">{m.veiculo_placa}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{m.motorista_nome}</p>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-between text-xs">
                    <span className="text-slate-500">{m.qtd_cte} CT-e(s)</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {Number(m.peso_bruto || 0).toLocaleString('pt-BR')} kg
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Barra de contexto da viagem */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => { setMdfeSelecionado(null); setPontoSelecionado(null); }}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white">
                    {roteiro?.titulo || `Viagem ${mdfes.find(m => m.id === mdfeSelecionado)?.uf_inicio} → ${mdfes.find(m => m.id === mdfeSelecionado)?.uf_fim}`}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {roteiro?.veiculo_placa} · {roteiro?.motorista_nome} · {roteiro?.motorista_cpf}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'Paradas', value: pontos.length, icon: MapPin, cor: 'text-sky-600' },
                  { label: 'Entregues', value: entregasConcluidas, icon: CheckCircle2, cor: 'text-emerald-600' },
                  { label: 'Distância', value: `${Number(roteiro?.distancia_total_km || 0).toLocaleString('pt-BR')} km`, icon: Navigation, cor: 'text-violet-600' },
                  { label: 'Tempo est.', value: `${Math.floor(Number(roteiro?.tempo_estimado_minutos || 0) / 60)}h ${Number(roteiro?.tempo_estimado_minutos || 0) % 60}min`, icon: Clock, cor: 'text-amber-600' }
                ].map(k => {
                  const Icon = k.icon;
                  return (
                    <div key={k.label} className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${k.cor}`} />
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{k.label}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">{k.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {metricas && metricas.concluidas_percentual > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Progresso das entregas</span>
                  <span className="font-bold text-slate-900 dark:text-white">{metricas.concluidas_percentual}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-500"
                    style={{ width: `${metricas.concluidas_percentual}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Layout: Mapa + Lista de paradas */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            {/* Mapa */}
            <div className="xl:col-span-3">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/60">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-sky-500" />
                    Mapa da rota
                  </h3>
                  {pontos.length > 0 && (
                    <button
                      onClick={() => {
                        const comCoord = pontos.filter(p => p.latitude && p.longitude);
                        if (comCoord.length > 1 && mapaInstancia.current) {
                          mapaInstancia.current.fitBounds(
                            comCoord.map(p => [p.latitude, p.longitude]),
                            { padding: [50, 50] }
                          );
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Ver tudo
                    </button>
                  )}
                </div>
                <div
                  ref={mapaRef}
                  className="w-full h-[480px] bg-slate-100 dark:bg-slate-900"
                  style={{ zIndex: 0 }}
                />
                {pontos.length === 0 && !loadingRoteiro && (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Nenhuma parada gerada. Vincule CT-e/NF-e ao MDF-e para montar a rota.
                  </div>
                )}
              </div>
            </div>

            {/* Lista de paradas */}
            <div className="xl:col-span-2">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 overflow-hidden flex flex-col max-h-[560px]">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    Paradas de entrega
                  </h3>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {entregasConcluidas}/{pontos.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                  {loadingRoteiro ? (
                    <div className="p-10 text-center">
                      <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                      <p className="text-xs text-slate-400 mt-2">Montando roteiro...</p>
                    </div>
                  ) : pontos.length === 0 ? (
                    <p className="p-10 text-center text-xs text-slate-400">
                      Sem paradas. Este MDF-e não tem documentos vinculados.
                    </p>
                  ) : (
                    pontos.map(p => {
                      const st = STATUS_ENTREGA[p.status_entrega] || STATUS_ENTREGA.PENDENTE;
                      const ativo = pontoSelecionado?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setPontoSelecionado(p)}
                          className={`w-full text-left px-5 py-3.5 transition-colors ${
                            ativo ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                              p.status_entrega === 'ENTREGUE'
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}>
                              {p.status_entrega === 'ENTREGUE' ? <CheckCircle2 className="w-4 h-4" /> : p.ordem_entrega}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {p.cliente_nome}
                                </p>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cor}`}>
                                  {st.label}
                                </span>
                              </div>

                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {p.municipio}/{p.uf}
                                {p.endereco_completo && ` · ${p.endereco_completo}`}
                              </p>

                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  {Number(p.peso_kg || 0).toLocaleString('pt-BR')} kg
                                </span>
                                <span className="flex items-center gap-1">
                                  <FileTextIcon />
                                  {p.documento_tipo} {p.documento_chave?.slice(-8)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Detalhe da parada selecionada */}
          {pontoSelecionado && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Parada {pontoSelecionado.ordem_entrega}
                    </p>
                    <h4 className="font-bold text-slate-900 dark:text-white text-lg">
                      {pontoSelecionado.cliente_nome}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      {pontoSelecionado.endereco_completo
                        ? `${pontoSelecionado.endereco_completo} — `
                        : ''}{pontoSelecionado.municipio}/{pontoSelecionado.uf}
                      {pontoSelecionado.cep && ` · CEP ${pontoSelecionado.cep}`}
                    </p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        {Number(pontoSelecionado.peso_kg || 0).toLocaleString('pt-BR')} kg
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5" />
                        {pontoSelecionado.documento_tipo} {pontoSelecionado.documento_chave?.slice(-11)}
                      </span>
                      {pontoSelecionado.documento_cliente && (
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" />
                          {pontoSelecionado.documento_cliente}
                        </span>
                      )}
                    </div>
                    {pontoSelecionado.observacao && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                        "{pontoSelecionado.observacao}"
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => abrirModalEntrega(pontoSelecionado)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Registrar Entrega
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de baixa de entrega */}
      {modalEntrega && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Registrar Entrega
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {modalEntrega.ordem_entrega}. {modalEntrega.cliente_nome} — {modalEntrega.municipio}/{modalEntrega.uf}
            </p>

            <div className="space-y-4 mt-5 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Situação *</label>
                <select
                  value={statusEntrega}
                  onChange={e => setStatusEntrega(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="ENTREGUE">Entregue</option>
                  <option value="RECUSADO">Recusado pelo destinatário</option>
                  <option value="REENTREGA">Programar reentrega</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">
                  Recebedor (nome de quem recebeu)
                </label>
                <input
                  type="text" placeholder="Nome do recebedor ou responsável"
                  value={recebedorNome}
                  onChange={e => setRecebedorNome(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">CPF do recebedor</label>
                <input
                  type="text" placeholder="000.000.000-00"
                  value={recebedorDoc}
                  onChange={e => setRecebedorDoc(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1">Observação</label>
                <textarea
                  rows={3} placeholder="Ex: receivers assinado porSecurity, deixar na portaria..."
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setModalEntrega(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => registrarEntrega.mutate({
                  id: modalEntrega.id,
                  status_entrega: statusEntrega,
                  recebedor_nome: recebedorNome,
                  recebedor_documento: recebedorDoc,
                  observacao
                })}
                disabled={registrarEntrega.isPending}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
              >
                {registrarEntrega.isPending ? 'Salvando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ícone de documento fiscal (evita import extra) */
function FileTextIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
