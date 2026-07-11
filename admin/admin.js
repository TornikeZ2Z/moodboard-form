/* ============================================================
   ESPACIO ADMIN — auth · questionnaire builder · submissions
   ============================================================ */
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const AKEY = CONFIG.SUPABASE_KEY, AURL = CONFIG.SUPABASE_URL;
const QASSETS = "../questionnaire/assets";
// option / question image -> src: uploaded absolute URL | assets sub-folder ("styles/artdeco_1") | assets/opts name
const ASRC = n => !n ? "" : (/^https?:\/\//.test(n) ? n
  : (String(n).includes("/") ? `${QASSETS}/${n}.jpg` : `${QASSETS}/opts/${n}.jpg`));

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
const TYPE_LABELS = { text:"Short text", tel:"Phone", email:"E-mail", textarea:"Long text", num:"Number",
  yn:"Yes / No", radio:"Choose one", check:"Choose several", imgradio:"Choose one · photos",
  imgcheck:"Choose several · photos", styles:"Style boards ★", palette:"Colour palettes ★", swatch:"Swatches ★", tone:"Light tone ★" };

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
function findQByAnyId(qid) {
  for (const sc of scopes()) { const q = qList(sc).find(q => q.id === qid || ("w_"+q.id) === qid || ("b_"+q.id) === qid); if (q) return q; }
  return null;
}
// A dependency target's selectable answers. Yes/No ("yn") questions carry no
// options array, so synthesize their two values — otherwise a yn question could
// never be picked as a rule target (it stayed invisible in the dropdown).
function depOptsOf(q) {
  if (q.options && q.options.length) return q.options;
  if (q.type === "yn") return [{ v: "yes", label: "ui_yes" }, { v: "no", label: "ui_no" }];
  return [];
}
function depValueLabel(dep) {
  if (dep.op === "truthy") return "any answer";
  const tq = findQByAnyId(dep.q);
  const lab = x => { const o = tq && (tq.options||[]).find(o => o.v === x);
    return o ? tr(o.label,"ge") : (x==="yes"?"კი":x==="no"?"არა":x); };
  return Array.isArray(dep.v) ? dep.v.map(lab).join(" / ") : lab(dep.v);
}
function depSummary(dep) {
  if (!dep) return "";
  const target = tr(findLabelKey(dep.q) || dep.q, "ge");
  return `${target} → ${depValueLabel(dep)}`;
}
function findLabelKey(qid) {
  for (const sc of scopes()) { const q = qList(sc).find(q => q.id === qid || ("w_"+q.id) === qid || ("b_"+q.id) === qid); if (q) return q.label; }
  return null;
}

function renderQuestions() {
  const scs = scopes();
  const nav = scs.map((sc, i) => {
    const hidden = sc.obj.visible === false;
    const kindMark = sc.kind === "template" ? "⟳ " : "";
    return `<button class="qb-nav ${hidden?"off":""}" data-nav="${sc.key}">
      <i>${String(i+1).padStart(2,"0")}</i><span>${kindMark}${esc(sc.title)}</span><em>${qList(sc).length}</em></button>`;
  }).join("");
  const secs = scs.map((sc, i) => {
    const rows = qList(sc).map((q, qi) => qRow(sc, q, qi)).join("");
    const onCls = sc.obj.visible !== false ? "on" : "";
    const tplNote = sc.kind === "template"
      ? `<div class="tpl-note">⟳ This block repeats for every ${sc.key} the client asks for — edit it once, it applies to all.</div>` : "";
    return `<div class="sec" data-scope="${sc.key}" id="sec-${sc.key}">
      <div class="sec-head">
        <span class="sec-num">${String(i+1).padStart(2,"0")}</span>
        <h2>${esc(sc.title)}</h2>
        ${sc.badge ? `<span class="badge">${sc.badge}</span>` : ""}
        <span class="cnt">${qList(sc).length} questions</span>
        <label class="swlab">visible on site
          <button class="sw ${onCls}" data-act="sec-vis" data-scope="${sc.key}" title="Show or hide this whole section"></button></label>
        <button class="btn ghost sm" data-act="add" data-scope="${sc.key}">+ Add question</button>
      </div>
      ${tplNote}
      <div class="editor hidden" data-addbox="${sc.key}"></div>
      ${rows}
    </div>`;
  }).join("");
  $("#main").innerHTML = `<div class="wrap wide">
    <div class="toolrow"><h1>Questionnaire</h1>
      <input class="qb-search" id="qbSearch" placeholder="🔍 Find a question…">
      <span class="hint">Changes go live only after “Publish changes”.</span></div>
    <div class="qb-layout">
      <nav class="qb-side">${nav}</nav>
      <div class="qb-main">${secs}</div>
    </div></div>`;
  const search = $("#qbSearch");
  if (search) search.oninput = () => {
    const t = search.value.trim().toLowerCase();
    document.querySelectorAll(".q-row").forEach(r => {
      r.style.display = !t || r.textContent.toLowerCase().includes(t) ? "" : "none"; });
    document.querySelectorAll(".qb-main .sec").forEach(s => {
      const any = [...s.querySelectorAll(".q-row")].some(r => r.style.display !== "none");
      s.style.display = any || !t ? "" : "none"; });
  };
  document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
    document.getElementById("sec-" + b.dataset.nav)?.scrollIntoView({ behavior:"smooth", block:"start" }); });
  if (OPEN_ED) reopenEditor();
}

