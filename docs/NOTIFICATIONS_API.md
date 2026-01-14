# API pour les Notifications Push

Cette documentation décrit l'implémentation côté backend pour le système de notifications push.

## Vue d'ensemble

Le système de notifications permet d'envoyer des notifications push aux utilisateurs pour:
- **membership_added**: Quand un joueur est ajouté dans une membership (box)
- **match_comment**: Quand quelqu'un commente un match du joueur
- **match_started**: Quand un match commence (running passe à true)
- **match_played**: Quand un match est joué par une personne qu'on suit

## Tables de base de données

### Table `NotificationTokens`

Stocke les tokens Expo Push pour chaque joueur et plateforme.

```sql
CREATE TABLE [dbo].[NotificationTokens] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PlayerId] UNIQUEIDENTIFIER NOT NULL,
    [Token] NVARCHAR(500) NOT NULL,
    [Platform] NVARCHAR(20) NOT NULL, -- 'ios', 'android', 'web'
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_NotificationTokens_Player] FOREIGN KEY ([PlayerId]) REFERENCES [Players]([Id]) ON DELETE CASCADE,
    CONSTRAINT [UQ_NotificationTokens_Player_Token] UNIQUE ([PlayerId], [Token])
);

CREATE INDEX [IX_NotificationTokens_PlayerId] ON [dbo].[NotificationTokens] ([PlayerId]);
CREATE INDEX [IX_NotificationTokens_Token] ON [dbo].[NotificationTokens] ([Token]);
```

### Table `Notifications`

Stocke les notifications envoyées aux joueurs.

```sql
CREATE TABLE [dbo].[Notifications] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PlayerId] UNIQUEIDENTIFIER NOT NULL,
    [Type] NVARCHAR(50) NOT NULL, -- 'membership_added', 'match_comment'
    [Title] NVARCHAR(200) NOT NULL,
    [Body] NVARCHAR(500) NOT NULL,
    [Data] NVARCHAR(MAX) NULL, -- JSON avec les données supplémentaires
    [Read] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_Notifications_Player] FOREIGN KEY ([PlayerId]) REFERENCES [Players]([Id]) ON DELETE CASCADE
);

CREATE INDEX [IX_Notifications_PlayerId] ON [dbo].[Notifications] ([PlayerId]);
CREATE INDEX [IX_Notifications_Read] ON [dbo].[Notifications] ([PlayerId], [Read]);
CREATE INDEX [IX_Notifications_CreatedAt] ON [dbo].[Notifications] ([CreatedAt] DESC);
```

## Modèles C#

### NotificationToken

```csharp
public class NotificationToken
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty; // "ios", "android", "web"
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation property
    public Player Player { get; set; } = null!;
}
```

### Notification

```csharp
public class Notification
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public string Type { get; set; } = string.Empty; // "membership_added", "match_comment"
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string? Data { get; set; } // JSON string
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation property
    public Player Player { get; set; } = null!;
}
```

## DTOs

### NotificationTokenDTO

```csharp
public class NotificationTokenDTO
{
    public Guid PlayerId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
}
```

### RegisterNotificationTokenRequest

```csharp
public class RegisterNotificationTokenRequest
{
    public Guid PlayerId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty; // "ios", "android", "web"
}
```

### NotificationDTO

