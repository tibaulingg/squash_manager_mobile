# Squash 22 - App Mobile

Application mobile React Native pour gérer les boxes de squash.

## 🚀 Démarrage rapide

   ```bash
   npm install
npm start
   ```

## ⚙️ Configuration

**URL de l'API** : Modifier dans `constants/config.ts`

```typescript
export const API_BASE_URL = 'https://votre-api.com/api/';
```

## 📁 Structure simplifiée

```
app/
  (tabs)/
    box.tsx       # Liste des boxes et matchs
    index.tsx     # Page d'accueil
    profil.tsx    # Profil utilisateur
  login.tsx       # Connexion
  signup.tsx      # Inscription
  welcome.tsx     # Écran d'accueil

components/
  box-table.tsx   # Tableau d'un box

services/
  api.ts          # Appels API (4 fonctions)

types/
  api.ts          # Types TypeScript

constants/
  config.ts       # Configuration API
  theme.ts        # Couleurs et thème
```

## 🔌 API

L'app utilise 4 endpoints :

- `GET /Seasons` - Liste des saisons
- `GET /Boxes?season_id={id}` - Boxes d'une saison
- `GET /Matches?season_id={id}` - Matchs d'une saison
- `GET /Players` - Tous les joueurs

## 🎨 Fonctionnalités

- ✅ Affichage des boxes par saison
- ✅ Tableaux de matchs avec scores
- ✅ Tri automatique par niveau
- ✅ Pull-to-refresh
- ✅ Mode sombre/clair
- ✅ Avatars des joueurs
