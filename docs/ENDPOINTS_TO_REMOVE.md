# Endpoints à Supprimer - Migration vers API Unifiée

Ce document liste tous les endpoints qui peuvent être **supprimés** maintenant que le système unifié est en place.

## ⚠️ Important

**Ne supprimez ces endpoints qu'après avoir :**
1. ✅ Implémenté les nouveaux contrôleurs `ReactionsController` et `CommentsController`
2. ✅ Testé que tous les nouveaux endpoints fonctionnent correctement
3. ✅ Vérifié que le frontend utilise bien les nouveaux endpoints (déjà fait ✅)

## Endpoints à Supprimer dans `MatchesController`

### Réactions
```csharp
// ❌ À SUPPRIMER
[HttpPost("reactions")]
public async Task<ActionResult<Dictionary<Guid, MatchReactionDTO>>> GetMatchReactions(...)
// ✅ REMPLACÉ PAR : POST /api/Reactions

[HttpPost("{matchId}/react")]
public async Task<IActionResult> ReactToMatch(...)
// ✅ REMPLACÉ PAR : POST /api/Reactions/match/{matchId}
```

### Commentaires
```csharp
// ❌ À SUPPRIMER
[HttpGet("{matchId}/comments")]
public async Task<ActionResult<IEnumerable<MatchCommentDTO>>> GetMatchComments(Guid matchId)
// ✅ REMPLACÉ PAR : GET /api/Comments/match/{matchId}

[HttpPost("{matchId}/comments")]
public async Task<ActionResult<MatchCommentDTO>> AddMatchComment(...)
// ✅ REMPLACÉ PAR : POST /api/Comments/match/{matchId}

[HttpPost("comments")]
public async Task<ActionResult<Dictionary<Guid, MatchCommentDTO[]>>> GetMatchCommentsBatch(...)
// ✅ REMPLACÉ PAR : POST /api/Comments/batch

[HttpDelete("comments/{commentId}")]
public async Task<IActionResult> DeleteMatchComment(...)
// ✅ REMPLACÉ PAR : DELETE /api/Comments/{commentId}
```

## Endpoints à Supprimer dans `BoxMembershipsController` ou `MembershipsController`

### Réactions
```csharp
// ❌ À SUPPRIMER (si dans BoxMembershipsController)
[HttpPost("Memberships/reactions")]
public async Task<ActionResult<Dictionary<Guid, StatusReactionDTO>>> GetMembershipReactions(...)
// ✅ REMPLACÉ PAR : POST /api/Reactions

// ❌ À SUPPRIMER (si dans BoxMembershipsController)
[HttpPost("Memberships/{membershipId}/react")]
public async Task<IActionResult> ReactToMembership(...)
// ✅ REMPLACÉ PAR : POST /api/Reactions/membership/{membershipId}

// ❌ À SUPPRIMER (si dans MembershipsController)
[HttpPost("reactions")]
public async Task<ActionResult<Dictionary<Guid, StatusReactionDTO>>> GetMembershipReactions(...)
// ✅ REMPLACÉ PAR : POST /api/Reactions

// ❌ À SUPPRIMER (si dans MembershipsController)
[HttpPost("{membershipId}/react")]
public async Task<IActionResult> ReactToMembership(...)
// ✅ REMPLACÉ PAR : POST /api/Reactions/membership/{membershipId}
```

## DTOs à Supprimer (optionnel)

Ces DTOs peuvent être supprimés si vous n'en avez plus besoin ailleurs :

```csharp
// ❌ Optionnel - peut être supprimé si non utilisé ailleurs
public class MatchReactionDTO { ... }
public class ReactToMatchRequest { ... }
public class StatusReactionDTO { ... }
public class ReactToStatusRequest { ... }
public class MembershipReactionsRequest { ... }
public class MatchReactionsRequest { ... }
public class AddMatchCommentRequest { ... }
```

**Note :** `MatchCommentDTO` doit être conservé car il est encore utilisé par le frontend pour la compatibilité.

## Résumé des Remplacements

| Ancien Endpoint | Nouveau Endpoint | Controller |
|----------------|------------------|------------|
| `POST /api/Matches/reactions` | `POST /api/Reactions` | ReactionsController |
| `POST /api/Matches/{id}/react` | `POST /api/Reactions/match/{id}` | ReactionsController |
| `POST /api/Memberships/reactions` | `POST /api/Reactions` | ReactionsController |
| `POST /api/Memberships/{id}/react` | `POST /api/Reactions/membership/{id}` | ReactionsController |
| `GET /api/Matches/{id}/comments` | `GET /api/Comments/match/{id}` | CommentsController |
| `POST /api/Matches/{id}/comments` | `POST /api/Comments/match/{id}` | CommentsController |
| `POST /api/Matches/comments` | `POST /api/Comments/batch` | CommentsController |
| `DELETE /api/Matches/comments/{id}` | `DELETE /api/Comments/{id}` | CommentsController |

## Checklist de Migration

- [ ] Implémenter `ReactionsController` avec tous les endpoints
- [ ] Implémenter `CommentsController` avec tous les endpoints
- [ ] Tester tous les nouveaux endpoints
- [ ] Vérifier que le frontend fonctionne avec les nouveaux endpoints
- [ ] Supprimer les anciens endpoints de `MatchesController`
- [ ] Supprimer les anciens endpoints de `BoxMembershipsController` ou `MembershipsController`
- [ ] (Optionnel) Supprimer les DTOs obsolètes
- [ ] Mettre à jour la documentation API si nécessaire

## Notes

- Le frontend utilise déjà les nouveaux endpoints unifiés ✅
- Les anciens endpoints peuvent être supprimés en toute sécurité une fois les nouveaux implémentés
- Si vous avez d'autres clients (apps mobiles, etc.), assurez-vous qu'ils utilisent aussi les nouveaux endpoints avant de supprimer les anciens