```csharp
public class NotificationDTO
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public Dictionary<string, object>? Data { get; set; }
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

## Controller: NotificationsController

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(AppDbContext context, ILogger<NotificationsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // POST: api/Notifications/register-token
    [HttpPost("register-token")]
    public async Task<ActionResult<NotificationTokenDTO>> RegisterToken(
        [FromBody] RegisterNotificationTokenRequest request)
    {
        // Vérifier que le joueur existe
        var player = await _context.Players.FindAsync(request.PlayerId);
        if (player == null)
            return NotFound("Joueur introuvable");

        // Vérifier si le token existe déjà
        var existingToken = await _context.NotificationTokens
            .FirstOrDefaultAsync(t => t.PlayerId == request.PlayerId && t.Token == request.Token);

        if (existingToken != null)
        {
            // Mettre à jour la date de mise à jour
            existingToken.UpdatedAt = DateTime.UtcNow;
            existingToken.Platform = request.Platform;
            await _context.SaveChangesAsync();

            return Ok(new NotificationTokenDTO
            {
                PlayerId = existingToken.PlayerId,
                Token = existingToken.Token,
                Platform = existingToken.Platform,
            });
        }

        // Créer un nouveau token
        var token = new NotificationToken
        {
            Id = Guid.NewGuid(),
            PlayerId = request.PlayerId,
            Token = request.Token,
            Platform = request.Platform,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _context.NotificationTokens.Add(token);
        await _context.SaveChangesAsync();

        return Ok(new NotificationTokenDTO
        {
            PlayerId = token.PlayerId,
            Token = token.Token,
            Platform = token.Platform,
        });
    }

    // GET: api/Notifications?playerId={playerId}&unreadOnly={unreadOnly}
    [HttpGet]
    public async Task<ActionResult<List<NotificationDTO>>> GetNotifications(
        [FromQuery] Guid playerId,
        [FromQuery] bool unreadOnly = false)
    {
        var query = _context.Notifications
            .Where(n => n.PlayerId == playerId);

        if (unreadOnly)
        {
            query = query.Where(n => !n.Read);
        }

        var notifications = await query
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        var dtos = notifications.Select(n => new NotificationDTO
        {
            Id = n.Id,
            PlayerId = n.PlayerId,
            Type = n.Type,
            Title = n.Title,
            Body = n.Body,
            Data = string.IsNullOrEmpty(n.Data) ? null : JsonSerializer.Deserialize<Dictionary<string, object>>(n.Data),
            Read = n.Read,
            CreatedAt = n.CreatedAt,
        }).ToList();

        return Ok(dtos);
    }

    // PUT: api/Notifications/{notificationId}/read?playerId={playerId}
    [HttpPut("{notificationId}/read")]
    public async Task<IActionResult> MarkAsRead(
        Guid notificationId,
        [FromQuery] Guid playerId)
    {
        var notification = await _context.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.PlayerId == playerId);

        if (notification == null)
            return NotFound();

        notification.Read = true;
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // PUT: api/Notifications/mark-all-read?playerId={playerId}
    [HttpPut("mark-all-read")]
    public async Task<IActionResult> MarkAllAsRead([FromQuery] Guid playerId)
    {
        var notifications = await _context.Notifications
            .Where(n => n.PlayerId == playerId && !n.Read)
            .ToListAsync();

        foreach (var notification in notifications)
        {
            notification.Read = true;
        }

        await _context.SaveChangesAsync();

        return NoContent();
    }

    // DELETE: api/Notifications/{notificationId}?playerId={playerId}
    [HttpDelete("{notificationId}")]
    public async Task<IActionResult> DeleteNotification(
        Guid notificationId,
        [FromQuery] Guid playerId)
    {
        var notification = await _context.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.PlayerId == playerId);

        if (notification == null)
            return NotFound();

        _context.Notifications.Remove(notification);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
```

## Service d'envoi de notifications

### Service Expo Push Notifications

Vous devrez installer le package NuGet pour envoyer des notifications via Expo:

```bash
dotnet add package System.Net.Http.Json
```

Créez un service pour envoyer les notifications:

