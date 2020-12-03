# frontend-applications
Repo voor de HvA CMD course Frontend Applications. Het einddoel van dit project is om een visualisatie te creëeren die gebruikt kan worden door de Volkskrant voor een nieuwsbericht.

De deelvraag die ik heb onderzocht is:
"Hoe kan je ervoor zorgen dat je auto niet gestolen wordt?"

Live demo: https://sjorswijsman.github.io/frontend-applications/

## Concept
Om deze deelvraag te visualiseren heb ik 3 visualisaties gemaakt die drie onderliggende deelvragen beantwoorden:

### Wat voor auto's worden het meest gestolen?
![barchart](https://i.ibb.co/ySq6qjy/barchart.png)

### Waar worden de meeste auto's gestolen?
![map](https://i.ibb.co/JvstPHr/mapchart.png)

### Hoe worden auto's gestolen?
![graphic](https://i.ibb.co/Xp3G5NB/graphicchart.png)

## Handleiding
Open `index.html` in een browser om de visualisaties te bekijken. Er is een actieve internetverbinding nodig om data op te halen om de kaart te visualiseren.

Gebruik de dropdown menu's om te interacteren met de data. Hover over de visualisaties heen om meer informatie te krijgen.

_Om aanpassingen te maken:_
Run `npm install` in de root folder ([download npm hier](https://nodejs.org/en/download/)) om de dependencies te installeren.

Run daarna `npm run dev` om Rollup te laten werken en een live server op localhost:5000 te starten.

## Data gebruikt
Barchart:
* Statistiek voertuigdiefstal 2019 - Data aangevraagd bij het LIV  

Kaart:  
* Cartografische data - https://github.com/cartomap/nl
* Gestolen auto's per gemeente - https://localfocuswidgets.net/5f0c4c5e18d62
* Inwoners per gemeente - https://www.uitvoeringvanbeleidszw.nl/subsidies-en-regelingen/veranderopgave-inburgering-pilots/documenten/publicaties/subsidies/veranderopgave-inburgering-pilots/tabel-aantal-inwoners-gemeenten-per-1-januari-2019/tabel-aantal-inwoners-gemeenten-per-1-januari-2019
* Auto's per gemeente - https://opendata.cbs.nl/statline/#/CBS/nl/dataset/37209HVV/table?fromstatweb

Graphic:
* Hoe kan u uw auto beveiligen - https://zelfverzekerd.verzekeruzelf.nl/
* Hoe worden auto's gestolen - https://www.consumentenbond.nl/autoverzekering/
