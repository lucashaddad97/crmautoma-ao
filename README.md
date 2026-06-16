# AquaFlow — CRM para Distribuidora de Água

Painel de gestão de pedidos conectado ao Supabase em tempo real. Lê os pedidos
que a automação do WhatsApp (n8n) grava na tabela `pedidos` e permite gerenciar
o fluxo de entrega (Recebido → Separado → Saiu p/ entrega → Entregue).

## O que tem nesta versão

- **Dashboard** — métricas do dia (pedidos, faturamento, galões, ticket médio) + Kanban
- **Kanban drag-and-drop** — arraste um pedido entre colunas e o status é gravado no Supabase
- **Pedidos** — lista com filtros por status, busca, e troca de status inline
- **Clientes** — agrupados por WhatsApp, com total gasto e nº de pedidos
- **Relatórios** — receita por tamanho de galão, resumo geral
- **Tempo real** — novos pedidos do n8n aparecem sozinhos (Supabase Realtime)

## Setup (rodar local)

### 1. Pré-requisito
Node.js 18+ instalado.

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar o Supabase
Copie `.env.example` para `.env` e preencha:
```
VITE_SUPABASE_URL=https://wwlrvvcucmonckyxxzbh.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

> Use a chave **anon / publishable** (NÃO a service_role). O painel roda no
> navegador, então só pode usar a chave pública. O acesso aos dados é controlado
> pela RLS (passo 4).

A chave anon está em: Supabase → Settings → API Keys → `anon` / `publishable`.

### 4. Liberar leitura/escrita da tabela (RLS)
No Supabase → SQL Editor, rode:

```sql
-- Garante a tabela (caso ainda não exista)
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente text,
  whatsapp text,
  produto text default 'agua',
  tamanho text,
  quantidade int,
  possui_vasilhame boolean,
  tipo_compra text,
  endereco text,
  metodo_pagamento text,
  preco_unitario numeric,
  total numeric,
  observacao text,
  status text default 'recebido',
  criado_em timestamptz default now()
);

alter table pedidos enable row level security;

-- Permite o painel (chave anon) LER e ATUALIZAR pedidos.
-- ATENÇÃO: liberado para qualquer um com a anon key. Em produção,
-- troque por políticas com autenticação (login) — ver "Próximos passos".
drop policy if exists "anon_select_pedidos" on pedidos;
create policy "anon_select_pedidos" on pedidos for select using (true);

drop policy if exists "anon_update_pedidos" on pedidos;
create policy "anon_update_pedidos" on pedidos for update using (true) with check (true);
```

### 5. Ativar o Realtime na tabela
Supabase → Database → Replication (ou Realtime) → ative a tabela `pedidos`.
Sem isso, novos pedidos não aparecem sozinhos (só ao clicar em atualizar).

### 6. Rodar
```bash
npm run dev
```
Abre em `http://localhost:5173`.

## Deploy (Lovable / VPS / Vercel)

```bash
npm run build      # gera a pasta dist/
```
Suba a pasta `dist/` no host estático, e configure as variáveis de ambiente
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do provedor.

## Próximos passos (roadmap)

- **Inbox WhatsApp** — tabela de mensagens alimentada pelo n8n + visualização estilo WhatsApp Web
- **WhatsApp Cloud API oficial** — substituir/complementar o WAHA
- **Autenticação** — login de operadores; trocar as policies "using (true)" por policies por usuário/empresa
- **Multi-empresa** — coluna `empresa_id` + RLS por tenant, para vender o painel a várias distribuidoras
- **Entregadores e rotas** — atribuição de entregas e acompanhamento

## Segurança — importante

- O frontend usa SOMENTE a chave **anon**. Nunca coloque a `service_role` aqui.
- As policies do passo 4 liberam acesso a quem tiver a anon key. Antes de ir a
  público de verdade, implemente login e restrinja as policies.
