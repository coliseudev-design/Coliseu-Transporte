import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import WizardStepper from '../../components/fiscal/WizardStepper';
import { CampoFiscal, GradeCampos, SelectFiscal, InputFiscal, TextareaFiscal, mascaras } from '../../components/fiscal/CampoFiscal';
import ListaEditavelFiscal, { BotaoRemover } from '../../components/fiscal/ListaEditavelFiscal';
import {
  Truck, CreditCard, FileText, Package, Shield, Save, Send,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Loader2, Info
} from 'lucide-react';

interface Contratante { id: string; tipo: string; documento: string; nome: string; }
interface ValePedagio { id: string; cnpj_fornecedor: string; cnpj_pagador: string; numero_comprovante: string; valor: string; }
interface Seguro { id: string; responsavel: string; cnpj_responsavel: string; nome_seguradora: string; numero_apolice: string; numero_averbacao: string; }
interface ProdutoPred { id: string; tipo_carga: string; descricao: string; ncm: string; lotacao: boolean; }
interface PagamentoFrete { id: string; responsavel: string; componentes: string; forma: string; tipo: string; }

const STEPS = [
  { id: 'dados', label: 'Dados do MDF-e', icone: Truck },
  { id: 'rodoviario', label: 'Rodoviário', icone: Truck },
  { id: 'pagamento', label: 'Pagamento de Frete', icone: CreditCard },
  { id: 'documentos', label: 'Documentos', icone: FileText },
  { id: 'seguro', label: 'Seguros', icone: Shield },
  { id: 'produtos', label: 'Produtos e Totais', icone: Package }
];

