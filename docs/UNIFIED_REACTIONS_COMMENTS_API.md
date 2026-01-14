# API Unifiée pour les Réactions et Commentaires

Ce document décrit le nouveau système unifié pour gérer les réactions et commentaires sur différentes entités (matchs, memberships, etc.).

## Architecture

### Principe
Au lieu d'avoir des endpoints séparés pour chaque type d'entité, nous avons maintenant :
- **Un contrôleur `ReactionsController`** pour toutes les réactions
- **Un contrôleur `CommentsController`** pour tous les commentaires

Les tables `MatchReaction` et `MatchComments` supportent maintenant des entités génériques via des colonnes nullable.

## Modèle de données

### Table `MatchReaction` (modifiée)
```csharp
public class MatchReaction
{
    public Guid Id { get; set; }
    public Guid? MatchId { get; set; } // Nullable
    public Guid? MembershipId { get; set; } // Nullable
    public string EntityType { get; set; } // 'match' ou 'membership'
    public Guid PlayerId { get; set; }
    public string ReactionType { get; set; } // 'fire', 'clap', 'muscle', 'party', 'sad', 'heart'
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public Match? Match { get; set; }
    public BoxMembership? Membership { get; set; }
    public Player Player { get; set; }
    
    // Contrainte : exactement un des IDs (MatchId ou MembershipId) doit être rempli
}
```

### Table `MatchComments` (modifiée)
```csharp
public class MatchComment
{
    public Guid Id { get; set; }
    public Guid? MatchId { get; set; } // Nullable
    public Guid? MembershipId { get; set; } // Nullable - NOUVEAU (à ajouter)
    public string EntityType { get; set; } // 'match' ou 'membership' - NOUVEAU (à ajouter)
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public Match? Match { get; set; }
    public BoxMembership? Membership { get; set; } // NOUVEAU (à ajouter)
    public Player Player { get; set; }
    
    // Contrainte : exactement un des IDs (MatchId ou MembershipId) doit être rempli
}
```

**⚠️ IMPORTANT :** Si votre modèle `MatchComment` n'a pas encore `MembershipId` et `EntityType`, vous devez les ajouter avant d'utiliser le contrôleur.

### Migration SQL

```sql
-- Modifier MatchReaction
ALTER TABLE [dbo].[MatchReaction] 
ADD [EntityType] nvarchar(50) NULL;

-- Modifier MatchComments
ALTER TABLE [dbo].[MatchComments] 
ADD [EntityType] nvarchar(50) NULL,
    [MembershipId] uniqueidentifier NULL;

-- Ajouter foreign key pour MembershipId dans MatchComments
ALTER TABLE [dbo].[MatchComments]
ADD CONSTRAINT [FK_MatchComments_Membership] 
FOREIGN KEY ([MembershipId]) REFERENCES [BoxMembership]([Id]);

-- Contraintes check pour s'assurer qu'exactement un ID est rempli
ALTER TABLE [dbo].[MatchReaction]
ADD CONSTRAINT [CK_MatchReaction_OneEntity] 
CHECK (
    ([MatchId] IS NOT NULL AND [MembershipId] IS NULL) OR 
    ([MatchId] IS NULL AND [MembershipId] IS NOT NULL)
);

ALTER TABLE [dbo].[MatchComments]
ADD CONSTRAINT [CK_MatchComments_OneEntity] 
CHECK (
    ([MatchId] IS NOT NULL AND [MembershipId] IS NULL) OR 
    ([MatchId] IS NULL AND [MembershipId] IS NOT NULL)
);

-- Index pour les performances
CREATE INDEX [IX_MatchReaction_EntityType_EntityId] ON [MatchReaction]([EntityType], [MatchId], [MembershipId]);
CREATE INDEX [IX_MatchComments_EntityType_EntityId] ON [MatchComments]([EntityType], [MatchId], [MembershipId]);
```

## DTOs

### Reactions

```csharp
public class ReactionDTO
{
    public string EntityType { get; set; } // 'match' ou 'membership'
    public Guid EntityId { get; set; }
    public Dictionary<string, int> Reactions { get; set; } // { "fire": 5, "clap": 2, ... }
    public string? UserReaction { get; set; } // Réaction de l'utilisateur actuel (null si aucune)
}

public class GetReactionsRequest
{
    public List<EntityRequest> Entities { get; set; }
    public Guid CurrentPlayerId { get; set; }
}

public class EntityRequest
{
    public string EntityType { get; set; } // 'match' ou 'membership'
    public Guid EntityId { get; set; }
}

public class ReactToEntityRequest
{
    public Guid PlayerId { get; set; }
    public string? ReactionType { get; set; } // null pour retirer la réaction
}
```

