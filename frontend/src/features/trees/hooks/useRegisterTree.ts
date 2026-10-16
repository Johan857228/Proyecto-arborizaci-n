import { useCreateTree } from '@/features/trees/hooks/useCreateTree';
import { useUploadPhoto } from '@/features/trees/hooks/useUploadPhoto';
import { fotosRegistroSchema } from '@/features/trees/schemas';
import { ApiContractError } from '@/services/api/client';
import type { ArbolResumen } from '@/shared/types/entities';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';

interface RegistrationResult {
  tree: ArbolResumen;
  photoError?: unknown;
}

export function useRegisterTree() {
  const createTree = useCreateTree();
  const uploadPhoto = useUploadPhoto();

  async function submit(values: ArbolCrear, photos: FotoLocal[]): Promise<RegistrationResult> {
    const validatedPhotos = fotosRegistroSchema.safeParse(photos);
    if (!validatedPhotos.success) {
      throw new ApiContractError('Revisa las fotografías: agrega una vista general y respeta formato y tamaño permitidos.');
    }

    const tree = await createTree.mutateAsync(values);
    try {
      for (const photo of validatedPhotos.data) {
        await uploadPhoto.mutateAsync({ treeId: tree.id, photo });
      }
      return { tree };
    } catch (photoError) {
      return { tree, photoError };
    }
  }

  return {
    submit,
    isPending: createTree.isPending || uploadPhoto.isPending,
  };
}