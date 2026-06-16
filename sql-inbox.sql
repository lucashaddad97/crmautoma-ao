-- ============================================================
-- AquaFlow — Tabelas do Inbox (conversas + mensagens)
-- Rode no Supabase: SQL Editor > New query > cole tudo > Run
-- ============================================================

-- 1) Conversa: uma por cliente (numero de whatsapp)
create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null,
  nome text,
  handler text default 'bot',            -- 'bot' ou 'humano'  (o toggle controla isso)
  ultima_msg text,
  ultima_em timestamptz default now(),
  criado_em timestamptz default now(),
  unique (whatsapp)
);

-- 2) Mensagem: cada mensagem trocada
create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references conversas(id) on delete cascade,
  autor text not null,                   -- 'cliente' | 'bot' | 'humano'
  texto text,
  criado_em timestamptz default now()
);

create index if not exists idx_mensagens_conversa on mensagens(conversa_id, criado_em);

-- 3) RLS — libera leitura/escrita pelo painel (chave anon)
--    ATENCAO: liberado para qualquer um com a anon key. Em producao,
--    troque por policies com login. Ver README.
alter table conversas enable row level security;
alter table mensagens enable row level security;

drop policy if exists "anon_all_conversas" on conversas;
create policy "anon_all_conversas" on conversas for all using (true) with check (true);

drop policy if exists "anon_all_mensagens" on mensagens;
create policy "anon_all_mensagens" on mensagens for all using (true) with check (true);

-- 4) DADOS DE EXEMPLO (pode apagar depois) — pra ver a pagina funcionando
insert into conversas (id, whatsapp, nome, handler, ultima_msg, ultima_em) values
  ('11111111-1111-1111-1111-111111111111', '5524999990001@c.us', 'Joao Silva',  'bot',    'Quero um galao de 20', now() - interval '2 minutes'),
  ('22222222-2222-2222-2222-222222222222', '5524999990002@c.us', 'Maria Souza', 'humano', 'Pode entregar amanha?', now() - interval '20 minutes'),
  ('33333333-3333-3333-3333-333333333333', '5524999990003@c.us', 'Carlos Lima', 'bot',    'Obrigado!',             now() - interval '3 hours')
on conflict (whatsapp) do nothing;

insert into mensagens (conversa_id, autor, texto, criado_em) values
  ('11111111-1111-1111-1111-111111111111', 'cliente', 'Oi, boa tarde',                       now() - interval '5 minutes'),
  ('11111111-1111-1111-1111-111111111111', 'bot',     'Ola! Bem-vindo a distribuidora. Como posso ajudar? 💧', now() - interval '4 minutes'),
  ('11111111-1111-1111-1111-111111111111', 'cliente', 'Quero um galao de 20',                now() - interval '2 minutes'),

  ('22222222-2222-2222-2222-222222222222', 'cliente', 'Bom dia',                             now() - interval '40 minutes'),
  ('22222222-2222-2222-2222-222222222222', 'bot',     'Bom dia! Em que posso ajudar?',       now() - interval '38 minutes'),
  ('22222222-2222-2222-2222-222222222222', 'cliente', 'Pode entregar amanha?',               now() - interval '20 minutes'),
  ('22222222-2222-2222-2222-222222222222', 'humano',  'Claro! Amanha de manha pode ser?',    now() - interval '18 minutes'),

  ('33333333-3333-3333-3333-333333333333', 'cliente', 'Recebi o pedido, valeu',              now() - interval '3 hours 5 minutes'),
  ('33333333-3333-3333-3333-333333333333', 'bot',     'Que otimo! Obrigado pela preferencia 💧', now() - interval '3 hours 2 minutes'),
  ('33333333-3333-3333-3333-333333333333', 'cliente', 'Obrigado!',                           now() - interval '3 hours');

-- 5) Ative o Realtime nas duas tabelas:
--    Database > Publications > supabase_realtime > adicione 'conversas' e 'mensagens'
