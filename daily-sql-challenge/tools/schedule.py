# Gives every film in data/films.json a date in data/schedule.json.
#   python tools/schedule.py
# Films that are already scheduled keep their dates. Any film not yet on the schedule is given
# the next free day after the last scheduled one, in the order the films appear in films.json.
# Run it after adding films, then run tools/validate.py.
import datetime
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, '..', 'data', 'films.json')
SCHEDULE = os.path.join(HERE, '..', 'data', 'schedule.json')
FIRST_DAY = datetime.date(2026, 11, 13)  # Screening #1; must match EPOCH in js/game.js


def main():
    with open(BANK, encoding='utf-8') as f:
        films = json.load(f)
    schedule = {}
    if os.path.exists(SCHEDULE):
        with open(SCHEDULE, encoding='utf-8') as f:
            schedule = json.load(f)

    scheduled = set(schedule.values())
    waiting = [film['id'] for film in films if film['id'] not in scheduled]
    day = max((datetime.date.fromisoformat(d) for d in schedule), default=FIRST_DAY - datetime.timedelta(days=1))
    for film_id in waiting:
        day += datetime.timedelta(days=1)
        schedule[day.isoformat()] = film_id
        print(f'{day.isoformat()}  {film_id}')

    with open(SCHEDULE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(dict(sorted(schedule.items())), f, indent=2)
        f.write('\n')

    last = max(datetime.date.fromisoformat(d) for d in schedule)
    left = (last - datetime.date.today()).days
    print(f'\nadded {len(waiting)} film(s); schedule runs to {last.isoformat()} ({left} day(s) from today)')


if __name__ == '__main__':
    main()
