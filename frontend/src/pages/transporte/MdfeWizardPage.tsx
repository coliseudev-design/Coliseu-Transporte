import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { CampoFiscal, GradeCampos, SelectFiscal, InputFiscal, TextareaFiscal, mascaras } from '../../components/fiscal/CampoFiscal';
import ListaEditavelFiscal, { BotaoRemover } from '../../components/fiscal/ListaEditavelFiscal';
import SeletorNotasErp, { CargaErpItem } from '../../components/fiscal/SeletorNotasErp';
import {
  Truck, Users, CreditCard, FileText, Package, Shield, Save, Send,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Loader2, Info,
  Plus, X, Search, Settings2, CircleDot, Scale
} from 'lucide-react';

interface Contratante { id: string; tipo: string; documento: string; nome: string; }
interface Seguro { id: string; responsavel: string; cnpj_responsavel: string; nome_seguradora: string; cnpj_seguradora?: string; numero_apolice: string; numero_averbacao: string; }
interface ProdutoPred { id: string; tipo_carga: string; descricao: string; ncm: string; lotacao: boolean; }
interface PagamentoFrete { id: string; responsavel: string; componentes: string; forma: string; tipo: string; }
interface ValePedagioItem { id: string; cnpj_fornecedor: string; doc_pagador: string; numero_comprovante: string; valor: string; tipo_vale_pedagio: string; }
interface Reboque { id: string; placa: string; tara_kg: string; capacidade_kg: string; }

const OPERADORAS_VPO = [
  { valor: '', rotulo: 'Selecionar operadora ANTT (ou digitar CNPJ)...' },
  { valor: '04088208000165', rotulo: 'Sem Parar / CGMP (04.088.208/0001-65)' },
  { valor: '16577631000108', rotulo: 'ConectCar (16.577.631/0001-08)' },
  { valor: '31731568000180', rotulo: 'Veloe / Alelo (31.731.568/0001-80)' },
  { valor: '18757057000178', rotulo: 'Move Mais (18.757.057/0001-78)' },
  { valor: '28067397000169', rotulo: 'Taggy / Greenpass (28.067.397/0001-69)' }
];

const UFS_BRASIL = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

const FRONTEIRAS_UFS_BRASIL: Record<string, string[]> = {
  AC: ['AM', 'RO'],
  AL: ['BA', 'PE', 'SE'],
  AM: ['AC', 'MT', 'PA', 'RO', 'RR'],
  AP: ['PA'],
  BA: ['AL', 'ES', 'GO', 'MG', 'PE', 'PI', 'SE', 'TO'],
  CE: ['PB', 'PE', 'PI', 'RN'],
  DF: ['GO', 'MG'],
  ES: ['BA', 'MG', 'RJ'],
  GO: ['BA', 'DF', 'MG', 'MS', 'MT', 'TO'],
  MA: ['PA', 'PI', 'TO'],
  MG: ['BA', 'DF', 'ES', 'GO', 'MS', 'RJ', 'SP'],
  MS: ['GO', 'MG', 'MT', 'PR', 'SP'],
  MT: ['AM', 'GO', 'MS', 'PA', 'RO', 'TO'],
  PA: ['AM', 'AP', 'MA', 'MT', 'RR', 'TO'],
  PB: ['CE', 'PE', 'RN'],
  PE: ['AL', 'BA', 'CE', 'PB', 'PI'],
  PI: ['BA', 'CE', 'MA', 'PE', 'TO'],
  PR: ['MS', 'SC', 'SP'],
  RJ: ['ES', 'MG', 'SP'],
  RN: ['CE', 'PB'],
  RO: ['AC', 'AM', 'MT'],
  RR: ['AM', 'PA'],
  RS: ['SC'],
  SC: ['PR', 'RS'],
  SE: ['AL', 'BA'],
  SP: ['MG', 'MS', 'PR', 'RJ'],
  TO: ['BA', 'GO', 'MA', 'MT', 'PA', 'PI']
};

function resolverPercursoUfs(ufInicio: string, ufFim: string): string[] {
  const ini = String(ufInicio || '').trim().toUpperCase();
  const fim = String(ufFim || '').trim().toUpperCase();
  if (!ini || !fim || ini === fim) return [];
  if ((FRONTEIRAS_UFS_BRASIL[ini] || []).includes(fim)) return [];
  const fila: string[][] = [[ini]];
  const visitados = new Set<string>([ini]);
  while (fila.length > 0) {
    const caminho = fila.shift()!;
    const atual = caminho[caminho.length - 1];
    for (const vizinho of FRONTEIRAS_UFS_BRASIL[atual] || []) {
      if (vizinho === fim) return caminho.slice(1);
      if (!visitados.has(vizinho)) {
        visitados.add(vizinho);
        fila.push([...caminho, vizinho]);
      }
    }
  }
  return [];
}

const TIPOS_CARGA = [
  { valor: '01', rotulo: '01 — Granel sólido' },
  { valor: '02', rotulo: '02 — Granel líquido' },
  { valor: '03', rotulo: '03 — Frigorificada' },
  { valor: '04', rotulo: '04 — Containerizada' },
  { valor: '05', rotulo: '05 — Carga Geral' },
  { valor: '06', rotulo: '06 — Neogranel' },
  { valor: '07', rotulo: '07 — Perigosa (granel sólido)' },
  { valor: '08', rotulo: '08 — Perigosa (granel líquido)' },
  { valor: '09', rotulo: '09 — Perigosa (carga frigorificada)' },
  { valor: '10', rotulo: '10 — Perigosa (containerizada)' },
  { valor: '11', rotulo: '11 — Perigosa (carga geral)' },
  { valor: '12', rotulo: '12 — Perigosa (neogranel)' }
];

