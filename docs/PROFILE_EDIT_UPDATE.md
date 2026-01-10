# Mise à jour Profil - Photo et Préférence de Planning

## ✅ Fonctionnalités implémentées

### 1. **Sélection de préférence de planning**
L'utilisateur peut maintenant choisir sa préférence pour les horaires de matchs :
- 🌅 **Tôt** : préfère jouer tôt dans la journée
- 🌙 **Tard** : préfère jouer tard dans la journée  
- 🤷 **Peu importe** : pas de préférence (par défaut)

### 2. **Photo de profil**
- Upload de photo depuis la galerie
- Aperçu de la nouvelle photo avant sauvegarde
- Affichage de la photo dans le profil
- Affichage des photos dans le Golden Ranking
- Fallback automatique sur les initiales si pas de photo

### 3. **Interface utilisateur**

#### Dans le profil :
- **Avatar avec photo** : affiche la photo de profil ou les initiales
- **Badge de préférence** : affiche la préférence si "tôt" ou "tard"
- **Bouton d'édition** : icône crayon en haut à droite

#### Dans le formulaire d'édition :
- **Section photo** : 
  - Avatar/photo actuelle
  - Bouton "Ajouter" ou "Changer" avec icône caméra
- **Sélecteur de préférence** : 3 boutons stylisés
- **Champs email et téléphone** : toujours présents

### 4. **Fichiers modifiés**

#### `components/profile/edit-profile-form.tsx`
- Ajout des props pour photo et préférence
- Interface complète avec photo, préférence, email, téléphone
- Boutons de préférence avec état actif/inactif

#### `app/(tabs)/profil.tsx`
- Intégration du hook `useImagePicker`
- Utilisation de `PlayerAvatar` pour afficher la photo
- Envoi de `schedule_preference` et `profile_image` à l'API
- Affichage du badge de préférence sous l'email

#### `hooks/use-image-picker.ts`
- Hook déjà créé pour gérer la sélection d'images
- Gestion automatique des permissions
- Format compatible avec FormData pour l'API

#### `components/player-avatar.tsx`
- Composant déjà créé pour afficher les avatars
- Utilisé dans le profil et le ranking

## 🎯 Utilisation

### Côté utilisateur :
1. Aller sur son profil
2. Cliquer sur l'icône crayon (éditer)
3. Choisir sa photo via le bouton caméra
4. Sélectionner sa préférence de planning
5. Modifier email/téléphone si besoin
6. Enregistrer

### Côté API :
L'appel à `api.updatePlayerInfo()` envoie maintenant :
```typescript
{
  first_name: string,
  last_name: string,
  email: string,
  phone: string,
  schedule_preference?: 'tot' | 'tard' | 'peu_importe',
  profile_image?: {
    uri: string,
    name: string,
    type: string
  }
}
```

Le backend reçoit une requête `multipart/form-data` avec :
- `FirstName`, `LastName`, `Email`, `Phone` (form fields)
- `SchedulePreference` (form field)
- `ProfileImage` (file upload)

## 📱 Affichage

### Dans le profil
```
┌─────────────────────┐
│    [Éditer ✏️]     │
│                     │
│    [Photo/Avatar]   │
│   Prénom Nom        │
│   email@example.com │
│  🌅 Préfère tôt     │ ← si défini
│    [Box Badge]      │
└─────────────────────┘
```

### Dans le Golden Ranking
- Photos affichées dans le podium (top 3)
- Photos affichées dans la liste complète
- Taille adaptée à chaque contexte

## 🔄 Flow de mise à jour

1. Utilisateur clique sur "Éditer"
2. Formulaire se pré-remplit avec les données actuelles
3. Utilisateur peut :
   - Changer sa photo (optionnel)
   - Modifier sa préférence
   - Modifier email/téléphone
4. Clic sur "Enregistrer"
5. Envoi à l'API en `multipart/form-data`
6. Rechargement des données
7. Fermeture du formulaire
8. Notification de succès

## ✨ Points techniques

- **FormData** : utilisé pour l'upload de fichiers
- **useImagePicker** : gère permissions + sélection + format
- **PlayerAvatar** : composant réutilisable pour tous les avatars
- **Schedule preference** : stockée comme string dans l'API
- **Validation** : email obligatoire avec '@', téléphone optionnel
- **États** : loading pendant la sauvegarde, reset de l'image en cas d'annulation
