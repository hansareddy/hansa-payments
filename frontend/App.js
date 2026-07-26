/**
 * Hansa Communications - Mobile Customer Management App
 * Auth-gated navigation: Login → (Customer List → Detail → Payment → AddCustomer → ManageUsers)
 */

import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './services/AuthContext';

import LoginScreen from './screens/LoginScreen';
import CustomerListScreen from './screens/CustomerListScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import PaymentScreen from './screens/PaymentScreen';
import ManageUsersScreen from './screens/ManageUsersScreen';

const Stack = createNativeStackNavigator();

const HansaTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1A56DB',
    background: '#F3F4F6',
    card: '#FFFFFF',
    text: '#111827',
    border: '#E5E7EB',
    notification: '#1A56DB',
  },
};

import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';

function AppNavigator() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0E21" />
        <ActivityIndicator size="large" color="#1E3A8A" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1E3A8A' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '800', fontSize: 18 },
        headerShadowVisible: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#F3F4F6' },
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="CustomerList"
            component={CustomerListScreen}
            options={{ headerShown: false, headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="CustomerDetail"
            component={CustomerDetailScreen}
            options={({ route }) => ({
              title: route.params?.customer?.username || 'Customer',
            })}
          />
          <Stack.Screen
            name="Payment"
            component={PaymentScreen}
            options={{ title: 'Collect Payment' }}
          />
          <Stack.Screen
            name="ManageUsers"
            component={ManageUsersScreen}
            options={{ title: 'Manage Users' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={HansaTheme}>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0A0E21',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
