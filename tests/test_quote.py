"""Daily quote tests use invented HTTP responses and isolated state."""
import json
import os
import tempfile
import unittest
from datetime import date
from unittest.mock import patch
from quotacore import quote

TODAY = date(2026, 11, 3)
RAW = '''{{QOTD
| quote = ''' + "'''Preparation''' [[helps|helps]] <script>bad()</script> &amp; patience" + '''
| author = [[Example Author]]
| source = Speech, November 3, 1815
}}'''
class QuoteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, QUOTACORE_HOME=self.temp.name)
        self.env.start()
    def tearDown(self):
        self.env.stop(); self.temp.cleanup()
    def response(self, host, params, **kwargs):
        if host == 'en.wikiquote.org':
            return {'parse': {'wikitext': RAW}}
        return {'entities': {'Q1': {'sitelinks': {'enwikiquote': {'title': 'Example Author'}}, 'claims': {'P31': [{'mainsnak': {'datavalue': {'value': {'id': 'Q5'}}}}], 'P569': [{'mainsnak': {'datavalue': {'value': {'time': '+1769-11-03T00:00:00Z', 'precision': 11, 'calendarmodel': 'http://www.wikidata.org/entity/Q1985727'}}}}]}}}}
    def test_disabled_never_calls_network_or_cache(self):
        with patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('Network')), patch.object(quote, 'request', side_effect=AssertionError('Request')), patch.object(quote, 'data_path', side_effect=AssertionError('Cache')):
            self.assertEqual(quote.daily_quote()['status'], 'disabled')
    def test_qotd_anniversary_work_description_share_existing_requests(self):
        def response(host, params, **kwargs):
            if host == 'en.wikiquote.org':
                return {'parse': {'wikitext': "{{QOTD|quote=An invented thought.|author=[[Example Author]]\nin\n''An Invented Book (1933)''}}"}}
            self.assertIn('descriptions', params['props'])
            data = self.response(host, params)
            entity = data['entities']['Q1']
            entity['claims']['P570'] = entity['claims'].pop('P569')
            entity['claims']['P570'][0]['mainsnak']['datavalue']['value']['time'] = '+1957-11-03T00:00:00Z'
            entity['descriptions'] = {'en': {'value': 'Fictional essayist'}}
            return data
        with patch.object(quote, 'request', side_effect=response) as http:
            card = quote.daily_quote(enabled=True, today=TODAY)['cards'][0]
            self.assertEqual(http.call_count, quote.MAX_PAGES + 1)
        self.assertEqual(card['reason'], 'Died on this day, 1957')
        self.assertEqual(card['author'], 'Example Author')
        self.assertEqual(card['work'], 'An Invented Book (1933)')
        self.assertEqual(card['author_description'], 'Fictional essayist')
        with patch.object(quote, 'request', side_effect=AssertionError('Network')):
            self.assertEqual(quote.daily_quote(enabled=True, today=TODAY)['cards'][0], card)

    def test_legacy_qotd_cache_reuses_known_anniversary(self):
        card = {'quote':'Invented', 'author':'Example', 'reason':'Daily pick',
                'source_url':'https://en.wikiquote.org/wiki/Example', 'license':'CC BY-SA 4.0',
                'anniversaries':{'died':'Died on this day, 1957'}}
        quote.atomic_json(quote.data_path('quote-cache.json'),
                          {'attempt_date':TODAY.isoformat(), 'cards':[card]})
        with patch.object(quote, 'request', side_effect=AssertionError('Network')):
            self.assertEqual(quote.daily_quote(enabled=True, today=TODAY)['cards'][0]['reason'],
                             'Died on this day, 1957')

    def test_daily_pool_modes_and_cleaning(self):
        with patch.object(quote, 'request', side_effect=self.response) as http:
            result = quote.daily_quote(enabled=True, today=TODAY)
            self.assertEqual(http.call_count, quote.MAX_PAGES + 1)
            self.assertNotIn('<', result['cards'][0]['quote'])
            self.assertEqual(quote.daily_quote(enabled=True, mode='born', today=TODAY)['cards'][0]['reason'], 'Born on this day, 1769')
            self.assertEqual(quote.daily_quote(enabled=True, mode='on-this-day', today=TODAY)['cards'][0]['reason'], 'Said on this day, 1815')
            self.assertEqual(http.call_count, quote.MAX_PAGES + 1)
    def test_offline_retains_last_cache_and_does_not_retry(self):
        with patch.object(quote, 'request', side_effect=self.response): quote.daily_quote(enabled=True, today=TODAY)
        with patch.object(quote, 'request', side_effect=OSError('Offline')) as http:
            result = quote.daily_quote(enabled=True, today=date(2026,11,4))
            self.assertEqual(result['status'], 'offline')
            self.assertEqual(result['date'], TODAY.isoformat())
            self.assertTrue(result['cards'])
            quote.daily_quote(enabled=True, today=date(2026,11,4))
            self.assertEqual(http.call_count, quote.MAX_PAGES)
    def test_first_failure_empty_and_cached(self):
        with patch.object(quote, 'request', side_effect=ValueError('Bad JSON')) as http:
            for _ in range(2): self.assertEqual(quote.daily_quote(enabled=True, today=TODAY)['cards'], [])
            self.assertEqual(http.call_count, quote.MAX_PAGES)
    def test_http_size_timeout_and_headers(self):
        with patch.object(quote, 'build_opener') as opener:
            response=opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value=b'x'*(quote.LIMIT+1)
            with self.assertRaises(ValueError): quote.request('en.wikiquote.org', {'action':'query'})
            self.assertEqual(opener.return_value.open.call_args.kwargs['timeout'], 8)
            self.assertIn('AI-Usage', opener.return_value.open.call_args.args[0].get_header('User-agent'))
    def test_uncertain_anniversary_falls_back(self):
        self.assertIsNone(quote.anniversary({'claims': {'P569': []}}, 'P569', TODAY, 'Born'))
        self.assertEqual(quote.select([{'quote':'Fictional', 'anniversaries':{}}], 'born')[0]['quote'], 'Fictional')

    def test_mixed_preserves_priority_and_deduplicates(self):
        cards=[{'quote':'First','author':'Writer One','said_year':'1815','anniversaries':{'born':'Born on this day, 1769'}}, {'quote':'Second','author':'Writer Two','anniversaries':{'died':'Died on this day, 2000'}}]
        result=quote.select(cards,'mixed')
        self.assertEqual([c['quote'] for c in result],['First','Second'])
        self.assertEqual(result[0]['kind'],'on-this-day')
    def test_simultaneous_calls_share_round(self):
        from concurrent.futures import ThreadPoolExecutor
        with patch.object(quote, 'request', side_effect=self.response) as http:
            with ThreadPoolExecutor(max_workers=4) as pool:
                results=list(pool.map(lambda _:quote.daily_quote(enabled=True,today=TODAY), range(4)))
            self.assertTrue(all(r['cards'] for r in results))
            self.assertEqual(http.call_count,quote.MAX_PAGES + 1)