export default function MdfeWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [aba, setAba] = useState<'dados' | 'seguro'>('dados');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const [mdfeId, setMdfeId] = useState<number | null>(null);
  const [novaChaveNfe, setNovaChaveNfe] = useState('');
  const [notasSelecionadasMeta, setNotasSelecionadasMeta] = useState<CargaErpItem[]>([]);

  const [form, setForm] = useState({
    emitente_id: '',
    tipo_emitente: '1', tipo_transporte: '1',
    data_emissao: new Date().toISOString().slice(0, 10),
    serie: '1', numero: '',
    uf_inicio: '', uf_fim: '',
    municipio_carga: '', codigo_municipio_carga: '',
    municipios_descarregamento: [] as { id: string; codigo: string; nome: string }[],
    ufs_percurso: [] as string[],
    informacao_adicional: '',
    // Rodoviário
    veiculo_id: '', veiculo_placa: '',
    reboques: [] as Reboque[],
    condutores: [] as { id: string; nome: string; cpf: string }[],
    contratantes: [] as Contratante[],
    // CIOT (NT 2026.001 — Rejeição 684), Pagamento e Vale-Pedágio Obrigatório (VPO)
    ciot_contrato_id: '',
    ciot_codigo: '',
    ciot_responsavel_documento: '',
    pagto_frete: [] as PagamentoFrete[],
    vale_pedagio: [] as ValePedagioItem[],
    campos_extras: {} as Record<string, any>,
    // Documentos (CT-e para tpEmit 1/3 | NF-e do ERP ou chave manual para tpEmit 2 Carga Própria)
    ctes_ids: [] as number[],
    cargas_ids: [] as number[],
    chaves_nfe: [] as string[],
    // Seguro
    seguros: [] as Seguro[],
    // Produtos
    produtos_predominantes: [] as ProdutoPred[],
    valor_total_carga: '', unidade_medida: '01', peso_bruto: '',
    lacres: [] as { id: string; numero: string }[],
    pessoas_autorizadas: [] as { id: string; cpf_cnpj: string }[]
  });

  const { data: emitentesData } = useQuery({
    queryKey: ['emitentes-mdfe'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitentes = emitentesData?.data || [];

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

  const { data: ctesData } = useQuery({
    queryKey: ['ctes-mdfe'],
    queryFn: async () => (await api.get('/transporte/ctes', { params: { limit: 200, status: 'AUTORIZADO' } })).data
  });
  const ctes = ctesData?.data || [];

  const { data: cargasData } = useQuery({
    queryKey: ['cargas-mdfe'],
    queryFn: async () => (await api.get('/transporte/cargas', { params: { limit: 200 } })).data
  });
  const cargas = useMemo(
    () => (cargasData?.data || []).filter((c: any) => c.status !== 'CANCELADA'),
    [cargasData]
  );

  const { data: municipiosData } = useQuery({
    queryKey: ['municipios-mdfe'],
    queryFn: async () => (await api.get('/transporte/municipios')).data
  });
  const municipios = municipiosData?.data || [];

  const { data: ciotsData } = useQuery({
    queryKey: ['ciot-mdfe-disponiveis'],
    queryFn: async () =>
      (await api.get('/transporte/contratos', { params: { disponivel_mdfe: 'true' } })).data
  });
  const ciotsDisponiveis = ciotsData?.data || [];

  const { data: camposDinamicosData } = useQuery({
    queryKey: ['campos-dinamicos-mdfe'],
    queryFn: async () => (await api.get('/transporte/campos')).data
  });
  const camposMdfeAtivos = useMemo(
    () =>
      (camposDinamicosData?.data || []).filter(
        (c: any) => c.ativo !== false && (c.documento === 'MDFE' || c.documento === 'AMBOS')
      ),
    [camposDinamicosData]
  );

  const construirSeguroPadrao = (em: any): Seguro[] => {
    if (!em?.seguro_seguradora_nome && !em?.seguro_numero_apolice) return [];
    const cnpjEmit = String(em.cnpj || '').replace(/\D/g, '');
    return [
      {
        id: `seg-padrao-${em.id || Date.now()}`,
        responsavel: '1',
        cnpj_responsavel: mascaras.cpfCnpj(cnpjEmit),
        nome_seguradora: String(em.seguro_seguradora_nome || ''),
        cnpj_seguradora: mascaras.cpfCnpj(String(em.seguro_seguradora_cnpj || '')),
        numero_apolice: String(em.seguro_numero_apolice || ''),
        numero_averbacao: String(em.seguro_averbacao_padrao || '')
      }
    ];
  };

  const aplicarOperacaoCiot = (contratoIdStr: string) => {
    const op = ciotsDisponiveis.find((c: any) => String(c.id) === String(contratoIdStr));
    if (!op) {
      setForm(f => ({ ...f, ciot_contrato_id: '' }));
      return;
    }
    const ciot12 = String(op.ciot_codigo || '').replace(/\D/g, '').slice(0, 12);
    const docContr = String(
      op.contratante_documento || emitentes[0]?.cnpj || ''
    ).replace(/\D/g, '');
    const tipoPag =
      op.forma_quitacao === 'PIX'
        ? '03'
        : op.forma_quitacao === 'CARTAO_FRETE'
        ? '02'
        : '01';
    const formaPag =
      Number(op.valor_adiantamento || 0) > 0 &&
      Number(op.valor_adiantamento || 0) < Number(op.valor_frete || 0)
        ? '02'
        : '01';

    const veicMatch = veiculos.find(
      (v: any) =>
        (op.veiculo_id && String(v.id) === String(op.veiculo_id)) ||
        (op.veiculo_placa &&
          String(v.placa || '').toUpperCase() === String(op.veiculo_placa).toUpperCase())
    );
    const motMatch = motoristas.find(
      (m: any) =>
        (op.motorista_id && String(m.id) === String(op.motorista_id)) ||
        (op.motorista_cpf &&
          String(m.cpf || '').replace(/\D/g, '') ===
            String(op.motorista_cpf).replace(/\D/g, ''))
    );

    setForm(f => {
      const ufIni = (op.uf_inicio || f.uf_inicio || '').toUpperCase();
      const ufDest = (op.uf_fim || f.uf_fim || '').toUpperCase();
      return {
        ...f,
        ciot_contrato_id: String(op.id),
        ciot_codigo: ciot12,
        ciot_responsavel_documento: mascaras.cpfCnpj(docContr),
        uf_inicio: ufIni || f.uf_inicio,
        uf_fim: ufDest || f.uf_fim,
        ufs_percurso: ufIni && ufDest ? resolverPercursoUfs(ufIni, ufDest) : f.ufs_percurso,
        veiculo_id: veicMatch ? String(veicMatch.id) : f.veiculo_id,
        veiculo_placa: veicMatch?.placa || op.veiculo_placa || f.veiculo_placa,
        condutores: motMatch
          ? [{ id: String(motMatch.id), nome: motMatch.nome, cpf: motMatch.cpf }]
          : op.motorista_nome && op.motorista_cpf && f.condutores.length === 0
          ? [{ id: `mot-ciot-${op.id}`, nome: op.motorista_nome, cpf: op.motorista_cpf }]
          : f.condutores,
        contratantes: docContr
          ? [
              {
                id: `contr-ciot-${op.id}`,
                tipo: docContr.length === 11 ? 'PF' : 'PJ',
                documento: mascaras.cpfCnpj(docContr),
                nome: op.contratante_nome || 'CONTRATANTE'
              }
            ]
          : f.contratantes,
        pagto_frete: [
          {
            id: `pag-ciot-${op.id}`,
            responsavel: mascaras.cpfCnpj(docContr),
            componentes:
              Number(op.valor_pedagio || 0) > 0 ? 'Frete + Vale-Pedágio' : 'Frete',
            forma: formaPag,
            tipo: tipoPag
          }
        ],
        vale_pedagio:
          Number(op.valor_pedagio || 0) > 0 ||
          op.vale_pedagio_fornecedora_cnpj ||
          op.vale_pedagio_comprovante
            ? [
                {
                  id: `vpo-ciot-${op.id}`,
                  cnpj_fornecedor: mascaras.cpfCnpj(
                    String(op.vale_pedagio_fornecedora_cnpj || '')
                  ),
                  doc_pagador: mascaras.cpfCnpj(docContr),
                  numero_comprovante: String(op.vale_pedagio_comprovante || ''),
                  valor: Number(op.valor_pedagio || 0).toFixed(2),
                  tipo_vale_pedagio: '01'
                }
              ]
            : f.vale_pedagio
      };
    });
  };

  // Se abriu a tela via ?ciot_id=... vindo da Central de CIOT, importa automaticamente a operação
  React.useEffect(() => {
    const ciotIdUrl = searchParams.get('ciot_id');
    if (ciotIdUrl && ciotsDisponiveis.length > 0 && form.ciot_contrato_id !== ciotIdUrl) {
      aplicarOperacaoCiot(ciotIdUrl);
    }
  }, [ciotsDisponiveis.length, searchParams]);

  // Auto-seleciona o emitente e a modalidade padrão configurada na empresa (Carga Própria sem CT-e vs Transportadora)
  React.useEffect(() => {
    if (emitentes.length > 0 && !form.emitente_id) {
      const em = emitentes[0];
      const modoUrl = searchParams.get('modo');
      const tipoEmitPadrao =
        modoUrl === 'nfe'
          ? '2'
          : modoUrl === 'cte'
          ? '1'
          : String(
              em.mdfe_tipo_emitente_padrao ||
                (em.perfil_operacional === 'CARGA_PROPRIA' ? '2' : '1')
            );
      const tipoFinal = tipoEmitPadrao === '2' ? '2' : '1';
      setForm(f => ({
        ...f,
        emitente_id: String(em.id),
        tipo_emitente: tipoFinal,
        serie: em.serie_mdfe || f.serie || '1',
        uf_inicio: f.uf_inicio || em.uf || '',
        codigo_municipio_carga: f.codigo_municipio_carga || em.codigo_municipio || '',
        municipio_carga: f.municipio_carga || em.municipio || '',
        seguros:
          f.seguros.length > 0
            ? f.seguros
            : tipoFinal === '1'
            ? construirSeguroPadrao(em)
            : f.seguros
      }));
    }
  }, [emitentes.length]);

  const veiculoSelecionado = veiculos.find((v: any) => String(v.id) === form.veiculo_id);
  const isVeiculoTerceiro = Boolean(
    veiculoSelecionado && String(veiculoSelecionado.tipo_proprietario) === '2'
  );

  // ── Checklist de prontidão (pré-requisitos) ──
  const isCargaPropria = form.tipo_emitente === '2';
  const isCargaPropriaFrotaPropria = isCargaPropria && !isVeiculoTerceiro;
  const ufsNfeSelecionadas = useMemo(
    () =>
      Array.from(
        new Set(
          notasSelecionadasMeta
            .map(n => String(n.destinatario_uf || '').toUpperCase().trim())
            .filter(Boolean)
        )
      ),
    [notasSelecionadasMeta]
  );

  const checklist = useMemo(() => [
    {
      ok: veiculos.length > 0 || Boolean(form.veiculo_placa),
      rotulo: 'Veículo de tração',
      detalhe: form.veiculo_placa || `${veiculos.length} veículo(s)`
    },
    {
      ok: motoristas.length > 0 || form.condutores.length > 0,
      rotulo: 'Motorista condutor',
      detalhe: form.condutores[0]?.nome || `${motoristas.length} condutor(es)`
    },
    isCargaPropriaFrotaPropria
      ? { ok: true, rotulo: 'Carga Própria (Frota Própria)', detalhe: 'Isento de CT-e, RNTRC e CIOT' }
      : { ok: emitentes.some((e: any) => e.rntrc) || isCargaPropria, rotulo: 'RNTRC / ANTT', detalhe: 'Exigido para transporte contratado' },
    isCargaPropria
      ? {
          ok: cargas.length > 0 || form.cargas_ids.length > 0 || form.chaves_nfe.length > 0,
          rotulo: 'NF-es do ERP disponíveis',
          detalhe: `${form.cargas_ids.length + form.chaves_nfe.length} vinculada(s)`
        }
      : { ok: ctes.length > 0, rotulo: 'CT-es autorizados', detalhe: `${ctes.length} disponível(is)` }
  ], [veiculos, motoristas, emitentes, ctes, cargas, isCargaPropria, isCargaPropriaFrotaPropria, form.veiculo_placa, form.condutores, form.cargas_ids.length, form.chaves_nfe.length]);

  const bloqueios = checklist.filter(c => !c.ok);

  const emitenteSelecionado = useMemo(
    () => emitentes.find((x: any) => String(x.id) === String(form.emitente_id)) || emitentes[0] || null,
    [emitentes, form.emitente_id]
  );
  const ambienteAtivo =
    String(emitenteSelecionado?.focus_ambiente || 'homologacao').toLowerCase() === 'producao'
      ? 'producao'
      : 'homologacao';

  const ufsSaoLimitrofes = useMemo(() => {
    if (!form.uf_inicio || !form.uf_fim || form.uf_inicio === form.uf_fim) return true;
    return (FRONTEIRAS_UFS_BRASIL[form.uf_inicio] || []).includes(form.uf_fim);
  }, [form.uf_inicio, form.uf_fim]);

  const erros = useMemo(() => {
    const e: Record<string, string[]> = { dados: [], pagamento: [], documentos: [], produtos: [] };

    if (!form.emitente_id) e.dados.push('Selecione a transportadora emitente.');
    if (!form.uf_inicio) e.dados.push('Estado de carga é obrigatório.');
    if (!form.uf_fim) e.dados.push('Estado de descarga é obrigatório.');
    if (!form.municipio_carga) e.dados.push('Município de carga é obrigatório.');
    if (!form.veiculo_placa) e.dados.push('Selecione ou informe a placa do veículo de tração.');
    if (form.condutores.length === 0 || !form.condutores[0]?.cpf) e.dados.push('Informe o motorista condutor com CPF válido.');

    // UFs de percurso: exigidas apenas quando UF início e UF fim não fazem fronteira direta
    if (form.uf_inicio && form.uf_fim && form.uf_inicio !== form.uf_fim) {
      if (form.ufs_percurso.includes(form.uf_inicio) || form.ufs_percurso.includes(form.uf_fim)) {
        e.dados.push('Não inclua a UF de carga nem a UF de descarga nas UFs de percurso.');
      } else if (!ufsSaoLimitrofes && form.ufs_percurso.length === 0) {
        e.dados.push(`Informe as UFs intermediárias de passagem entre ${form.uf_inicio} e ${form.uf_fim}.`);
      }
    }

    if (!isCargaPropriaFrotaPropria) {
      const ciotDigits = String(form.ciot_codigo || '').replace(/\D/g, '');
      if (ciotDigits.length > 0 && ciotDigits.length !== 12) {
        e.pagamento.push('O código CIOT (ANTT) deve conter exatamente 12 dígitos numéricos.');
      }
      if (
        ambienteAtivo === 'producao' &&
        form.data_emissao >= '2026-11-23' &&
        (form.tipo_emitente === '1' || form.tipo_emitente === '3' || isVeiculoTerceiro) &&
        ciotDigits.length !== 12
      ) {
        e.pagamento.push('CIOT de 12 dígitos é obrigatório em Produção a partir de 23/11/2026 (NT 2026.001 — Rejeição 684).');
      }
      if ((form.tipo_emitente !== '2' || isVeiculoTerceiro) && form.pagto_frete.length === 0) {
        e.pagamento.push('Pagamento de frete é obrigatório (NT 2025.001) para transporte contratado / veículo terceiro.');
      }
    }
    if (form.tipo_emitente === '2') {
      if (form.cargas_ids.length === 0 && form.chaves_nfe.length === 0) {
        e.documentos.push('Vincule ao menos uma NF-e do ERP (ou chave de 44 dígitos) ao manifesto de Carga Própria.');
      }
      if (ufsNfeSelecionadas.length > 1) {
        e.documentos.push(
          `A SEFAZ exige 1 MDF-e por UF de descarregamento (selecionadas: ${ufsNfeSelecionadas.join(', ')}). Mantenha apenas 1 UF neste manifesto.`
        );
      }
    } else if (form.ctes_ids.length === 0) {
      e.documentos.push('Vincule ao menos um CT-e ao manifesto.');
    }
    if (form.produtos_predominantes.length === 0) {
      e.produtos.push('Informe ao menos um produto predominante com NCM.');
    } else if (form.produtos_predominantes.some(p => !p.ncm || p.ncm.length < 2)) {
      e.produtos.push('Todo produto predominante precisa do NCM.');
    }
    if (!form.valor_total_carga) e.produtos.push('Valor total da carga é obrigatório.');
    if (!form.peso_bruto) e.produtos.push('Peso bruto é obrigatório.');

    for (const c of camposMdfeAtivos) {
      if (c.obrigatorio) {
        const val = form.campos_extras?.[c.chave];
        if (val === undefined || val === null || String(val).trim() === '') {
          e.dados.push(`O campo personalizado "${c.rotulo}" é obrigatório.`);
        }
      }
    }

    return e;
  }, [form, ufsSaoLimitrofes, ambienteAtivo, isCargaPropriaFrotaPropria, isVeiculoTerceiro, ufsNfeSelecionadas, camposMdfeAtivos]);

  const totalErros = Object.values(erros).flat();

  const setCampo = (campo: string, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

  const alternarUfPercurso = (uf: string) => {
    if (uf === form.uf_inicio || uf === form.uf_fim) return;
    setForm(f => ({
      ...f,
      ufs_percurso: f.ufs_percurso.includes(uf)
        ? f.ufs_percurso.filter(x => x !== uf)
        : [...f.ufs_percurso, uf]
    }));
  };

  const preencherDadosTesteHomologacao = () => {
    const em = emitenteSelecionado;
    const ufIni = em?.uf || 'MS';
    const codMunIni = em?.codigo_municipio || '5003702';
    const munIni = em?.municipio || 'Dourados';
    const cteAlvo = ctes[0] || null;
    const ufFim = cteAlvo?.uf_fim || 'SP';
    const veic = veiculos[0] || null;
    const mot = motoristas[0] || null;
    const cnpjEmit = String(em?.cnpj || '03272053000150').replace(/\D/g, '');
    const valorCarga = Number(cteAlvo?.valor_carga || cteAlvo?.valor_total || 3400);
    const pesoCarga = Number(cteAlvo?.peso_bruto || 650);

    setForm(f => ({
      ...f,
      emitente_id: em ? String(em.id) : f.emitente_id,
      tipo_emitente: '1',
      tipo_transporte: '1',
      serie: String(em?.serie_mdfe || f.serie || '1'),
      uf_inicio: ufIni,
      uf_fim: ufFim,
      codigo_municipio_carga: codMunIni,
      municipio_carga: munIni,
      ufs_percurso: resolverPercursoUfs(ufIni, ufFim),
      veiculo_id: veic ? String(veic.id) : '',
      veiculo_placa: veic?.placa || 'QAA1B23',
      condutores: mot
        ? [{ id: String(mot.id), nome: mot.nome, cpf: mot.cpf }]
        : [{ id: 'homolog-mot', nome: 'MOTORISTA HOMOLOGACAO SEFAZ', cpf: '11144477735' }],
      contratantes: [
        {
          id: `contr-${Date.now()}`,
          tipo: 'PJ',
          documento: cnpjEmit,
          nome: em?.razao_social || 'CONTRATANTE HOMOLOGACAO SEFAZ'
        }
      ],
      ciot_codigo: '202611100010',
      ciot_responsavel_documento: cnpjEmit,
      pagto_frete: [
        {
          id: `pag-${Date.now()}`,
          responsavel: cnpjEmit,
          componentes: 'Frete',
          forma: '01',
          tipo: '01'
        }
      ],
      ctes_ids: cteAlvo ? [cteAlvo.id] : [],
      produtos_predominantes: [
        {
          id: `prod-${Date.now()}`,
          tipo_carga: '05',
          descricao: 'MERCADORIAS DIVERSAS',
          ncm: '21069090',
          lotacao: true
        }
      ],
      valor_total_carga: valorCarga.toFixed(2),
      peso_bruto: pesoCarga.toFixed(2),
      seguros: [
        {
          id: `seg-${Date.now()}`,
          responsavel: '1',
          cnpj_responsavel: cnpjEmit,
          nome_seguradora: 'PORTO SEGURO CIA DE SEGUROS',
          cnpj_seguradora: '61198164000160',
          numero_apolice: '0000540012345',
          numero_averbacao: '00000000000000000001'
        }
      ],
      informacao_adicional: 'MDF-e emitido em ambiente de homologacao SEFAZ/MS — sem valor fiscal.'
    }));
  };

  const adicionarChaveNfeManual = () => {
    const digits = novaChaveNfe.replace(/\D/g, '').slice(0, 44);
    if (digits.length !== 44) {
      alert('Informe uma chave de acesso de NF-e válida com 44 dígitos numéricos.');
      return;
    }
    if (form.chaves_nfe.includes(digits)) {
      alert('Esta chave de NF-e já foi adicionada ao manifesto.');
      return;
    }
    setForm(f => ({ ...f, chaves_nfe: [...f.chaves_nfe, digits] }));
    setNovaChaveNfe('');
  };

  const salvar = async (transmitir: boolean) => {
    setSalvando(true);
    setErroSalvar('');
    try {
      const payload = {
        ...form,
        emitente_id: form.emitente_id ? Number(form.emitente_id) : undefined,
        ctes_ids: form.tipo_emitente === '2' ? [] : form.ctes_ids,
        cargas_ids: form.tipo_emitente === '2' ? form.cargas_ids : [],
        chaves_nfe: form.tipo_emitente === '2' ? form.chaves_nfe : [],
        ciot_contrato_id: isCargaPropriaFrotaPropria
          ? undefined
          : form.ciot_contrato_id
          ? Number(form.ciot_contrato_id)
          : undefined,
        ciot_codigo: isCargaPropriaFrotaPropria ? '' : form.ciot_codigo,
        ciot_responsavel_documento: isCargaPropriaFrotaPropria ? '' : form.ciot_responsavel_documento,
        contratantes: isCargaPropriaFrotaPropria ? [] : form.contratantes,
        pagto_frete: isCargaPropriaFrotaPropria ? [] : form.pagto_frete,
        vale_pedagio: isCargaPropriaFrotaPropria ? [] : form.vale_pedagio,
        campos_extras: form.campos_extras || {},
        valor_carga: parseFloat(form.valor_total_carga || '0') || 0,
        peso_bruto: parseFloat(form.peso_bruto || '0') || 0
      };
      const res = await api.post('/transporte/mdfes', payload);
      const id = res.data?.data?.id || mdfeId;
      setMdfeId(id);

      if (transmitir) {
        const resEmitir = await api.post(`/transporte/mdfes/${id}/emitir`);
        const dadosEmissao = resEmitir.data || {};
        const ambLabel =
          (dadosEmissao.ambiente || ambienteAtivo) === 'producao'
            ? 'PRODUÇÃO (Validade Jurídica SEFAZ)'
            : 'HOMOLOGAÇÃO (Testes SEFAZ — Sem Valor Fiscal)';

        if (dadosEmissao.status === 'REJEITADO') {
          setErroSalvar(
            `SEFAZ [${dadosEmissao.status_sefaz || 'REJEITADO'}] (${ambLabel}): ${
              dadosEmissao.mensagem_sefaz || 'MDF-e rejeitado pela SEFAZ. Revise os campos e tente novamente.'
            }`
          );
          return;
        }

        if (dadosEmissao.status === 'AUTORIZADO') {
          alert(
            `MDF-e AUTORIZADO com sucesso na SEFAZ!\n\n` +
              `• Ambiente: ${ambLabel}\n` +
              `• Número / Série: ${dadosEmissao.numero || '—'} / ${dadosEmissao.serie || '1'}\n` +
              `• Protocolo SEFAZ: ${dadosEmissao.protocolo || '—'}\n` +
              `• Chave de Acesso: ${dadosEmissao.chave_mdfe || '—'}`
          );
        } else {
          alert(`MDF-e transmitido para a SEFAZ em ambiente de ${ambLabel}! Acompanhe em Documentos Emitidos.`);
        }
        navigate('/transporte/documentos');
      } else {
        alert('MDF-e salvo como rascunho.');
        navigate('/transporte/mdfes');
      }
    } catch (err: any) {
      setErroSalvar(err.response?.data?.error || err.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const capacidadeKg = Number(veiculoSelecionado?.capacidade_kg || 0);
  const pesoTotal = Number(form.peso_bruto || 0);
  const excedeCapacidade = capacidadeKg > 0 && pesoTotal > capacidadeKg;

  return (
    <div className="pb-24">
      {/* ═══ JANELA DO DOCUMENTO ═══ */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm">
        {/* Barra azul do documento */}
        <div className="bg-[#0B63A5] dark:bg-[#0A4F82] px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-white font-bold text-sm tracking-tight">
              MDF-e 3.00 — Manifesto Eletrônico de Documentos Fiscais
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                ambienteAtivo === 'producao'
                  ? 'bg-emerald-500/90 text-white'
                  : 'bg-amber-400 text-slate-950'
              }`}
            >
              {ambienteAtivo === 'producao'
                ? 'Ambiente: Produção'
                : 'Ambiente: Homologação (Sem Valor Fiscal)'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ambienteAtivo !== 'producao' && (
              <button
                type="button"
                onClick={preencherDadosTesteHomologacao}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-sm transition-colors"
                title="Preenche automaticamente todos os campos obrigatórios do MDF-e 3.00 para teste em homologação SEFAZ"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Preencher Dados de Teste (Homologação)
              </button>
            )}
            <span className="text-white/80 text-[11px] font-mono">
              {form.serie ? `Série ${form.serie}` : 'Série 1'}
              {form.numero ? ` · Nº ${form.numero}` : ''}
            </span>
            <button
              onClick={() => navigate('/transporte/mdfes')}
              className="p-1.5 rounded-lg bg-black/20 hover:bg-black/35 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 px-5 pt-4 border-b border-slate-200 dark:border-slate-700/60">
          {([
            { id: 'dados', label: 'Dados Gerais', icon: Settings2 },
            { id: 'seguro', label: 'Seguro', icon: Shield }
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setAba(t.id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-t-lg text-sm font-bold transition-colors -mb-px border-b-2 ${
                  aba === t.id
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-5">
          {erroSalvar && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 dark:text-red-200">{erroSalvar}</p>
            </div>
          )}

          {/* ─── ABA DADOS GERAIS ─── */}
          {aba === 'dados' && (
            <div className="space-y-5">
              {/* Chave Rápida de Modalidade: MDF-e sem CT-e (Carga Própria / NF-e do ERP) vs Com CT-e */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setForm(f => ({
                      ...f,
                      tipo_emitente: '2',
                      ctes_ids: []
                    }))
                  }
                  className={`p-4 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                    isCargaPropria
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/25'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Manifesto sem CT-e — Carga Própria (NF-es do ERP)
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Selecione as NF-es emitidas no ERP filtrando por <strong>Região / Rota</strong>. Em frota própria, dispensa CT-e, RNTRC, CIOT e Pagamento de Frete.
                      </p>
                    </div>
                  </div>
                  {isCargaPropria && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setForm(f => ({
                      ...f,
                      tipo_emitente: '1',
                      cargas_ids: [],
                      chaves_nfe: []
                    }))
                  }
                  className={`p-4 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                    !isCargaPropria
                      ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/25'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Manifesto com CT-e — Prestador de Transporte
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Vincule os Conhecimentos de Transporte (CT-e mod. 57) autorizados na SEFAZ com RNTRC, Seguro RCTR-C e CIOT.
                      </p>
                    </div>
                  </div>
                  {!isCargaPropria && <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0" />}
                </button>
              </div>

              {/* Bloco: Dados Gerais */}
              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Dados Gerais
                </legend>

                <GradeCampos className="gap-x-4 gap-y-3">
                  <CampoFiscal rotulo="Transportadora Emitente" obrigatorio erro={erros.dados.find(e => e.includes('transportadora'))}>
                    <SelectFiscal
                      value={form.emitente_id}
                      onChange={v => {
                        setCampo('emitente_id', v);
                        const em = emitentes.find((x: any) => String(x.id) === v);
                        if (em) {
                          setForm(f => ({
                            ...f,
                            uf_inicio: f.uf_inicio || em.uf || '',
                            codigo_municipio_carga: f.codigo_municipio_carga || em.codigo_municipio || '',
                            municipio_carga: f.municipio_carga || em.municipio || ''
                          }));
                        }
                      }}
                      opcoes={emitentes.map((em: any) => ({ valor: String(em.id), rotulo: `${em.razao_social} — ${em.cnpj}` }))}
                      placeholder="Selecione a transportadora..."
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Operação Comercial" dica="Modelo do manifesto">
                    <SelectFiscal
                      value={form.tipo_emitente}
                      onChange={v =>
                        setForm(f => ({
                          ...f,
                          tipo_emitente: v,
                          ctes_ids: v === '2' ? [] : f.ctes_ids,
                          cargas_ids: v === '2' ? f.cargas_ids : [],
                          chaves_nfe: v === '2' ? f.chaves_nfe : []
                        }))
                      }
                      opcoes={[
                        { valor: '1', rotulo: '1 — Prestador de Serviço de Transporte' },
                        { valor: '2', rotulo: '2 — Carga Própria (NF-e Direta)' },
                        { valor: '3', rotulo: '3 — CT-e Globalizado' }
                      ]}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Data de Emissão" obrigatorio>
                    <InputFiscal type="date" value={form.data_emissao} onChange={v => setCampo('data_emissao', v)} />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Modelo" obrigatorio>
                    <InputFiscal value="58 — Manifesto Eletrônico" disabled />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Série">
                    <InputFiscal value={form.serie} onChange={v => setCampo('serie', v)} />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Número" obrigatorio>
                    <InputFiscal value={form.numero} onChange={v => setCampo('numero', v)} placeholder="Automático" />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Estado de Carga" obrigatorio erro={erros.dados.find(e => e.includes('Estado de carga'))}>
                    <SelectFiscal
                      value={form.uf_inicio}
                      onChange={v =>
                        setForm(f => ({
                          ...f,
                          uf_inicio: v,
                          ufs_percurso: resolverPercursoUfs(v, f.uf_fim)
                        }))
                      }
                      opcoes={UFS_BRASIL.map(u => ({ valor: u, rotulo: u }))}
                      placeholder="Selecione..."
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Estado de Descarga" obrigatorio erro={erros.dados.find(e => e.includes('Estado de descarga'))}>
                    <SelectFiscal
                      value={form.uf_fim}
                      onChange={v =>
                        setForm(f => ({
                          ...f,
                          uf_fim: v,
                          ufs_percurso: resolverPercursoUfs(f.uf_inicio, v)
                        }))
                      }
                      opcoes={UFS_BRASIL.map(u => ({ valor: u, rotulo: u }))}
                      placeholder="Selecione..."
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Tipo de Transportador" dica="ETC · TAC · CTC">
                    <SelectFiscal
                      value={form.tipo_transporte}
                      onChange={v => setCampo('tipo_transporte', v)}
                      opcoes={[
                        { valor: '1', rotulo: '1 — ETC (Empresa de Transporte)' },
                        { valor: '2', rotulo: '2 — TAC (Autônomo)' },
                        { valor: '3', rotulo: '3 — CTC (Cooperativa)' }
                      ]}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Município de Carga" obrigatorio erro={erros.dados.find(e => e.includes('Município de carga'))}>
                    <SelectFiscal
                      value={form.codigo_municipio_carga}
                      onChange={v => {
                        const m = municipios.find(x => x.codigo_ibge === v);
                        setForm(f => ({ ...f, codigo_municipio_carga: v, municipio_carga: m?.cidade || '' }));
                      }}
                      opcoes={municipios.map(m => ({ valor: m.codigo_ibge, rotulo: `${m.cidade} / ${m.uf}` }))}
                      placeholder="Selecione..."
                    />
                  </CampoFiscal>
                </GradeCampos>
              </fieldset>

              {/* Bloco: Motorista e Veículo (2 colunas: Esquerda dados | Direita percurso) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  {/* Motorista */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Motorista
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <CampoFiscal rotulo="Condutor Cadastrado" erro={erros.dados.find(e => e.includes('motorista'))}>
                        <SelectFiscal
                          value={form.condutores[0]?.id || ''}
                          onChange={v => {
                            const mot = motoristas.find((x: any) => String(x.id) === v);
                            setForm(f => ({
                              ...f,
                              condutores: mot ? [{ id: String(mot.id), nome: mot.nome, cpf: mot.cpf }] : []
                            }));
                          }}
                          opcoes={motoristas.map((m: any) => ({ valor: String(m.id), rotulo: `${m.nome} (${m.cpf})` }))}
                          placeholder="Selecionar da frota..."
                        />
                      </CampoFiscal>
                      <CampoFiscal rotulo="Nome do Condutor" obrigatorio>
                        <InputFiscal
                          value={form.condutores[0]?.nome || ''}
                          onChange={v =>
                            setForm(f => ({
                              ...f,
                              condutores: [
                                {
                                  id: f.condutores[0]?.id || 'manual',
                                  nome: v,
                                  cpf: f.condutores[0]?.cpf || ''
                                }
                              ]
                            }))
                          }
                          placeholder="Nome completo"
                        />
                      </CampoFiscal>
                      <CampoFiscal rotulo="CPF do Condutor" obrigatorio>
                        <InputFiscal
                          value={form.condutores[0]?.cpf || ''}
                          onChange={v =>
                            setForm(f => ({
                              ...f,
                              condutores: [
                                {
                                  id: f.condutores[0]?.id || 'manual',
                                  nome: f.condutores[0]?.nome || 'CONDUTOR',
                                  cpf: mascaras.somenteDigitos(v).slice(0, 11)
                                }
                              ]
                            }))
                          }
                          placeholder="Somente números (11 dígitos)"
                        />
                      </CampoFiscal>
                    </div>
                  </fieldset>

                  {/* Veículo */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Veículo
                    </legend>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <CampoFiscal rotulo="Veículo de Tração" erro={erros.dados.find(e => e.includes('veículo'))}>
                          <SelectFiscal
                            value={form.veiculo_id}
                            onChange={v => {
                              const veic = veiculos.find((x: any) => String(x.id) === v);
                              setForm(f => ({ ...f, veiculo_id: v, veiculo_placa: veic?.placa || f.veiculo_placa }));
                            }}
                            opcoes={veiculos.map((v: any) => ({
                              valor: String(v.id),
                              rotulo: `${v.placa} — ${Number(v.capacidade_kg || 0).toLocaleString('pt-BR')} kg`
                            }))}
                            placeholder="Selecionar da frota..."
                          />
                        </CampoFiscal>
                        <CampoFiscal rotulo="Placa (Mercosul / Antiga)" obrigatorio>
                          <InputFiscal
                            value={form.veiculo_placa}
                            onChange={v => setCampo('veiculo_placa', mascaras.placa(v))}
                            placeholder="Ex: QAA1B23"
                          />
                        </CampoFiscal>
                      </div>

                      {/* Reboques */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[0, 1, 2].map(idx => (
                          <CampoFiscal key={idx} rotulo={`Reboque ${idx + 1}`}>
                            <SelectFiscal
                              value={form.reboques[idx]?.id || ''}
                              onChange={v => {
                                const reb = veiculos.find((x: any) => String(x.id) === v);
                                const novos = [...form.reboques];
                                while (novos.length < idx) novos.push({ id: '', placa: '', tara_kg: '', capacidade_kg: '' });
                                novos[idx] = reb
                                  ? { id: String(reb.id), placa: reb.placa, tara_kg: String(reb.tara_kg || ''), capacidade_kg: String(reb.capacidade_kg || '') }
                                  : { id: '', placa: '', tara_kg: '', capacidade_kg: '' };
                                setForm(f => ({ ...f, reboques: novos.filter(r => r.id) }));
                              }}
                              opcoes={veiculos.map((v: any) => ({ valor: String(v.id), rotulo: v.placa }))}
                              placeholder="Selecione"
                            />
                          </CampoFiscal>
                        ))}
                      </div>
                    </div>
                  </fieldset>

                  {/* Capacidade */}
                  {veiculoSelecionado && (
                    <div className={`p-3 rounded-xl border ${
                      excedeCapacidade
                        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50'
                        : 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-slate-700 dark:text-slate-200">Capacidade vs. carga</span>
                        <span className={`font-black tabular-nums ${excedeCapacidade ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                          {pesoTotal.toLocaleString('pt-BR')} / {capacidadeKg.toLocaleString('pt-BR')} kg
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${excedeCapacidade ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${capacidadeKg > 0 ? Math.min(100, (pesoTotal / capacidadeKg) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Pagamento de frete e CIOT (ANTT — NT 2026.001): dispensado para Carga Própria em Frota Própria */}
                  {isCargaPropriaFrotaPropria ? (
                    <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-900 dark:text-emerald-200">
                        <p className="font-bold">
                          Carga Própria em Frota Própria — Isento de CIOT, RNTRC, Contratantes e Pagamento de Frete
                        </p>
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                          Pela legislação SEFAZ/ANTT (<code>tpEmit=2</code> sem proprietário terceiro), esses grupos são omitidos automaticamente do XML para evitar as Rejeições 684, 743 e 745. Caso selecione um veículo de terceiro/TAC acima, os campos serão habilitados automaticamente.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                      <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        CIOT (ANTT) e Pagamento de Frete <span className="text-red-500">*</span>
                      </legend>

                      {/* Seletor 1-Clique de Operações CIOT Ativas */}
                      <div className="p-3 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div className="flex-1">
                          <CampoFiscal
                            rotulo="Importar Operação CIOT Cadastrada (1 Clique)"
                            dica="Preenche automaticamente os 12 dígitos do CIOT, Contratante e Pagamento de Frete"
                          >
                            <SelectFiscal
                              value={form.ciot_contrato_id}
                              onChange={aplicarOperacaoCiot}
                              opcoes={[
                                {
                                  valor: '',
                                  rotulo:
                                    ciotsDisponiveis.length > 0
                                      ? `Selecionar operação CIOT ativa (${ciotsDisponiveis.length} disponível)...`
                                      : 'Nenhuma operação CIOT ativa — digite abaixo ou crie na Central CIOT'
                                },
                                ...ciotsDisponiveis.map((op: any) => ({
                                  valor: String(op.id),
                                  rotulo: `CIOT ${op.ciot_protocolo_formatado || op.ciot_codigo} · ${op.transportador_nome} (${op.uf_inicio}→${op.uf_fim}) · R$ ${Number(op.valor_frete || 0).toFixed(2)}`
                                }))
                              ]}
                            />
                          </CampoFiscal>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate('/transporte/ciot')}
                          className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                        >
                          Abrir Central CIOT
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <CampoFiscal
                          rotulo="Código CIOT (ANTT — 12 dígitos)"
                          dica="Obrigatório NT 2026.001 · Rejeição 684"
                          erro={erros.pagamento.find(err => err.includes('CIOT'))}
                        >
                          <InputFiscal
                            value={form.ciot_codigo}
                            onChange={v => setCampo('ciot_codigo', mascaras.somenteDigitos(v).slice(0, 12))}
                            placeholder={
                              ambienteAtivo === 'producao'
                                ? 'Informe os 12 dígitos do CIOT (IPEF/ANTT)'
                                : 'Ex: 202611100010 (gerado auto em homologação)'
                            }
                          />
                        </CampoFiscal>
                        <CampoFiscal
                          rotulo="CPF/CNPJ Responsável pelo CIOT"
                          dica="Contratante / IPEF · Rejeição 716"
                        >
                          <InputFiscal
                            value={form.ciot_responsavel_documento}
                            onChange={v => setCampo('ciot_responsavel_documento', mascaras.cpfCnpj(v))}
                            placeholder="CNPJ ou CPF responsável pela geração do CIOT"
                          />
                        </CampoFiscal>
                      </div>
                      <ListaEditavelFiscal<PagamentoFrete>
                        titulo=""
                        itens={form.pagto_frete}
                        onChange={itens => setCampo('pagto_frete', itens)}
                        novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, responsavel: '', componentes: 'Frete', forma: '01', tipo: '01' })}
                        rotuloBotao="Novo Pagamento"
                        vazio="Obrigatório desde a NT 2501 — adicione o pagamento do frete."
                        className="border-0"
                        renderItem={(item, i, atualizar, remover) => (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <InputFiscal value={item.responsavel} onChange={v => atualizar({ ...item, responsavel: v })} placeholder="Responsável (CNPJ)" />
                            <InputFiscal value={item.componentes} onChange={v => atualizar({ ...item, componentes: v })} placeholder="Componentes" />
                            <SelectFiscal
                              value={item.forma}
                              onChange={v => atualizar({ ...item, forma: v })}
                              opcoes={[{ valor: '01', rotulo: 'À vista' }, { valor: '02', rotulo: 'À prazo' }]}
                            />
                            <div className="flex items-end gap-2">
                              <SelectFiscal
                                value={item.tipo}
                                onChange={v => atualizar({ ...item, tipo: v })}
                                opcoes={[
                                  { valor: '01', rotulo: 'Dados bancários' },
                                  { valor: '02', rotulo: 'CNPJ' },
                                  { valor: '03', rotulo: 'Pix' }
                                ]}
                              />
                              <BotaoRemover onClick={remover} />
                            </div>
                          </div>
                        )}
                      />
                      {erros.pagamento.map((e, i) => (
                        <p key={i} className="text-[11px] text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3" />
                          {e}
                        </p>
                      ))}

                      {/* Vale-Pedágio Obrigatório ANTT (VPO — Lei 10.209/2001 / Res. 2.885) */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                            Vale-Pedágio Obrigatório ANTT (Tag &lt;valePed&gt;)
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Sem Parar · ConectCar · Veloe · Move Mais · Taggy
                          </span>
                        </div>
                        <ListaEditavelFiscal<ValePedagioItem>
                          titulo=""
                          itens={form.vale_pedagio}
                          onChange={itens => setCampo('vale_pedagio', itens)}
                          novoItem={() => ({
                            id: `${Date.now()}-${Math.random()}`,
                            cnpj_fornecedor: '',
                            doc_pagador:
                              form.contratantes[0]?.documento ||
                              mascaras.cpfCnpj(String(emitenteSelecionado?.cnpj || '')),
                            numero_comprovante: '',
                            valor: '',
                            tipo_vale_pedagio: '01'
                          })}
                          rotuloBotao="Adicionar Vale-Pedágio"
                          vazio="Opcional quando não houver pedágio antecipado na rota (ou isento)."
                          className="border-0"
                          renderItem={(item, _i, atualizar, remover) => (
                            <div className="space-y-2 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <SelectFiscal
                                  value={
                                    OPERADORAS_VPO.some(
                                      o =>
                                        o.valor &&
                                        o.valor === item.cnpj_fornecedor.replace(/\D/g, '')
                                    )
                                      ? item.cnpj_fornecedor.replace(/\D/g, '')
                                      : ''
                                  }
                                  onChange={v => {
                                    if (v) {
                                      atualizar({
                                        ...item,
                                        cnpj_fornecedor: mascaras.cpfCnpj(v)
                                      });
                                    }
                                  }}
                                  opcoes={OPERADORAS_VPO}
                                />
                                <InputFiscal
                                  value={item.cnpj_fornecedor}
                                  onChange={v =>
                                    atualizar({ ...item, cnpj_fornecedor: mascaras.cpfCnpj(v) })
                                  }
                                  placeholder="CNPJ Fornecedora VPO (14 dígitos)"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <InputFiscal
                                  value={item.doc_pagador}
                                  onChange={v =>
                                    atualizar({ ...item, doc_pagador: mascaras.cpfCnpj(v) })
                                  }
                                  placeholder="CPF/CNPJ Pagador"
                                />
                                <InputFiscal
                                  value={item.numero_comprovante}
                                  onChange={v => atualizar({ ...item, numero_comprovante: v })}
                                  placeholder="Nº Comprovante Compra"
                                />
                                <InputFiscal
                                  type="number"
                                  step="0.01"
                                  value={item.valor}
                                  onChange={v => atualizar({ ...item, valor: v })}
                                  placeholder="Valor R$"
                                />
                                <div className="flex items-end gap-2">
                                  <SelectFiscal
                                    value={item.tipo_vale_pedagio || '01'}
                                    onChange={v => atualizar({ ...item, tipo_vale_pedagio: v })}
                                    opcoes={[
                                      { valor: '01', rotulo: '01 — TAG' },
                                      { valor: '02', rotulo: '02 — Cupom' },
                                      { valor: '03', rotulo: '03 — Cartão' }
                                    ]}
                                  />
                                  <BotaoRemover onClick={remover} />
                                </div>
                              </div>
                            </div>
                          )}
                        />
                      </div>
                    </fieldset>
                  )}

                  {/* Documentos Referenciados */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {isCargaPropria
                        ? 'Notas Fiscais do ERP Vinculadas (NF-e — Carga Própria por Região)'
                        : 'Documentos Ref. (CT-e)'}{' '}
                      <span className="text-red-500">*</span>
                    </legend>

                    {isCargaPropria ? (
                      <>
                        <SeletorNotasErp
                          modo="MDFE"
                          selectedIds={form.cargas_ids}
                          emitenteId={form.emitente_id}
                          onSelectionChange={(novosIds, notasObjetos) => {
                            setNotasSelecionadasMeta(notasObjetos);
                            const somaValor = notasObjetos.reduce(
                              (acc, item) => acc + Number(item.valor_total || 0),
                              0
                            );
                            const somaPeso = notasObjetos.reduce(
                              (acc, item) => acc + Number(item.peso_bruto || 0),
                              0
                            );
                            const primeiraComUf = notasObjetos.find(n => n.destinatario_uf);
                            const primeiraComProd = notasObjetos.find(n => n.produto_predominante);
                            const ncmReal =
                              notasObjetos
                                .map(n => String(n.produto_ncm || '').replace(/\D/g, ''))
                                .find(ncm => ncm.length === 8) || '21069090';

                            setForm(f => {
                              const novaUfFim =
                                (primeiraComUf?.destinatario_uf || f.uf_fim || '').toUpperCase();
                              const prodAtual =
                                f.produtos_predominantes.length > 0
                                  ? f.produtos_predominantes
                                  : notasObjetos.length > 0
                                  ? [
                                      {
                                        id: `prod-${Date.now()}`,
                                        tipo_carga: '05',
                                        descricao: String(
                                          primeiraComProd?.produto_predominante || 'MERCADORIAS EM GERAL'
                                        ).slice(0, 120),
                                        ncm: ncmReal,
                                        lotacao: novosIds.length === 1
                                      }
                                    ]
                                  : f.produtos_predominantes;

                              return {
                                ...f,
                                cargas_ids: novosIds,
                                uf_fim: novaUfFim,
                                ufs_percurso:
                                  novaUfFim && f.uf_inicio
                                    ? resolverPercursoUfs(f.uf_inicio, novaUfFim)
                                    : f.ufs_percurso,
                                valor_total_carga:
                                  somaValor > 0 ? somaValor.toFixed(2) : novosIds.length === 0 ? '' : f.valor_total_carga,
                                peso_bruto:
                                  somaPeso > 0 ? somaPeso.toFixed(2) : novosIds.length === 0 ? '' : f.peso_bruto,
                                produtos_predominantes: prodAtual
                              };
                            });
                          }}
                        />

                        {/* Inclusão opcional de chave NF-e externa de 44 dígitos */}
                        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Ou vincular chave NF-e avulsa externa (44 dígitos):
                          </span>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="flex-1">
                              <InputFiscal
                                value={novaChaveNfe}
                                onChange={v => setNovaChaveNfe(v.replace(/\D/g, '').slice(0, 44))}
                                placeholder="Adicionar chave de acesso NF-e manualmente (44 dígitos)"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={adicionarChaveNfeManual}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Adicionar Chave
                            </button>
                          </div>

                          {form.chaves_nfe.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {form.chaves_nfe.map(ch => (
                                <span
                                  key={ch}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-[11px] font-mono text-sky-800 dark:text-sky-200"
                                >
                                  NF-e …{ch.slice(-12)}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setForm(f => ({
                                        ...f,
                                        chaves_nfe: f.chaves_nfe.filter(x => x !== ch)
                                      }))
                                    }
                                    className="hover:text-red-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 uppercase text-[10px] sticky top-0">
                            <tr>
                              <th className="px-2.5 py-2 font-bold w-8"></th>
                              <th className="px-2.5 py-2 font-bold">Nº</th>
                              <th className="px-2.5 py-2 font-bold">Modelo</th>
                              <th className="px-2.5 py-2 font-bold">Série</th>
                              <th className="px-2.5 py-2 font-bold">Chave</th>
                              <th className="px-2.5 py-2 font-bold">Valor</th>
                              <th className="px-2.5 py-2 font-bold">Destinatário</th>
                              <th className="px-2.5 py-2 font-bold">UF</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {ctes.length === 0 ? (
                              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Nenhum CT-e autorizado.</td></tr>
                            ) : (
                              ctes.map((c: any) => {
                                const marcado = form.ctes_ids.includes(c.id);
                                return (
                                  <tr
                                    key={c.id}
                                    onClick={() => {
                                      const novosIds = marcado ? form.ctes_ids.filter(x => x !== c.id) : [...form.ctes_ids, c.id];
                                      const selecionados = ctes.filter((item: any) => novosIds.includes(item.id));
                                      const somaValor = selecionados.reduce((acc: number, item: any) => acc + Number(item.valor_carga || item.valor_total || 0), 0);
                                      const somaPeso = selecionados.reduce((acc: number, item: any) => acc + Number(item.peso_bruto || 0), 0);
                                      setForm(f => {
                                        const novaUfFim = f.uf_fim || c.uf_fim || '';
                                        return {
                                          ...f,
                                          ctes_ids: novosIds,
                                          uf_fim: novaUfFim,
                                          ufs_percurso:
                                            !f.uf_fim && novaUfFim
                                              ? resolverPercursoUfs(f.uf_inicio, novaUfFim)
                                              : f.ufs_percurso,
                                          valor_total_carga: somaValor > 0 ? somaValor.toFixed(2) : f.valor_total_carga,
                                          peso_bruto: somaPeso > 0 ? somaPeso.toFixed(2) : f.peso_bruto
                                        };
                                      });
                                    }}
                                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${marcado ? 'bg-sky-50 dark:bg-sky-950/30' : ''}`}
                                  >
                                    <td className="px-2.5 py-1.5">
                                      <input type="checkbox" checked={marcado} readOnly className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600" />
                                    </td>
                                    <td className="px-2.5 py-1.5 font-mono">{c.numero || '—'}</td>
                                    <td className="px-2.5 py-1.5 font-mono">57</td>
                                    <td className="px-2.5 py-1.5 font-mono">{c.serie || '—'}</td>
                                    <td className="px-2.5 py-1.5 font-mono text-slate-400">{(c.chave_cte || '').slice(-12)}</td>
                                    <td className="px-2.5 py-1.5 tabular-nums">R$ {Number(c.valor_total || 0).toFixed(2)}</td>
                                    <td className="px-2.5 py-1.5 truncate max-w-[120px]">{c.municipio_fim || '—'}</td>
                                    <td className="px-2.5 py-1.5">{c.uf_fim || '—'}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {erros.documentos.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        {e}
                      </p>
                    ))}
                  </fieldset>

                  {/* Produtos predominantes e totais */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Produtos Predominantes e Totais da Carga <span className="text-red-500">*</span>
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <CampoFiscal rotulo="Valor Total da Carga (R$)" obrigatorio erro={erros.produtos.find(e => e.includes('Valor total'))}>
                        <InputFiscal type="number" step="0.01" value={form.valor_total_carga} onChange={v => setCampo('valor_total_carga', v)} placeholder="0,00" />
                      </CampoFiscal>
                      <CampoFiscal rotulo="Peso Bruto Total (kg)" obrigatorio erro={erros.produtos.find(e => e.includes('Peso bruto'))}>
                        <InputFiscal type="number" step="0.01" value={form.peso_bruto} onChange={v => setCampo('peso_bruto', v)} placeholder="0,00" />
                      </CampoFiscal>
                    </div>
                    <ListaEditavelFiscal<ProdutoPred>
                      titulo=""
                      itens={form.produtos_predominantes}
                      onChange={itens => setCampo('produtos_predominantes', itens)}
                      novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, tipo_carga: '05', descricao: '', ncm: '', lotacao: false })}
                      rotuloBotao="Novo Produto"
                      vazio="Informe o produto predominante com o NCM."
                      className="border-0"
                      renderItem={(item, i, atualizar, remover) => (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <SelectFiscal
                            value={item.tipo_carga}
                            onChange={v => atualizar({ ...item, tipo_carga: v })}
                            opcoes={TIPOS_CARGA}
                          />
                          <InputFiscal value={item.descricao} onChange={v => atualizar({ ...item, descricao: v })} placeholder="Descrição" />
                          <InputFiscal value={item.ncm} onChange={v => atualizar({ ...item, ncm: mascaras.somenteDigitos(v) })} placeholder="NCM" />
                          <div className="flex items-end gap-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 pb-2.5 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={item.lotacao}
                                onChange={e => atualizar({ ...item, lotacao: e.target.checked })}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600"
                              />
                              Lotação
                            </label>
                            <BotaoRemover onClick={remover} />
                          </div>
                        </div>
                      )}
                    />
                    {erros.produtos.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        {e}
                      </p>
                    ))}
                  </fieldset>
                </div>

                {/* COLUNA DIREITA: Percurso + Checklist */}
                <div className="space-y-4">
                  {/* Percurso */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Percurso
                    </legend>
                    {form.uf_inicio && form.uf_fim && form.uf_inicio !== form.uf_fim && (
                      <>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[10px] text-slate-400">
                            {ufsSaoLimitrofes
                              ? `${form.uf_inicio} e ${form.uf_fim} fazem fronteira direta (percurso vazio é o padrão).`
                              : `UFs intermediárias de passagem no sentido ${form.uf_inicio} → ${form.uf_fim}:`}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setCampo('ufs_percurso', resolverPercursoUfs(form.uf_inicio, form.uf_fim))
                            }
                            className="text-[10px] font-semibold text-sky-600 hover:underline shrink-0"
                          >
                            Auto-rota
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {UFS_BRASIL.filter(uf => uf !== form.uf_inicio && uf !== form.uf_fim).map(uf => (
                            <button
                              key={uf}
                              type="button"
                              onClick={() => alternarUfPercurso(uf)}
                              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                                form.ufs_percurso.includes(uf)
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {uf}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 uppercase text-[10px] sticky top-0">
                          <tr>
                            <th className="px-2.5 py-1.5 font-bold">UF</th>
                            <th className="px-2.5 py-1.5 font-bold">Nome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                          {form.ufs_percurso.length === 0 ? (
                            <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400">Sem UFs de percurso.</td></tr>
                          ) : (
                            form.ufs_percurso.map(uf => (
                              <tr key={uf}>
                                <td className="px-2.5 py-1.5 font-mono font-bold">{uf}</td>
                                <td className="px-2.5 py-1.5">{UFS_BRASIL[UFS_BRASIL.indexOf(uf)]}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </fieldset>

                  {/* Checklist de prontidão */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Prontidão
                    </legend>
                    <div className="space-y-1.5">
                      {checklist.map(c => (
                        <div key={c.rotulo} className="flex items-center gap-2 text-[11px]">
                          {c.ok
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className={c.ok ? 'text-slate-600 dark:text-slate-300' : 'text-amber-700 dark:text-amber-300'}>
                            {c.rotulo}
                          </span>
                        </div>
                      ))}
                    </div>
                    {bloqueios.length > 0 && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-2">
                        Resolva os itens acima para habilitar a transmissão.
                      </p>
                    )}
                  </fieldset>

                  {/* Contratantes (dispensado para Carga Própria em Frota Própria) */}
                  {!isCargaPropriaFrotaPropria && (
                    <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Contratantes
                      </legend>
                      <ListaEditavelFiscal<Contratante>
                        titulo=""
                        itens={form.contratantes}
                        onChange={itens => setCampo('contratantes', itens)}
                        novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, tipo: 'PJ', documento: '', nome: '' })}
                        rotuloBotao="Novo"
                        vazio="Opcional."
                        className="border-0"
                        renderItem={(item, i, atualizar, remover) => (
                          <div className="flex items-end gap-1.5">
                            <InputFiscal value={item.documento} onChange={v => atualizar({ ...item, documento: mascaras.cpfCnpj(v) })} placeholder="CNPJ" className="w-36" />
                            <InputFiscal value={item.nome} onChange={v => atualizar({ ...item, nome: v })} placeholder="Razão social" />
                            <BotaoRemover onClick={remover} />
                          </div>
                        )}
                      />
                    </fieldset>
                  )}

                  {/* Lacres */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Lacres
                    </legend>
                    <ListaEditavelFiscal<{ id: string; numero: string }>
                      titulo=""
                      itens={form.lacres}
                      onChange={itens => setCampo('lacres', itens)}
                      novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, numero: '' })}
                      rotuloBotao="Novo"
                      vazio="Opcional."
                      className="border-0"
                      renderItem={(item, i, atualizar, remover) => (
                        <div className="flex items-end gap-1.5">
                          <InputFiscal value={item.numero} onChange={v => atualizar({ ...item, numero: v })} placeholder="Número do lacre" />
                          <BotaoRemover onClick={remover} />
                        </div>
                      )}
                    />
                  </fieldset>

                  {/* Pessoas autorizadas */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Autorizados a Baixar o XML
                    </legend>
                    <ListaEditavelFiscal<{ id: string; cpf_cnpj: string }>
                      titulo=""
                      itens={form.pessoas_autorizadas}
                      onChange={itens => setCampo('pessoas_autorizadas', itens)}
                      novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, cpf_cnpj: '' })}
                      rotuloBotao="Novo"
                      vazio="Opcional — até 10 pessoas."
                      className="border-0"
                      renderItem={(item, i, atualizar, remover) => (
                        <div className="flex items-end gap-1.5">
                          <InputFiscal value={item.cpf_cnpj} onChange={v => atualizar({ ...item, cpf_cnpj: mascaras.cpfCnpj(v) })} placeholder="CPF/CNPJ" />
                          <BotaoRemover onClick={remover} />
                        </div>
                      )}
                    />
                  </fieldset>
                  {/* Observações Fiscais (infAdic) & Campos Personalizados */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Observações do DAMDFE &amp; Campos Extras
                    </legend>
                    {camposMdfeAtivos.length > 0 && (
                      <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                        {camposMdfeAtivos.map((c: any) => {
                          const valorAtual =
                            form.campos_extras?.[c.chave] !== undefined
                              ? form.campos_extras[c.chave]
                              : c.valor_padrao || '';
                          return (
                            <CampoFiscal
                              key={c.id || c.chave}
                              rotulo={c.rotulo}
                              obrigatorio={Boolean(c.obrigatorio)}
                              dica={c.ajuda || `Chave: ${c.chave}`}
                            >
                              <InputFiscal
                                type={c.tipo === 'NUMERO' ? 'number' : c.tipo === 'DATA' ? 'date' : 'text'}
                                value={String(valorAtual || '')}
                                onChange={v =>
                                  setForm(f => ({
                                    ...f,
                                    campos_extras: { ...(f.campos_extras || {}), [c.chave]: v }
                                  }))
                                }
                                placeholder={c.valor_padrao || c.rotulo}
                              />
                            </CampoFiscal>
                          );
                        })}
                      </div>
                    )}
                    <CampoFiscal rotulo="Informações Adicionais ao Contribuinte / Fisco">
                      <TextareaFiscal
                        value={form.informacao_adicional}
                        onChange={v => setCampo('informacao_adicional', v)}
                        placeholder="Observações impressas no DAMDFE..."
                        rows={3}
                      />
                    </CampoFiscal>
                  </fieldset>
                </div>
              </div>
            </div>
          )}

          {/* ─── ABA SEGURO ─── */}
          {aba === 'seguro' && (
            <div className="space-y-4">
              {emitenteSelecionado &&
                (emitenteSelecionado.seguro_seguradora_nome ||
                  emitenteSelecionado.seguro_numero_apolice) && (
                  <div className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 flex items-center justify-between gap-3">
                    <div className="text-xs text-sky-900 dark:text-sky-200">
                      <p className="font-bold">
                        Apólice RCTR-C Padrão Cadastrada: {emitenteSelecionado.seguro_seguradora_nome || 'Seguradora'}
                      </p>
                      <p className="text-[11px] text-sky-700 dark:text-sky-300">
                        Apólice Nº {emitenteSelecionado.seguro_numero_apolice || '—'} · Averbação {emitenteSelecionado.seguro_averbacao_padrao || '—'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCampo('seguros', construirSeguroPadrao(emitenteSelecionado))}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shrink-0 transition-colors"
                    >
                      Aplicar Apólice Padrão
                    </button>
                  </div>
                )}
              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Seguros da Carga
                </legend>
                <ListaEditavelFiscal<Seguro>
                  titulo=""
                  itens={form.seguros}
                  onChange={itens => setCampo('seguros', itens)}
                  novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, responsavel: '1', cnpj_responsavel: '', nome_seguradora: '', cnpj_seguradora: '', numero_apolice: '', numero_averbacao: '' })}
                  rotuloBotao="Novo Seguro"
                  vazio="Obrigatório para Prestador de Serviço de Transporte (tpEmit = 1)."
                  className="border-0"
                  renderItem={(item, i, atualizar, remover) => (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-end gap-2">
                        <SelectFiscal
                          value={item.responsavel}
                          onChange={v => atualizar({ ...item, responsavel: v })}
                          opcoes={[
                            { valor: '1', rotulo: '1 — Emitente do MDF-e' },
                            { valor: '2', rotulo: '2 — Contratante do Frete' }
                          ]}
                        />
                        <InputFiscal value={item.cnpj_responsavel} onChange={v => atualizar({ ...item, cnpj_responsavel: mascaras.cpfCnpj(v) })} placeholder="CPF/CNPJ do responsável" />
                      </div>
                      <div className="flex items-end gap-2">
                        <InputFiscal value={item.nome_seguradora} onChange={v => atualizar({ ...item, nome_seguradora: v })} placeholder="Nome da seguradora" />
                        <InputFiscal value={item.cnpj_seguradora || ''} onChange={v => atualizar({ ...item, cnpj_seguradora: mascaras.cpfCnpj(v) })} placeholder="CNPJ da seguradora" />
                        <BotaoRemover onClick={remover} />
                      </div>
                      <div className="flex items-end gap-2">
                        <InputFiscal value={item.numero_apolice} onChange={v => atualizar({ ...item, numero_apolice: v })} placeholder="Número da apólice" />
                        <InputFiscal value={item.numero_averbacao} onChange={v => atualizar({ ...item, numero_averbacao: v })} placeholder="Número da averbação" />
                      </div>
                    </div>
                  )}
                />
              </fieldset>
            </div>
          )}
        </div>

        {/* ═══ RODAPÉ COM AÇÕES ═══ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center gap-2 text-[11px]">
            {totalErros.length > 0 ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-amber-700 dark:text-amber-300">
                  {totalErros.length} pendência(s) para transmitir
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-700 dark:text-emerald-300">Pronto para transmitir</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => salvar(false)}
              disabled={salvando || bloqueios.length > 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
            <button
              type="button"
              onClick={() => salvar(true)}
              disabled={salvando || bloqueios.length > 0 || totalErros.length > 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 shadow-sm transition-colors"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Processar
            </button>
            <button
              type="button"
              onClick={() => navigate('/transporte/mdfes')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
