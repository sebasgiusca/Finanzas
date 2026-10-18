"use strict";
// ====== Datos ======
const KEY = "finanzas.v1";
const PERSONAS = ["Sebas", "Marta", "Común"];
const CATS = CATALOGO.categorias;
const CAT = Object.fromEntries(CATS.map(c => [c.n, c]));
const SIN = "Sin clasificar";
const COMP = FinCore.compilar(CATALOGO.reglas);
const COLORES = ["#38bdf8","#f472b6","#a78bfa","#fb923c","#4ade80","#facc15","#f87171","#2dd4bf","#c084fc","#60a5fa","#fbbf24","#34d399"];

let S = cargar();
const TRASP = "Transferencia entre mis cuentas";
let PARES = new Map();
recalcPares();
function cargar() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.movs) return Object.assign({ imports: [], reglas: [] }, s); } catch (e) {}
  return { v: 1, movs: [], imports: [], reglas: [], persona: "Sebas" };
}
let VER = 0;
function guardar() {
  VER++; recalcPares();
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { alert("No se ha podido guardar: el móvil no tiene espacio para la app. Haz una copia de seguridad en Más."); }
}

let UI = { vista: "resumen", mes: null, filtroP: "Juntos", filtroCat: null, soloRevisar: false, q: "" };
UI.mes = ultimoMes() || mesDe(new Date());