```csharp
using System.Net.Http.Json;
using System.Text.Json;

public interface INotificationService
{
    Task SendNotificationAsync(Guid playerId, string type, string title, string body, Dictionary<string, object>? data = null);
}

public class ExpoNotificationService : INotificationService
{
    private readonly AppDbContext _context;
    private readonly HttpClient _httpClient;
    private readonly ILogger<ExpoNotificationService> _logger;
    private const string ExpoPushApiUrl = "https://exp.host/--/api/v2/push/send";

    public ExpoNotificationService(
        AppDbContext context,
        IHttpClientFactory httpClientFactory,
        ILogger<ExpoNotificationService> logger)
    {
        _context = context;
        _httpClient = httpClientFactory.CreateClient();
        _logger = logger;
    }

    public async Task SendNotificationAsync(
        Guid playerId,
        string type,
        string title,
        string body,
        Dictionary<string, object>? data = null)
    {
        try
        {
            // Récupérer tous les tokens du joueur
            var tokens = await _context.NotificationTokens
                .Where(t => t.PlayerId == playerId)
                .Select(t => t.Token)
                .ToListAsync();

            if (tokens.Count == 0)
            {
                _logger.LogInformation($"Aucun token trouvé pour le joueur {playerId}");
                return;
            }

            // Créer la notification dans la base de données
            var notification = new Notification
            {
                Id = Guid.NewGuid(),
                PlayerId = playerId,
                Type = type,
                Title = title,
                Body = body,
                Data = data != null ? JsonSerializer.Serialize(data) : null,
                Read = false,
                CreatedAt = DateTime.UtcNow,
            };

            _context.Notifications.Add(notification);
            await _context.SaveChangesAsync();

            // Préparer les messages pour Expo
            var messages = tokens.Select(token => new
            {
                to = token,
                sound = "default",
                title = title,
                body = body,
                data = data ?? new Dictionary<string, object>(),
                badge = 1,
            }).ToList();

            // Envoyer les notifications via Expo Push API
            var response = await _httpClient.PostAsJsonAsync(ExpoPushApiUrl, messages);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<ExpoPushResponse>();
                _logger.LogInformation($"Notifications envoyées pour le joueur {playerId}. Résultat: {JsonSerializer.Serialize(result)}");
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"Erreur lors de l'envoi des notifications pour le joueur {playerId}: {errorContent}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Erreur lors de l'envoi de notification pour le joueur {playerId}");
        }
    }
}

// Modèle pour la réponse Expo
public class ExpoPushResponse
{
    public ExpoPushTicket[]? Data { get; set; }
}

public class ExpoPushTicket
{
    public string? Status { get; set; }
    public string? Id { get; set; }
    public string? Message { get; set; }
}
```

### Enregistrer le service dans Program.cs ou Startup.cs

```csharp
builder.Services.AddHttpClient();
builder.Services.AddScoped<INotificationService, ExpoNotificationService>();
```

## Intégration dans les contrôleurs existants

### Quand un joueur est ajouté dans une membership

Dans votre contrôleur qui gère les memberships (par exemple `BoxMembershipsController` ou `MembershipsController`):

```csharp
// Après avoir créé ou mis à jour une membership
var membership = await _context.BoxMemberships.FindAsync(membershipId);
var player = await _context.Players.FindAsync(membership.PlayerId);
var box = await _context.Boxes.FindAsync(membership.BoxId);

await _notificationService.SendNotificationAsync(
    membership.PlayerId,
    "membership_added",
    "Nouvelle box assignée",
    $"Vous avez été ajouté à la box {box.Name}",
    new Dictionary<string, object>
    {
        { "membership_id", membership.Id.ToString() },
        { "box_id", box.Id.ToString() },
        { "box_name", box.Name },
    }
);
```

### Quand quelqu'un commente un match

Dans votre contrôleur de commentaires (par exemple `CommentsController`):

