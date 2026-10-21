# Mon Budget

Application web de gestion financière personnelle, pensée pour l'iPhone (style iOS), **100 % locale** :

- **Accueil** : patrimoine net, évolution, taux d'épargne, prochains prélèvements.
- **Salaire** : répartition du salaire net en enveloppes (en % ou en montant fixe), modèles 50/30/20, etc.
- **Abonnements** : dépenses récurrentes (hebdo, mensuel, trimestriel, annuel), total mensuel/annuel, échéances à venir.
- **Placements** : valeur, total investi, performance, historique par placement (saisie manuelle).
- **Patrimoine** : comptes, dettes et crédits, patrimoine net.
- **Réglages** : thème clair/sombre, devise, export/import JSON.

## Confidentialité

- Aucune donnée n'est envoyée sur Internet : pas de backend, pas de compte, pas de connexion bancaire.
- Les données sont stockées dans **IndexedDB**, sur l'appareil uniquement.
- Une politique de sécurité (CSP) dans `index.html` interdit à l'application de contacter un autre domaine.

## Fichiers

Tous les fichiers sont à la racine (pas de sous-dossier) pour simplifier l'envoi sur GitHub :

```
index.html   styles.css   app.js   sw.js   manifest.webmanifest
icon.svg   icon-192.png   icon-512.png   apple-touch-icon.png   README.md
```

Tous les chemins sont **relatifs** : l'app fonctionne telle quelle sous `https://<utilisateur>.github.io/<depot>/`.

## Publier sur GitHub Pages (gratuit)

1. Crée un dépôt GitHub (public ou privé selon ton offre) et envoie-y **tous les fichiers** ci-dessus à la racine
   (sur github.com : *Add file → Upload files*, tu peux tout sélectionner d'un coup).
2. Dans le dépôt : **Settings → Pages → Build and deployment**.
   Source : *Deploy from a branch* ; Branch : `main` ; dossier : `/ (root)` ; **Save**.
3. Après une minute, l'adresse `https://<utilisateur>.github.io/<depot>/` est en ligne.

## Installer sur l'iPhone

1. Ouvre l'adresse dans **Safari**.
2. Touche **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lance l'app depuis l'icône : elle s'ouvre en plein écran et fonctionne **hors ligne** après le premier chargement.

> Important : installe l'app sur l'écran d'accueil. Safari peut effacer les données des sites non utilisés
> pendant plusieurs semaines, alors qu'une app installée est beaucoup mieux protégée.
> Exporte aussi une sauvegarde de temps en temps (Réglages ⚙︎ → *Exporter mes données*).

## Sauvegarde et restauration

- **Exporter** : crée un fichier `mon-budget-AAAA-MM-JJ.json` (feuille de partage iOS : *Enregistrer dans Fichiers*, AirDrop…).
- **Importer** : choisis un fichier exporté ; le contenu est validé puis **remplace** les données actuelles après confirmation.
- Pour changer d'iPhone : exporte sur l'ancien, importe sur le nouveau.

## Mettre à jour l'application

Après avoir modifié un fichier, change `VERSION` en haut de `sw.js` (par exemple `v1.0.1`) avant de l'envoyer.
Les appareils récupèrent la nouvelle version au lancement suivant (fermer puis rouvrir l'app).

## Tester en local

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Le service worker nécessite HTTPS (ou `localhost`).

## Notes sur les calculs

- **Enveloppes** : montant = salaire × % ou montant fixe. « Non réparti » = salaire − total des enveloppes.
- **Abonnements** : équivalent mensuel = hebdo × 52 ÷ 12, trimestriel ÷ 3, annuel ÷ 12. Les abonnements en pause sont exclus.
- **Performance d'un placement** : (valeur actuelle − total investi) ÷ total investi.
- **Patrimoine net** : comptes + placements − dettes. Un point d'historique est enregistré par jour d'utilisation.
