//+------------------------------------------------------------------+
//|                                    ExportEconomicCalendar.mq5    |
//|                                       ForexTestLab data tooling  |
//+------------------------------------------------------------------+
//
// Dumps MetaTrader 5's built-in economic calendar — every event it holds,
// with actual / forecast / previous — to a CSV that `npm run calendar:import`
// reads.
//
// HOW TO RUN
//   1. Copy this file to  MQL5\Scripts\  in your terminal's data folder
//      (File -> Open Data Folder), then refresh the Navigator.
//   2. Open the Calendar tab (View -> Toolbox -> Calendar) and scroll back
//      through the years you want. The terminal only holds what it has
//      downloaded, and this script can only export what the terminal holds.
//   3. Drag the script onto any chart. No trading permission is needed.
//   4. The CSV lands in  Terminal\Common\Files\  (File -> Open Data Folder,
//      then up one level into Common) unless InpCommonFolder is false.
//
// TIMEZONES
//   MQL5 returns calendar times in *trade server* time, not UTC. This script
//   writes them exactly as the terminal reports them and records the server's
//   offset from GMT, observed at export, on the first line. The importer works
//   the zone out from that offset and from the release schedules in the file, so
//   there is nothing to pass:
//
//     npm run calendar:import -- --file ./data/forextestlab-calendar.csv
//
#property copyright "ForexTestLab"
#property version   "1.00"
#property description "Export the MT5 economic calendar (with history) to CSV."
#property script_show_inputs

input bool     InpRollingWindow = true;                        // Scheduled refresh window
input int      InpLookbackDays  = 14;                          // Refresh recent actuals/revisions
input int      InpForwardDays   = 90;                          // Keep upcoming forecasts current
input datetime InpFrom          = D'2007.01.01';               // Full export from (when rolling=false)
input datetime InpTo            = D'2028.01.01';               // Full export to (when rolling=false)
input string   InpCurrencies   = "";                          // Currencies, comma separated (blank = all)
input string   InpFileName     = "forextestlab-calendar.csv";  // Output file name
input bool     InpCommonFolder = true;                        // Write to Terminal\Common\Files

//+------------------------------------------------------------------+
//| CSV escaping: event names contain commas, and occasionally quotes.|
//+------------------------------------------------------------------+
string Csv(const string value)
  {
   if(StringFind(value, ",") < 0 && StringFind(value, "\"") < 0 && StringFind(value, "\n") < 0)
      return value;
   string escaped = value;
   StringReplace(escaped, "\"", "\"\"");
   return "\"" + escaped + "\"";
  }

//+------------------------------------------------------------------+
//| Calendar figures are stored multiplied by a million, with LONG_MIN|
//| standing in for "not published". Emit a blank cell for those so   |
//| the importer can tell an absent actual from a genuine zero.       |
//+------------------------------------------------------------------+
string Figure(const long raw)
  {
   if(raw == LONG_MIN)
      return "";
   return DoubleToString((double)raw / 1000000.0, 6);
  }

string Stamp(const datetime when, const int mode)
  {
   if(when <= 0)
      return "";
   return TimeToString(when, mode);
  }

string ImportanceName(const ENUM_CALENDAR_EVENT_IMPORTANCE importance)
  {
   switch(importance)
     {
      case CALENDAR_IMPORTANCE_LOW:      return "low";
      case CALENDAR_IMPORTANCE_MODERATE: return "medium";
      case CALENDAR_IMPORTANCE_HIGH:     return "high";
      default:                           return "none";
     }
  }

