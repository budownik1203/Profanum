/**
 * The narrator (design doc: Narrator): a low, theatrical voice with gallows humour that comments
 * on key moments. For now its lines are subtitles; recordings can replace them later.
 * Each kind of moment has a cooldown so the voice stays special.
 */
import { lang } from "./i18n.js";
import type { GameEvent } from "./game/types.js";

type Line = [pl: string, en: string];

const LINES: Record<string, Line[]> = {
  intro: [
    ["Spłonąłeś przy wiwatach tłumu. Popiół jednak pamięta.", "You burned to the cheers of the crowd. But ash remembers."],
    ["Masowy grób jest płytki. Twoja zemsta sięga głębiej.", "The mass grave is shallow. Your vengeance runs deeper."],
    ["Wstań, heretyku. Miasto jeszcze nie skończyło świętować.", "Rise, heretic. The city has not finished celebrating."],
  ],
  "intro.grabarz": [
    ["Grabarz wstaje z grobu, który sam wykopał. Ironia ma swój urok.", "The gravedigger rises from a grave he dug himself. Irony has its charm."],
    ["Łopatę zamienił na pistolet. Robota została ta sama: chować ludzi.", "He traded the shovel for a pistol. The work is the same: putting people in the ground."],
  ],
  "intro.nekromanta": [
    ["Uczony wraca do lektury. Tym razem czyta z trupów.", "The scholar returns to his reading. This time he reads the dead."],
    ["Spalili jego księgi. Zapomnieli, że znał je na pamięć.", "They burned his books. They forgot he knew them by heart."],
  ],
  "intro.lisz": [
    ["Sto lat w grobie, a miasto wcale się nie zmieniło.", "A hundred years in the grave, and the city has not changed at all."],
    ["Wymazali jego imię z kronik. On pamięta wszystkie ich imiona.", "They scratched his name from the chronicles. He remembers all of theirs."],
  ],
  "intro.medyk": [
    ["Doktor przyjmuje. Bez umówienia i bez znieczulenia.", "The doctor is in. No appointment, no anaesthetic."],
    ["Leczył ich, gdy księża uciekli. Teraz przepisuje im coś mocniejszego.", "He healed them when the priests ran. Now he prescribes something stronger."],
  ],
  "intro.kaplan": [
    ["Ojciec wraca na swoją parafię. Ostatnie namaszczenie dla całego miasta.", "Father returns to his parish. Last rites for the whole city."],
    ["Spłonął z monstrancją w dłoniach. Monstrancja przetrwała. On też.", "He burned with the monstrance in his hands. The monstrance survived. So did he."],
  ],
  "intro.wiedzma": [
    ["Sznur pamięta każdą szyję. Czas przypomnieć je miastu.", "The rope remembers every neck. Time to remind the city."],
    ["Nie dała się powiesić. Nie da się też zapomnieć.", "She would not hang. Nor will she be forgotten."],
  ],
  "floor.cmentarz": [["Cmentarz. Tu kończą ci, których Kościół nie zdążył spalić.", "The cemetery. Where those the Church failed to burn end up."]],
  "floor.slumsy": [["Slumsy cuchną zarazą i strachem. Jedno i drugie ci służy.", "The slums reek of plague and fear. Both serve you well."]],
  "floor.kupiecka": [["Dzielnica kupców: tu wszystko ma cenę. Nawet dusza.", "The merchant quarter: everything has a price here. Even a soul."]],
  "floor.klasztor": [["Klasztor. Cisza modlitwy, którą zaraz przerwiesz.", "The monastery. A prayerful silence you are about to break."]],
  "floor.katedra": [["Katedra. Złoto, karmazyn i kłamstwo wyryte w kamieniu.", "The cathedral. Gold, crimson, and a lie carved in stone."]],
  "floor.sanktuarium": [["Pod ołtarzem coś oddycha. Coś, co nazywają świętym.", "Beneath the altar something breathes. Something they call holy."]],
  ambush: [
    ["Z mroku, jak przystało.", "From the dark, as it should be."],
    ["Nie zdążył nawet się przeżegnać.", "He never even crossed himself."],
    ["Cień uderza pierwszy.", "The shadow strikes first."],
  ],
  crit: [
    ["Celnie. Prochownia byłaby dumna.", "True aim. The powder house would be proud."],
    ["Kula znalazła duszę.", "The ball found a soul."],
  ],
  raise: [
    ["Wstań. Twoja służba dopiero się zaczyna.", "Rise. Your service has only begun."],
    ["Śmierć to tylko zmiana pracodawcy.", "Death is merely a change of employer."],
    ["Wczoraj strażnik, dziś twój.", "A guardsman yesterday, yours today."],
  ],
  legend: [["Przeklęta broń otwiera oczy. Ma swoje żądania.", "The cursed weapon opens its eyes. It has demands."]],
  ritual: [["Krew sługi wsiąka w żelazo. Legenda dojrzewa.", "The minion's blood soaks into the iron. The legend ripens."]],
  synergy: [
    ["Dwie przeklęte rzeczy zaczynają ze sobą szeptać.", "Two cursed things begin to whisper to each other."],
    ["Razem brzmią gorzej. Czyli lepiej.", "Together they sound worse. Which is to say, better."],
  ],
  abomination: [["Z wielu ciał jedno. Kościół nazwałby to bluźnierstwem. Ty nazywasz to rzemiosłem.", "From many bodies, one. The Church calls it blasphemy. You call it craft."]],
  chandelier: [["Niech światło spadnie im na głowy.", "Let the light fall upon their heads."]],
  window: [["Święte szkło sypie się jak grzechy.", "Holy glass falls like sins."]],
  bell: [["Dzwon! Teraz wiedzą wszyscy.", "The bell! Now they all know."]],
  mimic: [["Chciwość ma zęby.", "Greed has teeth."]],
  secret: [["Pod miastem jest drugie miasto. Umarłych.", "Beneath the city lies another. Of the dead."]],
  shop: [["Paser nie pyta, skąd masz złoto. Ty nie pytasz, skąd on ma resztę.", "The fence asks not where your gold came from. You ask not where his wares did."]],
  lowHealth: [
    ["Popiół kruszy się szybciej niż kość.", "Ash crumbles faster than bone."],
    ["Jeszcze jeden ogień i znów będziesz garstką prochu.", "One more fire and you are a handful of dust again."],
  ],
  death: [
    ["Znowu prochem. Ale proch pamięta drogę.", "Dust once more. But dust remembers the way."],
    ["Miasto wiwatuje. Po raz drugi.", "The city cheers. For the second time."],
    ["Śmierć nie jest końcem. Jest przerwą.", "Death is not the end. It is an intermission."],
  ],
  victory: [["Płomień zgasł. Nad miastem pierwszy raz od wieków zapada prawdziwa noc.", "The Flame is out. For the first time in ages, true night falls over the city."]],
  "boss.executioner": [["Kat Miejski. Ten sam, który podpalił twój stos. Pamięta cię.", "The City Executioner. The very one who lit your pyre. He remembers you."]],
  "boss.captain": [["Kapitan Straży. Porządek, dyscyplina, salwa.", "The Captain of the Watch. Order, discipline, volley."]],
  "boss.powdermaster": [["Mistrz Prochu. Jego śmiech pachnie siarką.", "The Powder Master. His laughter smells of sulphur."]],
  "boss.bishop": [["Biskup Procesji, niesiony na plecach wiernych. Zrzuć go.", "The Bishop of the Procession, carried on the backs of the faithful. Bring him down."]],
  "boss.grandinquisitor": [["Wielki Inkwizytor. Spalił więcej ludzi niż zaraza.", "The Grand Inquisitor. He has burned more than any plague."]],
  "boss.holyflame": [["Oto bóg, dla którego palili ludzi. Spójrz mu w oczy.", "Behold the god they burned men for. Look it in the eyes."]],
  bossDeath: [
    ["Kolejny święty, któremu zabrakło cudu.", "Another saint who ran out of miracles."],
    ["Upadł. Miasto traci jeszcze jedną świecę.", "Fallen. The city loses one more candle."],
  ],
  cleared: [
    ["Cisza. Tylko krew jeszcze kapie.", "Silence. Only the blood still drips."],
    ["Rzeźnia gotowa. Ściany pamiętają.", "The slaughterhouse is done. The walls remember."],
  ],
  relic: [["Relikwia drży w dłoni heretyka.", "The relic trembles in a heretic's hand."]],
  alarmed: [["Czekali. Ktoś ich ostrzegł.", "They were waiting. Someone warned them."]],
};

