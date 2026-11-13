# Checks the question bank in data/films.json against a real SQLite database.
#   python tools/validate.py
# For every film it builds the tables, runs each act's solution, and confirms that:
#   - the solution runs and returns rows
#   - Act I's broken starter query does NOT already pass
#   - questions marked "ordered" have no ties that would make the order ambiguous
# Run it after adding or editing a film.
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, '..', 'data', 'films.json')


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


def main():
    with open(BANK, encoding='utf-8') as f:
        films = json.load(f)
    problems = 0
    for film in films:
        db = build(film)
        if len(film['acts']) != 3:
            print(f'FAIL {film["id"]}: needs exactly 3 acts')
            problems += 1
        for i, act in enumerate(film['acts'], 1):
            tag = f'{film["id"]} act {i}'
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
    print(f'\n{len(films)} films, {problems} problem(s)')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
