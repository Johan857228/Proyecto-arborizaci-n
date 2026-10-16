import { useMutation } from '@tanstack/react-query';

import { photosService } from '@/features/trees/services/photosService';

export function useUploadPhoto() {
  return useMutation({
    mutationFn: ({ treeId, photo }: { treeId: string; photo: Parameters<typeof photosService.upload>[1] }) =>
      photosService.upload(treeId, photo),
  });
}