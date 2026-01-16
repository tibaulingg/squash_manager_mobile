# Endpoint Player Login

## Vue d'ensemble

Cet endpoint permet d'authentifier un joueur avec son email et son mot de passe hashé en SHA256.

## Endpoint

**POST** `/api/Players/login`

## Requête

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "Email": "joueur@example.com",
  "PasswordHash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
}
```

### Paramètres
- `Email` (string, requis) : Email du joueur (en minuscules, trimé)
- `PasswordHash` (string, requis) : Hash SHA256 du mot de passe en hexadécimal

## Réponse

### Succès (200 OK)
Retourne le `PlayerDTO` du joueur authentifié :

```json
{
  "id": "guid",
  "first_name": "Prénom",
  "last_name": "Nom",
  "email": "joueur@example.com",
  "phone": "+33123456789",
  "current_box": 1,
  "schedule_preference": "peu_importe",
  "profile_image_url": "https://...",
  ...
}
```

### Erreurs

#### 400 Bad Request
- Email ou PasswordHash manquant
- Format d'email invalide

#### 401 Unauthorized
- Email non trouvé
- Mot de passe incorrect (hash ne correspond pas)

#### 500 Internal Server Error
- Erreur serveur lors de la vérification

## Implémentation Backend (.NET)

### DTO de Requête
```csharp
public class PlayerLoginRequest
{
    public string Email { get; set; }
    public string PasswordHash { get; set; }
}
```

### Exemple de Controller
```csharp
[HttpPost("login")]
public async Task<ActionResult<PlayerDTO>> Login([FromBody] PlayerLoginRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.PasswordHash))
    {
        return BadRequest("Email et mot de passe requis");
    }

    // Normaliser l'email (minuscules, trim)
    var normalizedEmail = request.Email.Trim().ToLowerInvariant();

    // Chercher le joueur par email
    var player = await _context.Players
        .FirstOrDefaultAsync(p => p.Email != null && p.Email.ToLower() == normalizedEmail);

    if (player == null)
    {
        return Unauthorized("Email ou mot de passe incorrect");
    }

    // Vérifier le hash du mot de passe
    // Note: Le mot de passe stocké en base doit être hashé en SHA256
    if (player.PasswordHash != request.PasswordHash)
    {
        return Unauthorized("Email ou mot de passe incorrect");
    }

    // Retourner le joueur
    return Ok(MapToPlayerDTO(player));
}
```

### Notes importantes

1. **Sécurité** : 
   - Le mot de passe est hashé côté client en SHA256 avant l'envoi
   - Le hash stocké en base de données doit être en SHA256
   - Ne jamais logger ou exposer le hash du mot de passe

2. **Normalisation de l'email** :
   - L'email est normalisé en minuscules et trimé côté client
   - Vérifier que la comparaison en base est case-insensitive

3. **Gestion des erreurs** :
   - Ne pas révéler si l'email existe ou non (sécurité)
   - Message générique : "Email ou mot de passe incorrect"

4. **Hash SHA256** :
   - Format : hexadécimal (64 caractères)
   - Exemple : `"a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"`

## Utilisation côté Client (React Native)

```typescript
import { hashPassword } from '@/utils/crypto-helpers';
import { api } from '@/services/api';

// Dans AuthContext
const login = async (email: string, password: string) => {
  // Hasher le mot de passe
  const passwordHash = await hashPassword(password);
  
  // Appeler l'API
  const player = await api.login(email.toLowerCase().trim(), passwordHash);
  
  // Sauvegarder la session
  // ...
};
```

## Migration des mots de passe existants

Si vous avez des joueurs existants sans hash de mot de passe :
1. Soit demander une réinitialisation de mot de passe
2. Soit créer un endpoint temporaire pour définir le mot de passe lors de la première connexion
3. Soit permettre une connexion sans mot de passe pour les anciens comptes (non recommandé)