// ====== Utilidades ======
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = v => (v || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const eur0 = v => (v || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
function mesDe(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function sumaMes(m, n) { let [y, mm] = m.split("-").map(Number); mm += n; while (mm > 12) { mm -= 12; y++; } while (mm < 1) { mm += 12; y--; } return y + "-" + String(mm).padStart(2, "0"); }
function nombreMes(m) { const [y, mm] = m.split("-").map(Number); return FinCore.MESES[mm - 1] + " " + y; }
function nombreImp(m) { const [a, b] = m.split("/"); return b ? nombreMes(a) + " a " + nombreMes(b) : nombreMes(a); }
function ultimoMes() { return S.movs.reduce((a, m) => (m.mes > a ? m.mes : a), "") || null; }
function fechaLarga(f) { const d = new Date(f + "T12:00:00"); const t = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); }
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ====== Traspasos entre mis cuentas ======
// Una salida en una cuenta y una entrada del mismo importe en OTRA cuenta, con 4 dias o menos de diferencia,
// y al menos una de las dos con pinta de transferencia => es dinero que se mueve entre mis cuentas (no cuenta).
function recalcPares() {
  PARES = new Map();
  const tr = /transf|trf|traspas/i;
  const ok = m => !m.cat && !m.noPar && Math.abs(m.importe) >= 1 && !/bizum|n[oó]mina/i.test(m.concepto);
  const dias = (a, b) => Math.abs(new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 864e5;
  const ent = S.movs.filter(m => ok(m) && m.importe > 0);
  for (const s of S.movs.filter(m => ok(m) && m.importe < 0).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    let best = null, bd = 99;
    for (const e of ent) {
      if (PARES.has(e.id) || Math.abs(e.importe + s.importe) > 0.005) continue;
      if (e.banco === s.banco && e.cuenta === s.cuenta) continue;
      if (!tr.test(s.concepto) && !tr.test(e.concepto)) continue;
      const d = dias(e.fecha, s.fecha); if (d <= 4 && d < bd) { best = e; bd = d; }
    }
    if (best) { PARES.set(s.id, best.id); PARES.set(best.id, s.id); }
  }
}

// ====== Clasificacion ======
// Prioridad: cambio a mano del movimiento > mis reglas (con importe primero, luego la mas larga) > catalogo
function reglaUsuario(m) {
  const c = m.concepto.toLowerCase(); let best = null;
  S.reglas.forEach((r, i) => {
    if (!c.includes(r.t)) return;
    if (r.imp != null && Math.abs(r.imp - m.importe) > 0.005) return;
    const score = (r.imp != null ? 1e6 : 0) + r.t.length * 100 + i;
    if (!best || score > best.score) best = { r, score };
  });
  return best && best.r;
}
function catDe(m) {
  if (m.cat) return m.cat;
  if (PARES.has(m.id)) return TRASP;
  const ru = reglaUsuario(m); if (ru) return ru.cat;
  const b = FinCore.buscar(COMP, m.concepto); return b ? b.cat : SIN;
}
function porRevisar(m) {
  if (m.cat || PARES.has(m.id) || reglaUsuario(m)) return false;
  const c = catDe(m);
  return c === SIN || /^transferencia/i.test(m.concepto);
}
// tipo efectivo: Gasto / Ingreso / Ahorro / Transferencia
function tipoDe(cat, imp) {
  const t = (CAT[cat] || {}).t || "Según signo";
  if (t === "Según signo") return imp < 0 ? "Gasto" : "Ingreso";
  return t;
}

// ====== Calculos ======
function movsDe(mes, persona) {
  return S.movs.filter(m => m.mes === mes && (persona === "Juntos" || m.persona === persona));
}
function resumen(lista) {
  const r = { ing: 0, gas: 0, aho: 0, fijo: 0, vari: 0, cats: {}, ingCats: {}, revisar: 0 };
  for (const m of lista) {
    const cat = catDe(m), t = tipoDe(cat, m.importe);
    if (porRevisar(m)) r.revisar++;
    if (t === "Gasto") { const v = -m.importe; r.gas += v; r.cats[cat] = (r.cats[cat] || 0) + v; if ((CAT[cat] || {}).fijo) r.fijo += v; else r.vari += v; }
    else if (t === "Ingreso") { r.ing += m.importe; r.ingCats[cat] = (r.ingCats[cat] || 0) + m.importe; }
    else if (t === "Ahorro") r.aho += -m.importe;
  }
  return r;
}

// Juntos = todo (Sebas + Marta + Común). "Común" solo sale como filtro si hay algo marcado como Común
function filtrosP() { return ["Juntos", "Sebas", "Marta", ...(S.movs.some(m => m.persona === "Común") ? ["Común"] : [])]; }
function ahorroAnio(mes, persona) {
  let t = 0; const y = mes.slice(0, 4);
  for (let m = y + "-01"; m <= mes; m = sumaMes(m, 1)) { const r = resumen(movsDe(m, persona)); t += r.ing - r.gas; }
  return t;
}

// ====== Pintar ======
function pintar() {
  $("#mesLbl").textContent = UI.vista === "anio" ? "Año " + UI.mes.slice(0, 4) : nombreMes(UI.mes);
  $("#personas").innerHTML = filtrosP().map(p => `<button class="chip ${UI.filtroP === p ? "on" : ""}" data-p="${p}">${p}</button>`).join("");
  $("#personas").style.display = UI.vista === "mas" ? "none" : "";
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === UI.vista));
  const v = $("#vista");
  if (UI.vista === "resumen") v.innerHTML = vResumen();
  else if (UI.vista === "movs") v.innerHTML = vMovs();
  else if (UI.vista === "anio") v.innerHTML = vAnio();
  else { v.innerHTML = vMas(); if (S.movs.length) prepararExcel().catch(() => {}); }
  const q = $("#q"); if (q) q.addEventListener("input", e => { UI.q = e.target.value; const pos = e.target.selectionStart; pintar(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); });
}

function vResumen() {
  if (!S.movs.length) return `<div class="vacio"><b>Aún no hay nada</b>Pulsa <b style="display:inline;color:var(--ac)">Subir extracto</b> y elige el PDF que descargas de la app de ING o el CSV de CaixaBankNow.</div>`;
  const lista = movsDe(UI.mes, UI.filtroP);
  if (!lista.length) return `<div class="vacio"><b>Sin movimientos en ${nombreMes(UI.mes)}</b>Cambia de mes con las flechas o sube el extracto de este mes.</div>`;
  const r = resumen(lista), ant = resumen(movsDe(sumaMes(UI.mes, -1), UI.filtroP));
  const bal = r.ing - r.gas - r.aho;
  const jun = UI.filtroP === "Juntos", ahMes = r.ing - r.gas, ahAnio = ahorroAnio(UI.mes, UI.filtroP);
  let h = "";
  if (r.revisar) h += `<button class="aviso" data-act="revisar">${r.revisar} movimiento${r.revisar > 1 ? "s" : ""} por revisar ›</button>`;
  h += `<div class="cards">
    <div class="card"><div class="lbl">Ha entrado</div><div class="big pos">${eur(r.ing)}</div></div>
    <div class="card"><div class="lbl">${jun ? "Habéis gastado" : "Has gastado"}</div><div class="big neg">${eur(r.gas)}</div></div>
    ${jun ? `<div class="card ancha"><div class="lbl">Ahorráis juntos este mes${r.aho ? " (" + eur(r.aho) + " ya apartado en ahorro)" : ""}</div><div class="big ${ahMes >= 0 ? "pos" : "neg"}">${eur(ahMes)}</div>
      ${ant.gas ? `<div class="lbl" style="margin-top:4px">Mes anterior gastasteis ${eur(ant.gas)} (${difTxt(r.gas, ant.gas)})</div>` : ""}<div class="lbl" style="margin-top:4px">En ${UI.mes.slice(0, 4)} lleváis ahorrado <b class="${ahAnio >= 0 ? "pos" : "neg"}">${eur(ahAnio)}</b></div></div>` : ""}
    <div class="card ancha" ${jun && !r.aho ? 'style="display:none"' : ""}><div class="lbl">${jun ? "Os queda en cuenta este mes" : "Te queda este mes"}${r.aho ? " (después de ahorrar " + eur(r.aho) + ")" : ""}</div><div class="big ${bal >= 0 ? "pos" : "neg"}">${eur(bal)}</div>
      ${ant.gas ? `<div class="lbl" style="margin-top:4px">Mes anterior ${jun ? "gastasteis" : "gastaste"} ${eur(ant.gas)} (${difTxt(r.gas, ant.gas)})</div>` : ""}</div>
    <div class="card ancha"><div class="lbl">Fijos ${eur(r.fijo)} · Variables ${eur(r.vari)}</div>
      <div class="barra"><i style="width:${r.gas ? (r.fijo / r.gas * 100) : 0}%;background:#a78bfa"></i><i style="width:${r.gas ? (r.vari / r.gas * 100) : 0}%;background:var(--ac)"></i></div>
      <div class="lbl" style="margin-top:6px"><span style="color:#a78bfa">■</span> Fijos (hipoteca, recibos...) <span style="color:var(--ac);margin-left:8px">■</span> Variables</div></div>
  </div>`;
  const cats = Object.entries(r.cats).filter(([, v]) => Math.abs(v) > 0.004).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...cats.map(c => c[1]), 1);
  h += `<h3>En qué se ha ido</h3>`;
  h += cats.map(([c, v]) => {
    const a = ant.cats[c] || 0, d = v - a;
    return `<button class="fila" data-cat="${esc(c)}"><div class="q"><div class="n">${esc(c)}</div><div class="mini"><i style="width:${Math.max(2, v / max * 100)}%"></i></div></div>
      <div><div class="v">${eur(v)}</div>${a ? `<div class="d ${d > 0 ? "neg" : "pos"}">${d > 0 ? "+" : ""}${eur0(d)}</div>` : ""}</div></button>`;
  }).join("");
  const ings = Object.entries(r.ingCats).sort((a, b) => b[1] - a[1]);
  if (ings.length) {
    h += `<h3>De dónde ha entrado</h3>` + ings.map(([c, v]) => `<button class="fila" data-cat="${esc(c)}"><div class="q"><div class="n">${esc(c)}</div></div><div class="v pos">${eur(v)}</div></button>`).join("");
  }
  return h;
}
function difTxt(a, b) { if (!b) return ""; const p = Math.round((a - b) / b * 100); return p === 0 ? "igual" : (p > 0 ? "+" : "") + p + "%"; }

