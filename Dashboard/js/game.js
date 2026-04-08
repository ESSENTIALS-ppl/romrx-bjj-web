// ROMRxBJJ Game Generator Engine — v3 (UX Fix)

let flowGraph = null;
let athleteTechniques = {};
let techDetails = {};
let flow = { role: null, currentStage: 0, selections: [] };

async function initGame() {
  const session = requireAuth();
  if (!session) return;
  if (!checkSubscription()) return;

  const firstName = session.name.split(' ')[0];
  document.getElementById('user-name').textContent = firstName;

  document.getElementById('logout-link').addEventListener('click', function(e) {
    e.preventDefault();
    if (confirm('Are you sure you want to log out?')) {
      clearSession();
    }
  });

  document.getElementById('app').innerHTML = '<div style="text-align:center;padding:40px;"><span class="spinner" style="width:32px;height:32px;border-width:3px;"></span><p style="margin-top:16px;color:#888;">Loading your game data...</p></div>';

  try {
    const graphData = await apiGetFlowGraph();
    const techData = await apiGetTechniques(session.email);

    if (graphData.techniques) {
      graphData.techniques.forEach(function(tech) {
        techDetails[tech.Code] = {
          name: tech['Technique Name'] || tech.Name || '',
          type: tech.Type || '',
          worksFrom: cleanPath(tech['Works From']),
          offensePath: cleanPath(tech['Offense Path']),
          defensePath: cleanPath(tech['Defense Path'])
        };
      });
    }

    let techArray = Array.isArray(techData) ? techData : (techData && techData.techniques ? techData.techniques : []);
    if (techArray.length > 0) {
      techArray.forEach(function(tech) {
        athleteTechniques[tech.Code] = {
          tier: tech['Final Tier'] || 'GREEN',
          romEvaluated: tech['ROM Evaluated'] || '',
          requiredValue: tech['Required'] || '',
          athleteValue: tech['Athlete L'] || tech['Athlete R'] || tech['Value Used'] || ''
        };
      });
    }


    flowGraph = graphData;
    renderRoleSelection();
    renderSavedFlows();
    renderTierProgress(session.email);


  } catch (error) {
    document.getElementById('app').innerHTML = '<div style="text-align:center;padding:40px;color:#E74C3C;">Failed to load data. Please refresh the page.</div>';
  }
}

function cleanPath(val) {
  if (!val) return '';
  let s = String(val).trim();
  if (s === '\u2014' || s === '-' || s === 'undefined' || s === 'null') return '';
  return s;
}

function parsePath(pathStr) {
  if (!pathStr) return [];
  return pathStr.split(',').map(function(s) { return s.trim(); }).filter(function(code) {
    return code && code !== '\u2014' && code !== '-' && techDetails[code];
  });
}

// Get the last user-selected technique (skip auto-added ones)
function getLastSelection() {
  if (flow.selections.length === 0) return null;
  return flow.selections[flow.selections.length - 1];
}