/** The talking skull in the crypt tells its story a line at a time. */
/** What the skull knows about the necromancer's progress (from the crypt's records). */
export interface SkullContext {
  runs: number;
  deaths: number;
  wins: number;
  deepest: number;
  bosses: string[];
}

/** The talking skull's story: advice first, then lines that open up as the necromancer gets further. */
export const SKULL_STORY: { line: Line; when?: (c: SkullContext) => boolean }[] = [
  { line: ["Witaj z powrotem, popiele. Krypta pamięta każdego, kto wrócił.", "Welcome back, ash. The crypt remembers everyone who returned."] },
  { line: ["Echo Dusz to wszystko, co zostaje po wyprawie. Wydawaj je mądrze na ołtarzu.", "The Echo of Souls is all a descent leaves behind. Spend it wisely at the altar."] },
  { line: ["W sarkofagach śpią inni, których Kościół spalił. Obudzą się, gdy udowodnisz swoje.", "Others the Church burned sleep in those sarcophagi. They wake once you prove yourself."] },
  { line: ["Gaś światło. W mroku twoje sługi rosną w siłę, a ty jesteś tylko cieniem.", "Put out the light. In the dark your minions grow strong and you are only a shadow."] },
  { line: ["Umarłeś. Witaj w klubie: jest nas tu więcej, niż myślisz.", "You died. Welcome to the club: there are more of us down here than you think."], when: (c) => c.deaths >= 1 },
  { line: ["Stos płonie świętym ogniem. Nie stój w nim, chyba że lubisz zapach własnego popiołu.", "The stake burns with holy fire. Don't stand in it, unless you like the smell of your own ash."] },
  { line: ["Kat Miejski nie żyje. Pierwszy raz ktoś mu się odwdzięczył.", "The City Executioner is dead. The first time anyone ever repaid him in kind."], when: (c) => c.bosses.includes("executioner") },
  { line: ["Szczątki przeklętej broni zanieś na ołtarz. Legenda kosztuje dusze, ale oddaje z nawiązką.", "Bring cursed weapon remains to an altar. A legend costs souls, but repays them."] },
  { line: ["Dzwonnika zabij pierwszego. Dzwon budzi sąsiednie pokoje.", "Kill the bellringer first. The bell wakes the rooms around."], when: (c) => c.deepest >= 2 },
  { line: ["Kapitan padł. Straż bez kapitana to tylko ludzie z halabardami i złymi snami.", "The Captain has fallen. A watch without its captain is just men with halberds and bad dreams."], when: (c) => c.bosses.includes("captain") },
  { line: ["Pod każdym piętrem są katakumby. Szukaj pękniętych ścian i strzelaj w nie.", "There are catacombs under every floor. Look for cracked walls and shoot them."] },
  { line: ["Trzy trupy i trochę dusz: tyle trzeba, by zszyć abominację. Szwy są opcjonalne.", "Three corpses and a few souls: that's all an abomination takes. Stitches optional."] },
  { line: ["Mistrz Prochu wyleciał w powietrze. Zawsze mówiłem, że skończy z hukiem.", "The Powder Master went up. I always said he'd go out with a bang."], when: (c) => c.bosses.includes("powdermaster") },
  { line: ["Paser przyjmuje każde złoto. Nawet to wyjęte z kieszeni trupa.", "The fence takes any gold. Even from a dead man's pocket."] },
  { line: ["Klasztor... Byłem tam mnichem. Pod skryptorium jest cela, w której spisywano, czym się karmi Płomień.", "The monastery... I was a monk there. Under the scriptorium is a cell where they wrote down what the Flame feeds on."], when: (c) => c.deepest >= 4 },
  { line: ["Biskup spadł z lektyki. Wierni, którzy go nieśli, teraz niosą twoje rozkazy.", "The Bishop fell off his litter. The faithful who carried him now carry your orders."], when: (c) => c.bosses.includes("bishop") },
  { line: ["Mówią, że Święty Płomień to bóg. Widziałem, czym się karmi. Bogowie tak nie jedzą.", "They say the Holy Flame is a god. I saw what it feeds on. Gods do not eat like that."], when: (c) => c.deepest >= 4 },
  { line: ["Inkwizytor nie żyje, jego latarnia zgasła. Został już tylko On.", "The Inquisitor is dead and his lantern is out. Only It remains."], when: (c) => c.bosses.includes("grandinquisitor") },
  { line: ["Widziałeś go. Teraz rozumiesz, czemu nie mówię o nim głośno.", "You have seen it. Now you understand why I never speak of it aloud."], when: (c) => c.deepest >= 6 },
  { line: ["Płomień zgasł. Miasto pierwszy raz od stu lat śpi w ciemności. Myślisz, że jest wdzięczne?", "The Flame is out. For the first time in a hundred years the city sleeps in the dark. Do you think it is grateful?"], when: (c) => c.wins >= 1 },
  { line: ["Kościół już szuka nowego płomienia. Wiara nie znosi pustki. My też nie.", "The Church is already looking for a new flame. Faith abhors a vacuum. So do we."], when: (c) => c.wins >= 1 },
];

