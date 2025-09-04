#!/usr/bin/env python3
"""Simple synchronous test of the API"""

import requests
import json
import time

def test_api():
    base_url = "http://localhost:8000"
    
    # Test health
    print("1. Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   Error: {e}")
        return
    
    # Test discover
    print("\n2. Testing discover endpoint...")
    try:
        response = requests.post(
            f"{base_url}/api/tools/discover",
            json={"query": "screenshot", "limit": 5},
            timeout=5
        )
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Found {len(data.get('tools', []))} tools")
            if data.get('tools'):
                print(f"   First tool: {json.dumps(data['tools'][0], indent=2)}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test list servers
    print("\n3. Testing list servers...")
    try:
        response = requests.get(f"{base_url}/api/mcp/servers", timeout=5)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            servers = response.json()
            print(f"   Found {len(servers)} servers")
    except Exception as e:
        print(f"   Error: {e}")

if __name__ == "__main__":
    # Wait a moment for server to be ready
    print("Waiting for server to be ready...")
    time.sleep(2)
    
    test_api()