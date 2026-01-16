# Endpoint Player Register

## Vue d'ensemble

Cet endpoint permet de créer un nouveau joueur (inscription) avec son mot de passe hashé en SHA256.

## Endpoint

**POST** `/api/Players/register`

## Requête

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "FirstName": "Jean",
  "LastName": "Dupont",
  "Email": "jean.dupont@example.com",
  "Phone": "+33123456789",
  "PasswordHash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "SchedulePreference": "peu_importe"
}
```

### Paramètres
- `FirstName` (string, requis) : Prénom du joueur
- `LastName` (string, requis) : Nom du joueur
- `Email` (string, requis) : Email du joueur
- `Phone` (string, requis) : Téléphone du joueur
- `PasswordHash` (string, requis) : Hash SHA256 du mot de passe en hexadécimal
- `SchedulePreference` (string, optionnel) : Préférence d'horaire (ex: "peu_importe", "matin", "soir")

## Réponse

### Succès (201 Created)
Retourne le `PlayerDTO` du joueur créé :

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "first_name": "Jean",
  "last_name": "Dupont",
  "email": "jean.dupont@example.com",
  "phone": "+33123456789",
  "current_box": null,
  "next_box_status": null,
  "schedule_preference": "peu_importe",
  "profile_image_url": null,
  ...
}
```

**Note** : `profile_image_url` sera `null` lors de l'inscription. L'image de profil peut être ajoutée ultérieurement via le profil.

### Erreurs

#### 400 Bad Request
- Champs requis manquants (FirstName, LastName, Email, Phone, PasswordHash)
- Format d'email invalide
- Email déjà utilisé

#### 409 Conflict
- Email déjà existant dans la base de données

#### 500 Internal Server Error
- Erreur serveur lors de la création

## Implémentation Backend (.NET)

### DTO de Requête
```csharp
public class RegisterPlayerRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? SchedulePreference { get; set; }
}
```

### Exemple de Controller
```csharp
[HttpPost("register")]
public async Task<ActionResult<PlayerDTO>> RegisterPlayer([FromBody] RegisterPlayerRequest request)
{
    // Validation des champs requis
    if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName))
    {
        return BadRequest("First name and last name are required");
    }

    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return BadRequest("Email is required");
    }

    if (string.IsNullOrWhiteSpace(request.Phone))
    {
        return BadRequest("Phone is required");
    }

    if (string.IsNullOrWhiteSpace(request.PasswordHash))
    {
        return BadRequest("Password is required");
    }

    // Normaliser l'email
    var normalizedEmail = request.Email.Trim().ToLowerInvariant();

    // Vérifier si l'email existe déjà
    var existingPlayer = await _context.Players
        .FirstOrDefaultAsync(p => p.Email != null && p.Email.ToLower() == normalizedEmail);

    if (existingPlayer != null)
    {
        return Conflict("Email already exists");
    }

    // Créer un nouveau joueur
    var player = new Player
    {
        Id = Guid.NewGuid(),
        FirstName = request.FirstName.Trim(),
        LastName = request.LastName.Trim(),
        Email = normalizedEmail,
        Phone = request.Phone.Trim(),
        PasswordHash = request.PasswordHash, // Hash SHA256 déjà calculé côté client
        SchedulePreference = request.SchedulePreference ?? "peu_importe",
        ProfileImageUrl = null, // L'image sera ajoutée via le profil après l'inscription
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    _context.Players.Add(player);
    await _context.SaveChangesAsync();

    // Mapper vers DTO
    var playerDto = MapToPlayerDTO(player);

    return CreatedAtAction(nameof(GetPlayer), new { id = player.Id }, playerDto);
}
```

### Notes importantes

1. **Sécurité** : 
   - Le mot de passe est hashé côté client en SHA256 avant l'envoi
   - Stocker directement le hash SHA256 en base de données (ne pas re-hasher)
   - Ne jamais logger ou exposer le hash du mot de passe

2. **Normalisation de l'email** :
   - L'email est normalisé en minuscules et trimé côté client
   - Vérifier que la comparaison en base est case-insensitive
   - Vérifier l'unicité de l'email avant la création

3. **Hash SHA256** :
   - Format : hexadécimal (64 caractères)
   - Exemple : `"a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"`
   - Le hash est déjà calculé côté client, ne pas le modifier côté serveur

4. **Image de profil** :
   - L'image de profil n'est pas gérée lors de l'inscription
   - Elle sera ajoutée/modifiée via le profil après l'inscription

5. **Gestion des erreurs** :
   - Vérifier l'unicité de l'email (retourner 409 Conflict si existe)
   - Valider tous les champs requis
   - Gérer les erreurs de sauvegarde d'image

## Utilisation côté Client (React Native)

```typescript
import { hashPassword } from '@/utils/crypto-helpers';
import { api } from '@/services/api';

// Dans AuthContext
const signup = async (firstName: string, lastName: string, email: string, password: string, phone: string, schedulePreference?: string) => {
  // Hasher le mot de passe
  const passwordHash = await hashPassword(password);
  
  // Appeler l'API
  const player = await api.registerPlayer({
    first_name: firstName,
    last_name: lastName,
    email: email.toLowerCase().trim(),
    phone: phone,
    password_hash: passwordHash,
    schedule_preference: schedulePreference,
  });
  
  // Sauvegarder la session
  // ...
};
```

## Migration des joueurs existants

Si vous avez des joueurs existants sans mot de passe :
1. Permettre la création d'un compte avec un email existant (mais vérifier d'abord)
2. Ou forcer la réinitialisation du mot de passe lors de la première connexion
3. Ou créer un endpoint séparé pour définir le mot de passe pour les anciens comptes

## Structure de la base de données

Assurez-vous que la table `Players` contient :
- `Id` (Guid, Primary Key)
- `FirstName` (string)
- `LastName` (string)
- `Email` (string, unique, indexé)
- `Phone` (string)
- `PasswordHash` (string, 64 caractères pour SHA256 hex)
- `SchedulePreference` (string, nullable)
- `ProfileImageUrl` (string, nullable)
- `CreatedAt` (DateTime)
- `UpdatedAt` (DateTime)