function vMovs() {
  let lista = movsDe(UI.mes, UI.filtroP);
  let h = `<div class="personas" style="padding:0 0 6px">
    <button class="chip ${!UI.soloRevisar && !UI.filtroCat ? "on" : ""}" data-act="todos">Todos</button>
    <button class="chip ${UI.soloRevisar ? "on" : ""}" data-act="revisar">Por revisar</button>
    ${UI.filtroCat ? `<button class="chip on" data-act="todos">${esc(UI.filtroCat)} ✕</button>` : ""}
    <button class="chip" data-act="nuevo">+ Añadir a mano</button></div>
    <input id="q" class="buscar" placeholder="Buscar..." value="${esc(UI.q)}" autocomplete="off">`;
  if (UI.soloRevisar) lista = lista.filter(porRevisar);
  if (UI.filtroCat) lista = lista.filter(m => catDe(m) === UI.filtroCat);
  if (UI.q) { const q = UI.q.toLowerCase(); lista = lista.filter(m => m.concepto.toLowerCase().includes(q) || catDe(m).toLowerCase().includes(q)); }
  if (!lista.length) return h + `<div class="vacio">${UI.soloRevisar ? "<b>Todo revisado</b>No queda nada por revisar este mes." : "No hay movimientos."}</div>`;
  lista = lista.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.orden || 0) - (a.orden || 0));
  let dia = "";
  for (const m of lista) {
    if (m.fecha !== dia) { dia = m.fecha; h += `<div class="dia">${fechaLarga(dia)}</div>`; }
    const cat = catDe(m);
    h += `<button class="fila" data-id="${m.id}"><div class="q"><div class="n">${esc(FinCore.limpiar(m.concepto))}</div>
      <div class="s">${esc(cat)}${porRevisar(m) ? '<span class="tag">revisar</span>' : ""} · ${esc(m.persona)}${m.fecha.slice(0, 7) !== m.mes ? " · fecha " + m.fecha.slice(8) + "/" + m.fecha.slice(5, 7) : ""}</div></div>
      <div class="v ${m.importe > 0 ? "pos" : ""}">${m.importe > 0 ? "+" : ""}${eur(m.importe)}</div></button>`;
  }
  return h;
}

