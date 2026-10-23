"""Polite fetching for the reference-data scrapers: before the first request to a host its robots.txt is read
and applied (also the rules for AI crawlers, since the scrapers were written with an AI assistant): a host that
disallows ClaudeBot / anthropic-ai stops the script, a crawl-delay is kept between requests. The script says
what it is in its User-Agent.
"""
import sys
import time
import urllib.parse
import urllib.request
import urllib.robotparser

AGENTS = ('ClaudeBot', 'anthropic-ai', 'Claude-Web')
HEADERS = {'User-Agent': 'BallisticaInterna-data-tool/0.1 (+https://github.com/kiliankoller/ballistica-interna)',
           'Accept-Encoding': 'identity'}
_robots = {}
_last = {}


def _rules(host):
    if host not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(f'https://{host}/robots.txt', headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                rp.parse(r.read().decode('utf-8', 'replace').splitlines())
        except Exception:  # noqa: BLE001 - no robots.txt: everything allowed
            rp.parse([])
        _robots[host] = rp
    return _robots[host]


def fetch(url, delay=1.0):
    """The body of url; waits at least `delay` seconds (or the host's crawl-delay) since the last request to
    the same host. Exits if robots.txt disallows the URL for an AI agent."""
    host = urllib.parse.urlsplit(url).netloc
    rp = _rules(host)
    for agent in AGENTS:
        if not rp.can_fetch(agent, url):
            sys.exit(f'robots.txt of {host} disallows {agent} for {url}: stopped')
    wait = max([delay] + [float(rp.crawl_delay(a) or 0) for a in AGENTS])
    since = time.time() - _last.get(host, 0)
    if since < wait:
        time.sleep(wait - since)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    _last[host] = time.time()
    return data
