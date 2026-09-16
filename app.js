if ('caches' in window) {
  caches.keys().then(keys => keys.forEach(k => { if (k !== 'caloriasfit-v15' && k !== 'soto-v1') caches.delete(k); }));
}

const DEFAULT_FOODS = {
  "Fruta":          { kcal:60,  carbs:15, protein:0, fat:0,  icon:"🍎" },
  "Vegetal":        { kcal:25,  carbs:5,  protein:2, fat:0,  icon:"🥦" },
  "Carbohidrato":   { kcal:80,  carbs:15, protein:1, fat:2,  icon:"🍚" },
  "Proteína Magra": { kcal:45,  carbs:0,  protein:7, fat:2,  icon:"🐔" },
  "Proteína Media": { kcal:75,  carbs:0,  protein:7, fat:5,  icon:"🥩" },
  "Grasa":          { kcal:45,  carbs:0,  protein:0, fat:5,  icon:"🥑" },
  "Fruto Seco":     { kcal:180, carbs:7,  protein:5, fat:15, icon:"🥜" },
  "Lácteo":         { kcal:100, carbs:12, protein:8, fat:2,  icon:"🥛" }
};
const DEFAULT_MEALS = ["Preentreno","Desayuno","Merienda Mañana","Almuerzo","Merienda Tarde","Cena"];
const DEFAULT_MEAL_TIMES = ["08:00","11:00","14:00","17:30","21:00","22:00"];
const DEFAULT_GROUPS = { "Fruta":3,"Vegetal":4,"Carbohidrato":6,"Proteína Magra":4,"Proteína Media":2,"Grasa":3,"Fruto Seco":1,"Lácteo":2 };
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

let dataStore = JSON.parse(localStorage.getItem("nutritionData")) || {};
let weightData = JSON.parse(localStorage.getItem("weightData")) || {};
let customFoods = JSON.parse(localStorage.getItem("customFoods")) || {};
let myMeals = JSON.parse(localStorage.getItem("myMeals")) || {};
let meals = JSON.parse(localStorage.getItem("mealsConfig")) || DEFAULT_MEALS.slice();
let foodUsage = JSON.parse(localStorage.getItem("foodUsage")) || {};
let miniDbOverrides = JSON.parse(localStorage.getItem("miniDbOverrides")) || {};
const savedGoals = JSON.parse(localStorage.getItem("planGoals") || "null") || {};

let migrated = false;
for (const d in dataStore){
  if (dataStore[d].water != null && dataStore[d].water < 40){ dataStore[d].waterMl = dataStore[d].water * 250; delete dataStore[d].water; migrated = true; }
}
if (migrated) localStorage.setItem("nutritionData", JSON.stringify(dataStore));

let goals = Object.assign({
  kcal: 2000, waterMl: 2000, reminders: false, theme: "auto",
  split: { c:40, p:30, f:30 },
  groups: Object.assign({}, DEFAULT_GROUPS)
}, savedGoals);
goals.groups = Object.assign({}, DEFAULT_GROUPS, (savedGoals||{}).groups || {});
if (!goals.split) goals.split = { c:40, p:30, f:30 };
if (savedGoals.water && !savedGoals.waterMl) goals.waterMl = savedGoals.water < 40 ? savedGoals.water*250 : savedGoals.water;

const foods = {};
for (const k in DEFAULT_FOODS) foods[k] = Object.assign({}, DEFAULT_FOODS[k]);

let chart = null, weightChart = null;

