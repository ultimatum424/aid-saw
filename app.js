(function () {
  'use strict';
  const P = window.Popil;
  const $ = id => document.getElementById(id);
  const COLORS = ['#dfbf7f', '#b7a9db', '#86bcd0', '#9cc5a1', '#dc9c8b'];
  const STORAGE = 'popil-practice-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (_) { /* Storage is optional. */ }
  let mode = saved.mode === 'mixed' ? 'mixed' : 'single';
  let formatId = P.FORMATS.some(f => f.id === saved.formatId) ? saved.formatId : '2-10';
  let mixed = new Set(Array.isArray(saved.mixed) ? saved.mixed.filter(id => P.FORMATS.some(f => f.id === id)) : P.FORMATS.map(f => f.id));
  if (!mixed.size) mixed = new Set(P.FORMATS.map(f => f.id));
  if (['700', '1500', '2200'].includes(saved.speed)) $('speed').value = saved.speed;
  let scenario, plan, initialPlan, state, selected, phase, result, showingExample;
  let timer = null;
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ mode, formatId, mixed: [...mixed], breakMode: 'off', speed: $('speed').value })); } catch (_) { /* Works without persistence. */ }
  }
  function color(candidate) { return COLORS[scenario.candidates.indexOf(candidate)] || '#a2b296'; }
  function cssColor(candidate) { return `--seat-color:${color(candidate)}`; }
  function position(p) { const a = (p - 1) * Math.PI / 5; return { x: 50 + Math.sin(a) * 42, y: 50 - Math.cos(a) * 40 }; }
  function stopTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function newRound(keepScenario = false) {
    stopTimer();
    if (!keepScenario) {
      const id = mode === 'mixed' ? [...mixed][Math.floor(Math.random() * mixed.size)] : formatId;
      scenario = P.makeScenario(id);
    }
    plan = Object.fromEntries(scenario.alive.map(p => [p, null]));
    initialPlan = null; state = null; result = null; showingExample = false;
    selected = scenario.alive[0]; phase = 'planning';
    render(); save();
  }
  function available(p) {
    if (!scenario.alive.includes(p)) return [];
    if (phase === 'planning') return scenario.candidates;
    if (phase === 'recovery') return P.legalTargets(state, p);
    return [];
  }
  function assign(player, candidate, advance = false) {
    if (!available(player).length || (candidate !== null && !available(player).includes(candidate))) return;
    plan[player] = candidate;
    if (advance) {
      const clockwise = scenario.alive.filter(p => p > player).concat(scenario.alive.filter(p => p < player));
      const next = clockwise.find(p => available(p).length && !available(p).includes(plan[p]));
      selected = next || player;
    } else selected = player;
    render();
  }
  function finish(ok, reason, example, detail = '') {
    stopTimer(); phase = 'result';
    result = { ok, reason, example, detail };
    selected = null; save(); render();
  }
  function initialExample() {
    return P.initialScheme(scenario).example;
  }
  function start() {
    if (phase !== 'planning') return;
    const check = P.validateInitial(scenario, plan);
    initialPlan = { ...plan };
    if (!check.ok) {
      finish(false, check.reason, initialExample(), 'В исходном решении проверяются и число голосов, и учебная схема.');
      return;
    }
    state = P.createState(scenario, plan);
    // Breaks are temporarily disabled, including previously saved preferences.
    state.event = null;
    phase = 'voting'; selected = null; render(); schedule();
  }
  function schedule() {
    stopTimer();
    timer = setTimeout(nextWindow, Number($('speed').value));
  }
  function nextWindow() {
    timer = null;
    if (phase !== 'voting') return;
    P.tick(state);
    if (state.phase === 'recovery') {
      plan = { ...state.plan, ...state.votes };
      phase = 'recovery';
      selected = scenario.alive.find(p => !available(p).includes(plan[p]) && available(p).length) || scenario.alive.find(p => available(p).length);
      render();
      return;
    }
    if (state.phase === 'finished') {
      plan = { ...state.votes };
      const total = P.counts(scenario, state.votes);
      const goal = state.break ? resultGoal : 'equal';
      const reason = goal === 'impossible'
        ? `Вы верно определили: после закрытия голосования за №${state.break.candidate} ни равенство, ни вывод нарушителя №${state.break.actor} уже недостижимы. Это успешный ответ в тренажёре; сам попил сломан.`
        : goal === 'eliminate'
        ? `Равенство было недостижимо. Сломавший №${state.break.actor} набрал единолично больше голосов и покидает стол.`
        : `Каждый кандидат получил по ${total[0]} ${total[0] < 5 ? 'голоса' : 'голосов'}. ${state.break ? 'Вы восстановили попил после слома.' : 'Попил состоялся.'}`;
      finish(true, reason, null, `Итог голосования: ${total.join(' : ')}.`);
      return;
    }
    render(); schedule();
  }
  let resultGoal = 'equal';
  function confirmRecovery(acknowledgeImpossible = false) {
    if (phase !== 'recovery') return;
    const proposed = { ...plan };
    if (acknowledgeImpossible) {
      for (const p of scenario.alive) {
        const legal = P.legalTargets(state, p);
        if (legal.length && !legal.includes(proposed[p])) proposed[p] = legal.at(-1);
      }
    }
    const check = P.resume(state, proposed, acknowledgeImpossible);
    if (!check.ok) {
      const detail = check.goal.kind === 'equal' ? 'Равенство можно было сохранить.' : check.goal.kind === 'eliminate' ? `Нужно было вывести сломавшего №${state.break.actor}.` : 'Верный ответ: «Исправить уже нельзя».';
      finish(false, check.reason, check.goal.example, detail);
      return;
    }
    plan = proposed;
    resultGoal = check.goal.kind;
    phase = 'voting'; selected = null; render(); schedule();
  }
  function renderSettings() {
    $('mode-single').classList.toggle('active', mode === 'single');
    $('mode-mixed').classList.toggle('active', mode === 'mixed');
    $('mode-single').setAttribute('aria-pressed', String(mode === 'single'));
    $('mode-mixed').setAttribute('aria-pressed', String(mode === 'mixed'));
    $('format-help').textContent = mode === 'mixed' ? 'Отметьте форматы для случайного выбора' : 'Кандидаты / игроки за столом';
    $('format-grid').innerHTML = P.FORMATS.map(f => {
      const active = mode === 'single' ? f.id === formatId : mixed.has(f.id);
      return `<button class="format ${active ? 'active' : ''}" data-format="${f.id}" aria-pressed="${active}" aria-label="${f.candidates} при ${f.alive}">${mode === 'mixed' && active ? '<span class="check" aria-hidden="true"></span>' : ''}${f.candidates}<small>при</small>${f.alive}</button>`;
    }).join('');
    const format = P.FORMATS.find(f => f.id === scenario.formatId);
    $('mobile-format').innerHTML = `${mode === 'mixed' ? 'Вперемешку' : format.candidates + ' при ' + format.alive} <span aria-hidden="true">⌄</span>`;
  }
  function renderBoard() {
    $('seats').innerHTML = Array.from({ length: 10 }, (_, i) => i + 1).map(p => {
      const alive = scenario.alive.includes(p), candidate = scenario.candidates.includes(p);
      const voted = !!state && Object.hasOwn(state.votes, p);
      const broken = !!state && !!state.break && state.break.actor === p;
      const editable = available(p).length > 0;
      const pos = position(p);
      const destination = showingExample ? result.example[p] : voted ? state.votes[p] : plan[p];
      let caption = !alive ? 'выбыл' : destination ? `→ №${destination}` : 'выберите';
      if (phase === 'voting' && !voted) caption = 'ожидает';
      return `<div class="seat ${!alive ? 'out' : ''} ${candidate ? 'candidate' : ''} ${selected === p && editable ? 'selected' : ''} ${voted && !showingExample ? 'voted' : ''} ${broken ? 'broken' : ''}" style="left:${pos.x}%;top:${pos.y}%;${cssColor(p)};--target-color:${color(destination)}"><button class="seat-button" data-player="${p}" aria-label="Игрок ${p}${candidate ? ', кандидат' : ''}${!alive ? ', выбыл' : ''}${voted ? ', голос учтён за ' + state.votes[p] : destination ? ', назначен за ' + destination : ', голос не назначен'}" ${!editable ? 'disabled' : ''} aria-pressed="${selected === p && editable}">${p}</button><span class="seat-caption ${destination && alive ? 'assigned' : ''}">${caption}</span></div>`;
    }).join('');
    const selectedTarget = selected && plan[selected];
    if (selected && selectedTarget && phase !== 'voting' && phase !== 'result') {
      const a = position(selected), b = position(selectedTarget);
      const path = selected === selectedTarget
        ? `M ${a.x * 6} ${a.y * 4.6} c -55 -45 55 -45 0 0`
        : `M ${a.x * 6} ${a.y * 4.6} Q 300 230 ${b.x * 6} ${b.y * 4.6}`;
      $('route').innerHTML = `<path d="${path}" stroke="${color(selectedTarget)}"/>`;
    } else $('route').innerHTML = '';
    const current = state && scenario.candidates[state.cursor];
    $('candidate-order').innerHTML = scenario.candidates.map((c, i) => `${i ? '<span class="order-arrow" aria-hidden="true">→</span>' : ''}<span class="candidate-chip ${phase === 'voting' || phase === 'recovery' ? i === state.cursor ? 'current' : i < state.cursor ? 'closed' : '' : ''}" style="${cssColor(c)}" aria-label="${i + 1}-й кандидат: номер ${c}">${c}</span>`).join('');
    const center = $('table-center');
    if (phase === 'result') {
      center.innerHTML = `<span class="center-status ${result.ok ? 'success' : 'failure'}" aria-hidden="true">${showingExample ? '↳' : result.ok ? '✓' : '×'}</span><h3 class="center-title">${showingExample ? 'Один из вариантов' : result.ok ? 'Точный расчёт' : 'Попробуем ещё?'}</h3><p class="center-copy">${showingExample ? 'Уже поданные голоса сохранены. Посмотрите распределение справа.' : result.ok ? 'Ответ принят.' : 'Разберите схему и вернитесь к столу.'}</p>`;
    } else if (phase === 'voting') {
      center.innerHTML = `<p class="eyebrow pulse">ИДЁТ ГОЛОСОВАНИЕ</p><p class="center-copy">Следующий кандидат</p><div class="center-number" style="${cssColor(current)}">№${current}</div><p class="center-copy">Руки ставятся за кандидата<br>в порядке выставления.</p>`;
    } else if (selected && available(selected).length) {
      center.innerHTML = `<p class="eyebrow">${phase === 'recovery' ? 'МЕНЯЕМ ОСТАВШИЕСЯ ГОЛОСА' : 'НАЗНАЧЕНИЕ ГОЛОСА'}</p><h3 class="center-title">№${selected} голосует за…</h3><div class="target-buttons">${available(selected).map(c => `<button class="target-button ${plan[selected] === c ? 'picked' : ''}" data-target="${c}" style="${cssColor(c)}" aria-label="Игрок ${selected} голосует за ${c}" aria-pressed="${plan[selected] === c}">${c}</button>`).join('')}</div><p class="center-copy" style="margin-top:12px">${phase === 'recovery' ? 'Учтённые голоса закреплены' : 'Выберите номер кандидата'}</p>`;
    } else center.innerHTML = '<p class="eyebrow">УЧЕБНЫЙ СТОЛ</p><h3 class="center-title">Схема собрана</h3><p class="center-copy">Проверьте назначения<br>и подтвердите решение.</p>';
  }
  function renderPlan() {
    const display = showingExample ? result.example : plan;
    const isLocked = p => !!state && Object.hasOwn(state.votes, p);
    const assigned = scenario.alive.filter(p => scenario.candidates.includes(display[p])).length;
    $('assigned-count').textContent = `${assigned} / ${scenario.alive.length}`;
    $('plan-title').textContent = showingExample ? 'Пример решения' : phase === 'recovery' ? 'Новая схема' : phase === 'voting' ? 'Голоса за столом' : phase === 'result' ? 'Итоговая схема' : 'Ваша схема';
    $('plan-description').textContent = phase === 'recovery' ? `Голосование за №${state.break.candidate} завершено. Менять можно только неучтённые голоса за следующие кандидатуры.` : phase === 'voting' ? 'Наблюдайте за голосованием по порядку выставления кандидатов.' : showingExample ? 'Это решение по учебной схеме. Одного равенства голосов в исходном назначении недостаточно.' : phase === 'result' ? 'Назначения игроков и распределение голосов в этой попытке.' : 'Нажмите на номер за столом и выберите кандидата. Или назначьте голоса здесь.';
    $('plan-rows').innerHTML = scenario.alive.map(p => {
      const legal = available(p), locked = isLocked(p);
      const target = showingExample ? display[p] : locked ? state.votes[p] : display[p];
      const editable = legal.length > 0;
      return `<div class="plan-row ${selected === p ? 'selected' : ''}"><span class="row-player ${scenario.candidates.includes(p) ? 'candidate' : ''}" style="${cssColor(p)}">${p}</span><span class="row-arrow" aria-hidden="true">→</span>${editable ? `<select data-voter-select="${p}" aria-label="Голос игрока ${p}"><option value="">Выберите</option>${legal.map(c => `<option value="${c}" ${target === c ? 'selected' : ''}>За №${c}${p === c ? ' · себя' : ''}</option>`).join('')}</select>` : `<span class="locked-vote" style="${cssColor(target)}">${target ? 'За №' + target : 'Не назначен'}<small>${locked ? '✓ учтён' : phase === 'voting' ? 'ожидает' : ''}</small></span>`}</div>`;
    }).join('');
    const totals = P.counts(scenario, phase === 'voting' ? state.votes : showingExample ? result.example : phase === 'recovery' ? state.votes : display);
    $('totals').setAttribute('aria-label', phase === 'recovery' || phase === 'voting' ? 'Уже учтённые голоса' : 'Распределение голосов');
    $('totals').innerHTML = scenario.candidates.map((c, i) => `<div class="total-chip" style="${cssColor(c)}"><span>№${c}</span><b>${totals[i]}</b></div>`).join('');
    if (phase === 'recovery' || phase === 'voting') $('totals').insertAdjacentHTML('beforeend', '<span class="help-small" style="width:100%;margin:0">Только уже учтённые голоса</span>');
  }
  function renderStatus() {
    const names = { planning: 'Распределение', voting: 'Голосование', recovery: 'Слом · пауза', result: result && result.ok ? 'Успешно' : 'Ошибка' };
    $('phase-badge').textContent = names[phase];
    $('phase-badge').className = `badge ${phase === 'result' ? result.ok ? 'success' : 'failure' : phase}`;
    $('step-plan').classList.toggle('active', phase === 'planning');
    $('step-vote').classList.toggle('active', phase === 'voting' || phase === 'recovery');
    $('step-review').classList.toggle('active', phase === 'result');
    const notice = $('notice'); notice.className = 'notice';
    notice.hidden = phase === 'planning';
    if (phase === 'planning') {
      notice.replaceChildren();
      $('action-area').innerHTML = '<button id="confirm-plan" class="primary-button">Подтвердить и голосовать <span aria-hidden="true">→</span></button><button id="clear-plan" class="sub-action">Очистить схему</button>';
    } else if (phase === 'voting') {
      const last = state.log.at(-1);
      const caption = last ? `За №${last.candidate} учтены руки: ${last.players.length ? last.players.map(p => '№' + p).join(', ') : 'нет'}.` : 'Схема верна. Начинаем с первого выставленного кандидата.';
      notice.innerHTML = `<span class="notice-icon pulse" aria-hidden="true">●</span><p><strong>${caption}</strong><small>Голосование за кандидатов идёт последовательно. Учтённые руки отмечены галочкой.</small></p>`;
      $('action-area').innerHTML = '<button class="primary-button" disabled>Голосование идёт…</button>';
    } else if (phase === 'recovery') {
      notice.classList.add('recovery');
      const b = state.break;
      const action = b.type === 'missing' ? `№${b.actor} не поставил руку за №${b.candidate}.` : `№${b.actor} поставил за №${b.candidate} вместо №${b.expected}.`;
      notice.innerHTML = `<span class="notice-icon" aria-hidden="true">!</span><p><strong>Слом: ${action}</strong><small>За №${b.candidate} голосование завершено: все поданные руки учтены. Сохраните равенство; если это невозможно — выведите №${b.actor}. Если обе цели недостижимы, выберите «Исправить уже нельзя».</small></p>`;
      $('action-area').innerHTML = '<button id="confirm-recovery" class="primary-button">Подтвердить новую схему <span aria-hidden="true">→</span></button><button id="confirm-impossible" class="secondary-button">Исправить уже нельзя</button>';
    } else {
      notice.classList.add(result.ok ? 'success' : 'failure');
      notice.innerHTML = `<span class="notice-icon" aria-hidden="true">${result.ok ? '✓' : '×'}</span><p><strong>${result.ok ? 'Задание выполнено.' : 'Попытка завершена.'}</strong> ${result.reason}<small>${result.detail}</small></p>`;
      $('action-area').innerHTML = '<button id="next-round" class="primary-button">Следующая ситуация <span aria-hidden="true">→</span></button><button id="retry-round" class="secondary-button">Повторить</button>' + (result.example ? `<button id="show-example" class="sub-action">${showingExample ? 'Вернуться к моему решению' : 'Показать пример решения'}</button>` : '');
    }
  }
  function render() {
    const focusedVoter = document.activeElement && document.activeElement.dataset.voterSelect;
    const f = P.FORMATS.find(f => f.id === scenario.formatId);
    $('round-name').textContent = `${f.candidates} при ${f.alive}`;
    $('alive-label').textContent = `${scenario.alive.length} ${scenario.alive.length === 4 ? 'игрока' : 'игроков'} за столом`;
    const scheme = P.initialScheme(scenario);
    $('scheme-name').textContent = scheme.name;
    $('scheme-description').textContent = scheme.description;
    renderSettings(); renderBoard(); renderPlan(); renderStatus();
    if (focusedVoter) document.querySelector(`[data-voter-select="${focusedVoter}"]`)?.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.player) { selected = Number(button.dataset.player); render(); return; }
    if (button.dataset.target) { assign(selected, Number(button.dataset.target), true); return; }
    if (button.dataset.format) {
      const id = button.dataset.format;
      if (mode === 'mixed') { if (mixed.has(id)) { if (mixed.size > 1) mixed.delete(id); } else mixed.add(id); }
      else formatId = id;
      newRound(); return;
    }
    switch (button.id) {
      case 'settings-toggle': {
        const expanded = button.closest('.settings').classList.toggle('expanded');
        button.setAttribute('aria-expanded', String(expanded));
        break;
      }
      case 'mode-single': mode = 'single'; newRound(); break;
      case 'mode-mixed': mode = 'mixed'; newRound(); break;
      case 'new-round': case 'next-round': newRound(); break;
      case 'retry-round': newRound(true); break;
      case 'confirm-plan': start(); break;
      case 'confirm-recovery': confirmRecovery(); break;
      case 'confirm-impossible': confirmRecovery(true); break;
      case 'clear-plan': plan = Object.fromEntries(scenario.alive.map(p => [p, null])); selected = scenario.alive[0]; render(); break;
      case 'show-example': showingExample = !showingExample; render(); break;
    }
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.voterSelect) assign(Number(e.target.dataset.voterSelect), e.target.value === '' ? null : Number(e.target.value));
    else if (e.target.id === 'speed') save();
  });
  window.addEventListener('pagehide', stopTimer);
  window.addEventListener('pageshow', () => { if (phase === 'voting' && timer === null) schedule(); });
  newRound();
})();