```csharp
// Après avoir créé un commentaire sur un match
var comment = await _context.MatchComments
    .Include(c => c.Player)
    .Include(c => c.Match)
        .ThenInclude(m => m.PlayerA)
    .Include(c => c.Match)
        .ThenInclude(m => m.PlayerB)
    .FirstOrDefaultAsync(c => c.Id == commentId);

var match = comment.Match;
var commenter = comment.Player;

// Envoyer une notification au joueur A si ce n'est pas lui qui a commenté
if (match.PlayerAId != comment.PlayerId)
{
    await _notificationService.SendNotificationAsync(
        match.PlayerAId,
        "match_comment",
        "Nouveau commentaire sur votre match",
        $"{commenter.FirstName} {commenter.LastName} a commenté votre match",
        new Dictionary<string, object>
        {
            { "match_id", match.Id.ToString() },
            { "comment_id", comment.Id.ToString() },
            { "commenter_id", comment.PlayerId.ToString() },
            { "entity_type", "match" },
            { "entity_id", match.Id.ToString() },
        }
    );
}

// Envoyer une notification au joueur B si ce n'est pas lui qui a commenté
if (match.PlayerBId != comment.PlayerId)
{
    await _notificationService.SendNotificationAsync(
        match.PlayerBId,
        "match_comment",
        "Nouveau commentaire sur votre match",
        $"{commenter.FirstName} {commenter.LastName} a commenté votre match",
        new Dictionary<string, object>
        {
            { "match_id", match.Id.ToString() },
            { "comment_id", comment.Id.ToString() },
            { "commenter_id", comment.PlayerId.ToString() },
            { "entity_type", "match" },
            { "entity_id", match.Id.ToString() },
        }
    );
}
```

### Quand un match commence (running passe à true)

Dans votre contrôleur de matchs (par exemple `MatchesController`), quand vous mettez à jour un match et que `running` passe de `false` à `true`:

```csharp
// Exemple dans une méthode PUT ou PATCH pour mettre à jour un match
[HttpPut("{matchId}")]
public async Task<ActionResult<MatchDTO>> UpdateMatch(
    Guid matchId,
    [FromBody] UpdateMatchRequest request)
{
    var match = await _context.Matches
        .Include(m => m.PlayerA)
        .Include(m => m.PlayerB)
        .FirstOrDefaultAsync(m => m.Id == matchId);

    if (match == null)
        return NotFound();

    // Vérifier si running passe de false à true
    bool wasRunning = match.Running;
    match.Running = request.Running;
    match.RunningSince = request.Running ? DateTime.UtcNow : null;
    
    // ... autres mises à jour du match ...

    await _context.SaveChangesAsync();

    // Si le match vient de commencer (running passe de false à true)
    if (!wasRunning && match.Running)
    {
        // Envoyer une notification aux deux joueurs
        var playerA = await _context.Players.FindAsync(match.PlayerAId);
        var playerB = await _context.Players.FindAsync(match.PlayerBId);

        // Notification au joueur A
        await _notificationService.SendNotificationAsync(
            match.PlayerAId,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerB?.FirstName} {playerB?.LastName} a commencé",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerBId.ToString() },
                { "opponent_name", $"{playerB?.FirstName} {playerB?.LastName}" },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );

        // Notification au joueur B
        await _notificationService.SendNotificationAsync(
            match.PlayerBId,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerA?.FirstName} {playerA?.LastName} a commencé",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerAId.ToString() },
                { "opponent_name", $"{playerA?.FirstName} {playerA?.LastName}" },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );
    }

    return Ok(MatchDTO.FromModel(match));
}
```

**Note importante** : Assurez-vous de vérifier que `running` passe bien de `false` à `true` pour éviter d'envoyer plusieurs notifications si le match est déjà en cours.

### Quand un match est joué par une personne qu'on suit

Dans votre `MatchesController`, quand un match vient d'être joué (score enregistré), envoyez une notification à tous les followers des deux joueurs :