const datePicker = document.getElementById("datePicker");
function getDS(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
datePicker.value = getDS(new Date());
document.getElementById("topDate").textContent = new Date().toLocaleDateString("es", { weekday:"long", day:"numeric", month:"long" });

function applyTheme(){
  document.documentElement.setAttribute("data-theme", goals.theme || "auto");
  document.querySelectorAll("#themeRow .pill").forEach(b=>b.classList.toggle("on", b.dataset.th === (goals.theme||"auto")));
}
applyTheme();
document.querySelectorAll("#themeRow .pill").forEach(b=>{ b.onclick = ()=>{ goals.theme = b.dataset.th; saveGoals(); applyTheme(); }; });

function haptic(){ if (navigator.vibrate) navigator.vibrate(8); }
function save(){ localStorage.setItem("nutritionData", JSON.stringify(dataStore)); }
function saveGoals(){ localStorage.setItem("planGoals", JSON.stringify(goals)); }
function saveCustomFoods(){ localStorage.setItem("customFoods", JSON.stringify(customFoods)); }
function saveMyMeals(){ localStorage.setItem("myMeals", JSON.stringify(myMeals)); }
function saveMeals(){ localStorage.setItem("mealsConfig", JSON.stringify(meals)); }
function saveUsage(){ localStorage.setItem("foodUsage", JSON.stringify(foodUsage)); }
function saveMiniDbOverrides(){ localStorage.setItem("miniDbOverrides", JSON.stringify(miniDbOverrides)); }
function effectiveMiniFoods(){
  const base = (typeof MINI_FOODS !== "undefined") ? MINI_FOODS : {};
  const out = {};
  for (const id in base) out[id] = Object.assign({}, base[id]);
  for (const id in miniDbOverrides){
    const o = miniDbOverrides[id];
    if (o.deleted) { delete out[id]; continue; }
    out[id] = { name: o.name, per100: Object.assign({}, o.per100) };
  }
  return out;
}
function allRealFoods(){ return Object.assign({}, effectiveMiniFoods(), customFoods); }
function round1(n){ return Math.round(n*10)/10; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function normalizeText(s){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function matchesQuery(text, query){
  const t = normalizeText(text);
  const words = normalizeText(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every(w => t.includes(w));
}

/* ---------- ICONOS (badges de color estilo Apple Health) ---------- */
const ICON_PATHS = {
  apple:      `<circle cx="12" cy="13.5" r="6.5"/><path d="M12 7c0-1.2.8-2.2 2-2.5"/>`,
  leaf:       `<path d="M11 20A7 7 0 0 1 4 13c0-4 3-7 7-7 1 0 2 .2 2.8.6C15 4 17 3 19 3c0 3-1.5 5-3.6 6.1A7 7 0 0 1 11 20z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>`,
  bowl:       `<path d="M4 12h16"/><path d="M5 12a7 7 0 0 0 14 0"/><path d="M12 4v4"/>`,
  drumstick:  `<path d="M15.6 8.4a4.24 4.24 0 1 0-6-6 8.5 8.5 0 0 0-2.46 7.24c.13.96-.22 1.94-.94 2.67l-1.65 1.65a3.54 3.54 0 1 0 5 5l1.65-1.65c.72-.72 1.71-1.07 2.67-.94a8.5 8.5 0 0 0 7.24-2.46 4.24 4.24 0 1 0-6-6"/>`,
  droplet:    `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>`,
  acorn:      `<path d="M12 3c3 0 5 2 5 5 0 1-.3 2-1 3l-4 8-4-8c-.7-1-1-2-1-3 0-3 2-5 5-5Z"/><path d="M8 8h8"/>`,
  milk:       `<path d="M9 2h6"/><path d="M9 2v3.3a2 2 0 0 1-.6 1.4L7 8.3A2 2 0 0 0 6.4 9.7V20a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1V9.7a2 2 0 0 0-.6-1.4l-1.4-1.6a2 2 0 0 1-.6-1.4V2"/>`,
  star:       `<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>`,
  plate:      `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>`,
  search:     `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>`,
  basket:     `<path d="M4 10h16l-1.5 9a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 10Z"/><path d="M8 10 12 4l4 6"/>`,
  scale:      `<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`,
  calendar:   `<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M8 3v4M16 3v4"/>`,
  database:   `<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>`,
  globe:      `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9Z"/>`,
  package:    `<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>`,
  signal:     `<path d="M2 12a15 15 0 0 1 20 0"/><path d="M5 15.5a10 10 0 0 1 14 0"/><path d="M8.5 19a5 5 0 0 1 7 0"/><circle cx="12" cy="22" r="1"/>`
};
const GROUP_META = {
  "Fruta":          { color:"#FF3B30", emoji:"🍎" },
  "Vegetal":        { color:"#34C759", emoji:"🥦" },
  "Carbohidrato":   { color:"#FF9500", emoji:"🍚" },
  "Proteína Magra": { color:"#0A84FF", emoji:"🐔" },
  "Proteína Media": { color:"#5E5CE6", emoji:"🥩" },
  "Grasa":          { color:"#D4A017", emoji:"🥑" },
  "Fruto Seco":     { color:"#A2703A", emoji:"🥜" },
  "Lácteo":         { color:"#0091C2", emoji:"🥛" }
};
function hexToRgba(hex, a){
  const h = hex.replace("#","");
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}
function iconSvg(name){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]||""}</svg>`;
}
function groupIconHTML(name, size){
  const meta = GROUP_META[name];
  if (!meta) return "";
  const cls = size === "sm" ? "grp-badge sm" : "grp-badge";
  return `<span class="${cls}" style="--ic-bg:${hexToRgba(meta.color,0.14)}">${meta.emoji}</span>`;
}
function emptyIconHTML(name){
  return `<span class="e-ico">${iconSvg(name)}</span>`;
}

/* ---------- SNACKBAR ---------- */
let snackTimer = null;
function snack(msg, actionLabel, onAction){
  const el = document.getElementById("snack");
  el.querySelector(".snack-msg").textContent = msg;
  const btn = el.querySelector(".snack-act");
  if (actionLabel){ btn.style.display = "inline"; btn.textContent = actionLabel; btn.onclick = ()=>{ hideSnack(); onAction && onAction(); }; }
  else { btn.style.display = "none"; btn.onclick = null; }
  el.classList.add("show");
  clearTimeout(snackTimer); snackTimer = setTimeout(hideSnack, 5000);
}
function hideSnack(){ document.getElementById("snack").classList.remove("show"); }

/* ---------- ONBOARDING ---------- */
(function(){
  if (localStorage.getItem("onboarded")) return;
  const onb = document.getElementById("onb");
  onb.classList.add("show");
  let i = 0;
  const slides = onb.querySelectorAll(".onb-slide");
  const dots = onb.querySelectorAll(".onb-dots span");
  const next = document.getElementById("onbNext");
  function go(n){ i = n; slides.forEach((s,k)=>s.classList.toggle("on", k===i)); dots.forEach((d,k)=>d.classList.toggle("on", k===i)); next.textContent = i===2 ? "Comenzar" : "Siguiente"; }
  next.onclick = ()=>{ if (i<2) go(i+1); else finish(); };
  document.getElementById("onbSkip").onclick = finish;
  function finish(){ localStorage.setItem("onboarded","1"); onb.classList.remove("show"); }
})();

/* ---------- TABS ---------- */
const VIEWS = { reg:"viewRegistro", pro:"viewProgreso", ges:"viewGestion", base:"viewBase", aj:"viewAjustes" };
const TB = { reg:"tbRegistro", pro:"tbProgreso", ges:"tbGestion", base:"tbBase", aj:"tbAjustes" };
function showView(v){
  for (const k in VIEWS){ document.getElementById(VIEWS[k]).style.display = (k===v) ? "block" : "none"; document.getElementById(TB[k]).setAttribute("aria-selected", k===v); }
  for (const k in TB) document.getElementById(TB[k]).classList.toggle("on", k===v);
  if (v==="ges"){ renderMyFoods(); renderTemplatesInline(); }
  if (v==="pro"){ updateChart(); updateWeight(); updateHistory(); updateMicros(); }
  if (v==="base"){ renderBaseList(); }
  window.scrollTo(0,0);
}
document.getElementById("tbRegistro").onclick = ()=> showView("reg");
document.getElementById("tbProgreso").onclick = ()=> showView("pro");
document.getElementById("tbGestion").onclick = ()=> showView("ges");
document.getElementById("tbBase").onclick = ()=> showView("base");
document.getElementById("tbAjustes").onclick = ()=> showView("aj");

/* ---------- ANILLOS ---------- */
let ringGradSeq = 0;
function createRing(size, stroke, colorA, colorB){
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gradId = "ringGrad" + (ringGradSeq++);

  const defs = document.createElementNS(ns, "defs");
  const grad = document.createElementNS(ns, "linearGradient");
  grad.setAttribute("id", gradId);
  grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0%");
  grad.setAttribute("x2", "100%"); grad.setAttribute("y2", "100%");
  const stop1 = document.createElementNS(ns, "stop"); stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", colorA);
  const stop2 = document.createElementNS(ns, "stop"); stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", colorB);
  grad.appendChild(stop1); grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", size/2); track.setAttribute("cy", size/2); track.setAttribute("r", r);
  track.setAttribute("fill", "none"); track.setAttribute("stroke", hexToRgba(colorB, 0.15)); track.setAttribute("stroke-width", stroke);
  const prog = document.createElementNS(ns, "circle");
  prog.setAttribute("cx", size/2); prog.setAttribute("cy", size/2); prog.setAttribute("r", r);
  prog.setAttribute("fill", "none"); prog.setAttribute("stroke", "url(#" + gradId + ")"); prog.setAttribute("stroke-width", stroke);
  prog.setAttribute("stroke-linecap", "round");
  prog.setAttribute("stroke-dasharray", c);
  prog.setAttribute("stroke-dashoffset", c);
  prog.setAttribute("transform", "rotate(-90 " + size/2 + " " + size/2 + ")");
  prog.style.transition = "stroke-dashoffset .7s cubic-bezier(.34,1.56,.64,1)";
  svg.appendChild(track); svg.appendChild(prog);
  return { svg, set(p){ prog.style.strokeDashoffset = c * (1 - Math.min(p, 1)); } };
}
const kcalRing = createRing(150, 14, "#6EE7A0", "#16A34A");
document.getElementById("bigRing").prepend(kcalRing.svg);

function animateNumber(el, to){
  const from = parseInt(el.dataset.val || "0");
  el.dataset.val = to;
  const start = performance.now(), dur = 550;
  function easeOutBack(x){
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
  function frame(t){
    const p = Math.min((t - start) / dur, 1);
    const e = easeOutBack(p);
    el.textContent = Math.max(0, Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = to;
  }
  requestAnimationFrame(frame);
}

function updateTopHeader(){
  const el = document.getElementById("topGreeting");
  const pill = document.getElementById("topStatPill");
  if (!el || !pill) return;
  const hour = new Date().getHours();
  el.textContent = hour < 12 ? "Buenos días ☀️" : hour < 19 ? "Buenas tardes 🌤️" : "Buenas noches 🌙";
  const t = dayTotals(datePicker.value);
  const remaining = goals.kcal - t.k;
  pill.innerHTML = remaining >= 0 ? `🔥 ${remaining} kcal libres` : `🔥 ${Math.abs(remaining)} kcal de más`;
}

/* ---------- CÁLCULOS ---------- */
function mealTotals(date, meal){
  let k=0,c=0,p=0,f=0;
  if(dataStore[date] && dataStore[date][meal]){
    const m = dataStore[date][meal];
    for(const fn in foods){
      const q = m[fn]||0;
      k += q*foods[fn].kcal; c += q*foods[fn].carbs; p += q*foods[fn].protein; f += q*foods[fn].fat;
    }
    const cust = m.custom || {};
    const all = allRealFoods();
    for(const id in cust){
      const fd = all[id]; if(!fd) continue;
      const g = cust[id];
      k += fd.per100.kcal*g/100; c += fd.per100.carbs*g/100; p += fd.per100.protein*g/100; f += fd.per100.fat*g/100;
    }
  }
  return {k:Math.round(k), c:Math.round(c), p:Math.round(p), f:Math.round(f)};
}
function dayTotals(date){
  let k=0,c=0,p=0,f=0;
  meals.forEach(m=>{ const t=mealTotals(date,m); k+=t.k; c+=t.c; p+=t.p; f+=t.f; });
  return {k,c,p,f};
}
function dayMicros(date){
  let fiber=0,sugar=0,sodium=0,potassium=0;
  meals.forEach(meal=>{
    const cust = ((dataStore[date]||{})[meal]||{}).custom || {};
    const all = allRealFoods();
    for(const id in cust){
      const f = all[id]; if(!f || !f.micros) continue;
      const g = cust[id];
      fiber += (f.micros.fiber||0)*g/100; sugar += (f.micros.sugar||0)*g/100;
      sodium += (f.micros.sodium||0)*g/100; potassium += (f.micros.potassium||0)*g/100;
    }
  });
  return { fiber:Math.round(fiber), sugar:Math.round(sugar), sodium:Math.round(sodium), potassium:Math.round(potassium) };
}
function calcStats(){
  let streak = 0;
  const d = new Date();
  if (dayTotals(getDS(d)).k === 0) d.setDate(d.getDate()-1);
  while (dayTotals(getDS(d)).k > 0){ streak++; d.setDate(d.getDate()-1); }
  let sum = 0, on = 0;
  for(let i=0;i<7;i++){
    const k = dayTotals(getDS(addDays(new Date(),-i))).k;
    sum += k;
    if (k >= goals.kcal*0.9 && k <= goals.kcal*1.1) on++;
  }
  return { streak, avg: Math.round(sum/7), adherence: Math.round(on/7*100) };
}

function editInline(span, current, commit){
  const inp = document.createElement("input");
  inp.type = "number"; inp.className = "grams-input"; inp.value = current;
  span.replaceWith(inp); inp.focus(); inp.select();
  const done = ()=>{ const v = Math.max(0, Math.round(parseFloat(inp.value)||0)); inp.replaceWith(span); commit(v); };
  inp.onblur = done;
  inp.onkeydown = (e)=>{ if(e.key==="Enter") inp.blur(); };
}

/* ---------- RENDER ---------- */
const MEAL_STRIPE_COLORS = ["#FFB020", "#FF9F0A", "#FF6B6B", "#8B5CF6", "#3B82F6", "#0EA5A5", "#EC4899"];
function render(){
  const date = datePicker.value;
  if(!dataStore[date]) dataStore[date]={};
  const container = document.getElementById("meals");
  container.innerHTML = "";

  meals.forEach((meal, mealIdx) => {
    if(!dataStore[date][meal]) dataStore[date][meal]={};
    const t = mealTotals(date, meal);
    const mealDiv = document.createElement("div");
    mealDiv.className = "meal";
    mealDiv.style.borderLeftWidth = "4px";
    mealDiv.style.borderLeftColor = MEAL_STRIPE_COLORS[mealIdx % MEAL_STRIPE_COLORS.length];
    const header = document.createElement("div");
    header.className = "meal-header";
    header.innerHTML = `
      <span class="meal-left">${escapeHtml(meal)}</span>
      <div class="meal-right">
        <div class="meal-kcal">${t.k} kcal</div>
        <div class="meal-macros">C:${t.c}g P:${t.p}g G:${t.f}g</div>
      </div>
      <svg class="chevron" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    header.onclick = ()=> mealDiv.classList.toggle("active");

    const content = document.createElement("div");
    content.className = "meal-content";

    const modes = document.createElement("div");
    modes.className = "meal-modes";
    const seg = document.createElement("div");
    seg.className = "seg-track";
    const thumb = document.createElement("div");
    thumb.className = "seg-thumb";
    seg.appendChild(thumb);
    const positionThumb = (btn)=>{ thumb.style.width = btn.offsetWidth + "px"; thumb.style.left = btn.offsetLeft + "px"; };
    const views = {};
    const labels = { groups:"Grupos", foods:"Alimentos", meals:"Comidas" };
    let firstChip = null;
    for (const mode in labels){
      const b = document.createElement("button");
      b.className = "mchip" + (mode==="groups" ? " on" : "");
      b.textContent = labels[mode];
      b.onclick = ()=>{
        seg.querySelectorAll(".mchip").forEach(x=>x.classList.remove("on"));
        b.classList.add("on");
        for (const k in views) views[k].style.display = (k===mode) ? "block" : "none";
        positionThumb(b);
      };
      seg.appendChild(b);
      if (!firstChip) firstChip = b;
    }
    modes.appendChild(seg);
    content.appendChild(modes);
    requestAnimationFrame(()=> positionThumb(firstChip));

    const gv = document.createElement("div");
    for(const fn in foods){
      const qty = dataStore[date][meal][fn]||0;
      const row = document.createElement("div");
      row.className = "food-row";
      row.innerHTML = `
        <span class="food-name">${groupIconHTML(fn)}${fn} <span class="info">ⓘ</span></span>
        <div class="controls"><button aria-label="Restar ${fn}">−</button><span class="qty">${qty}</span><button aria-label="Sumar ${fn}">+</button></div>`;
      const btns = row.querySelectorAll(".controls button");
      const qtySpan = row.querySelector(".qty");
      row.querySelector(".food-name").onclick = ()=> openGuide(fn);
      btns[0].onclick = ()=> changeQty(date, meal, fn, -1, qtySpan, header);
      btns[1].onclick = ()=> changeQty(date, meal, fn,  1, qtySpan, header);
      gv.appendChild(row);
    }
    views.groups = gv; content.appendChild(gv);

    const fv = document.createElement("div");
    fv.style.display = "none";
    const cust = dataStore[date][meal].custom || {};
    const all = allRealFoods();
    Object.keys(cust).forEach(id => {
      const fd = all[id]; if(!fd) return;
      const g = cust[id];
      const row = document.createElement("div");
      row.className = "food-row";
      row.innerHTML = `
        <span class="food-name">🍽 ${escapeHtml(fd.name)} <span class="info">· ${Math.round(fd.per100.kcal*g/100)} kcal</span></span>
        <div class="controls"><button aria-label="Menos">−</button><span class="qty">${g}g</span><button aria-label="Más">+</button></div>
        <button class="del-btn" aria-label="Quitar ${escapeHtml(fd.name)}">×</button>`;
      const btns = row.querySelectorAll(".controls button");
      const qtySpan = row.querySelector(".qty");
      btns[0].onclick = ()=>{ changeCustom(date, meal, id, -5); };
      btns[1].onclick = ()=>{ changeCustom(date, meal, id,  5); };
      qtySpan.onclick = ()=>{ editInline(qtySpan, g, (v)=>{ setCustom(date, meal, id, v); }); };
      row.querySelector(".del-btn").onclick = ()=>{
        const prev = dataStore[date][meal].custom[id];
        delete dataStore[date][meal].custom[id];
        if (!Object.keys(dataStore[date][meal].custom).length) delete dataStore[date][meal].custom;
        save(); render();
        snack("Porción eliminada", "Deshacer", ()=>{
          const m = dataStore[date][meal]; if(!m.custom) m.custom = {};
          m.custom[id] = prev; save(); render();
        });
      };
      fv.appendChild(row);
    });
    const addRow = document.createElement("div");
    addRow.className = "row-action";
    addRow.innerHTML = `<span>＋ Agregar alimento</span><span>›</span>`;
    addRow.onclick = ()=> openFoodSheet(meal);
    fv.appendChild(addRow);
    views.foods = fv; content.appendChild(fv);

    const mv = document.createElement("div");
    mv.style.display = "none";
    const tIds = Object.keys(myMeals);
    if (!tIds.length){
      mv.innerHTML = `<div class="empty">${emptyIconHTML("star")}<p>Registra esta comida y guárdala como plantilla para repetirla en 1 toque.</p></div>`;
    }
    tIds.forEach(id=>{
      const row = document.createElement("div");
      row.className = "row-action";
      row.innerHTML = `<span>⭐ ${escapeHtml(myMeals[id].name)}</span><span>＋</span>`;
      row.onclick = ()=>{ useTemplateFor(date, meal, id); };
      mv.appendChild(row);
    });
    const saveRow = document.createElement("div");
    saveRow.className = "row-action";
    saveRow.innerHTML = `<span>💾 Guardar esta comida como plantilla</span>`;
    saveRow.onclick = ()=> saveTemplate(date, meal);
    mv.appendChild(saveRow);
    views.meals = mv; content.appendChild(mv);

    mealDiv.appendChild(header);
    mealDiv.appendChild(content);
    container.appendChild(mealDiv);
  });

  updateStats(); updateGroups(); updateWater(); updateWeight(); updateHistory(); updateMicros(); updateSummary(); updateChart(); updateTopHeader();
  checkPattern();
}

