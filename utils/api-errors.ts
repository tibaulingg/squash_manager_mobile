/**
 * Classe d'erreur personnalisée pour les erreurs API
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ApiError';
    // Maintient la stack trace pour le debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Retourne un message utilisateur-friendly selon le code de statut
   */
  getUserMessage(): string {
    switch (this.statusCode) {
      case 400:
        return this.message || 'Données invalides. Veuillez vérifier vos informations.';
      case 401:
        return 'Email ou mot de passe incorrect.';
      case 403:
        return 'Accès refusé.';
      case 404:
        return 'Ressource non trouvée.';
      case 409:
        return this.message || 'Cette adresse email est déjà utilisée.';
      case 422:
        return this.message || 'Données invalides.';
      case 500:
        return 'Erreur serveur. Veuillez réessayer plus tard.';
      case 503:
        return 'Service temporairement indisponible. Veuillez réessayer plus tard.';
      default:
        if (this.statusCode >= 500) {
          return 'Erreur serveur. Veuillez réessayer plus tard.';
        }
        return this.message || 'Une erreur est survenue.';
    }
  }

  /**
   * Vérifie si l'erreur est une erreur réseau (pas de réponse du serveur)
   */
  isNetworkError(): boolean {
    return this.statusCode === 0 || !this.statusCode;
  }
}

/**
 * Crée une ApiError à partir d'une réponse HTTP
 */
export function createApiError(
  statusCode: number,
  statusText: string,
  errorBody?: string,
  errorJson?: any
): ApiError {
  // Extraire le message d'erreur du body JSON si disponible
  let message = statusText;
  
  if (errorJson) {
    // Essayer différents champs communs pour le message d'erreur
    message = errorJson.message || 
              errorJson.title || 
              errorJson.detail || 
              errorJson.error || 
              errorJson.Message ||
              statusText;
  } else if (errorBody && errorBody.length < 200) {
    // Si le body est court et pas du JSON, l'utiliser comme message
    message = errorBody;
  }

  // Messages spécifiques selon le code de statut
  if (statusCode === 401) {
    message = 'Email ou mot de passe incorrect.';
  } else if (statusCode === 409) {
    message = errorJson?.message || 'Cette adresse email est déjà utilisée.';
  } else if (statusCode === 400) {
    message = message || 'Données invalides. Veuillez vérifier vos informations.';
  }

  return new ApiError(message, statusCode, { errorBody, errorJson });
}

/**
 * Crée une ApiError pour une erreur réseau (pas de réponse)
 */
export function createNetworkError(error: any): ApiError {
  const message = 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.';
  const networkError = new ApiError(message, 0, error);
  return networkError;
}
