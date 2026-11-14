import numpy as np
import pytest

from app.modules.simulator.engine import crop_models, et0 as et0_mod, runner, soil_water, water_balance
from app.modules.simulator.parameters import CROPS


def test_sample_climate_shape(climate):
    assert climate.years[0] == 2001 and climate.years[-1] == 2025
    assert climate.tmax_c.shape == (25, 365)
    assert climate.filled_values == 0


def test_et0_growing_season_total_in_expected_range(et0):
    # May-Sep Penman-Monteith ET0 for central Iowa; Hargreaves gives about 708 mm on the same data.
    total = et0[:, 120:273].sum(axis=1).mean()
    assert 640 <= total <= 670


def test_extraterrestrial_radiation_fao_example_8():
    # FAO-56 Example 8: 20 deg S, 3 September (doy 246) -> Ra = 32.2 MJ/m2/day
    assert et0_mod.extraterrestrial_radiation(-20.0, 246) == pytest.approx(32.2, abs=0.1)


def test_penman_monteith_fao_example_18():
    # FAO-56 Example 18 (Brussels, 6 July): Tmax 21.5, Tmin 12.3, u2 2.078, Rs 22.07, ea 1.409 kPa.
    # ET0 = 3.9 mm/day. Our function takes mean RH, so derive it from ea / es.
    es = (0.6108 * np.exp(17.27 * 21.5 / (21.5 + 237.3)) + 0.6108 * np.exp(17.27 * 12.3 / (12.3 + 237.3))) / 2
    rh = 1.409 / es * 100
    et0 = et0_mod.penman_monteith(21.5, 12.3, 22.07, rh, 2.078, 187, 50.80, 100)
    assert float(et0) == pytest.approx(3.9, abs=0.15)


def test_kc_curve_hits_table_values_at_stage_boundaries():
    maize = CROPS["maize"]
    ini, dev, mid, late = maize.stages
    kc = crop_models.kc_on_day(maize, [0, ini, ini + dev, ini + dev + mid - 1, maize.season_days - 1])
    assert kc[0] == pytest.approx(maize.kc[0])
    assert kc[1] == pytest.approx(maize.kc[0])
    assert kc[2] == pytest.approx(maize.kc[1])
    assert kc[3] == pytest.approx(maize.kc[1])
    assert kc[4] == pytest.approx(maize.kc[2], abs=0.03)


def test_ks_reproduces_fao_example_37():
    # TAW 160 mm, p 0.40, Dr 83.4 mm -> Ks = 0.80
    assert float(water_balance.stress_coefficient(83.4, 160.0, 0.40)) == pytest.approx(0.80, abs=0.005)


def test_ks_is_one_until_raw():
    assert float(water_balance.stress_coefficient(60.0, 160.0, 0.40)) == 1.0


def test_water_factor_follows_fao_eq_90():
    maize = CROPS["maize"]
    assert float(crop_models.water_factor(maize, 400, 500)) == pytest.approx(1 - 1.25 * 0.2)
    assert float(crop_models.water_factor(maize, 0, 500)) == 0.0


def test_saxton_rawls_loam_is_plausible():
    fc, wp = soil_water.saxton_rawls(0.40, 0.20, 2.5)
    assert 0.25 < fc < 0.30 and 0.11 < wp < 0.15


def test_texture_class():
    assert soil_water.texture_class(32, 34) == "clay_loam"
    assert soil_water.texture_class(40, 20) == "loam"
    assert soil_water.texture_class(20, 15) == "silt_loam"
    assert soil_water.texture_class(10, 10) == "silt"
    assert soil_water.texture_class(90, 3) == "sand"


def _maize(climate, et0, soil, **kw):
    return runner.run(soil, runner.single_season("maize", "soybean"), climate, et0, years=1, **kw)


def test_more_rain_never_lowers_water_factor(climate, et0, soil):
    dry = _maize(climate, et0, soil)
    wet_climate = climate.with_arrays(rain_mm=climate.rain_mm * 1.2)
    wet = _maize(wet_climate, et0, soil)
    assert np.all(wet.water_factor >= dry.water_factor - 1e-12)


def test_full_irrigation_removes_water_stress(climate, et0, soil):
    o = _maize(climate, et0, soil, irrigation="full")
    assert np.allclose(o.water_factor, 1.0)
    assert o.irrigation_mm.mean() > 0


def test_limited_irrigation_respects_cap(climate, et0, soil):
    o = _maize(climate, et0, soil, irrigation="limited", irrigation_cap_mm=50)
    assert o.irrigation_mm.max() <= 50 + 1e-9


def test_2012_is_the_worst_maize_year(climate, et0, soil):
    o = _maize(climate, et0, soil, root_depth_scale=2.6)
    worst = climate.years[int(np.argmin(o.water_factor[0] * o.heat_factor[0]))]
    assert worst == 2012


def test_heat_factor_is_capped():
    assert float(crop_models.heat_factor(10_000)) == pytest.approx(0.60)
    assert float(crop_models.heat_factor(0)) == 1.0


def test_typical_factor_normalises_to_one(climate, et0, soil):
    typical = runner.typical_factors(soil, climate, et0, ["maize"], root_depth_scale=2.6)
    o = runner.run(soil, runner.single_season("maize"), climate, et0, years=1, typical_factor=typical,
                   root_depth_scale=2.6)
    assert o.relative_yield.mean() == pytest.approx(1.0, abs=1e-9)
