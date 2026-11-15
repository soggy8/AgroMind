"""Macedonian for the Economics module's sentences (app/shared/i18n.py translates responses with it; main.py registers it).

Keys are the exact English the module writes (sentences.py, service.py, ports.py, schemas.py). `{name}` placeholders
match any text inside one sentence, which is translated too (rotation and crop names come from the Simulator's
catalogue); `{num*}` matches a number only. Money amounts like "$190/ha" pass through unchanged. Margins stay scenario
margins in Macedonian too ("сценарио"), never a forecast ("прогноза"). Sources stay as published.

Crop names inside sentences are written out per crop below (generated from the tables), never as a bare "{crop}"
template, so this catalogue can't change another module's text or an id such as `price_crop: "maize"`.
"""

# Priced crops: display name -> Macedonian (nominative, definite genitive "на пченката").
_CROPS = {"Maize": ("пченка", "пченката"), "Soybean": ("соја", "сојата"), "Oats": ("овес", "овесот")}
# Crops the Simulator knows that have no Iowa money data (service._crop_names writes them lower case).
_UNPRICED = {"winter wheat": "озимна пченица", "sunflower": "сончоглед"}

# "prices" or "maize prices" in the who-earns-most sentence -> the Macedonian noun phrase.
_NOUNS = {"prices": "цените", **{f"{en.lower()} prices": f"цените на {gen}" for en, (_, gen) in _CROPS.items()}}

# The warming clause (sentences._warming_clause), with the grid's rain change or without.
_WARMING = {
    "stops earning most between {num1} °C and {num2} °C":
        "престанува да заработува најмногу меѓу {num1} °C и {num2} °C",
    "is too close to call from {num1} °C and stops earning most by {num2} °C":
        "е премногу изедначен од {num1} °C и престанува да заработува најмногу до {num2} °C",
}
_RAIN = {"": "", " with {num3}% less rain": " со {num3}% помалку дожд", " with {num3}% more rain": " со {num3}% повеќе дожд"}


def _price_clauses(en_noun: str, mk_noun: str) -> list[tuple[str, str, str, str]]:
    """(clause, clause after "or", Macedonian of each) for one price noun (sentences._price_clause)."""
    tie_en = (f"is too close to call when {en_noun} fall {{num4}}% and stops earning most when they fall {{num5}}%")
    tie_mk = (f"е премногу изедначен кога {mk_noun} ќе паднат {{num4}}% и престанува да заработува најмногу кога ќе "
              f"паднат {{num5}}%")
    fall_en, fall_mk = (f"when {en_noun} fall between {{num4}}% and {{num5}}%",
                        f"кога {mk_noun} ќе паднат меѓу {{num4}}% и {{num5}}%")
    band_en, band_mk = (f"when {en_noun} are between {{num4}}% higher and {{num5}}% lower",
                        f"кога {mk_noun} се меѓу {{num4}}% повисоки и {{num5}}% пониски")
    return [(tie_en, tie_en, tie_mk, tie_mk),
            ("stops earning most " + fall_en, fall_en, "престанува да заработува најмногу " + fall_mk, fall_mk),
            ("stops earning most " + band_en, band_en, "престанува да заработува најмногу " + band_mk, band_mk)]


def _switch_sentences() -> dict[str, str]:
    out: dict[str, str] = {}
    for w_en, w_mk in _WARMING.items():
        for r_en, r_mk in _RAIN.items():
            out[f"{{y}} {w_en}{r_en} at {{p}}."] = f"{{y}} {w_mk}{r_mk} при {{p}}."
            for n_en, n_mk in _NOUNS.items():
                for _, or_en, _, or_mk in _price_clauses(n_en, n_mk):
                    out[f"{{y}} {w_en}{r_en} at {{p}}, or {or_en} in {{c}}."] = (
                        f"{{y}} {w_mk}{r_mk} при {{p}}, или {or_mk} при {{c}}.")
    for n_en, n_mk in _NOUNS.items():
        for clause_en, _, clause_mk, _ in _price_clauses(n_en, n_mk):
            out[f"In {{c}}, {{y}} {clause_en}."] = f"При {{c}}, {{y}} {clause_mk}."
    return out


