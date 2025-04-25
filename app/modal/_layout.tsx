import { Stack } from 'expo-router';

export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: 'modal', // this makes it float/drop-up
        animation: 'slide_from_bottom', // ensures bottom-up animation
        headerShown: false,
        gestureEnabled: true, // allows swipe-down to dismiss
      }}
    />
  );
}