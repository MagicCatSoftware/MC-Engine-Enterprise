// The MCEngine project (machines/pipes/events/wires/views/logic/loops) that
// renders /board. Served through the same runtime as /examples widgets
// (server.js /mce-runtime.js + buildHTML/buildExportCSS/buildExportScript),
// but as the whole page rather than an iframe card, with live:true pipes
// hitting the real /api/board/* routes (routes/board.js) instead of a mock DB.
//
// New-topic and reply forms need two free-text fields at once (title+body,
// or author+body), which a single transferOnClick wire can't carry — so
// their "submit" buttons use a logic block instead: an always-true `if`
// block whose code reads the sibling inputs directly via
// document.querySelector('[data-mce-id=...]') and calls PipeSystem.execute
// itself, chaining a PipeSystem.fetch(...) refresh once the write resolves.

const BOARD_PROJECT = {
  rootOrder: ['M1'],

  views: { topics: { name: 'topics' }, topic: { name: 'topic' } },

  events: {
    goTopics:          { name: 'goTopics',          payload: '{}' },
    postTopicClicked:  { name: 'postTopicClicked',  payload: '{}' },
    postReplyClicked:  { name: 'postReplyClicked',  payload: '{}' },
  },

  pipes: {
    getTopics:        { name: 'getTopics',        method: 'GET',  live: true, endpoint: '/api/board/topics' },
    addTopic:         { name: 'addTopic',         method: 'POST', live: true, endpoint: '/api/board/topics' },
    getTopicById:      { name: 'getTopicById',      method: 'GET',  live: true, urlTemplate: '/api/board/topics/{{_id}}' },
    getPostsForTopic:  { name: 'getPostsForTopic',  method: 'GET',  live: true, urlTemplate: '/api/board/topics/{{_id}}/posts' },
    addReply:         { name: 'addReply',         method: 'POST', live: true, urlTemplate: '/api/board/topics/{{_id}}/posts' },
  },

  loops: {
    topicsList: {
      name: 'topicsList', pipeName: 'getTopics', targetId: 'M3b',
      dataField: '', clickEvent: '', clickView: 'topic', clickValueField: '',
      template: '<div style="padding:12px 14px;border:1px solid #1e1e2e;border-radius:6px;margin-bottom:6px">' +
        '<div style="font-size:14px;font-weight:700;color:#e2e8f0">{{title}}</div>' +
        '<div style="font-size:11px;color:#888;margin-top:4px">by {{authorName}} · {{postCount}} post(s) · last activity {{lastActivityAt}}</div>' +
        '</div>',
    },
    postsList: {
      name: 'postsList', pipeName: 'getPostsForTopic', targetId: 'M4c',
      dataField: '', clickEvent: '', clickView: '', clickValueField: '',
      template: '<div style="padding:10px 14px;border:1px solid #1e1e2e;border-radius:6px;margin-bottom:6px">' +
        '<div style="font-size:11px;color:#888">{{authorName}} · {{createdAt}}</div>' +
        '<div style="font-size:13px;color:#e2e8f0;margin-top:4px;white-space:pre-wrap">{{body}}</div>' +
        '</div>',
    },
  },

  logic: {
    M3a4: {
      blocks: [{
        type: 'if', condition: 'true', actions: [], children: [],
        code: `
var t = document.querySelector('[data-mce-id="M3a2"]');
var b = document.querySelector('[data-mce-id="M3a3"]');
var n = document.querySelector('[data-mce-id="M3a1"]');
var s = document.querySelector('[data-mce-id="M3a5"]');
var title = t ? t.value.trim() : '';
var body = b ? b.value.trim() : '';
var author = n ? n.value.trim() : '';
if (!title || !body) { if (s) s.textContent = 'Please fill in a title and a message.'; }
else {
  if (s) s.textContent = 'Posting…';
  PipeSystem.execute('addTopic', { title: title, body: body, authorName: author }, {}).then(function(r) {
    if (!r || r.status >= 400) { if (s) s.textContent = (r && r.data && r.data.error) || 'Something went wrong.'; return; }
    if (t) t.value = ''; if (b) b.value = ''; if (n) n.value = '';
    if (s) s.textContent = '';
    PipeSystem.fetch('getTopics');
  });
}
`.trim(),
      }],
    },
    M4d3: {
      blocks: [{
        type: 'if', condition: 'true', actions: [], children: [],
        code: `
var b = document.querySelector('[data-mce-id="M4d2"]');
var n = document.querySelector('[data-mce-id="M4d1"]');
var s = document.querySelector('[data-mce-id="M4d4"]');
var body = b ? b.value.trim() : '';
var author = n ? n.value.trim() : '';
if (!body) { if (s) s.textContent = 'Write a message first.'; }
else {
  if (s) s.textContent = 'Posting…';
  PipeSystem.execute('addReply', { body: body, authorName: author }, {}).then(function(r) {
    if (!r || r.status >= 400) { if (s) s.textContent = (r && r.data && r.data.error) || 'Something went wrong.'; return; }
    if (b) b.value = ''; if (n) n.value = '';
    if (s) s.textContent = '';
    PipeSystem.fetch('getPostsForTopic');
  });
}
`.trim(),
      }],
    },
  },

  templates: {}, vars: {}, css: '',

  machines: {
    M1: { id:'M1', name:'app', tag:'div', text:'', parentId:'', children:['M2','M3','M4'],
      css:{ maxWidth:'720px', margin:'0 auto', padding:'32px 20px 80px', fontFamily:'system-ui,sans-serif', color:'#e2e8f0' },
      attrs:{}, wires:[ { eventName:'goTopics', targetId:'', action:'navigate', actionArgs:'topics' } ], viewBinding:null },

    M2: { id:'M2', name:'title', tag:'h1', text:'MCEngine Message Board', parentId:'M1', children:[],
      css:{ fontSize:'28px', fontWeight:'900', marginBottom:'24px', letterSpacing:'-0.5px' }, attrs:{}, wires:[], viewBinding:null },

    // ---- topics view ----
    M3: { id:'M3', name:'topics_page', tag:'div', text:'', parentId:'M1', children:['M3a','M3b'],
      css:{ display:'flex', flexDirection:'column', gap:'20px' }, attrs:{},
      wires:[ { eventName:'view:topics', targetId:'', action:'pipeOut', actionArgs:'getTopics' } ], viewBinding:'topics' },

    M3a: { id:'M3a', name:'new_topic_section', tag:'div', text:'', parentId:'M3', children:['M3a_label','M3a1','M3a2','M3a3','M3a4','M3a5'],
      css:{ display:'flex', flexDirection:'column', gap:'8px', padding:'18px', border:'1px solid #1e1e2e', borderRadius:'8px', background:'#0d0d1a' },
      attrs:{}, wires:[], viewBinding:null },
    M3a_label: { id:'M3a_label', name:'new_topic_label', tag:'div', text:'Start a new topic', parentId:'M3a', children:[],
      css:{ fontSize:'11px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.5px', color:'#a78bfa' }, attrs:{}, wires:[], viewBinding:null },
    M3a1: { id:'M3a1', name:'topic_name_input', tag:'input', text:'', parentId:'M3a', children:[],
      css:{ padding:'8px 12px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
      attrs:{ type:'text', placeholder:'Your name (optional)' }, wires:[], viewBinding:null },
    M3a2: { id:'M3a2', name:'topic_title_input', tag:'input', text:'', parentId:'M3a', children:[],
      css:{ padding:'8px 12px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
      attrs:{ type:'text', placeholder:'Topic title' }, wires:[], viewBinding:null },
    M3a3: { id:'M3a3', name:'topic_body_input', tag:'input', text:'', parentId:'M3a', children:[],
      css:{ padding:'8px 12px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
      attrs:{ type:'text', placeholder:'Write the first message…' }, wires:[], viewBinding:null },
    M3a4: { id:'M3a4', name:'post_topic_btn', tag:'button', text:'Post Topic', parentId:'M3a', children:[],
      css:{ padding:'9px 16px', borderRadius:'5px', border:'none', background:'#a78bfa', color:'#000', fontWeight:'700', cursor:'pointer', alignSelf:'flex-start' },
      attrs:{}, emitOnClick:'postTopicClicked', wires:[ { eventName:'postTopicClicked', targetId:'', action:'runLogic', actionArgs:'' } ], viewBinding:null },
    M3a5: { id:'M3a5', name:'new_topic_status', tag:'div', text:'', parentId:'M3a', children:[],
      css:{ fontSize:'11px', color:'#888' }, attrs:{}, wires:[], viewBinding:null },

    M3b: { id:'M3b', name:'topics_list', tag:'div', text:'', parentId:'M3', children:[],
      css:{ display:'flex', flexDirection:'column' }, attrs:{}, wires:[], viewBinding:null },

    // ---- topic view ----
    M4: { id:'M4', name:'topic_page', tag:'div', text:'', parentId:'M1', children:['M4a','M4b','M4c','M4d'],
      css:{ display:'flex', flexDirection:'column', gap:'16px' }, attrs:{},
      wires:[
        { eventName:'view:topic', targetId:'', action:'pipeOut', actionArgs:'getTopicById' },
        { eventName:'view:topic', targetId:'', action:'pipeOut', actionArgs:'getPostsForTopic' },
      ], viewBinding:'topic' },

    M4a: { id:'M4a', name:'back_btn', tag:'button', text:'← Back to topics', parentId:'M4', children:[],
      css:{ padding:'7px 14px', borderRadius:'5px', border:'1px solid #333', background:'transparent', color:'#888', cursor:'pointer', fontSize:'12px', alignSelf:'flex-start' },
      attrs:{}, emitOnClick:'goTopics', wires:[], viewBinding:null },

    M4b: { id:'M4b', name:'topic_heading', tag:'h2', text:'Loading topic…', parentId:'M4', children:[],
      css:{ fontSize:'22px', fontWeight:'900', letterSpacing:'-0.5px' }, attrs:{},
      wires:[], viewBinding:null,
      pipeBindings: [ { pipeName:'getTopicById', action:'setText', field:'_template', actionArgs:'{{title}}' } ] },

    M4c: { id:'M4c', name:'posts_list', tag:'div', text:'', parentId:'M4', children:[],
      css:{ display:'flex', flexDirection:'column' }, attrs:{}, wires:[], viewBinding:null },

    M4d: { id:'M4d', name:'reply_section', tag:'div', text:'', parentId:'M4', children:['M4d1','M4d2','M4d3','M4d4'],
      css:{ display:'flex', flexDirection:'column', gap:'8px', padding:'18px', border:'1px solid #1e1e2e', borderRadius:'8px', background:'#0d0d1a' },
      attrs:{}, wires:[], viewBinding:null },
    M4d1: { id:'M4d1', name:'reply_name_input', tag:'input', text:'', parentId:'M4d', children:[],
      css:{ padding:'8px 12px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
      attrs:{ type:'text', placeholder:'Your name (optional)' }, wires:[], viewBinding:null },
    M4d2: { id:'M4d2', name:'reply_body_input', tag:'input', text:'', parentId:'M4d', children:[],
      css:{ padding:'8px 12px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
      attrs:{ type:'text', placeholder:'Write a reply…' }, wires:[], viewBinding:null },
    M4d3: { id:'M4d3', name:'post_reply_btn', tag:'button', text:'Reply', parentId:'M4d', children:[],
      css:{ padding:'9px 16px', borderRadius:'5px', border:'none', background:'#a78bfa', color:'#000', fontWeight:'700', cursor:'pointer', alignSelf:'flex-start' },
      attrs:{}, emitOnClick:'postReplyClicked', wires:[ { eventName:'postReplyClicked', targetId:'', action:'runLogic', actionArgs:'' } ], viewBinding:null },
    M4d4: { id:'M4d4', name:'reply_status', tag:'div', text:'', parentId:'M4d', children:[],
      css:{ fontSize:'11px', color:'#888' }, attrs:{}, wires:[], viewBinding:null },
  },

  _nextId: 30,
};

module.exports = BOARD_PROJECT;
