import { Stepper } from '@mantine/core';
import { useTranslation } from '@forga/web-sdk';

const STEPS = ['archives', 'datasets', 'mapping', 'apply', 'result'] as const;

/** The five steps of a transfer; earlier steps can be opened again while the run is not working. */
export function RunSteps({ active, onStep }: { active: number; onStep?: (step: number) => void }) {
  const { t } = useTranslation('mp-feuer');
  return (
    <Stepper active={active} onStepClick={onStep} size="sm" allowNextStepsSelect={false}>
      {STEPS.map((step) => (
        <Stepper.Step key={step} label={t(`steps.${step}`)} />
      ))}
    </Stepper>
  );
}
