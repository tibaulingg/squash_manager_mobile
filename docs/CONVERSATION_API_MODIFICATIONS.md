# Chat entre joueurs via les matchs (entity_type='conversation')

## Approche

Nous utilisons les **matchs existants** comme identifiant de conversation, mais avec `entity_type='conversation'` pour différencier les messages privés des commentaires publics sur le match.

## Différenciation

- **Commentaires publics** (`entity_type='match'`) : Visibles dans le feed, réactions publiques sur le résultat du match
- **Messages privés** (`entity_type='conversation'`) : Chat entre les deux joueurs du match, utilisant le `matchId` comme `entity_id`

## Fonctionnement

1. Quand un joueur veut discuter avec un autre joueur :
   - Le système cherche le match entre les deux joueurs dans la saison en cours
   - Si un match existe, il est utilisé comme `entity_id` avec `entity_type='conversation'`
   - Les messages sont stockés comme commentaires avec `entity_type='conversation'` et `entity_id=matchId`

2. Les messages sont séparés des commentaires publics :
   - Les commentaires publics utilisent `entity_type='match'` et `entity_id=matchId`
   - Les messages privés utilisent `entity_type='conversation'` et `entity_id=matchId`

## Modifications côté Backend

### 1. Modifier la méthode `GetComments` pour gérer "conversation"

```csharp
// GET: api/Comments/{entityType}/{entityId}
[HttpGet("{entityType}/{entityId}")]
public async Task<ActionResult<List<CommentDTO>>> GetComments(string entityType, Guid entityId)
{
    if (entityType != "match" && entityType != "membership" && entityType != "conversation")
        return BadRequest("Type d'entité invalide. Utilisez 'match', 'membership' ou 'conversation'.");

    var comments = new List<MatchComment>();

    if (entityType == "match")
    {
        // Commentaires publics sur le match
        comments = await _context.MatchComments
            .Include(c => c.Player)
            .Where(c => c.MatchId == entityId && c.EntityType == "match")
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();
    }
    else if (entityType == "membership")
    {
        comments = await _context.MatchComments
            .Include(c => c.Player)
            .Where(c => c.MembershipId == entityId && c.EntityType == "membership")
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();
    }
    else if (entityType == "conversation")
    {
        // Messages privés de conversation (utilise le matchId comme entity_id)
        // On filtre par EntityType='conversation' ET EntityId=matchId
        comments = await _context.MatchComments
            .Include(c => c.Player)
            .Where(c => c.EntityType == "conversation" && c.EntityId == entityId)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();
    }

    var response = comments.Select(c => CommentDTO.FromModel(c, c.Player)).ToList();
    return Ok(response);
}
```

### 2. Modifier la méthode `AddComment` pour gérer "conversation"

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
    else if (entityType == "conversation")
    {
        // Pour les conversations, on stocke le matchId dans EntityId
        // On peut aussi le stocker dans MatchId pour faciliter les requêtes
        comment.MatchId = entityId; // Le matchId est aussi stocké ici pour faciliter les requêtes
        comment.MembershipId = null;
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

### 3. Modifier la méthode `GetCommentsBatch` pour gérer "conversation"

```csharp
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
    var conversationIds = request.Entities
        .Where(e => e.EntityType == "conversation")
        .Select(e => e.EntityId)
        .ToList();

    var comments = new List<MatchComment>();

    if (matchIds.Any())
    {
        comments.AddRange(await _context.MatchComments
            .Include(c => c.Player)
            .Where(c => c.MatchId != null && matchIds.Contains(c.MatchId.Value) && c.EntityType == "match")
            .ToListAsync());
    }

    if (membershipIds.Any())
    {
        comments.AddRange(await _context.MatchComments
            .Include(c => c.Player)
            .Where(c => c.MembershipId != null && membershipIds.Contains(c.MembershipId.Value) && c.EntityType == "membership")
            .ToListAsync());
    }

    if (conversationIds.Any())
    {
        comments.AddRange(await _context.MatchComments
            .Include(c => c.Player)
            .Where(c => c.EntityType == "conversation" && conversationIds.Contains(c.EntityId))
            .ToListAsync());
    }

    var result = new Dictionary<Guid, CommentDTO[]>();

    foreach (var entity in request.Entities)
    {
        var entityComments = comments
            .Where(c =>
                (entity.EntityType == "match" && c.MatchId.HasValue && c.MatchId.Value == entity.EntityId && c.EntityType == "match") ||
                (entity.EntityType == "membership" && c.MembershipId.HasValue && c.MembershipId.Value == entity.EntityId && c.EntityType == "membership") ||
                (entity.EntityType == "conversation" && c.EntityType == "conversation" && c.EntityId == entity.EntityId)
            )
            .OrderBy(c => c.CreatedAt)
            .Select(c => CommentDTO.FromModel(c, c.Player))
            .ToArray();

        result[entity.EntityId] = entityComments;
    }

    return Ok(result);
}
```

### 4. Modifier la méthode `NotifyCommentAddedAsync` pour gérer "conversation"

```csharp
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
    else if (entityType == "conversation")
    {
        await NotifyConversationCommentAsync(comment, entityId, commenter);
    }
}
```

### 5. Ajouter la méthode `NotifyConversationCommentAsync`

```csharp
/// <summary>
/// Notifie l'autre joueur d'une conversation quand quelqu'un envoie un message
/// </summary>
private async Task NotifyConversationCommentAsync(
    MatchComment comment,
    Guid matchId,
    Player commenter)
{
    // entityId est le matchId pour les conversations
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
            "match_comment", // Vous pouvez créer un nouveau type "conversation_message" si vous voulez
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
            "match_comment",
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

## Modèle de données

Le modèle `MatchComment` doit avoir :
- `EntityType` : 'match', 'membership', ou 'conversation'
- `EntityId` : GUID de l'entité (pour conversation, c'est le matchId)
- `MatchId` : Peut être rempli même pour les conversations (pour faciliter les requêtes)
- `MembershipId` : Pour les memberships uniquement

## Migration SQL (si EntityId n'existe pas)

```sql
-- Ajouter EntityId si nécessaire
ALTER TABLE MatchComments ADD EntityId UNIQUEIDENTIFIER NULL;

-- Ajouter EntityType si nécessaire
ALTER TABLE MatchComments ADD EntityType NVARCHAR(50) NULL;

-- Mettre à jour les données existantes
UPDATE MatchComments 
SET EntityType = 'match', EntityId = MatchId 
WHERE MatchId IS NOT NULL AND EntityType IS NULL;

UPDATE MatchComments 
SET EntityType = 'membership', EntityId = MembershipId 
WHERE MembershipId IS NOT NULL AND EntityType IS NULL;

-- Index pour les performances
CREATE INDEX [IX_MatchComments_EntityType_EntityId] ON [MatchComments]([EntityType], [EntityId]);
```

## Notes importantes

1. **Séparation claire** : Les commentaires publics (`entity_type='match'`) et les messages privés (`entity_type='conversation'`) sont complètement séparés, même s'ils utilisent le même `matchId`.

2. **EntityId = MatchId pour conversations** : Pour les conversations, le `entityId` est le `matchId`, ce qui permet de lier la conversation au match sans créer de nouvelle table.

3. **Vérification de sécurité** : Dans `AddComment`, on vérifie que le joueur fait bien partie du match avant de permettre l'ajout d'un message de conversation.

4. **Notifications** : Les notifications pour les conversations notifient uniquement l'autre joueur du match, pas tous les followers comme pour les commentaires publics.
