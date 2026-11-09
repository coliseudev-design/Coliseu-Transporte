import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import TabelaResponsiva from '../../components/TabelaResponsiva';
import {
  CampoFiscal,
  GradeCampos,
  SelectFiscal,
  InputFiscal,
  mascaras,
  identificarPadraoPlaca,
  formatarPlacaExibicao
} from '../../components/fiscal/CampoFiscal';
import {
  Truck, Plus, Search, Loader2, Trash2, Edit2, AlertTriangle, CheckCircle2,
  Car, IdCard, Info, X, ShieldCheck
} from 'lucide-react';

interface Veiculo {
  id: number;
  placa: string;
  renavam: string;
  chassi: string;
  uf: string;
  tipo_rodado: string;
  tipo_carroceria: string;
  tara_kg: number;
  capacidade_kg: number;
  capacidade_m3: number;
  tipo_proprietario: string;
  rntrc: string;
  cpf_cnpj_proprietario: string;
  nome_proprietario: string;
  uf_proprietario: string;
}

interface Motorista {
  id: number;
  cpf: string;
  nome: string;
  cnh: string;
  cnh_categoria: string;
  cnh_validade: string;
  telefone: string;
}

// Domínio oficial SEFAZ CT-e / MDF-e (tpRod: 01..06)
const TIPOS_RODADO = [
  { valor: '01', rotulo: '01 — Truck' },
  { valor: '02', rotulo: '02 — Toco' },
  { valor: '03', rotulo: '03 — Cavalo Mecânico' },
  { valor: '04', rotulo: '04 — VAN / Furgão' },
  { valor: '05', rotulo: '05 — Utilitário / Caminhonete' },
  { valor: '06', rotulo: '06 — Outros (Automóvel / Reboque)' }
];

// Domínio oficial SEFAZ CT-e / MDF-e (tpCar: 00..05)
const TIPOS_CARROCERIA = [
  { valor: '00', rotulo: '00 — Não aplicável (Automóvel / Cavalo)' },
  { valor: '01', rotulo: '01 — Aberta (Carga Seca)' },
  { valor: '02', rotulo: '02 — Fechada / Baú / Frigorificada' },
  { valor: '03', rotulo: '03 — Granelera' },
  { valor: '04', rotulo: '04 — Porta Container' },
  { valor: '05', rotulo: '05 — Sider' }
];

const VEICULO_VAZIO = {
  id: 0,
  placa: '',
  renavam: '',
  chassi: '',
  uf: 'MS',
  tipo_rodado: '01',
  tipo_carroceria: '02',
  tara_kg: '',
  capacidade_kg: '',
  capacidade_m3: '',
  tipo_proprietario: '1',
  rntrc: '',
  cpf_cnpj_proprietario: '',
  nome_proprietario: '',
  uf_proprietario: ''
};

const MOTORISTA_VAZIO = {
  id: 0,
  cpf: '',
  nome: '',
  cnh: '',
  cnh_categoria: 'D',
  cnh_validade: '',
  telefone: ''
};

