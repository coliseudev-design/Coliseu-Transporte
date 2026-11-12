import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import TabelaResponsiva from '../../components/TabelaResponsiva';
import {
  CampoFiscal,
  GradeCampos,
  SelectFiscal,
  InputFiscal,
  TextareaFiscal,
  mascaras
} from '../../components/fiscal/CampoFiscal';
import {
  BadgeCheck,
  Search,
  Plus,
  Copy,
  Download,
  Ban,
  Eye,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  Truck,
  Calculator,
  Wallet,
  CheckSquare,
  Send,
  Settings,
  ArrowRight,
  Scale,
  KeyRound,
  Printer
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
  municipio_inicio?: string;
  codigo_ibge_inicio?: string;
  uf_fim: string;
  municipio_fim?: string;
  codigo_ibge_fim?: string;
  distancia_km?: number;
  categoria_carga_antt?: string;
  quantidade_eixos?: number;
  veiculo_id?: number;
  veiculo_placa?: string;
  motorista_id?: number;
  motorista_nome?: string;
  motorista_cpf?: string;
  valor_frete: number;
  valor_adiantamento: number;
  valor_pedagio: number;
  valor_combustivel?: number;
  valor_inss?: number;
  valor_irrf?: number;
  valor_sest_senat?: number;
  forma_quitacao: string;
  chave_pix?: string;
  piso_minimo_antt: number;
  piso_minimo_aprovado: boolean;
  piso_isento?: boolean;
  piso_isencao_motivo?: string;
  ciot_status: string;
  ciot_codigo: string;
  ciot_verificador?: string;
  ciot_protocolo_formatado?: string;
  ciot_provedor?: string;
  ciot_protocolo_encerramento?: string;
  ciot_encerrado_em?: string;
  ciot_payload_antt: any;
  mdfe_id?: number;
  mdfe_numero?: number;
  mdfe_status?: string;
  gerar_financeiro?: boolean;
  financeiro_ids?: number[];
  created_at: string;
}

interface TituloFinanceiro {
  id: number;
  descricao: string;
  cliente_nome: string;
  data_emissao: string;
  data_vencimento: string;
  valor: number;
  valor_pago: number;
  status_pagamento: string;
  especie_nome: string;
  numero_parcela: number;
  tipo_parcela: string;
}

const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const CATEGORIAS_ANTT = [
  { valor: 'GERAL', rotulo: 'Carga Geral' },
  { valor: 'GRANEL_SOLIDO', rotulo: 'Granel Sólido' },
  { valor: 'GRANEL_LIQUIDO', rotulo: 'Granel Líquido' },
  { valor: 'FRIGORIFICADA', rotulo: 'Frigorificada ou Aquecida' },
  { valor: 'CONTEINERIZADA', rotulo: 'Conteinerizada' },
  { valor: 'NEOGRANEL', rotulo: 'Neogranel' },
  { valor: 'PERIGOSA_GERAL', rotulo: 'Carga Perigosa (Geral)' }
];

const EIXOS_OPCOES = [
  { valor: '2', rotulo: '2 Eixos (Toco / Leve)' },
  { valor: '3', rotulo: '3 Eixos (Truck)' },
  { valor: '4', rotulo: '4 Eixos (Bitruck / Carreta Simples)' },
  { valor: '5', rotulo: '5 Eixos (Carreta 2+3)' },
  { valor: '6', rotulo: '6 Eixos (Carreta LS / Vanderleia)' },
  { valor: '7', rotulo: '7 Eixos (Bitrem)' },
  { valor: '9', rotulo: '9 Eixos (Rodotrem)' }
];

const STATUS_CIOT: Record<string, { rotulo: string; cor: string }> = {
  PENDENTE: {
    rotulo: 'Pendente',
    cor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
  },
  GERADO: {
    rotulo: 'Payload Gerado',
    cor: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
  },
  TRANSMITIDO: {
    rotulo: 'Ativo na ANTT',
    cor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
  },
  ENCERRADO: {
    rotulo: 'Encerrado',
    cor: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
  },
  CANCELADO: {
    rotulo: 'Cancelado',
    cor: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
  }
};

const criarFormInicial = (em?: any) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const entrega = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  return {
    contratante_nome: em?.razao_social || '',
    contratante_documento: em?.cnpj ? mascaras.cpfCnpj(em.cnpj) : '',
    transportador_nome: '',
    transportador_documento: '',
    transportador_rntrc: '',
    tipo_transporte: '2',
    tipo_operacao: 'Carga Lotacao',
    veiculo_id: '',
    veiculo_placa: '',
    quantidade_eixos: '2',
    motorista_id: '',
    motorista_nome: '',
    motorista_cpf: '',
    uf_inicio: em?.uf || 'MS',
    municipio_inicio: em?.municipio || 'Dourados',
    codigo_ibge_inicio: em?.codigo_municipio || '5003702',
    uf_fim: 'MS',
    municipio_fim: '',
    codigo_ibge_fim: '',
    distancia_km: '',
    categoria_carga_antt: 'GERAL',
    alto_desempenho: false,
    retorno_vazio: false,
    peso_carga_kg: '',
    valor_carga: '',
    ncm_carga: '',
    chaves_nfe: [] as string[],
    valor_frete: '',
    valor_adiantamento: '',
    valor_pedagio: '',
    valor_combustivel: '',
    valor_inss: '',
    valor_irrf: '',
    valor_sest_senat: '',
    calcular_retencoes_tac: true,
    vale_pedagio_fornecedora_cnpj: '',
    vale_pedagio_comprovante: '',
    forma_quitacao: 'PIX',
    chave_pix: '',
    banco_codigo: '',
    banco_agencia: '',
    banco_conta: '',
    data_saida: hoje,
    data_prevista_entrega: entrega,
    piso_isento: false,
    piso_isencao_motivo: '',
    gerar_financeiro: true,
    ciot_codigo: '',
    observacoes: ''
  };
};