def _price_phrases() -> dict[str, str]:
    """The anchor column's prices (sentences._prices)."""
    out = {"today's prices": "денешните цени",
           "prices {num}% lower": "цени пониски за {num}%", "prices {num}% higher": "цени повисоки за {num}%"}
    for en, (_, gen) in _CROPS.items():
        c = en.lower()
        out[f"today's {c} prices"] = f"денешните цени на {gen}"
        out[f"{c} prices {{num}}% lower"] = f"цени на {gen} пониски за {{num}}%"
        out[f"{c} prices {{num}}% higher"] = f"цени на {gen} повисоки за {{num}}%"
    return out


def _unpriced_lists() -> dict[str, str]:
    """"winter wheat", "Sunflower", "winter wheat and sunflower": the crop lists service._crop_names writes."""
    out: dict[str, str] = {}
    names = list(_UNPRICED)
    for en, mk in _UNPRICED.items():
        out[en], out[en[:1].upper() + en[1:]] = mk, mk[:1].upper() + mk[1:]
    for a in names:
        for b in names:
            if a != b:
                mk = f"{_UNPRICED[a]} и {_UNPRICED[b]}"
                out[f"{a} and {b}"], out[f"{a[:1].upper() + a[1:]} and {b}"] = mk, mk[:1].upper() + mk[1:]
    return out


_NO_DATA = "нема податоци за цени и трошоци во Ајова"

