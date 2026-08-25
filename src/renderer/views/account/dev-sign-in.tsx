/**
 * The password form, which the shipped app does not have.
 *
 * main/ipc/auth.ts registers auth:login only outside a packaged build, and
 * state:load says so; this is offered on that answer alone. It exists because
 * syncing has to be verifiable without a person clicking a consent screen --
 * removing it would leave no way to test the sync loop automatically.
 *
 * It wraps, because this block lives in a 320px panel rather than in the width
 * of the guide it came from: the two fields share a line and the button takes
 * one of its own.
 */

import { useState } from "react";
import { t } from "../../i18n.js";

/** Both fields, which share a line and give up width before anything else. */
const FIELD =
  "flex-[1_1_120px] min-w-[0px] rounded-xs border border-line bg-bg px-md py-xs text-sm text-text";

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
      // Not `border-dashed`: that sets border-style on all four sides, and the
      // three this form does not draw take their width from the UA's `medium`
      // the moment they stop being `none` -- a 2.4px box appears around the
      // form and everything below it moves down. The arbitrary property names
      // the one side, and it is emitted after `border-t`, so it wins.
      className="account-dev flex basis-full flex-wrap gap-sm border-t border-line [border-top-style:dashed] pt-lg"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(dev.email, dev.password);
      }}
    >
      {/* No font-family: an <input> does not inherit one and never did here,
          so asking for it now would change the face these two are drawn in.
          min-w-[0px] rather than min-w-0 -- there is no numeric spacing scale,
          so the numeric form compiles to nothing and the fields stop shrinking
          below their content. */}
      <input
        className={FIELD}
        id="devEmail"
        type="email"
        value={dev.email}
        onChange={(e) => setDev({ ...dev, email: e.target.value })}
        placeholder={t("account.devEmail")}
        autoComplete="off"
      />
      <input
        className={FIELD}
        id="devPassword"
        type="password"
        value={dev.password}
        onChange={(e) => setDev({ ...dev, password: e.target.value })}
        placeholder={t("account.devPassword")}
        autoComplete="off"
      />
      <button
        className="basis-full rounded-xs border border-line bg-transparent px-md py-xs text-sm text-muted"
        type="submit"
      >
        {t("account.devSignIn")}
      </button>
    </form>
  );
}
