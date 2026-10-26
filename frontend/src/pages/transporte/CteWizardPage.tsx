import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
}

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
  { valor: '4', rotulo: '4 — Serviço Vinculado a Multimodal' }
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
  { valor: '0', rotulo: 'Remetente' },
  { valor: '1', rotulo: 'Expedidor' },
  { valor: '2', rotulo: 'Recebedor' },
  { valor: '3', rotulo: 'Destinatário' },
  { valor: '4', rotulo: 'Outros' }
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
    emitente_id: '', modelo_cte: 'normal', cfop: '5353',
    natureza_operacao: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    tipo_servico: '0', finalidade: '1', formato_dacte: 'retrato',
    codigo_municipio_inicio: '', municipio_inicio: '', uf_inicio: '',
    codigo_municipio_fim: '', municipio_fim: '', uf_fim: '',
    retirar_mercadoria: true, retirada_descricao: '',
    // Aba 2 — Participantes
    tomador: '0', tomador_documento: '', tomador_nome: '',
    tomador_outros_documento: '', tomador_outros_nome: '',
    tomador_outros_ie: '', tomador_outros_endereco: '', tomador_outros_municipio: '',
    tomador_outros_uf: '', tomador_outros_cep: '',
    // Aba 3 — Serviços e Impostos
    componentes_valor: [] as Componente[],
    valor_total: '', valor_receber: '',
    icms_situacao_tributaria: '00', aliquota_icms: '12.00',
    aliquota_ibs: '0.10', aliquota_cbs: '0.90', codigo_situacao_fiscal: '',
    aliquota_fcp: '0.00', part_fcp_origem: '50.00', part_fcp_destino: '50.00',
    // Aba 4 — Carga e Documentos
    valor_total_carga: '', produto_predominante: '', outras_caracteristicas_carga: '',
    documentos: [] as DocumentoVinculado[],
    data_prevista_entrega: '',
    // Aba 5 — Rodoviário
    rntrc: '',
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

  const { data: cteExistente } = useQuery({
    queryKey: ['cte-wizard', cteId],
    queryFn: async () => (await api.get(`/transporte/ctes/${cteId}`)).data,
    enabled: !!cteId
  });

  // Carrega o emitente padrão
  React.useEffect(() => {
    if (emitentes.length > 0 && !form.emitente_id) {
      const em = emitentes[0];
      setForm(f => ({
        ...f,
        emitente_id: String(em.id),
        rntrc: f.rntrc || em.rntrc || '',
        codigo_municipio_inicio: f.codigo_municipio_inicio || em.codigo_municipio || '',
        municipio_inicio: f.municipio_inicio || em.municipio || '',
        uf_inicio: f.uf_inicio || em.uf || ''
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
        componentes_valor: c.componentes_valor || [],
        documentos: c.documentos || []
      }));
    }
  }, [cteExistente]);

  // ── Cálculos ──
  const totalComponentes = useMemo(
    () => form.componentes_valor.reduce((acc, c) => acc + (parseFloat(c.valor || '0') || 0), 0),
    [form.componentes_valor]
  );

  const baseCalculo = parseFloat(form.valor_total || '0') || 0;
  const aliquotaIcms = parseFloat(form.aliquota_icms || '0') || 0;
  const valorIcms = (baseCalculo * aliquotaIcms) / 100;
  const aliquotaIbs = parseFloat(form.aliquota_ibs || '0') || 0;
  const valorIbs = (baseCalculo * aliquotaIbs) / 100;
  const aliquotaCbs = parseFloat(form.aliquota_cbs || '0') || 0;
  const valorCbs = (baseCalculo * aliquotaCbs) / 100;

  // ── Validação por passo ──
  const erros = useMemo(() => {
    const e: Record<string, string[]> = { dados: [], participantes: [], servicos: [], carga: [], rodoviario: [], observacoes: [] };

    // Aba 1
    if (!form.emitente_id) e.dados.push('Selecione a transportadora emitente.');
    if (!form.cfop) e.dados.push('CFOP é obrigatório.');
    if (!form.natureza_operacao) e.dados.push('Natureza da operação é obrigatória.');
    if (!form.codigo_municipio_inicio) e.dados.push('Município de início é obrigatório.');
    if (!form.codigo_municipio_fim) e.dados.push('Município de fim é obrigatório.');
    if (form.codigo_municipio_inicio && form.codigo_municipio_fim && form.uf_inicio === form.uf_fim && form.modelo_cte === 'simplificado') {
      // simplificado é intraestadual — válido
    } else if (form.modelo_cte === 'simplificado' && form.uf_inicio !== form.uf_fim) {
      e.dados.push('Modelo simplificado exige origem e destino no mesmo estado (UF).');
    }

    // Aba 2
    if (form.tomador === '4') {
      if (!form.tomador_outros_documento) e.participantes.push('Documento do tomador "Outros" é obrigatório.');
      if (!form.tomador_outros_nome) e.participantes.push('Nome do tomador "Outros" é obrigatório.');
    }

    // Aba 3
    if (form.componentes_valor.length === 0) e.servicos.push('Adicione ao menos um componente do frete.');
    if (totalComponentes <= 0) e.servicos.push('Os componentes do frete precisam ter valor.');
    if (baseCalculo <= 0) e.servicos.push('Valor total da prestação é obrigatório.');
    if (aliquotaIcms < 0) e.servicos.push('Alíquota de ICMS inválida.');

    // Coerência: valor a receber deve fechar com os componentes
    const valorReceber = parseFloat(form.valor_receber || '0') || 0;
    if (valorReceber > 0 && Math.abs(valorReceber - totalComponentes) > 0.01) {
      e.servicos.push(`Valor a receber (R$ ${valorReceber.toFixed(2)}) não fecha com os componentes (R$ ${totalComponentes.toFixed(2)}).`);
    }

    // Aba 4
    if (form.documentos.length === 0) e.carga.push('Vincule ao menos um documento fiscal (NF-e).');
    if (!form.valor_total_carga) e.carga.push('Valor total da carga é obrigatório.');
    if (!form.produto_predominante) e.carga.push('Produto predominante é obrigatório.');

    // Chave duplicada
    const chaves = form.documentos.map(d => d.chave);
    if (new Set(chaves).size !== chaves.length) {
      e.carga.push('Há chave de acesso duplicada nos documentos vinculados.');
    }

    // Aba 5
    if (!form.rntrc) e.rodoviario.push('RNTRC é obrigatório e bloqueia o salvamento.');

    return e;
  }, [form, totalComponentes, baseCalculo, aliquotaIcms, valorReceber]);

  const errosPorPasso = erros;
  const errosDoPassoAtual = erros[STEPS[passoAtual].id] || [];
  const podeAvancar = errosDoPassoAtual.length === 0;

  const setCampo = (campo: string, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

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
  const montarPayload = () => ({
    ...form,
    emitente_id: form.emitente_id ? Number(form.emitente_id) : undefined,
    componentes_valor: form.componentes_valor.map(c => ({ nome: c.nome, valor: parseFloat(c.valor || '0') || 0 })),
    valor_total: baseCalculo,
    valor_receber: parseFloat(form.valor_receber || '0') || totalComponentes,
    base_icms: baseCalculo,
    valor_icms: valorIcms,
    documentos: form.documentos
  });

  const salvar = async (transmitir: boolean) => {
    setSalvando(true);
    setErroSalvar('');
    try {
      const payload = montarPayload();
      const res = await api.post('/transporte/ctes', payload);
      const id = res.data?.data?.id || cteId;
      setCteId(id);
      qc.invalidateQueries({ queryKey: ['ctes'] });

      if (transmitir) {
        await api.post(`/transporte/ctes/${id}/emitir`);
        alert('CT-e transmitido para a SEFAZ! O processamento é assíncrono — acompanhe o status em Documentos Emitidos.');
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
    const m = municipios.find(x => x.codigo_ibge === codigo);
    setForm(f => ({
      ...f,
      [campoCodigo]: codigo,
      [campoNome]: m?.cidade || '',
      [campoUf]: m?.uf || ''
    }));
  };

  const opcoesMunicipios = municipios.map(m => ({
    valor: m.codigo_ibge,
    rotulo: `${m.cidade} / ${m.uf} (IBGE ${m.codigo_ibge})`
  }));

  const adicionarDocumento = () => {
    if (!novoDoc.chave || novoDoc.chave.replace(/\D/g, '').length < 44) {
      alert('Informe uma chave de acesso válida (44 dígitos).');
      return;
    }
    if (form.documentos.some(d => d.chave === novoDoc.chave)) {
      alert('Esta chave de acesso já está vinculada.');
      return;
    }
    setForm(f => ({
      ...f,
      documentos: [...f.documentos, { ...novoDoc, id: `${Date.now()}-${Math.random()}` }]
    }));
    setNovoDoc({ chave: '', tipo: 'NFE', numero: '' });
  };

  const vincularCarga = (cargaId: number) => {
    const c = cargas.find(x => x.id === cargaId);
    if (!c) return;
    if (form.documentos.some(d => d.chave === c.chave_acesso)) {
      alert('Esta nota já está vinculada.');
      return;
    }
    setForm(f => ({
      ...f,
      documentos: [...f.documentos, {
        id: `carga-${c.id}`,
        chave: c.chave_acesso || '',
        tipo: 'NFE',
        numero: c.numero || ''
      }]
    }));
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-brand-600 dark:text-brand-500" />
            Emissão de CT-e
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Preencha as 6 etapas na ordem da SEFAZ. Cada etapa é validada antes do avanço.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => salvar(false)}
            disabled={salvando || erros.rodoviario.length > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar
          </button>
          <button
            type="button"
            onClick={() => salvar(true)}
            disabled={salvando || erros.rodoviario.length > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Salvar e Transmitir
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

              <CampoFiscal rotulo="Modelo do CT-e" obrigatorio>
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

              <CampoFiscal rotulo="Formato do DACTE" obrigatorio dica="Define a orientação de impressão do documento auxiliar">
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

              <CampoFiscal rotulo="Dados da Retirada" colSpan={2} dica="Marque quando a carga for retirada em local intermediário (porto, filial, estação)">
                <div className="flex items-start gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-2">
                    <input
                      type="checkbox"
                      checked={form.retirar_mercadoria}
                      onChange={e => setCampo('retirar_mercadoria', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Houve retirada em local intermediário
                  </label>
                  {form.retirar_mercadoria && (
                    <div className="flex-1">
                      <InputFiscal
                        value={form.retirada_descricao}
                        onChange={v => setCampo('retirada_descricao', v)}
                        placeholder="Descreva o local da retirada"
                      />
                    </div>
                  )}
                </div>
              </CampoFiscal>
            </GradeCampos>
          </div>
        )}

        {/* ─── ABA 2: PARTICIPANTES ─── */}
        {passoAtual === 1 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal rotulo="Tomador do Serviço" obrigatorio dica="Quem paga o frete">
                <SelectFiscal value={form.tomador} onChange={v => setCampo('tomador', v)} opcoes={TOMADORES} />
              </CampoFiscal>

              {form.tomador !== '4' && (
                <CampoFiscal rotulo="Documento do Tomador" dica="Deixe em branco para usar o da nota vinculada">
                  <InputFiscal
                    value={form.tomador_documento}
                    onChange={v => setCampo('tomador_documento', mascaras.cpfCnpj(v))}
                    placeholder="00.000.000/0000-00"
                  />
                </CampoFiscal>
              )}

              {form.tomador === '4' && (
                <>
                  <CampoFiscal rotulo="Nome do Tomador (Outros)" obrigatorio erro={erros.participantes.find(e => e.includes('Nome'))}>
                    <InputFiscal value={form.tomador_outros_nome} onChange={v => setCampo('tomador_outros_nome', v)} />
                  </CampoFiscal>
                  <CampoFiscal rotulo="CNPJ/CPF do Tomador (Outros)" obrigatorio erro={erros.participantes.find(e => e.includes('Documento'))}>
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
                  <CampoFiscal rotulo="Endereço do Tomador" colSpan={2}>
                    <InputFiscal value={form.tomador_outros_endereco} onChange={v => setCampo('tomador_outros_endereco', v)} />
                  </CampoFiscal>
                </>
              )}
            </GradeCampos>

            {/* Partes do ERP para consulta rápida */}
            <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-700/80">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Partes cadastradas no ERP</span>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {partes.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">Nenhuma parte cadastrada.</p>
                ) : (
                  partes.slice(0, 50).map(p => (
                    <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{p.razao_social}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{p.documento} · {p.municipio}/{p.uf}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCampo('tomador_documento', p.documento);
                          setCampo('tomador_nome', p.razao_social);
                          if (p.tomador === '4') {
                            setCampo('tomador_outros_nome', p.razao_social);
                            setCampo('tomador_outros_documento', p.documento);
                            setCampo('tomador_outros_municipio', p.municipio || '');
                            setCampo('tomador_outros_uf', p.uf || '');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 shrink-0"
                      >
                        Usar
                      </button>
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
            {/* Componentes do frete */}
            <ListaEditavelFiscal<Componente>
              titulo="Componentes do Frete"
              itens={form.componentes_valor}
              onChange={itens => setCampo('componentes_valor', itens)}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, nome: 'FRETE_PESO', valor: '' })}
              rotuloBotao="Novo Componente"
              vazio="Adicione os componentes que compõem o frete (frete por peso, pedágio, GRIS...)."
              renderItem={(item, i, atualizar, remover) => (
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

            {/* Totais */}
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

              <CampoFiscal rotulo="ICMS — Situação Tributária" obrigatorio>
                <SelectFiscal
                  value={form.icms_situacao_tributaria}
                  onChange={v => setCampo('icms_situacao_tributaria', v)}
                  opcoes={[
                    { valor: '00', rotulo: '00 — Tributação Integral' },
                    { valor: '10', rotulo: '10 — Tributada com Redução de Base' },
                    { valor: '20', rotulo: '20 — Substituição Tributária' },
                    { valor: '40', rotulo: '40 — Isenta' },
                    { valor: '90', rotulo: '90 — Simples Nacional' }
                  ]}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="ICMS — Alíquota (%)" obrigatorio dica="Configurável por UF em Regras Fiscais">
                <InputFiscal type="number" step="0.0001" value={form.aliquota_icms} onChange={v => setCampo('aliquota_icms', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="IBS — Alíquota (%)" dica="Reforma Tributária — alíquota de transição, com vigência">
                <InputFiscal type="number" step="0.0001" value={form.aliquota_ibs} onChange={v => setCampo('aliquota_ibs', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="CBS — Alíquota (%)" dica="Reforma Tributária — alíquota de transição, com vigência">
                <InputFiscal type="number" step="0.0001" value={form.aliquota_cbs} onChange={v => setCampo('aliquota_cbs', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="Código da Situação Fiscal (IBS/CBS)" dica="Consultar com a contabilidade">
                <InputFiscal value={form.codigo_situacao_fiscal} onChange={v => setCampo('codigo_situacao_fiscal', v)} placeholder="Ex: tributação integral" />
              </CampoFiscal>

              <CampoFiscal rotulo="FCP — Alíquota (%)">
                <InputFiscal type="number" step="0.0001" value={form.aliquota_fcp} onChange={v => setCampo('aliquota_fcp', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="Partilha FCP Origem (%)">
                <InputFiscal type="number" step="0.01" value={form.part_fcp_origem} onChange={v => setCampo('part_fcp_origem', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="Partilha FCP Destino (%)">
                <InputFiscal type="number" step="0.01" value={form.part_fcp_destino} onChange={v => setCampo('part_fcp_destino', v)} />
              </CampoFiscal>
            </GradeCampos>

            {/* Memória de cálculo */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Memória de cálculo (sobre o valor total da prestação)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Base de cálculo</span><span className="font-bold text-slate-900 dark:text-white">R$ {baseCalculo.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">ICMS ({aliquotaIcms}%)</span><span className="font-bold text-slate-900 dark:text-white">R$ {valorIcms.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">IBS ({aliquotaIbs}%)</span><span className="font-bold text-slate-900 dark:text-white">R$ {valorIbs.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">CBS ({aliquotaCbs}%)</span><span className="font-bold text-slate-900 dark:text-white">R$ {valorCbs.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ─── ABA 4: CARGA E DOCUMENTOS ─── */}
        {passoAtual === 3 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal rotulo="Valor Total da Carga" obrigatorio erro={erros.carga.find(e => e.includes('Valor total'))}>
                <InputFiscal type="number" step="0.01" value={form.valor_total_carga} onChange={v => setCampo('valor_total_carga', v)} placeholder="0,00" />
              </CampoFiscal>

              <CampoFiscal rotulo="Produto Predominante" obrigatorio erro={erros.carga.find(e => e.includes('Produto'))}>
                <InputFiscal value={form.produto_predominante} onChange={v => setCampo('produto_predominante', v)} placeholder="Ex: Geladeiras" />
              </CampoFiscal>

              <CampoFiscal rotulo="Informações Adicionais do Produto" dica="Peso, quantidade, embalagem...">
                <InputFiscal value={form.outras_caracteristicas_carga} onChange={v => setCampo('outras_caracteristicas_carga', v)} placeholder="Ex: 75 kg, 2 volumes" />
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
                      onChange={v => setNovoDoc({ ...novoDoc, chave: v.replace(/\D/g, '') })}
                      placeholder="Chave de acesso (44 dígitos)"
                    />
                  </div>
                  <div className="w-32">
                    <SelectFiscal
                      value={novoDoc.tipo}
                      onChange={v => setNovoDoc({ ...novoDoc, tipo: v })}
                      opcoes={[
                        { valor: 'NFE', rotulo: 'NF-e' },
                        { valor: 'CTE', rotulo: 'CT-e' },
                        { valor: 'OUTRO', rotulo: 'Outro' }
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={adicionarDocumento}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo
                  </button>
                </div>

                {/* Vincular nota já sincronizada do ERP */}
                {cargas.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] text-slate-500 mb-1.5">Ou vincule uma nota já sincronizada do ERP:</p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {cargas.slice(0, 20).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => vincularCarga(c.id)}
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-brand-400 transition-colors"
                        >
                          NF-e {c.numero} · {c.destinatario_nome?.slice(0, 22)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-52 overflow-y-auto">
                {form.documentos.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-400">
                    Nenhum documento vinculado. O CT-e exige ao menos uma NF-e.
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
                rotulo="RNTRC"
                obrigatorio
                erro={erros.rodoviario[0]}
                dica="Registro Nacional de Transportadores — bloqueia o salvamento se faltar"
              >
                <InputFiscal value={form.rntrc} onChange={v => setCampo('rntrc', v.replace(/\D/g, ''))} placeholder="00000000" />
              </CampoFiscal>
            </GradeCampos>

            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                O RNTRC é uma validação centralizada: bloqueia o salvamento do CT-e e é exigido novamente
                no MDF-e quando o veículo não pertence à empresa. Cadastre-o em
                <strong> Configurações → Dados da Empresa</strong> para não precisar digitar a cada emissão.
              </p>
            </div>
          </div>
        )}

        {/* ─── ABA 6: OBSERVAÇÕES ─── */}
        {passoAtual === 5 && (
          <div className="space-y-4">
            <CampoFiscal rotulo="Observações" dica="Informação adicional ao CT-e (opcional)">
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
                {errosDoPassoAtual.length} pendência(s)
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