class HistoricalQuoteTests(unittest.TestCase):
    setUp = QuoteTests.setUp
    tearDown = QuoteTests.tearDown
    response = QuoteTests.response

    def historical_response(self, host, params, **kwargs):
        if host == 'www.wikidata.org':
            self.assertEqual(params['sites'], 'enwikiquote')
            title = params['titles']
            self.assertIn(title, {'Recent Author', 'Born Author', 'Died Author', 'Speaker', 'Other Author'})
            records = {'Born Author': ('P569', 1949), 'Died Author': ('P570', 1957)}
            entities = {title: self.entity(title, *records[title])} if title in records else {}
            return {'entities': entities}
        year = int(params['page'].rsplit(', ', 1)[1])
        records = {2026: ('Recent', 'Recent Author', ''),
                   2025: ('Birthday', 'Born Author', ''),
                   2024: ('Memorial', 'Died Author', ''),
                   2023: ('Speech', 'Speaker', 'Speech on 3 November 1812'),
                   2022: ('Extra', 'Other Author', 'November 13, 1812')}
        if year not in records:
            return {'error': {'code': 'missingtitle'}}
        text, author, context = records[year]
        return {'parse': {'wikitext': '{{QOTD\n| quote = ' + text +
                '\n| author = [[' + author + ']]\n| source = ' + context + '\n}}'}}

    def entity(self, name, prop, year):
        entity = self.response('www.wikidata.org', {})['entities']['Q1']
        entity['sitelinks']['enwikiquote']['title'] = name
        claim = entity['claims'].pop('P569')
        claim[0]['mainsnak']['datavalue']['value']['time'] = f'+{year}-11-03T00:00:00Z'
        entity['claims'][prop] = claim
        return entity

    def test_each_mode_from_shared_historical_pool(self):
        with patch.object(quote, 'request', side_effect=self.historical_response) as http:
            for mode, expected in [('qotd', ['Recent']), ('born', ['Birthday']),
                                   ('died', ['Memorial']), ('on-this-day', ['Speech']),
                                   ('mixed', ['Speech', 'Memorial', 'Birthday', 'Recent'])]:
                result = quote.daily_quote(enabled=True, mode=mode, today=TODAY)
                self.assertEqual([c['quote'] for c in result['cards']], expected)
            self.assertEqual(http.call_count, quote.MAX_PAGES + 5)
            pages = [c.args[1]['page'] for c in http.call_args_list if c.args[0] == 'en.wikiquote.org']
            self.assertTrue(pages[-1].endswith('2005'))
            self.assertTrue(all(c.kwargs['timeout'] <= 8 for c in http.call_args_list))

    def test_explicit_fallback_reasons(self):
        cards = [{'quote': 'Daily', 'reason': 'Daily pick', 'kind': 'qotd'},
                 {'quote': 'Birthday', 'anniversaries': {'born': 'Born on this day, 1949'}}]
        for mode in ('born', 'died'):
            result = quote.select(cards[:1], mode)[0]
            self.assertEqual(result['kind'], 'qotd')
            self.assertEqual(result['reason'], 'Daily pick')
            self.assertIn(f'No {mode} matches today', result['diagnostic'])
            self.assertIn('falling back to QOTD', result['diagnostic'])
        result = quote.select(cards, 'on-this-day')[0]
        self.assertEqual(result['kind'], 'born')
        self.assertIn('No source date matches today', result['diagnostic'])
        self.assertEqual(result['reason'], 'Born on this day, 1949')
        self.assertIn('No source date or birth/death matches today',
                      quote.select(cards[:1], 'on-this-day')[0]['diagnostic'])

    def test_context_dates_and_boundaries(self):
        title = 'Wikiquote:Quote of the day/November 3, 2026'
        for context, expected in [('3 November 1812', '1812'), ('November 3, 1812', '1812'),
                                  ('November 30, 1812', None), ('13 November 1812', None)]:
            raw = '{{QOTD\n| quote = Test\n| author = Writer\n| context = ' + context + '\n}}'
            self.assertEqual(quote.daily_card(raw, title, TODAY)['said_year'], expected)
        raw = '{{QOTD\n| quote = November 3, 1812\n| author = Writer\n}}'
        self.assertIsNone(quote.daily_card(raw, title, TODAY)['said_year'])

    def test_reich_and_markup_cleanup(self):
        self.assertEqual(quote.clean('The character structure of modern [[man]] , who reproduces…'),
                         'The character structure of modern man, who reproduces…')
        self.assertEqual(quote.clean("'''[[a|b]]''' {{outer|{{inner}}}} &amp;  patience<br>Next &nbsp; , yes !"),
                         'b & patience Next, yes!')
        self.assertEqual(quote.clean('one<br/>two<BR />three &lt;br&gt;four'), 'one two three four')

    def test_layout_parameters_do_not_leak_into_quote(self):
        text = 'History may clarify our understanding of the imaginary world.'
        title = 'Wikiquote:Quote of the day/November 3, 2026'
        examples = [
            '{{Quote|11px 23px 44px ' + text + '|style=padding:11px|width=23px}}',
            '{{Quote|quote=' + text + '|style=padding:11px|class=example}}',
            '<div style="margin:11px 23px 44px" class="example">' + text + '</div>',
            '11px 23px 44px ' + text,
        ]
        for example in examples:
            with self.subTest(example=example):
                raw = '{{QOTD\n|quote=' + example + '|author=[[Invented Writer]]|style=margin:44px\n}}'
                card = quote.daily_card(raw, title, TODAY)
                self.assertEqual(card['quote'], text)
                self.assertEqual(card['author'], 'Invented Writer')
                self.assertEqual(card['reason'], "Wikiquote's pick for November 3, 2026")

    def test_existing_cache_is_cleaned_without_a_network_retry(self):
        card = self.card('11px 23px 44px An invented reflection.', 'Invented Writer', 'born')
        card.update(source_url='https://en.wikiquote.org/wiki/Example', license='CC BY-SA 4.0',
                    reason="Wikiquote's pick for November 3, 2026; Anniversary lookup failed (see anniversary_lookup)")
        quote.atomic_json(quote.data_path('quote-cache.json'),
                          {'attempt_date': TODAY.isoformat(), 'date': TODAY.isoformat(),
                           'status': 'ok', 'cards': [card]})
        with patch.object(quote, 'request', side_effect=AssertionError('Network')):
            result = quote.daily_quote(enabled=True, mode='on-this-day', today=TODAY)
        selected = result['cards'][0]
        self.assertEqual(selected['quote'], 'An invented reflection.')
        self.assertEqual(selected['reason'], 'Born on this day, 1900')
        self.assertIn('Anniversary lookup failed', selected['diagnostic'])
        self.assertIn('falling back to birth/death anniversaries', selected['diagnostic'])

    def test_mixed_reserves_kinds_before_filling_birthdays(self):
        cards = [self.card('Birthday ' + str(i), 'Writer A', 'born') for i in range(3)]
        cards += [self.card('Another birthday', 'Writer B', 'born'),
                  self.card('Memorial', 'Writer C', 'died'),
                  self.card('Daily', 'Writer D')]
        result = quote.select(cards, 'mixed')
        self.assertEqual([card['kind'] for card in result], ['died', 'born', 'qotd', 'qotd'])
        self.assertEqual(len({card['author'] for card in result}), 4)
        self.assertEqual(result[0]['quote'], 'Memorial')

    def card(self, text, author, kind='qotd'):
        return {'quote': text, 'author': author, 'kind': 'qotd',
                'reason': "Wikiquote's pick for November 3, 2026",
                'anniversaries': {kind: f'{kind.title()} on this day, 1900'} if kind != 'qotd' else {}}

    def test_author_limit_prefers_distinct_authors_then_allows_two(self):
        for mode in ('born', 'died', 'mixed'):
            cards = [self.card(str(i), 'Writer A', mode if mode != 'mixed' else 'born') for i in range(5)]
            with self.subTest(mode=mode):
                self.assertEqual(len(quote.select(cards, mode)), 2)
                cards += [self.card(str(i), f'Writer {i}', mode if mode != 'mixed' else 'born')
                          for i in range(5, 9)]
                result = quote.select(cards, mode)
                self.assertEqual(len(result), 4)
                self.assertEqual(len({card['author'] for card in result}), 4)

    def test_mixed_can_choose_another_quote_to_preserve_all_kinds(self):
        cards = [self.card('Speech', 'Writer A', 'died'),
                 self.card('Other speech', 'Writer B'),
                 self.card('Birthday', 'Writer C', 'born'),
                 self.card('Daily', 'Writer D')]
        cards[0]['said_year'] = cards[1]['said_year'] = '1815'
        result = quote.select(cards, 'mixed')
        self.assertEqual([card['quote'] for card in result],
                         ['Other speech', 'Speech', 'Birthday', 'Daily'])
        self.assertEqual([card['kind'] for card in result], ['on-this-day', 'died', 'born', 'qotd'])

    def test_round_deadline_and_partial_results(self):
        with patch.object(quote, 'monotonic', side_effect=[0, 0, 0, 41, 41]), \
             patch.object(quote, 'request', side_effect=self.historical_response) as http:
            cards = quote.fetch(TODAY)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]['anniversaries'], {})
        self.assertEqual(http.call_count, 1)

    def test_failed_historical_page_does_not_discard_pool(self):
        def response(host, params, **kwargs):
            if host == 'www.wikidata.org':
                raise OSError('Unavailable')
            if params['page'].endswith('2025'):
                raise OSError('Missing year')
            return self.historical_response(host, params, **kwargs)
        with patch.object(quote, 'request', side_effect=response):
            cards = quote.fetch(TODAY)
        self.assertEqual([c['quote'] for c in cards], ['Recent', 'Memorial', 'Speech', 'Extra'])
        self.assertTrue(all(not c['anniversaries'] for c in cards))

    def test_page_deadline_reserves_identity_budget(self):
        with patch.object(quote, 'monotonic', side_effect=[0, 0, 0, 33, 33]), \
             patch.object(quote, 'request') as http:
            http.side_effect = [self.historical_response('en.wikiquote.org',
                                {'page': 'Daily, 2026'}), {'entities': {}}]
            cards = quote.fetch(TODAY)
        self.assertEqual(len(cards), 1)
        self.assertEqual(http.call_count, 2)
        self.assertEqual(http.call_args.args[0], 'www.wikidata.org')
        self.assertEqual(http.call_args.kwargs['timeout'], 7)

    def test_future_year_still_bounds_page_count(self):
        with patch.object(quote, 'request', return_value={'error': {'code': 'missingtitle'}}) as http:
            with self.assertRaises(ValueError):
                quote.fetch(date(2040, 11, 3))
        self.assertEqual(http.call_count, quote.MAX_PAGES)
        self.assertTrue(http.call_args.args[1]['page'].endswith('2019'))

    def test_uncertain_and_deprecated_dates_do_not_match(self):
        entity = self.entity('Born Author', 'P569', 1949)
        claim = entity['claims']['P569'][0]
        claim['rank'] = 'deprecated'
        self.assertIsNone(quote.anniversary(entity, 'P569', TODAY, 'Born'))
        claim['rank'] = 'normal'
        claim['mainsnak']['datavalue']['value']['precision'] = 10
        self.assertIsNone(quote.anniversary(entity, 'P569', TODAY, 'Born'))

    def test_large_author_does_not_discard_other_anniversaries(self):
        from io import BytesIO
        from urllib.parse import parse_qs, urlsplit

        titles = []
        def open_response(req, **kwargs):
            params = {key: values[0] for key, values in parse_qs(urlsplit(req.full_url).query).items()}
            if urlsplit(req.full_url).hostname == 'en.wikiquote.org':
                return BytesIO(json.dumps(self.historical_response('en.wikiquote.org', params)).encode())
            title = params['titles']
            titles.append(title)
            if title == 'Recent Author':
                return BytesIO(b'x' * (quote.LIMIT + 1))
            return BytesIO(json.dumps(self.historical_response('www.wikidata.org', params)).encode())

        with patch.object(quote, 'build_opener') as opener:
            opener.return_value.open.side_effect = open_response
            died = quote.daily_quote(enabled=True, mode='died', today=TODAY)
            self.assertEqual(died['cards'][0]['quote'], 'Memorial')
            self.assertEqual(died['cards'][0]['reason'], 'Died on this day, 1957')
            self.assertEqual(died['anniversary_lookup'], 'failed: response exceeds 1 MiB limit')
            born = quote.daily_quote(enabled=True, mode='born', today=TODAY)
            self.assertEqual(born['cards'][0]['reason'], 'Born on this day, 1949')
            mixed = quote.daily_quote(enabled=True, mode='mixed', today=TODAY)
            self.assertEqual([c['quote'] for c in mixed['cards']], ['Speech', 'Memorial', 'Birthday', 'Recent'])
            self.assertEqual(mixed['cards'][1]['reason'], 'Died on this day, 1957')
            self.assertIn('lookup failed', mixed['cards'][3]['diagnostic'])
        self.assertEqual(titles, ['Recent Author', 'Born Author', 'Died Author', 'Speaker', 'Other Author'])
        cache = quote.read_cache(quote.data_path('quote-cache.json'))
        self.assertEqual(cache['cards'][0]['anniversary_lookup'], died['anniversary_lookup'])

    def test_lookup_failure_is_distinct_from_no_match_and_cached(self):
        def response(host, params, **kwargs):
            if host == 'www.wikidata.org':
                return {'error': {'code': 'maxlag'}}
            return self.historical_response(host, params, **kwargs)
        with patch.object(quote, 'request', side_effect=response) as http:
            for mode in ('born', 'died', 'on-this-day', 'mixed', 'qotd'):
                result = quote.daily_quote(enabled=True, mode=mode, today=TODAY)
                self.assertEqual(result['anniversary_lookup'], 'failed: Wikidata API error')
                if mode in ('born', 'died', 'qotd'):
                    self.assertIn('lookup failed', result['cards'][0]['diagnostic'])
                    self.assertNotIn('No ' + mode + ' matches', result['cards'][0]['reason'])
            self.assertEqual(http.call_count, quote.MAX_PAGES + 5)
        cards = [{'quote': 'Daily', 'anniversary_lookup': 'failed: network error'}]
        self.assertIn('lookup failed', quote.select(cards, 'on-this-day')[0]['diagnostic'])

    def test_author_lookups_share_deadline_and_continue_after_failure(self):
        cards = [{'author_page': title} for title in ('Large', 'Born Author', 'Large', 'Late')]
        with patch.object(quote, 'monotonic', side_effect=[32, 35, 41]), \
             patch.object(quote, 'request', side_effect=[ValueError('Response exceeds limit'),
                 {'entities': {'Q1': self.entity('Born Author', 'P569', 1949)}}]) as http:
            entities, lookups = quote.author_entities(cards, 40)
        self.assertIn('Born Author', entities)
        self.assertEqual(lookups['Large'], 'failed: response exceeds 1 MiB limit')
        self.assertEqual(lookups['Late'], 'failed: time limit reached')
        self.assertEqual([c.kwargs['timeout'] for c in http.call_args_list], [8, 5])
