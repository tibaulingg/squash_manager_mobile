# API pour le Système de Suivi de Joueurs

## Table de base de données

```sql
CREATE TABLE [dbo].[PlayerFollows] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [FollowerId] UNIQUEIDENTIFIER NOT NULL, -- Qui suit
    [FollowedId] UNIQUEIDENTIFIER NOT NULL, -- Qui est suivi
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_PlayerFollows_Follower] FOREIGN KEY ([FollowerId]) REFERENCES [Players]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PlayerFollows_Followed] FOREIGN KEY ([FollowedId]) REFERENCES [Players]([Id]) ON DELETE CASCADE,
    CONSTRAINT [UQ_PlayerFollows_Follower_Followed] UNIQUE ([FollowerId], [FollowedId]),
    CONSTRAINT [CK_PlayerFollows_NotSelf] CHECK ([FollowerId] != [FollowedId])
);

CREATE INDEX [IX_PlayerFollows_FollowerId] ON [dbo].[PlayerFollows] ([FollowerId]);
CREATE INDEX [IX_PlayerFollows_FollowedId] ON [dbo].[PlayerFollows] ([FollowedId]);
CREATE INDEX [IX_PlayerFollows_CreatedAt] ON [dbo].[PlayerFollows] ([CreatedAt] DESC);
```

## DTOs

```csharp
public class PlayerFollowDTO
{
    public Guid Id { get; set; }
    public Guid FollowerId { get; set; }
    public Guid FollowedId { get; set; }
    public DateTime CreatedAt { get; set; }

    public static PlayerFollowDTO FromModel(PlayerFollow follow)
    {
        return new PlayerFollowDTO
        {
            Id = follow.Id,
            FollowerId = follow.FollowerId,
            FollowedId = follow.FollowedId,
            CreatedAt = follow.CreatedAt,
        };
    }
}

public class FollowStatusDTO
{
    public bool IsFollowing { get; set; }
    public int FollowersCount { get; set; }
    public int FollowingCount { get; set; }
}
```

## Modèle C#

```csharp
public class PlayerFollow
{
    public Guid Id { get; set; }
    public Guid FollowerId { get; set; }
    public Guid FollowedId { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    public Player Follower { get; set; } = null!;
    public Player Followed { get; set; } = null!;
}
```

## Controller

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQUASH_API.Models;
using SQUASH_API.DTOs;

[Route("api/[controller]")]
[ApiController]
public class PlayerFollowsController : ControllerBase
{
    private readonly AppDbContext _context;

    public PlayerFollowsController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/PlayerFollows/status/{playerId}?currentPlayerId={currentPlayerId}
    // Vérifie si le joueur actuel suit le joueur spécifié
    [HttpGet("status/{playerId}")]
    public async Task<ActionResult<FollowStatusDTO>> GetFollowStatus(
        Guid playerId,
        [FromQuery] Guid currentPlayerId)
    {
        var isFollowing = await _context.PlayerFollows
            .AnyAsync(f => f.FollowerId == currentPlayerId && f.FollowedId == playerId);

        var followersCount = await _context.PlayerFollows
            .CountAsync(f => f.FollowedId == playerId);

        var followingCount = await _context.PlayerFollows
            .CountAsync(f => f.FollowerId == playerId);

        return Ok(new FollowStatusDTO
        {
            IsFollowing = isFollowing,
            FollowersCount = followersCount,
            FollowingCount = followingCount,
        });
    }

