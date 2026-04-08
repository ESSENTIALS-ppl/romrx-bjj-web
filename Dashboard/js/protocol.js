// ROMRxBJJ Protocol Renderer v1
// Renders the My Protocol tab — top 3 priority joints with exercises/stretches/foam rolls

let protocolData     = null;
let _checkedInToday  = new Set(); // #46 exercise check-in keys for today
let _weekDaysCompleted = 0;       // #46 streak

async function initProtocol() {
  const session = requireAuth();
  if (!session) return;
  if (!checkSubscription()) return;

  const firstName = session.name.split(' ')[0];
  document.getElementById('user-name').textContent = firstName;

  document.getElementById('logout-link').addEventListener('click', function(e) {
    e.preventDefault();
    if (confirm('Are you sure you want to log out?')) {
      clearSession();
      window.location.href = 'index.html';
    }
  });

  try {
    const data = await apiGetProtocol(session.email);

    if (!data.success || !data.priorities || data.priorities.length === 0) {
      renderError('No protocol data available. Complete your assessment to get started.');
      return;
    }

    protocolData = data;
    await loadCheckIns(session.email); // #46 load today's check-ins before render
    renderProtocol();
    wireCheckIns(session.email);      // #46 wire checkbox events

    // #27 Auto-expand first joint accordion on load
    const firstAccordion = document.querySelector('.joint-section-header');
    if (firstAccordion) firstAccordion.click();
  } catch (error) {
    console.error('Protocol load error:', error);
    renderError('Failed to load protocol. Please refresh the page.');
  }
}

function renderError(message) {
  document.getElementById('app').innerHTML = `
    <div class="protocol-error">
      <p>❌ ${message}</p>
    </div>
  `;
}

