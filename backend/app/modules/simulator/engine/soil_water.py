"""Soil water holding properties: FAO-56 texture table or a pedotransfer function."""
from __future__ import annotations

from ..parameters import PEDOTRANSFER_SOURCE, SOIL_TABLE_SOURCE, SOILS
from .types import SoilProfile

# USDA texture triangle, enough classes to label SoilGrids results.
_TEXTURE_LABELS = {
    "sand": "Sand", "loamy_sand": "Loamy sand", "sandy_loam": "Sandy loam", "loam": "Loam",
    "silt_loam": "Silt loam", "silt": "Silt", "sandy_clay_loam": "Sandy clay loam",
    "clay_loam": "Clay loam", "silty_clay_loam": "Silty clay loam", "sandy_clay": "Sandy clay",
    "silty_clay": "Silty clay", "clay": "Clay",
}


def texture_class(sand_pct: float, clay_pct: float) -> str:
    """USDA soil texture class from sand and clay percentages."""
    silt = 100 - sand_pct - clay_pct
    if silt + 1.5 * clay_pct < 15:
        return "sand"
    if silt + 2 * clay_pct < 30:
        return "loamy_sand"
    if clay_pct >= 40:
        if sand_pct > 45:
            return "sandy_clay"
        if silt >= 40:
            return "silty_clay"
        return "clay"
    if clay_pct >= 35 and sand_pct > 45:
        return "sandy_clay"
    if clay_pct >= 27:
        if sand_pct <= 20:
            return "silty_clay_loam"
        if sand_pct <= 45:
            return "clay_loam"
        return "sandy_clay_loam"
    if clay_pct >= 20 and sand_pct > 45 and silt < 28:
        return "sandy_clay_loam"
    if silt >= 80 and clay_pct < 12:
        return "silt"
    if silt >= 50:
        return "silt_loam"
    if clay_pct >= 7 and silt >= 28 and sand_pct <= 52:
        return "loam"
    return "sandy_loam"


def texture_label(texture: str) -> str:
    return _TEXTURE_LABELS.get(texture, texture.replace("_", " ").capitalize())


def saxton_rawls(sand_frac: float, clay_frac: float, om_pct: float) -> tuple[float, float]:
    """Field capacity (33 kPa) and wilting point (1500 kPa), m3/m3. Saxton & Rawls (2006), Eq. 1-2.

    Valid for organic matter up to 8% and clay up to 60%.
    """
    s, c, om = sand_frac, clay_frac, min(max(om_pct, 0.0), 8.0)
    t1500 = -0.024 * s + 0.487 * c + 0.006 * om + 0.005 * s * om - 0.013 * c * om + 0.068 * s * c + 0.031
    wp = t1500 + (0.14 * t1500 - 0.02)
    t33 = -0.251 * s + 0.195 * c + 0.011 * om + 0.006 * s * om - 0.027 * c * om + 0.452 * s * c + 0.299
    fc = t33 + (1.283 * t33 ** 2 - 0.374 * t33 - 0.015)
    return fc, wp


def from_texture(texture: str) -> SoilProfile:
    soil = SOILS[texture]
    return SoilProfile(soil.theta_fc, soil.theta_wp, texture_label(texture), SOIL_TABLE_SOURCE)


def from_composition(sand_pct: float, clay_pct: float, soc_g_kg: float, origin: str) -> SoilProfile:
    """Soil profile from measured or mapped composition (e.g. SoilGrids)."""
    om_pct = soc_g_kg / 10 * 1.724  # van Bemmelen factor, organic carbon -> organic matter
    fc, wp = saxton_rawls(sand_pct / 100, clay_pct / 100, om_pct)
    texture = texture_class(sand_pct, clay_pct)
    return SoilProfile(fc, wp, f"{texture_label(texture)} ({origin})", f"{origin}; {PEDOTRANSFER_SOURCE}")
