/**
 * The password form, which the shipped app does not have.
 *
 * main/ipc/auth.ts registers auth:login only outside a packaged build, and
 * state:load says so; this is offered on that answer alone. It exists because
 * syncing has to be verifiable without a person clicking a consent screen --
 * removing it would leave no way to test the sync loop automatically.
 */

import { useState } from "react";
import { t } from "../../i18n.js";

interface Props {
  /**
   * The panel signs in, not this form. It owns the busy flag, the message
   * line, and -- the part worth saying out loud -- whether the local tasks are
   * merged into the account or set aside. That answer belongs to the checkbox
   * above this form, so the two fields are all that go up from here.
   */
  onSubmit: (email: string, password: string) => void;
}

export function DevSignIn({ onSubmit }: Props) {
  const [dev, setDev] = useState({ email: "", password: "" });

  return (
    <form
      className="account-dev"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(dev.email, dev.password);
      }}
    >
      <input
        id="devEmail"
        type="email"
        value={dev.email}
        onChange={(e) => setDev({ ...dev, email: e.target.value })}
        placeholder={t("account.devEmail")}
        autoComplete="off"
      />
      <input
        id="devPassword"
        type="password"
        value={dev.password}
        onChange={(e) => setDev({ ...dev, password: e.target.value })}
        placeholder={t("account.devPassword")}
        autoComplete="off"
      />
      <button type="submit">{t("account.devSignIn")}</button>
    </form>
  );
}
