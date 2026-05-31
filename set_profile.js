// -*- coding: utf-8 -*-
require('dotenv').config();

function mac(id, tag, name, text, css, attrs, children) {
  return {
    id, tag, name, text: text || '',
    css: css || {}, attrs: attrs || {},
    children: children || [], wires: [],
    dbSource: null, emitOnInput: '', emitOnClick: '',
    transferOnClick: { fromId: '', eventName: '' },
    inputTransform: { filter: '', arg: '' },
    outputTransform: { filter: '', arg: '' },
    varWires: []
  };
}

const machines = {};
function add(m) { machines[m.id] = m; return m; }

// ── Navigation script ──────────────────────────────────────────────────────────
const NAV_JS = `(function(){
  var cur=0,tot=5;
  function goTo(n){
    if(n<0||n>=tot)return;
    cur=n;
    var t=document.getElementById('pgt');
    if(t)t.style.transform='translateX(-'+(n*20)+'%)';
    var l=document.getElementById('pgl');
    if(l)l.textContent=('0'+(n+1)).slice(-2)+' / 05';
    document.querySelectorAll('.pdot').forEach(function(d,i){
      d.style.background=i===n?'#a78bfa':'rgba(255,255,255,0.12)';
      d.style.width=i===n?'22px':'6px';
    });
    var p=document.getElementById('bpr');
    var nx=document.getElementById('bnt');
    if(p)p.style.opacity=n===0?'0.2':'1';
    if(nx)nx.style.opacity=n>=tot-1?'0.2':'1';
  }
  window.goTo=goTo;
  window.nextPage=function(){goTo(cur+1);};
  window.prevPage=function(){goTo(cur-1);};
  function init(){goTo(0);}
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  } else { setTimeout(init,0); }
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){nextPage();if(e.key===' ')e.preventDefault();}
    if(e.key==='ArrowLeft'||e.key==='ArrowUp')prevPage();
  });
})();`;

add(mac('s','script','nav_script', NAV_JS, {}, {}, []));

// ── App ────────────────────────────────────────────────────────────────────────
add(mac('app','div','app','',{
  position:'fixed', top:'0', left:'0', width:'100%', height:'100%',
  background:'#050508',
  'font-family':"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  overflow:'hidden', display:'flex', 'flex-direction':'column', color:'#e2e8f0'
}, {}, ['hdr','pgw','nav']));

// ── Header ─────────────────────────────────────────────────────────────────────
add(mac('hdr','div','header','',{
  display:'flex', 'align-items':'center', 'justify-content':'space-between',
  padding:'22px 36px', 'flex-shrink':'0'
}, {}, ['hlg','hd']));

add(mac('hlg','div','logo','✦ MCE',{
  'font-size':'11px', 'font-weight':'700', 'letter-spacing':'0.2em',
  color:'#a78bfa', 'text-transform':'uppercase'
}, {}, []));

add(mac('hd','div','dots','',{
  display:'flex', 'align-items':'center', gap:'8px'
}, {}, ['d1','d2','d3','d4','d5']));

for (let i=1; i<=5; i++) {
  add(mac('d'+i,'div','dot'+i,'',{
    width:'6px', height:'6px', 'border-radius':'20px',
    background:'rgba(255,255,255,0.12)', cursor:'pointer', transition:'all 0.35s ease'
  }, { class:'pdot', onclick:'goTo('+(i-1)+')' }, []));
}

// ── Pages wrap / track ─────────────────────────────────────────────────────────
add(mac('pgw','div','pages_wrap','',{
  flex:'1', overflow:'hidden', position:'relative'
}, {}, ['pgt']));

add(mac('pgt','div','pages_track','',{
  display:'flex', height:'100%', width:'500%',
  transition:'transform 0.65s cubic-bezier(0.77,0,0.175,1)', 'will-change':'transform'
}, { id:'pgt' }, ['p1','p2','p3','p4','p5']));

// ── Shared CSS ─────────────────────────────────────────────────────────────────
const PAGE = {
  width:'20%', height:'100%', 'flex-shrink':'0',
  display:'flex', 'flex-direction':'column',
  'align-items':'center', 'justify-content':'center',
  padding:'20px 40px', overflow:'hidden'
};
const CONTENT = {
  width:'100%', 'max-width':'620px',
  display:'flex', 'flex-direction':'column'
};
const LABEL = {
  'font-size':'11px', 'font-weight':'600', 'letter-spacing':'0.2em',
  color:'#a78bfa', 'text-transform':'uppercase', 'margin-bottom':'24px'
};
const H2 = {
  'font-size':'clamp(26px,4vw,46px)', 'font-weight':'700',
  'letter-spacing':'-0.02em', 'line-height':'1.15',
  color:'#f1f5f9', margin:'0 0 26px'
};
const HR = { width:'100%', height:'1px', background:'#0f0f1e', margin:'0 0 28px', 'flex-shrink':'0' };
const BODY = { 'font-size':'clamp(14px,1.4vw,17px)', 'line-height':'1.8', color:'#64748b', margin:'0' };

