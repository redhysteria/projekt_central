"""
Czyste helpery miesięcy realizacji. Zero zależności (importowalne przez
models / business_logic / excel_export bez cyklu).

Kanoniczny format: client_months = posortowany CSV liczb 1-12, np. "2,5,8".
"""
import re


def parse_months_csv(csv):
    """'2,5,8' -> [2,5,8]; filtruje 1-12, sortuje, deduplikuje. None/'' -> []."""
    if not csv:
        return []
    out = set()
    for part in str(csv).split(','):
        part = part.strip()
        if not part:
            continue
        try:
            m = int(part)
        except ValueError:
            continue
        if 1 <= m <= 12:
            out.add(m)
    return sorted(out)


def months_to_csv(months):
    """[8,2,5,2] -> '2,5,8'."""
    uniq = sorted({m for m in months if isinstance(m, int) and 1 <= m <= 12})
    return ','.join(str(m) for m in uniq)


def months_to_label(months):
    """Etykieta dla człowieka. [] -> ''; [5] -> 'Miesiąc 05';
    ciągły -> 'Miesiące 02–07'; rozproszony -> 'Miesiące 02, 05, 08'."""
    ms = sorted({m for m in months if isinstance(m, int) and 1 <= m <= 12})
    if not ms:
        return ""
    if len(ms) == 1:
        return f"Miesiąc {ms[0]:02d}"
    if ms == list(range(ms[0], ms[-1] + 1)):
        return f"Miesiące {ms[0]:02d}–{ms[-1]:02d}"
    return "Miesiące " + ", ".join(f"{m:02d}" for m in ms)


def client_month_label_to_csv(client_month):
    """Stare formaty -> CSV. 'Miesiąc 0X' -> 'X'; 'Od Miesiąc 0X' -> 'X..12';
    'Miesiąc X-Y' -> 'X..Y'. Nieznane/'' -> ''."""
    if not client_month:
        return ""
    s = str(client_month)

    m = re.match(r'Od Miesiąc (\d{1,2})', s)
    if m:
        start = int(m.group(1))
        if 1 <= start <= 12:
            return months_to_csv(list(range(start, 13)))
        return ""

    m = re.match(r'Miesiąc (\d{1,2})-(\d{1,2})', s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= b <= 12:
            return months_to_csv(list(range(a, b + 1)))
        return ""

    m = re.match(r'Miesiąc (\d{1,2})', s)
    if m:
        return months_to_csv([int(m.group(1))])

    return ""
