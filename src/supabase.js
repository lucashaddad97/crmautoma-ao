import { createClient } from "@supabase/supabase-js";

// Configuração do Supabase.
// Em produção (Lovable/VPS) use variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Para rodar local agora, preencha os valores no arquivo .env (veja .env.example).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://wwlrvvcucmonckyxxzbh.supabase.co";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_ANON_KEY) {
  console.warn(
    "[AquaFlow] VITE_SUPABASE_ANON_KEY não definida. Crie um arquivo .env (veja .env.example)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