// Core: get available techniques for current stage
function getNextOptions() {
  let last = getLastSelection();
if (!last) {
    let startCodes = ['WT1','WT2','WT3','WT4','WT5'];
    if (flowGraph && flowGraph.positions) {
      let standPos = flowGraph.positions.find(function(p) {
        return p.Position_Code === 'POS-STAND';
      });
      if (standPos && standPos.Available_Techniques) {
        let parsed = standPos.Available_Techniques.split(',')
          .map(function(s) { return s.trim(); })
          .filter(function(c) { return c && techDetails[c]; });
        if (parsed.length > 0) startCodes = parsed;
      }
    }
    return { codes: startCodes, context: 'takedowns' };
}


  let detail = techDetails[last.code];
  if (!detail) return { codes: [], context: 'empty' };

  if (flow.role === 'offense') {
    // After takedown → show passes from offense_path
    if (detail.type === 'T') {
      return { codes: parsePath(detail.offensePath), context: 'passes' };
    }
    // After pass → show what pass leads to
    if (detail.type === 'P') {
      let nextCodes = parsePath(detail.offensePath);
      // Check if pass leads to more passes (WP1 case)
      let allPasses = nextCodes.length > 0 && nextCodes.every(function(c) {
        return techDetails[c] && techDetails[c].type === 'P';
      });
      if (allPasses) {
        return { codes: nextCodes, context: 'passes_step2', passName: detail.name };
      }
      return { codes: nextCodes, context: 'from_pass' };
    }
    // After position control → show its offense_path (subs + sub-positions)
    if (detail.type === 'C') {
      return { codes: parsePath(detail.offensePath), context: 'from_position', posName: detail.name };
    }
  }

  if (flow.role === 'defense') {
    // After takedown → show guards from defense_path
    if (detail.type === 'T') {
      return { codes: parsePath(detail.defensePath), context: 'guards' };
    }
    // After guard → show sweeps/subs from DEFENSE_PATH (BUG 1 FIX)
    if (detail.type === 'G') {
      return { codes: parsePath(detail.defensePath), context: 'from_guard', guardName: detail.name };
    }
    // After sweep → show position from offense_path
    if (detail.type === 'S') {
      let posCodes = parsePath(detail.offensePath);
      // If only one position, auto-add it and go to its submissions
      if (posCodes.length === 1) {
        let posCode = posCodes[0];
        let posDetail = techDetails[posCode];
        if (posDetail && posDetail.type === 'C') {
          flow.selections.push({
            code: posCode,
            name: posDetail.name || posCode,
            tier: ((athleteTechniques[posCode] || {}).tier || 'GREEN').toLowerCase(),
            tag: 'auto-position'
          });
          return { codes: parsePath(posDetail.offensePath), context: 'from_position', posName: posDetail.name };
        }
      }
      return { codes: posCodes, context: 'after_sweep' };
    }
    // After position control → show subs + sub-positions
    if (detail.type === 'C') {
      return { codes: parsePath(detail.offensePath), context: 'from_position', posName: detail.name };
    }
  }

  return { codes: [], context: 'empty' };
}

