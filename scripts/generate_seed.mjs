// Gera seed.sql realista para Compensados Mama
// Uso: node scripts/generate_seed.mjs > migrations/seed.sql
import { writeFileSync } from 'fs';

const out = [];
const push = (s) => out.push(s);

// Helper - escape SQL
const esc = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => Number(n).toFixed(2);

// Determinismo
let seed = 42;
const rand = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// Datas
const today = new Date('2026-04-16T12:00:00Z'); // data fixa para determinismo
const daysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
};
const fmtDate = (d) => d.toISOString().slice(0, 10);
const fmtDateTime = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

push('-- Seed: Compensados Mama (dados fictícios)\n');
push('-- Gerado automaticamente\n\n');

// Limpa tabelas (idempotente para re-seed local)
push('DELETE FROM sync_log_atividades;');
push('DELETE FROM sync_devolucoes;');
push('DELETE FROM sync_compras;');
push('DELETE FROM sync_financeiro;');
push('DELETE FROM sync_comissoes;');
push('DELETE FROM sync_vendas_itens;');
push('DELETE FROM sync_vendas;');
push('DELETE FROM sync_fornecedores;');
push('DELETE FROM sync_vendedores;');
push('DELETE FROM sync_produtos;');
push('DELETE FROM sync_clientes;');
push('DELETE FROM sync_metadata;');
push('DELETE FROM usuarios_web;');
push('');

// --------- Usuário web padrão (sem senha) ----------
push(`INSERT INTO usuarios_web (email, senha_hash, nome, role, ativo) VALUES
  ('admin@nexus.com', NULL, 'Administrador', 'admin', 1),
  ('gerente@nexus.com', NULL, 'Gerente', 'gerente', 1),
  ('viewer@nexus.com', NULL, 'Visualizador', 'viewer', 1);`);
push('');

// --------- Vendedores ----------
const vendedoresNomes = [
  'Carlos Silva', 'Ana Paula Souza', 'Roberto Almeida', 'Juliana Costa',
  'Marcos Oliveira', 'Fernanda Lima', 'Paulo Henrique', 'Beatriz Santos',
  'Rafael Pereira', 'Luciana Rocha'
];
push('-- Vendedores');
vendedoresNomes.forEach((nome, i) => {
  const id = i + 1;
  const email = nome.toLowerCase().split(' ')[0] + '@nexus.com';
  push(`INSERT INTO sync_vendedores (id_firebird, nome, email, ativo) VALUES (${id}, ${esc(nome)}, ${esc(email)}, 1);`);
});
push('');

// --------- Fornecedores ----------
const fornecedores = [
  { nome: 'Madeireira Central Ltda', doc: '12.345.678/0001-90', cidade: 'Curitiba', uf: 'PR' },
  { nome: 'Compensados do Sul S.A.', doc: '23.456.789/0001-01', cidade: 'Chapecó', uf: 'SC' },
  { nome: 'Indústria Florestal Mama', doc: '34.567.890/0001-12', cidade: 'Manaus', uf: 'AM' },
  { nome: 'Paraná Laminados', doc: '45.678.901/0001-23', cidade: 'Londrina', uf: 'PR' },
  { nome: 'Compensa Brasil', doc: '56.789.012/0001-34', cidade: 'São Paulo', uf: 'SP' },
  { nome: 'Ferragens Industriais SA', doc: '67.890.123/0001-45', cidade: 'Joinville', uf: 'SC' },
  { nome: 'Colas & Vernizes Pro', doc: '78.901.234/0001-56', cidade: 'Porto Alegre', uf: 'RS' }
];
push('-- Fornecedores');
fornecedores.forEach((f, i) => {
  push(`INSERT INTO sync_fornecedores (id_firebird, nome, documento, cidade, estado) VALUES (${i + 1}, ${esc(f.nome)}, ${esc(f.doc)}, ${esc(f.cidade)}, ${esc(f.uf)});`);
});
push('');

// --------- Clientes ----------
const primeirosNomes = ['João', 'Maria', 'José', 'Ana', 'Pedro', 'Carla', 'Bruno', 'Sandra',
  'Felipe', 'Patrícia', 'Rodrigo', 'Camila', 'Gustavo', 'Tatiana', 'Leonardo', 'Vanessa',
  'Diego', 'Mariana', 'Thiago', 'Gabriela'];
