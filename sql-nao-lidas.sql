-- ============================================================
-- AquaFlow — Feature "mensagens não lidas" no Inbox
-- Rode no Supabase: SQL Editor > New query > cole tudo > Run
-- ============================================================

-- 1) Coluna que conta mensagens não lidas por conversa.
--    O CRM zera quando o atendente abre a conversa.
--    O n8n incrementa quando chega mensagem do cliente (ver passo 3).
alter table conversas
  add column if not exists nao_lidas integer not null default 0;

-- 2) (Opcional, recomendado) Função que incrementa o contador.
--    Útil se você preferir chamar uma função em vez de UPDATE manual no n8n.
create or replace function incrementa_nao_lidas(conv_id uuid)
returns void language sql as $$
  update conversas set nao_lidas = coalesce(nao_lidas, 0) + 1
  where id = conv_id;
$$;

-- ============================================================
-- 3) AJUSTE NO N8N (importante)
-- ------------------------------------------------------------
-- Hoje, quando chega mensagem do CLIENTE, o n8n grava em "mensagens"
-- (autor='cliente') e atualiza "conversas" (ultima_msg, ultima_em).
-- Adicione ao MESMO update da conversa o incremento do contador:
--
--   No nó HTTP Request que faz o PATCH em /rest/v1/conversas, troque o body
--   para incluir o incremento. Como o PATCH do PostgREST não soma sozinho,
--   a forma mais simples é uma das duas:
--
--   OPÇÃO A (chamar a função criada acima via RPC):
--     POST {SUPABASE_URL}/rest/v1/rpc/incrementa_nao_lidas
--     body: { "conv_id": "<id-da-conversa>" }
--     (faça isso logo após gravar a mensagem do cliente)
--
--   OPÇÃO B (ler e gravar): buscar nao_lidas atual, somar 1 no código JS,
--     e mandar no mesmo PATCH que já atualiza ultima_msg/ultima_em.
--
-- IMPORTANTE: só incremente para mensagens do CLIENTE. Mensagens do
-- bot/humano NÃO devem incrementar (não são "não lidas" pra você).
-- ============================================================

-- Pronto. O badge aparece sozinho no CRM assim que a coluna existir.
-- Se você não fizer o passo 3, a coluna fica sempre 0 e o badge nunca
-- aparece — mas nada quebra.