// Build title and grouped cards
function renderStage() {
  let options = getNextOptions();
  let allCodes = options.codes;

  // Filter out RED techniques — only GREEN and YELLOW appear in the flow
  let codes = allCodes.filter(function(code) {
    let athlete = athleteTechniques[code] || { tier: 'GREEN' };
    return (athlete.tier || 'GREEN').toLowerCase() !== 'red';
  });

  // All options at this stage are RED — show ROM-building message
  if (codes.length === 0 && allCodes.length > 0) {
    let backBtn = flow.selections.length > 0 ? '<button class="btn btn-outlined btn-small" onclick="goBack()">\u2190 Back</button>' : '';
    document.getElementById('app').innerHTML =
      '<div class="stage-header"><h2>Path Locked</h2>' + backBtn + '</div>' +
      '<div class="path-locked">' +
      '<div style="font-size:2.5rem;margin-bottom:12px;">\uD83D\uDD12</div>' +
      '<h3>All techniques at this stage need more ROM</h3>' +
      '<p>Your mobility protocol is designed to unlock these. Stick with it for 4\u20136 weeks, then reassess.</p>' +
      '<div style="display:flex;gap:12px;margin-top:20px;justify-content:center;flex-wrap:wrap;">' +
      '<a href="protocol.html" class="btn btn-primary">View My Protocol</a>' +
      '<button class="btn btn-outlined" onclick="goBack()">\u2190 Try a Different Path</button>' +
      '</div></div>';
    return;
  }

  if (codes.length === 0) {
    renderFlowSummary();
    return;
  }


  // Separate into submissions (FINISH) and positions (ADVANCE) and sweeps
  let finishCodes = [];
  let advanceCodes = [];
  let sweepCodes = [];
  let otherCodes = [];

  codes.forEach(function(code) {
    let d = techDetails[code];
    if (!d) return;
    if (d.type === 'X') finishCodes.push(code);
    else if (d.type === 'C') advanceCodes.push(code);
    else if (d.type === 'S') sweepCodes.push(code);
    else otherCodes.push(code);
  });

  // Build title
  let title = '';
  switch (options.context) {
    case 'takedowns':
      title = flow.role === 'offense' ? 'Choose Your Takedown from Standing' : 'What Takedown Are You Defending?';
      break;
    case 'passes':
      title = 'Choose Your Guard Pass';
      break;
    case 'passes_step2':
      title = 'Choose Your Pass \u2014 ' + (options.passName || '') + ' opens the guard';
      break;
    case 'from_pass':
      title = 'Choose Your Position';
      break;
    case 'guards':
      title = 'You land in... (choose your guard)';
      break;
    case 'from_guard':
      title = 'Your Options from ' + (options.guardName || 'Guard');
      break;
    case 'after_sweep':
      title = 'You end up in...';
      break;
    case 'from_position':
      title = 'Your Options from ' + (options.posName || 'Position');
      break;
    default:
      title = 'Choose Your Next Technique';
  }

  let backBtn = flow.selections.length > 0 ? '<button class="btn btn-outlined btn-small" onclick="goBack()">\u2190 Back</button>' : '';

  // Build cards HTML with sections
  let cardsHtml = '';

  let hasMixed = finishCodes.length > 0 && advanceCodes.length > 0;

  if (hasMixed) {
    // MIXED: Show submissions first under "Finish" header, then positions under "Transition"
    cardsHtml += '<h3 style="color:let(--green);margin:16px 0 8px;font-size:1rem;">\uD83C\uDFC6 Finish from here</h3>';
    cardsHtml += '<div class="tech-grid">';
    finishCodes.forEach(function(code) {
      cardsHtml += renderTechniqueCard(code, 'finish');
    });
    cardsHtml += '</div>';

    cardsHtml += '<h3 style="color:let(--primary);margin:24px 0 8px;font-size:1rem;">\u27A1\uFE0F Transition to another position</h3>';
    cardsHtml += '<div class="tech-grid">';
    advanceCodes.forEach(function(code) {
      cardsHtml += renderTechniqueCard(code, 'advance');
    });
    cardsHtml += '</div>';
  } else if (sweepCodes.length > 0 && finishCodes.length > 0) {
    // Guard options: sweeps + submissions
    cardsHtml += '<h3 style="color:let(--green);margin:16px 0 8px;font-size:1rem;">\uD83C\uDFC6 Submit from here</h3>';
    cardsHtml += '<div class="tech-grid">';
    finishCodes.forEach(function(code) {
      cardsHtml += renderTechniqueCard(code, 'finish');
    });
    cardsHtml += '</div>';

    cardsHtml += '<h3 style="color:let(--primary);margin:24px 0 8px;font-size:1rem;">\u2B06\uFE0F Sweep to improve position</h3>';
    cardsHtml += '<div class="tech-grid">';
    sweepCodes.forEach(function(code) {
      cardsHtml += renderTechniqueCard(code, 'sweep');
    });
    cardsHtml += '</div>';
  } else if (sweepCodes.length > 0) {
    // Only sweeps
    cardsHtml += '<div class="tech-grid">';
    sweepCodes.forEach(function(code) {
      cardsHtml += renderTechniqueCard(code, 'sweep');
    });
    cardsHtml += '</div>';
  } else {
    // Single type — just show all
    cardsHtml += '<div class="tech-grid">';
    let allCodes = finishCodes.concat(advanceCodes).concat(otherCodes);
    allCodes.forEach(function(code) {
      let d = techDetails[code];
      let tag = 'continue';
      if (d && d.type === 'X') tag = 'finish';
      else if (d && d.type === 'C') tag = 'advance';
      else if (d && d.type === 'S') tag = 'sweep';
      cardsHtml += renderTechniqueCard(code, tag);
    });
    cardsHtml += '</div>';
  }

  document.getElementById('app').innerHTML = '<div class="stage-header"><h2>' + title + '</h2>' + backBtn + '</div>' + cardsHtml;
}

