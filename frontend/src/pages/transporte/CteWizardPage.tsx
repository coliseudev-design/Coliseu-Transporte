import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import WizardStepper from '../../components/fiscal/WizardStepper';
import { CampoFiscal, GradeCampos, SelectFiscal, InputFiscal, TextareaFiscal, mascaras } from '../../components/fiscal/CampoFiscal';
import ListaEditavelFiscal, { BotaoRemover } from '../../components/fiscal/ListaEditavelFiscal';
import {
  FileText, Users, Wallet, Package, Truck, FileText as FileIcon,
  Save, Send, ChevronLeft, ChevronRight, AlertTriangle,
  Plus, X, Loader2, ShieldCheck, Info
} from 'lucide-react';

interface Componente {
  id: string;
  nome: string;
  valor: string;
}

interface DocumentoVinculado {
  id: string;
  chave: string;
  tipo: string;
  numero: string;
  carga_id?: number;
}

interface ParticipanteForm {
  documento: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cep: string;
  municipio: string;
  codigo_municipio: string;
  uf: string;
  telefone: string;
}

const PARTICIPANTE_VAZIO: ParticipanteForm = {
  documento: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: 'ISENTO',
  logradouro: '',
  numero: 'S/N',
  bairro: 'CENTRO',
  cep: '',
  municipio: '',
  codigo_municipio: '',
  uf: '',
  telefone: ''
};

const STEPS = [
  { id: 'dados', label: 'Dados do CT-e', icone: FileIcon },
  { id: 'participantes', label: 'Participantes', icone: Users },
  { id: 'servicos', label: 'Serviços e Impostos', icone: Wallet },
  { id: 'carga', label: 'Carga e Documentos', icone: Package },
  { id: 'rodoviario', label: 'Rodoviário', icone: Truck },
  { id: 'observacoes', label: 'Observações', icone: FileText }
];

const COMPONENTES_FRETE = [
  { valor: 'FRETE_PESO', rotulo: 'Frete por Peso' },
  { valor: 'FRETE_VALOR', rotulo: 'Frete por Valor' },
  { valor: 'PEDAGIO', rotulo: 'Pedágio' },
  { valor: 'GRIS', rotulo: 'GRIS (Gerenciamento de Risco)' },
  { valor: 'ADEME', rotulo: 'ADEME' },
  { valor: 'DIRECAO', rotulo: 'Direção' },
  { valor: 'TAXA_ADMINISTRACAO', rotulo: 'Taxa de Administração' },
  { valor: 'OUTROS', rotulo: 'Outros' }
];

const MODELOS_DOCUMENTO = [
  { valor: '57', rotulo: '57 — CT-e (Transporte de Cargas)' },
  { valor: '67', rotulo: '67 — CT-e OS (Outros Serviços / Fretamento / Passageiros)' }
];

const MODELOS_CTE = [
  { valor: 'normal', rotulo: 'Normal' },
  { valor: 'simplificado', rotulo: 'Simplificado (mesmo estado e mesmo remetente)' },
  { valor: 'globalizado', rotulo: 'Globalizado (remetentes diferentes, um destinatário)' }
];

const TIPOS_SERVICO = [
  { valor: '0', rotulo: '0 — Normal' },
  { valor: '1', rotulo: '1 — Subcontratação' },
  { valor: '2', rotulo: '2 — Redespacho' },
  { valor: '3', rotulo: '3 — Redespacho Intermediário' },
  { valor: '4', rotulo: '4 — Serviço Vinculado a Multimodal' },
  { valor: '6', rotulo: '6 — Transporte de Pessoas (CT-e OS)' },
  { valor: '7', rotulo: '7 — Transporte de Valores (CT-e OS)' },
  { valor: '8', rotulo: '8 — Excesso de Bagagem (CT-e OS)' }
];

const FINALIDADES = [
  { valor: '1', rotulo: '1 — Normal' },
  { valor: '2', rotulo: '2 — Complemento de Valores' },
  { valor: '3', rotulo: '3 — Substituído' }
];

const FORMATOS_DACTE = [
  { valor: 'retrato', rotulo: 'Retrato' },
  { valor: 'paisagem', rotulo: 'Paisagem' }
];

const TOMADORES = [
  { valor: '0', rotulo: '0 — Remetente' },
  { valor: '1', rotulo: '1 — Expedidor' },
  { valor: '2', rotulo: '2 — Recebedor' },
  { valor: '3', rotulo: '3 — Destinatário' },
  { valor: '4', rotulo: '4 — Outros' }
];

