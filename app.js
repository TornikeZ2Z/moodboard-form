/* ============================================================
   QUESTIONNAIRE ENGINE — wizard, dynamic sections, moodboard
   ============================================================ */
"use strict";

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const T = (k, n) => {
  let v = (I18N[state.lang] && I18N[state.lang][k]) ?? k;
  if (n !== undefined) v = v.replace("{n}", n);
  return v;
};
const OPT = name => `${CONFIG.ASSETS}/opts/${name}.jpg`;
const BOARD = name => `${CONFIG.ASSETS}/styles/${name}.jpg`;
const PAL_IMG = i => `${CONFIG.ASSETS}/palettes/pal_${i}.png`;

/* palette hex values sampled from the designer's cards */
const PALETTES = {
  1:["#FFFFFF","#0d0e10","#fd2e21","#fec81e","#1a79fe"],
  2:["#f3e6d5","#ac6c3d","#6a714f","#c6873a","#8e4939"],
  3:["#f6f1e7","#101010","#1b3f35","#b88536","#7c583e"],
  4:["#eadaca","#ca9e6f","#936443","#b55c3c","#61554a"],
  5:["#dbcfc1","#b7ab9b","#907b6a","#4e4a45"],
  6:["#ddccbc","#c3b7a7","#8e725d","#bea06e"],
  7:["#e8e0d5","#d1cfc2","#b8a78f","#a7ad9f"],
  8:["#e6c7c4","#d0d6c8","#d8e0e2","#bdb0a0"]
};

const STYLES = [
  { v:"artdeco",      boards:["artdeco_1"] },
  { v:"midcentury",   boards:["midcentury_1","midcentury_2"] },
  { v:"scandinavian", boards:["scandinavian_1"] },
  { v:"japandi",      boards:["japandi_1"] },
  { v:"popart",       boards:["popart_1"] },
  { v:"retrovintage", boards:["retrovintage_1"] },
  { v:"industrial",   boards:["industrial_1"] },
  { v:"contemporary", boards:["contemporary_1","contemporary_2"] },
  { v:"parisian",     boards:["parisian_1"] },
  { v:"rustic",       boards:["rustic_1"] },
  { v:"farmhouse",    boards:["farmhouse_1"] },
  { v:"shabbychic",   boards:["shabbychic_1"] },
  { v:"coastal",      boards:["coastal_1"] }
];
const METAL_IMG = { black:"fin_mblack", gold:"fin_bgold", silver:"fin_nickel", rose:"fin_brose" };
const FINISHES = ["chrome","nickel","mblack","gunmetal","mwhite","champagne","pgold","bgold","prose","brose"];

/* ---------- state ---------- */
const SAVE_KEY = "mariam_form_v1";
let state = { lang: CONFIG.DEFAULT_LANG, step: 0, done: false, data: {} };
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (saved && saved.data) state = Object.assign(state, saved, { done:false });
} catch (e) {}
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} };
const D = state.data;

/* ---------- question factories ---------- */
const yn      = (id, l, opts={}) => Object.assign({ id, t:"yn", l, req:true }, opts);
const txt     = (id, l, opts={}) => Object.assign({ id, t:"text", l, req:true }, opts);
const num     = (id, l, opts={}) => Object.assign({ id, t:"num", l, min:0, max:10, req:true }, opts);
const radio   = (id, l, o, opts={}) => Object.assign({ id, t:"radio", l, o, req:true }, opts);
const check   = (id, l, o, opts={}) => Object.assign({ id, t:"check", l, o, req:false }, opts);
const imgr    = (id, l, o, opts={}) => Object.assign({ id, t:"imgradio", l, o, req:true }, opts);
const imgc    = (id, l, o, opts={}) => Object.assign({ id, t:"imgcheck", l, o, req:true }, opts);

const O  = (v, l, img) => ({ v, l, img });                 // option
const num2 = v => parseInt(v, 10) || 0;

/* ---------- schema ---------- */
function bedroomQs(i) {
  const p = `b${i}_`;
  return [
    radio(p+"size", "b_size", ["single","semi","double","queen","king","superking"].map(v=>O(v,"o_bs_"+v))),
    yn(p+"storage", "b_storage"),
    radio(p+"wardrobe", "b_wardrobe", ["built","walkin","free"].map(v=>O(v,"o_bw_"+v))),
    yn(p+"boudoir", "b_boudoir"),
    yn(p+"work", "b_work"),
    yn(p+"tv", "b_tv"),
    yn(p+"accent", "b_accent"),
    imgr(p+"curtains", "b_curtains", [
      O("thick","o_ct_thick","curt_thick"), O("sheer","o_ct_sheer","curt_sheer"),
      O("venetian","o_ct_venetian","curt_venetian"), O("roman","o_ct_roman","curt_roman"),
      O("roller","o_ct_roller","curt_roller")], { cols:3 })
  ];
}

