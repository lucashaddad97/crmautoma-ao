import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  MessageSquare,
  LayoutDashboard, Package, Users, BarChart3, Settings, Search, Bell,
  Sun, Moon, ChevronLeft, Plus, Clock, CheckCircle2, X, MapPin, Droplet,
  TrendingUp, AlertTriangle, RefreshCw, Phone, CreditCard, Repeat, ShoppingBag, Boxes,
  Wallet, Banknote, Smartphone, Landmark, Calendar, Route, Pencil, Download,
} from "lucide-react";
import { supabase } from "./supabase.js";
import Inbox from "./Inbox.jsx";
import Roteirizacao from "./Roteirizacao.jsx";

/* ------------------------------------------------------------------ */
/*  Design tokens — operacional, denso, identidade "água"             */
/* ------------------------------------------------------------------ */
const FONT = `'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`;
const MONO = `'IBM Plex Mono', ui-monospace, monospace`;

const STATUS = {
  recebido:  { label: "Recebido",        color: "#0ea5e9", soft: "rgba(14,165,233,.14)" },
  separado:  { label: "Separado",        color: "#f59e0b", soft: "rgba(245,158,11,.14)" },
  rota:      { label: "Saiu p/ entrega", color: "#8b5cf6", soft: "rgba(139,92,246,.14)" },
  entregue:  { label: "Entregue",        color: "#22c55e", soft: "rgba(34,197,94,.14)" },
  cancelado: { label: "Cancelado",       color: "#ef4444", soft: "rgba(239,68,68,.14)" },
};
const FLOW = ["recebido", "separado", "rota", "entregue"];

const themes = {
  dark: {
    bg: "#0a0f14", panel: "#111820", panel2: "#161f29", line: "#23303c",
    text: "#e8eef3", dim: "#93a3b3", faint: "#637585", accent: "#0ea5e9",
    accentText: "#04121c", shadow: "0 1px 0 rgba(255,255,255,.02), 0 8px 24px rgba(0,0,0,.4)",
  },
  light: {
    bg: "#eef3f7", panel: "#ffffff", panel2: "#f6f9fb", line: "#dde6ee",
    text: "#0c1620", dim: "#516170", faint: "#8ca0b0", accent: "#0284c7",
    accentText: "#ffffff", shadow: "0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.06)",
  },
};

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pedidos", label: "Pedidos", icon: Package },
  { id: "rotas", label: "Rotas", icon: Route },
  { id: "inbox", label: "Conversas", icon: MessageSquare },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  { id: "receita", label: "Receita", icon: Wallet },
  { id: "estoque", label: "Estoque", icon: Boxes },
  { id: "config", label: "Configurações", icon: Settings },
];

const brl = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const soNumero = (chatid) => (chatid || "").replace(/@c\.us|@s\.whatsapp\.net/g, "");

const tempoRelativo = (iso) => {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "agora";
  if (diff < 60) return `${Math.floor(diff)}min`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}d`;
};

/* junta o endereço do cliente com a cidade/estado configurados da operação */
const enderecoCompleto = (endereco, cfg) => {
  const partes = [endereco];
  if (cfg && cfg.cidade) partes.push(cfg.cidade);
  if (cfg && cfg.estado) partes.push(cfg.estado);
  return partes.filter(Boolean).join(", ");
};

/* link do Google Maps a partir do endereço (+ cidade/estado da config) */
const mapsLink = (endereco, cfg) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(endereco, cfg) || "")}`;

/* formata telefone BR: 5524988089834 -> (24) 98808-9834 */
const fmtTelefone = (whatsapp) => {
  let n = (whatsapp || "").replace(/@c\.us|@s\.whatsapp\.net/g, "").replace(/\D/g, "");
  if (n.startsWith("55")) n = n.slice(2); // tira DDI
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return whatsapp || "—";
};

/* descreve um item do carrinho */
const descreveItemCRM = (it) => {
  const nome = it.categoria === "gas" ? "Botijão" : "Galão";
  const un = it.categoria === "gas" ? "kg" : "L";
  const tipo = it.possui_vasilhame ? "troca" : "cheio";
  return `${it.quantidade}x ${nome} ${it.tamanho}${un} (${tipo})`;
};

/* lista de itens de um pedido (com fallback pro formato antigo de item único) */
const itensDoPedido = (o) => {
  if (Array.isArray(o.itens_pedido) && o.itens_pedido.length > 0) return o.itens_pedido;
  // fallback: pedido antigo (item único no cabeçalho)
  if (o.tamanho) return [{
    categoria: "agua", tamanho: o.tamanho, quantidade: o.quantidade,
    possui_vasilhame: o.possui_vasilhame, subtotal: o.total,
  }];
  return [];
};

/* resumo curto dos itens pra card/tabela: "2x 20L, 3x 10L" ou "Botijão 13kg" */
const resumoItensCurto = (o) => {
  const itens = itensDoPedido(o);
  if (itens.length === 0) return "—";
  if (itens.length === 1) {
    const it = itens[0];
    const un = it.categoria === "gas" ? "kg" : "L";
    return `${it.quantidade}× ${it.tamanho}${un}`;
  }
  return itens.map((it) => {
    const un = it.categoria === "gas" ? "kg" : "L";
    return `${it.quantidade}×${it.tamanho}${un}`;
  }).join(", ");
};

/* total de unidades de um pedido (soma das quantidades de todos os itens) */
const totalUnidades = (o) =>
  itensDoPedido(o).reduce((s, it) => s + Number(it.quantidade || 0), 0);

/* monta o texto do resumo pro motoboy */
const montarResumo = (o, itens, cfg) => {
  const linhasItens = (itens && itens.length)
    ? itens.map((it) => `- ${descreveItemCRM(it)} = ${brl(it.subtotal)}`).join("\n")
    : "- (itens não encontrados)";
  return [
    "*NOVO PEDIDO - AquaFlow*",
    "",
    `Cliente: ${o.cliente || "—"}`,
    `Tel: ${fmtTelefone(o.whatsapp)}`,
    "",
    "*Itens:*",
    linhasItens,
    `*Total: ${brl(o.total)}*`,
    `Pagamento: ${o.metodo_pagamento || "—"}`,
    "",
    `Endereço: ${enderecoCompleto(o.endereco, cfg) || "—"}`,
    `Maps: ${mapsLink(o.endereco, cfg)}`,
  ].join("\n");
};

