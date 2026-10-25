import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, i18n } from '@forga/web-sdk';

/** Shows an error of the API (or any other error) as notification in the UI language. */
export function notifyError(error: unknown): void {
  const message = error instanceof ApiError ? error.translated() : i18n.t('errors.generic', { ns: 'common' });
  notifications.show({ color: 'brand', title: i18n.t('notice.error', { ns: 'common' }), message });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'green', message });
}

/**
 * A mutation that reports errors as notification, optionally confirms success and
 * refreshes the given queries afterwards.
 */
export function useAction<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  options: { success?: string; invalidate?: readonly (readonly unknown[])[]; onSuccess?: (result: TResult, input: TInput) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onError: notifyError,
    onSuccess: async (result, input) => {
      await Promise.all((options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (options.success) notifySuccess(options.success);
      options.onSuccess?.(result, input);
    },
  });
}