function bathQs(i, typeV) {
  const p = `w${i}_`;
  const guest = typeV === "guestwc";
  const showsShower = d => !guest && ["shower","both"].includes(d[p+"pref"]);
  const showsTub    = d => !guest && ["tub","both"].includes(d[p+"pref"]);
  const qs = [
    radio(p+"sinkCount", "w_sinkCount", [O("1","1"),O("2","2")], { raw:true }),
    imgr(p+"sinkType", "w_sinkType", [
      O("counter","o_sk_counter","sink_countertop"), O("under","o_sk_under","sink_undermount"),
      O("integrated","o_sk_integrated","sink_integrated"), O("stone","o_sk_stone","sink_stone")], { cols:4 }),
    yn(p+"vanity", "w_vanity"),
    radio(p+"wcType", "w_wcType", [O("hung","o_wc_hung"),O("floor","o_wc_floor")]),
    imgr(p+"above", "w_above", [
      O("shelf","o_ab_shelf","wc_shelf"), O("cabinet","o_ab_cabinet","wc_cabinet"),
      O("clad","o_ab_clad","wc_clad")], { cols:3, show:d=>d[p+"wcType"]==="hung" }),
    yn(p+"hyg", "w_hyg"),
  ];
  if (!guest) qs.push(
    yn(p+"bidet", "w_bidet"),
    radio(p+"pref", "w_pref", [O("shower","o_pf_shower"),O("tub","o_pf_tub"),O("both","o_pf_both")]),
    imgr(p+"tubType", "w_tubType", [
      O("builtin","o_tb_builtin","tub_builtin"), O("free","o_tb_free","tub_freestanding")], { cols:2, show:showsTub }),
    imgr(p+"thresh", "w_thresh", [
      O("no","o_th_no","thresh_no"), O("yes","o_th_yes","thresh_yes")], { cols:2, show:showsShower }),
    imgr(p+"part", "w_part", [
      O("glass","o_pa_glass","part_glass"), O("wall","o_pa_wall","part_wall"),
      O("block","o_pa_block","part_glassblock"), O("combo","o_pa_combo","part_combo")], { cols:4, show:showsShower }),
    imgr(p+"shsys", "w_shsys", [
      O("concealed","o_ss_concealed","shsys_concealed"), O("exposed","o_ss_exposed","shsys_exposed")], { cols:2, show:showsShower })
  );
  qs.push(
    imgr(p+"faucet", "w_faucet", [
      O("wall","o_fa_wall","faucet_wall"), O("deck","o_fa_deck","faucet_deck")], { cols:2 }),
    { id:p+"finish", t:"swatch", l:"w_finish", req:true,
      o: FINISHES.map(v=>O(v,"o_fi_"+v,"fin_"+v)) },
    radio(p+"tile", "w_tile", [O("small","o_ti_small"),O("medium","o_ti_medium"),O("large","o_ti_large")]),
    radio(p+"wallCover", "w_wallCover", [O("full","o_wl_full"),O("partial","o_wl_partial")])
  );
  if (!guest) qs.push(yn(p+"spare", "w_spare"));
  qs.push(radio(p+"heat", "w_heat", [O("floor","o_wh_floor"),O("dryer","o_wh_dryer"),O("both","o_wh_both")]));
  if (!guest) qs.push(yn(p+"seat", "w_seat", { show:showsShower }));
  return qs;
}

function bathTypeOptions(d) {
  const opts = [O("shared","o_bt_shared"), O("guestwc","o_bt_guestwc")];
  for (let n = 1; n <= 5; n++) opts.push({ v:"master"+n, l:"o_bt_master", ln:n });
  return opts;
}

