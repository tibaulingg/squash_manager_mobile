# API pour Supprimer un Commentaire de Match

## Endpoint

```
DELETE /api/Matches/comments/{commentId}?currentPlayerId={currentPlayerId}
```

## Paramètres

- `commentId` (Guid) : L'ID du commentaire à supprimer (dans l'URL)
- `currentPlayerId` (Guid) : L'ID du joueur actuel (dans la query string)

## Controller

Ajouter dans `MatchesController.cs` :

```csharp
// DELETE: api/Matches/comments/{commentId}?currentPlayerId={currentPlayerId}
// Supprimer un commentaire
[HttpDelete("comments/{commentId}")]
public async Task<IActionResult> DeleteMatchComment(
    Guid commentId,
    [FromQuery] Guid currentPlayerId)
{
    // Récupérer le commentaire
    var comment = await _context.MatchComments
        .FirstOrDefaultAsync(c => c.Id == commentId);

    if (comment == null)
        return NotFound("Commentaire introuvable");

    // Vérifier que c'est le propriétaire du commentaire qui le supprime
    if (comment.PlayerId != currentPlayerId)
        return Forbid("Vous ne pouvez supprimer que vos propres commentaires");

    // Supprimer le commentaire
    _context.MatchComments.Remove(comment);
    await _context.SaveChangesAsync();

    return NoContent();
}
```

## Exemple de requête

```http
DELETE /api/Matches/comments/123e4567-e89b-12d3-a456-426614174000?currentPlayerId=987fcdeb-51a2-43d7-8f9e-123456789abc
```

## Réponses

### Succès (204 No Content)
Le commentaire a été supprimé avec succès.

### Erreur 404 (Not Found)
Le commentaire n'existe pas.

### Erreur 403 (Forbidden)
Le joueur actuel n'est pas le propriétaire du commentaire.

## Frontend

L'endpoint est déjà configuré dans `services/api.ts` :

```typescript
deleteMatchComment: (commentId: string, currentPlayerId: string) =>
  fetchApi<void>(`/Matches/comments/${commentId}?currentPlayerId=${currentPlayerId}`, {
    method: 'DELETE',
  }),
```

## Notes

- Seul le propriétaire du commentaire peut le supprimer
- La suppression est définitive (pas de soft delete)
- Le commentaire est supprimé de la base de données via `ON DELETE CASCADE` si nécessaire
