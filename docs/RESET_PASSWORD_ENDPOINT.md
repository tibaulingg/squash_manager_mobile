# Endpoint de Réinitialisation de Mot de Passe (avec token)

## POST /api/Players/reset-password

Cet endpoint permet à un joueur de réinitialiser son mot de passe en utilisant un token de réinitialisation reçu par email.

### Requête

**URL:** `/api/Players/reset-password`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "Token": "guid-token-recu-par-email",
  "NewPasswordHash": "sha256-hash-du-nouveau-mot-de-passe"
}
```

### Réponse

#### Succès (200 OK)
```json
{
  "message": "Mot de passe réinitialisé avec succès"
}
```

#### Erreurs

**400 Bad Request** - Token ou mot de passe manquant
```json
{
  "error": "Token and NewPasswordHash are required"
}
```

**400 Bad Request** - Token invalide ou expiré
```json
{
  "error": "Token invalide ou expiré"
}
```

**404 Not Found** - Joueur non trouvé
```json
{
  "error": "Joueur non trouvé"
}
```

### Comportement

1. Vérifier que le token existe et n'est pas expiré
2. Trouver le joueur associé au token
3. Mettre à jour le mot de passe avec le nouveau hash SHA256
4. Invalider le token (le supprimer ou le marquer comme utilisé)
5. Retourner un message de succès

### Exemple d'implémentation C#

```csharp
[HttpPost("reset-password")]
public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPasswordHash))
    {
        return BadRequest(new { error = "Token and NewPasswordHash are required" });
    }

    // Rechercher le joueur par token de réinitialisation
    var player = await _context.Players
        .FirstOrDefaultAsync(p => p.PasswordResetToken == request.Token);

    if (player == null)
    {
        return BadRequest(new { error = "Token invalide ou expiré" });
    }

    // Vérifier que le token n'est pas expiré
    if (player.PasswordResetTokenExpiry == null || player.PasswordResetTokenExpiry < DateTime.UtcNow)
    {
        // Nettoyer le token expiré
        player.PasswordResetToken = null;
        player.PasswordResetTokenExpiry = null;
        await _context.SaveChangesAsync();
        
        return BadRequest(new { error = "Token invalide ou expiré" });
    }

    // Mettre à jour le mot de passe
    player.PasswordHash = request.NewPasswordHash;
    
    // Invalider le token après utilisation
    player.PasswordResetToken = null;
    player.PasswordResetTokenExpiry = null;
    
    await _context.SaveChangesAsync();

    return Ok(new { message = "Mot de passe réinitialisé avec succès" });
}

public class ResetPasswordRequest
{
    public string Token { get; set; }
    public string NewPasswordHash { get; set; }
}
```

### Modèle de données Player

Le modèle `Player` doit contenir les champs suivants pour gérer la réinitialisation :

```csharp
public class Player
{
    // ... autres propriétés
    
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }
}
```

### Notes

- Le token doit être unique et généré de manière sécurisée (GUID)
- Le token doit avoir une durée de vie limitée (24h recommandé)
- Le token doit être invalidé après utilisation
- Le nouveau mot de passe doit être hashé en SHA256 côté client avant l'envoi
- Il est recommandé de limiter le nombre de tentatives de reset par token/IP
