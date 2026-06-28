# Gartic Phone

Jeu multijoueur temps réel en WebSockets. Un joueur écrit un mot, un autre le dessine, un autre devine, et la chaîne déformée est révélée à la fin.

## Lancer

Node.js 18+.

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000 (un onglet par joueur).

## Jouer

1. Entrer un pseudo.
2. Se mettre prêt (annulable avant le démarrage).
3. Démarrage auto quand tous sont prêts (2 min).
4. Écrire un mot (validé auto à la fin du timer).
5. Dessiner / deviner en alternance.
6. Révélation des chaînes.
7. Relancer une manche.

## Choix techniques

- WebSockets natifs (`ws`) via Hono, pas Socket.IO.
- Serveur = source de vérité (état de la partie).
- Messages JSON typés (champ `type`).
- Rotation des carnets par modulo (jamais son propre carnet).
- Client : HTML/CSS/JS simple, un écran à la fois.

## Déconnexions / arrivées en cours

- Quitter le salon : retiré de la liste pour tous.
- Déconnexion en jeu : retiré des tours, la partie continue, son carnet reste.
- Moins de 2 joueurs : fin propre.
- Arrivée en cours : ordre figé au départ, le nouveau attend la manche suivante.
- Limite : pas de reconnexion à une partie en cours.