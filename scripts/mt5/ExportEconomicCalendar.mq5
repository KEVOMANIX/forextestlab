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
// TIMEZONES — READ THIS
//   MQL5 returns calendar times in *trade server* time, not UTC. This script
//   writes them exactly as the terminal reports them and records the server's
//   offset from GMT, observed at export, on the first line. The importer needs
//   to be told the zone:
//
//     npm run calendar:import -- --file ./data/calendar.csv --timezone Europe/Kyiv
//
//   Pass your broker's IANA zone (most are Europe/Kyiv or Europe/Athens — EET
//   with summer time) so each event converts with the DST rule in force on its
//   own date. A fixed offset like --timezone +02:00 also works, but it will be
//   an hour out for every event on the other side of a DST boundary.
//
#property copyright "ForexTestLab"
#property version   "1.00"
#property description "Export the MT5 economic calendar (with history) to CSV."
#property script_show_inputs

input datetime InpFrom         = D'2007.01.01';               // From (server time)
input datetime InpTo           = D'2100.01.01';               // To (server time)
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

//+------------------------------------------------------------------+
//| Everything about an event that does not change between releases,  |
//| pre-rendered as CSV cells and cached by event id. Thousands of    |
//| releases share a few hundred events.                              |
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

   ulong  cachedIds[];
   string cachedRows[];
   int    cached = 0;

   int written = 0;
   int skipped = 0;

   for(int c = 0; c < currencyCount; c++)
     {
      string currency = currencies[c];
      StringTrimLeft(currency);
      StringTrimRight(currency);
      StringToUpper(currency);

      MqlCalendarValue values[];
      const int count = CalendarValueHistory(values, InpFrom, InpTo, NULL,
                                             StringLen(currency) > 0 ? currency : NULL);
      if(count <= 0)
        {
         const int error = GetLastError();
         PrintFormat("No calendar values for %s (error %d). %s",
                     StringLen(currency) > 0 ? currency : "all currencies",
                     error,
                     "Calendar functions do not work in the Strategy Tester. On a live chart, "
                     "open the Calendar tab and scroll back so the terminal downloads history.");
         ResetLastError();
         continue;
        }

      for(int i = 0; i < count; i++)
        {
         int hit = -1;
         for(int k = 0; k < cached; k++)
            if(cachedIds[k] == values[i].event_id)
              { hit = k; break; }

         if(hit < 0)
           {
            const string described = DescribeEvent(values[i].event_id);
            if(StringLen(described) == 0)
              { skipped++; continue; }
            hit = cached;
            cached++;
            ArrayResize(cachedIds, cached);
            ArrayResize(cachedRows, cached);
            cachedIds[hit] = values[i].event_id;
            cachedRows[hit] = described;
           }

         WriteLine(handle, StringFormat("%I64u,%s,%s,%s,%s,%s,%s,%s,%d",
                                       values[i].id,
                                       Stamp(values[i].time, TIME_DATE | TIME_SECONDS),
                                       cachedRows[hit],
                                       Figure(values[i].actual_value),
                                       Figure(values[i].forecast_value),
                                       Figure(values[i].prev_value),
                                       Figure(values[i].revised_prev_value),
                                       Stamp(values[i].period, TIME_DATE),
                                       values[i].revision));
         written++;
        }
     }

   FileClose(handle);
   PrintFormat("Wrote %d calendar rows for %d events (%d skipped) to %s%s.",
               written, cached, skipped,
               InpCommonFolder ? "Common\\Files\\" : "MQL5\\Files\\",
               InpFileName);
  }
//+------------------------------------------------------------------+
