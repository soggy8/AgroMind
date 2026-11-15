"""Macedonian for the Simulator's sentences (app/shared/i18n.py translates responses with it; main.py registers it).

Keys are the exact English the module writes (ranking.py, service.py, parameters.py, scenarios.py, rotations.py,
engine/soil_*.py); `{name}` placeholders match any text, which is translated too (rotation names, sub-phrases).
A scenario stays a what-if in Macedonian too ("претпоставка", "сценарио"), never a forecast ("прогноза").
"""

_CROPS = {"Maize": "Пченка", "Soybean": "Соја", "Oats": "Овес", "Winter wheat": "Озимна пченица", "Sunflower": "Сончоглед"}
_TEXTURES = {"Sand": "Песок", "Loamy sand": "Иловест песок", "Sandy loam": "Песоклива иловица", "Loam": "Иловица",
             "Silt loam": "Тињеста иловица", "Silt": "Тиња", "Sandy clay loam": "Песоклива глинеста иловица",
             "Clay loam": "Глинеста иловица", "Silty clay loam": "Тињеста глинеста иловица", "Sandy clay": "Песоклива глина",
             "Silty clay": "Тињеста глина", "Clay": "Глина"}

CATALOG: dict[str, str] = {
    **_CROPS,
    **{en.lower(): mk.lower() for en, mk in _CROPS.items()},
    **_TEXTURES,
    "{t} (SoilGrids)": "{t} (SoilGrids)",
    "{t} (farmer)": "{t} (внесено од земјоделецот)",
    "cereal": "житна култура", "legume": "мешунка", "oilseed": "маслодајна култура",
    # Rotation names (rotations.py); "A → B" names are translated crop by crop.
    "Continuous {crop}": "{crop} во монокултура",
    # Headlines and reasons (ranking.py)
    "{name}: results for this scenario": "{name}: резултати за ова сценарио",
    "Too close to call between {a} and {b}": "Премногу изедначено меѓу {a} и {b}",
    "{name} fits your priorities best in this scenario": "{name} најдобро одговара на вашите приоритети во ова сценарио",
    "Its yield falls {n}% against today's climate, {cmp}": "Неговиот принос паѓа {n}% во однос на денешната клима, {cmp}",
    "using the same weather years without the scenario": "со истите метеоролошки години без сценариото",
    "about the same as the other options": "приближно исто како другите можности",
    "the largest drop of the options compared": "најголем пад од споредените можности",
    "against {n}% for {name}": "наспроти {n}% за {name}",
    "{reason}, against {v} for {name}": "{reason}, наспроти {v} за {name}",
    "Best soil index, {n}/100: {note}, including a legume, against {v} for {name}":
        "Најдобар индекс на почвата, {n}/100: {note}, вклучувајќи мешунка, наспроти {v} за {name}",
    "Best soil index, {n}/100: {note}, against {v} for {name}": "Најдобар индекс на почвата, {n}/100: {note}, наспроти {v} за {name}",
    "Highest yield, {n}% of typical, against {v} for {name}": "Најголем принос, {n}% од вообичаеното, наспроти {v} за {name}",
    "Fewest poor seasons (below 70% of typical yield), {n}%, against {v} for {name}":
        "Најмалку лоши сезони (под 70% од вообичаениот принос), {n}%, наспроти {v} за {name}",
    "Rain and stored soil water cover more of its water need, {n}%{irr}, against {v} for {name}":
        "Дождот и складираната вода во почвата покриваат поголем дел од потребата од вода, {n}%{irr}, наспроти {v} за {name}",
    "Rain and stored soil water cover more of its water need, {n}%, against {v} for {name}":
        "Дождот и складираната вода во почвата покриваат поголем дел од потребата од вода, {n}%, наспроти {v} за {name}",
    "Best margin after all costs including land rent, {m} per year, against {v} for {name}":
        "Најдобра маржа по сите трошоци, вклучувајќи закупнина, {m} годишно, наспроти {v} за {name}",
    "Highest yield, {n}% of typical": "Најголем принос, {n}% од вообичаеното",
    "Rain and stored soil water cover more of its water need, {n}%{irr}":
        "Дождот и складираната вода во почвата покриваат поголем дел од потребата од вода, {n}%{irr}",
    "Rain and stored soil water cover more of its water need, {n}%": "Дождот и складираната вода во почвата покриваат поголем дел од потребата од вода, {n}%",
    " (plus {w} a year of irrigation)": " (плус {w} годишно наводнување)",
    "Fewest poor seasons (below 70% of typical yield), {n}%": "Најмалку лоши сезони (под 70% од вообичаениот принос), {n}%",
    "Best soil index, {n}/100: {note}, including a legume": "Најдобар индекс на почвата, {n}/100: {note}, вклучувајќи мешунка",
    "Best soil index, {n}/100: {note}": "Најдобар индекс на почвата, {n}/100: {note}",
    "Best margin after all costs including land rent, {m} per year": "Најдобра маржа по сите трошоци, вклучувајќи закупнина, {m} годишно",
    "{name} does better on {label}: {a} against {b} {unit}": "{name} е подобар по {label}: {a} наспроти {b} {unit}",
    "yield": "принос", "water self-sufficiency": "самодоволност со вода", "low risk of poor seasons": "низок ризик од лоши сезони",
    "soil health": "здравје на почвата", "margin": "маржа",
    "of typical yield": "од вообичаениот принос", "of water need met without irrigation": "од потребата од вода покриена без наводнување",
    "of seasons poor": "од сезоните лоши", "out of 100": "од 100", "per ha per year": "по ha годишно", "per year": "годишно",
    # Soil index notes (engine/soil_health.py); the lower-case forms appear inside "Best soil index" reasons.
    "{a} different crops from {b} families: more diversity breaks pest and disease cycles":
        "{a} различни култури од {b} фамилии: поголемата разновидност ги прекинува циклусите на штетници и болести",
    "{a} different crops from 1 family: more diversity breaks pest and disease cycles":
        "{a} различни култури од 1 фамилија: поголемата разновидност ги прекинува циклусите на штетници и болести",
    "{a} different crops from {b} families": "{a} различни култури од {b} фамилии",
    "{a} different crops from 1 family": "{a} различни култури од 1 фамилија",
    "1 different crop from 1 family": "1 култура од 1 фамилија",
    "Crop residue returned: {a} of {b} points": "Вратени растителни остатоци: {a} од {b} поени",
    "A crop follows itself, which raises pest pressure and lowers yield": "Културата следи сама себе, што го зголемува притисокот од штетници и го намалува приносот",
    "Includes a legume, which fixes its own nitrogen": "Вклучува мешунка, која сама го врзува азотот",
    "No legume in the rotation": "Нема мешунка во плодоредот",
    "Cereal rye cover crop over winter: protects soil and holds nitrogen": "Ржта како покривна култура преку зимата: ја штити почвата и го задржува азотот",
    # Irrigation planner (service.py)
    "Even unlimited irrigation keeps {name} at only {n}% of typical yield in this scenario, below the {t} target: heat, not water, is the limit.":
        "Дури и неограничено наводнување го држи {name} на само {n}% од вообичаениот принос во ова сценарио, под целта од {t}: ограничувањето е топлината, не водата.",
    "{name} stays at or above {t} of typical yield without irrigation in this scenario.":
        "{name} останува на или над {t} од вообичаениот принос без наводнување во ова сценарио.",
    "{name} needs {cap} to stay at {t} of typical yield: about {w} a year on average, costing about {m} in pumping and energy.":
        "На {name} му треба {cap} за да остане на {t} од вообичаениот принос: во просек околу {w} годишно, со трошок од околу {m} за пумпање и енергија.",
    "unlimited irrigation": "неограничено наводнување",
    "up to {w} per season": "до {w} по сезона",
    # Notes (service.py, ports.py)
    "Demo farm with sample data: NASA POWER weather saved for this grid cell.": "Демо фарма со примерни податоци: времето од NASA POWER е зачувано за оваа ќелија од мрежата.",
    "Live NASA POWER weather for this location.": "Тековно време од NASA POWER за оваа локација.",
    "Scenario: NASA NEX-GDDP-CMIP6 {ssp}, {years}, median of {n} climate models, applied to observed 2001-2025 weather.":
        "Сценарио: NASA NEX-GDDP-CMIP6 {ssp}, {years}, медијана од {n} климатски модели, применета на измереното време 2001-2025.",
    "Model estimates, not forecasts: results show how each rotation responds to past weather shifted by the scenario.":
        "Проценки на моделот, не прогнози: резултатите покажуваат како секој плодоред реагира на минатото време поместено со сценариото.",
    "This location is outside the calibrated area, so results are uncalibrated.": "Оваа локација е надвор од калибрираната област, па резултатите не се калибрирани.",
    "Economics left out: {crops} have no cost data.": "Економијата е изоставена: {crops} немаат податоци за трошоци.",
    # Scenario presets and projections (scenarios.py, projections)
    "Today's climate": "Денешна клима",
    "Hotter and drier": "Потопло и посуво",
    "Severe heat and drought": "Силна топлина и суша",
    "Warmer and wetter": "Потопло и повлажно",
    "High emissions (SSP5-8.5)": "Високи емисии (SSP5-8.5)",
    "Middle of the road (SSP2-4.5)": "Среден пат (SSP2-4.5)",
    "Relative yield only, no economics": "Само релативен принос, без економија",
    "Calibrated against USDA NASS Story County maize yields, 2001-2025.": "Калибрирано според приносите на пченка во округот Стори од USDA NASS, 2001-2025.",
    "{source}, shifted by the scenario": "{source}, поместено со сценариото",
    # Assumptions (service.py): topics
    "Crop water use": "Потрошувачка на вода од културите",
    "Yield response to water": "Одговор на приносот на водата",
    "Heat in today's weather": "Топлина во денешното време",
    "Soil water": "Вода во почвата",
    "Effective water storage": "Ефективно складирање вода",
    "Weather": "Време",
    "Typical yield": "Вообичаен принос",
    "Response to warming": "Одговор на затоплување",
    "Climate projection": "Климатска проекција",
    "Scenario": "Сценарио",
    "Cover crop": "Покривна култура",
    "{crop} parameters": "Параметри за {crop}",
    "Prices and costs": "Цени и трошоци",
    "Irrigation": "Наводнување",
    # Assumptions: text
    "Crop water need = crop coefficient x reference evapotranspiration (Penman-Monteith), daily soil water balance.":
        "Потреба на културата од вода = коефициент на културата x референтна евапотранспирација (Penman-Monteith), дневен воден биланс на почвата.",
    "Yield falls with the seasonal shortfall of water use against need, scaled by a crop factor Ky.":
        "Приносот паѓа со сезонскиот недостиг на потрошена вода во однос на потребата, скалиран со факторот на културата Ky.",
    "Mid-season days above the crop's heat threshold cost {a}% yield per degree-day.":
        "Деновите во средината на сезоната над прагот на топлина на културата чинат {a}% принос по степен-ден.",
    "{soil}: {a} mm available water per metre of soil.": "{soil}: {a} mm достапна вода по метар почва.",
    "Rooting depths are scaled by {a} to stand in for subsoil water and the water table, so modelled yield variability matches observed county yields.":
        "Длабочините на корените се скалирани со {a} за да ги претстават водата во подпочвата и подземните води, па моделираната варијабилност на приносот одговара на измерените приноси во округот.",
    "Uncalibrated: FAO rooting depths, no subsoil or water-table water.": "Некалибрирано: длабочини на корените според FAO, без вода од подпочвата или подземните води.",
    "Every result is repeated over each historical start year; ranges are the 10th-90th percentile across those years. Parameter uncertainty is not included.":
        "Секој резултат се повторува за секоја историска почетна година; опсезите се 10-тиот до 90-тиот перцентил низ тие години. Несигурноста на параметрите не е вклучена.",
    "100% = the crop's average modelled yield under today's climate, rain-fed, after a different crop.":
        "100% = просечниот моделиран принос на културата во денешната клима, без наводнување, по друга култура.",
    "Each extra degree-day above the crop's threshold (29 C maize, 30 C others) that the scenario adds costs yield at a rate set so that +1 C reproduces the published US average: maize -10.3%, soybean -6.8%, wheat and oats -5.5% per C. This county's own history suggests a much smaller response; see the other setting.":
        "Секој дополнителен степен-ден над прагот на културата (29 C пченка, 30 C другите) што го додава сценариото чини принос со стапка поставена така што +1 C го дава објавениот просек за САД: пченка -10,3%, соја -6,8%, пченица и овес -5,5% по C. Сопствената историја на овој округ укажува на многу помал одговор; видете ја другата поставка.",
    "Uses only this county's 2001-2025 history, which shows a small response to heat (2012 lost about 12%). Published US averages are several times larger; see the other setting.":
        "Ја користи само историјата на овој округ од 2001-2025, која покажува мал одговор на топлина (2012 изгуби околу 12%). Објавените просеци за САД се неколку пати поголеми; видете ја другата поставка.",
    "{ssp}, {years}: each month's change in maximum and minimum temperature and percent change in rain, median of {n} climate models (growing season {t} C, range {lo} to {hi}; rain {r}%), added to observed 2001-2025 weather. Changes are relative to 1995-2014, so warming already in the observed record is counted slightly twice. Days stay as observed, so changes in heatwave or downpour frequency beyond the monthly shift are not captured.":
        "{ssp}, {years}: месечната промена на максималната и минималната температура и процентуалната промена на дождот, медијана од {n} климатски модели (вегетациска сезона {t} C, опсег {lo} до {hi}; дожд {r}%), додадена на измереното време 2001-2025. Промените се во однос на 1995-2014, па затоплувањето што веќе е во измерените податоци се брои малку двапати. Деновите остануваат како што се измерени, па промените во честотата на топлотни бранови или пороен дожд надвор од месечното поместување не се опфатени.",
    "Temperature is added to every day and rain is scaled on every wet day. Humidity, wind and sunshine stay as observed. Not a climate projection.":
        "Температурата се додава на секој ден, а дождот се скалира на секој врнежлив ден. Влажноста, ветерот и сончевината остануваат како што се измерени. Не е климатска проекција.",
    "Cereal rye from fall harvest to 14 days before spring planting. rye Kc 0.7 from mid-March to termination; Practical Farmers of Iowa / Iowa Learning Farms 10-year on-farm study: mostly no corn or soybean yield effect; Iowa State: terminate 10-14 days before corn. Modelled as a 2% maize penalty. $35/ac seed and seeding (an Iowa farm reports $26.71/ac after herbicide savings). +15 soil index points.":
        "'Рж од есенската жетва до 14 дена пред пролетното садење. 'Рж Kc 0,7 од средината на март до прекинувањето; десетгодишна студија на фарми на Practical Farmers of Iowa / Iowa Learning Farms: главно без ефект врз приносот на пченка или соја; Iowa State: да се прекине 10-14 дена пред пченката. Моделирано како казна од 2% за пченката. $35/акр за семе и сеење (една фарма во Ајова пријавува $26,71/акр по заштедата на хербициди). +15 поени индекс на почвата.",
    "2026/27 projected farm prices and 2026 Iowa cost budgets. {rest}": "Проектирани цени за 2026/27 и буџети на трошоци за Ајова 2026. {rest}",
    "$0.50 per mm per ha (about $5 per acre-inch) pumping and energy only; equipment ownership is not included. Iowa grain is rarely irrigated.":
        "$0,50 по mm по ha (околу $5 по акр-инч) само за пумпање и енергија; сопственоста на опремата не е вклучена. Житото во Ајова ретко се наводнува.",
    "ASSUME: $0.50 per mm per ha (about $5 per acre-inch) pumping and energy only; equipment ownership is not included. Iowa grain is rarely irrigated.":
        "ПРЕТПОСТАВКА: $0,50 по mm по ha (околу $5 по акр-инч) само за пумпање и енергија; сопственоста на опремата не е вклучена. Житото во Ајова ретко се наводнува.",
    "The field has no irrigation recorded; irrigation here is hypothetical.": "Нивата нема запишано наводнување; наводнувањето тука е хипотетичко.",
    "Averaged over all simulated years, including years between seasons.": "Просек низ сите симулирани години, вклучително и годините меѓу сезоните.",
    "Costs include cash rent and labour, so margin is the return to management.": "Трошоците вклучуваат закупнина и труд, па маржата е приходот за управувањето.",
    # Crop parameter assumptions: "key: ASSUME/PROXY: text" lists joined by "; "
    "heat tcrit c: {v}": "праг на топлина (C): {v}",
    "plant doy: {v}": "ден на садење: {v}",
    "monoculture factor: {v}": "фактор за монокултура: {v}",
    "warming: {v}": "затоплување: {v}",
    "ky: {v}": "ky: {v}",
    "ASSUME: {v}": "ПРЕТПОСТАВКА: {v}",
    "PROXY: {v}": "ЗАМЕНА: {v}",
    "ASSUME": "ПРЕТПОСТАВКА",
    "{a} C, a commonly used maize heat threshold": "{a} C, често користен праг на топлина за пченка",
    "{a} C, small grains are more heat sensitive than maize": "{a} C, ситните жита се почувствителни на топлина од пченката",
    "{a} C": "{a} C",
    "early May, typical for central Iowa": "почеток на мај, вообичаено за централна Ајова",
    "mid May, typical for central Iowa": "средина на мај, вообичаено за централна Ајова",
    "mid May": "средина на мај",
    "early April": "почеток на април",
    "early October": "почеток на октомври",
    "about 10% penalty for soybean after soybean": "околу 10% казна за соја по соја",
    "Zhao et al. (2017) USA soybean -6.8% per C": "Zhao et al. (2017) САД соја -6,8% по C",
    "Zhao et al. (2017) USA wheat -5.5 +/- 4.4% per C": "Zhao et al. (2017) САД пченица -5,5 +/- 4,4% по C",
    "30 C threshold assumed": "претпоставен праг од 30 C",
    "spring wheat value from FAO-56 Table 24 (oats not listed)": "вредност за пролетна пченица од FAO-56 Табела 24 (овесот не е наведен)",
    # Source labels (citations themselves stay as published)
    "AgroMind assumption": "Претпоставка на AgroMind",
    "Model definition": "Дефиниција на моделот",
    "Scenario definition": "Дефиниција на сценариото",
    "Scenario input": "Влез на сценариото",
    "Calibrated against USDA NASS Story County yields": "Калибрирано според приносите во округот Стори од USDA NASS",
    "Practical Farmers of Iowa; Iowa State University; AgroMind assumptions": "Practical Farmers of Iowa; Iowa State University; претпоставки на AgroMind",
    # Errors users can see
    "Unknown field '{a}' on farm '{b}'": "Непозната нива „{a}“ на фармата „{b}“",
    "Unknown run '{a}'": "Непозната симулација „{a}“",
    "No saved climate projection '{a}' for this location.": "Нема зачувана климатска проекција „{a}“ за оваа локација.",
    "'{a}' doesn't fit a single season into {b} year(s). Add years.": "„{a}“ не собира ниту една сезона во {b} години. Додајте години.",
    "Rotation ids must be unique.": "Ознаките на плодоредите мора да бидат единствени.",
    "Couldn't reach NASA POWER ({a}).": "NASA POWER не е достапен ({a}).",
    # Facts for the assistant (advisor.py)
    "Field: {name}, soil {soil}.": "Нива: {name}, почва {soil}.",
    "Simulated {n} years, repeated over {m} historical weather years ({r}).": "Симулирани {n} години, повторени низ {m} историски метеоролошки години ({r}).",
    "SCENARIO: temperature {t} C, rainfall {r}%, irrigation {i}.": "СЦЕНАРИО: температура {t} C, врнежи {r}%, наводнување {i}.",
    "SCENARIO: NASA NEX-GDDP-CMIP6 projection {ssp}, {years} (median of {n} climate models: growing season {t} C, models {lo} to {hi} C; rain {r}%), irrigation {i}.":
        "СЦЕНАРИО: проекција NASA NEX-GDDP-CMIP6 {ssp}, {years} (медијана од {n} климатски модели: вегетациска сезона {t} C, модели {lo} до {hi} C; дожд {r}%), наводнување {i}.",
    "limited (cap {c})": "ограничено (граница {c})", "limited": "ограничено", "full": "целосно",
    "{a} mm/season": "{a} mm/сезона",
    "Response to heat: published US average (Zhao et al. 2017).": "Одговор на топлина: објавен просек за САД (Zhao et al. 2017).",
    "Response to heat: this county's own 2001-2025 history (smaller than the US average).":
        "Одговор на топлина: сопствената историја на овој округ 2001-2025 (помал од просекот за САД).",
    "OBSERVED climate May-Sep: {r} mm rain, mean max temperature {t} C, {h} days at or above 35 C per year ({rest_s}).":
        "ИЗМЕРЕНА клима мај-сеп: {r} mm дожд, просечна макс. температура {t} C, {h} дена со 35 C или повеќе годишно ({rest_s}).",
    "SCENARIO climate May-Sep: {r} mm rain, mean max temperature {t} C, {h} hot days per year.":
        "Клима во СЦЕНАРИОТО мај-сеп: {r} mm дожд, просечна макс. температура {t} C, {h} топли дена годишно.",
    "MODELLED, rank {n}: {name}.": "МОДЕЛИРАНО, ранг {n}: {name}.",
    "{name} with a rye cover crop": "{name} со 'рж како покривна култура",
    "Yield {a} of typical (p10-p90 {b}), {c} against today's climate ({d} with the other heat-response setting).":
        "Принос {a} од вообичаеното (p10-p90 {b}), {c} во однос на денешната клима ({d} со другата поставка за одговор на топлина).",
    "Yield {a} of typical (p10-p90 {b}), {c} against today's climate.": "Принос {a} од вообичаеното (p10-p90 {b}), {c} во однос на денешната клима.",
    "Poor seasons {a}.": "Лоши сезони {a}.",
    "Water need met by rain and soil water {a}.": "Потреба од вода покриена со дожд и вода во почвата {a}.",
    "Irrigation {a} mm/year.": "Наводнување {a} mm/год.",
    "Soil index {a}/100.": "Индекс на почвата {a}/100.",
    "Margin {m}/ha/year after land rent.": "Маржа {m}/ha/год. по закупнината.",
    "Main limits: {a}.": "Главни ограничувања: {a}.",
    "Main limits: {a}, {b}.": "Главни ограничувања: {a}, {b}.",
    "Main limits: {a}, {b}, {c}.": "Главни ограничувања: {a}, {b}, {c}.",
    "heat": "топлина", "water": "вода", "rotation": "плодоред",
    "Recommendation: {rest}": "Препорака: {rest}",
    "Trade-offs: {rest}": "Компромиси: {rest}",
}
