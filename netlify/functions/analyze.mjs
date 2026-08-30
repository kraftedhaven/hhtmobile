const ALLOWED_CATEGORIES = new Set([
  '15724','63861','63867','11484','57988','63866','185100','15687','11483','155183','57990','93427','169291','169284'
]);
const BAG_CATEGORIES = new Set(['169291','169284']);
const SHOE_CATEGORY = '93427';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json({ error: 'Secure analysis is not configured yet. Add GROQ_API_KEY to Netlify environment variables and redeploy.' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON request.' }, 400); }
  const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
  if (!images.length) return json({ error: 'At least one image is required.' }, 400);
  if (images.some(image => !image || typeof image.data !== 'string' || !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image.data))) {
    return json({ error: 'Only JPEG, PNG, WebP, or GIF data URLs are accepted.' }, 400);
  }
  const prompt = typeof body.prompt === 'string' && body.prompt.length < 20000 ? body.prompt : 'Analyze this item for an eBay listing and return JSON.';
  const content = [{ type: 'text', text: prompt }];
  images.forEach(image => content.push({ type: 'image_url', image_url: { url: image.data } }));

  let providerResponse;
  try {
    providerResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' }
      })
    });
  } catch (error) {
    return json({ error: `Vision provider connection failed: ${error.message}` }, 502);
  }

  const providerBody = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    const message = providerBody?.error?.message || `Vision provider returned HTTP ${providerResponse.status}.`;
    return json({ error: message }, providerResponse.status === 429 ? 429 : 502);
  }
  const raw = providerBody?.choices?.[0]?.message?.content;
  if (!raw) return json({ error: 'The vision provider returned no analysis.' }, 502);

  try {
    const result = normalize(parseObject(raw));
    return json({ result }, 200);
  } catch (error) {
    return json({ error: `The vision provider returned an unusable result: ${error.message}` }, 502);
  }
}

function parseObject(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value).replace(/```json|```/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSON object was not found.');
  return JSON.parse(text.slice(start, end + 1));
}

