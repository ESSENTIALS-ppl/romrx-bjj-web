// node scripts/base-assessment-redirect.test.mjs : the BJJ assessment is retired (Jim, Oct 6 2026).
// Every entry point goes to the Base assessment on romrx.io (sign-in with next + return_to=bjj),
// and My Game keeps one tier per technique after a retest. Unit checks (transpiled with the
// repo's TypeScript) + source checks on routes and pages.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'base-assess-'));
async function load(rel) {
  const out = ts.transpileModule(src(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const f = join(tmp, rel.replace(/[\/]/g, '_').replace(/\.ts$/, '.mjs'));
  writeFileSync(f, out);
  return import(pathToFileURL(f).href);
}
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', n, name); };
const ba = await load('src/lib/baseAssessment.ts');
const el = await load('src/lib/eligibility.ts');

ok('hand-off URL: romrx.io sign-in, next = Base assessment with return_to=bjj', () => {
  const u = new URL(ba.BASE_ASSESSMENT_HREF);
  assert.equal(u.origin, 'https://romrx.io');
  assert.equal(u.pathname, '/app/login');
  assert.equal(u.searchParams.get('next'), '/onboarding/assessment?return_to=bjj');
  assert.equal([...u.searchParams.keys()].join(','), 'next');
});
ok('goToBaseAssessment uses the same tab (so the return lands here)', () => {
  const calls = [];
  globalThis.window = { location: { assign: (x) => calls.push(x) } };
  ba.goToBaseAssessment();
  assert.deepEqual(calls, [ba.BASE_ASSESSMENT_HREF]);
  delete globalThis.window;
});
ok('route /onboarding/assessment renders the redirect, the old wizard is not routed or imported', () => {
  const app = src('src/App.tsx');
  assert.match(app, /<Route path="\/onboarding\/assessment" element={<BaseAssessmentRedirect \/>} \/>/);
  assert.doesNotMatch(app, /import \{ Assessment \} from '\.\/pages\/Assessment'/);
  assert.doesNotMatch(app, /element={<Assessment \/>}/);
  // results/paywall route stays behind OnboardingRoute
  assert.match(app, /<Route element={<OnboardingRoute \/>}>\s*<Route path="\/onboarding\/results"/);
});
ok('redirect: signed in -> Base hand-off, signed out -> Base explainer, waits for SSO tokens', () => {
  const r = src('src/components/BaseAssessmentRedirect.tsx');
  assert.match(r, /window\.location\.replace\(session \? BASE_ASSESSMENT_HREF : baseExplainerUrl\(window\.location\.search\)\)/);
  assert.match(r, /if \(loading \|\| hasAuthToken\) return/);
  assert.match(r, /return <Spinner \/>/);
});
ok('no page links to the old /onboarding/assessment any more', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const hits = walk(join(ROOT, 'src')).filter((p) => /\.(tsx?|jsx?)$/.test(p))
    .filter((p) => !p.endsWith('App.tsx') && !p.endsWith('pages/Assessment.tsx'))
    .filter((p) => /(href=|navigate\()\s*\{?\s*["'`]\/onboarding\/assessment/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(hits, []);
});
ok('entry points use the hand-off (MyBody, MyProtocol, ResultsPreview, Settings x3)', () => {
  assert.match(src('src/pages/MyBody.tsx'), /action={<a href={BASE_ASSESSMENT_HREF} className="btn-primary text-sm">Get started<\/a>}/);
  assert.match(src('src/pages/MyProtocol.tsx'), /onClick={goToBaseAssessment}/);
  assert.match(src('src/pages/ResultsPreview.tsx'), /<button onClick={goToBaseAssessment} className="btn-primary">Take Assessment<\/button>/);
  assert.equal((src('src/pages/Settings.tsx').match(/href={BASE_ASSESSMENT_HREF}/g) || []).length, 3);
});
ok('labels unchanged (no new customer copy in this app)', () => {
  assert.match(src('src/pages/Settings.tsx'), /\+ New Assessment/);
  assert.match(src('src/pages/Settings.tsx'), /Take your first assessment/);
  assert.match(src('src/pages/Settings.tsx'), /Retest\n/);
});
ok('My Game: one tier per technique, newest computed wins, ordered by tier', () => {
  const rows = [
    { technique_id: 'a', tier: 'RED', computed_at: '2026-07-07T20:07:00Z' },
    { technique_id: 'a', tier: 'GREEN', computed_at: '2026-10-11T15:00:00Z' },
    { technique_id: 'b', tier: 'YELLOW', computed_at: '2026-07-07T20:07:00Z' },
    { technique_id: 'b', tier: 'YELLOW', computed_at: null },
    { technique_id: 'c', tier: 'RED', computed_at: '2026-10-11T15:00:00Z' },
  ];
  const out = el.latestPerTechnique(rows);
  assert.deepEqual(out.map((r) => `${r.technique_id}:${r.tier}`), ['a:GREEN', 'c:RED', 'b:YELLOW']);
  assert.equal(el.latestPerTechnique([]).length, 0);
});
ok('useProfile: dedupes from technique_eligibility (bjj), falls back to the RPC rows', () => {
  const s = src('src/hooks/useProfile.ts');
  assert.match(s, /\.from\('technique_eligibility'\)/);
  assert.match(s, /\.eq\('sport', 'bjj'\)/);
  assert.match(s, /let eligibilityRows: TechniqueEligibility\[\] = result\.eligibility \?\? \[\]/);
  assert.match(s, /if \(!teError && teRows && teRows\.length > 0\)/);
});
console.log(`\n${n} checks passed`);
