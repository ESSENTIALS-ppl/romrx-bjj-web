// ROMRx AI Chat v48 - sport-aware + competency-aware + BASE-native path
// - v48: removed placeholder-detection heuristic. Any values present in the
//   assessments row are treated as the athlete's real measurements. ROMBot
//   never tells the athlete their assessment is a placeholder or asks them
//   to redo it - one assessment stands until the athlete chooses to re-test.
// - v45 fixes ROMBot on Base HQ ignoring assessment data:
//   * derives lowest joints inline from raw _l/_r measurements when
//     worst_joints is null (was blocking coaching answers)
//   * surfaces recent protocol_sessions count and last date explicitly
//   * hard-instructs ROMBot to USE the joint measurements in the prompt
// - v43 added BASE athlete mode (sport-agnostic mobility layer on romrx.io):
//   when sport === 'base', ROMBot ignores users.active_sport, reads the
//   latest assessment (any sport) from `assessments`, pulls general mobility
//   exercises from `exercises` (sports @> ['general']), and uses a
//   brand-neutral mobility coach prompt with NO BJJ/BB language.
// ROMRx AI Chat v33 - sport-aware + competency-aware
// - v33 adds athlete self-rated COMPETENCY: ROMBot now knows which techniques
//   the athlete has marked Learning / Drilled / Rolling / Taught in My Game,
//   so it can tailor advice (reinforce Learning, don't re-teach Taught, push
//   Drilled toward live rolling). Injected into BJJ athlete prompt, coach
//   roster per-athlete section, and BB athlete prompt. RAG + auth unchanged.
// ROMRx AI Chat v32 - sport-aware (PR #6)
// - v31 base: resolves active_sport server-side, sport-filtered RAG,
//   coach roster mode + BJJ athlete mode.
// - v32 adds BODYBUILDING athlete mode: when sport === 'bodybuilding',
//   ROMBot is fed the athlete's generated training program (split + per-day
//   exercises), planned weekly volume vs MAV landmarks, last-7d logged
//   volume, active mesocycle week/RIR phase, and ROM readiness - instead of
//   the BJJ belt/technique/game-plan sections. BJJ + coach paths unchanged.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ROMRX_OPENAI_KEY = Deno.env.get("romrx_openai_key") ?? "";
const ROMRX_ANTHROPIC_KEY = Deno.env.get("romrx_anthropic_key") ?? "";

function jwtRole(jwt: string): string {
  try { return JSON.parse(atob(jwt.split(".")[1]))?.role ?? "anon"; }
  catch { return "anon"; }
}

const JOINT_LABELS: Record<string, string> = {
  hip_er: "hip external rotation", hip_ir: "hip internal rotation",
  hip_abd: "hip abduction", hip_flex: "hip flexion",
  shoulder_er: "shoulder external rotation", shoulder_flex: "shoulder flexion",
  ankle_df: "ankle mobility", lumbar_flex: "lumbar flexion",
  lumbar_ext: "lumbar extension", thoracic_rot: "thoracic rotation",
  cervical_rot: "neck rotation",
};
function labelJoint(key: string): string {
  return JOINT_LABELS[key] ?? key.replace(/_/g, " ");
}

type CompetencyEntry = { name: string; category: string | null; state: string };
type CompetencyData = { byState: Record<string, CompetencyEntry[]>; counts: Record<string, number>; total: number };

const COMP_ORDER = ["learning", "drilled", "rolling", "taught"] as const;
const COMP_LABEL: Record<string, string> = { learning: "Learning", drilled: "Drilled", rolling: "Rolling", taught: "Taught" };
const COMP_MEANING: Record<string, string> = {
  learning: "seen it and tried a few reps",
  drilled: "can hit it cleanly in drilling",
  rolling: "lands it against resisting partners",
  taught: "can break it down and teach it",
};

