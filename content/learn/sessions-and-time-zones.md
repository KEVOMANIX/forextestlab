---
title: Trading sessions, time zones, and daylight saving
description: Set session hours and understand why UTC offsets can change during historical replay.
category: Chart tools
date: 2026-10-05
ctaLabel: Open a replay session
ctaHref: /app/history
---
## Distinguish chart time from session time

The chart time zone controls the clock labels you read on the chart. A trading session has its own local opening and closing hours. London hours quoted in London time do not become New York hours when you change the chart display.

Before comparing trades across sessions, decide which clock you are using and keep that convention in your notes. A screenshot without its time-zone context can make the same trade appear to happen at a different hour.

## Set your own session windows

Open Go to, then Settings. Set the opening time, closing time, and time zone for London, New York, Asian, and Silver Bullet. Save settings to use those windows for Go to session destinations. Restore defaults returns to the built-in definitions.

Search the time-zone picker by city or UTC offset. Choose the city that matches the intended local hours. Go to session settings configure navigation; configure the Sessions indicator separately if you also want its chart ranges to use different hours.

## Read offsets at the historical date

Some cities change their UTC offset during daylight saving. New York commonly uses UTC−5 in winter and UTC−4 during daylight saving. A fixed offset and a city time zone therefore express different rules over a full year.

ForexTestLab resolves the displayed offsets at the replay moment. When reviewing a period around a clock change, check the exact date instead of assuming that today's offset applies. London and New York change clocks on different schedules, so their relative timing can shift.
