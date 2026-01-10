# Endpoints File d'Attente (Waiting List)

## Description
Gérer la file d'attente des joueurs sans membership actif qui souhaitent rejoindre un box.

---

## GET /api/WaitingList

### Description
Récupérer toutes les entrées de la file d'attente.

### Response (200 OK)
```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "player_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
    "target_box_number": 16,
    "created_at": "2026-01-10T10:30:00Z",
    "processed": false,
    "order_no": 1
  }
]
```

---

## POST /api/WaitingList

### Description
Ajouter un joueur à la file d'attente.

### Request Body
```json
{
  "PlayerId": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
  "TargetBoxNumber": 16
}
```

**Note**: `TargetBoxNumber` est optionnel (peut être `null`)

### DTO C#

**`AddToWaitingListRequest.cs`** :
```csharp
public class AddToWaitingListRequest
{
    public Guid PlayerId { get; set; }
    public int? TargetBoxNumber { get; set; }
}
```

### Controller C#

```csharp
[HttpPost]
public async Task<ActionResult<WaitingListEntryDTO>> AddToWaitingList([FromBody] AddToWaitingListRequest request)
{
    // Vérifier que le joueur n'est pas déjà dans la liste
    var existingEntry = await _context.WaitingList
        .FirstOrDefaultAsync(w => w.PlayerId == request.PlayerId && !w.Processed);
        
    if (existingEntry != null)
    {
        return BadRequest("Player is already in the waiting list");
    }

    // Obtenir le prochain order_no
    var maxOrder = await _context.WaitingList
        .Where(w => !w.Processed)
        .MaxAsync(w => (short?)w.OrderNo) ?? 0;

    var entry = new WaitingListEntry
    {
        Id = Guid.NewGuid(),
        PlayerId = request.PlayerId,
        TargetBoxNumber = request.TargetBoxNumber,
        CreatedAt = DateTime.UtcNow,
        Processed = false,
        OrderNo = (short)(maxOrder + 1)
    };

    _context.WaitingList.Add(entry);
    await _context.SaveChangesAsync();

    return CreatedAtAction(nameof(GetWaitingList), WaitingListEntryDTO.FromModel(entry));
}
```

### Response (201 Created)
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "player_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
  "target_box_number": 16,
  "created_at": "2026-01-10T10:30:00Z",
  "processed": false,
  "order_no": 5
}
```

---

## DELETE /api/WaitingList/{id}

### Description
Retirer une entrée de la file d'attente.

### Parameters
- `id` (string/GUID): ID de l'entrée à supprimer

### Controller C#

```csharp
[HttpDelete("{id}")]
public async Task<IActionResult> RemoveFromWaitingList(Guid id)
{
    var entry = await _context.WaitingList.FindAsync(id);
    
    if (entry == null)
    {
        return NotFound();
    }

    _context.WaitingList.Remove(entry);
    await _context.SaveChangesAsync();

    return NoContent();
}
```

### Response (204 No Content)
Pas de body de réponse

---

## Notes d'implémentation

### Logique métier importante

1. **Unicité** : Un joueur ne peut avoir qu'une seule entrée non-traitée dans la file
2. **Ordre** : Le `order_no` est calculé automatiquement (max + 1)
3. **Box souhaité** : Le `TargetBoxNumber` est optionnel
4. **Traitement** : Le champ `processed` permet de garder l'historique

### Frontend

Le frontend vérifie automatiquement :
- Si `currentPlayer.current_box` est `null` → Affichage de la file d'attente
- Sinon → Affichage normal (matchs, stats, etc.)

### Modèle C# existant

```csharp
public class WaitingListEntry
{
    public Guid Id { get; set; }
    public Guid PlayerId { get; set; }
    public int? TargetBoxNumber { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool Processed { get; set; }
    public short? OrderNo { get; set; }
    
    // Navigation property
    public Player Player { get; set; }
}
```

Le DTO est déjà fourni dans votre code !

