# Deploy do AquaFlow (Vercel / Netlify)

Projeto Vite + React. O painel lê/escreve a tabela `pedidos` do Supabase em tempo real
e inclui a aba **Rotas** (roteirização de entregas para o motoboy).

## 1. Variáveis de ambiente

Você precisa de DUAS variáveis (a chave **anon**, nunca a service_role no front):

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://wwlrvvcucmonckyxxzbh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | sua chave anônima (Supabase → Project Settings → API → anon public) |

### Local
Copie `.env.example` para `.env` e preencha. Depois:
```
npm install
npm run dev
```

## 2. Deploy na Vercel
1. Suba o projeto para um repositório (GitHub/GitLab).
2. Na Vercel: **New Project** → importe o repo.
3. Framework Preset: **Vite** (detecta sozinho). Build: `npm run build`. Output: `dist`.
4. Em **Environment Variables**, adicione as duas variáveis acima.
5. **Deploy**.

## 3. Deploy na Netlify
1. **Add new site** → importe o repo.
2. Build command: `npm run build` — Publish directory: `dist`.
3. **Site settings → Environment variables**: adicione as duas variáveis.
4. **Deploy**.

> SPA de uma página só: não precisa de regra de rewrite, pois a navegação é por estado
> (não usa rotas de URL). Funciona direto.

## 4. Aba Rotas

A otimização de rota roda no próprio navegador (TSP exato para poucas paradas).
Hoje usa distância simulada só para validar o fluxo. Para precisão real de trânsito,
troque os pontos marcados com `[INTEGRAÇÃO GOOGLE]` em `src/Roteirizacao.jsx` pela
Geocoding API + Routes API do Google (coberto pelo crédito mensal de US$200 na sua escala).
