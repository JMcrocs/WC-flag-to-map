(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const ROUND_TOTAL = 5;
  const MAX_SCORE = 100;

  const MODE_CONFIGS = {
    normal: {
      id: 'normal',
      label: 'Normal',
      flagMaxAttempts: 3,
      flagPoints: [10, 5, 2],
      capitalMaxAttempts: 0,
      capitalPoints: [],
      mapMax: 10,
      timeMax: 0,
      usesCapital: false,
      usesTimer: false
    },
    hardcore: {
      id: 'hardcore',
      label: 'HARDCORE',
      flagMaxAttempts: 2,
      flagPoints: [5, 1],
      capitalMaxAttempts: 1,
      capitalPoints: [5],
      mapMax: 7,
      timeMax: 3,
      usesCapital: true,
      usesTimer: true
    }
  };

  const els = {
    brand: $('.brand'),
    homeButton: $('#homeButton'),
    restartButton: $('#restartButton'),
    startChallenge: $('#startChallenge'),
    startHardcore: $('#startHardcore'),
    screenHome: $('#screenHome'),
    screenGame: $('#screenGame'),
    screenResults: $('#screenResults'),
    roundNow: $('#roundNow'),
    roundTotal: $('#roundTotal'),
    totalScore: $('#totalScore'),
    modeStatus: $('#modeStatus'),
    timerStatus: $('#timerStatus'),
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
    crop: 'Hard crop',
    blur: 'Heavy blur',
    mono: 'Colour removed',
    slice: 'Narrow slice',
    window: 'Small window'
  };

  const state = {
    mode: 'normal',
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
    capitalCorrect: false,
    capitalAttempt: '',
    capitalAttempts: 0,
    capitalPoints: 0,
    roundStartMs: 0,
    roundElapsedSec: 0,
    timerInterval: null,
    view: { x: 0, y: 0, w: MAP_META.width, h: MAP_META.height },
    drag: null
  };

  function config() {
    return MODE_CONFIGS[state.mode] || MODE_CONFIGS.normal;
  }

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
    els.homeButton.hidden = screen === 'home';
    els.restartButton.hidden = screen === 'home';
    if (screen === 'home' || screen === 'results') stopRoundTimer(false);
    if (screen === 'home') document.body.classList.remove('hardcore-mode');
    window.scrollTo(0, 0);
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

    const matrix = els.worldMap.getScreenCTM?.();
    if (matrix && typeof els.worldMap.createSVGPoint === 'function') {
      const svgPoint = els.worldMap.createSVGPoint();
      svgPoint.x = event.clientX;
      svgPoint.y = event.clientY;
      const point = svgPoint.matrixTransform(matrix.inverse());
      return {
        x: Math.max(0, Math.min(MAP_META.width, point.x)),
        y: Math.max(0, Math.min(MAP_META.height, point.y))
      };
    }

    const view = state.view;
    const viewRatio = view.w / view.h;
    const rectRatio = rect.width / rect.height;
    let drawX = 0;
    let drawY = 0;
    let drawW = rect.width;
    let drawH = rect.height;

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

  function startGame(mode = state.mode || 'normal') {
    state.mode = mode === 'hardcore' ? 'hardcore' : 'normal';
    state.plan = makePlan();
    state.index = 0;
    state.current = null;
    state.phase = 'flag';
    state.selected = null;
    state.results = [];
    resetRoundState();
    resetMapView();
    document.body.classList.toggle('hardcore-mode', state.mode === 'hardcore');
    show('game');
    loadRound();
  }

  function resetRoundState() {
    state.selected = null;
    state.flagCorrect = false;
    state.flagAttempt = '';
    state.flagAttempts = 0;
    state.flagPoints = 0;
    state.capitalCorrect = false;
    state.capitalAttempt = '';
    state.capitalAttempts = 0;
    state.capitalPoints = 0;
    state.roundStartMs = 0;
    state.roundElapsedSec = 0;
  }

  function loadRound() {
    state.current = state.plan[state.index];
    state.phase = 'flag';
    resetRoundState();

    const { team, flagView } = state.current;
    resetMapView();
    resetMarkers();
    setMapActive(false);
    updateScorebar();
    startRoundTimer();

    els.roundLabel.textContent = `Round ${state.index + 1} of ${ROUND_TOTAL}`;
    els.viewLabel.textContent = state.mode === 'hardcore'
      ? `HARDCORE: ${flagViewLabels[flagView]}`
      : flagViewLabels[flagView];
    setFlagStage(flagView, 0);
    els.promptFlag.src = flagSrc(team);
    els.promptFlag.alt = 'Altered real flag to identify';
    els.promptTitle.textContent = 'Name the country';
    els.promptText.textContent = state.mode === 'hardcore'
      ? 'Type the World Cup team from this severely altered flag. You have two attempts before the answer is revealed.'
      : 'Type the World Cup team from this altered flag. You have three attempts, but scoring is strict: first try matters.';

    els.feedbackBox.hidden = true;
    els.feedbackBox.innerHTML = '';
    els.nextButton.hidden = true;
    els.finishButton.hidden = true;
    els.confirmMap.disabled = true;
    els.selectedCoords.textContent = 'No spot selected.';
    els.mapInstruction.textContent = 'Locked until the flag is answered.';

    renderTypedAnswer('country');
  }

  function setFlagStage(flagView, level) {
    const hard = state.mode === 'hardcore' ? ' hardcore' : '';
    els.flagStage.className = `flag-stage${hard} ${flagView} level-${level}`;
  }

  function startRoundTimer() {
    stopRoundTimer(false);
    state.roundStartMs = Date.now();
    state.roundElapsedSec = 0;
    updateTimerLabel();
    if (config().usesTimer) {
      state.timerInterval = window.setInterval(() => {
        state.roundElapsedSec = currentElapsedSeconds();
        updateTimerLabel();
      }, 250);
    }
  }

  function stopRoundTimer(keepElapsed = true) {
    if (state.timerInterval) {
      window.clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    if (keepElapsed && state.roundStartMs) {
      state.roundElapsedSec = currentElapsedSeconds();
    }
    updateTimerLabel();
  }

  function currentElapsedSeconds() {
    if (!state.roundStartMs) return state.roundElapsedSec || 0;
    return Math.max(0, Math.floor((Date.now() - state.roundStartMs) / 1000));
  }

  function updateTimerLabel() {
    if (!els.timerStatus) return;
    const timed = config().usesTimer;
    const seconds = currentElapsedSeconds();
    els.timerStatus.textContent = timed ? `${seconds}s` : 'Untimed';
    els.timerStatus.classList.toggle('timer-hot', timed && seconds > 35 && seconds <= 50);
    els.timerStatus.classList.toggle('timer-danger', timed && seconds > 50);
  }

  function renderTypedAnswer(kind) {
    const cfg = config();
    const isCapital = kind === 'capital';
    const maxAttempts = isCapital ? cfg.capitalMaxAttempts : cfg.flagMaxAttempts;
    const attemptLabel = `${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}`;
    const pointText = isCapital
      ? 'One shot: correct = 5 points.'
      : state.mode === 'hardcore'
        ? 'First try = 5 points, second = 1.'
        : 'First try = 10 points, second = 5, third = 2.';

    els.answerPanel.hidden = false;
    els.answerPanel.innerHTML = '';
    const form = document.createElement('form');
    form.className = 'answer-form';
    form.innerHTML = `
      <input class="answer-input" id="typedAnswer" type="text" autocomplete="off" autocapitalize="words" inputmode="text" spellcheck="false" placeholder="${isCapital ? 'Capital city' : 'Country name'}" aria-label="${isCapital ? 'Capital city' : 'Country name'}" />
      <button class="primary-button compact" type="submit">Submit</button>
      <p class="answer-note" id="answerNote">${attemptLabel}. ${pointText}</p>`;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('#typedAnswer', form);
      const answer = input.value.trim();
      if (!answer) {
        input.focus();
        return;
      }
      if (isCapital) submitCapitalAnswer(answer);
      else submitFlagAnswer(answer);
    });

    els.answerPanel.appendChild(form);
    setTimeout(() => $('#typedAnswer', form)?.focus(), 50);
  }

  function submitFlagAnswer(answer) {
    if (state.phase !== 'flag') return;

    const cfg = config();
    const { team, flagView } = state.current;
    state.flagAttempts += 1;
    state.flagAttempt = answer;

    const correct = isCorrect(answer, team);
    if (correct) {
      state.flagCorrect = true;
      state.flagPoints = flagPointsForAttempt(state.flagAttempts);
      afterFlagStep(true);
      return;
    }

    const attemptsLeft = Math.max(0, cfg.flagMaxAttempts - state.flagAttempts);
    const input = $('#typedAnswer', els.answerPanel);
    const note = $('#answerNote', els.answerPanel);

    if (state.flagAttempts >= cfg.flagMaxAttempts) {
      state.flagCorrect = false;
      state.flagPoints = 0;
      afterFlagStep(false);
      return;
    }

    const level = Math.min(2, state.flagAttempts);
    setFlagStage(flagView, level);
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
    const points = config().flagPoints[attempt - 1];
    return Number.isFinite(points) ? points : 0;
  }

  function afterFlagStep(correct) {
    if (config().usesCapital) {
      openCapitalQuestion(correct);
    } else {
      openMapAfterFlag(correct);
    }
  }

  function openCapitalQuestion(correct) {
    const { team } = state.current;
    state.phase = 'capital';
    els.flagStage.className = 'flag-stage revealed';
    els.promptFlag.alt = `${team.name} flag`;
    els.promptTitle.textContent = correct ? `Correct: ${team.name}` : `Country: ${team.name}`;
    els.promptText.textContent = `${correct ? `Flag score: ${state.flagPoints}/5.` : 'Flag score: 0/5.'} HARDCORE adds a capital test: type the capital city of ${team.name}. One attempt only.`;
    els.mapInstruction.textContent = 'Locked until the capital question is answered.';
    els.feedbackBox.hidden = true;
    renderTypedAnswer('capital');
  }

  function submitCapitalAnswer(answer) {
    if (state.phase !== 'capital') return;

    const cfg = config();
    const { team } = state.current;
    state.capitalAttempts += 1;
    state.capitalAttempt = answer;

    const correct = isCapitalCorrect(answer, team);
    if (correct) {
      state.capitalCorrect = true;
      state.capitalPoints = capitalPointsForAttempt(state.capitalAttempts);
      openMapAfterCapital(true);
      return;
    }

    const attemptsLeft = Math.max(0, cfg.capitalMaxAttempts - state.capitalAttempts);
    const input = $('#typedAnswer', els.answerPanel);
    const note = $('#answerNote', els.answerPanel);

    if (state.capitalAttempts >= cfg.capitalMaxAttempts) {
      state.capitalCorrect = false;
      state.capitalPoints = 0;
      openMapAfterCapital(false);
      return;
    }

    const close = isCapitalNearMiss(answer, team);
    if (note) {
      note.className = `answer-note ${close ? 'warn' : 'bad'}`;
      note.textContent = close
        ? `Very close. Check the spelling. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
        : `Not that capital. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`;
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function capitalPointsForAttempt(attempt) {
    const points = config().capitalPoints[attempt - 1];
    return Number.isFinite(points) ? points : 0;
  }

  function openMapAfterFlag(correct) {
    const { team } = state.current;
    state.phase = 'map';
    freezeAnswerInput();

    const note = $('#answerNote', els.answerPanel);
    if (note) {
      note.className = correct ? 'answer-note good' : 'answer-note bad';
      note.textContent = correct
        ? `Correct: ${team.name}. Flag score: ${state.flagPoints}/10.`
        : `Answer revealed: ${team.name}. Flag score: 0/10.`;
    }

    els.flagStage.className = 'flag-stage revealed';
    els.promptFlag.alt = `${team.name} flag`;
    els.promptTitle.textContent = correct ? `Correct: ${team.name}` : `Answer: ${team.name}`;
    els.promptText.textContent = 'Now place that team on the world map. There are no country borders, so use geography.';
    els.mapInstruction.textContent = `Place ${team.name}. Tap or click a spot, then confirm.`;
    setMapActive(true);
  }

  function openMapAfterCapital(correct) {
    const { team } = state.current;
    state.phase = 'map';
    freezeAnswerInput();

    const note = $('#answerNote', els.answerPanel);
    if (note) {
      note.className = correct ? 'answer-note good' : 'answer-note bad';
      note.textContent = correct
        ? `Correct: ${team.capital}. Capital score: ${state.capitalPoints}/5.`
        : `Capital revealed: ${team.capital}. Capital score: 0/5.`;
    }

    els.promptTitle.textContent = `Place ${team.capital}`;
    els.promptText.textContent = `HARDCORE map target: click close to ${team.capital}, not just somewhere in ${team.name}. The timer is still running.`;
    els.mapInstruction.textContent = `Place ${team.capital}, capital of ${team.name}. Tap or click a spot, then confirm.`;
    setMapActive(true);
  }

  function freezeAnswerInput() {
    const input = $('#typedAnswer', els.answerPanel);
    const submit = $('button', els.answerPanel);
    if (input) input.disabled = true;
    if (submit) submit.disabled = true;
  }

  function acceptedCountryAnswers(team) {
    return [team.name, ...(team.aliases || [])].map(normalize);
  }

  function acceptedCapitalAnswers(team) {
    return [team.capital, ...(team.capitalAliases || [])].map(normalize);
  }

  function isNearMiss(answer, team) {
    const value = normalize(answer);
    if (value.length < 3) return false;
    return acceptedCountryAnswers(team).some(item => levenshtein(value, item) <= Math.max(2, Math.ceil(item.length * 0.22)));
  }

  function isCapitalNearMiss(answer, team) {
    const value = normalize(answer);
    if (value.length < 3) return false;
    return acceptedCapitalAnswers(team).some(item => levenshtein(value, item) <= Math.max(2, Math.ceil(item.length * 0.22)));
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
    const accepted = acceptedCountryAnswers(team);
    if (accepted.includes(value)) return true;
    return accepted.some(item => value.length >= 5 && levenshtein(value, item) <= 2);
  }

  function isCapitalCorrect(answer, team) {
    const value = normalize(answer);
    const accepted = acceptedCapitalAnswers(team);
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
    const targetText = config().usesCapital ? 'capital target' : 'country target';
    els.selectedCoords.textContent = `Spot selected for the ${targetText}. Confirm when ready.`;
    els.confirmMap.disabled = false;
    drawMarkers({ selected: point });
  }

  function mapTarget(team) {
    if (config().usesCapital) {
      return {
        label: team.capital,
        kind: 'capital',
        lat: Number(team.capitalLat),
        lon: Number(team.capitalLon),
        x: Number(team.capitalX),
        y: Number(team.capitalY)
      };
    }
    return {
      label: team.name,
      kind: 'country',
      lat: team.lat,
      lon: team.lon,
      x: team.x,
      y: team.y
    };
  }

  function confirmMap() {
    if (state.phase !== 'map' || !state.selected) return;

    const { team } = state.current;
    const target = mapTarget(team);
    const selectedLat = yToLat(state.selected.y);
    const selectedLon = xToLon(state.selected.x);
    const distance = Math.round(haversineKm(selectedLat, selectedLon, target.lat, target.lon));
    const flagPoints = state.flagPoints;
    const capitalPoints = config().usesCapital ? state.capitalPoints : 0;
    const mapPoints = mapScore(distance, team.radius);
    const elapsed = currentElapsedSeconds();
    const timePoints = timeScore(elapsed);
    const roundScore = flagPoints + capitalPoints + mapPoints + timePoints;

    stopRoundTimer(true);

    const result = {
      mode: state.mode,
      teamId: team.id,
      distance,
      targetLabel: target.label,
      targetKind: target.kind,
      flagCorrect: Boolean(state.flagCorrect),
      flagAttempt: state.flagAttempt,
      flagAttempts: state.flagAttempts,
      flagPoints,
      capitalCorrect: Boolean(state.capitalCorrect),
      capitalAttempt: state.capitalAttempt,
      capitalAttempts: state.capitalAttempts,
      capitalPoints,
      mapPoints,
      mapMax: config().mapMax,
      timeSeconds: elapsed,
      timePoints,
      roundScore,
      mapHit: mapPoints === config().mapMax
    };

    state.results.push(result);
    state.phase = 'feedback';
    els.confirmMap.disabled = true;
    els.answerPanel.hidden = true;
    setMapActive(false);
    drawMarkers({
      selected: state.selected,
      correct: { x: target.x, y: target.y },
      line: true
    });
    showFeedback(result, team);
    updateScorebar();
  }

  function normalMapThresholds(radius) {
    return {
      direct: Math.min(450, Math.max(90, radius * 0.35)),
      close: Math.min(900, Math.max(260, radius * 0.85)),
      near: Math.min(1550, Math.max(650, radius * 1.45)),
      far: 2500
    };
  }

  function hardcoreMapThresholds() {
    return {
      direct: 100,
      close: 250,
      near: 600,
      far: 1400
    };
  }

  function mapThresholds(radius) {
    return config().usesCapital ? hardcoreMapThresholds() : normalMapThresholds(radius);
  }

  function mapScore(distance, radius) {
    const t = mapThresholds(radius);
    if (config().usesCapital) {
      if (distance <= t.direct) return 7;
      if (distance <= t.close) return 4;
      if (distance <= t.near) return 2;
      return 0;
    }
    if (distance <= t.direct) return 10;
    if (distance <= t.close) return 6;
    if (distance <= t.near) return 3;
    return 0;
  }

  function mapTemperature(distance, radius) {
    const t = mapThresholds(radius);
    if (config().usesCapital) {
      if (distance <= t.direct) return ['feedback-good', 'Capital hit'];
      if (distance <= t.close) return ['feedback-good', 'Near capital'];
      if (distance <= t.near) return ['', 'In the area'];
      if (distance <= t.far) return ['', 'Off target'];
      return ['feedback-bad', 'Cold'];
    }
    if (distance <= t.direct) return ['feedback-good', 'Direct hit'];
    if (distance <= t.close) return ['feedback-good', 'Very close'];
    if (distance <= t.near) return ['', 'Close'];
    if (distance <= t.far) return ['', 'Off target'];
    return ['feedback-bad', 'Cold'];
  }

  function timeScore(seconds) {
    if (!config().usesTimer) return 0;
    if (seconds <= 20) return 3;
    if (seconds <= 35) return 2;
    if (seconds <= 50) return 1;
    return 0;
  }

  function showFeedback(result, team) {
    const [klass, label] = mapTemperature(result.distance, team.radius);
    const opponents = groupOpponents(team).join(', ');
    const flagMax = config().usesCapital ? 5 : 10;
    const flagText = result.flagCorrect
      ? `Correct in ${result.flagAttempts} attempt${result.flagAttempts === 1 ? '' : 's'}`
      : `Revealed after ${config().flagMaxAttempts} attempt${config().flagMaxAttempts === 1 ? '' : 's'}`;
    const capitalText = result.capitalCorrect
      ? `Correct in ${result.capitalAttempts} attempt${result.capitalAttempts === 1 ? '' : 's'}`
      : `Revealed after ${config().capitalMaxAttempts} attempt${config().capitalMaxAttempts === 1 ? '' : 's'}`;
    const coachLine = coachRemark(result, team);
    const targetCopy = config().usesCapital
      ? `Capital target: ${team.capital}.`
      : `Country target: ${team.name}.`;
    const capitalBlock = config().usesCapital
      ? `<div><b>Capital challenge</b><span>${escapeHtml(team.capital)}. ${escapeHtml(capitalText)} (${result.capitalPoints}/5).</span></div>`
      : '';
    const timeBlock = config().usesCapital
      ? `<div><b>Timer</b><span>${result.timeSeconds}s. Speed bonus: ${result.timePoints}/3.</span></div>`
      : '';
    const scoreFormula = config().usesCapital
      ? `Flag ${result.flagPoints}/5 + capital ${result.capitalPoints}/5 + capital map ${result.mapPoints}/7 + speed ${result.timePoints}/3`
      : `Flag ${result.flagPoints}/10 + map ${result.mapPoints}/10`;

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
          <div><b>Flag</b><span>${escapeHtml(flagText)} (${result.flagPoints}/${flagMax}).</span></div>
          ${capitalBlock}
          <div><b>Map</b><span>${escapeHtml(targetCopy)} <span class="${klass}">${label}</span>, ${distanceLabel(result.distance)} away (${result.mapPoints}/${result.mapMax}).</span></div>
          ${timeBlock}
        </div>
        <div class="round-score-line">
          <strong>${result.roundScore}/20 points</strong>
          <span>${escapeHtml(scoreFormula)}</span>
        </div>
      </article>`;

    els.mapInstruction.textContent = config().usesCapital
      ? 'Correct capital location shown. Read the team card, then continue.'
      : 'Correct country location shown. Read the team card, then continue.';
    els.nextButton.hidden = state.index >= ROUND_TOTAL - 1;
    els.finishButton.hidden = state.index < ROUND_TOTAL - 1;
    els.feedbackBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function coachRemark(result, team) {
    if (config().usesCapital) {
      if (result.flagCorrect && result.flagAttempts === 1 && result.capitalCorrect && result.capitalAttempts === 1 && result.mapPoints === 7 && result.timePoints >= 2) {
        return 'Elite scouting: flag, capital and map handled under pressure.';
      }
      if (result.mapPoints === 7) return `The pin landed close to ${team.capital}, not just somewhere in the country.`;
      if (!result.capitalCorrect) return 'The capital question did the damage, but the team card is unlocked.';
      if (result.timePoints === 0) return 'The clock won this round. The knowledge was useful, but not quick enough.';
      if (result.distance > 2500) return `That was a long flight away from ${team.capital}.`;
      return 'Hardcore round survived. The capital target kept the pressure on.';
    }
    if (result.flagCorrect && result.flagAttempts === 1 && result.mapPoints === 10) {
      return 'Clean finish. No VAR needed.';
    }
    if (result.mapPoints === 10) return 'The pin landed like a perfect through ball.';
    if (result.mapPoints >= 6) return 'Close enough for the team bus to find the stadium.';
    if (result.distance > 5000) return `A bold tactical decision. ${team.name} was in another part of the map.`;
    if (!result.flagCorrect) return 'The flag caused trouble, but the team card is unlocked.';
    return 'Solid scouting. The geography still had a little pressure.';
  }

  function scoreTitle(total, mode = state.mode) {
    if (mode === 'hardcore') {
      if (total >= 90) return 'Capital Cartographer';
      if (total >= 75) return 'Hardcore Scout';
      if (total >= 60) return 'Pressure Player';
      if (total >= 40) return 'Extra Time Needed';
      return 'Lost Without Borders';
    }
    if (total >= 92) return 'World Cup Scout';
    if (total >= 78) return 'Knockout Round Ready';
    if (total >= 62) return 'Group Stage Specialist';
    if (total >= 45) return 'Friendly Match Level';
    return 'Lost in Qualifying';
  }

  function scoutReport(flags, hits, avg, capitals) {
    if (config().usesCapital) {
      if (flags >= 4 && capitals >= 4 && hits >= 2) return 'You handled the harder version: flags, capitals and no-border map pressure all held together.';
      if (capitals >= 4) return 'Your capital knowledge was strong; the exact map target was the harder part.';
      if (hits >= 3) return 'Your map precision was better than your typed answers.';
      if (avg > 2500) return 'The next training session should focus on locating capital cities, not just countries.';
      return 'A demanding run, with useful team and geography knowledge unlocked.';
    }
    if (flags >= 4 && hits >= 3) return 'You handled a stricter scoring curve well on both flags and map placement.';
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
    stopRoundTimer(false);
    updateScorebar();

    const total = totalPoints();
    const flags = state.results.filter(r => r.flagCorrect).length;
    const capitals = state.results.filter(r => r.capitalCorrect).length;
    const hits = state.results.filter(r => r.mapHit).length;
    const avg = averageError();

    const title = scoreTitle(total);
    const scout = scoutReport(flags, hits, avg, capitals);
    els.resultsSummary.textContent = `${title}. You unlocked 5 World Cup team cards in ${config().label} mode. Final score: ${total}/${MAX_SCORE}. ${scout}`;
    if (config().usesCapital) {
      const avgTime = averageTime();
      els.resultMetrics.innerHTML = `
        <div><strong>${total}/${MAX_SCORE}</strong><span>Total score</span></div>
        <div><strong>${flags}/${ROUND_TOTAL}</strong><span>Flags recognized</span></div>
        <div><strong>${capitals}/${ROUND_TOTAL}</strong><span>Capitals named</span></div>
        <div><strong>${hits}/${ROUND_TOTAL}</strong><span>Capital map hits</span></div>
        <div><strong>${avgTime}s</strong><span>Average round time</span></div>
        <div><strong>${distanceLabel(avg)}</strong><span>Average map error</span></div>`;
    } else {
      els.resultMetrics.innerHTML = `
        <div><strong>${total}/${MAX_SCORE}</strong><span>Total score</span></div>
        <div><strong>${flags}/${ROUND_TOTAL}</strong><span>Flags recognized</span></div>
        <div><strong>${hits}/${ROUND_TOTAL}</strong><span>Direct map hits</span></div>
        <div><strong>${distanceLabel(avg)}</strong><span>Average map error</span></div>`;
    }
    renderProfiles();
    show('results');
  }

  function renderProfiles() {
    const byId = new Map(state.results.map(r => [r.teamId, r]));
    els.profileGrid.innerHTML = '';

    state.plan.forEach(({ team }) => {
      const r = byId.get(team.id);
      const opponents = groupOpponents(team).join(', ');
      const hardcoreResult = r && r.mode === 'hardcore';
      const resultText = r
        ? hardcoreResult
          ? `Flag ${r.flagCorrect ? 'correct' : 'revealed'} (${r.flagPoints}/5), capital ${r.capitalCorrect ? 'correct' : 'revealed'} (${r.capitalPoints}/5), ${r.targetLabel} map ${distanceLabel(r.distance)} away, ${r.timeSeconds}s.`
          : `Flag ${r.flagCorrect ? 'correct' : 'revealed'} (${r.flagPoints}/10), country map ${distanceLabel(r.distance)} away.`
        : 'Not played.';
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
          <div><b>Geography</b><span>Capital: ${escapeHtml(team.capital)}. Region: ${escapeHtml(team.continent)}</span></div>
          <div><b>Your result</b><span>${escapeHtml(resultText)}</span></div>
        </div>
        <div class="card-score">
          <span class="status-dot ${r && r.roundScore >= 14 ? 'good' : (hardcoreResult ? 'hardcore' : '')}"></span>
          ${r ? `${r.roundScore}/20 points` : 'Not played'}
        </div>`;
      els.profileGrid.appendChild(card);
    });
  }

  function updateScorebar() {
    els.roundNow.textContent = Math.min(state.index + 1, ROUND_TOTAL);
    els.roundTotal.textContent = ROUND_TOTAL;
    els.totalScore.textContent = totalPoints().toLocaleString('en-US');
    els.modeStatus.textContent = config().label;
    updateTimerLabel();
    els.avgError.textContent = state.results.length ? distanceLabel(averageError()) : '-';
  }

  function totalPoints() {
    return state.results.reduce((sum, r) => sum + r.roundScore, 0);
  }

  function averageError() {
    if (!state.results.length) return 0;
    return Math.round(state.results.reduce((sum, r) => sum + r.distance, 0) / state.results.length);
  }

  function averageTime() {
    if (!state.results.length) return 0;
    return Math.round(state.results.reduce((sum, r) => sum + (r.timeSeconds || 0), 0) / state.results.length);
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
    els.worldMap.setAttribute('aria-disabled', active ? 'false' : 'true');
  }

  function copySummary() {
    const total = totalPoints();
    const flags = state.results.filter(r => r.flagCorrect).length;
    const hits = state.results.filter(r => r.mapHit).length;
    const capitals = state.results.filter(r => r.capitalCorrect).length;
    const avg = averageError();
    const teams = state.plan.map(({ team }) => team.name).join(', ');
    const lines = [
      'World Cup 2026 Flag-to-Map',
      `Mode: ${config().label}`,
      `Result: ${scoreTitle(total)}`,
      `Score: ${total}/${MAX_SCORE}`,
      `Flags recognized: ${flags}/${ROUND_TOTAL}`
    ];
    if (config().usesCapital) lines.push(`Capitals named: ${capitals}/${ROUND_TOTAL}`);
    lines.push(`Map hits: ${hits}/${ROUND_TOTAL}`);
    lines.push(`Average map error: ${distanceLabel(avg)}`);
    if (config().usesCapital) lines.push(`Average round time: ${averageTime()}s`);
    lines.push(`Teams: ${teams}`);
    const text = lines.join('\n');

    copyText(text)
      .then(() => temporaryButtonText(els.copyResults, 'Copied'))
      .catch(() => temporaryButtonText(els.copyResults, 'Copy unavailable'));
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand('copy')) resolve();
        else reject(new Error('copy failed'));
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(area);
      }
    });
  }

  function temporaryButtonText(button, text) {
    const old = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = old; }, 1400);
  }

  function bindEvents() {
    els.brand.addEventListener('click', (event) => {
      event.preventDefault();
      state.phase = 'home';
      show('home');
    });
    els.startChallenge.addEventListener('click', () => startGame('normal'));
    els.startHardcore.addEventListener('click', () => startGame('hardcore'));
    els.restartButton.addEventListener('click', () => startGame(state.mode));
    els.homeButton.addEventListener('click', () => {
      state.phase = 'home';
      show('home');
    });
    els.playAgain.addEventListener('click', () => startGame(state.mode));
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
      try { els.worldMap.setPointerCapture?.(event.pointerId); } catch (error) { /* synthetic pointer events cannot always capture */ }
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
  show('home');
})();