function buildSteps(d) {
  const steps = [];
  steps.push({ id:"welcome", type:"welcome" });

  steps.push({ id:"g", icon:"st_g", title:"sec_g_t", sub:"sec_g_s", num:"01", qs:[
    txt("g_name","g_name"), txt("g_phone","g_phone",{ t:"tel" }), txt("g_email","g_email",{ t:"email" }),
    txt("g_address","g_address"),
    num("g_residents","g_residents",{ min:1, max:20 }),
    yn("g_kids","g_kids"),
    num("g_kidsCount","g_kidsCount",{ min:1, max:10, show:dd=>dd.g_kids==="yes" }),
    txt("g_kidsAges","g_kidsAges",{ ph:"g_kidsAgesPh", show:dd=>dd.g_kids==="yes" }),
    check("g_pets","g_pets",[O("dog","o_pets_dog"),O("cat","o_pets_cat"),O("none","o_pets_none"),O("other","o_pets_other")],{ req:true, none:"none", other:"other" })
  ]});

  steps.push({ id:"l", icon:"st_l", title:"sec_l_t", sub:"sec_l_s", num:"02", qs:[
    num("l_bedrooms","l_bedrooms",{ n:"l_bedrooms_n", min:1, max:8 }),
    num("l_masters","l_masters",{ min:0, max:5 }),
    check("l_masterIncl","l_masterIncl",[O("bath","o_mi_bath"),O("wardrobe","o_mi_wardrobe"),O("none","o_mi_none")],{ req:true, none:"none", show:dd=>num2(dd.l_masters)>0 }),
    yn("l_guest","l_guest"),
    num("l_kidsRooms","l_kidsRooms",{ min:0, max:8 }),
    yn("l_office","l_office"),
    radio("l_wardrobe","l_wardrobe",[O("shared","o_w_shared"),O("master","o_w_master"),O("both","o_w_both"),O("none","o_w_none")]),
    radio("l_laundry","l_laundry",[O("room","o_la_room"),O("bath","o_la_bath"),O("balcony","o_la_balcony"),O("entry","o_la_entry")]),
    yn("l_pantry","l_pantry"),
    radio("l_livKitchen","l_livKitchen",[O("comb","o_lk_comb"),O("part","o_lk_part"),O("iso","o_lk_iso")]),
    radio("l_dining","l_dining",[O("kitchen","o_d_kitchen"),O("living","o_d_living"),O("separate","o_d_separate")]),
    num("l_bathCount","l_bathCount",{ n:"l_bathCount_n", min:1, max:7 }),
    check("l_bathTypes","l_bathTypes", bathTypeOptions(d), { exactFn:dd=>Math.min(num2(dd.l_bathCount)||1,7), req:true }),
    radio("l_guests","l_guests",[O("often","o_gu_often"),O("some","o_gu_some"),O("rare","o_gu_rare")]),
    yn("l_wfh","l_wfh"),
    yn("l_sport","l_sport"),
    txt("l_mostTime","l_mostTime"),
    { id:"l_keep", t:"textarea", l:"l_keep", n:"l_keep_n", req:false }
  ]});

  steps.push({ id:"s", icon:"st_s", title:"sec_s_t", sub:"sec_s_s", num:"03", qs:[
    { id:"s_style", t:"styles", l:"s_style", n:"s_style_n", req:true, max:2 },
    { id:"s_palette", t:"palette", l:"s_palette", n:"s_palette_n", req:true, max:2 },
    radio("s_floormat","s_floormat",[O("porcelain","o_fm_porcelain"),O("stone","o_fm_stone"),O("engineered","o_fm_engineered"),O("solid","o_fm_solid"),O("laminate","o_fm_laminate"),O("vinyl","o_fm_vinyl"),O("micro","o_fm_micro")],{ other:true }),
    imgr("s_floorpat","s_floorpat",[
      O("straight","o_fp_straight","floorpat_straight"),O("brick","o_fp_brick","floorpat_brick"),
      O("herringbone","o_fp_herringbone","floorpat_herringbone"),O("chevron","o_fp_chevron","floorpat_chevron"),
      O("versailles","o_fp_versailles","floorpat_versailles")],{ cols:3, other:true }),
    imgr("s_floorcol","s_floorcol",[
      O("light","o_fc_light","floorcol_light"),O("medium","o_fc_medium","floorcol_medium"),O("dark","o_fc_dark","floorcol_dark")],{ cols:3 }),
    imgr("s_wall","s_wall",[
      O("matte","o_wb_matte","wall_matte"),O("gloss","o_wb_gloss","wall_gloss"),O("wallpaper","o_wb_wallpaper","wall_wallpaper"),
      O("plaster","o_wb_plaster","wall_plaster"),O("limewash","o_wb_limewash","wall_limewash")],{ cols:3 }),
    yn("s_shadowCeil","s_shadowCeil",{ n:"s_shadow_n", explain:"shadow_profile" }),
    yn("s_shadowFloor","s_shadowFloor"),
    yn("s_cornice","s_cornice",{ show:dd=>dd.s_shadowCeil==="no" }),
    imgr("s_plinth","s_plinth",[
      O("painted","o_pl_painted","plinth_painted"),O("veneered","o_pl_veneered","plinth_veneered"),
      O("flush","o_pl_flush","plinth_flush"),O("stone","o_pl_stone","plinth_stone"),
      O("pvc","o_pl_pvc","plinth_pvc"),O("aluminum","o_pl_aluminum","plinth_aluminum")],{ cols:3, other:true }),
    imgr("s_doortype","s_doortype",[
      O("hidden","o_dt_hidden","door_hidden"),O("full","o_dt_full","door_fullheight"),
      O("framed","o_dt_framed","door_framed"),O("classic","o_dt_classic","door_classic")],{ cols:4, tall:true }),
    imgr("s_doorsurf","s_doorsurf",[
      O("solid","o_ds_solid","doorsurf_solid"),O("wood","o_ds_wood","doorsurf_wood"),O("glass","o_ds_glass","doorsurf_glass")],{ cols:3 }),
    imgr("s_curtains","s_curtains",[
      O("thick","o_ct_thick","curt_thick"),O("sheer","o_ct_sheer","curt_sheer"),O("venetian","o_ct_venetian","curt_venetian"),
      O("roman","o_ct_roman","curt_roman"),O("roller","o_ct_roller","curt_roller")],{ cols:3 }),
    imgc("s_deco","s_deco",[
      O("wood","o_dc_wood","deco_wood"),O("fluted","o_dc_fluted","deco_fluted"),O("stone","o_dc_stone","deco_stone"),
      O("metal","o_dc_metal","deco_metal"),O("moulding","o_dc_moulding","deco_moulding"),O("mirror","o_dc_mirror","deco_mirror"),
      O("vitrine","o_dc_vitrine","deco_vitrine")],{ cols:4, req:false }),
    { id:"s_metal", t:"swatch", l:"s_metal", req:true,
      o:[O("black","o_mt_black","fin_mblack"),O("gold","o_mt_gold","fin_bgold"),O("silver","o_mt_silver","fin_nickel"),O("rose","o_mt_rose","fin_brose")] }
  ]});

  steps.push({ id:"li", icon:"st_li", title:"sec_li_t", sub:"sec_li_s", num:"04", qs:[
    imgc("li_types","li_types",[
      O("recessed","o_lt_recessed","light_recessed"),O("surface","o_lt_surface","light_surface"),
      O("track","o_lt_track","light_track"),O("chandelier","o_lt_chandelier"),O("sconce","o_lt_sconce")],{ cols:3 }),
    radio("li_dominant","li_dominant",[O("point","o_ld_point"),O("deco","o_ld_deco"),O("track","o_ld_track")]),
    { id:"li_tone", t:"tone", l:"li_tone", req:true,
      o:[{v:"cool",l:"o_to_cool",c:"#dcebff"},{v:"neutral",l:"o_to_neutral",c:"#fff3e0"},{v:"warm",l:"o_to_warm",c:"#ffd9a8"}] }
  ]});

  steps.push({ id:"h", icon:"st_h", title:"sec_h_t", sub:"sec_h_s", num:"05", qs:[
    radio("h_system","h_system",[O("floor","o_hs_floor"),O("rad","o_hs_rad"),O("both","o_hs_both"),O("hvac","o_hs_hvac")]),
    imgr("h_radType","h_radType",[
      O("sectional","o_rt_sectional","rad_sectional"),O("panel","o_rt_panel","rad_panel"),O("designer","o_rt_designer","rad_designer")],
      { cols:3, show:dd=>["rad","both"].includes(dd.h_system) }),
    txt("h_ac","h_ac",{ ph:"h_acPh", req:false }),
    yn("h_smart","h_smart"),
    check("h_smartFeat","h_smartFeat",[O("light","o_sf_light"),O("curtain","o_sf_curtain"),O("climate","o_sf_climate"),
      O("security","o_sf_security"),O("audio","o_sf_audio"),O("lock","o_sf_lock")],{ show:dd=>dd.h_smart==="yes" })
  ]});

  const nBed = Math.min(Math.max(num2(d.l_bedrooms), 1), 8);
  for (let i = 1; i <= nBed; i++)
    steps.push({ id:"b"+i, icon:"st_b", titleRaw: n => T("sec_b_t", i), sub:"sec_b_s", num:"06", chip: T("st_b")+" "+i, qs: bedroomQs(i) });

  const types = Array.isArray(d.l_bathTypes) ? d.l_bathTypes : [];
  const bathList = types.length ? types : ["shared"];
  bathList.forEach((tv, idx) => {
    const opt = bathTypeOptions(d).find(o => o.v === tv);
    const title = () => opt ? (opt.ln ? T(opt.l, opt.ln) : T(opt.l)) : T("st_w");
    steps.push({ id:"w"+(idx+1), icon:"st_w", titleRaw: title, sub:"sec_w_s", num:"07", chip: title, qs: bathQs(idx+1, tv) });
  });

  steps.push({ id:"k", icon:"st_k", title:"sec_k_t", sub:"sec_k_s", num:"08", qs:[
    radio("k_layout","k_layout",[O("straight","o_kl_straight"),O("l","o_kl_l"),O("u","o_kl_u"),O("parallel","o_kl_parallel"),O("island","o_kl_island"),O("peninsula","o_kl_peninsula")]),
    radio("k_facade","k_facade",[O("lamwood","o_kf_lamwood"),O("lamsolid","o_kf_lamsolid"),O("mdfpaint","o_kf_mdfpaint"),O("mdfveneer","o_kf_mdfveneer"),O("wood","o_kf_wood"),O("acrylic","o_kf_acrylic")]),
    radio("k_handles","k_handles",[O("yes","o_kh_yes"),O("no","o_kh_no"),O("milled","o_kh_milled")]),
    yn("k_island","k_island"),
    check("k_islandFunc","k_islandFunc",[O("work","o_if_work"),O("dining","o_if_dining"),O("sink","o_if_sink"),O("hob","o_if_hob"),O("wine","o_if_wine")],{ show:dd=>dd.k_island==="yes" }),
    radio("k_stove","k_stove",[O("induction","o_ks_induction"),O("gas","o_ks_gas"),O("combo","o_ks_combo")]),
    yn("k_oven","k_oven"),
    yn("k_micro","k_micro"),
    radio("k_fridge","k_fridge",[O("builtin","o_kr_builtin"),O("free","o_kr_free"),O("double","o_kr_double")]),
    yn("k_dish","k_dish"),
    imgr("k_hood","k_hood",[O("hidden","o_kd_hidden","hood_hidden"),O("wall","o_kd_wall","hood_wall"),O("ceiling","o_kd_ceiling","hood_ceiling")],{ cols:3 }),
    radio("k_coffee","k_coffee",[O("builtin","o_kc_builtin"),O("free","o_kc_free"),O("none","o_kc_none")]),
    yn("k_corner","k_corner"),
    yn("k_wine","k_wine"),
    yn("k_disposer","k_disposer"),
    radio("k_bowls","k_bowls",[O("1","1"),O("1.5","1.5"),O("2","2")],{ raw:true }),
    radio("k_worktop","k_worktop",[O("quartz","o_kw_quartz"),O("granite","o_kw_granite"),O("marble","o_kw_marble"),O("solid","o_kw_solid"),O("laminate","o_kw_laminate")]),
    yn("k_backsplash","k_backsplash"),
    check("k_extras","k_extras",[O("filter","o_ke_filter"),O("vacuum","o_ke_vacuum"),O("warm","o_ke_warm"),O("bottle","o_ke_bottle"),O("bin","o_ke_bin"),O("dryer","o_ke_dryer")]),
    check("k_small","k_small",[O("airfryer","o_km_airfryer"),O("blender","o_km_blender"),O("mixer","o_km_mixer"),O("toaster","o_km_toaster"),O("kettle","o_km_kettle"),O("juicer","o_km_juicer")],{ other:"other" })
  ]});

  steps.push({ id:"r", type:"review", icon:"st_r", title:"sec_r_t", sub:"sec_r_s", num:"09" });
  steps.push({ id:"final", type:"final" });
  return steps;
}

