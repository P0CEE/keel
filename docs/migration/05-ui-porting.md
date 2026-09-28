# 05 · Fondation UI à partir de mint-pocs

- Date : 2026-09-28
- Source : mint-pocs (`src/demos/*`, `src/styles/global.css`, `reference/mint/*`)
- Statut : validé le 2026-09-28. La suite se porte composant par composant,
  feature par feature, avec la recette de la section 5.

## 1. Décisions

| Sujet                                | Décision                                                                                            | Pourquoi                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primitives d'interaction             | **Base UI** (`@base-ui/react` 1.8.0), comme mint-pocs                                               | Mint est construit dessus : accessibilité, focus et clavier viennent de primitives éprouvées, et les sélecteurs de mint-pocs (`data-starting-style`, `data-instant`, `data-highlighted`…) s'appliquent tels quels                                      |
| Animation                            | **motion** 13.4.0                                                                                   | Celle de mint-pocs. La 13.4.1 de mint-pocs a moins de 7 jours : refusée par la règle `minimumReleaseAge` de keel                                                                                                                                       |
| Styles                               | **CSS Modules** : un `.module.css` à côté de chaque composant                                       | Le CSS de mint-pocs est déjà du CSS pur à classes préfixées : on sort la chaîne dans un fichier, sans réécriture. Next l'extrait au build (fichiers hachés, minifiés, cachés pour toujours), sans coût à l'exécution, avec des classes à portée locale |
| Pas de `<style>` dans les composants | Refusé                                                                                              | mint-pocs le fait parce que chaque démo doit tenir dans un fichier copiable. En production, ce CSS voyagerait dans le JavaScript, serait reparsé à chaque chargement, jamais mis en cache à part                                                       |
| Tailwind                             | Gardé pour les pages existantes de keel (login, site), jamais dans un composant Mint                | Traduire le CSS de Mint en utilitaires serait long, lossy (`light-dark()`, `:has()`, masques) et empêcherait de comparer à la référence                                                                                                                |
| Radix                                | Gardé pour les composants shadcn existants, jusqu'à leur remplacement                               | Aucun composant Mint n'utilise Radix                                                                                                                                                                                                                   |
| Icônes                               | **Celles de mint-pocs**, copiées tracé par tracé (`@keel/ui/mint/icons`, `finance/category-glyphs`) | Une icône approchée d'un autre jeu se voit à côté des vraies : lucide a été essayé puis retiré                                                                                                                                                         |
| Police                               | **Wealthsimple Sans** (400, 500, 700), en local via `next/font/local`, exposée en `--font-app`      | Rendu identique à la référence pendant le portage. **Propriétaire : à remplacer par une police sous licence avant la production.** Jamais via Google Fonts au build : hors ligne, Next retombait en silence sur Arial                                  |
| Portage                              | **À l'identique** : le balisage, les valeurs et les popups de la démo, sans recomposition           | Le rail recomposé à partir de pièces (rail, dock, menu, tooltip séparés) divergeait : le soleil bougeait à l'ouverture du menu, le flou manquait. Le Sidebar est maintenant la démo transposée                                                         |
| Montants                             | `@keel/finance/money` : unités mineures, multi-devises                                              | Plus de CAD en dur ni de `toFixed` : 16 démos redéfinissaient leur propre `money()`                                                                                                                                                                    |

## 2. Tokens

`packages/ui/src/mint/tokens.css`, **deux couches seulement** :

1. **Primitives** : type (tailles et interlignages en paires), graisses,
   espacements, rayons, durées et courbes, couches (`z`).
2. **Rôles** : ce à quoi sert une couleur, déclarée une fois avec
   `light-dark(clair, sombre)`.

**Aucun token de composant.** Les `--component-button-bg-tertiary`,
`--component-snackbar-bg-info-gradient-0` et autres (447 variables copiées de
Mint) ont été supprimés : un token par cas particulier fait diverger deux
composants qui devraient se ressembler, et personne ne sait lesquels servent
encore. Il n'en reste que des utilisés.

**Garde-fou** (`packages/ui/test/tokens.test.ts`), qui fait échouer la CI :

- toute variable lue par un composant existe (dans les tokens, ou localement
  dans le composant) ;
- tout token déclaré est lu quelque part : on ajoute un token le jour où un
  composant en a besoin, pas avant ;
- aucun composant n'écrit de couleur brute (hex, `rgba`, `oklch`) : il
  peint avec les rôles.