/** When the story runs out, the skull mutters. */
const SKULL_IDLE: Line[] = [
  ["Wracasz znowu. Dobrze. Miasto jeszcze stoi.", "You're back again. Good. The city still stands."],
  ["Krypta czeka. Ona zawsze czeka.", "The crypt waits. It always waits."],
  ["Nie patrz tak. Też kiedyś miałem twarz.", "Don't stare. I had a face once too."],
];

/** The next thing the skull has to say, and which line of its story it was (-1: just muttering). */
export function nextSkullLine(heard: number[], c: SkullContext, roll = Math.random()): { index: number; line: Line } {
  const i = SKULL_STORY.findIndex((s, k) => !heard.includes(k) && (!s.when || s.when(c)));
  if (i >= 0) return { index: i, line: SKULL_STORY[i].line };
  return { index: -1, line: SKULL_IDLE[Math.floor(roll * SKULL_IDLE.length) % SKULL_IDLE.length] };
}

const pickLine = (lines: Line[]): string => {
  const l = lines[Math.floor(Math.random() * lines.length)];
  return lang() === "en" ? l[1] : l[0];
};

export const lineOf = (l: Line): string => (lang() === "en" ? l[1] : l[0]);

export class Narrator {
  /** The line on screen and how long it stays. */
  text = "";
  time = 0;
  private cooldowns = new Map<string, number>();
  private raisedOnFloor = false;
  private lowWarned = false;