// ── Page 1 — Cover ─────────────────────────────────────────────────────────────
add(mac('p1','div','page_cover','', PAGE, {}, ['p1w']));
add(mac('p1w','div','p1_wrap','',
  Object.assign({}, CONTENT, { 'align-items':'center', 'text-align':'center' }),
  {}, ['p1ey','p1nm','p1rl','p1dv','p1qt','p1ht']));

add(mac('p1ey','div','p1_eyebrow','✦ Magic Cat Engine',{
  'font-size':'11px', 'font-weight':'600', 'letter-spacing':'0.25em',
  color:'#a78bfa', 'text-transform':'uppercase', 'margin-bottom':'32px'
}, {}, []));

add(mac('p1nm','h1','p1_name','Adom Patchett',{
  'font-size':'clamp(42px,8vw,86px)', 'font-weight':'800',
  'letter-spacing':'-0.03em', 'line-height':'0.95',
  color:'#f8fafc', margin:'0 0 22px'
}, {}, []));

add(mac('p1rl','p','p1_role','Full-Stack Developer<br>&amp; Creative Technologist',{
  'font-size':'clamp(14px,1.8vw,18px)', color:'#475569',
  margin:'0 0 44px', 'line-height':'1.5'
}, {}, []));

add(mac('p1dv','div','p1_div','',{
  width:'32px', height:'1px', background:'#1a1a2e', margin:'0 auto 44px'
}, {}, []));

add(mac('p1qt','p','p1_quote','"Building tools that make the web feel alive."',{
  'font-size':'14px', 'font-style':'italic', color:'#334155',
  'max-width':'340px', 'line-height':'1.65', margin:'0 0 52px'
}, {}, []));

add(mac('p1ht','div','p1_hint','Press → or use arrow keys to explore',{
  'font-size':'10px', color:'#1a1a2e',
  'letter-spacing':'0.12em', 'text-transform':'uppercase'
}, {}, []));

// ── Page 2 — About ─────────────────────────────────────────────────────────────
add(mac('p2','div','page_about','', PAGE, {}, ['p2w']));
add(mac('p2w','div','p2_wrap','', CONTENT, {}, ['p2lb','p2h2','p2dv','p2bd']));

add(mac('p2lb','div','p2_label','02 — About', LABEL, {}, []));
add(mac('p2h2','h2','p2_heading','Building the future<br>of web creation.', H2, {}, []));
add(mac('p2dv','div','p2_div','', HR, {}, []));
add(mac('p2bd','p','p2_body',
  `I'm a full-stack developer building <span style="color:#a78bfa">Magic Cat Engine</span> — a visual programming environment that lets you design, connect, and ship interactive web experiences without friction.<br><br>My work lives at the intersection of developer tooling and creative expression. I believe the best tools disappear into the experience they enable — so I build with simplicity, speed, and craft.`,
  BODY, {}, []));

// ── Page 3 — Magic Cat Engine ──────────────────────────────────────────────────
add(mac('p3','div','page_mce','', PAGE, {}, ['p3w']));
add(mac('p3w','div','p3_wrap','', CONTENT, {}, ['p3lb','p3h2','p3dv','p3dc','p3ft']));

add(mac('p3lb','div','p3_label','03 — The Engine', LABEL, {}, []));
add(mac('p3h2','h2','p3_heading','A new kind<br>of web editor.', H2, {}, []));
add(mac('p3dv','div','p3_div','', HR, {}, []));
add(mac('p3dc','p','p3_desc',
  'MCEngine is a browser-based visual IDE. Build component trees, wire events, connect live MongoDB databases, and publish interactive profiles — all from one place. No framework required.',
  Object.assign({}, BODY, { 'margin-bottom':'28px' }), {}, []));

const feats = [
  'Visual machine editor','Live MongoDB integration',
  'Event &amp; pipe system','Real-time preview',
  'Auto-save everywhere','Public profile pages'
];
add(mac('p3ft','div','p3_features',
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 40px">${
    feats.map(f=>`<div style="display:flex;align-items:center;gap:10px;font-size:13px;color:#475569"><span style="color:#a78bfa;font-size:9px;flex-shrink:0">●</span>${f}</div>`).join('')
  }</div>`,
  {}, {}, []));

// ── Page 4 — Stack ─────────────────────────────────────────────────────────────
add(mac('p4','div','page_stack','', PAGE, {}, ['p4w']));
add(mac('p4w','div','p4_wrap','', CONTENT, {}, ['p4lb','p4h2','p4dv','p4gr']));

add(mac('p4lb','div','p4_label','04 — Stack', LABEL, {}, []));
add(mac('p4h2','h2','p4_heading','Built with<br>modern tools.', H2, {}, []));
add(mac('p4dv','div','p4_div','', HR, {}, []));

const stackCols = [
  { label:'Frontend',  items:['HTML · CSS','JavaScript','No frameworks'] },
  { label:'Backend',   items:['Node.js','Express','MongoDB'] },
  { label:'Auth &amp; Pay', items:['Google OAuth','Stripe'] },
  { label:'Infra',     items:['PM2','Linux','Paramiko'] },
];
add(mac('p4gr','div','p4_grid',
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 52px">${
    stackCols.map(c=>`<div>
      <div style="font-size:10px;font-weight:700;letter-spacing:0.15em;color:#a78bfa;text-transform:uppercase;margin-bottom:12px">${c.label}</div>
      ${c.items.map(item=>`<div style="font-size:14px;color:#475569;margin-bottom:7px">${item}</div>`).join('')}
    </div>`).join('')
  }</div>`,
  {}, {}, []));

