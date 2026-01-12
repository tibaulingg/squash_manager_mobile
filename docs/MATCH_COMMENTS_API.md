# API pour les Commentaires de Matchs

## Table de base de données

```sql
CREATE TABLE [dbo].[MatchComments] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [MatchId] UNIQUEIDENTIFIER NOT NULL,
    [PlayerId] UNIQUEIDENTIFIER NOT NULL,
    [Text] NVARCHAR(500) NOT NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_MatchComments_Match] FOREIGN KEY ([MatchId]) REFERENCES [Matches]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_MatchComments_Player] FOREIGN KEY ([PlayerId]) REFERENCES [Players]([Id]) ON DELETE CASCADE
);

CREATE INDEX [IX_MatchComments_MatchId] ON [dbo].[MatchComments] ([MatchId]);
CREATE INDEX [IX_MatchComments_CreatedAt] ON [dbo].[MatchComments] ([CreatedAt] DESC);
```

## DTOs

```csharp
public class MatchCommentDTO
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
    public DateTime CreatedAt { get; set; }
    public PlayerDTO Player { get; set; }

    public static MatchCommentDTO FromModel(MatchComment comment, Player player)
    {
        return new MatchCommentDTO
        {
            Id = comment.Id,
            MatchId = comment.MatchId,
            PlayerId = comment.PlayerId,
            Text = comment.Text,
            CreatedAt = comment.CreatedAt,
            Player = PlayerDTO.FromModel(player),
        };
    }
}

public class AddMatchCommentRequest
{
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
}
```

## Modèle C#

```csharp
public class MatchComment
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid PlayerId { get; set; }
    public string Text { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    public Match Match { get; set; } = null!;
    public Player Player { get; set; } = null!;
}
```

## Controller

Ajouter dans `MatchesController` :

```csharp
// GET: api/Matches/{matchId}/comments
// Récupère tous les commentaires d'un match
[HttpGet("{matchId}/comments")]
public async Task<ActionResult<IEnumerable<MatchCommentDTO>>> GetMatchComments(Guid matchId)
{
    var comments = await _context.MatchComments
        .Include(c => c.Player)
        .Where(c => c.MatchId == matchId)
        .OrderBy(c => c.CreatedAt)
        .ToListAsync();

    var response = comments.Select(c => MatchCommentDTO.FromModel(c, c.Player));
    return Ok(response);
}

// POST: api/Matches/{matchId}/comments?currentPlayerId={currentPlayerId}
// Ajouter un commentaire à un match
[HttpPost("{matchId}/comments")]
public async Task<ActionResult<MatchCommentDTO>> AddMatchComment(
    Guid matchId,
    [FromQuery] Guid currentPlayerId,
    [FromBody] AddMatchCommentRequest request)
{
    // Vérifier que le match existe
    var match = await _context.Matches.FindAsync(matchId);
    if (match == null)
        return NotFound("Match introuvable");

    // Vérifier que le joueur existe
    var player = await _context.Players.FindAsync(request.PlayerId);
    if (player == null)
        return NotFound("Joueur introuvable");

    // Vérifier que c'est le joueur actuel qui commente
    if (request.PlayerId != currentPlayerId)
        return Forbid("Vous ne pouvez commenter qu'avec votre propre compte");

    var comment = new MatchComment
    {
        Id = Guid.NewGuid(),
        MatchId = matchId,
        PlayerId = request.PlayerId,
        Text = request.Text.Trim(),
        CreatedAt = DateTime.UtcNow,
    };

    _context.MatchComments.Add(comment);
    await _context.SaveChangesAsync();

    // Recharger avec le joueur
    await _context.Entry(comment).Reference(c => c.Player).LoadAsync();

    return CreatedAtAction(
        nameof(GetMatchComments),
        new { matchId },
        MatchCommentDTO.FromModel(comment, comment.Player)
    );
}
```

## Ajout au DbContext

```csharp
public class AppDbContext : DbContext
{
    // ... autres DbSet

    public DbSet<MatchComment> MatchComments { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ... autres configurations

        modelBuilder.Entity<MatchComment>(entity =>
        {
            entity.ToTable("MatchComments");
            entity.HasKey(e => e.Id);
            entity.HasOne(e => e.Match)
                .WithMany()
                .HasForeignKey(e => e.MatchId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Player)
                .WithMany()
                .HasForeignKey(e => e.PlayerId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
```

## Endpoints Frontend

Dans `services/api.ts`, ajouter :

```typescript
export const getMatchComments = async (matchId: string): Promise<MatchCommentDTO[]> => {
  return fetchApi<MatchCommentDTO[]>(`/Matches/${matchId}/comments`);
};

export const addMatchComment = async (matchId: string, currentPlayerId: string, text: string): Promise<MatchCommentDTO> => {
  return fetchApi<MatchCommentDTO>(`/Matches/${matchId}/comments?currentPlayerId=${currentPlayerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      PlayerId: currentPlayerId,
      Text: text,
    }),
  });
};
```
