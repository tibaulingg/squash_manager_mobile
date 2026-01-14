# Contrôleurs CommentsController et ReactionsController avec notifications

Voici les contrôleurs complets avec des fonctions de notification isolées et réutilisables.

## CommentsController complet

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
    private readonly INotificationService _notificationService;

    public CommentsController(AppDbContext context, INotificationService notificationService)
    {
        _context = context;
        _notificationService = notificationService;
    }

    // GET: api/Comments/{entityType}/{entityId}
    [HttpGet("{entityType}/{entityId}")]
    public async Task<ActionResult<List<CommentDTO>>> GetComments(string entityType, Guid entityId)
    {
        if (entityType != "match" && entityType != "membership")
            return BadRequest("Type d'entité invalide. Utilisez 'match' ou 'membership'.");

        var comments = new List<MatchComment>();

        if (entityType == "match")
        {
            comments = await _context.MatchComments
                .Include(c => c.Player)
                .Where(c => c.MatchId == entityId)
                .OrderBy(c => c.CreatedAt)
                .ToListAsync();
        }
        else if (entityType == "membership")
        {
            comments = await _context.MatchComments
                .Include(c => c.Player)
                .Where(c => c.MembershipId == entityId)
                .OrderBy(c => c.CreatedAt)
                .ToListAsync();
        }

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

        // Envoyer les notifications
        await NotifyCommentAddedAsync(comment, entityType, entityId, player);

        return CreatedAtAction(
            nameof(GetComments),
            new { entityType, entityId },
            CommentDTO.FromModel(comment, comment.Player)
        );
    }

    // DELETE: api/Comments/{commentId}?currentPlayerId={currentPlayerId}
    [HttpDelete("{commentId}")]
    public async Task<IActionResult> DeleteComment(
        Guid commentId,
        [FromQuery] Guid currentPlayerId)
    {
        var comment = await _context.MatchComments.FindAsync(commentId);
        if (comment == null)
            return NotFound();

        // Vérifier que c'est le propriétaire du commentaire
        if (comment.PlayerId != currentPlayerId)
            return Forbid("Vous ne pouvez supprimer que vos propres commentaires");

        _context.MatchComments.Remove(comment);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // ============================================
    // FONCTIONS DE NOTIFICATION
    // ============================================

    /// <summary>
    /// Notifie les propriétaires de l'entité quand un commentaire est ajouté
    /// </summary>
    private async Task NotifyCommentAddedAsync(
        MatchComment comment,
        string entityType,
        Guid entityId,
        Player commenter)
    {
        if (entityType == "match")
        {
            await NotifyMatchCommentAsync(comment, entityId, commenter);
        }
        else if (entityType == "membership")
        {
            await NotifyMembershipCommentAsync(comment, entityId, commenter);
        }
    }

    /// <summary>
    /// Notifie les joueurs d'un match quand quelqu'un commente
    /// </summary>
    private async Task NotifyMatchCommentAsync(
        MatchComment comment,
        Guid matchId,
        Player commenter)
    {
        var match = await _context.Matches
            .Include(m => m.PlayerA)
            .Include(m => m.PlayerB)
            .FirstOrDefaultAsync(m => m.Id == matchId);

        if (match == null || !match.PlayerAId.HasValue || !match.PlayerBId.HasValue)
            return;

        var playerA = match.PlayerA;
        var playerB = match.PlayerB;

        if (playerA == null || playerB == null)
            return;

        // Notifier le joueur A si ce n'est pas lui qui a commenté
        if (match.PlayerAId.Value != comment.PlayerId)
        {
            await _notificationService.SendNotificationAsync(
                match.PlayerAId.Value,
                "match_comment",
                "Nouveau commentaire",
                $"{commenter.FirstName} {commenter.LastName} a commenté votre match contre {playerB.FirstName} {playerB.LastName}",
                new Dictionary<string, object>
                {
                    { "match_id", matchId.ToString() },
                    { "comment_id", comment.Id.ToString() },
                    { "commenter_id", comment.PlayerId.ToString() },
                    { "entity_type", "match" },
                    { "entity_id", matchId.ToString() },
                }
            );
        }

        // Notifier le joueur B si ce n'est pas lui qui a commenté
        if (match.PlayerBId.Value != comment.PlayerId)
        {
            await _notificationService.SendNotificationAsync(
                match.PlayerBId.Value,
                "match_comment",
                "Nouveau commentaire",
                $"{commenter.FirstName} {commenter.LastName} a commenté votre match contre {playerA.FirstName} {playerA.LastName}",
                new Dictionary<string, object>
                {
                    { "match_id", matchId.ToString() },
                    { "comment_id", comment.Id.ToString() },
                    { "commenter_id", comment.PlayerId.ToString() },
                    { "entity_type", "match" },
                    { "entity_id", matchId.ToString() },
                }
            );
        }
    }

    /// <summary>
    /// Notifie le propriétaire d'une membership quand quelqu'un commente
    /// </summary>
    private async Task NotifyMembershipCommentAsync(
        MatchComment comment,
        Guid membershipId,
        Player commenter)
    {
        var membership = await _context.BoxMemberships
            .Include(m => m.Player)
            .Include(m => m.Box)
            .FirstOrDefaultAsync(m => m.Id == membershipId);

        if (membership == null || membership.PlayerId == null)
            return;

        var player = membership.Player;
        var box = membership.Box;

        if (player == null)
            return;

        // Ne pas notifier si c'est le propriétaire qui commente
        if (membership.PlayerId.Value == comment.PlayerId)
            return;

        await _notificationService.SendNotificationAsync(
            membership.PlayerId.Value,
            "match_comment",
            "Nouveau commentaire",
            $"{commenter.FirstName} {commenter.LastName} a commenté votre changement de box ({box?.Name ?? "Box"})",
            new Dictionary<string, object>
            {
                { "membership_id", membershipId.ToString() },
                { "comment_id", comment.Id.ToString() },
                { "commenter_id", comment.PlayerId.ToString() },
                { "entity_type", "membership" },
                { "entity_id", membershipId.ToString() },
            }
        );
    }
}
```

## ReactionsController complet

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
    private readonly INotificationService _notificationService;

    public ReactionsController(AppDbContext context, INotificationService notificationService)
    {
        _context = context;
        _notificationService = notificationService;
    }

    // POST: api/Reactions
    [HttpPost]
    public async Task<ActionResult<Dictionary<Guid, ReactionDTO>>> GetReactions(
        [FromBody] GetReactionsRequest request)
    {
        if (request.Entities == null || request.Entities.Count == 0)
            return Ok(new Dictionary<Guid, ReactionDTO>());

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
                (entity.EntityType == "match" && r.MatchId == entityId) ||
                (entity.EntityType == "membership" && r.MembershipId == entityId)
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

        bool wasNewReaction = existingReaction == null;

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

        // Notifier seulement si c'est une nouvelle réaction (pas une mise à jour)
        // Optionnel : vous pouvez commenter cette partie si vous ne voulez pas notifier pour les réactions
        if (wasNewReaction)
        {
            var player = await _context.Players.FindAsync(currentPlayerId);
            if (player != null)
            {
                await NotifyReactionAddedAsync(entityType, entityId, currentPlayerId, player, request.ReactionType);
            }
        }

        return NoContent();
    }

    // ============================================
    // FONCTIONS DE NOTIFICATION
    // ============================================

    /// <summary>
    /// Notifie les propriétaires de l'entité quand une réaction est ajoutée
    /// Note: Les notifications pour les réactions sont optionnelles
    /// </summary>
    private async Task NotifyReactionAddedAsync(
        string entityType,
        Guid entityId,
        Guid reactorId,
        Player reactor,
        string reactionType)
    {
        if (entityType == "match")
        {
            await NotifyMatchReactionAsync(entityId, reactorId, reactor, reactionType);
        }
        else if (entityType == "membership")
        {
            await NotifyMembershipReactionAsync(entityId, reactorId, reactor, reactionType);
        }
    }

    /// <summary>
    /// Notifie les joueurs d'un match quand quelqu'un réagit
    /// </summary>
    private async Task NotifyMatchReactionAsync(
        Guid matchId,
        Guid reactorId,
        Player reactor,
        string reactionType)
    {
        var match = await _context.Matches
            .Include(m => m.PlayerA)
            .Include(m => m.PlayerB)
            .FirstOrDefaultAsync(m => m.Id == matchId);

        if (match == null || !match.PlayerAId.HasValue || !match.PlayerBId.HasValue)
            return;

        var playerA = match.PlayerA;
        var playerB = match.PlayerB;

        if (playerA == null || playerB == null)
            return;

        string reactionEmoji = GetReactionEmoji(reactionType);

        // Notifier le joueur A si ce n'est pas lui qui a réagi
        if (match.PlayerAId.Value != reactorId)
        {
            await _notificationService.SendNotificationAsync(
                match.PlayerAId.Value,
                "match_comment", // Utiliser le même type que les commentaires
                "Nouvelle réaction",
                $"{reactor.FirstName} {reactor.LastName} a réagi {reactionEmoji} à votre match",
                new Dictionary<string, object>
                {
                    { "match_id", matchId.ToString() },
                    { "reactor_id", reactorId.ToString() },
                    { "reaction_type", reactionType },
                    { "entity_type", "match" },
                    { "entity_id", matchId.ToString() },
                }
            );
        }

        // Notifier le joueur B si ce n'est pas lui qui a réagi
        if (match.PlayerBId.Value != reactorId)
        {
            await _notificationService.SendNotificationAsync(
                match.PlayerBId.Value,
                "match_comment", // Utiliser le même type que les commentaires
                "Nouvelle réaction",
                $"{reactor.FirstName} {reactor.LastName} a réagi {reactionEmoji} à votre match",
                new Dictionary<string, object>
                {
                    { "match_id", matchId.ToString() },
                    { "reactor_id", reactorId.ToString() },
                    { "reaction_type", reactionType },
                    { "entity_type", "match" },
                    { "entity_id", matchId.ToString() },
                }
            );
        }
    }

    /// <summary>
    /// Notifie le propriétaire d'une membership quand quelqu'un réagit
    /// </summary>
    private async Task NotifyMembershipReactionAsync(
        Guid membershipId,
        Guid reactorId,
        Player reactor,
        string reactionType)
    {
        var membership = await _context.BoxMemberships
            .Include(m => m.Player)
            .Include(m => m.Box)
            .FirstOrDefaultAsync(m => m.Id == membershipId);

        if (membership == null || membership.PlayerId == null)
            return;

        var player = membership.Player;

        if (player == null)
            return;

        // Ne pas notifier si c'est le propriétaire qui réagit
        if (membership.PlayerId.Value == reactorId)
            return;

        string reactionEmoji = GetReactionEmoji(reactionType);

        await _notificationService.SendNotificationAsync(
            membership.PlayerId.Value,
            "match_comment", // Utiliser le même type que les commentaires
            "Nouvelle réaction",
            $"{reactor.FirstName} {reactor.LastName} a réagi {reactionEmoji} à votre changement de box",
            new Dictionary<string, object>
            {
                { "membership_id", membershipId.ToString() },
                { "reactor_id", reactorId.ToString() },
                { "reaction_type", reactionType },
                { "entity_type", "membership" },
                { "entity_id", membershipId.ToString() },
            }
        );
    }

    /// <summary>
    /// Retourne l'emoji correspondant au type de réaction
    /// </summary>
    private string GetReactionEmoji(string reactionType)
    {
        return reactionType?.ToLower() switch
        {
            "fire" => "🔥",
            "clap" => "👏",
            "heart" => "❤️",
            "thumbsup" => "👍",
            "thumbsdown" => "👎",
            _ => "👍"
        };
    }
}
```