function renderTechniqueCard(code, tag) {
  let detail = techDetails[code] || {};
  let athlete = athleteTechniques[code] || { tier: 'GREEN' };

  let fullName = detail.name || code;
  let nameParts = fullName.match(/^(.+?)\s*\\(([^)]+)\\)$/);
  let englishName = nameParts ? nameParts[1].trim() : fullName;
  let japaneseName = nameParts ? nameParts[2].trim() : '';

  let tier = (athlete.tier || 'GREEN').toLowerCase();
  let tierLabels = { green: '\u2705 READY', yellow: '\u26A0\uFE0F TRAIN WITH CAUTION', red: '\uD83D\uDD12 LOCKED' };


  let limitInfo = '';
  if (tier === 'yellow' || tier === 'red') {
    let joint = athlete.romEvaluated || 'Joint';
    let athleteVal = athlete.athleteValue || '?';
    let requiredVal = athlete.requiredValue || '?';
    limitInfo = '<div class="tech-limit">Limiting: ' + joint + ' \u2014 You: ' + athleteVal + '\u00B0 / Need: ' + requiredVal + '\u00B0</div>';
    if (tier === 'red' && !isNaN(athleteVal) && !isNaN(requiredVal)) {
      let diff = Math.abs(requiredVal - athleteVal);
      limitInfo += '<div class="tech-limit tech-limit-red">Build ' + diff + '\u00B0 more to unlock</div>';
    }
  }

  return '<div class="tech-card tier-' + tier + '" data-code="' + code + '" data-tag="' + tag + '" onclick="selectTechnique(\'' + code + '\', \'' + tag + '\')">' +
    '<div class="tech-card-header"><div><span class="tech-name">' + englishName + '</span>' +
    (japaneseName ? '<span class="tech-japanese">(' + japaneseName + ')</span>' : '') +
    '</div><span class="tech-code">' + code + '</span></div>' +
    '<div class="tier-badge ' + tier + '">' + tierLabels[tier] + '</div>' +
    limitInfo + '</div>';
}

function selectTechnique(code, tag) {
  let detail = techDetails[code] || {};
  let athlete = athleteTechniques[code] || { tier: 'GREEN' };
  let tier = (athlete.tier || 'GREEN').toLowerCase();

  if (tier === 'yellow') {
    showToast('\u26A0\uFE0F This technique is accessible but needs attention. Warm up thoroughly.');
  }


  flow.selections.push({
    code: code,
    name: detail.name || code,
    tier: tier,
    tag: tag
  });

  // Submissions always end the flow
  if (detail.type === 'X' || tag === 'finish' || tag === 'submit') {
    setTimeout(function() { renderFlowSummary(); }, 300);
  } else {
    flow.currentStage++;
    setTimeout(function() { renderStage(); }, 300);
  }
}

function goBack() {
  if (flow.selections.length > 0) {
    // Remove auto-added positions too
    while (flow.selections.length > 0 && flow.selections[flow.selections.length - 1].tag === 'auto-position') {
      flow.selections.pop();
      flow.currentStage--;
    }
    if (flow.selections.length > 0) {
      flow.selections.pop();
      flow.currentStage--;
    }
    if (flow.currentStage < 0) flow.currentStage = 0;

    if (flow.selections.length === 0) {
      flow.currentStage = 0;
      renderRoleSelection();
    } else {
      renderStage();
    }
  } else {
    renderRoleSelection();
  }
}

