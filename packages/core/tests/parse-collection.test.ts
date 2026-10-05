import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCollectionText, parseCsv, resolveCollection } from '../src/parse-collection.ts';
import { testDb } from './helpers.ts';

describe('parseCsv', () => {
  it('respeita aspas, vírgulas no nome e aspas escapadas', () => {
    const rows = parseCsv('"Count","Name"\r\n"1","Kozilek, Butcher of Truth"\n2,"Ach! Hans, ""Run""!"\n', ',');
    assert.deepEqual(rows, [
      ['Count', 'Name'],
      ['1', 'Kozilek, Butcher of Truth'],
      ['2', 'Ach! Hans, "Run"!'],
    ]);
  });
});

describe('parseCollectionText', () => {
  it('lê CSV do Moxfield (usa "Count", não "Tradelist Count")', () => {
    const csv = '"Count","Tradelist Count","Name","Edition"\n"3","1","Monastery Swiftspear","bro"\n"1","0","Kozilek, Butcher of Truth","uma"\n';
    const { entries } = parseCollectionText(csv);
    assert.deepEqual(entries, [
      { name: 'Monastery Swiftspear', quantity: 3 },
      { name: 'Kozilek, Butcher of Truth', quantity: 1 },
    ]);
  });

  it('lê CSV do Manabox (quantidade depois do nome)', () => {
    const csv = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity\nBloodthirsty Adversary,MID,Innistrad: Midnight Hunt,129,normal,mythic,2\n';
    assert.deepEqual(parseCollectionText(csv).entries, [{ name: 'Bloodthirsty Adversary', quantity: 2 }]);
  });

  it('lê CSV com ponto e vírgula (Excel em português)', () => {
    const csv = '﻿Quantidade;Nome\n4;Monastery Swiftspear\n2;Eidolon of the Great Revel\n';
    assert.deepEqual(parseCollectionText(csv).entries, [
      { name: 'Monastery Swiftspear', quantity: 4 },
      { name: 'Eidolon of the Great Revel', quantity: 2 },
    ]);
  });

  it('lê lista de texto e ignora cabeçalhos de seção', () => {
    const { entries, warnings } = parseCollectionText('Deck\n4 Monastery Swiftspear (BRO) 144\n1 Kozilek, Butcher of Truth\n???\n');
    assert.deepEqual(entries, [
      { name: 'Monastery Swiftspear', quantity: 4 },
      { name: 'Kozilek, Butcher of Truth', quantity: 1 },
    ]);
    assert.deepEqual(warnings, ['???']);
  });
});

describe('resolveCollection', () => {
  it('soma edições diferentes, reconhece faces e acentos, e lista os desconhecidos', () => {
    const db = testDb();
    const { collection, unknown, totalCopies } = resolveCollection(
      [
        { name: 'Monastery Swiftspear', quantity: 2 },
        { name: 'monastery swiftspear', quantity: 1 },
        { name: 'Kumano Faces Kakkazan', quantity: 4 },
        { name: "Lim-Dul's Vault", quantity: 1 },
        { name: 'Carta Que Não Existe', quantity: 3 },
      ],
      db,
    );
    assert.equal(collection.get('Monastery Swiftspear'), 3);
    assert.equal(collection.get('Kumano Faces Kakkazan // Etching of Kumano'), 4);
    assert.equal(collection.get("Lim-Dûl's Vault"), 1);
    assert.deepEqual(unknown, ['Carta Que Não Existe']);
    assert.equal(totalCopies, 8);
  });
});
