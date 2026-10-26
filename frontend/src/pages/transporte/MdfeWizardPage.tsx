import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { CampoFiscal, GradeCampos, SelectFiscal, InputFiscal, TextareaFiscal, mascaras } from '../../components/fiscal/CampoFiscal';
import ListaEditavelFiscal, { BotaoRemover } from '../../components/fiscal/ListaEditavelFiscal';
import {
  Truck, Users, CreditCard, FileText, Package, Shield, Save, Send,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Loader2, Info,
  Plus, X, Search, Settings2, CircleDot, Scale
} from 'lucide-react';

interface Contratante { id: string; tipo: string; documento: string; nome: string; }
interface Seguro { id: string; responsavel: string; cnpj_responsavel: string; nome_seguradora: string; numero_apolice: string; numero_averbacao: string; }
interface ProdutoPred { id: string; tipo_carga: string; descricao: string; ncm: string; lotacao: boolean; }
interface PagamentoFrete { id: string; responsavel: string; componentes: string; forma: string; tipo: string; }
interface Reboque { id: string; placa: string; tara_kg: string; capacidade_kg: string; }

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
  const [aba, setAba] = useState<'dados' | 'seguro'>('dados');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const [mdfeId, setMdfeId] = useState<number | null>(null);

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
    // Pagamento
    pagto_frete: [] as PagamentoFrete[],
    // Documentos
    ctes_ids: [] as number[],
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

  const { data: municipiosData } = useQuery({
    queryKey: ['municipios-mdfe'],
    queryFn: async () => (await api.get('/transporte/municipios')).data
  });
  const municipios = municipiosData?.data || [];

  // ── Checklist de prontidão (pré-requisitos) ──
  const checklist = useMemo(() => [
    { ok: veiculos.length > 0, rotulo: 'Veículos cadastrados', detalhe: `${veiculos.length} veículo(s)` },
    { ok: motoristas.length > 0, rotulo: 'Motoristas cadastrados', detalhe: `${motoristas.length} condutor(es)` },
    { ok: emitentes.some((e: any) => e.rntrc), rotulo: 'RNTRC configurado', detalhe: 'Exigido no MDF-e rodoviário' },
    { ok: ctes.length > 0, rotulo: 'CT-es autorizados', detalhe: `${ctes.length} disponível(is)` }
  ], [veiculos, motoristas, emitentes, ctes]);

  const bloqueios = checklist.filter(c => !c.ok);

  const erros = useMemo(() => {
    const e: Record<string, string[]> = { dados: [], pagamento: [], documentos: [], produtos: [] };

    if (!form.emitente_id) e.dados.push('Selecione a transportadora emitente.');
    if (!form.uf_inicio) e.dados.push('Estado de carga é obrigatório.');
    if (!form.uf_fim) e.dados.push('Estado de descarga é obrigatório.');
    if (!form.municipio_carga) e.dados.push('Município de carga é obrigatório.');
    if (!form.veiculo_placa) e.dados.push('Selecione o veículo de tração.');
    if (form.condutores.length === 0) e.dados.push('Informe o motorista condutor.');

    // UFs de percurso: interestadual, em ordem crescente a partir da UF de carga
    if (form.uf_inicio && form.uf_fim && form.uf_inicio !== form.uf_fim) {
      if (form.ufs_percurso.length === 0) {
        e.dados.push('MDF-e interestadual exige as UFs de percurso.');
      } else {
        const idxInicio = UFS_BRASIL.indexOf(form.uf_inicio);
        const foraOrdem = form.ufs_percurso.some((uf, i) => {
          const idx = UFS_BRASIL.indexOf(uf);
          return idx < idxInicio || (i > 0 && idx <= UFS_BRASIL.indexOf(form.ufs_percurso[i - 1]));
        });
        if (foraOrdem) e.dados.push('UFs de percurso devem estar em ordem crescente a partir da UF de carga.');
      }
    }

    if (form.pagto_frete.length === 0) {
      e.pagamento.push('Pagamento de frete é obrigatório (NT 2501) para emitir o MDF-e.');
    }
    if (form.ctes_ids.length === 0) e.documentos.push('Vincule ao menos um CT-e ao manifesto.');
    if (form.produtos_predominantes.length === 0) {
      e.produtos.push('Informe ao menos um produto predominante com NCM.');
    } else if (form.produtos_predominantes.some(p => !p.ncm || p.ncm.length < 2)) {
      e.produtos.push('Todo produto predominante precisa do NCM.');
    }
    if (!form.valor_total_carga) e.produtos.push('Valor total da carga é obrigatório.');
    if (!form.peso_bruto) e.produtos.push('Peso bruto é obrigatório.');

    return e;
  }, [form]);

  const totalErros = Object.values(erros).flat();

  const setCampo = (campo: string, valor: any) => setForm(f => ({ ...f, [campo]: valor }));

  const alternarUfPercurso = (uf: string) => {
    setForm(f => ({
      ...f,
      ufs_percurso: f.ufs_percurso.includes(uf)
        ? f.ufs_percurso.filter(x => x !== uf)
        : [...f.ufs_percurso, uf].sort()
    }));
  };

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
        alert('MDF-e transmitido para a SEFAZ! Acompanhe em Documentos Emitidos.');
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

  const veiculoSelecionado = veiculos.find((v: any) => String(v.id) === form.veiculo_id);
  const capacidadeKg = Number(veiculoSelecionado?.capacidade_kg || 0);
  const pesoTotal = Number(form.peso_bruto || 0);
  const excedeCapacidade = capacidadeKg > 0 && pesoTotal > capacidadeKg;

  return (
    <div className="pb-24">
      {/* ═══ JANELA DO DOCUMENTO ═══ */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm">
        {/* Barra azul do documento */}
        <div className="bg-[#0B63A5] dark:bg-[#0A4F82] px-5 py-3 flex items-center justify-between">
          <span className="text-white font-bold text-sm tracking-tight">
            MDF-e 3.00 — Manifesto Eletrônico de Documentos Fiscais
          </span>
          <div className="flex items-center gap-2">
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
              {/* Bloco: Dados Gerais */}
              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Dados Gerais
                </legend>

                <GradeCampos className="gap-x-4 gap-y-3">
                  <CampoFiscal rotulo="Operação Comercial" dica="Modelo do manifesto">
                    <SelectFiscal
                      value={form.tipo_emitente}
                      onChange={v => setCampo('tipo_emitente', v)}
                      opcoes={[
                        { valor: '1', rotulo: '1 — Prestador de Serviço de Transporte' },
                        { valor: '2', rotulo: '2 — Carga Própria' },
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
                      onChange={v => setCampo('uf_inicio', v)}
                      opcoes={UFS_BRASIL.map(u => ({ valor: u, rotulo: u }))}
                      placeholder="Selecione..."
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Estado de Descarga" obrigatorio erro={erros.dados.find(e => e.includes('Estado de descarga'))}>
                    <SelectFiscal
                      value={form.uf_fim}
                      onChange={v => setCampo('uf_fim', v)}
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
                    <div className="flex flex-col sm:flex-row items-end gap-2">
                      <div className="w-full sm:w-44">
                        <CampoFiscal rotulo="Condutor" obrigatorio erro={erros.dados.find(e => e.includes('motorista'))}>
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
                            placeholder="Pesquisar..."
                          />
                        </CampoFiscal>
                      </div>
                      {form.condutores[0] && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 pb-2.5">
                          CPF {form.condutores[0].cpf}
                        </p>
                      )}
                    </div>
                  </fieldset>

                  {/* Veículo */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Veículo
                    </legend>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <CampoFiscal rotulo="Veículo de Tração" obrigatorio erro={erros.dados.find(e => e.includes('veículo'))}>
                          <SelectFiscal
                            value={form.veiculo_id}
                            onChange={v => {
                              const veic = veiculos.find((x: any) => String(x.id) === v);
                              setForm(f => ({ ...f, veiculo_id: v, veiculo_placa: veic?.placa || '' }));
                            }}
                            opcoes={veiculos.map((v: any) => ({
                              valor: String(v.id),
                              rotulo: `${v.placa} — ${Number(v.capacidade_kg || 0).toLocaleString('pt-BR')} kg`
                            }))}
                            placeholder="Pesquisar..."
                          />
                        </CampoFiscal>
                        <CampoFiscal rotulo="Placa">
                          <InputFiscal value={form.veiculo_placa} onChange={v => setCampo('veiculo_placa', mascaras.placa(v))} disabled />
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

                  {/* Pagamento de frete */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Pagamento de Frete <span className="text-red-500">*</span>
                    </legend>
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
                  </fieldset>

                  {/* Documentos Referenciados */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Documentos Ref. <span className="text-red-500">*</span>
                    </legend>
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 uppercase text-[10px] sticky top-0">
                          <tr>
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
                            <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Nenhum CT-e autorizado.</td></tr>
                          ) : (
                            ctes.map((c: any) => {
                              const marcado = form.ctes_ids.includes(c.id);
                              return (
                                <tr
                                  key={c.id}
                                  onClick={() => setForm(f => ({
                                    ...f,
                                    ctes_ids: marcado ? f.ctes_ids.filter(x => x !== c.id) : [...f.ctes_ids, c.id]
                                  }))}
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
                    {erros.documentos.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        {e}
                      </p>
                    ))}
                  </fieldset>

                  {/* Produtos predominantes e totais */}
                  <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Produtos Predominantes <span className="text-red-500">*</span>
                    </legend>
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
                        <p className="text-[10px] text-slate-400 mb-2">
                          Selecione as UFs de passagem, em ordem crescente a partir de {form.uf_inicio}:
                        </p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {UFS_BRASIL.map(uf => (
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

                  {/* Contratantes */}
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
                </div>
              </div>
            </div>
          )}

          {/* ─── ABA SEGURO ─── */}
          {aba === 'seguro' && (
            <div className="space-y-4">
              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <legend className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Seguros da Carga
                </legend>
                <ListaEditavelFiscal<Seguro>
                  titulo=""
                  itens={form.seguros}
                  onChange={itens => setCampo('seguros', itens)}
                  novoItem={() => ({ id: `${Date.now()}-${Math.random()}`, responsavel: '1', cnpj_responsavel: '', nome_seguradora: '', numero_apolice: '', numero_averbacao: '' })}
                  rotuloBotao="Novo Seguro"
                  vazio="Opcional — vincule o seguro da carga quando houver."
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
                        <InputFiscal value={item.cnpj_responsavel} onChange={v => atualizar({ ...item, cnpj_responsavel: mascaras.cpfCnpj(v) })} placeholder="CNPJ do responsável" />
                      </div>
                      <div className="flex items-end gap-2">
                        <InputFiscal value={item.nome_seguradora} onChange={v => atualizar({ ...item, nome_seguradora: v })} placeholder="Nome da seguradora" />
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
