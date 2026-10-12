# Profanum

Nekromanta spalony na stosie wraca, by wyrżnąć miasto i Kościół Świętego Płomienia.
Roguelike bullet hell w duchu *Enter the Gungeon*, ze stylem inspirowanym *Darkest Dungeon*.

Dokument projektowy żyje osobno (Claude Docs: „Profanum — Dokument Projektowy”).

## Uruchomienie

Wymagany Node.js 18+.

```bash
npm install
npm run dev
```

Vite wypisze adres (zwykle http://localhost:5173), otwórz go w przeglądarce.

Inne skrypty:

| Skrypt | Co robi |
| --- | --- |
| `npm test` | Testy logiki walki (bez grafiki), w Node |
| `npm run typecheck` | Sprawdzenie typów całego projektu |
| `npm run build` | Wersja produkcyjna do katalogu `dist/` |

## Sterowanie

| Akcja | Klawisz |
| --- | --- |
| Ruch | WSAD |
| Celowanie | Mysz |
| Strzał | LPM |
| Rozpad w mgłę (unik, nietykalność) | PPM albo lewy Shift |
| Przeładowanie | R |
| Przewróć ławkę jako osłonę | Spacja (stojąc przy ławce) |
| Od nowa po śmierci albo wyczyszczeniu pokoju | Enter |

## Kamień milowy 1: walka w jednym pokoju

- Grabarz z pistoletem skałkowym: jeden strzał, mocne trafienie, wolne przeładowanie (1,6 s).
- Rozpad w mgłę: krótka nietykalność i zryw w kierunku ruchu.
- Serca liczone połówkami, krótka nietykalność po trafieniu.
- Halabardnicy: podchodzą, sygnalizują atak czerwoną linią i szarżują.
- Arkebuzerzy: trzymają dystans, celują (widać żarzący się lont) i strzelają wolnymi kulami.
- Ławki: stojące blokują ruch, ale kule nad nimi przelatują. Przewrócone zatrzymują kule i pękają od ostrzału.
- Krew i trupy zostają na posadzce do końca walki, do tego dym prochowy, wstrząsy ekranu i zamrożenie klatki przy zabójstwie.

Cała grafika to na razie stylizowane placeholdery w palecie gry. Sprite'y według przewodnika stylu dojdą później.

## Struktura

```
src/
  game/        czysta logika (bez PixiJS) - testowana w Node
    config.ts  wszystkie liczby do balansu w jednym miejscu
    math.ts    wektory, kolizje, deterministyczny RNG
    world.ts   symulacja pokoju: gracz, broń, wrogowie, kule, osłony, zdarzenia
  render/
    renderer.ts  widok w PixiJS v8: placeholdery, krew, cząsteczki, HUD
  input.ts     klawiatura i mysz
  palette.ts   paleta gry
  main.ts      start, pętla ze stałym krokiem, hit-stop, restart
tests/
  world.test.ts
```

Logika jest oddzielona od rysowania: `World.update()` przyjmuje wejście i zwraca listę zdarzeń
(strzał, trafienie, śmierć, przewrócenie osłony…), a renderer zamienia je na efekty.
Dzięki temu walkę da się testować i balansować bez uruchamiania przeglądarki.
