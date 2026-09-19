/* Calendar periods use the device timezone, explicitly displayed in the report. */
const VisitHistoryData = (() => {
  function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function dates(period, now = new Date()) {
    const start = new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const end = new Date(start);
    if (period === 'week') { start.setDate(start.getDate() - (start.getDay()+6)%7); end.setTime(start.getTime()); end.setDate(end.getDate()+6); }
    if (period === 'month') { start.setDate(1); end.setMonth(end.getMonth()+1,0); }
    return { start: localDate(start), end: localDate(end) };
  }
  function bounds(start, end) {
    const parse = value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Selecciona ambas fechas.');
      const [y,m,d] = value.split('-').map(Number);
      const date = new Date(y,m-1,d);
      if (localDate(date) !== value) throw new Error('Fecha inválida.');
      return date;
    };
    const from = parse(start), to = parse(end);
    if (to < from) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
    to.setDate(to.getDate()+1);
    return { period_start: from.toISOString(), period_end: to.toISOString() };
  }
  function csv(rows, businessName, timezone) {
    // Prevent spreadsheet formulas in user-provided names; quote every cell.
    const cell = value => {
      let s = String(value ?? '');
      if (/^[\s\uFEFF]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"','""') + '"';
    };
    const lines = [['Negocio','Cliente','Fecha y hora local','Zona horaria','Registró / aprobó','ID responsable','ID visita']];
    for (const r of rows) lines.push([businessName,r.customer_name,new Date(r.created_at).toLocaleString('es-MX'),timezone,r.registered_by_name,r.registered_by,r.id]);
    return '\uFEFF' + lines.map(line => line.map(cell).join(',')).join('\r\n');
  }
  async function exportRows(fetchPage, first, valid = () => true) {
    const rows = [];
    let page = first;
    while (true) {
      if (!valid()) throw new Error('La consulta cambió.');
      if (page.total_visits !== first.total_visits || page.unique_customers !== first.unique_customers) throw new Error('El historial cambió. Actualiza el reporte y vuelve a exportar.');
      rows.push(...page.rows);
      if (rows.length >= first.total_visits) break;
      if (!page.rows.length) throw new Error('La descarga quedó incompleta. Actualiza el reporte.');
      page = await fetchPage(rows.length,first.as_of);
    }
    if (rows.length !== first.total_visits || new Set(rows.map(r=>r.id)).size !== rows.length) throw new Error('El historial cambió durante la descarga. Vuelve a consultar.');
    return rows;
  }
  return { dates, bounds, csv, exportRows };
})();

