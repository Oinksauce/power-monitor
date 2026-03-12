import asyncio
import json
import logging
import sys
import os

# Add the backend dir to path to import mcp_client
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))
from app.mcp_client import ApplianceMCPClient

logging.basicConfig(level=logging.INFO)

API_KEY = "lpt_DAMaUbWjIZ1JjHAauQk6wDyRRhQBbxglxr005e1gRo"
SSE_URL = "https://lab.leapter.com/runtime/api/v1/f029ac21-992c-4047-871c-a032d21995cf/e358426a-27b3-4c90-921c-a74c364d095c/mcp/sse"

async def main():
    client = ApplianceMCPClient(API_KEY, SSE_URL)
    await client.initialize()
    
    # Load signatures (just load 2 for testing to avoid timeout)
    with open("docs/appliance_signatures.json", "r") as f:
        profiles = json.load(f)["appliance_signatures"][:2]
    
    # Mock interval points
    points = [
        {"timestamp": "2026-03-12T12:00:00", "kw": 0.2, "delta_kwh": 0.2/60},
        {"timestamp": "2026-03-12T12:01:00", "kw": 0.2, "delta_kwh": 0.2/60},
        {"timestamp": "2026-03-12T12:02:00", "kw": 1.5, "delta_kwh": 1.5/60}, # Toaster or microwave?
        {"timestamp": "2026-03-12T12:03:00", "kw": 1.5, "delta_kwh": 1.5/60},
        {"timestamp": "2026-03-12T12:04:00", "kw": 1.5, "delta_kwh": 1.5/60},
        {"timestamp": "2026-03-12T12:05:00", "kw": 0.2, "delta_kwh": 0.2/60},
    ]
    
    print("Calling analyze_usage...")
    result = await client.analyze_usage(points, profiles)
    
    print("\nResult:")
    print(json.dumps(result, indent=2))
    
    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