CATALOG: dict[str, str] = {
    # Notes (sentences.py, service.py)
    "Compare rotations rather than reading single numbers: the model's year-to-year skill is weak, so these are "
    "scenario margins, not forecasts.":
        "Споредувајте плодореди наместо да читате поединечни броеви: моделот слабо ги погодува разликите од година "
        "до година, па ова се маржи во сценарио, а не прогнози.",
    "This field is outside the area the yield model was calibrated for, so treat the money figures as rough.":
        "Оваа нива е надвор од подрачјето за кое е калибриран моделот за принос, па паричните бројки сметајте ги "
        "за груби.",
    "You own the land, so margin here is what's left to pay for the land and your management.":
        "Земјата е ваша, па маржата тука е она што останува за земјата и за вашето управување.",
    "Costs include cash rent and labour, so margin is the return to management.":
        "Трошоците ги вклучуваат закупнината и трудот, па маржата е приносот за управувањето.",
    "Who earns most needs at least two rotations with Iowa price and cost data.":
        "За „Кој заработува најмногу“ потребни се најмалку два плодореда со податоци за цени и трошоци во Ајова.",
    # Scenario labels
    "{num1} °C, {num2}% rain": "{num1} °C, {num2}% дожд",
    # Climate bill
    "In this scenario ({label}), {yours} earns about the same as in today's climate.":
        "Во ова сценарио ({label}), {yours} заработува приближно исто како во денешната клима.",
    "In this scenario ({label}), {yours} earns about {m} a year less than in today's climate.":
        "Во ова сценарио ({label}), {yours} заработува околу {m} годишно помалку отколку во денешната клима.",
    "In this scenario ({label}), {yours} earns about {m} a year more than in today's climate.":
        "Во ова сценарио ({label}), {yours} заработува околу {m} годишно повеќе отколку во денешната клима.",
    "There's no other priced rotation to compare.": "Нема друг пресметан плодоред за споредба.",
    "None of the other rotations earns more in this scenario.":
        "Ниту еден од другите плодореди не заработува повеќе во ова сценарио.",
    "Switching to {alt} more than makes up for it.": "Преминот на {alt} повеќе од надоместува за тоа.",
    "Switching to {alt} wins back about {m} of that ({p}).": "Преминот на {alt} враќа околу {m} од тоа ({p}).",
    "{alt} would earn about {m} a year more still.": "{alt} би заработил уште околу {m} годишно повеќе.",
    # Bad-year money
    "{name} made money in every simulated season.": "{name} заработи во секоја симулирана сезона.",
    "{name} loses money in every simulated season; the worst season loses {m}.":
        "{name} губи пари во секоја симулирана сезона; најлошата сезона губи {m}.",
    "{name} loses money in about {num1} of every {num2} simulated seasons; the worst season loses {m}.":
        "{name} губи пари во околу {num1} од секои {num2} симулирани сезони; најлошата сезона губи {m}.",
    "Getting through the worst run of seasons takes about {m} in cash.":
        "За да се преживее најлошата низа сезони, потребни се околу {m} во готовина.",
    # Who earns most: the anchor cell's climate and prices, then the sentences
    "today's climate": "денешната клима",
    "today's temperatures with {num}% less rain": "денешните температури со {num}% помалку дожд",
    "today's temperatures with {num}% more rain": "денешните температури со {num}% повеќе дожд",
    "a climate {num} °C from today": "клима со {num} °C во однос на денешната",
    "a climate {num1} °C from today with {num2}% less rain":
        "клима со {num1} °C во однос на денешната и {num2}% помалку дожд",
    "a climate {num1} °C from today with {num2}% more rain":
        "клима со {num1} °C во однос на денешната и {num2}% повеќе дожд",
    **_price_phrases(),
    "In {c} at {p}, {y} and the next rotation are too close to call.":
        "При {c} и {p}, {y} и следниот плодоред се премногу изедначени.",
    "Even in {c} at {p}, {other} earns more than {y}.": "Дури и при {c} и {p}, {other} заработува повеќе од {y}.",
    **_switch_sentences(),
    "{y} earns most everywhere on this grid.": "{y} заработува најмногу насекаде на оваа мрежа.",
    "{y} earns most or is too close to call everywhere on this grid.":
        "{y} заработува најмногу или е премногу изедначен насекаде на оваа мрежа.",
    "{y} earns most in {c} at {p}; other rotations win elsewhere on the grid.":
        "{y} заработува најмногу при {c} и {p}; други плодореди победуваат на други места на мрежата.",
    "the scenario's rain change": "промената на дождот во сценариото",
    "the projection's May-Sep median rain change": "медијаната на промената на дождот мај–сеп во проекцијата",
    # Numbers used (service.resolve_inputs)
    **{f"{en} price": f"Цена на {mk}" for en, (mk, _) in _CROPS.items()},
    **{f"{en} typical yield": f"Вообичаен принос на {mk}" for en, (mk, _) in _CROPS.items()},
    **{f"{en} cost before rent": f"Трошок за {mk} без закупнина" for en, (mk, _) in _CROPS.items()},
    **{f"{en} after {en.lower()} cost before rent": f"Трошок за {mk} по {mk} без закупнина"
       for en, (mk, _) in _CROPS.items()},
    "Cash rent": "Закупнина",
    "Irrigation cost": "Трошок за наводнување",
    "Rye cover crop cost": "Трошок за покровна култура ‘рж",
    "own land": "сопствена земја",
    # Assumptions
    "Oats cost": "Трошок за овес",
    "Oats cost before rent is an estimate ({d}): ISU publishes no grain-oat budget.":
        "Трошокот за овес без закупнина е проценка ({d}): Државниот универзитет на Ајова (ISU) не објавува буџет "
        "за овес за зрно.",
    "Irrigation costs ${num} per mm per ha, pumping and energy only.":
        "Наводнувањето чини ${num} по mm по ha, само пумпање и енергија.",
    "Irrigation per weather year": "Наводнување по метеоролошка година",
    "Every weather year is costed with the season's median (p50) irrigation, because the Simulator reports "
    "irrigation per season, not per year.":
        "На секоја метеоролошка година ѝ се пресметува медијалното (p50) наводнување за сезоната, бидејќи "
        "Симулаторот го дава наводнувањето по сезона, а не по година.",
    "Rain-fed results are not affected.": "Резултатите без наводнување не се засегнати.",
    "Cover-crop cost": "Трошок за покровна култура",
    "Cereal rye costs {d} in every season of a rotation with a cover crop.":
        "‘Ржта чини {d} во секоја сезона на плодоред со покровна култура.",
    "Too close to call": "Премногу изедначено",
    "A grid cell names no winner when the top two rotations are within ${num}/ha a year.":
        "Полето во мрежата нема победник кога првите два плодореда се на помалку од ${num}/ha годишно еден од друг.",
    "Your rotation": "Вашиот плодоред",
    "No rotations were given, so {name} is taken as yours and compared with the other suggested rotations.":
        "Не се дадени плодореди, па {name} се зема како ваш и се споредува со другите предложени плодореди.",
    # Excluded rotations and errors (service.py, schemas.py)
    **_unpriced_lists(),
    "{crops} has no Iowa price and cost data.": f"За {{crops}} {_NO_DATA}.",
    "{crops} have no Iowa price and cost data.": f"За {{crops}} {_NO_DATA}.",
    "{name} includes {crops}, which has no Iowa price and cost data, so it can't be priced.":
        f"{{name}} вклучува {{crops}}, за што {_NO_DATA}, па не може да се пресмета.",
    "{name} includes {crops}, which have no Iowa price and cost data, so it can't be priced.":
        f"{{name}} вклучува {{crops}}, за кои {_NO_DATA}, па не може да се пресмета.",
    "{crops} has no Iowa price and cost data, so your own price can't be used.":
        f"За {{crops}} {_NO_DATA}, па вашата цена не може да се користи.",
    "{crops} have no Iowa price and cost data, so your own price can't be used.":
        f"За {{crops}} {_NO_DATA}, па вашите цени не може да се користат.",
    "{crops} has no Iowa price and cost data, so your own cost can't be used.":
        f"За {{crops}} {_NO_DATA}, па вашиот трошок не може да се користи.",
    "{crops} have no Iowa price and cost data, so your own cost can't be used.":
        f"За {{crops}} {_NO_DATA}, па вашите трошоци не може да се користат.",
    "{crops} has no Iowa price and cost data, so the price change can't be applied to it alone.":
        f"За {{crops}} {_NO_DATA}, па промената на цената не може да се примени само на неа.",
    "'{a}' and '{b}'": "'{a}' и '{b}'",  # unknown crop ids, quoted as sent (service._not_known)
    "{name} includes {crops}, which isn't a known crop.": "{name} вклучува {crops}, што не е позната култура.",
    "{name} includes {crops}, which aren't known crops.": "{name} вклучува {crops}, што не се познати култури.",
    "{crops} isn't a known crop, so your own price can't be used.":
        "{crops} не е позната култура, па вашата цена не може да се користи.",
    "{crops} aren't known crops, so your own price can't be used.":
        "{crops} не се познати култури, па вашите цени не може да се користат.",
    "{crops} isn't a known crop, so your own cost can't be used.":
        "{crops} не е позната култура, па вашиот трошок не може да се користи.",
    "{crops} aren't known crops, so your own cost can't be used.":
        "{crops} не се познати култури, па вашите трошоци не може да се користат.",
    "{crops} isn't a known crop, so the price change can't be applied to it alone.":
        "{crops} не е позната култура, па промената на цената не може да се примени само на неа.",
    "Value error, prices must be greater than 0 and at most {num} USD/t: {crops}":
        "Грешка во вредноста: цените мора да се поголеми од 0 и најмногу {num} USD/t: {crops}",
    "Value error, costs must be between 0 and {num} USD/ha: {crops}":
        "Грешка во вредноста: трошоците мора да се меѓу 0 и {num} USD/ha: {crops}",
}
