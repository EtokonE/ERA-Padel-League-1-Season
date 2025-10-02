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
        meta: `Подгрупы: ${fmtNumber(summary.groupsCount)}`
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

  const renderStandingsTable = (groupData, container) => {
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
      const row = createEl('tr', { className: index < 2 ? 'standings-table__row standings-table__row--highlight' : 'standings-table__row' });

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

  const buildGroupCard = (group, division, rules) => {
    const { standings, matches, totals } = processGroupMatches(group, rules);
    const rankedStandings = rankStandings(standings);

    const card = createEl('article', { className: 'group-card' });

    const header = createEl('header', { className: 'group-card__header' });
    header.appendChild(createEl('h3', { className: 'group-card__title', textContent: group.label || 'Группа' }));
    const metaParts = [`Сыграно ${totals.matchesCompleted}/${totals.matchesTotal}`];
    const descriptor = division && (division.description || division.title);
    if (descriptor) {
      metaParts.unshift(descriptor);
    }
    header.appendChild(createEl('p', { className: 'group-card__meta', textContent: metaParts.join(' • ') }));
    card.appendChild(header);

    renderStandingsTable(rankedStandings, card);
    renderMatchesList(matches, card);

    return card;
  };

  const renderDivisionTabs = () => {
    if (!elements.divisionTabs || !state.data) {
      return;
    }
    const divisions = ensureArray(state.data.divisions);
    elements.divisionTabs.innerHTML = '';

    divisions.forEach((division, index) => {
      const button = createEl('button', {
        className: 'tabs__button',
        textContent: division.title || `Дивизион ${index + 1}`,
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': division.id === state.activeDivisionId ? 'true' : 'false',
          tabindex: division.id === state.activeDivisionId ? '0' : '-1'
        }
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

    const groups = ensureArray(division.groups);
    if (!groups.length) {
      elements.divisionPanel.appendChild(createEl('p', { textContent: 'Группы пока не сформированы.' }));
      return;
    }

    const grid = createEl('div', { className: 'group-grid' });

    groups.forEach((group) => {
      const card = buildGroupCard(group, division, getRules(state.data));
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
