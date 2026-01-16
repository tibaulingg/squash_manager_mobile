# Endpoint pour récupérer les joueurs qui ont réagi (groupés par type)

Ce document décrit le nouvel endpoint pour récupérer tous les joueurs qui ont réagi à une entité, groupés par type de réaction.

## Endpoint

### GET `/api/Reactions/{entityType}/{entityId}/players`

Récupère tous les joueurs qui ont réagi à une entité (match ou membership), groupés par type de réaction.

#### Paramètres de route

- `entityType` (string) : Type d'entité (`"match"` ou `"membership"`)
- `entityId` (Guid) : ID de l'entité

#### Réponse

Retourne un objet `Dictionary<string, PlayerDTO[]>` où :
- La clé est le type de réaction (`"fire"`, `"clap"`, `"muscle"`, `"party"`, `"sad"`, `"heart"`, etc.)
- La valeur est un tableau de `PlayerDTO` représentant tous les joueurs qui ont utilisé ce type de réaction

**Exemple de réponse :**
```json
{
  "fire": [
    {
      "id": "guid-1",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "picture": "https://...",
      ...
    },
    {
      "id": "guid-2",
      "first_name": "Jane",
      "last_name": "Smith",
      "email": "jane@example.com",
      "picture": "https://...",
      ...
    }
  ],
  "clap": [
    {
      "id": "guid-3",
      "first_name": "Bob",
      "last_name": "Wilson",
      "email": "bob@example.com",
      "picture": "https://...",
      ...
    }
  ],
  "heart": []
}
```

**Note :** Les types de réaction sans joueurs ne sont pas inclus dans la réponse (ou peuvent être inclus avec un tableau vide selon votre préférence).

## Implémentation dans ReactionsController

Ajoutez cette méthode au `ReactionsController` existant (après la méthode `ReactToEntity`) :

```csharp
// GET: api/Reactions/{entityType}/{entityId}/players
[HttpGet("{entityType}/{entityId}/players")]
public async Task<ActionResult<Dictionary<string, List<PlayerDTO>>>> GetReactionPlayers(
    string entityType,
    Guid entityId)
{
    // Valider le type d'entité
    if (entityType != "match" && entityType != "membership")
    {
        return BadRequest("Type d'entité invalide. Utilisez 'match' ou 'membership'.");
    }

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

    if (!entityExists)
    {
        return NotFound("Entité introuvable");
    }

    // Récupérer toutes les réactions pour cette entité avec les joueurs
    IQueryable<MatchReaction> reactionsQuery = _context.MatchReactions
        .Include(r => r.Player);

    List<MatchReaction> reactions;

    if (entityType == "match")
    {
        reactions = await reactionsQuery
            .Where(r => r.MatchId != null && r.MatchId.Value == entityId)
            .ToListAsync();
    }
    else // membership
    {
        reactions = await reactionsQuery
            .Where(r => r.MembershipId != null && r.MembershipId.Value == entityId)
            .ToListAsync();
    }

    // Grouper par type de réaction et convertir en PlayerDTO
    // Trier par date de réaction (plus récent en premier) pour chaque groupe
    var result = reactions
        .GroupBy(r => r.ReactionType)
        .ToDictionary(
            g => g.Key,
            g => g
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => PlayerDTO.FromModel(r.Player))
                .ToList()
        );

    return Ok(result);
}
```

**Emplacement dans le contrôleur :**

Ajoutez cette méthode après la méthode `ReactToEntity` et avant les fonctions de notification privées. Voici où l'insérer dans le `ReactionsController` :

```csharp
[Route("api/[controller]")]
[ApiController]
public class ReactionsController : ControllerBase
{
    // ... constructeur et autres méthodes existantes ...

    // POST: api/Reactions/{entityType}/{entityId}
    [HttpPost("{entityType}/{entityId}")]
    public async Task<IActionResult> ReactToEntity(...)
    {
        // ... code existant ...
    }

    // ⬇️ AJOUTEZ ICI LE NOUVEL ENDPOINT ⬇️
    // GET: api/Reactions/{entityType}/{entityId}/players
    [HttpGet("{entityType}/{entityId}/players")]
    public async Task<ActionResult<Dictionary<string, List<PlayerDTO>>>> GetReactionPlayers(...)
    {
        // ... code ci-dessus ...
    }

    // ============================================
    // FONCTIONS DE NOTIFICATION
    // ============================================
    // ... fonctions privées existantes ...
}
```

## DTO PlayerDTO

Assurez-vous que votre `PlayerDTO` a une méthode statique `FromModel` :

```csharp
public class PlayerDTO
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Picture { get; set; }
    // ... autres propriétés

    public static PlayerDTO FromModel(Player player)
    {
        return new PlayerDTO
        {
            Id = player.Id,
            FirstName = player.FirstName,
            LastName = player.LastName,
            Email = player.Email,
            Picture = player.Picture,
            // ... autres propriétés
        };
    }
}
```

## Directives using nécessaires

Assurez-vous d'avoir ces directives `using` :

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQUASH_API.DTOs;
using SQUASH_API.Models;
```

## Exemple d'utilisation côté frontend

```typescript
// Dans services/api.ts
getReactionPlayers: (entityType: EntityType, entityId: string) =>
  fetchApi<{ [reactionType: string]: PlayerDTO[] }>(`/Reactions/${entityType}/${entityId}/players`),

// Utilisation
const playersByType = await api.getReactionPlayers('match', matchId);
// playersByType = { "fire": [PlayerDTO, ...], "clap": [PlayerDTO, ...], ... }
```

## Notes importantes

1. **Performance** : L'endpoint utilise `Include(r => r.Player)` pour charger les joueurs en une seule requête (eager loading), ce qui est plus efficace que de charger chaque joueur individuellement.

2. **Types de réaction** : Seuls les types de réaction qui ont au moins un joueur sont inclus dans le dictionnaire. Si vous préférez inclure tous les types possibles (même avec des tableaux vides), vous pouvez modifier la logique.

3. **Ordre** : L'ordre des joueurs dans chaque tableau n'est pas garanti. Si vous avez besoin d'un ordre spécifique (par exemple, par date de réaction), vous pouvez ajouter un `OrderBy` :

```csharp
var result = reactions
    .GroupBy(r => r.ReactionType)
    .ToDictionary(
        g => g.Key,
        g => g
            .OrderBy(r => r.CreatedAt) // Trier par date de réaction
            .Select(r => PlayerDTO.FromModel(r.Player))
            .ToList()
    );
```

4. **Validation** : L'endpoint valide que l'entité existe avant de retourner les résultats, ce qui évite les erreurs silencieuses.

## Routes API mises à jour

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/Reactions` | Récupère les réactions pour plusieurs entités |
| POST | `/api/Reactions/{entityType}/{entityId}` | Ajoute/retire une réaction |
| **GET** | **`/api/Reactions/{entityType}/{entityId}/players`** | **Récupère tous les joueurs groupés par type de réaction** |
