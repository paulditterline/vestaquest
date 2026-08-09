import {
  CHARACTER_CODE,
  presentCell,
  toReadableRows,
  type BoardShell,
  type FlagshipLayout,
} from '@vestaquest/board';

type FlapCellProps = Readonly<{
  code: FlagshipLayout[number][number];
  row: number;
  column: number;
  shell: BoardShell;
  showCode: boolean;
  changed: boolean;
}>;

function FlapCell({
  code,
  row,
  column,
  shell,
  showCode,
  changed,
}: FlapCellProps) {
  const presentation = presentCell(code);
  const color =
    code === CHARACTER_CODE.FILLED
      ? shell === 'black'
        ? '#eee9dc'
        : '#191919'
      : presentation.color;
  const style = color
    ? ({ '--tile-color': color } as React.CSSProperties)
    : undefined;

  return (
    <span
      aria-hidden="true"
      className={`flap-cell flap-cell--${presentation.kind}${changed ? ' flap-cell--changed' : ''}`}
      data-code={code}
      data-column={column}
      data-row={row}
      style={style}
      title={`Row ${row + 1}, column ${column + 1}: ${presentation.label} (${code})`}
    >
      <span className="flap-cell__glyph">{presentation.text}</span>
      {showCode ? <span className="flap-cell__code">{code}</span> : null}
    </span>
  );
}

export type FlagshipSimulatorProps = Readonly<{
  layout: FlagshipLayout;
  baseline?: FlagshipLayout;
  shell: BoardShell;
  showCodes: boolean;
  summary: string;
}>;

export function FlagshipSimulator({
  layout,
  baseline,
  shell,
  showCodes,
  summary,
}: FlagshipSimulatorProps) {
  const readableRows = toReadableRows(layout);

  return (
    <figure className="simulator" data-shell={shell}>
      <div className="simulator__brand" aria-hidden="true">
        VESTABOARD
      </div>
      <div className="board-grid" data-testid="board-grid">
        {layout.map((row, rowIndex) => (
          <div className="board-row" data-testid="board-row" key={rowIndex}>
            {row.map((code, columnIndex) => (
              <FlapCell
                changed={
                  baseline !== undefined &&
                  baseline[rowIndex]?.[columnIndex] !== code
                }
                code={code}
                column={columnIndex}
                key={`${rowIndex}-${columnIndex}`}
                row={rowIndex}
                shell={shell}
                showCode={showCodes}
              />
            ))}
          </div>
        ))}
      </div>
      <figcaption>{summary}</figcaption>
      <details className="accessible-layout">
        <summary>Readable layout and color legend</summary>
        <pre>{readableRows.join('\n')}</pre>
        <p>
          Lowercase developer symbols: r red, o orange, y yellow, g green, b
          blue, v violet, w white, k black, f filled. A middle dot is blank.
        </p>
      </details>
    </figure>
  );
}
