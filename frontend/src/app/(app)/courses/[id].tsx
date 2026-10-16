import { useLocalSearchParams } from 'expo-router';

import { CourseDetailScreen } from '@/features/courses/components/CourseDetailScreen';

export default function CourseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CourseDetailScreen key={id} cursoId={String(id)} />;
}