function changeQty(date, meal, food, amt, qtySpan, header){
  if(!dataStore[date]) dataStore[date]={};
  if(!dataStore[date][meal]) dataStore[date][meal]={};
  dataStore[date][meal][food] = Math.max(0,(dataStore[date][meal][food]||0)+amt);
  save(); haptic();
  qtySpan.textContent = dataStore[date][meal][food];
  const t = mealTotals(date, meal);
  header.querySelector(".meal-kcal").textContent = t.k + " kcal";
  header.querySelector(".meal-macros").textContent = `C:${t.c}g P:${t.p}g G:${t.f}g`;
  updateStats(); updateGroups(); updateHistory(); updateMicros(); updateSummary(); updateChart(); updateTopHeader();
}
function changeCustom(date, meal, id, amt){
  const m = dataStore[date][meal];
  if(!m.custom) m.custom = {};
  m.custom[id] = Math.max(5, (m.custom[id]||0) + amt);
  save(); haptic(); render();
}
function setCustom(date, meal, id, v){
  const m = dataStore[date][meal];
  if(!m.custom) m.custom = {};
  if (v <= 0) delete m.custom[id]; else m.custom[id] = v;
  if (!Object.keys(m.custom).length) delete m.custom;
  save(); haptic(); render();
}

/* ---------- PATRONES ---------- */
function signature(date, meal){
  const m = (dataStore[date]||{})[meal]; if(!m) return null;
  const g = {}; for(const fn in foods) if(m[fn]>0) g[fn]=m[fn];
  const c = m.custom || {};
  if (!Object.keys(g).length && !Object.keys(c).length) return null;
  return JSON.stringify({g,c});
}
function checkPattern(){
  if (datePicker.value !== getDS(new Date())) return;
  const suggested = JSON.parse(localStorage.getItem("suggested") || "{}");
  for (const meal of meals){
    const s1 = signature(getDS(addDays(new Date(),-1)), meal);
    if (!s1) continue;
    const s2 = signature(getDS(addDays(new Date(),-2)), meal);
    const s3 = signature(getDS(addDays(new Date(),-3)), meal);
    const key = meal + "|" + s1;
    if (s1===s2 && s1===s3 && !suggested[key]){
      suggested[key] = 1;
      localStorage.setItem("suggested", JSON.stringify(suggested));
      snack("🔁 Repetiste “"+meal+"” 3 días seguidos", "Guardar plantilla", ()=>{
        templateFromMeal(getDS(addDays(new Date(),-1)), meal, meal + " habitual");
        snack("Plantilla ⭐ creada");
      });
      return;
    }
  }
}
function templateFromMeal(date, meal, name){
  const m = dataStore[date][meal];
  const groups = {};
  for (const g in foods) if (m[g] > 0) groups[g] = m[g];
  myMeals["t" + Date.now()] = { name, groups, custom: Object.assign({}, m.custom||{}) };
  saveMyMeals(); render();
}

