import { ReactNode } from 'react';

// Tiny markdown-flavored parser for the Master Services Agreement format.
// Recognized line prefixes:
//   `# Title`            → document title
//   `## N. SECTION`      → numbered section banner
//   `### Subsection`     → subsection label
//   `- text`             → bullet (supports **bold** inline)
//   `| a | b | c |`      → table row (contiguous runs become one table;
//                          the first row of each run is the header)
//   `> caption`          → italic caption / footnote
//   anything else        → paragraph
// Blank lines separate blocks. Inline **bold** is supported.

type Block =
  | { kind: 'title'; text: string }
  | { kind: 'caption'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'subsection'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'paragraph'; text: string };

function parseTerms(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ kind: 'title', text: line.slice(2).trim() });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'section', text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'subsection', text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push({ kind: 'caption', text: line.slice(2).trim() });
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2).trim());
        i++;
      }
      blocks.push({ kind: 'bullets', items });
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        const cells = lines[i]
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        rows.push(cells);
        i++;
      }
      blocks.push({ kind: 'table', rows });
      continue;
    }
    // Plain paragraph: collect a run of non-blank, non-special lines so the
    // PDF text reflows into a single block (otherwise mid-paragraph wraps in
    // the source file become visible line breaks).
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (
        next.startsWith('# ') ||
        next.startsWith('## ') ||
        next.startsWith('### ') ||
        next.startsWith('> ') ||
        next.startsWith('- ') ||
        (next.startsWith('|') && next.endsWith('|'))
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  // Split on **bold** runs; everything else is plain text.
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={key++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RenderedTerms({ content }: { content: string }) {
  const blocks = parseTerms(content);
  return (
    <div className="space-y-5">
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case 'title':
            return (
              <h1
                key={idx}
                className="text-3xl md:text-4xl font-bold text-foreground mb-1"
              >
                {b.text}
              </h1>
            );
          case 'caption':
            return (
              <p
                key={idx}
                className="text-sm italic text-muted-foreground border-l-2 border-primary/40 pl-3"
              >
                {renderInline(b.text)}
              </p>
            );
          case 'section':
            return (
              <div
                key={idx}
                className="mt-8 mb-2 rounded-md bg-primary px-4 py-3 text-primary-foreground"
              >
                <h2 className="text-base md:text-lg font-bold uppercase tracking-wide">
                  {b.text}
                </h2>
              </div>
            );
          case 'subsection':
            return (
              <h3
                key={idx}
                className="text-base font-semibold text-primary mt-4 mb-1"
              >
                {b.text}
              </h3>
            );
          case 'bullets':
            return (
              <ul key={idx} className="list-disc pl-6 space-y-1.5 text-sm leading-relaxed">
                {b.items.map((it, i) => (
                  <li key={i}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case 'table': {
            const [header, ...body] = b.rows;
            return (
              <div key={idx} className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {header.map((c, i) => (
                        <th
                          key={i}
                          className="bg-primary text-primary-foreground text-left text-xs uppercase tracking-wide font-semibold px-3 py-2"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((row, ri) => (
                      <tr key={ri} className="border-b last:border-b-0">
                        {row.map((c, ci) => (
                          <td
                            key={ci}
                            className="px-3 py-2 align-top text-foreground/90"
                          >
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'paragraph':
            return (
              <p key={idx} className="text-sm leading-relaxed text-foreground/90">
                {renderInline(b.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
