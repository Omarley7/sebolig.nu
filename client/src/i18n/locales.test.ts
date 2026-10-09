import { expect, it } from "vitest";
import da from "~/i18n/locales/da.json";
import en from "~/i18n/locales/en.json";

/** Every dot-path in a message tree, with its value. */
function entries(tree: object, prefix = ""): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    value !== null && typeof value === "object"
      ? entries(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  );
}

it("Danish and English have exactly the same messages", () => {
  const daKeys = entries(da).map(([key]) => key).sort();
  const enKeys = entries(en).map(([key]) => key).sort();

  expect(enKeys).toEqual(daKeys);
});

it("no message is empty", () => {
  const empty = [...entries(da), ...entries(en)].filter(([, value]) => typeof value !== "string" || value.trim() === "");

  expect(empty).toEqual([]);
});