## DTOs nécessaires

```csharp
public class GetReactionsRequest
{
    public List<EntityRequest>? Entities { get; set; }
    public Guid CurrentPlayerId { get; set; }
}

public class EntityRequest
{
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
}

public class ReactToEntityRequest
{
    public Guid PlayerId { get; set; }
    public string? ReactionType { get; set; }
}

public class GetCommentsBatchRequest
{
    public List<EntityRequest>? Entities { get; set; }
    public Guid CurrentPlayerId { get; set; }
}

public class AddCommentRequest
{
    public Guid PlayerId { get; set; }
    public string Text { get; set; } = string.Empty;
}
```

## Points clés

### 1. **Séparation des responsabilités**
- Fonctions de notification isolées et réutilisables
- Chaque fonction a une responsabilité unique

### 2. **Notifications pour les commentaires**
- **Match** : Notifie les 2 joueurs (sauf celui qui a commenté)
- **Membership** : Notifie le propriétaire de la membership (sauf celui qui a commenté)

### 3. **Notifications pour les réactions (optionnel)**
- Les notifications pour les réactions sont incluses mais peuvent être désactivées
- Se déclenchent seulement pour les **nouvelles** réactions (pas les mises à jour)
- Utilisent le même type de notification que les commentaires pour simplifier

### 4. **Gestion des doublons**
- Vérification que le propriétaire n'est pas celui qui a commenté/réagi
- Messages personnalisés selon le contexte

### 5. **Maintenabilité**
- Code bien structuré et commenté
- Facile à modifier ou étendre
- Fonctions testables individuellement

## Utilisation

1. Copiez le code dans vos contrôleurs
2. Assurez-vous que `INotificationService` est injecté
3. Les notifications seront envoyées automatiquement lors des ajouts de commentaires/réactions

## Note sur les réactions

Si vous ne souhaitez **pas** notifier pour les réactions, commentez simplement l'appel à `NotifyReactionAddedAsync` dans la méthode `ReactToEntity`.
