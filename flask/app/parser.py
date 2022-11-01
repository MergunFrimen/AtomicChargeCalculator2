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


def parse_txt(f: IO[str], tmp_dir) -> Dict[str, str]:
    charges = {}
    it = iter(f)
    try:
        while it:
            molecule_name = sanitize_name(next(it).strip())
            charge_values = next(it)
            output_filename = molecule_name.lower() + ".default.cif"
            unique_name = get_unique_name(f'{output_filename}:{molecule_name}', charges.keys())
            if check_structure_exists(output_filename, tmp_dir):
                charges[unique_name] = f'{molecule_name}\n' + charge_values
    except StopIteration:
        pass

    return charges


def check_structure_exists(output_filename, tmp_dir):
    return output_filename in os.listdir(os.path.join(tmp_dir, 'output'))
