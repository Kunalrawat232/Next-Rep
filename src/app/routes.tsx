import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from '../components';
import { ProtectedRoute, SignInPage } from '../features/auth';
import { CustomExercisePage, ExercisesPage } from '../features/exercises';
import { GymFormPage, GymsPage } from '../features/gyms';
import { HistoryPage, WorkoutDetailPage } from '../features/history';
import { ChooseExercisePage, LogSetPage, WorkoutPage } from '../features/workout';
import { HomePage } from './HomePage';

export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/gyms', element: <GymsPage /> },
          { path: '/gyms/new', element: <GymFormPage /> },
          { path: '/gyms/:gymId', element: <GymFormPage /> },
          { path: '/exercises', element: <ExercisesPage /> },
          { path: '/exercises/new', element: <CustomExercisePage /> },
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