/* ---------- rendering ---------- */
const stage = $("#stage");
let lightGallery = [], lightIdx = 0;

function labelOf(o, lang) {
  const raw = o.raw || /^[0-9.]+$/.test(o.l) ? o.l : null;
  let s = raw !== null && o.l === o.v ? o.v : T(o.l);
  if (o.ln !== undefined) s = s.replace("{n}", o.ln);
  return s;
}

function qHtml(q, d) {
  const v = d[q.id];
  const req = q.req ? '<span class="q-req">*</span>' : "";
  const note = q.n ? `<div class="q-note">${esc(T(q.n))}</div>` : "";
  let body = "";

  switch (q.t) {
    case "text": case "tel": case "email":
      body = `<input class="inp" type="${q.t}" data-inp="${q.id}" value="${esc(v||"")}" placeholder="${esc(q.ph?T(q.ph):"")}">`;
      break;
    case "textarea":
      body = `<textarea class="inp" data-inp="${q.id}" placeholder="${esc(q.ph?T(q.ph):"")}">${esc(v||"")}</textarea>`;
      break;
    case "num": {
      const val = v ?? q.min;
      body = `<div class="num-wrap">
        <button class="num-btn" data-num="${q.id}" data-d="-1">−</button>
        <div class="num-val" id="nv_${q.id}">${val}</div>
        <button class="num-btn" data-num="${q.id}" data-d="1">+</button></div>`;
      break; }
    case "yn": {
      body = `<div class="yn">
        <div class="pill ${v==="yes"?"on":""}" data-pick="${q.id}" data-v="yes">${T("ui_yes")}</div>
        <div class="pill ${v==="no"?"on":""}" data-pick="${q.id}" data-v="no">${T("ui_no")}</div></div>`;
      if (q.explain) body += `<div class="explainer" data-zoom='${JSON.stringify([OPT(q.explain)])}' data-cap="${esc(T(q.l))}"><img src="${OPT(q.explain)}" loading="lazy" alt=""></div>`;
      break; }
    case "radio": case "check": {
      const multi = q.t === "check";
      const cur = multi ? (Array.isArray(v)?v:[]) : v;
      const pills = q.o.map(o => {
        const on = multi ? cur.includes(o.v) : cur === o.v;
        return `<div class="pill ${on?"on":""}" data-pick="${q.id}" data-v="${esc(o.v)}" data-multi="${multi?1:0}">${esc(labelOf(o))}</div>`;
      }).join("");
      let other = "";
      if (q.other) {
        const isOther = multi ? cur.includes("other") : cur === "other";
        other = `<div class="pill ${isOther?"on":""}" data-pick="${q.id}" data-v="other" data-multi="${multi?1:0}">${T("ui_other")}</div>`;
        if (isOther) other += `<input class="inp" style="margin-top:10px" data-inp="${q.id}_other" value="${esc(d[q.id+"_other"]||"")}" placeholder="${T("ui_otherPh")}">`;
      }
      body = `<div class="pills">${pills}${other}</div>`;
      break; }
    case "imgradio": case "imgcheck": {
      const multi = q.t === "imgcheck";
      const cur = multi ? (Array.isArray(v)?v:[]) : v;
      const cards = q.o.map(o => {
        const on = multi ? cur.includes(o.v) : cur === o.v;
        const img = o.img ? `<img src="${OPT(o.img)}" loading="lazy" alt="">
          <button class="zoom" data-zoom='${JSON.stringify([OPT(o.img)])}' data-cap="${esc(labelOf(o))}">⌕</button>` :
          `<div style="aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--line)">✦</div>`;
        return `<div class="card ${q.tall?"tall":""} ${on?"on":""}" data-pick="${q.id}" data-v="${esc(o.v)}" data-multi="${multi?1:0}" data-max="${q.max||0}">
          ${img}<div class="cap">${esc(labelOf(o))}</div><div class="tick">✓</div></div>`;
      }).join("");
      let other = "";
      if (q.other) {
        const isOther = cur === "other";
        other = `<div class="pills" style="margin-top:10px"><div class="pill ${isOther?"on":""}" data-pick="${q.id}" data-v="other" data-multi="0">${T("ui_other")}</div></div>`;
        if (isOther) other += `<input class="inp" style="margin-top:10px" data-inp="${q.id}_other" value="${esc(d[q.id+"_other"]||"")}" placeholder="${T("ui_otherPh")}">`;
      }
      body = `<div class="cards c${q.cols||3}">${cards}</div>${other}`;
      break; }
    case "styles": {
      const cur = Array.isArray(v)?v:[];
      body = `<div class="cards c2">` + STYLES.map(s => {
        const on = cur.includes(s.v);
        const gallery = JSON.stringify(s.boards.map(BOARD));
        return `<div class="card ${on?"on":""}" data-pick="${q.id}" data-v="${s.v}" data-multi="1" data-max="2">
          <img src="${BOARD(s.boards[0])}" loading="lazy" alt="">
          ${s.boards.length>1?`<div class="board-count">${T("ui_boards",s.boards.length)}</div>`:""}
          <button class="zoom" data-zoom='${gallery}' data-cap="${esc(T("st_"+s.v))}">⌕</button>
          <div class="cap">${esc(T("st_"+s.v))}</div><div class="tick">✓</div></div>`;
      }).join("") + `</div>`;
      break; }
    case "palette": {
      const cur = Array.isArray(v)?v:[];
      body = `<div class="cards c4">` + Object.keys(PALETTES).map(i => {
        const on = cur.includes(i);
        const chips = PALETTES[i].map(c=>`<i style="background:${c}"></i>`).join("");
        return `<div class="card pal ${on?"on":""}" data-pick="${q.id}" data-v="${i}" data-multi="1" data-max="2">
          <div class="pal-chips">${chips}</div>
          <button class="zoom" data-zoom='${JSON.stringify([PAL_IMG(i)])}' data-cap="${esc(T("pal_"+i))}">⌕</button>
          <div class="cap">${esc(T("pal_"+i))}</div><div class="tick">✓</div></div>`;
      }).join("") + `</div>`;
      break; }
    case "swatch": {
      body = `<div class="swatches">` + q.o.map(o => `
        <div class="swatch ${v===o.v?"on":""}" data-pick="${q.id}" data-v="${o.v}" data-multi="0">
          <img src="${OPT(o.img)}" loading="lazy" alt=""><div class="cap">${esc(labelOf(o))}</div></div>`).join("") + `</div>`;
      break; }
    case "tone": {
      body = `<div class="cards c3">` + q.o.map(o => `
        <div class="card tone ${v===o.v?"on":""}" data-pick="${q.id}" data-v="${o.v}" data-multi="0">
          <i style="background:${o.c}"></i><div class="cap">${esc(T(o.l))}</div><div class="tick">✓</div></div>`).join("") + `</div>`;
      break; }
  }
  return `<div class="q" id="q_${q.id}"><div class="q-label">${esc(T(q.l))}${req}</div>${note}${body}<div class="q-error"></div></div>`;
}