function renderRoleSelection() {
  flow = { role: null, currentStage: 0, selections: [] };
  document.getElementById('app').innerHTML = '<div class="role-selection"><h2>Build Your Game</h2><p>Select your role and build a complete flow from takedown to submission. Every technique is color-coded to YOUR mobility readiness.</p><div class="role-cards"><div class="role-card" data-role="offense"><div class="role-icon">\u2694\uFE0F</div><h3>OFFENSE</h3><p>I took them down \u2014 I\'m on top</p></div><div class="role-card" data-role="defense"><div class="role-icon">\uD83D\uDEE1\uFE0F</div><h3>DEFENSE</h3><p>They took me down \u2014 I\'m on bottom</p></div></div></div>';

  document.querySelectorAll('.role-card').forEach(function(card) {
    card.addEventListener('click', function() {
      flow.role = this.dataset.role;
      flow.currentStage = 0;
      flow.selections = [];
      renderStage();
    });
  });
}

function renderFlowSummary() {
  let validSelections = flow.selections.filter(function(sel) {
    return sel && sel.code && sel.name && sel.name !== '\u2014' && sel.name !== 'undefined';
  });

  let chain = validSelections.map(function(sel) {
    return '<div class="flow-node ' + sel.tier + '">' + (sel.name || sel.code) + '</div>';
  }).join('<div class="flow-arrow">\u2192</div>');

  let details = validSelections.map(function(sel) {
    let athlete = athleteTechniques[sel.code] || {};
    let notes = (sel.tier === 'yellow' || sel.tier === 'red') && athlete.romEvaluated
      ? athlete.romEvaluated + ': ' + athlete.athleteValue + '\u00B0 / ' + athlete.requiredValue + '\u00B0'
      : '\u2014';
    return '<tr><td>' + sel.code + '</td><td>' + (sel.name || sel.code) + '</td><td><span class="tier-badge ' + sel.tier + '">' + sel.tier.toUpperCase() + '</span></td><td>' + notes + '</td></tr>';
  }).join('');

  document.getElementById('app').innerHTML = '<div class="flow-summary"><h2>Your Game Plan</h2><div class="flow-chain">' + chain + '</div><table style="width:100%;background:let(--white);border-radius:let(--radius);box-shadow:let(--shadow);padding:16px;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:8px;">Code</th><th style="text-align:left;padding:8px;">Technique</th><th style="text-align:left;padding:8px;">Tier</th><th style="text-align:left;padding:8px;">Notes</th></tr></thead><tbody>' + details + '</tbody></table><div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;"><button class="btn btn-primary" onclick="saveFlow()">\uD83D\uDCBE Save This Flow</button><button class="btn btn-outlined" onclick="renderRoleSelection()">\uD83D\uDD04 Build Another Flow</button></div></div>';
}

function saveFlow() {
  try {
    let saved = JSON.parse(localStorage.getItem('romrxbjj_saved_flows') || '[]');
    let validSelections = flow.selections.filter(function(sel) {
      return sel && sel.code && sel.name && sel.name !== 'undefined';
    });
    saved.push({
      role: flow.role,
      date: new Date().toISOString(),
      techniques: validSelections
    });
    if (saved.length > 10) saved.shift();
    localStorage.setItem('romrxbjj_saved_flows', JSON.stringify(saved));
    showToast('\u2705 Flow saved!');
    renderSavedFlows();
  } catch (e) {
    showToast('\u274C Failed to save flow');
  }
}

function renderSavedFlows() {
  try {
    let saved = JSON.parse(localStorage.getItem('romrxbjj_saved_flows') || '[]');
    if (saved.length === 0) {
      document.getElementById('saved-flows').innerHTML = '<div class="saved-flows"><h3>My Saved Flows (0)</h3><p style="color:#888;">No saved flows yet. Build your first game plan above!</p></div>';
      return;
    }
    let cards = saved.map(function(f, i) {
      let icon = f.role === 'offense' ? '\u2694\uFE0F' : '\uD83D\uDEE1\uFE0F';
      let date = new Date(f.date).toLocaleDateString();
      let chain = f.techniques.map(function(t) { return t.code; }).join(' \u2192 ');
      return '<div class="saved-flow-card"><div class="saved-flow-info"><div class="saved-flow-title">' + icon + ' Flow #' + (i+1) + ' \u2014 ' + date + '</div><div class="saved-flow-date">' + chain + '</div></div><button class="btn btn-small btn-outlined" onclick="deleteFlow(' + i + ')">\uD83D\uDDD1\uFE0F</button></div>';
    }).join('');
    document.getElementById('saved-flows').innerHTML = '<div class="saved-flows"><h3>My Saved Flows (' + saved.length + ')</h3><div class="saved-flows-list">' + cards + '</div></div>';
  } catch (e) {
    document.getElementById('saved-flows').innerHTML = '';
  }
}

