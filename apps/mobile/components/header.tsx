/**
 * The one row at the top of every tab.
 *
 * It exists because the sync state was only readable inside the settings tab,
 * and "is what I just typed anywhere but here?" is a question people ask while
 * working rather than while configuring. The matrix already drew a bar of its
 * own; this is that bar, lifted so the archive and settings have one too.
 *
 * `board` says whether the work/life switch belongs on this screen. It scopes
 * the matrix and the archive -- both list tasks -- and scopes nothing in
 * settings, where it would be a control that does not do anything you can see.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatAgo } from "@nekan/shared/core";
import type { Space } from "@nekan/shared/types";
import { SPACES } from "@nekan/shared/core";
import { t } from "../i18n";
import { SyncIcon } from "../icons";
import { FS, FW, R, SP, useColors } from "../theme";
import { currentSpace, setSpace } from "../store/state";
import { useStore } from "../store/use-store";
import { onSyncStatus, syncNow, type SyncStatus } from "../sync/loop";

/** How long the button keeps looking busy after a press. See below. */
const HELD_MS = 600;

/**
 * Re-render on the clock, so "방금" stops saying so when it stops being true.
 *
 * Nothing else brings this back. The screen redraws when the loop reports a
 * new status, and it stops reporting when nothing in it changes -- which is
 * what a long stretch offline looks like: the same phase, the same count, the
 * same `syncedAt`, no report. The label would sit on "2분 전" for an hour,
 * which is worse than saying nothing, because this exists to be believed.
 *
 * Thirty seconds against a scale whose smallest step is a minute.
 */
function useTick(active: boolean) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => bump((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);
}

function SyncNow() {
  const c = useColors();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => onSyncStatus(setStatus), []);

  /**
   * Hold the busy look long enough to be seen.
   *
   * Measured on the desktop, whose loop this one mirrors: a press reaches
   * `syncing` in single-digit milliseconds and is back to `synced` inside two
   * hundred, because the usual run is one request that finds nothing new.
   * Truthful and invisible -- somebody pressed a button and the screen never
   * answered, which is the failure this control exists to avoid.
   */
  useTick(Boolean(status) && status?.phase !== "off");
  const [pressed, setPressed] = useState(false);
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (holding.current) clearTimeout(holding.current);
    },
    [],
  );

  // Nobody signed in: nothing to sync and nothing to say about it.
  if (!status || status.phase === "off") return null;

  const words =
    status.unsent > 0
      ? t("account.state.pending", { count: status.unsent })
      : t(`account.state.${status.phase}`);
  // Date.now(), not the store's now(): `syncedAt` was stamped on this device,
  // so adding the server's clock offset would only make the difference wrong.
  const ago = formatAgo(status.syncedAt, Date.now(), t);
  const busy = status.phase === "syncing" || pressed;

  const press = () => {
    setPressed(true);
    if (holding.current) clearTimeout(holding.current);
    holding.current = setTimeout(() => setPressed(false), HELD_MS);
    syncNow();
  };

  return (
    <View style={s.sync}>
      <Pressable
        onPress={press}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("sync.now")}
      >
        <SyncIcon color={busy ? c.accent : c.muted} size={16} />
      </Pressable>
      <Text style={[s.state, { color: c.faint }]} numberOfLines={1}>
        {ago && status.phase !== "syncing"
          ? t("sync.stateAgo", { state: words, ago })
          : words}
      </Text>
    </View>
  );
}

export function AppHeader({ board }: { board?: boolean }) {
  const c = useColors();
  useStore();
  const space = currentSpace();

  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: c.bg }}>
      <View style={[s.bar, { borderBottomColor: c.line }]}>
        {board ? (
          <View
            style={[
              s.switch_,
              { backgroundColor: c["panel-2"], borderColor: c.line },
            ]}
          >
            {SPACES.map((sp: Space) => (
              <Pressable key={sp} onPress={() => setSpace(sp)} hitSlop={4}>
                <Text
                  style={[
                    s.switchItem,
                    sp === space
                      ? { backgroundColor: c.accent, color: c["on-accent"] }
                      : { color: c.muted },
                  ]}
                >
                  {t(`space.${sp}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[s.brand, { color: c.text }]}>Nekan</Text>
        )}
        <SyncNow />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP["4xl"],
    paddingVertical: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: FS.lg, fontWeight: FW.semibold },
  switch_: {
    flexDirection: "row",
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SP.xs,
    gap: SP.xs,
  },
  switchItem: {
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    fontSize: FS.sm,
    fontWeight: FW.semibold,
    overflow: "hidden",
  },
  sync: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  state: { fontSize: FS.xs },
});