string UnitName(const ENUM_CALENDAR_EVENT_UNIT unit)
  {
   switch(unit)
     {
      case CALENDAR_UNIT_PERCENT:   return "percent";
      case CALENDAR_UNIT_CURRENCY:  return "currency";
      case CALENDAR_UNIT_HOUR:      return "hour";
      case CALENDAR_UNIT_JOB:       return "job";
      case CALENDAR_UNIT_RIG:       return "rig";
      case CALENDAR_UNIT_USD:       return "usd";
      case CALENDAR_UNIT_PEOPLE:    return "people";
      case CALENDAR_UNIT_MORTGAGE:  return "mortgage";
      case CALENDAR_UNIT_VOTE:      return "vote";
      case CALENDAR_UNIT_BARREL:    return "barrel";
      case CALENDAR_UNIT_CUBICFEET: return "cubicfeet";
      case CALENDAR_UNIT_POSITION:  return "position";
      case CALENDAR_UNIT_BUILDING:  return "building";
      default:                      return "";
     }
  }

string MultiplierName(const ENUM_CALENDAR_EVENT_MULTIPLIER multiplier)
  {
   switch(multiplier)
     {
      case CALENDAR_MULTIPLIER_THOUSANDS: return "thousands";
      case CALENDAR_MULTIPLIER_MILLIONS:  return "millions";
      case CALENDAR_MULTIPLIER_BILLIONS:  return "billions";
      case CALENDAR_MULTIPLIER_TRILLIONS: return "trillions";
      default:                            return "";
     }
  }

//+------------------------------------------------------------------+
//| A date-only or tentative event has no meaningful clock time, so   |
//| the chart must not plant a precise vertical line on it.           |
//+------------------------------------------------------------------+
string TimeModeName(const ENUM_CALENDAR_EVENT_TIMEMODE mode)
  {
   switch(mode)
     {
      case CALENDAR_TIMEMODE_DATE:      return "date";
      case CALENDAR_TIMEMODE_NOTIME:    return "notime";
      case CALENDAR_TIMEMODE_TENTATIVE: return "tentative";
      default:                          return "exact";
     }
  }

//+------------------------------------------------------------------+
//| MQL5 has no UTF-8 file mode, so the file is opened binary and     |
//| each line converted explicitly. Event names carry accents.        |
//+------------------------------------------------------------------+
void WriteLine(const int handle, const string line)
  {
   uchar bytes[];
   const int length = StringToCharArray(line + "\n", bytes, 0, -1, CP_UTF8);
   // StringToCharArray appends a terminating zero; it must not reach the file.
   if(length > 1)
      FileWriteArray(handle, bytes, 0, length - 1);
  }

#define DAY_SECONDS      86400
/**
 * The calendar is read a window at a time. Asking for the whole history in one
 * call fails with 5401 (ERR_CALENDAR_TIMEOUT) — not "no data", which is how it
 * first read: the request simply exceeds the server's time limit. A month is
 * comfortably inside it, and the loop narrows further wherever history is slow.
 */
#define CHUNK_DAYS_MAX   30
#define FETCH_ATTEMPTS   3
#define RETRY_SLEEP_MS   500

/**
 * One window of calendar values. Returns the count, 0 for a genuinely empty
 * window, or -1 when the server kept timing out and the caller should try a
 * narrower one.
 */
int FetchChunk(MqlCalendarValue &values[], const datetime from, const datetime to,
               const string currency)
  {
   for(int attempt = 0; attempt < FETCH_ATTEMPTS; attempt++)
     {
      ResetLastError();
      const int count = CalendarValueHistory(values, from, to, NULL,
                                             StringLen(currency) > 0 ? currency : NULL);
      if(count > 0)
         return count;

      const int error = GetLastError();
      if(error == 0)
         return 0;                     // No releases in this window.
      if(error == 5401 || error == 5400)
        {
         Sleep(RETRY_SLEEP_MS);
         continue;
        }
      PrintFormat("Calendar error %d reading %s to %s. %s",
                  error,
                  TimeToString(from, TIME_DATE),
                  TimeToString(to, TIME_DATE),
                  "Calendar functions do not work in the Strategy Tester; run this on a live chart.");
      return 0;
     }
   return -1;
  }

