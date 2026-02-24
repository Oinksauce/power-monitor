from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv
import os


load_dotenv()


class Settings(BaseModel):
    database_path: Path = Path(
        os.getenv("POWER_MONITOR_DB_PATH", "power_monitor.db")
    ).expanduser()
    sdr_device_index: int = int(os.getenv("POWER_MONITOR_SDR_DEVICE_INDEX", "0"))
    rtltcp_host: str = os.getenv("POWER_MONITOR_RTLTCP_HOST", "127.0.0.1")
    rtltcp_port: int = int(os.getenv("POWER_MONITOR_RTLTCP_PORT", "1234"))
    rtlamr_path: str = os.getenv("POWER_MONITOR_RTLAMR_PATH", "rtlamr")
    rtl_tcp_path: str = os.getenv("POWER_MONITOR_RTL_TCP_PATH", "rtl_tcp")
    gauge_window_seconds: int = int(os.getenv("POWER_MONITOR_GAUGE_WINDOW_SECONDS", "600"))


def get_settings() -> Settings:
    return Settings()

