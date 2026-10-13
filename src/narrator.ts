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
export const SKULL: Line[] = [
  ["Witaj z powrotem, popiele. Krypta pamięta każdego, kto wrócił.", "Welcome back, ash. The crypt remembers everyone who returned."],
  ["Echo Dusz to wszystko, co zostaje po wyprawie. Wydawaj je mądrze na ołtarzu.", "The Echo of Souls is all a descent leaves behind. Spend it wisely at the altar."],
  ["W sarkofagach śpią inni, których Kościół spalił. Obudzą się, gdy udowodnisz swoje.", "Others the Church burned sleep in those sarcophagi. They wake once you prove yourself."],
  ["Gaś światło. W mroku twoje sługi rosną w siłę, a ty jesteś tylko cieniem.", "Put out the light. In the dark your minions grow strong and you are only a shadow."],
  ["Stos płonie świętym ogniem. Nie stój w nim, chyba że lubisz zapach własnego popiołu.", "The stake burns with holy fire. Don't stand in it, unless you like the smell of your own ash."],
  ["Szczątki przeklętej broni zanieś na ołtarz. Legenda kosztuje dusze, ale oddaje z nawiązką.", "Bring cursed weapon remains to an altar. A legend costs souls, but repays them."],
  ["Dzwonnika zabij pierwszego. Dzwon budzi sąsiednie pokoje.", "Kill the bellringer first. The bell wakes the rooms around."],
  ["Pod każdym piętrem są katakumby. Szukaj pękniętych ścian i strzelaj w nie.", "There are catacombs under every floor. Look for cracked walls and shoot them."],
  ["Trzy trupy i trochę dusz: tyle trzeba, by zszyć abominację. Szwy są opcjonalne.", "Three corpses and a few souls: that's all an abomination takes. Stitches optional."],
  ["Paser przyjmuje każde złoto. Nawet to wyjęte z kieszeni trupa.", "The fence takes any gold. Even from a dead man's pocket."],
  ["Mówią, że Święty Płomień to bóg. Byłem mnichem. Widziałem, czym się karmi.", "They say the Holy Flame is a god. I was a monk. I saw what it feeds on."],
  ["Wracasz znowu. Dobrze. Miasto jeszcze stoi.", "You're back again. Good. The city still stands."],
];

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
