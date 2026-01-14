# Corrections des Routes API pour les Réactions

## Problèmes identifiés

### 1. Route `/api/Matches/reactions` (405 Method Not Allowed)

**Problème** : Dans `MatchesController`, la route est définie comme :
```csharp
[HttpPost("Matches/reactions")]
```

Avec `[Route("api/[controller]")]`, cela crée la route `/api/Matches/Matches/reactions` au lieu de `/api/Matches/reactions`.

**Solution** : Changer en :
```csharp
[HttpPost("reactions")]
```

### 2. Route `/api/Memberships/reactions` (404 Not Found)

**Problème** : Dans `BoxMembershipsController`, la route est définie comme :
```csharp
[HttpPost("Memberships/reactions")]
```

Avec `[Route("api/[controller]")]`, cela crée la route `/api/BoxMemberships/Memberships/reactions` au lieu de `/api/Memberships/reactions`.

**Solution** : Créer un nouveau controller `MembershipsController` avec les routes pour les réactions.

## Corrections à apporter

### Dans `MatchesController.cs`

**Changer** :
```csharp
[HttpPost("Matches/reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(
```

**En** :
```csharp
[HttpPost("reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(
```

### Créer un nouveau `MembershipsController.cs`

Créer un nouveau fichier `MembershipsController.cs` :

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQUASH_API.DTOs;
using SQUASH_API.Models;

[Route("api/[controller]")]
[ApiController]
public class MembershipsController : ControllerBase
{
    private readonly AppDbContext _context;

    public MembershipsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost("reactions")]
    public async Task<ActionResult<Dictionary<Guid, StatusReactionDTO>>> GetMembershipReactions(
        [FromBody] MembershipReactionsRequest request)
    {
        if (request.MembershipIds == null || request.MembershipIds.Count == 0)
            return Ok(new Dictionary<Guid, StatusReactionDTO>());

        var reactions = await _context.MatchReactions
            .Where(r => r.MembershipId != null && request.MembershipIds.Contains(r.MembershipId.Value))
            .ToListAsync();

        var result = new Dictionary<Guid, StatusReactionDTO>();

        foreach (var membershipId in request.MembershipIds)
        {
            var membershipReactions = reactions.Where(r => r.MembershipId == membershipId).ToList();
            var reactionCounts = membershipReactions
                .GroupBy(r => r.ReactionType)
                .ToDictionary(g => g.Key, g => g.Count());

            var userReaction = membershipReactions.FirstOrDefault(r => r.PlayerId == request.CurrentPlayerId)?.ReactionType;

            result[membershipId] = new StatusReactionDTO
            {
                MembershipId = membershipId,
                Reactions = reactionCounts,
                UserReaction = userReaction
            };
        }

        return Ok(result);
    }

    [HttpPost("{membershipId}/react")]
    public async Task<IActionResult> ReactToMembership(
        Guid membershipId,
        [FromQuery] Guid currentPlayerId,
        [FromBody] ReactToStatusRequest request)
    {
        // Vérifier que c'est le joueur actuel qui réagit
        if (request.PlayerId != currentPlayerId)
            return Forbid("Vous ne pouvez réagir qu'avec votre propre compte");

        var membership = await _context.BoxMemberships.FindAsync(membershipId);
        if (membership == null) return NotFound();

        var existingReaction = await _context.MatchReactions
            .FirstOrDefaultAsync(r => r.MembershipId == membershipId && r.PlayerId == currentPlayerId);

        if (request.ReactionType == null)
        {
            // Retirer la réaction
            if (existingReaction != null)
            {
                _context.MatchReactions.Remove(existingReaction);
                await _context.SaveChangesAsync();
            }
            return NoContent();
        }

        if (existingReaction != null)
        {
            // Mettre à jour la réaction existante
            existingReaction.ReactionType = request.ReactionType;
            existingReaction.CreatedAt = DateTime.UtcNow;
        }
        else
        {
            // Créer une nouvelle réaction
            var newReaction = new MatchReaction
            {
                Id = Guid.NewGuid(),
                MembershipId = membershipId,
                MatchId = null, // Pas de match pour une réaction sur un changement de statut
                PlayerId = currentPlayerId,
                ReactionType = request.ReactionType,
                CreatedAt = DateTime.UtcNow
            };
            _context.MatchReactions.Add(newReaction);
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }
}
```

### Supprimer les méthodes du `BoxMembershipsController.cs`

**Supprimer** ces deux méthodes de `BoxMembershipsController` :
- `GetMembershipReactions`
- `ReactToMembership`

Elles seront maintenant dans `MembershipsController`.

## DTOs nécessaires

Assurez-vous d'avoir ces DTOs dans votre projet :

```csharp
public class MembershipReactionsRequest
{
    public List<Guid> MembershipIds { get; set; }
    public Guid CurrentPlayerId { get; set; }
}

public class StatusReactionDTO
{
    public Guid MembershipId { get; set; }
    public Dictionary<string, int> Reactions { get; set; }
    public string? UserReaction { get; set; }
}

public class ReactToStatusRequest
{
    public Guid PlayerId { get; set; }
    public string? ReactionType { get; set; }
}
```

## Résumé des routes corrigées

| Route Frontend | Route Backend | Controller |
|---------------|---------------|------------|
| `POST /api/Matches/reactions` | `[HttpPost("reactions")]` | `MatchesController` |
| `POST /api/Memberships/reactions` | `[HttpPost("reactions")]` | `MembershipsController` (nouveau) |
| `POST /api/Memberships/{id}/react` | `[HttpPost("{membershipId}/react")]` | `MembershipsController` (nouveau) |
