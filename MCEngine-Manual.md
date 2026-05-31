# MCEngine — Complete User Manual

**Version 1.0 · Magic Cat Engine**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Interface Overview](#2-interface-overview)
3. [Machines](#3-machines)
4. [The Canvas](#4-the-canvas)
5. [Inspector Panel](#5-inspector-panel)
6. [Events](#6-events)
7. [Wires](#7-wires)
8. [Pipes](#8-pipes)
9. [Views & URL Routing](#9-views--url-routing)
10. [Loops](#10-loops)
11. [Logic Panel](#11-logic-panel)
12. [Variables (Vars)](#12-variables-vars)
13. [Database System](#13-database-system)
14. [Live Preview & Export](#14-live-preview--export)
15. [Runtime Styles](#15-runtime-styles)
16. [Keyboard Shortcuts](#16-keyboard-shortcuts)
17. [Quick Reference](#17-quick-reference)

---

## 1. Introduction

MCEngine (Magic Cat Engine) is a visual no-code/low-code IDE for building interactive, database-driven web pages. You compose a page from **Machines** — individual HTML elements — then wire them together with **Events**, **Pipes**, **Views**, **Loops**, and **Logic** blocks to create fully functional applications without writing layout code.

Every project exports to a single, standalone HTML file or a portable JSON file that can be re-imported and edited at any time.

### Key concepts at a glance

| Concept | What it is |
|---|---|
| Machine | One HTML element (div, button, input, etc.) with CSS, text, and wiring |
| Event | A named signal that machines can emit and listen for |
| Wire | A rule: *when event X fires, do action Y on machine Z* |
| Pipe | An HTTP connection to a backend API or the in-memory DB |
| Loop | A repeating template rendered once per document from a pipe |
| View | A named page state — shows/hides sets of machines, updates the URL |
| Logic | Branching code blocks (if/elseif/else/loop) attached to a machine |
| Var | A project-wide variable substituted into text and accessible in code |

---

## 2. Interface Overview

The IDE is divided into four regions:

```
┌─────────────────────────────────────────────────────────────────┐
│  Toolbar   (project name · undo/redo · save · export · import)  │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │                              │                   │
│  Left Panel  │         Canvas Area          │  Inspector Panel  │
│  (tabs)      │  (canvas / DOM / live /      │  (props / wire /  │
│              │   preview)                   │   data)           │
│              │                              │                   │
├──────────────┴──────────────────────────────┴───────────────────┤
│                        Logger Panel                             │
└─────────────────────────────────────────────────────────────────┘
```

### Toolbar

| Control | Action |
|---|---|
| Project name field | Rename the current project |
| Undo / Redo | Step through up to 50 project snapshots |
| Save (☁) | Save to cloud account, or download JSON if cloud unavailable |
| Export JSON | Download a `.mce.json` file of the full project |
| Export HTML | Download a standalone `.html` file ready to deploy |

### Left Panel tabs

| Tab | Purpose |
|---|---|
| **Machines** | Add new machines; view root machine list |
| **Events** | Define named events; fire them for testing |
| **Pipes** | Create and test API connections |
| **Views** | Define page views and their URL parameters |
| **CSS** | Edit the selected machine's CSS with property pickers |
| **Logic** | Build if/elseif/else/loop chains for the selected machine |
| **Loops** | Create and manage loop templates |
| **Vars** | Define global project variables |
| **DB** | Browse and edit the Live and Mock databases |

### Canvas area tabs

| Tab | Description |
|---|---|
| **Canvas** | WYSIWYG visual editor with draggable, selectable machines |
| **DOM Tree** | Hierarchical tree of all machines showing nesting |
| **Live** | Scaled real-time iframe — instant feedback as you change CSS |
| **Preview** | Full render of the exported script in a preview frame |

### Inspector Panel tabs

| Tab | Description |
|---|---|
| **Props** | Name, tag, text content, HTML attributes, quick actions |
| **Wire** | Event wires, emit-on-click, emit-on-input, pipe bindings, view binding, transforms |
| **Data** | DB push/pull, custom DB source, pipe list with test buttons |

### Logger Panel

Located at the bottom. Shows timestamped, colour-coded entries for all engine activity. Log levels:

- **✓ OK** — success (green)
- **⊙ INFO** — informational (default)
- **⚠ WARN** — warning (amber)
- **✕ ERROR** — error (red)

**Controls:** Clear · Toggle (collapse/expand) · stats badge showing OK/WARN/ERROR counts.

---

## 3. Machines

A **Machine** is a single HTML element. Every visual thing on the page is a machine. Machines can be nested inside other machines (parent → children), forming the page tree.

### Creating machines

- Click **+ Machine** in the canvas toolbar to add a sibling of the selected machine, or a root machine if nothing is selected.
- Click **+ Child** to add a machine nested inside the selected machine.
- Select the tag from the tag dropdown before clicking.

### Available tags

`div` · `section` · `article` · `header` · `footer` · `main` · `nav` · `aside` · `p` · `span` · `h1` · `h2` · `h3` · `h4` · `button` · `input` · `textarea` · `select` · `option` · `img` · `a` · `label` · `pre` · `ul` · `li`

Self-closing tags (`input`, `img`, `br`, `hr`) render without children or closing tags.

### Machine properties

Every machine has:

| Property | Description |
|---|---|
| **id** | Internal ID (e.g. `M1`, `M7`) — auto-assigned, referenced by wires and logic |
| **label** | Human-readable name shown in the canvas and DOM tree |
| **tag** | HTML element type |
| **text** | Text content. Supports `{{varName}}` substitution |
| **css** | Object of CSS property → value pairs |
| **attrs** | Additional HTML attributes (id, class, placeholder, type, onclick, etc.) |
| **wires** | Array of event wires (see §7) |
| **viewBinding** | View name(s) this machine is bound to (see §9) |
| **emitOnClick** | Event name to emit when this machine is clicked |
| **emitOnInput** | Event name to emit on every input change, carrying `value` |
| **children** | Ordered list of child machine IDs |
| **parentId** | Parent machine ID, or empty string for root machines |

### Deleting a machine

Select the machine and press **Delete** (confirmation required). All children are deleted with it.

### Variable substitution in text

If a Var named `username` has value `"Alice"`, setting a machine's text to `Hello, {{username}}!` renders as `Hello, Alice!` in exports.

---

## 4. The Canvas

### Canvas mode (WYSIWYG)

- **Click** a machine to select it. The Inspector Panel updates to show its properties.
- **Nested machines** are rendered inside their parents, mirroring the final HTML layout.
- The canvas strips animations and transitions so editing is instant.
- `position:fixed` elements are rendered as `position:absolute` inside the canvas viewport so they remain editable.

### View selector

The toolbar dropdown above the canvas lets you activate a specific view, showing only machines bound to that view (plus unbound machines). Choose **— all —** to see everything.

### Zoom

Use the zoom slider (10%–100%) to scale the canvas. Useful for large full-page layouts.

### DOM Tree mode

Switches the canvas area to a collapsible tree view of all machines. Each row shows:
- Tag name
- Machine label
- Badge with wire count
- Indent level indicating nesting

Click any row to select that machine in the Inspector.

### Live mode

Renders the current project in a scaled `srcdoc` iframe. Updates automatically when you change CSS. Use this for accurate layout previews with viewport-aware CSS (`100vh`, `position:fixed`, etc.).

### Preview mode

Runs the full exported script in a preview frame. All events, wires, pipes, loops, logic, and views are functional. Use this to test interactive behaviour before exporting.

---

## 5. Inspector Panel

### Props tab

**Identity**
- **Name** (label): Human-readable machine name.
- **Tag**: HTML element. Change with the tag selector dropdown.

**Text Content**
- Textarea for the machine's text content.
- Supports `{{varName}}` substitution.
- For self-closing elements (input, img) this field has no effect.

**Attributes**
- Add arbitrary HTML attributes as key-value pairs.
- Examples: `type=email`, `placeholder=Search…`, `data-id=42`, `onclick=doSomething()`.
- Attributes are rendered directly on the HTML element in exports.

**Quick Actions**
Buttons that immediately apply an action to the selected machine in the canvas:
Show · Hide · Toggle · Fade In · Fade Out · Fade to Black · Run Logic

---

### Wire tab

#### Event Wires

A wire is a rule of the form: **when** *event* **fires, do** *action* **on** *target*.

Each wire has four fields:

| Field | Description |
|---|---|
| **ON** | Event name to listen for |
| **TO** | Target machine (select from dropdown; "self" targets the machine that owns the wire) |
| **DO** | Action to perform (see §7 for all actions) |
| **Args** | Arguments for the action — literal text, `{{THIS.VALUE}}`, or `{{varName}}` |

For text-setting actions (setText, setHTML, setValue), the Args field also has a variable picker:
- **THIS.VALUE** — uses the payload's `value` field (the data carried by the event)
- **{{varName}}** — inserts the current value of a project variable

Multiple wires can listen to the same event. All matching wires fire in registration order.

#### Emit Event on Click

Select an event from the dropdown to fire it automatically when this machine is clicked. No code needed. Generates `onclick="EventBus.emit('eventName', {})"`.

#### Emit Value on Input *(inputs, textareas, selects only)*

Fires a selected event on every `input` change, carrying `{ value: this.value }` as the payload. Wire a target machine with `setValue → {{THIS.VALUE}}` to create a live-linked field pair.

#### Transfer Value on Click *(buttons only)*

When the button is clicked, reads the value from a **source machine** and emits it as an event. Fields:
- **Source machine** — the machine whose value is read
- **Event** — the event to emit with `{ value: sourceValue }`

Useful for "copy field value to another field" without writing code.

#### Pipe Bindings

Binds a GET pipe's output to this machine's content. When the pipe fetches, the first document's selected field is written to this machine.

| Field | Description |
|---|---|
| **Pipe** | Select any GET pipe |
| **Target** | `innerHTML`, `textContent`, `value`, `src`, or `href` |

#### View Binding

Enter a comma-separated list of view names (e.g. `home,about`). This machine is visible only when one of those views is active. Leave empty to always show.

In the exported HTML, view-bound machines start hidden (`display:none`). ViewSystem reveals the correct ones on load based on the URL.

#### Input Transform

Applies a filter to data arriving into this machine via pipes, setText, setValue, or wire actions.

- Select a filter from the dropdown (17 available — see §17)
- Optional arg field (e.g. length for TRUNCATE, default for DEFAULT)

#### Output Transform

Applies a filter when reading this machine's value via `MCE_OUT('machineId')` in code.

---

### Data tab

#### Machine Document (DB Push/Pull)

- **Push** — Saves the machine's current text, CSS, and attributes to the `_machines` system collection in the DB, keyed by machine ID.
- **Pull** — Loads the stored document back into the machine, updating its text and CSS.
- The stored JSON is shown below the buttons.

#### Custom DB Source

Overrides what field `dbPull` reads from the DB.

| Field | Description |
|---|---|
| **Collection** | Which DB collection to read from |
| **Field** | Which field of the document to use as the machine's text |

If left empty, dbPull uses the `_machines` system collection.

#### Pipes

Lists all defined pipes with their method and endpoint. Each row has **Test** (GET pipes) and **Execute** (write pipes) buttons to run them manually from the inspector.

---

## 6. Events

An **Event** is a named signal. Machines emit events and other machines listen to them via Wires. Events carry an optional payload object.

### Creating an event

In the **Events** tab:
1. Enter a unique event name (alphanumeric, dashes, underscores).
2. Add an optional payload description (for documentation — e.g. `{ value } — user's selected item`).
3. Click **Add**.

### Firing events manually

Every event in the list has a **Fire** button. Click it to emit the event immediately with an empty payload — useful for testing wires without clicking buttons in the canvas.

### Built-in events

The engine fires these automatically:

| Event | When |
|---|---|
| `view:name` | When ViewSystem navigates to the view named `name` |
| `view:changed` | On any view change; payload: `{ view, params }` |
| `loop:name:rendered` | After a loop renders; payload: `{ loop, count, data }` |
| `pipe:name:fetched` | After a GET pipe completes; payload: `{ pipe, data, response }` |
| `pipe:name:written` | After a POST/PUT/DELETE pipe completes |
| `db:change` | After any DB insert/update/remove/clear |

### EventBus API

Available in Logic code blocks and `attrs.onclick` handlers:

```js
EventBus.emit('eventName', { value: 'hello' });  // fire an event
EventBus.on('eventName', function(payload) { ... }); // listen (advanced)
```

---

## 7. Wires

A wire connects an event to an action. When the event fires, the action executes on the target machine.

### Complete action reference

#### Display actions

| Action | Effect |
|---|---|
| `show` | Sets `el.style.display = ''` — reveals the element |
| `hide` | Sets `el.style.display = 'none'` — hides the element |
| `toggle` | Toggles between hidden and visible |
| `fadeIn` | Animates opacity from 0 to 1 over 0.4 s |
| `fadeOut` | Animates opacity from 1 to 0 over 0.4 s, then hides |
| `fadeToBlack` | Fades the document body background to black |

#### Style actions

| Action | Args | Effect |
|---|---|---|
| `addClass` | `"class1 class2"` | Adds one or more CSS classes |
| `removeClass` | `"class1 class2"` | Removes one or more CSS classes |
| `toggleClass` | `"className"` | Toggles a single CSS class |

#### Content actions

| Action | Args | Effect |
|---|---|---|
| `setText` | Literal or `{{THIS.VALUE}}` | Sets `el.textContent` (safe, no HTML) |
| `setHTML` | HTML string or `{{THIS.VALUE}}` | Sets `el.innerHTML` (renders HTML tags) |
| `setValue` | Literal or `{{THIS.VALUE}}` | Sets `el.value` (for inputs/selects) |

All three content actions apply the machine's **Input Transform** filter if one is configured.

#### Event actions

| Action | Args | Effect |
|---|---|---|
| `emit` | Event name | Fires that event with an empty payload |
| `navigate` | `"viewName"` or `"viewName?key=val"` | Navigates to a view, optionally with static URL params |

> **Note on `navigate`:** The `actionArgs` string is parsed statically. If you need dynamic parameters from loop data or runtime values, call `ViewSystem.navigate(viewName, paramsObj)` directly in a Logic code block or `attrs.onclick` handler.

#### Data actions

| Action | Args | Effect |
|---|---|---|
| `pipeOut` | Pipe name | Fetches from a GET pipe; result flows to loops and pipe bindings |
| `pipeIn` | Pipe name | Executes a write pipe (POST/PUT/DELETE) with the event payload as body |
| `dbPull` | *(none)* | Reads from the DB using this machine's DB Source config |
| `dbPush` | *(none)* | Pushes machine state to the `_machines` collection |

#### Rendering actions

| Action | Args | Effect |
|---|---|---|
| `loopRender` | Loop name | Triggers a loop to re-fetch its pipe and re-render |
| `log` | Message string | Writes a message to the Logger panel |

---

## 8. Pipes

A **Pipe** is a named HTTP connection between the engine and a backend API. Pipes abstract the HTTP layer — you configure a pipe once and fire it by name from wires, logic, or the inspector.

### Creating a pipe

In the **Pipes** tab, fill in:

| Field | Description |
|---|---|
| **Name** | Unique identifier. Used in `pipeOut`, `pipeIn`, `loopRender` action args. |
| **Method** | `GET`, `POST`, `PUT`, or `DELETE` |
| **Endpoint** | API URL path (e.g. `/api/showcase/contacts`) |
| **Collection** | DB collection name this pipe reads/writes |
| **Live** | If checked, makes real HTTP fetch calls to the server. If unchecked, operates against the in-memory Mock DB. |
| **Delay** | Simulated latency in milliseconds (default 300). Only applies in mock mode. |
| **Schema** | Field definitions for POST/PUT pipes. Each field has a key and type (text, number, boolean, date). |
| **Description** | Notes for documentation |

### Live vs Mock mode

| | Mock (live = false) | Live (live = true) |
|---|---|---|
| Data source | In-memory Mock DB (`PREVIEW_DB`) | Real server via `fetch()` |
| Persistence | Resets on page reload | Permanent (MongoDB) |
| Authentication | None | Requires login session |
| Use case | Prototyping, demos | Production data |

### How pipeOut works (GET)

When `pipeOut pipeName` fires:

1. PipeSystem determines live vs mock.
2. **Mock**: Reads from `PREVIEW_DB[pipe.collection]`, applies query filters if present.
3. **Live**: Calls `fetch(pipe.endpoint, { credentials: 'same-origin' })`, parses JSON response.
4. Passes resulting data array to `LoopSystem.renderAll(pipeName, data)` — all loops with `pipeName` re-render.
5. Applies results to any pipe bindings on machines.
6. Fires event `pipe:pipeName:fetched`.

### How pipeIn works (POST/PUT/DELETE)

When `pipeIn pipeName` fires with an event payload:

1. **Mock**: Performs the DB operation directly on `PREVIEW_DB`.
   - POST → inserts document
   - PUT → updates matching documents
   - DELETE → removes matching documents
2. **Live**: Calls `fetch(pipe.endpoint, { method, body: JSON.stringify(payload) })`.
3. Fires event `pipe:pipeName:written`.

### Query parameters

When calling `PipeSystem.fetch(pipeName, query)` in code:

```js
PipeSystem.fetch('readUsers', { q: 'alice' });       // full-text search
PipeSystem.fetch('readUsers', { role: 'admin' });    // field match
```

### Testing pipes

Click **Test** (GET) or **Execute** (write) next to a pipe in the **Data** tab or **Pipes** tab to run it immediately and see the request and response in a modal.

---

## 9. Views & URL Routing

**Views** are named page states. A View shows certain machines and hides others, and pushes a `?view=name` parameter to the browser URL, enabling deep-linking and browser history navigation.

### Creating a view

In the **Views** tab:

| Field | Description |
|---|---|
| **Name** | Unique view name. Used in `navigate` actions, `viewBinding`, and the `?view=` URL param. |
| **Title** | Human-readable label (shown in the canvas dropdown) |
| **Params** | Comma-separated names of URL parameters this view expects (documentation only) |
| **Description** | Notes |

### Binding machines to views

In the **Wire** tab → **View Binding**, enter a comma-separated list of view names. The machine is shown only when one of those views is active. Leave empty to always show.

**Important CSS rule:** Do not put `display:flex` (or any display value) on a view-bound machine's own CSS. Put flex/grid on inner child machines instead. When the engine hides a view-bound machine it prepends `display:none;` and strips any existing `display` value from the inline style. On reveal, `el.style.display = ''` removes the property entirely and the browser falls back to the element's default (`block` for `<section>`). Flex layout on the *children* is unaffected.

### Default view

The first view in the `views` object is activated automatically when no `?view=` parameter is present in the URL. Order your views accordingly.

### Navigating between views

**From a wire:**
```
action: navigate
args: history
```
or with static parameters:
```
args: detail?id=42&title=MyProject
```

**From code (dynamic parameters):**
```js
ViewSystem.navigate('detail', { id: item.id, title: item.title });
```

This pushes the URL `?view=detail&id=42&title=MyProject` to browser history, shows machines bound to `detail`, hides all others, and fires two events:
- `view:detail` — with `{ id: '42', title: 'MyProject' }` as payload
- `view:changed` — with `{ view: 'detail', params: { id: '42', title: 'MyProject' } }`

### Reading URL parameters

In Logic code blocks and `attrs.onclick` handlers:

```js
ViewSystem.getParam('id');      // returns '42' or null
ViewSystem.getParams();         // returns { view: 'detail', id: '42', title: 'MyProject' }
```

In Logic blocks, `params` is also available as a context variable:

```js
params.id       // same as ViewSystem.getParam('id')
```

### Listening for view events

Wire any machine to listen for `view:viewName` to auto-fire an action when that view activates:

```
eventName: view:list
action: pipeOut
args: readContacts
```

This pattern auto-loads data whenever the list view is opened.

### Browser history

The exported HTML supports browser back and forward buttons. Navigating back restores the previous view and its parameters.

---

## 10. Loops

A **Loop** renders an HTML template once for every document returned by a GET pipe, injecting the result into a target machine's `innerHTML`.

### Creating a loop

In the **Loops** tab:

| Field | Description |
|---|---|
| **Name** | Unique identifier for this loop |
| **Source Pipe** | A GET pipe whose data drives this loop |
| **Target Machine** | The machine whose innerHTML is replaced with rendered cards |
| **Template** | HTML string with `{{field}}` tokens |
| **Description** | Notes |

### Template syntax

```html
<div class="card">
  <h2>{{title}}</h2>
  <p>{{description|TRUNCATE:80}}</p>
  <span>{{price|CURRENCY}}</span>
  <small>Item {{_index}} of {{_total}}</small>
</div>
```

| Token | Description |
|---|---|
| `{{fieldName}}` | Value of `fieldName` from the current document |
| `{{fieldName\|FILTER}}` | Value with a filter applied |
| `{{fieldName\|FILTER:arg}}` | Value with a filter and argument |
| `{{_index}}` | 1-based position of this document in the array |
| `{{_total}}` | Total number of documents |
| `{{varName}}` | Value of a project variable (from Vars) |

### Filters (17 available)

| Filter | Effect | Example |
|---|---|---|
| `UPPER` | Uppercase | `hello` → `HELLO` |
| `LOWER` | Lowercase | `HELLO` → `hello` |
| `TITLE` | Title case | `hello world` → `Hello World` |
| `TRIM` | Strip whitespace | `" hi "` → `hi` |
| `REVERSE` | Reverse string | `abc` → `cba` |
| `SLUG` | URL-safe slug | `Hello World!` → `hello-world` |
| `INITIALS` | First letter of each word | `John Smith` → `JS` |
| `FIRST` | First word | `Hello World` → `Hello` |
| `LAST` | Last word | `Hello World` → `World` |
| `BOOL` | `true`/`false` → Yes/No | `true` → `Yes` |
| `NUMBER` | Locale thousands separator | `1234567` → `1,234,567` |
| `CURRENCY` | Dollar format | `1234.5` → `$1,234.50` |
| `PERCENT` | Append % | `85` → `85%` |
| `ROUND` | Round to integer | `3.7` → `4` |
| `ABS` | Absolute value | `-5` → `5` |
| `DATE` | Locale date string | timestamp → `5/31/2026` |
| `TRUNCATE:N` | Truncate to N chars | `TRUNCATE:20` |
| `DEFAULT:x` | Fallback if empty | `DEFAULT:N/A` |

### Preset templates

The loop editor provides four preset templates you can load and modify:
- **List Row** — horizontal flex row
- **Card** — vertical card with title, body, badge
- **Compact Line** — single tight line per item
- **Table Row** — `<tr>` with field cells

### Onclick handlers in templates

Because templates are HTML strings, dynamic navigation with loop data must use inline `onclick`:

```html
<div onclick="ViewSystem.navigate('detail',{id:'{{id}}',title:'{{title}}'});">
  {{title}}
</div>
```

> **Do not use the `navigate` wire action for dynamic loop parameters** — wire action args are parsed as static strings. Only `ViewSystem.navigate()` called directly in an onclick supports dynamic values from `{{field}}` substitutions.

---

## 11. Logic Panel

The **Logic Panel** lets you attach conditional, branching, and iterating behaviour to any machine without a separate code file. Select a machine, then open the **Logic** tab in the left panel.

### Overview

Logic is a tree of **blocks**. When logic runs, it evaluates blocks top to bottom. Each block can:
- Test a condition (if/elseif/else)
- Iterate a DB collection (loop)
- Fire a list of actions (show, hide, setText, etc.)
- Execute arbitrary JavaScript code
- Contain nested child blocks

Logic attached to machine `M10` is triggered by calling `LogicSystem.run('M10', ctx)` — typically from an `attrs.onclick` handler on a button.

### Block types

#### if block

```
type:      if
condition: JavaScript expression that returns truthy/falsy
actions:   list of actions to fire if condition is true
code:      optional JavaScript to run if condition is true
children:  nested blocks that run inside this branch
```

Resets the chain state. Subsequent `elseif` and `else` blocks are evaluated only if this `if` is false.

#### elseif block

```
type:      elseif
condition: JavaScript expression
```

Evaluated only if no preceding `if` or `elseif` in the same chain has passed. If this condition is true, its actions and code run; no further `elseif`/`else` in the chain fires.

#### else block

```
type:      else
condition: (none)
```

Runs if and only if every preceding `if` and `elseif` in the chain was false.

#### loop block

```
type:       loop
collection: DB collection name to iterate
itemVar:    variable name for current item (default: "item")
query:      optional JSON filter, e.g. {"active": true}
actions:    per-item actions
code:       per-item JavaScript
children:   nested blocks per item
```

A loop block is **independent of the if/elseif/else chain**. It always runs when the chain reaches it, regardless of which branch ran before. Use this to run code unconditionally after a conditional section.

Inside a loop block, the context includes:
- `ctx[itemVar]` — the current document (e.g. `ctx.item` if itemVar is `"item"`)
- `ctx._index` — zero-based position
- `ctx._total` — total number of items

### Actions in blocks

Every block (if/elseif/else/loop) has an **Actions** list. Actions fire **before** the block's code runs. The full action set is identical to wire actions — see the action reference in §7.

Action targets are selected from a dropdown of all machines. Leave target as **self** (empty) to target the machine that owns the logic.

### Code in blocks

Each block has an optional **Code** textarea. Code runs after actions. It is a JavaScript function body with the following variables in scope:

| Variable | Type | Description |
|---|---|---|
| `ctx` | object | Context passed to `LogicSystem.run(id, ctx)`, or the loop item |
| `DB` | object | In-memory database — find, findOne, insert, update, remove, clear |
| `EventBus` | object | `emit(name, payload)` |
| `ViewSystem` | object | `navigate(view, params)`, `getParam(key)`, `getParams()` |
| `LoopSystem` | object | `render(loopName, data)`, `renderAll(pipeName, data)` |
| `PipeSystem` | object | `fetch(pipeName, query)` |
| `MCE_VARS` | object | All project variables as `{ name: stringValue }` |
| `view` | string | Currently active view name |
| `params` | object | Current URL parameters |
| `vars` | object | Same as `MCE_VARS` |
| `loops` | object | All loop definitions |
| `machine` | object | Current machine definition object |

`document` is available as a browser global. DOM queries work as expected:

```js
var el = document.querySelector('[data-mce-id=M8]');
if (el) el.value = '';
```

> **CSS selector note:** When querying machines by `data-mce-id` inside an `attrs.onclick` HTML attribute, use unquoted attribute selectors — `[data-mce-id=M8]` — because the onclick value is inside a double-quoted HTML attribute and inner `"` would break the attribute parsing. Inside Logic code blocks (which run via `new Function`, not HTML), quoted selectors `[data-mce-id="M8"]` are also valid.

### Block nesting and children

Clicking **+ if / + elseif / + else / + loop** inside an open block's editor adds a **child** block. Children run inside the parent branch — they are only evaluated if the parent block's condition passes.

Clicking the **after↓** row of buttons adds a **sibling** block immediately after the current one, at the same level.

### Running logic

**From the Logic panel:**
- Click **▶ Run** (top) to execute with an empty `ctx`.
- Fill the **ctx JSON** field and click **▶ Run** to pass a custom context object.

**From a button in Live Preview / exported HTML:**

```js
// In attrs.onclick:
var ctx = { name: el.value, score: scoreEl.value };
if (typeof LogicSystem !== 'undefined') LogicSystem.run('M10', ctx);
else if (typeof MachineSystem !== 'undefined') MachineSystem.executeLogic('M10', ctx);
```

The double check (`LogicSystem` for live preview, `MachineSystem` for canvas) ensures the button works in both environments.

### Execution order within a block

For each block that passes its condition:
1. **Actions** fire (in list order)
2. **Code** runs
3. **Children** are evaluated (recursively)

---

## 12. Variables (Vars)

**Vars** are project-wide string variables. Define them once; use them everywhere.

### Creating a variable

In the **Vars** tab:

| Field | Description |
|---|---|
| **Name** | JavaScript-safe identifier (letters, numbers, `_`, `$`) |
| **Value** | Initial string value |
| **Description** | Optional note |
| **Public** | If checked, syncs to DB when the project is saved |

### Using variables

| Context | Syntax |
|---|---|
| Machine text | `{{varName}}` |
| Loop template | `{{varName}}` |
| Wire action args (text actions) | Select from the variable picker dropdown |
| Logic condition | `vars.varName` |
| Logic code | `vars.varName` or `MCE_VARS.varName` |
| attrs.onclick code | `MCE_VARS.varName` (global) |

All variables are exported as the global `MCE_VARS` object in the HTML:

```js
var MCE_VARS = { passMark: "60", appName: "Grade Calculator" };
```

### Updating variables at runtime

Use a **Set Var on Event** wire (Wire tab) to capture an event's payload into a variable at runtime. When the event fires, the variable updates and downstream `{{varName}}` substitutions that are re-rendered will reflect the new value.

---

## 13. Database System

MCEngine provides two database environments that share the same API.

### Mock DB (Preview Database)

The Mock DB is an **in-memory** store built at the moment you switch to Live Preview or run a preview. It is populated from:

1. **dbCollections seed data** defined in the project JSON.
2. Any **DB.insert()** calls made during the preview session.
3. **DB.createCollection()** calls from `_loadJSON`.

The Mock DB is reset every time you switch to or reload the preview. It is the default for pipes with `live: false`.

### Live DB (MongoDB)

The Live DB is the real MongoDB instance on the server. Accessible through the **DB tab** in the left panel, and through pipes with `live: true`. Operations require the user to be logged in.

### Seed data

Define initial documents in the project JSON under `dbCollections`:

```json
"dbCollections": [
  {
    "name": "contacts",
    "seed": [
      { "name": "Alice", "email": "alice@example.com" },
      { "name": "Bob",   "email": "bob@example.com" }
    ]
  }
]
```

> **Field name:** Use `"seed"` not `"records"`. The engine reads `c.seed` at line 4064 of `engine.html`. Using `"records"` is silently ignored and the collection loads empty.

### DB API

Available in Logic code blocks as `DB`:

#### `DB.find(collection, query)`

Returns an array of matching documents.

```js
DB.find('contacts', {});                   // all documents
DB.find('contacts', { category: 'Work' }); // field match
DB.find('contacts', { q: 'alice' });       // full-text search across all fields
```

#### `DB.findOne(collection, query)`

Returns the first matching document, or `null`.

```js
var user = DB.findOne('users', { email: 'alice@example.com' });
```

#### `DB.insert(collection, doc)`

Inserts a document. Auto-adds `_id` (integer, auto-increment) and `_created` (timestamp).

```js
var record = DB.insert('contacts', {
  name: 'Carol',
  email: 'carol@example.com',
  date: new Date().toLocaleDateString('en-US')
});
// record._id is now set
```

Fires `db:change` event with `{ collection, op: 'insert', doc: record }`.

#### `DB.update(collection, query, update)`

Updates all documents matching `query` by merging `update` fields in. Adds `_updated` timestamp. Returns count of updated documents.

```js
DB.update('tasks', { _id: 42 }, { done: true });
```

#### `DB.remove(collection, query)`

Removes all documents matching `query`. Returns count removed.

```js
DB.remove('contacts', { _id: 7 });
```

#### `DB.clear(collection)`

Empties the entire collection.

#### `DB.getCollections()`

Returns an array of collection names (excluding system collections prefixed with `_`).

### Collection types

Collections can be **Array** (stores multiple documents, default) or **Single** (stores one document object). Array type is suitable for lists. Single type is suitable for singleton config or profile data.

### System collections

`_machines` is a reserved collection used by DB Push/Pull. It stores machine state snapshots keyed by machine ID.

---

## 14. Live Preview & Export

### Live Preview (Live Canvas tab)

Opens the project in a scaled `srcdoc` iframe. All systems are active:
- EventBus wires
- PipeSystem (mock DB)
- LoopSystem
- ViewSystem (URL params, popstate)
- LogicSystem
- DB (Mock, in-memory)

The iframe can call back to the parent canvas via `window.parent` — click-to-select is bridged so clicking a machine in the live preview selects it in the inspector.

### Preview tab

Runs the same export script in a full-height preview frame. Functionally identical to the exported HTML.

### Export HTML

**Toolbar → Export HTML** downloads a complete, standalone `.html` file.

The exported file contains:
- All machine HTML with `data-mce-id` attributes
- Inline CSS (all machine styles)
- The full runtime script including:
  - EventBus
  - PipeSystem (mock + live)
  - LoopSystem
  - ViewSystem
  - LogicSystem
  - FilterSystem
  - DB (snapshot of Mock DB at export time)
  - All wires, loops, vars, logic
- No external dependencies

The exported HTML is self-contained and can be opened in any browser or hosted on any static server.

### Export JSON

**Toolbar → Export JSON** downloads the complete project as a `.mce.json` file. Import it back with **Import JSON** to resume editing.

The JSON includes all machines, events, pipes, views, loops, vars, logic, dbCollections (with seed data), and runtimeStyle.

### Import JSON

**Toolbar → Import JSON** (or the Import button in the toolbar). Accepts `.json` and `.mce.json` files. On import:

1. All project state is replaced.
2. DB collections with `"seed"` data are created in the Mock DB.
3. Logic blocks are backfilled with default fields for compatibility.
4. Mock API endpoints are registered for all pipes.
5. The canvas re-renders.

---

## 15. Runtime Styles

Runtime styles are colour theme presets that control the IDE's own appearance. They do not affect the exported HTML.

Select a style and click **Apply** to switch:

| Style | Character |
|---|---|
| **Mono Black** | Pure black background, white text — high contrast |
| **Graphite Steel** | Cool grey tones |
| **Paper Light** | Light beige/cream — easy on the eyes |
| **Ocean Console** | Deep blue/cyan — the default dark theme |
| **Forest Lab** | Muted green earth tones |
| **Ember Night** | Warm orange and amber |
| **Clean Studio** | White, minimal |

Each style sets CSS custom properties: `--bg0` through `--bg4` (backgrounds), `--acc1` through `--acc4` (accent colours), `--txt1` through `--txt3` (text), `--brd` / `--brd2` (borders), `--info` / `--ok` / `--warn` / `--err` (status colours).

---

## 16. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo |
| `Ctrl+S` / `Cmd+S` | Save to cloud / Export JSON |
| `Ctrl+E` / `Cmd+E` | Export JSON |
| `Ctrl+P` / `Cmd+P` | Run Preview |
| `Ctrl+D` / `Cmd+D` | Switch to DOM Tree tab |
| `↑` / `↓` | Cycle through machines (in DOM tree order) |
| `Delete` | Delete selected machine (confirmation required) |
| `Escape` | Close open modal |

---

## 17. Quick Reference

### All wire / logic actions

| Action | Target | Args | Description |
|---|---|---|---|
| `show` | Machine | — | `el.style.display = ''` |
| `hide` | Machine | — | `el.style.display = 'none'` |
| `toggle` | Machine | — | Toggle visible/hidden |
| `fadeIn` | Machine | — | Animate opacity 0→1 (0.4s) |
| `fadeOut` | Machine | — | Animate opacity 1→0 (0.4s), then hide |
| `fadeToBlack` | Document | — | Body background fades to black |
| `addClass` | Machine | `"cls1 cls2"` | Add CSS classes |
| `removeClass` | Machine | `"cls1 cls2"` | Remove CSS classes |
| `toggleClass` | Machine | `"cls"` | Toggle one CSS class |
| `setText` | Machine | Text / `{{THIS.VALUE}}` | Set textContent |
| `setHTML` | Machine | HTML / `{{THIS.VALUE}}` | Set innerHTML |
| `setValue` | Machine | Value / `{{THIS.VALUE}}` | Set .value |
| `emit` | — | Event name | Fire named event |
| `navigate` | — | `"view"` or `"view?k=v"` | Navigate to view (static args only) |
| `pipeOut` | — | Pipe name | GET pipe → loops + bindings |
| `pipeIn` | — | Pipe name | Write pipe with payload as body |
| `dbPull` | Machine | — | Load from DB source |
| `dbPush` | Machine | — | Push machine state to DB |
| `loopRender` | — | Loop name | Re-fetch pipe + re-render loop |
| `log` | Logger | Message | Log to IDE logger panel |

### DB methods (in Logic code)

```js
DB.find(collection, query)          // → array
DB.findOne(collection, query)       // → doc or null
DB.insert(collection, doc)          // → doc with _id
DB.update(collection, query, upd)   // → count
DB.remove(collection, query)        // → count
DB.clear(collection)
DB.getCollections()                 // → string[]
```

### Logic code context variables

```js
ctx          // event payload or loop item + _index + _total
DB           // database API
EventBus     // { emit(name, payload) }
ViewSystem   // { navigate(view, params), getParam(key), getParams() }
LoopSystem   // { render(name, data), renderAll(pipeName, data) }
PipeSystem   // { fetch(name, query) }
MCE_VARS     // { varName: "stringValue", ... }
view         // "currentViewName"
params       // { key: "value", ... } — current URL params
vars         // same as MCE_VARS
loops        // all loop definitions
machine      // current machine definition object
```

### ViewSystem API

```js
ViewSystem.navigate('viewName', { key: 'value' });
ViewSystem.getParam('key');     // → "value" or null
ViewSystem.getParams();         // → { view, key, ... }
```

Fires `view:viewName` and `view:changed` events.

### EventBus API

```js
EventBus.emit('eventName', { value: 'data' });
EventBus.on('eventName', function(payload) { ... });
```

### Loop template tokens

```
{{field}}            document field value
{{field|FILTER}}     with filter
{{field|FILTER:arg}} with filter + argument
{{_index}}           1-based position
{{_total}}           total document count
{{varName}}          project variable value
```

### Loop filters

`UPPER` · `LOWER` · `TITLE` · `TRIM` · `REVERSE` · `SLUG` · `INITIALS` · `FIRST` · `LAST` · `BOOL` · `NUMBER` · `CURRENCY` · `PERCENT` · `ROUND` · `ABS` · `DATE` · `TRUNCATE:N` · `DEFAULT:fallback`

### `{{THIS.VALUE}}` in wire action args

When a wire action arg contains `{{THIS.VALUE}}`, it is replaced at runtime with `payload.value` (or `payload.text` as fallback) from the event that triggered the wire. This allows event-driven value passing without code:

```
source input  → emitOnInput → 'inputChanged'
target label  → wire: ON inputChanged, DO setText, Args: {{THIS.VALUE}}
```

### Querying machines in onclick / Logic code

```js
// Preferred — no inner quotes, HTML-safe:
document.querySelector('[data-mce-id=M8]')

// Also valid in Logic code blocks (not in HTML attribute values):
document.querySelector('[data-mce-id="M8"]')
```

### Demo files included

| File | Demonstrates |
|---|---|
| `mce-pipe-demo.mce.json` | Pipe → GET endpoint → Loop renders cards |
| `mce-views-demo.mce.json` | Three views, URL params, navigate with dynamic data |
| `mce-db-write-demo.mce.json` | Form → DB.insert / fetch POST → navigate → Loop reads updated DB |
| `mce-logic-demo.mce.json` | Full Logic panel: if/elseif/else chain, loop block, vars, actions, code, EventBus |

---

*MCEngine — Magic Cat Engine · Built by Adam Dompatchett*
