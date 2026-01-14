# Notification "match_played" pour les followers

Ce guide explique comment envoyer une notification aux followers quand un match est joué.

## Code à ajouter dans MatchesController

Dans la méthode `UpdateMatch`, ajoutez ce code **après** avoir enregistré le match (après `await _context.SaveChangesAsync()`), pour détecter quand un match vient d'être joué :

```csharp
[HttpPut("{id}")]
public async Task<IActionResult> UpdateMatch(Guid id, MatchDTO dto)
{
    if (id != dto.id) return BadRequest();
    
    var match = await _context.Matches
        .Include(m => m.PlayerA)
        .Include(m => m.PlayerB)
        .FirstOrDefaultAsync(m => m.Id == id);
    
    if (match == null) return NotFound();

    // Vérifier si le match vient d'être joué (score vient d'être enregistré)
    bool wasPlayed = match.PlayedAt.HasValue && match.ScoreA.HasValue && match.ScoreB.HasValue;
    bool isNowPlayed = dto.score_a.HasValue && dto.score_b.HasValue && dto.played_at.HasValue;
    bool justPlayed = !wasPlayed && isNowPlayed;

    // ... votre code existant pour mettre à jour le match ...

    if (!match.Running && dto.running)
    {
        // Code existant pour match_started
        var playerA = await _context.Players.FirstOrDefaultAsync(p => p.Id == match.PlayerAId.Value);
        var playerB = await _context.Players.FirstOrDefaultAsync(p => p.Id == match.PlayerBId.Value);

        await _notificationService.SendNotificationAsync(
            match.PlayerBId.Value,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerA.FirstName} {playerA?.LastName} a commencé, rendez-vous sur le terrain {match.TerrainNumber} et bon match :)",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerAId.ToString() },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );

        await _notificationService.SendNotificationAsync(
            match.PlayerAId.Value,
            "match_started",
            "Match commencé",
            $"Votre match contre {playerB.FirstName} {playerB?.LastName} a commencé, rendez-vous sur le terrain {match.TerrainNumber} et bon match :)",
            new Dictionary<string, object>
            {
                { "match_id", match.Id.ToString() },
                { "opponent_id", match.PlayerBId.ToString() },
                { "entity_type", "match" },
                { "entity_id", match.Id.ToString() },
            }
        );
    }

    // ... votre code existant pour mettre à jour les champs du match ...

    await _context.SaveChangesAsync();

    // NOUVEAU : Envoyer des notifications aux followers quand le match est joué
    if (justPlayed && match.PlayerAId.HasValue && match.PlayerBId.HasValue)
    {
        var playerA = await _context.Players.FirstOrDefaultAsync(p => p.Id == match.PlayerAId.Value);
        var playerB = await _context.Players.FirstOrDefaultAsync(p => p.Id == match.PlayerBId.Value);

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

            // Déterminer le gagnant pour le message
            string winnerName;
            string scoreText;
            if (match.ScoreA > match.ScoreB)
            {
                winnerName = $"{playerA.FirstName} {playerA.LastName}";
                scoreText = $"{match.ScoreA}-{match.ScoreB}";
            }
            else if (match.ScoreB > match.ScoreA)
            {
                winnerName = $"{playerB.FirstName} {playerB.LastName}";
                scoreText = $"{match.ScoreB}-{match.ScoreA}";
            }
            else
            {
                winnerName = "Match nul";
                scoreText = $"{match.ScoreA}-{match.ScoreB}";
            }

            // Envoyer une notification à chaque follower du joueur A
            foreach (var followerId in playerAFollowers)
            {
                // Ne pas envoyer de notification aux joueurs du match eux-mêmes
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

            // Envoyer une notification à chaque follower du joueur B
            foreach (var followerId in playerBFollowers)
            {
                // Ne pas envoyer de notification aux joueurs du match eux-mêmes
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

    return NoContent();
}
```

## Points importants

1. **Détection du match joué** : Le code vérifie si le match vient d'être joué en comparant l'état avant et après la mise à jour
2. **Récupération des followers** : Pour chaque joueur, on récupère la liste de ses followers
3. **Éviter les doublons** : On vérifie que le follower n'est pas l'un des joueurs du match
4. **Message personnalisé** : Le message indique qui a joué et le score
5. **Données dans la notification** : Toutes les infos du match sont incluses dans `data` pour navigation

## Structure de la table PlayerFollows

Assurez-vous que votre table `PlayerFollows` a cette structure :

```sql
CREATE TABLE [dbo].[PlayerFollows] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [FollowerId] UNIQUEIDENTIFIER NOT NULL, -- Qui suit
    [FollowedId] UNIQUEIDENTIFIER NOT NULL,  -- Qui est suivi
    [CreatedAt] DATETIME NOT NULL,
    CONSTRAINT [FK_PlayerFollows_Follower] FOREIGN KEY ([FollowerId]) REFERENCES [Players]([Id]),
    CONSTRAINT [FK_PlayerFollows_Followed] FOREIGN KEY ([FollowedId]) REFERENCES [Players]([Id])
);
```

## Exemple de notification

Quand Alice (suivie par Bob) joue contre Charlie et gagne 3-1, Bob recevra :

**Titre** : "Match joué"  
**Corps** : "Alice Dupont a joué contre Charlie Martin (3-1)"

Et la notification contiendra dans `data` :
- `match_id` : ID du match
- `player_a_id` : ID d'Alice
- `player_b_id` : ID de Charlie
- `score_a` : 3
- `score_b` : 1
- `entity_type` : "match"
- `entity_id` : ID du match
