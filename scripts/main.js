(function () {
  const DATA_URL = 'data/divisions.json';

  const elements = {
    summaryCards: document.querySelector('[data-summary-cards]'),
    divisionTabs: document.querySelector('[data-division-tabs]'),
    divisionPanel: document.querySelector('[data-division-panel]'),
    rules: document.querySelector('[data-rules]'),
    updatedAt: document.querySelector('[data-updated-at]'),
    footnoteUpdated: document.querySelector('[data-footnote-updated]')
  };

  const state = {
    data: null,
    activeDivisionId: null
  };

  const DEFAULT_POINTS = {
    win_2_0: 3,
    win_2_1: 2,
    loss_1_2: 1,
    loss_0_2: 0,
    forfeit_loss: -1
  };

  const DEFAULT_RATING = {
    base: 1000,
    win_2_0: 12,
    win_2_1: 10
  };

  const TIE_CRITERIA = ['headToHead', 'setDiff', 'gameDiff', 'gamePct', 'draw'];

  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  const fmtNumber = (value, options = {}) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    const formatter = new Intl.NumberFormat('ru-RU', options);
    return formatter.format(value);
  };

  const fmtDate = (value) => {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const fmtShortDate = (value) => {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short'
    }).format(date);
  };

  const fmtPercent = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    return `${Math.round(value * 100)}%`;
  };

  const fmtDiff = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { text: '—', className: 'metric metric--neutral' };
    }
    if (value > 0) {
      return { text: `+${value}`, className: 'metric metric--positive' };
    }
    if (value < 0) {
      return { text: `${value}`, className: 'metric metric--negative' };
    }
    return { text: '0', className: 'metric metric--neutral' };
  };

  const createEl = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.className) {
      node.className = options.className;
    }
    if (options.textContent !== undefined) {
      node.textContent = options.textContent;
    }
    if (options.html !== undefined) {
      node.innerHTML = options.html;
    }
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          node.setAttribute(key, value);
        }
      });
    }
    return node;
  };

  const fetchData = async () => {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Не удалось загрузить данные (${response.status})`);
    }
    return response.json();
  };

  const getRules = (data) => {
    if (!data || typeof data.rules !== 'object') {
      return { points: { ...DEFAULT_POINTS }, rating: { ...DEFAULT_RATING }, tiebreakers: TIE_CRITERIA.slice(0, 4) };
    }
    const points = { ...DEFAULT_POINTS, ...(data.rules.points || {}) };
    const rating = { ...DEFAULT_RATING, ...(data.rules.rating || {}) };
    const tiebreakers = Array.isArray(data.rules.tiebreakers) && data.rules.tiebreakers.length
      ? data.rules.tiebreakers.slice()
      : ['Очные встречи', 'Разница сетов', 'Разница геймов', '% выигранных геймов', 'Жеребьёвка'];
    return { points, rating, tiebreakers };
  };

  const ensureArray = (value) => (Array.isArray(value) ? value : []);

  const computeSeasonSummary = (data) => {
    const divisions = ensureArray(data.divisions);
    let groupsCount = 0;
    let teamsCount = 0;
    let matchesTotal = 0;
    let matchesPlayed = 0;
    let matchesScheduled = 0;

    divisions.forEach((division) => {
      const groups = ensureArray(division.groups);
      groupsCount += groups.length;
      groups.forEach((group) => {
        const teams = ensureArray(group.teams);
        const matches = ensureArray(group.matches);
        teamsCount += teams.length;
        matchesTotal += matches.length;
        matches.forEach((match) => {
          const status = match && match.result ? match.result.status : null;
          if (status === 'played' || status === 'wo') {
            matchesPlayed += 1;
          } else {
            matchesScheduled += 1;
          }
        });
      });
    });

    return {
      divisionsCount: divisions.length,
      groupsCount,
      teamsCount,
      matchesTotal,
      matchesPlayed,
      matchesScheduled
    };
  };

  const renderSummaryCards = (summary) => {
    if (!elements.summaryCards) {
      return;
    }
    elements.summaryCards.innerHTML = '';

    const cards = [
      {
        label: 'Дивизионы:',
        value: fmtNumber(summary.divisionsCount),
        meta: `Подгруппы: ${fmtNumber(summary.groupsCount)}`
      },
      {
        label: 'Команды:',
        value: fmtNumber(summary.teamsCount),
        meta: `Всего участников: ${fmtNumber(summary.teamsCount)*2}`
      },
      {
        label: 'Матчей сыграно',
        value: fmtNumber(summary.matchesPlayed),
        meta: `В ожидании: ${fmtNumber(summary.matchesScheduled)}`
      }
    ];

    cards.forEach((card) => {
      const cardNode = createEl('article', { className: 'summary-card' });
      cardNode.appendChild(createEl('span', { className: 'summary-card__label', textContent: card.label }));
      cardNode.appendChild(createEl('strong', { className: 'summary-card__value', textContent: card.value }));
      cardNode.appendChild(createEl('span', { className: 'summary-card__meta', textContent: card.meta }));
      elements.summaryCards.appendChild(cardNode);
    });
  };

  const renderRules = (rules) => {
    if (!elements.rules) {
      return;
    }
    elements.rules.innerHTML = '';

    const pointsCard = createEl('article', { className: 'rules-card' });
    pointsCard.appendChild(createEl('h3', { className: 'rules-card__title', textContent: 'Очки в группе' }));
    const pointsList = createEl('ul', { className: 'rules-card__list' });
    pointsList.appendChild(createEl('li', { textContent: `Победа 2:0 — ${rules.points.win_2_0} очка` }));
    pointsList.appendChild(createEl('li', { textContent: `Победа 2:1 — ${rules.points.win_2_1} очка` }));
    pointsList.appendChild(createEl('li', { textContent: `Поражение 1:2 — ${rules.points.loss_1_2} очко` }));
    pointsList.appendChild(createEl('li', { textContent: `Поражение 0:2 — ${rules.points.loss_0_2} очков` }));
    pointsList.appendChild(createEl('li', { textContent: `Тех. поражение — ${rules.points.forfeit_loss} очко и 0:6, 0:6 по геймам` }));
    pointsCard.appendChild(pointsList);

    const ratingCard = createEl('article', { className: 'rules-card' });
    ratingCard.appendChild(createEl('h3', { className: 'rules-card__title', textContent: 'Рейтинг ERA League' }));
    const ratingList = createEl('ul', { className: 'rules-card__list' });
    ratingList.appendChild(createEl('li', { textContent: `Стартовое значение — ${rules.rating.base}` }));
    ratingList.appendChild(createEl('li', { textContent: `Победа 2:0 — +${rules.rating.win_2_0}` }));
    ratingList.appendChild(createEl('li', { textContent: `Победа 2:1 — +${rules.rating.win_2_1}` }));
    ratingList.appendChild(createEl('li', { textContent: `Поражение — минус аналогичное значение` }));
    ratingCard.appendChild(ratingList);

    const tieCard = createEl('article', { className: 'rules-card' });
    tieCard.appendChild(createEl('h3', { className: 'rules-card__title', textContent: 'Дополнительные показатели' }));
    const tieList = createEl('ol', { className: 'rules-card__list' });
    rules.tiebreakers.forEach((criterion) => {
      tieList.appendChild(createEl('li', { textContent: criterion }));
    });
    tieCard.appendChild(tieList);

    elements.rules.appendChild(pointsCard);
    elements.rules.appendChild(ratingCard);
    elements.rules.appendChild(tieCard);
  };

  const initStats = (team, ratingBase) => ({
    id: team.id,
    name: team.name || 'Команда',
    players: ensureArray(team.players),
    club: team.club || null,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    forfeits: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    points: 0,
    rating: ratingBase,
    ratingHistory: [],
    form: [],
    headToHead: new Map(),
    tieBreaker: null,
    requiresDraw: false
  });

  const deriveScore = (match) => {
    if (!match || !match.result) {
      return { status: 'scheduled' };
    }
    const { result } = match;
    if (result.status === 'scheduled' || !result.status) {
      return { status: 'scheduled' };
    }
    if (result.status === 'wo') {
      const winnerSide = result.winner === 'home' ? 'home' : 'away';
      const loserSide = winnerSide === 'home' ? 'away' : 'home';
      const sets = winnerSide === 'home'
        ? { home: 2, away: 0 }
        : { home: 0, away: 2 };
      const games = winnerSide === 'home'
        ? { home: 12, away: 0 }
        : { home: 0, away: 12 };
      return {
        status: 'wo',
        winner: winnerSide,
        loser: loserSide,
        sets,
        games,
        setScores: ['6:0', '6:0'],
        isStraightSets: true,
        reason: result.reason || 'Техническая победа'
      };
    }

    const rawSets = Array.isArray(result.sets) ? result.sets.filter((set) => set && typeof set.home === 'number' && typeof set.away === 'number') : [];
    let homeSets = 0;
    let awaySets = 0;
    let homeGames = 0;
    let awayGames = 0;

    rawSets.forEach((set) => {
      homeGames += set.home;
      awayGames += set.away;
      if (set.home > set.away) {
        homeSets += 1;
      } else if (set.home < set.away) {
        awaySets += 1;
      }
    });

    const winnerSide = result.winner
      ? result.winner
      : (homeSets > awaySets ? 'home' : 'away');
    const loserSide = winnerSide === 'home' ? 'away' : 'home';

    return {
      status: 'played',
      winner: winnerSide,
      loser: loserSide,
      sets: { home: homeSets, away: awaySets },
      games: { home: homeGames, away: awayGames },
      setScores: rawSets.map((set) => `${set.home}:${set.away}`),
      isStraightSets: homeSets === 2 || awaySets === 2 ? (homeSets === 2 ? awaySets === 0 : homeSets === 0) : false
    };
  };

  const ensureHeadToHead = (stats, opponentId) => {
    if (!stats.headToHead.has(opponentId)) {
      stats.headToHead.set(opponentId, {
        matches: 0,
        points: 0,
        setsFor: 0,
        setsAgainst: 0,
        gamesFor: 0,
        gamesAgainst: 0
      });
    }
    return stats.headToHead.get(opponentId);
  };

  const calculatePointsDelta = (score, rulesPoints) => {
    if (!score || score.status === 'scheduled') {
      return { home: 0, away: 0 };
    }
    const points = { ...DEFAULT_POINTS, ...rulesPoints };
    if (score.status === 'wo') {
      return score.winner === 'home'
        ? { home: points.win_2_0, away: points.forfeit_loss }
        : { home: points.forfeit_loss, away: points.win_2_0 };
    }

    const homeSets = score.sets.home;
    const awaySets = score.sets.away;

    if (homeSets > awaySets) {
      return awaySets === 0
        ? { home: points.win_2_0, away: points.loss_0_2 }
        : { home: points.win_2_1, away: points.loss_1_2 };
    }

    return homeSets === 0
      ? { home: points.loss_0_2, away: points.win_2_0 }
      : { home: points.loss_1_2, away: points.win_2_1 };
  };

  const calculateRatingDelta = (score, rulesRating) => {
    if (!score || score.status === 'scheduled' || !score.winner) {
      return { home: 0, away: 0 };
    }
    const ratingRules = { ...DEFAULT_RATING, ...rulesRating };
    const winnerSets = score.winner === 'home' ? score.sets.home : score.sets.away;
    const loserSets = score.winner === 'home' ? score.sets.away : score.sets.home;
    const delta = (score.status === 'wo' || loserSets === 0)
      ? ratingRules.win_2_0
      : ratingRules.win_2_1;

    return score.winner === 'home'
      ? { home: delta, away: -delta }
      : { home: -delta, away: delta };
  };

  const processGroupMatches = (group, rules) => {
    const ratingBase = rules.rating.base || DEFAULT_RATING.base;
    const teams = ensureArray(group.teams);
    const matches = ensureArray(group.matches).slice();
    const statsById = new Map();

    teams.forEach((team) => {
      if (team && team.id) {
        statsById.set(team.id, initStats(team, ratingBase));
      }
    });

    const getMatchDate = (match) => {
      if (!match || !match.date) {
        return null;
      }
      const time = new Date(match.date).getTime();
      return Number.isNaN(time) ? null : time;
    };

    const getMatchRound = (match) => {
      if (!match || match.round === undefined || match.round === null) {
        return null;
      }
      const numeric = Number(match.round);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
      return String(match.round);
    };

    matches.sort((a, b) => {
      const dateA = getMatchDate(a);
      const dateB = getMatchDate(b);
      if (dateA !== null && dateB !== null && dateA !== dateB) {
        return dateA - dateB;
      }
      if (dateA !== null && dateB === null) {
        return -1;
      }
      if (dateA === null && dateB !== null) {
        return 1;
      }

      const roundA = getMatchRound(a);
      const roundB = getMatchRound(b);

      if (typeof roundA === 'number' && typeof roundB === 'number' && roundA !== roundB) {
        return roundA - roundB;
      }
      if (typeof roundA === 'number' && typeof roundB !== 'number') {
        return -1;
      }
      if (typeof roundA !== 'number' && typeof roundB === 'number') {
        return 1;
      }
      if (roundA !== null && roundB !== null && roundA !== roundB) {
        return String(roundA).localeCompare(String(roundB), 'ru');
      }

      return (a && a.id ? a.id : '').localeCompare(b && b.id ? b.id : '');
    });

    const processedMatches = [];

    matches.forEach((match) => {
      if (!match || !match.home || !match.away) {
        return;
      }
      const homeStats = statsById.get(match.home) || initStats({ id: match.home, name: match.home }, ratingBase);
      const awayStats = statsById.get(match.away) || initStats({ id: match.away, name: match.away }, ratingBase);

      if (!statsById.has(match.home)) {
        statsById.set(match.home, homeStats);
      }
      if (!statsById.has(match.away)) {
        statsById.set(match.away, awayStats);
      }

      const score = deriveScore(match);
      const pointsDelta = calculatePointsDelta(score, rules.points);
      const ratingDelta = calculateRatingDelta(score, rules.rating);

      const homeRatingBefore = homeStats.rating;
      const awayRatingBefore = awayStats.rating;

      if (score.status !== 'scheduled') {
        homeStats.matchesPlayed += 1;
        awayStats.matchesPlayed += 1;

        homeStats.setsWon += score.sets.home;
        homeStats.setsLost += score.sets.away;
        awayStats.setsWon += score.sets.away;
        awayStats.setsLost += score.sets.home;

        homeStats.gamesWon += score.games.home;
        homeStats.gamesLost += score.games.away;
        awayStats.gamesWon += score.games.away;
        awayStats.gamesLost += score.games.home;

        homeStats.points += pointsDelta.home;
        awayStats.points += pointsDelta.away;

        homeStats.rating += ratingDelta.home;
        awayStats.rating += ratingDelta.away;

        homeStats.ratingHistory.push({ matchId: match.id, delta: ratingDelta.home, after: homeStats.rating });
        awayStats.ratingHistory.push({ matchId: match.id, delta: ratingDelta.away, after: awayStats.rating });

        if (score.winner === 'home') {
          homeStats.wins += 1;
          awayStats.losses += 1;
          homeStats.form.push('W');
          awayStats.form.push(score.status === 'wo' ? 'WO' : 'L');
        } else {
          awayStats.wins += 1;
          homeStats.losses += 1;
          awayStats.form.push('W');
          homeStats.form.push(score.status === 'wo' ? 'WO' : 'L');
        }

        if (score.status === 'wo') {
          if (score.winner === 'home') {
            awayStats.forfeits += 1;
          } else {
            homeStats.forfeits += 1;
          }
        }

        const homeVsAway = ensureHeadToHead(homeStats, awayStats.id);
        const awayVsHome = ensureHeadToHead(awayStats, homeStats.id);

        homeVsAway.matches += 1;
        awayVsHome.matches += 1;

        homeVsAway.points += pointsDelta.home;
        awayVsHome.points += pointsDelta.away;

        homeVsAway.setsFor += score.sets.home;
        homeVsAway.setsAgainst += score.sets.away;
        awayVsHome.setsFor += score.sets.away;
        awayVsHome.setsAgainst += score.sets.home;

        homeVsAway.gamesFor += score.games.home;
        homeVsAway.gamesAgainst += score.games.away;
        awayVsHome.gamesFor += score.games.away;
        awayVsHome.gamesAgainst += score.games.home;
      }

      processedMatches.push({
        id: match.id,
        round: match.round,
        date: match.date,
        arena: match.arena,
        status: score.status,
        reason: score.reason || match.result?.note || null,
        score,
        pointsDelta,
        ratingDelta,
        home: {
          id: homeStats.id,
          name: homeStats.name,
          players: homeStats.players,
          ratingBefore: homeRatingBefore,
          ratingAfter: homeRatingBefore + ratingDelta.home,
          ratingDelta: ratingDelta.home,
          pointsDelta: pointsDelta.home
        },
        away: {
          id: awayStats.id,
          name: awayStats.name,
          players: awayStats.players,
          ratingBefore: awayRatingBefore,
          ratingAfter: awayRatingBefore + ratingDelta.away,
          ratingDelta: ratingDelta.away,
          pointsDelta: pointsDelta.away
        }
      });
    });

    const standings = Array.from(statsById.values()).map((stats) => {
      const totalGames = stats.gamesWon + stats.gamesLost;
      const gamesPct = totalGames > 0 ? stats.gamesWon / totalGames : 0;
      return {
        ...stats,
        setDiff: stats.setsWon - stats.setsLost,
        gameDiff: stats.gamesWon - stats.gamesLost,
        gamePct: gamesPct
      };
    });

    return {
      standings,
      matches: processedMatches,
      totals: {
        matchesCompleted: processedMatches.filter((match) => match.status !== 'scheduled').length,
        matchesTotal: processedMatches.length
      }
    };
  };

  const computeHeadToHeadPoints = (team, group) => {
    return group.reduce((total, opponent) => {
      if (opponent.id === team.id) {
        return total;
      }
      const record = team.headToHead.get(opponent.id);
      return total + (record ? record.points : 0);
    }, 0);
  };

  const resolveTies = (teams, criteriaIndex = 0) => {
    if (teams.length <= 1) {
      return teams.slice();
    }

    if (criteriaIndex >= TIE_CRITERIA.length) {
      teams.forEach((team) => {
        team.requiresDraw = true;
        if (!team.tieBreaker) {
          team.tieBreaker = 'Жеребьёвка';
        }
      });
      return teams.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }

    const criterion = TIE_CRITERIA[criteriaIndex];

    const groups = new Map();

    teams.forEach((team) => {
      let value = 0;
      switch (criterion) {
        case 'headToHead':
          value = computeHeadToHeadPoints(team, teams);
          break;
        case 'setDiff':
          value = team.setDiff;
          break;
        case 'gameDiff':
          value = team.gameDiff;
          break;
        case 'gamePct':
          value = team.gamePct;
          break;
        case 'draw':
          value = 0;
          break;
        default:
          value = 0;
      }
      const key = typeof value === 'number' ? value.toFixed(6) : String(value);
      if (!groups.has(key)) {
        groups.set(key, { value, teams: [] });
      }
      groups.get(key).teams.push(team);
    });

    const grouped = Array.from(groups.values()).sort((a, b) => b.value - a.value);
    const hasSplit = grouped.length > 1 && criterion !== 'draw';
    const ordered = [];

    grouped.forEach(({ teams: subset }) => {
      if (hasSplit) {
        subset.forEach((team) => {
          if (!team.tieBreaker) {
            team.tieBreaker = criterion;
          }
        });
      }
      if (subset.length > 1) {
        ordered.push(...resolveTies(subset, criteriaIndex + 1));
      } else {
        ordered.push(subset[0]);
      }
    });

    return ordered;
  };

  const rankStandings = (standings) => {
    const byPoints = new Map();
    standings.forEach((team) => {
      const key = team.points;
      if (!byPoints.has(key)) {
        byPoints.set(key, []);
      }
      byPoints.get(key).push(team);
    });

    const sortedPointKeys = Array.from(byPoints.keys()).sort((a, b) => b - a);
    const ordered = [];

    sortedPointKeys.forEach((points) => {
      const group = byPoints.get(points);
      if (group.length === 1) {
        group[0].rank = ordered.length + 1;
        ordered.push(group[0]);
      } else {
        const resolved = resolveTies(group);
        resolved.forEach((team) => {
          team.rank = ordered.length + 1;
          ordered.push(team);
        });
      }
    });

    return ordered;
  };

  const renderStandingsTable = (groupData, container, highlightCount = 2) => {
    const effectiveHighlight = Number.isInteger(highlightCount) && highlightCount > 0 ? highlightCount : 0;
    const table = createEl('table', { className: 'standings-table' });
    const thead = createEl('thead');
    const headRow = createEl('tr');
    ['#', 'Команда', 'И', 'В', 'П', 'Сеты', 'Геймы', '+/-', 'Очки', 'Рейтинг'].forEach((label) => {
      headRow.appendChild(createEl('th', { textContent: label }));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = createEl('tbody');
    groupData.forEach((team, index) => {
      const row = createEl('tr', {
        className: index < effectiveHighlight
          ? 'standings-table__row standings-table__row--highlight'
          : 'standings-table__row'
      });

      const rankCell = createEl('td', {
        className: 'standings-table__rank',
        textContent: team.rank
      });
      rankCell.setAttribute('data-label', '#');
      row.appendChild(rankCell);

      const teamCell = createEl('td', { className: 'standings-table__team' });
      teamCell.setAttribute('data-label', 'Команда');
      const pill = createEl('div', { className: 'team-pill' });
      pill.appendChild(createEl('span', { className: 'team-pill__name', textContent: team.name }));
      // Название уже включает игроков, поэтому не дублируем список игроков отдельной строкой
      if (team.club) {
        pill.appendChild(createEl('span', { className: 'team-pill__club', textContent: team.club }));
      }
      if (team.requiresDraw) {
        pill.appendChild(createEl('span', { className: 'badge badge--wo', textContent: 'Жеребьёвка' }));
      } else if (team.tieBreaker && team.tieBreaker !== 'draw') {
        const label = team.tieBreaker === 'headToHead'
          ? 'Очные встречи'
          : team.tieBreaker === 'setDiff'
            ? 'Разница сетов'
            : team.tieBreaker === 'gameDiff'
              ? 'Разница геймов'
              : team.tieBreaker === 'gamePct'
                ? '% геймов'
                : null;
        if (label) {
          pill.appendChild(createEl('span', { className: 'badge badge--form', textContent: label }));
        }
      }
      teamCell.appendChild(pill);
      row.appendChild(teamCell);

      const appendCell = (value, label) => {
        const cell = createEl('td', { textContent: value });
        cell.setAttribute('data-label', label);
        row.appendChild(cell);
      };

      appendCell(fmtNumber(team.matchesPlayed), 'Игры');
      appendCell(fmtNumber(team.wins), 'Победы');
      appendCell(fmtNumber(team.losses), 'Поражения');

      const setsText = `${team.setsWon}-${team.setsLost}`;
      appendCell(setsText, 'Сеты');

      const gamesText = `${team.gamesWon}-${team.gamesLost}`;
      appendCell(gamesText, 'Геймы');

      const diff = fmtDiff(team.gameDiff);
      const diffCell = createEl('td', { textContent: diff.text, className: diff.className });
      diffCell.setAttribute('data-label', '+/-');
      row.appendChild(diffCell);

      appendCell(fmtNumber(team.points), 'Очки');
      appendCell(fmtNumber(team.rating), 'Рейтинг');

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  };

  const renderMatchesList = (matches, container) => {
    if (!matches.length) {
      container.appendChild(createEl('p', { className: 'group-card__meta', textContent: 'Матчи будут добавлены позже.' }));
      return;
    }

    const details = createEl('details', { className: 'details-panel' });
    const summary = createEl('summary');
    summary.appendChild(createEl('span', { textContent: `История матчей (${matches.filter((match) => match.status !== 'scheduled').length}/${matches.length})` }));
    summary.appendChild(createEl('span', { className: 'details-panel__icon', textContent: '›' }));
    details.appendChild(summary);

    const body = createEl('div', { className: 'details-panel__body' });
    const list = createEl('div', { className: 'matches' });

    matches.forEach((match) => {
      const card = createEl('article', { className: 'match-card' });
      const topRow = createEl('div', { className: 'match-card__top' });
      const left = createEl('span', { textContent: match.date ? fmtDate(match.date) : 'Дата уточняется' });
      const rightParts = [];
      if (match.round !== undefined && match.round !== null) {
        rightParts.push(`Раунд ${match.round}`);
      }
      if (match.arena) {
        rightParts.push(match.arena);
      }
      topRow.appendChild(left);
      if (rightParts.length) {
        topRow.appendChild(createEl('span', { textContent: rightParts.join(' • ') }));
      }
      card.appendChild(topRow);

      const teamsBlock = createEl('div', { className: 'match-card__teams' });

      const addTeamLine = (teamInfo, options = {}) => {
        const { scoreLabel = null, showScore = false } = options;
        const line = createEl('div', { className: 'match-line' });
        const teamCol = createEl('div', { className: 'match-line__team' });
        teamCol.appendChild(createEl('span', { className: 'match-line__team-name', textContent: teamInfo.name }));

        const players = Array.isArray(teamInfo.players) ? teamInfo.players : [];
        if (players.length) {
          const normalize = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
          const nameParts = teamInfo.name
            ? teamInfo.name.split(/\s*[-–—]\s*/).map((part) => normalize(part)).filter(Boolean)
            : [];
          const playerParts = players.map((player) => normalize(player));
          const isNameFromPlayers = nameParts.length === playerParts.length
            && nameParts.every((part, index) => part === playerParts[index]);

          if (!isNameFromPlayers) {
            teamCol.appendChild(createEl('span', { className: 'match-line__team-players', textContent: players.join(' · ') }));
          }
        }

        line.appendChild(teamCol);

        if (showScore && scoreLabel !== null && scoreLabel !== undefined) {
          line.appendChild(createEl('span', { className: 'match-line__score', textContent: scoreLabel }));
        }

        return line;
      };

      if (match.status === 'scheduled') {
        teamsBlock.appendChild(addTeamLine(match.home, { scoreLabel: '—', showScore: true }));
        teamsBlock.appendChild(addTeamLine(match.away));
        card.appendChild(teamsBlock);
        if (match.reason) {
          card.appendChild(createEl('p', { className: 'match-card__status', textContent: match.reason }));
        } else {
          card.appendChild(createEl('p', { className: 'match-card__status', textContent: 'Матч ожидает результата.' }));
        }
      } else {
        const scoreLine = `${match.score.sets.home}-${match.score.sets.away}`;
        const homeLabel = match.status === 'wo'
          ? (match.score.winner === 'home' ? '2:0 (WO)' : '0:2 (WO)')
          : scoreLine;
        const awayLabel = match.status === 'wo'
          ? (match.score.winner === 'away' ? '2:0 (WO)' : '0:2 (WO)')
          : scoreLine;
        teamsBlock.appendChild(addTeamLine(match.home, { scoreLabel: homeLabel, showScore: true }));
        teamsBlock.appendChild(addTeamLine(match.away, { scoreLabel: awayLabel }));
        card.appendChild(teamsBlock);

        if (match.score.setScores && match.score.setScores.length) {
          card.appendChild(createEl('div', { className: 'match-card__sets', textContent: `Сеты: ${match.score.setScores.join(' · ')}` }));
        }

        const ratingNote = `Рейтинг: ${match.home.ratingDelta >= 0 ? `+${match.home.ratingDelta}` : match.home.ratingDelta} / ${match.away.ratingDelta >= 0 ? `+${match.away.ratingDelta}` : match.away.ratingDelta}`;
        const pointsNote = `Очки: ${match.home.pointsDelta} / ${match.away.pointsDelta}`;
        const statusLine = match.status === 'wo'
          ? `${ratingNote} • ${pointsNote} • Тех. результат`
          : `${ratingNote} • ${pointsNote}`;
        card.appendChild(createEl('p', { className: 'match-card__status', textContent: statusLine }));
        if (match.reason) {
          card.appendChild(createEl('p', { className: 'match-card__status', textContent: match.reason }));
        }
      }

      list.appendChild(card);
    });

    body.appendChild(list);
    details.appendChild(body);
    container.appendChild(details);
  };

  const collectGroupQualifiers = (playoff) => {
    const map = new Map();
    if (!playoff || !Array.isArray(playoff.stages)) {
      return map;
    }
    playoff.stages.forEach((stage) => {
      ensureArray(stage.matches).forEach((match) => {
        ['home', 'away'].forEach((sideKey) => {
          const side = match ? match[sideKey] : null;
          const source = side && side.source ? side.source : null;
          if (!source || source.type !== 'group' || !source.group) {
            return;
          }
          const place = Number(source.place);
          if (!Number.isFinite(place)) {
            return;
          }
          const prev = map.get(source.group) || 0;
          if (place > prev) {
            map.set(source.group, place);
          }
        });
      });
    });
    return map;
  };

  const describeBestOf = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    if (numeric === 1) {
      return 'Один сет';
    }
    const setsToWin = Math.floor(numeric / 2) + 1;
    switch (setsToWin) {
      case 1:
        return 'До одного выигранного сета';
      case 2:
        return 'До двух выигранных сетов';
      case 3:
        return 'До трёх выигранных сетов';
      case 4:
        return 'До четырёх выигранных сетов';
      default:
        return `До ${setsToWin} выигранных сетов`;
    }
  };

  const resolvePlayoffSide = (side, context) => {
    const fallback = {
      seed: null,
      placeholder: 'Ожидаем соперника',
      note: null,
      source: null,
      resolved: false,
      name: 'Ожидаем соперника',
      players: [],
      club: null,
      groupId: null,
      groupLabel: null,
      team: {
        id: null,
        name: 'Ожидаем соперника',
        players: [],
        club: null,
        groupId: null,
        groupLabel: null
      }
    };

    if (!side) {
      return fallback;
    }

    const seed = side.seed ? String(side.seed) : null;
    const placeholder = side.placeholder || fallback.placeholder;
    const note = side.note || null;
    const source = side.source || null;

    const normalizeSummary = (team) => {
      if (!team) {
        return null;
      }
      const players = ensureArray(team.players).filter(Boolean);
      const groupId = team.groupId || (source && source.type === 'group' ? source.group : null) || null;
      const groupLabel = team.groupLabel
        || (groupId && context.groupLabels.has(groupId) ? context.groupLabels.get(groupId) : null)
        || null;
      return {
        id: team.id || null,
        name: team.name || placeholder,
        players,
        club: team.club || null,
        groupId,
        groupLabel
      };
    };

    let summary = null;

    if (side.teamId && context.teamsById.has(side.teamId)) {
      summary = normalizeSummary(context.teamsById.get(side.teamId));
    } else if (side.team && context.teamsById.has(side.team)) {
      summary = normalizeSummary(context.teamsById.get(side.team));
    } else if (side.name) {
      summary = normalizeSummary({
        id: side.teamId || null,
        name: side.name,
        players: side.players,
        club: side.club,
        groupId: side.groupId,
        groupLabel: side.groupLabel
      });
    } else if (side.team) {
      summary = normalizeSummary({
        id: side.teamId || side.team || null,
        name: side.team,
        players: side.players,
        club: side.club,
        groupId: side.groupId,
        groupLabel: side.groupLabel
      });
    }

    if (!summary && source) {
      if (source.type === 'group' && source.group && context.groupRankings.has(source.group)) {
        const ranked = context.groupRankings.get(source.group);
        const target = ranked.find((team) => team.rank === source.place);
        if (target) {
          summary = normalizeSummary({
            id: target.id,
            name: target.name,
            players: target.players,
            club: target.club,
            groupId: source.group
          });
        }
      } else if (source.type === 'match' && source.match && context.matchResults.has(source.match)) {
        const matchOutcome = context.matchResults.get(source.match);
        if (matchOutcome) {
          const role = source.outcome === 'loser' ? 'loser' : 'winner';
          const ref = matchOutcome[role];
          if (ref && ref.team) {
            summary = normalizeSummary(ref.team);
          }
        }
      } else if (source.type === 'qualifier' && side.teamId && context.teamsById.has(side.teamId)) {
        summary = normalizeSummary(context.teamsById.get(side.teamId));
      }
    }

    if (!summary) {
      summary = normalizeSummary({
        id: side.teamId || null,
        name: placeholder,
        players: side.players,
        club: side.club,
        groupId: side.groupId,
        groupLabel: side.groupLabel
      }) || fallback.team;
    }

    const resolved = Boolean(summary.name && summary.name !== placeholder);

    return {
      seed,
      placeholder,
      note,
      source,
      resolved,
      name: summary.name || placeholder,
      players: summary.players || [],
      club: summary.club || null,
      groupId: summary.groupId || null,
      groupLabel: summary.groupLabel || null,
      team: summary
    };
  };

  const buildPlayoffMatch = (match, stage, context) => {
    const home = resolvePlayoffSide(match ? match.home : null, context);
    const away = resolvePlayoffSide(match ? match.away : null, context);
    const score = deriveScore(match);
    const stageBest = describeBestOf(stage && stage.best_of ? stage.best_of : null);
    const matchBest = describeBestOf(match && match.best_of ? match.best_of : null);
    const processed = {
      id: match && match.id ? match.id : `match-${Math.random().toString(36).slice(2, 8)}`,
      label: match && match.label ? match.label : (stage && stage.label ? stage.label : 'Матч'),
      stageId: stage && stage.id ? stage.id : null,
      stageLabel: stage && stage.label ? stage.label : null,
      shortStageLabel: stage && stage.short_label ? stage.short_label : null,
      date: match && match.date ? match.date : null,
      time: match && match.time ? match.time : null,
      arena: match && match.arena ? match.arena : null,
      note: match && match.note ? match.note : null,
      status: score.status,
      score,
      bestOfText: matchBest || stageBest || null,
      stageDescription: stage && stage.description ? stage.description : null,
      matchDescription: match && match.description ? match.description : null,
      setScores: score.setScores || [],
      reason: match && match.result && match.result.reason ? match.result.reason : null,
      home,
      away
    };

    const outcome = {
      id: processed.id,
      status: score.status,
      winner: null,
      loser: null
    };

    if (score.status !== 'scheduled' && score.winner) {
      const winnerKey = score.winner === 'home' ? 'home' : 'away';
      const loserKey = winnerKey === 'home' ? 'away' : 'home';
      outcome.winner = { side: winnerKey, team: processed[winnerKey] };
      outcome.loser = { side: loserKey, team: processed[loserKey] };
    }

    context.matchResults.set(processed.id, outcome);
    return processed;
  };

  const renderBracketTeam = (teamData, score, side, status) => {
    const classes = ['bracket-team', `bracket-team--${side}`];
    if (!teamData.resolved) {
      classes.push('bracket-team--placeholder');
    }
    if (status !== 'scheduled' && score.winner === side) {
      classes.push('bracket-team--winner');
    }

    const row = createEl('div', { className: classes.join(' ') });

    if (teamData.seed) {
      row.appendChild(createEl('span', { className: 'bracket-team__seed', textContent: teamData.seed }));
    }

    const info = createEl('div', { className: 'bracket-team__info' });
    const players = Array.isArray(teamData.players) ? teamData.players.filter(Boolean) : [];
    const hasStackedNames = players.length >= 1;

    if (hasStackedNames) {
      const namesBlock = createEl('div', { className: 'bracket-team__names' });
      players.forEach((player) => {
        namesBlock.appendChild(createEl('span', { className: 'bracket-team__name-line', textContent: player }));
      });
      info.appendChild(namesBlock);
    } else {
      info.appendChild(createEl('span', { className: 'bracket-team__name', textContent: teamData.name }));
    }

    if (teamData.groupLabel) {
      info.appendChild(createEl('span', { className: 'bracket-team__group', textContent: teamData.groupLabel }));
    }

    if (teamData.club) {
      info.appendChild(createEl('span', { className: 'bracket-team__club', textContent: teamData.club }));
    }

    if (!hasStackedNames && players.length) {
      info.appendChild(createEl('span', { className: 'bracket-team__players', textContent: players.join(' · ') }));
    }

    if (teamData.note) {
      info.appendChild(createEl('span', { className: 'bracket-team__note', textContent: teamData.note }));
    }

    row.appendChild(info);

    let scoreText = '—';
    if (status !== 'scheduled') {
      if (score.status === 'wo' && score.winner === side) {
        scoreText = 'WO';
      } else if (score.sets && Object.prototype.hasOwnProperty.call(score.sets, side)) {
        scoreText = fmtNumber(score.sets[side]);
      } else {
        scoreText = '0';
      }
    }
    row.appendChild(createEl('span', { className: 'bracket-team__score', textContent: scoreText }));

    return row;
  };

  const renderPlayoffMatchCard = (matchData) => {
    const classes = ['bracket-match', `bracket-match--${matchData.status}`];
    if (matchData.status !== 'scheduled') {
      classes.push('bracket-match--completed');
    }
    const card = createEl('article', { className: classes.join(' ') });

    const header = createEl('header', { className: 'bracket-match__header' });
    if (matchData.shortStageLabel) {
      header.appendChild(createEl('span', { className: 'bracket-match__badge', textContent: matchData.shortStageLabel }));
    }
    header.appendChild(createEl('span', { className: 'bracket-match__title', textContent: matchData.label }));

    const headerMeta = [];
    if (matchData.date) {
      headerMeta.push(fmtShortDate(matchData.date));
    }
    if (matchData.time) {
      headerMeta.push(matchData.time);
    }
    if (matchData.arena) {
      headerMeta.push(matchData.arena);
    }
    if (headerMeta.length) {
      header.appendChild(createEl('span', { className: 'bracket-match__meta', textContent: headerMeta.join(' • ') }));
    }
    card.appendChild(header);

    const body = createEl('div', { className: 'bracket-match__body' });
    body.appendChild(renderBracketTeam(matchData.home, matchData.score, 'home', matchData.status));
    body.appendChild(renderBracketTeam(matchData.away, matchData.score, 'away', matchData.status));
    card.appendChild(body);

    const footNotes = [];
    if (matchData.matchDescription) {
      footNotes.push(matchData.matchDescription);
    } else if (matchData.stageDescription) {
      footNotes.push(matchData.stageDescription);
    }
    if (matchData.bestOfText) {
      footNotes.push(matchData.bestOfText);
    }
    if (matchData.note) {
      footNotes.push(matchData.note);
    }
    if (footNotes.length) {
      card.appendChild(createEl('p', { className: 'bracket-match__note', textContent: footNotes.join(' • ') }));
    }

    if (matchData.status !== 'scheduled') {
      if (matchData.setScores && matchData.setScores.length) {
        card.appendChild(createEl('p', { className: 'bracket-match__sets', textContent: `Сеты: ${matchData.setScores.join(' · ')}` }));
      }
      const statusParts = [];
      if (matchData.status === 'wo') {
        statusParts.push('Техническая победа');
      }
      if (matchData.score && matchData.score.winner) {
        const winnerName = matchData.score.winner === 'home' ? matchData.home.name : matchData.away.name;
        statusParts.push(`Победили ${winnerName}`);
      }
      if (matchData.reason) {
        statusParts.push(matchData.reason);
      }
      card.appendChild(createEl('p', { className: 'bracket-match__status', textContent: statusParts.join(' • ') }));
    } else {
      const statusParts = ['Матч ожидает результата'];
      if (matchData.reason) {
        statusParts.push(matchData.reason);
      }
      card.appendChild(createEl('p', { className: 'bracket-match__status bracket-match__status--pending', textContent: statusParts.join(' • ') }));
    }

    return card;
  };

  const buildPlayoffBracket = (division, playoff, context) => {
    if (!playoff || !Array.isArray(playoff.stages) || !playoff.stages.length) {
      return null;
    }
    const container = createEl('section', { className: 'playoff' });
    if (division && division.id) {
      container.setAttribute('data-division', division.id);
    }
    const stageCount = Array.isArray(playoff.stages) ? playoff.stages.length : 0;
    const prefersScroll = playoff && typeof playoff.layout === 'string'
      ? playoff.layout.toLowerCase() === 'scroll' || playoff.layout.toLowerCase() === 'slider'
      : false;
    if (stageCount > 3 || prefersScroll) {
      container.classList.add('playoff--scrollable');
    }
    const header = createEl('header', { className: 'playoff__header' });
    header.appendChild(createEl('h3', {
      className: 'playoff__title',
      textContent: playoff.title || 'Плей-офф'
    }));
    if (playoff.description) {
      header.appendChild(createEl('p', { className: 'playoff__subtitle', textContent: playoff.description }));
    }
    container.appendChild(header);

    const grid = createEl('div', { className: 'playoff__grid' });

    playoff.stages.forEach((stage) => {
      const stageNode = createEl('section', { className: 'bracket-stage' });
      if (stage && stage.id) {
        stageNode.setAttribute('data-stage', stage.id);
      }
      const stageHeader = createEl('header', { className: 'bracket-stage__header' });
      stageHeader.appendChild(createEl('h4', {
        className: 'bracket-stage__title',
        textContent: stage.label || 'Раунд'
      }));
      const stageMeta = [];
      const stageBest = describeBestOf(stage.best_of);
      if (stageBest) {
        stageMeta.push(stageBest);
      }
      if (stage.description) {
        stageMeta.push(stage.description);
      }
      if (stageMeta.length) {
        stageHeader.appendChild(createEl('p', {
          className: 'bracket-stage__meta',
          textContent: stageMeta.join(' • ')
        }));
      }
      stageNode.appendChild(stageHeader);

      const matchesWrap = createEl('div', { className: 'bracket-stage__matches' });
      ensureArray(stage.matches).forEach((match) => {
        const processed = buildPlayoffMatch(match, stage, context);
        matchesWrap.appendChild(renderPlayoffMatchCard(processed));
      });
      stageNode.appendChild(matchesWrap);

      grid.appendChild(stageNode);
    });

    container.appendChild(grid);
    return container;
  };

  const buildGroupCard = (group, division, processed, rankedStandings, highlightCount) => {
    const { matches, totals } = processed;
    const cardOptions = { className: 'group-card' };
    if (division && division.id) {
      cardOptions.attrs = { 'data-division': division.id };
    }
    const card = createEl('article', cardOptions);

    const header = createEl('header', { className: 'group-card__header' });
    header.appendChild(createEl('h3', { className: 'group-card__title', textContent: group.label || 'Группа' }));

    const metaParts = [`Сыграно ${totals.matchesCompleted}/${totals.matchesTotal}`];
    const descriptor = division && (division.description || division.title);
    if (descriptor) {
      metaParts.unshift(descriptor);
    }
    header.appendChild(createEl('p', { className: 'group-card__meta', textContent: metaParts.join(' • ') }));
    card.appendChild(header);

    renderStandingsTable(rankedStandings, card, highlightCount);
    renderMatchesList(matches, card);

    return card;
  };

  const getDivisionDomIds = (division, index) => {
    const rawId = division && division.id ? String(division.id) : `division-${index + 1}`;
    const sanitizedId = rawId.replace(/[^A-Za-z0-9_-]+/g, '-');
    const baseId = sanitizedId.length ? sanitizedId : `division-${index + 1}`;
    return {
      tabId: `division-tab-${baseId}`,
      panelId: `division-panel-${baseId}`
    };
  };

  const renderDivisionTabs = () => {
    if (!elements.divisionTabs || !state.data) {
      return;
    }
    const divisions = ensureArray(state.data.divisions);
    elements.divisionTabs.innerHTML = '';

    divisions.forEach((division, index) => {
      const { tabId, panelId } = getDivisionDomIds(division, index);
      const attrs = {
        type: 'button',
        role: 'tab',
        'aria-selected': division.id === state.activeDivisionId ? 'true' : 'false',
        tabindex: division.id === state.activeDivisionId ? '0' : '-1',
        id: tabId,
        'aria-controls': panelId
      };
      if (division && division.id) {
        attrs['data-division'] = division.id;
      }

      const button = createEl('button', {
        className: 'tabs__button',
        textContent: division.title || `Дивизион ${index + 1}`,
        attrs
      });

      button.addEventListener('click', () => {
        if (state.activeDivisionId !== division.id) {
          state.activeDivisionId = division.id;
          renderDivisionTabs();
          renderActiveDivision();
        }
      });

      button.addEventListener('keydown', (event) => {
        const { key } = event;
        if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
          return;
        }
        const buttons = Array.from(elements.divisionTabs.querySelectorAll('button[role="tab"]'));
        const currentIndex = buttons.indexOf(event.currentTarget);
        if (currentIndex === -1) {
          return;
        }
        event.preventDefault();
        const nextIndex = key === 'ArrowRight'
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
        const nextButton = buttons[nextIndex];
        nextButton.focus();
        nextButton.click();
      });

      elements.divisionTabs.appendChild(button);
    });
  };

  const renderActiveDivision = () => {
    if (!elements.divisionPanel || !state.data) {
      return;
    }
    elements.divisionPanel.innerHTML = '';

    const divisions = ensureArray(state.data.divisions);
    const division = divisions.find((item) => item.id === state.activeDivisionId) || divisions[0];
    if (!division) {
      elements.divisionPanel.appendChild(createEl('p', { textContent: 'Нет данных по дивизионам.' }));
      return;
    }

    const divisionIndex = divisions.indexOf(division);
    const { tabId, panelId } = getDivisionDomIds(division, divisionIndex === -1 ? 0 : divisionIndex);
    elements.divisionPanel.setAttribute('role', 'tabpanel');
    elements.divisionPanel.setAttribute('id', panelId);
    elements.divisionPanel.setAttribute('aria-labelledby', tabId);

    const rules = getRules(state.data);
    const groups = ensureArray(division.groups);
    if (!groups.length) {
      elements.divisionPanel.appendChild(createEl('p', { textContent: 'Группы пока не сформированы.' }));
      return;
    }

    const playoff = division.playoff || null;
    const qualifierSpots = collectGroupQualifiers(playoff);

    const groupAnalyses = groups.map((group) => {
      const processed = processGroupMatches(group, rules);
      const ranked = rankStandings(processed.standings);
      const highlightCount = Math.max(
        qualifierSpots.has(group.id) ? qualifierSpots.get(group.id) : 2,
        0
      );
      return { group, processed, ranked, highlightCount };
    });

    const bracketContext = {
      groupRankings: new Map(),
      groupLabels: new Map(),
      teamsById: new Map(),
      matchResults: new Map()
    };

    groupAnalyses.forEach(({ group, processed, ranked }) => {
      if (group && group.id) {
        bracketContext.groupRankings.set(group.id, ranked);
        bracketContext.groupLabels.set(group.id, group.label || group.id);
      }
      ensureArray(processed.standings).forEach((team) => {
        if (!team || !team.id) {
          return;
        }
        if (!bracketContext.teamsById.has(team.id)) {
          bracketContext.teamsById.set(team.id, {
            id: team.id,
            name: team.name,
            players: ensureArray(team.players),
            club: team.club || null,
            groupId: group && group.id ? group.id : null,
            groupLabel: group && (group.label || group.id) ? (group.label || group.id) : null
          });
        }
      });
    });

    const bracketNode = buildPlayoffBracket(division, playoff, bracketContext);
    if (bracketNode) {
      elements.divisionPanel.appendChild(bracketNode);
    }

    const grid = createEl('div', { className: 'group-grid' });

    groupAnalyses.forEach(({ group, processed, ranked, highlightCount }) => {
      const card = buildGroupCard(group, division, processed, ranked, highlightCount);
      grid.appendChild(card);
    });

    elements.divisionPanel.appendChild(grid);
  };

  const applySeasonMeta = (data) => {
    const season = data.season || {};
    if (elements.updatedAt) {
      elements.updatedAt.textContent = season.updatedAt ? fmtDate(season.updatedAt) : '—';
    }
    if (elements.footnoteUpdated) {
      elements.footnoteUpdated.textContent = season.updatedAt ? fmtShortDate(season.updatedAt) : '—';
    }
  };

  const init = async () => {
    try {
      const data = await fetchData();
      state.data = data;
      const rules = getRules(data);

      applySeasonMeta(data);
      renderSummaryCards(computeSeasonSummary(data));
      renderRules(rules);

      const divisions = ensureArray(data.divisions);
      state.activeDivisionId = divisions.length ? divisions[0].id : null;
      renderDivisionTabs();
      renderActiveDivision();
    } catch (error) {
      if (elements.divisionPanel) {
        elements.divisionPanel.innerHTML = '';
        elements.divisionPanel.appendChild(createEl('p', { textContent: 'Ошибка загрузки данных. Попробуйте обновить страницу.' }));
      }
      // eslint-disable-next-line no-console
      console.error(error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init().catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
    });
  }
})();
