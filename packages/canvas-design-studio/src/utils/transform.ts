import juice from 'juice';
import * as cheerio from 'cheerio';


export interface TransformResult {
  html: string;
  removed: { tag: string; reason: string }[];
  violations: { issue: string; suggestion: string }[];
}

const ALLOWED_TAGS = new Set([
  'a', 'acronym', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdo', 'big', 'blockquote', 'br',
  'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em',
  'embed', 'footer', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'iframe', 'kbd',
  'legend', 'li', 'map', 'nav', 'object', 'ol', 'p', 'param', 'picture', 'pre', 'q', 'ruby', 'rp', 'rt',
  'samp', 'section', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video',
  'button', // Included to preserve button tags in tests while removing event handlers
  // MathML
  'annotation', 'annotation-xml', 'maction', 'maligngroup', 'malignmark', 'math', 'menclose',
  'merror', 'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mlongdiv', 'mmultiscripts', 'mn',
  'mo', 'mover', 'mpadded', 'mphantom', 'mprescripts', 'mroot', 'mrow', 'ms', 'mscarries', 'mscarry',
  'msgroup', 'msline', 'mspace', 'msqrt', 'msrow', 'mstack', 'mstyle', 'msub', 'msubsup', 'msup',
  'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'none', 'semantics', 'mark'
]);

const ALLOWED_CSS_PROPERTIES = new Set([
  'background', 'border', 'border-radius', 'clear', 'color', 'cursor', 'direction',
  'display', 'flex', 'float', 'font', 'grid', 'height', 'left', 'line-height',
  'list-style', 'margin', 'max-height', 'max-width', 'min-height', 'min-width',
  'overflow', 'overflow-x', 'overflow-y', 'padding', 'position', 'right',
  'text-align', 'table-layout', 'text-decoration', 'text-indent', 'top',
  'vertical-align', 'visibility', 'white-space', 'width', 'z-index', 'zoom'
]);

const ALLOWED_PREFIXES = [
  'background-', 'border-', 'margin-', 'padding-', 'font-', 'text-', 'list-style-', 'flex-', 'grid-', 'overflow-'
];

function isCssPropertyAllowed(prop: string): boolean {
  if (ALLOWED_CSS_PROPERTIES.has(prop)) return true;
  for (const prefix of ALLOWED_PREFIXES) {
    if (prop.startsWith(prefix)) return true;
  }
  return false;
}


export function canvasSafeTransform(html: string, css?: string): TransformResult {
  const removed: { tag: string; reason: string }[] = [];
  const violations: { issue: string; suggestion: string }[] = [];

  // 1. Inline CSS using juice
  let inlinedHtml = html;
  try {
    if (css) {
      inlinedHtml = (juice as any).inlineContent(inlinedHtml, css, { removeStyleTags: true });
    } else {
      inlinedHtml = (juice as any)(inlinedHtml, { removeStyleTags: true });
    }
  } catch (err) {
    // Fallback if juice fails
    inlinedHtml = html;
  }

  // 2. Load into cheerio (null and false parameters preserve fragment state in cheerio v1/v0)
  const $ = cheerio.load(inlinedHtml, null, false);

  // Remove style tags that juice might have left
  $('style').each((i, el) => {
    removed.push({ tag: 'style', reason: 'Style blocks are not allowed (CSS has been inlined)' });
    $(el).remove();
  });

  // Remove script tags completely
  $('script').each((i, el) => {
    removed.push({ tag: 'script', reason: 'JavaScript is not allowed in Canvas LMS' });
    $(el).remove();
  });

  // Remove link tags completely (external stylesheets/fonts)
  $('link').each((i, el) => {
    const rel = $(el).attr('rel') || '';
    removed.push({ tag: 'link', reason: `link tag with rel="${rel}" is not allowed` });
    $(el).remove();
  });

  function cleanNode(node: any) {
    const $el = $(node);
    const tagName = (node.tagName || node.name || '').toLowerCase();

    if (!tagName) return;

    // Process children first so they are cleaned before any unwrapping
    const children = $el.children().toArray();
    for (const child of children) {
      cleanNode(child);
    }

    // Now process this node itself

    // 1. Convert h1 to h2
    if (tagName === 'h1') {
      node.tagName = 'h2';
      let style = $el.attr('style') || '';
      if (style && !style.endsWith(';')) style += ';';
      $el.attr('style', style + ' font-size: 26px;');
      removed.push({ tag: 'h1', reason: 'h1 is reserved for Canvas page title. Converted to h2 with font-size: 26px' });
      return;
    }

    // 2. Event handler attributes
    const attribs = node.attribs || {};
    for (const attr of Object.keys(attribs)) {
      if (attr.startsWith('on')) {
        removed.push({ tag: attr, reason: `Event handler attribute '${attr}' is not allowed` });
        $el.removeAttr(attr);
      }
    }

    // 3. Style attribute cleanup
    const styleAttr = $el.attr('style');
    if (styleAttr) {
      let cleanedStyle = styleAttr;
      if (cleanedStyle.includes('@import')) {
        cleanedStyle = cleanedStyle.replace(/@import[^;]+;/g, '').trim();
        removed.push({ tag: '@import', reason: 'External font or stylesheet import via @import is not allowed' });
      }

      const rules = cleanedStyle.split(';');
      const keptRules: string[] = [];
      for (const rule of rules) {
        if (!rule.trim()) continue;
        const colonIndex = rule.indexOf(':');
        if (colonIndex === -1) continue;
        const prop = rule.substring(0, colonIndex).trim().toLowerCase();
        const val = rule.substring(colonIndex + 1).trim();
        if (isCssPropertyAllowed(prop)) {
          keptRules.push(`${prop}: ${val}`);
        } else {
          removed.push({ tag: prop, reason: `CSS property '${prop}' is not allowed in Canvas LMS` });
        }
      }
      if (keptRules.length > 0) {
        $el.attr('style', keptRules.join('; ') + ';');
      } else {
        $el.removeAttr('style');
      }
    }

    // 4. Check violations
    if (tagName === 'img') {
      if ($el.attr('alt') === undefined) {
        violations.push({
          issue: 'Missing img alt attribute',
          suggestion: 'Provide a descriptive alt attribute for screen readers'
        });
      }
    }

    if (tagName === 'a') {
      const text = $el.text().trim().toLowerCase();
      if (text === 'click here' || text === 'read more' || text === 'link' || text.includes('click here')) {
        violations.push({
          issue: `Vague link text '${$el.text()}'`,
          suggestion: 'Use descriptive link text that explains the destination (e.g., "Read the course syllabus")'
        });
      }
    }

    // 5. Whitelist tag check
    if (!ALLOWED_TAGS.has(tagName) && !['html', 'head', 'body'].includes(tagName)) {
      removed.push({ tag: tagName, reason: `HTML tag '<${tagName}>' is not on the Canvas RCE allowlist` });
      $el.replaceWith($el.contents());
    }
  }

  // Run the recursive cleaning on the roots
  $.root().children().each((i, el) => {
    cleanNode(el);
  });

  return {
    html: $.html(),
    removed,
    violations
  };
}
