# Mise à jour du MatchDTO pour les reports

## Ajouter ces propriétés dans MatchDTO.cs

```csharp
[JsonPropertyName("delayed_status")]
public string? delayed_status { get; set; }

[JsonPropertyName("delayed_requested_at")]
public DateTime? delayed_requested_at { get; set; }

[JsonPropertyName("delayed_resolved_at")]
public DateTime? delayed_resolved_at { get; set; }
```

## Mettre à jour la méthode FromModel

```csharp
public static MatchDTO FromModel(Match match)
{
    return new MatchDTO
    {
        id = match.Id,
        season_id = match.SeasonId,
        box_id = match.BoxId,
        week_number = match.WeekNumber,
        player_a_id = match.PlayerAId,
        player_b_id = match.PlayerBId,
        scheduled_at = match.ScheduledAt,
        slot_number = match.SlotNumber,
        status = match.Status,
        score_a = match.ScoreA,
        score_b = match.ScoreB,
        points_a = match.PointsA,
        points_b = match.PointsB,
        played_at = match.PlayedAt,
        delayed_player_id = match.DelayedPlayerId,
        delayed_status = match.DelayedStatus,
        delayed_requested_at = match.DelayedRequestedAt,
        delayed_resolved_at = match.DelayedResolvedAt,
        retired_player_id = match.RetiredPlayerId,
        no_show_player_id = match.NoShowPlayerId,
        running = match.Running,
        running_since = match.RunningSince,
    };
}
```

## Mettre à jour la méthode ToModel

```csharp
public Match ToModel()
{
    return new Match
    {
        Id = id,
        SeasonId = season_id,
        BoxId = box_id,
        WeekNumber = week_number,
        PlayerAId = player_a_id,
        PlayerBId = player_b_id,
        ScheduledAt = scheduled_at,
        SlotNumber = slot_number,
        Status = status,
        ScoreA = score_a,
        ScoreB = score_b, 
        PointsA = points_a,
        PointsB = points_b,
        PlayedAt = played_at,
        DelayedPlayerId = delayed_player_id,
        DelayedStatus = delayed_status,
        DelayedRequestedAt = delayed_requested_at,
        DelayedResolvedAt = delayed_resolved_at,
        RetiredPlayerId = retired_player_id,
        NoShowPlayerId = no_show_player_id,
        Running = running,
        RunningSince = running_since,
    };
}
```

## Mettre à jour UpdateMatch dans MatchesController

Dans la méthode `UpdateMatch`, ajouter :

```csharp
match.DelayedStatus = dto.delayed_status;
match.DelayedRequestedAt = dto.delayed_requested_at;
match.DelayedResolvedAt = dto.delayed_resolved_at;
```
