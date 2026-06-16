import React, { useState, useMemo, useCallback } from "react";
import {
  Route, Navigation, MapPin, Store, Plus, X, Clock, Loader2,
  Copy, Package, ArrowDown,
} from "lucide-react";

const FONT = `'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`;
const MONO = `'IBM Plex Mono', ui-monospace, monospace`;

/* ------------------------------------------------------------------ */
/*  Geocoding + distância                                             */
/*  No protótipo: coordenadas pseudo-estáveis a partir do texto.      */
/*  [INTEGRAÇÃO GOOGLE] trocar mockGeocode pela Geocoding API e       */
/*  distancia() pela duração real da Routes API quando for pra prod.  */
/* ------------------------------------------------------------------ */
const mockGeocode = (endereco) => {
  let h = 0;
  for (let i = 0; i < endereco.length; i++) h = (h * 31 + endereco.charCodeAt(i)) >>> 0;
  const lat = -21.76 + ((h % 1000) / 1000) * 0.08 - 0.04;
  const lng = -43.35 + (((h >> 10) % 1000) / 1000) * 0.08 - 0.04;
  return { lat, lng };
};

const distancia = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const permutacoes = (arr) => {
  if (arr.length <= 1) return [arr];
  const res = [];
  arr.forEach((v, i) => {
    const resto = [...arr.slice(0, i), ...arr.slice(i + 1)];
    permutacoes(resto).forEach((p) => res.push([v, ...p]));
  });
  return res;
};

/* TSP exato por força bruta — ótimo p/ até ~8 paradas (instantâneo).
   [INTEGRAÇÃO GOOGLE] em produção dá pra deixar a Routes API otimizar
   via optimizeWaypointOrder:true e ler optimizedIntermediateWaypointIndex. */
const otimizar = (loja, paradas, voltarLoja) => {
  if (paradas.length === 0) return { ordem: [], distanciaTotal: 0 };
  if (paradas.length === 1) {
    let d = distancia(loja.coord, paradas[0].coord);
    if (voltarLoja) d += distancia(paradas[0].coord, loja.coord);
    return { ordem: [paradas[0]], distanciaTotal: d };
  }
  let melhor = null;
  let melhorDist = Infinity;
  permutacoes(paradas.map((_, i) => i)).forEach((perm) => {
    let dist = 0;
    let atual = loja.coord;
    perm.forEach((idx) => {
      dist += distancia(atual, paradas[idx].coord);
      atual = paradas[idx].coord;
    });
    if (voltarLoja) dist += distancia(atual, loja.coord);
    if (dist < melhorDist) { melhorDist = dist; melhor = perm; }
  });
  return { ordem: melhor.map((i) => paradas[i]), distanciaTotal: melhorDist };
};

const linkGoogleMaps = (loja, ordem, voltarLoja) => {
  const pts = [loja.endereco, ...ordem.map((p) => p.endereco)];
  if (voltarLoja) pts.push(loja.endereco);
  const enc = pts.map((p) => encodeURIComponent(p)).join("/");
  return `https://www.google.com/maps/dir/${enc}`;
};

/* completa endereço com cidade/estado da config (igual ao App.jsx) */
const completaEndereco = (endereco, cfg) => {
  const partes = [endereco];
  if (cfg && cfg.cidade) partes.push(cfg.cidade);
  if (cfg && cfg.estado) partes.push(cfg.estado);
  return partes.filter(Boolean).join(", ");
};

