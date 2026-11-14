"""CropDoctor thresholds. Every value is an ASSUMPTION (no published source sets it for this
farm); each carries a one-line reason. Change one only with a reason recorded in the spec.
Nothing here is tuned to make the demo look good."""
from __future__ import annotations

from datetime import date

NORMAL_YEARS = 10             # ASSUME: a decade is long enough to smooth single odd years
MIN_NORMAL_YEARS = 7          # ASSUME: fewer earlier years than this is too thin to call a normal
PERIOD_DAYS = 16              # MODIS MOD13Q1/MYD13Q1 composite length (product definition)
GOOD_RELIABILITY = (0, 1)     # MODIS pixel reliability: 0 good, 1 marginal; 2 snow/ice, 3 cloudy are skipped
CANOPY_MIN_NORMAL_NDVI = 0.75  # ASSUME: below this the normal is not a full canopy, so a drop is not read
LOW_MIN_DROP_PCT = 5.0        # ASSUME: smaller gaps are within ordinary field-to-field noise
LOW_MAX_YEARS_BELOW = 1       # ASSUME: at most one earlier year may be this low for it to count as unusual
RUN_LENGTH = 2                # ASSUME: two clear periods in a row rule out one bad composite
ALERT_DROP_PCT = 20.0         # ASSUME: a fifth below normal is large enough to raise an alert
SUDDEN_FALL_NDVI = 0.15       # ASSUME: a one-period fall this big is faster than crops normally change
WEATHER_WINDOW_DAYS = 30      # ASSUME: a month of weather is what a canopy change usually reflects
MAX_WEATHER_LAG_DAYS = 7      # ASSUME: a window may end this many days before as_of (POWER latency)
MAX_MISSING_DAYS = 3          # ASSUME: days in a window allowed to lack a value
DRY_MAX_YEARS_DRIER = 1       # ASSUME: at most one earlier year may be drier for this to count as dry
HOT_MIN_DELTA_C = 2.0         # ASSUME: two degrees warmer than the same window in earlier years
DEMO_AS_OF = date(2012, 8, 12)  # the demo date: the 2012 drought, in the committed samples

ASSUMPTIONS: list[tuple[str, str, str]] = [
    ("Normal greenness",
     f"The normal is the average of the same period in the previous {NORMAL_YEARS} years; at least "
     f"{MIN_NORMAL_YEARS} are needed.", "Assumption"),
    ("Clear pixels",
     f"Only MODIS pixels marked good or marginal count; each period is a {PERIOD_DAYS}-day composite.",
     "MODIS MOD13Q1/MYD13Q1 v061 product definition; thresholds are an assumption"),
    ("Full canopy",
     f"A drop is only read where the normal NDVI is at least {CANOPY_MIN_NORMAL_NDVI}.", "Assumption"),
    ("Lower than usual",
     f"At least {LOW_MIN_DROP_PCT:g}% below normal, with at most {LOW_MAX_YEARS_BELOW} earlier "
     f"year(s) as low.", "Assumption"),
    ("Persistence", f"{RUN_LENGTH} clear periods in a row must be low before a finding is shown.", "Assumption"),
    ("Alert", f"A drop of {ALERT_DROP_PCT:g}% or more below normal is an alert.", "Assumption"),
    ("Sudden fall", f"A fall of {SUDDEN_FALL_NDVI} NDVI or more in one period is called sudden.", "Assumption"),
    ("Weather window",
     f"The last {WEATHER_WINDOW_DAYS} days, ending at most {MAX_WEATHER_LAG_DAYS} days before the date, "
     f"with at most {MAX_MISSING_DAYS} days missing.", "Assumption; NASA POWER is released with a delay"),
    ("Dry",
     f"Rain in the window is lower than in all but {DRY_MAX_YEARS_DRIER} of the earlier years.", "Assumption"),
    ("Hot", f"Mean daily maximum at least {HOT_MIN_DELTA_C:g} C above the earlier years.", "Assumption"),
]
