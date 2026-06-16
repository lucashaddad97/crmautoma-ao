# AquaFlow — Página de Conversas (Inbox WhatsApp)

Página estilo WhatsApp Web dentro do CRM: lista de conversas à esquerda, chat à
direita, balões coloridos (cliente / bot / atendente) e o toggle **Assumir
conversa / Devolver ao bot**.

## Como funciona (arquitetura)

```
WhatsApp → WAHA (ou Cloud API) → n8n → grava no Supabase → CRM lê (esta página)
                                          ↑
            atendente digita no CRM → grava em "mensagens" (autor=humano) → n8n envia
```

O CRM **não fala direto com o WhatsApp** — ele lê/escreve no Supabase, e o n8n
faz a ponte. Esse é o padrão usado por CRMs profissionais (Chatwoot etc.).

## Setup

### 1. Criar as tabelas
Supabase → SQL Editor → cole e rode o arquivo `sql-inbox.sql`.
Ele cria `conversas` e `mensagens`, libera RLS e insere 3 conversas de exemplo
para você ver a página funcionando já.

### 2. Ativar Realtime
Supabase → Database → Publications → `supabase_realtime` → adicione as tabelas
`conversas` e `mensagens`. Sem isso, mensagens novas não aparecem sozinhas.

### 3. Rodar
`npm run dev` → abra a aba **Conversas** no menu.

## O toggle bot/humano

Cada conversa tem o campo `handler`:
- `bot` → o n8n responde automaticamente (fluxo normal)
- `humano` → o bot fica em silêncio; quem responde é o atendente pela tela

Ao clicar em **Assumir conversa**, o CRM muda `handler` para `humano` no Supabase.
Ao clicar em **Devolver ao bot**, volta para `bot`.

## Integração com o n8n (quando for plugar)

Três pontos no seu fluxo do n8n:

**A) Toda mensagem recebida → gravar em `mensagens` e atualizar `conversas`**
Logo após o nó "dados", adicione:
1. Upsert na tabela `conversas` (por whatsapp): nome, ultima_msg, ultima_em.
2. Insert em `mensagens`: { conversa_id, autor: "cliente", texto }.

**B) Respeitar o handler antes do bot responder**
No começo do fluxo, depois de identificar a conversa, um nó IF:
- Se `conversas.handler == 'humano'` → NÃO roda o bot (encerra o fluxo).
- Se `== 'bot'` → segue normal. Toda resposta do bot também grava em
  `mensagens` com autor "bot".

**C) Atendente respondeu pela tela → enviar pelo WhatsApp**
O CRM grava em `mensagens` com `autor='humano'`. Configure no n8n um gatilho
(Supabase Trigger ou polling) que, ao ver uma mensagem nova com autor='humano',
dispara o WAHA/Cloud API "Send Text" para o `whatsapp` daquela conversa.

> Com a **API oficial (Cloud API)** o desenho é o mesmo — muda só a "ponta":
> o recebimento vira webhook da Meta e o envio vira HTTP Request para a Graph API.
> O Supabase e esta página não mudam.

## Envio pela tela — observação

Hoje o botão de enviar **grava a mensagem no Supabase** (autor=humano) e ela
aparece na hora no chat. O envio REAL pro WhatsApp acontece quando você
configurar o ponto **C** acima no n8n. Até lá, a mensagem fica registrada no
painel mas não sai pro cliente.

## Segurança

- Use a chave **anon/publishable** no `.env` (nunca a service_role).
- As policies do `sql-inbox.sql` liberam acesso a quem tem a anon key — ok para
  testar. Antes de produção, implemente login e restrinja as policies.