function renderStep() {
  const steps = buildSteps(D);
  if (state.step >= steps.length) state.step = steps.length - 1;
  const st = steps[state.step];
  const navbar = $("#navbar"), progress = $("#progressWrap");

  if (st.type === "welcome") {
    navbar.style.display = "none"; progress.style.display = "none";
    const qCount = steps.filter(s=>s.qs).reduce((a,s)=>a+s.qs.length,0);
    stage.innerHTML = `<div class="welcome">
      <div class="wl-kicker">${esc(T("ui_wlKicker"))}</div>
      <h1>${esc(T("ui_wlTitle"))}</h1>
      <p>${esc(T("ui_wlText"))}</p>
      <div class="meta">
        <div><b>~15</b>${esc(T("ui_wlMin"))}</div>
        <div><b>${qCount}</b>${esc(T("ui_wlQ"))}</div>
        <div><b>3</b>${esc(T("ui_wlLang"))}</div>
      </div>
      <button class="btn primary" id="btnStart" style="font-size:16px;padding:15px 44px">${esc(T("ui_start"))}</button>
    </div>`;
    $("#btnStart").onclick = () => { state.step = 1; save(); renderStep(); window.scrollTo(0,0); };
    return;
  }
  if (st.type === "final") { renderFinal(); return; }

  navbar.style.display = "flex"; progress.style.display = "block";
  renderProgress(steps);

  if (st.type === "review") {
    stage.innerHTML = sectionHead(st) + renderReview(steps);
    $("#btnNext").textContent = T("ui_submit");
  } else {
    const qs = st.qs.filter(q => !q.show || q.show(D));
    qs.forEach(q => { if (q.t === "num" && D[q.id] === undefined) { D[q.id] = q.min; } });
    stage.innerHTML = sectionHead(st) + qs.map(q => qHtml(q, D)).join("") +
      `<div class="q-note" style="margin:6px 4px">${esc(T("ui_reqNote"))}</div>`;
    $("#btnNext").textContent = T("ui_next");
  }
  $("#btnBack").textContent = T("ui_back");
  $("#btnBack").style.visibility = state.step <= 1 ? "hidden" : "visible";
  $("#navHint").textContent = "";
  save();
}

