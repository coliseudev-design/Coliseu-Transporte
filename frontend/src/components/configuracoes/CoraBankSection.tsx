import { useState } from 'react'
import { Building2, CheckCircle2, XCircle, RefreshCw, Key, Lock, Zap, Info, AlertTriangle } from 'lucide-react'
import api from '../../services/api'

interface CoraBankSectionProps {
  config: any
  onChange: (field: string, value: any) => void
}

export default function CoraBankSection({ config, onChange }: CoraBankSectionProps) {
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookResult, setWebhookResult] = useState<string | null>(null)

  const handleTest = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await api.post('/cora/test-connection', {
        cora_cert_pem: config.cora_cert_pem,
        cora_private_key: config.cora_private_key,
        cora_client_id: config.cora_client_id
      })
      setTestResult({ success: true, message: res.data.message, data: res.data.data })
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.error || err.message })
    } finally {
      setTestLoading(false)
    }
  }

  const handleRegistrarWebhook = async () => {
    setWebhookLoading(true)
    setWebhookResult(null)
    try {
      await api.post('/cora/registrar-webhook', {
        webhook_url: config.cora_webhook_url,
        cora_cert_pem: config.cora_cert_pem,
        cora_private_key: config.cora_private_key,
        cora_client_id: config.cora_client_id
      })
      setWebhookResult('Webhook registrado com sucesso no Banco Cora!')
    } catch (err: any) {
      setWebhookResult('Erro: ' + (err.response?.data?.error || err.message))
    } finally {
      setWebhookLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header informativo */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <Building2 size={20} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-800">Banco Cora — Conta Empresarial</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Coliseu Tecnologia e Consultoria Ltda · Agência <strong>0001</strong> · Conta <strong>7264541-2</strong>
          </p>
          <p className="text-[11px] text-blue-500 mt-1">
            Modalidade: Integração Direta via API mTLS (Client Credentials)
          </p>
        </div>
      </div>

      {/* Ativação */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">Habilitar integração com Banco Cora</p>
          <p className="text-xs text-slate-500 mt-0.5">Permite emissão de boletos, PIX, extrato e webhooks via Banco Cora</p>
        </div>
        <button
          type="button"
          onClick={() => onChange('cora_ativo', !config.cora_ativo)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer ${config.cora_ativo ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${config.cora_ativo ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Credenciais */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Key size={14} className="text-slate-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Credenciais de Acesso (Produção)</span>
        </div>
        <div className="p-4 space-y-4">

          {/* Client ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Client ID <span className="text-slate-400 font-normal">(pré-configurado)</span>
            </label>
            <input
              type="text"
              value={config.cora_client_id || 'int-6niGnUQSRUDauHBRYg0xCP'}
              onChange={(e) => onChange('cora_client_id', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Upload rápido de arquivos */}
          <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
            <div className="text-xs text-blue-900">
              <span className="font-bold block">Carregar Certificados dos Arquivos</span>
              <span className="text-[11px] text-blue-700">Selecione o <strong>certificate.pem</strong> ou a <strong>private-key.key</strong> diretamente do seu computador</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs">
                Upload .pem
                <input
                  type="file"
                  accept=".pem,.crt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        onChange('cora_cert_pem', content);
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
              </label>
              <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs">
                Upload .key
                <input
                  type="file"
                  accept=".key"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        onChange('cora_private_key', content);
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Certificado mTLS */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Certificado TLS <span className="text-rose-500">*</span>
                <span className="text-slate-400 font-normal ml-1">(.pem — Conteúdo do certificado)</span>
              </label>
              {config.cora_cert_pem && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Certificado carregado ({config.cora_cert_pem.length} caracteres)
                </span>
              )}
            </div>
            <textarea
              rows={5}
              value={config.cora_cert_pem || ''}
              onChange={(e) => onChange('cora_cert_pem', e.target.value)}
              placeholder={"-----BEGIN CERTIFICATE-----\nMIIE...\n-----END CERTIFICATE-----"}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 focus:outline-none focus:border-blue-400 transition-colors resize-none"
            />
            <p className="text-[10.5px] text-slate-400 mt-1">
              Gerado no portal do Banco Cora em Integrações {'>'} API {'>'} Certificados
            </p>
          </div>

          {/* Chave Privada */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Chave Privada <span className="text-rose-500">*</span>
                <span className="text-slate-400 font-normal ml-1">(.key — Conteúdo da chave privada)</span>
              </label>
              {config.cora_private_key && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Chave privada carregada ({config.cora_private_key.length} caracteres)
                </span>
              )}
            </div>
            <textarea
              rows={5}
              value={config.cora_private_key || ''}
              onChange={(e) => onChange('cora_private_key', e.target.value)}
              placeholder={"-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 focus:outline-none focus:border-blue-400 transition-colors resize-none"
            />
            <p className="text-[10.5px] text-slate-400 mt-1 flex items-center gap-1">
              <Lock size={10} /> Os dados são armazenados de forma segura e criptografada no servidor.
            </p>
          </div>

        </div>
      </div>

      {/* Encargos padrão */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Zap size={14} className="text-slate-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Encargos Padrão dos Boletos Cora</span>
        </div>
        <div className="p-4 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Juros A.M. (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={config.cora_juros_padrao ?? 1}
              onChange={(e) => onChange('cora_juros_padrao', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Multa (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={config.cora_multa_padrao ?? 2}
              onChange={(e) => onChange('cora_multa_padrao', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Desconto (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={config.cora_desconto_padrao ?? 0}
              onChange={(e) => onChange('cora_desconto_padrao', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Webhook */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Info size={14} className="text-slate-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Webhook — Notificações em Tempo Real</span>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">URL do Webhook (Coliseu Transporte)</label>
            <input
              type="text"
              value={config.cora_webhook_url || 'https://transporte.coliseusistemas.com.br/api/webhooks/cora/webhook-receive'}
              onChange={(e) => onChange('cora_webhook_url', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-400"
            />
          </div>
          <button
            type="button"
            onClick={handleRegistrarWebhook}
            disabled={webhookLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {webhookLoading ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            Registrar Webhook no Banco Cora
          </button>
          {webhookResult && (
            <p className={`text-xs mt-1 flex items-center gap-1.5 ${webhookResult.startsWith('Erro') ? 'text-rose-600' : 'text-emerald-600'}`}>
              {webhookResult.startsWith('Erro') ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
              {webhookResult}
            </p>
          )}
        </div>
      </div>

      {/* Aviso sobre certificados */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700 leading-relaxed">
          <span className="font-bold block mb-0.5">Importante: Certificados mTLS</span>
          Para obter os arquivos <strong>certificate.pem</strong> e <strong>private-key.key</strong>, acesse o <strong>Portal do Banco Cora</strong> em: <em>Configurações {'>'} Integrações {'>'} API {'>'} Gerar Certificado</em>. Cole o conteúdo dos arquivos nos campos acima e salve as configurações.
        </div>
      </div>

      {/* Testar Conexão */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testLoading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {testLoading ? (
            <><RefreshCw size={14} className="animate-spin" /> Testando conexão...</>
          ) : (
            <><RefreshCw size={14} /> Testar Conexão com Banco Cora</>
          )}
        </button>

        {testResult && (
          <div className={`rounded-xl p-3.5 flex items-start gap-2.5 text-xs ${testResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
            {testResult.success ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}
            <div>
              <p className="font-semibold">{testResult.message}</p>
              {testResult.data && (
                <p className="mt-1 text-[11px] text-emerald-600">
                  Conta: <strong>{testResult.data.conta}</strong> | Agência: <strong>{testResult.data.agencia}</strong> | Titular: {testResult.data.titular}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
