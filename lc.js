from pathlib import Path

html = r'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gregorian to Letoniu Calendar Converter</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f4f6f8; color: #17202a;
    }
    .wrap { max-width: 760px; margin: 0 auto; padding: 48px 20px; }
    .card {
      background: white; border-radius: 18px; padding: 28px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
    }
    h1 { margin-top: 0; font-size: 2rem; }
    .subtitle { color: #5f6b76; line-height: 1.6; }
    label { display:block; margin: 22px 0 8px; font-weight: 700; }
    input, button {
      width: 100%; padding: 13px 14px; border-radius: 10px;
      border: 1px solid #cbd2d9; font-size: 1rem;
    }
    button {
      margin-top: 18px; border: 0; background: #222; color: white;
      cursor: pointer; font-weight: 700;
    }
    button:hover { opacity: .88; }
    .result {
      margin-top: 24px; padding: 20px; border-radius: 14px;
      background: #eef2f5;
    }
    .result h2 { margin-top: 0; }
    .big { font-size: 1.55rem; font-weight: 800; }
    .note { margin-top: 18px; font-size: .92rem; line-height: 1.6; color: #5f6b76; }
    .error { color: #a00000; font-weight: 700; }
    code { background: #e4e8ec; padding: 2px 5px; border-radius: 4px; }
    @media (prefers-color-scheme: dark) {
      body { background:#111; color:#eee; }
      .card { background:#1b1b1b; box-shadow:none; }
      .subtitle,.note { color:#b8bec5; }
      input { background:#252525; color:#eee; border-color:#444; }
      .result { background:#252525; }
      code { background:#333; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <h1>Gregorian → Letoniu Calendar</h1>
      <p class="subtitle">
        Convert a Gregorian calendar date to the corresponding date in the Letoniu Calendar.
      </p>

      <label for="date">Gregorian date</label>
      <input id="date" type="date">

      <button id="convert">Convert</button>

      <div id="result" class="result" hidden>
        <h2>Letoniu Calendar Date</h2>
        <div id="output" class="big"></div>
        <p id="details"></p>
      </div>

      <p class="note">
        Epoch: September 10, 6,998,027 B.C. is the first day of Year 1, Month 1, Day 1.
        The Letoniu Calendar has twelve 30-day months. The final five or six days are
        the Great Holy Days. The five-day special-cycle rule takes precedence when applicable.
      </p>
    </section>
  </main>

<script>
"use strict";

/*
  Letoniu Calendar rules:
  Epoch = Gregorian September 10, 6,998,027 B.C.
  Year 1 / Month 1 / Day 1 = epoch.
  12 months × 30 days = 360 regular days.
  Great Holy Days occupy the remaining 5 or 6 days.
  Leap years occur once every four years.
  Special five-day cycles take precedence once every 128 years and once every 3,320 years.
  A six-day Great Holy Days cycle occurs once every 250,000 years.

  This implementation treats a special cycle as a year number divisible by
  128 or 3,320, except that the 250,000-year rule forces six days.
*/

const EPOCH = {
  // Astronomical year numbering: 6,998,027 B.C. = year -6,998,026.
  year: -6998026,
  month: 9,
  day: 10
};

const MS_PER_DAY = 86400000;

function gregorianToDayNumber(year, month, day) {
  // Proleptic Gregorian calendar, using astronomical year numbering.
  let y = year;
  let m = month;
  if (m <= 2) { y--; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716))
       + Math.floor(30.6001 * (m + 1))
       + day + b - 1524;
}

function dayDifferenceFromEpoch(year, month, day) {
  return gregorianToDayNumber(year, month, day)
       - gregorianToDayNumber(EPOCH.year, EPOCH.month, EPOCH.day);
}

function isLeapYear(year) {
  return year % 4 === 0;
}

function greatHolyDays(year) {
  // Special cycles take precedence over the ordinary four-year rule.
  if (year % 250000 === 0) return 6;
  if (year % 128 === 0) return 5;
  if (year % 3320 === 0) return 5;
  return isLeapYear(year) ? 6 : 5;
}

function convertGregorianToLetoniu(year, month, day) {
  const days = dayDifferenceFromEpoch(year, month, day);

  if (days < 0) {
    throw new Error("This converter does not support dates before the Letoniu Calendar epoch.");
  }

  // Find the Letoniu year. Most years have 365 days, leap years 366.
  // Since the epoch is Year 1, days=0 is Year 1 Day 1.
  let yearNumber = 1;
  let remaining = days;

  while (true) {
    const yearLength = 360 + greatHolyDays(yearNumber);
    if (remaining < yearLength) break;
    remaining -= yearLength;
    yearNumber++;
  }

  if (remaining < 360) {
    const monthNumber = Math.floor(remaining / 30) + 1;
    const dayNumber = (remaining % 30) + 1;
    return {
      year: yearNumber,
      month: monthNumber,
      day: dayNumber,
      holyDay: false,
      holyDayNumber: null,
      holyDays: greatHolyDays(yearNumber)
    };
  }

  return {
    year: yearNumber,
    month: null,
    day: null,
    holyDay: true,
    holyDayNumber: remaining - 360 + 1,
    holyDays: greatHolyDays(yearNumber)
  };
}

function parseInputDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function formatResult(result) {
  if (result.holyDay) {
    return {
      main: `Year ${result.year}, Great Holy Day ${result.holyDayNumber}`,
      details:
        `The Great Holy Days last ${result.holyDays} days in Year ${result.year}.`
    };
  }

  return {
    main: `Year ${result.year}, Month ${result.month}, Day ${result.day}`,
    details:
      `Month ${result.month}, Day ${result.day} of the Letoniu Calendar. ` +
      `The Great Holy Days last ${result.holyDays} days at the end of this year.`
  };
}

document.getElementById("convert").addEventListener("click", () => {
  const input = document.getElementById("date");
  const resultBox = document.getElementById("result");
  const output = document.getElementById("output");
  const details = document.getElementById("details");

  try {
    if (!input.value) throw new Error("Please select a Gregorian date.");

    const date = parseInputDate(input.value);
    const result = convertGregorianToLetoniu(date.year, date.month, date.day);
    const formatted = formatResult(result);

    output.textContent = formatted.main;
    details.textContent = formatted.details;
    resultBox.hidden = false;
  } catch (error) {
    output.innerHTML = `<span class="error">${error.message}</span>`;
    details.textContent = "";
    resultBox.hidden = false;
  }
});
</script>
</body>
</html>
'''

path = Path("/mnt/data/gregorian-to-letoniu.html")
path.write_text(html, encoding="utf-8")
print(path)
