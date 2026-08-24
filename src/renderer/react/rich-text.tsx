/**
 * A translated string with its `<b>` / `<em>` / `<code>` made real.
 *
 * The React twin of tNodes(). Same three tags and no others, and the same
 * reason: this parses rather than assigning to innerHTML, so a catalogue value
 * can never introduce an element or an attribute that is not on the list.
 *
 * Which tag it is and where it falls both move with the language -- "계정과
 * <b>서버에 있는 사본</b>을 지웁니다" puts the bold in a different place from
 * its English -- so the markup has to live in the string rather than around it.
 */

import { Fragment } from "react";
import { t } from "../i18n.js";

const INLINE = /<(b|em|code)>([\s\S]*?)<\/\1>/g;

export function RichText({
  k,
  params,
}: {
  k: string;
  params?: Record<string, unknown>;
}) {
  const text = t(k, params);
  const out: React.ReactNode[] = [];
  let at = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > at) out.push(text.slice(at, index));
    const Tag = match[1] as "b" | "em" | "code";
    out.push(<Tag key={`${index}`}>{match[2]}</Tag>);
    at = index + match[0].length;
  }
  if (at < text.length) out.push(text.slice(at));

  return (
    <>
      {out.map((piece, i) => (
        <Fragment key={i}>{piece}</Fragment>
      ))}
    </>
  );
}
