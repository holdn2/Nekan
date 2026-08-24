import { describe, expect, test } from "vitest";

import { cn } from "../cn.js";

describe("cn", () => {
  test("joins the parts that are there", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  test("drops what a conditional left behind", () => {
    const error = false;
    const open = true;
    expect(cn("toast", error && "text-danger", open && "opacity-100")).toBe(
      "toast opacity-100",
    );
    expect(cn("a", null, undefined, "", false, "b")).toBe("a b");
  });

  test("normalises spacing, so a hand-written gap cannot weld two names", () => {
    // The failure this exists to prevent: "px-md" + "py-md" -> "px-mdpy-md",
    // a class that matches nothing and looks almost right.
    expect(cn("  a   b ", "\nc")).toBe("a b c");
    expect(cn("a b", "c d")).toBe("a b c d");
  });

  test("nothing at all is an empty string, not the word undefined", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });

  test("it does not resolve conflicts, and that is documented rather than fixed", () => {
    // Kept as a test so the behaviour is stated somewhere executable: the
    // answer to two paddings is to not pass two paddings.
    expect(cn("p-md", "p-lg")).toBe("p-md p-lg");
  });
});
