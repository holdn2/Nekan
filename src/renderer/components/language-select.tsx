/**
 * The language picker, on both screens that offer one.
 *
 * Two of them exist because the settings panel is behind the gear and the gear
 * is behind the first-run card, which covers the whole window. Somebody whose
 * computer opened the app in a language they cannot read would otherwise have
 * to answer where their tasks live before they could ask for words they
 * understand.
 *
 * Both read the same answer rather than being kept in step. There used to be a
 * Set of every <select> on screen and a loop that wrote the new value into each
 * of them on a switch -- one more thing to remember, and this component is the
 * whole of what replaced it: setLanguage() rings the render bus, both pickers
 * re-read currentLanguage(), and a third one added tomorrow needs no wiring.
 *
 * The options come from preload, so adding a language means adding a catalogue
 * and nothing else. Each is named in its own language: a person looking for
 * theirs is looking for a word they recognise, not for its name written in a
 * script they cannot read -- which is exactly the state they are in here.
 *
 * The look is here rather than at the two call sites, and that settles an
 * ordering the stylesheets used to carry: `.settings-select` was defined in
 * settings.css and welcome.css was loaded straight after it so the first-run
 * card could paint over the picker. Nothing overpaints anything now -- the card
 * adds where the picker sits and this decides what it looks like -- so that
 * one line of cascade is gone rather than moved.
 *
 * As of 2026-08-26 (docs/DECISIONS.md) this is Radix Select rather than a real
 * <select>. A native dropdown was the one piece of chrome this app could never
 * paint -- Windows draws it in the OS's own colours, dark text and all, no
 * matter what the trigger underneath looks like. Radix draws every pixel, so
 * the popup is a component like any other in the palette, and it keeps the
 * accessibility a plain <select> gave away for free: arrow keys move the
 * highlight, typing a letter jumps to it, Enter commits, Escape closes without
 * changing anything. That behaviour is the library's claim, not a fact --
 * verified over CDP rather than trusted (see the commit this file landed in).
 *
 * ChevronDown and Check come from lucide-react, not react/icons.tsx. The
 * chevron that already lives there is the inbox fold arrow: it points sideways
 * at rest and carries a rotation and a hover colour that belong to that one
 * button, not to a dropdown indicator. Drawing a second, unrelated icon here
 * was simpler than bending that one to a shape it was not built for.
 */

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { t, currentLanguage, setLanguage } from "../i18n.js";
import { cn } from "../react/cn.js";
import { useRenderSignal } from "../react/use-store.js";

interface Props {
  id: string;
  /** Where it sits, when a caller has an opinion. The look is not a caller's. */
  className?: string;
  /** Only where there is no <label> pointing at it -- see the settings row. */
  ariaLabel?: string;
}

export function LanguageSelect({ id, className, ariaLabel }: Props) {
  useRenderSignal();

  const languages: string[] = window.api.languages || [];

  return (
    <Select.Root
      value={currentLanguage()}
      onValueChange={(next) => {
        setLanguage(next);
        // Main keeps its own i18next and writes the choice to settings, so the
        // next launch paints in this language before the window exists.
        window.api.setLanguage(next);
      }}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        // Shaped like the export button beside it so the row reads as one kind
        // of control. Everything below the border is Radix's own DOM now, so
        // nothing here reaches into a UA stylesheet the way the old <select>
        // and its <option>s did.
        className={cn(
          "inline-flex cursor-pointer items-center gap-sm rounded-md border",
          "border-line bg-transparent px-lg py-xs font-[inherit] text-sm",
          "text-text outline-none hover:border-muted",
          "data-[state=open]:border-muted",
          className,
        )}
      >
        <Select.Value />
        <Select.Icon aria-hidden="true">
          <ChevronDown size={12} strokeWidth={1.75} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          align="start"
          sideOffset={4}
          className={cn(
            "z-70 overflow-hidden rounded-md border border-line bg-panel",
            "shadow-pop",
            // The trigger sits inside the title bar's drag region on the
            // first-run card (welcome.tsx), and this popup opens right under
            // it. The drag region is a rectangle computed from every element
            // marked -webkit-app-region:drag, painted over or not, so a popup
            // that lands on top of it still needs its own no-drag or a click
            // inside it moves the window instead of picking a language.
            "[-webkit-app-region:no-drag]",
          )}
        >
          <Select.Viewport className="p-2xs">
            {languages.map((code) => (
              <Select.Item
                key={code}
                value={code}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-lg",
                  "rounded-sm px-md py-xs text-sm text-text outline-none",
                  "data-[highlighted]:bg-hover",
                )}
              >
                <Select.ItemText>{t(`language.${code}`)}</Select.ItemText>
                <Select.ItemIndicator className="text-accent">
                  <Check size={12} strokeWidth={2} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
