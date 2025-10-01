#!/usr/bin/env python3
"""Compile season data from modular YAML files into a single JSON payload."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import yaml

ROOT = Path(__file__).resolve().parents[1] / 'data'
DIVISIONS_ORDER = ['gold', 'silver', 'ladies', 'mix']


def load_yaml(path: Path) -> Any:
    with path.open('r', encoding='utf-8') as handle:
        return yaml.safe_load(handle)


def build_payload(data_root: Path) -> Dict[str, Any]:
    season_path = data_root / 'season.yml'
    rules_path = data_root / 'rules.yml'
    divisions_root = data_root / 'divisions'

    season = load_yaml(season_path) or {}
    rules = load_yaml(rules_path) or {}

    divisions: List[Dict[str, Any]] = []

    order_lookup = {division_id: index for index, division_id in enumerate(DIVISIONS_ORDER)}

    for division_dir in sorted(divisions_root.iterdir()):
        if not division_dir.is_dir():
            continue
        division_meta_path = division_dir / 'division.yml'
        if not division_meta_path.exists():
            continue
        division_meta = load_yaml(division_meta_path) or {}
        division_id = division_meta.get('id') or division_dir.name

        groups_data: List[Dict[str, Any]] = []
        for group_ref in division_meta.get('groups', []):
            if isinstance(group_ref, dict):
                group_file = group_ref.get('file')
            else:
                group_file = group_ref
            if not group_file:
                continue
            candidate = division_dir / group_file
            if not candidate.exists():
                raise FileNotFoundError(f'Group file {candidate} is missing')
            group_payload = load_yaml(candidate) or {}
            groups_data.append(group_payload)

        division_payload = {
            key: division_meta.get(key)
            for key in ('id', 'title', 'description')
            if division_meta.get(key) is not None
        }
        division_payload['groups'] = groups_data
        division_payload['_order'] = order_lookup.get(division_id, len(order_lookup))

        divisions.append(division_payload)

    divisions.sort(key=lambda item: item.pop('_order', len(order_lookup)))

    return {
        'season': season,
        'rules': rules,
        'divisions': divisions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--output',
        type=Path,
        default=ROOT / 'divisions.json',
        help='Target JSON file (default: data/divisions.json)',
    )
    parser.add_argument(
        '--root',
        type=Path,
        default=ROOT,
        help='Root directory containing season.yml, rules.yml and divisions/',
    )
    parser.add_argument('--indent', type=int, default=2, help='JSON indentation (default: 2)')

    args = parser.parse_args()

    payload = build_payload(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=args.indent)
        handle.write('\n')


if __name__ == '__main__':
    main()
