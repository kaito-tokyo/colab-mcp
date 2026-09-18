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

Create a bearer token and store its raw value as the `COLAB_MCP_BEARER_TOKEN` user environment variable:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:COLAB_MCP_BEARER_TOKEN = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
[Environment]::SetEnvironmentVariable('COLAB_MCP_BEARER_TOKEN', $env:COLAB_MCP_BEARER_TOKEN, 'User')
```

Start the bridge:

```powershell
npm start
```

The default MCP endpoint is:

```text
http://127.0.0.1:62161/mcp
```

On startup, the server also prints the current Colab connection URL and its
`tokenForColabConnection` fragment. The latter contains the separately
generated `mcpProxyToken`; it is not the `COLAB_MCP_BEARER_TOKEN`.

The HTTP port can be changed with `COLAB_BRIDGE_HTTP_PORT` or the command-line
option `--http-port`. The bearer token is intentionally not accepted as a
command-line argument; it must come from `COLAB_MCP_BEARER_TOKEN`.

## Token roles

The bridge uses two separate tokens:

- `COLAB_MCP_BEARER_TOKEN` authenticates Codex requests to the local MCP HTTP
  endpoint. It is mandatory and is read from the process environment at
  startup.
- `mcpProxyToken` authenticates the browser's WebSocket connection from Colab
  to the bridge. It is generated randomly for each bridge process and is never
  used as the Codex Bearer token.

When `open_colab_browser_connection` is called, the bridge returns a Colab URL
whose fragment is assembled as `tokenForColabConnection`:

```text
<generated-token>&<websocket-port>

For example: `9-8pi2Alaxxxxxx&55760`. Enter this value directly in the Colab
Web UI's connection field.
```

If `COLAB_MCP_BEARER_TOKEN` is missing, startup fails with an error that shows
the PowerShell command needed to create and persist the environment variable.

## Codex configuration

Register the endpoint with the same user environment variable:

```powershell
codex mcp add colab-mcp-bridge `
  --url http://127.0.0.1:62161/mcp `
  --bearer-token-env-var COLAB_MCP_BEARER_TOKEN
```

After connecting, call `open_colab_browser_connection` and open the returned
Colab URL. Then the notebook editing tools become available.

## Development

```powershell
npm run lint
npm test
```

The bridge listens only on loopback by default. Do not commit the bridge token.

## Start automatically with Windows Task Scheduler

To start the bridge when you log on to Windows, create the following task in
Task Scheduler. The server reads the raw token from the `COLAB_MCP_BEARER_TOKEN` user
environment variable at startup, so do not put the token in the task arguments.
Configure the task to run only when the user is logged on.

1. Open **Task Scheduler** from the Start menu and select **Create Task**.
2. On the **General** tab, enter `Colab MCP Bridge` as the name and select
   **Run only when user is logged on**.
3. On the **Triggers** tab, select **New** and set the trigger to **At log on**.
4. On the **Actions** tab, select **New** and enter:

   - **Program/script:** `C:\\Program Files\\nodejs\\node.exe`
   - **Add arguments:** `"C:\\Users\\<username>\\Documents\\GitHub\\kaito-tokyo\\colab-mcp\\bin\\colab-mcp-server.mjs" --http-port 62161`
   - **Start in (optional):** `C:\\Users\\<username>\\Documents\\GitHub\\kaito-tokyo\\colab-mcp`

   The Node.js process reads `COLAB_MCP_BEARER_TOKEN` from `process.env` at startup.
   Keep this user environment variable accessible only to trusted users.

5. On the **Conditions** tab, clear the battery-power restriction if needed on
   a laptop. On the **Settings** tab, enable **Restart the task if it fails**
   to recover automatically after an unexpected stop.
6. Save the task, right-click it, and select **Run**. The bridge is running if
   the following endpoint is reachable:

   `http://127.0.0.1:62161/mcp`

Before running the task, verify that the direct `node.exe` command works once
under the same user. Use the settings in [Codex configuration](#codex-configuration)
to register the MCP endpoint with Codex. If you need startup logs, configure
logging separately because this direct task action does not redirect stdout and
stderr to a file.
