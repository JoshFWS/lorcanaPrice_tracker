const AO3_RED = 0x990000;

export async function sendWorkUpdatedNotification(webhookUrl, botName, work, oldDate, newDate, workData) {
  const fields = [
    { name: "Updated", value: `${oldDate || "?"} → **${newDate}**`, inline: true },
  ];

  if (workData.chapters) {
    fields.push({ name: "Chapters", value: workData.chapters, inline: true });
  }
  if (workData.wordCount) {
    fields.push({ name: "Words", value: workData.wordCount.toLocaleString(), inline: true });
  }

  const embed = {
    color: AO3_RED,
    title: trunc(`Updated: ${workData.title || work.label || `Work #${work.workId}`}`, 256),
    url: work.url,
    description: workData.author ? `by **${workData.author}**` : undefined,
    fields,
    footer: { text: "AO3 Tracker" },
    timestamp: new Date().toISOString(),
  };

  await sendWebhook(webhookUrl, botName, embed);
}

function trunc(str, max) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

async function sendWebhook(webhookUrl, botName, embed) {
  const payload = { username: botName || "AO3 Tracker", embeds: [embed] };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.status === 204 || resp.status === 200) {
        console.log("Discord notification sent");
        return;
      }

      if (resp.status === 429) {
        const data = await resp.json().catch(() => ({}));
        const retryAfter = data.retry_after || 5;
        console.warn(`Discord rate limited, retrying after ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (resp.status >= 400 && resp.status < 500) {
        console.error(`Discord rejected payload (${resp.status})`);
        return;
      }

      console.error(`Discord error: ${resp.status}`);
    } catch (e) {
      console.error(`Discord send failed (attempt ${attempt + 1}):`, e);
      if (attempt < 2) await sleep(2000);
    }
  }
  console.error("All Discord send attempts failed");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
