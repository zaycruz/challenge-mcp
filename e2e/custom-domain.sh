#!/bin/sh
# Raw JSON-RPC check of the custom domain with curl. Usage: sh e2e/custom-domain.sh [ip]
# Pass an IP (dig +short @1.1.1.1 emerge-mcp.raava.dev) when this Mac's DNS cache still holds an old NXDOMAIN.
HOST=emerge-mcp.raava.dev
RES=""; [ -n "$1" ] && RES="--resolve $HOST:443:$1"
rpc() { curl -s $RES -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' "https://$HOST/mcp" -d "$1"; }
show() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).result;console.log($1)})"; }
echo "# $HOST check $(date -u +%FT%TZ)${1:+ (resolved to $1)}"
echo "## initialize"
rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' | show 'JSON.stringify({protocolVersion:r.protocolVersion,serverInfo:r.serverInfo})'
echo "## tools/list"
rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | show 'r.tools.length+" tools: "+r.tools.map(t=>t.name).join(", ")'
echo "## tools/call triage_today {limit:3}"
rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"triage_today","arguments":{"limit":3}}}' | show 'r.content[0].text'
echo "## GET /mcp (expect 405: stateless, no SSE stream)"
curl -s $RES -o /dev/null -w '%{http_code}\n' "https://$HOST/mcp"
