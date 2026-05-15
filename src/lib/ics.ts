// Generate a downloadable .ics file that opens in Google Calendar, Apple, or Outlook.

export type CalEvent = {
  uid: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD (all-day)
};

const fold = (line: string) => line.match(/.{1,73}/g)?.join("\r\n ") ?? line;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

function plusOneDay(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildIcs(events: CalEvent[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coopkeeper//Vaccines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    const dt = e.date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@coopkeeper`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${plusOneDay(e.date)}`,
      fold(`SUMMARY:${esc(e.title)}`),
      e.description ? fold(`DESCRIPTION:${esc(e.description)}`) : "",
      "BEGIN:VALARM",
      "TRIGGER:-PT12H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(e.title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleCalendarUrl(e: CalEvent) {
  const dt = e.date.replace(/-/g, "");
  const end = plusOneDay(e.date);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${dt}/${end}`,
    details: e.description ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