/** The calendar year a moment falls in, for progress reporting. */
int ChunkYear(const datetime at)
  {
   MqlDateTime parts;
   TimeToStruct(at, parts);
   return parts.year;
  }

//+------------------------------------------------------------------+
//| Event descriptions, cached by id and kept sorted so the lookup is |
//| a binary search. A linear scan costs a few hundred million string |
//| comparisons across a full history, which is minutes of export.    |
//+------------------------------------------------------------------+
long   g_ids[];      // ascending
string g_rows[];     // parallel to g_ids
int    g_cached = 0;

/** Index of `id`, or -1. `insertAt` receives where it would belong. */
int FindEvent(const long id, int &insertAt)
  {
   int low = 0;
   int high = g_cached;
   while(low < high)
     {
      const int mid = (low + high) >> 1;
      if(g_ids[mid] < id)
         low = mid + 1;
      else
         high = mid;
     }
   insertAt = low;
   if(low < g_cached && g_ids[low] == id)
      return low;
   return -1;
  }

void InsertEvent(const int at, const long id, const string row)
  {
   g_cached++;
   ArrayResize(g_ids, g_cached);
   ArrayResize(g_rows, g_cached);
   for(int i = g_cached - 1; i > at; i--)
     {
      g_ids[i] = g_ids[i - 1];
      g_rows[i] = g_rows[i - 1];
     }
   g_ids[at] = id;
   g_rows[at] = row;
  }

//+------------------------------------------------------------------+
//| Everything about an event that does not change between releases,  |
//| pre-rendered as CSV cells. Thousands of releases share a few      |
//| hundred events.                                                   |
//+------------------------------------------------------------------+
string DescribeEvent(const ulong eventId)
  {
   MqlCalendarEvent event;
   if(!CalendarEventById(eventId, event))
      return "";

   MqlCalendarCountry country;
   string countryName = "";
   string countryCode = "";
   string countryCurrency = "";
   if(CalendarCountryById(event.country_id, country))
     {
      countryName = country.name;
      countryCode = country.code;
      countryCurrency = country.currency;
     }

   return StringFormat("%I64u,%s,%s,%s,%s,%s,%s,%s,%s,%s,%d",
                       eventId,
                       Csv(event.event_code),
                       TimeModeName(event.time_mode),
                       Csv(countryCurrency),
                       Csv(countryName),
                       Csv(countryCode),
                       ImportanceName(event.importance),
                       Csv(event.name),
                       UnitName(event.unit),
                       MultiplierName(event.multiplier),
                       event.digits);
  }

