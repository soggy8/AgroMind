"""Macedonian for the Economics module's sentences (app/shared/i18n.py translates responses with it; main.py registers it).

Keys are the exact English the module writes (sentences.py, service.py, ports.py). `{name}` placeholders match any
text inside one sentence, which is translated too (rotation and crop names come from the Simulator's catalogue);
`{num*}` matches a number only. Money amounts like "$190/ha" pass through unchanged. Margins stay scenario margins
in Macedonian too ("сценарио"), never a forecast ("прогноза"). Sources stay as published.
"""

# Crop names inside the input labels ("Maize price" -> "Цена на пченка").
_CROPS = {"Maize": "пченка", "Soybean": "соја", "Oats": "овес"}

CATALOG: dict[str, str] = {
    # Notes (sentences.py)
    "Compare rotations rather than reading single numbers: the model's year-to-year skill is weak, so these are "
    "scenario margins, not forecasts.":
        "Споредувајте плодореди наместо да читате поединечни броеви: моделот слабо ги погодува разликите од година "
        "до година, па ова се маржи во сценарио, а не прогнози.",
    "This field is outside the area the yield model was calibrated for, so treat the money figures as rough.":
        "Оваа нива е надвор од подрачјето за кое е калибриран моделот за принос, па паричните бројки сметајте ги "
        "за груби.",
    "You own the land, so margin here is what's left to pay for the land and your management.":
        "Земјата е ваша, па маржата тука е она што останува за земјата и за вашето управување.",
    # Scenario labels
    "{num1} °C, {num2}% rain": "{num1} °C, {num2}% дожд",
    # Climate bill
    "In this scenario ({label}), {yours} earns about the same as in today's climate.":
        "Во ова сценарио ({label}), {yours} заработува приближно исто како во денешната клима.",
    "In this scenario ({label}), {yours} earns about {m} a year less than in today's climate.":
        "Во ова сценарио ({label}), {yours} заработува околу {m} годишно помалку отколку во денешната клима.",
    "In this scenario ({label}), {yours} earns about {m} a year more than in today's climate.":
        "Во ова сценарио ({label}), {yours} заработува околу {m} годишно повеќе отколку во денешната клима.",
    "None of the other rotations earns more in this scenario.":
        "Ниту еден од другите плодореди не заработува повеќе во ова сценарио.",
    "Switching to {alt} more than makes up for it.": "Преминот на {alt} повеќе од надоместува за тоа.",
    "Switching to {alt} wins back about {m} of that ({p}).": "Преминот на {alt} враќа околу {m} од тоа ({p}).",
    "Switching to {alt} wins back about {m} of that.": "Преминот на {alt} враќа околу {m} од тоа.",
    "{alt} would earn about {m} a year more still.": "{alt} би заработил уште околу {m} годишно повеќе.",
    # Bad-year money
    "{name} made money in every simulated season.": "{name} заработи во секоја симулирана сезона.",
    "{name} loses money in every simulated season; the worst season loses {m}.":
        "{name} губи пари во секоја симулирана сезона; најлошата сезона губи {m}.",
    "{name} loses money in nearly every simulated season; the worst season loses {m}.":
        "{name} губи пари во речиси секоја симулирана сезона; најлошата сезона губи {m}.",
    "{name} loses money in about {num} of every 10 seasons; the worst season loses {m}.":
        "{name} губи пари во околу {num} од секои 10 сезони; најлошата сезона губи {m}.",
    "Getting through the worst run of seasons takes about {m} in cash.":
        "За да се преживее најлошата низа сезони, потребни се околу {m} во готовина.",
    # Who earns most
    "In today's climate at today's prices, {y} and the next rotation are too close to call.":
        "Во денешната клима и со денешните цени, {y} и следниот плодоред се премногу изедначени.",
    "Even in today's climate at today's prices, {other} earns more than {y}.":
        "Дури и во денешната клима и со денешните цени, {other} заработува повеќе од {y}.",
    "{y} earns most everywhere on this grid.": "{y} заработува најмногу насекаде на оваа мрежа.",
    "{y} stops earning most between {a} °C and {b} °C at today's prices, or when prices fall between {c}% and {d}%.":
        "{y} престанува да заработува најмногу меѓу {a} °C и {b} °C со денешните цени, или кога цените ќе паднат "
        "меѓу {c}% и {d}%.",
    "{y} stops earning most between {a} °C and {b} °C at today's prices.":
        "{y} престанува да заработува најмногу меѓу {a} °C и {b} °C со денешните цени.",
    "In today's climate, {y} stops earning most when prices fall between {c}% and {d}%.":
        "Во денешната клима, {y} престанува да заработува најмногу кога цените ќе паднат меѓу {c}% и {d}%.",
    "{y} earns most at today's prices and climate; other rotations win elsewhere on the grid.":
        "{y} заработува најмногу со денешните цени и клима; други плодореди победуваат на други места на мрежата.",
    "the scenario's rain change": "промената на дождот во сценариото",
    "the projection's May-Sep median rain change": "медијаната на промената на дождот мај–сеп во проекцијата",
    # Numbers used (service.py)
    **{f"{en} price": f"Цена на {mk}" for en, mk in _CROPS.items()},
    **{f"{en} typical yield": f"Вообичаен принос на {mk}" for en, mk in _CROPS.items()},
    **{f"{en} cost before rent": f"Трошок за {mk} без закупнина" for en, mk in _CROPS.items()},
    "Maize cost before rent, after maize": "Трошок за пченка без закупнина, по пченка",
    "Cash rent": "Закупнина",
    "Irrigation": "Наводнување",
    "Rye cover crop": "Покровна култура ‘рж",
    "own land": "сопствена земја",
    "{v} per mm per ha": "{v} по mm по ha",
    # Assumptions
    "Oats cost": "Трошок за овес",
    "Iowa State publishes no grain-oat budget, so the oats cost is an estimate.":
        "Државниот универзитет на Ајова не објавува буџет за овес за зрно, па трошокот за овес е проценка.",
    "Irrigation cost": "Трошок за наводнување",
    "Pumping and energy per mm of water.": "Пумпање и енергија по mm вода.",
    "Irrigation per weather year": "Наводнување по метеоролошка година",
    "The Simulator reports each season's irrigation as a range, not per weather year, so every weather year is "
    "charged the season's typical (median) irrigation.":
        "Симулаторот го дава наводнувањето за секоја сезона како опсег, а не по метеоролошка година, па на секоја "
        "година ѝ се наплаќа вообичаеното (медијалното) наводнување за сезоната.",
    "Cover crop cost": "Трошок за покровна култура",
    "Rye seed and seeding, charged every priced season.": "Семе и сеидба на ‘рж, наплатени во секоја пресметана сезона.",
    "Too close to call": "Премногу изедначено",
    "Two rotations within ${num}/ha a year of each other count as a near tie, with no winner.":
        "Два плодореди на помалку од ${num}/ha годишно еден од друг се сметаат за речиси изедначени, без победник.",
    "Your rotation": "Вашиот плодоред",
    "No rotations were given, so {name} is taken as yours.": "Не се дадени плодореди, па {name} се зема како ваш.",
    # Excluded rotations and errors
    "{crops} has no Iowa price and cost data.": "За {crops} нема податоци за цени и трошоци во Ајова.",
    "{crops} have no Iowa price and cost data.": "За {crops} нема податоци за цени и трошоци во Ајова.",
    "{name} includes {crops}, which has no Iowa price and cost data, so it can't be priced.":
        "{name} вклучува {crops}, за што нема податоци за цени и трошоци во Ајова, па не може да се пресмета.",
    "{name} includes {crops}, which have no Iowa price and cost data, so it can't be priced.":
        "{name} вклучува {crops}, за што нема податоци за цени и трошоци во Ајова, па не може да се пресмета.",
    "There's no price data for {crop}, so its price can't be changed.":
        "Нема податоци за цената на {crop}, па таа не може да се промени.",
    "There's no Iowa price and cost data for {crops}, so your numbers for it can't be used.":
        "Нема податоци за цени и трошоци во Ајова за {crops}, па вашите броеви за тоа не може да се користат.",
    "Priced crops: {list}.": "Пресметани култури: {list}.",
    "{a} and {b} have no Iowa price and cost data.": "За {a} и {b} нема податоци за цени и трошоци во Ајова.",
    "{name} includes {a} and {b}, which have no Iowa price and cost data, so it can't be priced.":
        "{name} вклучува {a} и {b}, за кои нема податоци за цени и трошоци во Ајова, па не може да се пресмета.",
    "maize, soybean and oats": "пченка, соја и овес",
}
