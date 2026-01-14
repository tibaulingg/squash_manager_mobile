# Guide rapide : Notification "match_started"

Ce guide vous montre comment implémenter rapidement la notification quand un match commence.

## 1. Créer les tables de base de données

Exécutez ces scripts SQL dans votre base de données :

```sql
-- Table pour stocker les tokens de notification
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

-- Table pour stocker les notifications
CREATE TABLE [dbo].[Notifications] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PlayerId] UNIQUEIDENTIFIER NOT NULL,
    [Type] NVARCHAR(50) NOT NULL, -- 'match_started', 'match_comment', 'membership_added'
    [Title] NVARCHAR(200) NOT NULL,
    [Body] NVARCHAR(500) NOT NULL,
    [Data] NVARCHAR(MAX) NULL, -- JSON avec les données supplémentaires
    [Read] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_Notifications_Player] FOREIGN KEY ([PlayerId]) REFERENCES [Players]([Id]) ON DELETE CASCADE
);

CREATE INDEX [IX_Notifications_PlayerId] ON [dbo].[Notifications] ([PlayerId]);
CREATE INDEX [IX_Notifications_Read] ON [dbo].[Notifications] ([PlayerId], [Read]);
```

## 2. Créer les modèles C#

Ajoutez ces classes dans votre projet :

```csharp
// Models/NotificationToken.cs
public class NotificationToken
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Player Player { get; set; } = null!;
}

// Models/Notification.cs
public class Notification
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string? Data { get; set; } // JSON string
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; }
    public Player Player { get; set; } = null!;
}
```

Ajoutez-les dans votre `AppDbContext` :

```csharp
public DbSet<NotificationToken> NotificationTokens { get; set; }
public DbSet<Notification> Notifications { get; set; }
```

## 3. Créer le service de notification

Créez `Services/ExpoNotificationService.cs` :

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

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
                _logger.LogInformation($"Notification '{type}' envoyée au joueur {playerId}");
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"Erreur lors de l'envoi de notification pour le joueur {playerId}: {errorContent}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Erreur lors de l'envoi de notification pour le joueur {playerId}");
        }
    }
}
```

Enregistrez le service dans `Program.cs` ou `Startup.cs` :

```csharp
builder.Services.AddHttpClient();
builder.Services.AddScoped<INotificationService, ExpoNotificationService>();
```

## 4. Ajouter l'endpoint pour enregistrer les tokens

Créez `Controllers/NotificationsController.cs` :

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _context;

    public NotificationsController(AppDbContext context)
    {
        _context = context;
    }

    // POST: api/Notifications/register-token
    [HttpPost("register-token")]
    public async Task<ActionResult> RegisterToken([FromBody] RegisterTokenRequest request)
    {
        var player = await _context.Players.FindAsync(request.PlayerId);
        if (player == null)
            return NotFound("Joueur introuvable");

        var existingToken = await _context.NotificationTokens
            .FirstOrDefaultAsync(t => t.PlayerId == request.PlayerId && t.Token == request.Token);

        if (existingToken != null)
        {
            existingToken.UpdatedAt = DateTime.UtcNow;
            existingToken.Platform = request.Platform;
            await _context.SaveChangesAsync();
            return Ok();
        }

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

        return Ok();
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
    public async Task<IActionResult> MarkAsRead(Guid notificationId, [FromQuery] Guid playerId)
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
    public async Task<IActionResult> DeleteNotification(Guid notificationId, [FromQuery] Guid playerId)
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

public class RegisterTokenRequest
{
    public Guid PlayerId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
}

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

## 5. Intégrer dans votre contrôleur de matchs

Dans votre `MatchesController`, quand vous mettez à jour un match et que `running` passe à `true` :

```csharp
[HttpPut("{matchId}")]
public async Task<ActionResult<MatchDTO>> UpdateMatch(
    Guid matchId,
    [FromBody] UpdateMatchRequest request,
    [FromServices] INotificationService notificationService)
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
    
    if (request.Running && !wasRunning)
    {
        match.RunningSince = DateTime.UtcNow;
    }
    else if (!request.Running)
    {
        match.RunningSince = null;
    }

    // ... autres mises à jour du match ...

    await _context.SaveChangesAsync();

    // Si le match vient de commencer (running passe de false à true)
    if (!wasRunning && match.Running)
    {
        var playerA = match.PlayerA;
        var playerB = match.PlayerB;

        // Notification au joueur A
        await notificationService.SendNotificationAsync(
            match.PlayerAId,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerB?.FirstName} {playerB?.LastName} a commencé",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerBId.ToString() },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );

        // Notification au joueur B
        await notificationService.SendNotificationAsync(
            match.PlayerBId,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerA?.FirstName} {playerA?.LastName} a commencé",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerAId.ToString() },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );
    }

    return Ok(MatchDTO.FromModel(match));
}
```

## 6. Tester

1. **Démarrer l'app mobile** et vous connecter
2. **Le token sera automatiquement enregistré** quand vous vous connectez
3. **Dans votre API**, mettez à jour un match et passez `running` à `true`
4. **Les deux joueurs** devraient recevoir une notification push

## Notes

- Les notifications sont stockées en base de données même si l'envoi push échoue
- Pour tester en local, vous pouvez créer une notification directement en base de données
- Les notifications push nécessitent un **development build** (pas Expo Go) pour fonctionner complètement