const sobrenomes = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Rocha', 'Alves',
  'Ferreira', 'Ribeiro', 'Cardoso', 'Martins', 'Gomes', 'Dias', 'Barbosa', 'Moreira'];
const cidades = [
  { c: 'São Paulo', uf: 'SP' }, { c: 'Rio de Janeiro', uf: 'RJ' },
  { c: 'Belo Horizonte', uf: 'MG' }, { c: 'Curitiba', uf: 'PR' },
  { c: 'Porto Alegre', uf: 'RS' }, { c: 'Salvador', uf: 'BA' },
  { c: 'Fortaleza', uf: 'CE' }, { c: 'Recife', uf: 'PE' },
  { c: 'Manaus', uf: 'AM' }, { c: 'Brasília', uf: 'DF' }
];
const tiposCliente = ['PF', 'PJ'];
const empresas = ['Construtora', 'Marcenaria', 'Móveis', 'Design', 'Arquitetura', 'Reformas'];

push('-- Clientes');
const NUM_CLIENTES = 120;
for (let i = 1; i <= NUM_CLIENTES; i++) {
  const isPJ = rand() < 0.35;
  let nome, doc;
  if (isPJ) {
    nome = `${pick(empresas)} ${pick(sobrenomes)} Ltda`;
    doc = `${randInt(10, 99)}.${randInt(100, 999)}.${randInt(100, 999)}/0001-${randInt(10, 99)}`;
  } else {
    nome = `${pick(primeirosNomes)} ${pick(sobrenomes)}`;
    doc = `${randInt(100, 999)}.${randInt(100, 999)}.${randInt(100, 999)}-${randInt(10, 99)}`;
  }
  const cidade = pick(cidades);
  const email = `cliente${i}@email.com`;
  const tel = `(${randInt(11, 99)}) 9${randInt(1000, 9999)}-${randInt(1000, 9999)}`;
  const dataCad = fmtDate(daysAgo(randInt(30, 700)));
  push(`INSERT INTO sync_clientes (id_firebird, nome, documento, email, telefone, cidade, estado, data_cadastro, ativo) VALUES (${i}, ${esc(nome)}, ${esc(doc)}, ${esc(email)}, ${esc(tel)}, ${esc(cidade.c)}, ${esc(cidade.uf)}, ${esc(dataCad)}, 1);`);
}
push('');

