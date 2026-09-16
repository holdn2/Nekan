/**
 * A month, drawn as a grid, for picking a due date.
 *
 * Drawn here rather than handed to the platform. iOS's own picker is a native
 * module, and a native module costs an EAS build out of a monthly allowance --
 * while a screen made of JS reaches the phone over the air for nothing. It is
 * also the only way the spacing scale, the radii and the two themes on this
 * screen go on being the ones in src/shared/theme.ts.
 *
 * The day names are not a list kept here. Intl already knows them in whatever
 * language the phone is set to, and formatDue asks it the same question for
 * the weekday in a chip -- a list of our own would be the place where the two
 * of them start disagreeing.
 *
 * The week starts on Sunday, which is what both languages this app speaks do.
 * A locale that starts on Monday would need the offset, and Intl's own answer
 * for that (getWeekInfo) is not something Hermes can be relied on for yet.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { parseDue } from "@nekan/shared/core";
import { ChevronIcon } from "../icons";
import { locale, t } from "../i18n";
import { FS, FW, R, SP, useColors } from "../theme";

/** `YYYY-MM-DD` in local time -- the shape a due date is stored in. */
export function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** The seven headers. Any Sunday will do; this one is arbitrary. */
function weekdayNames(loc: string): string[] {
  const format = new Intl.DateTimeFormat(loc, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) =>
    format.format(new Date(2026, 0, 4 + i)),
  );
}

/** The cells of one month, blanks included, in rows of seven. */
function weeksOf(cursor: Date): (Date | null)[][] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const lead = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function DueCalendar({
  value,
  onPick,
}: {
  /** The due date as stored, or null. */
  value: string | null;
  onPick: (iso: string) => void;
}) {
  const c = useColors();
  const loc = locale();
  const today = new Date();
  const selected = parseDue(value);
  // Opens on the month being looked at, not on this one: a date three months
  // out is changed far more often than it is set from scratch.
  const [cursor, setCursor] = useState(() => startOfMonth(selected ?? today));

  const step = (months: number) =>
    setCursor((at) => new Date(at.getFullYear(), at.getMonth() + months, 1));

  const title = new Intl.DateTimeFormat(loc, {
    year: "numeric",
    month: "long",
  }).format(cursor);
  const full = new Intl.DateTimeFormat(loc, { dateStyle: "full" });

  return (
    <View style={[s.root, { backgroundColor: c.panel, borderColor: c.line }]}>
      <View style={s.head}>
        <Pressable
          onPress={() => step(-1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("due.prevMonth")}
          style={s.arrow}
        >
          {/* The one chevron this app has points right, so the other is the
              same drawing turned over rather than a second one to keep. */}
          <View style={s.flip}>
            <ChevronIcon color={c.muted} />
          </View>
        </Pressable>
        <Text style={[s.title, { color: c.text }]}>{title}</Text>
        <Pressable
          onPress={() => step(1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("due.nextMonth")}
          style={s.arrow}
        >
          <ChevronIcon color={c.muted} />
        </Pressable>
      </View>

      <View style={s.week}>
        {weekdayNames(loc).map((name) => (
          <Text key={name} style={[s.dayName, { color: c.faint }]}>
            {name}
          </Text>
        ))}
      </View>

      {weeksOf(cursor).map((week, i) => (
        <View key={i} style={s.week}>
          {week.map((day, j) => {
            if (!day) return <View key={j} style={s.cell} />;
            const iso = isoOf(day);
            const on = Boolean(selected) && iso === isoOf(selected as Date);
            const now = iso === isoOf(today);
            return (
              <Pressable
                key={j}
                onPress={() => onPick(iso)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={full.format(day)}
                style={[
                  s.cell,
                  s.day,
                  on && { backgroundColor: c.accent },
                  // Today is marked by an outline rather than a fill, so that
                  // the fill goes on meaning "this is the one you picked".
                  !on && now && { borderColor: c.accent, borderWidth: 1 },
                ]}
              >
                <Text
                  style={[
                    s.dayText,
                    { color: on ? c["on-accent"] : c.text },
                    on && s.dayTextOn,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.lg,
    padding: SP.md,
    gap: SP["2xs"],
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xs,
    paddingBottom: SP.xs,
  },
  arrow: { padding: SP.xs },
  flip: { transform: [{ scaleX: -1 }] },
  title: { fontSize: FS.md, fontWeight: FW.semibold },
  week: { flexDirection: "row" },
  cell: { flex: 1, height: 38, alignItems: "center", justifyContent: "center" },
  day: { borderRadius: R.md, margin: SP["2xs"] },
  dayName: {
    flex: 1,
    textAlign: "center",
    fontSize: FS.xs,
    paddingBottom: SP["2xs"],
  },
  dayText: { fontSize: FS.md, fontVariant: ["tabular-nums"] },
  dayTextOn: { fontWeight: FW.semibold },
});