const UFS_BRASIL = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

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
  const [passoAtual, setPassoAtual] = useState(0);
  const [visitados, setVisitados] = useState<Set<string>>(new Set(['dados']));
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const [mdfeId, setMdfeId] = useState<number | null>(null);

  const [form, setForm] = useState({
    // Aba 1 — Dados
    emitente_id: '', tipo_emitente: '1', tipo_transporte: '1',
    uf_inicio: '', uf_fim: '', municipio_carga: '', codigo_municipio_carga: '',
    municipios_descarregamento: [] as { id: string; codigo: string; nome: string }[],
    ufs_percurso: [] as string[],
    data_inicio_viagem: '', informacao_adicional: '',
    // Aba 2 — Rodoviário
    veiculo_id: '', veiculo_placa: '', reboques: [] as any[],
    condutores: [] as { id: string; nome: string; cpf: string }[],
    contratantes: [] as Contratante[],
    // Aba 3 — Pagamento de frete (obrigatório desde a NT 2501)
    pagto_frete: [] as PagamentoFrete[],
    // Aba 4 — Documentos
    ctes_ids: [] as number[],
    // Aba 5 — Seguros
    seguros: [] as Seguro[],
    // Aba 6 — Produtos e totais
    produtos_predominantes: [] as ProdutoPred[],
    valor_total_carga: '', unidade_medida: '01', peso_bruto: '',
    lacres: [] as { id: string; numero: string }[],
    pessoas_autorizadas: [] as { id: string; cpf_cnpj: string }[]
  });

  const { data: emitentesData } = useQuery({
    queryKey: ['emitentes-mdfe-wizard'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });
  const emitentes = emitentesData?.data || [];

  const { data: veiculosData } = useQuery({
    queryKey: ['veiculos-mdfe-wizard'],
    queryFn: async () => (await api.get('/transporte/veiculos')).data
  });
  const veiculos = veiculosData?.data || [];

  const { data: motoristasData } = useQuery({
    queryKey: ['motoristas-mdfe-wizard'],
    queryFn: async () => (await api.get('/transporte/motoristas')).data
  });
  const motoristas = motoristasData?.data || [];

  const { data: ctesData } = useQuery({
    queryKey: ['ctes-mdfe-wizard'],
    queryFn: async () => (await api.get('/transporte/ctes', { params: { limit: 200, status: 'AUTORIZADO' } })).data
  });
  const ctes = ctesData?.data || [];

  const { data: municipiosData } = useQuery({
    queryKey: ['municipios-mdfe-wizard'],
    queryFn: async () => (await api.get('/transporte/municipios')).data
  });
  const municipios = municipiosData?.data || [];

  // ── Checklist de prontidão (pré-requisitos do MDF-e) ──
  const checklist = useMemo(() => [
    { ok: veiculos.length > 0, rotulo: 'Cadastro de veículos atualizado', detalhe: `${veiculos.length} veículo(s)` },
    { ok: motoristas.length > 0, rotulo: 'Cadastro de motoristas atualizado', detalhe: `${motorista.length} motorista(s)` },
    { ok: emitentes.some((e: any) => e.rntrc), rotulo: 'RNTRC da transportadora configurado', detalhe: 'Obrigatório no MDF-e rodoviário' },
    { ok: ctes.length > 0, rotulo: 'CT-es autorizados disponíveis para vincular', detalhe: `${ctes.length} CT-e(s)` }
  ], [veiculos, motoristas, emitentes, ctes]);

  const bloqueios = checklist.filter(c => !c.ok);

  const erros = useMemo(() => {
    const e: Record<string, string[]> = { dados: [], rodoviario: [], pagamento: [], documentos: [], seguro: [], produtos: [] };

    if (!form.emitente_id) e.dados.push('Selecione a transportadora emitente.');
    if (!form.uf_inicio) e.dados.push('UF de carga é obrigatória.');
    if (!form.uf_fim) e.dados.push('UF de descarga é obrigatória.');
    if (!form.municipio_carga) e.dados.push('Município de carga é obrigatório.');

    // UFs de percurso: só interestadual, em ordem crescente a partir da UF de carga
    if (form.uf_inicio && form.uf_fim && form.uf_inicio !== form.uf_fim) {
      if (form.ufs_percurso.length === 0) {
        e.dados.push('MDF-e interestadual exige as UFs de percurso.');
      } else {
        const idxInicio = UFS_BRASIL.indexOf(form.uf_inicio);
        const foraOrdem = form.ufs_percurso.some((uf, i) => {
          const idx = UFS_BRASIL.indexOf(uf);
          return idx < idxInicio || (i > 0 && idx <= UFS_BRASIL.indexOf(form.ufs_percurso[i - 1]));
        });
        if (foraOrdem) {
          e.dados.push('UFs de percurso devem estar em ordem crescente a partir da UF de carga.');
        }
      }
    }

    if (!form.veiculo_placa) e.rodoviario.push('Selecione o veículo de tração.');
    if (form.condutores.length === 0) e.rodoviario.push('Informe ao menos um condutor.');

    // Pagamento de frete é obrigatório (NT 2501)
    if (form.pagto_frete.length === 0) {
      e.pagamento.push('Pagamento de frete é obrigatório (NT 2501) para emitir o MDF-e.');
    }

    if (form.ctes_ids.length === 0) e.documentos.push('Vincule ao menos um CT-e ou NF-e ao manifesto.');

    if (form.produtos_predominantes.length === 0) {
      e.produtos.push('Informe ao menos um produto predominante com NCM.');
    } else {
      const semNcm = form.produtos_predominantes.filter(p => !p.ncm || p.ncm.length < 2);
      if (semNcm.length > 0) e.produtos.push('Todo produto predominante precisa do NCM.');
    }
    if (!form.valor_total_carga) e.produtos.push('Valor total da carga é obrigatório.');
    if (!form.peso_bruto) e.produtos.push('Peso bruto é obrigatório.');

    return e;
  }, [form]);

  const errosPorPasso = erros;
  const errosDoPassoAtual = erros[STEPS[passoAtual].id] || [];
  const podeAvancar = errosDoPassoAtual.length === 0;

  const setCampo = (campo: string, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

  const irParaPasso = (indice: number) => {
    setPassoAtual(indice);
    setVisitados(v => new Set([...v, STEPS[indice].id]));
  };

  const avancar = () => { if (podeAvancar && passoAtual < STEPS.length - 1) irParaPasso(passoAtual + 1); };
  const voltar = () => { if (passoAtual > 0) irParaPasso(passoAtual - 1); };

  const salvar = async (transmitir: boolean) => {
    setSalvando(true);
    setErroSalvar('');
    try {
      const payload = {
        ...form,
        emitente_id: form.emitente_id ? Number(form.emitente_id) : undefined,
        valor_carga: parseFloat(form.valor_total_carga || '0') || 0,
        peso_bruto: parseFloat(form.peso_bruto || '0') || 0
      };
      const res = await api.post('/transporte/mdfes', payload);
      const id = res.data?.data?.id || mdfeId;
      setMdfeId(id);

      if (transmitir) {
        await api.post(`/transporte/mdfes/${id}/emitir`);
        alert('MDF-e transmitido para a SEFAZ! Acompanhe o status em Documentos Emitidos.');
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

  const alternarUfPercurso = (uf: string) => {
    setForm(f => ({
      ...f,
      ufs_percurso: f.ufs_percurso.includes(uf)
        ? f.ufs_percurso.filter(x => x !== uf)
        : [...f.ufs_percurso, uf].sort()
    }));
  };

  const veiculoSelecionado = veiculos.find((v: any) => String(v.id) === form.veiculo_id);
  const capacidadeKg = Number(veiculoSelecionado?.capacidade_kg || 0);
  const pesoTotal = Number(form.peso_bruto || 0);
  const excedeCapacidade = capacidadeKg > 0 && pesoTotal > capacidadeKg;

  return (
    <div className="space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
            Emissão de MDF-e
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manifesto Eletrônico de Documentos Fiscais — 6 etapas, com checklist de prontidão.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => salvar(false)}
            disabled={salvando || bloqueios.length > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar
          </button>
          <button
            type="button"
            onClick={() => salvar(true)}
            disabled={salvando || bloqueios.length > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Salvar e Transmitir
          </button>
        </div>
      </div>

      {/* Checklist de Prontidão */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">Checklist de Prontidão</span>
          <span className="text-[11px] text-slate-400">pré-requisitos antes de emitir o manifesto</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {checklist.map(c => (
            <div
              key={c.rotulo}
              className={`flex items-start gap-2.5 p-3 rounded-xl border ${
                c.ok
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50'
                  : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50'
              }`}
            >
              {c.ok
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.rotulo}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{c.detalhe}</p>
              </div>
            </div>
          ))}
        </div>
        {bloqueios.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Resolva os itens acima para habilitar o salvamento e a transmissão do MDF-e.
          </p>
        )}
      </div>

      {erroSalvar && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 dark:text-red-200">{erroSalvar}</p>
        </div>
      )}

      <WizardStepper steps={STEPS} atual={passoAtual} visitados={visitados} errosPorPasso={errosPorPasso} onIrPara={irParaPasso} />

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6">
        {/* ─── ABA 1: DADOS ─── */}
        {passoAtual === 0 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal rotulo="Transportadora Emitente" obrigatorio>
                <SelectFiscal
                  value={form.emitente_id}
                  onChange={v => setCampo('emitente_id', v)}
                  opcoes={emitentes.map((em: any) => ({ valor: String(em.id), rotulo: `${em.razao_social} — ${em.cnpj}` }))}
                  placeholder="Selecione..."
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Tipo do Emitente" obrigatorio dica="1 = Prestador de Serviço de Transporte · 2 = Carga Própria">
                <SelectFiscal
                  value={form.tipo_emitente}
                  onChange={v => setCampo('tipo_emitente', v)}
                  opcoes={[
                    { valor: '1', rotulo: '1 — Prestador de Serviço de Transporte' },
                    { valor: '2', rotulo: '2 — Transportador de Carga Própria' },
                    { valor: '3', rotulo: '3 — Prestador que emite CT-e Globalizado' }
                  ]}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Tipo de Transportador" dica="ETC = Empresa de Transportes · TAC = Autônomo · CTC = Cooperativa">
                <SelectFiscal
                  value={form.tipo_transporte}
                  onChange={v => setCampo('tipo_transporte', v)}
                  opcoes={[
                    { valor: '1', rotulo: '1 — ETC (Empresa de Transporte de Cargas)' },
                    { valor: '2', rotulo: '2 — TAC (Transportador Autônomo)' },
                    { valor: '3', rotulo: '3 — CTC (Cooperativa de Transporte)' }
                  ]}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Data de Início da Viagem" dica="Opcional — preenchido com a data de emissão">
                <InputFiscal type="date" value={form.data_inicio_viagem} onChange={v => setCampo('data_inicio_viagem', v)} />
              </CampoFiscal>

              <CampoFiscal rotulo="UF de Carga" obrigatorio erro={erros.dados.find(e => e.includes('UF de carga'))}>
                <SelectFiscal value={form.uf_inicio} onChange={v => setCampo('uf_inicio', v)} opcoes={UFS_BRASIL.map(u => ({ valor: u, rotulo: u }))} placeholder="Selecione..." />
              </CampoFiscal>

              <CampoFiscal rotulo="UF de Descarga" obrigatorio erro={erros.dados.find(e => e.includes('UF de descarga'))}>
                <SelectFiscal value={form.uf_fim} onChange={v => setCampo('uf_fim', v)} opcoes={UFS_BRASIL.map(u => ({ valor: u, rotulo: u }))} placeholder="Selecione..." />
              </CampoFiscal>

              <CampoFiscal rotulo="Município de Carga" obrigatorio erro={erros.dados.find(e => e.includes('Município'))}>
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

              <CampoFiscal rotulo="Informações Adicionais" colSpan={2} dica="Texto livre para o fisco ou contribuinte">
                <TextareaFiscal value={form.informacao_adicional} onChange={v => setCampo('informacao_adicional', v)} rows={3} />
              </CampoFiscal>
            </GradeCampos>

            {/* UFs de Percurso */}
            {form.uf_inicio && form.uf_fim && form.uf_inicio !== form.uf_fim && (
              <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                  UFs de Percurso {form.uf_inicio} ➔ {form.uf_fim}
                  <span className="text-[11px] font-normal text-slate-400 ml-2">
                    somente para MDF-e interestadual, em ordem crescente
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {UFS_BRASIL.map(uf => (
                    <button
                      key={uf}
                      type="button"
                      onClick={() => alternarUfPercurso(uf)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        form.ufs_percurso.includes(uf)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
                {erros.dados.find(e => e.includes('percurso')) && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-2">
                    {erros.dados.find(e => e.includes('percurso'))}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 2: RODOVIÁRIO ─── */}
        {passoAtual === 1 && (
          <div className="space-y-6">
            <GradeCampos>
              <CampoFiscal rotulo="Veículo de Tração" obrigatorio erro={erros.rodoviario.find(e => e.includes('veículo'))}>
                <SelectFiscal
                  value={form.veiculo_id}
                  onChange={v => {
                    const veic = veiculos.find((x: any) => String(x.id) === v);
                    setForm(f => ({ ...f, veiculo_id: v, veiculo_placa: veic?.placa || '' }));
                  }}
                  opcoes={veiculos.map((v: any) => ({
                    valor: String(v.id),
                    rotulo: `${v.placa} — ${Number(v.capacidade_kg || 0).toLocaleString('pt-BR')} kg ${v.tipo_proprietario === '1' ? '(Próprio)' : '(TAC)'}`
                  }))}
                  placeholder="Selecione o veículo..."
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Condutor Principal" obrigatorio erro={erros.rodoviario.find(e => e.includes('condutor'))}>
                <SelectFiscal
                  value={form.condutores[0]?.id || ''}
                  onChange={v => {
                    const mot = motoristas.find((x: any) => String(x.id) === v);
                    setForm(f => ({
                      ...f,
                      condutores: mot ? [{ id: String(mot.id), nome: mot.nome, cpf: mot.cpf }] : []
                    }));
                  }}
                  opcoes={motoristas.map((m: any) => ({ valor: String(m.id), rotulo: `${m.nome} — CPF ${m.cpf}` }))}
                  placeholder="Selecione..."
                />
              </CampoFiscal>
            </GradeCampos>

            {/* Capacidade vs peso */}
            {veiculoSelecionado && (
              <div className={`p-4 rounded-2xl border ${
                excedeCapacidade
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50'
                  : 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800'
              }`}>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Capacidade do veículo vs. carga</span>
                  <span className={`font-black tabular-nums ${excedeCapacidade ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                    {pesoTotal.toLocaleString('pt-BR')} / {capacidadeKg.toLocaleString('pt-BR')} kg
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      excedeCapacidade
                        ? 'bg-red-500'
                        : capacidadeKg > 0 && pesoTotal / capacidadeKg > 0.9 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${capacidadeKg > 0 ? Math.min(100, (pesoTotal / capacidadeKg) * 100) : 0}%` }}
                  />
                </div>
                {excedeCapacidade && (
                  <p className="text-[11px] text-red-700 dark:text-red-300 mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    O peso da carga excede a capacidade do veículo — a SEFAZ pode fiscalizar.
                  </p>
                )}
              </div>
            )}

            {/* Contratantes */}
            <ListaEditavelFiscal<Contratante>
              titulo="Contratantes do Frete"
              itens={form.contratantes}
              onChange={itens => setCampo('contratantes', itens)}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, tipo: 'PJ', documento: '', nome: '' })}
              rotuloBotao="Novo Contratante"
              vazio="Opcional — informe quem contratou o frete."
              renderItem={(item, i, atualizar, remover) => (
                <div className="flex items-end gap-2">
                  <div className="w-28">
                    <SelectFiscal
                      value={item.tipo}
                      onChange={v => atualizar({ ...item, tipo: v })}
                      opcoes={[
                        { valor: 'PJ', rotulo: 'Pessoa Jurídica' },
                        { valor: 'PF', rotulo: 'Pessoa Física' },
                        { valor: 'ESTRANGEIRO', rotulo: 'Estrangeiro' }
                      ]}
                    />
                  </div>
                  <div className="w-44">
                    <InputFiscal value={item.documento} onChange={v => atualizar({ ...item, documento: mascaras.cpfCnpj(v) })} placeholder="CNPJ/CPF" />
                  </div>
                  <div className="flex-1">
                    <InputFiscal value={item.nome} onChange={v => atualizar({ ...item, nome: v })} placeholder="Razão social" />
                  </div>
                  <BotaoRemover onClick={remover} />
                </div>
              )}
            />

            {/* Reboques */}
            <ListaEditavelFiscal<any>
              titulo="Reboques"
              itens={form.reboques}
              onChange={itens => setCampo('reboques', itens)}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, placa: '', tara_kg: '', capacidade_kg: '', tipo_carroceria: '01' })}
              rotuloBotao="Novo Reboque"
              vazio="Opcional — vincule reboques quando houver."
              renderItem={(item, i, atualizar, remover) => (
                <div className="flex items-end gap-2">
                  <div className="w-32">
                    <InputFiscal value={item.placa} onChange={v => atualizar({ ...item, placa: mascaras.placa(v) })} placeholder="Placa" />
                  </div>
                  <div className="w-28">
                    <InputFiscal type="number" step="0.001" value={item.tara_kg} onChange={v => atualizar({ ...item, tara_kg: v })} placeholder="Tara kg" />
                  </div>
                  <div className="w-32">
                    <InputFiscal type="number" step="0.001" value={item.capacidade_kg} onChange={v => atualizar({ ...item, capacidade_kg: v })} placeholder="Capacidade kg" />
                  </div>
                  <BotaoRemover onClick={remover} />
                </div>
              )}
            />
          </div>
        )}

        {/* ─── ABA 3: PAGAMENTO DE FRETE ─── */}
        {passoAtual === 2 && (
          <div className="space-y-6">
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                O pagamento de frete é <strong>obrigatório em todas as emissões</strong> desde a Nota Técnica 2501.
                Sem ele, a SEFAZ rejeita o manifesto.
              </p>
            </div>

            <ListaEditavelFiscal<PagamentoFrete>
              titulo="Pagamento de Frete"
              itens={form.pagto_frete}
              onChange={itens => setCampo('pagto_frete', itens)}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, responsavel: '', componentes: 'Frete', forma: '01', tipo: '01' })}
              rotuloBotao="Novo Pagamento"
              vazio="Adicione ao menos um pagamento de frete."
              renderItem={(item, i, atualizar, remover) => (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <InputFiscal value={item.responsavel} onChange={v => atualizar({ ...item, responsavel: v })} placeholder="Responsável (CNPJ)" />
                  </div>
                  <div>
                    <InputFiscal value={item.componentes} onChange={v => atualizar({ ...item, componentes: v })} placeholder="Componentes (ex: Frete)" />
                  </div>
                  <div>
                    <SelectFiscal
                      value={item.forma}
                      onChange={v => atualizar({ ...item, forma: v })}
                      opcoes={[
                        { valor: '01', rotulo: '01 — À vista' },
                        { valor: '02', rotulo: '02 — À prazo' }
                      ]}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <SelectFiscal
                      value={item.tipo}
                      onChange={v => atualizar({ ...item, tipo: v })}
                      opcoes={[
                        { valor: '01', rotulo: '01 — Dados bancários' },
                        { valor: '02', rotulo: '02 — CNPJ' },
                        { valor: '03', rotulo: '03 — Pix' }
                      ]}
                    />
                    <BotaoRemover onClick={remover} />
                  </div>
                </div>
              )}
            />

            {erros.pagamento.map((e, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {e}
              </p>
            ))}
          </div>
        )}

        {/* ─── ABA 4: DOCUMENTOS ─── */}
        {passoAtual === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Selecione os CT-es autorizados queloadsão embarcar nesta viagem.
            </p>
            <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  CT-es Autorizados ({form.ctes_ids.length} selecionado(s))
                </span>
                <button
                  type="button"
                  onClick={() => setCampo('ctes_ids', ctes.map((c: any) => c.id))}
                  className="text-[11px] font-bold text-brand-600 hover:text-brand-700"
                >
                  Selecionar todos
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {ctes.length === 0 ? (
                  <p className="px-4 py-10 text-center text-xs text-slate-400">
                    Nenhum CT-e autorizado disponível.
                  </p>
                ) : (
                  ctes.map((c: any) => {
                    const marcado = form.ctes_ids.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-700/30 ${marcado ? 'bg-sky-50/50 dark:bg-sky-950/20' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => setForm(f => ({
                            ...f,
                            ctes_ids: marcado ? f.ctes_ids.filter(x => x !== c.id) : [...f.ctes_ids, c.id]
                          }))}
                          className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            CT-e nº {c.numero || '—'} · {c.municipio_inicio}/{c.uf_inicio} ➔ {c.municipio_fim}/{c.uf_fim}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 truncate">{c.chave_cte || c.ref}</p>
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                          R$ {Number(c.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            {erros.documentos.map((e, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {e}
              </p>
            ))}
          </div>
        )}

        {/* ─── ABA 5: SEGUROS ─── */}
        {passoAtual === 4 && (
          <div className="space-y-4">
            <ListaEditavelFiscal<Seguro>
              titulo="Seguros da Carga"
              itens={form.seguros}
              onChange={itens => setCampo('seguros', itens)}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, responsavel: '1', cnpj_responsavel: '', nome_seguradora: '', numero_apolice: '', numero_averbacao: '' })}
              rotuloBotao="Novo Seguro"
              vazio="Opcional — vincule o seguro da carga quando houver."
              renderItem={(item, i, atualizar, remover) => (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-end gap-2">
                    <div className="w-40">
                      <SelectFiscal
                        value={item.responsavel}
                        onChange={v => atualizar({ ...item, responsavel: v })}
                        opcoes={[
                          { valor: '1', rotulo: '1 — Emitente do MDF-e' },
                          { valor: '2', rotulo: '2 — Contratante do Frete' }
                        ]}
                      />
                    </div>
                    <div className="flex-1">
                      <InputFiscal value={item.cnpj_responsavel} onChange={v => atualizar({ ...item, cnpj_responsavel: mascaras.cpfCnpj(v) })} placeholder="CNPJ do responsável" />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <InputFiscal value={item.nome_seguradora} onChange={v => atualizar({ ...item, nome_seguradora: v })} placeholder="Nome da seguradora" />
                    </div>
                    <BotaoRemover onClick={remover} />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <InputFiscal value={item.numero_apolice} onChange={v => atualizar({ ...item, numero_apolice: v })} placeholder="Número da apólice" />
                    </div>
                    <div className="flex-1">
                      <InputFiscal value={item.numero_averbacao} onChange={v => atualizar({ ...item, numero_averbacao: v })} placeholder="Número da averbação" />
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        )}

        {/* ─── ABA 6: PRODUTOS E TOTAIS ─── */}
        {passoAtual === 5 && (
          <div className="space-y-6">
            <ListaEditavelFiscal<ProdutoPred>
              titulo="Produtos Predominantes"
              itens={form.produtos_predominantes}
              onChange={itens => setCampo('produtos_predominantes', itens)}
              novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, tipo_carga: '05', descricao: '', ncm: '', lotacao: false })}
              rotuloBotao="Novo Produto"
              vazio="Obrigatório — informe o produto predominante com o NCM."
              renderItem={(item, i, atualizar, remover) => (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <SelectFiscal
                      value={item.tipo_carga}
                      onChange={v => atualizar({ ...item, tipo_carga: v })}
                      opcoes={TIPOS_CARGA}
                    />
                  </div>
                  <div>
                    <InputFiscal value={item.descricao} onChange={v => atualizar({ ...item, descricao: v })} placeholder="Descrição do produto" />
                  </div>
                  <div>
                    <InputFiscal value={item.ncm} onChange={v => atualizar({ ...item, ncm: mascaras.somenteDigitos(v) })} placeholder="NCM (obrigatório)" />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 pb-2.5">
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

            <GradeCampos>
              <CampoFiscal rotulo="Valor Total da Carga" obrigatorio erro={erros.produtos.find(e => e.includes('Valor total'))}>
                <InputFiscal type="number" step="0.01" value={form.valor_total_carga} onChange={v => setCampo('valor_total_carga', v)} placeholder="0,00" />
              </CampoFiscal>

              <CampoFiscal rotulo="Unidade de Medida do Peso" obrigatorio>
                <SelectFiscal
                  value={form.unidade_medida}
                  onChange={v => setCampo('unidade_medida', v)}
                  opcoes={[
                    { valor: '01', rotulo: '01 — Quilograma (kg)' },
                    { valor: '02', rotulo: '02 — Tonelada (t)' }
                  ]}
                />
              </CampoFiscal>

              <CampoFiscal rotulo="Peso Bruto Total" obrigatorio erro={erros.produtos.find(e => e.includes('Peso bruto'))}>
                <InputFiscal type="number" step="0.001" value={form.peso_bruto} onChange={v => setCampo('peso_bruto', v)} placeholder="0,000" />
              </CampoFiscal>
            </GradeCampos>

            {/* Lacres e autorizações */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ListaEditavelFiscal<{ id: string; numero: string }>
                titulo="Lacres"
                itens={form.lacres}
                onChange={itens => setCampo('lacres', itens)}
                novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, numero: '' })}
                rotuloBotao="Novo Lacre"
                vazio="Opcional."
                renderItem={(item, i, atualizar, remover) => (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <InputFiscal value={item.numero} onChange={v => atualizar({ ...item, numero: v })} placeholder="Número do lacre" />
                    </div>
                    <BotaoRemover onClick={remover} />
                  </div>
                )}
              />

              <ListaEditavelFiscal<{ id: string; cpf_cnpj: string }>
                titulo="Pessoas Autorizadas a Baixar o XML"
                itens={form.pessoas_autorizadas}
                onChange={itens => setCampo('pessoas_autorizadas', itens)}
                novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, cpf_cnpj: '' })}
                rotuloBotao="Nova Pessoa"
                vazio="Opcional — até 10 pessoas."
                renderItem={(item, i, atualizar, remover) => (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <InputFiscal value={item.cpf_cnpj} onChange={v => atualizar({ ...item, cpf_cnpj: mascaras.cpfCnpj(v) })} placeholder="CPF/CNPJ" />
                    </div>
                    <BotaoRemover onClick={remover} />
                  </div>
                )}
              />
            </div>

            {erros.produtos.map((e, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {e}
              </p>
            ))}
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
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Avançar
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => salvar(true)}
                disabled={salvando || bloqueios.length > 0}
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