function deleteFlow(index) {
  if (confirm('Delete this saved flow?')) {
    try {
      let saved = JSON.parse(localStorage.getItem('romrxbjj_saved_flows') || '[]');
      saved.splice(index, 1);
      localStorage.setItem('romrxbjj_saved_flows', JSON.stringify(saved));
      renderSavedFlows();
      showToast('Flow deleted');
    } catch (e) {
      showToast('Failed to delete');
    }
  }
}

function showToast(msg, ms) {
  ms = ms || 3000;
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, ms);
}

async function renderTierProgress(email) {
  let container = document.getElementById('tier-progress-container');
  if (!container) return;

  try {
    let progressData = await apiGetProgress(email);
    if (!progressData || !progressData.success || !progressData.assessments || progressData.assessments.length === 0) {
      container.style.display = 'none';
      return;
    }

    let assessments = progressData.assessments;
    let html = '<div class="tier-progress-section">';
    html += '<h3 class="tier-progress-title">Technique Readiness Over Time</h3>';

    assessments.forEach(function(a) {
      let dateLabel = new Date(a.date).toLocaleDateString();
      let t = a.techniques || { green: 0, yellow: 0, red: 0, total: 44 };
      let total = t.green + t.yellow + t.red;
      let gPct = total > 0 ? (t.green / total * 100) : 0;
      let yPct = total > 0 ? (t.yellow / total * 100) : 0;
      let rPct = total > 0 ? (t.red / total * 100) : 0;

      html += '<div class="tier-progress-row">';
      html += '<div class="tier-progress-date">' + dateLabel + '</div>';
      html += '<div class="tier-progress-bar">';
      if (gPct > 0) html += '<div class="tier-bar-seg tier-bar-green" style="width:' + gPct + '%" title="' + t.green + ' GREEN">' + (gPct >= 8 ? t.green : '') + '</div>';
      if (yPct > 0) html += '<div class="tier-bar-seg tier-bar-yellow" style="width:' + yPct + '%" title="' + t.yellow + ' YELLOW">' + (yPct >= 8 ? t.yellow : '') + '</div>';
      if (rPct > 0) html += '<div class="tier-bar-seg tier-bar-red" style="width:' + rPct + '%" title="' + t.red + ' RED">' + (rPct >= 8 ? t.red : '') + '</div>';
      html += '</div>';
      html += '</div>';
    });

    if (assessments.length >= 2) {
      let first = assessments[0].techniques;
      let last = assessments[assessments.length - 1].techniques;
      let gDelta = last.green - first.green;
      let rDelta = last.red - first.red;

      let deltaHtml = '<div class="tier-progress-delta">';
      if (gDelta > 0) deltaHtml += '<span class="delta-positive">+' + gDelta + ' GREEN</span> ';
      if (gDelta < 0) deltaHtml += '<span class="delta-negative">' + gDelta + ' GREEN</span> ';
      if (rDelta < 0) deltaHtml += '<span class="delta-positive">' + Math.abs(rDelta) + ' fewer RED</span>';
      if (rDelta > 0) deltaHtml += '<span class="delta-negative">+' + rDelta + ' RED</span>';
      if (gDelta === 0 && rDelta === 0) deltaHtml += '<span style="color:#888;">No change yet</span>';
      deltaHtml += '</div>';
      html += deltaHtml;
    }

    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
  } catch (e) {
    console.error('Tier progress error:', e);
    container.style.display = 'none';
  }
}


initGame();