import { API_BASE_URL } from '@/constants/config';
import type { BoxDTO, MatchDTO, PlayerDTO, SeasonDTO, WaitingListEntryDTO } from '@/types/api';

// Fonction helper simple pour les requêtes
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  // Gérer les réponses vides (204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }
  
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  
  return JSON.parse(text);
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
};