async function fetchCompetency(supabase: ReturnType<typeof createClient>, userId: string): Promise<CompetencyData> {
  const empty: CompetencyData = { byState: {}, counts: {}, total: 0 };
  try {
    const { data } = await supabase.from("user_technique_competency").select("state, techniques!inner(name, category)").eq("user_id", userId).neq("state", "none");
    const rows = (data ?? []) as Array<{ state: string; techniques: { name: string; category: string | null } | null }>;
    const byState: Record<string, CompetencyEntry[]> = {};
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!r.techniques?.name) continue;
      const st = r.state;
      (byState[st] ??= []).push({ name: r.techniques.name, category: r.techniques.category ?? null, state: st });
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return { byState, counts, total: rows.length };
  } catch { return empty; }
}

function athleteCompetencySection(comp: CompetencyData): string {
  if (!comp || comp.total === 0) return `You haven't rated any techniques in My Game yet.`;
  const summary = COMP_ORDER.filter(s => (comp.counts[s] ?? 0) > 0).map(s => `${comp.counts[s]} ${COMP_LABEL[s]}`).join(", ");
  const blocks = COMP_ORDER.filter(s => (comp.byState[s] ?? []).length > 0).map(s => `- ${COMP_LABEL[s]} (${COMP_MEANING[s]}): ${comp.byState[s].map(e => e.name).join(", ")}`).join("\n");
  return `Self-rated progress (${summary}):\n${blocks}`;
}

function coachCompetencySection(comp: CompetencyData): string {
  if (!comp || comp.total === 0) return "    No self-ratings yet";
  return COMP_ORDER.filter(s => (comp.byState[s] ?? []).length > 0).map(s => `    ${COMP_LABEL[s]}: ${comp.byState[s].map(e => e.name).join(", ")}`).join("\n");
}

function buildCoachSystemPrompt(coachName: string, rosterContexts: Array<Record<string, unknown>>): string {
  const athleteSections = rosterContexts.map((ctx) => {
    const name = (ctx.full_name as string | null) ?? "Unknown Athlete";
    const belt = (ctx.belt as string | null) ?? "white";
    const summary = ctx.technique_summary as Record<string, number> | null;
    const worst = ctx.worst_joints as string[] | null;
    const greenTechs = ctx.green_techniques as Array<{name: string; category: string}> | null;
    const yellowTechs = ctx.yellow_techniques as Array<{name: string; category: string; limiting_joints: string[] | null}> | null;
    const savedPlans = ctx.saved_game_plans as Array<{name: string; path_mode: string}> | null;
    const greenByCategory = (greenTechs ?? []).reduce((acc, t) => { if (!acc[t.category]) acc[t.category] = []; acc[t.category].push(t.name); return acc; }, {} as Record<string, string[]>);
    const greenSection = Object.entries(greenByCategory).length > 0 ? Object.entries(greenByCategory).map(([cat, names]) => `    ${cat}: ${names.join(", ")}`).join("\n") : "    No assessment yet";
    const yellowSection = yellowTechs && yellowTechs.length > 0 ? yellowTechs.map(t => { const joints = (t.limiting_joints ?? []).map(j => labelJoint(j)).join(", "); return `    ${t.name} (${t.category})${joints ? ` - ${joints} limiting` : ""}`; }).join("\n") : "    No assessment yet";
    const plansSection = savedPlans && savedPlans.length > 0 ? savedPlans.map(p => `    "${p.name}" (${p.path_mode})`).join("\n") : "    None saved yet";
    const comp = ctx._competency as CompetencyData | undefined;
    const compSection = coachCompetencySection(comp ?? { byState: {}, counts: {}, total: 0 });
    return `### ${name} (${belt} belt)\n  Readiness: ${summary ? `${summary.green ?? 0} GREEN / ${summary.yellow ?? 0} YELLOW / ${summary.red ?? 0} RED` : "No assessment"}\n  Priority joints: ${worst?.map(j => labelJoint(j)).join(", ") ?? "No data"}\n  GREEN techniques:\n${greenSection}\n  YELLOW techniques:\n${yellowSection}\n  Competency:\n${compSection}\n  Saved plans:\n${plansSection}`;
  });
  return `You are ROMBot, the team intelligence assistant for ROMRxBJJ coach ${coachName}. Answer questions about your athletes.\n\n## Roster (${rosterContexts.length})\n${athleteSections.join("\n\n")}\n\n## Rules\n- No degree values. Use technique names not codes. Bullet points. Actionable.`;
}