Un second garde-fou (`packages/ui/test/css.test.ts`) interdit d'écrire
`-webkit-backdrop-filter` ou `-webkit-mask-*` : Lightning CSS (le compilateur
CSS de Next) fusionne une propriété et son jumeau préfixé en gardant le
dernier écrit, et Chrome perdait le flou de tous les popups et du dock. On
écrit la propriété standard, Lightning CSS préfixe.

**Apparence** : `next-themes` pose la classe et le `color-scheme` sur `<html>`,
et `light-dark()` suit. Un sous-arbre passé en `.dark` bascule tous ses rôles,
sans rien redéclarer. Le script de thème reçoit le nonce CSP (transmis par
`proxy.ts` à travers la réécriture i18n), sinon chaque chargement peignait
d'abord l'apparence du système.

### Correspondance mint-pocs → keel, pour porter

| Rôle mint-pocs (`--xx-role`)                | keel                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ink`, `ink-2`, `ink-3`                     | `--ink`, `--ink-2`, `--ink-3`                                                                                  |
| `muted`                                     | `--ink-muted` (renommé : `--muted` appartient au thème shadcn)                                                 |
| `on-ink`, `ink-fill`                        | `--on-ink`, `--ink-fill`                                                                                       |
| `page`                                      | `--page`                                                                                                       |
| `card`                                      | `--card-bg` (renommé : `--card` appartient au thème shadcn)                                                    |
| `line`, `line-heavy`                        | `--line`, `--line-heavy`                                                                                       |
| `highlight`, `hover`, `pill`                | `--highlight`, `--hover`, `--pill`                                                                             |
| `positive` et `positive-soft`, `negative`   | `--positive`, `--positive-soft`, `--negative` (le statut « Refusée » d'une transaction)                        |
| `info`, `warning` et leurs `-soft`          | `--info`, `--warning`, `--info-soft`, `--warning-soft`                                                         |
| `dock-fill`, `dock-edge`                    | `--dock-fill`, `--dock-edge`                                                                                   |
| la barre du téléphone (`--nd-bar`)          | `--bar`                                                                                                        |
| le carré courant du rail                    | `--current`                                                                                                    |
| le soleil du rail (`--sb-sun`)              | `--sun`                                                                                                        |
| popups, scrim                               | `--popup`, `--scrim`                                                                                           |
| ombres `raised`, `dock`, `float`            | `--shadow-dock`, `--shadow-float` (`--shadow-raised` reviendra avec son premier usage)                         |
| palette catégorielle (`dataviz-category-*`) | `--category-blue`, `-purple`, `-pink`, `-yellow`, `-orange`, `-mauve`, `-green`, `-green-deep`, `-green-light` |
| tout `--component-*`                        | **interdit** : trouver le rôle, ou en créer un                                                                 |

La palette de catégories suit l'ordre du spending breakdown et du heatmap de
mint-pocs. Une couleur se peint éclairée par le haut :
`linear-gradient(color-mix(in srgb, var(--c), white 18%), var(--c))`.

Valeurs de Mint gardées telles quelles : `ink-3` reste `fg.secondary` en clair
(`fg.tertiary` fait 3,9:1, sous AA) ; `positive` est `dataviz.green.07`
(4,6:1) et non `accent.positive.strong` (3,3:1).

## 3. Ce qui est porté

### `@keel/finance` (logique pure, sans DOM)

| Module  | Contenu                                                                                                                                                                                                                                                                    | Tests |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `money` | `currencyExponent`, `parseMinor` (exact, refuse au lieu de deviner), `toDecimalString`, `formatMoney` et `formatMoneyParts` (vrai moins U+2212, jamais de signe sur zéro, tiret cadratin pour l'invalide, exact au centime jusqu'à 2^53), `formatPercent`, `sumByCurrency` | 38    |
| `dates` | `todayIn(fuseau)`, `addDays`, `daysBetween`, `startOfMonth`, `formatDayLabel` (« Aujourd'hui », « Hier », « 23 sept. »), `formatShortDate`, `formatMonth`                                                                                                                  | 12    |

### `@keel/ui/mint` (design system et coque)

| Export                                                | Porté depuis                             | Notes                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mint/tokens.css`, `mint/motion`                      | `global.css`, `reference/mint/tokens.js` | Ressorts SNAP, TRAIL, BOUNCE, ROLL, SCRUB ; courbes ; variantes `swap` et `fade` du set                                                                                                        |
| `mint/input-modality`                                 | `MintProvider`                           | Anneau de focus au clavier seulement                                                                                                                                                           |
| `mint/icons`                                          | Sidebar, Transactions                    | Icônes Mint (pleines, grille 24) et celles que mint-pocs dessine (traits de 2) ; jumelles pleines pour la page courante                                                                        |
| `mint/hint`                                           | Sidebar (`Tip`, `Kbd`)                   | Tooltip des surfaces hors rail (menu du téléphone, raccourcis)                                                                                                                                 |
| `mint/shortcuts`, `use-shortcuts`, `shortcuts-dialog` | Sidebar (`COMMANDS`)                     | Une table, lue en capture ; règles de touches testées                                                                                                                                          |
| `mint/avatar`, `merchant-logo`, `icon-button`         | Sidebar, Transactions, SecurityLogo      | Repli sur initiales, décodage des images en cache                                                                                                                                              |
| `mint/sidebar`, `sidebar-dock`, `sidebar-profile`     | Sidebar (fichier entier)                 | Transposé règle par règle : rail de 96 px, carré courant partagé, dock avec point, compte et pile en croissant qui grandit en panneau, menu profil. Popups dans une couche à la racine du rail |
| `mint/nav`                                            | Sidebar                                  | Page courante tirée de l'URL                                                                                                                                                                   |
| `mint/profile-menu`                                   | AppTopBar (bouton), ProfileMenu (menu)   | Le bouton profil de 32 px de la barre du téléphone ouvre le menu de ProfileMenu, transposé : 252 px, lignes de 40 px, touches affichées qui choisissent leur ligne. Règle des touches testée   |
| `mint/mobile-tab-bar`                                 | NavDrawerMorph                           | Un seul élément morphe de la pilule au tiroir                                                                                                                                                  |
| `mint/app-top-bar`, `page-indicator`, `swipe-pager`   | AppTopBar                                | Barre du téléphone, indicateur pilule et points, pages balayées sur SNAP (un quart de largeur ou un geste vif). Géométrie pure testée                                                          |

