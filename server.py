#!/usr/bin/env python3
"""LOL 전적 검색 서버"""
import http.server
import json
import os
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

PORT = int(os.environ.get('PORT', 3000))
API_KEY = os.environ.get('RIOT_API_KEY', '')

# .env 파일에서 API 키 읽기
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            if key.strip() == 'RIOT_API_KEY':
                API_KEY = val.strip()


def riot_request(url):
    req = urllib.request.Request(url, headers={
        'X-Riot-Token': API_KEY,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept-Charset': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://developer.riotgames.com',
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise Exception(e.code, e.read().decode())


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent / 'public'), **kwargs)

    def do_GET(self):
        path = self.path.split('?')[0]
        query = ''
        if '?' in self.path:
            query = self.path.split('?', 1)[1]

        if not path.startswith('/api/'):
            return super().do_GET()

        try:
            data = self.handle_api(path, query)
            self.send_json(200, data)
        except Exception as e:
            args = e.args
            status = args[0] if args and isinstance(args[0], int) else 500
            msg = args[1] if len(args) > 1 else str(e)
            self.send_json(status, {'error': msg})

    def handle_api(self, path, query):
        parts = path.split('/')
        # /api/account/{gameName}/{tagLine}
        if len(parts) == 5 and parts[2] == 'account':
            game_name = urllib.parse.unquote(parts[3])
            tag_line = urllib.parse.unquote(parts[4])
            return riot_request(
                f'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{urllib.parse.quote(game_name)}/{urllib.parse.quote(tag_line)}'
            )
        # /api/summoner/{puuid}
        if len(parts) == 4 and parts[2] == 'summoner':
            return riot_request(
                f'https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{parts[3]}'
            )
        # /api/league/{puuid}
        if len(parts) == 4 and parts[2] == 'league':
            return riot_request(
                f'https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/{parts[3]}'
            )
        # /api/matches/{puuid}
        if len(parts) == 4 and parts[2] == 'matches':
            params = urllib.parse.parse_qs(query)
            count = params.get('count', ['20'])[0]
            return riot_request(
                f'https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/{parts[3]}/ids?start=0&count={count}'
            )
        # /api/match/{matchId}
        if len(parts) == 4 and parts[2] == 'match':
            return riot_request(
                f'https://asia.api.riotgames.com/lol/match/v5/matches/{parts[3]}'
            )
        raise Exception(404, 'Not found')

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # API 요청만 로깅
        if '/api/' in (args[0] if args else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    if not API_KEY:
        print('⚠ RIOT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.')
    print(f'서버 실행 중: http://localhost:{PORT}')
    server = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
    server.serve_forever()