//+------------------------------------------------------------------+
void OnStart()
  {
   datetime exportFrom = InpFrom;
   datetime exportTo = InpTo;
   if(InpRollingWindow)
     {
      const datetime serverNow = TimeTradeServer();
      exportFrom = serverNow - (datetime)MathMax(1, InpLookbackDays) * DAY_SECONDS;
      exportTo = serverNow + (datetime)MathMax(1, InpForwardDays) * DAY_SECONDS;
     }
   if(exportTo <= exportFrom)
     {
      Print("The calendar export end must be after its start.");
      return;
     }

   const int flags = FILE_WRITE | FILE_BIN | (InpCommonFolder ? FILE_COMMON : 0);
   const int handle = FileOpen(InpFileName, flags);
   if(handle == INVALID_HANDLE)
     {
      PrintFormat("Could not open %s for writing (error %d).", InpFileName, GetLastError());
      return;
     }

   // The offset is only a sanity check for the importer: it is what the server
   // was doing at export time, which says nothing about DST on an event's own
   // date. Hence --timezone.
   const long offsetMinutes = (long)(TimeTradeServer() - TimeGMT()) / 60;
   WriteLine(handle, StringFormat(
                "# forextestlab-calendar v1 server=%s server_gmt_offset_minutes=%I64d exported_utc=%s",
                AccountInfoString(ACCOUNT_SERVER),
                offsetMinutes,
                TimeToString(TimeGMT(), TIME_DATE | TIME_SECONDS)));
   WriteLine(handle,
             "value_id,time_server,event_id,event_code,time_mode,currency,country,country_code,"
             "importance,name,unit,multiplier,digits,actual,forecast,previous,revised_previous,"
             "period_server,revision");

   string currencies[];
   int currencyCount = 0;
   if(StringLen(InpCurrencies) > 0)
      currencyCount = StringSplit(InpCurrencies, ',', currencies);
   if(currencyCount <= 0)
     {
      // A single pass with no filter: one call, every country the terminal has.
      ArrayResize(currencies, 1);
      currencies[0] = "";
      currencyCount = 1;
     }

   int written = 0;
   int skipped = 0;
   int timedOut = 0;

   for(int c = 0; c < currencyCount; c++)
     {
      string currency = currencies[c];
      StringTrimLeft(currency);
      StringTrimRight(currency);
      StringToUpper(currency);

      datetime cursor = exportFrom;
      int chunkDays = CHUNK_DAYS_MAX;
      int reportedYear = 0;

      while(cursor < exportTo && !IsStopped())
        {
         datetime next = cursor + (datetime)chunkDays * DAY_SECONDS;
         if(next > exportTo)
            next = exportTo;

         MqlCalendarValue values[];
         const int count = FetchChunk(values, cursor, next, currency);

         if(count < 0)
           {
            // The window is still too wide for the calendar server. Narrow it
            // and retry the same span rather than skipping it.
            if(chunkDays > 1)
              {
               chunkDays = (int)MathMax(1, chunkDays / 4);
               continue;
              }
            PrintFormat("Gave up on %s: the calendar kept timing out.",
                        TimeToString(cursor, TIME_DATE));
            timedOut++;
            cursor = next;
            continue;
           }

         for(int i = 0; i < count; i++)
           {
            int insertAt = 0;
            int slot = FindEvent((long)values[i].event_id, insertAt);
            if(slot < 0)
              {
               const string described = DescribeEvent(values[i].event_id);
               if(StringLen(described) == 0)
                 { skipped++; continue; }
               InsertEvent(insertAt, (long)values[i].event_id, described);
               slot = insertAt;
              }

            WriteLine(handle, StringFormat("%I64u,%s,%s,%s,%s,%s,%s,%s,%d",
                                          values[i].id,
                                          Stamp(values[i].time, TIME_DATE | TIME_SECONDS),
                                          g_rows[slot],
                                          Figure(values[i].actual_value),
                                          Figure(values[i].forecast_value),
                                          Figure(values[i].prev_value),
                                          Figure(values[i].revised_prev_value),
                                          Stamp(values[i].period, TIME_DATE),
                                          values[i].revision));
            written++;
           }

         const int year = ChunkYear(cursor);
         if(year != reportedYear)
           {
            reportedYear = year;
            PrintFormat("%d… %d rows so far.", year, written);
           }

         cursor = next;
         // Widen again after a clean chunk, so one slow patch of history does
         // not hold the rest of the export at one day a request.
         if(chunkDays < CHUNK_DAYS_MAX)
            chunkDays = (int)MathMin(CHUNK_DAYS_MAX, chunkDays * 2);
         // The calendar server rate-limits, and a tight loop reads as abuse.
         Sleep(40);
        }
     }

   FileClose(handle);
   PrintFormat("Wrote %d calendar rows for %d events to %s%s.",
               written, g_cached,
               InpCommonFolder ? "Common\\Files\\" : "MQL5\\Files\\",
               InpFileName);
   if(skipped > 0)
      PrintFormat("%d rows skipped: the terminal had no description for their event.", skipped);
   if(timedOut > 0)
      PrintFormat("%d single days could not be read at all — that history is missing.", timedOut);
   if(written == 0)
      Print("Nothing was exported. Open View -> Toolbox -> Calendar on a live "
            "chart, let it populate, and run this again.");
  }
//+------------------------------------------------------------------+
