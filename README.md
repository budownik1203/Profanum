# Profanum

Nekromanta spalony na stosie wraca, by wyrżnąć miasto i Kościół Świętego Płomienia.
Roguelike bullet hell w duchu *Enter the Gungeon*, ze stylem inspirowanym *Darkest Dungeon*.
Grafika i dźwięk powstają w całości w kodzie: postacie rysuje PixiJS, a dźwięk syntezuje WebAudio.

Dokument projektowy żyje osobno (Claude Docs: „Profanum — Dokument Projektowy”).

## Uruchomienie

Wymagany Node.js 18+. PixiJS jest przypięty do wersji 8.6.6, tej samej co w wersji na stronę.

```bash
npm install
npm run dev
```

Vite wypisze adres (zwykle http://localhost:5173), otwórz go w przeglądarce.
Dźwięk włącza się po pierwszym kliknięciu albo klawiszu, bo przeglądarki nie pozwalają grać od razu.

| Skrypt | Co robi |
| --- | --- |
| `npm test` | Kompiluje i uruchamia testy logiki w Node (bez grafiki), w tym całą wyprawę graną przez bota |
| `npm run typecheck` | Sprawdzenie typów całego projektu |
| `npm run build` | Wersja produkcyjna do katalogu `dist/` |
| `npm run artifact` | Jeden plik HTML z grą (PixiJS z CDN) do `dist/profanum.html` |
| `npm run shots` | Zrzuty ekranu przez Chromium (PixiJS podmieniany na prosty shim na Canvas2D) |

Narzędzia w `tools/` (po `npm test`, bo korzystają ze skompilowanego `.test-build/`):

| Polecenie | Co robi |
| --- | --- |
| `node tools/fullrun.mjs [n] [god\|mortal] [postać]` | Bot przechodzi całe wyprawy: czas, pokoje, utknięcia, bossowie, wydajność kroku |
| `node tools/balance.mjs [n] [broń] [bossowie]` | Bot walczy z każdym bossem: czas zabicia i utracone serca |
| `node tools/shot.mjs <strona> <katalog> <scenariusz>` | Zrzuty według scenariusza z `tools/scenarios/` (tour, bosses, bosses2, items, crypt, audio) |

## Sterowanie

| Akcja | Klawisz |
| --- | --- |
| Ruch | WSAD |
| Celowanie i strzał | Mysz, LPM (strzałem gasisz też świece, pochodnie i koksowniki) |
| Rozpad w mgłę (unik z nietykalnością) | PPM albo Shift |
| Przeładowanie | R |
| Wskrześ trupa, otwórz skrzynię, weź przedmiot, kup, ołtarz | E |
| Rozkaz dla sług: idźcie tam | Q |
| Relikwia | F |
| Sznur Wiedźmy | C |
| Przewróć ławkę lub stół jako osłonę | Spacja |
| Zmiana broni | 1–9, kółko myszy |
| Pauza (sterowanie i ekwipunek) | Esc |

## Co jest w grze

- **Wyprawa**: pięć pięter (Cmentarz, Slumsy, Dzielnica kupiecka, Klasztor, Katedra) i Sanktuarium Płomienia.
  Każde piętro ma 10–12 pokoi: walki, skarbiec, Paser, ołtarz, mini-boss, boss i ukryte katakumby za pękniętą ścianą.
  Run zapisuje się na początku każdego piętra.
- **Walka o światło**: sale są jasne, mrok leży na krańcach. Gasisz światła strzałami, żeby wywalczyć mrok.
  W mroku zasadzka zadaje podwójne obrażenia, a sługi biją mocniej. Święte światło (witraże, stosy) parzy.
  Latarnicy zapalają zgaszone światła.
- **Nekromancja**: zabici zostawiają trupy i dusze. Wskrzeszasz ich jako sługi, które zachowują rolę z życia.
  Z trzech trupów zszywasz abominację. Szczątki przeklętej broni wskrzeszasz na ołtarzu jako legendę.
- **Wrogowie**: 26 rodzajów w czterech frakcjach (straż miejska i motłoch, Kościół, okultyści, nieumarli) i szczury Szczurołapa.
  Okultyści walczą ze wszystkimi.
- **Bossowie**: po trzech na piętro (piętro losuje jednego) i Święty Płomień na końcu:
  - Cmentarz: Kat Miejski, Egzorcysta, Płaczka;
  - Slumsy: Kapitan Straży, Szczurołap, Prowodyr Tłumu;
  - Dzielnica kupiecka: Mistrz Prochu, Lichwiarz, Mistrz Latarników;
  - Klasztor: Biskup Procesji, Opat, Skryptor;
  - Katedra: Wielki Inkwizytor, Organista, Szklany Anioł.

  Każdy ma swoją arenę i fazy, a ataki zapowiada na podłodze. W świetle jest silniejszy i każdy na swój sposób przywraca światło.
- **Arsenał**: 18 broni (palne, kusze, okultystyczne za dusze), 4 legendy z klątwami, 18 przedmiotów,
  7 relikwii i 5 synergii.
- **Krypta**: między wyprawami są tu sarkofagi 6 postaci z historiami, ołtarz Echa (odblokowania),
  gadająca czaszka z opowieścią odblokowywaną postępami i rejestr zmarłych ze statystykami.
- **Oprawa**: tusz i czerń w duchu DD, krew zostająca na posadzce, filtr filmu (ziarno, desaturacja)
  oraz narrator z czarnym humorem (napisy PL/EN).
  Dźwięk to proch, przybitka, krew, dzwony i szkło, a muzyka to organy i chór, które w walce przechodzą w kotły i dysonans.
- **Opcje**: wstrząsy ekranu, głośność efektów i muzyki, liczby obrażeń, filtr filmu, Tryb Łaski i język.

## Struktura

```
src/
  game/              czysta logika (bez PixiJS), testowana w Node
    data/            tabele: units (wrogowie), weapons, items (postacie, przedmioty, relikwie, synergie), floors
    config.ts        liczby do balansu w jednym miejscu
    types.ts         typy symulacji i zdarzeń
    world.ts         pokój: gracz, jednostki, pociski, światła, drzwi; orkiestruje systemy
    ai.ts            zachowania wrogów i sług
    combat.ts        obrażenia, pociski, wybuchy, strefy na podłodze
    shooting.ts      bronie gracza
    lighting.ts      światła, latarnicy, żyrandole, witraże
    loot.ts          łupy, skrzynie, Paser, ołtarze, wskrzeszanie
    relics.ts        relikwie i sznur Wiedźmy
    bosskit.ts       narzędzia skryptów bossów (kroki, ruch, wzory pocisków, przywracanie światła)
    bosses.ts        maszyneria bossów, pierwsi bossowie pięter i Święty Płomień
    bosses2.ts       pozostałych dziesięciu bossów
    rooms.ts         szablony pokoi
    floor.ts         generator piętra i przejścia
    run.ts           cała wyprawa, zapis
    meta.ts          to, co przetrwa śmierć: Echo, odblokowania, statystyki, ustawienia
    hub.ts           krypta
  render/            widok w PixiJS v8: postacie, bossowie, otoczenie, ikony, HUD, menu
  audio.ts           dźwięk i muzyka (WebAudio, wszystko syntezowane)
  narrator.ts        kwestie narratora i opowieść czaszki
  i18n.ts            teksty PL/EN
  main.ts            start, pętla ze stałym krokiem, tryby gry, menu, haczyk do testów w przeglądarce
tests/               testy Node (node:test) i bot: bot.ts (walka), runner.ts (cała wyprawa)
tools/               budowa pliku HTML, zrzuty przez Chromium, balans i całe wyprawy botem
```

## Stan

Gotowe są wszystkie elementy zakresu z dokumentu poza tymi, które dokument odkłada na później:

- docelowe sprite'y cut-out (teraz parametryczne figury w kodzie),
- nagrany narrator (teraz napisy),
- wersja desktop i Steam.

Balans liczbowy wymaga prawdziwych graczy. Bot przechodzi całe wyprawy w trybie nieśmiertelności i daje tylko przybliżenie.
