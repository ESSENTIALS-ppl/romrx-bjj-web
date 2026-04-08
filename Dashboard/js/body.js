// ROMRxBJJ My Body Logic — v4 (radar chart + belt promotion + threshold fix)

const BELT_COLORS = {
  white:  { bg: '#F5F5F5', text: '#36454F', border: '#CCC' },
  blue:   { bg: '#1E88E5', text: '#FFFFFF', border: '#1565C0' },
  purple: { bg: '#7B1FA2', text: '#FFFFFF', border: '#6A1B9A' },
  brown:  { bg: '#6D4C41', text: '#FFFFFF', border: '#5D4037' },
  black:  { bg: '#212121', text: '#FFFFFF', border: '#000000' }
};

async function initBody() {
  const session = requireAuth();
  if (!session) return;
  if (!checkSubscription()) return;

  document.getElementById('user-name').textContent = session.name.split(' ')[0];

  document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Log out?')) { clearSession(); window.location.href = 'index.html'; }
  });

  try {
    // Fetch profile AND progress in parallel
    const [data, progressData] = await Promise.all([
      apiGetProfile(session.email),
      apiGetProgress(session.email)
    ]);

    if (data.success) {
      renderProfileHeader(data);
      renderTechniqueSummary(data.techniques);
      renderBilateralJoints(data.bilateralJoints);
      renderMidlineJoints(data.midlineJoints);
      document.getElementById('tech-summary-container').style.display = 'block';
      document.getElementById('bilateral-container').style.display = 'block';
      document.getElementById('midline-container').style.display = 'block';
    } else {
      showError('Could not load profile. Please try again.');
    }

    // Render radar chart if progress data exists
    if (progressData && progressData.success && progressData.assessments && progressData.assessments.length > 0) {
      renderRadarChart(progressData);
      document.getElementById('radar-container').style.display = 'block';
    }

  } catch (e) {
    console.error(e);
    showError('Network error. Please refresh.');
  }

  // Fetch Belt Promotion Status (independent call, no caching)
  try {
    await renderBeltPromotion(session.email);
  } catch (e) {
    console.error('Belt promotion check failed:', e);
  }
}