/* ---------- PICKER + FRECUENTES ---------- */
let foodTargetMeal = null, addFoodId = null, addGrams = 100;
const foodSheet = document.getElementById("foodSheet");
function openFoodSheet(meal){
  foodTargetMeal = meal;
  showFoodView("list");
  document.getElementById("foodSearch").value = "";
  renderFoodList();
  foodSheet.classList.add("open"); backdrop.classList.add("open");
}
function showFoodView(v){
  document.getElementById("foodListView").style.display = v==="list" ? "block" : "none";
  document.getElementById("foodAddView").style.display = v==="add" ? "block" : "none";
}
function renderFoodList(){
  const q = (document.getElementById("foodSearch").value||"").trim().toLowerCase();
  const list = document.getElementById("foodList");
  const all = allRealFoods();
  list.innerHTML = "";
  const paint = (id)=>{
    const f = all[id];
    const el = document.createElement("div");
    el.className = "flist-item";
    el.innerHTML = `<span>${escapeHtml(f.name)}${customFoods[id]?" ✏️":""}</span><span class="m">${Math.round(f.per100.kcal)} kcal/100g</span>`;
    el.onclick = ()=> openAddView(id);
    list.appendChild(el);
  };
  if (!q){
    const top = Object.keys(foodUsage).sort((a,b)=>foodUsage[b]-foodUsage[a]).filter(id=>all[id]).slice(0,5);
    if (top.length){
      const h = document.createElement("div"); h.className = "gsub"; h.textContent = "⭐ Frecuentes"; list.appendChild(h);
      top.forEach(paint);
      const h2 = document.createElement("div"); h2.className = "hint"; h2.textContent = "Escribe para buscar más…"; list.appendChild(h2);
    } else {
      list.innerHTML = `<div class="empty">${emptyIconHTML("plate")}<p>Escribe para buscar en tu base y la mini-DB.</p></div>`;
    }
    return;
  }
  const matches = Object.keys(all).filter(id => matchesQuery(all[id].name, q));
  if (!matches.length){ list.innerHTML = `<div class="empty">${emptyIconHTML("search")}<p>Sin resultados. Créalo en 🗂 Gestión.</p></div>`; return; }
  matches.forEach(paint);
}
document.getElementById("foodSearch").oninput = renderFoodList;
document.getElementById("addBackBtn").onclick = ()=>{ showFoodView("list"); renderFoodList(); };
function openAddView(id){ addFoodId = id; addGrams = 100; updateAddView(); showFoodView("add"); }
function updateAddView(){
  const f = allRealFoods()[addFoodId]; if(!f) return;
  document.getElementById("addFoodName").textContent = f.name;
  document.getElementById("gVal").textContent = addGrams + " g";
  const m = f.per100;
  let txt = `Por ${addGrams} g: ${Math.round(m.kcal*addGrams/100)} kcal · C ${round1(m.carbs*addGrams/100)} g · P ${round1(m.protein*addGrams/100)} g · G ${round1(m.fat*addGrams/100)} g`;
  if (f.micros){
    const mm = [];
    if (f.micros.fiber) mm.push("Fibra " + round1(f.micros.fiber*addGrams/100) + " g");
    if (f.micros.sugar) mm.push("Azúcar " + round1(f.micros.sugar*addGrams/100) + " g");
    if (f.micros.sodium) mm.push("Sodio " + Math.round(f.micros.sodium*addGrams/100) + " mg");
    if (f.micros.potassium) mm.push("Potasio " + Math.round(f.micros.potassium*addGrams/100) + " mg");
    if (mm.length) txt += "<br>" + mm.join(" · ");
  }
  document.getElementById("addFoodMacros").innerHTML = txt;
}
document.getElementById("gMinus").onclick = ()=>{ addGrams = Math.max(5, addGrams-5); updateAddView(); };
document.getElementById("gPlus").onclick = ()=>{ addGrams = addGrams+5; updateAddView(); };
document.getElementById("gVal").onclick = ()=>{ editInline(document.getElementById("gVal"), addGrams, (v)=>{ addGrams = Math.max(5, v||5); updateAddView(); }); };
document.getElementById("addConfirmBtn").onclick = ()=>{
  const date = datePicker.value;
  if(!dataStore[date]) dataStore[date]={};
  if(!dataStore[date][foodTargetMeal]) dataStore[date][foodTargetMeal]={};
  const m = dataStore[date][foodTargetMeal];
  if(!m.custom) m.custom = {};
  m.custom[addFoodId] = (m.custom[addFoodId]||0) + addGrams;
  foodUsage[addFoodId] = (foodUsage[addFoodId]||0) + 1; saveUsage();
  save(); haptic(); closeSheets(); render();
};

/* ---------- OFF + ESCÁNER (con caída a base local) ---------- */
let nextSrc = "manual";
document.getElementById("offSearchBtn").onclick = searchOFF;
document.getElementById("offQuery").onkeydown = (e)=>{ if(e.key==="Enter") searchOFF(); };

function applyOFFProduct(p){
  const n = p.nutriments || {};
  const kcal = Math.round(n["energy-kcal_100g"] != null ? n["energy-kcal_100g"] : (n["energy_100g"]||0)/4.184);
  nextSrc = "off";
  document.getElementById("cfName").value = (p.product_name||"") + (p.brands ? " (" + p.brands + ")" : "");
  document.getElementById("cfKcal").value = kcal;
  document.getElementById("cfCarbs").value = round1(n["carbohydrates_100g"]||0);
  document.getElementById("cfProtein").value = round1(n["proteins_100g"]||0);
  document.getElementById("cfFat").value = round1(n["fat_100g"]||0);
  document.getElementById("cfSodium").value = Math.round((n["sodium_100g"]||0)*1000);
  document.getElementById("cfFiber").value = round1(n["fiber_100g"]||0);
  document.getElementById("cfSugar").value = round1(n["sugars_100g"]||0);
  document.getElementById("createCard").scrollIntoView({ behavior:"smooth" });
  haptic();
}
function applyLocalFood(f){
  nextSrc = "manual";
  document.getElementById("cfName").value = f.name;
  document.getElementById("cfKcal").value = Math.round(f.per100.kcal);
  document.getElementById("cfCarbs").value = round1(f.per100.carbs||0);
  document.getElementById("cfProtein").value = round1(f.per100.protein||0);
  document.getElementById("cfFat").value = round1(f.per100.fat||0);
  document.getElementById("createCard").scrollIntoView({ behavior:"smooth" });
  haptic();
}

