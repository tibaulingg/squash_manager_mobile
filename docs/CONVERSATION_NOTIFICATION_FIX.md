# Correction de la notification pour les conversations

## Problème

La méthode `NotifyNewMessageAsync` essaie d'accéder à `MatchReactions` avec `Participants`, ce qui n'existe pas. Pour les conversations, on utilise le `matchId` comme identifiant, donc il faut récupérer le match et notifier l'autre joueur.

## Code corrigé

```csharp
/// <summary>
/// Notifie l'autre joueur d'une conversation quand quelqu'un envoie un message
/// Pour les conversations, entityId est le matchId
/// </summary>
private async Task NotifyNewMessageAsync(
    MatchComment comment,
    Guid matchId, // entityId est le matchId pour les conversations
    Player commenter)
{
    // Récupérer le match (entityId est le matchId pour les conversations)
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

    // Notifier le joueur A si ce n'est pas lui qui a envoyé le message
    if (match.PlayerAId.Value != comment.PlayerId)
    {
        await _notificationService.SendNotificationAsync(
            match.PlayerAId.Value,
            "conversation_message", // Type de notification spécifique pour les conversations
            "Nouveau message",
            $"{commenter.FirstName} {commenter.LastName} vous a envoyé un message",
            new Dictionary<string, object>
            {
                { "match_id", matchId.ToString() },
                { "comment_id", comment.Id.ToString() },
                { "commenter_id", comment.PlayerId.ToString() },
                { "entity_type", "conversation" },
                { "entity_id", matchId.ToString() },
            }
        );
    }

    // Notifier le joueur B si ce n'est pas lui qui a envoyé le message
    if (match.PlayerBId.Value != comment.PlayerId)
    {
        await _notificationService.SendNotificationAsync(
            match.PlayerBId.Value,
            "conversation_message",
            "Nouveau message",
            $"{commenter.FirstName} {commenter.LastName} vous a envoyé un message",
            new Dictionary<string, object>
            {
                { "match_id", matchId.ToString() },
                { "comment_id", comment.Id.ToString() },
                { "commenter_id", comment.PlayerId.ToString() },
                { "entity_type", "conversation" },
                { "entity_id", matchId.ToString() },
            }
        );
    }
}
```

## Code complet corrigé pour AddComment

Il faut aussi corriger la méthode `AddComment` pour gérer les conversations :

```csharp
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
    else if (entityType == "conversation")
    {
        // Pour les conversations, entityId est un matchId
        // Vérifier que le match existe et que le joueur fait partie du match
        var match = await _context.Matches.FirstOrDefaultAsync(m => m.Id == entityId);
        if (match != null)
        {
            // Vérifier que le joueur est un des deux joueurs du match
            entityExists = (match.PlayerAId == currentPlayerId || match.PlayerBId == currentPlayerId);
        }
    }
    else
    {
        return BadRequest("Type d'entité invalide. Utilisez 'match', 'membership' ou 'conversation'.");
    }

    if (!entityExists)
        return NotFound("Entité introuvable ou vous n'êtes pas autorisé à commenter");

    var player = await _context.Players.FindAsync(request.PlayerId);
    if (player == null)
        return NotFound("Joueur introuvable");

    var comment = new MatchComment
    {
        Id = Guid.NewGuid(),
        EntityType = entityType,
        EntityId = entityId, // Pour conversation, c'est le matchId
        PlayerId = request.PlayerId,
        Text = request.Text.Trim(),
        CreatedAt = DateTime.UtcNow
    };

    if (entityType == "match" || entityType == "conversation")
    {
        comment.MatchId = entityId; // Pour conversation, on stocke aussi dans MatchId
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
```

## Différences importantes

1. **Pour les conversations** : `entityId` = `matchId`, donc on récupère le match directement
2. **Notification** : On notifie uniquement l'autre joueur du match (pas le commentateur)
3. **Type de notification** : Utilise `"conversation_message"` au lieu de `"match_comment"` pour différencier
4. **Vérification de sécurité** : Dans `AddComment`, on vérifie que le joueur fait partie du match avant d'autoriser l'ajout
