"""Macedonian for CropTwin's messages (app/shared/i18n.py translates responses with it; main.py registers it).

CropTwin returns mostly the farmer's own data, which is never translated. Stored values such as a soil layer's
source ("Farmer-provided") stay as stored: the frontend compares and saves them back.
"""

CATALOG: dict[str, str] = {
    "Unknown farm '{a}'": "Непозната фарма „{a}“",
    "Unknown field '{a}' on farm '{b}'": "Непозната нива „{a}“ на фармата „{b}“",
    "Unknown crop history entry '{a}'": "Непознат запис во историјата на култури „{a}“",
    "This boundary overlaps {names}. Adjust it so fields don't share area.": "Оваа граница се преклопува со {names}. Прилагодете ја за нивите да не делат површина.",
    "Boundary must be a GeoJSON Polygon.": "Границата мора да биде GeoJSON полигон.",
    "Boundary needs at least three distinct points.": "Границата мора да има најмалку три различни точки.",
    "Coordinates must be [longitude, latitude] in degrees.": "Координатите мора да бидат [географска должина, ширина] во степени.",
    "Boundary edges cross each other. Redraw it so the outline doesn't loop over itself.": "Рабовите на границата се сечат. Нацртајте ја повторно за контурата да не се преклопува сама со себе.",
    "Boundary has zero area.": "Границата нема површина.",
    "Couldn't reach NASA POWER ({a}).": "NASA POWER не е достапен ({a}).",
    "NASA POWER answered {a}.": "NASA POWER одговори {a}.",
    "Couldn't reach the place search ({a}).": "Пребарувањето места не е достапно ({a}).",
    "The place search is busy. Wait a few seconds and try again.": "Пребарувањето места е зафатено. Почекајте неколку секунди и обидете се повторно.",
    "The place search answered {a}.": "Пребарувањето места одговори {a}.",
    "Live SoilGrids isn't connected yet, and the saved sample only covers fields within {a} km of {b} N, {c} W (Story County, Iowa); this field is {d} km away. Enter soil values from a lab report instead.":
        "Живото поврзување со SoilGrids сè уште не е поставено, а зачуваниот примерок покрива само ниви во радиус од {a} km од {b} N, {c} W (округ Стори, Ајова); оваа нива е оддалечена {d} km. Наместо тоа, внесете вредности за почвата од лабораториски извештај.",
    # NASA POWER parameter names and units (weather_source.py passes POWER's own wording on)
    "Precipitation Corrected": "Врнежи (коригирани)",
    "Temperature at 2 Meters Maximum": "Максимална температура на 2 m",
    "Temperature at 2 Meters Minimum": "Минимална температура на 2 m",
    "All Sky Surface Shortwave Downward Irradiance": "Сончево зрачење на површината",
    "MJ/m^2/day": "MJ/m²/ден", "MJ/m²/day": "MJ/m²/ден", "mm/day": "mm/ден",
    "{a} Try again in a moment, or type coordinates such as 42.03, -93.46.": "{a} Обидете се повторно за момент или впишете координати, на пример 42.03, -93.46.",
    # Facts for the assistant (advisor.py)
    "{n} fields, {a} ha in total.": "{n} ниви, вкупно {a} ha.",
    "1 field, {a} ha in total.": "1 нива, вкупно {a} ha.",
    "0 fields.": "0 ниви.",
    "Farmer's priorities for ranking options (weights): yield {a}, water {b}, risk {c}, soil {d}, margin {e}.":
        "Приоритети на земјоделецот за рангирање (тежини): принос {a}, вода {b}, ризик {c}, почва {d}, маржа {e}.",
    "Farmer's constraints: {rest}": "Ограничувања на земјоделецот: {rest}",
    "{name}: {a} ha ({k}, computed from the drawn boundary), centre {lat}, {lon}.":
        "{name}: {a} ha ({k}, пресметано од нацртаната граница), центар {lat}, {lon}.",
    "{name}: {a} ha ({k}, stated by the farmer), centre {lat}, {lon}.":
        "{name}: {a} ha ({k}, внесено од земјоделецот), центар {lat}, {lon}.",
    "Current crop: {c}.": "Тековна култура: {c}.",
    "Irrigation available.": "Има наводнување.",
    "Irrigation not available.": "Нема наводнување.",
    "Soil texture class: {t}.": "Класа на текстура на почвата: {t}.",
    "{name} soil layers: {rest}.": "Слоеви на почвата на {name}: {rest}.",
    "{a}-{b} cm {k}: {vals} ({rest_s})": "{a}-{b} cm {k}: {vals} ({rest_s})",
    "sand {a}%, silt {b}%, clay {c}%, organic carbon {d} g/kg, pH {e}": "песок {a}%, тиња {b}%, глина {c}%, органски јаглерод {d} g/kg, pH {e}",
    "{name} has no soil layers recorded.": "{name} нема запишани слоеви на почвата.",
    "{name} has no crop history recorded.": "{name} нема запишана историја на култури.",
    "{name} crop history: {rest}.": "Историја на култури на {name}: {rest}.",
    "{year} {crop}, yield {v} OBSERVED ({s})": "{year} {crop}, принос {v} ИЗМЕРЕНО ({s})",
    "{year} {crop}": "{year} {crop}",
    "sand": "песок", "loamy sand": "иловест песок", "sandy loam": "песоклива иловица", "loam": "иловица",
    "silt loam": "тињеста иловица", "silt": "тиња", "silty clay loam": "тињеста глинеста иловица",
    "silty clay": "тињеста глина", "clay": "глина",
}
