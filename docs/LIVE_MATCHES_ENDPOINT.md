# Endpoint pour les matchs en live

## Ajouter dans MatchesController.cs

```csharp
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
```

## Notes
- L'endpoint retourne tous les matchs avec `Running = true`
- Les matchs sont triés par `RunningSince` (les plus récents en premier)
- Les relations PlayerA, PlayerB et Box sont incluses pour éviter les requêtes N+1
