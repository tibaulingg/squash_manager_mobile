# API pour les Réactions aux Changements de Statut

Ce document décrit les modifications nécessaires côté backend pour supporter les réactions sur les changements de statut de réinscription (membership).

## Modifications du modèle

### Table `MatchReaction` (modifiée)
```csharp
public class MatchReaction
{
    public Guid Id { get; set; }
    public Guid? MatchId { get; set; } // Nullable maintenant
    public Guid? MembershipId { get; set; } // NOUVEAU - Nullable
    public Guid PlayerId { get; set; }
    public string ReactionType { get; set; } // 'fire', 'clap', 'muscle', 'party', 'sad', 'heart'
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public Match? Match { get; set; }
    public BoxMembership? Membership { get; set; } // NOUVEAU
    public Player Player { get; set; }
    
    // Contrainte : soit MatchId soit MembershipId doit être rempli
}
```

### Migration SQL
```sql
-- Ajouter la colonne nullable
ALTER TABLE [dbo].[MatchReaction] 
ADD [MembershipId] uniqueidentifier NULL;

-- Ajouter la foreign key
ALTER TABLE [dbo].[MatchReaction]
ADD CONSTRAINT [FK_MatchReaction_Membership] 
FOREIGN KEY ([MembershipId]) REFERENCES [BoxMembership]([Id]);

-- Modifier MatchId pour qu'il soit nullable
ALTER TABLE [dbo].[MatchReaction]
ALTER COLUMN [MatchId] uniqueidentifier NULL;

-- Modifier la contrainte unique pour permettre soit MatchId soit MembershipId
-- Supprimer l'ancienne contrainte
ALTER TABLE [dbo].[MatchReaction]
DROP CONSTRAINT [UK_MatchReaction_PlayerMatch];

-- Créer une nouvelle contrainte unique pour (MatchId, PlayerId) OU (MembershipId, PlayerId)
-- Note: SQL Server ne supporte pas directement les contraintes conditionnelles,
-- donc on peut utiliser un index unique filtré ou une contrainte check
CREATE UNIQUE INDEX [IX_MatchReaction_PlayerMatch] 
ON [dbo].[MatchReaction]([MatchId], [PlayerId])
WHERE [MatchId] IS NOT NULL;

CREATE UNIQUE INDEX [IX_MatchReaction_PlayerMembership] 
ON [dbo].[MatchReaction]([MembershipId], [PlayerId])
WHERE [MembershipId] IS NOT NULL;

-- Index pour les performances
CREATE INDEX [IX_MatchReaction_MembershipId] ON [MatchReaction]([MembershipId]);
```

## Nouveaux DTOs

```csharp
public class StatusReactionDTO
{
    public Guid MembershipId { get; set; }
    public Dictionary<string, int> Reactions { get; set; } // { "fire": 5, "clap": 2, ... }
    public string? UserReaction { get; set; } // Réaction de l'utilisateur actuel (null si aucune)
}

public class ReactToStatusRequest
{
    public Guid PlayerId { get; set; }
    public string? ReactionType { get; set; } // null pour retirer la réaction
}
```

## Endpoints à créer/modifier

### 1. Récupérer les réactions pour plusieurs memberships

```csharp
[HttpPost("Memberships/reactions")]
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

public class MembershipReactionsRequest
{
    public List<Guid> MembershipIds { get; set; }
    public Guid CurrentPlayerId { get; set; }
}
```

### 2. Ajouter/Retirer une réaction sur un changement de statut

```csharp
[HttpPost("Memberships/{membershipId}/react")]
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
```

## Modifications des endpoints existants

### Modifier GetMatchReactions pour exclure les réactions sur memberships

```csharp
[HttpPost("Matches/reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(
    [FromBody] MatchReactionsRequest request)
{
    if (request.MatchIds == null || request.MatchIds.Count == 0)
        return Ok(new Dictionary<Guid, MatchReactionDTO>());
    
    // IMPORTANT: Filtrer uniquement les réactions sur les matchs (MembershipId IS NULL)
    var reactions = await _context.MatchReactions
        .Where(r => r.MatchId != null && request.MatchIds.Contains(r.MatchId.Value) && r.MembershipId == null)
        .ToListAsync();
    
    // ... reste du code identique
}
```

### Modifier ReactToMatch pour s'assurer que MembershipId est null

```csharp
[HttpPost("Matches/{matchId}/react")]
public async Task<IActionResult> ReactToMatch(
    Guid matchId,
    [FromQuery] Guid currentPlayerId,
    [FromBody] ReactToMatchRequest request)
{
    // ... vérifications ...
    
    var existingReaction = await _context.MatchReactions
        .FirstOrDefaultAsync(r => r.MatchId == matchId && r.PlayerId == currentPlayerId && r.MembershipId == null);
    
    // ... reste du code, en s'assurant que MembershipId = null lors de la création
}
```

## Contraintes de validation

Ajouter une contrainte check pour s'assurer qu'exactement un des deux (MatchId ou MembershipId) est rempli :

```sql
ALTER TABLE [dbo].[MatchReaction]
ADD CONSTRAINT [CK_MatchReaction_MatchOrMembership] 
CHECK (
    ([MatchId] IS NOT NULL AND [MembershipId] IS NULL) OR 
    ([MatchId] IS NULL AND [MembershipId] IS NOT NULL)
);
```
