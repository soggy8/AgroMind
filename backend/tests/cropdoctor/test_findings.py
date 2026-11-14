from datetime import date

from app.modules.cropdoctor import anomalies, explanations, parameters, ports
from app.modules.cropdoctor.indicators import weather
from app.modules.cropdoctor.indicators.weather import WeatherValue

from .conftest import season

AS_OF = date(2012, 8, 12)


def wv(rain_diff=None, rain_below=None, tmax_diff=None):
    return {
        "rain_mm": WeatherValue("rain_mm", None, None, None, rain_diff, rain_below),
        "tmax_c": WeatherValue("tmax_c", None, None, None, tmax_diff, None),
        "et0_mm": WeatherValue("et0_mm", None, None, None, None, None),
    }


def _dry_run():
    return anomalies.score_season(season({185: 0.86, 201: 0.80, 209: 0.79}), 2012, AS_OF)


def test_no_run_means_no_finding():
    s = anomalies.score_season(season({201: 0.90, 209: 0.90}), 2012, AS_OF)
    assert explanations.find(s, wv(-60, 0, 5.0)) is None


def test_dry_weather_points_to_water_stress():
    f = explanations.find(_dry_run(), wv(-54, 1, 5.2))
    assert (f.severity, f.headline, f.since) == ("watch", "Possible water stress", date(2012, 7, 19))
    assert [e.id for e in f.explanations] == ["water_stress"]
    assert f.summary == "Greenness is 12% below this field's normal while rain ran 54% short and daily highs ran 5.2 °C above normal."
    assert f.caveat == "Satellites can't rule out pests or disease."


def test_a_sudden_fall_comes_first_and_can_sit_with_water_stress():
    s = anomalies.score_season(season({185: 0.90, 201: 0.70, 209: 0.69}), 2012, AS_OF)
    f = explanations.find(s, wv(-54, 1, 0.5))
    assert [e.id for e in f.explanations] == ["sudden_event", "water_stress"]
    assert f.headline == "Sudden drop in greenness" and f.severity == "alert"


def test_normal_weather_is_unexplained():
    f = explanations.find(_dry_run(), wv(5, 6, 0.2))
    assert [(e.id, e.text) for e in f.explanations] == [("unexplained", "The weather doesn't explain this.")]
    assert f.summary == "Greenness is 12% below this field's normal."


def test_hot_without_dry_uses_while():
    f = explanations.find(_dry_run(), wv(5, 6, 3.0))
    assert f.summary == "Greenness is 12% below this field's normal while daily highs ran 3.0 °C above normal."


def test_missing_weather_does_not_crash_or_blame_drought():
    assert [e.id for e in explanations.find(_dry_run(), wv()).explanations] == ["unexplained"]


def test_no_text_reads_as_a_diagnosis():
    s = anomalies.score_season(season({185: 0.90, 201: 0.70, 209: 0.69}), 2012, AS_OF)
    found = [explanations.find(_dry_run(), w) for w in (wv(-54, 1, 5.2), wv(5, 6, 0.2), wv())]
    found.append(explanations.find(s, wv(-54, 1, 0.5)))
    texts = []
    for f in found:
        texts += [f.headline, f.summary, f.caveat]
        for e in f.explanations:
            texts += [e.text, e.check]
    assert not any(w in t.lower() for t in texts for w in ("diagnos", "detected", "caused by", "confirmed"))


def test_real_finding_on_west_on_the_demo_date():
    w = weather.weather_values(ports.load_weather(), parameters.DEMO_AS_OF)
    s = anomalies.score_season(ports.load_greenness("west"), 2012, parameters.DEMO_AS_OF)
    f = explanations.find(s, w)
    assert (f.severity, f.headline, f.since, [e.id for e in f.explanations]) == (
        "watch", "Possible water stress", date(2012, 7, 11), ["water_stress"])
    creek = anomalies.score_season(ports.load_greenness("creek"), 2012, parameters.DEMO_AS_OF)
    assert explanations.find(creek, w) is None