export default function FrotaPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'veiculos' | 'motoristas'>('veiculos');

  const [modalVeiculo, setModalVeiculo] = useState<typeof VEICULO_VAZIO | null>(null);
  const [modalMotorista, setModalMotorista] = useState<typeof MOTORISTA_VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucessoBanner, setSucessoBanner] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [avisoPlaca, setAvisoPlaca] = useState('');

  const { data: veiculosData, isLoading: loadingV } = useQuery({
    queryKey: ['veiculos-frota'],
    queryFn: async () => (await api.get('/transporte/veiculos')).data
  });
  const veiculos: Veiculo[] = veiculosData?.data || [];

  const { data: motoristasData, isLoading: loadingM } = useQuery({
    queryKey: ['motoristas-frota'],
    queryFn: async () => (await api.get('/transporte/motoristas')).data
  });
  const motoristas: Motorista[] = motoristasData?.data || [];

  const buscarPlaca = async () => {
    if (!modalVeiculo) return;
    const padrao = identificarPadraoPlaca(modalVeiculo.placa);
    const placaLimpa = modalVeiculo.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (!padrao) {
      setAvisoPlaca('Informe uma placa válida: padrão antigo (ex: QAR-5644) ou Mercosul (ex: QAR5G44).');
      return;
    }

    setBuscando(true);
    setAvisoPlaca('');
    setErro('');
    try {
      const res = await api.get(`/transporte/veiculos/placa/${encodeURIComponent(placaLimpa)}`);
      if (res.data?.encontrado) {
        const d = res.data.dados;
        setModalVeiculo(v =>
          v
            ? {
                ...v,
                placa: mascaras.placa(d.placa || v.placa),
                uf: d.uf || v.uf,
                tipo_rodado: d.tipo_rodado || v.tipo_rodado,
                tipo_carroceria: d.tipo_carroceria || v.tipo_carroceria,
                chassi: d.chassi || v.chassi,
                capacidade_kg: d.capacidade_kg ? String(d.capacidade_kg) : v.capacidade_kg,
                tara_kg: d.capacidade_kg ? String(Math.round(d.capacidade_kg * 0.35)) : v.tara_kg
              }
            : v
        );
        setAvisoPlaca(
          `Veículo encontrado: ${d.marca} ${d.modelo}${d.ano_modelo ? ` (${d.ano_modelo})` : ''}. Confira e complete os dados.`
        );
      } else {
        setAvisoPlaca(
          res.data?.motivo ||
            'Placa válida (antiga/Mercosul), mas sem retorno público automático. Preencha os dados abaixo e clique em Salvar Veículo.'
        );
      }
    } catch (e: any) {
      setAvisoPlaca(
        e.response?.data?.error || 'Não foi possível consultar a base externa agora. Você pode preencher e salvar manualmente.'
      );
    } finally {
      setBuscando(false);
    }
  };

  const salvarVeiculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalVeiculo) return;

    const padrao = identificarPadraoPlaca(modalVeiculo.placa);
    const placaLimpa = modalVeiculo.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!padrao) {
      setErro('Placa inválida. Digite 3 letras + 4 números (antiga, ex: QAR-5644) ou padrão Mercosul (ex: QAR5G44).');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      await api.post('/transporte/veiculos', {
        ...modalVeiculo,
        placa: placaLimpa
      });
      setModalVeiculo(null);
      qc.invalidateQueries({ queryKey: ['veiculos-frota'] });
      qc.invalidateQueries({ queryKey: ['veiculos'] });
      qc.invalidateQueries({ queryKey: ['veiculos-mdfe'] });
      setSucessoBanner(
        `Veículo ${formatarPlacaExibicao(placaLimpa)} (${padrao === 'MERCOSUL' ? 'Padrão Mercosul' : 'Padrão Antigo'}) salvo com sucesso!`
      );
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao salvar veículo.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarMotorista = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalMotorista) return;

    const cpfDigitos = modalMotorista.cpf.replace(/\D/g, '');
    if (cpfDigitos.length !== 11 || !modalMotorista.nome.trim()) {
      setErro('Informe o CPF válido (11 dígitos) e o nome completo do condutor.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      await api.post('/transporte/motoristas', {
        ...modalMotorista,
        cpf: cpfDigitos
      });
      const nomeSalvo = modalMotorista.nome.trim();
      setModalMotorista(null);
      qc.invalidateQueries({ queryKey: ['motoristas-frota'] });
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      qc.invalidateQueries({ queryKey: ['motoristas-mdfe'] });
      setSucessoBanner(`Condutor "${nomeSalvo}" salvo com sucesso!`);
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao salvar motorista.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirEdicaoVeiculo = (v: Veiculo) => {
    setErro('');
    setAvisoPlaca('');
    setModalVeiculo({
      id: v.id,
      placa: formatarPlacaExibicao(v.placa),
      renavam: v.renavam || '',
      chassi: v.chassi || '',
      uf: v.uf || 'MS',
      tipo_rodado: v.tipo_rodado || '01',
      tipo_carroceria: v.tipo_carroceria || '02',
      tara_kg: v.tara_kg ? String(v.tara_kg) : '',
      capacidade_kg: v.capacidade_kg ? String(v.capacidade_kg) : '',
      capacidade_m3: v.capacidade_m3 ? String(v.capacidade_m3) : '',
      tipo_proprietario: v.tipo_proprietario || '1',
      rntrc: v.rntrc || '',
      cpf_cnpj_proprietario: v.cpf_cnpj_proprietario ? mascaras.cpfCnpj(v.cpf_cnpj_proprietario) : '',
      nome_proprietario: v.nome_proprietario || '',
      uf_proprietario: v.uf_proprietario || ''
    });
  };

  const abrirEdicaoMotorista = (m: Motorista) => {
    setErro('');
    setModalMotorista({
      id: m.id,
      cpf: mascaras.cpfCnpj(m.cpf || ''),
      nome: m.nome || '',
      cnh: m.cnh || '',
      cnh_categoria: m.cnh_categoria || 'D',
      cnh_validade: m.cnh_validade ? String(m.cnh_validade).slice(0, 10) : '',
      telefone: m.telefone ? mascaras.telefone(m.telefone) : ''
    });
  };

  const excluir = async (tipo: 'veiculos' | 'motoristas', id: number) => {
    if (!confirm('Remover este registro da frota?')) return;
    try {
      await api.delete(`/transporte/${tipo}/${id}`);
      qc.invalidateQueries({ queryKey: [tipo === 'veiculos' ? 'veiculos-frota' : 'motoristas-frota'] });
      qc.invalidateQueries({ queryKey: [tipo === 'veiculos' ? 'veiculos-mdfe' : 'motoristas-mdfe'] });
    } catch (e: any) {
      setErro('Erro ao remover: ' + (e.response?.data?.error || e.message));
    }
  };

  const rotuloRodado = (v: string) => TIPOS_RODADO.find(t => t.valor === v)?.rotulo.split(' — ')[1] || v;
  const rotuloCarroceria = (v: string) => TIPOS_CARROCERIA.find(t => t.valor === v)?.rotulo.split(' — ')[1] || v;

  const padraoModalAtual = modalVeiculo ? identificarPadraoPlaca(modalVeiculo.placa) : null;

  return (
    <div className="space-y-4 pb-20">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-brand-600 dark:text-brand-500" />
            Gestão de Frota & Condutores
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Compatível com placas padrão antigo (ABC-1234) e Mercosul (ABC1D23), veículos próprios/TAC e condutores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
            <button
              onClick={() => setTab('veiculos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tab === 'veiculos'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Veículos ({veiculos.length})
            </button>
            <button
              onClick={() => setTab('motoristas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tab === 'motoristas'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Motoristas ({motoristas.length})
            </button>
          </div>

          <button
            onClick={() => {
              setErro('');
              setAvisoPlaca('');
              setSucessoBanner('');
              setModalVeiculo(tab === 'veiculos' ? { ...VEICULO_VAZIO } : null);
              setModalMotorista(tab === 'motoristas' ? { ...MOTORISTA_VAZIO } : null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {tab === 'veiculos' ? 'Novo Veículo' : 'Novo Motorista'}
          </button>
        </div>
      </div>

      {sucessoBanner && (
        <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {sucessoBanner}
          </span>
          <button onClick={() => setSucessoBanner('')} className="text-emerald-700 hover:opacity-75 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lista */}
      {tab === 'veiculos' ? (
        loadingV ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando frota...</div>
        ) : veiculos.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <Car className="w-12 h-12 mx-auto text-slate-400 mb-3" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum veículo na frota</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Cadastre placas no padrão antigo (ABC-1234) ou Mercosul (ABC1D23) para emissão de CT-e e MDF-e.
            </p>
            <button
              onClick={() => {
                setErro('');
                setAvisoPlaca('');
                setModalVeiculo({ ...VEICULO_VAZIO });
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Cadastrar o primeiro veículo
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
            <TabelaResponsiva<Veiculo>
              dados={veiculos}
              chaveDe={v => v.id}
              colunas={[
                {
                  chave: 'placa',
                  rotulo: 'Placa',
                  render: v => {
                    const padrao = identificarPadraoPlaca(v.placa);
                    return (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatarPlacaExibicao(v.placa)}
                          </p>
                          {padrao && (
                            <span
                              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                                padrao === 'MERCOSUL'
                                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {padrao === 'MERCOSUL' ? 'Mercosul' : 'Antiga'}
                            </span>
                          )}
                        </div>
                        {v.uf && <p className="text-[10px] text-slate-400">UF: {v.uf}</p>}
                      </div>
                    );
                  }
                },
                {
                  chave: 'tipo',
                  rotulo: 'Tipo',
                  render: v => <span className="text-slate-700 dark:text-slate-300">{rotuloRodado(v.tipo_rodado)}</span>
                },
                {
                  chave: 'carroceria',
                  rotulo: 'Carroceria',
                  ocultarNoTablet: true,
                  render: v => (
                    <span className="text-slate-700 dark:text-slate-300">{rotuloCarroceria(v.tipo_carroceria)}</span>
                  )
                },
                {
                  chave: 'tara',
                  rotulo: 'Tara (kg)',
                  alinhamento: 'right',
                  ocultarNoCelular: true,
                  render: v => (
                    <span className="text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {Number(v.tara_kg || 0).toLocaleString('pt-BR')}
                    </span>
                  )
                },
                {
                  chave: 'capacidade',
                  rotulo: 'Capacidade (kg)',
                  alinhamento: 'right',
                  render: v => (
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      {Number(v.capacidade_kg || 0).toLocaleString('pt-BR')}
                    </span>
                  )
                },
                {
                  chave: 'proprietario',
                  rotulo: 'Proprietário',
                  render: v => (
                    <div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                          v.tipo_proprietario === '1'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                        }`}
                      >
                        {v.tipo_proprietario === '1' ? 'Próprio' : 'Terceiro/TAC'}
                      </span>
                      {v.nome_proprietario && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                          {v.nome_proprietario}
                        </p>
                      )}
                    </div>
                  )
                },
                {
                  chave: 'rntrc',
                  rotulo: 'RNTRC',
                  ocultarNoCelular: true,
                  render: v => <span className="font-mono text-slate-600 dark:text-slate-400">{v.rntrc || '—'}</span>
                },
                {
                  chave: 'acoes',
                  rotulo: 'Ações',
                  alinhamento: 'right',
                  render: v => (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => abrirEdicaoVeiculo(v)}
                        title="Editar veículo"
                        className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => excluir('veiculos', v.id)}
                        title="Remover veículo"
                        className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                }
              ]}
            />
          </div>
        )
      ) : loadingM ? (
        <div className="p-12 text-center text-slate-400 text-sm">Carregando condutores...</div>
      ) : motoristas.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <IdCard className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nenhum condutor cadastrado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Cadastre os condutores com CPF e CNH — eles serão vinculados ao MDF-e no despacho da carga.
          </p>
          <button
            onClick={() => {
              setErro('');
              setModalMotorista({ ...MOTORISTA_VAZIO });
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors cursor-pointer"
          >
            Cadastrar o primeiro condutor
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm overflow-hidden">
          <TabelaResponsiva<Motorista>
            dados={motoristas}
            chaveDe={m => m.id}
            colunas={[
              {
                chave: 'nome',
                rotulo: 'Nome',
                render: m => <span className="font-semibold text-slate-900 dark:text-white">{m.nome}</span>
              },
              {
                chave: 'cpf',
                rotulo: 'CPF',
                render: m => (
                  <span className="font-mono text-slate-600 dark:text-slate-400">
                    {mascaras.cpfCnpj(m.cpf || '')}
                  </span>
                )
              },
              {
                chave: 'cnh',
                rotulo: 'CNH',
                render: m => (
                  <span className="font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {m.cnh || '—'}
                    {m.cnh_categoria && <span className="text-slate-400"> ({m.cnh_categoria})</span>}
                  </span>
                )
              },
              {
                chave: 'validade',
                rotulo: 'Validade',
                ocultarNoCelular: true,
                render: m => (
                  <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {m.cnh_validade ? new Date(m.cnh_validade).toLocaleDateString('pt-BR') : '—'}
                  </span>
                )
              },
              {
                chave: 'telefone',
                rotulo: 'Telefone',
                ocultarNoTablet: true,
                render: m => (
                  <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.telefone || '—'}</span>
                )
              },
              {
                chave: 'acoes',
                rotulo: 'Ações',
                alinhamento: 'right',
                render: m => (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      onClick={() => abrirEdicaoMotorista(m)}
                      title="Editar motorista"
                      className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => excluir('motoristas', m.id)}
                      title="Remover motorista"
                      className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              }
            ]}
          />
        </div>
      )}

      {/* ═══ MODAL: CADASTRO DE VEÍCULO ═══ */}
      {modalVeiculo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-brand-600" />
                  {modalVeiculo.id ? 'Editar Veículo' : 'Cadastro de Veículo'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Aceita placas no padrão antigo (ex: QAR-5644) e padrão Mercosul (ex: QAR5G44).
                </p>
              </div>
              <button
                onClick={() => setModalVeiculo(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
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

            <form onSubmit={salvarVeiculo} className="space-y-5 text-sm">
              {/* Placa (Antiga + Mercosul) + Consulta opcional */}
              <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[11px] font-bold text-sky-800 dark:text-sky-200 uppercase tracking-wider">
                    Placa do Veículo (Antiga ou Mercosul) *
                  </p>
                  {padraoModalAtual && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" />
                      {padraoModalAtual === 'MERCOSUL'
                        ? 'Placa Mercosul válida (ABC1D23)'
                        : 'Placa Antiga válida (ABC-1234)'}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <InputFiscal
                      value={modalVeiculo.placa}
                      onChange={v => {
                        setErro('');
                        setModalVeiculo({ ...modalVeiculo, placa: mascaras.placa(v) });
                      }}
                      placeholder="Ex: QAR-5644 ou QAR5G44"
                      required
                      className="pl-10 font-mono uppercase"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={buscarPlaca}
                    disabled={buscando || !padraoModalAtual}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {buscando ? 'Consultando...' : 'Consultar Placa'}
                  </button>
                </div>

                {avisoPlaca ? (
                  <p className="text-[11px] text-sky-800 dark:text-sky-200 mt-2 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    {avisoPlaca}
                  </p>
                ) : (
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Formato antigo: 3 letras + 4 números (<strong>ABC-1234</strong>) · Formato Mercosul: 3 letras + 1 número + 1 letra + 2 números (<strong>ABC1D23</strong>).
                  </p>
                )}
              </div>

              {/* Dados do veículo */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Dados do Veículo</p>
                <GradeCampos>
                  <CampoFiscal rotulo="RENAVAM">
                    <InputFiscal
                      value={modalVeiculo.renavam}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, renavam: v.replace(/\D/g, '') })}
                      placeholder="00000000000"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Chassi">
                    <InputFiscal
                      value={modalVeiculo.chassi}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, chassi: v.toUpperCase() })}
                      placeholder="9BWZZZ377VT004251"
                      className="font-mono"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Tipo de Rodado" obrigatorio>
                    <SelectFiscal
                      value={modalVeiculo.tipo_rodado}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, tipo_rodado: v })}
                      opcoes={TIPOS_RODADO}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Tipo de Carroceria" obrigatorio>
                    <SelectFiscal
                      value={modalVeiculo.tipo_carroceria}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, tipo_carroceria: v })}
                      opcoes={TIPOS_CARROCERIA}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Tara (kg)" dica="Peso do veículo sem carga">
                    <InputFiscal
                      type="number"
                      step="1"
                      value={modalVeiculo.tara_kg}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, tara_kg: v })}
                      placeholder="1000"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Capacidade de Carga (kg)" obrigatorio>
                    <InputFiscal
                      type="number"
                      step="1"
                      required
                      value={modalVeiculo.capacidade_kg}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, capacidade_kg: v })}
                      placeholder="2000"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Capacidade (m³)">
                    <InputFiscal
                      type="number"
                      step="0.01"
                      value={modalVeiculo.capacidade_m3}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, capacidade_m3: v })}
                      placeholder="0"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="UF do Veículo" obrigatorio>
                    <InputFiscal
                      value={modalVeiculo.uf}
                      required
                      onChange={v => setModalVeiculo({ ...modalVeiculo, uf: v.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2) })}
                      placeholder="MS"
                      className="w-24 font-mono uppercase"
                    />
                  </CampoFiscal>
                </GradeCampos>
              </div>

              {/* Propriedade */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Propriedade</p>
                <GradeCampos>
                  <CampoFiscal rotulo="Tipo de Proprietário" obrigatorio>
                    <SelectFiscal
                      value={modalVeiculo.tipo_proprietario}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, tipo_proprietario: v })}
                      opcoes={[
                        { valor: '1', rotulo: '1 — Próprio (da transportadora)' },
                        { valor: '2', rotulo: '2 — Terceiro / TAC' }
                      ]}
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="RNTRC do Proprietário" dica="Obrigatório quando o veículo é de terceiro/TAC">
                    <InputFiscal
                      value={modalVeiculo.rntrc}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, rntrc: v.replace(/\D/g, '') })}
                      placeholder="00000000"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="CPF/CNPJ do Proprietário">
                    <InputFiscal
                      value={modalVeiculo.cpf_cnpj_proprietario}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, cpf_cnpj_proprietario: mascaras.cpfCnpj(v) })}
                      placeholder="00.000.000/0000-00"
                    />
                  </CampoFiscal>

                  <CampoFiscal rotulo="Nome do Proprietário">
                    <InputFiscal
                      value={modalVeiculo.nome_proprietario}
                      onChange={v => setModalVeiculo({ ...modalVeiculo, nome_proprietario: v })}
                      placeholder="Razão social ou nome"
                    />
                  </CampoFiscal>
                </GradeCampos>
              </div>

              {modalVeiculo.tipo_proprietario === '2' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 dark:text-amber-200">
                    Veículo de terceiro: o MDF-e exige o <strong>RNTRC do proprietário</strong> e o CPF/CNPJ dele.
                    Sem esses dados a SEFAZ rejeita o manifesto.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalVeiculo(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Salvar Veículo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL: CADASTRO DE MOTORISTA ═══ */}
      {modalMotorista && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <IdCard className="w-5 h-5 text-brand-600" />
                  {modalMotorista.id ? 'Editar Motorista' : 'Cadastro de Motorista'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Condutor autorizado a vincular viagens e manifestos MDF-e.
                </p>
              </div>
              <button
                onClick={() => setModalMotorista(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
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

            <form onSubmit={salvarMotorista} className="space-y-4 text-sm">
              <GradeCampos>
                <CampoFiscal rotulo="Nome Completo" obrigatorio colSpan={2}>
                  <InputFiscal
                    value={modalMotorista.nome}
                    required
                    onChange={v => setModalMotorista({ ...modalMotorista, nome: v })}
                    placeholder="Nome completo do condutor"
                  />
                </CampoFiscal>

                <CampoFiscal rotulo="CPF" obrigatorio>
                  <InputFiscal
                    value={modalMotorista.cpf}
                    required
                    onChange={v => setModalMotorista({ ...modalMotorista, cpf: mascaras.cpfCnpj(v.replace(/\D/g, '').slice(0, 11)) })}
                    placeholder="000.000.000-00"
                  />
                </CampoFiscal>

                <CampoFiscal rotulo="Telefone">
                  <InputFiscal
                    value={modalMotorista.telefone}
                    onChange={v => setModalMotorista({ ...modalMotorista, telefone: mascaras.telefone(v) })}
                    placeholder="(67) 99999-9999"
                  />
                </CampoFiscal>

                <CampoFiscal rotulo="Registro CNH">
                  <InputFiscal
                    value={modalMotorista.cnh}
                    onChange={v => setModalMotorista({ ...modalMotorista, cnh: v.replace(/\D/g, '') })}
                    placeholder="00000000000"
                  />
                </CampoFiscal>

                <CampoFiscal rotulo="Categoria CNH" obrigatorio>
                  <SelectFiscal
                    value={modalMotorista.cnh_categoria}
                    onChange={v => setModalMotorista({ ...modalMotorista, cnh_categoria: v })}
                    opcoes={[
                      { valor: 'A', rotulo: 'A' },
                      { valor: 'B', rotulo: 'B' },
                      { valor: 'C', rotulo: 'C' },
                      { valor: 'D', rotulo: 'D' },
                      { valor: 'E', rotulo: 'E' },
                      { valor: 'AE', rotulo: 'AE' }
                    ]}
                  />
                </CampoFiscal>

                <CampoFiscal rotulo="Validade CNH" colSpan={2}>
                  <InputFiscal
                    type="date"
                    value={modalMotorista.cnh_validade}
                    onChange={v => setModalMotorista({ ...modalMotorista, cnh_validade: v })}
                  />
                </CampoFiscal>
              </GradeCampos>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalMotorista(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Salvar Motorista
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
