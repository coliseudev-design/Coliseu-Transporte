# -*- coding: utf-8 -*-
"""
asaas_service.py - Antigravity Nexus Financial Engine
Módulo de Integração com a API V3 do Banco Asaas em Python para Emissão de Boletos Bancários.
"""

import os
import requests
import logging
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AsaasService")

class AsaasService:
    """
    Classe de serviço para integrar com a API V3 do Asaas (Boletos, Clientes e Webhooks).
    """

    def __init__(self, api_key: Optional[str] = None, ambiente: str = "Sandbox"):
        self.api_key = api_key or os.getenv("ASAAS_API_KEY", "")
        self.ambiente = ambiente or os.getenv("ASAAS_AMBIENTE", "Sandbox")
        self.base_url = (
            "https://api.asaas.com/v3"
            if self.ambiente.lower() in ["producao", "produção"]
            else "https://api-sandbox.asaas.com/v3"
        )

    def _get_headers() -> Dict[str, str]:
        """Retorna os headers HTTP padrões para todas as requisições."""
        return {
            "Content-Type": "application/json",
            "User-Agent": "Coliseu-Transporte-ERP-Python/1.0",
            "access_token": self.api_key,
        }

    def create_customer(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        2A. Cadastro / Busca de Cliente no Asaas (POST /v3/customers)
        """
        cpf_cnpj = "".join(filter(str.isdigit, customer_data.get("cpfCnpj", "")))
        if not cpf_cnpj:
            raise ValueError("CPF/CNPJ é obrigatório para cadastrar cliente no Asaas.")

        # 1. Verifica se já existe
        search_url = f"{self.base_url}/customers?cpfCnpj={cpf_cnpj}"
        response = requests.get(search_url, headers=self._get_headers(), timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("data"):
                logger.info(f"Cliente existente encontrado: {data['data'][0]['id']}")
                return data["data"][0]

        # 2. Cadastra novo cliente
        payload = {
            "name": customer_data.get("name"),
            "cpfCnpj": cpf_cnpj,
            "email": customer_data.get("email"),
            "phone": customer_data.get("phone"),
            "postalCode": customer_data.get("postalCode"),
            "addressNumber": customer_data.get("addressNumber"),
            "notificationDisabled": False,
        }

        url = f"{self.base_url}/customers"
        res = requests.post(url, json=payload, headers=self._get_headers(), timeout=10)
        res_data = res.json()

        if res.status_code != 200:
            error_msg = res_data.get("errors", [{}])[0].get("description", "Erro no Asaas")
            raise Exception(f"Erro ao cadastrar cliente no Asaas: {error_msg}")

        logger.info(f"Cliente cadastrado no Asaas: {res_data.get('id')}")
        return res_data

    def create_payment(self, payment_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        2B. Emissão de Cobrança / Boleto Bancário (POST /v3/payments)
        """
        payload = {
            "customer": payment_params.get("customerId"),
            "billingType": "BOLETO",
            "value": float(payment_params.get("value", 0)),
            "dueDate": payment_params.get("dueDate"),
            "description": payment_params.get("description", "Cobrança Coliseu Transporte"),
        }

        if payment_params.get("fine"):
            payload["fine"] = {"value": float(payment_params["fine"])}
        if payment_params.get("interest"):
            payload["interest"] = {"value": float(payment_params["interest"])}

        url = f"{self.base_url}/payments"
        res = requests.post(url, json=payload, headers=self._get_headers(), timeout=10)
        res_data = res.json()

        if res.status_code != 200:
            error_msg = res_data.get("errors", [{}])[0].get("description", "Erro ao gerar boleto")
            raise Exception(f"Erro ao gerar boleto no Asaas: {error_msg}")

        # Busca linha digitável
        payment_id = res_data.get("id")
        barcode_data = self.get_identification_field(payment_id)
        res_data["linhaDigitavel"] = barcode_data.get("identificationField")
        res_data["barCode"] = barcode_data.get("barCode")

        return res_data

    def get_identification_field(self, payment_id: str) -> Dict[str, Any]:
        """
        2C. Obter Linha Digitável e Código de Barras (GET /v3/payments/{paymentId}/identificationField)
        """
        url = f"{self.base_url}/payments/{payment_id}/identificationField"
        res = requests.get(url, headers=self._get_headers(), timeout=10)
        if res.status_code != 200:
            return {}
        return res.json()


# 2D. Controlador de Webhook utilizando Flask
def handle_asaas_webhook(request_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Controlador para receber notificações POST de Webhook do Asaas.
    """
    event = request_json.get("event")
    payment = request_json.get("payment", {})
    payment_id = payment.get("id")
    value = payment.get("value")

    logger.info(f"Webhook recebido do Asaas: Evento={event}, PaymentID={payment_id}, Valor={value}")

    if event in ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]:
        # Atualizar banco de dados para PAGO
        logger.info(f"Pagamento {payment_id} CONFIRMADO no Asaas.")
        return {"status": "success", "action": "paid", "payment_id": payment_id}
    
    return {"status": "ignored", "event": event}
