// Página da projeção: lê data/latest.json e data/history.json a cada 30 s.
"use strict";

const UF = {
  ac: "Acre", al: "Alagoas", am: "Amazonas", ap: "Amapá", ba: "Bahia", ce: "Ceará",
  df: "Distrito Federal", es: "Espírito Santo", go: "Goiás", ma: "Maranhão", mg: "Minas Gerais",
  ms: "Mato Grosso do Sul", mt: "Mato Grosso", pa: "Pará", pb: "Paraíba", pe: "Pernambuco",
  pi: "Piauí", pr: "Paraná", rj: "Rio de Janeiro", rn: "Rio Grande do Norte", ro: "Rondônia",
  rr: "Roraima", rs: "Rio Grande do Sul", sc: "Santa Catarina", se: "Sergipe", sp: "São Paulo",
  to: "Tocantins", zz: "Exterior",
};
const MAX_SERIES = 4;           // candidates drawn in the chart / columns in the table
const POLL_MS = 30000;
const STALE_MIN = 3;

const $ = (id) => document.getElementById(id);
const pct = (x, d = 2) => (100 * x).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
const int = (x) => Math.round(x).toLocaleString("pt-BR");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Colour follows the candidate, never cycled. Flávio (22) is always blue and
// Lula (13) always red; the others take the remaining slots by the first
// reading of the night (fixed afterwards); past the 8 slots -> neutral.
const FIXO = { "22": 0, "13": 7 };   // número -> slot (--series-1 azul, --series-8 vermelho)
let slot = [];
const color = (i) => (slot[i] < 8 ? `var(--series-${slot[i] + 1})` : "var(--text-muted)");
function assignSlots(cands) {
  const K = cands.length;
  const first = (hist.pontos || []).find((p) => p.proj && p.proj.length === K);
  const ref = first ? first.proj : cands.map((c) => c.fatia_projetada);
  const livres = [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => !Object.values(FIXO).includes(k));
  slot = [];
  cands.forEach((c, i) => { if (c.numero in FIXO) slot[i] = FIXO[c.numero]; });
  ref.map((v, i) => i).filter((i) => slot[i] == null).sort((a, b) => ref[b] - ref[a])
    .forEach((i, r) => { slot[i] = r < livres.length ? livres[r] : 99; });
}
function parseBR(s) {           // "25/10/2026 19:42:10" -> Date
  const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+):?(\d*)/.exec(s || "");
  return m ? new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) : null;
}
const hhmm = (d) => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "–";

let latest = null, hist = null;

