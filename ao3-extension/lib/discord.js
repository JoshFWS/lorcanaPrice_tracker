const AO3_RED = 0x990000;
const NEW_GREEN = 0x2ea44f;

export async function sendWorkUpdateNotification(webhookUrl, botName, work, oldSnapshot, newData) {
  const embed = formatWorkUpdateEmbed(work, oldSnapshot, newData);
  await sendWebhook(webhookUrl, botName, embed);
}

export async function sendNewWorksNotification(webhookUrl, botName, search, newWorks, searchUrl) {
  const embed = formatNewWorksEmbed(search, newWorks, searchUrl);
  await sendWebhook(webhookUrl, botName, embed);
}

function formatWorkUpdateEmbed(work, oldSnapshot, newData) {
  const fields = [];

  if (oldSnapshot && oldSnapshot.publishedDate !== newData.publishedDate) {
    fields.push({
      name: "Published",
      value: `${oldSnapshot.publishedDate || "Unknown"} \u2192 **${newData.publishedDate}**`,
      inline: true,
    });
  } else if (newData.publishedDate) {
    fields.push({
      name: "Published",
      value: newData.publishedDate,
      inline: true,
    });
  }

  if (oldSnapshot && oldSnapshot.updatedDate !== newData.updatedDate && newData.updatedDate) {
    fields.push({
      name: "Updated",
      value: `${oldSnapshot.updatedDate || "N/A"} \u2192 **${newData.updatedDate}**`,
      inline: true,
    });
  } else if (newData.updatedDate) {
    fields.push({
      name: "Updated",
      value: newData.updatedDate,
      inline: true,
    });
  }

  const stats = [];
  if (newData.wordCount) stats.push(`${newData.wordCount.toLocaleString()} words`);
  if (newData.chapters) stats.push(`${newData.chapters} chapters`);
  if (newData.kudos) stats.push(`${newData.kudos.toLocaleString()} kudos`);
  if (stats.length > 0) {
    fields.push({ name: "Stats", value: stats.join(" | "), inline: false });
  }

  const tagParts = [];
  if (newData.categories && newData.categories.length > 0) tagParts.push(newData.categories.join(", "));
  if (newData.fandoms && newData.fandoms.length > 0) tagParts.push(newData.fandoms.join(", "));
  if (newData.relationships && newData.relationships.length > 0) tagParts.push(newData.relationships.slice(0, 3).join(", "));
  if (tagParts.length > 0) {
    let tagText = tagParts.join(" | ");
    if (tagText.length > 200) tagText = tagText.slice(0, 197) + "...";
    fields.push({ name: "Tags", value: tagText, inline: false });
  }

  return {
    color: AO3_RED,
    title: `Work Updated: ${newData.title || work.label || "Unknown"}`,
    url: work.url,
    description: newData.author ? `by **${newData.author}**` : undefined,
    fields,
    footer: { text: "AO3 Tracker" },
    timestamp: new Date().toISOString(),
  };
}

function formatNewWorksEmbed(search, newWorks, searchUrl) {
  const fields = [];

  const displayWorks = newWorks.slice(0, 5);
  for (const w of displayWorks) {
    const details = [];
    if (w.author) details.push(`by ${w.author}`);
    if (w.wordCount) details.push(`${w.wordCount.toLocaleString()} words`);
    if (w.kudos) details.push(`${w.kudos.toLocaleString()} kudos`);
    let value = details.join(" | ");
    if (w.url) value += `\n[Read on AO3](${w.url})`;

    fields.push({
      name: w.title || "Untitled",
      value: value || "No details available",
      inline: false,
    });
  }

  let description = `**${newWorks.length}** new work(s) matching your filters`;
  if (newWorks.length > 5) {
    description += `\n\n...and ${newWorks.length - 5} more.`;
    if (searchUrl) description += ` [View full results](${searchUrl})`;
  }

  return {
    color: NEW_GREEN,
    title: `New Works: ${search.name}`,
    url: searchUrl || undefined,
    description,
    fields,
    footer: { text: "AO3 Tracker" },
    timestamp: new Date().toISOString(),
  };
}

async function sendWebhook(webhookUrl, botName, embed) {
  const payload = {
    username: botName || "AO3 Tracker",
    embeds: [embed],
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.status === 204 || resp.status === 200) {
        console.log("Discord message sent successfully");
        return;
      }

      if (resp.status === 429) {
        const data = await resp.json();
        const retryAfter = data.retry_after || 5;
        console.warn(`Discord rate limited, retrying after ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      console.error(`Discord error: ${resp.status}`);
    } catch (e) {
      console.error(`Discord send failed (attempt ${attempt + 1}):`, e);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error("All Discord send attempts failed");
}
