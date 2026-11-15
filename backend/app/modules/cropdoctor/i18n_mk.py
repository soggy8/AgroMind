"""Macedonian for CropDoctor's sentences (app/shared/i18n.py translates responses with it; main.py registers it).

Keys are the exact English the module writes; `{name}` placeholders match any text, which is translated too.
Findings keep the cautious wording rules in Macedonian: "можеби", never "откриено" or "потврдено".
"""

CATALOG: dict[str, str] = {
    # Findings (explanations.py)
    "Satellites can't rule out pests or disease.": "Сателитите не можат да исклучат штетници или болести.",
    "A sudden event such as a storm, hail or cutting may be one explanation.":
        "Можно објаснување е ненадеен настан, како невреме, град или косење.",
    "Walk the field and look for flattened, torn or cut plants.": "Прошетајте низ нивата и побарајте полегнати, искинати или исечени растенија.",
    "Water stress may be one explanation.": "Можно објаснување е недостиг на вода.",
    "Dig to 15 cm in a few places across the field and feel whether the soil is dry.":
        "Ископајте до 15 cm на неколку места низ нивата и проверете со рака дали почвата е сува.",
    "The weather doesn't explain this.": "Времето не го објаснува ова.",
    "Walk the field and look closely at leaves and roots; a local agronomist can tell pests, disease and nutrient problems apart.":
        "Прошетајте низ нивата и внимателно погледнете ги листовите и корените; локален агроном може да ги разликува штетниците, болестите и недостигот на хранливи материи.",
    "Sudden drop in greenness": "Ненадеен пад на зеленилото",
    "Possible water stress": "Можен недостиг на вода",
    "Greenness below normal": "Зеленило под нормалата",
    "Greenness is {a}% below this field's normal while rain ran {b}% short and daily highs ran {c} °C above normal.":
        "Зеленилото е {a}% под нормалата на нивата, додека дождот бил {b}% помалку, а дневните максимуми биле {c} °C над нормалата.",
    "Greenness is {a}% below this field's normal while rain ran {b}% short.":
        "Зеленилото е {a}% под нормалата на нивата, додека дождот бил {b}% помалку.",
    "Greenness is {a}% below this field's normal while daily highs ran {c} °C above normal.":
        "Зеленилото е {a}% под нормалата на нивата, додека дневните максимуми биле {c} °C над нормалата.",
    "Greenness is {a}% below this field's normal.": "Зеленилото е {a}% под нормалата на нивата.",
    # Field status and data notes (service.py)
    "Demo farm with sample data. Observed values come from NASA satellites and NASA POWER; Modelled values are estimates.":
        "Демо фарма со примерни податоци. Измерените вредности доаѓаат од сателитите на NASA и NASA POWER; моделираните вредности се проценки.",
    "Rain, daily highs and water demand come from NASA POWER weather for this farm's location. Greenness isn't available for this farm yet.":
        "Дождот, дневните максимуми и потребата од вода доаѓаат од времето на NASA POWER за локацијата на фармата. Зеленилото сè уште не е достапно за оваа фарма.",
    "Greenness isn't available for this farm yet.": "Зеленилото сè уште не е достапно за оваа фарма.",
    "Stress checks are paused: this field is not normally at full canopy at this time of year.":
        "Проверките за стрес се паузирани: оваа нива вообичаено не е во полн склоп во ова време од годината.",
    "Not enough earlier years to compare.": "Нема доволно претходни години за споредба.",
    "No satellite reading for this date.": "Нема сателитско мерење за овој датум.",
    "Couldn't reach NASA data. Showing saved data to {d}.": "Податоците од NASA не се достапни. Се прикажуваат зачуваните податоци до {d}.",
    "That date is in the future.": "Тој датум е во иднината.",
    # Indicators
    "Greenness (NDVI)": "Зеленило (NDVI)",
    "Rainfall, 30 days": "Врнежи, 30 дена",
    "Daily high, 30-day mean": "Дневен максимум, просек за 30 дена",
    "Water demand (ET0)": "Потреба од вода (ET0)",
    "{a} to {b} cm": "{a} до {b} cm",
    # Crop labels (USDA Cropland Data Layer class names)
    "Mixed: {a}, {b} and {c}": "Мешано: {a}, {b} и {c}",
    "Mixed: {a} and {b}": "Мешано: {a} и {b}",
    "Corn": "Пченка",
    "Soybeans": "Соја",
    "Grassland/Pasture": "Ливади/пасишта",
    "Herbaceous Wetlands": "Тревести мочуришта",
    "Alfalfa": "Луцерка",
    "Oats": "Овес",
    "Winter Wheat": "Озимна пченица",
    "Sunflower": "Сончоглед",
    "Fallow/Idle Cropland": "Угар",
    "Other Hay/Non Alfalfa": "Друго сено (без луцерка)",
    "Deciduous Forest": "Листопадна шума",
    "Developed/Open Space": "Изградено/отворен простор",
    "Developed/Low Intensity": "Изградено/ниска густина",
    # Assumptions (parameters.py): topics, text, source labels
    "Normal greenness": "Нормално зеленило",
    "Clear pixels": "Чисти пиксели",
    "Full canopy": "Полн склоп",
    "Lower than usual": "Пониско од вообичаеното",
    "Persistence": "Траење",
    "Alert": "Тревога",
    "Sudden fall": "Ненадеен пад",
    "Weather window": "Временски прозорец",
    "Dry": "Суво",
    "Hot": "Топло",
    "The normal is the average of the same period in the previous {a} years; at least {b} are needed.":
        "Нормалата е просекот на истиот период во претходните {a} години; потребни се најмалку {b}.",
    "Only MODIS pixels marked good or marginal count; each period is a {a}-day composite.":
        "Се сметаат само пикселите од MODIS означени како добри или гранични; секој период е композит од {a} дена.",
    "A drop is only read where the normal NDVI is at least {a}.": "Пад се чита само таму каде што нормалниот NDVI е најмалку {a}.",
    "At least {a}% below normal, with at most {b} earlier year(s) as low.": "Најмалку {a}% под нормалата, со најмногу {b} претходни години толку ниско.",
    "{a} clear periods in a row must be low before a finding is shown.": "{a} чисти периоди по ред мора да бидат ниски пред да се прикаже наод.",
    "A drop of {a}% or more below normal is an alert.": "Пад од {a}% или повеќе под нормалата е тревога.",
    "A fall of {a} NDVI or more in one period is called sudden.": "Пад од {a} NDVI или повеќе во еден период се смета за ненадеен.",
    "The last {a} days, ending at most {b} days before the date, with at most {c} days missing.":
        "Последните {a} дена, што завршуваат најмногу {b} дена пред датумот, со најмногу {c} дена без податоци.",
    "Rain in the window is lower than in all but {a} of the earlier years.": "Дождот во прозорецот е помал отколку во сите претходни години освен {a}.",
    "Mean daily maximum at least {a} C above the earlier years.": "Просечниот дневен максимум е најмалку {a} C над претходните години.",
    "Assumption": "Претпоставка",
    "Assumption; NASA POWER is released with a delay": "Претпоставка; NASA POWER се објавува со доцнење",
    "MODIS MOD13Q1/MYD13Q1 v061 product definition; thresholds are an assumption":
        "Дефиниција на производот MODIS MOD13Q1/MYD13Q1 v061; праговите се претпоставка",
    "FAO-56 Penman-Monteith from NASA POWER weather": "FAO-56 Penman-Monteith од времето на NASA POWER",
    # Errors the API returns
    "Unknown farm '{a}'": "Непозната фарма „{a}“",
    # Facts for the assistant (advisor.py)
    "Health check as of {d} (a replay of a past date).": "Проверка на здравјето на {d} (повторување на минат датум).",
    "Health check as of {d} (today).": "Проверка на здравјето на {d} (денес).",
    "Satellite greenness isn't available for this farm yet, so field status can't be judged from it.":
        "Сателитското зеленило сè уште не е достапно за оваа фарма, па состојбата на нивите не може да се процени од него.",
    "{label}: {v} ({a} to {b})": "{label}: {v} (од {a} до {b})",
    "{label}: no data ({s}).": "{label}: нема податоци ({s}).",
    "normal {v} (range {lo}-{hi} over {n} years)": "нормала {v} (опсег {lo}-{hi} во {n} години)",
    "normal {v} (range {lo}-{hi})": "нормала {v} (опсег {lo}-{hi})",
    "normal {v}": "нормала {v}",
    "{d} against normal.": "{d} во однос на нормалата.",
    "{d} against normal": "{d} во однос на нормалата",
    "{name}: {a} ha, status {s} ({note}).": "{name}: {a} ha, состојба: {s} ({note}).",
    "{name}: {a} ha, status {s}.": "{name}: {a} ha, состојба: {s}.",
    "normal": "нормално", "watch": "внимание", "alert": "тревога", "paused": "паузирано", "no data": "нема податоци",
    "Crop {label} in {y}, {k} ({s}).": "Култура: {label} во {y}, {k} ({s}).",
    "Crop {label}, {k} ({s}).": "Култура: {label}, {k} ({s}).",
    "Soil {k}: {parts} at {depth} ({rest_s}).": "Почва {k}: {parts} на {depth} ({rest_s}).",
    "Soil {k}: {parts} ({rest_s}).": "Почва {k}: {parts} ({rest_s}).",
    "sand {a}%, silt {b}%, clay {c}%, pH {d}": "песок {a}%, тиња {b}%, глина {c}%, pH {d}",
    "Finding for {f} ({sev}), since {d}: {h}.": "Наод за {f} ({sev}), од {d}: {h}.",
    "Suggested check: {c}": "Предложена проверка: {c}",
    "Findings: none.": "Наоди: нема.",
    "The rules in the assumptions only flag greenness that is lower than usual; no field met them.":
        "Правилата во претпоставките означуваат само зеленило пониско од вообичаеното; ниту една нива не ги исполни.",
    "Greenness above normal is not flagged.": "Зеленилото над нормалата не се означува.",
}