function renderProfileHeader(data) {
  const container = document.getElementById('profile-header-container');
  const dateStr = data.assessmentDate ? new Date(data.assessmentDate).toLocaleDateString() : 'Unknown Date';

  let injuryHtml = '';
  if (data.injuries) {
    if (data.injuries.hip && data.injuries.hip !== 'None')
      injuryHtml += `<span class="injury-tag">Hip: ${data.injuries.hip}</span>`;
    if (data.injuries.knee && data.injuries.knee !== 'None')
      injuryHtml += `<span class="injury-tag">Knee: ${data.injuries.knee}</span>`;
    if (data.injuries.shoulder && data.injuries.shoulder !== 'None')
      injuryHtml += `<span class="injury-tag">Shoulder: ${data.injuries.shoulder}</span>`;
  }

  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-top">
        <div class="profile-name">
          <h2>${data.name}</h2>
          <div class="profile-meta">Assessed ${dateStr}</div>
        </div>
        <div class="profile-badges">
          ${data.dominantSide ? `<span class="stat-badge">Dominant: ${data.dominantSide}</span>` : ''}
          ${data.experience ? `<span class="stat-badge">${data.experience}</span>` : ''}
        </div>
      </div>
      <div class="profile-bottom">
        ${injuryHtml ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${injuryHtml}</div>` : ''}
      </div>
    </div>`;
}

function renderTechniqueSummary(techs) {
  if (!techs) return;
  document.getElementById('count-green').textContent = techs.green || 0;
  document.getElementById('count-yellow').textContent = techs.yellow || 0;
  document.getElementById('count-red').textContent = techs.red || 0;
}

function renderRadarChart(progressData) {
  const container = document.getElementById('radar-chart');
  const thresholds = progressData.thresholds;
  const assessments = progressData.assessments;

  if (assessments.length === 0) {
    container.innerHTML = '<p style="color:#888">No assessment data for radar chart.</p>';
    return;
  }

  // Auto-detect joints present in BOTH thresholds and at least one assessment
  const assessedJoints = new Set();
  assessments.forEach(function(a) {
    Object.keys(a.joints).forEach(function(j) { assessedJoints.add(j); });
  });

  const radarJoints = Object.keys(thresholds).filter(function(j) {
    return assessedJoints.has(j);
  }).sort();

  if (radarJoints.length < 3) {
    container.innerHTML = '<p style="color:#888">Not enough joint data for radar chart.</p>';
    return;
  }

  // Short labels for display
  const shortLabels = {
    'Hip External Rotation': 'Hip ER',
    'Hip Internal Rotation': 'Hip IR',
    'Hip Flexion': 'Hip Flex',
    'Hip Extension': 'Hip Ext',
    'Hip Abduction': 'Hip Abd',
    'Ankle Dorsiflexion': 'Ankle DF',
    'Shoulder Flexion': 'Shoulder Flex',
    'Shoulder External Rotation': 'Shoulder ER'
  };
  const labels = radarJoints.map(function(j) { return shortLabels[j] || j; });

  // Colors: most recent = solid teal, older = copper dashed, oldest = gray dashed
  const colorSets = [
    { bg: 'rgba(0,128,128,0.25)', border: 'rgba(0,128,128,1)', pointBg: 'rgba(0,128,128,1)' },
    { bg: 'rgba(184,115,51,0.15)', border: 'rgba(184,115,51,0.8)', pointBg: 'rgba(184,115,51,0.8)' },
    { bg: 'rgba(150,150,150,0.10)', border: 'rgba(150,150,150,0.6)', pointBg: 'rgba(150,150,150,0.6)' }
  ];

  // Show most recent assessments (max 3), most recent first
  let recent = assessments.slice(-3).reverse();

  let datasets = recent.map(function(a, i) {
    let color = colorSets[i] || colorSets[2];
    let dateLabel = new Date(a.date).toLocaleDateString();
    let values = radarJoints.map(function(j) {
      let jointData = a.joints[j];
      if (!jointData) return 0;
      let avg = jointData.avg || jointData.value || ((jointData.left + jointData.right) / 2) || 0;
      let threshold = thresholds[j] || 1;
      return Math.round((avg / threshold) * 100);
    });

    return {
      label: dateLabel,
      data: values,
      backgroundColor: color.bg,
      borderColor: color.border,
      pointBackgroundColor: color.pointBg,
      pointRadius: 4,
      borderWidth: i === 0 ? 2.5 : 1.5,
      borderDash: i === 0 ? [] : [5, 5]
    };
  });

  // Build legend HTML
  let legendHtml = '<div class="radar-legend">';
  recent.forEach(function(a, i) {
    let color = colorSets[i] || colorSets[2];
    let dateLabel = new Date(a.date).toLocaleDateString();
    let label = i === 0 ? dateLabel + ' (Latest)' : dateLabel;
    legendHtml += '<div class="radar-legend-item"><span class="radar-legend-swatch" style="background:' + color.border + '"></span> ' + label + '</div>';
  });
  legendHtml += '</div>';

  container.innerHTML = legendHtml + '<canvas id="radarCanvas"></canvas>';

  let ctx = document.getElementById('radarCanvas').getContext('2d');
  new Chart(ctx, {
    type: 'radar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 120,
          ticks: {
            stepSize: 20,
            callback: function(val) { return val + '%'; },
            font: { size: 10 },
            backdropColor: 'transparent'
          },
          pointLabels: {
            font: { size: 11, family: 'Inter' },
            color: '#36454F'
          },
          grid: { color: 'rgba(0,0,0,0.08)' },
          angleLines: { color: 'rgba(0,0,0,0.08)' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) { return context.dataset.label + ': ' + context.raw + '% of threshold'; }
          }
        }
      }
    }
  });
}

