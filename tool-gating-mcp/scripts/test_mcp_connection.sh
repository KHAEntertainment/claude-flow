#!/bin/bash
# Test MCP connection and debug issues

echo "🔍 Tool Gating MCP Connection Test"
echo "=================================="

# 1. Check if server is running
echo -e "\n1. Checking Tool Gating server..."
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo "✅ Server is running"
else
    echo "❌ Server is not running. Start with: tool-gating-mcp"
    exit 1
fi

# 2. Check MCP endpoint
echo -e "\n2. Checking MCP endpoint..."
response=$(curl -s -I http://localhost:8000/mcp)
if echo "$response" | grep -q "200\|text/event-stream"; then
    echo "✅ MCP endpoint is accessible"
    echo "$response" | head -3
else
    echo "❌ MCP endpoint not responding"
    echo "$response"
fi

# 3. Check if mcp-proxy is installed
echo -e "\n3. Checking mcp-proxy installation..."
if command -v mcp-proxy &> /dev/null; then
    echo "✅ mcp-proxy is installed at: $(which mcp-proxy)"
else
    echo "❌ mcp-proxy not found in PATH"
    echo "Install with: uv tool install mcp-proxy"
    
    # Check common locations
    echo -e "\nChecking common locations:"
    locations=(
        "$HOME/.local/bin/mcp-proxy"
        "$HOME/.cargo/bin/mcp-proxy"
        "/usr/local/bin/mcp-proxy"
        "$HOME/Library/Application Support/uv/bin/mcp-proxy"
    )
    
    for loc in "${locations[@]}"; do
        if [ -f "$loc" ]; then
            echo "Found at: $loc"
            echo "Add to PATH or use full path in Claude config"
        fi
    done
fi

# 4. Test SSE connection
echo -e "\n4. Testing SSE connection..."
echo "Connecting to http://localhost:8000/mcp for 3 seconds..."
timeout 3 curl -s -N http://localhost:8000/mcp | head -20

# 5. Show Claude Desktop config suggestion
echo -e "\n5. Claude Desktop Configuration"
echo "==============================="
echo "For Claude Desktop, use one of these configurations:"

echo -e "\nOption A: With mcp-proxy (if installed):"
cat << 'EOF'
{
  "mcpServers": {
    "tool-gating": {
      "command": "mcp-proxy",
      "args": ["http://localhost:8000/mcp"]
    }
  }
}
EOF

echo -e "\nOption B: Direct URL (if Claude supports SSE):"
cat << 'EOF'
{
  "mcpServers": {
    "tool-gating": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
EOF

echo -e "\nOption C: With full path to mcp-proxy:"
if [ -f "$HOME/.local/bin/mcp-proxy" ]; then
    cat << EOF
{
  "mcpServers": {
    "tool-gating": {
      "command": "$HOME/.local/bin/mcp-proxy",
      "args": ["http://localhost:8000/mcp"]
    }
  }
}
EOF
fi

echo -e "\n✅ Test complete!"