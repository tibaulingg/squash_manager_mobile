# Mise à jour des Endpoints Batch - Réactions et Commentaires

Ce document décrit les modifications nécessaires côté API backend pour supporter les requêtes batch avec body au lieu de query parameters.

## 1. Modifier l'endpoint des réactions (GET → POST)

### Avant (GET avec query string)
```csharp
[HttpGet("reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(
    [FromQuery] string matchIds, // Format: "guid1,guid2,guid3"
    [FromQuery] Guid currentPlayerId)
```

### Après (POST avec body)
```csharp
// Nouveau DTO pour la requête
public class MatchReactionsRequest
{
    public List<Guid> MatchIds { get; set; }
    public Guid CurrentPlayerId { get; set; }
}

// Endpoint modifié
[HttpPost("reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(
    [FromBody] MatchReactionsRequest request)
{
    if (request.MatchIds == null || request.MatchIds.Count == 0)
        return Ok(new Dictionary<Guid, MatchReactionDTO>());
    
    var reactions = await _context.MatchReactions
        .Where(r => request.MatchIds.Contains(r.MatchId))
        .ToListAsync();
    
    var result = new Dictionary<Guid, MatchReactionDTO>();
    
    foreach (var matchId in request.MatchIds)
    {
        var matchReactions = reactions.Where(r => r.MatchId == matchId).ToList();
        var reactionCounts = matchReactions
            .GroupBy(r => r.ReactionType)
            .ToDictionary(g => g.Key, g => g.Count());
        
        var userReaction = matchReactions.FirstOrDefault(r => r.PlayerId == request.CurrentPlayerId)?.ReactionType;
        
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

## 2. Nouvel endpoint batch pour les commentaires

### Nouveau DTO
```csharp
public class MatchCommentsRequest
{
    public List<Guid> MatchIds { get; set; }
    public Guid CurrentPlayerId { get; set; }
}
```

### Nouvel endpoint
```csharp
// POST: api/Matches/comments
// Récupère les commentaires de plusieurs matchs en une seule requête
[HttpPost("comments")]
public async Task<ActionResult<Dictionary<Guid, List<MatchCommentDTO>>>> GetMatchCommentsBatch(
    [FromBody] MatchCommentsRequest request)
{
    if (request.MatchIds == null || request.MatchIds.Count == 0)
        return Ok(new Dictionary<Guid, List<MatchCommentDTO>>());
    
    var comments = await _context.MatchComments
        .Include(c => c.Player)
        .Where(c => request.MatchIds.Contains(c.MatchId))
        .OrderBy(c => c.CreatedAt)
        .ToListAsync();
    
    var result = new Dictionary<Guid, List<MatchCommentDTO>>();
    
    // Initialiser tous les matchIds avec une liste vide
    foreach (var matchId in request.MatchIds)
    {
        result[matchId] = new List<MatchCommentDTO>();
    }
    
    // Grouper les commentaires par matchId
    foreach (var comment in comments)
    {
        if (!result.ContainsKey(comment.MatchId))
        {
            result[comment.MatchId] = new List<MatchCommentDTO>();
        }
        
        result[comment.MatchId].Add(MatchCommentDTO.FromModel(comment, comment.Player));
    }
    
    return Ok(result);
}
```

## Résumé des changements

### Fichiers à modifier côté backend :

1. **MatchesController.cs** :
   - ✅ Modifier `GetMatchReactions` : passer de `[HttpGet("reactions")]` à `[HttpPost("reactions")]`
   - ✅ Changer les paramètres `[FromQuery]` en `[FromBody] MatchReactionsRequest`
   - ✅ Ajouter le nouvel endpoint `[HttpPost("comments")]` pour `GetMatchCommentsBatch`

2. **DTOs à ajouter** :
   ```csharp
   public class MatchReactionsRequest
   {
       public List<Guid> MatchIds { get; set; }
       public Guid CurrentPlayerId { get; set; }
   }
   
   public class MatchCommentsRequest
   {
       public List<Guid> MatchIds { get; set; }
       public Guid CurrentPlayerId { get; set; }
   }
   ```

### Endpoints existants à conserver :

- ✅ `GET /Matches/{matchId}/comments` - reste inchangé (pour un seul match)
- ✅ `POST /Matches/{matchId}/comments` - reste inchangé (pour ajouter un commentaire)
- ✅ `POST /Matches/{matchId}/react` - reste inchangé (pour ajouter/retirer une réaction)

### Format des requêtes depuis le frontend :

**Réactions (POST /Matches/reactions)** :
```json
{
  "MatchIds": ["guid1", "guid2", "guid3"],
  "CurrentPlayerId": "currentPlayerGuid"
}
```

**Commentaires batch (POST /Matches/comments)** :
```json
{
  "MatchIds": ["guid1", "guid2", "guid3"],
  "CurrentPlayerId": "currentPlayerGuid"
}
```

### Format des réponses :

**Réactions** :
```json
{
  "matchId1": {
    "reactions": {
      "fire": 5,
      "clap": 2
    },
    "userReaction": "fire"
  },
  "matchId2": {
    "reactions": {
      "heart": 3
    },
    "userReaction": null
  }
}
```

**Commentaires batch** :
```json
{
  "matchId1": [
    {
      "id": "commentId1",
      "matchId": "matchId1",
      "playerId": "playerId1",
      "text": "Super match !",
      "createdAt": "2024-01-15T10:30:00Z",
      "player": { ... }
    }
  ],
  "matchId2": []
}
```
