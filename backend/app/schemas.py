from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class MeterSettingsOut(BaseModel):
    green_max_kw: Optional[float] = None
    yellow_max_kw: Optional[float] = None
    red_max_kw: Optional[float] = None

    class Config:
        from_attributes = True


class MeterOut(BaseModel):
    meter_id: str
    label: Optional[str]
    active: bool
    last_seen: Optional[datetime] = None
    current_estimated_kw: Optional[float] = None
    settings: Optional[MeterSettingsOut] = None

    class Config:
        from_attributes = True


class FilterIdsUpdate(BaseModel):
    meter_ids: List[str]


class MeterUpdate(BaseModel):
    label: Optional[str] = None
    active: Optional[bool] = None
    green_max_kw: Optional[float] = None
    yellow_max_kw: Optional[float] = None
    red_max_kw: Optional[float] = None


class UsagePoint(BaseModel):
    timestamp: datetime
    kwh: float
    kw: float


class UsageSeries(BaseModel):
    meter_id: str
    points: List[UsagePoint]


class UsageQuery(BaseModel):
    meters: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    resolution: str = "raw"


class LiveMetric(BaseModel):
    meter_id: str
    current_kw: float
    trailing_window_s: int
    updated_at: datetime

