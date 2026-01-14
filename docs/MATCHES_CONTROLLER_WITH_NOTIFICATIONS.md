# MatchesController complet avec notifications

Voici le code complet d'un `MatchesController` propre et maintenable avec toutes les notifications.

## Code complet du contrôleur

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQUASH_API.Models;
using SQUASH_API.DTOs;
using System.Text.Json;
using System.Linq;

[Route("api/[controller]")]
[ApiController]
public class MatchesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;

    public MatchesController(AppDbContext context, INotificationService notificationService)
    {
        _context = context;
        _notificationService = notificationService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MatchDTO>>> GetMatches([FromQuery] Guid? season_id)
    {
        var query = _context.Matches.AsQueryable();

        if (season_id.HasValue)
        {
            query = query.Where(m => m.SeasonId == season_id.Value);
        }

        var matches = await query.ToListAsync();
        var response = matches.Select(m => MatchDTO.FromModel(m));
        return Ok(response);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MatchDTO>> GetMatch(Guid id)
    {
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();
        return MatchDTO.FromModel(match);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMatch(Guid id, MatchDTO dto)
    {
        if (id != dto.id) return BadRequest();
        
        var match = await _context.Matches
            .Include(m => m.PlayerA)
            .Include(m => m.PlayerB)
            .FirstOrDefaultAsync(m => m.Id == id);
            
        if (match == null) return NotFound();

        // État avant la mise à jour
        bool wasRunning = match.Running;
        bool wasPlayed = match.PlayedAt.HasValue && match.ScoreA.HasValue && match.ScoreB.HasValue;
        
        // Mise à jour des champs
        match.SeasonId = dto.season_id;
        match.BoxId = dto.box_id;
        match.WeekNumber = dto.week_number;
        match.PlayerAId = dto.player_a_id;
        match.PlayerBId = dto.player_b_id;
        match.ScheduledAt = dto.scheduled_at;
        match.SlotNumber = dto.slot_number;
        match.Status = dto.status;
        match.DelayedPlayerId = dto.delayed_player_id;
        match.RetiredPlayerId = dto.retired_player_id;
        match.NoShowPlayerId = dto.no_show_player_id;
        match.Running = dto.running;
        match.PlayerApresent = dto.player_a_present;
        match.PlayerBpresent = dto.player_b_present;
        match.TerrainNumber = dto.terrain_number;
        match.RefereeId = dto.referee_id;

        if (dto.running && !match.RunningSince.HasValue)
        {
            match.RunningSince = System.DateTime.Now.AddHours(1);
        }

        match.ScoreA = dto.score_a;
        match.ScoreB = dto.score_b;
        match.ScoreA ??= 0;
        match.ScoreB ??= 0;
        match.PlayedAt = System.DateTime.Now;

        // Calcul des points
        AppSetting settings = await _context.AppSettings.FirstOrDefaultAsync();
        var pointsMap = new Dictionary<(short?, short?), (short?, short?)>
        {
            [(3, 0)] = (settings.PointsFor30, settings.PointsFor03),
            [(3, 1)] = (settings.PointsFor31, settings.PointsFor13),
            [(3, 2)] = (settings.PointsFor32, settings.PointsFor23),
            [(0, 3)] = (settings.PointsFor03, settings.PointsFor30),
            [(1, 3)] = (settings.PointsFor13, settings.PointsFor31),
            [(2, 3)] = (settings.PointsFor23, settings.PointsFor32)
        };

        if (pointsMap.TryGetValue((dto.score_a, dto.score_b), out var points))
        {
            match.PointsA = points.Item1;
            match.PointsB = points.Item2;
        }
        else
        {
            match.PointsA = 0;
            match.PointsB = 0;
        }

        if (dto.running == false)
        {
            match.Running = false;
            match.RunningSince = null;
            match.TerrainNumber = null;
        }

        await _context.SaveChangesAsync();

        // État après la mise à jour
        bool isNowRunning = match.Running;
        bool isNowPlayed = match.PlayedAt.HasValue && match.ScoreA.HasValue && match.ScoreB.HasValue && !match.Running;

        // Notifications
        if (!wasRunning && isNowRunning)
        {
            // Match vient de commencer
            await NotifyMatchStartedAsync(match);
        }

        if (!wasPlayed && isNowPlayed)
        {
            // Match vient d'être terminé
            await NotifyMatchFinishedAsync(match);
        }

        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMatch(Guid id)
    {
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();
        _context.Matches.Remove(match);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    // ============================================
    // FONCTIONS DE NOTIFICATION
    // ============================================

    /// <summary>
    /// Notifie les joueurs et leurs followers quand un match commence
    /// </summary>
    private async Task NotifyMatchStartedAsync(Match match)
    {
        if (!match.PlayerAId.HasValue || !match.PlayerBId.HasValue)
            return;

        var playerA = match.PlayerA;
        var playerB = match.PlayerB;

        if (playerA == null || playerB == null)
            return;

        // Notifier les joueurs du match
        await NotifyPlayersMatchStartedAsync(match, playerA, playerB);

        // Notifier les followers
        await NotifyFollowersMatchStartedAsync(match, playerA, playerB);
    }

    /// <summary>
    /// Notifie les joueurs du match qu'il commence
    /// </summary>
    private async Task NotifyPlayersMatchStartedAsync(Match match, Player playerA, Player playerB)
    {
        var terrainText = match.TerrainNumber.HasValue 
            ? $"rendez-vous sur le terrain {match.TerrainNumber} et " 
            : "";

        // Notification au joueur A
        await _notificationService.SendNotificationAsync(
            match.PlayerAId.Value,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerB.FirstName} {playerB.LastName} a commencé, {terrainText}bon match :)",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerBId.Value.ToString() },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );

        // Notification au joueur B
        await _notificationService.SendNotificationAsync(
            match.PlayerBId.Value,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerA.FirstName} {playerA.LastName} a commencé, {terrainText}bon match :)",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerAId.Value.ToString() },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );
    }

    /// <summary>
    /// Notifie les followers quand un match commence
    /// </summary>
    private async Task NotifyFollowersMatchStartedAsync(Match match, Player playerA, Player playerB)
    {
        // Récupérer les followers des deux joueurs
        var allFollowers = await _context.PlayerFollows
            .Where(pf => pf.FollowedId == match.PlayerAId.Value || pf.FollowedId == match.PlayerBId.Value)
            .Select(pf => new { pf.FollowerId, pf.FollowedId })
            .ToListAsync();

        // Grouper par follower pour éviter les doublons
        var followersByPlayer = allFollowers
            .GroupBy(f => f.FollowerId)
            .ToDictionary(g => g.Key, g => g.Select(f => f.FollowedId).ToList());

        foreach (var followerGroup in followersByPlayer)
        {
            var followerId = followerGroup.Key;
            
            // Ne pas notifier les joueurs du match
            if (followerId == match.PlayerAId.Value || followerId == match.PlayerBId.Value)
                continue;

            var followedPlayers = followerGroup.Value;
            string message;

            // Personnaliser le message selon qui est suivi
            if (followedPlayers.Contains(match.PlayerAId.Value) && followedPlayers.Contains(match.PlayerBId.Value))
            {
                // Suit les deux joueurs
                message = $"{playerA.FirstName} {playerA.LastName} et {playerB.FirstName} {playerB.LastName} ont commencé leur match";
            }
            else if (followedPlayers.Contains(match.PlayerAId.Value))
            {
                // Suit seulement le joueur A
                message = $"{playerA.FirstName} {playerA.LastName} a commencé son match contre {playerB.FirstName} {playerB.LastName}";
            }
            else
            {
                // Suit seulement le joueur B
                message = $"{playerB.FirstName} {playerB.LastName} a commencé son match contre {playerA.FirstName} {playerA.LastName}";
            }

            await _notificationService.SendNotificationAsync(
                followerId,
                "match_started",
                "Match commencé",
                message,
                new Dictionary<string, object>
                {
                    { "match_id", match.Id.ToString() },
                    { "player_a_id", match.PlayerAId.Value.ToString() },
                    { "player_b_id", match.PlayerBId.Value.ToString() },
                    { "entity_type", "match" },
                    { "entity_id", match.Id.ToString() },
                }
            );
        }
    }

    /// <summary>
    /// Notifie les followers quand un match est terminé
    /// </summary>
    private async Task NotifyMatchFinishedAsync(Match match)
    {
        if (!match.PlayerAId.HasValue || !match.PlayerBId.HasValue || 
            !match.ScoreA.HasValue || !match.ScoreB.HasValue)
            return;

        var playerA = match.PlayerA;
        var playerB = match.PlayerB;

        if (playerA == null || playerB == null)
            return;

        // Récupérer les followers des deux joueurs
        var allFollowers = await _context.PlayerFollows
            .Where(pf => pf.FollowedId == match.PlayerAId.Value || pf.FollowedId == match.PlayerBId.Value)
            .Select(pf => new { pf.FollowerId, pf.FollowedId })
            .ToListAsync();

        // Grouper par follower pour éviter les doublons
        var followersByPlayer = allFollowers
            .GroupBy(f => f.FollowerId)
            .ToDictionary(g => g.Key, g => g.Select(f => f.FollowedId).ToList());

        string scoreText = $"{match.ScoreA}-{match.ScoreB}";

        foreach (var followerGroup in followersByPlayer)
        {
            var followerId = followerGroup.Key;
            
            // Ne pas notifier les joueurs du match
            if (followerId == match.PlayerAId.Value || followerId == match.PlayerBId.Value)
                continue;

            var followedPlayers = followerGroup.Value;
            string message;

            // Personnaliser le message selon qui est suivi
            if (followedPlayers.Contains(match.PlayerAId.Value) && followedPlayers.Contains(match.PlayerBId.Value))
            {
                // Suit les deux joueurs
                message = $"{playerA.FirstName} {playerA.LastName} vs {playerB.FirstName} {playerB.LastName} : {scoreText}";
            }
            else if (followedPlayers.Contains(match.PlayerAId.Value))
            {
                // Suit seulement le joueur A
                message = $"{playerA.FirstName} {playerA.LastName} a joué contre {playerB.FirstName} {playerB.LastName} ({scoreText})";
            }
            else
            {
                // Suit seulement le joueur B
                message = $"{playerB.FirstName} {playerB.LastName} a joué contre {playerA.FirstName} {playerA.LastName} ({scoreText})";
            }

            await _notificationService.SendNotificationAsync(
                followerId,
                "match_played",
                "Match terminé",
                message,
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

    // ============================================
    // AUTRES MÉTHODES (génération, import, etc.)
    // ============================================

    [HttpPost("generate")]
    public async Task<IActionResult> GenerateMatches([FromBody] Guid season_id)
    {
        var season = await _context.Seasons
            .Include(s => s.Boxes)
            .FirstOrDefaultAsync(s => s.Id == season_id);

        if (season == null)
            return NotFound("Saison introuvable");

        if (season.StartDate == null)
            return BadRequest("La date de début de saison est manquante");

        var appSettings = await _context.AppSettings.FirstOrDefaultAsync();
        if (appSettings == null)
            return BadRequest("Paramètres d'application introuvables");

        List<TimeOnly> timeSlots;
        try
        {
            timeSlots = JsonSerializer
                .Deserialize<List<string>>(appSettings.TimeSlots)!
                .Select(TimeOnly.Parse)
                .OrderBy(t => t)
                .ToList();
        }
        catch
        {
            return BadRequest("Créneaux horaires invalides");
        }

        var matches = new List<Match>();

        foreach (var box in season.Boxes)
        {
            var memberships = await _context.BoxMemberships
                .Where(m => m.BoxId == box.Id && m.Active.Value)
                .Include(m => m.Player)
                .OrderBy(m => m.Rank)
                .ToListAsync();

            if (memberships.Count < 2)
                continue;

            var rankByPlayerId = memberships
                .ToDictionary(m => m.PlayerId, m => m.Rank);

            var players = memberships
                .Select(m => m.Player)
                .ToList();

            if (players.Count % 2 != 0)
                players.Add(null);

            int playerCount = players.Count;
            int totalWeeks = playerCount - 1;
            int totalSlots = timeSlots.Count;
            short maxRank = (short)memberships.Max(m => m.Rank);

            var rotatingPlayers = new List<Player?>(players);

            for (int week = 1; week <= totalWeeks; week++)
            {
                var scheduledPlayers = new HashSet<Guid>();

                int i = 0;
                while (i < playerCount / 2)
                {
                    var playerA = rotatingPlayers[i];
                    var playerB = rotatingPlayers[playerCount - 1 - i];

                    if (playerA == null || playerB == null)
                    {
                        i++;
                        continue;
                    }

                    if (scheduledPlayers.Contains(playerA.Id) || scheduledPlayers.Contains(playerB.Id))
                    {
                        i++;
                        continue;
                    }

                    short rankA = (short)rankByPlayerId[playerA.Id];
                    short rankB = (short)rankByPlayerId[playerB.Id];

                    int slotA = GetPreferredSlotIndex(rankA, maxRank, totalSlots);
                    int slotB = GetPreferredSlotIndex(rankB, maxRank, totalSlots);

                    int preferredSlot = (slotA + slotB) / 2;
                    int offset = Random.Shared.Next(-1, 2);

                    int finalSlotIndex = Math.Clamp(preferredSlot + offset, 0, totalSlots - 1);
                    var slotTime = timeSlots[finalSlotIndex];

                    var matchDateTime = season.StartDate.Value
                        .AddDays((week - 1) * 7)
                        .ToDateTime(slotTime);

                    matches.Add(new Match
                    {
                        SeasonId = season_id,
                        BoxId = box.Id,
                        WeekNumber = week,
                        PlayerAId = playerA.Id,
                        PlayerBId = playerB.Id,
                        SlotNumber = finalSlotIndex + 1,
                        Status = "scheduled",
                        ScheduledAt = matchDateTime,
                        Running = false
                    });

                    scheduledPlayers.Add(playerA.Id);
                    scheduledPlayers.Add(playerB.Id);
                    i++;
                }

                var last = rotatingPlayers[^1];
                rotatingPlayers.RemoveAt(rotatingPlayers.Count - 1);
                rotatingPlayers.Insert(1, last);
            }
        }

        _context.Matches.AddRange(matches);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Matchs générés avec succès",
            count = matches.Count
        });
    }

    private static int GetPreferredSlotIndex(int rank, int maxRank, int totalSlots)
    {
        if (maxRank <= 1)
            return 0;

        double ratio = (double)(rank - 1) / (maxRank - 1);
        return (int)Math.Round(ratio * (totalSlots - 1));
    }

    [HttpPost("recalculate-points")]
    public async Task<IActionResult> RecalculateAllMatchPoints()
    {
        var settings = await _context.AppSettings.FirstOrDefaultAsync();
        if (settings == null)
            return BadRequest("Paramètres d'application introuvables");

        var pointsMap = new Dictionary<(short?, short?), (short?, short?)>
        {
            [(3, 0)] = (settings.PointsFor30, settings.PointsFor03),
            [(3, 1)] = (settings.PointsFor31, settings.PointsFor13),
            [(3, 2)] = (settings.PointsFor32, settings.PointsFor23),
            [(0, 3)] = (settings.PointsFor03, settings.PointsFor30),
            [(1, 3)] = (settings.PointsFor13, settings.PointsFor31),
            [(2, 3)] = (settings.PointsFor23, settings.PointsFor32)
        };

        var matches = await _context.Matches.ToListAsync();

        foreach (var match in matches)
        {
            match.ScoreA ??= 0;
            match.ScoreB ??= 0;

            if (pointsMap.TryGetValue((match.ScoreA, match.ScoreB), out var points))
            {
                match.PointsA = points.Item1;
                match.PointsB = points.Item2;
            }
            else
            {
                match.PointsA = 0;
                match.PointsB = 0;
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Points recalculés pour tous les matchs", count = matches.Count });
    }

    [HttpPost("{id}/request-delay")]
    public async Task<ActionResult<MatchDTO>> RequestMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
    {
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();

        if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
            return BadRequest("Le joueur ne fait pas partie de ce match");

        if (match.DelayedStatus == "pending")
            return BadRequest("Une demande de report est déjà en cours pour ce match");

        if (match.ScoreA > 0 && match.ScoreB > 0)
            return BadRequest("Le match a déjà été joué");

        match.DelayedStatus = "pending";
        match.DelayedRequestedAt = DateTime.UtcNow;
        match.DelayedResolvedAt = null;
        match.DelayedRequestedBy = request.PlayerId;

        await _context.SaveChangesAsync();
        return Ok(MatchDTO.FromModel(match));
    }

    [HttpPost("{id}/accept-delay")]
    public async Task<ActionResult<MatchDTO>> AcceptMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
    {
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();

        if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
            return BadRequest("Le joueur ne fait pas partie de ce match");

        if (match.DelayedStatus != "pending")
            return BadRequest("Aucune demande de report en attente pour ce match");

        if (match.DelayedRequestedBy == request.PlayerId)
            return BadRequest("Vous ne pouvez pas accepter votre propre demande");

        match.DelayedStatus = "accepted";
        match.DelayedResolvedAt = DateTime.UtcNow;
        match.Status = "delayed";
        match.DelayedPlayerId = match.DelayedRequestedBy;

        await _context.SaveChangesAsync();
        return Ok(MatchDTO.FromModel(match));
    }

    [HttpPost("{id}/reject-delay")]
    public async Task<ActionResult<MatchDTO>> RejectMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
    {
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();

        if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
            return BadRequest("Le joueur ne fait pas partie de ce match");

        if (match.DelayedStatus != "pending")
            return BadRequest("Aucune demande de report en attente pour ce match");

        if (match.DelayedRequestedBy == request.PlayerId)
            return BadRequest("Vous ne pouvez pas refuser votre propre demande");

        match.DelayedStatus = "rejected";
        match.DelayedResolvedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(MatchDTO.FromModel(match));
    }

    [HttpPost("{id}/cancel-delay")]
    public async Task<ActionResult<MatchDTO>> CancelMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
    {
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();

        if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
            return BadRequest("Le joueur ne fait pas partie de ce match");

        if (match.DelayedStatus != "pending")
            return BadRequest("Aucune demande de report en attente pour ce match");

        if (match.DelayedRequestedBy != request.PlayerId)
            return BadRequest("Vous ne pouvez annuler que votre propre demande");

        match.DelayedStatus = "cancelled";
        match.DelayedResolvedAt = DateTime.UtcNow;
        match.DelayedPlayerId = null;
        match.DelayedRequestedBy = null;

        await _context.SaveChangesAsync();
        return Ok(MatchDTO.FromModel(match));
    }

    [HttpGet("followed")]
    public async Task<ActionResult<IEnumerable<MatchDTO>>> GetFollowedPlayersMatches(
        [FromQuery] Guid playerId,
        [FromQuery] int limit = 50)
    {
        var followedIds = await _context.PlayerFollows
            .Where(f => f.FollowerId == playerId)
            .Select(f => f.FollowedId)
            .ToListAsync();

        if (followedIds.Count == 0)
            return Ok(new List<MatchDTO>());

        var matches = await _context.Matches
            .Include(m => m.PlayerA)
            .Include(m => m.PlayerB)
            .Where(m =>
                (followedIds.Contains(m.PlayerAId.Value) || followedIds.Contains(m.PlayerBId.Value)) &&
                m.PointsA != null && m.PointsB != null &&
                m.PlayedAt != null
            )
            .OrderByDescending(m => m.PlayedAt)
            .Take(limit)
            .ToListAsync();

        var response = matches.Select(m => MatchDTO.FromModel(m));
        return Ok(response);
    }

    [HttpGet("live")]
    public async Task<ActionResult<IEnumerable<MatchDTO>>> GetLiveMatches()
    {
        var liveMatches = await _context.Matches
            .Include(m => m.PlayerA)
            .Include(m => m.PlayerB)
            .Include(m => m.Box)
            .Where(m => m.Running == true)
            .OrderByDescending(m => m.RunningSince)
            .ToListAsync();

        var response = liveMatches.Select(m => MatchDTO.FromModel(m));
        return Ok(response);
    }
}
```

## Points clés de cette implémentation

### 1. **Séparation des responsabilités**
- Les fonctions de notification sont isolées et réutilisables
- Chaque fonction a une responsabilité unique et claire

### 2. **Fonctions de notification**
- `NotifyMatchStartedAsync()` : Orchestre les notifications de début de match
- `NotifyPlayersMatchStartedAsync()` : Notifie les joueurs du match
- `NotifyFollowersMatchStartedAsync()` : Notifie les followers quand le match commence
- `NotifyMatchFinishedAsync()` : Notifie les followers quand le match est terminé

### 3. **Gestion des doublons**
- Les followers qui suivent les deux joueurs ne reçoivent qu'une seule notification
- Messages personnalisés selon qui est suivi

### 4. **Conditions de notification**
- **Match commence** : `!wasRunning && isNowRunning`
- **Match terminé** : `!wasPlayed && isNowPlayed` où `isNowPlayed = scoreA && scoreB && !running`

### 5. **Maintenabilité**
- Code bien structuré et commenté
- Facile à modifier ou étendre
- Fonctions testables individuellement

## Utilisation

Le code est prêt à l'emploi. Il suffit de :
1. Copier le code dans votre `MatchesController`
2. S'assurer que `INotificationService` est injecté
3. Les notifications seront envoyées automatiquement lors des mises à jour de match