// --------- Produtos (Compensados) ----------
const categorias = ['Compensado Naval', 'Compensado Comum', 'MDF', 'MDP', 'OSB', 'Ferragens', 'Colas & Vernizes'];
const produtosBase = [
  // Compensados Navais
  { cat: 'Compensado Naval', nomes: ['Naval 6mm 2.20x1.60', 'Naval 10mm 2.20x1.60', 'Naval 15mm 2.20x1.60', 'Naval 18mm 2.20x1.60', 'Naval 20mm 2.20x1.60'], precoBase: 180 },
  // Compensados comuns
  { cat: 'Compensado Comum', nomes: ['Comum 4mm 2.20x1.60', 'Comum 6mm 2.20x1.60', 'Comum 10mm 2.20x1.60', 'Comum 15mm 2.20x1.60', 'Comum 18mm 2.20x1.60'], precoBase: 90 },
  // MDF
  { cat: 'MDF', nomes: ['MDF Cru 3mm 2.75x1.85', 'MDF Cru 6mm 2.75x1.85', 'MDF Cru 15mm 2.75x1.85', 'MDF Cru 18mm 2.75x1.85', 'MDF Branco 15mm 2.75x1.85', 'MDF Branco 18mm 2.75x1.85'], precoBase: 130 },
  // MDP
  { cat: 'MDP', nomes: ['MDP Cru 15mm 2.75x1.85', 'MDP Cru 18mm 2.75x1.85', 'MDP Branco 15mm 2.75x1.85', 'MDP Branco 18mm 2.75x1.85'], precoBase: 110 },
  // OSB
  { cat: 'OSB', nomes: ['OSB 9mm 2.44x1.22', 'OSB 11mm 2.44x1.22', 'OSB 15mm 2.44x1.22', 'OSB 18mm 2.44x1.22'], precoBase: 95 },
  // Ferragens
  { cat: 'Ferragens', nomes: ['Dobradiça Reta 35mm', 'Dobradiça Slide-on', 'Corrediça Telescópica 400mm', 'Corrediça Telescópica 500mm', 'Puxador Alumínio 128mm', 'Puxador Inox 160mm', 'Parafuso Chipboard 4.0x40 (cx)', 'Parafuso Chipboard 4.0x50 (cx)'], precoBase: 25 },
  // Colas/Vernizes
  { cat: 'Colas & Vernizes', nomes: ['Cola Branca PVA 1kg', 'Cola Branca PVA 5kg', 'Verniz Incolor Brilhante 3.6L', 'Verniz Incolor Fosco 3.6L', 'Selador Acrílico 3.6L'], precoBase: 45 }
];
push('-- Produtos');
let produtoId = 1;
const produtosRef = []; // id, preco, custo, nome
produtosBase.forEach((grupo) => {
  grupo.nomes.forEach((nome) => {
    const preco = Number((grupo.precoBase * (0.7 + rand() * 1.5)).toFixed(2));
    const custo = Number((preco * (0.55 + rand() * 0.2)).toFixed(2)); // 55-75% margem
    const estoque = randInt(2, 350);
    const estoqueMin = randInt(5, 30);
    const codigo = `COD-${String(produtoId).padStart(5, '0')}`;
    push(`INSERT INTO sync_produtos (id_firebird, codigo, nome, categoria, preco, custo, estoque, estoque_minimo, ativo) VALUES (${produtoId}, ${esc(codigo)}, ${esc(nome)}, ${esc(grupo.cat)}, ${num(preco)}, ${num(custo)}, ${estoque}, ${estoqueMin}, 1);`);
    produtosRef.push({ id: produtoId, preco, custo, nome });
    produtoId++;
  });
});
push('');

// --------- Vendas (últimos 400 dias) ----------
push('-- Vendas + Itens + Comissões + Financeiro');
const NUM_VENDAS = 900;
const statusVenda = ['FINALIZADO', 'FINALIZADO', 'FINALIZADO', 'FINALIZADO', 'FINALIZADO', 'FINALIZADO', 'FINALIZADO', 'ABERTO', 'PROCESSANDO', 'PRONTO', 'CANCELADO'];
let vendaId = 1;
let itemId = 1;
let comissaoId = 1;
let finId = 1;

function calcPercComissao(vlr) {
  if (vlr <= 10000) return 2;
  if (vlr <= 50000) return 3;
  if (vlr <= 100000) return 4;
  return 5;
}

