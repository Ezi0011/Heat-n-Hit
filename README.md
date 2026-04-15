# Heat-n-Hit

Jeu d'arene multijoueur local inspire de Bomberman, jouable sur un ecran principal avec des telephones comme manettes.

## Apercu

Le projet est compose de 3 parties :

- `game-screen/` : l'ecran principal du jeu avec Phaser
- `mobile-controller/` : le serveur Node.js + la page manette pour telephone
- `shared/` : la logique partagee, notamment la generation des maps

## Prerequis

Avant de lancer le projet, il faut avoir :

- Node.js installe
- npm installe
- un ordinateur pour afficher le jeu
- un ou plusieurs telephones connectes au meme reseau local que l'ordinateur

## Installation

Depuis le dossier du projet :

```bash
cd mobile-controller
npm install
```

## Lancer le jeu

Toujours depuis `mobile-controller/` :

```bash
npm start
```

Le serveur demarre par defaut sur le port `3000`.

Si le port `3000` est deja pris, le serveur essaie automatiquement les ports suivants. Regarde la console : elle affiche l'URL exacte du jeu et l'URL exacte des manettes.

Exemple :

- ecran principal : `http://localhost:3000/`
- manette : `http://192.168.x.x:3000/controller/`

## Comment rejoindre une partie

1. Lance le serveur avec `npm start`
2. Ouvre l'ecran principal sur l'ordinateur
3. Depuis l'ecran d'attente, scanne le QR code avec un telephone
4. Entre un nom sur la manette
5. Recommence avec les autres telephones si besoin
6. Quand au moins un joueur est connecte, clique sur `DEMARRER`

Le QR code affiche directement l'URL de connexion du telephone.

## Fonctionnement general

Le jeu se joue sous forme de tournoi :

- les joueurs rejoignent d'abord le lobby
- le tournoi est ensuite coupe en `4 quarts`
- chaque quart se joue separement
- les qualifies accedent a la finale
- le gagnant de la finale remporte le tournoi

Avant chaque quart et avant la finale, il y a un compte a rebours de `10 secondes`.

Les couleurs des joueurs sont reattribuees a chaque manche :

- dans un meme quart, deux joueurs n'ont pas la meme couleur
- en finale, les couleurs sont reattribuees a nouveau sans doublon

## Regles simplifiees

- chaque joueur controle un personnage sur la map
- les telephones servent de manettes
- les fleches permettent de se deplacer
- le bouton `SHOOT` permet de tirer
- un projectile touche un joueur : le joueur est elimine
- certains murs sont destructibles et peuvent etre detruits par les tirs
- les bords de la map bouclent : sortir d'un cote fait revenir de l'autre

## Controles

Sur la manette telephone :

- `haut`, `bas`, `gauche`, `droite` : deplacement
- `SHOOT` : tir

La manette affiche aussi l'etat du joueur en direct :

- en attente dans le lobby
- en attente de son quart
- en train de jouer
- qualifie pour la finale
- elimine
- vainqueur

## Ecran principal

L'ecran principal affiche :

- l'ecran de lancement
- la salle d'attente avec QR code
- la liste des joueurs connectes
- la partie en cours
- l'annonce des quarts et de la finale
- l'ecran de victoire avec le bouton `RELANCER`

Quand un tournoi est termine, le bouton `RELANCER` remet la session en attente pour recommencer un nouveau tournoi sans relancer le serveur.

## Audio

Le jeu utilise plusieurs sons et musiques :

- `game-theme` : musique de fond sur l'ecran de lancement, l'attente et les manches normales
- `final-theme` : musique de fond pendant la finale
- `blaster-shot` : son de tir
- `player-hit` : son d'elimination

Si aucun son ne se lance au debut, clique une fois sur l'ecran : certains navigateurs bloquent l'audio tant qu'il n'y a pas eu d'interaction utilisateur.

## Structure technique rapide

- le serveur Express + Socket.IO est dans [mobile-controller/server.js](./mobile-controller/server.js)
- l'ecran d'attente est gere par [game-screen/scenes/BootScene.js](./game-screen/scenes/BootScene.js)
- la partie est geree par [game-screen/scenes/GameScene.js](./game-screen/scenes/GameScene.js)
- la generation des maps est dans [shared/MapGenerator.mjs](./shared/MapGenerator.mjs)
- la manette telephone est geree par :
  - [mobile-controller/index.html](./mobile-controller/index.html)
  - [mobile-controller/controleur.js](./mobile-controller/controleur.js)
  - [mobile-controller/style.css](./mobile-controller/style.css)

## Conseils d'utilisation

- utilise Chrome ou un navigateur recent
- mets l'ordinateur et les telephones sur le meme Wi-Fi
- si le telephone ne rejoint pas la partie, verifie l'IP affichee sous le QR code
- si tu modifies le code, pense a redemarrer le serveur puis a recharger les pages

## Resume ultra court

```bash
cd mobile-controller
npm install
npm start
```

Puis :

- ouvre l'ecran principal sur l'ordinateur
- scanne le QR code avec les telephones
- clique sur `DEMARRER`
- joue les quarts, puis la finale
- clique sur `RELANCER` pour recommencer un tournoi