export default function CiotConsultaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('TODOS');
  const [modalCriar, setModalCriar] = useState(false);
  const [modalCancelar, setModalCancelar] = useState<Contrato | null>(null);
  const [modalEncerrar, setModalEncerrar] = useState<Contrato | null>(null);
  const [modalCodigoManual, setModalCodigoManual] = useState<Contrato | null>(null);
  const [codigoManualInput, setCodigoManualInput] = useState('');
  const [protocoloEncInput, setProtocoloEncInput] = useState('');
  const [motivo, setMotivo] = useState('');
  const [payloadModal, setPayloadModal] = useState<{ contrato: Contrato; payload: any } | null>(null);
  const [financeiroModal, setFinanceiroModal] = useState<{
    contrato: Contrato;
    titulos: TituloFinanceiro[];
    carregando: boolean;
  } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pisoPreview, setPisoPreview] = useState<any | null>(null);
  const [retencaoPreview, setRetencaoPreview] = useState<any | null>(null);
  const [baixandoParcelaId, setBaixandoParcelaId] = useState<number | null>(null);

  const abrirContratoRpa = async (c: Contrato) => {
    try {
      const res = await api.get(`/transporte/contratos/${c.id}/rpa`);
      const html = res.data?.html;
      if (!html) throw new Error('Documento RPA indisponível.');
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Erro ao gerar Contrato/RPA.');
    }
  };

  const quitarParcelaCiot = async (parcela: TituloFinanceiro) => {
    if (!financeiroModal) return;
    setBaixandoParcelaId(parcela.id);
    try {
      await api.post(`/transporte/contratos/${financeiroModal.contrato.id}/parcelas/${parcela.id}/baixar`, {
        valor_pago: parcela.valor
      });
      await abrirFinanceiroContrato(financeiroModal.contrato);
      await refetch();
      setFeedback({ ok: true, msg: `Parcela #${parcela.numero_parcela} baixada como PAGA com sucesso!` });
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Erro ao quitar parcela.');
    } finally {
      setBaixandoParcelaId(null);
    }
  };

  const { data: emitentesResp } = useQuery({
    queryKey: ['emitentes-ciot'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emAtual = emitentesResp?.data?.[0] || null;

  const { data: veiculosResp } = useQuery({
    queryKey: ['veiculos-ciot'],
    queryFn: async () => (await api.get('/transporte/veiculos')).data,
    enabled: modalCriar
  });
  const veiculos = veiculosResp?.data || [];

  const { data: motoristasResp } = useQuery({
    queryKey: ['motoristas-ciot'],
    queryFn: async () => (await api.get('/transporte/motoristas')).data,
    enabled: modalCriar
  });
  const motoristas = motoristasResp?.data || [];

  const { data: cargasResp } = useQuery({
    queryKey: ['cargas-ciot-erp'],
    queryFn: async () => (await api.get('/transporte/cargas', { params: { limit: 120 } })).data,
    enabled: modalCriar
  });
  const cargasErp = useMemo(
    () => (cargasResp?.data || []).filter((c: any) => c.status !== 'CANCELADA'),
    [cargasResp]
  );

  const [form, setForm] = useState(() => criarFormInicial(null));

  useEffect(() => {
    if (emAtual && !form.contratante_nome) {
      setForm(f => ({
        ...f,
        contratante_nome: emAtual.razao_social || f.contratante_nome,
        contratante_documento: emAtual.cnpj ? mascaras.cpfCnpj(emAtual.cnpj) : f.contratante_documento,
        uf_inicio: emAtual.uf || f.uf_inicio,
        municipio_inicio: emAtual.municipio || f.municipio_inicio,
        codigo_ibge_inicio: emAtual.codigo_municipio || f.codigo_ibge_inicio
      }));
    }
  }, [emAtual?.id]);

  // Cálculo ao vivo do Piso Mínimo Oficial ANTT Res. 5.867 quando modal aberto
  useEffect(() => {
    if (!modalCriar) return;
    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/transporte/ciot/calcular-piso', {
          categoria_carga_antt: form.categoria_carga_antt,
          tipo_operacao: form.tipo_operacao,
          quantidade_eixos: Number(form.quantidade_eixos || 2),
          distancia_km: form.distancia_km ? Number(form.distancia_km) : 0,
          uf_inicio: form.uf_inicio,
          uf_fim: form.uf_fim,
          municipio_inicio: form.municipio_inicio,
          municipio_fim: form.municipio_fim,
          alto_desempenho: form.alto_desempenho,
          retorno_vazio: form.retorno_vazio,
          valor_frete: Number(form.valor_frete || 0),
          piso_isento: form.piso_isento,
          piso_isencao_motivo: form.piso_isencao_motivo
        });
        setPisoPreview(res.data?.data || null);
      } catch {
        // silencioso
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [
    modalCriar,
    form.categoria_carga_antt,
    form.tipo_operacao,
    form.quantidade_eixos,
    form.distancia_km,
    form.uf_inicio,
    form.uf_fim,
    form.municipio_inicio,
    form.municipio_fim,
    form.alto_desempenho,
    form.retorno_vazio,
    form.valor_frete,
    form.piso_isento,
    form.piso_isencao_motivo
  ]);

  // Cálculo automático das retenções legais TAC (INSS, SEST/SENAT e IRRF)
  useEffect(() => {
    if (!modalCriar) return;
    const freteNum = Number(form.valor_frete || 0);
    if (!form.calcular_retencoes_tac || freteNum <= 0 || form.tipo_transporte !== '2') {
      setRetencaoPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/transporte/ciot/calcular-retencoes-tac', {
          valor_frete: freteNum,
          transportador_categoria: 'TAC',
          transportador_cpf_cnpj: form.transportador_documento
        });
        const d = res.data?.data;
        setRetencaoPreview(d || null);
        if (d?.aplicavel) {
          setForm(prev => ({
            ...prev,
            valor_inss: String(d.valor_inss ?? 0),
            valor_sest_senat: String(d.valor_sest_senat ?? 0),
            valor_irrf: String(d.valor_irrf ?? 0)
          }));
        }
      } catch {
        // silencioso
      }
    }, 220);
    return () => clearTimeout(t);
  }, [modalCriar, form.calcular_retencoes_tac, form.valor_frete, form.tipo_transporte, form.transportador_documento]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ciot-consulta'],
    queryFn: async () => (await api.get('/transporte/contratos')).data
  });

  const resumo = data?.resumo || {
    total: 0,
    transmitidos: 0,
    encerrados: 0,
    pendentes: 0,
    total_frete: 0,
    total_adiantamento: 0
  };

  const contratos: Contrato[] = useMemo(() => {
    return (data?.data || []).filter((c: Contrato) => {
      if (statusFiltro !== 'TODOS' && c.ciot_status !== statusFiltro) return false;
      if (!search.trim()) return true;
      const t = search.toLowerCase();
      return (
        c.transportador_nome?.toLowerCase().includes(t) ||
        c.contratante_nome?.toLowerCase().includes(t) ||
        c.ciot_codigo?.toLowerCase().includes(t) ||
        c.ciot_protocolo_formatado?.toLowerCase().includes(t) ||
        c.veiculo_placa?.toLowerCase().includes(t) ||
        c.motorista_nome?.toLowerCase().includes(t) ||
        c.transportador_rntrc?.toLowerCase().includes(t)
      );
    });
  }, [data, statusFiltro, search]);

  const selecionarVeiculoFrota = (veiculoIdStr: string) => {
    const v = veiculos.find((x: any) => String(x.id) === veiculoIdStr);
    if (!v) {
      setForm(f => ({ ...f, veiculo_id: '' }));
      return;
    }
    const docProp = String(v.proprietario_cpf_cnpj || '').replace(/\D/g, '');
    const isTerceiro = String(v.tipo_proprietario) === '2' && docProp.length >= 11;
    const eixosSugeridos =
      Number(v.capacidade_kg) >= 35000
        ? '6'
        : Number(v.capacidade_kg) >= 22000
        ? '4'
        : Number(v.capacidade_kg) >= 12000
        ? '3'
        : '2';

    setForm(f => ({
      ...f,
      veiculo_id: String(v.id),
      veiculo_placa: v.placa || f.veiculo_placa,
      quantidade_eixos: eixosSugeridos,
      transportador_nome: isTerceiro
        ? v.proprietario_nome || f.transportador_nome
        : f.transportador_nome,
      transportador_documento: isTerceiro
        ? mascaras.cpfCnpj(docProp)
        : f.transportador_documento,
      transportador_rntrc: v.rntrc_proprietario || emAtual?.rntrc || f.transportador_rntrc,
      tipo_transporte: isTerceiro ? (docProp.length === 11 ? '2' : '1') : f.tipo_transporte
    }));
  };

  const selecionarMotoristaFrota = (motoristaIdStr: string) => {
    const m = motoristas.find((x: any) => String(x.id) === motoristaIdStr);
    if (!m) {
      setForm(f => ({ ...f, motorista_id: '' }));
      return;
    }
    setForm(f => ({
      ...f,
      motorista_id: String(m.id),
      motorista_nome: m.nome || '',
      motorista_cpf: mascaras.cpfCnpj(m.cpf || ''),
      transportador_nome: f.transportador_nome || m.nome || '',
      transportador_documento: f.transportador_documento || mascaras.cpfCnpj(m.cpf || '')
    }));
  };

  const importarDadosCargaErp = (cargaIdStr: string) => {
    const cg = cargasErp.find((x: any) => String(x.id) === cargaIdStr);
    if (!cg) return;
    const chaveLimpa = String(cg.chave_acesso || '').replace(/\D/g, '');
    setForm(f => ({
      ...f,
      uf_fim: (cg.destinatario_uf || f.uf_fim || 'MS').toUpperCase(),
      municipio_fim: cg.destinatario_municipio || f.municipio_fim,
      codigo_ibge_fim: cg.destinatario_codigo_ibge || f.codigo_ibge_fim,
      distancia_km: '', // recalcula automaticamente pela nova cidade
      peso_carga_kg: cg.peso_bruto ? String(cg.peso_bruto) : f.peso_carga_kg,
      valor_carga: cg.valor_total ? String(cg.valor_total) : f.valor_carga,
      ncm_carga: cg.produto_ncm ? String(cg.produto_ncm).replace(/\D/g, '').slice(0, 8) : f.ncm_carga,
      chaves_nfe:
        chaveLimpa.length === 44 && !f.chaves_nfe.includes(chaveLimpa)
          ? [...f.chaves_nfe, chaveLimpa]
          : f.chaves_nfe
    }));
  };

  const salvarOperacao = async (emitirAgora: boolean) => {
    setSalvando(true);
    setErro('');
    try {
      const res = await api.post('/transporte/contratos', {
        ...form,
        emitir_agora: emitirAgora
      });
      const criado: Contrato = res.data?.data;
      setModalCriar(false);
      setForm(criarFormInicial(emAtual));
      await refetch();
      qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });

      if (criado?.ciot_codigo) {
        setFeedback({
          ok: true,
          msg: `CIOT emitido e ativo com sucesso: ${criado.ciot_protocolo_formatado || criado.ciot_codigo}! ${
            (res.data?.financeiro_ids || []).length > 0
              ? `${res.data.financeiro_ids.length} parcela(s) lançada(s) no Contas a Pagar.`
              : ''
          }`
        });
      } else {
        setFeedback({
          ok: true,
          msg: 'Operação de transporte salva! Clique em "Emitir CIOT" ou informe o código da operadora.'
        });
      }
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message || 'Erro ao salvar operação de CIOT.');
    } finally {
      setSalvando(false);
    }
  };

  const emitirCiotExistente = async (c: Contrato) => {
    setSalvando(true);
    setFeedback(null);
    try {
      const res = await api.post(`/transporte/contratos/${c.id}/gerar-ciot`);
      const atualizado: Contrato = res.data?.data;
      await refetch();
      qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });

      if (atualizado?.ciot_status === 'TRANSMITIDO' && atualizado?.ciot_codigo) {
        setFeedback({
          ok: true,
          msg: `Protocolo CIOT gerado: ${atualizado.ciot_protocolo_formatado || atualizado.ciot_codigo}`
        });
      } else if (res.data?.payload) {
        setPayloadModal({ contrato: atualizado || c, payload: res.data.payload });
      }
    } catch (err: any) {
      setFeedback({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Falha ao emitir CIOT.'
      });
    } finally {
      setSalvando(false);
    }
  };

  const registrarCodigoManual = async () => {
    if (!modalCodigoManual) return;
    setSalvando(true);
    try {
      const res = await api.patch(`/transporte/contratos/${modalCodigoManual.id}/ciot`, {
        ciot_codigo: codigoManualInput
      });
      setModalCodigoManual(null);
      setCodigoManualInput('');
      await refetch();
      qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });
      setFeedback({
        ok: true,
        msg: `Código CIOT ${res.data?.data?.ciot_protocolo_formatado || codigoManualInput} registrado e validado!`
      });
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Código CIOT inválido.');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarEncerramento = async () => {
    if (!modalEncerrar) return;
    setSalvando(true);
    try {
      const res = await api.post(`/transporte/contratos/${modalEncerrar.id}/ciot/encerrar`, {
        protocolo_encerramento: protocoloEncInput || undefined
      });
      setModalEncerrar(null);
      setProtocoloEncInput('');
      await refetch();
      qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });
      setFeedback({
        ok: true,
        msg: `Operação CIOT encerrada com sucesso! Protocolo: ${res.data?.data?.ciot_protocolo_encerramento || 'OK'}`
      });
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Erro ao encerrar CIOT.');
    } finally {
      setSalvando(false);
    }
  };

  const cancelarCiot = async () => {
    if (!modalCancelar) return;
    setSalvando(true);
    try {
      const res = await api.post(`/transporte/contratos/${modalCancelar.id}/ciot/cancelar`, {
        motivo
      });
      const estornados = Number(res.data?.titulos_estornados || 0);
      setModalCancelar(null);
      setMotivo('');
      await refetch();
      qc.invalidateQueries({ queryKey: ['ciot-mdfe-disponiveis'] });
      setFeedback({
        ok: true,
        msg: `CIOT cancelado com sucesso.${estornados > 0 ? ` ${estornados} título(s) pendente(s) estornado(s) no Financeiro.` : ''}`
      });
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Erro ao cancelar CIOT.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirFinanceiroContrato = async (c: Contrato) => {
    setFinanceiroModal({ contrato: c, titulos: [], carregando: true });
    try {
      const res = await api.get(`/transporte/contratos/${c.id}/financeiro`);
      setFinanceiroModal({ contrato: c, titulos: res.data?.data || [], carregando: false });
    } catch {
      setFinanceiroModal({ contrato: c, titulos: [], carregando: false });
    }
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setFeedback({ ok: true, msg: `Código ${texto} copiado para a área de transferência.` });
  };

  const baixarPayload = () => {
    if (!payloadModal) return;
    const blob = new Blob([JSON.stringify(payloadModal.payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ciot-operacao-${payloadModal.contrato.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const provedorEmpresa = emAtual?.ciot_provedor || 'HOMOLOGACAO_LOCAL';
  const ambienteEmpresa = emAtual?.ciot_ambiente || emAtual?.focus_ambiente || 'homologacao';

  return (
    <div className="space-y-4 pb-20">
      {/* Cabeçalho Principal */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <BadgeCheck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              Central de CIOT & Contratos de Frete
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                ambienteEmpresa === 'producao'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              {provedorEmpresa === 'HOMOLOGACAO_LOCAL'
                ? 'Simulador ANTT Homologação'
                : `Provedor: ${provedorEmpresa}`}{' '}
              · {ambienteEmpresa === 'producao' ? 'Produção' : 'Homologação'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cálculo oficial do Piso Mínimo ANTT (Res. 5.867), emissão/registro 12+4 dígitos, vínculo direto ao MDF-e e geração de Contas a Pagar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/transporte/empresa')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar IPEF
          </button>
          <button
            type="button"
            onClick={() => {
              setErro('');
              setForm(criarFormInicial(emAtual));
              setModalCriar(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Operação (CIOT)
          </button>
        </div>
      </div>

      {/* KPIs Operacionais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Operações Registradas</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{resumo.total}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{resumo.pendentes} pendente(s) de emissão</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Ativas em Trânsito
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
            {resumo.transmitidos}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Prontas p/ importar no MDF-e</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-teal-200/70 dark:border-teal-900/50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            Viagens Encerradas
          </p>
          <p className="text-2xl font-bold text-teal-700 dark:text-teal-300 mt-1 tabular-nums">
            {resumo.encerrados}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Saldo liberado p/ quitação</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Volume de Fretes</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            R$ {Number(resumo.total_frete || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Adiantamentos: R$ {Number(resumo.total_adiantamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {feedback.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Fechar aviso"
            title="Fechar aviso"
            className="p-1 rounded hover:bg-black/5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por transportador, placa, motorista, código CIOT ou RNTRC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
          />
        </div>
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          aria-label="Filtrar por status do CIOT"
          className="px-3 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
        >
          <option value="TODOS">Todos os status</option>
          <option value="TRANSMITIDO">Ativos em Trânsito</option>
          <option value="ENCERRADO">Encerrados</option>
          <option value="PENDENTE">Pendentes</option>
          <option value="GERADO">Payload Gerado</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
      </div>

      {/* Tabela de Operações CIOT */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando operações de CIOT...</div>
      ) : contratos.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <BadgeCheck className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Nenhuma operação de CIOT encontrada
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Cadastre uma operação puxando Veículo, Motorista e NF-es do ERP com cálculo automático do Piso Mínimo ANTT.
          </p>
          <button
            type="button"
            onClick={() => {
              setErro('');
              setForm(criarFormInicial(emAtual));
              setModalCriar(true);
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors"
          >
            Nova Operação (CIOT)
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <TabelaResponsiva<Contrato>
            dados={contratos}
            chaveDe={c => c.id}
            colunas={[
              {
                chave: 'operacao',
                rotulo: 'Operação / Veículo',
                render: c => (
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {c.veiculo_placa ? `${c.veiculo_placa} · ` : ''}
                      {c.tipo_operacao}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.tipo_transporte === '1' ? 'ETC' : c.tipo_transporte === '2' ? 'TAC' : 'CTC'}
                      {c.quantidade_eixos ? ` · ${c.quantidade_eixos} eixos` : ''}
                      {c.transportador_rntrc ? ` · RNTRC ${c.transportador_rntrc}` : ''}
                    </p>
                  </div>
                )
              },
              {
                chave: 'transportador',
                rotulo: 'Transportador / Condutor',
                render: c => (
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate max-w-[170px]">
                      {c.transportador_nome}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">{c.transportador_documento}</p>
                  </div>
                )
              },
              {
                chave: 'rota',
                rotulo: 'Percurso',
                render: c => (
                  <div>
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {c.municipio_inicio ? `${c.municipio_inicio}/` : ''}
                      {c.uf_inicio} → {c.municipio_fim ? `${c.municipio_fim}/` : ''}
                      {c.uf_fim}
                    </span>
                    {Number(c.distancia_km || 0) > 0 && (
                      <span className="block text-[10px] text-slate-400">
                        {Number(c.distancia_km).toLocaleString('pt-BR')} km
                      </span>
                    )}
                  </div>
                )
              },
              {
                chave: 'frete',
                rotulo: 'Frete / Adiant.',
                alinhamento: 'right',
                render: c => (
                  <div className="text-right">
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap block">
                      R$ {Number(c.valor_frete || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {Number(c.valor_adiantamento || 0) > 0 && (
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        Adiant: R$ {Number(c.valor_adiantamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                )
              },
              {
                chave: 'piso',
                rotulo: 'Piso ANTT 5.867',
                ocultarNoCelular: true,
                render: c =>
                  c.piso_minimo_antt ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                        c.piso_minimo_aprovado
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {c.piso_minimo_aprovado ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      R$ {Number(c.piso_minimo_antt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {c.piso_isento ? ' (Isento)' : ''}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )
              },
              {
                chave: 'ciot',
                rotulo: 'Protocolo CIOT / MDF-e',
                render: c => {
                  const st = STATUS_CIOT[c.ciot_status] || STATUS_CIOT.PENDENTE;
                  const codigoExib = c.ciot_protocolo_formatado || c.ciot_codigo;
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${st.cor}`}>
                          {st.rotulo}
                        </span>
                        {c.mdfe_numero && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                            MDF-e Nº {c.mdfe_numero}
                          </span>
                        )}
                      </div>
                      {codigoExib && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            copiar(c.ciot_codigo);
                          }}
                          title="Clique para copiar os 12 dígitos do CIOT para o MDF-e"
                          className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 hover:text-teal-600"
                        >
                          {codigoExib}
                          <Copy className="w-3 h-3 opacity-70" />
                        </button>
                      )}
                    </div>
                  );
                }
              },
              {
                chave: 'acoes',
                rotulo: 'Ações',
                alinhamento: 'right',
                render: c =>
                  c.ciot_status === 'CANCELADO' ? (
                    <span className="text-[11px] text-slate-400">Cancelado</span>
                  ) : (
                    <div
                      className="flex flex-wrap items-center justify-end gap-1.5"
                      onClick={e => e.stopPropagation()}
                    >
                      {(c.ciot_status === 'PENDENTE' || c.ciot_status === 'GERADO') && (
                        <>
                          <button
                            type="button"
                            onClick={() => emitirCiotExistente(c)}
                            disabled={salvando}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Emitir CIOT
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalCodigoManual(c);
                              setCodigoManualInput('');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-[11px] font-semibold transition-colors"
                          >
                            <KeyRound className="w-3 h-3" />
                            Código
                          </button>
                        </>
                      )}

                      {c.ciot_status === 'TRANSMITIDO' && c.ciot_codigo && (
                        <>
                          <button
                            type="button"
                            onClick={() => navigate(`/transporte/mdfe/novo?ciot_id=${c.id}`)}
                            title="Abrir Emitir MDF-e já preenchido com este CIOT, Contratante e Pagamento"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold transition-colors"
                          >
                            <Truck className="w-3 h-3" />
                            <span className="hidden xl:inline">Usar no MDF-e</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalEncerrar(c);
                              setProtocoloEncInput('');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-[11px] font-semibold transition-colors"
                          >
                            <CheckSquare className="w-3 h-3" />
                            <span className="hidden xl:inline">Encerrar</span>
                          </button>
                        </>
                      )}

                      {(c.financeiro_ids?.length || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => abrirFinanceiroContrato(c)}
                          title="Ver parcelas lançadas em Contas a Pagar"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-[11px] font-semibold transition-colors"
                        >
                          <Wallet className="w-3 h-3" />
                          <span className="hidden 2xl:inline">Financeiro</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => abrirContratoRpa(c)}
                        title="Imprimir Contrato de Transporte & RPA (PDF)"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 text-[11px] font-semibold transition-colors"
                      >
                        <Printer className="w-3 h-3" />
                        <span className="hidden 2xl:inline">RPA</span>
                      </button>

                      {c.ciot_payload_antt && (
                        <button
                          type="button"
                          onClick={() => setPayloadModal({ contrato: c, payload: c.ciot_payload_antt })}
                          title="Inspecionar JSON ANTT / IPEF"
                          aria-label="Inspecionar JSON ANTT"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-[11px] font-semibold transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      )}

                      {c.ciot_status !== 'ENCERRADO' && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalCancelar(c);
                            setMotivo('');
                          }}
                          title="Cancelar operação de CIOT"
                          aria-label="Cancelar operação de CIOT"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-100 text-[11px] font-semibold transition-colors"
                        >
                          <Ban className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
              }
            ]}
          />
        </div>
      )}

      {/* ═══ MODAL DE CRIAÇÃO ASSISTIDA DE OPERAÇÃO CIOT ═══ */}
      {modalCriar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 my-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BadgeCheck className="w-5 h-5 text-teal-600" />
                  Nova Operação de Transporte (CIOT — ANTT Res. 5.867)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Puxe dados da Frota e NF-es do ERP, valide o Piso Mínimo Oficial da ANTT e emita o protocolo em 1 clique.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalCriar(false)}
                aria-label="Fechar modal"
                title="Fechar"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {erro && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 dark:text-red-200">{erro}</p>
              </div>
            )}

            <div className="space-y-5 text-sm">
              {/* Assistentes de Preenchimento Rápido (Frota + NF-e ERP) */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  Preenchimento Assistido — Puxar da Frota e Notas do ERP
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <CampoFiscal rotulo="1. Veículo de Tração (Frota)">
                    <SelectFiscal
                      value={form.veiculo_id}
                      onChange={selecionarVeiculoFrota}
                      opcoes={[
                        { valor: '', rotulo: 'Selecionar veículo cadastrado...' },
                        ...veiculos.map((v: any) => ({
                          valor: String(v.id),
                          rotulo: `${v.placa} — ${v.modelo || 'Veículo'} (${String(v.tipo_proprietario) === '2' ? 'Terceiro/TAC' : 'Próprio'})`
                        }))
                      ]}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="2. Motorista Condutor">
                    <SelectFiscal
                      value={form.motorista_id}
                      onChange={selecionarMotoristaFrota}
                      opcoes={[
                        { valor: '', rotulo: 'Selecionar motorista...' },
                        ...motoristas.map((m: any) => ({
                          valor: String(m.id),
                          rotulo: `${m.nome} (${m.cpf})`
                        }))
                      ]}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="3. Puxar Rota/Carga de NF-e do ERP">
                    <SelectFiscal
                      value=""
                      onChange={importarDadosCargaErp}
                      opcoes={[
                        { valor: '', rotulo: `Importar de NF-e (${cargasErp.length} disponíveis)...` },
                        ...cargasErp.slice(0, 60).map((cg: any) => ({
                          valor: String(cg.id),
                          rotulo: `NF ${cg.numero_nota || cg.id} · ${cg.destinatario_municipio || ''}/${cg.destinatario_uf || ''} · R$ ${Number(cg.valor_total || 0).toFixed(2)}`
                        }))
                      ]}
                    />
                  </CampoFiscal>
                </div>
              </div>

              {/* Contratante e Transportador */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contratante do Frete</p>
                  <CampoFiscal rotulo="Razão Social / Nome" obrigatorio>
                    <InputFiscal
                      value={form.contratante_nome}
                      onChange={v => setForm({ ...form, contratante_nome: v })}
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CNPJ / CPF Contratante" obrigatorio>
                    <InputFiscal
                      value={form.contratante_documento}
                      onChange={v => setForm({ ...form, contratante_documento: mascaras.cpfCnpj(v) })}
                      placeholder="00.000.000/0001-00"
                    />
                  </CampoFiscal>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Transportador Contratado (TAC / ETC)
                  </p>
                  <GradeCampos>
                    <CampoFiscal rotulo="Nome / Razão Social" obrigatorio>
                      <InputFiscal
                        value={form.transportador_nome}
                        onChange={v => setForm({ ...form, transportador_nome: v })}
                      />
                    </CampoFiscal>
                    <CampoFiscal rotulo="CPF / CNPJ Transportador" obrigatorio>
                      <InputFiscal
                        value={form.transportador_documento}
                        onChange={v => setForm({ ...form, transportador_documento: mascaras.cpfCnpj(v) })}
                        placeholder="000.000.000-00"
                      />
                    </CampoFiscal>
                    <CampoFiscal rotulo="RNTRC (ANTT — 8 dígitos)">
                      <InputFiscal
                        value={form.transportador_rntrc}
                        onChange={v => setForm({ ...form, transportador_rntrc: mascaras.somenteDigitos(v).slice(0, 8) })}
                        placeholder="00000000"
                      />
                    </CampoFiscal>
                    <CampoFiscal rotulo="Categoria Transportador">
                      <SelectFiscal
                        value={form.tipo_transporte}
                        onChange={v => setForm({ ...form, tipo_transporte: v })}
                        opcoes={[
                          { valor: '2', rotulo: '2 — TAC (Autônomo PF)' },
                          { valor: '1', rotulo: '1 — ETC (Empresa PJ)' },
                          { valor: '3', rotulo: '3 — CTC (Cooperativa)' }
                        ]}
                      />
                    </CampoFiscal>
                  </GradeCampos>
                </div>
              </div>

              {/* Percurso, Carga e Calculadora Oficial ANTT 5.867 */}
              <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/30 dark:bg-teal-950/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator className="w-4 h-4" />
                    Percurso & Calculadora Oficial do Piso Mínimo ANTT (Res. 5.867)
                  </p>
                  {pisoPreview && (
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                      Tabela {pisoPreview.tabela} · CCD R$ {pisoPreview.ccd}/km + CC R$ {pisoPreview.cc}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  <CampoFiscal rotulo="UF Origem" obrigatorio>
                    <SelectFiscal
                      value={form.uf_inicio}
                      onChange={v => setForm({ ...form, uf_inicio: v })}
                      opcoes={UFS_BRASIL.map(uf => ({ valor: uf, rotulo: uf }))}
                    />
                  </CampoFiscal>
                  <div className="col-span-1 sm:col-span-2">
                    <CampoFiscal rotulo="Município Origem">
                      <InputFiscal
                        value={form.municipio_inicio}
                        onChange={v => setForm({ ...form, municipio_inicio: v })}
                        placeholder="Ex: Dourados"
                      />
                    </CampoFiscal>
                  </div>
                  <CampoFiscal rotulo="UF Destino" obrigatorio>
                    <SelectFiscal
                      value={form.uf_fim}
                      onChange={v => setForm({ ...form, uf_fim: v })}
                      opcoes={UFS_BRASIL.map(uf => ({ valor: uf, rotulo: uf }))}
                    />
                  </CampoFiscal>
                  <div className="col-span-2">
                    <CampoFiscal rotulo="Município Destino">
                      <InputFiscal
                        value={form.municipio_fim}
                        onChange={v => setForm({ ...form, municipio_fim: v })}
                        placeholder="Ex: Maracaju ou São Paulo"
                      />
                    </CampoFiscal>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <CampoFiscal rotulo="Categoria da Carga ANTT">
                    <SelectFiscal
                      value={form.categoria_carga_antt}
                      onChange={v => setForm({ ...form, categoria_carga_antt: v })}
                      opcoes={CATEGORIAS_ANTT}
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Nº de Eixos da Composição">
                    <SelectFiscal
                      value={form.quantidade_eixos}
                      onChange={v => setForm({ ...form, quantidade_eixos: v })}
                      opcoes={EIXOS_OPCOES}
                    />
                  </CampoFiscal>
                  <CampoFiscal
                    rotulo="Distância (km)"
                    dica={
                      pisoPreview?.distancia_estimada
                        ? `Auto-estimado: ${pisoPreview.distancia_km} km`
                        : 'Distância informada'
                    }
                  >
                    <InputFiscal
                      type="number"
                      value={form.distancia_km}
                      onChange={v => setForm({ ...form, distancia_km: v })}
                      placeholder={pisoPreview ? String(pisoPreview.distancia_km) : 'Auto'}
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Placa do Veículo">
                    <InputFiscal
                      value={form.veiculo_placa}
                      onChange={v => setForm({ ...form, veiculo_placa: v.toUpperCase().slice(0, 8) })}
                      placeholder="ABC1D23"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Peso da Carga (kg)">
                    <InputFiscal
                      type="number"
                      value={form.peso_carga_kg}
                      onChange={v => setForm({ ...form, peso_carga_kg: v })}
                      placeholder="0"
                    />
                  </CampoFiscal>
                </div>

                {/* Resultado Ao Vivo do Piso ANTT */}
                {pisoPreview && (
                  <div
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      pisoPreview.aprovado
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Scale
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          pisoPreview.aprovado ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          Piso Mínimo Oficial ANTT:{' '}
                          <span className="text-sm text-teal-700 dark:text-teal-300">
                            R$ {Number(pisoPreview.piso).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>{' '}
                          <span className="font-normal text-slate-500">
                            ({pisoPreview.distancia_km} km · {pisoPreview.eixos} eixos · {pisoPreview.categoria_nome})
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {pisoPreview.aprovado
                            ? pisoPreview.isento
                              ? 'Operação amparada por isenção/exceção justificada.'
                              : 'Valor do frete atende integralmente à Resolução ANTT nº 5.867.'
                            : 'O valor do frete está abaixo do piso mínimo legal. Clique ao lado para igualar ao piso ou informe justificativa de isenção.'}
                        </p>
                      </div>
                    </div>

                    {!pisoPreview.aprovado_valor && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm(f => ({ ...f, valor_frete: Number(pisoPreview.piso).toFixed(2) }))
                        }
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold whitespace-nowrap shrink-0"
                      >
                        Usar Piso (R$ {Number(pisoPreview.piso).toFixed(2)})
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.retorno_vazio}
                      onChange={e => setForm({ ...form, retorno_vazio: e.target.checked })}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    Incluir Retorno Vazio (92% CCD)
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.piso_isento}
                      onChange={e => setForm({ ...form, piso_isento: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    Aplicar Isenção / Exceção Legal Justificada ao Piso ANTT
                  </label>
                </div>

                {form.piso_isento && (
                  <CampoFiscal
                    rotulo="Motivo Legal da Isenção / Exceção (Mínimo 15 caracteres)"
                    obrigatorio
                  >
                    <InputFiscal
                      value={form.piso_isencao_motivo}
                      onChange={v => setForm({ ...form, piso_isencao_motivo: v })}
                      placeholder="Ex: Carga fracionada consolidada com múltiplos remetentes / acordo coletivo..."
                    />
                  </CampoFiscal>
                )}
              </div>

              {/* Valores, Pagamento e Financeiro */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                  Valores do Frete, Pagamento (PIX/Banco) e Integração Financeira
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <CampoFiscal rotulo="Valor do Frete Bruto (R$)" obrigatorio>
                    <InputFiscal
                      type="number"
                      value={form.valor_frete}
                      onChange={v => setForm({ ...form, valor_frete: v })}
                      placeholder="0.00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Adiantamento (R$)">
                    <InputFiscal
                      type="number"
                      value={form.valor_adiantamento}
                      onChange={v => setForm({ ...form, valor_adiantamento: v })}
                      placeholder="0.00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Vale-Pedágio (R$)">
                    <InputFiscal
                      type="number"
                      value={form.valor_pedagio}
                      onChange={v => setForm({ ...form, valor_pedagio: v })}
                      placeholder="0.00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="INSS TAC (R$)">
                    <InputFiscal
                      type="number"
                      value={form.valor_inss}
                      onChange={v => setForm({ ...form, valor_inss: v, calcular_retencoes_tac: false })}
                      placeholder="0.00"
                    />
                  </CampoFiscal>
                </div>

                {form.tipo_transporte === '2' && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.calcular_retencoes_tac}
                        onChange={e => setForm({ ...form, calcular_retencoes_tac: e.target.checked })}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      Calcular Retenções Legais TAC Automaticamente (INSS 11%/20% · SEST/SENAT 2,5%/20% · IRRF 10%)
                    </label>
                    {retencaoPreview?.aplicavel && (
                      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                        <span className="text-amber-700 dark:text-amber-400">INSS: R$ {Number(retencaoPreview.valor_inss).toFixed(2)}</span>
                        <span className="text-sky-700 dark:text-sky-400">SEST/SENAT: R$ {Number(retencaoPreview.valor_sest_senat).toFixed(2)}</span>
                        <span className="text-red-700 dark:text-red-400">IRRF: R$ {Number(retencaoPreview.valor_irrf).toFixed(2)}</span>
                        <strong className="text-emerald-700 dark:text-emerald-400">Líquido: R$ {Number(retencaoPreview.valor_liquido).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                )}

                {Number(form.valor_pedagio || 0) > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-sky-50/50 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-800/60">
                    <CampoFiscal rotulo="Operadora Vale-Pedágio Obrigatório (CNPJ ANTT)">
                      <SelectFiscal
                        value={form.vale_pedagio_fornecedora_cnpj}
                        onChange={v => setForm({ ...form, vale_pedagio_fornecedora_cnpj: v })}
                        opcoes={[
                          { valor: '', rotulo: 'Selecionar operadora VPO (opcional)...' },
                          { valor: '04088208000165', rotulo: 'Sem Parar / Via Fácil (04.088.208/0001-65)' },
                          { valor: '16577631000108', rotulo: 'ConectCar (16.577.631/0001-08)' },
                          { valor: '29031257000110', rotulo: 'Veloe (29.031.257/0001-10)' },
                          { valor: '18572225000188', rotulo: 'Move Mais (18.572.225/0001-88)' },
                          { valor: '34061547000129', rotulo: 'Taggy / Greenpass (34.061.547/0001-29)' }
                        ]}
                      />
                    </CampoFiscal>
                    <CampoFiscal rotulo="Nº Comprovante / Viagem VPO">
                      <InputFiscal
                        value={form.vale_pedagio_comprovante}
                        onChange={v => setForm({ ...form, vale_pedagio_comprovante: v.replace(/\D/g, '').slice(0, 20) })}
                        placeholder="Código numérico da compra VPO"
                      />
                    </CampoFiscal>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <CampoFiscal rotulo="Forma de Quitação">
                    <SelectFiscal
                      value={form.forma_quitacao}
                      onChange={v => setForm({ ...form, forma_quitacao: v })}
                      opcoes={[
                        { valor: 'PIX', rotulo: 'PIX (Transferência Instantânea)' },
                        { valor: 'DEPOSITO', rotulo: 'Transferência / Conta Bancária' },
                        { valor: 'CARTAO_FRETE', rotulo: 'Cartão-Frete IPEF (Pamcard/e-Frete)' }
                      ]}
                    />
                  </CampoFiscal>

                  {form.forma_quitacao === 'PIX' ? (
                    <CampoFiscal rotulo="Chave PIX do Favorecido">
                      <InputFiscal
                        value={form.chave_pix}
                        onChange={v => setForm({ ...form, chave_pix: v })}
                        placeholder="CPF, CNPJ, Celular ou E-mail"
                      />
                    </CampoFiscal>
                  ) : (
                    <CampoFiscal rotulo="Banco / Agência / Conta">
                      <InputFiscal
                        value={form.banco_conta}
                        onChange={v => setForm({ ...form, banco_conta: v })}
                        placeholder="Ex: 001 / Ag 1234 / CC 56789-0"
                      />
                    </CampoFiscal>
                  )}

                  <CampoFiscal rotulo="Data de Saída">
                    <InputFiscal
                      type="date"
                      value={form.data_saida}
                      onChange={v => setForm({ ...form, data_saida: v })}
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Previsão Quitação Saldo">
                    <InputFiscal
                      type="date"
                      value={form.data_prevista_entrega}
                      onChange={v => setForm({ ...form, data_prevista_entrega: v })}
                    />
                  </CampoFiscal>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 items-center">
                  <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.gerar_financeiro}
                      onChange={e => setForm({ ...form, gerar_financeiro: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Gerar automaticamente Contas a Pagar no Financeiro (Adiantamento + Saldo)
                  </label>

                  <CampoFiscal
                    rotulo="Já possui código CIOT externo? (Opcional — 12 ou 12/4 dígitos)"
                  >
                    <InputFiscal
                      value={form.ciot_codigo}
                      onChange={v => setForm({ ...form, ciot_codigo: v })}
                      placeholder="Deixe vazio p/ emitir automático ou digite ex: 202611120001/4829"
                    />
                  </CampoFiscal>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalCriar(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => salvarOperacao(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  Salvar Rascunho
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => salvarOperacao(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50 shadow-sm"
                >
                  {salvando ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Criar e Emitir CIOT Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Informar Código CIOT Manual (12 ou 12+4 dígitos) */}
      {modalCodigoManual && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-teal-600" />
              Registrar Protocolo CIOT (12 + 4 dígitos)
            </h3>
            <p className="text-xs text-slate-500">
              Informe o número gerado no portal da IPEF/ANTT. O sistema separa automaticamente os{' '}
              <strong>12 dígitos exigidos pela SEFAZ no MDF-e</strong> e os 4 dígitos verificadores.
            </p>
            <CampoFiscal rotulo="Número do CIOT" obrigatorio>
              <InputFiscal
                value={codigoManualInput}
                onChange={setCodigoManualInput}
                placeholder="Ex: 202611120001 ou 202611120001/4829"
              />
            </CampoFiscal>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalCodigoManual(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={salvando || !codigoManualInput.trim()}
                onClick={registrarCodigoManual}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {salvando ? 'Validando...' : 'Validar e Ativar CIOT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Encerrar Operação CIOT */}
      {modalEncerrar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-amber-600" />
              Encerrar Operação de CIOT
            </h3>
            <p className="text-xs text-slate-500">
              Confirma a conclusão da viagem do CIOT{' '}
              <strong className="font-mono">
                {modalEncerrar.ciot_protocolo_formatado || modalEncerrar.ciot_codigo}
              </strong>{' '}
              para liberação do saldo de quitação? (Dica: ao encerrar o MDF-e vinculado, o CIOT também é encerrado automaticamente.)
            </p>
            <CampoFiscal rotulo="Protocolo de Encerramento (Opcional — gerado auto se vazio)">
              <InputFiscal
                value={protocoloEncInput}
                onChange={setProtocoloEncInput}
                placeholder="Gerar protocolo automático"
              />
            </CampoFiscal>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEncerrar(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={confirmarEncerramento}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {salvando ? 'Encerrando...' : 'Confirmar Encerramento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Títulos Financeiros Vinculados (Contas a Pagar) */}
      {financeiroModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  Contas a Pagar do CIOT {financeiroModal.contrato.ciot_protocolo_formatado || financeiroModal.contrato.ciot_codigo}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Títulos gerados automaticamente em Contas a Pagar para {financeiroModal.contrato.transportador_nome}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFinanceiroModal(null)}
                aria-label="Fechar modal financeiro"
                title="Fechar"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {financeiroModal.carregando ? (
              <div className="py-8 text-center text-xs text-slate-400">Carregando parcelas...</div>
            ) : financeiroModal.titulos.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum título encontrado no Financeiro para esta operação.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {financeiroModal.titulos.map(t => (
                  <div
                    key={t.id}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs bg-white dark:bg-slate-900"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        Parcela {t.numero_parcela} — {t.tipo_parcela === 'ADIANTAMENTO_FRETE' ? 'Adiantamento de Viagem' : 'Saldo de Quitação'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Vencimento: {t.data_vencimento ? new Date(t.data_vencimento).toLocaleDateString('pt-BR') : '—'} · Forma: {t.especie_nome || 'PIX'}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2.5">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white tabular-nums">
                          R$ {Number(t.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status_pagamento === 'PAGO'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {t.status_pagamento}
                        </span>
                      </div>
                      {t.status_pagamento !== 'PAGO' && t.status_pagamento !== 'CANCELADO' && (
                        <button
                          type="button"
                          disabled={baixandoParcelaId === t.id}
                          onClick={() => quitarParcelaCiot(t)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-50"
                        >
                          {baixandoParcelaId === t.id ? 'Baixando...' : 'Dar Baixa'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Payload Estruturado ANTT */}
      {payloadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BadgeCheck className="w-5 h-5 text-teal-600" />
                  Payload Oficial ANTT / IPEF (#{payloadModal.contrato.id})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Estrutura auditável da operação de transporte com cálculo da Resolução ANTT nº 5.867.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayloadModal(null)}
                aria-label="Fechar payload"
                title="Fechar"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-auto max-h-80">
              {JSON.stringify(payloadModal.payload, null, 2)}
            </pre>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copiar(JSON.stringify(payloadModal.payload, null, 2))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar JSON
              </button>
              <button
                type="button"
                onClick={baixarPayload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar JSON
              </button>
              {payloadModal.contrato.ciot_codigo && (
                <button
                  type="button"
                  onClick={() => navigate(`/transporte/mdfe/novo?ciot_id=${payloadModal.contrato.id}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold ml-auto"
                >
                  Usar no MDF-e
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Cancelar Operação de CIOT
            </h3>
            <p className="text-xs text-slate-500">
              Operação #{modalCancelar.id}
              {modalCancelar.ciot_codigo ? ` · CIOT ${modalCancelar.ciot_protocolo_formatado || modalCancelar.ciot_codigo}` : ''}. Os títulos pendentes em Contas a Pagar também serão cancelados automaticamente.
            </p>
            <CampoFiscal rotulo="Motivo do cancelamento" obrigatorio dica="Mínimo de 10 caracteres">
              <TextareaFiscal
                rows={3}
                value={motivo}
                onChange={setMotivo}
                placeholder="Descreva o motivo (ex: viagem cancelada pelo embarcador antes da saída)..."
              />
            </CampoFiscal>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalCancelar(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={motivo.trim().length < 10 || salvando}
                onClick={cancelarCiot}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {salvando ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