### `@keel/ui/finance`

| Export                              | Porté depuis                          | Notes                                                                                                                           |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `category-tag`, `category-colors`   | Tag, Transactions, spending breakdown | L'accent neutre du Tag, icône à 8 px du bord, comme la démo ; la couleur reste aux graphiques                                   |
| `category-glyphs`                   | Transactions, Icon picker             | Logement et santé : Home et Health de l'Icon picker ; « À catégoriser » dessiné sur la même grille                              |
| `amount`                            | Transactions (`signed`)               | Chiffres tabulaires                                                                                                             |
| `rolling-number`, `animated-amount` | AnimatedNumber (`RollingTicker`)      | Logique de cases extraite et testée ; séparateurs lus sur la locale (espace fine en français)                                   |
| `transaction-list`                  | Transactions                          | Jours du foyer, multi-devises (pas de net du jour quand les devises diffèrent), statut en attente ou refusée, container queries |
| `cash-flow`                         | CashFlow                              | Barres HTML sur TRAIL, bleu et orange de la palette, roving tabindex                                                            |

### Dans l'app

- `components/shell/app-shell.tsx` compose la coque : le Sidebar sur desktop,
  la barre du haut, les pages balayables et la tab bar sur téléphone
  (bascule en CSS à 768 px), la recherche rapide (loupe, « / » ou ⌘K), le
  dialogue des raccourcis.
- Les pages du haut (Accueil, Comptes, Transactions) sont montées par la
  coque côte à côte (`top-pages.tsx`) : le téléphone les balaie, le desktop
  change sans remonter. Leurs `page.tsx` ne font que le routage. Sur
  téléphone, Accueil est au milieu (Comptes, Accueil, Transactions), comme
  Home dans la démo ; le rail garde son ordre.
- Le dock « À traiter » est rendu par la coque dès le premier affichage
  (`review-items.tsx`, données d'exemple jusqu'à la file de revue), jamais
  publié par une page après l'hydratation.
- Largeur desktop : le contenu fait 80 % de la fenêtre, 1600 px au plus,
  centré sur la fenêtre ; page et panneau latéral en 2/3 et 1/3 ; la première
  ligne au niveau de la marque du rail.
- L'accueil montre les composants portés sur des données d'exemple ; Comptes
  et Transactions disent « Bientôt ici ».

## 4. Adaptations à une vraie app

mint-pocs montait tout en client seulement (`client:only`), dans des maquettes
de téléphone. Ce qui change :

