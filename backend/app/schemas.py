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
    collecting: bool = False
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
    collecting: Optional[bool] = None
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


class BillingRateBase(BaseModel):
    meter_id: str
    rate_name: str
    rate_per_kwh: float
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class BillingRateCreate(BillingRateBase):
    pass


class BillingRateOut(BillingRateBase):
    id: int

    class Config:
        from_attributes = True


class PowerBillBase(BaseModel):
    meter_id: str
    start_date: datetime
    end_date: datetime
    total_kwh: float
    total_cost: float
    document_path: Optional[str] = None


class PowerBillCreate(PowerBillBase):
    pass


class PowerBillOut(PowerBillBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class EventLogBase(BaseModel):
    meter_id: str
    start_ts: datetime
    end_ts: datetime
    avg_kw: float
    kwh: float
    identified_appliance: str
    user_label: Optional[str] = None
    status: str = "unverified"


class EventLogOut(EventLogBase):
    id: int

    class Config:
        from_attributes = True


class EventFeedbackUpdate(BaseModel):
    user_label: Optional[str] = None
    status: str  # confirmed, corrected, ignored
