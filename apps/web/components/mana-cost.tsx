const COLOR_CLASS: Record<string, string> = { W: 'mana-W', U: 'mana-U', B: 'mana-B', R: 'mana-R', G: 'mana-G' };

/** Custo de mana como o Scryfall escreve ("{1}{R}{G}") desenhado em símbolos redondos. */
export function ManaCost({ cost }: { cost: string }) {
  if (!cost) return null;
  // Cartas de duas faces trazem um custo por face, separados por " // ".
  const faces = cost.split(' // ');
  return (
    <span className="mana-cost" role="img" aria-label={`Custo de mana: ${cost}`}>
      {faces.map((face, faceIndex) => (
        <span key={faceIndex} className="mana-face">
          {faceIndex > 0 && <span className="muted"> // </span>}
          {(face.match(/\{[^}]+\}/g) ?? []).map((symbol, index) => {
            const value = symbol.slice(1, -1);
            const colored = COLOR_CLASS[value];
            // Símbolos de uma cor só viram o ponto colorido; os demais (números, X, híbridos) vão escritos.
            return (
              <i key={index} className={`symbol ${colored ?? 'mana-C'}`}>
                {colored ? '' : value}
              </i>
            );
          })}
        </span>
      ))}
    </span>
  );
}