function sectionHead(st) {
  const title = st.titleRaw ? st.titleRaw() : T(st.title);
  return `<div class="section-head">
    <div class="section-kicker">${st.num||""} — ${esc(T(st.icon))}</div>
    <div class="section-title">${esc(title)}</div>
    <div class="section-sub">${esc(T(st.sub))}</div></div>`;
}

function renderProgress(steps) {
  const list = steps.filter(s => s.type !== "welcome" && s.type !== "final");
  const iNow = list.indexOf(steps[state.step]);
  $("#progressSteps").innerHTML = list.map((s,i) => {
    const label = s.chip ? (typeof s.chip === "function" ? s.chip() : s.chip) : T(s.icon);
    return `<span class="${i===iNow?"now":i<iNow?"done":""}">${esc(label)}</span>`;
  }).join("");
  $("#progressFill").style.width = Math.round((iNow) / Math.max(list.length-1,1) * 100) + "%";
}

/* ---------- validation ---------- */
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const rePhone = /^[+0-9()\-\s]{6,20}$/;

function validateStep() {
  const steps = buildSteps(D);
  const st = steps[state.step];
  if (!st.qs) return true;
  let firstErr = null;
  st.qs.filter(q => !q.show || q.show(D)).forEach(q => {
    const el = $("#q_" + q.id);
    if (!el) return;
    const v = D[q.id];
    let err = "";
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (q.req && empty) err = ["radio","yn","imgradio","imgcheck","styles","palette","swatch","tone","check"].includes(q.t) ? T("ui_errChoose") : T("ui_errReq");
    if (!err && q.t === "email" && v && !reEmail.test(v)) err = T("ui_errEmail");
    if (!err && q.t === "tel" && v && !rePhone.test(v)) err = T("ui_errPhone");
    if (!err && q.exactFn) {
      const need = q.exactFn(D);
      if ((Array.isArray(v)?v.length:0) !== need) err = T("ui_errPickN", need);
    }
    if (!err && v === "other" && q.other && !(D[q.id+"_other"]||"").trim()) err = T("ui_errReq");
    el.classList.toggle("err", !!err);
    el.querySelector(".q-error").textContent = err;
    if (err && !firstErr) firstErr = el;
  });
  if (firstErr) { firstErr.scrollIntoView({ behavior:"smooth", block:"center" }); return false; }
  return true;
}

/* ---------- review ---------- */
function fmtVal(q, d) {
  const v = d[q.id];
  if (v === undefined || v === null || v === "" || (Array.isArray(v)&&!v.length)) return T("r_empty");
  const one = x => {
    if (q.t === "styles") return T("st_"+x);
    if (q.t === "palette") return T("pal_"+x);
    if (x === "yes") return T("ui_yes");
    if (x === "no") return T("ui_no");
    if (x === "other") return T("ui_other") + (d[q.id+"_other"] ? ` (${d[q.id+"_other"]})` : "");
    const o = (q.o||[]).find(o=>o.v===x);
    return o ? labelOf(o) : x;
  };
  return Array.isArray(v) ? v.map(one).join(", ") : one(v);
}

function renderReview(steps) {
  return steps.filter(s => s.qs).map((s, si) => {
    const idx = steps.indexOf(s);
    const rows = s.qs.filter(q => !q.show || q.show(D)).map(q =>
      `<div class="review-row"><div class="rk">${esc(T(q.l))}</div><div class="rv">${esc(fmtVal(q, D))}</div></div>`).join("");
    const title = s.titleRaw ? s.titleRaw() : T(s.title);
    return `<div class="review-block"><h3>${esc(title)}<button data-goto="${idx}">${T("ui_edit")}</button></h3>${rows}</div>`;
  }).join("");
}

/* ---------- final: moodboard + send ---------- */
function primaryPalette() {
  const p = Array.isArray(D.s_palette) ? D.s_palette : [];
  return p.length ? p : ["5"];
}
function chosenStyles() {
  const sel = Array.isArray(D.s_style) ? D.s_style : [];
  return sel.map(v => STYLES.find(s=>s.v===v)).filter(Boolean);
}

