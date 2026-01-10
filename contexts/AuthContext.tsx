import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { api } from '@/services/api';

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
  signup: (firstName: string, lastName: string, email: string, password: string, phone: string, desiredBox: string) => Promise<void>;
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
      // Récupérer tous les joueurs
      const players = await api.getPlayers();
      
      // Chercher le joueur par email
      const player = players.find((p) => p.email?.toLowerCase() === email.toLowerCase());
      
      if (!player) {
        throw new Error('Aucun joueur trouvé avec cet email');
      }
      
      // TODO: Vérifier le mot de passe (pour l'instant on accepte n'importe quel mot de passe)
      
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
      console.error('Erreur lors de la connexion:', error);
      throw error;
    }
  };

  const signup = async (firstName: string, lastName: string, email: string, password: string, phone: string, desiredBox: string) => {
    try {
      // Vérifier si le joueur existe déjà
      const players = await api.getPlayers();
      const existingPlayer = players.find(
        (p) => p.first_name?.toLowerCase() === firstName.toLowerCase() && 
               p.last_name?.toLowerCase() === lastName.toLowerCase()
      );
      
      let player;
      
      if (existingPlayer) {
        // Le joueur existe déjà, on le connecte directement
        player = existingPlayer;
      } else {
        // Le joueur n'existe pas, on le crée
        player = await api.registerPlayer({
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone,
        });
      }
      
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
      throw error;
    }
  };

  const logout = async () => {
    try {
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

