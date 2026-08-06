# server/fichas

Fichas secretas de personagem (solução do caso) — lidas **apenas pelo servidor**
(`server/index.js`) para montar as instruções do modelo. Nunca colocar fichas em
`public/`, para não vazarem no bundle estático.

Novas fichas entram aqui como `<fichaId>.json`, no mesmo schema de
`ricardo.json`, e são referenciadas em `public/content/default/numeros.json`
pelo campo `fichaId`.
