# Endpoint de Demande RGPD

## POST /api/Players/{playerId}/rgpd-request

Cet endpoint permet à un joueur de faire une demande RGPD pour anonymiser ou supprimer son compte.

### Requête

**URL:** `/api/Players/{playerId}/rgpd-request`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body:** (vide - pas de body nécessaire)

### Réponse

#### Succès (200 OK)
```json
{
  "message": "Votre demande RGPD a été enregistrée. Vous recevrez une confirmation par email.",
  "requestId": "123e4567-e89b-12d3-a456-426614174000",
  "requestedAt": "2024-01-15T10:30:00Z"
}
```

#### Erreurs

**400 Bad Request** - Le joueur a déjà une demande RGPD en cours
```json
{
  "error": "Une demande RGPD est déjà en cours pour ce compte"
}
```

**404 Not Found** - Joueur non trouvé
```json
{
  "error": "Joueur introuvable"
}
```

**403 Forbidden** - Le joueur ne peut faire une demande que pour son propre compte
```json
{
  "error": "Vous ne pouvez faire une demande RGPD que pour votre propre compte"
}
```

## Implémentation

### Option 1 : Créer une demande RGPD (Recommandé)

Cette approche crée une demande qui sera traitée par un administrateur. C'est plus sécurisé et permet de vérifier l'identité avant suppression.

#### 1. Créer une table pour les demandes RGPD

```csharp
// Dans Models/RgpdRequest.cs
namespace SQUASH_API.Models
{
    public class RgpdRequest
    {
        public Guid Id { get; set; }
        public Guid PlayerId { get; set; }
        public Player Player { get; set; } = null!;
        public string Status { get; set; } = "pending"; // pending, processing, completed, cancelled
        public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ProcessedAt { get; set; }
        public string? ProcessedBy { get; set; } // Admin qui a traité la demande
        public string? Notes { get; set; } // Notes internes
    }
}
```

#### 2. Ajouter la migration

```bash
dotnet ef migrations add AddRgpdRequest
dotnet ef database update
```

#### 3. Ajouter le DbSet dans le contexte

```csharp
// Dans Data/ApplicationDbContext.cs
public DbSet<RgpdRequest> RgpdRequests { get; set; }
```

#### 4. Créer le DTO

```csharp
// Dans DTOs/RgpdRequestDTO.cs
namespace SQUASH_API.DTOs
{
    public class RgpdRequestDTO
    {
        public Guid Id { get; set; }
        public Guid PlayerId { get; set; }
        public string Status { get; set; }
        public string RequestedAt { get; set; }
        public string? ProcessedAt { get; set; }
        public string? ProcessedBy { get; set; }
    }

    public class RgpdRequestResponseDTO
    {
        public string Message { get; set; }
        public Guid RequestId { get; set; }
        public string RequestedAt { get; set; }
    }
}
```

#### 5. Ajouter l'endpoint dans PlayersController

```csharp
// Dans Controllers/PlayersController.cs

[HttpPost("{id}/rgpd-request")]
public async Task<ActionResult<RgpdRequestResponseDTO>> RequestRgpd(Guid id, [FromQuery] Guid? currentPlayerId)
{
    // Vérifier que le joueur existe
    var player = await _context.Players.FindAsync(id);
    if (player == null)
        return NotFound(new { error = "Joueur introuvable" });

    // Vérifier que c'est le joueur lui-même qui fait la demande
    if (currentPlayerId.HasValue && currentPlayerId.Value != id)
        return Forbid("Vous ne pouvez faire une demande RGPD que pour votre propre compte");

    // Vérifier qu'il n'y a pas déjà une demande en cours
    var existingRequest = await _context.RgpdRequests
        .FirstOrDefaultAsync(r => r.PlayerId == id && (r.Status == "pending" || r.Status == "processing"));
    
    if (existingRequest != null)
        return BadRequest(new { error = "Une demande RGPD est déjà en cours pour ce compte" });

    // Créer la demande
    var rgpdRequest = new RgpdRequest
    {
        Id = Guid.NewGuid(),
        PlayerId = id,
        Status = "pending",
        RequestedAt = DateTime.UtcNow
    };

    _context.RgpdRequests.Add(rgpdRequest);
    await _context.SaveChangesAsync();

    // TODO: Envoyer un email de confirmation au joueur
    // await _emailService.SendRgpdRequestConfirmation(player.Email, rgpdRequest.Id);

    // TODO: Notifier les administrateurs
    // await _notificationService.NotifyAdminsOfRgpdRequest(rgpdRequest);

    return Ok(new RgpdRequestResponseDTO
    {
        Message = "Votre demande RGPD a été enregistrée. Vous recevrez une confirmation par email.",
        RequestId = rgpdRequest.Id,
        RequestedAt = rgpdRequest.RequestedAt.ToString("O")
    });
}
```

### Option 2 : Anonymisation/Suppression immédiate (Alternative)

Si vous préférez anonymiser/supprimer immédiatement le compte :

