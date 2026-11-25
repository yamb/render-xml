const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toRfc2822Utc(instant) {
  const time = Temporal.Instant.from(instant).toZonedDateTimeISO('UTC');
  const day = String(time.day).padStart(2, '0');
  const year = String(time.year).padStart(4, '0');
  const clock = time.toPlainTime().toString({ smallestUnit: 'second' });

  return `${days[time.dayOfWeek - 1]}, ${day} ${months[time.month - 1]} ${year} ${clock} GMT`;
}
