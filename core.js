(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Popil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMATS = [
    { id: '2-4', candidates: 2, alive: 4 },
    { id: '3-6', candidates: 3, alive: 6 },
    { id: '4-8', candidates: 4, alive: 8 },
    { id: '3-9', candidates: 3, alive: 9 },
    { id: '2-10', candidates: 2, alive: 10 }
  ];
  const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function shuffle(items, random = Math.random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function makeScenario(formatId, random = Math.random) {
    const format = FORMATS.find(f => f.id === formatId);
    if (!format) throw new Error('Неизвестный формат');
    const alive = shuffle(Array.from({ length: 10 }, (_, i) => i + 1), random)
      .slice(0, format.alive).sort((a, b) => a - b);
    return { formatId, alive, candidates: shuffle(alive, random).slice(0, format.candidates) };
  }
  function counts(scenario, votes) {
    return scenario.candidates.map(c => scenario.alive.filter(p => votes[p] === c).length);
  }
  function initialScheme(scenario) {
    const alive = scenario.alive.slice().sort((a, b) => a - b);
    const c = scenario.candidates;
    const others = alive.filter(p => !c.includes(p));
    const required = {};
    let name, description;
    const give = (players, candidate) => { for (const p of players) required[p] = candidate; };
    switch (scenario.formatId) {
      case '2-10': {
        const [a, b] = c.slice().sort((x, y) => x - y);
        if (a <= 5 && b >= 6) {
          name = 'Половинами';
          description = 'Кандидаты на разных половинах: номера 1–5 голосуют за кандидата из 6–10, а номера 6–10 — за кандидата из 1–5. Никто не голосует за себя.';
          give(alive.filter(p => p <= 5), b);
          give(alive.filter(p => p >= 6), a);
        } else {
          name = 'Пять следующих по кругу';
          description = `Кандидаты на одной половине. Пять следующих номеров по часовой стрелке от №${a} голосуют за него; остальные — за №${b}. Отсчёт идёт по номерам стола, а не по порядку выставления. Никто не голосует за себя.`;
          give(alive, b);
          give(Array.from({ length: 5 }, (_, i) => (a + i) % 10 + 1), a);
        }
        break;
      }
      case '3-9':
        name = 'Кандидаты — в первого';
        description = 'Все три кандидата голосуют за первого выставленного. Оставшиеся живые номера идут по возрастанию, без выбывшего и кандидатов: первые три — за второго выставленного, следующие три — за третьего.';
        give(c, c[0]); give(others.slice(0, 3), c[1]); give(others.slice(3), c[2]);
        break;
      case '4-8':
        name = 'Две пары кандидатов';
        description = 'Первый и второй выставленные голосуют за первого; третий и четвёртый — за второго. Оставшиеся живые номера идут по возрастанию: первая пара — за третьего выставленного, вторая пара — за четвёртого.';
        give(c.slice(0, 2), c[0]); give(c.slice(2), c[1]);
        give(others.slice(0, 2), c[2]); give(others.slice(2), c[3]);
        break;
      case '3-6':
        name = 'Первая пара — в первого';
        description = 'Первый и второй выставленные голосуют за первого. Третий выставленный и один игрок вне попила — за второго. Два оставшихся игрока — за третьего. Без ролей можно выбрать любого из трёх игроков вне попила для второй группы.';
        give(c.slice(0, 2), c[0]); give([c[2]], c[1]);
        break;
      case '2-4':
        name = 'Кандидаты — друг в друга';
        description = 'Два кандидата голосуют друг за друга. Два игрока вне попила распределяют голоса по одному на каждого кандидата. Голос кандидата за себя нарушает эту учебную схему.';
        give([c[0]], c[1]); give([c[1]], c[0]);
        break;
      default: throw new Error('Для этого формата нет подтверждённой учебной схемы');
    }
    const example = { ...required };
    const quota = alive.length / c.length;
    for (const p of alive.filter(p => !owns(example, p))) {
      example[p] = c.find(candidate => Object.values(example).filter(v => v === candidate).length < quota);
    }
    return { name, description, required, example };
  }
  function validateInitial(scenario, plan) {
    const missing = scenario.alive.filter(p => !scenario.candidates.includes(plan[p]));
    if (missing.length) return { ok: false, reason: `Не назначен голос: ${missing.map(p => '№' + p).join(', ')}. Каждый живой игрок должен получить назначение.` };
    const total = counts(scenario, plan);
    const quota = scenario.alive.length / scenario.candidates.length;
    if (!total.every(n => n === quota)) return { ok: false, counts: total, reason: `Получилось ${total.join(' : ')}. Для этого попила нужно по ${quota} ${quota < 5 ? 'голоса' : 'голосов'} на каждого кандидата.` };
    const scheme = initialScheme(scenario);
    const wrong = scenario.alive.filter(p => owns(scheme.required, p) && plan[p] !== scheme.required[p]);
    if (wrong.length) return { ok: false, counts: total, reason: `Голосов поровну, но нарушена схема «${scheme.name}»: ${wrong.map(p => `№${p} должен голосовать за №${scheme.required[p]}`).join('; ')}.`, example: scheme.example };
    return { ok: true, counts: total };
  }
  function createState(scenario, plan) {
    return { scenario, plan: { ...plan }, votes: {}, cursor: 0, phase: 'voting', break: null, log: [], event: null };
  }
  function legalTargets(state, player) {
    if (!state.scenario.alive.includes(player) || owns(state.votes, player)) return [];
    return state.scenario.candidates.slice(state.cursor);
  }
  // At most ten voters. Capacity-constrained search also supplies a witness for the review.
  // Memoization depends on counts, since each remaining player's legal options are fixed.
  function findAllocation(state, minimum, maximum) {
    const candidates = state.scenario.candidates;
    const fixed = counts(state.scenario, state.votes);
    if (fixed.some((n, i) => n > maximum[i])) return null;
    const remaining = state.scenario.alive.filter(p => !owns(state.votes, p))
      .map(p => ({ p, options: legalTargets(state, p).map(c => candidates.indexOf(c)) }))
      .sort((a, b) => a.options.length - b.options.length);
    const memo = new Set();
    const assigned = { ...state.votes };
    function visit(index) {
      for (let c = 0; c < candidates.length; c++) {
        const possible = remaining.slice(index).filter(v => v.options.includes(c)).length;
        if (fixed[c] > maximum[c] || fixed[c] + possible < minimum[c]) return null;
      }
      if (index === remaining.length) return { ...assigned };
      const key = index + '|' + fixed.join(',');
      if (memo.has(key)) return null;
      const voter = remaining[index];
      for (const c of voter.options) {
        if (fixed[c] >= maximum[c]) continue;
        fixed[c]++;
        assigned[voter.p] = candidates[c];
        const answer = visit(index + 1);
        fixed[c]--;
        if (answer) return answer;
      }
      delete assigned[voter.p];
      memo.add(key);
      return null;
    }
    return visit(0);
  }
  function objective(state) {
    const n = state.scenario.alive.length;
    const k = state.scenario.candidates.length;
    const quota = n / k;
    const equal = findAllocation(state, Array(k).fill(quota), Array(k).fill(quota));
    if (equal) return { kind: 'equal', example: equal };
    const actor = state.break && state.break.actor;
    const actorIndex = state.scenario.candidates.indexOf(actor);
    if (actorIndex !== -1) {
      for (let target = n; target >= 1; target--) {
        const min = Array(k).fill(0);
        const max = Array(k).fill(target - 1);
        min[actorIndex] = max[actorIndex] = target;
        const example = findAllocation(state, min, max);
        if (example) return { kind: 'eliminate', actor, example };
      }
    }
    return { kind: 'impossible', example: null };
  }
  function applyWindow(state, event = null) {
    if (state.phase !== 'voting') throw new Error('Голосование сейчас не идёт');
    const candidate = state.scenario.candidates[state.cursor];
    const pending = state.scenario.alive.filter(p => !owns(state.votes, p));
    let actual = pending.filter(p => state.plan[p] === candidate);
    if (event) {
      if (!pending.includes(event.actor) || (event.type === 'missing' ? !actual.includes(event.actor) : event.type !== 'wrong' || actual.includes(event.actor))) throw new Error('Недопустимый слом: голос уже учтён или игрок не нарушает схему');
      if (event.type === 'missing') {
        actual = actual.filter(p => p !== event.actor);
        state.plan[event.actor] = null;
      } else actual = actual.concat(event.actor);
    } else if (state.cursor === state.scenario.candidates.length - 1) {
      actual = pending; // Uncast votes automatically belong to the final candidate.
    }
    for (const p of actual) state.votes[p] = candidate;
    state.log.push({ candidate, players: actual.slice(), type: event ? event.type : 'window' });
    // Finish the complete candidate window before offering any reaction.
    // cursor always points at the NEXT candidate, including during recovery.
    state.cursor++;
    if (event) {
      state.break = { type: event.type, actor: event.actor, candidate, expected: event.expected };
      state.phase = 'recovery';
      return;
    }
    if (state.cursor === state.scenario.candidates.length) state.phase = 'finished';
  }
  function chooseBreak(state, mode = 'random', random = Math.random) {
    if (mode === 'off' || (mode === 'random' && random() >= 0.65)) return null;
    const possible = [];
    for (let cursor = 0; cursor < state.scenario.candidates.length - 1; cursor++) {
      const probe = createState(state.scenario, state.plan);
      while (probe.cursor < cursor) applyWindow(probe);
      const candidate = state.scenario.candidates[cursor];
      const pending = state.scenario.alive.filter(p => !owns(probe.votes, p));
      const expected = pending.filter(p => state.plan[p] === candidate);
      for (const actor of expected) possible.push({ cursor, type: 'missing', actor, expected: candidate });
      for (const actor of pending.filter(p => state.plan[p] !== candidate)) {
        possible.push({ cursor, type: 'wrong', actor, expected: state.plan[actor] });
      }
    }
    return shuffle(possible, random)[0] || null;
  }
  function tick(state) {
    if (state.phase !== 'voting') return;
    const event = state.event && state.event.cursor === state.cursor ? state.event : null;
    applyWindow(state, event);
    if (event) state.event = null;
  }
  function validateRecovery(state, plan, acknowledgeImpossible = false) {
    const goal = objective(state);
    if (acknowledgeImpossible && goal.kind !== 'impossible') return { ok: false, goal, reason: goal.kind === 'equal' ? 'Равенство ещё можно восстановить. Ответ «Исправить уже нельзя» неверен.' : `Сломавшего №${goal.actor} ещё можно вывести. Ответ «Исправить уже нельзя» неверен.` };
    if (!acknowledgeImpossible && goal.kind === 'impossible') return { ok: false, goal, reason: 'Голосование за кандидата уже закрыто: ни восстановить равенство, ни вывести нарушителя нельзя. Здесь нужно выбрать «Исправить уже нельзя».' };
    const completed = { ...state.votes };
    for (const p of state.scenario.alive) {
      if (owns(state.votes, p)) {
        if (owns(plan, p) && plan[p] !== state.votes[p]) return { ok: false, goal, reason: `Голос №${p} уже учтён. Его нельзя изменить.` };
      } else {
        if (!legalTargets(state, p).includes(plan[p])) return { ok: false, goal, reason: `У №${p} нет допустимого назначения. За закрытую кандидатуру больше нельзя голосовать.` };
        completed[p] = plan[p];
      }
    }
    const total = counts(state.scenario, completed);
    if (goal.kind === 'equal') {
      const ok = total.every(n => n === total[0]);
      return { ok, goal, counts: total, reason: ok ? '' : `Равенство ещё достижимо, но ваша схема даёт ${total.join(' : ')}. Нужно сохранить попил.` };
    }
    if (goal.kind === 'eliminate') {
      const index = state.scenario.candidates.indexOf(goal.actor);
      const ok = total.every((n, i) => i === index || n < total[index]);
      return { ok, goal, counts: total, reason: ok ? '' : `Равенство уже недостижимо. Нужно вывести сломавшего №${goal.actor}, дав ему единоличное первое место по голосам. Получилось ${total.join(' : ')}.` };
    }
    return { ok: true, goal, counts: total, reason: 'Вы верно определили, что результат уже не исправить.' };
  }
  function resume(state, plan, acknowledgeImpossible = false) {
    const result = validateRecovery(state, plan, acknowledgeImpossible);
    if (!result.ok) return result;
    state.plan = { ...state.votes, ...plan };
    state.phase = 'voting';
    return result;
  }
  return { FORMATS, shuffle, makeScenario, counts, initialScheme, validateInitial, createState,
    legalTargets, findAllocation, objective, applyWindow, chooseBreak, tick, validateRecovery, resume };
});