/* ================================================================== */
/*  ROTEIRIZAÇÃO                                                       */
/* ================================================================== */
export default function Roteirizacao({ t, pedidos = [], config = {}, setToast }) {
  const [loja, setLoja] = useState(config?.endereco_loja || "");
  const [inputs, setInputs] = useState(["", "", ""]);
  const [voltarLoja, setVoltarLoja] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);

  /* pedidos que ainda vão pra rua (recebido/separado/rota) com endereço */
  const pedidosEntregaveis = useMemo(
    () =>
      pedidos.filter(
        (o) => ["recebido", "separado", "rota"].includes(o.status) && o.endereco
      ),
    [pedidos]
  );

  const enderecosValidos = inputs.map((s) => s.trim()).filter(Boolean);

  const addCampo = () => setInputs((p) => [...p, ""]);
  const removeCampo = (i) => setInputs((p) => p.filter((_, idx) => idx !== i));
  const setCampo = (i, v) => setInputs((p) => p.map((s, idx) => (idx === i ? v : s)));

  /* cola múltiplas linhas de uma vez */
  const onPaste = (i, e) => {
    const texto = e.clipboardData.getData("text");
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (linhas.length > 1) {
      e.preventDefault();
      setInputs((p) => {
        const novo = [...p];
        novo.splice(i, 1, ...linhas);
        return novo;
      });
    }
  };

  /* adiciona um pedido do Supabase como parada (no primeiro campo vazio) */
  const addPedido = (o) => {
    const end = o.endereco;
    if (!end) return;
    setInputs((p) => {
      const idxVazio = p.findIndex((s) => !s.trim());
      if (idxVazio >= 0) {
        const novo = [...p];
        novo[idxVazio] = end;
        return novo;
      }
      return [...p, end];
    });
  };

  const rodar = useCallback(() => {
    if (enderecosValidos.length < 2 || !loja.trim()) return;
    setCalculando(true);
    setResultado(null);
    setTimeout(() => {
      const lojaObj = {
        endereco: completaEndereco(loja.trim(), config),
        coord: mockGeocode(loja),
      };
      const paradas = enderecosValidos.map((e) => ({
        endereco: completaEndereco(e, config),
        coord: mockGeocode(e),
      }));
      const { ordem, distanciaTotal } = otimizar(lojaObj, paradas, voltarLoja);
      setResultado({
        loja: lojaObj,
        ordem,
        distanciaTotal,
        tempoEstimado: Math.round((distanciaTotal / 25) * 60),
        link: linkGoogleMaps(lojaObj, ordem, voltarLoja),
      });
      setCalculando(false);
    }, 600);
  }, [enderecosValidos, loja, voltarLoja, config]);

  const copiar = async (texto, msg) => {
    try {
      await navigator.clipboard.writeText(texto);
      setToast && setToast(msg || "Copiado!");
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setToast && setToast(msg || "Copiado!"); } catch {}
      document.body.removeChild(ta);
    }
  };

  const card = {
    background: t.panel, border: `1px solid ${t.line}`, borderRadius: 14,
    padding: 20, boxShadow: t.shadow,
  };
  const inputStyle = {
    flex: 1, width: "100%", padding: "10px 12px", borderRadius: 9, fontSize: 14,
    border: `1px solid ${t.line}`, background: t.panel2, color: t.text,
    outline: "none", fontFamily: FONT, boxSizing: "border-box",
  };
  const podeRodar = enderecosValidos.length >= 2 && loja.trim() && !calculando;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
      {/* ---------- COLUNA ENTRADA ---------- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card}>
          <Label t={t}><Store size={14} /> Ponto de partida (loja)</Label>
          <input
            value={loja}
            onChange={(e) => setLoja(e.target.value)}
            placeholder="Endereço da sua loja / depósito"
            style={{ ...inputStyle, marginTop: 10 }}
          />
          {config?.cidade && (
            <p style={{ fontSize: 12, color: t.faint, margin: "8px 0 0" }}>
              Cidade/estado de {config.cidade}{config.estado ? `, ${config.estado}` : ""} serão
              adicionados automaticamente (config).
            </p>
          )}
        </div>

        <div style={card}>
          <Label t={t}><MapPin size={14} /> Endereços de entrega</Label>
          <p style={{ fontSize: 12, color: t.faint, margin: "6px 0 12px" }}>
            Digite um por campo, ou cole vários de uma vez (um por linha).
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inputs.map((val, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 7, background: t.panel2,
                  color: t.accent, fontSize: 12, fontWeight: 700, fontFamily: MONO,
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>{i + 1}</span>
                <input
                  value={val}
                  onChange={(e) => setCampo(i, e.target.value)}
                  onPaste={(e) => onPaste(i, e)}
                  placeholder={`Endereço ${i + 1}`}
                  style={inputStyle}
                />
                {inputs.length > 1 && (
                  <button onClick={() => removeCampo(i)} title="remover"
                    style={{
                      width: 30, height: 30, borderRadius: 7, border: `1px solid ${t.line}`,
                      background: t.panel2, color: t.faint, display: "grid",
                      placeItems: "center", flexShrink: 0,
                    }}><X size={15} /></button>
                )}
              </div>
            ))}
          </div>

          <button onClick={addCampo}
            style={{
              marginTop: 12, display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 9, border: `1.5px dashed ${t.line}`,
              background: "transparent", color: t.dim, fontSize: 13, fontWeight: 600,
            }}>
            <Plus size={15} /> Adicionar endereço
          </button>

          <label style={{
            display: "flex", alignItems: "center", gap: 9, marginTop: 16,
            fontSize: 13.5, color: t.dim, cursor: "pointer",
          }}>
            <input type="checkbox" checked={voltarLoja}
              onChange={(e) => setVoltarLoja(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: t.accent }} />
            Motoboy retorna à loja no final
          </label>

          <button onClick={rodar} disabled={!podeRodar}
            style={{
              marginTop: 16, width: "100%", padding: 13, borderRadius: 11, border: "none",
              background: podeRodar ? t.accent : t.line,
              color: podeRodar ? t.accentText : t.faint,
              fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, cursor: podeRodar ? "pointer" : "default",
            }}>
            {calculando
              ? <><Loader2 size={18} className="spin" /> Calculando rota…</>
              : <><Navigation size={18} /> Otimizar rota</>}
          </button>
          {enderecosValidos.length < 2 && (
            <p style={{ fontSize: 12, color: STATUS_WARN, textAlign: "center", margin: "8px 0 0" }}>
              Informe ao menos 2 endereços
            </p>
          )}
        </div>

        {/* pedidos ativos pra adicionar com 1 clique */}
        {pedidosEntregaveis.length > 0 && (
          <div style={card}>
            <Label t={t}><Package size={14} /> Pedidos em aberto</Label>
            <p style={{ fontSize: 12, color: t.faint, margin: "6px 0 12px" }}>
              Clique pra adicionar o endereço à rota.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {pedidosEntregaveis.map((o) => (
                <button key={o.id} onClick={() => addPedido(o)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 9,
                    padding: "10px 12px", color: t.text,
                  }}>
                  <Plus size={14} style={{ color: t.accent, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{o.cliente || "Cliente"}</div>
                    <div style={{
                      fontSize: 12, color: t.dim, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{o.endereco}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- COLUNA RESULTADO ---------- */}
      <div style={card}>
        <Label t={t}><Route size={14} /> Rota otimizada</Label>

        {!resultado && !calculando && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 14, padding: "48px 20px", textAlign: "center",
          }}>
            <div style={{
              width: 58, height: 58, borderRadius: 16, background: t.panel2,
              color: t.faint, display: "grid", placeItems: "center",
            }}><Navigation size={26} strokeWidth={1.5} /></div>
            <p style={{ fontSize: 13, color: t.faint, maxWidth: 220, lineHeight: 1.5 }}>
              A sequência ideal de entrega aparecerá aqui depois de otimizar.
            </p>
          </div>
        )}

        {calculando && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 14, padding: "48px 20px",
          }}>
            <Loader2 size={30} className="spin" style={{ color: t.accent }} />
            <p style={{ fontSize: 13, color: t.faint }}>Testando combinações de percurso…</p>
          </div>
        )}

        {resultado && !calculando && (
          <div style={{ marginTop: 14 }}>
            {/* stats */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <Stat t={t} valor={`${resultado.distanciaTotal.toFixed(1)} km`} label="Distância total" />
              <Stat t={t}
                valor={<><Clock size={15} style={{ verticalAlign: -2, marginRight: 4 }} />~{resultado.tempoEstimado} min</>}
                label="Tempo estimado" />
            </div>

            {/* timeline */}
            <div>
              <Parada t={t} tipo="partida" texto={resultado.loja.endereco} />
              {resultado.ordem.map((p, i) => (
                <Parada key={i} t={t} num={i + 1} texto={p.endereco} />
              ))}
              {voltarLoja && <Parada t={t} tipo="retorno" texto={resultado.loja.endereco} />}
            </div>

            {/* ações */}
            <a href={resultado.link} target="_blank" rel="noreferrer"
              style={{
                marginTop: 8, width: "100%", padding: 13, borderRadius: 11, border: "none",
                background: t.accent, color: t.accentText, fontSize: 14.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                textDecoration: "none", boxSizing: "border-box",
              }}>
              <Navigation size={17} /> Abrir no Google Maps
            </a>
            <button onClick={() => copiar(resultado.link, "Link da rota copiado!")}
              style={{
                marginTop: 8, width: "100%", padding: 11, borderRadius: 11,
                border: `1px solid ${t.line}`, background: t.panel2, color: t.text,
                fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8,
              }}>
              <Copy size={15} /> Copiar link pro motoboy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_WARN = "#f59e0b";

function Label({ t, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, fontSize: 12,
      fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em",
      color: t.dim,
    }}>{children}</div>
  );
}

function Stat({ t, valor, label }) {
  return (
    <div style={{
      flex: 1, background: t.panel2, border: `1px solid ${t.line}`,
      borderRadius: 11, padding: "13px 15px",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: t.accent, fontFamily: MONO }}>{valor}</div>
      <div style={{ fontSize: 11.5, color: t.faint, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Parada({ t, num, tipo, texto }) {
  const cor = tipo === "partida" ? "#22c55e" : tipo === "retorno" ? t.faint : t.accent;
  const badge = tipo === "partida" ? "PARTIDA" : tipo === "retorno" ? "RETORNO" : `${num}ª entrega`;
  return (
    <div style={{ display: "flex", gap: 13, paddingBottom: 16, position: "relative" }}>
      <div style={{
        width: 30, height: 30, borderRadius: "50%", background: cor,
        color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: MONO,
        display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1,
        boxShadow: `0 0 0 4px ${t.panel}, 0 0 0 5px ${t.line}`,
      }}>
        {tipo === "partida" || tipo === "retorno" ? <Store size={13} /> : num}
      </div>
      <div style={{ paddingTop: 2 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: tipo ? t.faint : t.accent }}>{badge}</div>
        <div style={{ fontSize: 13.5, color: t.text, lineHeight: 1.4, marginTop: 2 }}>{texto}</div>
      </div>
    </div>
  );
}