/* gera e baixa um CSV a partir de linhas (array de objetos) */
const baixarCSV = (linhas, nomeArquivo) => {
  if (!linhas || !linhas.length) return;
  const colunas = Object.keys(linhas[0]);
  const escapar = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    colunas.join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(l[c])).join(";")),
  ].join("\n");
  // BOM p/ Excel reconhecer acentos
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ================================================================== */
export default function App() {
  const [mode, setMode] = useState("dark");
  const t = themes[mode];
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState("todos");
  const [dragId, setDragId] = useState(null);
  const [pedidoSel, setPedidoSel] = useState(null); // pedido aberto no modal de detalhe
  const [config, setConfig] = useState({ id: null, cidade: "", estado: "" }); // config da operação

  /* ---- Notificação sonora de novo pedido ---- */
  const [somAtivo, setSomAtivo] = useState(() => {
    try { return localStorage.getItem("aquaflow_som") !== "off"; } catch { return true; }
  });
  const somAtivoRef = useRef(somAtivo);
  useEffect(() => { somAtivoRef.current = somAtivo; }, [somAtivo]);

  // Toca um beep curto usando Web Audio (sem arquivo externo)
  const tocarBeep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.42);
    } catch (e) { /* navegador pode bloquear até interação */ }
  }, []);

  const alternarSom = useCallback((val) => {
    setSomAtivo(val);
    try { localStorage.setItem("aquaflow_som", val ? "on" : "off"); } catch {}
    if (val) tocarBeep(); // desbloqueia o áudio e confirma pro usuário
  }, [tocarBeep]);

  /* ---- Carregar pedidos do Supabase (com itens do carrinho) ---- */
  const carregar = useCallback(async () => {
    setErro(null);
    const { data, error } = await supabase
      .from("pedidos")
      .select("*,itens_pedido(*)")
      .order("criado_em", { ascending: false })
      .limit(200);
    if (error) {
      setErro(error.message);
      setLoading(false);
      return;
    }
    setPedidos(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* ---- Config da operação (cidade/estado p/ completar endereço no Maps) ---- */
  const carregarConfig = useCallback(async () => {
    try {
      const { data } = await supabase.from("configuracoes").select("*").limit(1);
      if (data && data.length > 0) setConfig(data[0]);
    } catch (e) { /* tabela pode não existir ainda */ }
  }, []);

  useEffect(() => { carregarConfig(); }, [carregarConfig]);

  const salvarConfig = useCallback(async (cidade, estado) => {
    try {
      if (config.id) {
        const { error } = await supabase.from("configuracoes")
          .update({ cidade, estado, atualizado_em: new Date().toISOString() })
          .eq("id", config.id);
        if (error) { setToast("Erro ao salvar configuração"); return; }
      } else {
        const { data, error } = await supabase.from("configuracoes")
          .insert({ cidade, estado }).select();
        if (error) { setToast("Erro ao salvar configuração"); return; }
        if (data && data[0]) setConfig(data[0]);
      }
      setConfig((c) => ({ ...c, cidade, estado }));
      setToast("Configuração salva!");
    } catch (e) { setToast("Erro ao salvar configuração"); }
  }, [config.id]);

  /* ---- Realtime: novos pedidos e mudanças entram sozinhos ---- */
  useEffect(() => {
    const canal = supabase
      .channel("pedidos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            // o Realtime só traz a linha de 'pedidos'; busca os itens do carrinho
            let novo = payload.new;
            try {
              const { data: itens } = await supabase
                .from("itens_pedido").select("*").eq("pedido_id", novo.id);
              novo = { ...novo, itens_pedido: itens || [] };
            } catch (e) { novo = { ...novo, itens_pedido: [] }; }
            setPedidos((p) => [novo, ...p.filter((x) => x.id !== novo.id)]);
            setToast(`Novo pedido • ${novo.cliente || "Cliente"}`);
            if (somAtivoRef.current) tocarBeep();
          } else if (payload.eventType === "UPDATE") {
            setPedidos((p) => p.map((x) =>
              x.id === payload.new.id
                ? { ...payload.new, itens_pedido: x.itens_pedido || payload.new.itens_pedido || [] }
                : x
            ));
          } else if (payload.eventType === "DELETE") {
            setPedidos((p) => p.filter((x) => x.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const x = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(x);
  }, [toast]);

  /* ---- Mudar status (grava no Supabase) ---- */
  const moverPedido = async (id, status) => {
    const antes = pedidos;
    setPedidos((p) => p.map((o) => (o.id === id ? { ...o, status } : o))); // otimista
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", id);
    if (error) {
      setPedidos(antes); // reverte se falhar
      setToast("Erro ao atualizar status");
    }
  };

  /* ---- Métricas ---- */
  const stats = useMemo(() => {
    const hoje0 = new Date();
    hoje0.setHours(0, 0, 0, 0);
    const doDia = pedidos.filter((o) => new Date(o.criado_em) >= hoje0);
    const ativos = pedidos.filter((o) => ["recebido", "separado", "rota"].includes(o.status));
    const entregues = pedidos.filter((o) => o.status === "entregue");
    const fatDia = doDia
      .filter((o) => o.status !== "cancelado")
      .reduce((s, o) => s + Number(o.total || 0), 0);
    const galoesDia = doDia
      .filter((o) => o.status !== "cancelado")
      .reduce((s, o) => s + totalUnidades(o), 0);
    const ticket = doDia.length ? fatDia / doDia.length : 0;
    return {
      hoje: doDia.length,
      pend: ativos.length,
      entregues: entregues.length,
      fatDia,
      galoesDia,
      ticket,
    };
  }, [pedidos]);

  /* ---- Filtro + busca ---- */
  const filtrados = useMemo(() => {
    let r = pedidos;
    if (filter !== "todos") r = r.filter((o) => o.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((o) =>
        [o.cliente, o.whatsapp, o.endereco, o.tamanho, o.metodo_pagamento]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q))
      );
    }
    return r;
  }, [pedidos, filter, query]);

  const railW = collapsed ? 64 : 232;

  return (
    <div style={{ fontFamily: FONT, background: t.bg, color: t.text, minHeight: "100vh", display: "flex" }}>
      <GlobalStyle t={t} />

      {/* Sidebar */}
      <aside className="rail" style={{
        width: railW, flexShrink: 0, background: t.panel, borderRight: `1px solid ${t.line}`,
        display: "flex", flexDirection: "column", padding: "16px 12px", gap: 4,
        position: "sticky", top: 0, height: "100vh", transition: "width .22s ease",
      }}>
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 18px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: t.accent,
            display: "grid", placeItems: "center", color: t.accentText, flexShrink: 0 }}>
            <Droplet size={17} strokeWidth={2.4} fill={t.accentText} />
          </div>
          {!collapsed && (
            <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-.02em" }}>
              Aqua<span style={{ color: t.dim }}>Flow</span>
            </span>
          )}
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((n) => {
            const on = active === n.id;
            const Ic = n.icon;
            const badge = n.id === "pedidos" && stats.pend ? stats.pend : null;
            return (
              <button key={n.id} className="navitem" onClick={() => setActive(n.id)} title={n.label}
                style={{
                  display: "flex", alignItems: "center", gap: 11, padding: "9px 10px",
                  borderRadius: 9, border: "none", background: on ? t.panel2 : "transparent",
                  color: on ? t.text : t.dim, fontSize: 13.5, fontWeight: on ? 600 : 500,
                  position: "relative", justifyContent: collapsed ? "center" : "flex-start",
                }}>
                {on && <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: t.accent }} />}
                <Ic size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
                {!collapsed && <span className="navlabel">{n.label}</span>}
                {!collapsed && badge && (
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600,
                    background: STATUS.recebido.soft, color: STATUS.recebido.color,
                    padding: "1px 7px", borderRadius: 20 }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>
        <button className="collapse" onClick={() => setCollapsed((c) => !c)}
          style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
            background: "transparent", border: "none", color: t.faint, fontSize: 12.5, borderRadius: 9 }}>
          <ChevronLeft size={16} style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: ".2s" }} />
          {!collapsed && "Recolher"}
        </button>
      </aside>

      {/* Main */}
      <main className="main" style={{ flex: 1, minWidth: 0, padding: "20px 26px 40px" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 460 }}>
            <Search size={16} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: t.faint }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, telefone, endereço…"
              style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 11,
                border: `1px solid ${t.line}`, background: t.panel, color: t.text,
                fontSize: 13.5, outline: "none", fontFamily: FONT }} />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <IconBtn t={t} onClick={carregar} title="Atualizar"><RefreshCw size={17} /></IconBtn>
            <IconBtn t={t}><Bell size={18} /></IconBtn>
            <IconBtn t={t} onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}>
              {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </IconBtn>
          </div>
        </header>

        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 600, letterSpacing: "-.03em" }}>
            {NAV.find((n) => n.id === active)?.label}
          </h1>
          <span style={{ color: t.faint, fontSize: 13 }}>
            {loading ? "carregando…" : `${pedidos.length} pedidos`}
          </span>
        </div>

        {erro && <ErroBox t={t} msg={erro} onRetry={carregar} />}

        {active === "dashboard" && (
          <DashboardView t={t} stats={stats} pedidos={pedidos} mover={moverPedido}
            dragId={dragId} setDragId={setDragId} loading={loading} onAbrir={setPedidoSel} />
        )}
        {active === "pedidos" && (
          <PedidosView t={t} pedidos={filtrados} mover={moverPedido}
            filter={filter} setFilter={setFilter} loading={loading} onAbrir={setPedidoSel} />
        )}
        {active === "inbox" && <Inbox t={t} />}
        {active === "rotas" && (
          <Roteirizacao t={t} pedidos={pedidos} config={config} setToast={setToast} />
        )}
        {active === "clientes" && <ClientesView t={t} pedidos={pedidos} />}
        {active === "relatorios" && <RelatoriosView t={t} pedidos={pedidos} stats={stats} />}
        {active === "receita" && <ReceitaView t={t} pedidos={pedidos} />}
        {active === "estoque" && <EstoqueView t={t} setToast={setToast} />}
        {active === "config" && <ConfigView t={t} somAtivo={somAtivo} alternarSom={alternarSom} tocarBeep={tocarBeep} config={config} salvarConfig={salvarConfig} />}
      </main>

      {toast && (
        <div style={{ position: "fixed", bottom: 22, right: 22, background: t.panel,
          border: `1px solid ${t.line}`, borderRadius: 12, padding: "12px 16px",
          boxShadow: t.shadow, display: "flex", alignItems: "center", gap: 10,
          animation: "toastIn .3s ease both", zIndex: 100 }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: t.accent }} className="pulse" />
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{toast}</span>
        </div>
      )}

      {pedidoSel && (
        <PedidoModal t={t} o={pedidoSel} onClose={() => setPedidoSel(null)} setToast={setToast} config={config} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  DASHBOARD                                                          */
/* ================================================================== */
function DashboardView({ t, stats, pedidos, mover, dragId, setDragId, loading, onAbrir }) {
  const cards = [
    { k: "Pedidos hoje", v: stats.hoje, icon: Package, sub: "no dia" },
    { k: "Pendentes", v: stats.pend, icon: Clock, sub: "em operação", warn: stats.pend > 8 },
    { k: "Faturamento hoje", v: brl(stats.fatDia), icon: TrendingUp, sub: `ticket ${brl(stats.ticket)}`, money: true },
    { k: "Itens hoje", v: stats.galoesDia, icon: Droplet, sub: "água + gás" },
  ];
  return (
    <>
      <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {cards.map((c, i) => {
          const Ic = c.icon;
          return (
            <div key={c.k} className="card" style={{ background: t.panel, border: `1px solid ${t.line}`,
              borderRadius: 14, padding: "16px 18px", boxShadow: t.shadow, animationDelay: `${i * 60}ms` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, color: t.dim, fontWeight: 500 }}>{c.k}</span>
                <div style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
                  background: c.warn ? STATUS.separado.soft : t.panel2,
                  color: c.warn ? STATUS.separado.color : t.accent }}>
                  <Ic size={16} />
                </div>
              </div>
              <div style={{ fontSize: c.money ? 22 : 28, fontWeight: 700, letterSpacing: "-.03em", fontFamily: c.money ? FONT : MONO }}>
                {c.v}
              </div>
              <div style={{ fontSize: 12, color: t.faint, marginTop: 4 }}>{c.sub}</div>
            </div>
          );
        })}
      </div>
      <Kanban t={t} pedidos={pedidos} mover={mover} dragId={dragId} setDragId={setDragId} loading={loading} onAbrir={onAbrir} />
    </>
  );
}