function renderProtocol() {
  const priorities = protocolData.priorities;

  let html = `
    <!-- Hero -->
    <div class="protocol-hero">
      <h1 class="protocol-title">📋 My Protocol</h1>
      <p class="protocol-subtitle">Your personalized mobility protocol for your top ${priorities.length} priority joints</p>
    </div>

    <!-- Executive Brief -->
    <div class="protocol-brief">
      <h3>Executive Brief</h3>
      <div class="brief-table-wrap">
        <table class="brief-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Joint</th>
              <th>Status</th>
              <th>Weak Side</th>
              <th>What You'll Get</th>
            </tr>
          </thead>
          <tbody>
  `;

  priorities.forEach(p => {
    const statusClass = p.status === 'At-Risk' ? 'status-red' : 'status-yellow';
    const exerciseCount = (p.exercises?.length || 0);
    const stretchCount = (p.stretches?.length || 0);
    const foamCount = (p.foamRolls?.length || 0);

    html += `
      <tr>
        <td class="brief-priority">${p.rank}</td>
        <td class="brief-joint">${p.joint}</td>
        <td><span class="${statusClass}">${p.status}</span></td>
        <td>${p.weakSide || 'N/A'}</td>
        <td class="brief-rx">${exerciseCount} exercises · ${stretchCount} stretches · ${foamCount} foam roll${foamCount !== 1 ? 's' : ''}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
      <div class="brief-note">
        💡 <strong>Stick with this for 4-6 weeks, then reassess.</strong> Watch your RED and YELLOW technique counts drop as your mobility improves.
      </div>
    </div>
  `;

  // Priority Joint Blocks
  priorities.forEach(p => {
    html += renderJointBlock(p);
  });

  // Weekly Plan
  html += `
    <div class="weekly-plan">
      <h3>📅 Weekly Plan</h3>
      <div class="brief-table-wrap">
        <table class="brief-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Focus</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Training Days</strong> (before class)</td>
              <td>Foam roll priority joints: 5 min<br>Dynamic stretches: 5 min</td>
            </tr>
            <tr>
              <td><strong>Training Days</strong> (after class)</td>
              <td>Static stretches for priority joints: 10 min</td>
            </tr>
            <tr>
              <td><strong>Off Days</strong></td>
              <td>Full protocol (all exercises, stretches, foam roll): 15-20 min</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('app').innerHTML = html;

  // Attach expand/collapse listeners
  document.querySelectorAll('.joint-header').forEach(header => {
    header.addEventListener('click', function() {
      const section = this.parentElement;
      const body = section.querySelector('.joint-body');
      const chevron = this.querySelector('.joint-chevron');

      if (body.style.display === 'none' || !body.style.display) {
        body.style.display = 'block';
        chevron.textContent = '▲';
        this.classList.add('joint-header-open');
      } else {
        body.style.display = 'none';
        chevron.textContent = '▼';
        this.classList.remove('joint-header-open');
      }
    });
  });
}

function renderJointBlock(priority) {
  const isBilateral = priority.weakSide && priority.weakSide !== 'N/A';

  let html = `
    <div class="joint-section">
      <button class="joint-header">
        <div class="joint-header-left">
          <span class="joint-priority">#${priority.rank}</span>
          <span class="joint-name">${priority.joint}</span>
          <span style="color:#888; font-size:0.85rem;">${priority.asymmetry.toFixed(1)}% asymmetry</span>
        </div>
        <span class="joint-chevron">▼</span>
      </button>
      <div class="joint-body" style="display:none;">
  `;

  if (isBilateral) {
    html += `
      <div class="weak-side-callout">
        ⚠️ <strong>Extra set on your WEAK SIDE (${priority.weakSide})</strong> — that's where the gap is.
        <div style="margin-top:4px; font-size:0.8rem; color:#555;">
          Left: ${priority.leftScore}° | Right: ${priority.rightScore}° | Normal: ${priority.normalRange}
        </div>
      </div>
    `;
  }

  // Exercises
  if (priority.exercises && priority.exercises.length > 0) {
    html += `<div class="rx-section-title">💪 Exercises</div>`;
    priority.exercises.forEach(ex => {
      html += renderExerciseCard(ex, 'exercise', priority.joint);
    });
  }

  // Stretches
  if (priority.stretches && priority.stretches.length > 0) {
    html += `<div class="rx-section-title">🧘 Stretches</div>`;
    priority.stretches.forEach(ex => {
      html += renderExerciseCard(ex, 'stretch', priority.joint);
    });
  }

  // Foam Rolls
  if (priority.foamRolls && priority.foamRolls.length > 0) {
    html += `<div class="rx-section-title">🔄 Foam Roll</div>`;
    priority.foamRolls.forEach(ex => {
      html += renderExerciseCard(ex, 'foam-roll', priority.joint);
    });
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

function renderExerciseCard(exercise, cardType, joint) {
  const steps      = exercise.how.split('|').map(s => s.trim()).filter(s => s.length > 0);
  const exKey      = (exercise.name || '').toLowerCase().replace(/\s+/g, '_');
  const isChecked  = _checkedInToday.has(exKey);
  const videoLink  = exercise.video_url
    ? `<a href="${exercise.video_url}" target="_blank" rel="noopener" class="rx-video-link">&#x25B6; Watch Demo</a>`
    : '';
  const checkbox   = `
    <label class="rx-checkin-label">
      <input type="checkbox" class="rx-checkin-box" data-exercise="${exKey}" data-joint="${joint || ''}"
        data-name="${exercise.name}" ${isChecked ? 'checked' : ''}>
      <span class="rx-checkin-text">${isChecked ? 'Done today &#x2713;' : 'Mark as done today'}</span>
    </label>`;

  return `
    <div class="rx-card rx-card-${cardType}">
      <div class="rx-card-header">
        <strong>${exercise.name}</strong>
        ${videoLink}
      </div>
      <div class="rx-card-body">
        <div class="rx-row">
          <span class="rx-label">Why:</span> ${exercise.why}
        </div>
        <div class="rx-row">
          <span class="rx-label">How:</span>
          <ol class="rx-steps">
            ${steps.map(step => `<li>${step.replace(/^\d+\.\s*/, '')}</li>`).join('')}
          </ol>
        </div>
        <div class="rx-row">
          <span class="rx-label">When:</span> ${exercise.when}
        </div>
        <div class="rx-row">
          <span class="rx-label">Equipment:</span> ${exercise.equipment}
        </div>
        <div class="rx-context">
          <em>&#x1F94B; ${exercise.bjjContext}</em>
        </div>
        ${checkbox}
      </div>
    </div>
  `;
}


// #46 Load today's exercise check-ins from GAS
async function loadCheckIns(email) {
  try {
    const res = await apiCall({ action: 'getCheckIns', email });
    if (res.success) {
      const today = new Date().toISOString().slice(0, 10);
      _checkedInToday.clear();
      (res.checkIns || []).forEach(ci => {
        if (ci.date === today) {
          _checkedInToday.add((ci.exerciseName || '').toLowerCase().replace(/\s+/g, '_'));
        }
      });
      _weekDaysCompleted = res.weekDaysCompleted || 0;
    }
  } catch(e) { /* fail silently */ }
}

function wireCheckIns(email) {
  document.querySelectorAll('.rx-checkin-box').forEach(cb => {
    cb.addEventListener('change', async function() {
      const exKey  = this.dataset.exercise;
      const joint  = this.dataset.joint;
      const name   = this.dataset.name;
      const label  = this.closest('.rx-checkin-label').querySelector('.rx-checkin-text');
      const today  = new Date().toISOString().slice(0, 10);
      try {
        const res = await apiCall({ action: 'logCheckIn', email, date: today, joint, exerciseName: name });
        if (res.checked) {
          _checkedInToday.add(exKey);
          this.checked = true;
          label.innerHTML = 'Done today &#x2713;';
          trackEvent('protocol_checkin', { joint, exercise: name });
        } else {
          _checkedInToday.delete(exKey);
          this.checked = false;
          label.textContent = 'Mark as done today';
        }
        renderStreakBadge();
      } catch(e) { this.checked = !this.checked; }
    });
  });
  renderStreakBadge();
}

function renderStreakBadge() {
  const existing = document.getElementById('streak-badge');
  if (existing) existing.remove();
  if (_weekDaysCompleted === 0) return;
  const hero = document.querySelector('.protocol-hero');
  if (!hero) return;
  const badge = document.createElement('div');
  badge.id = 'streak-badge';
  badge.className = 'streak-badge';
  badge.innerHTML = '&#x1F525; ' + _weekDaysCompleted + ' day' + (_weekDaysCompleted !== 1 ? 's' : '') + ' this week';
  hero.appendChild(badge);
}

// Initialize on page load
initProtocol();