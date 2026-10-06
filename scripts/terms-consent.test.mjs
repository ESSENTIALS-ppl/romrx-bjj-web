// node scripts/terms-consent.test.mjs : terms acceptance record + re-accept gate (Stacy, Oct 5 2026)
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const flat = (s) => s.replace(/\{' '\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const terms = read('src/lib/terms.ts');
const gate = read('src/components/TermsReacceptGate.tsx');
const app = read('src/App.tsx');
const login = read('src/pages/Login.tsx');
const CHECKBOX = 'I have read and agree to the ROMRx LLC Terms of Service, Privacy Policy & Refund Policy , a company-wide agreement with ROMRx LLC and its products.';
let n = 0; const ok = (name) => { n++; console.log('PASS:', name); };

// versions
assert.match(terms, /export const TERMS_VERSION = '2026-10-03'/);
assert.match(terms, /export const MEDICAL_WAIVER_VERSION = TERMS_VERSION/);
assert.match(terms, /Terms section 3/);
assert.doesNotMatch(terms, /Sections 5 & 6/);
assert.match(terms, /export const REACCEPT_CONSENT_TEXT_VERSION = 'signup-checkbox-2026-10-05'/);
assert.match(terms, /export const REACCEPT_CONSENT_SOURCE = 'romrxbjj.com\/app\/reaccept'/);
ok('versions 2026-10-03 (terms = waiver, Terms section 3), re-accept source romrxbjj.com/app/reaccept');

// no client insert into consents anywhere, no IP capture
const srcFiles = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? srcFiles(join(d, e.name)) : [join(d, e.name)]);
for (const f of srcFiles('src')) {
  const s = read(f);
  assert.doesNotMatch(s, /from\('consents'\)\.insert/, f);
  assert.doesNotMatch(s, /recordConsent\(/, f);
}
assert.doesNotMatch(terms, /ip_address|x-forwarded-for|submit-consent/);
ok('no direct client insert into consents, no recordConsent, no IP path');

// gate: flag off by default, never on the production host via the query param
const enabledFn = terms.slice(terms.indexOf('export function isReacceptGateEnabled'), terms.indexOf('/** Routes where the gate never shows'));
assert.match(enabledFn, /if \(\(envFlag \?\? ''\)\.toLowerCase\(\) === 'on'\) return true/);
assert.match(enabledFn, /if \(hostname === 'romrxbjj.com' \|\| hostname === 'www\.romrxbjj.com'\) return false/);
ok('gate default OFF; ?reaccept_gate=1 ignored on romrxbjj.com');

// gate copy and checkbox behavior
assert.ok(gate.includes('Please confirm your agreement to continue.'));
assert.ok(flat(gate).includes(CHECKBOX), 'gate checkbox text equals romrx.io signup text');
assert.match(gate, /<a href="https:\/\/romrx\.io\/legal"[^>]*>\s*Terms of Service, Privacy Policy & Refund Policy\s*<\/a>/);
assert.match(gate, /\n\s*Continue\n/);
assert.ok(gate.includes('Sign out'));
assert.ok(gate.includes(`"We couldn't save that. Please try again."`));
assert.ok(gate.includes('const [agreed, setAgreed] = useState(false)'));
assert.equal((gate.match(/setAgreed\(/g) || []).length, 1);
assert.doesNotMatch(gate, /defaultChecked|setAgreed\(true\)/);
assert.ok(gate.includes('disabled={!agreed || saving}'));
assert.ok(gate.includes(".eq('terms_version', TERMS_VERSION)"));
assert.match(terms, /supabase\.rpc\('record_terms_reaccept'/);
assert.ok(app.includes('<TermsReacceptGate />'));
ok('gate: Stacy copy exactly, unchecked, user tap only, current version, server RPC, mounted');

// magic link never creates an account
assert.ok(login.includes('shouldCreateUser: false'));
ok('magic link: shouldCreateUser false');

// privacy (Stacy, Oct 5): unknown email is treated exactly like success
assert.ok(!login.includes("couldn't find an account"));
assert.match(login, /const noAccount = !!err && \/signups\? not allowed\|otp_disabled\|user\[_ \]not\[_ \]found\/i/);
assert.ok(login.includes('if (err && !noAccount) {'));
const handler = login.slice(login.indexOf('const noAccount'), login.indexOf('setCooldown(60)'));
assert.ok(handler.includes('setMagicSent(true)'));
assert.doesNotMatch(handler, /console\.|noAccount \?/);
const fl = flat(login);
assert.ok(fl.includes('New here? Create an account .'));
assert.match(login, /data-testid="magic-new-here">New here\? <a href=\{ownedBaseUrl\('login_cta'\)\}[^>]*>Create an account<\/a>\.<\/p>/);
assert.match(login, /\{!magicSent && \(\s*<p[^>]*>\s*New athlete\?/);
ok('magic link privacy: same screen whether or not the account exists; one Create an account link');

// BJJ: no account-creating signup path, so no signup record source exists here
const signup = read('src/pages/Signup.tsx'); const coach = read('src/pages/CoachSignup.tsx');
assert.doesNotMatch(signup + coach, /auth\.signUp\(/);
assert.ok(signup.includes('window.location.replace(baseExplainerUrl(search))'));
ok('BJJ: /signup redirects to romrx.io, /signup/coach is a waitlist; no account creation, no record written');
console.log(`${n} terms-consent checks passed.`);
