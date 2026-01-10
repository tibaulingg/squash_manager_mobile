# Endpoint POST /api/Players/register

## Description
Créer un nouveau joueur (inscription) dans la base de données.

## Route
```
POST /api/Players/register
```

## Request Body (JSON)
```json
{
  "FirstName": "string",
  "LastName": "string",
  "Email": "string",
  "Phone": "string"
}
```

## DTO C#

Créer `RegisterPlayerRequest.cs` dans le dossier des DTOs :

```csharp
public class RegisterPlayerRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
}
```

## Controller C#

Ajouter cette méthode dans `PlayersController.cs` :

```csharp
[HttpPost("register")]
public async Task<ActionResult<PlayerDTO>> RegisterPlayer([FromBody] RegisterPlayerRequest request)
{
    if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName))
    {
        return BadRequest("First name and last name are required");
    }

    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return BadRequest("Email is required");
    }

    // Créer un nouveau joueur
    var player = new Player
    {
        Id = Guid.NewGuid(),
        FirstName = request.FirstName,
        LastName = request.LastName,
        Email = request.Email,
        Phone = request.Phone,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    _context.Players.Add(player);
    await _context.SaveChangesAsync();

    // Mapper vers DTO
    var playerDto = new PlayerDTO
    {
        id = player.Id.ToString(),
        first_name = player.FirstName,
        last_name = player.LastName,
        email = player.Email,
        phone = player.Phone,
        // Remplir les autres champs selon le modèle
    };

    return CreatedAtAction(nameof(GetPlayer), new { id = player.Id }, playerDto);
}
```

## Response
- **201 Created** : Joueur créé avec succès
  - Headers: `Location: /api/Players/{id}`
  - Body: `PlayerDTO`
- **400 Bad Request** : Données invalides
- **500 Internal Server Error** : Erreur serveur

## Exemple Response Body
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "first_name": "Jean",
  "last_name": "Dupont",
  "email": "jean.dupont@example.com",
  "phone": "0612345678",
  "current_box": null,
  "next_box_status": null
}
```

## Notes
- L'endpoint est nommé `/register` pour clarifier son usage
- Le mot de passe n'est pas géré pour l'instant (à ajouter plus tard si nécessaire)
- L'ID est généré automatiquement (GUID)
- Les dates `CreatedAt` et `UpdatedAt` sont définies à la création

