/**
 * The ported card (ui/card.tsx). Nothing imports it yet -- see that file's
 * comment -- so this is the only thing proving every slot renders and that
 * the `size` prop actually reaches `data-size`.
 */

import { expect, test } from "vitest";
import { mount } from "../../react/testing.js";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card.js";

test("every slot renders with its data-slot marker and its own text", async () => {
  await mount(
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
        <CardAction>Action</CardAction>
      </CardHeader>
      <CardContent>Body</CardContent>
      <CardFooter>Footer</CardFooter>
    </Card>,
  );
  expect(document.querySelector('[data-slot="card"]')).not.toBeNull();
  expect(document.querySelector('[data-slot="card-header"]')).not.toBeNull();
  expect(document.querySelector('[data-slot="card-title"]')!.textContent).toBe(
    "Title",
  );
  expect(
    document.querySelector('[data-slot="card-description"]')!.textContent,
  ).toBe("Description");
  expect(document.querySelector('[data-slot="card-action"]')!.textContent).toBe(
    "Action",
  );
  expect(
    document.querySelector('[data-slot="card-content"]')!.textContent,
  ).toBe("Body");
  expect(document.querySelector('[data-slot="card-footer"]')!.textContent).toBe(
    "Footer",
  );
});

test("size defaults to 'default' and shows up as data-size", async () => {
  await mount(<Card>plain</Card>);
  expect(
    document.querySelector('[data-slot="card"]')!.getAttribute("data-size"),
  ).toBe("default");
});

test("size='sm' is reflected on data-size", async () => {
  await mount(<Card size="sm">plain</Card>);
  expect(
    document.querySelector('[data-slot="card"]')!.getAttribute("data-size"),
  ).toBe("sm");
});

test("a caller's className is appended, not dropped", async () => {
  await mount(<Card className="my-marker">plain</Card>);
  expect(
    document
      .querySelector('[data-slot="card"]')!
      .classList.contains("my-marker"),
  ).toBe(true);
});
