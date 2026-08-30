# Device API v1

All device endpoints require `Authorization: Bearer <device-token>`. Tokens are
stored as SHA-256 digests. Use HTTPS outside a trusted development network.

## `POST /api/device/v1/pair`

The pairing endpoint is the one exception and does not require a token. A
factory-fresh terminal generates its own credential, sends its name, firmware,
IP address, and token after the operator enters the server URL in the terminal
setup portal, and appears in the dashboard as **Awaiting approval**. An admin
must approve it before the authenticated config, events, and heartbeat
endpoints accept that credential.

## `GET /api/device/v1/config`

Returns server time, workspace settings, device identity, and active employees.
Employee PINs are returned only as SHA-256 digests so the terminal can validate
offline without storing plaintext PINs.

## `POST /api/device/v1/events`

```json
{
  "events": [{
    "id": "device-generated-unique-id",
    "employeeId": "employee-id",
    "type": "CLOCK_IN",
    "occurredAt": "2026-08-30T08:00:00Z"
  }],
  "pendingCount": 1
}
```

Event IDs are globally unique and the server has a unique constraint on them.
Replayed uploads return `duplicate`, making retry safe. A clock-in opens a
session only if none is open; clock-out closes the open session.

## `POST /api/device/v1/heartbeat`

Accepts `firmwareVersion`, `ipAddress`, and `pendingEvents`. A device is shown as
online when its last heartbeat is less than five minutes old.

## `GET /api/health`

Unauthenticated process health endpoint for a reverse proxy or container
orchestrator.
