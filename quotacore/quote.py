"""Opt-in daily Wikiquote cards. No credentials, translation or local quote list."""
from __future__ import annotations
import html
import json
import re
from datetime import date
from time import monotonic
from urllib.parse import urlencode, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from .paths import data_path, atomic_json

MODES = ('qotd', 'born', 'died', 'on-this-day', 'mixed')
MONTHS = 'January February March April May June July August September October November December'.split()
LIMIT = 1_048_576
FIRST_YEAR = 2005
MAX_PAGES = 22
ROUND_SECONDS = 40
API_ERRORS = (OSError, ValueError, KeyError, TypeError, AttributeError)
USER_AGENT = 'AI-Usage/0.1 (https://github.com/Berkayr/AI-Usage)'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise OSError('Unexpected API redirect')

def request(host, params, *, timeout=8):
    req = Request('https://' + host + '/w/api.php?' + urlencode(params), headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with build_opener(NoRedirect).open(req, timeout=timeout) as response:
        raw = response.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError('Response exceeds limit')
    data = json.loads(raw)
    if not isinstance(data, dict): raise ValueError('Invalid API object')
    return data

def template_parts(value):
    """Split template arguments without splitting nested templates or wiki links."""
    parts, start, depth, links = [], 0, 0, 0
    for match in re.finditer(r'\{\{|\}\}|\[\[|\]\]|\|', value):
        token = match[0]
        if token == '{{': depth += 1
        elif token == '}}': depth -= 1
        elif token == '[[': links += 1
        elif token == ']]': links -= 1
        elif depth == 0 and links == 0:
            parts.append(value[start:match.start()])
            start = match.end()
    return parts + [value[start:]]


def template_text(match):
    parts = template_parts(match[0][2:-2])
    if parts[0].strip().casefold() not in ('quote', 'quotation', 'cquote'):
        return ''
    named = dict(part.split('=', 1) for part in parts[1:] if '=' in part)
    named = {key.strip().casefold(): value for key, value in named.items()}
    return named.get('quote', named.get('text', named.get('1', next(
        (part for part in parts[1:] if '=' not in part), ''))))


def clean(value):
    value = html.unescape(value)
    value = re.sub(r'<!--.*?-->|<ref\b[^>]*>.*?</ref>', '', value, flags=re.S | re.I)
    value = re.sub(r'<br\s*/?>', ' ', value, flags=re.I)
    value = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', value)
    value = re.sub(r'\[https?://\S+\s+([^\]]+)\]', r'\1', value)
    # Remove innermost templates until nested templates are gone too.
    while re.search(r'\{\{[^{}]*\}\}', value):
        value = re.sub(r'\{\{[^{}]*\}\}', template_text, value)
    value = re.sub(r"<[^>]*>|'{2,}", '', value)
    # Layout dimensions occasionally arrive as positional quote arguments.
    value = re.sub(r'(?<!\w)\d+(?:\.\d+)?(?:px|em|rem|pt)\b', '', value, flags=re.I)
    value = ' '.join(value.split())
    return re.sub(r'\s+([,.;:!?%])', r'\1', value)[:6000]

def param(raw, name):
    raw = re.sub(r'<!--.*?-->', '', raw, flags=re.S).strip()
    start = raw.find('{{')
    if start < 0:
        return ''
    for part in template_parts(raw[start + 2:raw.rfind('}}')])[1:]:
        key, separator, value = part.partition('=')
        if separator and key.strip().casefold() == name:
            return value
    return ''

def anniversary(entity, prop, today, verb):
    claims = [c for c in entity.get('claims', {}).get(prop, []) if c.get('rank') != 'deprecated']
    preferred = [c for c in claims if c.get('rank') == 'preferred']
    values = [c.get('mainsnak', {}).get('datavalue', {}).get('value', {}) for c in preferred or claims]
    dates = {v.get('time', '') for v in values if v.get('precision', 0) >= 11 and v.get('calendarmodel', '').endswith('Q1985727')}
    if len(dates) == 1:
        m = re.fullmatch(r'\+(\d+)-(\d{2})-(\d{2})T.*', dates.pop())
        if m and (int(m[2]), int(m[3])) == (today.month, today.day):
            return f'{verb} on this day, {int(m[1])}'
    return None

def round_request(host, params, deadline):
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise TimeoutError('Daily quote round time limit reached')
    return request(host, params, timeout=min(8, remaining))


def daily_card(raw, title, today):
    text, author_raw = clean(param(raw, 'quote')), param(raw, 'author')
    if not text:
        return None
    link = re.search(r'\[\[([^]|]+)', author_raw)
    author_page = link[1].split('#')[0].replace('_', ' ').strip() if link else clean(re.split(r'\s+in\s+', author_raw, maxsplit=1, flags=re.I)[0])
    author_parts = re.split(r'\s+in\s+', author_raw, maxsplit=1, flags=re.I)
    work = clean(author_parts[1]) if len(author_parts) > 1 else clean(
        param(raw, 'source') or param(raw, 'context'))
    context = clean(' '.join(param(raw, key) for key in ('source', 'comment', 'context')))
    month, day = MONTHS[today.month - 1], str(today.day)
    pattern = rf'\b(?:{month}\s+{day}|{day}\s+{month})\b,?\s+(\d{{4}})\b'
    match = re.search(pattern, context, re.I)
    return dict(quote=text, author=clean(author_parts[0]) or 'Unknown', work=work, author_description='',
                author_page=author_page, reason=f"Wikiquote's pick for {title.split('/')[-1]}",
                source_url='https://en.wikiquote.org/wiki/' + quote(title.replace(' ', '_'), safe=''),
                license='CC BY-SA 4.0', kind='qotd', said_year=match[1] if match else None)


def author_entities(cards, deadline):
    titles = list(dict.fromkeys(c['author_page'] for c in cards if c['author_page']))
    by_title, lookups = {}, {}
    for title in titles:
        try:
            # One large author must not discard the rest of the daily pool.
            data = round_request('www.wikidata.org', dict(action='wbgetentities',
                sites='enwikiquote', titles=title, props='claims|sitelinks|descriptions', languages='en', format='json'), deadline)
            if 'error' in data:
                lookups[title] = 'failed: Wikidata API error'
                continue
            entities = data.get('entities')
            if not isinstance(entities, dict):
                raise ValueError('Invalid API object')
            for entity in entities.values():
                if entity.get('sitelinks', {}).get('enwikiquote', {}).get('title') == title and is_human(entity):
                    by_title[title] = entity
            lookups[title] = 'ok'
        except API_ERRORS as error:
            # Fixed diagnostics avoid persisting arbitrary server/error payloads.
            if isinstance(error, TimeoutError):
                reason = 'time limit reached'
            elif isinstance(error, ValueError) and str(error) == 'Response exceeds limit':
                reason = 'response exceeds 1 MiB limit'
            elif isinstance(error, OSError):
                reason = 'network error'
            else:
                reason = 'invalid Wikidata response'
            lookups[title] = 'failed: ' + reason
    return by_title, lookups


def is_human(entity):
    return any(c.get('mainsnak', {}).get('datavalue', {}).get('value', {}).get('id') == 'Q5'
               for c in entity.get('claims', {}).get('P31', []))


def fetch(today):
    # Sequential requests share one deadline, including per-author identity lookups.
    deadline = monotonic() + ROUND_SECONDS
    page_deadline = deadline - 8  # Reserve time for sequential Wikidata lookups.
    cards, seen = [], set()
    stop = max(FIRST_YEAR, today.year - MAX_PAGES + 1)
    for year in range(today.year, stop - 1, -1):
        if monotonic() >= page_deadline:
            break
        title = f'Wikiquote:Quote of the day/{MONTHS[today.month-1]} {today.day}, {year}'
        try:
            data = round_request('en.wikiquote.org', dict(action='parse', prop='wikitext',
                page=title, format='json', formatversion=2, maxlag=5), page_deadline)
            card = daily_card(data.get('parse', {}).get('wikitext', ''), title, today)
        except API_ERRORS:
            # A missing historical page must not discard the other years.
            continue
        if card and card['quote'] not in seen:
            cards.append(card)
            seen.add(card['quote'])
    if not cards:
        raise ValueError('No daily cards')
    by_title, lookups = author_entities(cards, deadline)
    for card in cards:
        title = card.pop('author_page')
        entity = by_title.get(title, {})
        card['author_description'] = clean(entity.get('descriptions', {}).get('en', {}).get('value', ''))
        card['anniversary_lookup'] = lookups.get(title, 'no author identity')
        if card['anniversary_lookup'].startswith('failed:'):
            card['diagnostic'] = 'Anniversary lookup failed (see anniversary_lookup)'
        reasons = {kind: anniversary(entity, prop, today, verb)
                   for kind, prop, verb in [('born', 'P569', 'Born'), ('died', 'P570', 'Died')]}
        card['anniversaries'] = {kind: reason for kind, reason in reasons.items() if reason}
    return cards


def matching_cards(cards, kind):
    result = []
    for card in cards:
        reason = (f"Said on this day, {card['said_year']}" if card.get('said_year') else None
                  ) if kind == 'on-this-day' else card.get('anniversaries', {}).get(kind)
        if reason:
            result.append({**card, 'kind': kind, 'reason': reason})
    return result


def fallback(cards, message):
    return [{**c, 'diagnostic': '; '.join(filter(None, (c.get('diagnostic'), message)))} for c in cards]


def unique_cards(cards):
    unique, seen, authors = [], set(), {}
    # Prefer distinct authors; only repeat an author when the pool is too small.
    for limit in (1, 2):
        for card in cards:
            author = card.get('author', '').replace('_', ' ').strip().casefold()
            if card['quote'] in seen or authors.get(author, 0) >= limit:
                continue
            unique.append(card)
            seen.add(card['quote'])
            authors[author] = authors.get(author, 0) + 1
            if len(unique) == 4:
                return unique
    return unique


def mixed_cards(groups):
    """Reserve one card per available kind, then fill with diverse authors."""
    groups = [group for group in groups if group]

    def reserve(index, chosen, authors, quotes):
        if index == len(groups):
            return chosen
        best = chosen
        for card in groups[index]:
            author = card.get('author', '').replace('_', ' ').strip().casefold()
            if author in authors or card['quote'] in quotes:
                continue
            result = reserve(index + 1, chosen + [card], authors | {author}, quotes | {card['quote']})
            if len(result) > len(best):
                best = result
            if len(best) == len(chosen) + len(groups) - index:
                return best
        skipped = reserve(index + 1, chosen, authors, quotes)
        return skipped if len(skipped) > len(best) else best

    chosen = reserve(0, [], set(), set())
    return unique_cards(chosen + [card for group in groups for card in group])


def lookup_status(cards):
    failures = list(dict.fromkeys(c.get('anniversary_lookup', '') for c in cards
                                 if c.get('anniversary_lookup', '').startswith('failed:')))
    return '; '.join(failures) if failures else 'ok'


def select(cards, mode):
    lookup_failed = lookup_status(cards).startswith('failed:')
    if mode == 'qotd':
        return [{**c, 'reason': c.get('anniversaries', {}).get('died') or
                 c.get('anniversaries', {}).get('born') or c.get('reason', '')}
                for c in cards[:1]]
    if mode in ('born', 'died'):
        return unique_cards(matching_cards(cards, mode) or
                            fallback(cards[:1], ('Anniversary lookup failed; falling back to QOTD' if lookup_failed else
                                f'No {mode} matches today in the daily pool; falling back to QOTD')))
    said = matching_cards(cards, 'on-this-day')
    born, died = matching_cards(cards, 'born'), matching_cards(cards, 'died')
    anniversaries = died + born
    if mode == 'mixed':
        return mixed_cards([said, died, born, cards])
    if said:
        return unique_cards(said)
    if anniversaries:
        return unique_cards(fallback(anniversaries,
            'No source date matches today in the daily pool; falling back to birth/death anniversaries'))
    return fallback(cards[:1], ('No source date matches today; anniversary lookup failed; falling back to QOTD'
                               if lookup_failed else
                               'No source date or birth/death matches today in the daily pool; falling back to QOTD'))

def daily_quote(*, enabled=False, mode='qotd', today=None):
    if not enabled:
        return {'status': 'disabled', 'cards': []}
    # Cross-process exclusion: settings reloads and CLI invocations share a day.
    import os
    path = data_path('quote.lock')
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'a+b') as lock:
        if os.name == 'nt':
            import msvcrt
            if lock.tell() == 0: lock.write(b'0'); lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            return _daily_quote(enabled=True, mode=mode, today=today)
        finally:
            if os.name == 'nt':
                lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def _daily_quote(*, enabled=False, mode='qotd', today=None):
    if not enabled:
        return {'status': 'disabled', 'cards': []}
    if mode not in MODES: raise ValueError('Unknown quote mode')
    today = today or date.today()
    path = data_path('quote-cache.json')
    cache = read_cache(path)
    if cache.get('attempt_date') != today.isoformat():
        # Persist the attempt before I/O: even failures are not retried today.
        cache.setdefault('cards', [])
        cache.update(attempt_date=today.isoformat(), status='offline')
        atomic_json(path, cache)
        try:
            cards = fetch(today)
            cache.update(cards=cards, date=today.isoformat(), status='ok')
        except API_ERRORS:
            # Retain the previous successful pool, marked offline, until tomorrow.
            cache['status'] = 'offline'
        atomic_json(path, cache)
    return {'status': cache.get('status', 'offline'), 'date': cache.get('date'),
            'anniversary_lookup': lookup_status(cache.get('cards', [])), 'cards': select(cache.get('cards', []), mode)}


def read_cache(path):
    try:
        cache = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(cache, dict) or not isinstance(cache.get('cards'), list): cache = {}
        if cache:
            cache['cards'] = [c for c in cache['cards'] if isinstance(c, dict) and all(isinstance(c.get(k), str) for k in ('quote', 'author', 'reason', 'source_url', 'license'))]
            for card in cache['cards']:
                card['quote'] = clean(card['quote'])
                # Upgrade today's existing cache without another network round.
                parts = card['reason'].split('; ')
                reasons = [part for part in parts if part.startswith((
                    'Born on this day, ', 'Died on this day, ', 'Said on this day, ', "Wikiquote's pick for "))]
                if reasons:
                    card['reason'] = reasons[-1]
                    diagnostics = [card.get('diagnostic', '')] + [part for part in parts if part not in reasons]
                    if any(diagnostics):
                        card['diagnostic'] = '; '.join(filter(None, diagnostics))
    except (OSError, ValueError): cache = {}
    return cache
