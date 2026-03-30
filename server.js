require('dotenv').config();
const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = 3000;
const API_KEY = process.env.RIOT_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));

function riotRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'X-Riot-Token': API_KEY },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject({ status: res.statusCode, message: data });
        }
      });
    }).on('error', reject);
  });
}

// 소환사 검색 (Riot ID: gameName#tagLine)
app.get('/api/account/:gameName/:tagLine', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    const account = await riotRequest(
      `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );
    res.json(account);
  } catch (err) {
    res.status(err.status || 500).json({ error: '소환사를 찾을 수 없습니다.' });
  }
});

// 소환사 정보 (레벨, 아이콘)
app.get('/api/summoner/:puuid', async (req, res) => {
  try {
    const data = await riotRequest(
      `https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${req.params.puuid}`
    );
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: '소환사 정보를 가져올 수 없습니다.' });
  }
});

// 랭크 정보
app.get('/api/league/:summonerId', async (req, res) => {
  try {
    const data = await riotRequest(
      `https://kr.api.riotgames.com/lol/league/v4/entries/by-summoner/${req.params.summonerId}`
    );
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: '랭크 정보를 가져올 수 없습니다.' });
  }
});

// 최근 매치 ID 목록
app.get('/api/matches/:puuid', async (req, res) => {
  try {
    const count = req.query.count || 20;
    const data = await riotRequest(
      `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${req.params.puuid}/ids?start=0&count=${count}`
    );
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: '매치 목록을 가져올 수 없습니다.' });
  }
});

// 매치 상세 정보
app.get('/api/match/:matchId', async (req, res) => {
  try {
    const data = await riotRequest(
      `https://asia.api.riotgames.com/lol/match/v5/matches/${req.params.matchId}`
    );
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: '매치 정보를 가져올 수 없습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  if (!API_KEY) {
    console.warn('⚠ RIOT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }
});
