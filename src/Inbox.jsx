import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search, Send, Bot, User, ArrowLeft, Phone, AlertTriangle, MessageSquare,
} from "lucide-react";
import { supabase } from "./supabase.js";

const MONO = `'IBM Plex Mono', ui-monospace, monospace`;

const soNumero = (w) => (w || "").replace(/@c\.us|@s\.whatsapp\.net|@lid/g, "");

const horaMsg = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const tempoRel = (iso) => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "agora";
  if (diff < 60) return `${Math.floor(diff)}min`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const rotuloData = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje.getTime() - 86400000);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  if (dia.getTime() === hoje.getTime()) return "Hoje";
  if (dia.getTime() === ontem.getTime()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function Inbox({ t }) {
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [ativa, setAtiva] = useState(null);
  const [query, setQuery] = useState("");
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [temNaoLidas, setTemNaoLidas] = useState(true);
  const fimRef = useRef(null);
  const ativaRef = useRef(null);
  useEffect(() => { ativaRef.current = ativa; }, [ativa]);

  const carregarConversas = useCallback(async () => {
    setErro(null);
    const { data, error } = await supabase
      .from("conversas")
      .select("*")
      .order("ultima_em", { ascending: false })
      .limit(100);
    if (error) { setErro(error.message); setLoading(false); return; }
    setConversas(data || []);
    if (data && data.length && !("nao_lidas" in data[0])) setTemNaoLidas(false);
    setLoading(false);
  }, []);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  const zerarNaoLidas = useCallback(async (conv) => {
    if (!conv || !temNaoLidas) return;
    if (!conv.nao_lidas) return;
    setConversas((cs) => cs.map((c) => (c.id === conv.id ? { ...c, nao_lidas: 0 } : c)));
    await supabase.from("conversas").update({ nao_lidas: 0 }).eq("id", conv.id);
  }, [temNaoLidas]);

  const carregarMensagens = useCallback(async (convId) => {
    if (!convId) return;
    const { data, error } = await supabase
      .from("mensagens")
      .select("*")
      .eq("conversa_id", convId)
      .order("criado_em", { ascending: true })
      .limit(500);
    if (!error) setMensagens(data || []);
  }, []);

  useEffect(() => {
    if (ativa) {
      carregarMensagens(ativa.id);
      zerarNaoLidas(ativa);
    } else {
      setMensagens([]);
    }
  }, [ativa, carregarMensagens, zerarNaoLidas]);

  useEffect(() => {
    const canal = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () => {
        carregarConversas();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (p) => {
        const a = ativaRef.current;
        setMensagens((m) => {
          if (a && p.new.conversa_id === a.id) {
            return [...m.filter((x) => x.id !== p.new.id), p.new];
          }
          return m;
        });
        if (a && p.new.conversa_id === a.id && p.new.autor === "cliente") {
          zerarNaoLidas(a);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [carregarConversas, zerarNaoLidas]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const alternarHandler = async (conv) => {
    const novo = conv.handler === "humano" ? "bot" : "humano";
    setConversas((cs) => cs.map((c) => (c.id === conv.id ? { ...c, handler: novo } : c)));
    setAtiva((a) => (a && a.id === conv.id ? { ...a, handler: novo } : a));
    const { error } = await supabase.from("conversas").update({ handler: novo }).eq("id", conv.id);
    if (error) carregarConversas();
  };

  const enviar = async () => {
    if (!texto.trim() || !ativa) return;
    setEnviando(true);
    const msg = {
      conversa_id: ativa.id,
      autor: "humano",
      texto: texto.trim(),
      criado_em: new Date().toISOString(),
    };
    setMensagens((m) => [...m, { ...msg, id: `tmp-${Date.now()}` }]);
    setTexto("");
    const { error } = await supabase.from("mensagens").insert(msg);
    await supabase.from("conversas").update({
      ultima_msg: msg.texto, ultima_em: msg.criado_em,
    }).eq("id", ativa.id);
    setEnviando(false);
    if (error) { carregarMensagens(ativa.id); }
  };

  const filtradas = useMemo(() => {
    if (!query.trim()) return conversas;
    const q = query.toLowerCase();
    return conversas.filter((c) =>
      [c.nome, c.whatsapp, c.ultima_msg].filter(Boolean).some((f) => String(f).toLowerCase().includes(q))
    );
  }, [conversas, query]);

  const ehHumano = ativa?.handler === "humano";

  return (
    <div className="inbox-root" style={{
      display: "flex", height: "calc(100vh - 150px)", minHeight: 480,
      background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14,
      overflow: "hidden", boxShadow: t.shadow,
    }}>
      <style>{`
        @media (max-width: 760px) {
          .inbox-list { width: 100% !important; max-width: none !important; ${ativa ? "display:none !important;" : ""} }
          .inbox-chat { ${ativa ? "" : "display:none !important;"} }
          .inbox-back { display:inline-flex !important; }
        }
      `}</style>

      {/* LISTA DE CONVERSAS */}
      <div className="inbox-list" style={{
        width: "32%", minWidth: 280, maxWidth: 380, flexShrink: 0,
        borderRight: `1px solid ${t.line}`,
        display: "flex", flexDirection: "column", background: t.panel2,
      }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.faint }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversa…"
              style={{ width: "100%", padding: "9px 12px 9px 33px", borderRadius: 9, boxSizing: "border-box",
                border: `1px solid ${t.line}`, background: t.panel, color: t.text, fontSize: 13, outline: "none" }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 20, color: t.faint, fontSize: 13 }}>Carregando…</div>}
          {erro && (
            <div style={{ padding: 14, fontSize: 12.5, color: "#ef4444" }}>
              <AlertTriangle size={15} /> {erro}
              <div style={{ color: t.faint, marginTop: 6 }}>Crie as tabelas conversas/mensagens (ver README).</div>
            </div>
          )}
          {!loading && !erro && filtradas.length === 0 && (
            <div style={{ padding: 20, color: t.faint, fontSize: 13 }}>Nenhuma conversa.</div>
          )}
          {filtradas.map((c) => {
            const on = ativa?.id === c.id;
            const humano = c.handler === "humano";
            const naoLidas = temNaoLidas ? (c.nao_lidas || 0) : 0;
            const temNova = naoLidas > 0 && !on;
            return (
              <button key={c.id} onClick={() => setAtiva(c)}
                style={{ width: "100%", textAlign: "left", padding: "11px 14px", border: "none",
                  borderBottom: `1px solid ${t.line}`,
                  borderLeft: on ? `3px solid ${t.accent}` : "3px solid transparent",
                  background: on ? t.panel : "transparent",
                  display: "flex", gap: 11, alignItems: "center", cursor: "pointer" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%",
                    background: humano ? "rgba(34,197,94,.18)" : t.line, display: "grid", placeItems: "center",
                    color: humano ? "#22c55e" : t.dim, fontWeight: 700, fontSize: 16 }}>
                    {(c.nome || "?").charAt(0).toUpperCase()}
                  </div>
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18,
                    borderRadius: "50%", display: "grid", placeItems: "center",
                    background: humano ? "#22c55e" : "#8b5cf6", border: `2px solid ${t.panel2}` }}>
                    {humano ? <User size={9} color="#fff" /> : <Bot size={9} color="#fff" />}
                  </div>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: temNova ? 700 : 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.text }}>
                      {c.nome || soNumero(c.whatsapp)}
                    </span>
                    <span style={{ fontSize: 11, color: temNova ? t.accent : t.faint, flexShrink: 0, fontWeight: temNova ? 700 : 400 }}>
                      {tempoRel(c.ultima_em)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: temNova ? t.text : t.dim, fontWeight: temNova ? 600 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.ultima_msg || "—"}
                    </span>
                    {temNova && (
                      <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9,
                        background: t.accent, color: t.accentText, fontSize: 11, fontWeight: 700,
                        display: "grid", placeItems: "center", fontFamily: MONO }}>
                        {naoLidas > 99 ? "99+" : naoLidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ÁREA DE CHAT */}
      {!ativa ? (
        <div className="inbox-chat" style={{ flex: 1, display: "grid", placeItems: "center", color: t.faint, background: t.bg }}>
          <div style={{ textAlign: "center", padding: 24 }}>
            <div style={{ width: 90, height: 90, borderRadius: "50%", background: t.panel2,
              display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
              <MessageSquare size={38} style={{ opacity: .4 }} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.dim, marginBottom: 6 }}>AquaFlow — Conversas</div>
            <div style={{ fontSize: 13.5, maxWidth: 300, lineHeight: 1.5 }}>
              Selecione uma conversa à esquerda para ver as mensagens e responder.
            </div>
          </div>
        </div>
      ) : (
        <div className="inbox-chat" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.line}`,
            display: "flex", alignItems: "center", gap: 12, background: t.panel2 }}>
            <button onClick={() => setAtiva(null)} className="inbox-back"
              style={{ background: "none", border: "none", color: t.dim, display: "none", cursor: "pointer", padding: 0 }}>
              <ArrowLeft size={20} />
            </button>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%",
                background: ehHumano ? "rgba(34,197,94,.18)" : t.line, display: "grid", placeItems: "center",
                color: ehHumano ? "#22c55e" : t.dim, fontWeight: 700 }}>
                {(ativa.nome || "?").charAt(0).toUpperCase()}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ativa.nome || soNumero(ativa.whatsapp)}
              </div>
              <div style={{ fontSize: 11.5, color: t.faint, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: MONO }}>{soNumero(ativa.whatsapp)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3,
                  color: ehHumano ? "#22c55e" : "#8b5cf6", fontWeight: 600 }}>
                  • {ehHumano ? <><User size={11} /> Atendente</> : <><Bot size={11} /> Bot atendendo</>}
                </span>
              </div>
            </div>
            <button onClick={() => alternarHandler(ativa)}
              style={{ padding: "9px 15px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", flexShrink: 0,
                background: ehHumano ? "rgba(139,92,246,.15)" : "#22c55e",
                color: ehHumano ? "#8b5cf6" : "#fff" }}>
              {ehHumano
                ? (<><Bot size={15} /> Devolver ao bot</>)
                : (<><User size={15} /> Assumir conversa</>)}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px",
            display: "flex", flexDirection: "column", gap: 3, background: t.bg }}>
            {mensagens.map((m, i) => {
              const meu = m.autor === "humano" || m.autor === "bot";
              const isBot = m.autor === "bot";
              const mostraData = i === 0 || rotuloData(m.criado_em) !== rotuloData(mensagens[i - 1].criado_em);
              return (
                <React.Fragment key={m.id}>
                  {mostraData && (
                    <div style={{ alignSelf: "center", margin: "10px 0", fontSize: 11, fontWeight: 600,
                      color: t.faint, background: t.panel2, padding: "3px 12px", borderRadius: 8,
                      border: `1px solid ${t.line}` }}>
                      {rotuloData(m.criado_em)}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: meu ? "flex-end" : "flex-start", marginBottom: 2 }}>
                    <div style={{ maxWidth: "72%", padding: "7px 11px 5px", borderRadius: 10,
                      fontSize: 13.5, lineHeight: 1.45, position: "relative",
                      background: meu ? (isBot ? "rgba(139,92,246,.16)" : "rgba(37,211,102,.16)") : t.panel,
                      border: `1px solid ${meu ? (isBot ? "rgba(139,92,246,.28)" : "rgba(37,211,102,.3)") : t.line}`,
                      color: t.text,
                      borderBottomRightRadius: meu ? 3 : 10, borderBottomLeftRadius: meu ? 10 : 3 }}>
                      {meu && (
                        <div style={{ fontSize: 9.5, fontWeight: 700, marginBottom: 2, letterSpacing: ".03em",
                          color: isBot ? "#8b5cf6" : "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                          {isBot ? <><Bot size={10} /> BOT</> : <><User size={10} /> ATENDENTE</>}
                        </div>
                      )}
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.texto}</span>
                      <span style={{ fontSize: 9.5, color: t.faint, float: "right", marginLeft: 10, marginTop: 4 }}>
                        {horaMsg(m.criado_em)}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {mensagens.length === 0 && (
              <div style={{ color: t.faint, fontSize: 13, textAlign: "center", marginTop: 30 }}>
                Nenhuma mensagem nesta conversa.
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.line}`, background: t.panel2 }}>
            {!ehHumano && (
              <div style={{ fontSize: 12, color: "#8b5cf6", marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
                background: "rgba(139,92,246,.1)", padding: "7px 11px", borderRadius: 8 }}>
                <Bot size={14} /> O bot está atendendo — assuma a conversa para responder.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                disabled={!ehHumano}
                placeholder={ehHumano ? "Digite uma mensagem…" : "Assuma a conversa para responder"}
                style={{ flex: 1, padding: "11px 14px", borderRadius: 11, border: `1px solid ${t.line}`,
                  background: ehHumano ? t.panel : t.bg, color: t.text, fontSize: 13.5,
                  outline: "none", opacity: ehHumano ? 1 : .6 }} />
              <button onClick={enviar} disabled={!ehHumano || enviando || !texto.trim()}
                style={{ width: 44, height: 44, borderRadius: 11, border: "none", flexShrink: 0,
                  background: (ehHumano && texto.trim()) ? t.accent : t.line,
                  color: (ehHumano && texto.trim()) ? t.accentText : t.faint,
                  display: "grid", placeItems: "center", cursor: (ehHumano && texto.trim()) ? "pointer" : "default" }}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