function buildAthleteSystemPrompt(ctx: Record<string, unknown>, sport: string, comp?: CompetencyData): string {
  const name = ctx.full_name ?? "Athlete";
  const belt = ctx.belt ?? "white";
  const techSummary = ctx.technique_summary as Record<string, number> | null;
  const protocol = ctx.protocol as unknown[] | null;
  const worstJoints = ctx.worst_joints as string[] | null;
  const greenTechs = ctx.green_techniques as Array<{name: string; category: string; belt: string}> | null;
  const yellowTechs = ctx.yellow_techniques as Array<{name: string; category: string; belt: string; limiting_joints: string[] | null}> | null;
  const savedPlans = ctx.saved_game_plans as Array<{name: string; path_mode: string; techniques: Array<{name: string; category: string}>; created_at: string}> | null;
  const greenByCategory = (greenTechs ?? []).reduce((acc, t) => { if (!acc[t.category]) acc[t.category] = []; acc[t.category].push(t.name); return acc; }, {} as Record<string, string[]>);
  const greenSection = Object.entries(greenByCategory).length > 0 ? Object.entries(greenByCategory).map(([cat, names]) => `  ${cat}: ${names.join(", ")}`).join("\n") : "  No assessment completed yet";
  const yellowSection = yellowTechs && yellowTechs.length > 0 ? yellowTechs.map(t => { const joints = (t.limiting_joints ?? []).map(j => labelJoint(j)).join(", "); return `  ${t.name} (${t.category})${joints ? ` - ${joints} limiting` : ""}`; }).join("\n") : "  No assessment completed yet";
  const plansSection = savedPlans && savedPlans.length > 0 ? savedPlans.map(p => { const chain = (p.techniques ?? []).map((t: {name: string}) => t.name).join(" > "); return `  "${p.name}" (${p.path_mode}): ${chain}`; }).join("\n") : "  No saved game plans yet";
  return `You are ROMBot for ROMRx ${sport.toUpperCase()}.\n\n## Athlete\nName: ${name} | Belt: ${belt}\nReadiness: ${techSummary ? `${techSummary.green ?? 0}G ${techSummary.yellow ?? 0}Y ${techSummary.red ?? 0}R` : "no assessment"}\nPriority joints: ${worstJoints?.map(j => labelJoint(j)).join(", ") ?? "none"}\n\n## GREEN\n${greenSection}\n\n## YELLOW\n${yellowSection}\n\n## Protocol\n${protocol?.slice(0, 3).map((p: unknown) => { const ex = p as Record<string, unknown>; return `  ${ex.joint ?? ex.jointKey}: ${ex.exercise} - ${ex.sets}x${ex.reps}`; }).join("\n") ?? "  none"}\n\n## Game plans\n${plansSection}\n\n## Competency\n${athleteCompetencySection(comp ?? { byState: {}, counts: {}, total: 0 })}\n\n## Rules\n- No degree values. Use technique names not codes. Bullet points. Actionable.`;
}

type Landmark = { muscle: string; mv: number; mev: number; mav_low: number; mav_high: number; mrv: number };
function volumeStatus(planned: number, lm: Landmark | undefined): string {
  if (!lm) return "";
  if (planned < lm.mev) return "BELOW MEV";
  if (planned < lm.mav_low) return "MEV->MAV";
  if (planned <= lm.mav_high) return "in MAV";
  if (planned <= lm.mrv) return "MAV->MRV";
  return "ABOVE MRV";
}

