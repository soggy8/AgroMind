"""Macedonian for general pieces any module's sentences use: month names and units. Registered in main.py."""

_MONTHS = {"Jan": "јан", "Feb": "фев", "Mar": "мар", "Apr": "апр", "May": "мај", "Jun": "јун", "Jul": "јул",
           "Aug": "авг", "Sep": "сеп", "Oct": "окт", "Nov": "ное", "Dec": "дек"}

CATALOG: dict[str, str] = {
    **{f"{en} {{day}}": f"{{day}} {mk}" for en, mk in _MONTHS.items()},
    "{a} - {b}": "{a} – {b}",
    "mm/day": "mm/ден",
    "mm/year": "mm/год.",
    "days": "дена",
    "share": "дел",
    "share of typical": "дел од вообичаеното",
    "USD/ha": "USD/ha",
    "USD/ha/year": "USD/ha/год.",
    "per year": "годишно",
    "none": "нема",
    **{f"{{day}} {en} {{year}}": f"{{day}} {mk} {{year}}" for en, mk in _MONTHS.items()},
    **{f"{{day}} {en}": f"{{day}} {mk}" for en, mk in _MONTHS.items()},
    **{f"{en} {{year}}": f"{mk} {{year}}" for en, mk in _MONTHS.items()},
    # Value kinds (DESIGN.md: every number is Observed, Modelled or Scenario)
    "OBSERVED": "ИЗМЕРЕНО", "MODELLED": "МОДЕЛИРАНО", "SCENARIO": "СЦЕНАРИО",
    "OBSERVED {x}": "ИЗМЕРЕНО {x}", "MODELLED {x}": "МОДЕЛИРАНО {x}", "SCENARIO {x}": "СЦЕНАРИО {x}",
    "{name}, OBSERVED {x}": "{name}, ИЗМЕРЕНО {x}",
    # Fact framing shared by every module's advisor.py
    "Farm: {name}.": "Фарма: {name}.",
    "Data note: {rest}": "Белешка за податоците: {rest}",
    "Source: {rest}.": "Извор: {rest}.",
    "Assumption ({topic}): {rest_text} [{rest_src}]": "Претпоставка ({topic}): {rest_text} [{rest_src}]",
    "not set": "не е поставено",
}
