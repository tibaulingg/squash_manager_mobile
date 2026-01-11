# API pour les demandes de report

## DTOs à ajouter

```csharp
// Dans DTOs/DelayMatchRequest.cs
namespace SQUASH_API.DTOs
{
    public class DelayMatchRequest
    {
        public Guid PlayerId { get; set; }
    }
}
```

## Endpoints à ajouter dans MatchesController

```csharp
[HttpPost("{id}/request-delay")]
public async Task<ActionResult<MatchDTO>> RequestMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
{
    var match = await _context.Matches.FindAsync(id);
    if (match == null) return NotFound();

    // Vérifier que le joueur fait bien partie du match
    if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
        return BadRequest("Le joueur ne fait pas partie de ce match");

    // Vérifier qu'il n'y a pas déjà une demande en cours
    if (match.DelayedStatus == "pending")
        return BadRequest("Une demande de report est déjà en cours pour ce match");

    // Vérifier que le match n'est pas déjà joué
    if (match.ScoreA.HasValue || match.ScoreB.HasValue)
        return BadRequest("Le match a déjà été joué");

    // Créer la demande
    match.DelayedPlayerId = request.PlayerId;
    match.DelayedStatus = "pending";
    match.DelayedRequestedAt = DateTime.UtcNow;
    match.DelayedResolvedAt = null;

    await _context.SaveChangesAsync();
    return Ok(MatchDTO.FromModel(match));
}

[HttpPost("{id}/accept-delay")]
public async Task<ActionResult<MatchDTO>> AcceptMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
{
    var match = await _context.Matches.FindAsync(id);
    if (match == null) return NotFound();

    // Vérifier que le joueur fait bien partie du match
    if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
        return BadRequest("Le joueur ne fait pas partie de ce match");

    // Vérifier qu'il y a une demande en attente
    if (match.DelayedStatus != "pending")
        return BadRequest("Aucune demande de report en attente pour ce match");

    // Vérifier que ce n'est pas le joueur qui a fait la demande
    if (match.DelayedPlayerId == request.PlayerId)
        return BadRequest("Vous ne pouvez pas accepter votre propre demande");

    // Accepter la demande
    match.DelayedStatus = "accepted";
    match.DelayedResolvedAt = DateTime.UtcNow;
    // Le DelayedPlayerId reste pour indiquer qui a demandé le report

    await _context.SaveChangesAsync();
    return Ok(MatchDTO.FromModel(match));
}

[HttpPost("{id}/reject-delay")]
public async Task<ActionResult<MatchDTO>> RejectMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
{
    var match = await _context.Matches.FindAsync(id);
    if (match == null) return NotFound();

    // Vérifier que le joueur fait bien partie du match
    if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
        return BadRequest("Le joueur ne fait pas partie de ce match");

    // Vérifier qu'il y a une demande en attente
    if (match.DelayedStatus != "pending")
        return BadRequest("Aucune demande de report en attente pour ce match");

    // Vérifier que ce n'est pas le joueur qui a fait la demande
    if (match.DelayedPlayerId == request.PlayerId)
        return BadRequest("Vous ne pouvez pas refuser votre propre demande");

    // Refuser la demande
    match.DelayedStatus = "rejected";
    match.DelayedResolvedAt = DateTime.UtcNow;
    // Le DelayedPlayerId reste pour l'historique

    await _context.SaveChangesAsync();
    return Ok(MatchDTO.FromModel(match));
}

[HttpPost("{id}/cancel-delay")]
public async Task<ActionResult<MatchDTO>> CancelMatchDelay(Guid id, [FromBody] DelayMatchRequest request)
{
    var match = await _context.Matches.FindAsync(id);
    if (match == null) return NotFound();

    // Vérifier que le joueur fait bien partie du match
    if (match.PlayerAId != request.PlayerId && match.PlayerBId != request.PlayerId)
        return BadRequest("Le joueur ne fait pas partie de ce match");

    // Vérifier qu'il y a une demande en attente
    if (match.DelayedStatus != "pending")
        return BadRequest("Aucune demande de report en attente pour ce match");

    // Vérifier que c'est bien le joueur qui a fait la demande
    if (match.DelayedPlayerId != request.PlayerId)
        return BadRequest("Vous ne pouvez annuler que votre propre demande");

    // Annuler la demande
    match.DelayedStatus = "cancelled";
    match.DelayedResolvedAt = DateTime.UtcNow;
    match.DelayedPlayerId = null; // On peut garder null ou garder l'historique

    await _context.SaveChangesAsync();
    return Ok(MatchDTO.FromModel(match));
}
```

## Mise à jour du MatchDTO

```csharp
// Dans DTOs/MatchDTO.cs, ajouter ces propriétés :
public string? delayed_status { get; set; }
public string? delayed_requested_at { get; set; }
public string? delayed_resolved_at { get; set; }

// Dans la méthode FromModel, ajouter :
delayed_status = model.DelayedStatus,
delayed_requested_at = model.DelayedRequestedAt?.ToString("O"),
delayed_resolved_at = model.DelayedResolvedAt?.ToString("O"),
```

## Mise à jour du modèle Match

Assurez-vous que votre modèle `Match` a ces propriétés :
```csharp
public string? DelayedStatus { get; set; }
public DateTime? DelayedRequestedAt { get; set; }
public DateTime? DelayedResolvedAt { get; set; }
```

## Mise à jour de UpdateMatch

Dans la méthode `UpdateMatch`, ajouter la gestion des nouveaux champs :
```csharp
match.DelayedStatus = dto.delayed_status;
match.DelayedRequestedAt = dto.delayed_requested_at != null ? DateTime.Parse(dto.delayed_requested_at) : null;
match.DelayedResolvedAt = dto.delayed_resolved_at != null ? DateTime.Parse(dto.delayed_resolved_at) : null;
```