async function load() {
  try {
    const t = Date.now();
    const [a, b] = await Promise.all([
      fetch(`data/latest.json?t=${t}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`data/history.json?t=${t}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    latest = a; hist = b;
    render();
  } catch (e) {
    $("status").textContent = "Não foi possível carregar os dados agora; tentando de novo em 30 s.";
    $("status").classList.add("velho");
  }
}

function render() {
  const L = latest, P = L.projecao, Bt = L.bruto;
  const cands = L.candidatos.map((c, i) => ({ ...c, i, ...P.candidatos[i] }));
  assignSlots(cands);
  const byProj = [...cands].sort((a, b) => b.fatia_projetada - a.fatia_projetada);
  const byRaw = [...cands].sort((a, b) => (Bt.votos[b.numero] || 0) - (Bt.votos[a.numero] || 0));
  const turno2 = String(L.turno) === "2" || cands.length === 2;   // two-way race

  $("titulo").textContent = `Eleição presidencial 2026 · ${String(L.turno) === "2" ? "2º" : "1º"} turno` + (L.replay ? " (REPLAY de teste)" : "");

  // Status / staleness.
  const upd = new Date(L.atualizado);
  const ageMin = (Date.now() - upd) / 60000;
  const st = $("status");
  st.classList.toggle("velho", ageMin > STALE_MIN);
  st.textContent = (ageMin > STALE_MIN ? `⚠ Sem atualização há ${Math.round(ageMin)} min · ` : "") +
    `Atualizado às ${hhmm(upd)} · arquivos do TSE de ${hhmm(parseBR(L.hora_tse))} · ` +
    `${pct(Bt.pct_secoes)} das seções apuradas`;

  // Raw count card.
  $("sub-bruto").textContent = `${int(Bt.secoes_totalizadas)} de ${int(Bt.secoes_total)} seções · ` +
    `${int(Object.values(Bt.votos).reduce((a, b) => a + b, 0))} votos válidos`;
  $("bruto").innerHTML = Bt.secoes_totalizadas === 0 ? `<p class="sub">Nenhuma seção apurada ainda.</p>` :
    candList(byRaw, (c) => ({
      big: pct(Bt.fatias[c.numero]), det: `${int(Bt.votos[c.numero])} votos`,
      bar: Bt.fatias[c.numero],
    }), turno2);

  // Projection card.
  $("sub-proj").textContent = Bt.secoes_totalizadas === 0
    ? "Sem votos apurados: por enquanto é só a base histórica (1º turno 2026 + 2º turno 2022)."
    : `Votos válidos projetados: ${int(P.validos_projetados)}`;
  $("proj").innerHTML = candList(byProj, (c) => ({
    big: pct(c.fatia_projetada, 1),
    det: `faixa provável: ${pct(c.p05, 1)} a ${pct(c.p95, 1)}`,
    bar: c.fatia_projetada, lo: c.p05, hi: c.p95,
    prob: turno2 ? `Chance de vitória: <strong>${probTxt(c.prob_vitoria)}</strong>`
      : `Chance de terminar em 1º: <strong>${probTxt(c.prob_vitoria)}</strong> · de passar de 50%: <strong>${probTxt(c.prob_maioria)}</strong>`,
  }), turno2);

  renderChart(cands, byProj.slice(0, MAX_SERIES));
  renderStates(cands, byProj.slice(0, Math.min(MAX_SERIES, turno2 ? 2 : 3)));
  const n = L.nacional_tse;
  $("nota-nacional").textContent = n ? `Para comparação, o arquivo nacional do TSE indicava ${pct(n.pct_secoes)} das seções (gerado ${n.gerado}).` : "";
}

function probTxt(p) {
  if (p > 0.99) return "> 99%";
  if (p < 0.01) return "< 1%";
  return pct(p, 0);
}

function candList(list, f, half) {
  const shown = list.slice(0, MAX_SERIES), rest = list.slice(MAX_SERIES);
  let h = shown.map((c) => {
    const x = f(c);
    const ic = x.lo != null ? `<i class="ic" style="left:${100 * x.lo}%;width:${100 * (x.hi - x.lo)}%;background:${color(c.i)}"></i>` : "";
    return `<div class="cand">
      <div class="cand-top"><div class="cand-nome"><i class="dot" style="background:${color(c.i)}"></i><span>${esc(c.nome)}</span></div>
      <div class="cand-pct">${x.big}</div></div>
      <div class="barra">${ic}<i style="width:${100 * x.bar}%;background:${color(c.i)};${x.lo != null ? "opacity:.9;height:4px;top:3px" : ""}"></i>${half ? '<span class="meio"></span>' : ""}</div>
      <div class="cand-det">${x.det}</div>${x.prob ? `<div class="prob">${x.prob}</div>` : ""}</div>`;
  }).join("");
  if (rest.length) h += `<p class="outros">Outros ${rest.length} candidatos: ${rest.map((c) => `${esc(c.nome)} ${f(c).big}`).join(" · ")}</p>`;
  return h;
}

// ---- Chart: share over time; projection line + 90% band, raw count dashed ----
function renderChart(cands, series) {
  // Ignore points written with a different candidate list (would show NaN).
  const K = cands.length;
  const pts = (hist.pontos || []).map((p) => ({ ...p, d: parseBR(p.t) }))
    .filter((p) => p.d && [p.bruto, p.proj, p.p05, p.p95].every((a) => a && a.length === K));
  const el = $("grafico");
  $("legenda").innerHTML = series.map((c) => `<span><i class="dot" style="background:${color(c.i)}"></i>${esc(c.nome)}</span>`).join("") +
    `<span>— projeção</span><span>- - - apuração</span>`;
  if (pts.length < 2) { el.innerHTML = `<p class="sub">O gráfico aparece a partir da segunda leitura.</p>`; renderHistTable(pts, series); return; }

  const W = Math.max(320, el.clientWidth), H = W < 500 ? 260 : 320;
  const m = { l: 44, r: 12, t: 10, b: 28 };
  const x0 = pts[0].d, x1 = pts[pts.length - 1].d;
  let lo = 1, hi = 0;
  for (const p of pts) for (const c of series) {
    lo = Math.min(lo, p.p05[c.i], p.bruto[c.i] || p.p05[c.i]);
    hi = Math.max(hi, p.p95[c.i], p.bruto[c.i]);
  }
  const pad = (hi - lo) * 0.08 + 0.005; lo = Math.max(0, lo - pad); hi = Math.min(1, hi + pad);
  const X = (d) => m.l + (W - m.l - m.r) * ((d - x0) / Math.max(1, x1 - x0));
  const Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const path = (acc) => pts.map((p, j) => `${j ? "L" : "M"}${X(p.d).toFixed(1)},${Y(acc(p)).toFixed(1)}`).join("");

  // Y gridlines at "nice" steps.
  const span = hi - lo, step = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2].find((s) => span / s <= 6) || 0.25;
  let g = "";
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/>` +
      `<text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${pct(v, step < 0.01 ? 1 : 0)}</text>`;
  }
  if (lo < 0.5 && hi > 0.5) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0.5)}" y2="${Y(0.5)}" stroke="var(--text-muted)" stroke-dasharray="2 3"/>`;
  const nt = W < 500 ? 4 : 7;
  for (let k = 0; k <= nt; k++) {
    const d = new Date(+x0 + (x1 - x0) * k / nt);
    g += `<text x="${X(d)}" y="${H - 8}" text-anchor="middle">${hhmm(d)}</text>`;
  }
  let s = "";
  for (const c of series) {
    const band = pts.map((p, j) => `${j ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.p95[c.i]).toFixed(1)}`).join("") +
      [...pts].reverse().map((p) => `L${X(p.d).toFixed(1)},${Y(p.p05[c.i]).toFixed(1)}`).join("") + "Z";
    s += `<path d="${band}" fill="${color(c.i)}" opacity=".14"/>`;
    s += `<path d="${path((p) => p.bruto[c.i])}" fill="none" stroke="${color(c.i)}" stroke-width="1.5" stroke-dasharray="4 3" opacity=".8"/>`;
    s += `<path d="${path((p) => p.proj[c.i])}" fill="none" stroke="${color(c.i)}" stroke-width="2"/>`;
    const last = pts[pts.length - 1];
    s += `<circle cx="${X(last.d)}" cy="${Y(last.proj[c.i])}" r="4" fill="${color(c.i)}" stroke="var(--surface-1)" stroke-width="2"/>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução da apuração e da projeção">${g}${s}
    <line id="cross" y1="${m.t}" y2="${H - m.b}" stroke="var(--text-muted)" visibility="hidden"/>
    <rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent" id="hit"/></svg><div class="tip" id="tip"></div>`;

  const hit = $("hit"), tip = $("tip"), cross = $("cross");
  const move = (ev) => {
    const r = el.getBoundingClientRect();
    const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
    let j = 0, best = Infinity;
    pts.forEach((p, k) => { const dd = Math.abs(X(p.d) - cx); if (dd < best) { best = dd; j = k; } });
    const p = pts[j], xp = X(p.d);
    cross.setAttribute("x1", xp); cross.setAttribute("x2", xp); cross.setAttribute("visibility", "visible");
    tip.innerHTML = `<strong>${hhmm(p.d)}</strong> · ${pct(p.pct, 1)} das seções<br>` + series.map((c) =>
      `<i class="dot" style="display:inline-block;background:${color(c.i)}"></i> ${esc(c.nome)}: proj. ${pct(p.proj[c.i], 1)} ` +
      `(${pct(p.p05[c.i], 1)}–${pct(p.p95[c.i], 1)}) · apur. ${pct(p.bruto[c.i], 1)}`).join("<br>");
    tip.style.display = "block";
    const px = xp * r.width / W;
    tip.style.left = Math.min(Math.max(0, px - tip.offsetWidth / 2), r.width - tip.offsetWidth) + "px";
    tip.style.top = "0px";
  };
  const out = () => { tip.style.display = "none"; cross.setAttribute("visibility", "hidden"); };
  hit.addEventListener("mousemove", move); hit.addEventListener("touchstart", move, { passive: true });
  hit.addEventListener("touchmove", move, { passive: true }); hit.addEventListener("mouseleave", out);
  renderHistTable(pts, series);
}

function renderHistTable(pts, series) {
  const head = `<tr><th>Hora</th><th>Seções</th>${series.map((c) => `<th>${esc(c.nome)} apur.</th><th>proj. (faixa provável)</th>`).join("")}</tr>`;
  const rows = [...pts].reverse().map((p) => `<tr><td>${hhmm(p.d)}</td><td>${pct(p.pct, 1)}</td>` +
    series.map((c) => `<td>${pct(p.bruto[c.i], 1)}</td><td>${pct(p.proj[c.i], 1)} <span class="ic">${pct(p.p05[c.i], 1)}–${pct(p.p95[c.i], 1)}</span></td>`).join("") + "</tr>").join("");
  $("tab-hist").innerHTML = head + rows;
}

function renderStates(cands, cols) {
  const E = [...latest.estados].sort((a, b) => b.validos_projetados - a.validos_projetados);
  const head = `<tr><th rowspan="2">Estado</th><th rowspan="2">Seções</th>${cols.map((c) =>
    `<th colspan="2" class="th-cand"><i class="dot" style="display:inline-block;background:${color(c.i)}"></i> <span class="th-nome">${esc(c.nome)}</span></th>`).join("")}</tr>` +
    `<tr>${cols.map(() => "<th>atual</th><th>proj.</th>").join("")}</tr>`;
  const rows = E.map((e) => {
    const lead = (arr) => cols.reduce((b, c) => (arr[c.i] > arr[b.i] ? c : b), cols[0]).i;
    const diff = e.validos_contados > 0 && lead(e.fatia_contada) !== lead(e.fatia_projetada);
    return `<tr class="${diff ? "lider-diferente" : ""}"><td><span class="uf-nome">${UF[e.uf] || e.uf.toUpperCase()}</span>` +
      `<span class="uf-sig">${e.uf === "zz" ? "Ext." : e.uf.toUpperCase()}</span></td><td>${pct(e.pct_secoes, 1)}</td>` +
      cols.map((c) => `<td>${e.validos_contados ? pct(e.fatia_contada[c.i], 1) : "–"}</td>` +
        `<td class="proj-col">${pct(e.fatia_projetada[c.i], 1)} <span class="ic">${pct(e.p05[c.i], 0)}–${pct(e.p95[c.i], 0)}</span></td>`).join("") + "</tr>";
  }).join("");
  $("tab-uf").innerHTML = head + rows;
}

// Tema: automático (segue o aparelho) -> claro -> escuro.
const TEMAS = ["auto", "claro", "escuro"];
function aplicarTema(t) {
  if (t === "claro") document.documentElement.dataset.theme = "light";
  else if (t === "escuro") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  $("tema").textContent = "Tema: " + t;
  try { localStorage.setItem("tema", t); } catch (e) { /* sem armazenamento: só nesta visita */ }
}
let tema = "auto";
try { tema = localStorage.getItem("tema") || "auto"; } catch (e) { /* idem */ }
aplicarTema(TEMAS.includes(tema) ? tema : "auto");
$("tema").addEventListener("click", () => {
  tema = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];
  aplicarTema(tema);
});

load();
setInterval(load, POLL_MS);
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => latest && render(), 150); });