async function searchOFF(){
  const q = document.getElementById("offQuery").value.trim();
  const box = document.getElementById("offResults");
  if (!q) return;
  box.innerHTML = `<div class="hint">Buscando en Open Food Facts…</div>`;
  const url = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(q) +
    "&search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,nutriments,code";
  try {
    const res = await fetch(url, { mode:"cors", cache:"no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const products = (data.products || []).filter(p => { const n=p.nutriments||{}; return p.product_name && (n["energy-kcal_100g"]!=null || n["energy_100g"]!=null); });
    box.innerHTML = "";
    if (!products.length){ box.innerHTML = `<div class="empty">${emptyIconHTML("globe")}<p>Sin resultados en Open Food Facts. Prueba en inglés o créalo manual.</p></div>`; return; }
    products.forEach(p=>{
      const n = p.nutriments || {};
      const kcal = Math.round(n["energy-kcal_100g"] != null ? n["energy-kcal_100g"] : (n["energy_100g"]||0)/4.184);
      const el = document.createElement("div");
      el.className = "flist-item";
      el.innerHTML = `<span>${escapeHtml(p.product_name)}${p.brands?" <span class='m'>"+escapeHtml(p.brands)+"</span>":""}</span><span class="m">${kcal} kcal/100g</span>`;
      el.onclick = ()=> applyOFFProduct(p);
      box.appendChild(el);
    });
  } catch(e){
    box.innerHTML = "";
    const warn = document.createElement("div");
    warn.className = "hint";
    warn.textContent = "⚠️ Open Food Facts no respondió (" + (e && e.message ? e.message : "revisa tu red") + "). Mostrando tu base local:";
    box.appendChild(warn);
    const all = allRealFoods();
    const matches = Object.keys(all).filter(id => matchesQuery(all[id].name, q));
    if (!matches.length){
      const em = document.createElement("div");
      em.className = "empty";
      em.innerHTML = `${emptyIconHTML("search")}<p>Tampoco está en tu base local. Créalo manual arriba.</p>`;
      box.appendChild(em);
      return;
    }
    matches.forEach(id=>{
      const f = all[id];
      const el = document.createElement("div");
      el.className = "flist-item";
      el.innerHTML = `<span>${escapeHtml(f.name)}</span><span class="m">${Math.round(f.per100.kcal)} kcal/100g</span>`;
      el.onclick = ()=> applyLocalFood(f);
      box.appendChild(el);
    });
  }
}

let html5QrCode = null;
const scanSheet = document.getElementById("scanSheet");
document.getElementById("scanBtn").onclick = ()=>{ scanSheet.classList.add("open"); backdrop.classList.add("open"); startScanner(); };
document.getElementById("scanClose").onclick = ()=>{ stopScanner(); closeSheets(); };
function startScanner(){
  stopScanner();
  try {
    html5QrCode = new Html5Qrcode("scanRegion");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 140 } },
      (decoded)=>{ haptic(); stopScanner(); lookupBarcode(decoded); }, ()=>{}
    ).catch(()=>{ document.getElementById("scanRegion").innerHTML = `<div class="hint" style="color:#fff;padding:20px">No se pudo abrir la cámara. Revisa permisos.</div>`; });
  } catch(e){ document.getElementById("scanRegion").innerHTML = `<div class="hint" style="color:#fff;padding:20px">Escáner no disponible en este navegador.</div>`; }
}
function stopScanner(){ if (html5QrCode){ try{ html5QrCode.stop().catch(()=>{}); }catch(e){} html5QrCode = null; } }
async function lookupBarcode(code){
  closeSheets();
  const box = document.getElementById("offResults");
  box.innerHTML = `<div class="hint">Buscando código ${code}…</div>`;
  try {
    const res = await fetch("https://world.openfoodfacts.org/api/v0/product/" + encodeURIComponent(code) + ".json", { mode:"cors", cache:"no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status === 1 && data.product && data.product.product_name) applyOFFProduct(data.product);
    else box.innerHTML = `<div class="empty">${emptyIconHTML("package")}<p>Producto no encontrado en Open Food Facts. Créalo manual arriba.</p></div>`;
  } catch(e){
    box.innerHTML = `<div class="empty">${emptyIconHTML("signal")}<p>No se pudo contactar Open Food Facts (${e && e.message ? e.message : "revisa tu red"}). Crea el alimento manual arriba.</p></div>`;
  }
}

/* ---------- CREAR ALIMENTO ---------- */
document.getElementById("cfSaveBtn").onclick = ()=>{
  const name = document.getElementById("cfName").value.trim();
  const kcal = parseFloat(document.getElementById("cfKcal").value)||0;
  if (!name || kcal <= 0){ alert("Ponle nombre y kcal por 100 g."); return; }
  const id = "u" + Date.now();
  const micros = {};
  const fb = parseFloat(document.getElementById("cfFiber").value); if (fb) micros.fiber = fb;
  const sg = parseFloat(document.getElementById("cfSugar").value); if (sg) micros.sugar = sg;
  const so = parseFloat(document.getElementById("cfSodium").value); if (so) micros.sodium = so;
  const po = parseFloat(document.getElementById("cfPotassium").value); if (po) micros.potassium = po;
  customFoods[id] = { name, src: nextSrc, per100: { kcal, carbs: parseFloat(document.getElementById("cfCarbs").value)||0, protein: parseFloat(document.getElementById("cfProtein").value)||0, fat: parseFloat(document.getElementById("cfFat").value)||0 }, micros };
  nextSrc = "manual";
  saveCustomFoods(); haptic();
  ["cfName","cfKcal","cfCarbs","cfProtein","cfFat","cfFiber","cfSugar","cfSodium","cfPotassium"].forEach(i=>document.getElementById(i).value="");
  renderMyFoods(); render();
  snack("Alimento guardado ✅");
};
function renderMyFoods(){
  const list = document.getElementById("myFoodsList");
  list.innerHTML = "";
  const ids = Object.keys(customFoods);
  if (!ids.length){ list.innerHTML = `<div class="empty">${emptyIconHTML("basket")}<p>Tu base personal está vacía. Busca, escanea o crea tu primer alimento.</p></div>`; return; }
  ids.forEach(id=>{
    const f = customFoods[id];
    const row = document.createElement("div");
    row.className = "flist-item";
    row.innerHTML = `<span>${escapeHtml(f.name)} <span class="m">${f.src==="off"?"🌐":"✏️"}</span></span><span class="m">${Math.round(f.per100.kcal)} kcal/100g</span><button class="del-btn" aria-label="Eliminar ${escapeHtml(f.name)}">🗑</button>`;
    row.querySelector(".del-btn").onclick = ()=>{
      const stash = customFoods[id];
      delete customFoods[id]; saveCustomFoods(); renderMyFoods(); render();
      snack("Alimento eliminado", "Deshacer", ()=>{ customFoods[id] = stash; saveCustomFoods(); renderMyFoods(); render(); });
    };
    list.appendChild(row);
  });
}

/* ---------- PLANTILLAS ---------- */
function renderTemplatesInline(){
  const list = document.getElementById("myTemplatesList");
  list.innerHTML = "";
  const ids = Object.keys(myMeals);
  if (!ids.length){ list.innerHTML = `<div class="empty">${emptyIconHTML("star")}<p>Guarda comidas repetidas desde 📋 Registro (modo "Comidas").</p></div>`; return; }
  ids.forEach(id=>{
    const t = myMeals[id];
    const row = document.createElement("div");
    row.className = "flist-item";
    row.innerHTML = `<span>⭐ ${escapeHtml(t.name)}<br><span class="m">${Object.keys(t.groups||{}).length} grupos · ${Object.keys(t.custom||{}).length} alimentos</span></span><button class="del-btn" aria-label="Eliminar plantilla">🗑</button>`;
    row.querySelector(".del-btn").onclick = ()=>{
      const stash = myMeals[id];
      delete myMeals[id]; saveMyMeals(); renderTemplatesInline(); render();
      snack("Plantilla eliminada", "Deshacer", ()=>{ myMeals[id] = stash; saveMyMeals(); renderTemplatesInline(); render(); });
    };
    list.appendChild(row);
  });
}
function useTemplateFor(date, meal, id){
  const t = myMeals[id];
  if(!dataStore[date]) dataStore[date]={};
  if(!dataStore[date][meal]) dataStore[date][meal]={};
  const m = dataStore[date][meal];
  for (const g in (t.groups||{})) m[g] = (m[g]||0) + t.groups[g];
  for (const c in (t.custom||{})){ if(!m.custom) m.custom={}; m.custom[c] = (m.custom[c]||0) + t.custom[c]; foodUsage[c]=(foodUsage[c]||0)+1; }
  save(); saveUsage(); haptic(); render();
}
function saveTemplate(date, meal){
  const m = dataStore[date][meal];
  const groups = {};
  for (const g in foods) if (m[g] > 0) groups[g] = m[g];
  const custom = Object.assign({}, m.custom||{});
  if (!Object.keys(groups).length && !Object.keys(custom).length){ alert("Registra algo en esta comida primero."); return; }
  const name = prompt("Nombre de la plantilla (ej. Desayuno clásico):");
  if (!name) return;
  myMeals["t" + Date.now()] = { name: name.trim(), groups, custom };
  saveMyMeals(); haptic(); render();
  snack("Plantilla ⭐ creada");
}

/* ---------- BASE (MINI-DB EDITABLE) ---------- */
function renderBaseList(){
  const searchEl = document.getElementById("baseSearch");
  const q = searchEl ? searchEl.value : "";
  const list = document.getElementById("baseList");
  if (!list) return;
  list.innerHTML = "";
  const all = effectiveMiniFoods();
  const ids = Object.keys(all)
    .filter(id => matchesQuery(all[id].name, q))
    .sort((a,b) => all[a].name.localeCompare(all[b].name, "es"));
  if (!ids.length){ list.innerHTML = `<div class="empty">${emptyIconHTML("database")}<p>Sin resultados.</p></div>`; return; }
  ids.forEach(id=>{
    const f = all[id];
    const overridden = !!miniDbOverrides[id];
    const row = document.createElement("div");
    row.className = "flist-item";
    row.innerHTML = `<span>${escapeHtml(f.name)}${overridden?" ✏️":""}</span><span class="m">${Math.round(f.per100.kcal)} kcal/100g</span>
      <button class="del-btn" aria-label="Editar ${escapeHtml(f.name)}">✎</button>
      <button class="del-btn" aria-label="Eliminar ${escapeHtml(f.name)}">🗑</button>`;
    const btns = row.querySelectorAll(".del-btn");
    btns[0].onclick = ()=> startEditBaseFood(id, f);
    btns[1].onclick = ()=> deleteBaseFood(id, f);
    list.appendChild(row);
  });
}
function startEditBaseFood(id, f){
  document.getElementById("bfEditId").value = id;
  document.getElementById("bfName").value = f.name;
  document.getElementById("bfKcal").value = f.per100.kcal;
  document.getElementById("bfCarbs").value = f.per100.carbs || 0;
  document.getElementById("bfProtein").value = f.per100.protein || 0;
  document.getElementById("bfFat").value = f.per100.fat || 0;
  document.getElementById("bfCancelBtn").style.display = "inline-flex";
  document.getElementById("bfSaveBtn").textContent = "💾 Guardar cambios";
  document.getElementById("baseFormCard").scrollIntoView({ behavior:"smooth" });
}
function resetBaseForm(){
  document.getElementById("bfEditId").value = "";
  ["bfName","bfKcal","bfCarbs","bfProtein","bfFat"].forEach(i=>document.getElementById(i).value="");
  document.getElementById("bfCancelBtn").style.display = "none";
  document.getElementById("bfSaveBtn").textContent = "💾 Guardar alimento";
}
function deleteBaseFood(id, f){
  const prevOverride = miniDbOverrides[id] ? Object.assign({}, miniDbOverrides[id]) : null;
  miniDbOverrides[id] = Object.assign({}, prevOverride || { name: f.name, per100: f.per100 }, { deleted: true });
  saveMiniDbOverrides(); haptic(); renderBaseList(); render();
  snack("Alimento eliminado de la base", "Deshacer", ()=>{
    if (prevOverride) miniDbOverrides[id] = prevOverride; else delete miniDbOverrides[id];
    saveMiniDbOverrides(); renderBaseList(); render();
  });
}
document.getElementById("baseSearch").oninput = renderBaseList;
document.getElementById("bfCancelBtn").onclick = resetBaseForm;
document.getElementById("bfSaveBtn").onclick = ()=>{
  const name = document.getElementById("bfName").value.trim();
  const kcal = parseFloat(document.getElementById("bfKcal").value) || 0;
  if (!name || kcal <= 0){ alert("Ponle nombre y kcal por 100 g."); return; }
  const editId = document.getElementById("bfEditId").value;
  const id = editId || ("m" + Date.now());
  miniDbOverrides[id] = {
    name,
    per100: {
      kcal,
      carbs: parseFloat(document.getElementById("bfCarbs").value) || 0,
      protein: parseFloat(document.getElementById("bfProtein").value) || 0,
      fat: parseFloat(document.getElementById("bfFat").value) || 0
    }
  };
  saveMiniDbOverrides(); haptic();
  const wasEdit = !!editId;
  resetBaseForm(); renderBaseList(); render();
  snack(wasEdit ? "Alimento actualizado ✅" : "Alimento agregado a la base ✅");
};

/* ---------- PROGRESO ---------- */
function updateStats(){
  const s = calcStats();
  document.getElementById("statsGrid").innerHTML = `
    <div class="stat streak-stat"><div class="big">${s.streak}</div><div class="lbl">🔥 días de racha</div></div>
    <div class="stat"><div class="big">${s.avg}</div><div class="lbl">kcal promedio (7d)</div></div>
    <div class="stat"><div class="big">🎯 ${s.adherence}%</div><div class="lbl">adherencia a meta</div></div>`;
}
function updateMicros(){
  const mi = dayMicros(datePicker.value);
  document.getElementById("microGrid").innerHTML = `
    <div class="stat"><div class="big">${mi.fiber}g</div><div class="lbl">fibra</div></div>
    <div class="stat"><div class="big">${mi.sugar}g</div><div class="lbl">azúcar</div></div>
    <div class="stat"><div class="big">${mi.sodium}</div><div class="lbl">sodio mg</div></div>
    <div class="stat"><div class="big">${mi.potassium}</div><div class="lbl">potasio mg</div></div>`;
}
function updateGroups(){
  const date = datePicker.value;
  const grid = document.getElementById("groupsGrid");
  grid.innerHTML = "";
  for(const fn in foods){
    let sum = 0;
    meals.forEach(m => { sum += ((dataStore[date]||{})[m]||{})[fn] || 0; });
    const target = goals.groups[fn] || 0;
    const chip = document.createElement("div");
    chip.className = "chip" + (target > 0 && sum >= target ? " done" : "");
    chip.innerHTML = `<span class="ico">${groupIconHTML(fn,"sm")}</span>${sum}/${target}`;
    grid.appendChild(chip);
  }
}
function updateWater(){
  const date = datePicker.value;
  if(!dataStore[date]) dataStore[date]={};
  const count = dataStore[date].waterMl || 0;
  document.getElementById("waterTitle").textContent = `Hidratación · ${count} / ${goals.waterMl} ml`;
  const row = document.getElementById("waterRow");
  row.innerHTML = "";
  const drops = Math.min(16, Math.round(goals.waterMl/250));
  for(let i=0;i<drops;i++){
    const d = document.createElement("span");
    d.className = "drop" + (count >= (i+1)*250 ? " on" : "");
    d.innerHTML = iconSvg("droplet");
    d.setAttribute("role","button");
    d.setAttribute("aria-label", "Agua " + ((i+1)*250) + " ml");
    d.onclick = ()=>{
      const cur = dataStore[date].waterMl || 0;
      dataStore[date].waterMl = (cur === (i+1)*250) ? i*250 : (i+1)*250;
      save(); haptic(); updateWater();
    };
    row.appendChild(d);
  }
}
function updateWeight(){
  const dates = Object.keys(weightData).sort();
  const nowEl = document.getElementById("weightNow");
  const deltaEl = document.getElementById("weightDelta");
  const input = document.getElementById("weightInput");
  const emptyEl = document.getElementById("weightEmpty");
  emptyEl.innerHTML = dates.length ? "" : `<div class="empty">${emptyIconHTML("scale")}<p>Registra tu primer peso para ver la tendencia.</p></div>`;
  if (dates.length){
    const last = weightData[dates[dates.length-1]];
    nowEl.textContent = last + " kg";
    if (document.activeElement !== input) input.value = last;
    if (dates.length >= 2){
      const prev = weightData[dates[dates.length-2]];
      const diff = Math.round((last - prev) * 10) / 10;
      deltaEl.textContent = (diff > 0 ? "↑ +" : diff < 0 ? "↓ " : "= ") + diff + " kg";
    } else deltaEl.textContent = "";
  } else { nowEl.textContent = "—"; deltaEl.textContent = ""; }
  const entries = dates.slice(-14);
  if (weightChart) weightChart.destroy();
  weightChart = new Chart(document.getElementById("weightChart").getContext("2d"), {
    type: "line",
    data: { labels: entries.map(ds => { const p = ds.split("-"); return (+p[2]) + "/" + (+p[1]); }),
      datasets: [{ data: entries.map(ds => weightData[ds]), borderColor: "#0A84FF", backgroundColor: "rgba(10,132,255,.12)", borderWidth: 3, pointRadius: 3, pointBackgroundColor: "#0A84FF", fill: true, tension: .3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false, grid: { display: false } } } }
  });
}
document.getElementById("weightSave").onclick = ()=>{
  const val = parseFloat(document.getElementById("weightInput").value.replace(",", "."));
  if (!val || val < 20 || val > 400) return;
  weightData[getDS(new Date())] = val;
  localStorage.setItem("weightData", JSON.stringify(weightData));
  haptic(); updateWeight(); snack("Peso registrado ⚖️");
};

let histDate = new Date();
function updateHistory(){
  const y = histDate.getFullYear(), m = histDate.getMonth();
  document.getElementById("histLabel").textContent = MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1) + " " + y;
  const grid = document.getElementById("histGrid");
  grid.innerHTML = "";
  ["L","M","M","J","V","S","D"].forEach(d=>{ const e=document.createElement("div"); e.className="hist-dow"; e.textContent=d; grid.appendChild(e); });
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i=0;i<offset;i++){ const e=document.createElement("div"); e.className="hd emptycell"; grid.appendChild(e); }
  const days = new Date(y, m+1, 0).getDate();
  const todayDS = getDS(new Date());
  let rec=0, on=0, sum=0;
  for (let d=1; d<=days; d++){
    const ds = getDS(new Date(y, m, d));
    const k = dayTotals(ds).k;
    const r = k / goals.kcal;
    const e = document.createElement("div");
    let cls = "hd";
    if (ds > todayDS) cls += " future";
    else if (k > 0 && r < 0.5) cls += " d1";
    else if (k > 0 && r < 0.9) cls += " d2";
    else if (k > 0 && r <= 1.1) cls += " d3";
    else if (k > 0) cls += " d4";
    e.className = cls;
    e.setAttribute("aria-label", ds);
    e.onclick = ()=>{ datePicker.value = ds; showView("reg"); render(); window.scrollTo({top:0,behavior:"smooth"}); };
    grid.appendChild(e);
    if (k > 0){ rec++; sum += k; if (k >= goals.kcal*0.9 && k <= goals.kcal*1.1) on++; }
  }
  document.getElementById("histSummary").innerHTML = rec === 0
    ? `<div class="empty" style="grid-column:1/-1">${emptyIconHTML("calendar")}<p>Sin registros este mes. ¡Hoy es un buen día para empezar!</p></div>`
    : `<div class="stat"><div class="big">${rec}</div><div class="lbl">registrados</div></div>
       <div class="stat"><div class="big">${on}</div><div class="lbl">en meta</div></div>
       <div class="stat"><div class="big">${Math.round(sum/rec)}</div><div class="lbl">kcal promedio</div></div>`;
}
document.getElementById("histPrev").onclick = ()=>{ histDate.setMonth(histDate.getMonth()-1); updateHistory(); };
document.getElementById("histNext").onclick = ()=>{ histDate.setMonth(histDate.getMonth()+1); updateHistory(); };