async function buildBodybuildingAthletePrompt(supabase: ReturnType<typeof createClient>, userId: string, romCtx: Record<string, unknown>): Promise<string> {
  const name = (romCtx.full_name as string | null) ?? "Athlete";
  const worstJoints = romCtx.worst_joints as string[] | null;
  const { data: workouts } = await supabase.from("workouts").select("id, name, day_label, split_type, source_program, created_at").eq("user_id", userId).eq("is_template", false).like("source_program", "generated:%").order("created_at", { ascending: false });
  const w = (workouts ?? []) as Array<Record<string, unknown>>;
  const latestProgram = w[0]?.source_program as string | undefined;
  const sessions = w.filter(x => x.source_program === latestProgram);
  const sessionIds = sessions.map(s => s.id as string);
  let exByWorkout: Record<string, Array<Record<string, unknown>>> = {};
  if (sessionIds.length > 0) {
    const { data: wex } = await supabase.from("workout_exercises").select("workout_id, exercise_name, sets, reps_min, reps_max, target_notes, position").in("workout_id", sessionIds).order("position", { ascending: true });
    exByWorkout = ((wex ?? []) as Array<Record<string, unknown>>).reduce((acc, e) => { const wid = e.workout_id as string; if (!acc[wid]) acc[wid] = []; acc[wid].push(e); return acc; }, {} as typeof exByWorkout);
  }
  const { data: planned } = await supabase.rpc("program_planned_volume", { p_program: latestProgram ?? null });
  const plannedMap: Record<string, number> = {};
  for (const row of (planned ?? []) as Array<{ muscle: string; planned_sets: number }>) plannedMap[row.muscle] = Number(row.planned_sets) || 0;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: loggedRows } = await supabase.from("workout_sets").select("technique_id, techniques!inner(primary_muscle)").eq("user_id", userId).eq("is_warmup", false).gte("performed_at", since);
  const loggedMap: Record<string, number> = {};
  for (const r of (loggedRows ?? []) as Array<{ techniques: { primary_muscle: string | null } | null }>) { const m = r.techniques?.primary_muscle; if (m) loggedMap[m] = (loggedMap[m] ?? 0) + 1; }
  const { data: lmRows } = await supabase.from("muscle_volume_landmarks").select("muscle, mv, mev, mav_low, mav_high, mrv");
  const landmarks: Record<string, Landmark> = {};
  for (const l of (lmRows ?? []) as Landmark[]) landmarks[l.muscle] = l;
  const { data: meso } = await supabase.from("mesocycles").select("name, weeks, current_week, status").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).maybeSingle();
  const programSection = sessions.length > 0 ? sessions.map((s) => { const exs = exByWorkout[s.id as string] ?? []; const lines = exs.map(e => { const rep = e.reps_min && e.reps_max ? ` ${e.reps_min}-${e.reps_max} reps` : ""; return `    ${e.exercise_name}: ${e.sets} sets${rep}`; }).join("\n"); return `  ${s.day_label ?? s.name} (${s.split_type ?? "session"}):\n${lines || "    (empty)"}`; }).join("\n") : "  No program yet";
  const muscleOrder = Object.keys({ ...plannedMap, ...loggedMap, ...landmarks });
  const volumeSection = muscleOrder.filter(m => (plannedMap[m] ?? 0) > 0 || (loggedMap[m] ?? 0) > 0).sort((a, b) => (plannedMap[b] ?? 0) - (plannedMap[a] ?? 0)).map(m => { const p = plannedMap[m] ?? 0; const lg = loggedMap[m] ?? 0; const lm = landmarks[m]; const band = lm ? ` [MEV ${lm.mev} MAV ${lm.mav_low}-${lm.mav_high} MRV ${lm.mrv}]` : ""; return `  ${m}: ${p} planned, ${lg} logged 7d${band} ${volumeStatus(p, lm)}`; }).join("\n") || "  none";
  const mesoSection = meso ? (() => { const wk = (meso.current_week as number) ?? 1; const total = (meso.weeks as number) ?? 1; const isDeload = wk >= total; const progress = total > 1 ? (wk - 1) / (total - 1) : 0; let rir = "RIR 1-2"; if (isDeload) rir = "DELOAD"; else if (progress < 0.34) rir = "RIR 3"; else if (progress < 0.67) rir = "RIR 2"; else rir = "RIR 1"; return `  "${meso.name ?? "Meso"}" - Wk ${wk}/${total} - ${rir}`; })() : "  No active mesocycle";
  return `You are ROMBot, hypertrophy coach for ROMRx Bodybuilding, coaching ${name}.\n\nPriority joints: ${worstJoints?.map(j => labelJoint(j)).join(", ") ?? "none"}\n\n## Program\n${programSection}\n\n## Volume vs landmarks\n${volumeSection}\n\n## Mesocycle\n${mesoSection}\n\n## Rules\n- Cite actual sets/muscles/RIR. No degree values. Direct, bullet points.`;
}

