import { describe, expect, test } from "vitest";

import { cn } from "../cn.js";

describe("cn", () => {
  test("joins the parts that are there", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });

  test("drops what a conditional left behind", () => {
    const error = false;
    const open = true;
    expect(cn("toast", error && "text-danger", open && "opacity-100")).toBe(
      "toast opacity-100",
    );
    expect(cn("flex", null, undefined, "", false, "gap-md")).toBe(
      "flex gap-md",
    );
  });

  test("normalises spacing, so a hand-written gap cannot weld two names", () => {
    // The failure this prevents: "px-md" + "py-md" -> "px-mdpy-md", a class
    // that matches nothing and looks almost right.
    expect(cn("  flex   gap-md ", "\np-lg")).toBe("flex gap-md p-lg");
  });

  test("nothing at all is an empty string, not the word undefined", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });

  test("the last of two conflicting utilities wins", () => {
    // Without a merge this is decided by the order Tailwind emitted them in,
    // which is not the order they are written in here.
    expect(cn("p-md", "p-lg")).toBe("p-lg");
    expect(cn("bg-panel", "bg-accent")).toBe("bg-accent");
    expect(cn("rounded-sm", "rounded-pill")).toBe("rounded-pill");
    expect(cn("shadow-pop", "shadow-toast")).toBe("shadow-toast");
  });

  test("a caller's className overrides the component's own", () => {
    // This is what cn is for: the component states a default and the call site
    // can actually change it.
    const own = "flex items-center gap-md rounded-md bg-panel px-lg py-md";
    expect(cn(own, "bg-accent px-2xl")).toBe(
      "flex items-center gap-md rounded-md py-md bg-accent px-2xl",
    );
  });

  test("a size and a colour are different properties, including text-md", () => {
    // The ambiguous one. `md` is not a size in default Tailwind, so an
    // unconfigured merge files text-md as a colour and then drops the size
    // here instead of leaving both.
    expect(cn("text-md", "text-muted")).toBe("text-md text-muted");
    expect(cn("text-danger", "text-muted")).toBe("text-muted");
    expect(cn("text-sm", "text-md")).toBe("text-md");
  });

  test("different axes of the same property do not collide", () => {
    expect(cn("px-md", "py-lg")).toBe("px-md py-lg");
    expect(cn("p-md", "px-lg")).toBe("p-md px-lg");
  });
});
