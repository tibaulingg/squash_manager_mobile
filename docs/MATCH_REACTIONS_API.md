# API pour les Réactions aux Matchs

Ce document décrit les endpoints nécessaires pour gérer les réactions aux matchs dans le feed d'actualité.

## Modèle de données

### Table `MatchReaction`
```csharp
public class MatchReaction
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid PlayerId { get; set; }
    public string ReactionType { get; set; } // 'fire', 'clap', 'muscle', 'party', 'sad', 'heart'
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public Match Match { get; set; }
    public Player Player { get; set; }
}
```

### DTOs

```csharp
public class MatchReactionDTO
{
    public Guid MatchId { get; set; }
    public Dictionary<string, int> Reactions { get; set; } // { "fire": 5, "clap": 2, ... }
    public string? UserReaction { get; set; } // Réaction de l'utilisateur actuel (null si aucune)
}

public class ReactToMatchRequest
{
    public Guid PlayerId { get; set; }
    public string? ReactionType { get; set; } // null pour retirer la réaction
}
```

## Endpoints

### 1. Récupérer les réactions pour plusieurs matchs

```csharp
[HttpGet("reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(
    [FromQuery] string matchIds, // Format: "guid1,guid2,guid3"
    [FromQuery] Guid currentPlayerId)
{
    // Parser les IDs depuis la chaîne
    var matchIdList = matchIds.Split(',')
        .Where(id => Guid.TryParse(id, out _))
        .Select(Guid.Parse)
        .ToList();
    
    if (matchIdList.Count == 0)
        return Ok(new Dictionary<Guid, MatchReactionDTO>());
    
    var reactions = await _context.MatchReactions
        .Where(r => matchIdList.Contains(r.MatchId))
        .ToListAsync();
    
    var result = new Dictionary<Guid, MatchReactionDTO>();
    
    foreach (var matchId in matchIdList)
    {
        var matchReactions = reactions.Where(r => r.MatchId == matchId).ToList();
        var reactionCounts = matchReactions
            .GroupBy(r => r.ReactionType)
            .ToDictionary(g => g.Key, g => g.Count());
        
        var userReaction = matchReactions.FirstOrDefault(r => r.PlayerId == currentPlayerId)?.ReactionType;
        
        result[matchId] = new MatchReactionDTO
        {
            MatchId = matchId,
            Reactions = reactionCounts,
            UserReaction = userReaction
        };
    }
    
    return Ok(result);
}
```

### 2. Ajouter/Retirer une réaction

```csharp
[HttpPost("{matchId}/react")]
public async Task<IActionResult> ReactToMatch(
    Guid matchId,
    [FromQuery] Guid currentPlayerId,
    [FromBody] ReactToMatchRequest request)
{
    // Vérifier que c'est le joueur actuel qui réagit
    if (request.PlayerId != currentPlayerId)
        return Forbid("Vous ne pouvez réagir qu'avec votre propre compte");
    
    var match = await _context.Matches.FindAsync(matchId);
    if (match == null) return NotFound();
    
    var existingReaction = await _context.MatchReactions
        .FirstOrDefaultAsync(r => r.MatchId == matchId && r.PlayerId == currentPlayerId);
    
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
            MatchId = matchId,
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

## Migration SQL

```sql
CREATE TABLE [dbo].[MatchReaction] (
    [Id] uniqueidentifier NOT NULL PRIMARY KEY,
    [MatchId] uniqueidentifier NOT NULL,
    [PlayerId] uniqueidentifier NOT NULL,
    [ReactionType] nvarchar(20) NOT NULL,
    [CreatedAt] datetime NOT NULL,
    CONSTRAINT [FK_MatchReaction_Match] FOREIGN KEY ([MatchId]) REFERENCES [Match]([Id]),
    CONSTRAINT [FK_MatchReaction_Player] FOREIGN KEY ([PlayerId]) REFERENCES [Player]([Id]),
    CONSTRAINT [UK_MatchReaction_PlayerMatch] UNIQUE ([MatchId], [PlayerId])
);

CREATE INDEX [IX_MatchReaction_MatchId] ON [MatchReaction]([MatchId]);
CREATE INDEX [IX_MatchReaction_PlayerId] ON [MatchReaction]([PlayerId]);
```

## Notes

- Un joueur ne peut avoir qu'une seule réaction par match (contrainte unique)
- Si un joueur clique sur la même réaction, elle est retirée
- Si un joueur clique sur une autre réaction, l'ancienne est remplacée
- Les réactions possibles sont : `fire`, `clap`, `muscle`, `party`, `sad`, `heart`