// ── Page 5 — Contact ───────────────────────────────────────────────────────────
add(mac('p5','div','page_contact','', PAGE, {}, ['p5w']));
add(mac('p5w','div','p5_wrap','', CONTENT, {}, ['p5lb','p5h2','p5dv','p5it','p5qt']));

add(mac('p5lb','div','p5_label','05 — Connect', LABEL, {}, []));
add(mac('p5h2','h2','p5_heading',"Let's build<br>something together.", H2, {}, []));
add(mac('p5dv','div','p5_div','', HR, {}, []));
add(mac('p5it','div','p5_items',
  `<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:48px">
    <a href="mailto:adompatchett@gmail.com" style="display:flex;align-items:center;gap:14px;color:#64748b;text-decoration:none;font-size:15px;padding:14px 18px;background:rgba(255,255,255,0.025);border-radius:8px;border:1px solid rgba(255,255,255,0.05)" onmouseover="this.style.borderColor='#a78bfa';this.style.color='#e2e8f0'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)';this.style.color='#64748b'">
      <span style="color:#a78bfa;font-size:16px">✉</span>
      adompatchett@gmail.com
    </a>
    <a href="https://magiccatengine.com" target="_blank" style="display:flex;align-items:center;gap:14px;color:#64748b;text-decoration:none;font-size:15px;padding:14px 18px;background:rgba(255,255,255,0.025);border-radius:8px;border:1px solid rgba(255,255,255,0.05)" onmouseover="this.style.borderColor='#a78bfa';this.style.color='#e2e8f0'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)';this.style.color='#64748b'">
      <span style="color:#a78bfa;font-size:16px">✦</span>
      magiccatengine.com
    </a>
  </div>`,
  {}, {}, []));

add(mac('p5qt','p','p5_quote','"If you can imagine it, you can wire it."',{
  'font-size':'13px', 'font-style':'italic', color:'#1e2535'
}, {}, []));

// ── Nav bar ────────────────────────────────────────────────────────────────────
add(mac('nav','div','nav_bar','',{
  display:'flex', 'align-items':'center', 'justify-content':'center',
  gap:'28px', height:'60px', 'flex-shrink':'0',
  'border-top':'1px solid #0a0a14'
}, {}, ['bpr','pgl','bnt']));

add(mac('bpr','button','btn_prev','←',{
  background:'none', border:'1px solid rgba(255,255,255,0.07)',
  color:'#475569', 'font-size':'16px', cursor:'pointer',
  width:'38px', height:'38px', 'border-radius':'50%',
  display:'flex', 'align-items':'center', 'justify-content':'center', transition:'all 0.2s'
}, { id:'bpr', onclick:'prevPage()' }, []));

add(mac('pgl','div','page_label','01 / 05',{
  'font-size':'11px', 'letter-spacing':'0.12em', color:'#1e2535',
  'min-width':'48px', 'text-align':'center'
}, { id:'pgl' }, []));

add(mac('bnt','button','btn_next','→',{
  background:'none', border:'1px solid rgba(255,255,255,0.07)',
  color:'#475569', 'font-size':'16px', cursor:'pointer',
  width:'38px', height:'38px', 'border-radius':'50%',
  display:'flex', 'align-items':'center', 'justify-content':'center', transition:'all 0.2s'
}, { id:'bnt', onclick:'nextPage()' }, []));

// ── Profile data ───────────────────────────────────────────────────────────────
const PROFILE_DATA = {
  version: '1.0.0',
  project: { name: 'Adom Patchett' },
  machines,
  rootOrder: ['s', 'app'],
  events: {}, pipes: {}, views: {}, loops: {}, vars: {}, logic: {},
  runtimeStyle: 'clean',
  dbCollections: [],
  _nextId: 200
};

// ── Publish ────────────────────────────────────────────────────────────────────
async function main() {
  const { connect: connectMongo } = require('./db/mongoose');
  await connectMongo();
  const User    = require('./models/User');
  const Project = require('./models/Project');

  const user = await User.findOne({ email: 'adompatchett@gmail.com' });
  if (!user) throw new Error('User not found');

  const result = await Project.findOneAndUpdate(
    { userId: user._id, isProfile: true },
    { $set: { userId: user._id, name: 'Adom Patchett', data: PROFILE_DATA, isProfile: true, public: true } },
    { upsert: true, new: true }
  );
  console.log('Profile published:', result._id.toString());
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
