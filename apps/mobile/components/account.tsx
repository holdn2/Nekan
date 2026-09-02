/**
 * The account block, which is the only part of settings that talks to a
 * server.
 *
 * Signed out it offers Google and, outside a release build, a password form.
 * That pair is the desktop's arrangement and exists for the same reason:
 * syncing has to be verifiable without a person clicking a consent screen.
 * `__DEV__` is this app's `app.isPackaged`.
 *
 * Signed in it shows the address and one way out. Deleting an account is not
 * here yet -- it needs the same confirmation the desktop gives it, and a
 * button that permanent should not arrive before the sentence explaining it.
 *
 * Errors are shown as the catalogue's sentences rather than the server's
 * words. Supabase answers in English and changes its wording; the codes do
 * not, so `account.error.*` maps them and anything unrecognised falls through
 * as its code, visible rather than swallowed.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { t } from "../i18n";
import { FS, FW, R, SP, useColors } from "../theme";
import { currentAuth, setAuth } from "../store/state";
import { useStore } from "../store/use-store";
import { signInWithGoogle, signInWithPassword } from "../api/sign-in";
import { signOut } from "../api/account";
import { currentSession } from "../api/session";

/** Server code to catalogue key. Unlisted codes are shown as themselves. */
const ERROR_KEY: Record<string, string> = {
  offline: "account.error.offline",
  cancelled: "account.error.cancelled",
  provider_disabled: "account.error.providerDisabled",
  validation_failed: "account.error.validationFailed",
  invalid_credentials: "account.error.invalidCredentials",
  bad_response: "account.error.badResponse",
  no_code: "account.error.badResponse",
};

const sentence = (code: string) =>
  ERROR_KEY[code] ? t(ERROR_KEY[code]) : t("account.signInFailed", { code });

export function AccountBlock() {
  const c = useColors();
  useStore();
  const auth = currentAuth();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const run = async (go: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await go();
      // The session is the api layer's; the screen reads back what it now
      // holds rather than trusting the reply it was handed.
      setAuth(currentSession());
      if (!res.ok && res.error) setProblem(sentence(res.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.block}>
      <Text style={[s.label, { color: c.muted }]}>{t("settings.sync")}</Text>

      {auth ? (
        <View
          style={[s.card, { borderColor: c.line, backgroundColor: c.panel }]}
        >
          <Text style={[s.email, { color: c.text }]} numberOfLines={1}>
            {auth.email ?? ""}
          </Text>
          <Pressable
            onPress={() =>
              run(async () => {
                await signOut();
                setProblem(t("account.phone.signedOut"));
                return { ok: true };
              })
            }
            disabled={busy}
            hitSlop={6}
          >
            <Text style={[s.action, { color: c.danger }]}>
              {t("account.signOut")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => run(signInWithGoogle)}
            disabled={busy}
            style={[
              s.card,
              s.centre,
              { borderColor: c.line, backgroundColor: c.panel },
              busy ? s.off : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={[s.email, { color: c.text }]}>
              {t("account.google")}
            </Text>
          </Pressable>

          {__DEV__ ? (
            <View style={s.dev}>
              <TextInput
                style={[
                  s.field,
                  {
                    backgroundColor: c["input-bg"],
                    borderColor: c.line,
                    color: c.text,
                  },
                ]}
                value={email}
                onChangeText={setEmail}
                placeholder={t("account.devEmail")}
                placeholderTextColor={c.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                accessibilityLabel={t("account.devEmail")}
              />
              <TextInput
                style={[
                  s.field,
                  {
                    backgroundColor: c["input-bg"],
                    borderColor: c.line,
                    color: c.text,
                  },
                ]}
                value={password}
                onChangeText={setPassword}
                placeholder={t("account.devPassword")}
                placeholderTextColor={c.faint}
                autoCapitalize="none"
                secureTextEntry
                accessibilityLabel={t("account.devPassword")}
              />
              <Pressable
                onPress={() => run(() => signInWithPassword(email, password))}
                disabled={busy || !email || !password}
                style={[
                  s.devGo,
                  { borderColor: c.line },
                  busy || !email || !password ? s.off : null,
                ]}
                accessibilityRole="button"
              >
                <Text style={[s.action, { color: c.muted }]}>
                  {t("account.devSignIn")}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {busy ? <ActivityIndicator color={c.muted} /> : null}
      {problem ? (
        <Text style={[s.problem, { color: c.muted }]}>{problem}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  block: { gap: SP.md },
  label: { fontSize: FS.sm, fontWeight: FW.semibold },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SP.xl,
    padding: SP.xl,
    borderRadius: R.panel,
    borderWidth: StyleSheet.hairlineWidth,
  },
  centre: { justifyContent: "center" },
  off: { opacity: 0.4 },
  email: { flexShrink: 1, fontSize: FS.md, fontWeight: FW.medium },
  action: { fontSize: FS.sm, fontWeight: FW.semibold },
  dev: { gap: SP.md },
  field: {
    minHeight: 38,
    borderRadius: R.panel,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    fontSize: FS.md,
  },
  devGo: {
    alignItems: "center",
    paddingVertical: SP.lg,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  problem: { fontSize: FS.sm },
});
