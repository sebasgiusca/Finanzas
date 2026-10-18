// Logica pura (sin pantalla): lectura de extractos y clasificacion.
// Se usa en la app y en las pruebas.
(function (G) {
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  function num(s) { // "-1.470,00 €" -> -1470
    const t = String(s).replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
    const v = parseFloat(t);
    return isNaN(v) ? null : v;
  }
  const RE_IMP = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

  // items: [{p, x, y, s}] de todas las paginas -> filas de texto ordenadas
  function filas(items) {
    const byKey = new Map();
    const sorted = items.filter(i => i.s.trim()).slice().sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of sorted) {
      let r = rows.find(r => r.p === it.p && Math.abs(r.y - it.y) <= 2);
      if (!r) { r = { p: it.p, y: it.y, c: [] }; rows.push(r); }
      r.c.push(it);
    }
    rows.sort((a, b) => a.p - b.p || b.y - a.y);
    rows.forEach(r => { r.c.sort((a, b) => a.x - b.x); r.t = r.c.map(c => c.s.trim()).join(" ").replace(/\s+/g, " "); });
    return rows;
  }

  // ---------- ING (Extracto Integrado) ----------
  function esING(rows) {
    const t = rows.slice(0, 60).map(r => r.t).join("\n");
    return /ING BANK/i.test(rows.map(r => r.t).join(" ")) && /Extracto Integrado|Cuenta .*IBAN/i.test(t + rows.map(r=>r.t).join(" "));
  }

  function leerING(rows) {
    // mes del extracto: "Septiembre 2026"
    let anio = null, mes = null;
    for (const r of rows) {
      const m = r.t.match(new RegExp("^(" + MESES.join("|") + ")\\s+(\\d{4})", "i"));
      if (m) { mes = MESES.indexOf(m[1].toLowerCase()) + 1; anio = +m[2]; break; }
    }
    if (!anio) {
      for (const r of rows) { const m = r.t.match(/Saldo Inicial a \d{2}\/(\d{2})\/(\d{4})/i); if (m) { mes = +m[1]; anio = +m[2]; break; } }
    }
    // fecha de inicio del periodo ("Saldo Inicial a 31/12/2025") para saber el año del primer movimiento
    let iniY = null;
    for (const r of rows) { const m = r.t.match(/Saldo Inicial a (\d{2})\/(\d{2})\/(\d{4})/i); if (m) { iniY = +m[3]; break; } }
    const movs = []; const cuentas = [];
    let cuenta = null, saldoIni = null, dentro = false;
    for (const r of rows) {
      const t = r.t;
      const mc = t.match(/^(Cuenta .+?) - IBAN:\s*([A-Z]{2}[\d ]+)/i);
      if (mc) { cuenta = { nombre: mc[1].trim(), iban4: mc[2].replace(/\s/g, "").slice(-4), saldoIni: null, saldoFin: null, n: 0 }; cuentas.push(cuenta); dentro = false; continue; }
      if (!cuenta) continue;
      if (/^Fecha operaci/i.test(t)) { dentro = true; continue; }
      if (!dentro) continue;
      let m = t.match(/^Saldo inicial\s+(-?[\d.]+,\d{2})/i);
      if (m) { cuenta.saldoIni = num(m[1]); continue; }
      if (/^Saldo final/i.test(t) || /^[\d.]+,\d{2} ?€? Saldo final/i.test(t)) { dentro = false; continue; }
      // fila de movimiento: dd/mm dd/mm concepto importe € saldo €
      m = t.match(/^(\d{2})\/(\d{2})\s+(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})\s?€\s+(-?[\d.]+,\d{2})\s?€$/);
      if (!m) continue;
      const d = +m[1], mm = +m[2];
      // Año: se sigue la secuencia de meses (sirve para extractos de un mes o de varios, incluso cruzando de año)
      if (cuenta.y == null) {
        if (iniY) cuenta.y = iniY;
        else { cuenta.y = anio || new Date().getFullYear(); if (mes && mm > mes + 1) cuenta.y -= 1; else if (mes && mm < mes - 10) cuenta.y += 1; }
      } else if (cuenta.mm != null) {
        if (mm < cuenta.mm - 6) cuenta.y += 1;        // dic -> ene (orden ascendente)
        else if (mm > cuenta.mm + 6) cuenta.y -= 1;   // ene -> dic (orden descendente)
      }
      cuenta.mm = mm;
      const y = cuenta.y;
      movs.push({
        fecha: y + "-" + String(mm).padStart(2, "0") + "-" + String(d).padStart(2, "0"),
        concepto: m[5].trim(),
        importe: num(m[6]),
        saldo: num(m[7]),
        cuenta: cuenta.nombre + " ··" + cuenta.iban4,
      });
      cuenta.n++;
    }
    // saldo final de cada cuenta (fila suelta con el importe antes de "Saldo final")
    // Comprobacion: saldo anterior + importe = saldo de la fila
    let cuadra = movs.length > 0, prev = null, prevCuenta = null;
    for (const c of cuentas) prev = null;
    for (const mv of movs) {
      if (mv.cuenta !== prevCuenta) { prevCuenta = mv.cuenta; const c = cuentas.find(c => mv.cuenta.startsWith(c.nombre)); prev = c && c.saldoIni; }
      if (prev != null && Math.abs(prev + mv.importe - mv.saldo) > 0.005) cuadra = false;
      prev = mv.saldo;
    }
    return { banco: "ING", mes: anio && mes ? anio + "-" + String(mes).padStart(2, "0") : null, cuentas, movs, cuadra };
  }

  // ---------- CSV (CaixaBankNow: Concepto;Fecha;Importe;Saldo) ----------
  function partirCSV(l, sep) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out.map(x => x.trim());
  }
  function leerCSV(texto, archivo) {
    const lin = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
    if (lin.length < 2) return null;
    const sep = (lin[0].match(/;/g) || []).length >= (lin[0].match(/,/g) || []).length ? ";" : ",";
    const cab = partirCSV(lin[0], sep).map(h => h.toLowerCase());
    const col = re => cab.findIndex(h => re.test(h));
    const iC = col(/concepto|descripci/), iF = col(/^fecha/), iI = col(/importe/), iS = col(/saldo/);
    if (iC < 0 || iF < 0 || iI < 0) return null;
    const banco = /caixa/i.test(archivo || "") ? "CaixaBank" : "Banco";
    const importe = v => num(String(v || "").replace(/eur|€|\s/gi, "").replace(/^\+/, ""));
    let movs = [];
    for (const l of lin.slice(1)) {
      const c = partirCSV(l, sep);
      const f = (c[iF] || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); const imp = importe(c[iI]);
      if (!f || imp == null) continue;
      const y = f[3].length === 2 ? 2000 + +f[3] : +f[3];
      movs.push({ fecha: y + "-" + f[2].padStart(2, "0") + "-" + f[1].padStart(2, "0"), concepto: (c[iC] || "").replace(/\s+/g, " "),
        importe: imp, saldo: iS >= 0 ? importe(c[iS]) : null, cuenta: banco });
    }
    if (!movs.length) return null;
    if (movs[0].fecha > movs[movs.length - 1].fecha) movs.reverse();   // CaixaBank lo da del mas nuevo al mas viejo
    let cuadra = iS >= 0;
    for (let i = 1; i < movs.length && cuadra; i++) if (movs[i].saldo == null || movs[i - 1].saldo == null || Math.abs(movs[i - 1].saldo + movs[i].importe - movs[i].saldo) > 0.005) cuadra = false;
    return { banco, mes: null, porFecha: true, cuentas: [{ nombre: banco, iban4: "" }], movs, cuadra };
  }

  function leerExtracto(items) {
    const rows = filas(items);
    if (esING(rows)) return leerING(rows);
    const err = new Error("No reconozco este extracto. De momento sé leer los PDF de ING (Extracto Integrado) y el CSV de CaixaBankNow.");
    err.code = "BANCO";
    throw err;
  }

  // ---------- Clasificacion ----------
  // reglas: [[texto, categoria]]; gana la MAS LARGA; empate: la de mas abajo (igual que el Excel)
  function compilar(reglas) {
    return reglas.map(([w, cat], i) => {
      const low = String(w).toLowerCase();
      let re = null;
      if (/[*?]/.test(low)) re = new RegExp(low.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."));
      return { w: low, len: low.length, cat, i, re };
    }).filter(r => r.w);
  }
  function buscar(comp, concepto) {
    const c = String(concepto).toLowerCase();
    let best = null;
    for (const r of comp) {
      const ok = r.re ? r.re.test(c) : c.includes(r.w);
      if (ok && (!best || r.len > best.len || (r.len === best.len && r.i > best.i))) best = r;
    }
    return best;
  }

  // Texto bonito para mostrar
  function limpiar(concepto) {
    return String(concepto)
      .replace(/^Pago\s+/i, "")
      .replace(/\s*\*{2,}\d{3,4}\s*$/, "")
      .replace(/^\d{3,5}\s+(?=[A-Z])/, "")
      .replace(/\s+/g, " ").trim();
  }

  // Clave para reconocer el mismo comercio en meses distintos
  function claveComercio(concepto) {
    return limpiar(concepto).toLowerCase().replace(/[0-9*]+/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
  }

  G.FinCore = { leerExtracto, leerCSV, filas, leerING, compilar, buscar, limpiar, claveComercio, num, MESES };
})(typeof window !== "undefined" ? window : globalThis);