function normalize(input) {
  const result = { ...input };
  const brand = text(input.brand) || 'No Brand';
  const type = text(input.type) || 'Item';
  const cat = ALLOWED_CATEGORIES.has(text(input.cat)) ? text(input.cat) : '';
  const bag = BAG_CATEGORIES.has(cat) || /handbag|crossbody|clutch|backpack|tote|purse/i.test(type);
  const shoe = cat === SHOE_CATEGORY || /shoe|sneaker|boot|loafer|sandal/i.test(type);
  const vintage = /yes/i.test(text(input.vin)) && /pre.?1999|vintage/i.test(`${text(input.vin)} ${text(input.notes)}`) ? 'Yes (pre-1999)' : 'No';
  let title = text(input.title) || `${brand} ${type}`;
  if (vintage && !/vintage/i.test(title)) title = `Vintage ${title}`;
  if (/gucci/i.test(brand) && /authentic/i.test(title) && /made in (korea|china|vietnam|turkey|indonesia|india|thailand|bangladesh)/i.test(text(input.madeIn))) title = title.replace(/authentic\s*/ig, '').replace(/\s{2,}/g, ' ').trim();
  title = fitTitle(title, brand);

  let notes = text(input.notes);
  const madeIn = text(input.madeIn);
  if (/gucci/i.test(brand) && madeIn && !/italy|italia/i.test(madeIn)) {
    notes += `${notes ? ' ' : ''}Luxury-brand review required: the visible Made In label is not the expected Gucci origin. Do not describe this item as authentic; verify before listing.`;
  }
  if (/gucci|louis vuitton|chanel|prada|fendi|hermès?|versace|burberry|coach|michael kors|tory burch|balenciaga|dior|saint laurent|ysl/i.test(brand) && !madeIn) {
    notes += `${notes ? ' ' : ''}Luxury-brand review required: Made In label was not visible. Do not claim authentication without independent verification.`;
  }
  if (!cat) notes += `${notes ? ' ' : ''}Category could not be mapped confidently to the supplied eBay category list.`;
  if (!text(input.size) && !bag) notes += `${notes ? ' ' : ''}Size was not clearly visible; verify the tag before export.`;

  const cid = ['1000','1500','3000','4000','5000','6000'].includes(text(input.cid)) ? text(input.cid) : '3000';
  const conditionNote = text(input.cnote) || (cid === '1000' ? 'New with tags; verify all photos.' : cid === '1500' ? 'New without tags; verify all photos.' : 'Pre-owned. Review all photos for wear, stains, pilling, fading, holes, and other flaws.');
  const material = text(input.mat) || 'Not visible';
  const size = bag ? 'N/A - bag' : (text(input.size) || 'Not visible');
  const sizeType = bag ? 'N/A - bag' : (text(input.st) || 'Regular');
  const sleeve = bag ? 'N/A - bag' : shoe ? 'N/A - footwear' : (text(input.slv) || 'Not visible');
  const neckline = bag ? 'N/A - bag' : shoe ? 'N/A - footwear' : (text(input.nk) || 'Not visible');
  const desc = htmlOnly(text(input.desc)) || generatedDescription({ title, brand, size, color: text(input.color), material, type, conditionNote, madeIn, serialNumber: text(input.serialNumber), measurements: text(input.measurements), notes });

  return {
    title, price: number(input.price), cid, cnote: conditionNote, cat, brand,
    size, color: text(input.color) || 'Not visible', dept: text(input.dept) || 'Unisex Adults',
    type, style: text(input.style) || 'Casual', mat: material, pat: text(input.pat) || 'Solid',
    slv: sleeve, nk: neckline, sea: text(input.sea) || 'All Seasons', occ: text(input.occ) || 'Everyday',
    st: sizeType, vin: vintage, desc, notes, madeIn, serialNumber: text(input.serialNumber), measurements: text(input.measurements)
  };
}

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function number(value) { const n = Number.parseFloat(value); return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0; }
function fitTitle(value, brand) {
  let title = text(value).replace(/\s+/g, ' ');
  if (brand && !title.toLowerCase().startsWith(brand.toLowerCase())) title = `${brand} ${title}`;
  if (title.length <= 80) return title;
  const words = title.split(' '), out = [];
  for (const word of words) {
    const candidate = out.length ? `${out.join(' ')} ${word}` : word;
    if (candidate.length > 80) break;
    out.push(word);
  }
  return out.join(' ').trim() || title.slice(0, 80).trim();
}
function htmlOnly(value) {
  if (!value) return '';
  const stripped = value.replace(/<(?!\/?(?:p|ul|li|strong)\b)[^>]*>/gi, '').replace(/\r?\n/g, ' ').trim();
  return /<\/?(?:p|ul|li|strong)\b/i.test(stripped) ? stripped : '';
}
function generatedDescription(data) {
  const details = [
    `<li><strong>Brand:</strong> ${safe(data.brand)}</li>`,
    `<li><strong>Size:</strong> ${safe(data.size)}</li>`,
    `<li><strong>Color:</strong> ${safe(data.color || 'Not visible')}</li>`,
    `<li><strong>Material:</strong> ${safe(data.material)}</li>`,
    `<li><strong>Condition:</strong> ${safe(data.conditionNote)}</li>`,
    data.madeIn ? `<li><strong>Made In label:</strong> ${safe(data.madeIn)}</li>` : '',
    data.serialNumber ? `<li><strong>Interior patch / serial:</strong> ${safe(data.serialNumber)}</li>` : '',
    data.measurements ? `<li><strong>Measurements:</strong> ${safe(data.measurements)}</li>` : ''
  ].filter(Boolean).join('');
  const review = /review|required|authentic/i.test(data.notes) ? `<p><strong>Seller review:</strong> ${safe(data.notes)}</p>` : '';
  return `<p><strong>${safe(data.title)}</strong></p><p>${safe(data.brand)} ${safe(data.type.toLowerCase())} item. Please review all photos and item specifics before purchase.</p><ul>${details}</ul>${review}<p>Ships from Kettering, Ohio. 30-day returns accepted.</p>`;
}
function safe(value) { return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function json(value, status) { return new Response(JSON.stringify(value), { status, headers: cors }); }

export const config = { path: '/.netlify/functions/analyze' };
