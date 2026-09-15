-- Migration 012: Adicionar ai_system_prompt e templates oficiais da Coliseu Sistemas

ALTER TABLE dash_integracoes_config ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT;

-- Atualizar o Prompt AI Padrão para configurações existentes
UPDATE dash_integracoes_config
SET ai_system_prompt = 'Atue como um Engenheiro Especialista em Redação Jurídica e Comercial com foco no mercado de TI brasileiro. Sua missão é preencher e formatar os documentos de negócios da COLISEU SISTEMAS LTDA com base estritamente nos dados de entrada coletados do novo cliente.

Regras Cruciais de Comportamento Técnico:
1. Você não deve resumir, cortar ou omitir cláusulas. O contrato deve ser emitido de forma robusta e longa.
2. Mantenha os dados padrão da Coliseu Sistemas invariáveis (Representante: Kleber Silveira Diagone, Sede em Campo Grande/MS, CNPJ 29.639.089/0001-12).
3. Mapeie os módulos informados no escopo do cliente e encaixe-os no quadro do Objeto.
4. Aplique a regra técnica de infraestrutura: Windows 10, i3, 8GB de RAM, 50GB em disco livre.
5. Fixe os encargos: Multa de 2%, juros de 1% ao mês pro rata die, suspensão técnica dos serviços após 15 dias de inadimplência e aviso prévio de rescisão de 30 dias.
6. Eleja invariavelmente o Foro de Campo Grande/MS.

Entrada de Dados (A ser preenchida pelo fluxo do Antygrafit):
- Razão Social do Cliente: ""
- CNPJ/CPF do Cliente: ""
- Endereço Completo do Cliente: ""
- Gestor/Representante: ""
- CPF do Gestor: ""
- Sistema Antigo para Migração: ""
- Regime Tributário: ""
- Número Total de Terminais contratados: ""
- Preço da Implantação/Migração (R$): ""
- Preço da Recorrência Mensal Calculada (R$): ""
- Módulos Selecionados pelo Comercial: [Ex: Fiscal, Financeiro, Apps, Servidor Cloud, BI]

Gere a Saída dividida estritamente em dois blocos Markdown estruturados:
# PROPOSTA COMERCIAL - COLISEU ERP
# CONTRATO DE PRESTAÇÃO DE SERVIÇOS E LICENÇA DE USO'
WHERE ai_system_prompt IS NULL OR ai_system_prompt = '';

-- Atualizar os Scripts de Régua de Cobrança nas configurações existentes
UPDATE dash_integracoes_config
SET lembrete_preventivo_script = 'Olá, {{gestor_cliente}}! Tudo bem com você e com a equipe da {{razao_social_cliente}}?

Passando para informar que a sua fatura mensal referente ao licenciamento do Sistema Coliseu ERP / Servidor Cloud, com vencimento em {{data_vencimento}}, já foi gerada e está disponível para pagamento.

• Valor: R$ {{valor_mensalidade}}

Para sua facilidade, você pode realizar o pagamento direto via PIX copiando o código abaixo:

{{chave_pix}}

O boleto bancário completo também foi enviado para o seu e-mail cadastrado. Caso precise de suporte ou da segunda via em PDF, basta solicitar por aqui! 

Agradecemos a parceria. Tenha um excelente dia de trabalho!'
WHERE lembrete_preventivo_script IS NULL OR lembrete_preventivo_script = '';

UPDATE dash_integracoes_config
SET atraso_inicial_script = 'Prezado(a) {{gestor_cliente}}, bom dia.

Identificamos em nosso departamento financeiro que a fatura referente à licença de uso do Sistema Coliseu com vencimento em {{data_vencimento}} ainda consta em aberto no nosso sistema.

Ressaltamos que a manutenção do pagamento em dia garante a estabilidade de seus backups diários em nuvem, atualizações fiscais obrigatórias e o suporte técnico. Evite os encargos por atraso descritos em contrato liquidando o débito por meio da nossa chave PIX oficial copia e cola abaixo:

{{chave_pix}}

Caso precise acessar o boleto detalhado em PDF, utilize este link seguro: {{link_boleto_pdf}}

Se o pagamento já foi realizado, por favor desconsidere esta mensagem e nos envie o comprovante por este canal para realizarmos a baixa imediata. Contamos com sua colaboração para evitar a suspensão dos acessos ao sistema conforme previsão contratual.'
WHERE atraso_inicial_script IS NULL OR atraso_inicial_script = '';

UPDATE dash_integracoes_config
SET atraso_critico_script = 'Assunto: URGENTE: Pendência Financeira e Aviso de Suspensão de Acesso - COLISEU SISTEMAS

Prezada Direção da {{razao_social_cliente}},
A/C: {{gestor_cliente}}

Constatamos em nossos registros que a pendência financeira referente aos serviços de licenciamento de software e sustentação técnica com vencimento em {{data_vencimento}}, no valor original de R$ {{valor_mensalidade}}, permanece pendente de regularização.

De acordo com as cláusulas estipuladas no instrumento contratual firmado entre as partes, o atraso prolongado enseja a incidência de multa moratória de 2%, juros de 1% ao mês pro rata, além de autorizar a suspensão imediata e temporária do acesso aos módulos do sistema, atualizações fiscais e emissão de notas (NF-e/NFC-e), bem como a interrupção do suporte técnico.

Para evitar prejuízos à sua rotina operacional e interrupção forçada no faturamento de sua empresa, solicitamos que efetue a liquidação imediata dos valores em atraso.

DADOS PARA QUITAÇÃO IMEDIATA:
Valor Atualizado: R$ {{valor_mensalidade}} (+ Encargos de mora)
Chave Pix Copia e Cola: {{chave_pix}}
Link Seguro para Emissão de Boleto: {{link_boleto_pdf}}

Se o pagamento já foi efetuado, exigimos o envio do respectivo comprovante em resposta a este e-mail para que o nosso setor financeiro efetue a conciliação manual urgente e neutralize o comando de bloqueio automático do software.

Certos de sua atenção e compreensão para a resolução ágil deste caso, permanecemos no aguardo.

Cordialmente,
Setor de Controladoria e Cobrança
Coliseu Sistemas LTDA'
WHERE atraso_critico_script IS NULL OR atraso_critico_script = '';


-- [DESATIVADO] Inserção automática de templates oficiais removida.
-- Templates agora são gerenciados exclusivamente via interface pelo usuário.
-- Bloco DO $$ de auto-seed de templates foi desativado para evitar re-criação a cada restart.
