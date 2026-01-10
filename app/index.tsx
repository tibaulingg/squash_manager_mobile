import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';

export default function IndexScreen() {
  const router = useRouter();
  const { isLoading } = useAuth();

  useEffect(() => {
    // Toujours rediriger vers les tabs (l'app est publique par défaut)
    if (!isLoading) {
      router.replace('/(tabs)');
    }
  }, [isLoading, router]);

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </ThemedView>
  );
}



