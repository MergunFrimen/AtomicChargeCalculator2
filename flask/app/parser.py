import string
import os

from typing import IO, Dict, Iterable


__all__ = ['parse_txt', 'parse_cif']


def sanitize_name(name: str) -> str:
    return ''.join(c.upper() if c in string.ascii_letters + string.digits else '_' for c in name)


def get_unique_name(name: str, already_defined: Iterable[str]) -> str:
    count = 0
    new_name = name
    while new_name in already_defined:
        count += 1
        new_name = f'{name}_{count}'

    return new_name


def parse_cif(f: IO[str]) -> Dict[str, str]:
    filename = os.path.basename(f.name)
    lines = f.readlines()
    name = lines[0].strip().split('data_')[1]
    record = ''.join(lines)
    return {f'{filename}:{sanitize_name(name)}': record}


def parse_txt(f: IO[str]) -> Dict[str, str]:
    d = {}
    filename = os.path.basename(f.name)
    base, _ = os.path.splitext(filename)
    it = iter(f)
    try:
        while it:
            name = next(it).strip()
            values = next(it)
            safe_name = sanitize_name(name)
            unique_name = get_unique_name(f'{base}:{safe_name}', d.keys())
            d[unique_name] = f'{name}\n' + values
    except StopIteration:
        pass

    return d