### Comments

```csharp
public class CommentDTO
{
    public Guid Id { get; set; }
    public string EntityType { get; set; } // 'match' ou 'membership'
    public Guid EntityId { get; set; }
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
    public DateTime CreatedAt { get; set; }
    public PlayerDTO Player { get; set; }

    // Méthode statique pour créer un CommentDTO depuis un MatchComment
    public static CommentDTO FromModel(MatchComment comment, Player player)
    {
        return new CommentDTO
        {
            Id = comment.Id,
            EntityType = comment.EntityType,
            EntityId = comment.MatchId ?? comment.MembershipId ?? Guid.Empty,
            PlayerId = comment.PlayerId,
            Text = comment.Text,
            CreatedAt = comment.CreatedAt,
            Player = PlayerDTO.FromModel(player)
        };
    }
}

public class GetCommentsBatchRequest
{
    public List<EntityRequest> Entities { get; set; }
    public Guid CurrentPlayerId { get; set; }
}

public class AddCommentRequest
{
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
}
```

## Contrôleur ReactionsController

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQUASH_API.DTOs;
using SQUASH_API.Models;

[Route("api/[controller]")]
[ApiController]
public class ReactionsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ReactionsController(AppDbContext context)
    {
        _context = context;
    }

    // POST: api/Reactions
    [HttpPost]
    public async Task<ActionResult<Dictionary<Guid, ReactionDTO>>> GetReactions(
        [FromBody] GetReactionsRequest request)
    {
        if (request.Entities == null || request.Entities.Count == 0)
            return Ok(new Dictionary<Guid, ReactionDTO>());

        // Construire la requête selon les types d'entités
        var reactionsQuery = _context.MatchReactions.AsQueryable();
        
        var matchIds = request.Entities
            .Where(e => e.EntityType == "match")
            .Select(e => e.EntityId)
            .ToList();
        var membershipIds = request.Entities
            .Where(e => e.EntityType == "membership")
            .Select(e => e.EntityId)
            .ToList();

        var reactions = new List<MatchReaction>();
        
        if (matchIds.Any())
        {
            reactions.AddRange(await reactionsQuery
                .Where(r => r.MatchId != null && matchIds.Contains(r.MatchId.Value))
                .ToListAsync());
        }
        
        if (membershipIds.Any())
        {
            reactions.AddRange(await reactionsQuery
                .Where(r => r.MembershipId != null && membershipIds.Contains(r.MembershipId.Value))
                .ToListAsync());
        }

        var result = new Dictionary<Guid, ReactionDTO>();

        foreach (var entity in request.Entities)
        {
            Guid entityId = entity.EntityId;
            var entityReactions = reactions.Where(r => 
                (entity.EntityType == "match" && r.MatchId.HasValue && r.MatchId.Value == entityId) ||
                (entity.EntityType == "membership" && r.MembershipId.HasValue && r.MembershipId.Value == entityId)
            ).ToList();

            var reactionCounts = entityReactions
                .GroupBy(r => r.ReactionType)
                .ToDictionary(g => g.Key, g => g.Count());

            var userReaction = entityReactions
                .FirstOrDefault(r => r.PlayerId == request.CurrentPlayerId)?.ReactionType;

            result[entityId] = new ReactionDTO
            {
                EntityType = entity.EntityType,
                EntityId = entityId,
                Reactions = reactionCounts,
                UserReaction = userReaction
            };
        }

        return Ok(result);
    }

    // POST: api/Reactions/{entityType}/{entityId}
    [HttpPost("{entityType}/{entityId}")]
    public async Task<IActionResult> ReactToEntity(
        string entityType,
        Guid entityId,
        [FromQuery] Guid currentPlayerId,
        [FromBody] ReactToEntityRequest request)
    {
        // Vérifier que c'est le joueur actuel qui réagit
        if (request.PlayerId != currentPlayerId)
            return Forbid("Vous ne pouvez réagir qu'avec votre propre compte");

        // Vérifier que l'entité existe
        bool entityExists = false;
        if (entityType == "match")
        {
            entityExists = await _context.Matches.AnyAsync(m => m.Id == entityId);
        }
        else if (entityType == "membership")
        {
            entityExists = await _context.BoxMemberships.AnyAsync(m => m.Id == entityId);
        }
        else
        {
            return BadRequest("Type d'entité invalide. Utilisez 'match' ou 'membership'.");
        }

        if (!entityExists)
            return NotFound("Entité introuvable");

        // Trouver la réaction existante
        MatchReaction? existingReaction = null;
        if (entityType == "match")
        {
            existingReaction = await _context.MatchReactions
                .FirstOrDefaultAsync(r => r.MatchId == entityId && r.PlayerId == currentPlayerId);
        }
        else if (entityType == "membership")
        {
            existingReaction = await _context.MatchReactions
                .FirstOrDefaultAsync(r => r.MembershipId == entityId && r.PlayerId == currentPlayerId);
        }

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
                EntityType = entityType,
                PlayerId = currentPlayerId,
                ReactionType = request.ReactionType,
                CreatedAt = DateTime.UtcNow
            };

            if (entityType == "match")
            {
                newReaction.MatchId = entityId;
                newReaction.MembershipId = null;
            }
            else if (entityType == "membership")
            {
                newReaction.MatchId = null;
                newReaction.MembershipId = entityId;
            }

            _context.MatchReactions.Add(newReaction);
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }
}
```

## Contrôleur CommentsController

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQUASH_API.DTOs;
using SQUASH_API.Models;

[Route("api/[controller]")]
[ApiController]
public class CommentsController : ControllerBase
{
    private readonly AppDbContext _context;

    public CommentsController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/Comments/{entityType}/{entityId}
    [HttpGet("{entityType}/{entityId}")]
    public async Task<ActionResult<IEnumerable<CommentDTO>>> GetComments(
        string entityType,
        Guid entityId)
    {
        IQueryable<MatchComment> commentsQuery = _context.MatchComments
            .Include(c => c.Player);

        if (entityType == "match")
        {
            commentsQuery = commentsQuery.Where(c => c.MatchId == entityId);
        }
        else if (entityType == "membership")
        {
            commentsQuery = commentsQuery.Where(c => c.MembershipId == entityId);
        }
        else
        {
            return BadRequest("Type d'entité invalide. Utilisez 'match' ou 'membership'.");
        }

        var comments = await commentsQuery
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        var response = comments.Select(c => CommentDTO.FromModel(c, c.Player)).ToList();
        return Ok(response);
    }

    // POST: api/Comments/batch
    [HttpPost("batch")]
    public async Task<ActionResult<Dictionary<Guid, CommentDTO[]>>> GetCommentsBatch(
        [FromBody] GetCommentsBatchRequest request)
    {
        if (request.Entities == null || request.Entities.Count == 0)
            return Ok(new Dictionary<Guid, CommentDTO[]>());

        var matchIds = request.Entities
            .Where(e => e.EntityType == "match")
            .Select(e => e.EntityId)
            .ToList();
        var membershipIds = request.Entities
            .Where(e => e.EntityType == "membership")
            .Select(e => e.EntityId)
            .ToList();

        var comments = new List<MatchComment>();

        if (matchIds.Any())
        {
            comments.AddRange(await _context.MatchComments
                .Include(c => c.Player)
                .Where(c => c.MatchId != null && matchIds.Contains(c.MatchId.Value))
                .ToListAsync());
        }

        if (membershipIds.Any())
        {
            comments.AddRange(await _context.MatchComments
                .Include(c => c.Player)
                .Where(c => c.MembershipId != null && membershipIds.Contains(c.MembershipId.Value))
                .ToListAsync());
        }

        var result = new Dictionary<Guid, CommentDTO[]>();

        foreach (var entity in request.Entities)
        {
            var entityComments = comments
                .Where(c =>
                    (entity.EntityType == "match" && c.MatchId.HasValue && c.MatchId.Value == entity.EntityId) ||
                    (entity.EntityType == "membership" && c.MembershipId.HasValue && c.MembershipId.Value == entity.EntityId)
                )
                .OrderBy(c => c.CreatedAt)
                .Select(c => CommentDTO.FromModel(c, c.Player))
                .ToArray();

            result[entity.EntityId] = entityComments;
        }

        return Ok(result);
    }

    // POST: api/Comments/{entityType}/{entityId}
    [HttpPost("{entityType}/{entityId}")]
    public async Task<ActionResult<CommentDTO>> AddComment(
        string entityType,
        Guid entityId,
        [FromQuery] Guid currentPlayerId,
        [FromBody] AddCommentRequest request)
    {
        // Vérifier que c'est le joueur actuel qui commente
        if (request.PlayerId != currentPlayerId)
            return Forbid("Vous ne pouvez commenter qu'avec votre propre compte");

        // Vérifier que l'entité existe
        bool entityExists = false;
        if (entityType == "match")
        {
            entityExists = await _context.Matches.AnyAsync(m => m.Id == entityId);
        }
        else if (entityType == "membership")
        {
            entityExists = await _context.BoxMemberships.AnyAsync(m => m.Id == entityId);
        }
        else
        {
            return BadRequest("Type d'entité invalide. Utilisez 'match' ou 'membership'.");
        }

        if (!entityExists)
            return NotFound("Entité introuvable");

        var player = await _context.Players.FindAsync(request.PlayerId);
        if (player == null)
            return NotFound("Joueur introuvable");

        var comment = new MatchComment
        {
            Id = Guid.NewGuid(),
            EntityType = entityType,
            PlayerId = request.PlayerId,
            Text = request.Text.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        if (entityType == "match")
        {
            comment.MatchId = entityId;
            comment.MembershipId = null;
        }
        else if (entityType == "membership")
        {
            comment.MatchId = null;
            comment.MembershipId = entityId;
        }

        _context.MatchComments.Add(comment);
        await _context.SaveChangesAsync();

        // Recharger avec le joueur
        await _context.Entry(comment).Reference(c => c.Player).LoadAsync();

        return CreatedAtAction(
            nameof(GetComments),
            new { entityType, entityId },
            CommentDTO.FromModel(comment, comment.Player)
        );
    }

    // DELETE: api/Comments/{commentId}
    [HttpDelete("{commentId}")]
    public async Task<IActionResult> DeleteComment(
        Guid commentId,
        [FromQuery] Guid currentPlayerId)
    {
        var comment = await _context.MatchComments.FindAsync(commentId);
        if (comment == null)
            return NotFound("Commentaire introuvable");

        // Vérifier que c'est le propriétaire du commentaire
        if (comment.PlayerId != currentPlayerId)
            return Forbid("Vous ne pouvez supprimer que vos propres commentaires");

        _context.MatchComments.Remove(comment);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
```