function vAnio() {
  const y = UI.mes.slice(0, 4);
  const meses = Array.from({ length: 12 }, (_, i) => y + "-" + String(i + 1).padStart(2, "0"));
  const rs = meses.map(m => resumen(movsDe(m, UI.filtroP)));
  const max = Math.max(1, ...rs.map(r => Math.max(r.gas, r.ing)));
  const tg = rs.reduce((a, r) => a + r.gas, 0), ti = rs.reduce((a, r) => a + r.ing, 0);
  const conDatos = rs.filter(r => r.gas || r.ing).length;
  let h = `<div class="cards"><div class="card"><div class="lbl">Entrado en ${y}</div><div class="big pos">${eur0(ti)}</div></div>
    <div class="card"><div class="lbl">Gastado en ${y}</div><div class="big neg">${eur0(tg)}</div></div>
    ${conDatos ? `<div class="card ancha"><div class="lbl">Media de gasto por mes (${conDatos} mes${conDatos > 1 ? "es" : ""} con datos)</div><div class="big">${eur0(tg / conDatos)}</div></div>` : ""}</div>`;
  h += `<div class="card anio"><div class="col">${rs.map((r, i) => `<button class="m" data-mes="${meses[i]}"><div class="bars"><i class="in" style="height:${r.ing / max * 100}%"></i><i style="height:${r.gas / max * 100}%"></i></div><span>${FinCore.MESES[i].slice(0, 3)}</span></button>`).join("")}</div>
    <div class="lbl" style="margin-top:6px"><span class="pos">■</span> Entrado <span class="neg" style="margin-left:8px">■</span> Gastado · toca un mes para verlo</div></div>`;
  // por categoria en el año
  const cats = {};
  rs.forEach(r => Object.entries(r.cats).forEach(([c, v]) => cats[c] = (cats[c] || 0) + v));
  const lc = Object.entries(cats).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
  if (lc.length) h += `<h3>Gasto del año por categoría</h3>` + lc.map(([c, v]) => `<div class="fila"><div class="q"><div class="n">${esc(c)}</div><div class="s">${eur0(v / Math.max(conDatos, 1))} al mes de media</div></div><div class="v">${eur0(v)}</div></div>`).join("");
  // se repiten
  const rep = repetidos(y);
  if (rep.length) h += `<h3>Se repiten cada mes (recibos y suscripciones)</h3>` + rep.map(r => `<div class="fila"><div class="q"><div class="n">${esc(r.nombre)}</div><div class="s">${esc(r.cat)} · ${r.meses} meses</div></div><div class="v">${eur(r.imp)}</div></div>`).join("") +
    `<div class="lbl" style="margin:6px 2px">Mismo comercio y mismo importe en meses distintos. Revisa si alguna suscripción ya no la usas.</div>`;
  return h;
}
function repetidos(y) {
  const g = {};
  for (const m of S.movs) {
    if (!m.mes.startsWith(y) || m.importe >= 0) continue;
    if (UI.filtroP !== "Juntos" && m.persona !== UI.filtroP) continue;
    if (/^transferencia/i.test(m.concepto)) continue;
    const k = FinCore.claveComercio(m.concepto) + "|" + m.importe.toFixed(2);
    (g[k] ||= { nombre: FinCore.limpiar(m.concepto), imp: -m.importe, cat: catDe(m), meses: new Set() }).meses.add(m.mes);
  }
  return Object.values(g).filter(x => x.meses.size >= 2).map(x => ({ ...x, meses: x.meses.size })).sort((a, b) => b.imp - a.imp);
}

function vMas() {
  const imps = S.imports.slice().sort((a, b) => b.mes.localeCompare(a.mes));
  let h = `<h3>Extractos subidos</h3>`;
  h += imps.length ? imps.map(i => `<button class="fila" data-imp="${i.id}"><div class="q"><div class="n">${esc(i.banco)} · ${nombreImp(i.mes)}</div><div class="s">${esc(i.persona)} · ${i.n} movimientos · ${esc(i.archivo || "")}</div></div><div class="v mut">›</div></button>`).join("")
    : `<div class="lbl" style="margin:0 2px">Ninguno todavía.</div>`;
  h += `<h3>Mis reglas (${S.reglas.length})</h3>`;
  h += S.reglas.length ? S.reglas.map((r, i) => `<button class="fila" data-regla="${i}"><div class="q"><div class="n">“${esc(r.t)}”${r.imp != null ? " · " + eur(r.imp) : ""}</div><div class="s">→ ${esc(r.cat)}</div></div><div class="v mut">✕</div></button>`).join("")
    : `<div class="lbl" style="margin:0 2px">Se crean cuando corriges un movimiento y marcas “usar siempre”.</div>`;
  h += `<h3>Excel y copias</h3>
    <div class="lbl" style="margin:0 2px 4px">El Excel sale montado con todos los meses: resumen, por persona, movimientos y lo que se repite. Guárdalo encima del anterior.</div>
    <button class="btn" data-act="excel">Descargar mi Excel</button>
    <button class="btn sec" data-act="backup">Hacer copia de seguridad</button>
    <button class="btn sec" data-act="restaurar">Recuperar una copia</button>
    <div class="lbl" style="margin:10px 2px">Los datos se guardan solo en este iPhone, dentro de la app. Haz una copia de vez en cuando y guárdala en Archivos o en OneDrive.</div>
    <button class="btn peligro" data-act="borrarTodo">Borrar todos los datos</button>
    <div class="lbl" style="margin:16px 2px;text-align:center">Mis Finanzas · v1.3 · ${S.movs.length} movimientos</div>`;
  return h;
}

