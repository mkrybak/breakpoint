---
tags: [marketing, linkedin, post]
status: draft   # read it through once; fix any wording that doesn't sound like you
week: optional
publish: ""
target: "reach the ~25% of followers in Ukraine"
---

# Optional — Puzzle in Ukrainian

**Why:** about a quarter of my followers are in Ukraine (mostly outsourcing companies), and Ukrainian-language posts do as well as English ones in my network ([[02-audience]]). System design is the wall between outsourcing and senior roles at product companies, so this angle lands.

Same puzzle and visuals as [[W2-puzzle]]. Post it a few days after W2, or instead of W4 if W2 does well.

## Draft

> Задачка з system design.
>
> О 10:00 стартує продаж квитків на концерт. Трафік стрибає з 10 тис. до 40 тис. запитів на секунду. 40% з них — покупки.
>
> Дизайн: load balancer, 14 app-серверів, Redis віддає 90% читань, Postgres з трьома read-репліками.
>
> На папері все ок.
>
> У симуляторі воно падає за кілька секунд.
>
> Що ламається першим?
>
> Відповідь і реплей — завтра в коментарях.

## Answer comment (next day) + `../assets/w2-answer.png`

> Відповідь: база даних, але не з тієї причини, про яку думає більшість.
>
> 40 тис. × 40% = 16 тис. записів на секунду. Один primary у Postgres тягне приблизно 15 тис.
>
> Redis допомагає тільки з читанням. Read-репліки — теж тільки з читанням. Кожен запис усе одно йде на одну машину.
>
> Спробував 6 реплік замість 3. Та сама лінія.
>
> Розбив записи на 4 шарди: p95 93 мс, нуль помилок.

## Visual

- `../assets/w2-puzzle.png` (English text on the card is fine; tech terms are English anyway)

## Fill before posting

- [ ] Read it aloud; adjust anything that sounds translated
