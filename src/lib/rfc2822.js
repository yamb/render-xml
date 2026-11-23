export function toRfc2822Utc(instant) {
  return new Date(Temporal.Instant.from(instant).epochMilliseconds).toUTCString();
}
