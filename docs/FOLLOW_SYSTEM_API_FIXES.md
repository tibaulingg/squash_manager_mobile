# Corrections pour les erreurs 500

## Problème 1 : GetFollowing() - Erreur 500

### Causes possibles :
1. `GetCurrentPlayerId()` lance une exception si l'utilisateur n'est pas authentifié
2. `_context.PlayerFollows` n'existe pas dans le DbContext
3. La table `PlayerFollows` n'existe pas dans la base de données

### Solution :

```csharp
// GET: api/PlayerFollows/following
// Liste des joueurs suivis par le joueur actuel
[HttpGet("following")]
public async Task<ActionResult<IEnumerable<PlayerDTO>>> GetFollowing()
{
    try
    {
        var currentPlayerId = GetCurrentPlayerId();

        var followedIds = await _context.PlayerFollows
            .Where(f => f.FollowerId == currentPlayerId)
            .Select(f => f.FollowedId)
            .ToListAsync();

        var players = await _context.Players
            .Where(p => followedIds.Contains(p.Id))
            .ToListAsync();

        var response = players.Select(p => PlayerDTO.FromModel(p));
        return Ok(response);
    }
    catch (UnauthorizedAccessException)
    {
        return Unauthorized("Joueur non authentifié");
    }
    catch (Exception ex)
    {
        // Logger l'erreur pour le débogage
        Console.WriteLine($"Erreur GetFollowing: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
        return StatusCode(500, new { message = "Erreur lors de la récupération des joueurs suivis", error = ex.Message });
    }
}
```

## Problème 2 : GetFollowedPlayersMatches() - Utilisation de .Value

### Problème :
Si `PlayerAId` et `PlayerBId` sont des `Guid?` (nullable), utiliser `.Value` peut causer une exception si la valeur est null.

### Solution :

```csharp
// GET: api/Matches/followed
// Récupère les matchs joués des joueurs suivis par un joueur spécifié
[HttpGet("followed")]
public async Task<ActionResult<IEnumerable<MatchDTO>>> GetFollowedPlayersMatches(
    [FromQuery] Guid playerId,
    [FromQuery] int limit = 50)
{
    try
    {
        // Récupérer les IDs des joueurs suivis
        var followedIds = await _context.PlayerFollows
            .Where(f => f.FollowerId == playerId)
            .Select(f => f.FollowedId)
            .ToListAsync();

        if (followedIds.Count == 0)
            return Ok(new List<MatchDTO>());

        // Récupérer les matchs joués de ces joueurs (avec points)
        var matches = await _context.Matches
            .Include(m => m.PlayerA)
            .Include(m => m.PlayerB)
            .Where(m =>
                m.PlayerAId.HasValue && m.PlayerBId.HasValue && // Vérifier que les IDs ne sont pas null
                (followedIds.Contains(m.PlayerAId.Value) || followedIds.Contains(m.PlayerBId.Value)) &&
                m.PointsA != null && m.PointsB != null && // Match joué
                m.PlayedAt != null
            )
            .OrderByDescending(m => m.PlayedAt)
            .Take(limit)
            .ToListAsync();

        var response = matches.Select(m => MatchDTO.FromModel(m));
        return Ok(response);
    }
    catch (Exception ex)
    {
        // Logger l'erreur pour le débogage
        Console.WriteLine($"Erreur GetFollowedPlayersMatches: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
        return StatusCode(500, new { message = "Erreur lors de la récupération des matchs", error = ex.Message });
    }
}
```

**OU** si `PlayerAId` et `PlayerBId` sont des `Guid` (non-nullable) :

```csharp
// Récupérer les matchs joués de ces joueurs (avec points)
var matches = await _context.Matches
    .Include(m => m.PlayerA)
    .Include(m => m.PlayerB)
    .Where(m =>
        (followedIds.Contains(m.PlayerAId) || followedIds.Contains(m.PlayerBId)) &&
        m.PointsA != null && m.PointsB != null && // Match joué
        m.PlayedAt != null
    )
    .OrderByDescending(m => m.PlayedAt)
    .Take(limit)
    .ToListAsync();
```

## Vérifications à faire :

### 1. Vérifier que PlayerFollows est dans le DbContext :

```csharp
public class AppDbContext : DbContext
{
    // ... autres DbSet

    public DbSet<PlayerFollow> PlayerFollows { get; set; } = null!;

    // ...
}
```

### 2. Vérifier que la table existe dans la base de données :

Exécuter la migration SQL ou vérifier que la table `PlayerFollows` existe.

### 3. Vérifier GetCurrentPlayerId() :

```csharp
private Guid GetCurrentPlayerId()
{
    var userIdClaim = User.FindFirst("player_id");
    if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var playerId))
    {
        throw new UnauthorizedAccessException("Joueur non authentifié");
    }
    
    return playerId;
}
```

### 4. Ajouter un try-catch global dans le controller :

```csharp
[Route("api/[controller]")]
[ApiController]
public class PlayerFollowsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<PlayerFollowsController> _logger;

    public PlayerFollowsController(AppDbContext context, ILogger<PlayerFollowsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // ... méthodes avec try-catch
}
```