function macroGoals(){
  const sp = goals.split || {c:40,p:30,f:30};
  const tot = (sp.c + sp.p + sp.f) || 100;
  return {
    cg: Math.round(goals.kcal * (sp.c/tot) / 4),
    pg: Math.round(goals.kcal * (sp.p/tot) / 4),
    fg: Math.round(goals.kcal * (sp.f/tot) / 9)
  };
}
function updateSummary(){
  const t = dayTotals(datePicker.value);
  animateNumber(document.getElementById("totalKcalBig"), t.k);
  document.getElementById("goalLabel").textContent = goals.kcal;
  const pct = t.k / goals.kcal;
  kcalRing.set(pct);
  const mg = macroGoals();
  document.getElementById("barC").style.width = Math.min(100, Math.round((t.c/mg.cg)*100)) + "%";
  document.getElementById("barP").style.width = Math.min(100, Math.round((t.p/mg.pg)*100)) + "%";
  document.getElementById("barF").style.width = Math.min(100, Math.round((t.f/mg.fg)*100)) + "%";
  document.getElementById("carbsTotal").textContent = t.c+"g";
  document.getElementById("proteinTotal").textContent = t.p+"g";
  document.getElementById("fatTotal").textContent = t.f+"g";
  const todayCard = document.querySelector(".today-card");
  if (todayCard){
    if (pct >= 1){ if (!todayCard.classList.contains("goal-hit")) todayCard.classList.add("goal-hit"); }
    else todayCard.classList.remove("goal-hit");
  }
}
function updateChart(){
  const ctx = document.getElementById("weeklyChart").getContext("2d");
  const p = datePicker.value.split("-");
  const base = new Date(p[0],p[1]-1,p[2]);
  const labels=[], vals=[];
  for(let i=6;i>=0;i--){
    const d = addDays(base,-i);
    labels.push(d.getDate()+"/"+(d.getMonth()+1));
    vals.push(dayTotals(getDS(d)).k);
  }
  if(chart) chart.destroy();
  chart = new Chart(ctx,{
    type:"line",
    data:{ labels, datasets:[{ data:vals, borderColor:"#34C759", backgroundColor:"rgba(52,199,89,.12)", borderWidth:3, pointRadius:4, pointBackgroundColor:"#fff", pointBorderColor:"#34C759", fill:true, tension:.4 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{grid:{display:false},beginAtZero:true} }}
  });
}
document.getElementById("shareBtn").onclick = async ()=>{
  const s = calcStats();
  const text = "🥗 Kcalma\n📅 Promedio 7 días: " + s.avg + " kcal\n🎯 Días en meta: " + Math.round(s.adherence*7/100) + "/7\n🔥 Racha: " + s.streak + " días\n💪 ¡Sigamos!";
  if (navigator.share){ try { await navigator.share({ text }); return; } catch(e){ return; } }
  try { await navigator.clipboard.writeText(text); snack("Resumen copiado 📋"); } catch(e){ alert(text); }
};

/* ---------- REPORTES ---------- */
function reportRows(){
  const rows = [];
  for(let i=29;i>=0;i--){
    const ds = getDS(addDays(new Date(),-i));
    const t = dayTotals(ds);
    const mi = dayMicros(ds);
    rows.push([ds, t.k, t.c, t.p, t.f, mi.fiber, mi.sugar, mi.sodium, mi.potassium, weightData[ds] || ""]);
  }
  return rows;
}
const REPORT_HEAD = ["Fecha","kcal","Carbs g","Prot g","Grasa g","Fibra g","Azúcar g","Sodio mg","Potasio mg","Peso kg"];
document.getElementById("csvBtn").onclick = ()=>{
  const lines = [REPORT_HEAD.join(",")].concat(reportRows().map(r=>r.join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "kcalma-reporte-" + getDS(new Date()) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  snack("Reporte CSV descargado 📄");
};
document.getElementById("pdfBtn").onclick = ()=>{
  if (!window.jspdf){ alert("PDF no disponible sin conexión a internet."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Kcalma — Reporte últimos 30 días", 14, 16);
  doc.setFontSize(9);
  doc.text("Generado: " + new Date().toLocaleDateString(), 14, 22);
  doc.autoTable({ head: [REPORT_HEAD], body: reportRows(), startY: 26, styles: { fontSize: 7.5 } });
  doc.save("kcalma-reporte-" + getDS(new Date()) + ".pdf");
  snack("Reporte PDF descargado 📄");
};

/* ---------- NAVEGACIÓN ---------- */
function changeDay(off){
  const p = datePicker.value.split("-");
  const d = new Date(p[0], p[1]-1, p[2]);
  d.setDate(d.getDate()+off);
  datePicker.value = getDS(d);
  render();
}
datePicker.addEventListener("change", render);
document.getElementById("todayBtn").onclick = ()=>{ datePicker.value = getDS(new Date()); render(); };
document.getElementById("copyBtn").onclick = ()=>{
  const date = datePicker.value;
  const prevDS = getDS(addDays(new Date(date+"T12:00:00"),-1));
  const snapshot = JSON.parse(JSON.stringify(dataStore[date] || {}));
  dataStore[date] = JSON.parse(JSON.stringify(dataStore[prevDS] || {}));
  save(); haptic(); render();
  snack("Se copió el día anterior ⧉", "Deshacer", ()=>{ dataStore[date] = snapshot; save(); render(); });
};

/* ---------- EDITOR DE TIEMPOS ---------- */
function buildMealsEditor(){
  const wrap = document.getElementById("mealsEditor");
  wrap.innerHTML = "";
  meals.forEach((meal, idx)=>{
    const row = document.createElement("div");
    row.className = "meal-edit-row";
    row.setAttribute("data-drag","1");
    row.dataset.idx = idx;
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "≡";
    handle.setAttribute("role","button");
    handle.setAttribute("tabindex","0");
    handle.setAttribute("aria-label","Reordenar " + meal + ". Usa las flechas arriba y abajo para mover, o arrastra con el mouse o el dedo.");
    handle.addEventListener("keydown", (e)=>{
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const from = idx, to = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (to < 0 || to >= meals.length) return;
      const tmp = meals[from]; meals[from] = meals[to]; meals[to] = tmp;
      saveMeals(); render(); buildMealsEditor();
      requestAnimationFrame(()=>{
        const rows = [...wrap.querySelectorAll("[data-drag]")];
        const target = rows[to] && rows[to].querySelector(".drag-handle");
        if (target) target.focus();
      });
    });
    const inp = document.createElement("input");
    inp.type = "text"; inp.value = meal;
    inp.setAttribute("aria-label","Nombre del tiempo de comida");
    inp.onchange = ()=>{
      const v = inp.value.trim();
      if (!v){ inp.value = meal; return; }
      meals[idx] = v; saveMeals(); render(); buildMealsEditor();
    };
    const del = document.createElement("button");
    del.className = "del-btn"; del.textContent = "🗑";
    del.setAttribute("aria-label","Eliminar " + meal);
    del.onclick = ()=>{
      if (meals.length <= 1){ alert("Debe quedar al menos un tiempo de comida."); return; }
      const stashName = meals[idx];
      meals.splice(idx,1); saveMeals(); render(); buildMealsEditor();
      snack("Tiempo eliminado", "Deshacer", ()=>{ meals.splice(idx,0,stashName); saveMeals(); render(); buildMealsEditor(); });
    };
    row.appendChild(handle); row.appendChild(inp); row.appendChild(del);
    wrap.appendChild(row);
    makeDraggable(row, handle);
  });
}
function makeDraggable(row, handle){
  handle.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    const list = row.parentElement;
    row.style.opacity = ".5";
    const move = (ev)=>{
      const rows = [...list.querySelectorAll("[data-drag]")].filter(r => r !== row);
      let target = null;
      for (const r of rows){
        const rect = r.getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height/2){ target = r; break; }
      }
      if (target) list.insertBefore(row, target);
      else list.appendChild(row);
    };
    const up = ()=>{
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      row.style.opacity = "";
      const order = [...list.querySelectorAll("[data-drag]")].map(r=>+r.dataset.idx);
      meals = order.map(i=>meals[i]);
      saveMeals(); render(); buildMealsEditor();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}
document.getElementById("addMealBtn").onclick = ()=>{
  meals.push("Nueva comida");
  saveMeals(); render(); buildMealsEditor(); haptic();
};
buildMealsEditor();

/* ---------- GUÍA ---------- */
let guideFilter = "all";
const guideSheet = document.getElementById("guideSheet");
function openGuide(group){
  guideFilter = group || "all";
  document.getElementById("guideSearch").value = "";
  renderGuideChips(); renderGuideList();
  guideSheet.classList.add("open"); backdrop.classList.add("open");
}
document.getElementById("guideBtn").onclick = ()=> openGuide(null);
document.getElementById("guideClose").onclick = closeSheets;
document.getElementById("guideSearch").oninput = renderGuideList;
function renderGuideChips(){
  const wrap = document.getElementById("guideChips");
  wrap.innerHTML = "";
  ["all"].concat(Object.keys(FOOD_GUIDE)).forEach(k=>{
    const b = document.createElement("button");
    b.className = "gchip" + (guideFilter === k ? " on" : "");
    b.textContent = k === "all" ? "Todos" : k;
    b.onclick = ()=>{ guideFilter = k; renderGuideChips(); renderGuideList(); };
    wrap.appendChild(b);
  });
}
function renderGuideList(){
  const q = (document.getElementById("guideSearch").value || "").toLowerCase();
  const list = document.getElementById("guideList");
  list.innerHTML = "";
  const groups = guideFilter === "all" ? Object.keys(FOOD_GUIDE) : [guideFilter];
  groups.forEach(g=>{
    const badge = foods[g] ? " · 1 porción = " + foods[g].kcal + " kcal" : (g === "Fiesteros" ? " · equivalencias" : " · 0 kcal");
    const h = document.createElement("div");
    h.className = "gsub"; h.style.marginTop = "16px";
    h.textContent = g + badge;
    list.appendChild(h);
    FOOD_GUIDE[g].forEach(sub=>{
      const items = sub.items.filter(it => !q || matchesQuery(it[0], q));
      if (!items.length) return;
      const s = document.createElement("div");
      s.className = "gsub"; s.textContent = sub.sub;
      list.appendChild(s);
      items.forEach(it=>{
        const row = document.createElement("div");
        row.className = "gitem";
        row.innerHTML = "<span>" + it[0] + "</span><span class='m'>" + it[1] + "</span>";
        list.appendChild(row);
      });
    });
  });
}

/* ---------- RESPALDO ---------- */
function exportBackup(){
  const payload = { app: "Kcalma", version: 6, exportedAt: new Date().toISOString(), nutritionData: dataStore, weightData: weightData, goals: goals, customFoods: customFoods, myMeals: myMeals, meals: meals, foodUsage: foodUsage, miniDbOverrides: miniDbOverrides };
  const json = JSON.stringify(payload, null, 2);
  const filename = "kcalma-respaldo-" + getDS(new Date()) + ".json";
  try {
    const file = new File([json], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "Respaldo Kcalma" }).catch(()=>{}); return; }
  } catch(e){}
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  snack("Respaldo exportado ⬇");
}
let pendingImport = null, importTimer = null;
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
function resetImport(){
  pendingImport = null; importBtn.textContent = "⬆ Importar"; importBtn.classList.remove("pending");
  const sum = document.getElementById("importSummary");
  if (sum){ sum.style.display = "none"; sum.textContent = ""; }
}
function describeImport(data){
  const days = Object.keys(data.nutritionData || {}).length;
  const weights = Object.keys(data.weightData || {}).length;
  const cFoods = Object.keys(data.customFoods || {}).length;
  const tmpls = Object.keys(data.myMeals || {}).length;
  const baseEdits = Object.keys(data.miniDbOverrides || {}).length;
  const parts = [];
  parts.push(days + " día" + (days===1?"":"s") + " de registro");
  parts.push(weights + " registro" + (weights===1?"":"s") + " de peso");
  parts.push(cFoods + " alimento" + (cFoods===1?"":"s") + " personalizado" + (cFoods===1?"":"s"));
  parts.push(tmpls + " plantilla" + (tmpls===1?"":"s"));
  if (baseEdits) parts.push(baseEdits + " cambio" + (baseEdits===1?"":"s") + " en la mini-DB");
  return "Este respaldo tiene " + parts.join(", ") + ". Esto reemplazará tus datos actuales de esas categorías.";
}
document.getElementById("exportBtn").onclick = ()=>{ haptic(); exportBackup(); };
importBtn.onclick = ()=>{ if (pendingImport){ applyImport(pendingImport); resetImport(); } else importFile.click(); };
importFile.onchange = ()=>{
  const f = importFile.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object" || (!data.nutritionData && !data.weightData && !data.goals)) throw 0;
      pendingImport = data;
      importBtn.textContent = "✓ ¿Reemplazar datos?"; importBtn.classList.add("pending");
      const sum = document.getElementById("importSummary");
      if (sum){ sum.textContent = describeImport(data); sum.style.display = "block"; }
      clearTimeout(importTimer); importTimer = setTimeout(resetImport, 8000);
    } catch(e){ alert("El archivo no es un respaldo válido de Kcalma."); }
    importFile.value = "";
  };
  reader.readAsText(f);
};
function applyImport(data){
  if (data.nutritionData) dataStore = data.nutritionData;
  if (data.weightData) weightData = data.weightData;
  if (data.customFoods){ customFoods = data.customFoods; saveCustomFoods(); }
  if (data.myMeals){ myMeals = data.myMeals; saveMyMeals(); }
  if (data.meals){ meals = data.meals; saveMeals(); }
  if (data.foodUsage){ foodUsage = data.foodUsage; saveUsage(); }
  if (data.miniDbOverrides){ miniDbOverrides = data.miniDbOverrides; saveMiniDbOverrides(); }
  if (data.goals){
    goals = Object.assign({ kcal:2000, waterMl:2000, reminders:false, theme:"auto", split:{c:40,p:30,f:30}, groups:Object.assign({}, DEFAULT_GROUPS) }, data.goals);
    goals.groups = Object.assign({}, DEFAULT_GROUPS, data.goals.groups || {});
  }
  save();
  localStorage.setItem("weightData", JSON.stringify(weightData));
  saveGoals(); applyTheme();
  document.getElementById("goalInputSheet").value = goals.kcal;
  document.getElementById("waterInputSheet").value = goals.waterMl;
  document.getElementById("splitC").value = goals.split.c;
  document.getElementById("splitP").value = goals.split.p;
  document.getElementById("splitF").value = goals.split.f;
  remSwitch.checked = goals.reminders;
  if (goals.reminders && "Notification" in window && Notification.permission === "granted") startReminders();
  buildGoalsInputs(); buildMealsEditor(); renderBaseList();
  const sum = document.getElementById("importSummary");
  if (sum){ sum.style.display = "none"; sum.textContent = ""; }
  haptic(); render();
  snack("Datos restaurados ✅");
}

/* ---------- RECORDATORIOS ---------- */
function notify(title, body){
  if(!("Notification" in window) || Notification.permission !== "granted") return;
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: "icon-192.png" })).catch(()=>{});
  } else { try { new Notification(title, { body }); } catch(e){} }
}
function checkReminders(){
  const now = new Date();
  const hm = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  const date = getDS(now);
  meals.forEach((meal, i)=>{
    const t = DEFAULT_MEAL_TIMES[i];
    if (!t || t !== hm) return;
    const key = date + "T" + t;
    const notified = JSON.parse(localStorage.getItem("notified") || "{}");
    if (notified[key]) return;
    if (mealTotals(date, meal).k > 0) return;
    notified[key] = 1;
    localStorage.setItem("notified", JSON.stringify(notified));
    notify("Kcalma", "Hora de tu " + meal + " 🍽️");
  });
}
let remInterval = null;
function startReminders(){ if (remInterval) return; remInterval = setInterval(checkReminders, 30000); checkReminders(); }

