import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCardLine, parseDecklist } from '../src/parse-deck.ts';

describe('parseCardLine', () => {
  it('remove código de edição, número de colecionador e marca de foil', () => {
    assert.deepEqual(parseCardLine('4 Lightning Bolt (STA) 42'), { quantity: 4, name: 'Lightning Bolt' });
    assert.deepEqual(parseCardLine('1 Sol Ring (CMR) 472 *F*'), { quantity: 1, name: 'Sol Ring' });
    assert.deepEqual(parseCardLine('2x Fatal Push'), { quantity: 2, name: 'Fatal Push' });
  });

  it('não confunde parênteses do nome da carta com edição', () => {
    assert.deepEqual(parseCardLine('1 B.F.M. (Big Furry Monster)'), { quantity: 1, name: 'B.F.M. (Big Furry Monster)' });
  });

  it('rejeita linhas sem quantidade', () => {
    assert.equal(parseCardLine('Lightning Bolt'), null);
    assert.equal(parseCardLine('0 Lightning Bolt'), null);
  });
});

describe('parseDecklist', () => {
  it('lê a exportação do Arena com seções e nome', () => {
    const deck = parseDecklist(
      [
        'About',
        'Name Mono Red',
        '',
        'Companion',
        '1 Lurrus of the Dream-Den (IKO) 226',
        '',
        'Deck',
        '4 Monastery Swiftspear (BRO) 144',
        '20 Mountain (DMU) 269',
        '',
        'Sideboard',
        '2 Roiling Vortex (ZNR) 156',
      ].join('\n'),
    );
    assert.equal(deck.name, 'Mono Red');
    assert.deepEqual(deck.main, [
      { name: 'Monastery Swiftspear', quantity: 4 },
      { name: 'Mountain', quantity: 20 },
    ]);
    assert.deepEqual(deck.sideboard, [
      { name: 'Lurrus of the Dream-Den', quantity: 1 },
      { name: 'Roiling Vortex', quantity: 2 },
    ]);
    assert.deepEqual(deck.warnings, []);
  });

  it('no formato do MTGO, a linha em branco separa o sideboard', () => {
    const deck = parseDecklist('4 Fatal Push\n4 Thoughtseize\n\n3 Duress\n', 'Teste');
    assert.equal(deck.name, 'Teste');
    assert.equal(deck.main.length, 2);
    assert.deepEqual(deck.sideboard, [{ name: 'Duress', quantity: 3 }]);
  });

  it('com cabeçalhos, linhas em branco não mudam de seção', () => {
    const deck = parseDecklist('Deck\n4 Fatal Push\n\n4 Thoughtseize\n');
    assert.equal(deck.main.length, 2);
    assert.equal(deck.sideboard.length, 0);
  });

  it('aceita "SB:", comandante, e soma linhas repetidas', () => {
    const deck = parseDecklist('Commander\n1 Atraxa, Grand Unifier\nDeck\n1 Sol Ring\n1 Sol Ring (C21) 263\nSB: 2 Duress');
    assert.deepEqual(deck.commander, [{ name: 'Atraxa, Grand Unifier', quantity: 1 }]);
    assert.deepEqual(deck.main, [{ name: 'Sol Ring', quantity: 2 }]);
    assert.deepEqual(deck.sideboard, [{ name: 'Duress', quantity: 2 }]);
  });

  it('guarda as linhas que não entendeu', () => {
    const deck = parseDecklist('4 Fatal Push\nisto não é uma carta');
    assert.deepEqual(deck.warnings, ['isto não é uma carta']);
  });
});
