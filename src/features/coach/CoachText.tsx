import type { ReactNode } from 'react';

const BULLET = /^\s*(?:[-*•])\s+(.*)$/;

type Block = { kind: 'text'; lines: string[] } | { kind: 'list'; items: string[] };

/** Splits a reply into paragraphs and bullet lists. Nothing else is interpreted: no markdown, no HTML, no links. */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split(/\r?\n/)) {
    const bullet = BULLET.exec(line);
    const last = blocks.at(-1);
    if (line.trim() === '') {
      if (last) blocks.push({ kind: 'text', lines: [] }); // a blank line ends the block
      continue;
    }
    if (bullet) {
      if (last?.kind === 'list') last.items.push(bullet[1] ?? '');
      else blocks.push({ kind: 'list', items: [bullet[1] ?? ''] });
    } else if (last?.kind === 'text') last.lines.push(line.trim());
    else blocks.push({ kind: 'text', lines: [line.trim()] });
  }
  return blocks.filter((block) =>
    block.kind === 'list' ? block.items.length > 0 : block.lines.length > 0,
  );
}

/**
 * What the coach said, as text. It is shown as React text, never as markup, so nothing in a reply can add a
 * link, an image or a script; lines that start with "- " become a list.
 */
export function CoachText({ text }: { text: string }): ReactNode {
  return (
    <div className="flex flex-col gap-2 text-body">
      {blocksOf(text).map((block, index) =>
        block.kind === 'list' ? (
          <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.lines.join(' ')}</p>
        ),
      )}
    </div>
  );
}
