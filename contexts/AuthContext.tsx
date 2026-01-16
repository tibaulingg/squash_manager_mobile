import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { api } from '@/services/api';
import { ApiError } from '@/utils/api-errors';
import { hashPassword } from '@/utils/crypto-helpers';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (firstName: string, lastName: string, email: string, password: string, phone: string, desiredBox: string, schedulePreference?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = '@squash22_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Charger la session au démarrage
  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      // Validation basique côté client
      if (!email || !password) {
        throw new Error('Veuillez remplir tous les champs');
      }

      // Hasher le mot de passe en SHA256
      const passwordHash = await hashPassword(password);
      
      // Appeler l'API pour authentifier le joueur
      const player = await api.login(email.toLowerCase().trim(), passwordHash);
      
      // Créer l'objet utilisateur
      const userData: User = {
        id: player.id,
        name: `${player.first_name} ${player.last_name}`,
        email: player.email || email,
      };

      // Invalider le cache des joueurs pour forcer un rechargement avec les nouvelles données
      api.clearPlayersCache();
      
      // Sauvegarder dans AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      
      // Si c'est une ApiError, utiliser son message utilisateur
      if (error instanceof ApiError) {
        throw new Error(error.getUserMessage());
      }
      
      // Sinon, relancer l'erreur telle quelle
      throw error;
    }
  };

  const signup = async (firstName: string, lastName: string, email: string, password: string, phone: string, desiredBox: string, schedulePreference?: string) => {
    try {
      // Validation basique côté client
      if (!firstName || !lastName || !email || !password || !phone) {
        throw new Error('Veuillez remplir tous les champs');
      }

      // Hasher le mot de passe en SHA256
      const passwordHash = await hashPassword(password);
      
      // Vérifier si le joueur existe déjà (par email, plus fiable que nom/prénom)
      const players = await api.getPlayersCached();
      const existingPlayerByEmail = players.find(
        (p) => p.email?.toLowerCase() === email.toLowerCase().trim()
      );
      
      if (existingPlayerByEmail) {
        throw new Error('Cette adresse email est déjà utilisée.');
      }
      
      // Créer le nouveau joueur
      const player = await api.registerPlayer({
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        password_hash: passwordHash,
        schedule_preference: schedulePreference,
      });
      
      // Invalider le cache des joueurs pour forcer un rechargement avec le nouveau joueur
      api.clearPlayersCache();
      
      // Créer l'objet utilisateur
      const userData: User = {
        id: player.id,
        name: `${player.first_name} ${player.last_name}`,
        email: player.email || email,
      };

      // Sauvegarder dans AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error('Erreur lors de l\'inscription:', error);
      
      // Si c'est une ApiError, utiliser son message utilisateur
      if (error instanceof ApiError) {
        throw new Error(error.getUserMessage());
      }
      
      // Sinon, relancer l'erreur telle quelle
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Nettoyer le cache des joueurs pour éviter d'afficher les données de l'ancien compte
      api.clearPlayersCache();
      api.clearSeasonsCache();
      
      await AsyncStorage.removeItem(STORAGE_KEY);
      setUser(null);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

