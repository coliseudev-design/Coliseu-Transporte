import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import {
  Building2, ShieldCheck, KeyRound, Save,
  CheckCircle2, MapPin, FileText, Wifi, Loader2, AlertTriangle,
  Zap, Webhook, ChevronDown, ChevronUp, Lock, RefreshCw, Search,
  Upload, Trash2, Image as ImageIcon, Truck, Package
} from 'lucide-react';

interface EmitenteForm {
  id?: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  regime_tributario: string;
  rntrc: string;
  perfil_operacional: 'CARGA_PROPRIA' | 'TRANSPORTADORA' | 'HIBRIDO';
  mdfe_tipo_emitente_padrao: '1' | '2';
  focus_token: string;
  focus_token_homologacao: string;
  focus_token_producao: string;
  focus_ambiente: 'homologacao' | 'producao';
  uf: string;
  municipio: string;
  codigo_municipio: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  telefone: string;
  email: string;
  serie_cte: string;
  serie_mdfe: string;
  cfop_padrao_cte: string;
  natureza_padrao_cte: string;
  aliquota_icms_padrao: string;
  ciot_provedor: 'HOMOLOGACAO_LOCAL' | 'MANUAL' | 'EFRETE' | 'PAMCARD' | 'TARGET' | 'ANTT_A1';
  ciot_ambiente: 'homologacao' | 'producao';
  ciot_cnpj_ipef: string;
  ciot_usuario: string;
  ciot_integrador_token: string;
  ciot_senha: string;
}

function validarCnpj14(valor: string): boolean {
  const c = String(valor || '').replace(/\D/g, '');
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 12) + String(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(c[12]) === d1 && Number(c[13]) === d2;
}

function formatarCnpjMask(valor: string): string {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

async function converterLogoParaPngFiscal(file: File): Promise<{
  dataUri: string;
  width: number;
  height: number;
  kb: number;
}> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O arquivo selecionado ultrapassa 10 MB. Escolha uma imagem menor.');
  }

  const fileDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Formato de imagem inválido. Selecione PNG, JPG ou WEBP.'));
    el.src = fileDataUrl;
  });

  const maxDim = 200; // Padrão recomendado pela Focus NFe (PNG até 200x200px) para DACTE/DANFE
  const natW = img.naturalWidth || img.width || 200;
  const natH = img.naturalHeight || img.height || 200;
  const scale = natW > maxDim || natH > maxDim ? Math.min(maxDim / natW, maxDim / natH) : 1;
  const targetW = Math.max(1, Math.round(natW * scale));
  const targetH = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível inicializar o processador gráfico do navegador.');
  }

  // Achata transparência sobre fundo branco puro (evita fundo preto em motores PDF de DACTE/DANFE)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const dataUri = canvas.toDataURL('image/png');
  const rawLen = dataUri.split(',')[1]?.length || 0;
  const kb = Math.max(1, Math.round((rawLen * 0.75) / 1024));
  return { dataUri, width: targetW, height: targetH, kb };
}

