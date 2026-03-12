import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
import httpx
from httpx_sse import aconnect_sse

logger = logging.getLogger("power_monitor.mcp")

class ApplianceMCPClient:
    def __init__(self, api_key: str, sse_url: str):
        self.api_key = api_key
        self.sse_url = sse_url
        self.post_url: Optional[str] = None
        self._message_id = 1
        # Use http2 and infinite timeout for SSE to prevent premature closure
        timeout = httpx.Timeout(60.0, read=None)
        self._client = httpx.AsyncClient(timeout=timeout, http2=True)
        self._pending_requests: Dict[int, asyncio.Future] = {}
        self._sse_task: Optional[asyncio.Task] = None
        self.endpoint_future: Optional[asyncio.Future] = None

    async def initialize(self):
        """Connect to the SSE stream and perform the handshake."""
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "text/event-stream"
        }
        
        loop = asyncio.get_running_loop()
        self.endpoint_future = loop.create_future()
        
        self._sse_task = asyncio.create_task(self._consume_sse(headers))
        
        try:
            self.post_url = await asyncio.wait_for(self.endpoint_future, timeout=10.0)
            logger.info(f"Discovered MCP POST endpoint: {self.post_url}")
            await asyncio.sleep(1.0) # Wait for server to register session
        except asyncio.TimeoutError:
            raise RuntimeError("Timeout waiting for MCP POST endpoint from SSE")
            
        msg_id = self._get_next_id()
        init_future = loop.create_future()
        self._pending_requests[msg_id] = init_future
        
        init_req = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "power-monitor-backend", "version": "1.0.0"}
            }
        }
        await self._send_post(init_req)
        
        # Wait for initialize response
        try:
            await asyncio.wait_for(init_future, timeout=10.0)
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for initialize response via SSE")
            
        # Send notifications/initialized
        notify_req = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        await self._send_post(notify_req)
        logger.info("MCP Client initialized.")

    async def _consume_sse(self, headers: dict):
        try:
            async with aconnect_sse(self._client, "GET", self.sse_url, headers=headers) as event_source:
                async for sse in event_source.aiter_sse():
                    data = sse.data.strip()
                    if not data:
                        continue
                        
                    if not self.post_url:
                        if data.startswith("http"):
                            url = data
                        elif data.startswith("/"):
                            url = "https://lab.leapter.com" + data
                        else:
                            continue
                        
                        if not self.endpoint_future.done():
                            self.endpoint_future.set_result(url)
                    else:
                        try:
                            msg = json.loads(data)
                            logger.info(f"SSE Message received: {json.dumps(msg)}")
                            await self._handle_message(msg)
                        except json.JSONDecodeError:
                            logger.warning(f"Could not parse SSE JSON: {data}")
            logger.info("SSE Stream ended gracefully.")
        except asyncio.CancelledError:
            logger.info("SSE Task cancelled.")
        except Exception as e:
            logger.error(f"SSE Connection error: {e}")
            if self.endpoint_future and not self.endpoint_future.done():
                self.endpoint_future.set_exception(e)
        logger.warning("SSE Connection is CLOSED. Any future POST requests may return 404.")

    async def _handle_message(self, msg: dict):
        msg_id = msg.get("id")
        if msg_id is not None and msg_id in self._pending_requests:
            future = self._pending_requests.pop(msg_id)
            if not future.done():
                if "error" in msg:
                    future.set_exception(Exception(msg["error"]))
                else:
                    future.set_result(msg.get("result", {}))

    async def _send_post(self, payload: dict) -> httpx.Response:
        if not self.post_url:
            raise RuntimeError("MCP Client not initialized (missing POST URL)")
            
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
        
        for attempt in range(5):
            res = await self._client.post(self.post_url, headers=headers, json=payload)
            if res.status_code == 404 and "Session not found" in res.text:
                logger.warning(f"Session not found on POST (attempt {attempt+1}/5). Retrying in 1.5s...")
                await asyncio.sleep(1.5)
                continue
            res.raise_for_status()
            return res
            
        # If we exit the loop, try one last time and just raise
        res = await self._client.post(self.post_url, headers=headers, json=payload)
        res.raise_for_status()
        return res

    def _get_next_id(self) -> int:
        idx = self._message_id
        self._message_id += 1
        return idx

    async def analyze_usage(self, points: List[dict], profiles: List[dict]) -> Any:
        """Call the appliance_assignment_and_usage_analysis tool."""
        msg_id = self._get_next_id()
        
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending_requests[msg_id] = future
        
        payload = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": "tools/call",
            "params": {
                "name": "appliance_assignment_and_usage_analysis",
                "arguments": {
                    "grossPowerMeterData": points,
                    "applianceProfiles": profiles,
                    "userDefinedAppliances": [p.get("name", "Unknown") for p in profiles]
                }
            }
        }
        await self._send_post(payload)
        
        try:
            result = await asyncio.wait_for(future, timeout=60.0)
            
            # The result should be something like {"content": [{"text": "...", "type": "text"}]}
            if "content" in result:
                for item in result["content"]:
                    if getattr(item, 'get', lambda k: None)("type") == "text":
                        text = item["text"]
                        try:
                            # The tool returns JSON formatted string
                            return json.loads(text)
                        except json.JSONDecodeError:
                            if result.get("isError"):
                                logger.error(f"MCP Tool Error: {text}")
                            else:
                                logger.warning(f"Could not parse MCP tool response as JSON: {text}")
                            return text
            return result
        except asyncio.TimeoutError:
            logger.error("Timeout waiting for MCP tool response")
            return None
            
    async def close(self):
        if self._sse_task:
            self._sse_task.cancel()
        await self._client.aclose()
