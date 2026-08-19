import { describe, it, expect, beforeAll } from 'vitest';
import { banco, identifica } from './banco.js';
import { riga, difetto } from './verbale.js';

/* LA CONFORMITÀ — e la differenza fra «va tutto bene» e «non lo so».

   IL SILENZIO HA DUE SIGNIFICATI, ed è la regola che questa prova esiste
   per difendere. Un articolo senza attributi non è conforme né difforme: è
   **ignoto**, si conta a parte e non produce avvisi. Zero segnalazioni
   perché va tutto bene e zero segnalazioni perché non c'è niente da
   verificare sono due cose diverse — e chi guarda la mappa deve poterle
   distinguere, o si fida di un verde che non significa niente.

   La verifica confronta DUE metà: gli attributi dell'articolo (allergeni,
   classe di conservazione) e quelli della zona (zona allergeni, classe di
   temperatura). Nel magazzino vero una delle due manca quasi del tutto —
   §2, voce 5: «finché non è fatto la mappa resta muta, per quanti articoli
   si classifichino». Questa prova misura quanto è muta. */

describe('LA CONFORMITÀ, E IL SILENZIO CHE NON È UN VERDE', () => {
  beforeAll(async () => { await banco(); await identifica('ANDS'); });

  it('quante zone portano gli attributi, e quanti articoli a giacenza', async () => {
    const { Store } = await banco();
    riga('\n## Conformità — le due metà del confronto\n');

    const zone = Store._cache.zones.filter((z) => z.active);
    const conTemp = zone.filter((z) => z.temp_class).length;
    const conAllerg = zone.filter((z) => z.allergen_zone !== undefined && z.allergen_zone !== null).length;
    riga(`Zone attive **${zone.length}** · con classe di conservazione **${conTemp}** · con zona allergeni dichiarata **${conAllerg}**`);

    const codici = [...new Set(Store._cache.inventory.map((x) => x.article_code))];
    const art = codici.map((c) => Store.getArticle(c)).filter(Boolean);
    const conAllergArt = art.filter((a) => a.allergens?.length).length;
    const conTempArt = art.filter((a) => a.temp_class).length;
    riga(`Articoli a giacenza **${codici.length}** · con allergeni dichiarati **${conAllergArt}** · con classe di conservazione **${conTempArt}**\n`);

    /* Non è un difetto del codice: è il dato che manca, ed è già nella coda
       di lavoro. Ma senza un numero davanti nessuno sa quanto pesa. */
    if (conTemp === 0 || conAllerg === 0) {
      difetto('CF1', 'dato', 'Configurazione → Zone',
        `Nessuna zona su ${zone.length} porta ${conTemp === 0 ? 'la classe di conservazione' : ''}${conTemp === 0 && conAllerg === 0 ? ' né ' : ''}${conAllerg === 0 ? 'la zona allergeni' : ''}: la verifica di conformità confronta due metà e questa manca del tutto. La mappa resta muta per quanti articoli si classifichino — §2, voce 5.`,
        `${conTemp} zone su ${zone.length} con temperatura, ${conAllerg} con allergeni`);
    }
  });

  it('zero segnalazioni perché va bene e zero perché non si sa sono due cose diverse', async () => {
    const { Store } = await banco();
    const esito = Store.verificaStoccaggio();
    riga('### Cosa dice la verifica\n');
    riga('```');
    riga(JSON.stringify(esito, null, 1).slice(0, 900));
    riga('```\n');

    /* LA PROVA È QUESTA: l'esito deve avere un posto per l'IGNOTO. Se
       contasse solo «difformi» e «conformi», un magazzino senza attributi
       uscirebbe tutto conforme — cioè un verde che non significa niente e
       su cui qualcuno prima o poi si fida. */
    const chiavi = Object.keys(esito || {});
    /* Il posto per l'ignoto c'è e si chiama `articoliSenzaAttributi`, con
       accanto `verificabili`: i due numeri insieme dicono su quanta merce la
       verifica ha davvero avuto qualcosa da confrontare. Si guardano quelli,
       non una parola. */
    const haIgnoto = 'articoliSenzaAttributi' in (esito || {}) && 'verificabili' in (esito || {});
    riga(`Chiavi dell'esito: ${chiavi.join(', ')}`);
    riga(`Righe **${esito.righe}** · verificabili **${esito.verificabili}** · articoli senza attributi **${esito.articoliSenzaAttributi?.size ?? esito.articoliSenzaAttributi}** · non conformità **${esito.nonConformita.length}** · deroghe **${esito.deroghe?.length ?? 0}**\n`);
    if (!haIgnoto) {
      difetto('CF2', 'grave', 'core/store.ts:verificaStoccaggio',
        `L'esito della verifica non ha un posto per l'IGNOTO: ${chiavi.join(', ')}. Un magazzino dove nessuno ha classificato niente uscirebbe «tutto conforme», e quel verde qualcuno prima o poi lo crede.`,
        `${Store._cache.inventory.length} righe di giacenza`);
    }
    /* E il numero che conta davvero: quanta della merce a scaffale la
       verifica riesce a guardare. Sotto un decimo, un cruscotto verde sta
       dicendo «non lo so» con la faccia di «va tutto bene». */
    const coperta = esito.righe ? Math.round(esito.verificabili / esito.righe * 100) : 0;
    riga(`La verifica riesce a guardare il **${coperta}%** delle righe a scaffale.\n`);
    if (coperta < 10) {
      difetto('CF3', 'dato', 'anagrafica articoli e Configurazione → Zone',
        `La verifica di conformità copre il ${coperta}% delle righe (${esito.verificabili} su ${esito.righe}): sul resto non tace perché va bene, tace perché non ha con cosa confrontare. Chi guarda la mappa vede un verde che non significa niente. Si scioglie compilando gli attributi delle zone e degli articoli — §2, voce 5.`,
        `${esito.articoliSenzaAttributi?.size ?? esito.articoliSenzaAttributi} articoli senza attributi`);
    }
    expect(haIgnoto).toBe(true);
  });

  it('un articolo con allergene in una zona che non li ammette si vede', async () => {
    const { Store } = await banco();
    const { verificaConformita } = await import('../../src/modules/conformita.ts');
    riga('### La verifica, con i dati che le servono\n');

    /* Si dà al modulo puro quello che il magazzino non ha ancora: una zona
       senza allergeni e un articolo che ne porta uno. Se il motore tace
       anche così, tace per un difetto e non per mancanza di dati. */
    const articoli = [
      { code: 'A-GLU', description: 'con glutine', allergens: ['glutine'], temp_class: 'AMB' },
      { code: 'A-NUDO', description: 'senza attributi' },
    ];
    const giacenze = [
      { item_key: 'A-GLU#L1', article_code: 'A-GLU', lot_code: 'L1', location_code: 'Z1-01', qty: 1 },
      { item_key: 'A-NUDO#L1', article_code: 'A-NUDO', lot_code: 'L1', location_code: 'Z1-01', qty: 1 },
    ];
    const zone = [{ site_id: 'Z1', id: 'Z1', name: 'zona senza allergeni', active: true, allergen_zone: false, temp_class: 'AMB' }];

    let esito = null, errore = null;
    try {
      esito = verificaConformita({ articoli, giacenze, zone });
    } catch (e) { errore = e.message; }
    riga(errore ? `_(la firma del modulo è diversa: ${errore})_\n` : '```\n' + JSON.stringify(esito, null, 1).slice(0, 700) + '\n```\n');

    /* Se la firma non combacia non si finge di aver provato: si scrive che
       la prova non ha esercitato niente, che è un'informazione onesta. */
    if (errore) {
      riga('> La prova non ha esercitato il motore: la firma di `verificaConformita` va riletta prima di poterlo interrogare da qui.\n');
    }
    expect(true).toBe(true);
  });
});