```csharp
[HttpPost("{id}/rgpd-request")]
public async Task<ActionResult> RequestRgpd(Guid id, [FromQuery] Guid? currentPlayerId)
{
    // Vérifier que le joueur existe
    var player = await _context.Players
        .Include(p => p.MatchesAsPlayerA)
        .Include(p => p.MatchesAsPlayerB)
        .Include(p => p.BoxMemberships)
        .Include(p => p.Followers)
        .Include(p => p.Following)
        .FirstOrDefaultAsync(p => p.Id == id);
    
    if (player == null)
        return NotFound(new { error = "Joueur introuvable" });

    // Vérifier que c'est le joueur lui-même
    if (currentPlayerId.HasValue && currentPlayerId.Value != id)
        return Forbid("Vous ne pouvez faire une demande RGPD que pour votre propre compte");

    // Anonymiser les données personnelles
    player.FirstName = "Anonyme";
    player.LastName = "Utilisateur";
    player.Email = $"deleted_{player.Id}@deleted.local";
    player.Phone = null;
    player.Picture = null;
    player.IsActive = false;
    player.DeletedAt = DateTime.UtcNow;

    // Optionnel : Supprimer les relations
    // _context.BoxMemberships.RemoveRange(player.BoxMemberships);
    // _context.PlayerFollows.RemoveRange(player.Followers);
    // _context.PlayerFollows.RemoveRange(player.Following);

    // Note : Les matchs sont généralement conservés pour l'historique statistique
    // mais peuvent être anonymisés si nécessaire

    await _context.SaveChangesAsync();

    // TODO: Envoyer un email de confirmation
    // await _emailService.SendRgpdCompletionConfirmation(player.Email);

    return Ok(new { message = "Votre compte a été anonymisé avec succès." });
}
```

## Endpoints supplémentaires pour les administrateurs

### GET /api/RgpdRequests

Récupérer toutes les demandes RGPD en attente :

```csharp
[HttpGet]
[Authorize(Roles = "Admin")]
public async Task<ActionResult<List<RgpdRequestDTO>>> GetRgpdRequests()
{
    var requests = await _context.RgpdRequests
        .Include(r => r.Player)
        .Where(r => r.Status == "pending")
        .OrderByDescending(r => r.RequestedAt)
        .Select(r => new RgpdRequestDTO
        {
            Id = r.Id,
            PlayerId = r.PlayerId,
            Status = r.Status,
            RequestedAt = r.RequestedAt.ToString("O"),
            ProcessedAt = r.ProcessedAt?.ToString("O"),
            ProcessedBy = r.ProcessedBy
        })
        .ToListAsync();

    return Ok(requests);
}
```

### POST /api/RgpdRequests/{id}/process

Traiter une demande RGPD (pour les admins) :

```csharp
[HttpPost("{id}/process")]
[Authorize(Roles = "Admin")]
public async Task<ActionResult> ProcessRgpdRequest(Guid id, [FromBody] ProcessRgpdRequestDTO request)
{
    var rgpdRequest = await _context.RgpdRequests
        .Include(r => r.Player)
        .FirstOrDefaultAsync(r => r.Id == id);

    if (rgpdRequest == null)
        return NotFound();

    if (rgpdRequest.Status != "pending")
        return BadRequest("Cette demande a déjà été traitée");

    var player = rgpdRequest.Player;

    // Anonymiser le compte
    player.FirstName = "Anonyme";
    player.LastName = "Utilisateur";
    player.Email = $"deleted_{player.Id}@deleted.local";
    player.Phone = null;
    player.Picture = null;
    player.IsActive = false;
    player.DeletedAt = DateTime.UtcNow;

    // Mettre à jour la demande
    rgpdRequest.Status = "completed";
    rgpdRequest.ProcessedAt = DateTime.UtcNow;
    rgpdRequest.ProcessedBy = User.Identity?.Name; // Nom de l'admin
    rgpdRequest.Notes = request.Notes;

    await _context.SaveChangesAsync();

    // TODO: Envoyer un email de confirmation
    // await _emailService.SendRgpdCompletionConfirmation(player.Email);

    return Ok(new { message = "Demande RGPD traitée avec succès" });
}
```

## Recommandations

1. **Option 1 (Demande)** est recommandée car :
   - Plus sécurisée (vérification par admin)
   - Permet de garder un historique
   - Permet de contacter le joueur avant suppression
   - Conforme aux meilleures pratiques RGPD

2. **Conservation des données** :
   - Les matchs peuvent être conservés pour les statistiques (anonymisés)
   - Les commentaires peuvent être anonymisés plutôt que supprimés
   - Les données financières peuvent nécessiter une conservation légale

3. **Notifications** :
   - Envoyer un email de confirmation au joueur
   - Notifier les administrateurs d'une nouvelle demande
   - Envoyer un email de confirmation après traitement

4. **Délai de traitement** :
   - Les demandes RGPD doivent être traitées dans un délai de 30 jours (conformité RGPD)

## Notes de sécurité

- Vérifier que seul le joueur peut faire une demande pour son propre compte
- Logger toutes les demandes RGPD pour audit
- Chiffrer les données sensibles avant anonymisation si nécessaire
- Respecter les délais légaux de traitement (30 jours maximum)
