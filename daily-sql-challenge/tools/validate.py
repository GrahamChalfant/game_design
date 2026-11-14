# Checks the question bank in data/films.json against a real SQLite database.
#   python tools/validate.py
# For every film it builds the tables, runs each act's solution, and confirms that:
#   - the solution runs and returns rows
#   - Act I's broken starter query does NOT already pass
#   - questions marked "ordered" have no ties that would make the order ambiguous
#   - each act is the right kind of question (see QUESTIONS.md):
#       Act I and Act II use one table and no join or window function;
#       Act III uses exactly one of a join or a window function
#   - tables are small enough to read quickly, and every film id is unique
#   - data/schedule.json only names films that exist, and no film comes round again too soon
# Run it after adding or editing a film.
import datetime
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, '..', 'data', 'films.json')
SCHEDULE = os.path.join(HERE, '..', 'data', 'schedule.json')
MIN_DAYS_BETWEEN_RERUNS = 60


def build(film):
    db = sqlite3.connect(':memory:')
    for t in film['tables']:
        cols = ', '.join(
            f'"{n}" {ty}' + (' COLLATE NOCASE' if ty == 'TEXT' else '') for n, ty in t['columns']
        )
        db.execute(f'CREATE TABLE "{t["name"]}" ({cols})')
        marks = ', '.join('?' for _ in t['columns'])
        db.executemany(f'INSERT INTO "{t["name"]}" VALUES ({marks})', t['rows'])
    return db


def norm(v):
    if v is None:
        return '<null>'
    if isinstance(v, (int, float)):
        r = round(float(v), 2)
        return str(int(r)) if r == int(r) else str(r)
    return str(v).strip().lower()


def rows_of(db, sql):
    return [tuple(norm(v) for v in row) for row in db.execute(sql.rstrip().rstrip(';')).fetchall()]


def same(a, b, ordered):
    return a == b if ordered else sorted(a) == sorted(b)


MAX_TABLES = 2
MAX_ROWS = 12
MAX_COLUMNS = 5
MAX_PROMPT = 230


def shape(sql):
    # Which features a query uses, judged from its text.
    flat = ' ' + ' '.join(sql.lower().split()) + ' '
    return {'join': ' join ' in flat, 'window': ' over (' in flat or ' over(' in flat}


def category_problems(i, act):
    s = shape(act['solution'])
    if i in (1, 2) and (s['join'] or s['window']):
        return ['Act I and Act II must not need a join or a window function']
    if i == 3 and s['join'] == s['window']:
        return ['Act III must use exactly one of: a join, a window function']
    return []


def schedule_problems(ids):
    # Checks data/schedule.json and prints how far ahead it runs. Returns the number of problems.
    if not os.path.exists(SCHEDULE):
        print('note: no data/schedule.json; films will simply cycle in order')
        return 0
    with open(SCHEDULE, encoding='utf-8') as f:
        schedule = json.load(f)
    problems = 0
    last_shown = {}
    days = []
    for key in sorted(schedule):
        film_id = schedule[key]
        try:
            day = datetime.date.fromisoformat(key)
        except ValueError:
            print(f'FAIL schedule: {key!r} is not a YYYY-MM-DD date')
            problems += 1
            continue
        days.append(day)
        if film_id not in ids:
            print(f'FAIL schedule {key}: no film with id {film_id!r}')
            problems += 1
        if film_id in last_shown and (day - last_shown[film_id]).days < MIN_DAYS_BETWEEN_RERUNS:
            print(f'FAIL schedule {key}: {film_id} was already shown on {last_shown[film_id]}')
            problems += 1
        last_shown[film_id] = day
    for a, b in zip(days, days[1:]):
        if (b - a).days > 1:
            print(f'FAIL schedule: nothing scheduled between {a} and {b}')
            problems += 1
    unscheduled = [i for i in ids if i not in schedule.values()]
    if unscheduled:
        print(f'note: not on the schedule yet (run tools/schedule.py): {", ".join(unscheduled)}')
    if days:
        left = (max(days) - datetime.date.today()).days
        print(f'schedule: {len(days)} day(s), {min(days)} to {max(days)}, {left} day(s) of films left from today')
    return problems


def main():
    with open(BANK, encoding='utf-8') as f:
        films = json.load(f)
    problems = 0
    ids = [f['id'] for f in films]
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        print(f'FAIL {dup}: film id used more than once')
        problems += 1
    for film in films:
        if len(film['tables']) > MAX_TABLES:
            print(f'FAIL {film["id"]}: more than {MAX_TABLES} tables')
            problems += 1
        for t in film['tables']:
            if len(t['rows']) > MAX_ROWS or len(t['columns']) > MAX_COLUMNS:
                print(f'FAIL {film["id"]}: table {t["name"]} is bigger than {MAX_ROWS} rows x {MAX_COLUMNS} columns')
                problems += 1
        db = build(film)
        if len(film['acts']) != 3:
            print(f'FAIL {film["id"]}: needs exactly 3 acts')
            problems += 1
        for i, act in enumerate(film['acts'], 1):
            tag = f'{film["id"]} act {i}'
            for msg in category_problems(i, act):
                print(f'FAIL {tag}: {msg}')
                problems += 1
            if len(act['prompt']) > MAX_PROMPT:
                print(f'FAIL {tag}: prompt is longer than {MAX_PROMPT} characters')
                problems += 1
            try:
                want = rows_of(db, act['solution'])
            except sqlite3.Error as e:
                print(f'FAIL {tag}: solution error: {e}')
                problems += 1
                continue
            if not want:
                print(f'FAIL {tag}: solution returns no rows')
                problems += 1
            if act.get('ordered') and len(set(want)) != len(want):
                print(f'FAIL {tag}: ordered answer has duplicate rows')
                problems += 1
            if i == 1:
                if 'starter' not in act:
                    print(f'FAIL {tag}: act 1 needs a broken starter query')
                    problems += 1
                else:
                    try:
                        got = rows_of(db, act['starter'])
                        if same(want, got, act.get('ordered', False)):
                            print(f'FAIL {tag}: the starter query already passes')
                            problems += 1
                    except sqlite3.Error:
                        pass  # a starter that errors is a fine kind of broken
            print(f'ok   {tag}: {len(want)} rows  {want[:3]}{" ..." if len(want) > 3 else ""}')
    problems += schedule_problems(ids)
    print(f'\n{len(films)} films, {problems} problem(s)')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