function moodboardHtml() {
  const stys = chosenStyles();
  const s1 = stys[0] || STYLES[7];
  const board1 = BOARD(s1.boards[0]);
  let cell2 = "";
  if (stys[1]) cell2 = `<img src="${BOARD(stys[1].boards[0])}"><div class="mb-tag">${esc(T("mb_style"))} · ${esc(T("st_"+stys[1].v))}</div>`;
  else if (s1.boards[1]) cell2 = `<img src="${BOARD(s1.boards[1])}"><div class="mb-tag">${esc(T("st_"+s1.v))}</div>`;
  else cell2 = `<img src="${PAL_IMG(primaryPalette()[0])}" style="object-fit:contain;background:#fff"><div class="mb-tag">${esc(T("mb_palette"))}</div>`;

  const pals = primaryPalette();
  const chips = pals.map(p => PALETTES[p].map(c=>`<i style="background:${c}"></i>`).join("")).join("");

  const cells = [];
  if (D.s_floorcol) cells.push([OPT("floorcol_"+D.s_floorcol), T("mb_floor")]);
  if (D.s_wall) cells.push([OPT("wall_"+D.s_wall), T("mb_wall")]);
  if (D.s_curtains && D.s_curtains !== "other") cells.push([OPT("curt_"+({thick:"thick",sheer:"sheer",venetian:"venetian",roman:"roman",roller:"roller"}[D.s_curtains]||"sheer")), T("mb_curtain")]);
  if (D.s_metal) cells.push([OPT(METAL_IMG[D.s_metal]), T("mb_metal")]);
  if (D.s_doortype) cells.push([OPT({hidden:"door_hidden",full:"door_fullheight",framed:"door_framed",classic:"door_classic"}[D.s_doortype]), T("mb_door")]);
  if (D.s_floorpat && D.s_floorpat !== "other") cells.push([OPT("floorpat_"+D.s_floorpat), T("mb_floor")+" · "+fmtVal({id:"s_floorpat",t:"imgradio",o:buildSteps(D).find(s=>s.id==="s").qs.find(q=>q.id==="s_floorpat").o}, D)]);

  const small = cells.slice(0,6).map(c =>
    `<div class="mb-cell mb-s"><img src="${c[0]}"><div class="mb-tag">${esc(c[1])}</div></div>`).join("");

  const styleNames = stys.map(s=>T("st_"+s.v)).join(" + ") || "—";
  const palNames = pals.map(p=>T("pal_"+p)).join(" + ");
  const today = new Date().toLocaleDateString(state.lang==="ge"?"ka-GE":state.lang==="ru"?"ru-RU":"en-GB",{ year:"numeric", month:"long", day:"numeric" });

  return `<div id="moodboard">
    <div class="mb-head">
      <h2>${esc(T("ui_mbTitle"))}</h2>
      <div class="mb-for">${esc(T("ui_mbFor"))}<br><b>${esc(D.g_name||"")}</b></div>
    </div>
    <div class="mb-grid">
      <div class="mb-cell mb-style1"><img src="${board1}"><div class="mb-tag">${esc(T("mb_style"))} · ${esc(T("st_"+s1.v))}</div></div>
      <div class="mb-cell mb-style2">${cell2}</div>
      <div class="mb-cell mb-pal">${chips}</div>
      ${small}
    </div>
    <div class="mb-summary"><b>${esc(T("mb_summary"))}:</b> ${esc(T("mb_style"))} — ${esc(styleNames)} · ${esc(T("mb_palette"))} — ${esc(palNames)}</div>
    <div class="mb-foot"><span>${esc(CONFIG.BRAND_NAME)} · ${esc(T("ui_brandSub"))}</span><span>${esc(today)}</span></div>
  </div>`;
}

function answersText() {
  const steps = buildSteps(D);
  let out = [];
  steps.filter(s=>s.qs).forEach(s => {
    const title = s.titleRaw ? s.titleRaw() : T(s.title);
    out.push("\n═══ " + title + " ═══");
    s.qs.filter(q=>!q.show||q.show(D)).forEach(q => out.push(T(q.l) + ": " + fmtVal(q, D)));
  });
  return out.join("\n");
}

let sendState = "idle";
async function submitAnswers() {
  const keyOk = CONFIG.WEB3FORMS_KEY && !/YOUR_WEB3FORMS/.test(CONFIG.WEB3FORMS_KEY);
  if (!keyOk) { sendState = "fail"; return; }
  sendState = "sending";
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method:"POST", headers:{ "Content-Type":"application/json", Accept:"application/json" },
      body: JSON.stringify({
        access_key: CONFIG.WEB3FORMS_KEY,
        subject: T("e_subject").replace("{name}", D.g_name||""),
        from_name: D.g_name || "Questionnaire",
        email: D.g_email || "",
        phone: D.g_phone || "",
        message: answersText()
      })
    });
    const j = await res.json();
    sendState = j.success ? "ok" : "fail";
  } catch (e) { sendState = "fail"; }
}

function renderFinal() {
  $("#navbar").style.display = "none";
  $("#progressWrap").style.display = "none";
  const statusHtml = {
    idle:"", sending:`<div class="sending">${T("ui_sending")}</div>`,
    ok:`<div class="sending send-ok">${T("ui_sendOk")}</div>`,
    fail:`<div class="sending send-fail">${T("ui_sendFail")} <button class="btn ghost" id="btnRetry" style="padding:6px 16px;margin-left:8px">${T("ui_retry")}</button></div>`
  }[sendState];
  stage.innerHTML = `<div class="welcome" style="padding-bottom:6px">
      <div class="wl-kicker">✦</div>
      <h1>${esc(T("ui_thanks"))}</h1><p>${esc(T("ui_thanksText"))}</p></div>
    ${statusHtml}
    ${moodboardHtml()}
    <div class="finale-actions">
      <button class="btn primary" id="btnPdf">${esc(T("ui_pdf"))}</button>
      <button class="btn ghost" id="btnRestart">${esc(T("ui_restart"))}</button>
    </div>`;
  $("#btnPdf").onclick = downloadPdf;
  $("#btnRestart").onclick = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
  const r = $("#btnRetry");
  if (r) r.onclick = async () => { await submitAnswers(); renderFinal(); };
}