for (let i = 0; i < NUM_VENDAS; i++) {
  const diasAtras = Math.floor(Math.pow(rand(), 1.3) * 400); // distribui melhor em datas recentes
  const hora = randInt(8, 19);
  const min = randInt(0, 59);
  const d = daysAgo(diasAtras);
  d.setUTCHours(hora, min, 0, 0);
  const dataVenda = fmtDateTime(d);

  const clienteId = randInt(1, NUM_CLIENTES);
  const vendedorId = randInt(1, vendedoresNomes.length);
  const status = pick(statusVenda);
  const numItens = randInt(1, 6);

  let valorTotal = 0;
  let valorCusto = 0;
  const itens = [];
  for (let j = 0; j < numItens; j++) {
    const p = pick(produtosRef);
    const qtd = randInt(1, 15);
    const preco = p.preco;
    const custo = p.custo;
    const vlr = Number((qtd * preco).toFixed(2));
    valorTotal += vlr;
    valorCusto += Number((qtd * custo).toFixed(2));
    itens.push({ produtoId: p.id, qtd, preco, custo, vlr });
  }
  const desconto = rand() < 0.15 ? Number((valorTotal * rand() * 0.1).toFixed(2)) : 0;
  valorTotal = Number((valorTotal - desconto).toFixed(2));

  const numeroPedido = `PED-${String(2025000 + vendaId).padStart(7, '0')}`;
  push(`INSERT INTO sync_vendas (id_firebird, numero_pedido, data_venda, cliente_id, vendedor_id, valor_total, valor_custo, valor_desconto, status) VALUES (${vendaId}, ${esc(numeroPedido)}, ${esc(dataVenda)}, ${clienteId}, ${vendedorId}, ${num(valorTotal)}, ${num(valorCusto)}, ${num(desconto)}, ${esc(status)});`);

  // Itens
  itens.forEach((it) => {
    push(`INSERT INTO sync_vendas_itens (id_firebird, venda_id, produto_id, quantidade, preco_unitario, custo_unitario, valor_total) VALUES (${itemId}, ${vendaId}, ${it.produtoId}, ${it.qtd}, ${num(it.preco)}, ${num(it.custo)}, ${num(it.vlr)});`);
    itemId++;
  });

  // Comissão (só para vendas finalizadas)
  if (status === 'FINALIZADO') {
    const perc = calcPercComissao(valorTotal);
    const valorComissao = Number((valorTotal * perc / 100).toFixed(2));
    const periodo = fmtDate(d).slice(0, 7); // YYYY-MM
    push(`INSERT INTO sync_comissoes (id_firebird, vendedor_id, venda_id, periodo, valor_vendas, percentual, valor_comissao, data_referencia) VALUES (${comissaoId}, ${vendedorId}, ${vendaId}, ${esc(periodo)}, ${num(valorTotal)}, ${num(perc)}, ${num(valorComissao)}, ${esc(fmtDate(d))});`);
    comissaoId++;

    // Contas a receber (gera 1-3 parcelas)
    const numParc = randInt(1, 3);
    for (let k = 1; k <= numParc; k++) {
      const vlrParc = Number((valorTotal / numParc).toFixed(2));
      const dVenc = new Date(d);
      dVenc.setDate(dVenc.getDate() + 30 * k);
      const vencStr = fmtDate(dVenc);
      // Status de pagamento: vencidas passadas têm chance de estar pagas; futuras não
      let statusPg = 'ABERTO';
      let dataPg = null;
      let vlrPago = 0;
      const agora = today;
      if (dVenc < agora) {
        if (rand() < 0.75) {
          statusPg = 'PAGO';
          const dPago = new Date(dVenc);
          dPago.setDate(dPago.getDate() - randInt(0, 5) + randInt(0, 10));
          dataPg = fmtDate(dPago);
          vlrPago = vlrParc;
        }
      }
      push(`INSERT INTO sync_financeiro (id_firebird, tipo, descricao, cliente_id, data_emissao, data_vencimento, data_pagamento, valor, valor_pago, status_pagamento) VALUES (${finId}, 'RECEBER', ${esc('Parcela ' + k + '/' + numParc + ' - Pedido ' + numeroPedido)}, ${clienteId}, ${esc(fmtDate(d))}, ${esc(vencStr)}, ${esc(dataPg)}, ${num(vlrParc)}, ${num(vlrPago)}, ${esc(statusPg)});`);
      finId++;
    }
  }
  vendaId++;
}

// --------- Contas a PAGAR (fornecedores/despesas) ----------
push('');
push('-- Contas a pagar');
const despesas = ['Aluguel', 'Energia Elétrica', 'Internet/Telefone', 'Folha de Pagamento', 'Impostos', 'Manutenção Frota', 'Material de Escritório'];
for (let m = 0; m < 18; m++) {
  const dataRef = daysAgo(m * 30);
  // Despesas fixas
  despesas.forEach((desp) => {
    const valor = Number((500 + rand() * 8000).toFixed(2));
    const dVenc = new Date(dataRef);
    dVenc.setDate(5 + randInt(0, 10));
    let statusPg = 'ABERTO';
    let dataPg = null;
    let vlrPago = 0;
    if (dVenc < today && rand() < 0.85) {
      statusPg = 'PAGO';
      dataPg = fmtDate(dVenc);
      vlrPago = valor;
    }
    push(`INSERT INTO sync_financeiro (id_firebird, tipo, descricao, data_emissao, data_vencimento, data_pagamento, valor, valor_pago, status_pagamento) VALUES (${finId}, 'PAGAR', ${esc(desp)}, ${esc(fmtDate(dataRef))}, ${esc(fmtDate(dVenc))}, ${esc(dataPg)}, ${num(valor)}, ${num(vlrPago)}, ${esc(statusPg)});`);
    finId++;
  });
}
push('');

