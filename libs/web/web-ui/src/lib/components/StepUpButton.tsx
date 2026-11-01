import { Button } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { requestStepUp, useSession } from '@forga/web-sdk';

/**
 * „Sensible Daten anzeigen …“: asks for the second factor (step-up dialog of the shell); afterwards all data are loaded
 * again, now with the parts the server left out (`sensitiveHidden`, `stepUpAvailable`).
 */
export function StepUpButton({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        if (await requestStepUp({ enrolled: session?.mfa.enrolled ?? true })) await queryClient.invalidateQueries();
      }}
    >
      {children}
    </Button>
  );
}
