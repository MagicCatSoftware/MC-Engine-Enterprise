const express = require('express');
const router  = express.Router();
let Anthropic;
try { Anthropic = require('@anthropic-ai/sdk'); } catch(e) { /* gracefully degrade if SDK not installed */ }
const { requireLogin, requireSubscription, isAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const aiLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyFn: req => 'ai:' + req.user._id });

router.use(requireLogin, requireSubscription);

const SYSTEM_PROMPT = `You are a Magic Cat Engine (MCE) project generator. MCE is a visual no-code IDE where users build apps from Machines, Events, Pipes, and Wires.

SCHEMA:
- machines: { [id]: { id, tag (HTML tag), name, text (inner text), css (camelCase object), attrs (HTML attrs), children ([id,...]), parentId, wires ([{eventName, targetId, action, actionArgs}]), emitOnClick (event name), emitOnInput (event name), pipeBindings ([{pipeName, field, action}]), viewBinding (view name or null), domEvents ([{on, event, payload}]), visibleWhen ({varName, op, value}), validation ([{rule, param, errorEvent}]), timeline ({duration, loop, autoplay, keyframes:[]}), code (JS string), varWires ([])}
- events: { [name]: { name, payload } }
- pipes: { [name]: { name, method (GET/POST/PUT/DELETE), collection, endpoint, delay, live (bool), queryTemplate, bodyTemplate } }
- loops: { [name]: { name, pipeName, targetId, dataField, template (HTML string with {{field}} tokens), clickEvent, pageSize, paginationId, clientFilter } }
- vars: { [name]: { value, desc } }
- views: { [name]: { name, title, description } }
- rootId: the id of the top-level root machine to add to rootOrder

Wire actions include: show, hide, toggle, fadeIn, fadeOut, setText, setHTML, setValue, emit, navigate, pipeOut, pipeIn, runCode, runLogic, playTimeline, stopTimeline, gotoFrame, loopRender.

RULES:
1. Return ONLY a valid JSON object — no markdown, no explanation, no code fences.
2. All machine IDs must start with "ai_" followed by a descriptive slug (e.g. "ai_submit_btn").
3. The rootId machine must have parentId: null.
4. Child machines must reference their parent's ID in parentId.
5. Use semantic HTML tags (button, input, p, h1, div, form, textarea, select, ul, li, img, etc.).
6. CSS values must be strings. Use camelCase keys (backgroundColor not background-color).
7. Keep it minimal — only generate what the user asked for. Don't add extra chrome.
8. If the user asks for a pipe, use live: false and a reasonable /api/ endpoint.
9. Return fields only for what you're generating. Omit empty collections.

Return format:
{
  "machines": { ... },
  "events": { ... },
  "pipes": { ... },
  "loops": { ... },
  "vars": { ... },
  "views": { ... },
  "rootId": "ai_..."
}`;

router.post('/generate', aiLimit, async (req, res) => {
  const { prompt, existingEvents = [], existingPipes = [], existingVars = [] } = req.body || {};
  if (!prompt || prompt.trim().length < 3) return res.status(400).json({ error: 'Prompt required' });
  if (!Anthropic) return res.status(503).json({ error: 'AI generation not available — @anthropic-ai/sdk not installed on this server' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI generation not configured — ANTHROPIC_API_KEY not set' });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const userMsg = `Build this: ${prompt.trim()}

Context — existing events: ${existingEvents.length ? existingEvents.join(', ') : 'none'}
Existing pipes: ${existingPipes.length ? existingPipes.join(', ') : 'none'}
Existing vars: ${existingVars.length ? existingVars.join(', ') : 'none'}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = msg.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'AI did not return valid JSON', raw: text.slice(0, 500) });

    let generated;
    try { generated = JSON.parse(jsonMatch[0]); }
    catch(e) { return res.status(502).json({ error: 'AI JSON parse error: ' + e.message, raw: text.slice(0, 500) }); }

    if (!generated.machines || !generated.rootId) return res.status(502).json({ error: 'AI response missing machines or rootId', raw: text.slice(0, 500) });
    res.json(generated);
  } catch(e) {
    console.error('[AI] generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