// --------- Compras ----------
push('-- Compras');
const NUM_COMPRAS = 120;
for (let i = 1; i <= NUM_COMPRAS; i++) {
  const diasAtras = randInt(1, 400);
  const d = daysAgo(diasAtras);
  const fornecedorId = randInt(1, fornecedores.length);
  const valor = Number((2000 + rand() * 30000).toFixed(2));
  const numeroPedido = `COMP-${String(1000 + i).padStart(5, '0')}`;
  const status = rand() < 0.9 ? 'FINALIZADO' : 'ABERTO';
  const dEntrega = new Date(d);
  dEntrega.setDate(dEntrega.getDate() + randInt(3, 20));
  push(`INSERT INTO sync_compras (id_firebird, numero_pedido, fornecedor_id, data_pedido, data_entrega, valor_total, status) VALUES (${i}, ${esc(numeroPedido)}, ${fornecedorId}, ${esc(fmtDateTime(d))}, ${esc(fmtDate(dEntrega))}, ${num(valor)}, ${esc(status)});`);
}
push('');

// --------- Devoluções ----------
push('-- Devoluções');
const motivos = ['Produto com defeito', 'Cliente desistiu', 'Erro no pedido', 'Medida incorreta', 'Avaria no transporte', 'Cor diferente do solicitado'];
const NUM_DEV = 45;
for (let i = 1; i <= NUM_DEV; i++) {
  const vId = randInt(1, Math.min(vendaId - 1, 800));
  const pId = randInt(1, produtosRef.length);
  const diasAtras = randInt(1, 380);
  const d = daysAgo(diasAtras);
  const motivo = pick(motivos);
  const qtd = randInt(1, 5);
  const valor = Number((qtd * (30 + rand() * 400)).toFixed(2));
  push(`INSERT INTO sync_devolucoes (id_firebird, venda_id, produto_id, data_devolucao, motivo, quantidade, valor) VALUES (${i}, ${vId}, ${pId}, ${esc(fmtDateTime(d))}, ${esc(motivo)}, ${qtd}, ${num(valor)});`);
}
push('');

// --------- Log de Atividades ----------
push('-- Log de atividades');
const usuariosLog = ['SYSDBA', 'carlos.silva', 'ana.souza', 'roberto.almeida', 'juliana.costa', 'admin'];
const operacoes = ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'LOGIN', 'LOGOUT'];
const tabelasLog = ['VENDAS', 'CLIENTES', 'PRODUTOS', 'FINANCEIRO', 'COMPRAS'];
const NUM_LOGS = 400;
for (let i = 1; i <= NUM_LOGS; i++) {
  const d = daysAgo(randInt(0, 90));
  d.setUTCHours(randInt(0, 23), randInt(0, 59), randInt(0, 59));
  const u = pick(usuariosLog);
  const op = pick(operacoes);
  const t = (op === 'LOGIN' || op === 'LOGOUT') ? null : pick(tabelasLog);
  const desc = op === 'LOGIN' ? 'Login no sistema' :
               op === 'LOGOUT' ? 'Logout' :
               `${op} em ${t} - registro #${randInt(1, 9999)}`;
  push(`INSERT INTO sync_log_atividades (id_firebird, usuario, operacao, tabela, descricao, data_operacao) VALUES (${i}, ${esc(u)}, ${esc(op)}, ${esc(t)}, ${esc(desc)}, ${esc(fmtDateTime(d))});`);
}
push('');

// --------- Metadata ----------
push('-- Metadata de sincronização');
const tabelasMeta = ['sync_vendas','sync_clientes','sync_produtos','sync_comissoes','sync_financeiro','sync_compras','sync_devolucoes','sync_log_atividades'];
tabelasMeta.forEach((t, i) => {
  push(`INSERT INTO sync_metadata (tabela, ultima_sincronizacao, registros_sincronizados, status) VALUES (${esc(t)}, ${esc(fmtDateTime(today))}, ${randInt(100, 5000)}, 'OK');`);
});

// Escreve
writeFileSync('migrations/seed.sql', out.join('\n'));
console.error(`Seed gerado: ${out.length} linhas SQL em migrations/seed.sql`);