## Note importante sur le modèle MatchComment

Assurez-vous que votre modèle `MatchComment` a bien ces propriétés :

```csharp
public class MatchComment
{
    public Guid Id { get; set; }
    public Guid? MatchId { get; set; } // Nullable
    public Guid? MembershipId { get; set; } // Nullable - NOUVEAU
    public string EntityType { get; set; } // 'match' ou 'membership' - NOUVEAU
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public Match? Match { get; set; }
    public BoxMembership? Membership { get; set; } // NOUVEAU
    public Player Player { get; set; }
}
```

## Directives using nécessaires

Assurez-vous d'avoir ces directives `using` en haut de vos fichiers de contrôleurs :

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;  // ⚠️ IMPORTANT pour ToListAsync, FirstOrDefaultAsync, AnyAsync
using SQUASH_API.DTOs;
using SQUASH_API.Models;
```

**Note importante :** `Microsoft.EntityFrameworkCore` est essentiel pour utiliser les méthodes asynchrones comme :
- `ToListAsync()`
- `FirstOrDefaultAsync()`
- `AnyAsync()`
- `FindAsync()`

## Routes API

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/Reactions` | Récupère les réactions pour plusieurs entités |
| POST | `/api/Reactions/{entityType}/{entityId}` | Ajoute/retire une réaction |
| GET | `/api/Comments/{entityType}/{entityId}` | Récupère les commentaires d'une entité |
| POST | `/api/Comments/batch` | Récupère les commentaires pour plusieurs entités |
| POST | `/api/Comments/{entityType}/{entityId}` | Ajoute un commentaire |
| DELETE | `/api/Comments/{commentId}` | Supprime un commentaire |

## Avantages

1. **Un seul contrôleur** pour chaque fonctionnalité (réactions, commentaires)
2. **Extensible** : facile d'ajouter de nouveaux types d'entités
3. **Moins de duplication** : un seul code pour gérer tous les types
4. **API cohérente** : même structure pour tous les types d'entités
5. **Maintenance simplifiée** : un seul endroit pour modifier la logique
