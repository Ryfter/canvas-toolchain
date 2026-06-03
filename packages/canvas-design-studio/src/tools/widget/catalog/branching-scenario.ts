// packages/canvas-design-studio/src/tools/widget/catalog/branching-scenario.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Choice = z.object({
  label: z.string().min(1),
  nextNodeId: z.string().min(1),
  consequence: z.string().optional(),
});

const Node = z.object({
  prompt: z.string().min(1),
  choices: z.array(Choice),
  isEnd: z.boolean().optional(),
});

const BranchingContent = z.object({
  start: z.string().min(1),
  nodes: z.record(z.string().min(1), Node),
}).refine(
  (v) => Object.keys(v.nodes).length >= 1,
  { message: 'nodes must be non-empty' },
).refine(
  (v) => v.start in v.nodes,
  { message: 'start must reference an existing node id' },
).refine(
  (v) => Object.values(v.nodes).every(n => n.choices.every(c => c.nextNodeId in v.nodes)),
  { message: 'every choice.nextNodeId must reference an existing node id' },
);

type BranchingContent = z.infer<typeof BranchingContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const branchingScenarioRenderer: Renderer<BranchingContent> = {
  kind: 'branching-scenario',
  contentSchema: BranchingContent,

  validateContent(content): Result<BranchingContent> {
    const parsed = BranchingContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const startNode = content.nodes[content.start]!;
    const choicesHtml = startNode.choices.map((c, i) => `
    <button type="button" class="choice-btn touch-target" data-next-node-id="${escapeHtml(c.nextNodeId)}" aria-label="Choice ${i + 1}: ${escapeHtml(c.label)}">${escapeHtml(c.label)}</button>`).join('');

    const body = `<div class="scenario-wrapper">
  <div class="consequence" role="status"></div>
  <div class="scenario-prompt" id="scenario-prompt">${escapeHtml(startNode.prompt)}</div>
  <div class="scenario-choices">${choicesHtml}
  </div>
  <button type="button" class="restart-btn touch-target" style="display:none;" aria-label="Restart scenario">Restart</button>
</div>`;

    const css = `
.scenario-wrapper { padding: 16px; max-width: 720px; }
.scenario-prompt {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  font-size: 18px;
}
.scenario-choices { display: flex; flex-wrap: wrap; }
.scenario-choices > * { margin: 4px; }
.choice-btn, .restart-btn {
  background: #ffffff;
  border: 1px solid #0033A0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 16px;
  font-family: inherit;
}
.choice-btn:hover { background: #E6ECF9; }
.restart-btn { background: #0033A0; color: #ffffff; border: none; }
.consequence {
  background: #E6F1FB;
  color: #185FA5;
  border: 1px solid #185FA5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  font-style: italic;
  min-height: 0;
}
.consequence:empty { display: none; }
`.trim();

    const dataJson = JSON.stringify({ start: content.start, nodes: content.nodes });
    const js = `
(function() {
  var data = ${dataJson};
  var promptEl = document.getElementById('scenario-prompt');
  var choicesEl = document.querySelector('.scenario-choices');
  var consequenceEl = document.querySelector('.consequence');
  var restartBtn = document.querySelector('.restart-btn');

  function renderNode(nodeId, consequence) {
    var node = data.nodes[nodeId];
    consequenceEl.textContent = consequence || '';
    promptEl.textContent = node.prompt;
    choicesEl.innerHTML = '';
    if (node.isEnd || !node.choices.length) {
      restartBtn.style.display = '';
      window.__announce((consequence ? consequence + ' ' : '') + node.prompt + ' (scenario complete)');
    } else {
      restartBtn.style.display = 'none';
      node.choices.forEach(function(c, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice-btn touch-target';
        btn.setAttribute('data-next-node-id', c.nextNodeId);
        btn.setAttribute('data-consequence', c.consequence || '');
        btn.setAttribute('aria-label', 'Choice ' + (i + 1) + ': ' + c.label);
        btn.textContent = c.label;
        choicesEl.appendChild(btn);
      });
      window.__announce((consequence ? consequence + ' ' : '') + node.prompt);
    }
  }

  choicesEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.choice-btn');
    if (!btn) return;
    renderNode(btn.getAttribute('data-next-node-id'), btn.getAttribute('data-consequence'));
  });
  restartBtn.addEventListener('click', function() {
    renderNode(data.start, '');
  });
})();
`.trim();

    return { body, css, js };
  },
};
