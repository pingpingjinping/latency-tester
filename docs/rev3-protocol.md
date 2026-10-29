# RAKKA Rev3 WebUSB protocol (recovered from user-supplied website)

Status: **recovered from the vendor website's 2023 JavaScript, with user hardware observations archived on 2026-10-29. Actual contact timing is not independently validated.**

Reference site: https://latency.rakka.dev/ . Bundles captured by the device owner: `0454688439ab25a701a1.js` and `41742477d8ae3d9c3654.js`, including full browser HAR (2026-10-17). The raw HAR and original bundles are intentionally **not** committed to this public repository.

## Identification

- Observed Rev3 device VID = `0x5249`, PID = `0x4C65` (the original site filters by VID and interface class, with PID unspecified)
- WebUSB class = `0xFF`, subclass = `0x4C`, protocol = `0x54`
- Interface 0 on the tested board; interrupt IN endpoint 1 / OUT endpoint 1; max packet = 64B
- Always select configuration and claim the matching interface before exchange.

## Commands

All request/reply reports contain **64 bytes** and are transmitted over USB interrupt endpoints, not HID feature reports.

| Byte offset | Type | Purpose |
| --- | --- | --- |
| 0 | `uint8` | Command ID |
| 1 | `uint8` | Reply result code (0 = OK) |
| 2..5 | `uint32 LE` | Value. For contact: simulated hold duration, in ms |
| 6..63 | zeros | Reserved/unused for these requests |

Defined command identifiers:

| ID | Vendor enum | Used in our app? |
| --- | --- | --- |
| 0 | `get_version` | Yes, on connect |
| 1 | `get_serial_number` | No, privacy / not needed |
| 2 | `contact_once` | Yes, for measurement |

The manufacturer's original implementation assigns `get_version` reply value at byte 2, and `get_serial_number` three uint32 reply values at offsets 2, 6 and 10.

Example contact for **20ms**:
```text
02 00 14 00 00 00 00 00 ... (64 bytes total)
```

The original site sends each request via `usb.transferOut(outEndpoint, 64-byte packet)`, then waits for `usb.transferIn(inEndpoint, 64)`. It checks that the returned report command is recognized and the result code at offset 1 is zero.

## Timing and input events

Rev3 starts observing keydown/mousedown and keyup/mouseup **before** requesting `contact_once(hold)`, then waits for the OUT/IN exchange and both events.

Unlike the Rev1 reference (which timestamps just after HID feature report OUT), the original Rev3 site saves `finishAt = performance.now()` **after completion of the reply IN transfer**, and computes:

```text
keydownLatency = keydownEventAt - finishAt
keyupLatency   = keyupEventAt   - finishAt - holdTimeMs
```

The user-supplied vendor JS initializes by issuing `get_version`, tests 5 warmup repetitions initially (fewer after repeats), and averages successful samples. The local implementation retains the IN origin as raw CSV fields. Its current display uses the request origin described below, keeps default 5 warmups and excludes failures from averages.

## Archived timing comparison

The archived midpoint experiment also records `startedAt = performance.now()` immediately
before OUT submission. `sentAt` remains the post-OUT time and `receivedAt` remains
the post-IN time. These are host JavaScript timestamps, not device-side contact
timestamps. These older midpoint results are retained in archived test captures, not the default display.

The additional signed estimate is `keydownAt - (startedAt + receivedAt) / 2`;
keyup also subtracts the requested hold time. This raises each estimate by half
that sample's OUT duration relative to the existing midpoint. It neither removes
IN-completion jitter nor proves the actual contact time. No absolute value,
clamping, fixed offset, new USB commands, or firmware changes are introduced.

If an OUT stalls and is retried, `outRetried` is true. All timestamps and original
results remain available, but the new estimate is excluded because the captured
interval includes recovery and another OUT attempt. CSV appends the timing fields
and retry flag without changing existing column positions.

## Current basic measurement