export default function CteWizardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [cteId, setCteId] = useState<number | null>(null);
  const [passoAtual, setPassoAtual] = useState(0);
  const [visitados, setVisitados] = useState<Set<string>>(new Set(['dados']));
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  // Dados do formulário
  const [form, setForm] = useState({
    // Aba 1 — Dados
    emitente_id: '',
    modelo: '57',
    modelo_cte: 'normal',
    cfop: '5353',
    natureza_operacao: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    tipo_servico: '0',
    finalidade: '1',
    formato_dacte: 'retrato',
    codigo_municipio_inicio: '',
    municipio_inicio: '',
    uf_inicio: '',
    codigo_municipio_fim: '',
    municipio_fim: '',
    uf_fim: '',
    retirar_mercadoria: false,
    retirada_descricao: '',
    // Aba 2 — Participantes
    tomador: '0',
    tomador_documento: '',
    tomador_nome: '',
    remetente_dados: { ...PARTICIPANTE_VAZIO } as ParticipanteForm,
    destinatario_dados: { ...PARTICIPANTE_VAZIO } as ParticipanteForm,
    tomador_outros_documento: '',
    tomador_outros_nome: '',
    tomador_outros_ie: '',
    tomador_outros_endereco: '',
    tomador_outros_municipio: '',
    tomador_outros_uf: '',
    tomador_outros_cep: '',
    // Aba 3 — Serviços e Impostos
    componentes_valor: [] as Componente[],
    valor_total: '',
    valor_receber: '',
    icms_situacao_tributaria: '00',
    aliquota_icms: '17.00',
    ibs_cbs_cst: '000',
    ibs_cbs_class_trib: '000001',
    aliquota_ibs: '0.10',
    aliquota_ibs_mun: '0.00',
    aliquota_cbs: '0.90',
    reducao_aliquota_ibs_cbs: '0.00',
    pis_cofins_modo: 'NAO_APURADO',
    pis_cst: '',
    aliquota_pis: '',
    cofins_cst: '',
    aliquota_cofins: '',
    excluir_icms_base_pis_cofins: true,
    codigo_situacao_fiscal: '000001',
    aliquota_fcp: '0.00',
    part_fcp_origem: '50.00',
    part_fcp_destino: '50.00',
    // Aba 4 — Carga e Documentos
    valor_total_carga: '',
    peso_bruto: '',
    quantidade_volumes: '1',
    produto_predominante: '',
    outras_caracteristicas_carga: '',
    documentos: [] as DocumentoVinculado[],
    data_prevista_entrega: '',
    // Aba 5 — Rodoviário
    rntrc: '',
    taf: '',
    numero_registro_estadual: '',
    // Aba 6 — Observações
    observacoes: ''
  });

  const [novoDoc, setNovoDoc] = useState({ chave: '', tipo: 'NFE', numero: '' });

  // ── Carregamentos ──
  const { data: emitentesData } = useQuery({
    queryKey: ['emitentes-wizard'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitentes = emitentesData?.data || [];

  const { data: municipiosData } = useQuery({
    queryKey: ['municipios-wizard'],
    queryFn: async () => (await api.get('/transporte/municipios')).data
  });
  const municipios = municipiosData?.data || [];

  const { data: partesData } = useQuery({
    queryKey: ['partes-wizard'],
    queryFn: async () => (await api.get('/transporte/partes')).data
  });
  const partes = partesData?.data || [];

  const { data: cargasData } = useQuery({
    queryKey: ['cargas-wizard'],
    queryFn: async () => (await api.get('/transporte/cargas', { params: { limit: 200, status: 'PENDENTE' } })).data
  });
  const cargas = cargasData?.data || [];

  const { data: regrasFiscaisData } = useQuery({
    queryKey: ['regras-fiscais-wizard'],
    queryFn: async () => (await api.get('/transporte/regras')).data
  });
  const regrasFiscais = regrasFiscaisData?.data || [];

  const { data: cteExistente } = useQuery({
    queryKey: ['cte-wizard', cteId],
    queryFn: async () => (await api.get(`/transporte/ctes/${cteId}`)).data,
    enabled: !!cteId
  });

  // Aplica automaticamente a regra fiscal parametrizada (UF_PAR > UF > GLOBAL) conforme UF início/fim
  React.useEffect(() => {
    if (cteId) return;
    const ufIni = String(form.uf_inicio || '').toUpperCase().trim();
    const ufFim = String(form.uf_fim || '').toUpperCase().trim();
    if (!ufIni) return;
    const ufFimEfetiva = ufFim || ufIni;

    const ativas = regrasFiscais.filter((r: any) => r.ativo !== false);
    const regraPar = ativas.find(
      (r: any) =>
        r.escopo === 'UF_PAR' &&
        String(r.uf_origem || '').toUpperCase() === ufIni &&
        String(r.uf_destino || '').toUpperCase() === ufFimEfetiva
    );
    const regraUf =
      ufIni !== ufFimEfetiva
        ? ativas.find(
            (r: any) =>
              r.escopo === 'UF' &&
              String(r.uf_origem || '').toUpperCase() === ufIni &&
              (!r.uf_destino || String(r.uf_destino).toUpperCase() === ufFimEfetiva)
          )
        : null;
    const regraGlobal = ativas.find((r: any) => r.escopo === 'GLOBAL');
    const regra = regraPar || regraUf || regraGlobal;

    const isInternoMs = ufIni === 'MS' && ufFimEfetiva === 'MS';
    const cfopSugerido = regra?.cfop || (ufIni !== ufFimEfetiva ? '6353' : '5353');
    const aliqSugerida =
      regra?.aliquota_icms != null
        ? Number(regra.aliquota_icms).toFixed(2)
        : isInternoMs
        ? '17.00'
        : '12.00';

    setForm(f => ({
      ...f,
      cfop: cfopSugerido,
      icms_situacao_tributaria: regra?.situacao_tributaria || f.icms_situacao_tributaria || '00',
      aliquota_icms: aliqSugerida,
      aliquota_fcp: regra?.percentual_fcp != null ? Number(regra.percentual_fcp).toFixed(2) : f.aliquota_fcp,
      ibs_cbs_cst: regra?.ibs_cbs_cst || f.ibs_cbs_cst || '000',
      ibs_cbs_class_trib: regra?.ibs_cbs_class_trib || regra?.codigo_situacao_fiscal || f.ibs_cbs_class_trib || '000001',
      codigo_situacao_fiscal: regra?.ibs_cbs_class_trib || regra?.codigo_situacao_fiscal || f.codigo_situacao_fiscal || '000001',
      aliquota_ibs: regra?.aliquota_ibs != null ? Number(regra.aliquota_ibs).toFixed(2) : f.aliquota_ibs || '0.10',
      aliquota_ibs_mun: regra?.aliquota_ibs_mun != null ? Number(regra.aliquota_ibs_mun).toFixed(2) : f.aliquota_ibs_mun || '0.00',
      aliquota_cbs: regra?.aliquota_cbs != null ? Number(regra.aliquota_cbs).toFixed(2) : f.aliquota_cbs || '0.90',
      reducao_aliquota_ibs_cbs:
        regra?.reducao_aliquota_ibs_cbs != null
          ? Number(regra.reducao_aliquota_ibs_cbs).toFixed(2)
          : f.reducao_aliquota_ibs_cbs || '0.00',
      pis_cofins_modo:
        regra?.pis_cofins_modo && regra.pis_cofins_modo !== 'NAO_APURADO'
          ? String(regra.pis_cofins_modo)
          : f.pis_cofins_modo || 'NAO_APURADO',
      pis_cst: regra?.pis_cst || f.pis_cst || '',
      aliquota_pis: regra?.aliquota_pis != null ? String(regra.aliquota_pis) : f.aliquota_pis || '',
      cofins_cst: regra?.cofins_cst || f.cofins_cst || '',
      aliquota_cofins: regra?.aliquota_cofins != null ? String(regra.aliquota_cofins) : f.aliquota_cofins || '',
      excluir_icms_base_pis_cofins:
        regra?.excluir_icms_base_pis_cofins !== undefined
          ? Boolean(regra.excluir_icms_base_pis_cofins)
          : f.excluir_icms_base_pis_cofins,
    }));
  }, [form.uf_inicio, form.uf_fim, regrasFiscais.length, cteId]);

  // Carrega o emitente padrão e preenche Remetente padrão com o emitente se vazio
  React.useEffect(() => {
    if (emitentes.length > 0 && !form.emitente_id) {
      const em = emitentes[0];
      const ufEm = String(em.uf || 'MS').toUpperCase();
      const aliqEm =
        ufEm === 'MS' && Number(em.aliquota_icms_padrao ?? 12) === 12
          ? '17.00'
          : em.aliquota_icms_padrao != null
          ? Number(em.aliquota_icms_padrao).toFixed(2)
          : '17.00';
      setForm(f => ({
        ...f,
        emitente_id: String(em.id),
        rntrc: f.rntrc || em.rntrc || '',
        cfop: em.cfop_padrao_cte || f.cfop || '5353',
        natureza_operacao: em.natureza_padrao_cte || f.natureza_operacao,
        aliquota_icms: aliqEm,
        codigo_municipio_inicio: f.codigo_municipio_inicio || em.codigo_municipio || '',
        municipio_inicio: f.municipio_inicio || em.municipio || '',
        uf_inicio: f.uf_inicio || em.uf || '',
        remetente_dados: f.remetente_dados.documento ? f.remetente_dados : {
          documento: em.cnpj || '',
          razao_social: em.razao_social || '',
          nome_fantasia: em.nome_fantasia || em.razao_social || '',
          inscricao_estadual: em.inscricao_estadual || 'ISENTO',
          logradouro: em.logradouro || 'RUA PRINCIPAL',
          numero: em.numero || 'S/N',
          bairro: em.bairro || 'CENTRO',
          cep: em.cep || '',
          municipio: em.municipio || '',
          codigo_municipio: em.codigo_municipio || '',
          uf: em.uf || '',
          telefone: em.telefone || ''
        }
      }));
    }
  }, [emitentes.length]);

  // Carrega o rascunho existente
  React.useEffect(() => {
    if (cteExistente?.data) {
      const c = cteExistente.data;
      setForm(f => ({
        ...f,
        ...Object.keys(f).reduce((acc, k) => {
          if (c[k] !== undefined && c[k] !== null) acc[k] = c[k];
          return acc;
        }, {} as any),
        data_prevista_entrega: c.data_prevista_entrega
          ? String(c.data_prevista_entrega).slice(0, 10)
          : f.data_prevista_entrega,
        valor_total_carga:
          c.valor_total_carga != null
            ? String(c.valor_total_carga)
            : c.valor_carga != null
            ? String(c.valor_carga)
            : f.valor_total_carga,
        remetente_dados: c.remetente_dados || f.remetente_dados,
        destinatario_dados: c.destinatario_dados || f.destinatario_dados,
        componentes_valor: c.componentes_valor || [],
        documentos: c.documentos || c.documentos_json || []
      }));
    }
  }, [cteExistente]);

  // ── Cálculos (LC 214/2025, art. 12, § 2º, V + NT 2025.001 / 2026.002 — arredondamento half-up) ──
  const round2 = (v: number): number => {
    if (!Number.isFinite(v)) return 0;
    const sign = v < 0 ? -1 : 1;
    return (sign * Math.floor(Math.abs(v) * 100 + 0.5 + 1e-9)) / 100;
  };

  const totalComponentes = useMemo(
    () => round2(form.componentes_valor.reduce((acc, c) => acc + (parseFloat(c.valor || '0') || 0), 0)),
    [form.componentes_valor]
  );

  const emitenteSelecionado = useMemo(
    () => emitentes.find((e: any) => String(e.id) === String(form.emitente_id)) || emitentes[0] || null,
    [emitentes, form.emitente_id]
  );

  const anoVigencia = new Date().getFullYear();
  const excluirIcmsDaBaseIbsCbs = anoVigencia < 2033;
  const excluirPisCofinsDaBaseIbsCbs = anoVigencia <= 2026;
  const somarIbsCbsNoTotalDfe = anoVigencia >= 2027;

  const baseCalculo = round2(parseFloat(form.valor_total || '0') || totalComponentes);
  const valorReceber = round2(parseFloat(form.valor_receber || '0') || 0);
  const aliquotaIcms = parseFloat(form.aliquota_icms || '0') || 0;
  const icmsTributado = ['00', '20', '90'].includes(form.icms_situacao_tributaria);
  const baseIcms = icmsTributado ? baseCalculo : 0;
  const valorIcms = icmsTributado ? round2((baseIcms * aliquotaIcms) / 100) : 0;

  const modoPisCofinsEfetivo =
    form.pis_cofins_modo && form.pis_cofins_modo !== 'NAO_APURADO'
      ? form.pis_cofins_modo
      : emitenteSelecionado?.pis_cofins_modo || 'NAO_APURADO';

  const aliqPisRaw = form.aliquota_pis !== '' ? form.aliquota_pis : emitenteSelecionado?.aliquota_pis;
  const aliqCofinsRaw = form.aliquota_cofins !== '' ? form.aliquota_cofins : emitenteSelecionado?.aliquota_cofins;
  const temAliqPisCofins = aliqPisRaw !== undefined && aliqPisRaw !== null && String(aliqPisRaw).trim() !== '' &&
    aliqCofinsRaw !== undefined && aliqCofinsRaw !== null && String(aliqCofinsRaw).trim() !== '';

  const aliquotaPis = temAliqPisCofins ? parseFloat(String(aliqPisRaw)) || 0 : 0;
  const aliquotaCofins = temAliqPisCofins ? parseFloat(String(aliqCofinsRaw)) || 0 : 0;
  const pisCofinsIncidente = excluirPisCofinsDaBaseIbsCbs && modoPisCofinsEfetivo === 'INCIDENTE' && temAliqPisCofins;
  const basePisCofins = pisCofinsIncidente
    ? Math.max(0, round2(form.excluir_icms_base_pis_cofins !== false ? baseCalculo - valorIcms : baseCalculo))
    : 0;
  const valorPis = pisCofinsIncidente ? round2((basePisCofins * aliquotaPis) / 100) : 0;
  const valorCofins = pisCofinsIncidente ? round2((basePisCofins * aliquotaCofins) / 100) : 0;

  const deducaoIcmsIbsCbs = excluirIcmsDaBaseIbsCbs && icmsTributado ? valorIcms : 0;
  const deducaoPisCofinsIbsCbs = pisCofinsIncidente ? round2(valorPis + valorCofins) : 0;
  const semGrupoIbsCbs = form.ibs_cbs_cst === '400' || form.ibs_cbs_cst === '410';
  const baseIbsCbs = semGrupoIbsCbs
    ? 0
    : Math.max(0, round2(baseCalculo - deducaoIcmsIbsCbs - deducaoPisCofinsIbsCbs));

  const aliquotaIbs = parseFloat(form.aliquota_ibs || '0') || 0;
  const aliquotaIbsMun = parseFloat(form.aliquota_ibs_mun || '0') || 0;
  const aliquotaCbs = parseFloat(form.aliquota_cbs || '0') || 0;
  const percReducaoIbsCbs = parseFloat(form.reducao_aliquota_ibs_cbs || '0') || 0;
  const aplicaReducaoIbsCbs = (form.ibs_cbs_cst === '200' || form.ibs_cbs_cst === '515') && percReducaoIbsCbs > 0;
  const fatorAliqEfetiva = aplicaReducaoIbsCbs ? Math.max(0, (100 - percReducaoIbsCbs) / 100) : 1;

  const valorIbsUf = semGrupoIbsCbs ? 0 : round2((baseIbsCbs * (aliquotaIbs * fatorAliqEfetiva)) / 100);
  const valorIbsMun = semGrupoIbsCbs ? 0 : round2((baseIbsCbs * (aliquotaIbsMun * fatorAliqEfetiva)) / 100);
  const valorIbs = round2(valorIbsUf + valorIbsMun);
  const valorCbs = semGrupoIbsCbs ? 0 : round2((baseIbsCbs * (aliquotaCbs * fatorAliqEfetiva)) / 100);
  const valorTotalDfe = somarIbsCbsNoTotalDfe && !semGrupoIbsCbs
    ? round2(baseCalculo + valorIbs + valorCbs)
    : baseCalculo;
  const pisCofinsPendente =
    excluirPisCofinsDaBaseIbsCbs &&
    !semGrupoIbsCbs &&
    (modoPisCofinsEfetivo === 'NAO_APURADO' || (modoPisCofinsEfetivo === 'INCIDENTE' && !temAliqPisCofins));

  // ── Validação por passo ──
  const erros = useMemo(() => {
    const e: Record<string, string[]> = { dados: [], participantes: [], servicos: [], carga: [], rodoviario: [], observacoes: [] };

    // Aba 1
    if (!form.emitente_id) e.dados.push('Selecione a transportadora emitente.');
    if (!form.cfop) e.dados.push('CFOP é obrigatório.');
    if (!form.natureza_operacao) e.dados.push('Natureza da operação é obrigatória.');
    if (!form.codigo_municipio_inicio) e.dados.push('Município de início é obrigatório.');
    if (!form.codigo_municipio_fim) e.dados.push('Município de fim é obrigatório.');
    if (form.modelo_cte === 'simplificado' && form.uf_inicio !== form.uf_fim) {
      e.dados.push('Modelo simplificado exige origem e destino no mesmo estado (UF).');
    }

    // Aba 2 — Participantes
    if (form.modelo === '57') {
      if (!form.remetente_dados.documento) e.participantes.push('CNPJ/CPF do Remetente é obrigatório.');
      if (!form.remetente_dados.razao_social) e.participantes.push('Razão Social/Nome do Remetente é obrigatório.');
      if (!form.destinatario_dados.documento) e.participantes.push('CNPJ/CPF do Destinatário é obrigatório.');
      if (!form.destinatario_dados.razao_social) e.participantes.push('Razão Social/Nome do Destinatário é obrigatório.');
    }
    if (form.tomador === '4') {
      if (!form.tomador_outros_documento) e.participantes.push('Documento do tomador "Outros" é obrigatório.');
      if (!form.tomador_outros_nome) e.participantes.push('Nome do tomador "Outros" é obrigatório.');
    }

    // Aba 3
    if (form.componentes_valor.length === 0) e.servicos.push('Adicione ao menos um componente do frete.');
    if (totalComponentes <= 0) e.servicos.push('Os componentes do frete precisam ter valor.');
    if (baseCalculo <= 0) e.servicos.push('Valor total da prestação é obrigatório.');
    if (aliquotaIcms < 0) e.servicos.push('Alíquota de ICMS inválida.');

    if (valorReceber > 0 && Math.abs(valorReceber - totalComponentes) > 0.01) {
      e.servicos.push(`Valor a receber (R$ ${valorReceber.toFixed(2)}) não fecha com os componentes (R$ ${totalComponentes.toFixed(2)}).`);
    }

    // Aba 4
    if (form.modelo === '57' && form.documentos.length === 0) {
      e.carga.push('Vincule ao menos um documento fiscal (NF-e).');
    }
    if (form.modelo === '57' && !form.valor_total_carga) e.carga.push('Valor total da carga é obrigatório.');
    if (form.modelo === '57' && !form.produto_predominante) e.carga.push('Produto predominante é obrigatório.');

    const chaves = form.documentos.map(d => d.chave);
    if (new Set(chaves).size !== chaves.length) {
      e.carga.push('Há chave de acesso duplicada nos documentos vinculados.');
    }

    // Aba 5
    if (form.modelo === '57' && !form.rntrc) {
      e.rodoviario.push('RNTRC é obrigatório para CT-e Rodoviário.');
    }

    return e;
  }, [form, totalComponentes, baseCalculo, aliquotaIcms, valorReceber]);

  const errosPorPasso = erros;
  const errosDoPassoAtual = erros[STEPS[passoAtual].id] || [];
  const podeAvancar = errosDoPassoAtual.length === 0;

  const setCampo = (campo: string, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

  const setParticipante = (tipo: 'remetente_dados' | 'destinatario_dados', campo: keyof ParticipanteForm, valor: string) => {
    setForm(f => ({
      ...f,
      [tipo]: { ...f[tipo], [campo]: valor }
    }));
  };

  const irParaPasso = (indice: number) => {
    setPassoAtual(indice);
    setVisitados(v => new Set([...v, STEPS[indice].id]));
  };

  const avancar = () => {
    if (!podeAvancar) return;
    if (passoAtual < STEPS.length - 1) {
      irParaPasso(passoAtual + 1);
    }
  };

  const voltar = () => {
    if (passoAtual > 0) irParaPasso(passoAtual - 1);
  };

  // ── Ações ──
  const ambienteAtivo =
    String(emitenteSelecionado?.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
      ? 'producao'
      : 'homologacao';

  const construirFormTesteHomologacao = (f: typeof form) => {
    const em = emitenteSelecionado || {};
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return {
      ...f,
      emitente_id: String(em.id || f.emitente_id || ''),
      cfop: '5353',
      natureza_operacao: em.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
      codigo_municipio_inicio: f.codigo_municipio_inicio || em.codigo_municipio || '5003702',
      municipio_inicio: f.municipio_inicio || em.municipio || 'Dourados',
      uf_inicio: f.uf_inicio || em.uf || 'MS',
      codigo_municipio_fim: f.codigo_municipio_fim || '5002704',
      municipio_fim: f.municipio_fim || 'Campo Grande',
      uf_fim: f.uf_fim || 'MS',
      tomador: f.tomador || '0',
      remetente_dados: f.remetente_dados?.documento
        ? f.remetente_dados
        : {
            documento: em.cnpj || '03272053000150',
            razao_social: em.razao_social || 'PANTANAL COMERCIO DE ALIMENTOS LTDA',
            nome_fantasia: em.nome_fantasia || 'PANTANAL',
            inscricao_estadual: em.inscricao_estadual || '283100630',
            logradouro: em.logradouro || 'RUA ARGENTINA',
            numero: em.numero || '715',
            bairro: em.bairro || 'PARQUE DAS NACOES',
            cep: em.cep || '79841270',
            municipio: em.municipio || 'Dourados',
            codigo_municipio: em.codigo_municipio || '5003702',
            uf: em.uf || 'MS',
            telefone: em.telefone || '6734164605'
          },
      destinatario_dados: f.destinatario_dados?.documento
        ? f.destinatario_dados
        : {
            documento: '11144477735',
            razao_social: 'CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
            nome_fantasia: 'DESTINATARIO HOMOLOGACAO',
            inscricao_estadual: 'ISENTO',
            logradouro: 'AVENIDA AFONSO PENA',
            numero: '1000',
            bairro: 'CENTRO',
            cep: '79002070',
            municipio: 'Campo Grande',
            codigo_municipio: '5002704',
            uf: 'MS',
            telefone: '6734164605'
          },
      componentes_valor:
        f.componentes_valor.length > 0 && parseFloat(f.componentes_valor[0]?.valor || '0') > 0
          ? f.componentes_valor
          : [{ id: 'comp-homolog-1', nome: 'FRETE_VALOR', valor: '150.00' }],
      valor_total: f.valor_total && parseFloat(f.valor_total) > 0 ? f.valor_total : '150.00',
      valor_receber: f.valor_receber && parseFloat(f.valor_receber) > 0 ? f.valor_receber : '150.00',
      icms_situacao_tributaria: '00',
      aliquota_icms: '17.00',
      ibs_cbs_cst: f.ibs_cbs_cst || '000',
      ibs_cbs_class_trib: f.ibs_cbs_class_trib || '000001',
      codigo_situacao_fiscal: f.codigo_situacao_fiscal || '000001',
      aliquota_ibs: f.aliquota_ibs || '0.10',
      aliquota_ibs_mun: f.aliquota_ibs_mun || '0.00',
      aliquota_cbs: f.aliquota_cbs || '0.90',
      valor_total_carga: f.valor_total_carga && parseFloat(f.valor_total_carga) > 0 ? f.valor_total_carga : '1000.00',
      peso_bruto: f.peso_bruto && parseFloat(f.peso_bruto) > 0 ? f.peso_bruto : '100',
      quantidade_volumes: f.quantidade_volumes || '1',
      produto_predominante: f.produto_predominante || 'MERCADORIAS DIVERSAS',
      outras_caracteristicas_carga: f.outras_caracteristicas_carga || 'CAIXAS',
      data_prevista_entrega: f.data_prevista_entrega || amanha,
      documentos:
        f.documentos.length > 0
          ? f.documentos
          : [
              {
                id: 'doc-homolog-1',
                chave: 'DECLARACAO-HOMOLOGACAO-001',
                tipo: 'OUTRO',
                numero: '1'
              }
            ],
      rntrc: f.rntrc || em.rntrc || '04755410',
      observacoes: f.observacoes || 'CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO SEFAZ - SEM VALOR FISCAL'
    };
  };

  const montarPayload = (formBase = form) => {
    const cargasIds = formBase.documentos.map(d => d.carga_id).filter(Boolean);
    const totalComp = round2(
      formBase.componentes_valor.reduce(
        (acc, c) => acc + (parseFloat(c.valor || '0') || 0),
        0
      )
    );
    const baseCalc = round2(parseFloat(formBase.valor_total || '0') || totalComp);
    const aliqIcmsNum = parseFloat(formBase.aliquota_icms || '0') || 0;
    const isIcmsTrib = ['00', '20', '90'].includes(formBase.icms_situacao_tributaria);
    const baseIcmsCalc = isIcmsTrib ? baseCalc : 0;
    const vlrIcms = isIcmsTrib ? round2((baseIcmsCalc * aliqIcmsNum) / 100) : 0;

    const modoPc =
      formBase.pis_cofins_modo && formBase.pis_cofins_modo !== 'NAO_APURADO'
        ? formBase.pis_cofins_modo
        : emitenteSelecionado?.pis_cofins_modo || 'NAO_APURADO';
    const rawPis = formBase.aliquota_pis !== '' ? formBase.aliquota_pis : emitenteSelecionado?.aliquota_pis;
    const rawCofins = formBase.aliquota_cofins !== '' ? formBase.aliquota_cofins : emitenteSelecionado?.aliquota_cofins;
    const temPc =
      rawPis !== undefined && rawPis !== null && String(rawPis).trim() !== '' &&
      rawCofins !== undefined && rawCofins !== null && String(rawCofins).trim() !== '';
    const pcIncidente = excluirPisCofinsDaBaseIbsCbs && modoPc === 'INCIDENTE' && temPc;
    const basePc = pcIncidente
      ? Math.max(0, round2(formBase.excluir_icms_base_pis_cofins !== false ? baseCalc - vlrIcms : baseCalc))
      : 0;
    const vlrPis = pcIncidente ? round2((basePc * (parseFloat(String(rawPis)) || 0)) / 100) : null;
    const vlrCofins = pcIncidente ? round2((basePc * (parseFloat(String(rawCofins)) || 0)) / 100) : null;

    const dedIcms = excluirIcmsDaBaseIbsCbs && isIcmsTrib ? vlrIcms : 0;
    const dedPc = pcIncidente ? round2((vlrPis || 0) + (vlrCofins || 0)) : 0;
    const semGrupo = formBase.ibs_cbs_cst === '400' || formBase.ibs_cbs_cst === '410';
    const baseIbsCbsCalc = semGrupo ? 0 : Math.max(0, round2(baseCalc - dedIcms - dedPc));

    return {
      ...formBase,
      emitente_id: formBase.emitente_id ? Number(formBase.emitente_id) : undefined,
      componentes_valor: formBase.componentes_valor.map(c => ({ nome: c.nome, valor: round2(parseFloat(c.valor || '0') || 0) })),
      valor_total: baseCalc,
      valor_receber: round2(parseFloat(formBase.valor_receber || '0') || totalComp),
      base_icms: baseIcmsCalc,
      valor_icms: vlrIcms,
      ibs_cbs_base_calculo: baseIbsCbsCalc,
      pis_cofins_modo: modoPc,
      pis_cst: formBase.pis_cst || null,
      aliquota_pis: temPc ? parseFloat(String(rawPis)) : null,
      valor_pis: vlrPis,
      cofins_cst: formBase.cofins_cst || null,
      aliquota_cofins: temPc ? parseFloat(String(rawCofins)) : null,
      valor_cofins: vlrCofins,
      excluir_icms_base_pis_cofins: formBase.excluir_icms_base_pis_cofins !== false,
      valor_carga: round2(parseFloat(formBase.valor_total_carga || '0') || 0),
      peso_bruto: parseFloat(formBase.peso_bruto || '0') || 0,
      quantidade_volumes: parseFloat(formBase.quantidade_volumes || '1') || 1,
      remetente_dados: formBase.remetente_dados,
      destinatario_dados: formBase.destinatario_dados,
      modal_os_dados: formBase.modelo === '67' ? { taf: formBase.taf, numero_registro_estadual: formBase.numero_registro_estadual } : undefined,
      documentos: formBase.documentos,
      cargas_ids: cargasIds
    };
  };

  const preencherTesteHomologacao = () => {
    setForm(f => construirFormTesteHomologacao(f));
    setVisitados(new Set(STEPS.map(s => s.id)));
  };

  const salvar = async (transmitir: boolean) => {
    setSalvando(true);
    setErroSalvar('');
    try {
      const formEfetivo =
        transmitir &&
        ambienteAtivo === 'homologacao' &&
        (!form.codigo_municipio_fim || form.componentes_valor.length === 0 || form.documentos.length === 0)
          ? construirFormTesteHomologacao(form)
          : form;
      if (formEfetivo !== form) {
        setForm(formEfetivo);
        setVisitados(new Set(STEPS.map(s => s.id)));
      }
      const payload = montarPayload(formEfetivo);
      const res = cteId
        ? await api.put(`/transporte/ctes/${cteId}`, payload)
        : await api.post('/transporte/ctes', payload);
      const id = res.data?.data?.id || cteId;
      setCteId(id);
      qc.invalidateQueries({ queryKey: ['ctes'] });

      if (transmitir) {
        const resEmitir = await api.post(`/transporte/ctes/${id}/emitir`);
        const dadosEmissao = resEmitir.data || {};
        const ambLabel =
          (dadosEmissao.ambiente || ambienteAtivo) === 'producao'
            ? 'PRODUÇÃO (Validade Jurídica SEFAZ)'
            : 'HOMOLOGAÇÃO (Testes SEFAZ — Sem Valor Fiscal)';

        if (dadosEmissao.status === 'REJEITADO') {
          setErroSalvar(
            `SEFAZ [${dadosEmissao.status_sefaz || 'REJEITADO'}] (${ambLabel}): ${
              dadosEmissao.mensagem_sefaz || 'Documento rejeitado pela SEFAZ. Revise os campos e tente novamente.'
            }`
          );
          return;
        }

        if (dadosEmissao.status === 'AUTORIZADO') {
          alert(
            `CT-e AUTORIZADO com sucesso na SEFAZ!\n\n` +
              `• Ambiente: ${ambLabel}\n` +
              `• Número / Série: ${dadosEmissao.numero || '—'} / ${dadosEmissao.serie || '1'}\n` +
              `• Protocolo SEFAZ: ${dadosEmissao.protocolo || '—'}\n` +
              `• Chave de Acesso: ${dadosEmissao.chave_cte || '—'}`
          );
        } else {
          alert(
            `CT-e transmitido para a SEFAZ em ambiente de ${ambLabel}!\n` +
              `Acompanhe o retorno e baixe o XML/DACTE em Documentos Emitidos.`
          );
        }
        navigate('/transporte/documentos');
      } else {
        alert('CT-e salvo como rascunho. Transmita quando estiver pronto.');
        navigate('/transporte/ctes');
      }
    } catch (err: any) {
      setErroSalvar(err.response?.data?.error || err.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  // ── Auxiliares ──
  const selecionarMunicipio = (campoCodigo: string, campoNome: string, campoUf: string, codigo: string) => {
    const m = municipios.find((x: any) => x.codigo_ibge === codigo);
    setForm(f => ({
      ...f,
      [campoCodigo]: codigo,
      [campoNome]: m?.cidade || '',
      [campoUf]: m?.uf || ''
    }));
  };

  const opcoesMunicipios = municipios.map((m: any) => ({
    valor: m.codigo_ibge,
    rotulo: `${m.cidade} / ${m.uf} (IBGE ${m.codigo_ibge})`
  }));

  const adicionarDocumento = () => {
    if (novoDoc.tipo === 'OUTRO') {
      const numDoc = novoDoc.chave.trim() || novoDoc.numero.trim() || String(form.documentos.length + 1);
      setForm(f => ({
        ...f,
        documentos: [
          ...f.documentos,
          {
            id: `${Date.now()}-${Math.random()}`,
            chave: `DECLARACAO-${numDoc}`,
            tipo: 'OUTRO',
            numero: numDoc
          }
        ]
      }));
      setNovoDoc({ chave: '', tipo: 'NFE', numero: '' });
      return;
    }
    const digits = novoDoc.chave.replace(/\D/g, '').slice(0, 44);
    if (digits.length !== 44) {
      alert('Informe uma chave de acesso válida (44 dígitos) ou selecione "Declaração / Outro" para teste sem NF-e.');
      return;
    }
    if (form.documentos.some(d => d.chave === digits)) {
      alert('Esta chave de acesso já está vinculada.');
      return;
    }
    setForm(f => ({
      ...f,
      documentos: [...f.documentos, { ...novoDoc, chave: digits, id: `${Date.now()}-${Math.random()}` }]
    }));
    setNovoDoc({ chave: '', tipo: 'NFE', numero: '' });
  };

  // Auto-preenche Remetente, Destinatário, Carga e Município Fim ao vincular NF-e do ERP
  const vincularCarga = (cargaId: number) => {
    const c = cargas.find((x: any) => x.id === cargaId);
    if (!c) return;
    if (form.documentos.some(d => d.chave === c.chave_acesso)) {
      alert('Esta nota já está vinculada.');
      return;
    }
    const nfe = typeof c.dados_nfe === 'string' ? (() => { try { return JSON.parse(c.dados_nfe); } catch { return {}; } })() : (c.dados_nfe || {});
    const munFim = municipios.find((m: any) =>
      (c.destinatario_codigo_municipio && m.codigo_ibge === String(c.destinatario_codigo_municipio)) ||
      (c.destinatario_municipio && m.cidade?.toLowerCase() === String(c.destinatario_municipio).toLowerCase() && m.uf === c.destinatario_uf)
    );

    setForm(f => ({
      ...f,
      valor_total_carga: f.valor_total_carga || String(c.valor_total || ''),
      peso_bruto: f.peso_bruto || String(c.peso_bruto || ''),
      quantidade_volumes: f.quantidade_volumes || String(c.volumes || '1'),
      produto_predominante: f.produto_predominante || c.produto_predominante || nfe.produto_predominante || 'MERCADORIAS DIVERSAS',
      codigo_municipio_fim: f.codigo_municipio_fim || munFim?.codigo_ibge || c.destinatario_codigo_municipio || '',
      municipio_fim: f.municipio_fim || munFim?.cidade || c.destinatario_municipio || '',
      uf_fim: f.uf_fim || munFim?.uf || c.destinatario_uf || '',
      remetente_dados: f.remetente_dados.documento ? f.remetente_dados : {
        documento: c.remetente_cnpj || nfe.remetente?.documento || '',
        razao_social: c.remetente_nome || nfe.remetente?.razao_social || '',
        nome_fantasia: c.remetente_nome || '',
        inscricao_estadual: nfe.remetente?.inscricao_estadual || 'ISENTO',
        logradouro: nfe.remetente?.logradouro || 'RUA PRINCIPAL',
        numero: nfe.remetente?.numero || 'S/N',
        bairro: nfe.remetente?.bairro || 'CENTRO',
        cep: nfe.remetente?.cep || '',
        municipio: c.remetente_municipio || nfe.remetente?.municipio || f.municipio_inicio,
        codigo_municipio: c.remetente_codigo_municipio || nfe.remetente?.codigo_municipio || f.codigo_municipio_inicio,
        uf: c.remetente_uf || nfe.remetente?.uf || f.uf_inicio,
        telefone: nfe.remetente?.telefone || ''
      },
      destinatario_dados: {
        documento: c.destinatario_cnpj || c.destinatario_cpf || nfe.destinatario?.documento || f.destinatario_dados.documento,
        razao_social: c.destinatario_nome || nfe.destinatario?.razao_social || f.destinatario_dados.razao_social,
        nome_fantasia: c.destinatario_nome || f.destinatario_dados.nome_fantasia,
        inscricao_estadual: c.destinatario_ie || nfe.destinatario?.inscricao_estadual || f.destinatario_dados.inscricao_estadual || 'ISENTO',
        logradouro: c.destinatario_endereco || nfe.destinatario?.logradouro || f.destinatario_dados.logradouro || 'RUA PRINCIPAL',
        numero: c.destinatario_numero || nfe.destinatario?.numero || f.destinatario_dados.numero || 'S/N',
        bairro: c.destinatario_bairro || nfe.destinatario?.bairro || f.destinatario_dados.bairro || 'CENTRO',
        cep: c.destinatario_cep || nfe.destinatario?.cep || f.destinatario_dados.cep,
        municipio: c.destinatario_municipio || munFim?.cidade || f.destinatario_dados.municipio,
        codigo_municipio: c.destinatario_codigo_municipio || munFim?.codigo_ibge || f.destinatario_dados.codigo_municipio,
        uf: c.destinatario_uf || munFim?.uf || f.destinatario_dados.uf,
        telefone: c.destinatario_telefone || nfe.destinatario?.telefone || f.destinatario_dados.telefone
      },
      documentos: [...f.documentos, {
        id: `carga-${c.id}`,
        chave: c.chave_acesso || '',
        tipo: 'NFE',
        numero: c.numero || '',
        carga_id: c.id
      }]
    }));
  };

  const aplicarParte = (p: any, alvo: 'remetente_dados' | 'destinatario_dados' | 'tomador') => {
    if (alvo === 'tomador') {
      setCampo('tomador_documento', p.documento);
      setCampo('tomador_nome', p.razao_social);
      if (form.tomador === '4') {
        setCampo('tomador_outros_nome', p.razao_social);
        setCampo('tomador_outros_documento', p.documento);
        setCampo('tomador_outros_ie', p.inscricao_estadual || 'ISENTO');
        setCampo('tomador_outros_endereco', `${p.logradouro || ''} ${p.numero || ''}`.trim());
        setCampo('tomador_outros_municipio', p.municipio || '');
        setCampo('tomador_outros_uf', p.uf || '');
        setCampo('tomador_outros_cep', p.cep || '');
      }
      return;
    }
    setForm(f => ({
      ...f,
      [alvo]: {
        documento: p.documento || '',
        razao_social: p.razao_social || '',
        nome_fantasia: p.nome_fantasia || p.razao_social || '',
        inscricao_estadual: p.inscricao_estadual || 'ISENTO',
        logradouro: p.logradouro || 'RUA PRINCIPAL',
        numero: p.numero || 'S/N',
        bairro: p.bairro || 'CENTRO',
        cep: p.cep || '',
        municipio: p.municipio || '',
        codigo_municipio: p.codigo_municipio || '',
        uf: p.uf || '',
        telefone: p.telefone || ''
      }
    }));
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <FileText className="w-6 h-6 text-brand-600 dark:text-brand-500" />
              Emissão de CT-e 4.00 / CT-e OS (Focus NFe v2)
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                ambienteAtivo === 'producao'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {ambienteAtivo === 'producao'
                ? 'Ambiente: Produção (Validade Jurídica SEFAZ)'
                : 'Ambiente: Homologação (Testes SEFAZ — Sem Valor Fiscal)'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Preencha as 6 etapas na ordem da SEFAZ. Vincular uma NF-e preenche automaticamente Remetente, Destinatário e Carga.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ambienteAtivo === 'homologacao' && (
            <button
              type="button"
              onClick={preencherTesteHomologacao}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
              title="Preenche automaticamente todas as 6 abas com dados válidos para teste de homologação na SEFAZ"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Preencher Dados de Teste (Homologação)
            </button>
          )}
          <button
            type="button"
            onClick={() => salvar(false)}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar Rascunho
          </button>
          <button
            type="button"
            onClick={() => salvar(true)}
            disabled={salvando || erros.rodoviario.length > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Salvar e Transmitir SEFAZ
          </button>
        </div>
      </div>

      {erroSalvar && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 dark:text-red-200">{erroSalvar}</p>
        </div>
      )}

      {/* Stepper */}
      <WizardStepper
        steps={STEPS}
        atual={passoAtual}
        visitados={visitados}
        errosPorPasso={errosPorPasso}
        onIrPara={irParaPasso}
      />

      {/* Conteúdo da aba */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6">
        {/* ─── ABA 1: DADOS ─── */}
        {passoAtual === 0 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal rotulo="Transportadora Emitente" obrigatorio erro={erros.dados.find(e => e.includes('transportadora'))}>
                <SelectFiscal
                  value={form.emitente_id}
                  onChange={v => {
                    setCampo('emitente_id', v);
                    const em = emitentes.find((x: any) => String(x.id) === v);
                    if (em) {
                      setForm(f => ({
                        ...f,
                        rntrc: f.rntrc || em.rntrc || '',
                        codigo_municipio_inicio: f.codigo_municipio_inicio || em.codigo_municipio || '',
                        municipio_inicio: f.municipio_inicio || em.municipio || '',
                        uf_inicio: f.uf_inicio || em.uf || ''
                      }));
                    }
                  }}
                  opcoes={emitentes.map((em: any) => ({ valor: String(em.id), rotulo: `${em.razao_social} — ${em.cnpj}` }))}
                  placeholder="Selecione a transportadora..."
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Modelo Fiscal SEFAZ" obrigatorio dica="57 para cargas, 67 para CT-e OS (fretamento/valores)">
                <SelectFiscal
                  value={form.modelo}
                  onChange={v => {
                    setCampo('modelo', v);
                    if (v === '67' && form.tipo_servico === '0') setCampo('tipo_servico', '6');
                  }}
                  opcoes={MODELOS_DOCUMENTO}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Modalidade do CT-e" obrigatorio>
                <SelectFiscal value={form.modelo_cte} onChange={v => setCampo('modelo_cte', v)} opcoes={MODELOS_CTE} />
              </CampoFiscal>

              <CampoFiscal rotulo="CFOP" obrigatorio dica="Código da operação fiscal do serviço de transporte">
                <InputFiscal value={form.cfop} onChange={v => setCampo('cfop', v)} placeholder="5353" />
              </CampoFiscal>

              <CampoFiscal rotulo="Natureza da Operação" obrigatorio>
                <InputFiscal value={form.natureza_operacao} onChange={v => setCampo('natureza_operacao', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="Tipo de Serviço" obrigatorio>
                <SelectFiscal value={form.tipo_servico} onChange={v => setCampo('tipo_servico', v)} opcoes={TIPOS_SERVICO} />
              </CampoFiscal>

              <CampoFiscal rotulo="Finalidade" obrigatorio>
                <SelectFiscal value={form.finalidade} onChange={v => setCampo('finalidade', v)} opcoes={FINALIDADES} />
              </CampoFiscal>

              <CampoFiscal rotulo="Formato do DACTE" obrigatorio>
                <SelectFiscal value={form.formato_dacte} onChange={v => setCampo('formato_dacte', v)} opcoes={FORMATOS_DACTE} />
              </CampoFiscal>

              <CampoFiscal rotulo="Município de Início da Prestação" obrigatorio>
                <SelectFiscal
                  value={form.codigo_municipio_inicio}
                  onChange={v => selecionarMunicipio('codigo_municipio_inicio', 'municipio_inicio', 'uf_inicio', v)}
                  opcoes={opcoesMunicipios}
                  placeholder="Selecione..."
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Município de Fim da Prestação" obrigatorio>
                <SelectFiscal
                  value={form.codigo_municipio_fim}
                  onChange={v => selecionarMunicipio('codigo_municipio_fim', 'municipio_fim', 'uf_fim', v)}
                  opcoes={opcoesMunicipios}
                  placeholder="Selecione..."
                />
              </CampoFiscal>
            </GradeCampos>
          </div>
        )}

        {/* ─── ABA 2: PARTICIPANTES (REMETENTE, DESTINATÁRIO E TOMADOR) ─── */}
        {passoAtual === 1 && (
          <div className="space-y-6">
            {/* Tomador */}
            <GradeCampos>
              <CampoFiscal rotulo="Tomador do Serviço (Pagador do Frete)" obrigatorio>
                <SelectFiscal value={form.tomador} onChange={v => setCampo('tomador', v)} opcoes={TOMADORES} />
              </CampoFiscal>

              {form.tomador !== '4' && (
                <CampoFiscal rotulo="Documento do Tomador" dica="Opcional — usa automaticamente o participante selecionado">
                  <InputFiscal
                    value={form.tomador_documento}
                    onChange={v => setCampo('tomador_documento', mascaras.cpfCnpj(v))}
                    placeholder="00.000.000/0000-00"
                  />
                </CampoFiscal>
              )}

              {form.tomador === '4' && (
                <>
                  <CampoFiscal rotulo="Nome/Razão Social do Tomador (Outros)" obrigatorio>
                    <InputFiscal value={form.tomador_outros_nome} onChange={v => setCampo('tomador_outros_nome', v)} />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CNPJ/CPF do Tomador (Outros)" obrigatorio>
                    <InputFiscal
                      value={form.tomador_outros_documento}
                      onChange={v => setCampo('tomador_outros_documento', mascaras.cpfCnpj(v))}
                      placeholder="00.000.000/0000-00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Inscrição Estadual do Tomador">
                    <InputFiscal value={form.tomador_outros_ie} onChange={v => setCampo('tomador_outros_ie', v)} />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Município do Tomador">
                    <InputFiscal value={form.tomador_outros_municipio} onChange={v => setCampo('tomador_outros_municipio', v)} />
                  </CampoFiscal>
                  <CampoFiscal rotulo="UF do Tomador">
                    <InputFiscal value={form.tomador_outros_uf} onChange={v => setCampo('tomador_outros_uf', v.toUpperCase())} placeholder="MS" />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Endereço do Tomador">
                    <InputFiscal value={form.tomador_outros_endereco} onChange={v => setCampo('tomador_outros_endereco', v)} />
                  </CampoFiscal>
                </>
              )}
            </GradeCampos>

            {/* Remetente e Destinatário lado a lado */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Remetente */}
              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
                <legend className="px-2 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Remetente da Carga (Origem) *
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CampoFiscal rotulo="CNPJ / CPF *" erro={erros.participantes.find(e => e.includes('CNPJ/CPF do Remetente'))}>
                    <InputFiscal
                      value={form.remetente_dados.documento}
                      onChange={v => setParticipante('remetente_dados', 'documento', mascaras.cpfCnpj(v))}
                      placeholder="00.000.000/0000-00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Inscrição Estadual">
                    <InputFiscal
                      value={form.remetente_dados.inscricao_estadual}
                      onChange={v => setParticipante('remetente_dados', 'inscricao_estadual', v)}
                      placeholder="ISENTO ou IE"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Razão Social / Nome *" colSpan={2} erro={erros.participantes.find(e => e.includes('Nome do Remetente'))}>
                    <InputFiscal
                      value={form.remetente_dados.razao_social}
                      onChange={v => setParticipante('remetente_dados', 'razao_social', v)}
                      placeholder="Razão Social do Remetente"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Logradouro">
                    <InputFiscal
                      value={form.remetente_dados.logradouro}
                      onChange={v => setParticipante('remetente_dados', 'logradouro', v)}
                      placeholder="Rua / Av."
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Número / Bairro">
                    <div className="flex gap-2">
                      <InputFiscal
                        value={form.remetente_dados.numero}
                        onChange={v => setParticipante('remetente_dados', 'numero', v)}
                        placeholder="Nº"
                      />
                      <InputFiscal
                        value={form.remetente_dados.bairro}
                        onChange={v => setParticipante('remetente_dados', 'bairro', v)}
                        placeholder="Bairro"
                      />
                    </div>
                  </CampoFiscal>
                  <CampoFiscal rotulo="Município / UF">
                    <SelectFiscal
                      value={form.remetente_dados.codigo_municipio}
                      onChange={v => {
                        const m = municipios.find((x: any) => x.codigo_ibge === v);
                        setForm(f => ({
                          ...f,
                          remetente_dados: {
                            ...f.remetente_dados,
                            codigo_municipio: v,
                            municipio: m?.cidade || f.remetente_dados.municipio,
                            uf: m?.uf || f.remetente_dados.uf
                          }
                        }));
                      }}
                      opcoes={opcoesMunicipios}
                      placeholder={form.remetente_dados.municipio ? `${form.remetente_dados.municipio}/${form.remetente_dados.uf}` : 'Selecione...'}
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CEP">
                    <InputFiscal
                      value={form.remetente_dados.cep}
                      onChange={v => setParticipante('remetente_dados', 'cep', v)}
                      placeholder="00000-000"
                    />
                  </CampoFiscal>
                </div>
              </fieldset>

              {/* Destinatário */}
              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
                <legend className="px-2 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Destinatário da Carga (Destino) *
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CampoFiscal rotulo="CNPJ / CPF *" erro={erros.participantes.find(e => e.includes('CNPJ/CPF do Destinatário'))}>
                    <InputFiscal
                      value={form.destinatario_dados.documento}
                      onChange={v => setParticipante('destinatario_dados', 'documento', mascaras.cpfCnpj(v))}
                      placeholder="00.000.000/0000-00"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Inscrição Estadual">
                    <InputFiscal
                      value={form.destinatario_dados.inscricao_estadual}
                      onChange={v => setParticipante('destinatario_dados', 'inscricao_estadual', v)}
                      placeholder="ISENTO ou IE"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Razão Social / Nome *" colSpan={2} erro={erros.participantes.find(e => e.includes('Nome do Destinatário'))}>
                    <InputFiscal
                      value={form.destinatario_dados.razao_social}
                      onChange={v => setParticipante('destinatario_dados', 'razao_social', v)}
                      placeholder="Razão Social ou Nome do Destinatário"
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Logradouro">
                    <InputFiscal
                      value={form.destinatario_dados.logradouro}
                      onChange={v => setParticipante('destinatario_dados', 'logradouro', v)}
                      placeholder="Rua / Av."
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Número / Bairro">
                    <div className="flex gap-2">
                      <InputFiscal
                        value={form.destinatario_dados.numero}
                        onChange={v => setParticipante('destinatario_dados', 'numero', v)}
                        placeholder="Nº"
                      />
                      <InputFiscal
                        value={form.destinatario_dados.bairro}
                        onChange={v => setParticipante('destinatario_dados', 'bairro', v)}
                        placeholder="Bairro"
                      />
                    </div>
                  </CampoFiscal>
                  <CampoFiscal rotulo="Município / UF">
                    <SelectFiscal
                      value={form.destinatario_dados.codigo_municipio}
                      onChange={v => {
                        const m = municipios.find((x: any) => x.codigo_ibge === v);
                        setForm(f => ({
                          ...f,
                          destinatario_dados: {
                            ...f.destinatario_dados,
                            codigo_municipio: v,
                            municipio: m?.cidade || f.destinatario_dados.municipio,
                            uf: m?.uf || f.destinatario_dados.uf
                          }
                        }));
                      }}
                      opcoes={opcoesMunicipios}
                      placeholder={form.destinatario_dados.municipio ? `${form.destinatario_dados.municipio}/${form.destinatario_dados.uf}` : 'Selecione...'}
                    />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CEP">
                    <InputFiscal
                      value={form.destinatario_dados.cep}
                      onChange={v => setParticipante('destinatario_dados', 'cep', v)}
                      placeholder="00000-000"
                    />
                  </CampoFiscal>
                </div>
              </fieldset>
            </div>

            {/* Partes do ERP para preenchimento rápido */}
            <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Clientes / Parceiros sincronizados do ERP (clique para preencher)
                </span>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {partes.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">Nenhuma parte cadastrada.</p>
                ) : (
                  partes.slice(0, 50).map((p: any) => (
                    <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{p.razao_social}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{p.documento} · {p.municipio}/{p.uf}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => aplicarParte(p, 'remetente_dados')}
                          className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                        >
                          Remetente
                        </button>
                        <button
                          type="button"
                          onClick={() => aplicarParte(p, 'destinatario_dados')}
                          className="px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-200"
                        >
                          Destinatário
                        </button>
                        <button
                          type="button"
                          onClick={() => aplicarParte(p, 'tomador')}
                          className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200"
                        >
                          Tomador
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── ABA 3: SERVIÇOS E IMPOSTOS ─── */}
        {passoAtual === 2 && (
          <div className="space-y-6">
            <ListaEditavelFiscal<Componente>
              titulo="Componentes do Valor da Prestação"
              itens={form.componentes_valor}
              onChange={itens => {
                const soma = itens.reduce((acc, c) => acc + (parseFloat(c.valor || '0') || 0), 0);
                setForm(f => ({
                  ...f,
                  componentes_valor: itens,
                  valor_total: soma > 0 ? soma.toFixed(2) : f.valor_total,
                  valor_receber: soma > 0 ? soma.toFixed(2) : f.valor_receber
                }));
              }}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, nome: 'FRETE_PESO', valor: '' })}
              rotuloBotao="Novo Componente"
              vazio="Adicione os componentes que compõem o frete (frete por peso, pedágio, GRIS...)."
              renderItem={(item, _i, atualizar, remover) => (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SelectFiscal
                      value={item.nome}
                      onChange={v => atualizar({ ...item, nome: v })}
                      opcoes={COMPONENTES_FRETE}
                    />
                  </div>
                  <div className="w-36">
                    <InputFiscal
                      type="number"
                      step="0.01"
                      value={item.valor}
                      onChange={v => atualizar({ ...item, valor: v })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <BotaoRemover onClick={remover} />
                </div>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total dos Componentes</span>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  R$ {totalComponentes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Valor Total da Prestação</span>
                <p className="text-lg font-black text-brand-600 dark:text-brand-400 mt-0.5 tabular-nums">
                  R$ {baseCalculo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Valor a Receber</span>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                  R$ {(parseFloat(form.valor_receber || '0') || totalComponentes).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <GradeCampos>
              <CampoFiscal rotulo="Valor Total da Prestação" obrigatorio erro={erros.servicos.find(e => e.includes('Valor total'))}>
                <InputFiscal type="number" step="0.01" value={form.valor_total} onChange={v => setCampo('valor_total', v)} placeholder="0,00" />
              </CampoFiscal>

              <CampoFiscal rotulo="Valor a Receber" dica="Deixe vazio para usar o total dos componentes">
                <InputFiscal type="number" step="0.01" value={form.valor_receber} onChange={v => setCampo('valor_receber', v)} placeholder="0,00" />
              </CampoFiscal>

              <CampoFiscal rotulo="ICMS — Situação Tributária (CST)" obrigatorio>
                <SelectFiscal
                  value={form.icms_situacao_tributaria}
                  onChange={v => setCampo('icms_situacao_tributaria', v)}
                  opcoes={[
                    { valor: '00', rotulo: '00 — Tributação Normal Integral' },
                    { valor: '20', rotulo: '20 — Tributação com Redução de Base de Cálculo' },
                    { valor: '40', rotulo: '40 — ICMS Isenção' },
                    { valor: '41', rotulo: '41 — ICMS Não Tributada' },
                    { valor: '51', rotulo: '51 — ICMS Diferido' },
                    { valor: '60', rotulo: '60 — ICMS Cobrado por Substituição Tributária' },
                    { valor: '90', rotulo: '90 — ICMS Outros' },
                    { valor: 'SN', rotulo: 'SN — Simples Nacional' }
                  ]}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="ICMS — Alíquota (%)" obrigatorio>
                <InputFiscal type="number" step="0.01" value={form.aliquota_icms} onChange={v => setCampo('aliquota_icms', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="IBS / CBS — Situação Tributária (CST)" obrigatorio dica="Reforma Tributária (LC 214/2025)">
                <SelectFiscal
                  value={form.ibs_cbs_cst}
                  onChange={v => {
                    const classSug =
                      v === '200'
                        ? '200002'
                        : v === '410'
                        ? '410001'
                        : v === '510'
                        ? '510001'
                        : v === '515'
                        ? '515001'
                        : '000001';
                    setForm(f => ({
                      ...f,
                      ibs_cbs_cst: v,
                      ibs_cbs_class_trib: classSug,
                      codigo_situacao_fiscal: classSug,
                    }));
                  }}
                  opcoes={[
                    { valor: '000', rotulo: '000 — Tributação Integral (Padrão 2026)' },
                    { valor: '200', rotulo: '200 — Alíquota Reduzida' },
                    { valor: '410', rotulo: '410 — Imunidade / Não Incidência' },
                    { valor: '510', rotulo: '510 — Diferimento' },
                    { valor: '515', rotulo: '515 — Diferimento com Redução de Alíquota' }
                  ]}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Classificação Tributária (cClassTrib)" obrigatorio dica="6 dígitos (ex: 000001)">
                <InputFiscal
                  value={form.ibs_cbs_class_trib}
                  onChange={v => {
                    const limpo = v.replace(/\D/g, '').slice(0, 6);
                    setForm(f => ({ ...f, ibs_cbs_class_trib: limpo, codigo_situacao_fiscal: limpo }));
                  }}
                  placeholder="000001"
                />
              </CampoFiscal>

              <CampoFiscal rotulo="IBS UF — Alíquota (%)" obrigatorio dica="Transição 2026: 0,10%">
                <InputFiscal type="number" step="0.0001" value={form.aliquota_ibs} onChange={v => setCampo('aliquota_ibs', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="CBS Federal — Alíquota (%)" obrigatorio dica="Transição 2026: 0,90%">
                <InputFiscal type="number" step="0.0001" value={form.aliquota_cbs} onChange={v => setCampo('aliquota_cbs', v)} />
              </CampoFiscal>

              <CampoFiscal
                rotulo="PIS / COFINS na Operação"
                dica="LC 214/2025, art. 12, § 2º, V (exclusão da base do IBS/CBS em 2026)"
              >
                <SelectFiscal
                  value={form.pis_cofins_modo}
                  onChange={v => {
                    if (v === 'NAO_INCIDENTE') {
                      setForm(f => ({
                        ...f,
                        pis_cofins_modo: 'NAO_INCIDENTE',
                        pis_cst: f.pis_cst || '06',
                        cofins_cst: f.cofins_cst || '06',
                        aliquota_pis: '',
                        aliquota_cofins: '',
                      }));
                    } else {
                      setCampo('pis_cofins_modo', v);
                    }
                  }}
                  opcoes={[
                    { valor: 'NAO_APURADO', rotulo: 'Não parametrizado (sinalizar pendência fiscal)' },
                    { valor: 'INCIDENTE', rotulo: 'Incidente na prestação (informar PIS/COFINS)' },
                    { valor: 'NAO_INCIDENTE', rotulo: 'Não incidente / Alíquota Zero / Suspensão (CST 04/06/07/08/09)' }
                  ]}
                />
              </CampoFiscal>

              {form.pis_cofins_modo === 'INCIDENTE' && (
                <>
                  <CampoFiscal rotulo="PIS — Alíquota (%)" dica="Ex.: 0,65% (cumulativo) ou 1,65% (não cumulativo)">
                    <InputFiscal type="number" step="0.0001" value={form.aliquota_pis} onChange={v => setCampo('aliquota_pis', v)} placeholder="Ex: 0.65" />
                  </CampoFiscal>
                  <CampoFiscal rotulo="COFINS — Alíquota (%)" dica="Ex.: 3,00% (cumulativo) ou 7,60% (não cumulativo)">
                    <InputFiscal type="number" step="0.0001" value={form.aliquota_cofins} onChange={v => setCampo('aliquota_cofins', v)} placeholder="Ex: 3.00" />
                  </CampoFiscal>
                </>
              )}
            </GradeCampos>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Memória de cálculo fiscal (ICMS + Base Líquida IBS/CBS — Art. 12, § 2º, V, LC 214/2025)
                  </span>
                </div>
                {!somarIbsCbsNoTotalDfe && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                    Vigência {anoVigencia}: IBS/CBS não somam ao vTotDFe
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="flex justify-between gap-2"><span className="text-slate-500">Base ICMS</span><span className="font-bold text-slate-900 dark:text-white">R$ {baseIcms.toFixed(2)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ICMS ({aliquotaIcms}%)</span><span className="font-bold text-slate-900 dark:text-white">R$ {valorIcms.toFixed(2)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Base IBS/CBS</span><span className="font-bold text-slate-900 dark:text-white">R$ {baseIbsCbs.toFixed(2)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">IBS ({aliquotaIbs}%)</span><span className="font-bold text-emerald-700 dark:text-emerald-400">R$ {valorIbs.toFixed(2)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">CBS ({aliquotaCbs}%)</span><span className="font-bold text-emerald-700 dark:text-emerald-400">R$ {valorCbs.toFixed(2)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Total DFe (vTotDFe)</span><span className="font-bold text-brand-600 dark:text-brand-400">R$ {valorTotalDfe.toFixed(2)}</span></div>
              </div>

              {pisCofinsIncidente && (
                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Base PIS/COFINS: <strong>R$ {basePisCofins.toFixed(2)}</strong></span>
                  <span>PIS ({aliquotaPis}%): <strong>R$ {valorPis.toFixed(2)}</strong></span>
                  <span>COFINS ({aliquotaCofins}%): <strong>R$ {valorCofins.toFixed(2)}</strong></span>
                  <span>Total excluído da base IBS/CBS: <strong>R$ {(deducaoIcmsIbsCbs + deducaoPisCofinsIbsCbs).toFixed(2)}</strong></span>
                </div>
              )}

              {pisCofinsPendente && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Pendência fiscal/cadastral de PIS/COFINS:</strong> a incidência e as alíquotas de PIS/COFINS não estão parametrizadas e não são presumidas apenas pelo CRT (nem pela ausência de tags no XML do CT-e 57). A base de IBS/CBS acima reflete somente a exclusão do ICMS destacado (R$ {deducaoIcmsIbsCbs.toFixed(2)}). Parametrize PIS/COFINS para confirmar a base definitiva.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── ABA 4: CARGA E DOCUMENTOS ─── */}
        {passoAtual === 3 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal rotulo="Valor Total da Carga (R$)" obrigatorio erro={erros.carga.find(e => e.includes('Valor total'))}>
                <InputFiscal type="number" step="0.01" value={form.valor_total_carga} onChange={v => setCampo('valor_total_carga', v)} placeholder="0,00" />
              </CampoFiscal>

              <CampoFiscal rotulo="Peso Bruto Total (kg)" obrigatorio dica="Enviado nas quantidades da carga para a SEFAZ">
                <InputFiscal type="number" step="0.001" value={form.peso_bruto} onChange={v => setCampo('peso_bruto', v)} placeholder="Ex: 1200.00" />
              </CampoFiscal>

              <CampoFiscal rotulo="Quantidade de Volumes">
                <InputFiscal type="number" step="1" value={form.quantidade_volumes} onChange={v => setCampo('quantidade_volumes', v)} placeholder="1" />
              </CampoFiscal>

              <CampoFiscal rotulo="Produto Predominante" obrigatorio erro={erros.carga.find(e => e.includes('Produto'))}>
                <InputFiscal value={form.produto_predominante} onChange={v => setCampo('produto_predominante', v)} placeholder="Ex: Mercadorias Diversas" />
              </CampoFiscal>

              <CampoFiscal rotulo="Outras Características da Carga">
                <InputFiscal value={form.outras_caracteristicas_carga} onChange={v => setCampo('outras_caracteristicas_carga', v)} placeholder="Ex: Caixas / Paletes" />
              </CampoFiscal>

              <CampoFiscal rotulo="Data Prevista de Entrega">
                <InputFiscal type="date" value={form.data_prevista_entrega} onChange={v => setCampo('data_prevista_entrega', v)} />
              </CampoFiscal>
            </GradeCampos>

            {/* Documentos vinculados */}
            <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Documentos Fiscais Vinculados ({form.documentos.length})
                </span>
                {erros.carga.length > 0 && (
                  <span className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
                    {erros.carga[0]}
                  </span>
                )}
              </div>

              <div className="p-3 space-y-2 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <InputFiscal
                      value={novoDoc.chave}
                      onChange={v =>
                        setNovoDoc({
                          ...novoDoc,
                          chave: novoDoc.tipo === 'OUTRO' ? v.slice(0, 20) : v.replace(/\D/g, '').slice(0, 44)
                        })
                      }
                      placeholder={
                        novoDoc.tipo === 'OUTRO'
                          ? 'Número da Declaração de Conteúdo (ex: 1)'
                          : 'Chave de acesso da NF-e (44 dígitos)'
                      }
                    />
                  </div>
                  <div className="w-44">
                    <SelectFiscal
                      value={novoDoc.tipo}
                      onChange={v => setNovoDoc({ ...novoDoc, tipo: v })}
                      opcoes={[
                        { valor: 'NFE', rotulo: 'NF-e (44 dígitos)' },
                        { valor: 'CTE', rotulo: 'CT-e (44 dígitos)' },
                        { valor: 'OUTRO', rotulo: 'Declaração / Outro' }
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={adicionarDocumento}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {novoDoc.tipo === 'OUTRO' ? 'Adicionar Declaração' : 'Adicionar Chave'}
                  </button>
                </div>

                {/* Vincular nota já sincronizada do ERP */}
                {cargas.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] text-slate-500 mb-1.5">
                      Ou vincule uma NF-e sincronizada do ERP (preenche automaticamente Destinatário, Valor, Peso e Município):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {cargas.slice(0, 30).map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => vincularCarga(c.id)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-brand-500 transition-colors"
                        >
                          NF-e {c.numero} · {c.destinatario_nome?.slice(0, 22)} (R$ {Number(c.valor_total || 0).toFixed(2)})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-52 overflow-y-auto">
                {form.documentos.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-400">
                    Nenhum documento vinculado. O CT-e Normal (Modelo 57) exige ao menos uma NF-e.
                  </p>
                ) : (
                  form.documentos.map(d => (
                    <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 dark:text-white">
                          {d.tipo} {d.numero || '—'}
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 truncate">{d.chave}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, documentos: f.documentos.filter(x => x.id !== d.id) }))}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── ABA 5: RODOVIÁRIO ─── */}
        {passoAtual === 4 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal
                rotulo="RNTRC (ANTT)"
                obrigatorio={form.modelo === '57'}
                erro={erros.rodoviario[0]}
                dica="Registro Nacional de Transportadores Rodoviários de Cargas (8 dígitos)"
              >
                <InputFiscal value={form.rntrc} onChange={v => setCampo('rntrc', v.replace(/\D/g, ''))} placeholder="00000000" />
              </CampoFiscal>

              {form.modelo === '67' && (
                <>
                  <CampoFiscal rotulo="TAF (Termo de Autorização de Fretamento)" dica="Para CT-e OS interestadual">
                    <InputFiscal value={form.taf} onChange={v => setCampo('taf', v)} placeholder="Informe o TAF se aplicável" />
                  </CampoFiscal>
                  <CampoFiscal rotulo="Nº Registro Estadual (CT-e OS)" dica="Para CT-e OS intermunicipal">
                    <InputFiscal value={form.numero_registro_estadual} onChange={v => setCampo('numero_registro_estadual', v)} placeholder="Registro estadual" />
                  </CampoFiscal>
                </>
              )}
            </GradeCampos>

            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                O RNTRC é preenchido automaticamente a partir de <strong>Configurações → Fiscal (Focus NFe)</strong> ou <strong>Dados da Empresa</strong>.
              </p>
            </div>
          </div>
        )}

        {/* ─── ABA 6: OBSERVAÇÕES ─── */}
        {passoAtual === 5 && (
          <div className="space-y-4">
            <CampoFiscal rotulo="Observações Gerais do CT-e (xObs)" dica="Informação adicional impressa no DACTE e enviada no XML">
              <TextareaFiscal
                value={form.observacoes}
                onChange={v => setCampo('observacoes', v)}
                placeholder="Informações adicionais para a SEFAZ ou para o destinatário..."
                rows={6}
              />
            </CampoFiscal>
          </div>
        )}

        {/* Navegação */}
        <div className="flex items-center justify-between gap-3 mt-8 pt-5 border-t border-slate-100 dark:border-slate-700/60">
          <button
            type="button"
            onClick={voltar}
            disabled={passoAtual === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>

          <div className="flex items-center gap-3">
            {errosDoPassoAtual.length > 0 && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                {errosDoPassoAtual[0]}
              </span>
            )}
            {passoAtual < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={avancar}
                disabled={!podeAvancar}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Avançar
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => salvar(true)}
                disabled={salvando || erros.rodoviario.length > 0}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Transmitir à SEFAZ
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