window.visitHistory = (() => {
  const dialog = $('visitHistoryDialog');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let revision = 0, selected = null, query = null, offset = 0, report = null, busy = false;
  function controls(value) {
    busy = value;
    for (const id of ['historyApply','historyPeriod','historyStart','historyEnd']) $(id).disabled = value;
    $('historyExport').disabled = value || !report || !report.total_visits;
    $('historyPrevious').disabled = value || !report || offset === 0;
    $('historyNext').disabled = value || !report || offset + report.rows.length >= report.total_visits;
  }
  function sync() {
    $('openVisitHistory').hidden = !businessId || !(currentIsSuperAdmin || currentBusinessRole === 'owner');
  }
  function preset() {
    if ($('historyPeriod').value === 'custom') return;
    const d = VisitHistoryData.dates($('historyPeriod').value);
    $('historyStart').value = d.start; $('historyEnd').value = d.end;
  }
  async function fetchPage(q, pageOffset, asOf) {
    const {data,error} = await db.rpc('business_visit_history',{...q,page_offset:pageOffset,report_as_of:asOf || null});
    if (error) throw error;
    return data;
  }
  async function refresh(nextOffset = 0, fresh = true) {
    if (busy || !selected) return;
    const ticket = ++revision;
    try {
      const q = fresh ? { target_business_id: selected.id, ...VisitHistoryData.bounds($('historyStart').value,$('historyEnd').value) } : query;
      const asOf = fresh ? null : report?.as_of;
      controls(true); $('historyMessage').textContent = 'Consultando…';
      const data = await fetchPage(q,nextOffset,asOf);
      if (ticket !== revision || !dialog.open) return;
      query = q; report = data; offset = nextOffset;
      $('historyTotals').textContent = `${data.total_visits} visitas · ${data.unique_customers} clientes distintos`;
      $('historyRows').innerHTML = data.rows.map(r => `<tr><td>${escapeHtml(r.customer_name)}</td><td>${escapeHtml(new Date(r.created_at).toLocaleString('es-MX'))}</td><td>${escapeHtml(r.registered_by_name)}${r.registered_by ? '<br><small>'+escapeHtml(r.registered_by)+'</small>' : ''}</td></tr>`).join('');
      $('historyMessage').textContent = data.total_visits ? `Mostrando ${offset+1}–${offset+data.rows.length} de ${data.total_visits}.` : 'No hay visitas en este período.';
    } catch (error) {
      if (ticket !== revision) return;
      report = null; $('historyRows').innerHTML = ''; $('historyTotals').textContent = '';
      $('historyMessage').textContent = error.message || 'No se pudo cargar el historial.';
    } finally { if (ticket === revision) controls(false); }
  }
  function close() { ++revision; selected=null; report=null; query=null; busy=false; dialog.close(); $('historyRows').innerHTML=''; }
  async function open(id, name) {
    if (!id) return;
    close(); selected={id,name};
    $('historyTitle').textContent = 'Historial · ' + name;
    $('historyZone').textContent = `Zona horaria del dispositivo: ${timezone}. Semana de lunes a domingo. Fechas inicial y final incluidas.`;
    $('historyTotals').textContent = ''; $('historyPeriod').value='today'; preset();
    dialog.showModal(); await refresh();
  }
  $('historyFilters').onsubmit = event => { event.preventDefault(); refresh(); };
  function invalidate() { report=null; $('historyRows').innerHTML=''; $('historyTotals').textContent=''; $('historyMessage').textContent='Pulsa Consultar para aplicar las fechas.'; controls(false); }
  $('historyPeriod').onchange = () => {preset();invalidate();};
  for (const id of ['historyStart','historyEnd']) $(id).onchange = () => { $('historyPeriod').value='custom'; invalidate(); };
  $('historyPrevious').onclick = () => refresh(Math.max(0,offset-200),false);
  $('historyNext').onclick = () => refresh(offset+200,false);
  $('closeVisitHistory').onclick = close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('openVisitHistory').onclick = () => open(businessId,$('biz').textContent);
  $('businessVisitHistory').onclick = () => {
    if (currentIsSuperAdmin && selectedBusinessManage) open(selectedBusinessManage.businessId,selectedBusinessManage.businessName);
  };
  $('historyExport').onclick = async () => {
    if (busy || !report || !query) return;
    const ticket=revision, q={...query}, name=selected.name, asOf=report.as_of;
    controls(true); $('historyMessage').textContent='Preparando todas las visitas del período…';
    try {
      const first = await fetchPage(q,0,asOf);
      const rows = await VisitHistoryData.exportRows((n,stamp)=>fetchPage(q,n,stamp),first,()=>ticket===revision && dialog.open);
      if (ticket!==revision) return;
      const blob = new Blob([VisitHistoryData.csv(rows,name,timezone)],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob), link=document.createElement('a');
      link.href=url; link.download=`visitas-${q.target_business_id}-${q.period_start.slice(0,10)}.csv`;
      link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('historyMessage').textContent=`CSV descargado: ${rows.length} visitas.`;
    } catch (error) { if(ticket===revision) $('historyMessage').textContent=error.message; }
    finally { if(ticket===revision) controls(false); }
  };
  sync();
  return {open,close,sync};
})();