/* ---------- SHEETS / AJUSTES ---------- */
const backdrop = document.getElementById("backdrop");
const iosSheet = document.getElementById("iosSheet");
function closeSheets(){
  guideSheet.classList.remove("open");
  foodSheet.classList.remove("open");
  iosSheet.classList.remove("open");
  scanSheet.classList.remove("open");
  stopScanner();
  backdrop.classList.remove("open");
}
document.getElementById("iosDoneBtn").onclick = closeSheets;
document.getElementById("foodClose").onclick = closeSheets;
document.getElementById("guideClose").onclick = closeSheets;
backdrop.onclick = closeSheets;

document.getElementById("goalInputSheet").value = goals.kcal;
document.getElementById("waterInputSheet").value = goals.waterMl;
document.getElementById("splitC").value = goals.split.c;
document.getElementById("splitP").value = goals.split.p;
document.getElementById("splitF").value = goals.split.f;
document.getElementById("goalInputSheet").oninput = (e)=>{ goals.kcal = parseInt(e.target.value)||2000; saveGoals(); updateSummary(); updateHistory(); };
document.getElementById("waterInputSheet").oninput = (e)=>{ goals.waterMl = Math.min(5000, Math.max(250, parseInt(e.target.value)||2000)); saveGoals(); updateWater(); };
["splitC","splitP","splitF"].forEach((id,i)=>{
  document.getElementById(id).oninput = (e)=>{
    const v = Math.max(0, parseInt(e.target.value)||0);
    if (i===0) goals.split.c = v; if (i===1) goals.split.p = v; if (i===2) goals.split.f = v;
    saveGoals(); updateSummary();
  };
});