The normal Rev3 path registers IN before submitting the original contact OUT.
`measurement.mjs` reports `keydownHandlerAt - outStartedAt` and
`keyupHandlerAt - outStartedAt - requestedHold`. These are request-relative elapsed
values including the unknown tester actuation delay D, not calibrated keyboard-only
latency. D is not implicitly zero. No midpoint, absolute value or guessed D is
applied. IN-relative results remain separate fields in the new basic CSV.

The UI contains only basic measurement, graph and CSV. Experimental diagnostics
are documented in [the investigation record](rev3-investigation-2026-10-29.md).
The old 20/27-column experimental CSV schema must not be interpreted as the new
request-relative export. On input/USB failure the current run records available
partial timestamps and stops further Rev3 commands, closing the session.

## Archived diagnostics and safety


The archived VERSION-only ordering comparison registers `transferIn` before
`transferOut` in the prearmed method. IN and OUT completion times are captured independently. Either
completion order is valid; signed IN-minus-OUT times are preserved and total time
ends at the later completion. An error/timeout closes the prearmed session without
retrying OUT while IN is pending. A/B pairs alternate AB and BA; statistics compare
only complete successful pairs without retries. There is no new per-request ID in
the firmware, and a faster VERSION exchange does not establish contact timing.

An archived **contact ordering comparison** exposes the same prearmed
ordering through `contactOncePrearmed(hold)` using the existing command 2 and
unchanged 64-byte packet. Hold is validated before queuing IN. The current normal
measurement path uses `contactOncePrearmed`; this comparison code is retained for replay and tests, without UI buttons. Input listeners are
registered before either ordering. Both modes use the selected hold, target,
interval, count and warmup; each count applies per mode and pairs alternate AB/BA.
An input or USB failure stops the run and closes the session; stop prevents the
next actuation and closes the session after the in-flight operation settles.

This contact diagnostic displays raw IN-completion-relative results, not midpoint
estimates. Keyup subtracts only the requested hold. Successful non-retried complete
pairs contribute to mode summaries; failed/warmup/partial/retried rows remain
exportable in a separate contact-order CSV. The export retains host IN submission,
OUT start/end, IN end, raw event/handler timestamps, per-edge IN/OUT-relative
results and errors. It does not change the normal measurement CSV. Negative
results are preserved. These are separate actuations, not two measurements of
the same contact; no new firmware request ID or physical reference is available.

The optional endpoint descriptor read uses only inbound standard GET_DESCRIPTOR
(request 6, configuration descriptor type 2, recipient device). It reads the
configuration headers by descriptor index until the active configuration value
matches, then retrieves and validates that full descriptor. It preserves raw
bytes and bInterval fields without inferring negotiated speed or milliseconds.
It issues no control OUT, contact command or serial-string query. The original diagnostic UI excluded
other operations during the read; that UI has been removed. A timeout closes the session to avoid reusing
an outstanding control request; failed reports retain received raw data.

The optional version-timing diagnostic uses only the existing `get_version` (0)
request, with the same sequential OUT -> IN exchange. It excludes five warmups,
records 50 replies at 50ms spacing, and never sends `contact_once`. Timing data
are saved separately from keyboard results. Retried exchanges remain in the CSV
but not the aggregate. Stop prevents further requests after the in-flight exchange
has completed or reached the existing timeout. An exchange error stops the run.
The former diagnostic UI blocked concurrent measurement, diagnostics and connection work.

This protocol has actual physical output: contact_once electrically actuates the attached switch leads for the duration specified. Ensure wires connect only to the intended keyboard/mouse switch contacts, never power rails or unknown pads. The program limits hold duration to 1..200ms and implements no DFU, firmware updates, USB reset, or serial-number retrieval. Only the device owner should initiate measurement.

A USB response timeout can leave a browser WinUSB session in a temporary busy state. Disconnect and reconnect the Rev3 tester if needed; don't run the official site and local app simultaneously.

The user-provided HAR is an HTTP network archive, not a log of WebUSB transfers. These packet details are reconstructed from the JavaScript source, not observed as actual USB traffic.
