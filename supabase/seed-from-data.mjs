#!/usr/bin/env node
/* supabase/seed-from-data.mjs: builds supabase/seed.sql, the sample content for the Supabase database.

   The sample content is whatever the app writes into Store on a clean first load (the CRM people, timelines,
   lists, paths, petitions, broadcasts, crmConfig, crmMeta and so on), generated deterministically from data.js
   by crm.js and the screens. data.js itself stays a static file and is not copied into the database.

   Two ways to get that content:
     node supabase/seed-from-data.mjs --browse http://localhost:8000 --playwright /path/to/folder-with-node_modules
        Opens app.html for each county in headless Chromium with an empty profile (demo mode, browser storage),
        waits for App.crm to finish seeding, visits the screens that seed on first render, and reads every rccc:v1:* key.
     node supabase/seed-from-data.mjs --dump dump.json
        Uses a dump copied from a browser console on a fresh profile:
        copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('rccc:v1:')).map(k => [k, localStorage.getItem(k)]))))

   Options: --out <file> (default supabase/seed.sql), --tenants svgop,demo, --save-dump <file>.
   Output: one transaction of upserts. Every row gets sample = true and every document gets "sample": true.
   Re-running never overwrites a row someone edited (edits clear the sample flag on the server).
   Node 18+. No dependencies except Playwright for --browse. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const OUT = path.resolve(args.out || path.join(HERE, 'seed.sql'));
const TENANTS = String(args.tenants || 'svgop,demo').split(',').map((s) => s.trim()).filter(Boolean);
const LOCAL_ONLY = new Set(['session', 'accounts', 'siteVisitor', 'crmDrawerWidth', 'campaignSignups']);
const SCREENS = ['overview', 'people', 'outreach', 'portal', 'candidate', 'field', 'governance', 'master', 'director', 'mycampaign', 'account'];

function die(msg) { console.error('seed-from-data: ' + msg); process.exit(1); }

/* Collection rules come from schema.sql, so the seed and the policies never drift apart. */
function readPolicies() {
  const sql = fs.readFileSync(path.join(HERE, 'schema.sql'), 'utf8');
  const out = new Map();
  const re = /\(\s*'([A-Za-z][A-Za-z0-9_]*)',\s*'(tenant|global)',\s*'(coll|key)'/g;
  let m;
  while ((m = re.exec(sql))) out.set(m[1], { scope: m[2], kind: m[3] });
  if (!out.size) die('no collection policies found in schema.sql');
  return out;
}

async function dumpWithBrowser(base, pwDir) {
  let chromium;
  try {
    const req = createRequire(path.join(path.resolve(pwDir || process.cwd()), 'noop.js'));
    ({ chromium } = req('playwright'));
  } catch (e) { die('could not load Playwright. Pass --playwright <folder that contains node_modules/playwright>.'); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const root = String(base).replace(/\/+$/, '');
  for (const t of TENANTS) {
    await page.goto(`${root}/app.html?tenant=${t}&demo=1#/overview`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.App && window.App.crm && window.App.crm.isReady, null, { timeout: 30000 });
    for (const s of SCREENS) {
      await page.evaluate((h) => { location.hash = '#/' + h; }, s);
      await page.waitForTimeout(250);
    }
    await page.goto(`${root}/index.html?county=${t}&demo=1`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
  }
  const dump = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('rccc:v1:')) out[k] = localStorage.getItem(k); }
    return out;
  });
  await browser.close();
  if (errors.length) console.warn('seed-from-data: page errors while seeding:\n  ' + errors.slice(0, 5).join('\n  '));
  return dump;
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const jsonb = (v) => q(JSON.stringify(v)) + '::jsonb';

function toRows(dump, policies) {
  const rows = [], skipped = {};
  for (const [k, raw] of Object.entries(dump)) {
    const m = /^rccc:v1:([^:]+):(.+)$/.exec(k);
    if (!m) continue;
    const [, tenant, name] = m;
    const base = name.split(':')[0];
    if (LOCAL_ONLY.has(name) || name.startsWith('_')) { skipped[name] = 'browser only'; continue; }
    if (tenant !== 'global' && !TENANTS.includes(tenant)) { skipped[k] = 'county not requested'; continue; }
    const pol = policies.get(base);
    if (!pol) { skipped[name] = 'no policy (closed on the server)'; continue; }
    if ((pol.scope === 'global') !== (tenant === 'global')) { skipped[k] = 'wrong scope'; continue; }
    let value;
    try { value = JSON.parse(raw); } catch (e) { skipped[k] = 'unreadable JSON'; continue; }
    if (pol.kind === 'coll') {
      if (!Array.isArray(value)) { skipped[k] = 'expected an array'; continue; }
      for (const doc of value) {
        if (!doc || typeof doc !== 'object' || doc.id == null) continue;
        const data = Object.assign({}, doc, { id: String(doc.id), sample: true });
        rows.push({ tenant, coll: name, id: String(doc.id), data });
      }
    } else {
      rows.push({ tenant, coll: name, id: '__key__', data: value });
    }
  }
  // Petitions before signatures: the server derives a signature's owner from its petition.
  const order = (r) => (r.coll === 'petitions' ? 0 : r.coll === 'signatures' ? 2 : 1);
  rows.sort((x, y) => order(x) - order(y));
  return { rows, skipped };
}

function toSql(rows) {
  const byColl = {};
  rows.forEach((r) => { const k = r.tenant + ':' + r.coll; byColl[k] = (byColl[k] || 0) + 1; });
  const lines = [
    '-- supabase/seed.sql: sample content for the RCCC Network (generated by supabase/seed-from-data.mjs).',
    `-- Generated ${new Date().toISOString()} for ${TENANTS.join(', ')}. ${rows.length} rows. Run after schema.sql.`,
    '-- Every row is marked sample. Rows someone has edited (sample = false) are never overwritten.',
    '-- Remove a county\'s sample rows later with: select purge_sample(\'<county>\');',
    '--',
    ...Object.keys(byColl).sort().map((k) => `--   ${k.padEnd(36)} ${byColl[k]}`),
    '',
    'begin;',
  ];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    lines.push('insert into public.docs (tenant, coll, id, data, sample) values');
    lines.push(chunk.map((r) => `  (${q(r.tenant)}, ${q(r.coll)}, ${q(r.id)}, ${jsonb(r.data)}, true)`).join(',\n'));
    lines.push('on conflict (tenant, coll, id) do update set data = excluded.data, sample = true, updated_at = now() where public.docs.sample;');
  }
  lines.push('commit;', '');
  return lines.join('\n');
}

const policies = readPolicies();
let dump;
if (args.dump) {
  try { dump = JSON.parse(fs.readFileSync(path.resolve(args.dump), 'utf8')); } catch (e) { die('could not read ' + args.dump + ': ' + e.message); }
} else if (args.browse) {
  dump = await dumpWithBrowser(args.browse, args.playwright);
} else {
  die('pass --browse <url> (with --playwright <dir>) or --dump <file>. See the comment at the top of this file.');
}
if (args['save-dump']) fs.writeFileSync(path.resolve(args['save-dump']), JSON.stringify(dump));
const { rows, skipped } = toRows(dump, policies);
if (!rows.length) die('the dump has no sample content. Was it taken from a fresh profile after the app loaded?');
fs.writeFileSync(OUT, toSql(rows));
console.log(`seed-from-data: wrote ${rows.length} rows to ${path.relative(ROOT, OUT)}`);
const sk = Object.entries(skipped);
if (sk.length) console.log('skipped:\n' + sk.map(([k, v]) => `  ${k}: ${v}`).join('\n'));
