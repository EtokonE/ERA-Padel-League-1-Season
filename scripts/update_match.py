#!/usr/bin/env python3
"""Utility to edit match results inside modular YAML data files."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from typing import Any, Dict, List

import yaml

DATA_ROOT = Path(__file__).resolve().parents[1] / 'data'


class MatchNotFound(RuntimeError):
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
    sets = []
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
    # fallback scan
    for group_file in (division_dir / 'groups').glob('*.yml'):
        payload = load_yaml(group_file) or {}
        if payload.get('id') == group_id:
            return group_file
    raise MatchNotFound(f'Не удалось найти файл группы для {group_id}')


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
) -> Path:
    division_dir = DATA_ROOT / 'divisions' / division_id
    if not division_dir.exists():
        raise MatchNotFound(f'Дивизион {division_id} не найден')

    group_path = find_group_file(division_dir, group_id)
    group_payload = load_yaml(group_path) or {}
    matches = group_payload.get('matches') or []

    target = None
    for match in matches:
        if match.get('id') == match_id:
            target = match
            break
    if target is None:
        raise MatchNotFound(f'Матч {match_id} не найден в группе {group_id}')

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

    if status == 'scheduled':
        result.pop('winner', None)
        result.pop('sets', None)
        result.pop('reason', None)
    elif status == 'wo':
        if winner:
            result['winner'] = winner
        if reason is not None:
            if reason:
                result['reason'] = reason
            else:
                result.pop('reason', None)
        result.pop('sets', None)
    else:
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
    return group_path


def rebuild_json() -> None:
    build_script = Path(__file__).resolve().with_name('build_data.py')
    subprocess.run(['python', str(build_script)], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--division', required=True, help='ID дивизиона (например, gold)')
    parser.add_argument('--group', required=True, help='ID группы (например, gold-alpha)')
    parser.add_argument('--match', required=True, help='ID матча (например, gold-alpha-006)')
    parser.add_argument('--status', choices=['played', 'scheduled', 'wo'], help='Новый статус матча')
    parser.add_argument('--winner', choices=['home', 'away'], help='Победитель матча')
    parser.add_argument('--sets', help='Счёт по сетам, формат 6-4,3-6,7-5')
    parser.add_argument('--date', help='Обновить дату матча (ISO, например 2025-10-31). Пустая строка удалит дату.', nargs='?')
    parser.add_argument('--round', type=int, dest='round_no', help='Изменить номер тура')
    parser.add_argument('--reason', help='Комментарий (используется для технических результатов). Пустая строка удалит поле.', nargs='?')
    parser.add_argument('--clear-sets', action='store_true', help='Удалить список сетов, если они больше не нужны')
    parser.add_argument('--no-build', action='store_true', help='Не пересобирать divisions.json после обновления')

    args = parser.parse_args()

    sets_value = None
    if args.sets is not None:
        sets_value = parse_sets(args.sets)

    updated_file = update_match(
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
    )

    print(f'Матч {args.match} обновлён в {updated_file}')

    if not args.no_build:
        rebuild_json()
        print('Файл data/divisions.json пересобран')


if __name__ == '__main__':
    main()
