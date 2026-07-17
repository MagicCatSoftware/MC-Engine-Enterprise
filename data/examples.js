// Content for the /examples showcase page (server.js → examplesPageHTML()).
// Add more categories/items here in later batches — the page re-renders from this array alone.
// Target: 100 examples total across all categories.

const EXAMPLES = [
  {
    category: 'Personal & Profile',
    items: [
      { icon: '🧑‍💼', title: 'Personal portfolio / resume page', desc: 'Showcase your work and background at your own URL.' },
      { icon: '🔗', title: 'Link-in-bio page', desc: 'One central link hub for all your social profiles.' },
      { icon: '🖼️', title: 'Photo gallery with lightbox', desc: 'Loop-rendered image grid with click-to-enlarge.' },
      { icon: '💳', title: 'Digital business card', desc: 'Contact details and links in a shareable mini-page.' },
      { icon: '💍', title: 'Wedding / event RSVP page', desc: 'Collect guest responses straight into a DB collection.' },
      { icon: '📝', title: 'Personal blog with post list', desc: 'A pipe-fed loop of posts, newest first.' },
      { icon: '✈️', title: 'Travel journal with entries', desc: 'Log trips and stops as they happen.' },
      { icon: '🍳', title: 'Recipe collection', desc: 'Searchable list of recipes with ingredients and steps.' },
      { icon: '📚', title: 'Reading list tracker', desc: 'Track books read, in progress, and want-to-read.' },
      { icon: '🔥', title: 'Habit tracker with streaks', desc: 'Log daily habits and watch the streak count grow.' },
    ],
  },
  {
    category: 'Productivity & CRUD',
    items: [
      { icon: '✅', title: 'Todo list with categories', desc: 'Classic task list, grouped and filterable.', widget: {
        rootOrder: ['M1'],
        machines: {
          M1: { id:'M1', name:'app', tag:'div', text:'', parentId:'', children:['M2','M3','M4'],
            css:{ display:'flex', flexDirection:'column', gap:'8px', padding:'14px', fontFamily:'system-ui,sans-serif', background:'#0d0d1a', borderRadius:'8px' },
            attrs:{}, wires:[
              { eventName:'todoAdded',  targetId:'', action:'pipeIn',  actionArgs:'addTodo' },
              { eventName:'fetchTodos', targetId:'', action:'pipeOut', actionArgs:'getTodos' },
            ], viewBinding:null },
          M2: { id:'M2', name:'row', tag:'div', text:'', parentId:'M1', children:['M2a','M2b'],
            css:{ display:'flex', gap:'6px' }, attrs:{}, wires:[], viewBinding:null },
          M2a: { id:'M2a', name:'todo_input', tag:'input', text:'', parentId:'M2', children:[],
            css:{ flex:'1', padding:'7px 10px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
            attrs:{ type:'text', placeholder:'New task…' }, wires:[], viewBinding:null },
          M2b: { id:'M2b', name:'add_btn', tag:'button', text:'Add', parentId:'M2', children:[],
            css:{ padding:'7px 14px', borderRadius:'5px', border:'none', background:'#a78bfa', color:'#000', fontWeight:'700', cursor:'pointer' },
            attrs:{}, transferOnClick:{ fromId:'M2a', eventName:'todoAdded' }, wires:[], viewBinding:null },
          M3: { id:'M3', name:'refresh_btn', tag:'button', text:'↻ Refresh list', parentId:'M1', children:[],
            css:{ padding:'5px 10px', borderRadius:'5px', border:'1px solid #333', background:'transparent', color:'#888', fontSize:'11px', cursor:'pointer', alignSelf:'flex-start' },
            attrs:{}, emitOnClick:'fetchTodos', wires:[], viewBinding:null },
          M4: { id:'M4', name:'todo_list', tag:'div', text:'', parentId:'M1', children:[],
            css:{ display:'flex', flexDirection:'column', gap:'4px' }, attrs:{}, wires:[], viewBinding:null },
        },
        events: { todoAdded:{name:'todoAdded',payload:'{value}'}, fetchTodos:{name:'fetchTodos',payload:'{}'} },
        pipes: {
          getTodos: { name:'getTodos', method:'GET', collection:'todos_ex', endpoint:'/api/db/todos_ex', delay:0, live:false },
          addTodo:  { name:'addTodo', method:'POST', collection:'todos_ex', endpoint:'/api/db/todos_ex', delay:0, live:false },
        },
        loops: { todosList: { name:'todosList', pipeName:'getTodos', targetId:'M4', dataField:'', clickEvent:'', clickView:'', clickValueField:'',
          template:'<div style="padding:6px 10px;border:1px solid #222;border-radius:5px;font-size:13px;color:#e2e8f0">☐ {{value}}</div>' } },
        dbCollections: [ { name:'todos_ex', isArray:true, seed:[ { value:'Buy milk' }, { value:'Ship the examples page' } ] } ],
        views: {}, logic: {}, templates: {}, vars: {}, _nextId: 8,
      } },
      { icon: '🗂️', title: 'Kanban-style task board', desc: 'Columns of cards moved through wires and events.' },
      { icon: '🗒️', title: 'Note-taking app', desc: 'Quick capture and browse of freeform notes.' },
      { icon: '📖', title: 'Guestbook / message board', desc: 'Visitors sign in with a short public message.', widget: {
        rootOrder: ['M1'],
        machines: {
          M1: { id:'M1', name:'app', tag:'div', text:'', parentId:'', children:['M2','M3','M4'],
            css:{ display:'flex', flexDirection:'column', gap:'8px', padding:'14px', fontFamily:'system-ui,sans-serif', background:'#0d0d1a', borderRadius:'8px' },
            attrs:{}, wires:[
              { eventName:'msgPosted',      targetId:'', action:'pipeIn',  actionArgs:'postMessage' },
              { eventName:'fetchRequested', targetId:'', action:'pipeOut', actionArgs:'getMessages' },
            ], viewBinding:null },
          M2: { id:'M2', name:'row', tag:'div', text:'', parentId:'M1', children:['M2a','M2b'],
            css:{ display:'flex', gap:'6px' }, attrs:{}, wires:[], viewBinding:null },
          M2a: { id:'M2a', name:'msg_input', tag:'input', text:'', parentId:'M2', children:[],
            css:{ flex:'1', padding:'7px 10px', borderRadius:'5px', border:'1px solid #333', background:'#06060f', color:'#e2e8f0' },
            attrs:{ type:'text', placeholder:'Sign the guestbook…' }, wires:[], viewBinding:null },
          M2b: { id:'M2b', name:'post_btn', tag:'button', text:'Post', parentId:'M2', children:[],
            css:{ padding:'7px 14px', borderRadius:'5px', border:'none', background:'#a78bfa', color:'#000', fontWeight:'700', cursor:'pointer' },
            attrs:{}, transferOnClick:{ fromId:'M2a', eventName:'msgPosted' }, wires:[], viewBinding:null },
          M3: { id:'M3', name:'refresh_btn', tag:'button', text:'↻ Refresh', parentId:'M1', children:[],
            css:{ padding:'5px 10px', borderRadius:'5px', border:'1px solid #333', background:'transparent', color:'#888', fontSize:'11px', cursor:'pointer', alignSelf:'flex-start' },
            attrs:{}, emitOnClick:'fetchRequested', wires:[], viewBinding:null },
          M4: { id:'M4', name:'messages_list', tag:'div', text:'', parentId:'M1', children:[],
            css:{ display:'flex', flexDirection:'column', gap:'4px' }, attrs:{}, wires:[], viewBinding:null },
        },
        events: { msgPosted:{name:'msgPosted',payload:'{value}'}, fetchRequested:{name:'fetchRequested',payload:'{}'} },
        pipes: {
          getMessages: { name:'getMessages', method:'GET', collection:'guestbook_ex', endpoint:'/api/db/guestbook_ex', delay:0, live:false },
          postMessage: { name:'postMessage', method:'POST', collection:'guestbook_ex', endpoint:'/api/db/guestbook_ex', delay:0, live:false },
        },
        loops: { messagesList: { name:'messagesList', pipeName:'getMessages', targetId:'M4', dataField:'', clickEvent:'', clickView:'', clickValueField:'',
          template:'<div style="padding:6px 10px;border:1px solid #222;border-radius:5px;font-size:13px;color:#e2e8f0">{{value}}</div>' } },
        dbCollections: [ { name:'guestbook_ex', isArray:true, seed:[ { value:'Great to see this in action!' }, { value:'Pipes + loops, no backend code.' } ] } ],
        views: {}, logic: {}, templates: {}, vars: {}, _nextId: 8,
      } },
      { icon: '👤', title: 'Contact list manager', desc: 'Add, search, and browse personal contacts.' },
      { icon: '🧾', title: 'Simple CRM (leads/contacts)', desc: 'Track leads through stages with logic blocks.' },
      { icon: '📌', title: 'Project tracker', desc: 'Status board for ongoing projects and milestones.' },
      { icon: '🗓️', title: 'Meeting notes log', desc: 'One entry per meeting, searchable by date.' },
      { icon: '🔖', title: 'Bookmark manager', desc: 'Save and tag links for later.' },
      { icon: '⏱️', title: 'Time-tracking log', desc: 'Start/stop entries logged straight to the database.' },
    ],
  },
];

module.exports = EXAMPLES;
