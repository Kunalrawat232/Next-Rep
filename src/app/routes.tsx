import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from '../components';
import { ProtectedRoute, SignInPage } from '../features/auth';
import { CoachPage } from '../features/coach';
import { CustomExercisePage, ExerciseDetailPage, ExercisesPage } from '../features/exercises';
import { GymPage } from '../features/gyms';
import { HistoryPage, WorkoutDetailPage } from '../features/history';
import { HomePage } from '../features/home';
import { AboutPage, SettingsPage } from '../features/settings';
import { ChooseExercisePage, LogSetPage, WorkoutPage } from '../features/workout';

export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/gym', element: <GymPage /> },
          // Older links, from when there could be several gyms.
          { path: '/gyms', element: <Navigate to="/gym" replace /> },
          { path: '/gyms/*', element: <Navigate to="/gym" replace /> },
          { path: '/exercises', element: <ExercisesPage /> },
          { path: '/exercises/new', element: <CustomExercisePage /> },
          { path: '/exercises/:exerciseId', element: <ExerciseDetailPage /> },
          { path: '/coach', element: <CoachPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/about', element: <AboutPage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/history/:workoutId', element: <WorkoutDetailPage /> },
          {
            path: '/progress',
            lazy: async () => ({
              Component: (await import('../features/progress/ProgressPage')).ProgressPage,
            }),
          },
          {
            path: '/progress/:exerciseId',
            lazy: async () => ({
              Component: (await import('../features/progress/ExerciseProgressPage'))
                .ExerciseProgressPage,
            }),
          },
          { path: '/workout', element: <WorkoutPage /> },
          { path: '/workout/exercise', element: <ChooseExercisePage /> },
          { path: '/workout/log', element: <LogSetPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