function renderBilateralJoints(joints) {
  const list = document.getElementById('bilateral-list');
  if (!joints || joints.length === 0) {
    list.innerHTML = '<p style="color:#888">No joint data available.</p>';
    return;
  }
  list.innerHTML = joints.map(j => {
    const status = (j.flag || 'GREEN').toUpperCase();

    // Asymmetry badge — matches system thresholds (>=15% YELLOW, >=25% RED)
    let asymClass = 'asym-green';
    if (j.asymmetry >= 15) asymClass = 'asym-yellow';
    if (j.asymmetry >= 25) asymClass = 'asym-red';

    return `
      <div class="body-joint-card status-${status}">
        <div class="joint-info">
          <h4>${j.joint}</h4>
          <div class="joint-range">Target: ${j.normalRange || 'N/A'}</div>
        </div>
        <div class="joint-stats">
          <div class="asym-badge ${asymClass}">${j.asymmetry}% Asym</div>
          <div class="rom-values">L: ${j.left} | R: ${j.right}</div>
        </div>
      </div>`;
  }).join('');
}

function renderMidlineJoints(joints) {
  const list = document.getElementById('midline-list');
  if (!joints || joints.length === 0) {
    list.innerHTML = '<p style="color:#888">No midline data available.</p>';
    return;
  }
  list.innerHTML = joints.map(j => {
    return `
      <div class="body-joint-card">
        <div class="joint-info">
          <h4>${j.joint}</h4>
          <div class="joint-range">Target: ${j.normalRange || 'N/A'}</div>
        </div>
        <div class="joint-stats">
          <div class="midline-value">${j.value}\u00B0</div>
        </div>
      </div>`;
  }).join('');
}

async function renderBeltPromotion(email) {
  const container = document.getElementById('belt-promotion-container');
  if (!container) return;

  const data = await apiCheckPromotion(email);
  if (!data.success) return;

  const belt = data.currentBelt || 'white';
  const colors = BELT_COLORS[belt] || BELT_COLORS.white;
  const beltLabel = belt.charAt(0).toUpperCase() + belt.slice(1);

  let actionHtml = '';

  if (data.isMaxBelt) {
    actionHtml = `<div class="belt-max">\uD83E\uDD4B Highest rank achieved</div>`;
  } else if (data.hasPending) {
    const reqDate = data.pendingDetails?.requestDate
      ? new Date(data.pendingDetails.requestDate).toLocaleDateString()
      : '';
    const reqBelt = data.pendingDetails?.requestedBelt || 'next';
    const reqLabel = reqBelt.charAt(0).toUpperCase() + reqBelt.slice(1);
    actionHtml = `
      <div class="belt-pending">
        <span class="belt-pending-icon">\u23F3</span>
        <span>Promotion to <strong>${reqLabel} Belt</strong> requested${reqDate ? ' on ' + reqDate : ''} \u2014 Pending Review</span>
      </div>`;
  } else {
    const nextBelt = data.nextBelt || 'blue';
    const nextLabel = nextBelt.charAt(0).toUpperCase() + nextBelt.slice(1);
    const nextColors = BELT_COLORS[nextBelt] || BELT_COLORS.blue;
    actionHtml = `
      <button id="btn-request-promotion" class="belt-promote-btn"
        style="background:${nextColors.bg};color:${nextColors.text};border-color:${nextColors.border}">
        Request Promotion to ${nextLabel} Belt
      </button>`;
  }

  container.innerHTML = `
    <div class="belt-promotion-card">
      <div class="belt-badge" style="background:${colors.bg};color:${colors.text};border-color:${colors.border}">
        \uD83E\uDD4B ${beltLabel} Belt
      </div>
      ${actionHtml}
    </div>`;
  container.style.display = 'block';

  const btn = document.getElementById('btn-request-promotion');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      try {
        const result = await apiRequestPromotion(email);
        if (result.success) {
          const reqLabel = (result.requestedBelt || 'blue');
          const label = reqLabel.charAt(0).toUpperCase() + reqLabel.slice(1);
          btn.outerHTML = `
            <div class="belt-pending">
              <span class="belt-pending-icon">\u23F3</span>
              <span>Promotion to <strong>${label} Belt</strong> requested \u2014 Pending Review</span>
            </div>`;
        } else {
          btn.textContent = result.error || 'Request failed. Try again later.';
          btn.disabled = false;
        }
      } catch (err) {
        console.error(err);
        btn.textContent = 'Network error. Try again.';
        btn.disabled = false;
      }
    });
  }
}

function showError(msg) {
  document.getElementById('profile-header-container').innerHTML =
    `<div class="protocol-error"><p>${msg}</p></div>`;
}

// Start
initBody();