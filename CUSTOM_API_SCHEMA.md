# Custom Archive API Schema

`danmakus-client` can optionally dual-write successfully uploaded live packet archive records to a user-owned JSON API. The official Danmakus upload path is unchanged.

## Enablement

Set:

- `CUSTOM_API_ENDPOINT`: destination URL for the custom API.

By default, `danmakus-client` filters custom API writes to the account recording list returned by the Danmakus account API (`/api/v2/account/recording`, `channel.uId`). This means only streamers explicitly recorded by the account are sent.

Optional override:

- `TARGET_UIDS`: comma-separated Bilibili streamer UIDs to use instead of the account recording list.

Server-assigned supplemental rooms are not sent unless their streamer UID is explicitly present in the selected target UID set.

## Request

- Method: `POST`
- URL: value of `CUSTOM_API_ENDPOINT`
- Headers:
  - `Content-Type: application/json`
  - `User-Agent: danmakus-client/custom-archive`

## Body

```json
{
  "source": "danmakus-client",
  "version": 1,
  "sentAtMs": 1710000000000,
  "items": [
    {
      "localId": 123,
      "streamerUid": 456,
      "eventTsMs": 1710000000000,
      "payloadEncoding": "base64",
      "payload": "..."
    }
  ]
}
```

## Fields

- `source` (`string`): fixed source identifier, currently `danmakus-client`.
- `version` (`number`): schema version, currently `1`.
- `sentAtMs` (`number`): client-side send timestamp in Unix milliseconds.
- `items` (`array`): archive records in this batch.
- `items[].localId` (`number`): local outbox record ID.
- `items[].streamerUid` (`number`): Bilibili streamer UID used for filtering and attribution.
- `items[].eventTsMs` (`number`): packet receive/event timestamp in Unix milliseconds.
- `items[].payloadEncoding` (`string`): fixed value `base64`.
- `items[].payload` (`string`): raw Bilibili live WebSocket packet bytes encoded as base64.

## Delivery behavior

The custom API write is non-blocking and best-effort. Failures, non-2xx responses, and timeouts are logged locally but do not affect official Danmakus uploads, local outbox acknowledgement, or retry scheduling.
