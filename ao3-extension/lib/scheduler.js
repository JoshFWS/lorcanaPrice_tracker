export const ALARM_NAME = "ao3Check";

// Chrome alarms minimum is 1 minute; we enforce 5 to be polite to AO3.
const MIN_INTERVAL_MINUTES = 5;

export async function scheduleAlarm(config) {
  await chrome.alarms.clearAll();
  const checks = Math.max(1, Math.min(config.checksPerHour || 2, 12));
  const intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, 60 / checks);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: intervalMinutes,
  });
  console.log(`AO3 Tracker: checking every ${intervalMinutes} minutes`);
}
