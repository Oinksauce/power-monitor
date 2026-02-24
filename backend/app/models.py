from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Meter(Base):
    __tablename__ = "meters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meter_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    readings: Mapped[list["RawReading"]] = relationship(back_populates="meter")


class RawReading(Base):
    __tablename__ = "raw_readings"
    __table_args__ = (
        UniqueConstraint("meter_id", "timestamp", "cumulative_raw", name="uq_reading"),
        Index("ix_raw_readings_meter_ts", "meter_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meter_id: Mapped[str] = mapped_column(
        String, ForeignKey("meters.meter_id"), index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    cumulative_raw: Mapped[int] = mapped_column(Integer)
    cumulative_kwh: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String, default="rtlamr")

    meter: Mapped[Meter] = relationship(back_populates="readings")


class MeterSettings(Base):
    __tablename__ = "meter_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meter_id: Mapped[str] = mapped_column(
        String, ForeignKey("meters.meter_id"), unique=True
    )
    green_max_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    yellow_max_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    red_max_kw: Mapped[float | None] = mapped_column(Float, nullable=True)


class Interval(Base):
    __tablename__ = "intervals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meter_id: Mapped[str] = mapped_column(
        String, ForeignKey("meters.meter_id"), index=True
    )
    start_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    delta_kwh: Mapped[float] = mapped_column(Float)
    avg_kw: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        Index("ix_intervals_meter_start", "meter_id", "start_ts"),
    )

