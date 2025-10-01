#!/usr/bin/env python3
"""Утилита для управления матчами: пересборка JSON, обновление и создание встреч."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import yaml

DATA_ROOT = Path(__file__).resolve().parents[1] / 'data'
STATUS_CHOICES = ['scheduled', 'played', 'wo']
WINNER_CHOICES = ['home', 'away']


class MatchError(RuntimeError):
    pass


class UserAbort(RuntimeError):
    pass


def load_yaml(path: Path) -> Any:
    with path.open('r', encoding='utf-8') as handle:
        return yaml.safe_load(handle)


def dump_yaml(path: Path, payload: Any) -> None:
    with path.open('w', encoding='utf-8') as handle:
        yaml.safe_dump(payload, handle, allow_unicode=True, sort_keys=False)


def parse_sets(value: str) -> List[Dict[str, int]]:
    if not value:
        return []
    sets: List[Dict[str, int]] = []
    for item in value.split(','):
        item = item.strip()
        if not item:
            continue
        if '-' not in item:
            raise ValueError(f"Формат сета '{item}' должен быть в виде 6-4")
        home_raw, away_raw = item.split('-', 1)
        try:
            home_score = int(home_raw)
            away_score = int(away_raw)
        except ValueError as exc:
            raise ValueError(f"Счёт '{item}' должен содержать числа") from exc
        sets.append({'home': home_score, 'away': away_score})
    return sets


def sets_to_string(sets: Sequence[Dict[str, Any]] | None) -> str:
    if not sets:
        return ''
    chunks: List[str] = []
    for item in sets:
        if not isinstance(item, dict):
            continue
        chunks.append(f"{item.get('home', '?')}-{item.get('away', '?')}")
    return ','.join(chunks)


def find_group_file(division_dir: Path, group_id: str) -> Path:
    division_meta = load_yaml(division_dir / 'division.yml') or {}
    for entry in division_meta.get('groups', []):
        if isinstance(entry, dict) and entry.get('id') == group_id:
            group_file = entry.get('file')
            if not group_file:
                break
            candidate = division_dir / group_file
            if candidate.exists():
                return candidate
    groups_dir = division_dir / 'groups'
    if groups_dir.exists():
        for group_file in groups_dir.glob('*.yml'):
            payload = load_yaml(group_file) or {}
            if payload.get('id') == group_id:
                return group_file
    raise MatchError(f'Не удалось найти файл группы для {group_id}')


def rebuild_json() -> None:
    build_script = Path(__file__).resolve().with_name('build_data.py')
    subprocess.run(['python', str(build_script)], check=True)


def update_match(
    division_id: str,
    group_id: str,
    match_id: str,
    *,
    status: str | None,
    winner: str | None,
    sets: List[Dict[str, int]] | None,
    date: str | None,
    round_no: int | None,
    reason: str | None,
    clear_sets: bool,
    new_id: str | None,
) -> Tuple[Path, str]:
    division_dir = DATA_ROOT / 'divisions' / division_id
    if not division_dir.exists():
        raise MatchError(f'Дивизион {division_id} не найден')

    group_path = find_group_file(division_dir, group_id)
    group_payload = load_yaml(group_path) or {}
    matches = group_payload.get('matches') or []

    target = None
    for match in matches:
        if match.get('id') == match_id:
            target = match
            break
    if target is None:
        raise MatchError(f'Матч {match_id} не найден в группе {group_id}')

    if new_id and new_id != match_id:
        if any(m.get('id') == new_id for m in matches if m is not target):
            raise MatchError(f'В группе уже есть матч с id {new_id}')
        target['id'] = new_id

    if date is not None:
        if date:
            target['date'] = date
        else:
            target.pop('date', None)

    if round_no is not None:
        target['round'] = round_no

    result: Dict[str, Any] = target.setdefault('result', {})

    if status:
        result['status'] = status

    effective_status = result.get('status', 'scheduled')

    if effective_status == 'scheduled':
        result.pop('winner', None)
        result.pop('sets', None)
        if reason is not None:
            if reason:
                result['reason'] = reason
            else:
                result.pop('reason', None)
        else:
            result.pop('reason', None)
    elif effective_status == 'wo':
        if winner:
            result['winner'] = winner
        if reason is not None:
            if reason:
                result['reason'] = reason
            else:
                result.pop('reason', None)
        if reason is None and result.get('reason') is None:
            result.pop('reason', None)
        result.pop('sets', None)
    else:  # played
        if winner:
            result['winner'] = winner
        if sets is not None:
            if sets:
                result['sets'] = sets
            else:
                result.pop('sets', None)
        elif clear_sets:
            result.pop('sets', None)
        if reason is not None:
            if reason:
                result['reason'] = reason
            else:
                result.pop('reason', None)

    dump_yaml(group_path, group_payload)
    return group_path, target.get('id', match_id)


def add_match(
    division_id: str,
    group_id: str,
    match_id: str,
    *,
    home: str,
    away: str,
    status: str,
    winner: str | None,
    sets: List[Dict[str, int]] | None,
    date: str | None,
    round_no: int | None,
    reason: str | None,
) -> Tuple[Path, str]:
    if status not in STATUS_CHOICES:
        raise MatchError(f'Недопустимый статус {status}')

    division_dir = DATA_ROOT / 'divisions' / division_id
    if not division_dir.exists():
        raise MatchError(f'Дивизион {division_id} не найден')

    group_path = find_group_file(division_dir, group_id)
    group_payload = load_yaml(group_path) or {}
    matches = group_payload.get('matches')
    if not isinstance(matches, list):
        matches = []
        group_payload['matches'] = matches

    if any(m.get('id') == match_id for m in matches):
        raise MatchError(f'Матч с id {match_id} уже существует')

    new_match: Dict[str, Any] = {
        'id': match_id,
        'home': home,
        'away': away,
    }

    if round_no is not None:
        new_match['round'] = round_no

    if date:
        new_match['date'] = date

    result: Dict[str, Any] = {'status': status}

    if status in {'played', 'wo'}:
        if winner:
            result['winner'] = winner
        elif status != 'scheduled':
            raise MatchError('Для статусов played/wo нужно указать победителя')

    if status == 'played':
        if sets:
            result['sets'] = sets
        else:
            raise MatchError('Для сыгранного матча нужно указать счёт по сетам')
    elif status == 'wo':
        if reason:
            result['reason'] = reason
    else:  # scheduled
        if reason:
            result['reason'] = reason

    new_match['result'] = result
    matches.append(new_match)
    dump_yaml(group_path, group_payload)
    return group_path, match_id


# -------- выбор данных и запросы от пользователя --------

def collect_divisions() -> List[Dict[str, Any]]:
    divisions_root = DATA_ROOT / 'divisions'
    if not divisions_root.exists():
        return []
    items: List[Dict[str, Any]] = []
    for division_dir in sorted(divisions_root.iterdir()):
        if not division_dir.is_dir():
            continue
        meta_path = division_dir / 'division.yml'
        meta = load_yaml(meta_path) if meta_path.exists() else {}
        division_id = meta.get('id') or division_dir.name
        items.append({
            'id': division_id,
            'title': meta.get('title') or division_id,
            'description': meta.get('description') or '',
            'path': division_dir,
            'meta': meta or {},
        })
    return items


def collect_groups(division: Dict[str, Any]) -> List[Dict[str, Any]]:
    groups: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    meta_groups = division.get('meta', {}).get('groups', [])
    for entry in meta_groups:
        group_id = None
        group_file = None
        if isinstance(entry, dict):
            group_id = entry.get('id')
            group_file = entry.get('file')
        else:
            group_file = entry
        if not group_file:
            continue
        path = division['path'] / group_file
        if not path.exists():
            continue
        payload = load_yaml(path) or {}
        group_id = group_id or payload.get('id') or path.stem
        groups.append({
            'id': group_id,
            'label': payload.get('label') or group_id,
            'path': path,
            'payload': payload,
        })
        seen_ids.add(group_id)

    groups_dir = division['path'] / 'groups'
    if groups_dir.exists():
        for path in sorted(groups_dir.glob('*.yml')):
            payload = load_yaml(path) or {}
            group_id = payload.get('id') or path.stem
            if group_id in seen_ids:
                continue
            groups.append({
                'id': group_id,
                'label': payload.get('label') or group_id,
                'path': path,
                'payload': payload,
            })
    return groups


def prompt_choice(title: str, options: Sequence[Dict[str, Any]], *, display_fn=None) -> Dict[str, Any]:
    if not options:
        raise UserAbort('Нет доступных вариантов для выбора')
    while True:
        print(title)
        for idx, option in enumerate(options, 1):
            label = display_fn(option) if display_fn else option.get('id', option)
            code = option.get('id')
            print(f"  {idx}) {label} [{code}]")
        raw = input('Введите номер или ID (q — выход): ').strip()
        if not raw:
            continue
        if raw.lower() in {'q', 'quit', 'exit'}:
            raise UserAbort('Операция отменена пользователем')
        if raw.isdigit():
            index = int(raw)
            if 1 <= index <= len(options):
                return options[index - 1]
        for option in options:
            if raw == option.get('id'):
                return option
        print('Не удалось распознать выбор, попробуйте ещё раз.')


def choose_division() -> Dict[str, Any]:
    divisions = collect_divisions()
    if not divisions:
        raise UserAbort('Не найдены дивизионы в каталоге data/divisions')

    def show(option: Dict[str, Any]) -> str:
        if option.get('description'):
            return f"{option.get('title')} — {option.get('description')}"
        return option.get('title')

    return prompt_choice('Выберите дивизион:', divisions, display_fn=show)


def choose_group(division: Dict[str, Any]) -> Dict[str, Any]:
    groups = collect_groups(division)
    if not groups:
        raise UserAbort('В выбранном дивизионе нет групп')

    def show(option: Dict[str, Any]) -> str:
        return option.get('label')

    return prompt_choice('Выберите группу:', groups, display_fn=show)


def choose_match(group: Dict[str, Any]) -> Dict[str, Any]:
    matches = group.get('payload', {}).get('matches') or []
    if not matches:
        raise UserAbort('В выбранной группе пока нет матчей')
    options: List[Dict[str, Any]] = []
    for match in matches:
        result = match.get('result') or {}
        status = result.get('status', 'scheduled')
        date = match.get('date', '—')
        home = match.get('home', '—')
        away = match.get('away', '—')
        options.append({
            'id': match.get('id'),
            'label': f"{match.get('id')} — {home} vs {away} ({status}, {date})",
            'match': match,
        })

    def show(option: Dict[str, Any]) -> str:
        return option.get('label')

    selected = prompt_choice('Выберите матч для обновления:', options, display_fn=show)
    return selected['match']


def choose_action() -> str:
    options = [
        {'id': 'update', 'label': 'Обновить существующий матч'},
        {'id': 'create', 'label': 'Добавить новый матч'},
    ]

    def show(option: Dict[str, Any]) -> str:
        return option['label']

    choice = prompt_choice('Выберите действие:', options, display_fn=show)
    return choice['id']


def prompt_status(current: str | None) -> str | None:
    current = current or 'scheduled'
    while True:
        print('Статус матча:')
        for idx, value in enumerate(STATUS_CHOICES, 1):
            marker = ' (текущий)' if value == current else ''
            print(f'  {idx}) {value}{marker}')
        raw = input('Выберите статус (Enter — оставить текущий): ').strip()
        if not raw:
            return None
        if raw.isdigit():
            index = int(raw)
            if 1 <= index <= len(STATUS_CHOICES):
                return STATUS_CHOICES[index - 1]
        if raw in STATUS_CHOICES:
            return raw
        print('Введите номер или одно из значений: scheduled, played, wo.')


def prompt_winner(current: str | None, *, required: bool = False) -> str | None:
    while True:
        print('Победитель (home/away):')
        for idx, value in enumerate(WINNER_CHOICES, 1):
            marker = ' (текущий)' if value == current else ''
            print(f'  {idx}) {value}{marker}')
        raw = input('Введите победителя (Enter — оставить текущий): ').strip()
        if not raw:
            if required and not current:
                print('Нужно выбрать победителя.')
                continue
            return None
        if raw.isdigit():
            index = int(raw)
            if 1 <= index <= len(WINNER_CHOICES):
                return WINNER_CHOICES[index - 1]
        if raw in WINNER_CHOICES:
            return raw
        print('Введите номер или одно из значений: home, away.')


def prompt_sets(existing: Sequence[Dict[str, Any]] | None, *, required: bool = False) -> List[Dict[str, int]] | None:
    baseline = sets_to_string(existing)
    while True:
        raw = input(
            "Счёт по сетам (формат 6-4,3-6). Enter — оставить, '-' — удалить: "
            f"[{baseline or '—'}] "
        ).strip()
        if not raw:
            if required and not baseline:
                print('Нужно указать счёт.')
                continue
            return None
        if raw == '-':
            return []
        try:
            return parse_sets(raw)
        except ValueError as exc:
            print(exc)


def prompt_date(current: str | None) -> str | None:
    prompt = f"Дата матча YYYY-MM-DD (Enter — оставить, '-' — удалить) [{current or '—'}]: "
    while True:
        raw = input(prompt).strip()
        if not raw:
            return None
        if raw == '-':
            return ''
        if len(raw) == 10 and raw.count('-') == 2:
            return raw
        print('Используйте формат YYYY-MM-DD или оставьте пустым.')


def prompt_round(current: Any, *, required: bool = False) -> int | None:
    prompt = f"Номер тура (Enter — оставить) [{current if current is not None else '—'}]: "
    while True:
        raw = input(prompt).strip()
        if not raw:
            if required and current is None:
                print('Номер тура обязателен.')
                continue
            return None
        if raw.isdigit():
            return int(raw)
        print('Введите целое число или оставьте пустым.')


def prompt_reason(current: str | None) -> str | None:
    prompt = f"Комментарий (Enter — оставить, '-' — удалить) [{current or '—'}]: "
    raw = input(prompt).strip()
    if not raw:
        return None
    if raw == '-':
        return ''
    return raw


def prompt_new_id(default: str | None, existing_ids: Sequence[str]) -> str:
    suggestion = default or ''
    while True:
        raw = input(f"ID матча [{suggestion}]: ").strip()
        value = raw or suggestion
        if not value:
            print('ID не может быть пустым.')
            continue
        if value in existing_ids:
            print('Такой ID уже существует, выберите другой.')
            continue
        return value


def prompt_team(teams: Sequence[Dict[str, Any]], role: str) -> str:
    if teams:
        print(f"Выбор команды для роли '{role}':")
        for idx, team in enumerate(teams, 1):
            title = team.get('name') or team.get('id') or f'Команда {idx}'
            print(f"  {idx}) {title}")
    while True:
        raw = input(f"Введите номер или название команды для '{role}': ").strip()
        if not raw:
            print('Поле обязательно, попробуйте ещё раз.')
            continue
        if teams and raw.isdigit():
            index = int(raw)
            if 1 <= index <= len(teams):
                team = teams[index - 1]
                return team.get('id') or team.get('name')
        if teams:
            for team in teams:
                if raw == team.get('id') or raw == team.get('name'):
                    return team.get('id') or team.get('name')
        return raw


def interactive_update(division: Dict[str, Any], group: Dict[str, Any], *, no_build: bool) -> None:
    match = choose_match(group)
    group_path = group['path']
    group_payload = load_yaml(group_path) or {}
    matches = group_payload.get('matches') or []
    existing_ids = [item.get('id') for item in matches if item is not None]

    current_id = match.get('id')
    print(f"Текущий ID матча: {current_id}")
    raw_new_id = input('Новый ID (Enter — оставить текущий): ').strip()
    new_id = raw_new_id or None
    if new_id and new_id != current_id and new_id in existing_ids:
        print('Такой ID уже существует, будет использован старый.')
        new_id = None

    result = match.get('result') or {}
    status = prompt_status(result.get('status'))

    date = prompt_date(match.get('date'))
    round_no = prompt_round(match.get('round'))

    effective_status = status or result.get('status') or 'scheduled'

    winner = None
    sets_value = None
    reason = None

    if effective_status in {'played', 'wo'}:
        required = effective_status != 'scheduled'
        winner = prompt_winner(result.get('winner'), required=required)
    if effective_status == 'played':
        sets_value = prompt_sets(result.get('sets'), required=not result.get('sets'))
    elif effective_status == 'wo':
        reason = prompt_reason(result.get('reason'))
    else:
        reason = prompt_reason(result.get('reason'))

    updated_path, resulting_id = update_match(
        division['id'],
        group['id'],
        current_id,
        status=status,
        winner=winner,
        sets=sets_value,
        date=date,
        round_no=round_no,
        reason=reason,
        clear_sets=False,
        new_id=new_id,
    )
    print(f"Матч {resulting_id} обновлён в {updated_path}")
    if not no_build:
        rebuild_json()
        print('Файл data/divisions.json пересобран')


def interactive_create(division: Dict[str, Any], group: Dict[str, Any], *, no_build: bool) -> None:
    group_path = group['path']
    group_payload = load_yaml(group_path) or {}
    matches = group_payload.get('matches') or []
    existing_ids = [item.get('id') for item in matches if item is not None]

    default_prefix = group_payload.get('id') or group['id']
    default_id = f"{default_prefix}-{len(matches) + 1:03d}" if default_prefix else ''
    match_id = prompt_new_id(default_id, existing_ids)

    round_no = prompt_round(None, required=False)
    date = prompt_date(None)

    teams = group_payload.get('teams') or []
    home = prompt_team(teams, 'Хозяева')
    away = prompt_team(teams, 'Гости')

    status = prompt_status('scheduled')
    status_value = status or 'scheduled'

    winner = None
    sets_value = None
    reason = None

    if status_value in {'played', 'wo'}:
        winner = prompt_winner(None, required=True)
    if status_value == 'played':
        sets_value = prompt_sets([], required=True)
    if status_value in {'scheduled', 'wo'}:
        reason = prompt_reason(None)

    created_path, resulting_id = add_match(
        division['id'],
        group['id'],
        match_id,
        home=home,
        away=away,
        status=status_value,
        winner=winner,
        sets=sets_value,
        date=date,
        round_no=round_no,
        reason=reason,
    )
    print(f"Матч {resulting_id} добавлен в {created_path}")
    if not no_build:
        rebuild_json()
        print('Файл data/divisions.json пересобран')


def run_interactive(no_build: bool) -> None:
    try:
        division = choose_division()
        group = choose_group(division)
        action = choose_action()
        if action == 'update':
            interactive_update(division, group, no_build=no_build)
        else:
            interactive_create(division, group, no_build=no_build)
    except UserAbort as exc:
        print(str(exc))
    except KeyboardInterrupt:
        print('\nОперация отменена пользователем')
    except MatchError as exc:
        print(f'Ошибка: {exc}')


# -------- CLI --------

def main() -> None:
    if len(sys.argv) == 1:
        rebuild_json()
        print('Файл data/divisions.json пересобран')
        return

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('-i', '--interactive', action='store_true', help='Пошаговый режим (выбор дивизиона/группы/матча)')
    parser.add_argument('--create', action='store_true', help='Добавить новый матч вместо обновления существующего')
    parser.add_argument('--division', help='ID дивизиона (например, gold)')
    parser.add_argument('--group', help='ID группы (например, gold-01)')
    parser.add_argument('--match', help='ID матча (например, gold-01-006)')
    parser.add_argument('--new-id', help='Новое значение ID для существующего матча')
    parser.add_argument('--status', choices=STATUS_CHOICES, help='Статус матча (scheduled/played/wo)')
    parser.add_argument('--winner', choices=WINNER_CHOICES, help='Победитель матча (home/away)')
    parser.add_argument('--sets', help='Счёт по сетам, формат 6-4,3-6,7-5')
    parser.add_argument('--date', help='Дата матча (ISO, например 2025-10-31). Пустая строка удалит поле.', nargs='?')
    parser.add_argument('--round', type=int, dest='round_no', help='Номер тура')
    parser.add_argument('--reason', help='Комментарий. Пустая строка удалит поле.', nargs='?')
    parser.add_argument('--home', help='Команда хозяев (для создания матча)')
    parser.add_argument('--away', help='Команда гостей (для создания матча)')
    parser.add_argument('--clear-sets', action='store_true', help='Удалить список сетов при обновлении')
    parser.add_argument('--no-build', action='store_true', help='Не пересобирать divisions.json после изменения')

    args = parser.parse_args()

    if args.interactive:
        run_interactive(args.no_build)
        return

    required = [args.division, args.group]
    if not all(required):
        parser.error('Нужно указать --division и --group (или используйте --interactive)')

    try:
        if args.create:
            if not args.match:
                parser.error('Для создания матча укажите --match с новым ID')
            if not args.home or not args.away:
                parser.error('Для создания матча требуются --home и --away')
            status_value = args.status or 'scheduled'
            sets_value = parse_sets(args.sets) if args.sets is not None else None
            path, match_id = add_match(
                args.division,
                args.group,
                args.match,
                home=args.home,
                away=args.away,
                status=status_value,
                winner=args.winner,
                sets=sets_value,
                date=args.date,
                round_no=args.round_no,
                reason=args.reason,
            )
            print(f'Матч {match_id} добавлен в {path}')
        else:
            if not args.match:
                parser.error('Для обновления матча укажите --match')
            sets_value = parse_sets(args.sets) if args.sets is not None else None
            path, match_id = update_match(
                args.division,
                args.group,
                args.match,
                status=args.status,
                winner=args.winner,
                sets=sets_value,
                date=args.date,
                round_no=args.round_no,
                reason=args.reason,
                clear_sets=args.clear_sets,
                new_id=args.new_id,
            )
            print(f'Матч {match_id} обновлён в {path}')
        if not args.no_build:
            rebuild_json()
            print('Файл data/divisions.json пересобран')
    except ValueError as exc:
        print(f'Ошибка: {exc}')
    except MatchError as exc:
        print(f'Ошибка: {exc}')


if __name__ == '__main__':
    main()
