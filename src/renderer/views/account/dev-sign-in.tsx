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
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";

/**
 * Both fields, which share a line and give up width before anything else.
 *
 * ui/input brings the fill, the hairline, the focus ring and the placeholder
 * colour; what is left here is the three things that are about this row rather
 * than about a text field:
 *
 *   flex-[1_1_120px]  the two share a line and shrink together. ui/input is
 *                     `w-full`, and a flex item's basis wins over its width,
 *                     so the two do not fight.
 *   text-sm           the port reads text-md (13px), which is the body size.
 *                     These two have always been 12px, the same rung as the
 *                     panel's own labels. (The scale here is xs 11 / sm 12 /
 *                     md 13 / lg 14 / xl 16, not Tailwind's.)
 *
 * The `min-w-[0px]` that used to be here is the port's own now -- it wrote
 * `min-w-0`, which does not compile without a numeric spacing scale, so the
 * fields stopped shrinking at their content and pushed the form past the
 * 320px panel.
 */
const FIELD = "flex-[1_1_120px] text-sm";

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
      <Input
        className={FIELD}
        id="devEmail"
        type="email"
        value={dev.email}
        onChange={(e) => setDev({ ...dev, email: e.target.value })}
        placeholder={t("account.devEmail")}
        autoComplete="off"
      />
      <Input
        className={FIELD}
        id="devPassword"
        type="password"
        value={dev.password}
        onChange={(e) => setDev({ ...dev, password: e.target.value })}
        placeholder={t("account.devPassword")}
        autoComplete="off"
      />
      <Button
        className="basis-full text-muted"
        variant="outline"
        size="sm"
        type="submit"
      >
        {t("account.devSignIn")}
      </Button>
    </form>
  );
}
