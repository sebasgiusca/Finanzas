// Construye el Excel completo (ExcelJS). Recibe filas ya clasificadas:
// [{fecha:'2026-09-01', mes:'2026-09', concepto, importe, cat, tipo:'Gasto'|'Ingreso'|'Ahorro'|'Transferencia', fijo:bool, persona, banco}]
(function (G) {
  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const EUR = '#,##0.00 "€";[Red]-#,##0.00 "€"';
  const OSCURO = "FF0F172A", AZUL = "FF1E3A5F", GRIS = "FFF1F5F9", VERDE = "FF15803D", ROJO = "FFB91C1C";
  const nomMes = m => MESES[+m.slice(5) - 1] + " " + m.slice(2, 4);

  function calcular(filas) {
    const r = { ing: 0, gas: 0, aho: 0, fijo: 0, vari: 0, cats: {}, ingCats: {} };
    for (const f of filas) {
      if (f.tipo === "Gasto") { const v = -f.importe; r.gas += v; r.cats[f.cat] = (r.cats[f.cat] || 0) + v; if (f.fijo) r.fijo += v; else r.vari += v; }
      else if (f.tipo === "Ingreso") { r.ing += f.importe; r.ingCats[f.cat] = (r.ingCats[f.cat] || 0) + f.importe; }
      else if (f.tipo === "Ahorro") r.aho += -f.importe;
    }
    r.queda = r.ing - r.gas - r.aho;
    return r;
  }

  function cabecera(ws, fila, textos, color) {
    const row = ws.getRow(fila);
    textos.forEach((t, i) => {
      const c = row.getCell(i + 1); c.value = t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color || AZUL } };
      c.alignment = { horizontal: i ? "center" : "left", vertical: "middle" };
    });
    row.height = 20;
  }
  function titulo(ws, texto, sub) {
    ws.getCell("A1").value = texto; ws.getCell("A1").font = { bold: true, size: 16, color: { argb: OSCURO } };
    if (sub) { ws.getCell("A2").value = sub; ws.getCell("A2").font = { italic: true, color: { argb: "FF64748B" } }; }
  }

  // Bloque: filas = conceptos, columnas = meses + Total + Media
  function bloque(ws, fila, nombre, meses, filasDatos, opts = {}) {
    cabecera(ws, fila, [nombre, ...meses.map(nomMes), "Total", "Media/mes"], opts.color);
    let f = fila + 1;
    for (const [etq, valores, estilo] of filasDatos) {
      const row = ws.getRow(f);
      row.getCell(1).value = etq;
      valores.forEach((v, i) => { const c = row.getCell(i + 2); c.value = Math.round(v * 100) / 100; c.numFmt = EUR; });
      const tot = valores.reduce((a, b) => a + b, 0);
      const ct = row.getCell(meses.length + 2); ct.value = Math.round(tot * 100) / 100; ct.numFmt = EUR; ct.font = { bold: true };
      const cm = row.getCell(meses.length + 3); cm.value = Math.round(tot / Math.max(meses.length, 1) * 100) / 100; cm.numFmt = EUR;
      if (estilo) row.eachCell({ includeEmpty: false }, c => { c.font = Object.assign({}, c.font, estilo.font); if (estilo.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: estilo.fill } }; });
      else if ((f - fila) % 2 === 0) row.eachCell({ includeEmpty: false }, c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } }; });
      f++;
    }
    return f + 1;
  }

  function hojaResumen(wb, nombreHoja, tituloTxt, filas, meses) {
    const ws = wb.addWorksheet(nombreHoja, { views: [{ state: "frozen", xSplit: 1, ySplit: 0 }] });
    titulo(ws, tituloTxt, "Generado por Mis Finanzas el " + new Date().toLocaleDateString("es-ES"));
    const porMes = meses.map(m => calcular(filas.filter(f => f.mes === m)));
    let f = bloque(ws, 4, "Cada mes", meses, [
      ["Ha entrado", porMes.map(r => r.ing), { font: { color: { argb: VERDE }, bold: true } }],
      ["Has gastado", porMes.map(r => r.gas), { font: { color: { argb: ROJO }, bold: true } }],
      ...(porMes.some(r => r.aho) ? [["Ahorro", porMes.map(r => r.aho)]] : []),
      ["Te queda", porMes.map(r => r.queda), { font: { bold: true }, fill: "FFE0F2FE" }],
      ["  Gastos fijos", porMes.map(r => r.fijo)],
      ["  Gastos variables", porMes.map(r => r.vari)],
    ], { color: OSCURO });
    const cats = {}; porMes.forEach(r => Object.entries(r.cats).forEach(([c, v]) => cats[c] = (cats[c] || 0) + v));
    const lc = Object.keys(cats).filter(c => Math.abs(cats[c]) > 0.004).sort((a, b) => cats[b] - cats[a]);
    if (lc.length) f = bloque(ws, f, "Gastos por categoría", meses, [...lc.map(c => [c, porMes.map(r => r.cats[c] || 0)]),
      ["TOTAL GASTOS", porMes.map(r => r.gas), { font: { bold: true }, fill: "FFFEE2E2" }]], { color: ROJO });
    const ic = {}; porMes.forEach(r => Object.entries(r.ingCats).forEach(([c, v]) => ic[c] = (ic[c] || 0) + v));
    const li = Object.keys(ic).sort((a, b) => ic[b] - ic[a]);
    if (li.length) f = bloque(ws, f, "Ingresos por categoría", meses, [...li.map(c => [c, porMes.map(r => r.ingCats[c] || 0)]),
      ["TOTAL INGRESOS", porMes.map(r => r.ing), { font: { bold: true }, fill: "FFDCFCE7" }]], { color: VERDE });
    ws.getColumn(1).width = 38;
    for (let i = 2; i <= meses.length + 3; i++) ws.getColumn(i).width = 13;
    return ws;
  }

  function repetidos(filas, clave, limpiar) {
    const g = {};
    for (const f of filas) {
      if (f.importe >= 0 || /^transferencia/i.test(f.concepto)) continue;
      const k = clave(f.concepto) + "|" + f.importe.toFixed(2);
      (g[k] ||= { n: limpiar(f.concepto), imp: -f.importe, cat: f.cat, persona: f.persona, meses: new Set() }).meses.add(f.mes);
    }
    return Object.values(g).filter(x => x.meses.size >= 2).sort((a, b) => b.imp - a.imp);
  }

  async function construirExcel(ExcelJS, filas, personas, util) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Mis Finanzas"; wb.created = new Date();
    const meses = [...new Set(filas.map(f => f.mes))].sort();
    hojaResumen(wb, "Resumen", "Mis Finanzas · Resumen (todos)", filas, meses);
    for (const p of personas) {
      const fp = filas.filter(f => f.persona === p);
      if (fp.length) hojaResumen(wb, p, "Resumen de " + p, fp, meses);
    }
    // Movimientos
    const ws = wb.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = [["Fecha", 11], ["Mes", 9], ["Concepto", 44], ["Importe", 12], ["Categoría", 34], ["Tipo", 13], ["Fijo/Variable", 13], ["Persona", 10], ["Banco", 9]];
    cabecera(ws, 1, cols.map(c => c[0]), OSCURO);
    cols.forEach((c, i) => ws.getColumn(i + 1).width = c[1]);
    filas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((f, i) => {
      const row = ws.getRow(i + 2);
      const [y, m, d] = f.fecha.split("-").map(Number);
      row.values = [new Date(Date.UTC(y, m - 1, d)), nomMes(f.mes), f.concepto, f.importe, f.cat, f.tipo, f.tipo === "Gasto" ? (f.fijo ? "Fijo" : "Variable") : "", f.persona, f.banco];
      row.getCell(1).numFmt = "dd/mm/yyyy"; row.getCell(4).numFmt = EUR;
      if (f.cat === "Sin clasificar") row.getCell(5).font = { color: { argb: "FFB45309" }, bold: true };
    });
    ws.autoFilter = { from: "A1", to: "I" + Math.max(filas.length + 1, 2) };
    // Se repiten
    const rep = repetidos(filas, util.claveComercio, util.limpiar);
    const wr = wb.addWorksheet("Se repiten");
    titulo(wr, "Recibos y suscripciones que se repiten", "Mismo comercio y mismo importe en meses distintos");
    cabecera(wr, 4, ["Concepto", "Importe", "Categoría", "Persona", "Nº meses", "Al año (aprox.)"], OSCURO);
    rep.forEach((r, i) => {
      const row = wr.getRow(i + 5);
      row.values = [r.n, r.imp, r.cat, r.persona, r.meses.size, Math.round(r.imp * 12 * 100) / 100];
      row.getCell(2).numFmt = EUR; row.getCell(6).numFmt = EUR;
    });
    if (!rep.length) wr.getCell("A5").value = "Aún no hay nada repetido (hace falta subir al menos dos meses).";
    [40, 12, 34, 10, 10, 15].forEach((w, i) => wr.getColumn(i + 1).width = w);
    return wb.xlsx.writeBuffer();
  }

  G.construirExcel = construirExcel;
})(typeof window !== "undefined" ? window : globalThis);
