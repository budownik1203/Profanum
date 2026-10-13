/**
 * Notes found in the catacombs: the story emerges from them (design doc: Narrator, fabuła).
 * Two per floor, in order from the cemetery down; the last ones tell what the Holy Flame is.
 */
import { lang } from "./i18n.js";

const NOTES: [pl: string, en: string][] = [
  [
    "Rozkaz Kata Miejskiego:\nStos na Placu Popiołów ma płonąć do świtu. Popiół heretyka zakopać w grobie zbiorowym, bez modlitwy i bez krzyża.",
    "The City Executioner's order:\nThe pyre on the Square of Ashes is to burn until dawn. Bury the heretic's ash in the mass grave, without prayer and without a cross.",
  ],
  [
    "Dziennik grabarza:\nTrzecią noc słyszę skrobanie spod ziemi. Proboszcz mówi, że to szczury. Szczury nie śpiewają psalmów od tyłu.",
    "A gravedigger's diary:\nThird night I hear scratching beneath the earth. The priest says rats. Rats do not sing psalms backwards.",
  ],
  [
    "Raport straży:\nW slumsach zaraza. Kościół zakazał medykom wstępu. Ogłoszono, że Płomień sam oczyści chorych. Wozy z ciałami jadą do katedry, nie na cmentarz.",
    "Watch report:\nPlague in the slums. The Church barred the physicians. It was proclaimed the Flame itself would cleanse the sick. The death carts go to the cathedral, not the cemetery.",
  ],
  [
    "List kapitana straży:\nNie pytam, dokąd wywożą skazanych nocą. Płacą złotem prosto z ołtarza. To mi wystarcza. Psy jednak wyją, gdy mijamy katedrę.",
    "The watch captain's letter:\nI don't ask where the condemned are carted at night. They pay in gold straight from the altar. That suffices. Yet the dogs howl whenever we pass the cathedral.",
  ],
  [
    "Księga rachunkowa:\nProch czarny, trzysta beczek, dla Kościoła. Odbiór: krypta pod katedrą. Dopisek drżącą ręką: nie pytać, nie liczyć, nie wracać.",
    "Ledger:\nBlack powder, three hundred barrels, for the Church. Delivery: the crypt beneath the cathedral. Added in a shaking hand: do not ask, do not count, do not come back.",
  ],
  [
    "Notatka alchemika:\nPłomień nie zużywa drewna ani oleju. Zużywa coś innego. Z każdym stosem na placu w katedrze robi się jaśniej. Liczyłem. To nie przypadek.",
    "An alchemist's note:\nThe Flame consumes neither wood nor oil. It consumes something else. With every pyre on the square, the cathedral grows brighter. I counted. It is no accident.",
  ],
  [
    "Modlitwa mnicha, przekreślona:\nPanie, czemu Twój ogień ma oczy? Czemu patrzy na nas podczas nieszporów? Czemu jest głodny?",
    "A monk's prayer, crossed out:\nLord, why does Your fire have eyes? Why does it watch us at vespers? Why is it hungry?",
  ],
  [
    "Skryptorium, karta wyrwana z kroniki:\nPierwszy biskup nie znalazł Płomienia. To Płomień znalazł jego. Kościół zbudowano wokół niego jak klatkę, a potem jak spiżarnię.",
    "Scriptorium, a page torn from the chronicle:\nThe first bishop did not find the Flame. The Flame found him. The Church was built around it like a cage, and later like a larder.",
  ],
  [
    "Wyrok Inkwizycji:\nZa heretyka uznaje się każdego, kto nie płonie jasno. Wyrok wykonuje się na placu. Popiół należy do Płomienia.",
    "Verdict of the Inquisition:\nA heretic is anyone who does not burn brightly. The sentence is carried out on the square. The ash belongs to the Flame.",
  ],
  [
    "Ostatnia strona, bez podpisu:\nSpaliliśmy go, ale jego popiół nie stygnie. Biskup każe zamurować grób zbiorowy. Grób nie chce zostać zamurowany. Płomień po raz pierwszy się boi.",
    "The last page, unsigned:\nWe burned him, but his ash will not cool. The bishop orders the mass grave walled up. The grave refuses to be walled. For the first time, the Flame is afraid.",
  ],
];

export function noteText(index: number): string {
  const n = NOTES[((index % NOTES.length) + NOTES.length) % NOTES.length];
  return lang() === "en" ? n[1] : n[0];
}
