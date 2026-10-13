/** Screenshots of the crypt: sarcophagi in every state, a character's story, the ledger, the skull. */
export async function run({ shot, sleep, game }) {
  await sleep(500);
  // a necromancer some way into the game: two characters woken, one waiting, records kept
  await game(`(() => {
    const m = g.meta;
    m.characters = ["grabarz", "nekromanta", "medyk"];
    m.selected = "nekromanta";
    m.challenges = ["raise20", "kills250", "killCaptain"];
    m.echo = 41;
    Object.assign(m.stats, { runs: 7, wins: 0, deaths: 7, kills: 612, raised: 88, deepest: 3, bosses: ["executioner", "captain"] });
    m.unlocked = ["organ", "wick", "gravedirt"];
    return true;
  })()`);
  await game("g.enterHub()");
  await sleep(900);
  await shot("crypt");
  // standing at the lich's sarcophagus (waiting to be woken)
  await sleep(2500);
  await game("g.place(740, 345)");
  await sleep(600);
  await shot("crypt-sarcophagus");
  await game("g.place(520, 345)");
  await sleep(600);
  await shot("crypt-story");
  await game("g.show('ledger')");
  await sleep(400);
  await shot("crypt-ledger");
}
