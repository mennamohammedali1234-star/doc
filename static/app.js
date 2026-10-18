// Automated Resume Screening - Client App Logic

let currentTab = 'text';
let uploadedFiles = [];
let presetsData = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Fetch presets
  try {
    const res = await fetch('/api/presets');
    if (res.ok) {
      presetsData = await res.json();
      // Load Data Engineer preset by default
      loadPreset('data-engineer');
    }
  } catch (e) {
    console.error('Failed to load presets:', e);
    // fallback initialize with 2 blank candidates
    addCandidateRow('Candidate 1', '');
    addCandidateRow('Candidate 2', '');
  }

  setupDropzone();
});

function switchCandidateTab(tab) {
  currentTab = tab;
  document.getElementById('tabTextBtn').classList.toggle('active', tab === 'text');
  document.getElementById('tabUploadBtn').classList.toggle('active', tab === 'upload');
  document.getElementById('tabTextContent').classList.toggle('active', tab === 'text');
  document.getElementById('tabUploadContent').classList.toggle('active', tab === 'upload');
}

function addCandidateRow(name = '', text = '') {
  const container = document.getElementById('candidatesList');
  const index = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'candidate-row';
  row.innerHTML = `
    <div class="candidate-row-header">
      <input type="text" class="candidate-name-input" placeholder="Candidate Name (e.g. Sarah)" value="${escapeHtml(name || `Candidate ${index}`)}">
      <button type="button" class="btn-remove-row" title="Remove Candidate" onclick="this.closest('.candidate-row').remove()">✕</button>
    </div>
    <textarea class="candidate-text-area" rows="3" placeholder="Paste resume text or skills profile...">${escapeHtml(text)}</textarea>
  `;
  container.appendChild(row);
}

function clearAll() {
  document.getElementById('jobDescription').value = '';
  document.getElementById('candidatesList').innerHTML = '';
  uploadedFiles = [];
  renderFilesList();
  addCandidateRow('Candidate 1', '');
  addCandidateRow('Candidate 2', '');
  document.getElementById('resultsContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
}

function loadPreset(presetId) {
  const preset = presetsData.find(p => p.id === presetId);
  if (!preset) return;

  document.getElementById('jobDescription').value = preset.job_desc;
  const container = document.getElementById('candidatesList');
  container.innerHTML = '';

  preset.candidates.forEach(c => {
    addCandidateRow(c.name, c.text);
  });

  switchCandidateTab('text');
}

// File dropzone logic
function setupDropzone() {
  const dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    handleFiles(files);
  });
}

function handleFileSelect(e) {
  handleFiles(e.target.files);
}

function handleFiles(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Check if already added
    if (!uploadedFiles.some(f => f.name === file.name)) {
      uploadedFiles.push(file);
    }
  }
  renderFilesList();
}

function renderFilesList() {
  const container = document.getElementById('selectedFilesList');
  if (!container) return;

  if (uploadedFiles.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = uploadedFiles.map((file, idx) => `
    <div class="file-item">
      <span class="file-name">📄 ${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)</span>
      <button type="button" class="btn-remove-row" onclick="removeFile(${idx})">✕</button>
    </div>
  `).join('');
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFilesList();
}

// Run Screening Analysis
async function runScreening() {
  const jobDesc = document.getElementById('jobDescription').value.trim();
  if (!jobDesc) {
    alert('Please enter a Job Description.');
    return;
  }

  const loading = document.getElementById('loadingState');
  const empty = document.getElementById('emptyState');
  const container = document.getElementById('resultsContainer');

  loading.style.display = 'block';
  empty.style.display = 'none';
  container.style.display = 'none';

  try {
    let response;

    if (currentTab === 'upload' && uploadedFiles.length > 0) {
      // Use FormData
      const formData = new FormData();
      formData.append('job_description', jobDesc);
      uploadedFiles.forEach(file => {
        formData.append('files[]', file);
      });
      response = await fetch('/api/screen', {
        method: 'POST',
        body: formData
      });
    } else {
      // Use JSON with candidate cards
      const candidateRows = document.querySelectorAll('.candidate-row');
      const candidates = [];
      candidateRows.forEach(row => {
        const nameInput = row.querySelector('.candidate-name-input');
        const textInput = row.querySelector('.candidate-text-area');
        const name = nameInput ? nameInput.value.trim() : '';
        const text = textInput ? textInput.value.trim() : '';
        if (name && text) {
          candidates.push({ name, text });
        }
      });

      if (candidates.length === 0) {
        alert('Please enter at least one candidate with a name and resume text.');
        loading.style.display = 'none';
        empty.style.display = 'block';
        return;
      }

      response = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_description: jobDesc,
          candidates: candidates
        })
      });
    }

    const data = await response.json();
    loading.style.display = 'none';

    if (!response.ok) {
      alert(data.error || 'Failed to screen resumes.');
      empty.style.display = 'block';
      return;
    }

    displayResults(data);

  } catch (err) {
    loading.style.display = 'none';
    empty.style.display = 'block';
    alert('Network error: ' + err.message);
  }
}

