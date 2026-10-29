// Both timestamps must use performance.timeOrigin. Do not guess an epoch
// conversion or replace missing timestamps with handler times: that would
// silently report a zero delay. Keep the original handler-based results intact.
export function eventHandlerDelay(eventAt, handledAt) {
  if (!Number.isFinite(eventAt) || !Number.isFinite(handledAt) ||
      eventAt <= 0 || eventAt > handledAt) return NaN;
  return handledAt - eventAt;
}

// A separate signed estimate using the SAME post-OUT/post-IN midpoint as the
// existing display. This isolates the input timestamp choice, not USB timing.
export function rev3EventMidpoint(record) {
  const downDelay = eventHandlerDelay(record.downEventAt, record.downAt);
  const upDelay = eventHandlerDelay(record.upEventAt, record.upAt);
  if (!Number.isFinite(downDelay) || !Number.isFinite(upDelay) ||
      record.upEventAt < record.downEventAt ||
      !Number.isFinite(record.usbSentAt) || !Number.isFinite(record.usbReceivedAt) ||
      record.usbReceivedAt < record.usbSentAt ||
      !Number.isFinite(record.holdTime) || record.holdTime <= 0) {
    return { valid: false, down: NaN, up: NaN, downDelay: NaN, upDelay: NaN };
  }
  const midpoint = (record.usbSentAt + record.usbReceivedAt) / 2;
  return {
    valid: true,
    down: record.downEventAt - midpoint,
    up: record.upEventAt - record.holdTime - midpoint,
    downDelay,
    upDelay
  };
}
