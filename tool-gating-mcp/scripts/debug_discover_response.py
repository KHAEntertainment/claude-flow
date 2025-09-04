#!/usr/bin/env python3
"""Debug discover endpoint response"""

import asyncio
import httpx
import json

async def main():
    base_url = "http://localhost:8000"
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/api/tools/discover",
            json={"query": "screenshot", "limit": 5}
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")

asyncio.run(main())