```csharp
// Dans UpdateMatch, après avoir enregistré le match
// Vérifier si le match vient d'être joué
bool wasPlayed = match.PlayedAt.HasValue && match.ScoreA.HasValue && match.ScoreB.HasValue;
bool isNowPlayed = dto.score_a.HasValue && dto.score_b.HasValue && dto.played_at.HasValue;
bool justPlayed = !wasPlayed && isNowPlayed;

if (justPlayed && match.PlayerAId.HasValue && match.PlayerBId.HasValue)
{
    var playerA = await _context.Players.FindAsync(match.PlayerAId.Value);
    var playerB = await _context.Players.FindAsync(match.PlayerBId.Value);

    if (playerA != null && playerB != null)
    {
        // Récupérer les followers du joueur A
        var playerAFollowers = await _context.PlayerFollows
            .Where(pf => pf.FollowedId == match.PlayerAId.Value)
            .Select(pf => pf.FollowerId)
            .ToListAsync();

        // Récupérer les followers du joueur B
        var playerBFollowers = await _context.PlayerFollows
            .Where(pf => pf.FollowedId == match.PlayerBId.Value)
            .Select(pf => pf.FollowerId)
            .ToListAsync();

        string scoreText = $"{match.ScoreA}-{match.ScoreB}";

        // Notifier les followers du joueur A
        foreach (var followerId in playerAFollowers)
        {
            // Ne pas notifier les joueurs du match eux-mêmes
            if (followerId != match.PlayerAId.Value && followerId != match.PlayerBId.Value)
            {
                await _notificationService.SendNotificationAsync(
                    followerId,
                    "match_played",
                    "Match joué",
                    $"{playerA.FirstName} {playerA.LastName} a joué contre {playerB.FirstName} {playerB.LastName} ({scoreText})",
                    new Dictionary<string, object>
                    {
                        { "match_id", match.Id.ToString() },
                        { "player_a_id", match.PlayerAId.Value.ToString() },
                        { "player_b_id", match.PlayerBId.Value.ToString() },
                        { "score_a", match.ScoreA.ToString() },
                        { "score_b", match.ScoreB.ToString() },
                        { "entity_type", "match" },
                        { "entity_id", match.Id.ToString() },
                    }
                );
            }
        }

        // Notifier les followers du joueur B
        foreach (var followerId in playerBFollowers)
        {
            // Ne pas notifier les joueurs du match eux-mêmes
            if (followerId != match.PlayerAId.Value && followerId != match.PlayerBId.Value)
            {
                await _notificationService.SendNotificationAsync(
                    followerId,
                    "match_played",
                    "Match joué",
                    $"{playerB.FirstName} {playerB.LastName} a joué contre {playerA.FirstName} {playerA.LastName} ({scoreText})",
                    new Dictionary<string, object>
                    {
                        { "match_id", match.Id.ToString() },
                        { "player_a_id", match.PlayerAId.Value.ToString() },
                        { "player_b_id", match.PlayerBId.Value.ToString() },
                        { "score_a", match.ScoreA.ToString() },
                        { "score_b", match.ScoreB.ToString() },
                        { "entity_type", "match" },
                        { "entity_id", match.Id.ToString() },
                    }
                );
            }
        }
    }
}
```

**Note** : Assurez-vous de vérifier que le match vient d'être joué (et n'était pas déjà joué avant) pour éviter d'envoyer des notifications en double.

## Configuration Expo

Pour que les notifications push fonctionnent, vous devez configurer votre projet Expo:

1. **Dans `app.json`**, ajoutez:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#ffffff"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

2. **Pour obtenir un projectId**, exécutez:

```bash
npx expo install expo-constants
npx eas init
```

3. **Mettez à jour le NotificationsContext.tsx** avec votre projectId:

```typescript
const tokenData = await Notifications.getExpoPushTokenAsync({
  projectId: 'your-project-id', // Remplacez par votre projectId
});
```

## Tests

Pour tester les notifications:

1. Enregistrez un token via l'endpoint `POST /api/Notifications/register-token`
2. Créez une notification manuellement via votre service
3. Vérifiez que la notification apparaît dans l'app

## Notes importantes

- Les tokens doivent être mis à jour régulièrement (Expo recommande de les rafraîchir périodiquement)
- Les notifications sont stockées en base de données même si l'envoi push échoue
- Vous pouvez implémenter un système de retry pour les notifications qui échouent
- Pour la production, considérez l'utilisation d'un service de file d'attente (comme Azure Service Bus ou RabbitMQ) pour gérer l'envoi asynchrone des notifications
