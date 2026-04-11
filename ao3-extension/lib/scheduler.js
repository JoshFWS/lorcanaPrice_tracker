const AO3_MIN_DELAY_MINUTES = 3;
const AO3_JITTER_FACTOR = 0.5;
const AO3_MAX_CHECKS_PER_HOUR = 6;

export const ALARM_NAME = "ao3Check";

export async function scheduleAlarms(config) {
  await chrome.alarms.clearAll();

  if (config.paranoidMode) {
    scheduleNextParanoidCheck(config.checksPerHour);
  } else {
    // Non-paranoid: check every 6 hours
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 6 * 60,
    });
    console.log("AO3 Tracker: scheduled checks every 6 hours");
  }
}

export function scheduleNextParanoidCheck(checksPerHour, multiplier = 1) {
  const checks = Math.max(1, Math.min(checksPerHour, AO3_MAX_CHECKS_PER_HOUR));
  const intervalMinutes = (60 / checks) * multiplier;

  // Random jitter: +/-50% of the interval
  const jitter = intervalMinutes * AO3_JITTER_FACTOR;
  const delay = intervalMinutes + (Math.random() * jitter * 2 - jitter);
  const delayMinutes = Math.max(AO3_MIN_DELAY_MINUTES, delay);

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: delayMinutes,
  });

  console.log(`AO3 Tracker (paranoid): next check in ${delayMinutes.toFixed(1)} minutes`);
}

/**
 * Returns a random delay in ms between AO3 page fetches within a single check cycle.
 * Range: 15-30 seconds
 */
export function getInterRequestDelay() {
  return 15000 + Math.random() * 15000;
}
