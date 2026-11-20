---
title: Trading sessions, time zones, and daylight saving
description: Jump to London, New York, Asian, or Silver Bullet hours, set your own session windows, and read offsets correctly around clock changes.
category: Chart tools
date: 2026-10-05
updated: 2026-11-20
cover: /learn/session-settings-20261120.png
coverAlt: Session settings panel with open time, close time, and time zone for London, New York, and Asian sessions
ctaLabel: Open a replay session
ctaHref: /app/history
takeaways:
  - Chart time sets the clock labels; each session keeps its own hours in its own city's time zone.
  - Go to → Sessions jumps the replay to a session's open or close, forward or backward.
  - Offsets are resolved at the replay date, so London and New York shift during daylight saving.
---
## Chart time and session time are different clocks

The chart time zone controls the clock labels along the bottom of the chart. A trading session has its own local opening and closing hours. London hours quoted in London time stay London hours when you switch the chart to New York or UTC; only the labels change.

Before comparing trades across sessions, decide which clock you use in your notes and keep it. A screenshot without its time zone can make the same trade appear to happen at a different hour.

## Jump to a session open or close

In a replay, open **Go to** and choose **Sessions**. Each session shows its hours in its own city time: by default London 08:00–16:30 London, New York 08:00–17:00 New York, Asian 09:00–18:00 Tokyo, and Silver Bullet 10:00–11:00 New York. Pick **Forward** or **Backward**, choose **Open** or **Close**, then press **Go to selection**. The replay pauses when it reaches the destination.

![Go to panel with the Sessions tab showing London, New York, Asian, and Silver Bullet hours with Open and Close buttons](/learn/go-to-sessions-20261120.png "Go to → Sessions. The header shows the current replay time and chart time zone.")

> [!WARNING]
> Going **Backward** rewinds the replay and undoes any trades opened after the destination. See [How to test without seeing future candles](/learn/avoid-future-candles).

## Set your own session windows

Click **Settings** at the top of the Go to panel. For each session, set the **Open** and **Close** time and choose a **Time zone**. Search the picker by city or UTC offset, and pick the city whose local hours you mean, for example New York rather than a fixed UTC−5. Press **Save settings**; the hours are saved with your chart preferences and used for Go to destinations in every session.

![Session settings with London 08:00 AM to 04:30 PM in London time and New York 08:00 AM to 05:00 PM in New York time](/learn/session-settings-20261120.png "Session settings. Each window keeps its own time zone.")

These settings control navigation. If you also use the **Sessions** indicator to shade ranges on the chart, set its hours in the indicator's own settings so the two match.

## Read offsets at the historical date

Many cities change their UTC offset for daylight saving. New York uses UTC−5 in winter and UTC−4 in summer; London uses UTC+0 in winter and UTC+1 in summer. A fixed offset and a city time zone are therefore different rules over a full year.

ForexTestLab works out the offset at the replay moment, not today's date. The two regions change their clocks on different dates: the US moves in the second week of March and the first week of November, the UK on the last Sunday of March and October. For a few weeks each spring and autumn, the gap between London and New York is four hours instead of five. When you review trades around those weeks, check the exact date before comparing session timing.

| Period | London | New York | Gap |
| --- | --- | --- | --- |
| Winter | UTC+0 | UTC−5 | 5 hours |
| Mid-March to late March, and late October to early November | UTC+0 | UTC−4 | 4 hours |
| Summer | UTC+1 | UTC−4 | 5 hours |