const remSwitch = document.getElementById("remSwitch");
remSwitch.checked = goals.reminders;
remSwitch.onchange = ()=>{
  if (remSwitch.checked){
    if (!("Notification" in window)){ alert("Tu navegador no soporta notificaciones."); remSwitch.checked = false; return; }
    Notification.requestPermission().then(p=>{
      if (p === "granted"){ goals.reminders = true; saveGoals(); startReminders(); }
      else { goals.reminders = false; remSwitch.checked = false; saveGoals(); }
    });
  } else { goals.reminders = false; saveGoals(); }
};
if (goals.reminders && "Notification" in window && Notification.permission === "granted") startReminders();

function buildGoalsInputs(){
  const wrap = document.getElementById("goalsGrid");
  wrap.innerHTML = "";
  for(const fn in foods){
    const div = document.createElement("div");
    div.className = "field"; div.style.marginBottom = "0";
    const label = document.createElement("label");
    label.style.display = "flex"; label.style.alignItems = "center"; label.style.gap = "8px";
    label.innerHTML = groupIconHTML(fn,"sm") + fn;
    const inp = document.createElement("input");
    inp.type = "number"; inp.inputMode = "numeric"; inp.value = goals.groups[fn];
    inp.oninput = ()=>{ goals.groups[fn] = Math.max(0, parseInt(inp.value)||0); saveGoals(); updateGroups(); };
    div.appendChild(label); div.appendChild(inp);
    wrap.appendChild(div);
  }
}
buildGoalsInputs();

/* ---------- INSTALACIÓN PWA ---------- */
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (isiOS) installBtn.style.display = "inline-flex";
window.addEventListener("beforeinstallprompt", (e)=>{ e.preventDefault(); deferredPrompt = e; installBtn.style.display = "inline-flex"; });
window.addEventListener("appinstalled", ()=>{ installBtn.style.display = "none"; });
installBtn.onclick = async ()=>{
  if (deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.style.display = "none"; }
  else if (isiOS){ iosSheet.classList.add("open"); backdrop.classList.add("open"); }
};

render();
if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