function displayResults(data) {
  const empty = document.getElementById('emptyState');
  const container = document.getElementById('resultsContainer');
  const rankList = document.getElementById('rankList');

  empty.style.display = 'none';
  container.style.display = 'block';

  // Winner banner
  const top = data.ranked[0];
  if (top) {
    document.getElementById('winnerName').textContent = top.name;
    document.getElementById('winnerScore').textContent = `${top.score_percent} Match Score`;
  }

  // Render cards
  rankList.innerHTML = data.ranked.map((c, i) => {
    const isFirst = i === 0;
    const progressWidth = Math.min(100, Math.max(5, c.score * 100));

    const matchedChips = (c.matched_keywords && c.matched_keywords.length)
      ? c.matched_keywords.map(k => `<span class="chip matched">✓ ${escapeHtml(k)}</span>`).join('')
      : '<span class="chip">None</span>';

    const missingChips = (c.missing_keywords && c.missing_keywords.length)
      ? c.missing_keywords.map(k => `<span class="chip missing">✗ ${escapeHtml(k)}</span>`).join('')
      : '<span class="chip">None</span>';

    const negatedChips = (c.negated_keywords && c.negated_keywords.length)
      ? c.negated_keywords.map(k => `<span class="chip negated">⚠️ Negated: ${escapeHtml(k)}</span>`).join('')
      : '';

    return `
      <div class="rank-card ${isFirst ? 'rank-1' : ''}">
        <div class="rank-card-header">
          <div class="rank-badge-wrap">
            <span class="rank-position">#${c.rank}</span>
            <span class="rank-name">${escapeHtml(c.name)}</span>
          </div>
          <span class="tier-badge ${c.tier}">${c.badge}</span>
        </div>

        <div class="score-progress-wrap">
          <div class="score-header">
            <span>Overall Recruitment Match Score</span>
            <span class="score-percentage">${c.score_percent}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressWidth}%"></div>
          </div>
          <div class="sub-scores-row">
            <span class="sub-score-item">
              <span class="sub-score-label">🎯 Skills Match:</span>
              <strong class="sub-score-val">${c.skill_match_percent || c.score_percent}</strong>
              <span class="sub-score-detail">(${c.skills_ratio || ''})</span>
            </span>
            <span class="sub-score-item">
              <span class="sub-score-label">📄 Context Relevance:</span>
              <strong class="sub-score-val">${c.context_match_percent || c.score_percent}</strong>
            </span>
          </div>
        </div>

        <div class="keywords-section">
          ${c.negated_keywords && c.negated_keywords.length ? `
          <div class="chip-row">
            <span class="chip-label" style="color: #fb7185;">Penalized:</span>
            ${negatedChips}
          </div>` : ''}
          <div class="chip-row">
            <span class="chip-label">Matched:</span>
            ${matchedChips}
          </div>
          <div class="chip-row">
            <span class="chip-label">Missing:</span>
            ${missingChips}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