async function buildBaseAthletePrompt(supabase: ReturnType<typeof createClient>, userId: string, fullName: string | null): Promise<string> {
  const name = fullName ?? "Athlete";
  const { data: assessment } = await supabase.from("assessments").select("*").eq("user_id", userId).order("assessed_at", { ascending: false }).limit(1).maybeSingle();
  const bilateral = [
    { key: "hip_er", label: "hip external rotation" }, { key: "hip_ir", label: "hip internal rotation" }, { key: "hip_abd", label: "hip abduction" }, { key: "hip_flex", label: "hip flexion" }, { key: "hip_ext", label: "hip extension" },
    { key: "shoulder_er", label: "shoulder external rotation" }, { key: "shoulder_flex", label: "shoulder flexion" }, { key: "ankle_df", label: "ankle dorsiflexion" },
    { key: "cervical_rot", label: "neck rotation" }, { key: "cervical_lat", label: "neck lateral flexion" }, { key: "thoracic_rot", label: "thoracic rotation" },
  ];
  const single = [ { key: "lumbar_flex", label: "lumbar flexion" }, { key: "lumbar_ext", label: "lumbar extension" }, { key: "cervical_flex", label: "neck flexion" }, { key: "cervical_ext", label: "neck extension" } ];
  type BaseJoint = { key: string; label: string; avg: number | null; l: number | null; r: number | null; single: number | null };
  const joints: BaseJoint[] = [];
  if (assessment) {
    const a = assessment as Record<string, unknown>;
    for (const j of bilateral) {
      const l = a[`${j.key}_l`] as number | string | null;
      const r = a[`${j.key}_r`] as number | string | null;
      const ln = l !== null && l !== undefined ? Number(l) : null;
      const rn = r !== null && r !== undefined ? Number(r) : null;
      if (ln !== null || rn !== null) {
        const vals = [ln, rn].filter((v): v is number => v !== null && !isNaN(v));
        const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        joints.push({ key: j.key, label: j.label, avg, l: ln, r: rn, single: null });
      }
    }
    for (const j of single) {
      const v = a[j.key] as number | string | null;
      if (v !== null && v !== undefined) { const n = Number(v); const nv = isNaN(n) ? null : n; joints.push({ key: j.key, label: j.label, avg: nv, l: null, r: null, single: nv }); }
    }
  }
  const aRec = assessment as Record<string, unknown> | null;
  const worstJointsRaw = (aRec?.worst_joints as string[] | null) ?? null;
  let derivedWorst: string[] = [];
  if ((!worstJointsRaw || worstJointsRaw.length === 0) && joints.length > 0) {
    derivedWorst = [...joints].filter(j => j.avg !== null).sort((a, b) => (a.avg as number) - (b.avg as number)).slice(0, 4).map(j => j.key);
  }
  const effectiveWorst: string[] = (worstJointsRaw && worstJointsRaw.length > 0) ? worstJointsRaw : derivedWorst;
  const romTotal = (aRec?.rom_total as number | null) ?? null;
  const romPct = (aRec?.rom_percentile as number | null) ?? null;
  const assessedAt = (aRec?.assessed_at as string | null) ?? null;
  const assessmentSport = (aRec?.sport as string | null) ?? null;
  const priorityLine = effectiveWorst.length > 0 ? effectiveWorst.map(j => labelJoint(j)).join(", ") + ((!worstJointsRaw || worstJointsRaw.length === 0) ? " (derived from lowest raw measurements)" : "") : "no restrictions stand out yet";
  const assessmentSection = assessment ? `Latest assessment: ${assessedAt ? new Date(assessedAt).toISOString().slice(0, 10) : "date unknown"}${assessmentSport ? ` (sport tag: ${assessmentSport})` : ""}\nAssessment status: real measurements on file\nOverall ROM: ${romTotal !== null && romTotal !== undefined ? `${romTotal} total` : "score pending"}${romPct !== null && romPct !== undefined ? `, ${Math.round(Number(romPct))}th percentile` : ""}\nPriority joints to improve: ${priorityLine}\n\nJoint measurements captured (${joints.length} joints):\n${joints.length > 0 ? joints.map(j => { if (j.single !== null) return `  ${j.label}: single value on file`; const bilat = [j.l !== null ? "left recorded" : null, j.r !== null ? "right recorded" : null].filter(Boolean).join(", "); return `  ${j.label}: ${bilat || "no measurement"}`; }).join("\n") : "  No joints measured yet."}` : "No assessment on file yet. Encourage completing a ROM assessment.";
  const { data: exercises } = await supabase.from("exercises").select("joint_key, name, sets, reps, coaching_cue, exercise_type").contains("sports", ["general"]).order("joint_key", { ascending: true });
  const exByJoint: Record<string, Array<{ name: string; sets: number; reps: string; cue: string | null }>> = {};
  for (const e of (exercises ?? []) as Array<{ joint_key: string; name: string; sets: number; reps: string; coaching_cue: string | null }>) { (exByJoint[e.joint_key] ??= []).push({ name: e.name, sets: e.sets, reps: e.reps, cue: e.coaching_cue }); }
  const prioritizedJointKeys = effectiveWorst.length > 0 ? effectiveWorst : Object.keys(exByJoint).slice(0, 6);
  const exerciseSection = prioritizedJointKeys.length > 0 ? prioritizedJointKeys.map(jk => { const exs = (exByJoint[jk] ?? []).slice(0, 4); if (exs.length === 0) return `  ${labelJoint(jk)}: no exercises tagged`; const lines = exs.map(e => `    ${e.name}: ${e.sets}x${e.reps}${e.cue ? ` - ${e.cue}` : ""}`).join("\n"); return `  ${labelJoint(jk)}:\n${lines}`; }).join("\n") : "  No exercises available yet.";
  const { data: recentSessions } = await supabase.from("protocol_sessions").select("session_date, protocol_day").eq("user_id", userId).order("session_date", { ascending: false }).limit(5);
  const sess = (recentSessions ?? []) as Array<Record<string, unknown>>;
  const sessionSection = sess.length > 0 ? `${sess.length} recent session${sess.length === 1 ? "" : "s"} on file:\n` + sess.map(s => `  ${(s.session_date as string | null) ?? "date?"}: ${(s.protocol_day as string | null) ?? "session"}`).join("\n") : "  No protocol sessions logged yet.";
  return `You are ROMBot, the mobility intelligence assistant for ROMRx Base - the sport-agnostic mobility layer on romrx.io.\n\nYou coach ${name} on general mobility. Do NOT reference BJJ, belts, techniques, guards, submissions, bodybuilding, mesocycles, hypertrophy, muscle volume, or any sport-specific competition. Plain mobility terms only.\n\n## Athlete\nName: ${name}\n\n## Assessment\n${assessmentSection}\n\n## Priority mobility exercises (from general library)\n${exerciseSection}\n\n## Recent protocol sessions\n${sessionSection}\n\n## Your Role\n- Use the "Priority joints to improve" list to answer "what is my worst joint" or "what should I prioritize". These joints are pre-computed; do NOT say "none flagged" if joints are listed.\n- Recommend exercises by name from the priority list; cite the coaching cue when helpful.\n- Encourage consistent sessions and re-tests every 4-6 weeks.\n- If there is no assessment on file yet, walk them through completing a ROM assessment. Once measurements exist, treat them as real - do not ask them to redo it.\n- If they ask about a sport-specific technique, redirect: "That is covered in the sport-specific ROMRx app. Base HQ focuses on underlying mobility."\n\n## Critical Rules\n- USE the data above. Do NOT say you cannot see the athlete's data when this prompt shows measurements or sessions.\n- NEVER reveal specific degree values. Soft language only ("your hip IR is restricted", "your ankle mobility is a strength").\n- NEVER use sport-specific jargon (BJJ, guard, hypertrophy, MEV/MRV, mesocycle, RIR).\n- If joint measurements are shown, use them. Do NOT tell the athlete their assessment is a placeholder or that they need to re-measure. One assessment stands until they choose to re-test.\n- Direct, warm, bullet points. Short answers.\n\nKeep responses focused on mobility: joints, ranges, restrictions, daily practice.`;
}

