# Mise à jour - Support des photos de profil

## ✅ Modifications effectuées

### 1. **Types TypeScript** (`types/api.ts`)
- Ajout de `picture: string | null` dans `PlayerDTO`
- Ajout de `schedule_preference: string | null` dans `PlayerDTO`

### 2. **Services API** (`services/api.ts`)
- Mise à jour de `registerPlayer()` pour supporter `multipart/form-data`
  - Support de `profile_image` (fichier image)
  - Support de `schedule_preference` (string)
- Mise à jour de `updatePlayerInfo()` pour supporter `multipart/form-data`
  - Même fonctionnalité que registerPlayer
  - Correction de l'endpoint: `/Players/{id}` au lieu de `/Players/{id}/player`

### 3. **Composant PlayerAvatar** (`components/player-avatar.tsx`)
- Nouveau composant réutilisable pour afficher les avatars
- Affiche l'image de profil si disponible
- Sinon affiche les initiales dans un cercle coloré
- Props:
  - `firstName`, `lastName`: pour les initiales
  - `pictureUrl`: URL de la photo (optionnel)
  - `size`: taille de l'avatar (défaut: 40)
  - `backgroundColor`: couleur de fond pour les initiales

### 4. **Hook useImagePicker** (`hooks/use-image-picker.ts`)
- Hook personnalisé pour sélectionner des images
- Gère les permissions
- Permet le recadrage 1:1
- Retourne un objet avec `uri`, `name`, `type` compatible avec FormData

### 5. **Écran Ranking** (`app/(tabs)/ranking.tsx`)
- Utilisation du composant `PlayerAvatar` pour tous les joueurs
- Affichage des photos de profil dans:
  - Le podium (top 3)
  - La liste complète des joueurs
- Fallback sur initiales si pas de photo

## 📝 À implémenter plus tard (optionnel)

### Formulaire d'inscription
- Ajouter un bouton "Ajouter une photo" dans `components/auth-modal.tsx`
- Utiliser le hook `useImagePicker`
- Passer l'image au `signup()` dans `AuthContext`

### Page profil
- Ajouter un bouton pour changer la photo
- Utiliser le hook `useImagePicker`  
- Appeler `api.updatePlayerInfo()` avec la nouvelle image

### Exemple d'intégration (inscription) :

```typescript
import { useImagePicker } from '@/hooks/use-image-picker';

// Dans le composant
const { image, pickImage } = useImagePicker();

// Bouton pour choisir l'image
<TouchableOpacity onPress={pickImage}>
  {image ? (
    <Image source={{ uri: image.uri }} style={styles.preview} />
  ) : (
    <ThemedText>📷 Ajouter une photo</ThemedText>
  )}
</TouchableOpacity>

// Lors de l'inscription
await api.registerPlayer({
  first_name: firstName,
  last_name: lastName,
  email: email,
  phone: phone,
  profile_image: image || undefined,
});
```

## 🎯 Architecture

L'architecture est maintenant prête pour supporter les photos de profil :
- Backend accepte `multipart/form-data`
- Frontend sait envoyer des images
- Les avatars s'affichent automatiquement partout
- Le hook `useImagePicker` simplifie la sélection d'images

Il suffit d'ajouter les boutons UI pour permettre à l'utilisateur de sélectionner une photo lors de l'inscription ou dans son profil.