export default function DadosEmpresaPage() {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [testingAmb, setTestingAmb] = useState<'homologacao' | 'producao' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [manualTokensOpen, setManualTokensOpen] = useState(false);
  const [provisionando, setProvisionando] = useState(false);
  const [registrandoHooks, setRegistrandoHooks] = useState(false);
  const [trocandoAmb, setTrocandoAmb] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  // Estado da Logomarca Fiscal (DACTE / DAMDFE / DANFE)
  const [logoPreviewUri, setLogoPreviewUri] = useState<string | null>(null);
  const [logoPendingDataUri, setLogoPendingDataUri] = useState<string | null>(null);
  const [logoMetaInfo, setLogoMetaInfo] = useState<string | null>(null);
  const [salvandoLogo, setSalvandoLogo] = useState(false);
  const [removendoLogo, setRemovendoLogo] = useState(false);
  const [logoFeedback, setLogoFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Estado Super Admin Master (Software House Focus NFe)
  const [masterTokenInput, setMasterTokenInput] = useState('');
  const [webhookBaseUrlInput, setWebhookBaseUrlInput] = useState('');
  const [masterFeedback, setMasterFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingMaster, setTestingMaster] = useState(false);

  const [form, setForm] = useState<EmitenteForm>({
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    regime_tributario: '3',
    rntrc: '',
    perfil_operacional: 'HIBRIDO',
    mdfe_tipo_emitente_padrao: '1',
    focus_token: '',
    focus_token_homologacao: '',
    focus_token_producao: '',
    focus_ambiente: 'homologacao',
    uf: 'MS',
    municipio: 'Dourados',
    codigo_municipio: '5003702',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    telefone: '',
    email: '',
    serie_cte: '1',
    serie_mdfe: '1',
    cfop_padrao_cte: '5353',
    natureza_padrao_cte: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    aliquota_icms_padrao: '12.00',
    ciot_provedor: 'HOMOLOGACAO_LOCAL',
    ciot_ambiente: 'homologacao',
    ciot_cnpj_ipef: '',
    ciot_usuario: '',
    ciot_integrador_token: '',
    ciot_senha: ''
  });

  const { data } = useQuery({
    queryKey: ['empresa-emitente'],
    queryFn: async () => (await api.get('/transporte/emitentes')).data
  });

  const emitentes = data?.data || [];
  const meta = data?.meta || {};
  const emAtual = emitentes[0];

  const isMasterAdmin = Boolean(
    meta?.is_super_admin_master ||
    user?.role === 'master' ||
    user?.tenant_id === '00000000-0000-0000-0000-000000000000'
  );

  const { data: masterCfgResp, refetch: refetchMasterCfg } = useQuery({
    queryKey: ['focus-master-config'],
    queryFn: async () => (await api.get('/transporte/focus/master-config')).data,
    enabled: isMasterAdmin,
    retry: false
  });
  const masterCfg = masterCfgResp?.data;

  useEffect(() => {
    if (masterCfg?.webhook_base_url && !webhookBaseUrlInput) {
      setWebhookBaseUrlInput(masterCfg.webhook_base_url);
    }
  }, [masterCfg?.webhook_base_url]);

  useEffect(() => {
    if (emAtual) {
      setForm({
        id: emAtual.id,
        cnpj: formatarCnpjMask(emAtual.cnpj || ''),
        razao_social: emAtual.razao_social || '',
        nome_fantasia: emAtual.nome_fantasia || '',
        inscricao_estadual: emAtual.inscricao_estadual || '',
        inscricao_municipal: emAtual.inscricao_municipal || '',
        regime_tributario: String(emAtual.regime_tributario || '3'),
        rntrc: emAtual.rntrc || '',
        perfil_operacional:
          emAtual.perfil_operacional === 'CARGA_PROPRIA' || emAtual.perfil_operacional === 'TRANSPORTADORA'
            ? emAtual.perfil_operacional
            : 'HIBRIDO',
        mdfe_tipo_emitente_padrao:
          emAtual.perfil_operacional === 'CARGA_PROPRIA'
            ? '2'
            : emAtual.perfil_operacional === 'TRANSPORTADORA'
            ? '1'
            : String(emAtual.mdfe_tipo_emitente_padrao || '1') === '2'
            ? '2'
            : '1',
        focus_token: '',
        focus_token_homologacao: '',
        focus_token_producao: '',
        focus_ambiente: emAtual.focus_ambiente || 'homologacao',
        uf: emAtual.uf || 'MS',
        municipio: emAtual.municipio || 'Dourados',
        codigo_municipio: emAtual.codigo_municipio || '5003702',
        logradouro: emAtual.logradouro || '',
        numero: emAtual.numero || '',
        complemento: emAtual.complemento || '',
        bairro: emAtual.bairro || '',
        cep: emAtual.cep || '',
        telefone: emAtual.telefone || '',
        email: emAtual.email || '',
        serie_cte: emAtual.serie_cte || '1',
        serie_mdfe: emAtual.serie_mdfe || '1',
        cfop_padrao_cte: emAtual.cfop_padrao_cte || '5353',
        natureza_padrao_cte: emAtual.natureza_padrao_cte || 'PRESTACAO DE SERVICO DE TRANSPORTE',
        aliquota_icms_padrao: String(emAtual.aliquota_icms_padrao ?? '12.00'),
        ciot_provedor: emAtual.ciot_provedor || 'HOMOLOGACAO_LOCAL',
        ciot_ambiente: emAtual.ciot_ambiente || emAtual.focus_ambiente || 'homologacao',
        ciot_cnpj_ipef: emAtual.ciot_cnpj_ipef || '',
        ciot_usuario: emAtual.ciot_usuario || '',
        ciot_integrador_token: '',
        ciot_senha: ''
      });
    }
    }, [
      emAtual?.id,
      emAtual?.cnpj,
      emAtual?.inscricao_estadual,
      emAtual?.rntrc,
      emAtual?.razao_social,
      emAtual?.perfil_operacional,
      emAtual?.mdfe_tipo_emitente_padrao,
      emAtual?.ciot_provedor,
      emAtual?.ciot_ambiente
    ]);

  useEffect(() => {
    if (!logoPendingDataUri) {
      setLogoPreviewUri(emAtual?.logo_data_uri || null);
    }
  }, [emAtual?.logo_data_uri, logoPendingDataUri]);

  const cnpjDigitos = String(form.cnpj || '').replace(/\D/g, '');
  const cnpjValido = validarCnpj14(cnpjDigitos);
  const softwareHouseAtiva = Boolean(meta?.software_house_disponivel || masterCfg?.tem_master_token);

  const invalidarConsultas = () => {
    qc.invalidateQueries({ queryKey: ['empresa-emitente'] });
    qc.invalidateQueries({ queryKey: ['emitentes'] });
    qc.invalidateQueries({ queryKey: ['emitentes-cargas'] });
    qc.invalidateQueries({ queryKey: ['emitentes-certificados'] });
  };

  const handleSelecionarLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    setLogoFeedback(null);
    try {
      const proc = await converterLogoParaPngFiscal(file);
      setLogoPreviewUri(proc.dataUri);
      setLogoPendingDataUri(proc.dataUri);
      setLogoMetaInfo(`PNG otimizado · ${proc.width}×${proc.height}px · ${proc.kb} KB`);
      setLogoFeedback({
        ok: true,
        msg: 'Pré-visualização pronta! Clique em "Salvar e Sincronizar Logo no DACTE/DANFE" para ativar nas próximas emissões.'
      });
    } catch (err: any) {
      setLogoFeedback({
        ok: false,
        msg: err.message || 'Erro ao processar a imagem da logomarca.'
      });
    }
  };

  const handleSalvarLogoFocus = async () => {
    const uriToSend = logoPendingDataUri || logoPreviewUri;
    if (!uriToSend) return;

    setSalvandoLogo(true);
    setLogoFeedback(null);
    setFeedbackBanner(null);

    try {
      let targetEmitenteId = form.id || emAtual?.id;
      if (!targetEmitenteId) {
        if (!cnpjValido) {
          throw new Error('Preencha um CNPJ válido de 14 dígitos antes de salvar a logomarca.');
        }
        const saveRes = await api.post('/transporte/emitentes', {
          ...form,
          cnpj: cnpjDigitos
        });
        targetEmitenteId = saveRes.data?.data?.id;
      }

      const res = await api.post(`/transporte/emitentes/${targetEmitenteId}/logo`, {
        logo_base64: uriToSend
      });

      setLogoPendingDataUri(null);
      if (res.data?.logo_data_uri) {
        setLogoPreviewUri(res.data.logo_data_uri);
      }
      invalidarConsultas();
      setLogoFeedback({
        ok: true,
        msg:
          res.data?.mensagem ||
          'Logomarca salva e sincronizada com sucesso para impressão em DACTE, DAMDFE e DANFE!'
      });
    } catch (err: any) {
      setLogoFeedback({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Falha ao salvar e sincronizar a logomarca.'
      });
    } finally {
      setSalvandoLogo(false);
    }
  };

  const handleRemoverLogo = async () => {
    setLogoFeedback(null);
    const targetEmitenteId = form.id || emAtual?.id;

    // Se era apenas pré-visualização ainda não salva, descarta localmente
    if (logoPendingDataUri && !emAtual?.tem_logo) {
      setLogoPendingDataUri(null);
      setLogoPreviewUri(null);
      setLogoMetaInfo(null);
      return;
    }

    if (!targetEmitenteId) {
      setLogoPendingDataUri(null);
      setLogoPreviewUri(null);
      return;
    }

    setRemovendoLogo(true);
    try {
      const res = await api.delete(`/transporte/emitentes/${targetEmitenteId}/logo`);
      setLogoPendingDataUri(null);
      setLogoPreviewUri(null);
      setLogoMetaInfo(null);
      invalidarConsultas();
      setLogoFeedback({
        ok: true,
        msg: res.data?.mensagem || 'Logomarca removida com sucesso.'
      });
    } catch (err: any) {
      setLogoFeedback({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao remover logomarca.'
      });
    } finally {
      setRemovendoLogo(false);
    }
  };

  const salvarMasterMutation = useMutation({
    mutationFn: async () =>
      api.post('/transporte/focus/master-config', {
        master_token: masterTokenInput.trim() || undefined,
        webhook_base_url: webhookBaseUrlInput.trim() || undefined
      }),
    onSuccess: () => {
      setMasterTokenInput('');
      refetchMasterCfg();
      invalidarConsultas();
      setMasterFeedback({
        ok: true,
        msg: 'Token Principal da Conta Parceiro Focus NFe cifrado em AES-256-GCM e salvo com sucesso!'
      });
    },
    onError: (err: any) => {
      setMasterFeedback({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao salvar Token Principal.'
      });
    }
  });

  const handleTestarMasterToken = async () => {
    setTestingMaster(true);
    setMasterFeedback(null);
    try {
      const res = await api.post('/transporte/focus/master-testar', {
        master_token: masterTokenInput.trim() || undefined
      });
      const d = res.data?.data || res.data;
      setMasterFeedback({
        ok: Boolean(d?.conectado),
        msg: d?.mensagem || 'Token Principal validado com sucesso na Focus NFe!'
      });
    } catch (err: any) {
      setMasterFeedback({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Falha ao validar Token Principal.'
      });
    } finally {
      setTestingMaster(false);
    }
  };

  const salvar = useMutation({
    mutationFn: async (payload: EmitenteForm) => {
      const saveRes = await api.post('/transporte/emitentes', {
        ...payload,
        cnpj: String(payload.cnpj || '').replace(/\D/g, ''),
        ...(logoPendingDataUri ? { logo_base64: logoPendingDataUri } : {})
      });
      const savedId = saveRes.data?.data?.id || payload.id;
      if (logoPendingDataUri && savedId && softwareHouseAtiva) {
        await api.post(`/transporte/emitentes/${savedId}/logo`, {
          logo_base64: logoPendingDataUri
        });
      }
      return saveRes;
    },
    onSuccess: () => {
      setLogoPendingDataUri(null);
      invalidarConsultas();
      setForm(prev => ({ ...prev, focus_token_homologacao: '', focus_token_producao: '' }));
      setFeedbackBanner({
        ok: true,
        msg: 'Dados fiscais da transportadora e configurações Focus NFe salvos com sucesso!'
      });
    },
    onError: (err: any) => {
      setFeedbackBanner({
        ok: false,
        msg: 'Erro ao salvar dados: ' + (err.response?.data?.error || err.message)
      });
    }
  });

  const handleAlternarAmbiente = async (novoAmb: 'homologacao' | 'producao') => {
    setForm(prev => ({ ...prev, focus_ambiente: novoAmb }));
    if (!form.id) return;
    setTrocandoAmb(true);
    setFeedbackBanner(null);
    try {
      const res = await api.patch(`/transporte/emitentes/${form.id}/ambiente`, { ambiente: novoAmb });
      invalidarConsultas();
      setFeedbackBanner({
        ok: true,
        msg: res.data?.mensagem || `Ambiente alterado para ${novoAmb.toUpperCase()}.`
      });
    } catch (err: any) {
      setFeedbackBanner({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Falha ao alternar ambiente.'
      });
    } finally {
      setTrocandoAmb(false);
    }
  };

  const handleProvisionarAutomatico = async () => {
    setFeedbackBanner(null);
    setTestResult(null);

    if (!cnpjValido) {
      setFeedbackBanner({
        ok: false,
        msg: 'Informe um CNPJ real de 14 dígitos (ex: 00.000.000/0001-00) antes de provisionar a empresa na Focus NFe.'
      });
      return;
    }

    setProvisionando(true);
    try {
      // 1. Persiste os dados fiscais atuais primeiro (incluindo logo pendente, se houver)
      const saveRes = await api.post('/transporte/emitentes', {
        ...form,
        cnpj: cnpjDigitos,
        ...(logoPendingDataUri ? { logo_base64: logoPendingDataUri } : {})
      });
      const savedEmitenteId = saveRes.data?.data?.id || form.id;

      // 2. Provisiona / sincroniza na conta Focus NFe (/v2/empresas + logo + certificado A1 + /v2/hooks)
      const provRes = await api.post('/transporte/emitentes/provisionar-focus', {
        emitente_id: savedEmitenteId,
        registrar_webhooks: true,
        incluir_certificado: true
      });
      setLogoPendingDataUri(null);
      invalidarConsultas();
      setFeedbackBanner({
        ok: true,
        msg: provRes.data?.mensagem || 'Transportadora provisionada e tokens Focus NFe sincronizados com sucesso!'
      });
    } catch (err: any) {
      setFeedbackBanner({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Falha ao provisionar empresa na Focus NFe.'
      });
    } finally {
      setProvisionando(false);
    }
  };

  const handleRegistrarWebhooks = async () => {
    if (!form.id) return;
    setRegistrandoHooks(true);
    setFeedbackBanner(null);
    try {
      const res = await api.post(`/transporte/emitentes/${form.id}/webhooks-focus`);
      invalidarConsultas();
      setFeedbackBanner({
        ok: true,
        msg: `Webhooks de CT-e e MDF-e registrados/validados com sucesso (${res.data?.registrados || 0} gatilho(s) ativo(s))!`
      });
    } catch (err: any) {
      setFeedbackBanner({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao registrar webhooks na Focus NFe.'
      });
    } finally {
      setRegistrandoHooks(false);
    }
  };

  const handleTestarFocus = async (ambiente: 'homologacao' | 'producao') => {
    setTestingAmb(ambiente);
    setTestResult(null);
    try {
      const tokenDigitado = ambiente === 'producao' ? form.focus_token_producao : form.focus_token_homologacao;
      const res = await api.post('/transporte/focus/testar', {
        emitente_id: form.id,
        ambiente,
        token: tokenDigitado || undefined
      });
      const d = res.data?.data || res.data;
      setTestResult({
        ok: Boolean(d?.conectado),
        msg: d?.mensagem || (d?.conectado ? `Conexão Focus NFe (${ambiente}) validada!` : 'Falha na autenticação Focus NFe')
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        msg: err.response?.data?.error || err.message || 'Erro ao testar conexão Focus NFe'
      });
    } finally {
      setTestingAmb(null);
    }
  };

  const handleBuscarCep = async (cepValor?: string) => {
    const limpo = String(cepValor ?? form.cep ?? '').replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const json = await resp.json();
      if (json && !json.erro) {
        setForm(prev => ({
          ...prev,
          cep: limpo,
          logradouro: json.logradouro || prev.logradouro,
          bairro: json.bairro || prev.bairro,
          municipio: json.localidade || prev.municipio,
          uf: (json.uf || prev.uf).toUpperCase(),
          codigo_municipio: json.ibge || prev.codigo_municipio
        }));
      }
    } catch {
      // silencioso caso offline
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleBuscarCnpj = async (cnpjValor?: string) => {
    const limpo = String(cnpjValor ?? form.cnpj ?? '').replace(/\D/g, '');
    if (!validarCnpj14(limpo)) {
      setFeedbackBanner({
        ok: false,
        msg: 'Digite um CNPJ válido de 14 dígitos para buscar os dados automaticamente.'
      });
      return;
    }
    setBuscandoCnpj(true);
    setFeedbackBanner(null);
    try {
      const res = await api.get(`/transporte/emitentes/consultar-cnpj/${limpo}`);
      const d = res.data?.data;
      if (d) {
        setForm(prev => ({
          ...prev,
          cnpj: formatarCnpjMask(d.cnpj || limpo),
          razao_social: d.razao_social || prev.razao_social,
          nome_fantasia: d.nome_fantasia || prev.nome_fantasia,
          inscricao_estadual: d.inscricao_estadual || prev.inscricao_estadual,
          rntrc: d.rntrc || prev.rntrc,
          regime_tributario: String(d.regime_tributario || prev.regime_tributario || '3'),
          cep: d.cep || prev.cep,
          logradouro: d.logradouro || prev.logradouro,
          numero: d.numero || prev.numero,
          complemento: d.complemento || prev.complemento,
          bairro: d.bairro || prev.bairro,
          uf: (d.uf || prev.uf).toUpperCase(),
          municipio: d.municipio || prev.municipio,
          codigo_municipio: d.codigo_municipio || prev.codigo_municipio,
          telefone: d.telefone || prev.telefone,
          email: d.email || prev.email
        }));
        setFeedbackBanner({
          ok: true,
          msg: `Dados oficiais de "${d.razao_social}" carregados automaticamente! Confira e clique em Provisionar Automaticamente na Focus NFe.`
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        ok: false,
        msg: err.response?.data?.error || 'Não foi possível consultar o CNPJ automaticamente.'
      });
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackBanner(null);
    if (!cnpjValido) {
      setFeedbackBanner({
        ok: false,
        msg: 'O CNPJ informado é inválido. Digite os 14 dígitos reais do CNPJ da transportadora.'
      });
      return;
    }
    salvar.mutate(form);
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Building2 className="w-7 h-7 text-brand-600 dark:text-brand-500" />
            Dados da Empresa (Emitente Fiscal CT-e / MDF-e)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Provisionamento automático na Focus NFe v2, Certificado A1, Webhooks SEFAZ e parâmetros fiscais.
          </p>
        </div>
        <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider self-start sm:self-auto ${
          form.focus_ambiente === 'producao'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        }`}>
          Ambiente Ativo: {form.focus_ambiente === 'producao' ? 'Produção (SEFAZ Real)' : 'Homologação (Testes)'}
        </span>
      </div>

      {/* Painel Exclusivo Super Admin Master — Conta Software House Focus NFe (Coliseu Sistemas) */}
      {isMasterAdmin && (
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-700/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-1.5">
                <Lock className="w-3 h-3" />
                Exclusivo Super Admin Master · Cofre AES-256-GCM
              </span>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Conta Parceiro Focus NFe — Software House (Coliseu Sistemas)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Informe o <strong>Token principal produção</strong> do Painel API da Focus NFe (<code>/v2/empresas</code>) para criar empresas, enviar certificados A1 e gerar tokens automaticamente.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`px-3 py-1 rounded-xl text-xs font-bold ${
                masterCfg?.tem_master_token
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {masterCfg?.tem_master_token
                  ? `Ativo (${masterCfg.master_token_preview} · ${masterCfg.origem === 'cofre_db' ? 'Cofre DB' : 'ENV'})`
                  : 'Token Principal Pendente'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
            <div className="md:col-span-6">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Token Principal Produção (Revenda / Software House Focus NFe)
              </label>
              <input
                type="password"
                placeholder={
                  masterCfg?.tem_master_token
                    ? `Salvo no cofre (${masterCfg.master_token_preview}) — cole novo token p/ substituir`
                    : 'Cole o Token principal produção do Painel API Focus NFe...'
                }
                value={masterTokenInput}
                onChange={e => setMasterTokenInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-6">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                URL Pública da Plataforma (Destino automático dos Webhooks SEFAZ)
              </label>
              <input
                type="url"
                placeholder="https://transporte.coliseusistemas.com.br"
                value={webhookBaseUrlInput}
                onChange={e => setWebhookBaseUrlInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-slate-400 font-mono truncate">
              Webhook: {masterCfg?.webhook_endpoint || 'https://transporte.coliseusistemas.com.br/api/webhooks/focus'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestarMasterToken}
                disabled={testingMaster || (!masterCfg?.tem_master_token && !masterTokenInput.trim())}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {testingMaster ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-teal-400" />}
                Testar Token Principal
              </button>

              <button
                type="button"
                onClick={() => salvarMasterMutation.mutate()}
                disabled={salvarMasterMutation.isPending || (!masterTokenInput.trim() && !webhookBaseUrlInput.trim())}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                {salvarMasterMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Salvar no Cofre Master
              </button>
            </div>
          </div>

          {masterFeedback && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
              masterFeedback.ok
                ? 'bg-emerald-950/70 text-emerald-200 border border-emerald-700/60'
                : 'bg-red-950/70 text-red-200 border border-red-700/60'
            }`}>
              {masterFeedback.ok
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
              <span>{masterFeedback.msg}</span>
            </div>
          )}
        </div>
      )}

      {/* Formulário Principal da Transportadora */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 space-y-7 text-sm">
        {feedbackBanner && (
          <div className={`flex items-start gap-2.5 p-4 rounded-2xl text-xs font-medium ${
            feedbackBanner.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/60'
          }`}>
            {feedbackBanner.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
            <span>{feedbackBanner.msg}</span>
          </div>
        )}

        {/* 1. Provisionamento Automático, Ambiente e Credenciais Focus NFe v2 */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-brand-600" />
                Credenciais e Provisionamento Focus NFe v2 (CT-e / CT-e OS / MDF-e / MDe)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {emAtual?.focus_empresa_id
                  ? `Vinculada na Focus NFe (Empresa ID #${emAtual.focus_empresa_id}) · Última sinc.: ${emAtual.focus_sincronizado_em ? new Date(emAtual.focus_sincronizado_em).toLocaleString('pt-BR') : '—'}`
                  : 'Preencha o CNPJ real, IE e endereço fiscal abaixo e clique em Provisionar Automaticamente.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`px-2.5 py-1 rounded-lg font-semibold ${
                emAtual?.tem_token_homologacao
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                Homologação: {emAtual?.tem_token_homologacao ? `Ativo (${emAtual.token_homologacao_preview})` : 'Pendente'}
              </span>
              <span className={`px-2.5 py-1 rounded-lg font-semibold ${
                emAtual?.tem_token_producao
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                Produção: {emAtual?.tem_token_producao ? `Ativo (${emAtual.token_producao_preview})` : 'Pendente'}
              </span>
              <span className={`px-2.5 py-1 rounded-lg font-semibold ${
                emAtual?.focus_hooks_ativos
                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                Webhooks: {emAtual?.focus_hooks_ativos ? 'Ativos' : 'Pendentes'}
              </span>
            </div>
          </div>

          {/* Chave Seletora Rápida de Ambiente (Homologação <-> Produção) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={trocandoAmb}
              onClick={() => handleAlternarAmbiente('homologacao')}
              className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                form.focus_ambiente === 'homologacao'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-300'
              }`}
            >
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Homologação (Testes SEFAZ)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Emissões sem valor fiscal para validação de CT-e e MDF-e
                </p>
              </div>
              {form.focus_ambiente === 'homologacao' && (
                <CheckCircle2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              disabled={trocandoAmb}
              onClick={() => handleAlternarAmbiente('producao')}
              className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                form.focus_ambiente === 'producao'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-600 ring-2 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
              }`}
            >
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Produção (Validade Jurídica SEFAZ)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Autorização oficial com valor fiscal e protocolo SEFAZ
                </p>
              </div>
              {form.focus_ambiente === 'producao' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
            </button>
          </div>

          {/* Barra de Ações Automáticas via Conta Parceiro Focus NFe */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleProvisionarAutomatico}
                disabled={provisionando || !softwareHouseAtiva}
                title={
                  softwareHouseAtiva
                    ? 'Salva os dados fiscais, cadastra/atualiza a empresa na Focus NFe, envia o Certificado A1 e configura os Webhooks'
                    : 'Aguardando configuração do Token Principal pelo Super Admin Master'
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 transition-all"
              >
                {provisionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {provisionando
                  ? 'Sincronizando com Focus NFe...'
                  : emAtual?.focus_empresa_id
                  ? 'Sincronizar Dados, Certificado e Tokens na Focus NFe'
                  : 'Provisionar Automaticamente na Focus NFe'}
              </button>

              {(emAtual?.tem_token_homologacao || emAtual?.tem_token_producao) && form.id && (
                <button
                  type="button"
                  onClick={handleRegistrarWebhooks}
                  disabled={registrandoHooks}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {registrandoHooks ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Webhook className="w-3.5 h-3.5 text-sky-600" />}
                  Registrar Webhooks SEFAZ
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setManualTokensOpen(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              {manualTokensOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Informar ou testar tokens manualmente
            </button>
          </div>

          {!softwareHouseAtiva && !emAtual?.tem_token_homologacao && !emAtual?.tem_token_producao && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3 py-2">
              O Token Principal da Software House ainda não está configurado. Peça ao administrador Master para configurar acima ou informe os tokens manualmente.
            </p>
          )}

          {emAtual?.focus_ultimo_erro && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Último aviso Focus NFe: {emAtual.focus_ultimo_erro}</span>
            </div>
          )}

          {/* Painel Colapsável para Tokens Manuais e Teste Individual */}
          {manualTokensOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200/70 dark:border-slate-800">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                  Token Focus NFe — Homologação (Opcional se provisionado)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={emAtual?.tem_token_homologacao ? `Salvo (${emAtual.token_homologacao_preview}) — digite p/ alterar` : 'Cole o token de Homologação'}
                    value={form.focus_token_homologacao}
                    onChange={e => setForm({ ...form, focus_token_homologacao: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestarFocus('homologacao')}
                    disabled={testingAmb !== null}
                    title="Testar conexão em Homologação"
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {testingAmb === 'homologacao' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                    Testar
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                  Token Focus NFe — Produção (Opcional se provisionado)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={emAtual?.tem_token_producao ? `Salvo (${emAtual.token_producao_preview}) — digite p/ alterar` : 'Cole o token de Produção'}
                    value={form.focus_token_producao}
                    onChange={e => setForm({ ...form, focus_token_producao: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestarFocus('producao')}
                    disabled={testingAmb !== null}
                    title="Testar conexão em Produção"
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {testingAmb === 'producao' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                    Testar
                  </button>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
              testResult.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/50'
                : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/50'
            }`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{testResult.msg}</span>
            </div>
          )}
        </div>

        {/* 1.5 Perfil Operacional de Transporte (Define MDF-e sem CT-e vs Transportadora) */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-600" />
                Perfil Operacional de Transporte (Configuração de MDF-e sem CT-e vs Com CT-e)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Define como o sistema pré-configura o MDF-e e quais campos da ANTT/SEFAZ são exigidos por padrão.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              Padrão MDF-e: {form.mdfe_tipo_emitente_padrao === '2' ? 'tpEmit=2 (Sem CT-e · NF-e do ERP)' : 'tpEmit=1 (Com CT-e)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  perfil_operacional: 'CARGA_PROPRIA',
                  mdfe_tipo_emitente_padrao: '2'
                })
              }
              className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                form.perfil_operacional === 'CARGA_PROPRIA'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/25'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Carga Própria (MDF-e sem CT-e)
                  </span>
                </div>
                {form.perfil_operacional === 'CARGA_PROPRIA' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Distribuidoras, atacadistas, indústrias e varejo que entregam suas próprias NF-es do ERP.{' '}
                <strong>Dispensa CT-e, RNTRC e CIOT</strong> em frota própria.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  perfil_operacional: 'TRANSPORTADORA',
                  mdfe_tipo_emitente_padrao: '1'
                })
              }
              className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                form.perfil_operacional === 'TRANSPORTADORA'
                  ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/25'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-sky-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Transportadora (CT-e + MDF-e)
                  </span>
                </div>
                {form.perfil_operacional === 'TRANSPORTADORA' && (
                  <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Prestadores de serviço de transporte (ETC) que cobram frete de terceiros, emitem CT-e (mod. 57) e vinculam os CT-es no MDF-e.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  perfil_operacional: 'HIBRIDO'
                })
              }
              className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                form.perfil_operacional === 'HIBRIDO'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/25'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Operação Híbrida (Ambos)
                  </span>
                </div>
                {form.perfil_operacional === 'HIBRIDO' && (
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Opera tanto Carga Própria (NF-e direta sem CT-e) quanto Transporte remunerado com CT-e, alternando livremente no MDF-e.
              </p>
            </button>
          </div>

          {form.perfil_operacional === 'HIBRIDO' && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Modalidade inicial ao abrir <strong>Emitir MDF-e</strong>:
              </span>
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, mdfe_tipo_emitente_padrao: '2' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    form.mdfe_tipo_emitente_padrao === '2'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  2 — Sem CT-e (NF-es do ERP)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, mdfe_tipo_emitente_padrao: '1' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    form.mdfe_tipo_emitente_padrao === '1'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  1 — Com CT-e (Transportadora)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Identificação da Transportadora */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              CNPJ da Empresa *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="00.000.000/0001-00"
                value={form.cnpj}
                onChange={e => setForm({ ...form, cnpj: formatarCnpjMask(e.target.value) })}
                className={`flex-1 min-w-0 px-3.5 py-2.5 bg-white dark:bg-slate-900 border rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500 ${
                  cnpjDigitos.length > 0 && !cnpjValido
                    ? 'border-red-400 dark:border-red-600'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              <button
                type="button"
                onClick={() => handleBuscarCnpj()}
                disabled={buscandoCnpj || !cnpjValido}
                title="Consultar dados cadastrais, IE e endereço pelo CNPJ"
                aria-label="Consultar dados pelo CNPJ"
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              >
                {buscandoCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {cnpjDigitos.length > 0 && !cnpjValido && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                CNPJ inválido ({cnpjDigitos.length}/14 dígitos). Informe o CNPJ real da transportadora.
              </p>
            )}
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              Inscrição Estadual (IE) *
            </label>
            <input
              type="text"
              required
              placeholder="Inscrição Estadual SEFAZ ou ISENTO"
              value={form.inscricao_estadual}
              onChange={e => setForm({ ...form, inscricao_estadual: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              {form.perfil_operacional === 'CARGA_PROPRIA'
                ? 'RNTRC (ANTT) — Opcional p/ Carga Própria'
                : 'RNTRC (ANTT) *'}
            </label>
            <input
              type="text"
              required={form.perfil_operacional !== 'CARGA_PROPRIA'}
              placeholder={
                form.perfil_operacional === 'CARGA_PROPRIA'
                  ? 'Dispensado em frota própria (ou 8 dígitos)'
                  : '8 dígitos (ex: 12345678)'
              }
              value={form.rntrc}
              onChange={e => setForm({ ...form, rntrc: e.target.value.replace(/\D/g, '').slice(0, 14) })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              Razão Social Completa *
            </label>
            <input
              type="text"
              required
              placeholder="Nome empresarial registrado na Receita Federal"
              value={form.razao_social}
              onChange={e => setForm({ ...form, razao_social: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
              Nome Fantasia
            </label>
            <input
              type="text"
              placeholder="Nome comercial"
              value={form.nome_fantasia}
              onChange={e => setForm({ ...form, nome_fantasia: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* 2.1 Logomarca Fiscal da Empresa (Impressão Oficial em DACTE / DAMDFE / DANFE) */}
        <div className="pt-5 border-t border-slate-100 dark:border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-brand-600" />
                Logomarca da Empresa — Impressão no DACTE (CT-e), DAMDFE (MDF-e) e DANFE
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enviada automaticamente à Focus NFe (<code>arquivo_logo_base64</code> · PNG otimizado até 200×200px) para sair impressa no quadro <strong>IDENTIFICAÇÃO DO EMITENTE</strong>.
              </p>
            </div>

            <div>
              {logoPendingDataUri ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Nova logo selecionada · Clique p/ sincronizar
                </span>
              ) : emAtual?.tem_logo && emAtual?.logo_focus_sincronizada ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ativa no DACTE / DANFE (Focus NFe)
                </span>
              ) : emAtual?.tem_logo ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                  Salva localmente · Pendente sinc. Focus
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Sem logomarca cadastrada
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Pré-visualização Fiel do Quadro IDENTIFICAÇÃO DO EMITENTE (Padrão SEFAZ DACTE / DANFE) */}
            <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border-2 border-slate-900 bg-white text-slate-900 p-3.5 shadow-sm">
              <div className="flex items-center gap-3.5 min-h-[116px]">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  title="Clique para selecionar a logomarca da empresa"
                  className="w-28 h-28 shrink-0 rounded-lg border border-dashed border-slate-300 hover:border-brand-500 bg-white flex flex-col items-center justify-center overflow-hidden transition-colors cursor-pointer group"
                >
                  {logoPreviewUri ? (
                    <img
                      src={logoPreviewUri}
                      alt="Logomarca da Empresa no DACTE/DANFE"
                      className="max-w-full max-h-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-center px-2 text-slate-400 group-hover:text-brand-600">
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-semibold leading-tight">
                        Clique p/ enviar Logo
                      </span>
                    </div>
                  )}
                </button>

                <div className="flex-1 min-w-0 text-center px-1">
                  <p className="text-[10px] font-bold tracking-wider uppercase text-slate-600">
                    IDENTIFICAÇÃO DO EMITENTE
                  </p>
                  <p className="text-xs sm:text-sm font-bold uppercase text-slate-950 leading-snug mt-0.5 truncate">
                    {form.razao_social || 'RAZÃO SOCIAL DA TRANSPORTADORA'}
                  </p>
                  <p className="text-[11px] font-mono font-semibold text-slate-800 mt-1">
                    {form.cnpj || '00.000.000/0001-00'}
                    {form.inscricao_estadual ? ` / ${form.inscricao_estadual}` : ''}
                  </p>
                  <p className="text-[10px] uppercase text-slate-700 mt-1 leading-tight line-clamp-2">
                    {[form.logradouro, form.numero].filter(Boolean).join(', ') || 'ENDEREÇO FISCAL'}
                    {form.bairro ? ` - ${form.bairro}` : ''}
                  </p>
                  <p className="text-[10px] text-slate-700 leading-tight mt-0.5">
                    {form.municipio || 'Dourados'} - {form.uf || 'MS'}
                    {form.cep ? ` - CEP: ${form.cep}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                <span>Simulação em escala do cabeçalho oficial do DACTE / DANFE</span>
                {logoMetaInfo && <span className="font-mono font-semibold text-slate-600">{logoMetaInfo}</span>}
              </div>
            </div>

            {/* Controles de Upload, Sincronização Focus NFe e Remoção */}
            <div className="lg:col-span-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/80 p-4 flex flex-col justify-between gap-3">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleSelecionarLogo}
                className="hidden"
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Formatos aceitos: PNG, JPG ou WEBP
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  O sistema redimensiona e converte automaticamente para <strong>PNG de até 200×200 pixels</strong> sobre fundo branco (padrão exigido pela SEFAZ / Focus NFe). Após sincronizar, a logomarca sai impressa tanto nos <strong>novos CT-es, MDF-es e NF-es</strong> quanto ao visualizar/baixar o DACTE de documentos já autorizados.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={salvandoLogo || removendoLogo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-brand-600" />
                  {logoPreviewUri ? 'Trocar Imagem' : 'Selecionar Logo'}
                </button>

                {(logoPendingDataUri || (logoPreviewUri && !emAtual?.logo_focus_sincronizada)) && (
                  <button
                    type="button"
                    onClick={handleSalvarLogoFocus}
                    disabled={salvandoLogo || removendoLogo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {salvandoLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {salvandoLogo ? 'Sincronizando...' : 'Salvar e Sincronizar no DACTE'}
                  </button>
                )}

                {logoPreviewUri && (
                  <button
                    type="button"
                    onClick={handleRemoverLogo}
                    disabled={salvandoLogo || removendoLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/70 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {removendoLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Remover
                  </button>
                )}
              </div>

              {logoFeedback && (
                <div className={`flex items-start gap-2 p-2.5 rounded-xl text-[11px] font-medium ${
                  logoFeedback.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/60'
                }`}>
                  {logoFeedback.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />}
                  <span>{logoFeedback.msg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Endereço Fiscal do Emitente (Obrigatório no XML do CT-e e MDF-e) */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Endereço e Localização Fiscal do Emitente (Obrigatório para CT-e e MDF-e)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                CEP *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  placeholder="79800-000"
                  value={form.cep}
                  onChange={e => setForm({ ...form, cep: e.target.value })}
                  onBlur={e => handleBuscarCep(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleBuscarCep(form.cep)}
                  disabled={buscandoCep}
                  title="Preencher endereço e código IBGE pelo CEP"
                  className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                >
                  {buscandoCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Logradouro (Rua / Av.) *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Av. Marcelino Pires"
                value={form.logradouro}
                onChange={e => setForm({ ...form, logradouro: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Número *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 1500 ou S/N"
                value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Bairro *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Centro"
                value={form.bairro}
                onChange={e => setForm({ ...form, bairro: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Município *
              </label>
              <input
                type="text"
                required
                value={form.municipio}
                onChange={e => setForm({ ...form, municipio: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                UF *
              </label>
              <input
                type="text"
                required
                maxLength={2}
                value={form.uf}
                onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white uppercase"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Código IBGE (7 dígitos) *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 5003702"
                value={form.codigo_municipio}
                onChange={e => setForm({ ...form, codigo_municipio: e.target.value.replace(/\D/g, '') })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Complemento
              </label>
              <input
                type="text"
                placeholder="Sala, Galpão..."
                value={form.complemento}
                onChange={e => setForm({ ...form, complemento: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Telefone Fiscal
              </label>
              <input
                type="text"
                placeholder="(67) 3411-0000"
                value={form.telefone}
                onChange={e => setForm({ ...form, telefone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Inscrição Municipal (CT-e OS)
              </label>
              <input
                type="text"
                placeholder="Opcional"
                value={form.inscricao_municipal}
                onChange={e => setForm({ ...form, inscricao_municipal: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                E-mail Fiscal (notificações XML/DACTE)
              </label>
              <input
                type="email"
                placeholder="fiscal@transportadora.com.br"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* 4. Parâmetros Fiscais Padrão */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Parâmetros Fiscais Padrão (Regime Tributário, Séries e ICMS)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Regime Tributário (CRT) *
              </label>
              <select
                value={form.regime_tributario}
                onChange={e => setForm({ ...form, regime_tributario: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="1">1 — Simples Nacional</option>
                <option value="2">2 — Simples Nacional (Excesso Sublimite)</option>
                <option value="3">3 — Regime Normal (Lucro Presumido / Real)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Série Padrão CT-e
              </label>
              <input
                type="text"
                value={form.serie_cte}
                onChange={e => setForm({ ...form, serie_cte: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Série Padrão MDF-e
              </label>
              <input
                type="text"
                value={form.serie_mdfe}
                onChange={e => setForm({ ...form, serie_mdfe: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                CFOP Padrão CT-e
              </label>
              <input
                type="text"
                value={form.cfop_padrao_cte}
                onChange={e => setForm({ ...form, cfop_padrao_cte: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Alíquota ICMS Padrão (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.aliquota_icms_padrao}
                onChange={e => setForm({ ...form, aliquota_icms_padrao: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Natureza da Operação Padrão
              </label>
              <input
                type="text"
                value={form.natureza_padrao_cte}
                onChange={e => setForm({ ...form, natureza_padrao_cte: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* 5. Integração CIOT / IPEF (ANTT) */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Integração CIOT / Instituição de Pagamento de Frete (ANTT)
            </h3>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold">
              {form.ciot_provedor === 'HOMOLOGACAO_LOCAL'
                ? 'Simulador Homologação ANTT Ativo'
                : form.ciot_provedor === 'MANUAL'
                ? 'Registro Manual 12+4 Dígitos'
                : `Conector IPEF: ${form.ciot_provedor}`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Modo / Operadora de CIOT (IPEF)
              </label>
              <select
                value={form.ciot_provedor}
                onChange={e =>
                  setForm({
                    ...form,
                    ciot_provedor: e.target.value as EmitenteForm['ciot_provedor']
                  })
                }
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-medium"
              >
                <option value="HOMOLOGACAO_LOCAL">Simulador Homologação ANTT (Gera 12+4 dígitos p/ testes)</option>
                <option value="MANUAL">Registro Manual Blindado (Código obtido no portal IPEF/Cartão)</option>
                <option value="EFRETE">API e-Frete PEO (Automático via WebService)</option>
                <option value="PAMCARD">API Pamcard / Roadcard</option>
                <option value="TARGET">API Target Bank / Meio de Pagamento</option>
                <option value="ANTT_A1">WebService ANTT Direto (Certificado A1 — Gratuito)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                Ambiente CIOT / IPEF
              </label>
              <select
                value={form.ciot_ambiente}
                onChange={e =>
                  setForm({
                    ...form,
                    ciot_ambiente: e.target.value as 'homologacao' | 'producao'
                  })
                }
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-medium"
              >
                <option value="homologacao">Homologação / Sandbox (Testes sem valor fiscal)</option>
                <option value="producao">Produção (Validade oficial ANTT / IPEF)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                CNPJ da Instituição IPEF (Opcional p/ MDF-e)
              </label>
              <input
                type="text"
                placeholder="Ex: 13670685000115 (e-Frete)"
                value={form.ciot_cnpj_ipef}
                onChange={e => setForm({ ...form, ciot_cnpj_ipef: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
              />
            </div>

            {(form.ciot_provedor === 'EFRETE' ||
              form.ciot_provedor === 'PAMCARD' ||
              form.ciot_provedor === 'TARGET' ||
              form.ciot_provedor === 'ANTT_A1') && (
              <>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    Token do Integrador / Chave API IPEF
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      emAtual?.tem_ciot_token
                        ? '•••••••• (Token salvo cifrado — preencha p/ alterar)'
                        : 'Cole o Token da Integradora IPEF'
                    }
                    value={form.ciot_integrador_token}
                    onChange={e => setForm({ ...form, ciot_integrador_token: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    Usuário IPEF
                  </label>
                  <input
                    type="text"
                    placeholder="Login na operadora de frete"
                    value={form.ciot_usuario}
                    onChange={e => setForm({ ...form, ciot_usuario: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                    Senha IPEF
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      emAtual?.tem_ciot_senha
                        ? '•••••••• (Senha salva cifrada — preencha p/ alterar)'
                        : 'Senha da conta na operadora'
                    }
                    value={form.ciot_senha}
                    onChange={e => setForm({ ...form, ciot_senha: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <button
            type="submit"
            disabled={salvar.isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 shadow-sm transition-all"
          >
            {salvar.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {salvar.isPending ? 'Salvando...' : 'Salvar Dados Fiscais'}
          </button>
        </div>
      </form>
    </div>
  );
}