| Sujet                    | mint-pocs                                    | keel                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Écran du téléphone       | Maquette 360×600                             | Le cadre de l'app sur téléphone, à la hauteur du viewport : dégradé de l'écran, barre en haut (dans la zone sûre), pages qui défilent chacune sous la barre ; la tab bar en calque fixe dans les zones sûres |
| Liens                    | `<button onClick>`                           | Composant de lien injecté (`linkComponent`, Next `Link` dans l'app) : vrais liens, préchargement Next, clic milieu                                                                                           |
| Page courante            | État local                                   | `currentItemId(pathname)` : exacte, ou préfixe le plus long                                                                                                                                                  |
| Apparence                | Le rail écrivait sur `<html>`                | `next-themes` (`setTheme`), une seule source                                                                                                                                                                 |
| Palette des popups       | Couche de portail à la racine de chaque démo | Gardée pour le Sidebar (police et palette héritées, rien n'entre dans le flux du rail) ; `<body>` ailleurs                                                                                                   |
| Bascule mobile / desktop | Aucune                                       | Media query CSS pour la mise en page ; `matchMedia` seulement pour activer le glissement, après le montage                                                                                                   |
| Pages balayées           | Quatre pages dans une maquette               | Les routes du haut, montées par la coque ; un glissement navigue (`router.push`) et la piste suit tout de suite                                                                                              |
| Menu profil              | Un                                           | Un par surface (rail, barre du haut), états séparés ; la touche P ouvre celui visible                                                                                                                        |
| Textes                   | Anglais en dur                               | Props de libellés, traduites par next-international                                                                                                                                                          |

## 5. Recette pour porter le composant suivant

1. **Lire l'en-tête** de la démo (`Behaviour`, `Decisions`) : il dit ce qui est
   voulu et ce qui a été refusé, et pourquoi. Garder les décisions.
2. **Extraire la logique pure** dans un `.ts` voisin (géométrie, échelles,
   règles de clavier, découpages) et l'écrire en tests d'abord.
3. **Sortir le CSS** dans un `.module.css` : classes en camelCase sans préfixe,
   `--xx-role` remplacés par les rôles globaux (table de la section 2),
   fallbacks `var(--x, …)` supprimés. Aucune couleur brute : si un rôle manque,
   l'ajouter à `tokens.css` avec un commentaire.
4. **Icônes** : `@keel/ui/mint/icons` ; une icône manquante se copie depuis
   la démo, jamais depuis un autre jeu. Marques et logos : `MerchantLogo`.
   Propriétés CSS standard seulement (pas de `-webkit-` écrit à la main).
5. **Données et textes** en props, montants et dates via `@keel/finance`.
6. **`"use client"`** seulement si le composant a de l'état, des effets ou
   `motion`. Un composant de pure présentation reste serveur.
7. **Mouvement réduit** : garder le chemin fade-only de la démo, et le bloc
   `@media (prefers-reduced-motion: reduce)` de son CSS.
8. **Réutiliser** avant de recopier : `motion.ts`, `useSize`, `useEscape`,
   `Hint`, `popup.module.css`, `IconButton`, `CategoryTag`. Mais un composant
   de la démo se transpose en entier plutôt que recomposé de pièces voisines.
9. **Vérifier** : `bun run lint && bun run typecheck && bun run test`, puis
   captures côte à côte avec la démo (puppeteer), en clair et en sombre, à
   390 px et sur desktop, avant de dire que c'est fait.

## 6. Non repris

- Les logos de marques de mint-pocs, les données fictives hors accueil, le
  CAD en dur.
- Du rail : la pastille « Tax », le switch « Advanced trading », le menu de
  tri et les lignes d'ordres de bourse (le mécanisme du dock est gardé,
  reconverti).
- Le mode confidentialité (`PrivacyDots`) : à porter avec les premiers écrans.

## 7. Limites connues

- Pas encore de tests visuels en CI. Un test Playwright par composant (clair,
  sombre, 390 px) viendra avec les premiers écrans réels.
- Pas de route de logos (`/logos/<domaine>.svg`) : `MerchantLogo` montre
  l'initiale en attendant.
- Wealthsimple Sans est propriétaire : à remplacer avant la production.
- Les pages du haut étant montées par la coque, elles sont des composants
  client : leurs données viendront de requêtes tRPC préchargées, pas de
  composants serveur par route.

## 8. Décisions validées

1. Stack de mint-pocs (Base UI, motion), CSS Modules, tokens en primitives et
   rôles, sans token de composant, les inutilisés supprimés et gardés par un
   test.
2. Icônes et police de mint-pocs pour l'instant (police à remplacer avant la
   production), logos ramnn.
3. Pages d'exemple du starter (tâches, jobs, palette de commandes) supprimées,
   table `tasks` supprimée par migration.
4. Mode confidentialité : porté avec les premiers écrans.
