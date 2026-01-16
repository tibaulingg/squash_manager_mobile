# Endpoint de Réinitialisation de Mot de Passe

## POST /api/Players/forgot-password

Cet endpoint permet à un joueur de demander une réinitialisation de son mot de passe.

### Requête

**URL:** `/api/Players/forgot-password`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "Email": "user@example.com"
}
```

### Réponse

#### Succès (200 OK)
```json
{
  "message": "Si cette adresse email existe, un email de réinitialisation a été envoyé."
}
```

#### Erreurs

**400 Bad Request** - Email manquant ou invalide
```json
{
  "error": "Email is required"
}
```

**404 Not Found** - Joueur non trouvé (pour des raisons de sécurité, on peut retourner 200 même si le joueur n'existe pas)
```json
{
  "message": "Si cette adresse email existe, un email de réinitialisation a été envoyé."
}
```

### Comportement

Pour des raisons de sécurité, l'endpoint doit toujours retourner un message de succès même si l'email n'existe pas dans la base de données. Cela empêche l'énumération des emails valides.

### Exemple d'implémentation C#

```csharp
[HttpPost("forgot-password")]
public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return BadRequest(new { error = "Email is required" });
    }

    // Rechercher le joueur par email
    var player = await _context.Players
        .FirstOrDefaultAsync(p => p.Email.ToLower() == request.Email.ToLower());

    if (player != null)
    {
        // Générer un token de réinitialisation
        var resetToken = Guid.NewGuid().ToString();
        var expiryDate = DateTime.UtcNow.AddHours(24); // Token valide 24h

        // Sauvegarder le token dans la base de données
        player.PasswordResetToken = resetToken;
        player.PasswordResetTokenExpiry = expiryDate;
        await _context.SaveChangesAsync();

        // Construire le lien de réinitialisation (deep link de l'app)
        var resetLink = $"squash22://reset-password?token={resetToken}";
        
        // Alternative: lien web qui redirige vers le deep link (pour les emails)
        // var resetLink = $"https://yourapp.com/reset-password?token={resetToken}";
        // Ce lien web doit rediriger vers squash22://reset-password?token={resetToken}

        // Envoyer l'email avec le lien de réinitialisation
        await SendPasswordResetEmail(player.Email, player.FirstName, resetLink);
    }

    // Toujours retourner un succès pour des raisons de sécurité
    return Ok(new { message = "Si cette adresse email existe, un email de réinitialisation a été envoyé." });
}

private async Task SendPasswordResetEmail(string email, string firstName, string resetLink)
{
    var subject = "Réinitialisation de votre mot de passe - Squash 22";
    
    var htmlBody = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <style>
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
        }}
        .button {{
            display: inline-block;
            background-color: #007AFF;
            color: #ffffff;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            margin: 20px 0;
        }}
        .footer {{
            margin-top: 30px;
            font-size: 12px;
            color: #666;
        }}
    </style>
</head>
<body>
    <div class=""container"">
        <h2>Réinitialisation de votre mot de passe</h2>
        <p>Bonjour {firstName},</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte Squash 22.</p>
        <p>Cliquez sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
        <a href=""{resetLink}"" class=""button"">Réinitialiser mon mot de passe</a>
        <p>Ou copiez-collez ce lien dans votre navigateur :</p>
        <p style=""word-break: break-all; color: #007AFF;"">{resetLink}</p>
        <p><strong>Ce lien est valide pendant 24 heures.</strong></p>
        <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.</p>
        <div class=""footer"">
            <p>Cordialement,<br>L'équipe Squash 22</p>
        </div>
    </div>
</body>
</html>";

    var textBody = $@"
Bonjour {firstName},

Vous avez demandé à réinitialiser votre mot de passe pour votre compte Squash 22.

Cliquez sur ce lien pour réinitialiser votre mot de passe :
{resetLink}

Ce lien est valide pendant 24 heures.

Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.