function qRow(sc, q, qi) {
  const lock = isCore(sc, q);
  const off = q.visible === false;
  const dep = q.dep ? `<span class="chip dep" title="Shown only when: ${esc(depSummary(q.dep))}">⤷ ${esc(depSummary(q.dep)).slice(0,46)}</span>` : "";
  return `<div class="q-row ${off?"off":""}" data-scope="${sc.key}" data-qi="${qi}">
    <span class="q-num">${String(qi+1).padStart(2,"0")}</span>
    <span class="q-move">
      <button data-act="up" title="Move up">▲</button>
      <button data-act="down" title="Move down">▼</button></span>
    <span class="q-label"><b>${esc(tr(q.label,"ge"))}</b><small>${esc(tr(q.label,"en"))}</small></span>
    ${off ? '<span class="chip offchip">hidden</span>' : ""}
    ${dep}
    <span class="chip">${TYPE_LABELS[q.type]||q.type}</span>
    <label class="swlab" title="Show this question on the site">
      <button class="sw ${off?"":"on"}" data-act="vis" ${lock&&CORE_DRIVERS.includes(q.id)?'disabled style="opacity:.3"':""}></button></label>
    <button class="editb" data-act="edit">✎ Edit</button>
    <button class="iconb ${lock?"lock":""}" data-act="del" title="${lock?"Built-in — hide it instead of deleting":"Delete question"}" ${lock?"disabled":""}>🗑</button>
  </div>`;
}

