const DDRAGON = 'https://ddragon.leagueoflegends.com';
let ddragonVersion = '14.24.1';

// Data Dragon 최신 버전 가져오기
fetch(`${DDRAGON}/api/versions.json`)
  .then((r) => r.json())
  .then((versions) => {
    ddragonVersion = versions[0];
  })
  .catch(() => {});

const $ = (sel) => document.querySelector(sel);
const searchInput = $('#searchInput');
const searchBtn = $('#searchBtn');

searchBtn.addEventListener('click', search);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});

async function search() {
  const raw = searchInput.value.trim();
  if (!raw) return;

  const hashIndex = raw.lastIndexOf('#');
  if (hashIndex === -1) {
    showError('형식: 소환사명#태그 (예: Hide on bush#KR1)');
    return;
  }

  const gameName = raw.substring(0, hashIndex).trim();
  const tagLine = raw.substring(hashIndex + 1).trim();
  if (!gameName || !tagLine) {
    showError('소환사명과 태그를 모두 입력해주세요.');
    return;
  }

  hideAll();
  showLoading(true);

  try {
    // 1. Riot 계정 조회
    const account = await api(`/api/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);

    // 2. 소환사 정보
    const summoner = await api(`/api/summoner/${account.puuid}`);

    // 3. 랭크 정보 (puuid 기반)
    const leagues = await api(`/api/league/${account.puuid}`);

    renderProfile(account, summoner, leagues);

    // 4. 매치 목록
    const matchIds = await api(`/api/matches/${account.puuid}?count=20`);

    // 5. 매치 상세 (병렬)
    const matches = await Promise.all(
      matchIds.map((id) => api(`/api/match/${id}`).catch(() => null))
    );

    renderMatches(matches.filter(Boolean), account.puuid);
  } catch (err) {
    showError(err.message || '검색에 실패했습니다.');
  } finally {
    showLoading(false);
  }
}

async function api(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  return res.json();
}

function hideAll() {
  $('#error').classList.add('hidden');
  $('#profile').classList.add('hidden');
  $('#matchList').classList.add('hidden');
}

function showLoading(show) {
  $('#loading').classList.toggle('hidden', !show);
}

function showError(msg) {
  const el = $('#error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// 프로필 렌더링
function renderProfile(account, summoner, leagues) {
  $('#profileIcon').src = `${DDRAGON}/cdn/${ddragonVersion}/img/profileicon/${summoner.profileIconId}.png`;
  $('#summonerName').textContent = `${account.gameName}#${account.tagLine}`;
  $('#summonerLevel').textContent = `Lv. ${summoner.summonerLevel}`;

  const rankContainer = $('#rankInfo');
  rankContainer.innerHTML = '';

  const queueNames = {
    RANKED_SOLO_5x5: '솔로랭크',
    RANKED_FLEX_SR: '자유랭크',
  };

  const tierColors = {
    IRON: '#5e5146',
    BRONZE: '#8c6239',
    SILVER: '#80989d',
    GOLD: '#cd8837',
    PLATINUM: '#4e9996',
    EMERALD: '#2d9171',
    DIAMOND: '#576bce',
    MASTER: '#9d48e0',
    GRANDMASTER: '#e04e4e',
    CHALLENGER: '#f4c874',
  };

  for (const queue of ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR']) {
    const league = leagues.find((l) => l.queueType === queue);
    const card = document.createElement('div');
    card.className = 'rank-card';

    if (league) {
      const total = league.wins + league.losses;
      const wr = ((league.wins / total) * 100).toFixed(1);
      card.innerHTML = `
        <div>
          <div class="rank-type">${queueNames[queue]}</div>
          <div class="rank-tier" style="color:${tierColors[league.tier] || '#f0e6d2'}">${league.tier} ${league.rank}</div>
          <div class="rank-lp">${league.leaguePoints} LP</div>
          <div class="rank-winrate">${league.wins}승 ${league.losses}패 (${wr}%)</div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div>
          <div class="rank-type">${queueNames[queue]}</div>
          <div class="rank-tier">Unranked</div>
        </div>
      `;
    }
    rankContainer.appendChild(card);
  }

  $('#profile').classList.remove('hidden');
}

// 매치 렌더링
function renderMatches(matches, puuid) {
  const container = $('#matches');
  container.innerHTML = '';

  let wins = 0;
  let losses = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;

  const queueMap = {
    420: '솔로랭크',
    440: '자유랭크',
    450: '칼바람',
    400: '일반',
    430: '일반',
    490: '빠른대전',
    900: 'URF',
    1700: 'Arena',
    1900: 'Arena',
  };

  for (const match of matches) {
    const info = match.info;
    const me = info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;

    const isRemake = info.gameDuration < 300;
    const isWin = !isRemake && me.win;
    const isLoss = !isRemake && !me.win;

    if (!isRemake) {
      if (isWin) wins++;
      else losses++;
    }

    totalKills += me.kills;
    totalDeaths += me.deaths;
    totalAssists += me.assists;

    const duration = `${Math.floor(info.gameDuration / 60)}:${String(info.gameDuration % 60).padStart(2, '0')}`;
    const kda = me.deaths === 0 ? 'Perfect' : ((me.kills + me.assists) / me.deaths).toFixed(2);
    const cs = me.totalMinionsKilled + me.neutralMinionsKilled;
    const csPerMin = (cs / (info.gameDuration / 60)).toFixed(1);
    const timeAgo = getTimeAgo(info.gameEndTimestamp || info.gameCreation + info.gameDuration * 1000);

    let kdaClass = '';
    if (kda === 'Perfect') kdaClass = 'perfect';
    else if (parseFloat(kda) >= 5) kdaClass = 'great';
    else if (parseFloat(kda) >= 3) kdaClass = 'good';

    const resultClass = isRemake ? 'remake' : isWin ? 'win' : 'loss';
    const resultText = isRemake ? '다시하기' : isWin ? '승리' : '패배';

    const champImg = `${DDRAGON}/cdn/${ddragonVersion}/img/champion/${me.championName}.png`;

    const items = [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6]
      .map((id) =>
        id
          ? `<img src="${DDRAGON}/cdn/${ddragonVersion}/img/item/${id}.png" alt="아이템">`
          : `<img src="" alt="" style="visibility:hidden">`
      )
      .join('');

    // 팀 분리
    const team1 = info.participants.filter((p) => p.teamId === 100);
    const team2 = info.participants.filter((p) => p.teamId === 200);
    const team1Win = info.teams?.find((t) => t.teamId === 100)?.win;

    const renderPlayer = (p) => {
      const isMe = p.puuid === puuid;
      const pKda = p.deaths === 0 ? 'Perfect' : ((p.kills + p.assists) / p.deaths).toFixed(1);
      const pCs = p.totalMinionsKilled + p.neutralMinionsKilled;
      const pName = `${p.riotIdGameName || p.summonerName || ''}#${p.riotIdTagline || ''}`;
      return `
        <div class="player-row ${isMe ? 'player-me' : ''}">
          <div class="player-champ">
            <img src="${DDRAGON}/cdn/${ddragonVersion}/img/champion/${p.championName}.png" alt="${p.championName}">
          </div>
          <div class="player-name" title="${pName}">${p.riotIdGameName || p.summonerName || '알 수 없음'}</div>
          <div class="player-kda">${p.kills}/${p.deaths}/${p.assists} <span class="player-kda-ratio">(${pKda === 'Perfect' ? 'P' : pKda})</span></div>
          <div class="player-cs">CS ${pCs}</div>
          <div class="player-damage">${(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</div>
        </div>`;
    };

    const detailHtml = `
      <div class="match-detail hidden">
        <div class="team-block">
          <div class="team-header team-blue ${team1Win ? 'team-win' : 'team-loss'}">${team1Win ? '승리' : '패배'} (블루팀)</div>
          ${team1.map(renderPlayer).join('')}
        </div>
        <div class="team-block">
          <div class="team-header team-red ${!team1Win ? 'team-win' : 'team-loss'}">${!team1Win ? '승리' : '패배'} (레드팀)</div>
          ${team2.map(renderPlayer).join('')}
        </div>
      </div>
    `;

    const card = document.createElement('div');
    card.className = `match-card-wrapper`;
    card.innerHTML = `
      <div class="match-card ${resultClass}">
        <div class="match-champ">
          <img src="${champImg}" alt="${me.championName}">
          <span class="champ-level">${me.champLevel}</span>
        </div>
        <div class="match-info">
          <div class="result">${resultText}</div>
          <div class="game-type">${queueMap[info.queueId] || '기타'}</div>
          <div class="duration">${duration}</div>
        </div>
        <div class="match-kda">
          <div class="kda-text">${me.kills} / <span style="color:${isLoss ? '#e84057' : '#c5c8cc'}">${me.deaths}</span> / ${me.assists}</div>
          <div class="kda-ratio ${kdaClass}">${kda === 'Perfect' ? 'Perfect KDA' : kda + ':1'}</div>
        </div>
        <div class="match-stats">
          <div class="cs">CS ${cs} (${csPerMin}/m)</div>
          <div class="vision">시야 ${me.visionScore}</div>
          <div class="time-ago">${timeAgo}</div>
        </div>
        <div class="match-items">${items}</div>
        <div class="match-toggle">&#9660;</div>
      </div>
      ${detailHtml}
    `;

    // 클릭 토글
    card.querySelector('.match-card').addEventListener('click', () => {
      const detail = card.querySelector('.match-detail');
      const toggle = card.querySelector('.match-toggle');
      detail.classList.toggle('hidden');
      toggle.innerHTML = detail.classList.contains('hidden') ? '&#9660;' : '&#9650;';
    });

    container.appendChild(card);
  }

  // 요약
  const total = wins + losses;
  const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;
  const avgKDA =
    totalDeaths === 0
      ? 'Perfect'
      : ((totalKills + totalAssists) / totalDeaths).toFixed(2);

  $('#matchSummary').innerHTML = `
    <span>최근 ${matches.length}게임</span>
    <span><span class="wins">${wins}승</span> <span class="losses">${losses}패</span></span>
    <span>승률 <span class="winrate">${wr}%</span></span>
    <span>평균 KDA <span class="winrate">${avgKDA}:1</span></span>
  `;

  $('#matchList').classList.remove('hidden');
}

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}달 전`;
}
