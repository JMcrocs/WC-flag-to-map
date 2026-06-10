(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const ROUND_TOTAL = 5;
  const MAX_SCORE = 100;

  const els = {
    homeButton: $('#homeButton'),
    restartButton: $('#restartButton'),
    startChallenge: $('#startChallenge'),
    screenHome: $('#screenHome'),
    screenGame: $('#screenGame'),
    screenResults: $('#screenResults'),
    roundNow: $('#roundNow'),
    roundTotal: $('#roundTotal'),
    totalScore: $('#totalScore'),
    flagScoreLabel: $('#flagScoreLabel'),
    avgError: $('#avgError'),
    roundLabel: $('#roundLabel'),
    viewLabel: $('#viewLabel'),
    flagStage: $('#flagStage'),
    promptFlag: $('#promptFlag'),
    promptTitle: $('#promptTitle'),
    promptText: $('#promptText'),
    answerPanel: $('#answerPanel'),
    feedbackBox: $('#feedbackBox'),
    nextButton: $('#nextButton'),
    finishButton: $('#finishButton'),
    worldMap: $('#worldMap'),
    mapInstruction: $('#mapInstruction'),
    selectedCoords: $('#selectedCoords'),
    confirmMap: $('#confirmMap'),
    zoomIn: $('#zoomIn'),
    zoomOut: $('#zoomOut'),
    resetMap: $('#resetMap'),
    resultsSummary: $('#resultsSummary'),
    resultMetrics: $('#resultMetrics'),
    profileGrid: $('#profileGrid'),
    playAgain: $('#playAgain'),
    copyResults: $('#copyResults')
  };

  const flagViewLabels = {
    crop: 'Extreme crop',
    blur: 'Heavy blur',
    mono: 'No-colour view',
    slice: 'Thin slice',
    window: 'Diagonal window'
  };

  const state = {
    plan: [],
    index: 0,
    current: null,
    phase: 'home',
    selected: null,
    results: [],
    flagCorrect: false,
    flagAttempt: '',
    flagAttempts: 0,
    flagPoints: 0,
    view: { x: 0, y: 0, w: MAP_META.width, h: MAP_META.height },
    drag: null
  };

  function flagSrc(team) {
    return `assets/flags/${team.code}.png`;
  }

  function shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function show(screen) {
    els.screenHome.hidden = screen !== 'home';
    els.screenGame.hidden = screen !== 'game';
    els.screenResults.hidden = screen !== 'results';
    els.restartButton.hidden = screen === 'home';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function svgEl(name, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function lonToX(lon) {
    return (lon + 180) / 360 * MAP_META.width;
  }

  function latToY(lat) {
    return (MAP_META.maxLat - lat) / (MAP_META.maxLat - MAP_META.minLat) * MAP_META.height;
  }

  function xToLon(x) {
    return x / MAP_META.width * 360 - 180;
  }

  function yToLat(y) {
    return MAP_META.maxLat - y / MAP_META.height * (MAP_META.maxLat - MAP_META.minLat);
  }

  function initMap() {
    els.worldMap.innerHTML = '';
    els.worldMap.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = svgEl('defs');
    defs.innerHTML = `
      <radialGradient id="oceanGlow" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stop-color="#173657" stop-opacity="0.58" />
        <stop offset="100%" stop-color="#071226" stop-opacity="0.18" />
      </radialGradient>`;
    els.worldMap.appendChild(defs);
    els.worldMap.appendChild(svgEl('rect', {
      x: 0,
      y: 0,
      width: MAP_META.width,
      height: MAP_META.height,
      fill: 'url(#oceanGlow)'
    }));

    const grid = svgEl('g', { class: 'map-grid', 'aria-hidden': 'true' });
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = lonToX(lon);
      grid.appendChild(svgEl('line', {
        x1: x,
        y1: 0,
        x2: x,
        y2: MAP_META.height,
        stroke: 'rgba(255,255,255,0.06)',
        'stroke-width': 0.5,
        'vector-effect': 'non-scaling-stroke'
      }));
    }
    for (let lat = -45; lat <= 75; lat += 15) {
      const y = latToY(lat);
      grid.appendChild(svgEl('line', {
        x1: 0,
        y1: y,
        x2: MAP_META.width,
        y2: y,
        stroke: 'rgba(255,255,255,0.06)',
        'stroke-width': 0.5,
        'vector-effect': 'non-scaling-stroke'
      }));
    }
    els.worldMap.appendChild(grid);

    const landGroup = svgEl('g', { id: 'landGroup', 'aria-label': 'World landmasses without country borders' });
    LAND_PATHS.forEach((d) => {
      landGroup.appendChild(svgEl('path', {
        d,
        class: 'land-shape'
      }));
    });
    els.worldMap.appendChild(landGroup);
    els.worldMap.appendChild(svgEl('g', { id: 'markerGroup' }));
    applyViewBox();
  }

  function clampView() {
    const v = state.view;
    v.w = Math.max(180, Math.min(MAP_META.width, v.w));
    v.h = v.w * MAP_META.height / MAP_META.width;
    if (v.h > MAP_META.height) {
      v.h = MAP_META.height;
      v.w = v.h * MAP_META.width / MAP_META.height;
    }
    v.x = Math.max(0, Math.min(MAP_META.width - v.w, v.x));
    v.y = Math.max(0, Math.min(MAP_META.height - v.h, v.y));
  }

  function applyViewBox() {
    clampView();
    els.worldMap.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
  }

  function resetMapView() {
    state.view = { x: 0, y: 0, w: MAP_META.width, h: MAP_META.height };
    applyViewBox();
  }

  function zoom(factor) {
    if (state.phase !== 'map') return;
    const old = { ...state.view };
    const cx = old.x + old.w / 2;
    const cy = old.y + old.h / 2;
    state.view.w = old.w * factor;
    state.view.h = old.h * factor;
    state.view.x = cx - state.view.w / 2;
    state.view.y = cy - state.view.h / 2;
    applyViewBox();
  }

  function mapPointFromEvent(event) {
    const rect = els.worldMap.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const view = state.view;
    const viewRatio = view.w / view.h;
    const rectRatio = rect.width / rect.height;
    let drawX = 0;
    let drawY = 0;
    let drawW = rect.width;
    let drawH = rect.height;

    // Account for preserveAspectRatio letterboxing so the visible pin lands exactly under the pointer.
    if (rectRatio > viewRatio) {
      drawW = rect.height * viewRatio;
      drawX = (rect.width - drawW) / 2;
    } else if (rectRatio < viewRatio) {
      drawH = rect.width / viewRatio;
      drawY = (rect.height - drawH) / 2;
    }

    const nx = Math.max(0, Math.min(1, (event.clientX - rect.left - drawX) / drawW));
    const ny = Math.max(0, Math.min(1, (event.clientY - rect.top - drawY) / drawH));

    return {
      x: Math.max(0, Math.min(MAP_META.width, view.x + nx * view.w)),
      y: Math.max(0, Math.min(MAP_META.height, view.y + ny * view.h))
    };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function makePlan() {
    const teams = shuffle(TEAMS).slice(0, ROUND_TOTAL);
    const views = shuffle(['crop', 'blur', 'mono', 'slice', 'window']);
    return teams.map((team, i) => ({ team, flagView: views[i] }));
  }

  function startGame() {
    state.plan = makePlan();
    state.index = 0;
    state.current = null;
    state.phase = 'flag';
    state.selected = null;
    state.results = [];
    state.flagCorrect = false;
    state.flagAttempt = '';
    state.flagAttempts = 0;
    state.flagPoints = 0;
    resetMapView();
    show('game');
    loadRound();
  }

  function loadRound() {
    state.current = state.plan[state.index];
    state.phase = 'flag';
    state.selected = null;
    state.flagCorrect = false;
    state.flagAttempt = '';
    state.flagAttempts = 0;
    state.flagPoints = 0;

    const { team, flagView } = state.current;
    resetMapView();
    resetMarkers();
    setMapActive(false);
    updateScorebar();

    els.roundLabel.textContent = `Round ${state.index + 1} of ${ROUND_TOTAL}`;
    els.viewLabel.textContent = flagViewLabels[flagView];
    els.flagStage.className = `flag-stage ${flagView} level-0`;
    els.promptFlag.src = flagSrc(team);
    els.promptFlag.alt = 'Altered real flag to identify';
    els.promptTitle.textContent = 'Name the country';
    els.promptText.textContent = 'Type the World Cup team from this altered flag. You have three attempts; the flag becomes clearer after each miss.';

    els.feedbackBox.hidden = true;
    els.feedbackBox.innerHTML = '';
    els.nextButton.hidden = true;
    els.finishButton.hidden = true;
    els.confirmMap.disabled = true;
    els.selectedCoords.textContent = 'No spot selected.';
    els.mapInstruction.textContent = 'Locked until the flag is answered.';

    renderTypedAnswer();
  }

  function renderTypedAnswer() {
    els.answerPanel.hidden = false;
    els.answerPanel.innerHTML = '';
    const form = document.createElement('form');
    form.className = 'answer-form';
    form.innerHTML = `
      <input class="answer-input" id="typedAnswer" type="text" autocomplete="off" spellcheck="false" placeholder="Country name" aria-label="Country name" />
      <button class="primary-button compact" type="submit">Submit</button>
      <p class="answer-note" id="answerNote">Three attempts. No multiple choice, no pre-filled hints.</p>`;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('#typedAnswer', form);
      const answer = input.value.trim();
      if (!answer) {
        input.focus();
        return;
      }
      submitFlagAnswer(answer);
    });

    els.answerPanel.appendChild(form);
    setTimeout(() => $('#typedAnswer', form)?.focus(), 50);
  }

  function submitFlagAnswer(answer) {
    if (state.phase !== 'flag') return;

    const { team, flagView } = state.current;
    state.flagAttempts += 1;
    state.flagAttempt = answer;

    const correct = isCorrect(answer, team);
    if (correct) {
      state.flagCorrect = true;
      state.flagPoints = flagPointsForAttempt(state.flagAttempts);
      openMapAfterFlag(true);
      return;
    }

    const attemptsLeft = Math.max(0, 3 - state.flagAttempts);
    const input = $('#typedAnswer', els.answerPanel);
    const note = $('#answerNote', els.answerPanel);

    if (state.flagAttempts >= 3) {
      state.flagCorrect = false;
      state.flagPoints = 0;
      openMapAfterFlag(false);
      return;
    }

    const level = Math.min(2, state.flagAttempts);
    els.flagStage.className = `flag-stage ${flagView} level-${level}`;
    const close = isNearMiss(answer, team);
    if (note) {
      note.className = `answer-note ${close ? 'warn' : 'bad'}`;
      note.textContent = close
        ? `Very close. Check spelling or the official team name. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
        : `Not that one. The flag has opened up slightly. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`;
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function flagPointsForAttempt(attempt) {
    if (attempt <= 1) return 8;
    if (attempt === 2) return 5;
    return 3;
  }

  function openMapAfterFlag(correct) {
    const { team } = state.current;
    state.phase = 'map';

    const input = $('#typedAnswer', els.answerPanel);
    const submit = $('button', els.answerPanel);
    const note = $('#answerNote', els.answerPanel);
    if (input) input.disabled = true;
    if (submit) submit.disabled = true;

    if (note) {
      note.className = correct ? 'answer-note good' : 'answer-note bad';
      note.textContent = correct
        ? `Correct: ${team.name}. Flag score: ${state.flagPoints}/8.`
        : `Answer revealed: ${team.name}. Flag score: 0/8.`;
    }

    els.flagStage.className = 'flag-stage revealed';
    els.promptFlag.alt = `${team.name} flag`;
    els.promptTitle.textContent = correct ? `Correct: ${team.name}` : `Answer: ${team.name}`;
    els.promptText.textContent = 'Now place that team on the world map. There are no country borders, so use geography.';
    els.mapInstruction.textContent = `Place ${team.name}. Tap or click a spot, then confirm.`;
    setMapActive(true);
  }

  function isNearMiss(answer, team) {
    const value = normalize(answer);
    if (value.length < 3) return false;
    const accepted = [team.name, ...(team.aliases || [])].map(normalize);
    return accepted.some(item => levenshtein(value, item) <= Math.max(2, Math.ceil(item.length * 0.22)));
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(the|team|national|republic)\b/g, ' ')
      .trim();
  }

  function isCorrect(answer, team) {
    const value = normalize(answer);
    const accepted = [team.name, ...(team.aliases || [])].map(normalize);
    if (accepted.includes(value)) return true;
    return accepted.some(item => value.length >= 5 && levenshtein(value, item) <= 2);
  }

  function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[a.length][b.length];
  }

  function selectMapPoint(point) {
    if (state.phase !== 'map' || !point) return;
    state.selected = point;
    const lat = yToLat(point.y);
    const lon = xToLon(point.x);
    els.selectedCoords.textContent = `Selected: ${lat.toFixed(1)} deg, ${lon.toFixed(1)} deg. Confirm when ready.`;
    els.confirmMap.disabled = false;
    drawMarkers({ selected: point });
  }

  function confirmMap() {
    if (state.phase !== 'map' || !state.selected) return;

    const { team } = state.current;
    const selectedLat = yToLat(state.selected.y);
    const selectedLon = xToLon(state.selected.x);
    const distance = Math.round(haversineKm(selectedLat, selectedLon, team.lat, team.lon));
    const flagPoints = state.flagPoints;
    const mapPoints = mapScore(distance, team.radius);
    const roundScore = flagPoints + mapPoints;

    const result = {
      teamId: team.id,
      distance,
      flagCorrect: Boolean(state.flagCorrect),
      flagAttempt: state.flagAttempt,
      flagAttempts: state.flagAttempts,
      flagPoints,
      mapPoints,
      roundScore,
      mapHit: mapPoints === 12
    };

    state.results.push(result);
    state.phase = 'feedback';
    els.confirmMap.disabled = true;
    els.answerPanel.hidden = true;
    setMapActive(false);
    drawMarkers({
      selected: state.selected,
      correct: { x: team.x, y: team.y },
      line: true
    });
    showFeedback(result, team);
    updateScorebar();
  }

  function mapScore(distance, radius) {
    if (distance <= radius) return 12;
    if (distance <= Math.max(500, radius * 1.35)) return 9;
    if (distance <= Math.max(1500, radius * 2.3)) return 6;
    if (distance <= 3500) return 3;
    return 0;
  }

  function mapTemperature(distance, radius) {
    if (distance <= radius) return ['feedback-good', 'Direct hit'];
    if (distance <= Math.max(500, radius * 1.35)) return ['feedback-good', 'Very close'];
    if (distance <= Math.max(1500, radius * 2.3)) return ['', 'Close'];
    if (distance <= 3500) return ['', 'Far'];
    return ['feedback-bad', 'Cold'];
  }

  function showFeedback(result, team) {
    const [klass, label] = mapTemperature(result.distance, team.radius);
    const opponents = groupOpponents(team).join(', ');
    const flagText = result.flagCorrect ? `Correct in ${result.flagAttempts} attempt${result.flagAttempts === 1 ? '' : 's'}` : `Revealed after 3 attempts`;
    const coachLine = coachRemark(result, team);

    els.feedbackBox.hidden = false;
    els.feedbackBox.innerHTML = `
      <article class="team-reveal-card">
        <div class="team-reveal-top">
          <img src="${flagSrc(team)}" alt="${escapeHtml(team.name)} flag" />
          <div>
            <div class="profile-kickers">
              <span>FIFA rank #${escapeHtml(team.fifaRank)}</span>
              <span>Group ${escapeHtml(team.group)}</span>
              <span>${escapeHtml(team.confed)}</span>
            </div>
            <h3>${escapeHtml(team.name)}</h3>
            <p class="coach-line">${escapeHtml(coachLine)}</p>
            <p class="editorial-line">${escapeHtml(team.outlook)}</p>
          </div>
        </div>
        <div class="profile-meta prominent">
          <div><b>Fun fact</b><span>${escapeHtml(team.funFact)}</span></div>
          <div><b>Group context</b><span>Opponents: ${escapeHtml(opponents)}.</span></div>
          <div><b>Geography</b><span>Capital: ${escapeHtml(team.capital)}. Region: ${escapeHtml(team.continent)}.</span></div>
          <div><b>Your round</b><span>Flag: ${escapeHtml(flagText)} (${result.flagPoints}/8). Map: <span class="${klass}">${label}</span>, ${distanceLabel(result.distance)} away (${result.mapPoints}/12).</span></div>
        </div>
        <div class="round-score-line">
          <strong>${result.roundScore}/20 points</strong>
          <span>Flag ${result.flagPoints}/8 + map ${result.mapPoints}/12</span>
        </div>
      </article>`;

    els.mapInstruction.textContent = 'Correct location shown. Read the team card, then continue.';
    els.nextButton.hidden = state.index >= ROUND_TOTAL - 1;
    els.finishButton.hidden = state.index < ROUND_TOTAL - 1;
    els.feedbackBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function coachRemark(result, team) {
    if (result.flagCorrect && result.flagAttempts === 1 && result.mapPoints === 12) {
      return 'Clean finish. No VAR needed.';
    }
    if (result.mapPoints === 12) return 'The pin landed like a perfect through ball.';
    if (result.mapPoints >= 9) return 'Close enough for the team bus to find the stadium.';
    if (result.distance > 5000) return `A bold tactical decision. ${team.name} was in another part of the map.`;
    if (!result.flagCorrect) return 'The flag caused trouble, but the team card is unlocked.';
    return 'Solid scouting. The geography still had a little pressure.';
  }

  function scoreTitle(total) {
    if (total >= 90) return 'World Cup Scout';
    if (total >= 75) return 'Knockout Round Ready';
    if (total >= 60) return 'Group Stage Specialist';
    if (total >= 40) return 'Friendly Match Level';
    return 'Lost in Qualifying';
  }

  function scoutReport(flags, hits, avg) {
    if (flags >= 4 && hits >= 3) return 'You were strong on both flags and map placement.';
    if (flags >= 4) return 'Your flag reading was sharp; the map was the harder part.';
    if (hits >= 3) return 'Your geography was better than your flag recognition.';
    if (avg > 3500) return 'The next training session should focus on continent placement.';
    return 'A mixed scouting report, with useful teams learned.';
  }

  function groupOpponents(team) {
    return TEAMS
      .filter(item => item.group === team.group && item.id !== team.id)
      .map(item => item.name);
  }

  function nextRound() {
    if (state.index < ROUND_TOTAL - 1) {
      state.index += 1;
      loadRound();
    } else {
      showResults();
    }
  }

  function showResults() {
    state.phase = 'results';
    updateScorebar();

    const total = totalPoints();
    const flags = state.results.filter(r => r.flagCorrect).length;
    const hits = state.results.filter(r => r.mapHit).length;
    const avg = averageError();

    const title = scoreTitle(total);
    const scout = scoutReport(flags, hits, avg);
    els.resultsSummary.textContent = `${title}. You unlocked 5 World Cup team cards. Final score: ${total}/${MAX_SCORE}. ${scout}`;
    els.resultMetrics.innerHTML = `
      <div><strong>${total}/${MAX_SCORE}</strong><span>Total score</span></div>
      <div><strong>${flags}/${ROUND_TOTAL}</strong><span>Flags recognized</span></div>
      <div><strong>${hits}/${ROUND_TOTAL}</strong><span>Direct map hits</span></div>
      <div><strong>${distanceLabel(avg)}</strong><span>Average map error</span></div>`;
    renderProfiles();
    show('results');
  }

  function renderProfiles() {
    const byId = new Map(state.results.map(r => [r.teamId, r]));
    els.profileGrid.innerHTML = '';

    state.plan.forEach(({ team }) => {
      const r = byId.get(team.id);
      const opponents = groupOpponents(team).join(', ');
      const card = document.createElement('article');
      card.className = 'profile-card';
      card.innerHTML = `
        <div class="profile-head">
          <img src="${flagSrc(team)}" alt="${escapeHtml(team.name)} flag" loading="lazy" />
          <div>
            <div class="profile-kickers">
              <span>FIFA rank #${escapeHtml(team.fifaRank)}</span>
              <span>Group ${escapeHtml(team.group)}</span>
              <span>${escapeHtml(team.confed)}</span>
            </div>
            <h3>${escapeHtml(team.name)}</h3>
          </div>
        </div>
        <p class="editorial-line">${escapeHtml(team.outlook)}</p>
        <div class="profile-meta prominent">
          <div><b>Fun fact</b><span>${escapeHtml(team.funFact)}</span></div>
          <div><b>Group opponents</b><span>${escapeHtml(opponents)}</span></div>
          <div><b>Geography</b><span>${escapeHtml(team.capital)}, ${escapeHtml(team.continent)}</span></div>
          <div><b>Your result</b><span>${r ? `Flag ${r.flagCorrect ? 'correct' : 'revealed'} (${r.flagPoints}/8), map ${distanceLabel(r.distance)} away.` : 'Not played.'}</span></div>
        </div>
        <div class="card-score">
          <span class="status-dot ${r && r.roundScore >= 14 ? 'good' : ''}"></span>
          ${r ? `${r.roundScore}/20 points` : 'Not played'}
        </div>`;
      els.profileGrid.appendChild(card);
    });
  }

  function updateScorebar() {
    els.roundNow.textContent = Math.min(state.index + 1, ROUND_TOTAL);
    els.roundTotal.textContent = ROUND_TOTAL;
    els.totalScore.textContent = totalPoints().toLocaleString('en-US');
    const flags = state.results.filter(r => r.flagCorrect).length;
    els.flagScoreLabel.textContent = `${flags}/${ROUND_TOTAL}`;
    els.avgError.textContent = state.results.length ? distanceLabel(averageError()) : '-';
  }

  function totalPoints() {
    return state.results.reduce((sum, r) => sum + r.roundScore, 0);
  }

  function averageError() {
    if (!state.results.length) return 0;
    return Math.round(state.results.reduce((sum, r) => sum + r.distance, 0) / state.results.length);
  }

  function distanceLabel(km) {
    return Number(km || 0).toLocaleString('en-US') + ' km';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function resetMarkers() {
    drawMarkers({});
  }

  function drawMarkers(opts = {}) {
    const group = $('#markerGroup', els.worldMap);
    if (!group) return;
    group.innerHTML = '';

    if (opts.line && opts.selected && opts.correct) {
      group.appendChild(svgEl('line', {
        x1: opts.selected.x,
        y1: opts.selected.y,
        x2: opts.correct.x,
        y2: opts.correct.y,
        class: 'map-connector'
      }));
    }
    if (opts.selected) group.appendChild(pin(opts.selected.x, opts.selected.y, 'selected'));
    if (opts.correct) group.appendChild(pin(opts.correct.x, opts.correct.y, 'correct'));
  }

  function pin(x, y, type) {
    const g = svgEl('g', { class: `map-pin ${type}`, transform: `translate(${x},${y})` });
    g.appendChild(svgEl('circle', { cx: 0, cy: 0, r: type === 'correct' ? 6 : 7 }));
    if (type === 'correct') {
      g.appendChild(svgEl('circle', {
        cx: 0,
        cy: 0,
        r: 14,
        fill: 'none',
        stroke: 'rgba(30,159,117,0.42)',
        'stroke-width': 2,
        'vector-effect': 'non-scaling-stroke'
      }));
    }
    return g;
  }

  function setMapActive(active) {
    els.worldMap.classList.toggle('active', Boolean(active));
  }

  function copySummary() {
    const total = totalPoints();
    const flags = state.results.filter(r => r.flagCorrect).length;
    const hits = state.results.filter(r => r.mapHit).length;
    const avg = averageError();
    const teams = state.plan.map(({ team }) => team.name).join(', ');
    const text = `World Cup 2026 Flag-to-Map\nResult: ${scoreTitle(total)}\nScore: ${total}/${MAX_SCORE}\nFlags recognized: ${flags}/${ROUND_TOTAL}\nDirect map hits: ${hits}/${ROUND_TOTAL}\nAverage map error: ${distanceLabel(avg)}\nTeams: ${teams}`;

    navigator.clipboard?.writeText(text).then(() => {
      els.copyResults.textContent = 'Copied';
      setTimeout(() => { els.copyResults.textContent = 'Copy summary'; }, 1400);
    }).catch(() => {
      els.copyResults.textContent = 'Copy unavailable';
      setTimeout(() => { els.copyResults.textContent = 'Copy summary'; }, 1400);
    });
  }

  function bindEvents() {
    els.startChallenge.addEventListener('click', startGame);
    els.restartButton.addEventListener('click', startGame);
    els.homeButton.addEventListener('click', () => {
      state.phase = 'home';
      show('home');
    });
    els.playAgain.addEventListener('click', startGame);
    els.copyResults.addEventListener('click', copySummary);
    els.nextButton.addEventListener('click', nextRound);
    els.finishButton.addEventListener('click', showResults);
    els.confirmMap.addEventListener('click', confirmMap);
    els.zoomIn.addEventListener('click', () => zoom(0.72));
    els.zoomOut.addEventListener('click', () => zoom(1.38));
    els.resetMap.addEventListener('click', () => {
      if (state.phase === 'map') resetMapView();
    });

    els.worldMap.addEventListener('pointerdown', (event) => {
      if (state.phase !== 'map') return;
      event.preventDefault();
      els.worldMap.setPointerCapture?.(event.pointerId);
      const rect = els.worldMap.getBoundingClientRect();
      state.drag = {
        startX: event.clientX,
        startY: event.clientY,
        rectWidth: rect.width || 1,
        rectHeight: rect.height || 1,
        view: { ...state.view },
        moved: false
      };
    });

    els.worldMap.addEventListener('pointermove', (event) => {
      if (!state.drag || state.phase !== 'map') return;
      event.preventDefault();
      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) state.drag.moved = true;
      if (state.drag.moved && state.view.w < MAP_META.width * 0.995) {
        state.view.x = state.drag.view.x - (dx / state.drag.rectWidth) * state.drag.view.w;
        state.view.y = state.drag.view.y - (dy / state.drag.rectHeight) * state.drag.view.h;
        applyViewBox();
      }
    });

    els.worldMap.addEventListener('pointerup', (event) => {
      if (!state.drag || state.phase !== 'map') return;
      event.preventDefault();
      const wasDrag = state.drag.moved;
      state.drag = null;
      if (!wasDrag) selectMapPoint(mapPointFromEvent(event));
    });

    els.worldMap.addEventListener('pointercancel', () => {
      state.drag = null;
    });
  }

  els.roundTotal.textContent = ROUND_TOTAL;
  initMap();
  bindEvents();
})();