// ====== Hojas (ventanas de abajo) ======
function abrir(html) { $("#hoja").innerHTML = html; $("#velo").classList.add("on"); }
function cerrar() { $("#velo").classList.remove("on"); $("#hoja").innerHTML = ""; }
$("#velo").addEventListener("click", e => { if (e.target.id === "velo" || e.target.closest(".x")) cerrar(); });

function opcionesCat(sel) {
  const grupos = {};
  CATS.forEach(c => (grupos[c.t] ||= []).push(c.n));
  const nom = { "Gasto": "Gastos", "Ingreso": "Ingresos", "Según signo": "Según el signo", "Ahorro": "Ahorro", "Transferencia": "No cuenta" };
  return Object.entries(grupos).map(([t, l]) => `<optgroup label="${nom[t] || t}">${l.map(n => `<option ${n === sel ? "selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>`).join("");
}
function chipsPersona(sel, name) {
  return `<div class="personas" style="padding:0" data-grupo="${name}">${PERSONAS.map(p => `<button type="button" class="chip ${p === sel ? "on" : ""}" data-pp="${p}">${p}</button>`).join("")}</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-pp]"); if (!b) return;
  b.parentElement.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === b));
});
const personaSel = (root) => (root.querySelector("[data-pp].on") || {}).dataset?.pp || PERSONAS[0];

function editar(id) {
  const nuevo = !id;
  const m = nuevo ? { id: uid(), fecha: new Date().toISOString().slice(0, 10), mes: UI.mes, concepto: "", importe: 0, banco: "A mano", persona: S.persona || "Sebas", cat: null } : S.movs.find(x => x.id === id);
  const cat = nuevo ? "Alimentación" : catDe(m);
  const clave = FinCore.claveComercio(m.concepto);
  const esTransf = /^transferencia/i.test(m.concepto);
  abrir(`<h2>${nuevo ? "Añadir a mano" : esc(FinCore.limpiar(m.concepto))}<button class="x">✕</button></h2>
    ${nuevo ? `<div class="campo"><label>Concepto</label><input id="eCon" placeholder="Ej. Peluquería (efectivo)"></div>
      <div class="campo"><label>Importe (en negativo si es un gasto)</label><input id="eImp" inputmode="decimal" placeholder="-20,00"></div>
      <div class="campo"><label>Fecha</label><input id="eFec" type="date" value="${m.fecha}"></div>`
      : `<div class="lbl">${esc(m.concepto)}</div><div class="big ${m.importe > 0 ? "pos" : ""}" style="margin:6px 0">${eur(m.importe)}</div>
      <div class="lbl">${fechaLarga(m.fecha)} · ${esc(m.banco)}${m.cuenta ? " · " + esc(m.cuenta) : ""}</div>`}
    <div class="campo"><label>Categoría</label><select id="eCat">${opcionesCat(cat)}</select></div>
    ${nuevo ? "" : `<label class="check"><input type="checkbox" id="eSiempre" checked><div>Usar siempre para los que contengan
      <input id="eClave" value="${esc(clave)}" style="margin-top:6px">
      <label class="check" style="padding:8px 0 0;margin:0;background:none"><input type="checkbox" id="eSoloImp" ${esTransf ? "checked" : ""}><div>Solo si el importe es ${eur(m.importe)}</div></label>
      <div class="lbl" style="margin-top:4px">${esTransf ? "Las transferencias se llaman todas igual: mejor que dependa del importe (por ejemplo la nómina)." : "Así los próximos meses ya saldrá bien."}</div></div></label>`}
    ${nuevo ? "" : PARES.has(m.id) ? (() => { const o = S.movs.find(x => x.id === PARES.get(m.id)); return `<div class="ok" style="margin:10px 2px">✓ Traspaso entre tus cuentas: emparejado con ${esc(o.banco)} ${o.fecha.slice(8)}/${o.fecha.slice(5, 7)} (${eur(o.importe)}). No cuenta ni como gasto ni como ingreso.</div>
      <button class="btn sec" id="eNoTr" style="font-size:16px">No es un traspaso</button>`; })()
      : cat === TRASP ? "" : `<button class="btn sec" id="eTr" style="font-size:16px">Es un traspaso entre mis cuentas</button>`}
    <div class="campo"><label>Cuenta en el mes</label><input id="eMes" type="month" value="${m.mes}"></div>
    <div class="campo"><label>De quién es</label>${chipsPersona(m.persona, "e")}</div>
    <button class="btn" id="eOk">Guardar</button>
    ${nuevo ? "" : `<button class="btn peligro" id="eDel">Borrar este movimiento</button>`}`);
  $("#eOk").onclick = () => {
    const h = $("#hoja");
    if (nuevo) {
      const imp = FinCore.num($("#eImp").value);
      if (!$("#eCon").value.trim() || imp == null) return toast("Pon concepto e importe");
      m.concepto = $("#eCon").value.trim(); m.importe = imp; m.fecha = $("#eFec").value || m.fecha; m.orden = Date.now();
    }
    const nc = $("#eCat").value;
    m.mes = $("#eMes").value || m.mes; m.persona = personaSel(h);
    if (nuevo) { m.cat = nc; S.movs.push(m); }
    else if ($("#eSiempre").checked && $("#eClave").value.trim()) {
      const t = $("#eClave").value.trim().toLowerCase();
      const imp = $("#eSoloImp").checked ? m.importe : null;
      S.reglas = S.reglas.filter(r => !(r.t === t && r.imp === imp));
      S.reglas.push({ t, cat: nc, imp });
      m.cat = null;
      if (!m.concepto.toLowerCase().includes(t)) m.cat = nc;
      const n = S.movs.filter(x => !x.cat && reglaUsuario(x) && reglaUsuario(x).t === t).length;
      toast(`Guardado. Regla aplicada a ${n} movimiento${n > 1 ? "s" : ""}`);
    } else { m.cat = nc; toast("Guardado"); }
    guardar(); cerrar(); pintar();
  };
  if ($("#eTr")) $("#eTr").onclick = () => { m.cat = TRASP; guardar(); cerrar(); pintar(); toast("Marcado como traspaso: ya no cuenta"); };
  if ($("#eNoTr")) $("#eNoTr").onclick = () => { m.noPar = true; guardar(); cerrar(); pintar(); toast("Hecho: ya no se empareja"); };
  if (!nuevo) $("#eDel").onclick = () => { if (!confirm("¿Borrar este movimiento?")) return; S.movs = S.movs.filter(x => x !== m); guardar(); cerrar(); pintar(); };
}

// ====== Subir extracto ======
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
$("#subirBtn").onclick = () => $("#fileIn").click();
$("#fileIn").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  abrir(`<div class="cargando">Leyendo ${esc(f.name)}...</div>`);
  try {
    if (/\.csv$/i.test(f.name) || /csv/i.test(f.type)) {
      const buf = await f.arrayBuffer();
      let txt = new TextDecoder("utf-8").decode(buf);
      if (txt.includes("\uFFFD")) txt = new TextDecoder("windows-1252").decode(buf);
      const rc = FinCore.leerCSV(txt, f.name);
      if (!rc) throw new Error("He abierto el CSV pero no encuentro las columnas Concepto, Fecha e Importe.");
      return vistaPrevia(rc, f.name);
    }
    const data = new Uint8Array(await f.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
    const items = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      for (const it of tc.items) items.push({ p, x: it.transform[4], y: it.transform[5], s: it.str });
    }
    const r = FinCore.leerExtracto(items);
    if (!r.movs.length) throw new Error("He leído el PDF pero no encuentro movimientos.");
    vistaPrevia(r, f.name);
  } catch (err) {
    abrir(`<h2>No he podido leerlo<button class="x">✕</button></h2><p>${esc(err.message || err)}</p>
      <p class="mut">${err.code === "BANCO" ? "Si es de otro banco, pásale el PDF a Aki para que aprenda a leerlo." : "Comprueba que es el PDF del extracto tal como lo descarga la app del banco."}</p><button class="btn sec x" style="font-size:16px">Cerrar</button>`);
  }
});

function idMov(banco, m) { return [banco, m.cuenta || "", m.fecha, m.importe.toFixed(2), m.saldo != null ? m.saldo.toFixed(2) : "", m.concepto].join("|"); }

function vistaPrevia(r, archivo) {
  const ids = new Set(S.movs.map(m => m.idb));
  const nuevos = r.movs.filter(m => !ids.has(idMov(r.banco, m)));
  const rep = r.movs.length - nuevos.length;
  const mes = r.mes || UI.mes;
  const gas = nuevos.filter(m => m.importe < 0).reduce((a, m) => a - m.importe, 0);
  const ing = nuevos.filter(m => m.importe > 0).reduce((a, m) => a + m.importe, 0);
  const sinCat = nuevos.filter(m => porRevisar({ ...m, cat: null })).length;
  // Extracto de varios meses: si hay 3 o mas meses distintos, cada movimiento va a su mes por fecha
  const cuenta = {}; nuevos.forEach(m => { const k = m.fecha.slice(0, 7); cuenta[k] = (cuenta[k] || 0) + 1; });
  const mesesF = Object.keys(cuenta).sort(), varios = mesesF.length >= 3 || (r.porFecha && mesesF.length > 0);
  abrir(`<h2>Extracto ${esc(r.banco)}<button class="x">✕</button></h2>
    <div class="lbl">${esc(r.cuentas.map(c => c.nombre + (c.iban4 ? " ··" + c.iban4 : "")).join(", "))}</div>
    <div class="cards" style="margin-top:10px">
      <div class="card"><div class="lbl">Movimientos</div><div class="big">${r.movs.length}</div></div>
      <div class="card"><div class="lbl">Clasificados solos</div><div class="big">${nuevos.length - sinCat}/${nuevos.length}</div></div>
      <div class="card"><div class="lbl">Entradas</div><div class="big pos">${eur(ing)}</div></div>
      <div class="card"><div class="lbl">Gastos</div><div class="big neg">${eur(gas)}</div></div></div>
    <div class="${r.cuadra ? "ok" : "ko"}" style="margin:4px 2px">${r.cuadra ? "✓ Cuadra con los saldos del banco: no falta ningún movimiento." : "⚠ Los saldos no cuadran: puede que falte algún movimiento. Revísalo."}</div>
    ${rep ? `<div class="aviso" style="margin-top:10px">${rep === r.movs.length ? "Este extracto ya estaba subido entero. No se duplicará nada." : rep + " movimientos ya estaban subidos y no se duplican."}</div>` : ""}
    ${varios ? `<div class="ok" style="margin:10px 2px">${mesesF.length > 1 ? `Este extracto tiene ${mesesF.length} meses (${nombreMes(mesesF[0])} a ${nombreMes(mesesF[mesesF.length - 1])}). Cada movimiento irá a su mes.` : `Es de ${nombreMes(mesesF[0])}.`}</div>`
      : `<div class="campo"><label>Mes al que lo subo</label><input type="month" id="pMes" value="${mes}"></div>
    <div class="lbl" style="margin:-6px 2px 0">Todos los movimientos irán a este mes, aunque alguno tenga otra fecha.</div>`}
    <div class="campo"><label>De quién es</label>${chipsPersona(S.persona || "Sebas", "p")}</div>
    <button class="btn" id="pOk" ${nuevos.length ? "" : "disabled style='opacity:.5'"}>Guardar ${nuevos.length} movimientos</button>
    <button class="btn sec x" style="font-size:16px">Cancelar</button>`);
  $("#pOk").onclick = () => {
    if (!nuevos.length) return;
    const mesSel = varios ? mesesF[mesesF.length - 1] : ($("#pMes").value || mes), per = personaSel($("#hoja"));
    const imp = { id: uid(), banco: r.banco, mes: varios ? (mesesF.length > 1 ? mesesF[0] + "/" + mesesF[mesesF.length - 1] : mesesF[0]) : mesSel, persona: per, archivo, fecha: new Date().toISOString(), n: nuevos.length };
    const base = Date.now();
    nuevos.forEach((m, i) => S.movs.push({ id: uid() + i, idb: idMov(r.banco, m), fecha: m.fecha, mes: varios ? m.fecha.slice(0, 7) : mesSel, concepto: m.concepto, importe: m.importe, saldo: m.saldo,
      banco: r.banco, cuenta: m.cuenta, persona: per, cat: null, imp: imp.id, orden: base + i }));
    S.imports.push(imp); S.persona = per; UI.mes = mesSel; UI.filtroP = "Juntos";
    guardar(); UI.vista = "resumen"; pintar();
    prepararExcel().catch(() => {});
    const rv = S.movs.filter(m => m.imp === imp.id && porRevisar(m)).length;
    abrir(`<h2>Guardado<button class="x">✕</button></h2>
      <p class="ok" style="font-weight:600">✓ ${nuevos.length} movimientos en ${varios ? nombreImp(imp.mes) : nombreMes(mesSel)}</p>
      ${rv ? `<p class="mut">${rv} quedan por revisar. Puedes hacerlo ahora o después; luego vuelve a descargar el Excel.</p>` : ""}
      <button class="btn" id="gExcel">Descargar mi Excel</button>
      ${rv ? `<button class="btn sec" id="gRev">Revisar ahora</button>` : ""}
      <button class="btn sec x" style="font-size:16px">Ahora no</button>`);
    $("#gExcel").onclick = e => botonExcel(e.currentTarget);
    if (rv) $("#gRev").onclick = () => { cerrar(); UI.vista = "movs"; UI.soloRevisar = true; UI.filtroCat = null; pintar(); };
  };
}

// ====== Más: extractos, reglas, copias ======
function verImport(id) {
  const i = S.imports.find(x => x.id === id); if (!i) return;
  const n = S.movs.filter(m => m.imp === id).length;
  abrir(`<h2>${esc(i.banco)} · ${nombreImp(i.mes)}<button class="x">✕</button></h2>
    <div class="lbl">${esc(i.archivo || "")} · subido el ${new Date(i.fecha).toLocaleDateString("es-ES")} · ${esc(i.persona)}</div>
    <p>${n} movimientos.</p>
    <button class="btn peligro" id="iDel">Quitar este extracto y sus movimientos</button>`);
  $("#iDel").onclick = () => { if (!confirm("¿Quitar el extracto y sus " + n + " movimientos?")) return; S.movs = S.movs.filter(m => m.imp !== id); S.imports = S.imports.filter(x => x.id !== id); guardar(); cerrar(); pintar(); toast("Extracto quitado"); };
}

function descargar(nombre, blob) {
  const file = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
let excelJsCargado = null;
function cargarExcelJS() {
  return excelJsCargado ||= new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "vendor/exceljs.min.js"; s.onload = ok; s.onerror = () => { excelJsCargado = null; ko(new Error("no se pudo cargar")); }; document.head.appendChild(s); });
}
// El Excel se prepara antes de tocar el boton: el iPhone solo deja "Guardar en Archivos" justo despues de un toque
let excelListo = { ver: -1, blob: null, p: null };
function filasExcel() {
  return S.movs.map(m => { const cat = catDe(m); return { fecha: m.fecha, mes: m.mes, concepto: m.concepto, importe: m.importe, cat, tipo: tipoDe(cat, m.importe), fijo: !!(CAT[cat] || {}).fijo, persona: m.persona, banco: m.banco }; });
}
function prepararExcel() {
  if (excelListo.ver === VER && (excelListo.blob || excelListo.p)) return excelListo.p || Promise.resolve(excelListo.blob);
  const ver = VER;
  excelListo = { ver, blob: null, p: null };
  excelListo.p = cargarExcelJS().then(() => construirExcel(ExcelJS, filasExcel(), PERSONAS, FinCore)).then(buf => {
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (excelListo.ver === ver) { excelListo.blob = blob; excelListo.p = null; }
    return blob;
  });
  return excelListo.p;
}
const nombreExcel = () => "Mis Finanzas.xlsx";
// boton: si ya esta listo lo guarda al momento; si no, espera y pide otro toque
function botonExcel(btn) {
  if (!S.movs.length) return toast("Primero sube un extracto");
  if (excelListo.ver === VER && excelListo.blob) { descargar(nombreExcel(), excelListo.blob); btn.textContent = "Descargar mi Excel"; return; }
  if (btn.disabled) return;
  btn.textContent = "Preparando el Excel..."; btn.disabled = true;
  prepararExcel().then(() => { btn.disabled = false; btn.textContent = "Listo: toca para guardarlo"; })
    .catch(err => { btn.disabled = false; btn.textContent = "Descargar mi Excel"; alert("No se pudo preparar el Excel: " + err.message); });
}

// ====== Eventos ======
$("#prev").onclick = () => { UI.mes = UI.vista === "anio" ? sumaMes(UI.mes, -12) : sumaMes(UI.mes, -1); pintar(); };
$("#next").onclick = () => { UI.mes = UI.vista === "anio" ? sumaMes(UI.mes, 12) : sumaMes(UI.mes, 1); pintar(); };
$("#tabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; UI.vista = b.dataset.v; if (UI.vista !== "movs") { UI.soloRevisar = false; UI.filtroCat = null; } pintar(); window.scrollTo(0, 0); };
$("#personas").onclick = e => { const b = e.target.closest("[data-p]"); if (!b) return; UI.filtroP = b.dataset.p; pintar(); };
$("#vista").addEventListener("click", e => {
  const t = e.target.closest("[data-act],[data-cat],[data-id],[data-mes],[data-imp],[data-regla]"); if (!t) return;
  const d = t.dataset;
  if (d.cat) { UI.vista = "movs"; UI.filtroCat = d.cat; UI.soloRevisar = false; pintar(); window.scrollTo(0, 0); }
  else if (d.id) editar(d.id);
  else if (d.mes) { UI.mes = d.mes; UI.vista = "resumen"; pintar(); }
  else if (d.imp) verImport(d.imp);
  else if (d.regla != null) { const r = S.reglas[+d.regla]; if (confirm(`¿Quitar la regla “${r.t}” → ${r.cat}?`)) { S.reglas.splice(+d.regla, 1); guardar(); pintar(); } }
  else if (d.act === "revisar") { UI.vista = "movs"; UI.soloRevisar = true; UI.filtroCat = null; pintar(); }
  else if (d.act === "todos") { UI.soloRevisar = false; UI.filtroCat = null; pintar(); }
  else if (d.act === "nuevo") editar(null);
  else if (d.act === "excel") botonExcel(t);
  else if (d.act === "backup") descargar("Finanzas-copia-" + new Date().toISOString().slice(0, 10) + ".json", new Blob([JSON.stringify(S)], { type: "application/json" }));
  else if (d.act === "restaurar") $("#backupIn").click();
  else if (d.act === "borrarTodo") { if (confirm("¿Borrar TODOS los datos de la app? Haz antes una copia de seguridad.") && confirm("¿Seguro? No se puede deshacer.")) { S = { v: 1, movs: [], imports: [], reglas: [], persona: "Sebas" }; guardar(); pintar(); } }
});
$("#backupIn").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { const s = JSON.parse(await f.text()); if (!s.movs) throw 0; if (!confirm(`La copia tiene ${s.movs.length} movimientos. Sustituirá lo que hay ahora. ¿Seguir?`)) return; S = Object.assign({ imports: [], reglas: [] }, s); guardar(); UI.mes = ultimoMes() || UI.mes; pintar(); toast("Copia recuperada"); }
  catch (err) { alert("Ese archivo no es una copia de Mis Finanzas."); }
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
pintar();