  update(dt: number): void {
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) this.text = "";
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dt);
  }

  /** Speak a line of this kind if its cooldown allows. */
  say(kind: string, cooldown = 30, force = false): void {
    const lines = LINES[kind];
    if (!lines) return;
    if (!force && (this.cooldowns.get(kind) ?? 0) > 0) return;
    // don't talk over something more important
    if (!force && this.time > 1.5) return;
    this.cooldowns.set(kind, cooldown);
    this.show(pickLine(lines));
  }

  show(text: string, seconds = Math.max(3.5, text.length * 0.07)): void {
    this.text = text;
    this.time = seconds;
  }

  newFloor(theme: string): void {
    this.raisedOnFloor = false;
    this.say(`floor.${theme}`, 0, true);
  }

  /** React to what happened this step. */
  hear(events: GameEvent[], halves: number): void {
    for (const e of events) {
      switch (e.type) {
        case "enemyDeath":
          if (e.ambush) this.say("ambush", 40);
          break;
        case "enemyHit":
          if (e.crit && !e.ambush) this.say("crit", 60);
          break;
        case "raise":
          if (!this.raisedOnFloor && !e.free) {
            this.raisedOnFloor = true;
            this.say("raise", 20);
          }
          break;
        case "legend":
          this.say("legend", 0, true);
          break;
        case "ritual":
          this.say("ritual", 0, true);
          break;
        case "synergy":
          this.say("synergy", 0, true);
          break;
        case "abomination":
          this.say("abomination", 30);
          break;
        case "chandelierCrash":
          this.say("chandelier", 60);
          break;
        case "windowBreak":
          this.say("window", 60);
          break;
        case "bell":
          if (e.done) this.say("bell", 30, true);
          break;
        case "mimic":
          this.say("mimic", 0, true);
          break;
        case "secretOpen":
          this.say("secret", 30);
          break;
        case "bossIntro":
          this.say(`boss.${e.boss}`, 0, true);
          break;
        case "bossDeath":
          this.say(e.boss === "holyflame" ? "victory" : "bossDeath", 0, true);
          break;
        case "playerDeath":
          this.say("death", 0, true);
          break;
        case "relicUse":
          this.say("relic", 90);
          break;
        case "roomCleared":
          if (Math.random() < 0.25) this.say("cleared", 60);
          break;
        case "playerHit":
          if (halves <= 2 && !this.lowWarned) {
            this.lowWarned = true;
            this.say("lowHealth", 0, true);
          }
          break;
        default:
          break;
      }
    }
    if (halves > 2) this.lowWarned = false;
  }
}