/* ---- Kanban com drag-and-drop ---- */
function Kanban({ t, pedidos, mover, dragId, setDragId, loading, onAbrir }) {
  const cols = FLOW;
  return (
    <div className="kanban" style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length},1fr)`, gap: 14 }}>
      {cols.map((col) => {
        const itens = pedidos.filter((o) => o.status === col);
        const s = STATUS[col];
        return (
          <div key={col}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) { mover(dragId, col); setDragId(null); } }}
            style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14,
              padding: 12, minHeight: 200, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 6px" }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: s.color }} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: t.faint, fontFamily: MONO }}>{itens.length}</span>
            </div>
            {loading && <Skeleton t={t} />}
            {!loading && itens.length === 0 && (
              <div style={{ color: t.faint, fontSize: 12.5, textAlign: "center", padding: "20px 0" }}>vazio</div>
            )}
            {itens.map((o) => (
              <PedidoCard key={o.id} t={t} o={o} draggable onAbrir={onAbrir}
                onDragStart={() => setDragId(o.id)} onDragEnd={() => setDragId(null)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PedidoCard({ t, o, draggable, onDragStart, onDragEnd, onAbrir }) {
  const s = STATUS[o.status] || STATUS.recebido;
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={() => onAbrir && onAbrir(o)}
      style={{ background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 11,
        padding: "11px 12px", cursor: "pointer", boxShadow: t.shadow }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{o.cliente || "Cliente"}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, fontFamily: MONO,
          background: s.soft, color: s.color, padding: "2px 7px", borderRadius: 6 }}>
          {brl(o.total)}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {itensDoPedido(o).slice(0, 3).map((it, idx) => (
          <Chip key={idx} t={t} icon={it.categoria === "gas" ? ShoppingBag : Droplet}>
            {it.quantidade}× {it.tamanho}{it.categoria === "gas" ? "kg" : "L"} {it.possui_vasilhame ? "troca" : "cheio"}
          </Chip>
        ))}
        {itensDoPedido(o).length > 3 && (
          <Chip t={t}>+{itensDoPedido(o).length - 3}</Chip>
        )}
        {itensDoPedido(o).length === 0 && <Chip t={t}>sem itens</Chip>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.dim }}>
        {o.endereco && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.endereco}</span>
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CreditCard size={12} /> {o.metodo_pagamento || "—"}
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  PEDIDOS (lista + filtros)                                          */
/* ================================================================== */
function PedidosView({ t, pedidos, mover, filter, setFilter, loading, onAbrir }) {
  const filtros = ["todos", ...Object.keys(STATUS)];
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {filtros.map((f) => {
          const on = filter === f;
          const lbl = f === "todos" ? "Todos" : STATUS[f].label;
          const col = f === "todos" ? t.accent : STATUS[f].color;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "7px 13px", borderRadius: 9, fontSize: 13, fontWeight: 500,
                border: `1px solid ${on ? col : t.line}`,
                background: on ? (f === "todos" ? t.accent : STATUS[f].soft) : t.panel,
                color: on ? (f === "todos" ? t.accentText : col) : t.dim }}>
              {lbl}
            </button>
          );
        })}
      </div>
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden", boxShadow: t.shadow }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: t.panel2, color: t.dim, textAlign: "left" }}>
              {["Cliente", "Itens", "Qtd", "Endereço", "Pagamento", "Total", "Status", "Quando"].map((h) => (
                <th key={h} style={{ padding: "11px 14px", fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${t.line}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: t.faint }}>Carregando…</td></tr>
            )}
            {!loading && pedidos.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: t.faint }}>Nenhum pedido encontrado</td></tr>
            )}
            {pedidos.map((o) => {
              const s = STATUS[o.status] || STATUS.recebido;
              return (
                <tr key={o.id} onClick={() => onAbrir && onAbrir(o)}
                  style={{ borderBottom: `1px solid ${t.line}`, cursor: "pointer" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 600 }}>
                    {o.cliente || "—"}
                    <div style={{ fontSize: 11.5, color: t.faint, fontFamily: MONO, fontWeight: 400 }}>
                      {soNumero(o.whatsapp)}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumoItensCurto(o)}</td>
                  <td style={{ padding: "11px 14px", color: t.dim }}>{totalUnidades(o)} un.</td>
                  <td style={{ padding: "11px 14px", color: t.dim, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.endereco || "—"}</td>
                  <td style={{ padding: "11px 14px", color: t.dim }}>{o.metodo_pagamento || "—"}</td>
                  <td style={{ padding: "11px 14px", fontWeight: 600, fontFamily: MONO }}>{brl(o.total)}</td>
                  <td style={{ padding: "11px 14px" }} onClick={(e) => e.stopPropagation()}>
                    <select value={o.status} onChange={(e) => mover(o.id, e.target.value)}
                      style={{ background: s.soft, color: s.color, border: `1px solid ${s.color}33`,
                        borderRadius: 7, padding: "4px 8px", fontSize: 12.5, fontWeight: 600,
                        fontFamily: FONT, outline: "none", cursor: "pointer" }}>
                      {Object.keys(STATUS).map((k) => (
                        <option key={k} value={k} style={{ background: t.panel, color: t.text }}>{STATUS[k].label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "11px 14px", color: t.faint, fontFamily: MONO, fontSize: 12 }}>{tempoRelativo(o.criado_em)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================== */
/*  CLIENTES (agrupado por whatsapp)                                   */
/* ================================================================== */
function ClientesView({ t, pedidos }) {
  const clientes = useMemo(() => {
    const m = {};
    pedidos.forEach((o) => {
      const k = o.whatsapp || o.cliente || "—";
      if (!m[k]) m[k] = { nome: o.cliente, whatsapp: o.whatsapp, pedidos: 0, total: 0, ultimo: o.criado_em, endereco: o.endereco };
      m[k].pedidos += 1;
      if (o.status !== "cancelado") m[k].total += Number(o.total || 0);
      if (new Date(o.criado_em) > new Date(m[k].ultimo)) { m[k].ultimo = o.criado_em; m[k].endereco = o.endereco; }
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [pedidos]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
      {clientes.length === 0 && <span style={{ color: t.faint }}>Nenhum cliente ainda.</span>}
      {clientes.map((c, i) => (
        <div key={i} style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 16, boxShadow: t.shadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: t.panel2, display: "grid", placeItems: "center", color: t.accent, fontWeight: 700, fontSize: 16 }}>
              {(c.nome || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nome || "Cliente"}</div>
              <div style={{ fontSize: 12, color: t.faint, fontFamily: MONO, display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={11} /> {soNumero(c.whatsapp)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, marginBottom: 10 }}>
            <div><div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO }}>{c.pedidos}</div><div style={{ fontSize: 11, color: t.faint }}>pedidos</div></div>
            <div><div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO, color: t.accent }}>{brl(c.total)}</div><div style={{ fontSize: 11, color: t.faint }}>total gasto</div></div>
          </div>
          {c.endereco && (
            <div style={{ fontSize: 12, color: t.dim, display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={12} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.endereco}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  RELATÓRIOS                                                         */
/* ================================================================== */
function RelatoriosView({ t, pedidos, stats }) {
  const porTamanho = useMemo(() => {
    const m = {};
    pedidos.filter((o) => o.status !== "cancelado").forEach((o) => {
      itensDoPedido(o).forEach((it) => {
        const un = it.categoria === "gas" ? "kg" : "L";
        const nome = it.categoria === "gas" ? "Gás" : "Água";
        const k = `${nome} ${it.tamanho}${un}`;
        if (!m[k]) m[k] = { qtd: 0, receita: 0 };
        m[k].qtd += Number(it.quantidade || 0);
        m[k].receita += Number(it.subtotal || 0);
      });
    });
    return Object.entries(m).sort((a, b) => b[1].receita - a[1].receita);
  }, [pedidos]);

  const maxR = Math.max(1, ...porTamanho.map(([, v]) => v.receita));
  const totalGeral = pedidos.filter((o) => o.status !== "cancelado").reduce((s, o) => s + Number(o.total || 0), 0);

  const exportar = () => {
    const linhas = pedidos
      .filter((o) => o.status !== "cancelado")
      .map((o) => ({
        data: new Date(o.criado_em).toLocaleString("pt-BR"),
        cliente: o.cliente || "",
        telefone: soNumero(o.whatsapp),
        endereco: o.endereco || "",
        itens: resumoItensCurto(o),
        pagamento: o.metodo_pagamento || "",
        status: o.status,
        total: Number(o.total || 0).toFixed(2).replace(".", ","),
      }));
    baixarCSV(linhas, `relatorio-pedidos-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={exportar}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9,
            border: `1px solid ${t.line}`, background: t.panel, color: t.text, fontWeight: 600, fontSize: 13 }}>
          <Download size={15} /> Exportar CSV
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, boxShadow: t.shadow }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Receita por tamanho</h3>
        {porTamanho.length === 0 && <span style={{ color: t.faint, fontSize: 13 }}>Sem dados.</span>}
        {porTamanho.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
              <span style={{ fontWeight: 600 }}>{k}</span>
              <span style={{ fontFamily: MONO, color: t.dim }}>{brl(v.receita)} · {v.qtd} un</span>
            </div>
            <div style={{ height: 8, background: t.panel2, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${(v.receita / maxR) * 100}%`, height: "100%", background: t.accent, borderRadius: 6, transition: "width .5s" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, boxShadow: t.shadow }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Resumo geral</h3>
        <Linha t={t} label="Total de pedidos" v={pedidos.length} />
        <Linha t={t} label="Entregues" v={stats.entregues} />
        <Linha t={t} label="Em operação" v={stats.pend} />
        <Linha t={t} label="Cancelados" v={pedidos.filter((o) => o.status === "cancelado").length} />
        <div style={{ height: 1, background: t.line, margin: "12px 0" }} />
        <Linha t={t} label="Receita total" v={brl(totalGeral)} forte />
      </div>
      </div>
    </div>
  );
}

function Linha({ t, label, v, forte }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0" }}>
      <span style={{ fontSize: 13.5, color: t.dim }}>{label}</span>
      <span style={{ fontSize: forte ? 17 : 15, fontWeight: 700, fontFamily: MONO, color: forte ? t.accent : t.text }}>{v}</span>
    </div>
  );
}

/* ================================================================== */
/*  RECEITA (por forma de pagamento)                                  */
/* ================================================================== */

/* normaliza qualquer variação de texto do metodo_pagamento num balde fixo */
const normalizaPagamento = (raw) => {
  const s = (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // tira acentos: crédito -> credito
  if (!s.trim()) return "outros";
  if (s.includes("pix")) return "pix";
  if (s.includes("credito") || s.includes("credit")) return "credito";
  if (s.includes("debito") || s.includes("debit")) return "debito";
  // "cartao" sem especificar crédito/débito -> assume crédito
  if (s.includes("cartao") || s.includes("card")) return "credito";
  if (s.includes("dinheiro") || s.includes("especie") || s.includes("cash") || s.includes("vista")) return "dinheiro";
  return "outros";
};

/* metadados de cada forma de pagamento (ordem, rótulo, cor, ícone) */
const PAGAMENTOS = {
  pix:      { label: "Pix",            color: "#22c55e", soft: "rgba(34,197,94,.14)",  icon: Smartphone },
  credito:  { label: "Cartão crédito", color: "#0ea5e9", soft: "rgba(14,165,233,.14)", icon: CreditCard },
  debito:   { label: "Cartão débito",  color: "#8b5cf6", soft: "rgba(139,92,246,.14)", icon: Landmark },
  dinheiro: { label: "Dinheiro",       color: "#f59e0b", soft: "rgba(245,158,11,.14)", icon: Banknote },
  outros:   { label: "Outros",         color: "#637585", soft: "rgba(99,117,133,.14)", icon: Wallet },
};
const ORDEM_PGTO = ["pix", "credito", "debito", "dinheiro", "outros"];

const PERIODOS = [
  { id: "hoje",   label: "Hoje" },
  { id: "7d",     label: "7 dias" },
  { id: "30d",    label: "30 dias" },
  { id: "todos",  label: "Tudo" },
];

function ReceitaView({ t, pedidos }) {
  const [periodo, setPeriodo] = useState("hoje");

  const dados = useMemo(() => {
    const agora = new Date();
    let limite = null;
    if (periodo === "hoje") {
      limite = new Date(); limite.setHours(0, 0, 0, 0);
    } else if (periodo === "7d") {
      limite = new Date(agora.getTime() - 7 * 86400000);
    } else if (periodo === "30d") {
      limite = new Date(agora.getTime() - 30 * 86400000);
    }

    // só pedidos válidos (não cancelados) e dentro do período
    const validos = pedidos.filter((o) => {
      if (o.status === "cancelado") return false;
      if (limite && new Date(o.criado_em) < limite) return false;
      return true;
    });

    // inicializa todos os baldes em zero pra sempre aparecerem
    const baldes = {};
    ORDEM_PGTO.forEach((k) => { baldes[k] = { receita: 0, qtd: 0 }; });

    let total = 0;
    validos.forEach((o) => {
      const k = normalizaPagamento(o.metodo_pagamento);
      const v = Number(o.total || 0);
      baldes[k].receita += v;
      baldes[k].qtd += 1;
      total += v;
    });

    // só mantém "outros" se realmente houver algo nele
    const chaves = ORDEM_PGTO.filter((k) => k !== "outros" || baldes.outros.qtd > 0);

    const ticket = validos.length ? total / validos.length : 0;
    return { baldes, chaves, total, ticket, nPedidos: validos.length };
  }, [pedidos, periodo]);

  const maxR = Math.max(1, ...dados.chaves.map((k) => dados.baldes[k].receita));

  const exportarReceita = () => {
    const linhas = dados.chaves.map((k) => ({
      forma_pagamento: PAGAMENTOS[k].label,
      qtd_pedidos: dados.baldes[k].qtd,
      receita: dados.baldes[k].receita.toFixed(2).replace(".", ","),
    }));
    linhas.push({ forma_pagamento: "TOTAL", qtd_pedidos: dados.nPedidos, receita: dados.total.toFixed(2).replace(".", ",") });
    const per = PERIODOS.find((p) => p.id === periodo)?.label || periodo;
    baixarCSV(linhas, `receita-${per}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <>
      {/* filtro de período — mesmo estilo dos chips de Pedidos */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {PERIODOS.map((p) => {
          const on = periodo === p.id;
          return (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9,
                fontSize: 13, fontWeight: 500, border: `1px solid ${on ? t.accent : t.line}`,
                background: on ? t.accent : t.panel, color: on ? t.accentText : t.dim }}>
              <Calendar size={13} /> {p.label}
            </button>
          );
        })}
        <button onClick={exportarReceita}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 9,
            border: `1px solid ${t.line}`, background: t.panel, color: t.text, fontWeight: 600, fontSize: 13 }}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* card de receita total no topo */}
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14,
        padding: "18px 20px", boxShadow: t.shadow, marginBottom: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12.5, color: t.dim, fontWeight: 500, marginBottom: 6 }}>
            Receita {periodo === "todos" ? "total" : `(${PERIODOS.find((p) => p.id === periodo).label.toLowerCase()})`}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.03em" }}>{brl(dados.total)}</div>
        </div>
        <div style={{ display: "flex", gap: 26 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO }}>{dados.nPedidos}</div>
            <div style={{ fontSize: 11.5, color: t.faint }}>pedidos</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO, color: t.accent }}>{brl(dados.ticket)}</div>
            <div style={{ fontSize: 11.5, color: t.faint }}>ticket médio</div>
          </div>
        </div>
      </div>

      {/* cards por forma de pagamento */}
      <div className="cards" style={{ display: "grid", gridTemplateColumns: `repeat(${dados.chaves.length},1fr)`, gap: 14, marginBottom: 14 }}>
        {dados.chaves.map((k, i) => {
          const meta = PAGAMENTOS[k];
          const b = dados.baldes[k];
          const Ic = meta.icon;
          const pct = dados.total > 0 ? (b.receita / dados.total) * 100 : 0;
          return (
            <div key={k} className="card" style={{ background: t.panel, border: `1px solid ${t.line}`,
              borderRadius: 14, padding: "16px 18px", boxShadow: t.shadow, animationDelay: `${i * 60}ms` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, color: t.dim, fontWeight: 500 }}>{meta.label}</span>
                <div style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
                  background: meta.soft, color: meta.color }}>
                  <Ic size={16} />
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.03em" }}>{brl(b.receita)}</div>
              <div style={{ fontSize: 12, color: t.faint, marginTop: 4 }}>
                {b.qtd} {b.qtd === 1 ? "pedido" : "pedidos"} · {pct.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* barra comparativa por forma de pagamento */}
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, boxShadow: t.shadow }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Comparativo por forma de pagamento</h3>
        {dados.total === 0 && <span style={{ color: t.faint, fontSize: 13 }}>Sem receita no período.</span>}
        {dados.total > 0 && dados.chaves.map((k) => {
          const meta = PAGAMENTOS[k];
          const b = dados.baldes[k];
          return (
            <div key={k} style={{ marginBottom: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: meta.color }} />
                  {meta.label}
                </span>
                <span style={{ fontFamily: MONO, color: t.dim }}>{brl(b.receita)} · {b.qtd} ped</span>
              </div>
              <div style={{ height: 8, background: t.panel2, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${(b.receita / maxR) * 100}%`, height: "100%", background: meta.color, borderRadius: 6, transition: "width .5s" }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ================================================================== */
/*  MODAL DETALHE DO PEDIDO (+ resumo pro motoboy)                     */
/* ================================================================== */
function PedidoModal({ t, o, onClose, setToast, config }) {
  // se os itens já vieram com o pedido (join no carregar), usa direto
  const itensIniciais = Array.isArray(o.itens_pedido) ? o.itens_pedido : null;
  const [itens, setItens] = useState(itensIniciais);
  const [erroItens, setErroItens] = useState(false);

  // edição manual do pedido
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    cliente: o.cliente || "",
    endereco: o.endereco || "",
    metodo_pagamento: o.metodo_pagamento || "",
    status: o.status || "recebido",
    total: o.total ?? "",
  });

  const salvarEdicao = async () => {
    setSalvando(true);
    const patch = {
      cliente: form.cliente.trim() || null,
      endereco: form.endereco.trim() || null,
      metodo_pagamento: form.metodo_pagamento.trim() || null,
      status: form.status,
      total: form.total === "" ? null : Number(form.total),
    };
    const { error } = await supabase.from("pedidos").update(patch).eq("id", o.id);
    setSalvando(false);
    if (error) { setToast("Erro ao salvar: " + error.message); return; }
    // reflete local (o realtime também atualiza, mas evita flicker)
    Object.assign(o, patch);
    setEditando(false);
    setToast("Pedido atualizado!");
  };

  useEffect(() => {
    if (itensIniciais && itensIniciais.length > 0) return; // já temos os itens
    let ativo = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("itens_pedido")
          .select("*")
          .eq("pedido_id", o.id)
          .order("id", { ascending: true });
        if (!ativo) return;
        if (error) { setErroItens(true); setItens([]); return; }
        setItens(data || []);
      } catch (e) {
        if (ativo) { setErroItens(true); setItens([]); }
      }
    })();
    return () => { ativo = false; };
  }, [o.id]);

  const copiar = async (texto, msg) => {
    try {
      await navigator.clipboard.writeText(texto);
      setToast(msg || "Copiado!");
    } catch (e) {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setToast(msg || "Copiado!"); } catch {}
      document.body.removeChild(ta);
    }
  };

  const s = STATUS[o.status] || STATUS.recebido;
  const linkMaps = mapsLink(o.endereco, config);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 100,
        display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 16,
          width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.5)", animation: "slideUp .3s both" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${t.line}`, position: "sticky", top: 0,
          background: t.panel, borderRadius: "16px 16px 0 0" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{o.cliente || "Cliente"}</div>
            <div style={{ fontSize: 12.5, color: t.dim, fontFamily: MONO }}>{fmtTelefone(o.whatsapp)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, fontFamily: MONO,
              background: s.soft, color: s.color, padding: "3px 9px", borderRadius: 7 }}>{s.label}</span>
            {!editando && (
              <button onClick={() => setEditando(true)} title="Editar pedido"
                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`,
                  background: t.panel2, color: t.accent, display: "grid", placeItems: "center" }}><Pencil size={15} /></button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`,
              background: t.panel2, color: t.dim, display: "grid", placeItems: "center" }}><X size={16} /></button>
          </div>
        </div>

        {/* corpo */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {editando && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12,
              background: t.panel2, border: `1px solid ${t.accent}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: t.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Editando pedido</div>
              {[
                { k: "cliente", label: "Cliente", type: "text" },
                { k: "endereco", label: "Endereço", type: "text" },
              ].map((f) => (
                <div key={f.k}>
                  <label style={{ fontSize: 12, color: t.dim, display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input value={form[f.k]} onChange={(e) => setForm((p) => ({ ...p, [f.k]: e.target.value }))}
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${t.line}`,
                      background: t.panel, color: t.text, fontSize: 14, fontFamily: FONT, boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: t.dim, display: "block", marginBottom: 4 }}>Pagamento</label>
                  <input value={form.metodo_pagamento} onChange={(e) => setForm((p) => ({ ...p, metodo_pagamento: e.target.value }))}
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${t.line}`,
                      background: t.panel, color: t.text, fontSize: 14, fontFamily: FONT, boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: t.dim, display: "block", marginBottom: 4 }}>Total (R$)</label>
                  <input type="number" step="0.01" value={form.total} onChange={(e) => setForm((p) => ({ ...p, total: e.target.value }))}
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${t.line}`,
                      background: t.panel, color: t.text, fontSize: 14, fontFamily: MONO, boxSizing: "border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: t.dim, display: "block", marginBottom: 4 }}>Status</label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${t.line}`,
                    background: t.panel, color: t.text, fontSize: 14, fontFamily: FONT }}>
                  {Object.keys(STATUS).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={salvarEdicao} disabled={salvando}
                  style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: t.accent,
                    color: t.accentText, fontWeight: 700, fontSize: 13.5 }}>
                  {salvando ? "Salvando…" : "Salvar alterações"}
                </button>
                <button onClick={() => { setEditando(false); setForm({ cliente: o.cliente||"", endereco: o.endereco||"", metodo_pagamento: o.metodo_pagamento||"", status: o.status||"recebido", total: o.total??"" }); }}
                  style={{ padding: "10px 16px", borderRadius: 9, border: `1px solid ${t.line}`,
                    background: t.panel, color: t.dim, fontWeight: 600, fontSize: 13.5 }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: t.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Itens</div>
            {itens === null && <div style={{ color: t.faint, fontSize: 13 }}>Carregando itens…</div>}
            {itens && itens.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {itens.map((it) => (
                  <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 13.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Droplet size={13} style={{ color: it.categoria === "gas" ? STATUS.separado.color : t.accent }} />
                      {descreveItemCRM(it)}
                    </span>
                    <span style={{ fontWeight: 600, fontFamily: MONO }}>{brl(it.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
            {itens && itens.length === 0 && (
              <div style={{ color: t.faint, fontSize: 13 }}>
                {erroItens ? "Não foi possível carregar os itens." : "Pedido sem itens detalhados."}
              </div>
            )}
          </div>

          {/* total + pagamento */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: `1px solid ${t.line}`, paddingTop: 12 }}>
            <span style={{ fontSize: 13, color: t.dim }}>Pagamento: <strong style={{ color: t.text }}>{o.metodo_pagamento || "—"}</strong></span>
            <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO }}>{brl(o.total)}</span>
          </div>

          {/* endereço + maps */}
          <div style={{ background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 11, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
              <MapPin size={15} style={{ color: t.accent, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{o.endereco || "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href={linkMaps} target="_blank" rel="noreferrer"
                style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "9px 12px", borderRadius: 9,
                  background: t.accent, color: t.accentText, fontWeight: 600, fontSize: 13 }}>
                Abrir no Maps
              </a>
              <button onClick={() => copiar(linkMaps, "Link do Maps copiado!")}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: `1px solid ${t.line}`,
                  background: t.panel, color: t.text, fontWeight: 600, fontSize: 13 }}>
                Copiar link
              </button>
            </div>
          </div>

          {/* botão copiar resumo */}
          <button onClick={() => copiar(montarResumo(o, itens || [], config), "Resumo copiado! Cole no WhatsApp do motoboy.")}
            disabled={itens === null}
            style={{ padding: "12px", borderRadius: 11, border: "none", background: itens === null ? t.line : "#22c55e",
              color: "#fff", fontWeight: 700, fontSize: 14, opacity: itens === null ? .6 : 1 }}>
            Copiar resumo do pedido
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ESTOQUE                                                            */
/* ================================================================== */
function EstoqueView({ t, setToast }) {
  const [produtos, setProdutos] = useState(null); // null = carregando
  const [editando, setEditando] = useState({}); // { id: valorEditado }
  const [salvando, setSalvando] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .order("tipo", { ascending: true });
      if (error) { setProdutos([]); return; }
      // ordena por tipo e modelo numérico
      const ord = (data || []).sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
        return parseInt(a.modelo) - parseInt(b.modelo);
      });
      setProdutos(ord);
    } catch (e) { setProdutos([]); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (prod) => {
    const novoValor = editando[prod.id];
    if (novoValor === undefined || novoValor === "") return;
    const valorNum = parseInt(novoValor);
    if (isNaN(valorNum)) { setToast("Informe um número válido"); return; }
    setSalvando(prod.id);
    try {
      const { error } = await supabase
        .from("produtos")
        .update({ estoque: valorNum })
        .eq("id", prod.id);
      if (error) { setToast("Erro ao salvar estoque"); setSalvando(null); return; }
      setProdutos((ps) => ps.map((p) => (p.id === prod.id ? { ...p, estoque: valorNum } : p)));
      setEditando((e) => { const c = { ...e }; delete c[prod.id]; return c; });
      setToast("Estoque atualizado!");
    } catch (e) { setToast("Erro ao salvar estoque"); }
    setSalvando(null);
  };

  const nomeProduto = (p) => {
    const un = p.tipo === "botijao" ? "kg" : "L";
    const nome = p.tipo === "botijao" ? "Botijão" : "Galão";
    return `${nome} ${p.modelo}${un}`;
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 22, boxShadow: t.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Estoque de produtos</h3>
          <button onClick={carregar}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9,
              border: `1px solid ${t.line}`, background: t.panel2, color: t.dim, fontSize: 12.5, fontWeight: 600 }}>
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
        <p style={{ color: t.dim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 18px" }}>
          A quantidade diminui automaticamente a cada pedido feito pelo bot. Quando chegar mercadoria nova,
          ajuste o valor aqui e salve. Estoque negativo indica que vendeu mais do que tinha cadastrado.
        </p>

        {produtos === null && <div style={{ color: t.faint, fontSize: 13 }}>Carregando produtos…</div>}
        {produtos && produtos.length === 0 && <div style={{ color: t.faint, fontSize: 13 }}>Nenhum produto encontrado.</div>}

        {produtos && produtos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {produtos.map((p) => {
              const emEdicao = editando[p.id] !== undefined;
              const valorMostrado = emEdicao ? editando[p.id] : p.estoque;
              const negativo = (p.estoque ?? 0) < 0;
              const zerado = (p.estoque ?? 0) === 0;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  background: t.panel2, border: `1px solid ${negativo ? "#ef4444" : t.line}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Droplet size={16} style={{ color: p.tipo === "botijao" ? "#f59e0b" : t.accent }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{nomeProduto(p)}</div>
                      <div style={{ fontSize: 12, color: negativo ? "#ef4444" : zerado ? "#f59e0b" : t.faint }}>
                        {negativo ? `Em falta (${p.estoque})` : zerado ? "Esgotado" : `${p.estoque} em estoque`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" value={valorMostrado}
                      onChange={(e) => setEditando((ed) => ({ ...ed, [p.id]: e.target.value }))}
                      style={{ width: 80, padding: "8px 10px", borderRadius: 8, fontSize: 14, textAlign: "center",
                        border: `1px solid ${t.line}`, background: t.panel, color: t.text, outline: "none" }} />
                    <button onClick={() => salvar(p)} disabled={!emEdicao || salvando === p.id}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
                        background: emEdicao ? t.accent : t.line, color: emEdicao ? t.accentText : t.faint,
                        cursor: emEdicao ? "pointer" : "default" }}>
                      {salvando === p.id ? "..." : "Salvar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  CONFIG                                                             */
/* ================================================================== */
function ConfigView({ t, somAtivo, alternarSom, tocarBeep, config, salvarConfig }) {
  const [cidade, setCidade] = useState(config?.cidade || "");
  const [estado, setEstado] = useState(config?.estado || "");
  useEffect(() => { setCidade(config?.cidade || ""); setEstado(config?.estado || ""); }, [config]);

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 9, fontSize: 14,
    border: `1px solid ${t.line}`, background: t.panel2, color: t.text, outline: "none",
  };
  const mudou = cidade !== (config?.cidade || "") || estado !== (config?.estado || "");

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      {/* Cidade/estado da operação (completa o endereço no Maps) */}
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 22, boxShadow: t.shadow }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Região de atendimento</h3>
        <p style={{ color: t.dim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
          Cidade e estado onde sua operação entrega. O sistema completa automaticamente o endereço do
          cliente com essas informações ao gerar o link do Google Maps, evitando confusão entre ruas de
          mesmo nome em cidades diferentes.
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 220px" }}>
            <label style={{ display: "block", fontSize: 12.5, color: t.faint, fontWeight: 600, marginBottom: 6 }}>Cidade</label>
            <input value={cidade} onChange={(e) => setCidade(e.target.value)}
              placeholder="ex: Rio de Janeiro" style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ display: "block", fontSize: 12.5, color: t.faint, fontWeight: 600, marginBottom: 6 }}>Estado (UF)</label>
            <input value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="RJ" maxLength={2} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => salvarConfig(cidade.trim(), estado.trim())} disabled={!mudou}
            style={{ padding: "10px 20px", borderRadius: 9, border: "none", fontWeight: 600, fontSize: 13.5,
              background: mudou ? t.accent : t.line, color: mudou ? t.accentText : t.faint,
              cursor: mudou ? "pointer" : "default" }}>
            Salvar
          </button>
          {(config?.cidade || config?.estado) && (
            <span style={{ fontSize: 12.5, color: t.dim }}>
              Atual: {[config.cidade, config.estado].filter(Boolean).join(", ") || "não definido"}
            </span>
          )}
        </div>
      </div>

      {/* Notificações de novo pedido */}
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 22, boxShadow: t.shadow }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Notificações de novo pedido</h3>
        <p style={{ color: t.dim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
          Toca um alerta sonoro neste navegador sempre que um novo pedido entra. Mantenha esta aba aberta para receber os avisos.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={18} style={{ color: somAtivo ? t.accent : t.faint }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Alerta sonoro</div>
              <div style={{ fontSize: 12.5, color: t.dim }}>{somAtivo ? "Ativado" : "Desativado"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={tocarBeep}
              style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${t.line}`,
                background: t.panel, color: t.dim, fontWeight: 600, fontSize: 12.5 }}>
              Testar som
            </button>
            <button onClick={() => alternarSom(!somAtivo)}
              style={{ width: 52, height: 30, borderRadius: 999, border: "none", position: "relative",
                background: somAtivo ? t.accent : t.line, transition: "background .2s" }}>
              <span style={{ position: "absolute", top: 3, left: somAtivo ? 25 : 3, width: 24, height: 24,
                borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
          </div>
        </div>
        <p style={{ color: t.faint, fontSize: 12, lineHeight: 1.6, margin: "12px 0 0" }}>
          Dica: clique em "Testar som" uma vez ao abrir o painel — alguns navegadores só liberam áudio após a primeira interação.
        </p>
      </div>

      {/* Conexão (mantido) */}
      <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14, padding: 22, boxShadow: t.shadow }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Conexão</h3>
        <p style={{ color: t.dim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
          Este painel lê e atualiza a tabela <code style={{ fontFamily: MONO, background: t.panel2, padding: "1px 6px", borderRadius: 5 }}>pedidos</code> do
          seu Supabase em tempo real. A automação do WhatsApp (n8n) grava os pedidos nessa
          mesma tabela. Mudar o status de um pedido aqui grava direto no banco.
        </p>
        <div style={{ background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 10, padding: 14, fontSize: 13, color: t.dim, lineHeight: 1.7 }}>
          <strong style={{ color: t.text }}>Próximas fases:</strong><br />
          • Inbox WhatsApp (histórico de conversas)<br />
          • Integração WhatsApp Cloud API oficial<br />
          • Multi-empresa (vários clientes no mesmo painel)<br />
          • Gestão de entregadores e rotas
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  UI helpers                                                         */
/* ================================================================== */
function IconBtn({ t, children, onClick, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${t.line}`,
        background: t.panel, color: t.dim, display: "grid", placeItems: "center" }}>
      {children}
    </button>
  );
}

function Chip({ t, icon: Ic, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5,
      background: t.panel, border: `1px solid ${t.line}`, color: t.dim,
      padding: "3px 8px", borderRadius: 7, fontWeight: 500 }}>
      {Ic && <Ic size={11} />} {children}
    </span>
  );
}

function Skeleton({ t }) {
  return (
    <div style={{ background: t.panel2, borderRadius: 11, padding: "11px 12px", opacity: .6 }}>
      <div style={{ height: 12, width: "60%", background: t.line, borderRadius: 4, marginBottom: 8 }} />
      <div style={{ height: 10, width: "85%", background: t.line, borderRadius: 4 }} />
    </div>
  );
}

function ErroBox({ t, msg, onRetry }) {
  return (
    <div style={{ background: STATUS.cancelado.soft, border: `1px solid ${STATUS.cancelado.color}44`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
      <AlertTriangle size={18} style={{ color: STATUS.cancelado.color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: STATUS.cancelado.color }}>Erro ao conectar no Supabase</div>
        <div style={{ fontSize: 12.5, color: t.dim, marginTop: 2 }}>{msg}</div>
        <div style={{ fontSize: 12, color: t.faint, marginTop: 4 }}>
          Verifique se a chave ANON está no arquivo .env e se a RLS permite leitura da tabela "pedidos".
        </div>
      </div>
      <button onClick={onRetry} style={{ padding: "7px 13px", borderRadius: 9, border: "none",
        background: STATUS.cancelado.color, color: "#fff", fontWeight: 600, fontSize: 13 }}>Tentar de novo</button>
    </div>
  );
}

function GlobalStyle({ t }) {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; }
      ::-webkit-scrollbar { width: 9px; height: 9px; }
      ::-webkit-scrollbar-thumb { background: ${t.line}; border-radius: 8px; }
      @keyframes slideUp { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:none;} }
      @keyframes toastIn { from { opacity:0; transform: translateY(12px) scale(.97);} to {opacity:1; transform:none;} }
      @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.35;} }
      @keyframes spin { to { transform: rotate(360deg); } }
      .spin { animation: spin .8s linear infinite; }
      .pulse { animation: pulse 1.6s infinite; }
      .card { animation: slideUp .4s cubic-bezier(.2,.7,.2,1) both; }
      .navitem:hover { background: ${t.panel2} !important; }
      button { font-family: inherit; cursor: pointer; }
      select { cursor: pointer; }
      @media (max-width: 860px) {
        .cards { grid-template-columns: repeat(2,1fr) !important; }
        .kanban { grid-template-columns: 1fr 1fr !important; }
      }
      @media (max-width: 720px) {
        .rail { position: fixed !important; bottom:0; left:0; right:0; top:auto !important;
          width:100% !important; height:60px !important; flex-direction: row !important;
          border-right:none !important; border-top:1px solid ${t.line};
          padding:0 !important; z-index: 50; }
        .rail .brand, .rail .navlabel, .rail .collapse { display:none !important; }
        .rail nav { flex-direction: row !important; justify-content: space-around; width:100%; }
        .main { padding-bottom: 72px !important; }
        .kanban { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}
