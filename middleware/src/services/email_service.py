"""
email_service.py — Coliseu Transporte Email Engine (Python Reference Implementation)
Serviço de envio de e-mails em lote para cobranças e marketing.

Suporta:
  - Opção A: SMTP via smtplib com pool de threads (para Nodemailer-equivalente)
  - Opção B: API REST do Brevo (SendinBlue) — até 1000 msgs por chamada
"""

import os
import smtplib
import logging
import json
import time
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Any

try:
    import requests
except ImportError:
    requests = None

logger = logging.getLogger("coliseu.email")
logging.basicConfig(level=logging.INFO)

# ──────────────────────────────────────────────────────────────────────────────
# TEMPLATES
# ──────────────────────────────────────────────────────────────────────────────

def render_template(template_html: str, vars: dict) -> str:
    """Injeta variáveis dinâmicas no HTML do e-mail."""
    for key, value in vars.items():
        template_html = template_html.replace(f"{{{{{key}}}}}", str(value or ""))
    return template_html


def template_padrao_cobranca(nome_cliente: str, valor: str, vencimento: str,
                              link_pagamento: str = "", linha_digitavel: str = "") -> str:
    """Retorna o HTML padrão de e-mail de cobrança."""
    link_btn = f"""
    <div style="text-align:center;margin:28px 0">
      <a href="{link_pagamento}" target="_blank" style="background-color:#1e3a8a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block;box-shadow:0 4px 6px -1px rgba(30,58,138,0.2)">Visualizar Boleto / Pagar</a>
    </div>
    """ if link_pagamento else ""
    
    linha_row = f"""
    <tr>
      <td colspan="2" style="padding-top:12px;font-size:12px;color:#475569;font-weight:600;border-top:1px solid #cbd5e1;margin-top:8px">Linha Digitável:</td>
    </tr>
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#1e3a8a;font-family:monospace;word-break:break-all;font-weight:bold;background:#fff;padding:8px;border-radius:4px;border:1px dashed #cbd5e1;text-align:center;margin-top:4px">{linha_digitavel}</td>
    </tr>
    """ if linha_digitavel else ""

    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)">
      <div style="background:linear-gradient(135deg, #1e3a8a, #3b82f6);padding:32px 24px;text-align:center">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.5px">Cobrança Ref. ao Sistema Coliseu</h2>
      </div>
      <div style="padding:32px 24px;background:#fff">
        <p style="font-size:16px;color:#1e293b;margin-top:0;margin-bottom:20px;line-height:1.6">Prezado(a) Cliente, <strong style="color:#1e3a8a">{nome_cliente}</strong>,</p>
        <p style="font-size:15px;color:#334155;margin-bottom:24px;line-height:1.6">Segue em anexo o boleto referente à <strong>Manutenção do Sistema Coliseu</strong>.</p>
        
        <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin-bottom:24px;border-left:4px solid #3b82f6">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600">Valor da Fatura:</td>
              <td style="padding:6px 0;font-size:16px;color:#0f172a;font-weight:700;text-align:right">R$ {valor}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600">Data de Vencimento:</td>
              <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:700;text-align:right">{vencimento}</td>
            </tr>
            {linha_row}
          </table>
        </div>

        {link_btn}

        <div style="border-top:1px solid #e2e8f0;margin-top:32px;padding-top:24px">
          <p style="font-size:14px;color:#0f172a;font-weight:700;margin-top:0;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Qualquer dúvida entre em contato:</p>
          <p style="font-size:14px;color:#334155;margin:0 0 16px 0;line-height:1.6">
            Atenciosamente,<br>
            <strong>Departamento Financeiro</strong><br>
            <span style="color:#1e3a8a;font-weight:600">Coliseu Sistemas - Eliane Teixeira</span>
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569">
            <tr><td style="padding:4px 0">📞 <strong>Telefones:</strong> (67) 3423-2227 | (67) 3253-6236</td></tr>
            <tr><td style="padding:4px 0">💬 <strong>WhatsApp:</strong> (67) 99856-4972</td></tr>
            <tr><td style="padding:4px 0">✉️ <strong>E-mail:</strong> <a href="mailto:financeiro@coliseusistemas.com.br" style="color:#3b82f6;text-decoration:none;font-weight:600">financeiro@coliseusistemas.com.br</a></td></tr>
          </table>
        </div>
      </div>
      <div style="background-color:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:12px;color:#94a3b8">Esta é uma mensagem automática de Coliseu Sistemas. Por favor, não responda a este e-mail.</p>
      </div>
    </div>"""


# ──────────────────────────────────────────────────────────────────────────────
# OPÇÃO A: SMTP via smtplib com pool de threads
# ──────────────────────────────────────────────────────────────────────────────

class SmtpPool:
    """Gerenciador de pool de conexões SMTP para envio em massa."""

    def __init__(self, host: str, port: int, user: str, password: str, use_tls: bool = True, max_workers: int = 10):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.use_tls = use_tls
        self.max_workers = max_workers
        self._lock = threading.Lock()

    def _criar_conexao(self) -> smtplib.SMTP:
        """Cria e autentica uma nova conexão SMTP."""
        if self.use_tls and self.port == 465:
            conn = smtplib.SMTP_SSL(self.host, self.port, timeout=10)
        else:
            conn = smtplib.SMTP(self.host, self.port, timeout=10)
            if self.use_tls:
                conn.starttls()
        conn.login(self.user, self.password)
        return conn

    def enviar_email(self, de: str, para: str, assunto: str, html: str) -> bool:
        """Envia um e-mail via SMTP. Retorna True se bem-sucedido."""
        msg = MIMEMultipart("alternative")
        msg["From"] = de
        msg["To"] = para
        msg["Subject"] = assunto
        msg.attach(MIMEText(html, "html", "utf-8"))
        try:
            conn = self._criar_conexao()
            conn.sendmail(de, para, msg.as_string())
            conn.quit()
            return True
        except Exception as e:
            logger.error(f"[EmailService] SMTP falha → {para}: {e}")
            return False


def enviar_lote_smtp(config: dict, clientes: List[Dict],
                     assunto: str, html_template: Optional[str] = None) -> dict:
    """
    Opção A: Envia lote de e-mails via SMTP usando pool de threads.
    """
    pool = SmtpPool(
        host=config.get("smtp_host"),
        port=int(config.get("smtp_port", 587)),
        user=config.get("smtp_user"),
        password=config.get("smtp_pass"),
        use_tls=config.get("smtp_secure", True),
        max_workers=config.get("max_workers", 10)
    )
    de = f'{config.get("remetente_nome", "Nexus ERP")} <{config.get("remetente_email")}>'
    relatorio = {"total": len(clientes), "sucesso": 0, "falha": 0, "erros": []}

    def enviar_um(cliente):
        html = (render_template(html_template, {
            "nomeCliente": cliente.get("nome"),
            "valorCobranca": cliente.get("valor"),
            "dataVencimento": cliente.get("vencimento"),
            "linkPagamento": cliente.get("link_pagamento", ""),
            "linhaDigitavel": cliente.get("linha_digitavel", "")
        }) if html_template else template_padrao_cobranca(
            nome_cliente=cliente.get("nome", ""),
            valor=cliente.get("valor", ""),
            vencimento=cliente.get("vencimento", ""),
            link_pagamento=cliente.get("link_pagamento", ""),
            linha_digitavel=cliente.get("linha_digitavel", "")
        ))
        ok = pool.enviar_email(de, cliente["email"], assunto, html)
        return cliente["email"], ok

    with ThreadPoolExecutor(max_workers=pool.max_workers) as executor:
        futuros = {executor.submit(enviar_um, c): c for c in clientes}
        for futuro in as_completed(futuros):
            email, ok = futuro.result()
            if ok:
                relatorio["sucesso"] += 1
                logger.info(f"[EmailService] SMTP OK → {email}")
            else:
                relatorio["falha"] += 1
                relatorio["erros"].append({"email": email, "erro": "Falha no envio SMTP"})

    return relatorio


# ──────────────────────────────────────────────────────────────────────────────
# OPÇÃO B: API REST do Brevo (até 1000 destinatários por chamada)
# ──────────────────────────────────────────────────────────────────────────────

def enviar_lote_brevo(config: dict, clientes: List[Dict],
                      assunto: str, html_template: Optional[str] = None) -> dict:
    """
    Opção B: Envia lote de e-mails via API REST do Brevo.
    Agrupa em lotes de 1000 (limite da API do Brevo).
    """
    if not requests:
        raise ImportError("Biblioteca 'requests' não instalada. Execute: pip install requests")

    api_key = config.get("brevo_api_key")
    remetente_nome = config.get("remetente_nome", "Nexus ERP")
    remetente_email = config.get("remetente_email")
    BATCH_SIZE = 1000
    relatorio = {"total": len(clientes), "sucesso": 0, "falha": 0, "erros": []}

    for i in range(0, len(clientes), BATCH_SIZE):
        lote = clientes[i:i + BATCH_SIZE]

        versoes = []
        for cliente in lote:
            html = (render_template(html_template, {
                "nomeCliente": cliente.get("nome"),
                "valorCobranca": cliente.get("valor"),
                "dataVencimento": cliente.get("vencimento"),
                "linkPagamento": cliente.get("link_pagamento", ""),
                "linhaDigitavel": cliente.get("linha_digitavel", "")
            }) if html_template else template_padrao_cobranca(
                nome_cliente=cliente.get("nome", ""),
                valor=cliente.get("valor", ""),
                vencimento=cliente.get("vencimento", ""),
                link_pagamento=cliente.get("link_pagamento", ""),
                linha_digitavel=cliente.get("linha_digitavel", "")
            ))
            versoes.append({
                "to": [{"email": cliente["email"], "name": cliente.get("nome", "")}],
                "subject": assunto,
                "htmlContent": html
            })

        payload = {
            "sender": {"name": remetente_nome, "email": remetente_email},
            "messageVersions": versoes
        }

        try:
            resp = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"Content-Type": "application/json", "api-key": api_key},
                json=payload,
                timeout=30
            )
            if resp.status_code in (200, 201):
                relatorio["sucesso"] += len(lote)
                logger.info(f"[EmailService] Brevo: lote {i} enviado — {len(lote)} e-mails")
            else:
                relatorio["falha"] += len(lote)
                relatorio["erros"].append({"lote": i, "erro": resp.text})
                logger.error(f"[EmailService] Brevo erro lote {i}: {resp.text}")
        except Exception as e:
            relatorio["falha"] += len(lote)
            relatorio["erros"].append({"lote": i, "erro": str(e)})
            logger.error(f"[EmailService] Brevo exception lote {i}: {e}")

    return relatorio


# ──────────────────────────────────────────────────────────────────────────────
# FUNÇÃO PRINCIPAL — enviar_lote_cobrancas
# ──────────────────────────────────────────────────────────────────────────────

def enviar_lote_cobrancas(
    config: dict,
    array_clientes: List[Dict],
    assunto: str = "Aviso de Cobrança",
    template_html: Optional[str] = None
) -> dict:
    """
    Função principal para envio de e-mails de cobrança em lote.

    Parâmetros:
        config: dict com chaves provedor, smtp_host, smtp_port, smtp_user, smtp_pass,
                remetente_nome, remetente_email, brevo_api_key
        array_clientes: [{"email": ..., "nome": ..., "valor": ..., "vencimento": ...,
                          "link_pagamento": ..., "linha_digitavel": ...}]
        assunto: Assunto do e-mail
        template_html: HTML personalizado com {{variáveis}} (opcional)

    Retorna:
        {"total": N, "sucesso": N, "falha": N, "erros": [...]}
    """
    provedor = config.get("provedor", "smtp")
    logger.info(f"[EmailService] Iniciando lote de {len(array_clientes)} cobranças — provedor: {provedor}")

    if provedor == "brevo":
        return enviar_lote_brevo(config, array_clientes, assunto, template_html)
    else:
        return enviar_lote_smtp(config, array_clientes, assunto, template_html)


# ──────────────────────────────────────────────────────────────────────────────
# EXEMPLO DE USO
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    config_exemplo = {
        "provedor": "brevo",                     # ou "smtp"
        "brevo_api_key": os.getenv("BREVO_API_KEY"),
        "remetente_nome": "Nexus ERP",
        "remetente_email": "financeiro@suaempresa.com.br",
        # Configurações SMTP (usado se provedor = "smtp"):
        "smtp_host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "smtp_port": int(os.getenv("SMTP_PORT", 587)),
        "smtp_user": os.getenv("SMTP_USER"),
        "smtp_pass": os.getenv("SMTP_PASS"),
        "smtp_secure": True,
        "max_workers": 10
    }

    clientes_exemplo = [
        {
            "email": "cliente1@email.com",
            "nome": "João Silva",
            "valor": "150,00",
            "vencimento": "25/07/2026",
            "link_pagamento": "https://transporte.coliseusistemas.com.br/pagar/1",
            "linha_digitavel": "34191.75124 60021.842800 06007.880000 3 90000000015000"
        },
        {
            "email": "cliente2@email.com",
            "nome": "Maria Souza",
            "valor": "320,00",
            "vencimento": "28/07/2026",
            "link_pagamento": "https://transporte.coliseusistemas.com.br/pagar/2"
        }
    ]

    resultado = enviar_lote_cobrancas(
        config=config_exemplo,
        array_clientes=clientes_exemplo,
        assunto="Seu boleto está disponível — Coliseu Transporte"
    )

    print(json.dumps(resultado, indent=2, ensure_ascii=False))
