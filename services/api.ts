import { API_BASE_URL } from '@/constants/config';
import type { BoxDTO, MatchDTO, PlayerDTO, SeasonDTO, WaitingListEntryDTO } from '@/types/api';

// Fonction helper simple pour les requêtes
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, options);
    
    // Lire le body une seule fois
    const text = await response.text();
    
    if (!response.ok) {
      // Parser le body d'erreur si disponible
      let errorJson: any = null;
      if (text) {
        try {
          errorJson = JSON.parse(text);
        } catch {
          // Pas du JSON, garder le texte brut
        }
      }
      
      // Logger toutes les infos d'erreur
      try {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        
        console.error('❌ API Error:', {
          url,
          method: options?.method || 'GET',
          status: response.status,
          statusText: response.statusText,
          headers,
          errorBody: text,
          errorJson,
          requestOptions: {
            method: options?.method,
            headers: options?.headers,
            // Ne pas logger le body car il peut être sensible ou volumineux
          },
        });
      } catch (logError) {
        // Si le logging échoue, continuer quand même
        console.error('❌ API Error (logging failed):', logError);
      }
      
      // Créer un message d'erreur détaillé
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      if (errorJson) {
        errorMessage = errorJson.message || errorJson.title || errorJson.detail || errorMessage;
      } else if (text) {
        errorMessage = text.length > 200 ? text.substring(0, 200) + '...' : text;
      }
      
      throw new Error(errorMessage);
    }
    
    // Gérer les réponses vides (204 No Content)
    if (response.status === 204 || !text) {
      return {} as T;
    }
    
    return JSON.parse(text);
  } catch (error: any) {
    // Si c'est déjà notre erreur, la relancer
    if (error.message && error.message.startsWith('HTTP')) {
      throw error;
    }
    
    // Sinon, logger l'erreur réseau
    console.error('❌ Network Error:', {
      url,
      method: options?.method || 'GET',
      error: error.message,
      stack: error.stack,
    });
    
    throw error;
  }
}

// Services API minimaux
export const api = {
  // Saisons
  getSeasons: () => fetchApi<SeasonDTO[]>('/Seasons'),
  
  // Boxes
  getBoxes: (seasonId: string) => fetchApi<BoxDTO[]>(`/Boxes?season_id=${seasonId}`),
  
  // Matchs
  getMatches: (seasonId?: string) => fetchApi<MatchDTO[]>(`/Matches${seasonId ? `?season_id=${seasonId}` : ''}`),
  
  // Joueurs
  getPlayers: () => fetchApi<PlayerDTO[]>('/Players'),
  
  registerPlayer: (data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    schedule_preference?: string;
    profile_image?: {
      uri: string;
      name: string;
      type: string;
    };
  }) => {
    const formData = new FormData();
    formData.append('FirstName', data.first_name);
    formData.append('LastName', data.last_name);
    formData.append('Email', data.email);
    formData.append('Phone', data.phone);
    
    if (data.schedule_preference) {
      formData.append('SchedulePreference', data.schedule_preference);
    }
    
    // N'ajouter ProfileImage que s'il est présent
    if (data.profile_image) {
      formData.append('ProfileImage', {
        uri: data.profile_image.uri,
        name: data.profile_image.name,
        type: data.profile_image.type,
      } as any);
    }

    return fetchApi<PlayerDTO>('/Players/register', {
      method: 'POST',
      body: formData,
    });
  },
  
  updatePlayerNextBoxStatus: (playerId: string, status: string | null) => 
    fetchApi<PlayerDTO>(`/Players/${playerId}/next-box-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ NextBoxStatus: status }),
    }),
  
  updatePlayerInfo: (playerId: string, data: { 
    first_name: string; 
    last_name: string; 
    email: string; 
    phone: string;
    schedule_preference?: string;
    profile_image?: {
      uri: string;
      name: string;
      type: string;
    };
  }) => {
    const formData = new FormData();
    formData.append('FirstName', data.first_name);
    formData.append('LastName', data.last_name);
    formData.append('Email', data.email);
    formData.append('Phone', data.phone);
    
    if (data.schedule_preference) {
      formData.append('SchedulePreference', data.schedule_preference);
    }
    
    // Ajouter l'image seulement si présente
    if (data.profile_image) {
      formData.append('ProfileImage', {
        uri: data.profile_image.uri,
        name: data.profile_image.name,
        type: data.profile_image.type,
      } as any);
    }

    return fetchApi<PlayerDTO>(`/Players/${playerId}`, {
      method: 'PUT',
      body: formData,
    });
  },

  // File d'attente
  getWaitingList: () => fetchApi<WaitingListEntryDTO[]>('/WaitingList'),
  
  addToWaitingList: (playerId: string, targetBoxNumber: number | null) =>
    fetchApi<WaitingListEntryDTO>('/WaitingList/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: playerId,
        TargetBoxNumber: targetBoxNumber,
      }),
    }),

  removeFromWaitingList: (entryId: string) =>
    fetchApi<void>(`/WaitingList/${entryId}`, {
      method: 'DELETE',
    }),

  // Demandes de report
  requestMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/request-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        PlayerId: playerId,
        DelayedRequestedBy: playerId,
      }),
    }),

  acceptMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/accept-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayerId: playerId }),
    }),

  rejectMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/reject-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayerId: playerId }),
    }),

  cancelMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/cancel-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayerId: playerId }),
    }),
};