async function getEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-ada-002", input: text.slice(0, 1000) }) });
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

async function callProvider(provider: string, model: string | undefined, apiKey: string, systemPrompt: string, history: Array<{role: string; content: string}>, userMessage: string): Promise<{text: string; tokens: number; latency: number}> {
  const t0 = Date.now();
  const messages = [...history.map(m => ({role: m.role, content: m.content})), {role: "user", content: userMessage}];
  if (provider === "rombot" || provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: {Authorization: `Bearer ${apiKey || ROMRX_OPENAI_KEY}`, "Content-Type": "application/json"}, body: JSON.stringify({model: model ?? "gpt-4o", messages: [{role: "system", content: systemPrompt}, ...messages], max_tokens: 1200, temperature: 0.5}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? "OpenAI error");
    return {text: data.choices[0].message.content, tokens: data.usage?.total_tokens ?? 0, latency: Date.now() - t0};
  }
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: {"x-api-key": apiKey || ROMRX_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}, body: JSON.stringify({model: model ?? "claude-opus-4-5", system: systemPrompt, messages, max_tokens: 1200}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? "Anthropic error");
    return {text: data.content[0].text, tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0), latency: Date.now() - t0};
  }
  throw new Error(`Unknown provider: ${provider}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, {headers: {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"}});
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const role = jwtRole(token);
    const body = await req.json();
    let sport: string = body.sport ?? "bjj";
    const isBaseRequest = body.sport === "base";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let systemPrompt = "";
    let provider = "rombot", providerModel: string | undefined, providerKey = "";
    let conversationId: string | undefined = body.conversation_id;
    let saveHistory = false, userId: string | undefined;
    if (role === "authenticated") {
      const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {global: {headers: {Authorization: authHeader}}});
      const {data: {user}, error: authErr} = await userClient.auth.getUser();
      if (authErr || !user) return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401});
      userId = user.id; saveHistory = true;
      const {data: prefs} = await supabase.from("user_ai_preferences").select("provider, model, api_key_enc").eq("user_id", userId).maybeSingle();
      if (prefs) { provider = prefs.provider; providerModel = prefs.model ?? undefined; providerKey = prefs.api_key_enc ?? ""; }
      const {data: userRow} = await supabase.from("users").select("portal_role, full_name, active_sport").eq("id", userId).maybeSingle();
      const portalRole = userRow?.portal_role as string | undefined;
      if (!isBaseRequest) sport = (userRow?.active_sport as string | undefined) ?? sport;
      if (portalRole === "coach") {
        const coachName = (userRow?.full_name as string | null) ?? "Coach";
        const { data: coachRow } = await supabase.from("coaches").select("id").eq("user_id", userId).maybeSingle();
        let rosterContexts: Array<Record<string, unknown>> = [];
        if (coachRow) {
          const { data: athletes } = await supabase.from("athletes").select("user_id").eq("coach_id", coachRow.id).eq("is_active", true);
          if (athletes && athletes.length > 0) {
            const userIds = athletes.map(a => a.user_id).filter(Boolean);
            const ctxPromises = userIds.map(uid => supabase.from("rombot_context").select("*").eq("user_id", uid).maybeSingle().then(({data}) => data));
            const compPromises = userIds.map(uid => fetchCompetency(supabase, uid as string));
            const [results, comps] = await Promise.all([Promise.all(ctxPromises), Promise.all(compPromises)]);
            rosterContexts = results.map((ctx, i) => { if (!ctx) return null; return { ...ctx, _competency: comps[i] } as Record<string, unknown>; }).filter(Boolean) as Array<Record<string, unknown>>;
          }
        }
        systemPrompt = buildCoachSystemPrompt(coachName, rosterContexts);
      } else if (isBaseRequest || sport === "base") {
        const fullName = (userRow?.full_name as string | null) ?? null;
        systemPrompt = await buildBaseAthletePrompt(supabase, userId, fullName);
      } else {
        const {data: dbCtx} = await supabase.from("rombot_context").select("*").eq("user_id", userId).maybeSingle();
        const ctx = dbCtx ?? {};
        if (sport === "bodybuilding") systemPrompt = await buildBodybuildingAthletePrompt(supabase, userId, ctx);
        else { const comp = await fetchCompetency(supabase, userId); systemPrompt = buildAthleteSystemPrompt(ctx, sport, comp); }
      }
    } else {
      if (!body.user_email) return new Response(JSON.stringify({error: "user_email required for guest mode"}), {status: 400});
      const ctx = body.guest_context ?? {};
      provider = body.provider ?? "rombot";
      providerKey = body.provider_key ?? "";
      systemPrompt = buildAthleteSystemPrompt(ctx, sport);
    }
    let history: Array<{role: string; content: string}> = [];
    if (saveHistory && conversationId) {
      const {data: dbHistory} = await supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", {ascending: true}).limit(20);
      history = (dbHistory ?? []) as typeof history;
    } else if (body.history) history = (body.history as typeof history).slice(-10);
    if (saveHistory && !conversationId && userId) {
      const {data: convo, error: convoErr} = await supabase.from("ai_conversations").insert({user_id: userId, sport, provider, model: providerModel ?? null, context_snapshot: {}}).select("id").single();
      if (convoErr) throw convoErr;
      conversationId = convo.id;
    }
    const embedding = (isBaseRequest || sport === "base") ? null : await getEmbedding(body.message, ROMRX_OPENAI_KEY);
    let ragSection = "";
    if (embedding) {
      const { data: chunks } = await supabase.rpc("search_rombot_knowledge", { query_embedding: embedding, p_sport: sport, match_threshold: 0.7, match_count: 4 });
      if (chunks && chunks.length > 0) ragSection = "\n\n## Relevant Research\n" + chunks.map((c: {topic: string; chunk: string; source_citation: string}) => `${c.topic}: ${c.chunk} (${c.source_citation})`).join("\n");
    }
    const {text, tokens, latency} = await callProvider(provider, providerModel, providerKey, systemPrompt + ragSection, history, body.message);
    if (saveHistory && conversationId && userId) {
      await supabase.from("ai_messages").insert([{conversation_id: conversationId, user_id: userId, role: "user", content: body.message}, {conversation_id: conversationId, user_id: userId, role: "assistant", content: text, tokens_used: tokens, latency_ms: latency}]);
      if (!body.conversation_id) await supabase.from("ai_conversations").update({title: body.message.slice(0, 60)}).eq("id", conversationId);
    }
    return new Response(JSON.stringify({reply: text, conversation_id: conversationId ?? null, provider, sport}), {headers: {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({error: msg}), {status: 500, headers: {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}});
  }
});
