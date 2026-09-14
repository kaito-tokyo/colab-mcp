# Colab MCP Bridge

Local MCP bridge for editing and running cells in a Google Colab notebook.
The MCP server uses Streamable HTTP on loopback and connects to the Colab
browser through an authenticated WebSocket.

## Installation

Requirements:

- Node.js 24 or newer
- A local Codex client with Streamable HTTP MCP support

Install the dependencies from the repository root:

```powershell
npm install
```

Create a token and store it as a user environment variable:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:COLAB_BRIDGE_TOKEN = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
[Environment]::SetEnvironmentVariable('COLAB_BRIDGE_TOKEN', $env:COLAB_BRIDGE_TOKEN, 'User')
```

Start the bridge:

```powershell
npm start
```

The default MCP endpoint is:

```text
http://127.0.0.1:62161/mcp
```

The HTTP port can be changed with `COLAB_BRIDGE_HTTP_PORT` or the command-line
option `--http-port`. The token can also be supplied with `--token`.

## Codex configuration

Register the endpoint with the same user environment variable:

```powershell
codex mcp add colab-mcp-bridge `
  --url http://127.0.0.1:62161/mcp `
  --bearer-token-env-var COLAB_BRIDGE_TOKEN
```

After connecting, call `open_colab_browser_connection` and open the returned
Colab URL. Then the notebook editing tools become available.

## Development

```powershell
npm run lint
npm test
```

The bridge listens only on loopback by default. Do not commit the bridge token.