    // GET: api/PlayerFollows/following?currentPlayerId={currentPlayerId}
    // Liste des joueurs suivis par le joueur actuel
    [HttpGet("following")]
    public async Task<ActionResult<IEnumerable<PlayerDTO>>> GetFollowing([FromQuery] Guid currentPlayerId)
    {
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

    // GET: api/PlayerFollows/followers?currentPlayerId={currentPlayerId}
    // Liste des joueurs qui suivent le joueur actuel
    [HttpGet("followers")]
    public async Task<ActionResult<IEnumerable<PlayerDTO>>> GetFollowers([FromQuery] Guid currentPlayerId)
    {
        var followerIds = await _context.PlayerFollows
            .Where(f => f.FollowedId == currentPlayerId)
            .Select(f => f.FollowerId)
            .ToListAsync();

        var players = await _context.Players
            .Where(p => followerIds.Contains(p.Id))
            .ToListAsync();

        var response = players.Select(p => PlayerDTO.FromModel(p));
        return Ok(response);
    }

    // POST: api/PlayerFollows/{playerId}?currentPlayerId={currentPlayerId}
    // Suivre un joueur
    [HttpPost("{playerId}")]
    public async Task<ActionResult<PlayerFollowDTO>> FollowPlayer(
        Guid playerId,
        [FromQuery] Guid currentPlayerId)
    {
        if (currentPlayerId == playerId)
            return BadRequest("Vous ne pouvez pas vous suivre vous-même");

        // Vérifier si le joueur existe
        var player = await _context.Players.FindAsync(playerId);
        if (player == null)
            return NotFound("Joueur introuvable");

        // Vérifier si déjà suivi
        var existingFollow = await _context.PlayerFollows
            .FirstOrDefaultAsync(f => f.FollowerId == currentPlayerId && f.FollowedId == playerId);

        if (existingFollow != null)
            return Conflict("Vous suivez déjà ce joueur");

        var follow = new PlayerFollow
        {
            Id = Guid.NewGuid(),
            FollowerId = currentPlayerId,
            FollowedId = playerId,
            CreatedAt = DateTime.UtcNow,
        };

        _context.PlayerFollows.Add(follow);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetFollowStatus), new { playerId, currentPlayerId },
            PlayerFollowDTO.FromModel(follow));
    }

    // DELETE: api/PlayerFollows/{playerId}?currentPlayerId={currentPlayerId}
    // Ne plus suivre un joueur
    [HttpDelete("{playerId}")]
    public async Task<IActionResult> UnfollowPlayer(
        Guid playerId,
        [FromQuery] Guid currentPlayerId)
    {
        var follow = await _context.PlayerFollows
            .FirstOrDefaultAsync(f => f.FollowerId == currentPlayerId && f.FollowedId == playerId);

        if (follow == null)
            return NotFound("Vous ne suivez pas ce joueur");

        _context.PlayerFollows.Remove(follow);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
```

## Endpoint pour récupérer les matchs des joueurs suivis

Dans `MatchesController`, ajouter :

```csharp
// GET: api/Matches/followed?playerId={playerId}&limit={limit}
// Récupère les matchs joués des joueurs suivis par un joueur spécifié
[HttpGet("followed")]
public async Task<ActionResult<IEnumerable<MatchDTO>>> GetFollowedPlayersMatches(
    [FromQuery] Guid playerId,
    [FromQuery] int limit = 50)
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
            (followedIds.Contains(m.PlayerAId) || followedIds.Contains(m.PlayerBId)) &&
            m.PointsA != null && m.PointsB != null && // Match joué
            m.PlayedAt != null
        )
        .OrderByDescending(m => m.PlayedAt)
        .Take(limit)
        .ToListAsync();

    var response = matches.Select(m => MatchDTO.FromModel(m));
    return Ok(response);
}
```

**Note:** Si `PlayerAId` et `PlayerBId` sont des `Guid?` (nullable), utilisez :

```csharp
.Where(m =>
    m.PlayerAId.HasValue && m.PlayerBId.HasValue &&
    (followedIds.Contains(m.PlayerAId.Value) || followedIds.Contains(m.PlayerBId.Value)) &&
    m.PointsA != null && m.PointsB != null &&
    m.PlayedAt != null
)
```

## Ajout au DbContext

```csharp
public class AppDbContext : DbContext
{
    // ... autres DbSet

    public DbSet<PlayerFollow> PlayerFollows { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ... autres configurations

        modelBuilder.Entity<PlayerFollow>(entity =>
        {
            entity.ToTable("PlayerFollows");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.FollowerId, e.FollowedId }).IsUnique();
            entity.HasOne(e => e.Follower)
                .WithMany()
                .HasForeignKey(e => e.FollowerId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Followed)
                .WithMany()
                .HasForeignKey(e => e.FollowedId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
```

## Endpoints Frontend

Dans `services/api.ts`, les fonctions sont déjà mises à jour :

```typescript
export const followPlayer = async (playerId: string, currentPlayerId: string): Promise<PlayerFollowDTO> => {
  return fetchApi<PlayerFollowDTO>(`/PlayerFollows/${playerId}?currentPlayerId=${currentPlayerId}`, {
    method: 'POST',
  });
};

export const unfollowPlayer = async (playerId: string, currentPlayerId: string): Promise<void> => {
  return fetchApi<void>(`/PlayerFollows/${playerId}?currentPlayerId=${currentPlayerId}`, {
    method: 'DELETE',
  });
};

export const getFollowStatus = async (currentPlayerId: string, playerId: string): Promise<FollowStatusDTO> => {
  return fetchApi<FollowStatusDTO>(`/PlayerFollows/status/${playerId}?currentPlayerId=${currentPlayerId}`);
};

export const getFollowing = async (currentPlayerId: string): Promise<PlayerDTO[]> => {
  return fetchApi<PlayerDTO[]>(`/PlayerFollows/following?currentPlayerId=${currentPlayerId}`);
};

export const getFollowedPlayersMatches = async (playerId: string, limit: number = 50): Promise<MatchDTO[]> => {
  return fetchApi<MatchDTO[]>(`/Matches/followed?playerId=${playerId}&limit=${limit}`);
};
```