/* ---------- editor ---------- */
function editorHtml(sc, q) {
  const kinds = ["text","textarea","num","yn","radio","check","imgradio","imgcheck"];
  const special = SPECIAL_TYPES.includes(q.type) || ["tel","email"].includes(q.type);
  const labelInputs = ["ge","en","ru"].map(l => `
    <div><label>${langName[l]}</label>
    <input data-ed="label" data-lang="${l}" value="${esc(tr(q.label,l))}"></div>`).join("");
  const imgSrcOf = ASRC;
  const thumb = o => o.img
    ? `<img class="opt-thumb" src="${esc(imgSrcOf(o.img))}" onerror="this.style.visibility='hidden'">`
    : `<span class="opt-thumb none">—</span>`;
  const wantsColor = ["palette","tone"].includes(q.type);
  const colList = o => Array.isArray(o.c) ? o.c : (o.c ? [o.c] : []);
  const colPrev = o => { const a = colList(o);
    return `<span class="colprev ${a.length?"":"none"}">${a.map(c=>`<i style="background:${esc(c)}"></i>`).join("")}</span>`; };
  const opts = (q.options||[]).map((o,oi) => `
    <div class="opt-row ${wantsColor?"hascol":""}" data-oi="${oi}">
      ${wantsColor ? colPrev(o) : thumb(o)}
      <input class="adv" value="${esc(o.v)}" disabled title="internal value — used in rules">
      ${["ge","en","ru"].map(l=>`<input data-ed="optlabel" data-oi="${oi}" data-lang="${l}" placeholder="${langName[l]}" value="${esc(tr(o.label,l))}">`).join("")}
      ${wantsColor ? `<input data-ed="optcolors" data-oi="${oi}" placeholder="#e6c7c4, #d0d6c8, …" value="${esc(colList(o).join(", "))}" title="Colours — comma-separated hex">` : ""}
      <input class="adv" data-ed="optimg" data-oi="${oi}" placeholder="photo…" value="${esc(o.img||"")}">
      <button class="upbtn" data-act="optupload" data-oi="${oi}" title="Upload a photo for this option">📷 Upload</button>
      <button class="del" data-act="delopt" data-oi="${oi}" title="Remove option">✕</button>
    </div>`).join("");
  const optHead = `<div class="opt-head ${wantsColor?"hascol":""}"><span></span><span class="adv">value</span><span>ქართული</span><span>English</span><span>Русский</span>${wantsColor?`<span>colours</span>`:""}<span class="adv">photo</span><span></span><span></span></div>`;
  const choice = ["radio","check","imgradio","imgcheck","swatch","palette","tone"].includes(q.type);
  const explainBox = `<div class="explain-box">
      <label>Question image</label>
      ${q.explain
        ? `<img class="explain-thumb" src="${esc(ASRC(q.explain))}" onerror="this.style.visibility='hidden'">`
        : `<div class="explain-thumb none">no image</div>`}
      <button class="upbtn" data-act="explainupload" title="Shown inside the question, to explain it">📷 Upload</button>
      ${q.explain ? `<button class="linkbtn" data-act="explaindel">Remove</button>` : ""}
      <input class="adv" data-ed="explain" placeholder="image name…" value="${esc(q.explain||"")}">
    </div>`;

  const depTargets = qList(sc).filter(x => x.id !== q.id)
    .map(x => `<option value="${esc(x.id)}" ${q.dep&&(q.dep.q===x.id||q.dep.q===("w_"+x.id)||q.dep.q===("b_"+x.id))?"selected":""}>${esc(tr(x.label,"ge"))}</option>`).join("");
  const depTarget = q.dep ? qList(sc).find(x => x.id === q.dep.q || ("w_"+x.id) === q.dep.q || ("b_"+x.id) === q.dep.q) : null;
  const curVals = q.dep ? (Array.isArray(q.dep.v) ? q.dep.v : [q.dep.v]) : [];
  const depOpts = depTarget ? depOptsOf(depTarget) : [];
  const depValues = !depTarget
    ? `<span class="hint">choose a question first</span>`
    : depOpts.length
    ? depOpts.map(o => `<label class="depval ${curVals.includes(o.v)?"on":""}">
        <input type="checkbox" data-ed="depval" value="${esc(o.v)}" ${curVals.includes(o.v)?"checked":""}>
        ${esc(tr(o.label,"ge"))}</label>`).join("")
    : `<span class="hint dep-any">✓ shown whenever this question has been answered (any answer)</span>`;

  return `<div class="editor" data-edscope="${sc.key}" data-edq="${esc(q.id)}">
    <div class="ed-block"><h4>1 · Question text</h4>
      <div class="qtext-row">
        <div class="grid3" style="flex:1">${labelInputs}</div>
        ${explainBox}
      </div></div>
    <div class="ed-block"><h4>2 · Behaviour</h4>
      <div class="grid3">
        <div><label>Answer type</label>
          ${special ? `<input value="${TYPE_LABELS[q.type]||q.type}" disabled>` :
          `<select data-ed="type">${kinds.map(k=>`<option value="${k}" ${q.type===k?"selected":""}>${TYPE_LABELS[k]}</option>`).join("")}</select>`}</div>
        <div><label>Required</label><select data-ed="req"><option value="1" ${q.req!==false?"selected":""}>Yes — must be answered</option><option value="0" ${q.req===false?"selected":""}>No — optional</option></select></div>
        <div><label>Shown on site</label><select data-ed="vis"><option value="1" ${q.visible!==false?"selected":""}>Yes</option><option value="0" ${q.visible===false?"selected":""}>Hidden</option></select></div>
      </div></div>
    ${choice ? `<div class="ed-block"><h4>3 · Answer options
        <button class="advtog" data-act="advtoggle" title="Show technical fields">⚙</button></h4>${optHead}${opts}
      <button class="btn ghost sm" data-act="addopt">+ Add option</button></div>` : ""}
    <div class="ed-block"><h4>${choice?"4":"3"} · When is this question shown?</h4>
      <div class="dep-grid">
        <div><label>Show it…</label>
          <select data-ed="depq"><option value="">— always —</option>${depTargets}</select></div>
        <div><label>…when the answer is</label>
          <div class="depvals">${depValues}</div></div>
      </div>
      <div class="hint dep-live">${q.dep ? "⤷ Shown only when: " + esc(depSummary(q.dep)) : "This question is always visible."}</div></div>
    <div class="row-actions"><button class="btn sm" data-act="closeed">Done</button>
      <span class="hint">Remember — nothing is live until you press “Publish changes” below.</span></div>
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
        <option value="text">Short text</option><option value="textarea">Long text</option>
        <option value="num">Number</option><option value="yn">Yes / No</option>
        <option value="radio">Choose one</option><option value="check">Choose several</option>
        <option value="imgradio">Choose one · photos</option><option value="imgcheck">Choose several · photos</option></select></div>
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
  if (["imgradio","imgcheck"].includes(type)) q.cols = 3;
  if (["radio","check","imgradio","imgcheck"].includes(type)) {
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
    return `<tr data-act="view" data-id="${s.id}">
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

let CUR_SUB=null;
const PAL = { 1:["#FFFFFF","#0d0e10","#fd2e21","#fec81e","#1a79fe"],2:["#f3e6d5","#ac6c3d","#6a714f","#c6873a","#8e4939"],3:["#f6f1e7","#101010","#1b3f35","#b88536","#7c583e"],4:["#eadaca","#ca9e6f","#936443","#b55c3c","#61554a"],5:["#dbcfc1","#b7ab9b","#907b6a","#4e4a45"],6:["#ddccbc","#c3b7a7","#8e725d","#bea06e"],7:["#e8e0d5","#d1cfc2","#b8a78f","#a7ad9f"],8:["#e6c7c4","#d0d6c8","#d8e0e2","#bdb0a0"] };

function findDocQ(id) {
  const m = id.match(/^([bw])(\d+)_(.+)$/);
  const scKey = m ? (m[1]==="b" ? "bedroom" : "bathroom") : null;
  const rawId = m ? m[3] : id;
  for (const sc of scopes()) {
    if (scKey && sc.key !== scKey) continue;
    if (!scKey && sc.kind !== "section") continue;
    const q = qList(sc).find(x => x.id === rawId);
    if (q) return q;
  }
  return null;
}
function valueVisuals(qid, data) {
  const v = data ? data[qid] : undefined;
  if (v === undefined) return "";
  const q = findDocQ(qid);
  const vals = Array.isArray(v) ? v : [v];
  if (qid === "s_palette") return vals.map(p => `<span class="pal">${(PAL[p]||[]).map(c=>`<i style="background:${c}"></i>`).join("")}</span>`).join("");
  if (qid === "s_style") return vals.map(x => `<img src="../questionnaire/assets/styles/${x==="contemporary"||x==="midcentury" ? x+"_1" : x+"_1"}.jpg" title="${esc(x)}">`).join("");
  if (!q || !q.options) return "";
  return vals.map(x => { const o = q.options.find(o => o.v === x);
    return o && o.img ? `<img src="${esc(ASRC(o.img))}" title="${esc(x)}">` : ""; }).join("");
}

function subSections(s) {
  // preferred: the snapshot saved at submit time (complete + client's language)
  if (Array.isArray(s.summary) && s.summary.length)
    return s.summary.map(sec => ({ sec: sec.sec, rows: (sec.rows||[]).map(r => ({ q:r.q, a:r.a, id:r.id })) }));
  // fallback for old submissions: walk the current questionnaire schema
  const d = s.data || {}, out = [];
  for (const sc of scopes()) {
    if (sc.kind === "section") {
      const rows = qList(sc).map(q => { const a = fmtAnswer(q, d); return a===null?null:{ q:tr(q.label,"en"), a, id:q.id }; }).filter(Boolean);
      if (rows.length) out.push({ sec: sc.title, rows });
    } else {
      for (let i = 1; i <= 8; i++) {
        const prefix = (sc.key==="bedroom"?"b":"w") + i + "_";
        if (!Object.keys(d).some(k => k.startsWith(prefix))) continue;
        const rows = qList(sc).map(q => { const a = fmtAnswer(q, d, prefix); return a===null?null:{ q:tr(q.label,"en"), a, id:prefix+q.id }; }).filter(Boolean);
        if (rows.length) out.push({ sec: `${sc.title} ${i}`, rows });
      }
    }
  }
  // catch-all: anything in data not covered above
  const seen = new Set(out.flatMap(x => x.rows.map(r => r.id)));
  const extras = Object.keys(d).filter(k => !seen.has(k) && !k.endsWith("_other") && typeof d[k] !== "object")
    .map(k => ({ q:k, a:String(d[k]), id:k }));
  if (extras.length) out.push({ sec:"Other", rows: extras });
  return out;
}

function renderSubDetail() {
  const s = SUBS && SUBS.find(x => x.id === CUR_SUB);
  if (!s) { VIEW = "submissions"; renderSubs(); return; }
  const d = new Date(s.created_at);
  const secs = subSections(s).map(sec => `<div class="subd-sec"><h2>${esc(sec.sec)}</h2>
    ${sec.rows.map(r => `<div class="subd-row"><div class="k">${esc(r.q)}</div>
      <div class="v">${valueVisuals(r.id, s.data)}<span>${esc(r.a)}</span></div></div>`).join("")}</div>`).join("");
  $("#main").innerHTML = `<div class="wrap">
    <button class="backlink" data-act="backsubs">← All submissions</button>
    <div class="subd-head">
      <div><h1>${esc(s.client_name||"—")}</h1>
        <div class="meta">${d.toLocaleString("en-GB")} · ${esc(s.client_email||"—")} · ${esc(s.client_phone||"—")} · ${(s.lang||"").toUpperCase()}</div></div>
      <div style="display:flex;gap:10px">
        <a class="btn ghost sm" href="mailto:${esc(s.client_email||"")}">✉ Reply</a>
        <button class="btn danger sm" data-act="delsub-detail" data-id="${s.id}">🗑 Delete</button></div>
    </div>
    <div class="subd-cols">${secs}</div></div>`;
  window.scrollTo(0,0);
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
  else if (act === "advtoggle") { e.target.closest(".editor").classList.toggle("showadv"); }
  else if (act === "optupload") {
    const ed = e.target.closest("[data-edq]"); if (!ed) return;
    const esc3 = scopes().find(s => s.key === ed.dataset.edscope);
    const eq = qList(esc3).find(x => x.id === ed.dataset.edq);
    const oi = +el.dataset.oi;
    const fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*";
    fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return;
      toast("Uploading photo…");
      const small = await shrinkImage(f, 1200, .85);
      const path = `question-options/${eq.id}/${Date.now().toString(36)}_${f.name.replace(/[^a-z0-9.]+/gi,"-").toLowerCase()}`;
      const r = await api(`/storage/v1/object/project-photos/${path}`, { method:"POST",
        headers:{ "Content-Type":"image/jpeg", "x-upsert":"true" }, body: small });
      if (r.ok) { eq.options[oi].img = pubUrl(path);
        OPEN_ED = { scope: ed.dataset.edscope, qid: eq.id }; renderQuestions(); updateSavebar();
        toast("✓ Photo uploaded — press “Publish changes” to make it live"); }
      else toast("Upload failed (" + r.status + ")", true);
    };
    fi.click();
  }
  else if (act === "explainupload") {
    const ed = e.target.closest("[data-edq]"); if (!ed) return;
    const scX = scopes().find(s => s.key === ed.dataset.edscope);
    const eq = qList(scX).find(x => x.id === ed.dataset.edq);
    const fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*";
    fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return;
      toast("Uploading image…");
      const small = await shrinkImage(f, 1200, .85);
      const path = `question-images/${eq.id}/${Date.now().toString(36)}_${f.name.replace(/[^a-z0-9.]+/gi,"-").toLowerCase()}`;
      const r = await api(`/storage/v1/object/project-photos/${path}`, { method:"POST",
        headers:{ "Content-Type":"image/jpeg", "x-upsert":"true" }, body: small });
      if (r.ok) { eq.explain = pubUrl(path);
        OPEN_ED = { scope: ed.dataset.edscope, qid: eq.id }; renderQuestions(); updateSavebar();
        toast("✓ Image uploaded — press “Publish changes” to make it live"); }
      else toast("Upload failed (" + r.status + ")", true);
    };
    fi.click();
  }
  else if (act === "explaindel") {
    const ed = e.target.closest("[data-edq]"); if (!ed) return;
    const scY = scopes().find(s => s.key === ed.dataset.edscope);
    const eq = qList(scY).find(x => x.id === ed.dataset.edq);
    delete eq.explain;
    OPEN_ED = { scope: ed.dataset.edscope, qid: eq.id }; renderQuestions(); updateSavebar();
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
  else if (act === "view") { CUR_SUB = el.dataset.id; VIEW = "subdetail"; renderSubDetail(); }
  else if (act === "backsubs") { VIEW = "submissions"; renderSubs(); }
  else if (act === "delsub-detail") { if (confirm("Delete this submission permanently?")) {
    const r = await api(`/rest/v1/submissions?id=eq.${el.dataset.id}`, { method:"DELETE" });
    if (r.ok) { SUBS = SUBS.filter(x => x.id !== el.dataset.id); VIEW = "submissions"; renderSubs(); } } }
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
  else if (kind === "optimg") { const v = ed.value.trim(); if (v) q.options[+ed.dataset.oi].img = v; else delete q.options[+ed.dataset.oi].img;
    const row = ed.closest(".opt-row"); const t = row && row.querySelector(".opt-thumb");
    if (t) { if (v) { const s=ASRC(v); t.outerHTML = `<img class="opt-thumb" src="${s}" onerror="this.style.visibility='hidden'">`; } } }
  else if (kind === "optcolors") {
    const o = q.options[+ed.dataset.oi];
    const arr = ed.value.split(",").map(s => s.trim()).filter(Boolean);
    if (q.type === "tone") o.c = arr[0] || ""; else o.c = arr;
    const prev = ed.closest(".opt-row").querySelector(".colprev");
    if (prev) { prev.className = "colprev " + (arr.length ? "" : "none");
      prev.innerHTML = arr.map(c => `<i style="background:${esc(c)}"></i>`).join(""); }
  }
  else if (kind === "explain") { const t = ed.value.trim(); if (t) q.explain = t; else delete q.explain; }
  else if (kind === "type") q.type = ed.value;
  else if (kind === "req") q.req = ed.value === "1";
  else if (kind === "vis") q.visible = ed.value === "1";
  else if (kind === "depq") {
    OPEN_ED = { scope: box.dataset.edscope, qid: q.id };
    const dq = ed.value;
    if (!dq) delete q.dep;
    else { const tgt = qList(sc).find(x => x.id === dq || ("w_"+x.id) === dq || ("b_"+x.id) === dq);
      q.dep = (tgt && depOptsOf(tgt).length) ? { q:dq, op:"in", v:[] } : { q:dq, op:"truthy" }; }
    renderQuestions();
  }
  else if (kind === "depval") {
    const vals = [...box.querySelectorAll('[data-ed="depval"]:checked')].map(c => c.value);
    if (q.dep) { q.dep.op = "in"; q.dep.v = vals; if (!vals.length) {} }
    box.querySelectorAll(".depval").forEach(l => l.classList.toggle("on", l.querySelector("input").checked));
    const live = box.querySelector(".dep-live");
    if (live) live.textContent = vals.length ? "⤷ Shown only when: " + depSummary(q.dep) : "Pick at least one answer — otherwise the question never shows.";
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
/* One-time migration: the style boards & colour palettes used to be hard-coded in the
   engine, so there was nothing to edit. Seed them as real options the first time we see
   them, so Mariam can change photos/colours/names. Styles become a normal photo question. */
const STYLE_SEED = [
  { v:"artdeco",      label:"st_artdeco",      img:"styles/artdeco_1" },
  { v:"midcentury",   label:"st_midcentury",   img:"styles/midcentury_1" },
  { v:"scandinavian", label:"st_scandinavian", img:"styles/scandinavian_1" },
  { v:"japandi",      label:"st_japandi",      img:"styles/japandi_1" },
  { v:"popart",       label:"st_popart",       img:"styles/popart_1" },
  { v:"retrovintage", label:"st_retrovintage", img:"styles/retrovintage_1" },
  { v:"industrial",   label:"st_industrial",   img:"styles/industrial_1" },
  { v:"contemporary", label:"st_contemporary", img:"styles/contemporary_1" },
  { v:"parisian",     label:"st_parisian",     img:"styles/parisian_1" },
  { v:"rustic",       label:"st_rustic",       img:"styles/rustic_1" },
  { v:"farmhouse",    label:"st_farmhouse",    img:"styles/farmhouse_1" },
  { v:"shabbychic",   label:"st_shabbychic",   img:"styles/shabbychic_1" },
  { v:"coastal",      label:"st_coastal",      img:"styles/coastal_1" }
];
const PALETTE_SEED = [
  { v:"1", label:"pal_1", c:["#FFFFFF","#0d0e10","#fd2e21","#fec81e","#1a79fe"] },
  { v:"2", label:"pal_2", c:["#f3e6d5","#ac6c3d","#6a714f","#c6873a","#8e4939"] },
  { v:"3", label:"pal_3", c:["#f6f1e7","#101010","#1b3f35","#b88536","#7c583e"] },
  { v:"4", label:"pal_4", c:["#eadaca","#ca9e6f","#936443","#b55c3c","#61554a"] },
  { v:"5", label:"pal_5", c:["#dbcfc1","#b7ab9b","#907b6a","#4e4a45"] },
  { v:"6", label:"pal_6", c:["#ddccbc","#c3b7a7","#8e725d","#bea06e"] },
  { v:"7", label:"pal_7", c:["#e8e0d5","#d1cfc2","#b8a78f","#a7ad9f"] },
  { v:"8", label:"pal_8", c:["#e6c7c4","#d0d6c8","#d8e0e2","#bdb0a0"] }
];
function migrateSpecials() {
  let n = 0;
  for (const sc of scopes()) for (const q of qList(sc)) {
    const empty = !(q.options && q.options.length);
    if (q.type === "styles" && empty) {
      q.type = "imgcheck";                       // now a normal, fully editable photo question
      q.options = STYLE_SEED.map(s => ({ ...s }));
      q.max = q.max || 2; q.cols = 2; n++;
    } else if (q.type === "palette" && empty) {
      q.options = PALETTE_SEED.map(p => ({ ...p, c: [...p.c] }));
      q.max = q.max || 2; n++;
    }
  }
  return n;
}

async function boot() {
  if (!session || Date.now() > (session.exp||0)) { renderLogin(); return; }
  $("#tabs").classList.remove("hidden"); $("#userbox").classList.remove("hidden");
  $("#userEmail").textContent = session.email;
  $("#main").innerHTML = `<div class="wrap"><div class="empty"><span class="spin"></span> Loading questionnaire…</div></div>`;
  try { await loadDoc(); } catch(e) { renderLogin(); return; }
  const migrated = migrateSpecials();
  VIEW = "questions"; renderQuestions(); updateSavebar();
  if (migrated) toast("Style & palette questions are now editable — press “Publish changes” to save them.");
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
