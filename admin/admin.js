/* ============================================================
   ESPACIO ADMIN — auth · questionnaire builder · submissions
   ============================================================ */
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const AKEY = CONFIG.SUPABASE_KEY, AURL = CONFIG.SUPABASE_URL;
const QASSETS = "../questionnaire/assets";

/* ---------- auth ---------- */
const TOK_KEY = "esp_admin_session";
let session = null;
try { session = JSON.parse(sessionStorage.getItem(TOK_KEY)); } catch(e) {}

async function login(email, password) {
  const r = await fetch(`${AURL}/auth/v1/token?grant_type=password`, {
    method:"POST", headers:{ apikey:AKEY, "Content-Type":"application/json" },
    body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.msg || "Login failed");
  session = { token: j.access_token, email: j.user.email, exp: Date.now() + (j.expires_in-60)*1000 };
  sessionStorage.setItem(TOK_KEY, JSON.stringify(session));
}
function logout() { session = null; sessionStorage.removeItem(TOK_KEY); boot(); }

async function api(path, opt = {}) {
  if (!session || Date.now() > session.exp) { logout(); throw new Error("Session expired"); }
  const r = await fetch(AURL + path, Object.assign({}, opt, {
    headers: Object.assign({ apikey:AKEY, Authorization:"Bearer "+session.token,
      "Content-Type":"application/json" }, opt.headers||{}) }));
  if (r.status === 401) { logout(); throw new Error("Session expired"); }
  return r;
}

/* ---------- state ---------- */
let DOC = null, CLEAN = "", VIEW = "questions", SUBS = null, OPEN_ED = null;

const dirty = () => DOC && JSON.stringify(DOC) !== CLEAN;
const CORE_DRIVERS = ["l_bedrooms","l_bathCount","l_bathTypes"];
const SPECIAL_TYPES = ["styles","palette","swatch","tone"];
const TYPE_LABELS = { text:"Text", tel:"Phone", email:"E-mail", textarea:"Long text", num:"Number",
  yn:"Yes / No", radio:"Single choice", check:"Multi choice", imgradio:"Image choice",
  imgcheck:"Image multi", styles:"Style boards ★", palette:"Palettes ★", swatch:"Swatches ★", tone:"Tone ★" };

/* i18n helpers: labels live in DOC.i18n under keys */
const langName = { ge:"ქართული", en:"English", ru:"Русский" };
function tr(key, lang="en") {
  if (!key) return "";
  const v = DOC?.i18n?.[lang]?.[key] ?? DOC?.i18n?.ge?.[key];
  return v ?? key;
}
function setTr(key, lang, val) { if (!DOC.i18n[lang]) DOC.i18n[lang] = {}; DOC.i18n[lang][key] = val; }

/* ---------- data ---------- */
async function loadDoc() {
  const r = await api(`/rest/v1/form_schema?published=eq.true&order=id.desc&limit=1&select=doc`);
  const rows = await r.json();
  DOC = rows.length ? rows[0].doc : null;
  CLEAN = JSON.stringify(DOC);
}
async function publishDoc() {
  DOC.updated = new Date().toISOString();
  const r = await api(`/rest/v1/form_schema`, { method:"POST", headers:{ Prefer:"return=minimal" },
    body: JSON.stringify({ doc: DOC }) });
  if (r.status !== 201) throw new Error("Publish failed ("+r.status+")");
  CLEAN = JSON.stringify(DOC);
}
async function loadSubs() {
  const r = await api(`/rest/v1/submissions?order=created_at.desc&select=*`);
  SUBS = await r.json();
}

/* ---------- scopes: sections + templates behave alike ---------- */
function scopes() {
  const list = DOC.sections.map(s => ({ kind:"section", key:s.id, obj:s,
    title: tr(s.title,"en"), badge:null }));
  if (DOC.templates?.bedroom) list.push({ kind:"template", key:"bedroom", obj:DOC.templates.bedroom,
    title:"Bedroom", badge:"repeats per bedroom" });
  if (DOC.templates?.bathroom) list.push({ kind:"template", key:"bathroom", obj:DOC.templates.bathroom,
    title:"Bathroom", badge:"repeats per bathroom" });
  return list;
}
const qList = scope => scope.obj.questions;

function isCore(scope, q) {
  return (scope.kind==="section" && CORE_DRIVERS.includes(q.id)) || SPECIAL_TYPES.includes(q.type);
}

function toast(msg, bad) {
  let t = document.querySelector("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = bad ? "bad show" : "show";
  clearTimeout(t._h); t._h = setTimeout(() => t.className = t.className.replace("show",""), 3200);
}

/* ---------- render: login ---------- */
function renderLogin() {
  $("#tabs").classList.add("hidden"); $("#userbox").classList.add("hidden"); $("#savebar").classList.add("hidden");
  $("#main").innerHTML = `<div class="login-wrap"><form class="login" id="loginForm">
    <div class="brand">ESPACIO<span class="s">Studio</span></div>
    <h1>Admin panel</h1><p>Sign in with your admin account.</p>
    <label>E-mail</label><input type="email" id="liEmail" autocomplete="username" required>
    <label>Password</label><input type="password" id="liPw" autocomplete="current-password" required>
    <div class="err" id="liErr"></div>
    <button class="btn full" type="submit">Sign in</button></form></div>`;
  $("#loginForm").onsubmit = async e => {
    e.preventDefault(); $("#liErr").textContent = "";
    try { await login($("#liEmail").value.trim(), $("#liPw").value); boot(); }
    catch(err) { $("#liErr").textContent = err.message; }
  };
}

/* ---------- render: questions builder ---------- */
function depSummary(dep) {
  if (!dep) return "";
  const target = tr(findLabelKey(dep.q) || dep.q, "en");
  const op = dep.op === "eq" ? "=" : dep.op === "in" ? "∈" : dep.op === "gt" ? ">" : dep.op;
  return `${target} ${op} ${Array.isArray(dep.v) ? dep.v.join(",") : dep.v}`;
}
function findLabelKey(qid) {
  for (const sc of scopes()) { const q = qList(sc).find(q => q.id === qid || ("w_"+q.id) === qid || ("b_"+q.id) === qid); if (q) return q.label; }
  return null;
}

function renderQuestions() {
  const secs = scopes().map(sc => {
    const rows = qList(sc).map((q, qi) => qRow(sc, q, qi)).join("");
    const onCls = sc.obj.visible !== false ? "on" : "";
    return `<div class="sec" data-scope="${sc.key}">
      <div class="sec-head">
        <button class="sw ${onCls}" data-act="sec-vis" data-scope="${sc.key}" title="Show / hide section"></button>
        <h2>${esc(sc.title)}</h2>
        ${sc.badge ? `<span class="badge">${sc.badge}</span>` : ""}
        <span class="cnt">${qList(sc).length} questions</span>
        <button class="btn ghost sm" data-act="add" data-scope="${sc.key}">+ Add question</button>
      </div>
      <div class="editor hidden" data-addbox="${sc.key}"></div>
      ${rows}
    </div>`;
  }).join("");
  $("#main").innerHTML = `<div class="wrap">
    <div class="toolrow"><h1>Questionnaire</h1>
      <span class="hint">Changes go live only after you press “Publish changes”.</span></div>
    ${secs}</div>`;
  if (OPEN_ED) reopenEditor();
}

function qRow(sc, q, qi) {
  const lock = isCore(sc, q);
  const off = q.visible === false;
  const dep = q.dep ? `<span class="chip dep" title="Shown only when: ${esc(depSummary(q.dep))}">if</span>` : "";
  return `<div class="q-row ${off?"off":""}" data-scope="${sc.key}" data-qi="${qi}">
    <span class="q-move">
      <button data-act="up" title="Move up">▲</button>
      <button data-act="down" title="Move down">▼</button></span>
    <span class="q-label">${esc(tr(q.label,"en"))} <span style="color:var(--muted);font-size:11px">· ${esc(tr(q.label,"ge"))}</span></span>
    ${dep}
    <span class="chip">${TYPE_LABELS[q.type]||q.type}</span>
    <button class="sw ${off?"":"on"}" data-act="vis" title="Show / hide" ${lock&&CORE_DRIVERS.includes(q.id)?'disabled style="opacity:.3"':""}></button>
    <button class="iconb" data-act="edit" title="Edit">✎</button>
    <button class="iconb ${lock?"lock":""}" data-act="del" title="${lock?"Built-in — hide it instead":"Delete"}" ${lock?"disabled":""}>🗑</button>
  </div>`;
}
/* ADMIN_PART2 */

/* ---------- editor ---------- */
function editorHtml(sc, q) {
  const kinds = ["text","textarea","num","yn","radio","check"];
  const special = SPECIAL_TYPES.includes(q.type) || ["imgradio","imgcheck","tel","email"].includes(q.type);
  const labelInputs = ["ge","en","ru"].map(l => `
    <div><label>Question · ${langName[l]}</label>
    <input data-ed="label" data-lang="${l}" value="${esc(tr(q.label,l))}"></div>`).join("");
  const opts = (q.options||[]).map((o,oi) => `
    <div class="opt-row" data-oi="${oi}">
      <input value="${esc(o.v)}" disabled title="value">
      ${["ge","en","ru"].map(l=>`<input data-ed="optlabel" data-oi="${oi}" data-lang="${l}" placeholder="${langName[l]}" value="${esc(tr(o.label,l))}">`).join("")}
      <input data-ed="optimg" data-oi="${oi}" placeholder="image file (optional)" value="${esc(o.img||"")}">
      <button class="del" data-act="delopt" data-oi="${oi}" title="Remove option">✕</button>
    </div>`).join("");
  const choice = ["radio","check","imgradio","imgcheck","swatch"].includes(q.type);
  const depTargets = qList(sc).filter(x => x.id !== q.id && x.options)
    .map(x => `<option value="${esc(x.id)}" ${q.dep&&(q.dep.q===x.id||q.dep.q===("w_"+x.id)||q.dep.q===("b_"+x.id))?"selected":""}>${esc(tr(x.label,"en"))}</option>`).join("");
  return `<div class="editor" data-edscope="${sc.key}" data-edq="${esc(q.id)}">
    <div class="grid3">${labelInputs}</div>
    <div class="grid3">
      <div><label>Type</label>
        ${special ? `<input value="${TYPE_LABELS[q.type]||q.type}" disabled>` :
        `<select data-ed="type">${kinds.map(k=>`<option value="${k}" ${q.type===k?"selected":""}>${TYPE_LABELS[k]}</option>`).join("")}</select>`}</div>
      <div><label>Required</label><select data-ed="req"><option value="1" ${q.req!==false?"selected":""}>Yes</option><option value="0" ${q.req===false?"selected":""}>No</option></select></div>
      <div><label>Shown</label><select data-ed="vis"><option value="1" ${q.visible!==false?"selected":""}>Yes</option><option value="0" ${q.visible===false?"selected":""}>Hidden</option></select></div>
    </div>
    ${choice ? `<label>Options</label>${opts}<button class="btn ghost sm" data-act="addopt">+ Add option</button>` : ""}
    <label>Show this question only if…</label>
    <div class="dep-grid">
      <select data-ed="depq"><option value="">— always shown —</option>${depTargets}</select>
      <select data-ed="depop"><option value="eq" ${!q.dep||q.dep.op==="eq"?"selected":""}>equals</option><option value="in" ${q.dep&&q.dep.op==="in"?"selected":""}>is one of</option></select>
      <input data-ed="depv" placeholder="value (comma-separate for several)" value="${esc(q.dep?(Array.isArray(q.dep.v)?q.dep.v.join(","):q.dep.v):"")}">
    </div>
    <div class="hint">Use option <b>values</b> (e.g. yes, no, hung, both) — hover the “if” chip on a row to check a rule.</div>
    <div class="row-actions"><button class="btn sm" data-act="closeed">Done</button></div>
  </div>`;
}
function reopenEditor(scroll) {
  const { scope, qid } = OPEN_ED;
  const sc = scopes().find(s => s.key === scope); if (!sc) return;
  const q = qList(sc).find(x => x.id === qid); if (!q) return;
  const row = document.querySelector(`.q-row[data-scope="${scope}"][data-qi="${qList(sc).indexOf(q)}"]`);
  if (row) { row.insertAdjacentHTML("afterend", editorHtml(sc, q));
    if (scroll) row.nextElementSibling.scrollIntoView({ behavior:"smooth", block:"center" }); }
}

/* ---------- add question ---------- */
function addBoxHtml(sc) {
  return `<label>New question — internal id will be created automatically</label>
    <div class="grid3">
      <div><label>Type</label><select data-add="type">
        <option value="text">Text</option><option value="textarea">Long text</option>
        <option value="num">Number</option><option value="yn">Yes / No</option>
        <option value="radio">Single choice</option><option value="check">Multi choice</option></select></div>
      <div><label>Question · English</label><input data-add="en" placeholder="e.g. What is your budget?"></div>
      <div><label>Question · ქართული</label><input data-add="ge" placeholder="e.g. რა ბიუჯეტი გაქვთ?"></div>
    </div>
    <div class="row-actions">
      <button class="btn sm" data-act="addconfirm" data-scope="${sc.key}">Add</button>
      <button class="btn ghost sm" data-act="addcancel" data-scope="${sc.key}">Cancel</button>
      <span class="hint">Russian + options can be edited right after adding.</span>
    </div>`;
}
function addQuestion(sc, type, en, ge) {
  const id = "custom_" + Date.now().toString(36);
  const labelKey = "q_" + id;
  setTr(labelKey,"en",en||"New question"); setTr(labelKey,"ge",ge||en||"ახალი კითხვა"); setTr(labelKey,"ru",en||"Новый вопрос");
  const q = { id, type, label: labelKey, req:true, visible:true };
  if (["radio","check"].includes(type)) {
    q.options = [1,2].map(n => { const k=`o_${id}_${n}`; setTr(k,"en","Option "+n); setTr(k,"ge","ვარიანტი "+n); setTr(k,"ru","Вариант "+n);
      return { v:"opt"+n, label:k }; });
  }
  if (type === "num") { q.min = 0; q.maxN = 10; }
  qList(sc).push(q);
  OPEN_ED = { scope: sc.key, qid: id };
}

/* ---------- render: submissions ---------- */
function fmtAnswer(q, data, prefix="") {
  const v = data[prefix + q.id];
  if (v === undefined || v === null || v === "" || (Array.isArray(v)&&!v.length)) return null;
  const one = x => {
    if (q.type === "styles") return tr("st_"+x,"en");
    if (q.type === "palette") return tr("pal_"+x,"en");
    if (x === "yes") return "Yes"; if (x === "no") return "No";
    if (x === "other") return "Other" + (data[prefix+q.id+"_other"] ? ` (${data[prefix+q.id+"_other"]})` : "");
    const o = (q.options||[]).find(o => o.v === x);
    return o ? tr(o.label,"en") : x;
  };
  return Array.isArray(v) ? v.map(one).join(", ") : one(v);
}
function renderSubs() {
  if (!SUBS) { $("#main").innerHTML = `<div class="wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; return; }
  const rows = SUBS.map(s => {
    const styles = (s.data?.s_style||[]).map(v=>tr("st_"+v,"en")).join(" + ") || "—";
    const d = new Date(s.created_at);
    return `<tr>
      <td>${d.toLocaleDateString("en-GB")} <div class="mini">${d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div></td>
      <td><b>${esc(s.client_name||"—")}</b><div class="mini">${esc(s.client_phone||"")}</div></td>
      <td>${esc(s.client_email||"—")}</td>
      <td>${esc(styles)}</td>
      <td>${(s.lang||"").toUpperCase()}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="pillbtn" data-act="view" data-id="${s.id}">Open</button>
        <button class="iconb" data-act="delsub" data-id="${s.id}" title="Delete">🗑</button></td></tr>`;
  }).join("");
  $("#main").innerHTML = `<div class="wrap">
    <div class="toolrow"><h1>Submissions <span style="color:var(--muted);font-size:15px">· ${SUBS.length}</span></h1>
      <button class="btn ghost" id="btnCsv">⬇ Export CSV</button></div>
    ${SUBS.length ? `<table><thead><tr><th>Date</th><th>Client</th><th>E-mail</th><th>Styles</th><th>Lang</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">No submissions yet.</div>`}</div>`;
  const csvBtn = $("#btnCsv"); if (csvBtn) csvBtn.onclick = exportCsv;
}

function detailHtml(s) {
  const d = s.data || {};
  const styleCells = (d.s_style||[]).slice(0,2).map(v =>
    `<div class="cell wide"><img src="../questionnaire/assets/styles/${v==="contemporary"?"contemporary_1":v==="midcentury"?"midcentury_1":v+"_1"}.jpg"><div class="tag">${esc(tr("st_"+v,"en"))}</div></div>`).join("");
  const PAL = { 1:["#FFFFFF","#0d0e10","#fd2e21","#fec81e","#1a79fe"],2:["#f3e6d5","#ac6c3d","#6a714f","#c6873a","#8e4939"],3:["#f6f1e7","#101010","#1b3f35","#b88536","#7c583e"],4:["#eadaca","#ca9e6f","#936443","#b55c3c","#61554a"],5:["#dbcfc1","#b7ab9b","#907b6a","#4e4a45"],6:["#ddccbc","#c3b7a7","#8e725d","#bea06e"],7:["#e8e0d5","#d1cfc2","#b8a78f","#a7ad9f"],8:["#e6c7c4","#d0d6c8","#d8e0e2","#bdb0a0"] };
  const palCells = (d.s_palette||[]).map(p =>
    `<div class="cell"><div class="chips">${(PAL[p]||[]).map(c=>`<i style="background:${c}"></i>`).join("")}</div><div class="tag">${esc(tr("pal_"+p,"en"))}</div></div>`).join("");
  const mat = [];
  if (d.s_floorcol) mat.push([`floorcol_${d.s_floorcol}`,"Floor"]);
  if (d.s_wall) mat.push([`wall_${d.s_wall}`,"Walls"]);
  if (d.s_curtains && d.s_curtains!=="other") mat.push([`curt_${d.s_curtains}`,"Curtains"]);
  if (d.s_metal) mat.push([[{black:"fin_mblack",gold:"fin_bgold",silver:"fin_nickel",rose:"fin_brose"}[d.s_metal]],"Metal"]);
  const matCells = mat.map(([f,t])=>`<div class="cell"><img src="${QASSETS}/opts/${f}.jpg"><div class="tag">${t}</div></div>`).join("");

  let answers = "";
  for (const sc of scopes()) {
    if (sc.kind === "section") {
      const rows = qList(sc).map(q => { const val = fmtAnswer(q, d); return val===null?"":`<div class="ans-row"><div class="k">${esc(tr(q.label,"en"))}</div><div class="v">${esc(val)}</div></div>`; }).join("");
      if (rows) answers += `<div class="ans-sec">${esc(sc.title)}</div>${rows}`;
    } else {
      for (let i = 1; i <= 8; i++) {
        const prefix = (sc.key==="bedroom"?"b":"w") + i + "_";
        if (!Object.keys(d).some(k => k.startsWith(prefix))) continue;
        const rows = qList(sc).map(q => { const val = fmtAnswer(q, d, prefix); return val===null?"":`<div class="ans-row"><div class="k">${esc(tr(q.label,"en"))}</div><div class="v">${esc(val)}</div></div>`; }).join("");
        if (rows) answers += `<div class="ans-sec">${sc.title} ${i}</div>${rows}`;
      }
    }
  }
  return `<div class="overlay" id="ovl"><div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:14px">
      <div><h2>${esc(s.client_name||"—")}</h2>
      <div class="meta">${new Date(s.created_at).toLocaleString("en-GB")} · ${esc(s.client_email||"")} · ${esc(s.client_phone||"")}</div></div>
      <button class="btn ghost sm" data-act="closeovl">✕ Close</button></div>
    <div class="mb-mini">${styleCells}${palCells}${matCells}</div>
    ${answers}
  </div></div>`;
}

/* ---------- CSV ---------- */
function exportCsv() {
  const cols = [["created_at","Date"],["client_name","Name"],["client_phone","Phone"],["client_email","E-mail"],["lang","Lang"]];
  const qcols = [];
  for (const sc of scopes()) {
    if (sc.kind === "section") qList(sc).forEach(q => qcols.push({ id:q.id, label:tr(q.label,"en"), q }));
    else for (let i=1;i<=8;i++) qList(sc).forEach(q => qcols.push({ id:(sc.key==="bedroom"?"b":"w")+i+"_"+q.id, label:`${sc.title} ${i}: ${tr(q.label,"en")}`, q, prefix:(sc.key==="bedroom"?"b":"w")+i+"_" }));
  }
  const usedQ = qcols.filter(c => SUBS.some(s => s.data && s.data[c.id] !== undefined));
  const head = cols.map(c=>c[1]).concat(usedQ.map(c=>c.label));
  const csvEsc = v => `"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [head.map(csvEsc).join(",")];
  for (const s of SUBS) {
    const row = cols.map(c => c[0]==="created_at" ? new Date(s.created_at).toISOString() : (s[c[0]]??""));
    for (const c of usedQ) { const val = fmtAnswer(Object.assign({},c.q,{id:c.q.id}), s.data||{}, c.prefix||""); row.push(val??""); }
    lines.push(row.map(csvEsc).join(","));
  }
  const blob = new Blob(["﻿"+lines.join("\r\n")], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `espacio-submissions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act;
  const row = e.target.closest(".q-row");
  const scKey = el.dataset.scope || (row && row.dataset.scope) || (e.target.closest("[data-edscope]")||{}).dataset?.edscope;
  const sc = scKey ? scopes().find(s => s.key === scKey) : null;
  const qi = row ? +row.dataset.qi : -1;
  const q = sc && qi >= 0 ? qList(sc)[qi] : null;

  if (act === "sec-vis" && sc) { sc.obj.visible = sc.obj.visible === false ? true : false; renderQuestions(); }
  else if (act === "vis" && q) { q.visible = q.visible === false ? true : false; renderQuestions(); }
  else if (act === "up" && q && qi > 0) { const l = qList(sc); [l[qi-1],l[qi]] = [l[qi],l[qi-1]]; renderQuestions(); }
  else if (act === "down" && q && qi < qList(sc).length-1) { const l = qList(sc); [l[qi+1],l[qi]] = [l[qi],l[qi+1]]; renderQuestions(); }
  else if (act === "del" && q && !isCore(sc, q)) { if (confirm(`Delete “${tr(q.label,"en")}”? Existing answers keep their data.`)) { qList(sc).splice(qi,1); OPEN_ED=null; renderQuestions(); } }
  else if (act === "edit" && q) { OPEN_ED = (OPEN_ED && OPEN_ED.qid === q.id) ? null : { scope: scKey, qid: q.id }; renderQuestions(); }
  else if (act === "closeed") { OPEN_ED = null; renderQuestions(); }
  else if (act === "add" && sc) {
    const box = document.querySelector(`[data-addbox="${scKey}"]`);
    box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) {
      box.innerHTML = addBoxHtml(sc);
      box.scrollIntoView({ behavior:"smooth", block:"center" });
      setTimeout(() => box.querySelector('[data-add="en"]')?.focus(), 250);
    }
  }
  else if (act === "addcancel") { document.querySelector(`[data-addbox="${scKey}"]`).classList.add("hidden"); }
  else if (act === "addconfirm" && sc) {
    const box = document.querySelector(`[data-addbox="${scKey}"]`);
    addQuestion(sc, box.querySelector('[data-add="type"]').value, box.querySelector('[data-add="en"]').value.trim(), box.querySelector('[data-add="ge"]').value.trim());
    renderQuestions(); reopenEditor(true); OPEN_ED && toast("Question added — fill in the texts, then press “Publish changes”");
  }
  else if (act === "addopt" || act === "delopt") {
    const ed = e.target.closest("[data-edq]"); if (!ed) return;
    const esc2 = scopes().find(s => s.key === ed.dataset.edscope);
    const eq = qList(esc2).find(x => x.id === ed.dataset.edq);
    if (act === "addopt") { const n = (eq.options?.length||0)+1; const k = `o_${eq.id}_x${Date.now().toString(36)}`;
      setTr(k,"en","Option "+n); setTr(k,"ge","ვარიანტი "+n); setTr(k,"ru","Вариант "+n);
      (eq.options = eq.options||[]).push({ v:"opt"+Date.now().toString(36).slice(-4), label:k }); }
    else eq.options.splice(+el.dataset.oi,1);
    renderQuestions();
  }
  else if (act === "view") { const s = SUBS.find(x => x.id === el.dataset.id); if (s) document.body.insertAdjacentHTML("beforeend", detailHtml(s)); }
  else if (act === "closeovl") { $("#ovl").remove(); }
  else if (act === "delsub") { if (confirm("Delete this submission permanently?")) {
    const r = await api(`/rest/v1/submissions?id=eq.${el.dataset.id}`, { method:"DELETE" });
    if (r.ok) { SUBS = SUBS.filter(x => x.id !== el.dataset.id); renderSubs(); } } }
  updateSavebar();
});

document.addEventListener("input", e => {
  const ed = e.target.closest("[data-ed]"); if (!ed) return;
  const box = e.target.closest("[data-edq]"); if (!box) return;
  const sc = scopes().find(s => s.key === box.dataset.edscope);
  const q = qList(sc).find(x => x.id === box.dataset.edq);
  const kind = ed.dataset.ed;
  if (kind === "label") setTr(q.label, ed.dataset.lang, ed.value);
  else if (kind === "optlabel") setTr(q.options[+ed.dataset.oi].label, ed.dataset.lang, ed.value);
  else if (kind === "optimg") { const v = ed.value.trim(); if (v) q.options[+ed.dataset.oi].img = v; else delete q.options[+ed.dataset.oi].img; }
  else if (kind === "type") q.type = ed.value;
  else if (kind === "req") q.req = ed.value === "1";
  else if (kind === "vis") q.visible = ed.value === "1";
  else if (["depq","depop","depv"].includes(kind)) {
    const dq = box.querySelector('[data-ed="depq"]').value;
    if (!dq) delete q.dep;
    else { const op = box.querySelector('[data-ed="depop"]').value;
      let v = box.querySelector('[data-ed="depv"]').value.trim();
      q.dep = { q:dq, op, v: op === "in" ? v.split(",").map(x=>x.trim()).filter(Boolean) : v }; }
  }
  updateSavebar();
});

/* ---------- savebar & tabs ---------- */
function updateSavebar() {
  if (VIEW !== "questions" || !session) { $("#savebar").classList.add("hidden"); return; }
  $("#savebar").classList.remove("hidden");
  const st = $("#saveState");
  if (dirty()) { st.textContent = "● Unpublished changes"; st.className = "state dirty"; }
  else { st.textContent = "Everything published"; st.className = "state saved"; }
}
$("#btnSave").onclick = async () => {
  if (!dirty()) return;
  $("#saveState").innerHTML = `<span class="spin"></span> Publishing…`;
  try { await publishDoc(); updateSavebar(); }
  catch(e) { $("#saveState").textContent = "✗ " + e.message; $("#saveState").className = "state dirty"; }
};
$("#btnDiscard").onclick = () => { if (!dirty() || confirm("Discard all unpublished changes?")) { DOC = JSON.parse(CLEAN); OPEN_ED = null; renderQuestions(); updateSavebar(); } };
$("#btnLogout").onclick = logout;
document.querySelectorAll("#tabs button").forEach(b => b.onclick = async () => {
  VIEW = b.dataset.view;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  if (VIEW === "submissions") { renderSubs(); if (!SUBS) { await loadSubs(); renderSubs(); } }
  else if (VIEW === "projects") { renderProjects(); if (!PROJ) { await loadProjects(); renderProjects(); } }
  else renderQuestions();
  updateSavebar();
});

/* ---------- boot ---------- */
async function boot() {
  if (!session || Date.now() > (session.exp||0)) { renderLogin(); return; }
  $("#tabs").classList.remove("hidden"); $("#userbox").classList.remove("hidden");
  $("#userEmail").textContent = session.email;
  $("#main").innerHTML = `<div class="wrap"><div class="empty"><span class="spin"></span> Loading questionnaire…</div></div>`;
  try { await loadDoc(); } catch(e) { renderLogin(); return; }
  VIEW = "questions"; renderQuestions(); updateSavebar();
}
boot();

/* ============================================================
   PROJECTS CMS
   ============================================================ */
let PROJ = null, PED = null; // PED = open editor slug
const CATS = [["residential","Residential"],["hospitality","Hospitality"],["retail","Retail"],["workspace","Workspace"]];
const relImg = u => /^https?:/.test(u) ? u : "../" + u;
const pubUrl = path => `${AURL}/storage/v1/object/public/project-photos/${path}`;

async function loadProjects() {
  const r = await api(`/rest/v1/projects?order=sort.asc&select=*`);
  PROJ = await r.json();
}
async function saveProject(p, isNew) {
  const body = JSON.stringify({ slug:p.slug, name:p.name, loc:p.loc, status:p.status, cat:p.cat,
    description:p.description, cover:p.cover, gallery:p.gallery, sort:p.sort, visible:p.visible });
  const r = isNew
    ? await api(`/rest/v1/projects`, { method:"POST", headers:{ Prefer:"return=representation" }, body })
    : await api(`/rest/v1/projects?id=eq.${p.id}`, { method:"PATCH", headers:{ Prefer:"return=representation" }, body });
  if (!r.ok) throw new Error("Save failed (" + r.status + ")");
  const rows = await r.json(); return rows[0];
}

function renderProjects() {
  if (!PROJ) { $("#main").innerHTML = `<div class="wrap"><div class="empty"><span class="spin"></span> Loading projects…</div></div>`; return; }
  $("#savebar").classList.add("hidden");
  const rows = PROJ.map((p, i) => {
    const open = PED === p.slug;
    return `<div class="sec" data-slug="${esc(p.slug)}">
      <div class="sec-head">
        <button class="sw ${p.visible?"on":""}" data-pact="pvis" data-slug="${esc(p.slug)}" title="Show / hide on site"></button>
        <span class="q-move">
          <button data-pact="pup" data-slug="${esc(p.slug)}" title="Move up">▲</button>
          <button data-pact="pdown" data-slug="${esc(p.slug)}" title="Move down">▼</button></span>
        <img src="${relImg(p.cover)}" style="width:52px;height:38px;object-fit:cover;border-radius:2px">
        <h2 style="flex:1">${esc(p.name)} <span style="color:var(--muted);font-size:11px;text-transform:none;letter-spacing:0"> · ${esc(p.loc||"")} · ${p.gallery.length} photos</span></h2>
        <span class="badge">${esc(p.cat)}</span>
        <button class="btn ghost sm" data-pact="pedit" data-slug="${esc(p.slug)}">${open?"Close":"Edit"}</button>
        <button class="iconb" data-pact="pdel" data-slug="${esc(p.slug)}" title="Delete project">🗑</button>
      </div>
      ${open ? projEditor(p) : ""}</div>`;
  }).join("");
  $("#main").innerHTML = `<div class="wrap">
    <div class="toolrow"><h1>Projects <span style="color:var(--muted);font-size:15px">· ${PROJ.length}</span></h1>
      <button class="btn" data-pact="pnew">+ New project</button></div>
    <div class="hint" style="margin-bottom:10px">Every change here saves to the live site the moment you press “Save project”. Photo uploads are stored in Supabase.</div>
    ${rows}</div>`;
}

function projEditor(p) {
  const gal = p.gallery.map((g, k) => `
    <div style="position:relative;break-inside:avoid;margin-bottom:10px">
      <img src="${relImg(g)}" style="width:100%;border-radius:2px;${p.cover===g?"outline:3px solid var(--indigo);outline-offset:-3px":""}">
      <div style="display:flex;gap:4px;position:absolute;top:6px;right:6px">
        <button class="iconb" style="background:#fff" data-pact="gleft"  data-slug="${esc(p.slug)}" data-k="${k}" title="Move earlier">←</button>
        <button class="iconb" style="background:#fff" data-pact="gright" data-slug="${esc(p.slug)}" data-k="${k}" title="Move later">→</button>
        <button class="iconb" style="background:#fff" data-pact="gcover" data-slug="${esc(p.slug)}" data-k="${k}" title="Set as cover">★</button>
        <button class="iconb" style="background:#fff;color:var(--bad)" data-pact="gdel" data-slug="${esc(p.slug)}" data-k="${k}" title="Remove">✕</button>
      </div>${p.cover===g?'<span class="badge" style="position:absolute;left:6px;top:6px;background:var(--indigo);color:#fff">cover</span>':""}
    </div>`).join("");
  return `<div class="editor" data-pslug="${esc(p.slug)}">
    <div class="grid3">
      <div><label>Name</label><input data-pf="name" value="${esc(p.name)}"></div>
      <div><label>Location</label><input data-pf="loc" value="${esc(p.loc||"")}"></div>
      <div><label>Status tag (optional)</label><input data-pf="status" value="${esc(p.status||"")}" placeholder="Ongoing / Completed / Concept…"></div>
    </div>
    <div class="grid3">
      <div><label>Category</label><select data-pf="cat">${CATS.map(c=>`<option value="${c[0]}" ${p.cat===c[0]?"selected":""}>${c[1]}</option>`).join("")}</select></div>
      <div><label>Slug (URL)</label><input data-pf="slug" value="${esc(p.slug)}" ${p.id?"disabled":""}></div>
      <div><label>Visible</label><select data-pf="visible"><option value="1" ${p.visible?"selected":""}>Yes</option><option value="0" ${!p.visible?"selected":""}>Hidden</option></select></div>
    </div>
    <label>Description (shown on the project page)</label>
    <textarea data-pf="description" style="width:100%;min-height:90px;border:1px solid var(--line);border-radius:2px;padding:10px;font-family:var(--hank);font-size:13.5px">${esc(p.description||"")}</textarea>
    <label>Photos — ★ sets the cover, arrows reorder</label>
    <div style="column-count:4;column-gap:10px">${gal}</div>
    <label class="dropzone" data-drop="${esc(p.slug)}">
      <input type="file" accept="image/*" multiple data-pact="gupload" data-slug="${esc(p.slug)}" style="display:none">
      <b>⬆ Add photos</b>
      <span>Click here or drag & drop images — they upload, save and appear in the gallery automatically</span>
      <span class="hint" id="pstate-${esc(p.slug)}"></span>
    </label>
    <div class="row-actions">
      <button class="btn sm" data-pact="psave" data-slug="${esc(p.slug)}">Save text changes</button>
      <span class="hint">Photos save themselves; this button saves the text fields above.</span>
    </div>
  </div>`;
}

const findProj = slug => PROJ.find(x => x.slug === slug);

async function uploadPhotos(p, files) {
  const imgs = files.filter(f => /^image\//.test(f.type));
  if (!imgs.length) { toast("Those files are not images", true); return; }
  const st = $("#pstate-" + p.slug);
  let ok = 0;
  for (let i = 0; i < imgs.length; i++) {
    if (st) st.innerHTML = `<span class="spin"></span> Uploading photo ${i+1} of ${imgs.length}…`;
    const small = await shrinkImage(imgs[i], 1600, .84);
    const path = `${p.slug}/${Date.now().toString(36)}_${imgs[i].name.replace(/[^a-z0-9.]+/gi,"-").toLowerCase()}`;
    const r = await api(`/storage/v1/object/project-photos/${path}`, { method:"POST",
      headers:{ "Content-Type":"image/jpeg", "x-upsert":"true" }, body: small });
    if (r.ok) { p.gallery.push(pubUrl(path)); ok++; }
  }
  if (!p.cover && p.gallery.length) p.cover = p.gallery[0];
  if (ok && p.id) { try { const saved = await saveProject(p, false); Object.assign(p, saved); } catch(e) {} }
  toast(ok === imgs.length ? `✓ ${ok} photo${ok>1?"s":""} added and saved` : `Only ${ok} of ${imgs.length} uploaded`, ok !== imgs.length);
}
function shrinkImage(file, max, q) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      let { width:w, height:h } = img;
      if (w > max) { h = h*max/w; w = max; } if (h > max) { w = w*max/h; h = max; }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob(res, "image/jpeg", q);
    };
    img.src = URL.createObjectURL(file);
  });
}

document.addEventListener("change", async e => {
  const up = e.target.closest('[data-pact="gupload"]'); if (!up) return;
  const p = findProj(up.dataset.slug);
  await uploadPhotos(p, [...e.target.files]);
  renderProjects();
});
document.addEventListener("dragover", e => {
  const dz = e.target.closest("[data-drop]"); if (!dz) return;
  e.preventDefault(); dz.classList.add("over");
});
document.addEventListener("dragleave", e => {
  const dz = e.target.closest("[data-drop]"); if (dz) dz.classList.remove("over");
});
document.addEventListener("drop", async e => {
  const dz = e.target.closest("[data-drop]"); if (!dz) return;
  e.preventDefault(); dz.classList.remove("over");
  const p = findProj(dz.dataset.drop);
  await uploadPhotos(p, [...e.dataTransfer.files]);
  renderProjects();
});

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-pact]"); if (!el) return;
  const act = el.dataset.pact;
  const p = el.dataset.slug ? findProj(el.dataset.slug) : null;
  const persist = async (proj) => { try { const saved = await saveProject(proj, !proj.id); if (saved) Object.assign(proj, saved); } catch(err) { alert(err.message); } };

  if (act === "pedit") { PED = PED === el.dataset.slug ? null : el.dataset.slug; renderProjects(); }
  else if (act === "pvis" && p) { p.visible = !p.visible; await persist(p); renderProjects(); }
  else if ((act === "pup" || act === "pdown") && p) {
    const i = PROJ.indexOf(p), j = act === "pup" ? i-1 : i+1;
    if (j < 0 || j >= PROJ.length) return;
    [PROJ[i], PROJ[j]] = [PROJ[j], PROJ[i]];
    PROJ.forEach((x, k) => x.sort = k);
    await persist(PROJ[i]); await persist(PROJ[j]); renderProjects();
  }
  else if (act === "pdel" && p) { if (confirm(`Delete “${p.name}” from the site?`)) {
    const r = await api(`/rest/v1/projects?id=eq.${p.id}`, { method:"DELETE" });
    if (r.ok) { PROJ = PROJ.filter(x => x !== p); renderProjects(); } } }
  else if (act === "pnew") {
    const slug = "project-" + Date.now().toString(36);
    PROJ.unshift({ slug, name:"New project", loc:"", status:"", cat:"residential", description:"", cover:"", gallery:[], sort:-1, visible:false });
    PROJ.forEach((x,k)=>x.sort=k); PED = slug; renderProjects();
  }
  else if (act === "psave" && p) {
    const box = document.querySelector(`[data-pslug="${p.slug}"]`);
    p.name = box.querySelector('[data-pf="name"]').value.trim();
    p.loc = box.querySelector('[data-pf="loc"]').value.trim();
    p.status = box.querySelector('[data-pf="status"]').value.trim();
    p.cat = box.querySelector('[data-pf="cat"]').value;
    p.visible = box.querySelector('[data-pf="visible"]').value === "1";
    p.description = box.querySelector('[data-pf="description"]').value;
    const slugIn = box.querySelector('[data-pf="slug"]');
    if (!slugIn.disabled) p.slug = slugIn.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g,"-") || p.slug;
    if (!p.cover && p.gallery.length) p.cover = p.gallery[0];
    const st = $("#pstate-" + p.slug); if (st) st.innerHTML = `<span class="spin"></span> Saving…`;
    await persist(p); PED = p.slug; renderProjects();
  }
  else if (["gleft","gright","gcover","gdel"].includes(act) && p) {
    const k = +el.dataset.k;
    if (act === "gcover") p.cover = p.gallery[k];
    if (act === "gdel") { const rm = p.gallery.splice(k,1)[0]; if (p.cover === rm) p.cover = p.gallery[0]||""; }
    if (act === "gleft" && k > 0) [p.gallery[k-1],p.gallery[k]] = [p.gallery[k],p.gallery[k-1]];
    if (act === "gright" && k < p.gallery.length-1) [p.gallery[k+1],p.gallery[k]] = [p.gallery[k],p.gallery[k+1]];
    await persist(p); renderProjects();
  }
});