async function downloadPdf() {
  const el = $("#moodboard");
  const canvas = await html2canvas(el, { scale:2, useCORS:true, backgroundColor:"#fbf9f5" });
  const img = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jspdf.jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const ratio = canvas.height / canvas.width;
  let w = pw - 20, h = w * ratio;
  if (h > ph - 20) { h = ph - 20; w = h / ratio; }
  pdf.addImage(img, "JPEG", (pw-w)/2, (ph-h)/2, w, h);
  pdf.save(`moodboard-${(D.g_name||"client").replace(/\s+/g,"_")}.pdf`);
}

/* ---------- events ---------- */
stage.addEventListener("input", e => {
  const id = e.target.dataset.inp;
  if (id) { D[id] = e.target.value; save(); }
});

stage.addEventListener("click", e => {
  const zoomEl = e.target.closest("[data-zoom]");
  if (zoomEl) {
    e.stopPropagation();
    lightGallery = JSON.parse(zoomEl.dataset.zoom);
    lightIdx = 0;
    openLightbox(zoomEl.dataset.cap || "");
    return;
  }
  const goto = e.target.closest("[data-goto]");
  if (goto) { state.step = parseInt(goto.dataset.goto,10); save(); renderStep(); window.scrollTo(0,0); return; }

  const numBtn = e.target.closest("[data-num]");
  if (numBtn) {
    const steps = buildSteps(D), st = steps[state.step];
    const q = st.qs.find(q => q.id === numBtn.dataset.num);
    let val = (D[q.id] ?? q.min) + parseInt(numBtn.dataset.d,10);
    val = Math.min(Math.max(val, q.min), q.max);
    D[q.id] = val; save();
    renderStepPreserveScroll();   // re-render so number-driven conditionals appear
    return;
  }
  const pick = e.target.closest("[data-pick]");
  if (pick) {
    const id = pick.dataset.pick, v = pick.dataset.v, multi = pick.dataset.multi === "1";
    const steps = buildSteps(D), st = steps[state.step];
    const q = (st.qs||[]).find(q => q.id === id);
    if (multi) {
      let cur = Array.isArray(D[id]) ? [...D[id]] : [];
      const noneV = q && q.none;
      if (cur.includes(v)) cur = cur.filter(x => x !== v);
      else {
        if (noneV && v === noneV) cur = [v];
        else {
          if (noneV) cur = cur.filter(x => x !== noneV);
          const max = q && (q.max || (q.exactFn && q.exactFn(D)));
          if (max && cur.length >= max) {
            if (q.max) cur = cur.slice(0, max - 1);          // replace oldest for max-2 pickers
            else { flashHint(T("ui_pickN", max)); return; }  // hard cap for exact-count
          }
          cur.push(v);
        }
      }
      D[id] = cur;
    } else {
      D[id] = (D[id] === v && !(q&&q.req)) ? undefined : v;
    }
    save(); renderStepPreserveScroll();
  }
});

function flashHint(msg) {
  const h = $("#navHint"); h.textContent = msg;
  setTimeout(() => { if (h.textContent === msg) h.textContent = ""; }, 2500);
}

function renderStepPreserveScroll() {
  const y = window.scrollY;
  renderStep();
  window.scrollTo(0, y);
}

$("#btnBack").onclick = () => { if (state.step > 1) { state.step--; save(); renderStep(); window.scrollTo(0,0); } };
$("#btnNext").onclick = async () => {
  const steps = buildSteps(D);
  const st = steps[state.step];
  if (st.type === "review") {
    state.step++; save(); renderStep(); window.scrollTo(0,0);
    submitAnswers().then(renderFinal);
    return;
  }
  if (!validateStep()) return;
  state.step++; save(); renderStep(); window.scrollTo(0,0);
};

/* ---------- lightbox ---------- */
const lb = $("#lightbox");
function openLightbox(cap) {
  lb.hidden = false;
  updateLb(cap);
  document.body.style.overflow = "hidden";
}
function updateLb(cap) {
  $("#lbImg").src = lightGallery[lightIdx];
  $("#lbCaption").textContent = (cap||$("#lbCaption").dataset.cap||"") + (lightGallery.length>1 ? `  ·  ${lightIdx+1}/${lightGallery.length}` : "");
  if (cap) $("#lbCaption").dataset.cap = cap;
  $("#lbPrev").style.display = $("#lbNext").style.display = lightGallery.length>1 ? "block" : "none";
}
$("#lbClose").onclick = () => { lb.hidden = true; document.body.style.overflow = ""; };
lb.addEventListener("click", e => { if (e.target === lb) $("#lbClose").onclick(); });
$("#lbPrev").onclick = () => { lightIdx = (lightIdx-1+lightGallery.length)%lightGallery.length; updateLb(); };
$("#lbNext").onclick = () => { lightIdx = (lightIdx+1)%lightGallery.length; updateLb(); };
document.addEventListener("keydown", e => {
  if (lb.hidden) return;
  if (e.key === "Escape") $("#lbClose").onclick();
  if (e.key === "ArrowLeft") $("#lbPrev").onclick();
  if (e.key === "ArrowRight") $("#lbNext").onclick();
});

/* ---------- language ---------- */
function setLang(l) {
  state.lang = l; save();
  document.documentElement.lang = l === "ge" ? "ka" : l;
  document.querySelectorAll("#langSwitch button").forEach(b => b.classList.toggle("active", b.dataset.lang === l));
  $("#brandSub").textContent = T("ui_brandSub");
  renderStepPreserveScroll();
}
document.querySelectorAll("#langSwitch button").forEach(b => b.onclick = () => setLang(b.dataset.lang));

/* ---------- init ---------- */
$("#brandName").textConten