Cordialement,
L'équipe Squash 22";

    // Exemple avec System.Net.Mail (SMTP)
    try
    {{
        using (var client = new SmtpClient(""smtp.gmail.com"", 587))
        {{
            client.EnableSsl = true;
            client.Credentials = new NetworkCredential(""your-email@gmail.com"", ""your-password"");

            var mailMessage = new MailMessage
            {{
                From = new MailAddress(""noreply@squash22.com"", ""Squash 22""),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            }};

            // Ajouter la version texte en alternative
            var textView = AlternateView.CreateAlternateViewFromString(textBody, null, ""text/plain"");
            mailMessage.AlternateViews.Add(textView);

            mailMessage.To.Add(email);

            await client.SendMailAsync(mailMessage);
        }}
    }}
    catch (Exception ex)
    {{
        // Logger l'erreur mais ne pas exposer l'information à l'utilisateur
        _logger.LogError(ex, ""Erreur lors de l'envoi de l'email de réinitialisation à {{Email}}"", email);
        // Ne pas lever l'exception pour des raisons de sécurité
    }}
}}

// Alternative avec un service d'email (SendGrid, Mailgun, etc.)
private async Task SendPasswordResetEmailWithService(string email, string firstName, string resetLink)
{{
    // Exemple avec SendGrid
    /*
    var apiKey = Environment.GetEnvironmentVariable(""SENDGRID_API_KEY"");
    var client = new SendGridClient(apiKey);
    var from = new EmailAddress(""noreply@squash22.com"", ""Squash 22"");
    var to = new EmailAddress(email, firstName);
    var subject = ""Réinitialisation de votre mot de passe - Squash 22"";
    
    var htmlContent = $@""<p>Bonjour {firstName},</p>
    <p>Cliquez sur ce lien pour réinitialiser votre mot de passe :</p>
    <a href=""{resetLink}"">Réinitialiser mon mot de passe</a>
    <p>Ce lien est valide pendant 24 heures.</p>"";
    
    var msg = MailHelper.CreateSingleEmail(from, to, subject, null, htmlContent);
    var response = await client.SendEmailAsync(msg);
    */
    
    // Exemple avec Mailgun
    /*
    var apiKey = Environment.GetEnvironmentVariable(""MAILGUN_API_KEY"");
    var domain = ""mg.squash22.com"";
    var client = new MailgunClient(domain, apiKey);
    
    var message = new MailMessage
    {{
        From = new MailAddress(""noreply@squash22.com"", ""Squash 22""),
        To = {{ new MailAddress(email, firstName) }},
        Subject = ""Réinitialisation de votre mot de passe - Squash 22"",
        HtmlBody = htmlContent,
        TextBody = textBody
    }};
    
    await client.SendMessageAsync(message);
    */
}}

public class ForgotPasswordRequest
{{
    public string Email {{ get; set; }}
}}
```

### Configuration SMTP (appsettings.json)

```json
{
  "EmailSettings": {
    "SmtpServer": "smtp.gmail.com",
    "SmtpPort": 587,
    "SmtpUsername": "your-email@gmail.com",
    "SmtpPassword": "your-app-password",
    "FromEmail": "noreply@squash22.com",
    "FromName": "Squash 22"
  }
}
```

### Notes importantes

1. **Deep Link vs Web Link** :
   - Le deep link `squash22://reset-password?token={token}` fonctionne directement dans l'app mobile
   - Pour les emails, vous pouvez utiliser un lien web qui redirige vers le deep link
   - Exemple : `https://squash22.com/reset-password?token={token}` → redirige vers `squash22://reset-password?token={token}`

2. **Sécurité** :
   - Ne jamais logger ou exposer le token dans les logs
   - Le token doit être unique et imprévisible (GUID)
   - Limiter le nombre de demandes par email/IP (rate limiting)

3. **Services d'email recommandés** :
   - **SendGrid** : Service cloud populaire avec API simple
   - **Mailgun** : Service fiable avec bonne délivrabilité
   - **Amazon SES** : Solution AWS économique
   - **SMTP classique** : Pour les petits volumes

### Notes

- Le token de réinitialisation doit être unique et avoir une date d'expiration
- Le lien de réinitialisation doit être sécurisé (HTTPS)
- Le token doit être invalidé après utilisation
- Il est recommandé de limiter le nombre de demandes par email/IP pour éviter les abus
